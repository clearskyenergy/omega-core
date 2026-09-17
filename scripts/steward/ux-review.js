#!/usr/bin/env node
/* ===========================================================================
   scripts/steward/ux-review.js - the UX and accessibility faults that can be
   found without opening a browser, on every page the platform serves.
   (c) 2025-2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHAT THIS IS AND IS NOT

   It is not taste. It cannot tell you the density is wrong or the flow has a
   step too many; that needs eyes and a person who has used the tool. What it
   can do is find the mechanical faults that are invisible in review and
   expensive in the field, on all ~90 pages, every morning, for free:

     - a page with no viewport meta renders at desktop width on a phone, and
       these tools are used on phones, in parking lots, at sites
     - user-scalable=no takes pinch-zoom away from the one user who needs it
       most: somebody reading a plot plan outdoors
     - an input with no label is unreadable to a screen reader and ambiguous
       to everyone else
     - two elements sharing an id is a bug that shows as "the wrong field
       updated", usually months later
     - alert() blocks the whole page and looks like the browser, not the
       product - the repo already moved away from it in omega-auth-errors.js
     - a 2 MB page is a slow page on a site with two bars of signal

   Every finding names the file and, where it can, the line - so the output is
   a work queue, not an opinion. The tool pages are single-file by design
   (CLAUDE.md), so file-level findings are page-level findings.

   RANKING. Findings are ordered by how many users hit them and how cheap the
   fix is, not by severity in the abstract. A missing viewport on a tool a
   field rep opens daily outranks a missing alt on an icon.

     node scripts/steward/ux-review.js
     node scripts/steward/ux-review.js --json
     node scripts/steward/ux-review.js --page battery-sizer.html
   =========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..');
var SKIP_DIRS = { '.git': 1, node_modules: 1, docs: 1, scripts: 1, '.vercel': 1 };

/* A page over this is slow on a field connection. editor.html is 11 MB and is
   a known, deliberate exception - it is the whole CAD surface in one file -
   so it is reported with that context rather than as a surprise. */
var HEAVY_KB = 1500;
var KNOWN_HEAVY = { 'editor.html': 'the whole editor is one file by design (MERGE.md); worth splitting the basemap and stencil data out, not the code' };

function walk(dir, out) {
  out = out || [];
  var entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.forEach(function (e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS[e.name]) walk(full, out); }
    else if (e.isFile() && /\.html$/.test(e.name)) out.push(path.relative(ROOT, full));
  });
  return out;
}

function lineOf(src, index) { return src.slice(0, index).split('\n').length; }

/* -- the checks -------------------------------------------------------------
   Each returns findings for one page. Weight is the ranking input: roughly
   "users affected x how clearly wrong it is", 1-10. */

var CHECKS = [
  {
    id: 'viewport',
    weight: 10,
    run: function (src, file) {
      if (/<meta[^>]+name=["']viewport["']/i.test(src)) return [];
      return [{ detail: 'no viewport meta - this page renders at desktop width on every phone and tablet that opens it', fix: 'add <meta name="viewport" content="width=device-width, initial-scale=1">' }];
    }
  },
  {
    id: 'pinch-zoom',
    weight: 9,
    run: function (src) {
      var m = /<meta[^>]+name=["']viewport["'][^>]*>/i.exec(src);
      if (!m) return [];
      if (!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?![.\d])/i.test(m[0])) return [];
      return [{ line: lineOf(src, m.index), detail: 'the viewport disables pinch-zoom - on a site visit that is the gesture people use to read a plan or a nameplate', fix: 'drop user-scalable=no and maximum-scale from the viewport meta' }];
    }
  },
  {
    id: 'charset',
    weight: 6,
    run: function (src) {
      if (/<meta[^>]+charset/i.test(src)) return [];
      return [{ detail: 'no <meta charset> - the browser guesses, and guesses wrong on any page with a degree sign or an em dash', fix: 'add <meta charset="utf-8"> as the first element in <head>' }];
    }
  },
  {
    id: 'lang',
    weight: 4,
    run: function (src) {
      if (/<html[^>]+lang=/i.test(src)) return [];
      return [{ detail: 'no lang on <html> - screen readers pick a voice by guessing', fix: 'add lang="en" to the <html> tag' }];
    }
  },
  {
    id: 'title',
    weight: 5,
    run: function (src) {
      var m = /<title>([^<]*)<\/title>/i.exec(src);
      if (!m) return [{ detail: 'no <title> - the browser tab and every bookmark show the URL', fix: 'add a <title>' }];
      var t = m[1].trim();
      if (!t) return [{ line: lineOf(src, m.index), detail: 'empty <title>', fix: 'name the page' }];
      if (/^(document|untitled|page|index)$/i.test(t)) return [{ line: lineOf(src, m.index), detail: 'placeholder <title> "' + t + '"', fix: 'name the page after what it does' }];
      return [];
    }
  },
  {
    id: 'duplicate-id',
    weight: 8,
    run: function (src) {
      var seen = {}, dupes = {}, re = /\sid=["']([^"']+)["']/g, m;
      while ((m = re.exec(src))) {
        var id = m[1];
        /* id="row_" + n and id="${item.id}" are one id built at runtime, not
           two elements sharing one. Reporting them buries the real duplicates. */
        if (/\$\{|[_-]$/.test(id)) continue;
        if (seen[id]) dupes[id] = (dupes[id] || 1) + 1;
        else seen[id] = lineOf(src, m.index);
      }
      var names = Object.keys(dupes);
      if (!names.length) return [];
      return [{
        detail: names.length + ' duplicated element id(s): ' + names.slice(0, 6).join(', ') + (names.length > 6 ? ' and ' + (names.length - 6) + ' more' : ''),
        fix: 'getElementById and label[for] both take the first match silently - rename so each id appears once'
      }];
    }
  },
  {
    id: 'unlabelled-input',
    weight: 7,
    run: function (src) {
      var labelled = {}, re = /<label[^>]+for=["']([^"']+)["']/gi, m;
      while ((m = re.exec(src))) labelled[m[1]] = true;
      var bad = [];
      var inputRe = /<(input|select|textarea)\b([^>]*)>/gi, x;
      while ((x = inputRe.exec(src))) {
        var attrs = x[2];
        if (/type=["'](hidden|submit|button|reset|image)["']/i.test(attrs)) continue;
        if (/aria-label|aria-labelledby|title=/i.test(attrs)) continue;
        var idm = /\sid=["']([^"']+)["']/.exec(attrs);
        if (idm && labelled[idm[1]]) continue;
        bad.push(idm ? idm[1] : ('<' + x[1] + '> at line ' + lineOf(src, x.index)));
      }
      if (!bad.length) return [];
      return [{
        detail: bad.length + ' form control(s) with no label, aria-label or title: ' + bad.slice(0, 6).join(', ') + (bad.length > 6 ? ' and ' + (bad.length - 6) + ' more' : ''),
        fix: 'a placeholder is not a label - it disappears when typing starts and screen readers may skip it'
      }];
    }
  },
  {
    id: 'iconic-button',
    weight: 5,
    run: function (src) {
      var re = /<button\b([^>]*)>([\s\S]{0,120}?)<\/button>/gi, m, bad = 0, first = null;
      while ((m = re.exec(src))) {
        if (/aria-label|title=/i.test(m[1])) continue;
        var text = m[2].replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, '').trim();
        if (text) continue;
        bad++; if (first == null) first = lineOf(src, m.index);
      }
      if (!bad) return [];
      return [{ line: first, detail: bad + ' button(s) with no text and no aria-label', fix: 'an icon-only button is unnamed to a screen reader and ambiguous on a small screen - add aria-label' }];
    }
  },
  {
    id: 'img-alt',
    weight: 4,
    run: function (src) {
      var re = /<img\b([^>]*)>/gi, m, bad = 0, first = null;
      while ((m = re.exec(src))) {
        if (/\salt=/i.test(m[1])) continue;
        bad++; if (first == null) first = lineOf(src, m.index);
      }
      if (!bad) return [];
      return [{ line: first, detail: bad + ' <img> without alt', fix: 'alt="" for decoration, a description for anything that carries meaning' }];
    }
  },
  {
    id: 'native-dialog',
    weight: 6,
    run: function (src) {
      var n = (src.match(/(?:^|[^.\w])(?:alert|confirm|prompt)\s*\(/g) || []).length;
      if (n < 3) return [];
      return [{ detail: n + ' uses of alert/confirm/prompt', fix: 'these block the page, cannot be styled and read as the browser rather than the product - omega-auth-errors.js already shows the in-page pattern this codebase prefers' }];
    }
  },
  {
    id: 'mobile-keyboard',
    weight: 5,
    run: function (src) {
      var re = /<input\b([^>]*)>/gi, m, bad = [];
      while ((m = re.exec(src))) {
        var a = m[1];
        if (!/type=["']text["']/i.test(a)) continue;
        var name = (/\s(?:id|name)=["']([^"']+)["']/.exec(a) || [])[1] || '';
        if (/email/i.test(name) && !/inputmode/i.test(a)) bad.push(name + ' (use type="email")');
        else if (/phone|tel\b/i.test(name) && !/inputmode/i.test(a)) bad.push(name + ' (use type="tel")');
        else if (/\b(zip|postal)\b/i.test(name) && !/inputmode/i.test(a)) bad.push(name + ' (use inputmode="numeric")');
      }
      if (!bad.length) return [];
      return [{ detail: bad.length + ' input(s) that open the wrong keyboard on a phone: ' + bad.slice(0, 5).join(', '), fix: 'the right type or inputmode saves a field rep several taps per entry' }];
    }
  },
  {
    id: 'page-weight',
    weight: 7,
    run: function (src, file) {
      var kb = Math.round(Buffer.byteLength(src) / 1024);
      if (kb < HEAVY_KB) return [];
      var base = path.basename(file);
      return [{
        detail: kb + ' KB in one file' + (KNOWN_HEAVY[base] ? ' - known: ' + KNOWN_HEAVY[base] : ''),
        fix: KNOWN_HEAVY[base] ? 'split the DATA out, not the code' : 'single-file is the rule (CLAUDE.md), but embedded datasets and base64 images can move to a fetched .json without a build step'
      }];
    }
  }
];

function reviewPage(file) {
  var src;
  try { src = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch (e) { return null; }
  var findings = [];
  CHECKS.forEach(function (c) {
    var got;
    try { got = c.run(src, file) || []; } catch (e) { got = []; }
    got.forEach(function (f) {
      findings.push({ check: c.id, weight: c.weight, file: file, line: f.line || null, detail: f.detail, fix: f.fix });
    });
  });
  return findings;
}

function review(only) {
  var pages = only ? [only] : walk(ROOT);
  var all = [];
  pages.forEach(function (p) {
    var f = reviewPage(p);
    if (f) all = all.concat(f);
  });
  all.sort(function (a, b) { return b.weight - a.weight || a.file.localeCompare(b.file); });
  return { pages: pages.length, findings: all };
}

function main() {
  var asJson = process.argv.indexOf('--json') >= 0;
  var pi = process.argv.indexOf('--page');
  var only = pi >= 0 ? process.argv[pi + 1] : null;
  var r = review(only);

  if (asJson) { console.log(JSON.stringify(r, null, 2)); return 0; }

  console.log('omega steward - UX review - ' + r.pages + ' page(s), ' + r.findings.length + ' finding(s)');
  console.log('');

  /* Grouped by check, because the fix for "no viewport" is the same edit on
     every page that needs it - that is one afternoon, not thirty tickets. */
  var byCheck = {};
  r.findings.forEach(function (f) { (byCheck[f.check] = byCheck[f.check] || []).push(f); });
  Object.keys(byCheck).sort(function (a, b) { return byCheck[b][0].weight - byCheck[a][0].weight; }).forEach(function (c) {
    var list = byCheck[c];
    console.log('  ' + c + '  (' + list.length + ' page' + (list.length === 1 ? '' : 's') + ')');
    console.log('        ' + list[0].fix);
    list.slice(0, 8).forEach(function (f) {
      console.log('          ' + f.file + (f.line ? ':' + f.line : '') + ' - ' + f.detail);
    });
    if (list.length > 8) console.log('          ... and ' + (list.length - 8) + ' more');
    console.log('');
  });
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { review: review, reviewPage: reviewPage };
