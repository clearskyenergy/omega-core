#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/harvest-prospects.js — fill the sales database from public lists
   and from the sheets people hand us
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   DRY BY DEFAULT: prints what it found and writes nothing. --apply files it
   through POST /api/sales with ClearSky's sales key (scripts/_lib/
   sales-client.js says where the key is looked for).

     --list                              the registry (scripts/_lib/prospect-sources.js)
     --source <key> [--limit 1000]       one public dataset → candidates
     --all                               every registered source
     --csv <file> [--label "Master list"] [--vertical installer] [--state IL]
                                         a sheet: rows with a website or a work
                                         email become prospects; rows with only
                                         a name become candidates
     --out <file.json>                   write everything found, for reading
     --apply                             file it

   A candidate is a NAME with evidence (how many projects, in which public
   record). The sales agent researches candidates into prospects: it finds
   the website and the right person, then calls resolve-candidate. Nothing a
   harvest files is ever written to until that has happened.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), https = require('https');
var SRC = require('./_lib/prospect-sources');
var S = require('../api/_lib/sales');
var C = require('./_lib/sales-client');

var argv = process.argv.slice(2);
function flag(n) { return argv.indexOf(n) >= 0; }
function opt(n, d) { var i = argv.indexOf(n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; }
var APPLY = flag('--apply'), OUT = opt('--out', '');

function getJson(u) {
  return new Promise(function (resolve, reject) {
    https.get(u, { headers: { Accept: 'application/json' }, timeout: 60000 }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var t = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error(u.split('?')[0] + ' → HTTP ' + res.statusCode + ': ' + t.slice(0, 200)));
        try { resolve(JSON.parse(t)); } catch (e) { reject(new Error('not JSON from ' + u.split('?')[0])); }
      });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timed out: ' + u.split('?')[0])); });
  });
}

function harvest(src, limit) {
  return getJson(SRC.url(src, limit)).then(function (rows) {
    var list = SRC.candidates(src, rows);
    console.log('\n' + src.key + ' — ' + src.label + ': ' + list.length + ' companies');
    list.slice(0, 10).forEach(function (c) { console.log('  ' + String(c.projects).padStart(6) + '  ' + c.company); });
    if (list.length > 10) console.log('  … and ' + (list.length - 10) + ' more');
    return { source: src.key, candidates: list };
  });
}

function fileCandidates(list, label) {
  var parts = C.chunks(list, 500), done = { created: 0, updated: 0, errors: 0 };
  return parts.reduce(function (p, part) {
    return p.then(function () {
      return C.post({ action: 'upsert-candidates', label: label, candidates: part }).then(function (r) {
        done.created += r.created; done.updated += r.updated; done.errors += (r.errors || []).length;
      });
    });
  }, Promise.resolve()).then(function () { return done; });
}
function fileProspects(list, label) {
  var parts = C.chunks(list, 200), done = { created: 0, updated: 0, errors: [] };
  return parts.reduce(function (p, part) {
    return p.then(function () {
      return C.post({ action: 'upsert-prospects', label: label, prospects: part }).then(function (r) {
        done.created += r.created.length; done.updated += r.updated.length; done.errors = done.errors.concat(r.errors || []);
      });
    });
  }, Promise.resolve()).then(function () { return done; });
}

function fromCsv(file) {
  var Csv = require('../api/_lib/custody');
  var parsed = Csv.parseCsv(fs.readFileSync(file, 'utf8'));
  var map = S.guessProspectMapping(parsed.headers), label = opt('--label', require('path').basename(file));
  console.log('\n' + file + ': ' + parsed.rows.length + ' rows');
  console.log('columns: ' + parsed.headers.map(function (h) { return h + (map[h] ? ' → ' + map[h] : ' (ignored)'); }).join(', '));
  if (!Object.keys(map).some(function (h) { return map[h] === 'company' || map[h] === 'domain' || map[h] === 'email'; })) throw new Error('no company, website or email column: nothing to file');
  var defaults = { label: label, vertical: S.verticalFrom(opt('--vertical', '')), state: opt('--state', ''), source: { kind: 'list', ref: label } };
  var prospects = [], candidates = [], skipped = 0;
  parsed.rows.forEach(function (row) {
    var inc = S.rowToProspect(row, map, defaults), c = S.cleanProspect(inc);
    if (c.ok) prospects.push(inc);
    else if (inc.company) candidates.push({ company: inc.company, state: inc.state, vertical: inc.vertical, source: { kind: 'list', ref: label }, evidence: [{ text: 'On ' + label + (inc.summary ? ': ' + inc.summary : ''), source: 'list' }] });
    else skipped++;
  });
  console.log('  ' + prospects.length + ' prospects (a website or a work email), ' + candidates.length + ' candidates (a name only), ' + skipped + ' rows with neither');
  return { prospects: prospects, candidates: candidates, label: label };
}

function main() {
  if (flag('--list')) { SRC.SOURCES.forEach(function (s) { console.log(s.key.padEnd(28) + s.label + '\n' + ' '.repeat(28) + s.page); }); return Promise.resolve(); }
  var csv = opt('--csv', ''), job;
  if (csv) {
    job = Promise.resolve(fromCsv(csv)).then(function (x) {
      if (OUT) fs.writeFileSync(OUT, JSON.stringify(x, null, 2));
      if (!APPLY) { console.log('\nDry run. Nothing filed. --apply to file it.'); return; }
      return fileProspects(x.prospects, x.label).then(function (p) {
        console.log('prospects: ' + p.created + ' new, ' + p.updated + ' updated, ' + p.errors.length + ' refused');
        p.errors.slice(0, 10).forEach(function (e) { console.log('  row ' + e.index + ': ' + e.error); });
        return fileCandidates(x.candidates, x.label);
      }).then(function (c) { console.log('candidates: ' + c.created + ' new, ' + c.updated + ' updated'); });
    });
  } else {
    var keys = flag('--all') ? SRC.SOURCES.map(function (s) { return s.key; }) : [opt('--source', '')];
    if (!keys[0]) { console.error('usage: --list | --source <key> | --all | --csv <file>  [--out file.json] [--apply]'); process.exit(2); }
    var limit = Math.max(1, Math.min(5000, Number(opt('--limit', 1000)) || 1000)), found = [];
    job = keys.reduce(function (p, k) {
      return p.then(function () {
        var src = SRC.byKey(k);
        if (!src) throw new Error('no source ' + k + ' (see --list)');
        return harvest(src, limit).then(function (r) { found.push(r); });
      });
    }, Promise.resolve()).then(function () {
      if (OUT) fs.writeFileSync(OUT, JSON.stringify(found, null, 2));
      if (!APPLY) { console.log('\nDry run. Nothing filed. --apply to file these as candidates for the agent to research.'); return; }
      return found.reduce(function (p, r) {
        return p.then(function () { return fileCandidates(r.candidates, r.source).then(function (d) { console.log(r.source + ': ' + d.created + ' new candidates, ' + d.updated + ' updated'); }); });
      }, Promise.resolve());
    });
  }
  return job;
}

main().catch(function (e) { console.error('harvest: ' + e.message); process.exit(1); });
