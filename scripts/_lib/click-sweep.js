/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/click-sweep.js — click every control on a page, and say which one broke it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY. + New project on the workspace appended its dialog to the END of the
   page, in flow, under the rail: the page jumped to the bottom and the
   dialog sat half off the chrome (Tommy, 2026-09-27: "when i click new
   project it does this and break the page ... we need to make sure every
   click every link doesnt bug"). The render check DID click it, and passed,
   because it asked only whether the dialog's name field was visible. It
   was — at the bottom of the page. A check that asks one question per
   button misses the button nobody wrote a question for, so this asks the
   same questions of every control there is.

   On each view the caller names, every visible control (a link, a button,
   a summary, anything with role=button or tabindex=0, plus the caller's own
   row selectors) is clicked once, in document order. A click that would
   LEAVE the page is held at the door: the navigation is cancelled
   (net::ERR_ABORTED commits no error page, so the page stays) and its
   address is checked against what the site serves. A new-tab link and a
   mail link are read, not followed. After each click it records:

     error      an uncaught error or console error while it ran
     flow       something the click put INTO THE PAGE FLOW — a new element
                on <body> that is not fixed or absolute and takes up height
                (the New Project bug)
     offscreen  a dialog or panel that is not inside the screen
     sideways   the page scrolling sideways
     reload     the loading screen raised, or the address changed, by a
                click that stayed on the page (a full reload in disguise)
     escape     an overlay Escape does not close
     link       a link, a held navigation, or a window.open to an address
                the site does not serve (or off-site and not https)
     click      a control Playwright could not click (covered, detached)

   Then it closes what opened (Escape) and puts the view back.

     var sweep = require('./_lib/click-sweep');
     var r = await sweep.run(page, {
       views: [{ name: 'home', enter: async function (p) {…} }, …],
       scope: '#content',                 // swept on every view
       chrome: '#side-nav, #topbar',      // swept once, on the first view
       clickable: '.next .row[data-row]', // extra selectors that take clicks
       skip: '#ows-signout',              // never clicked (ends the session)
       overlays: '#ows-overlay, #new-proj-modal.on, body.ows-rail-open',
       reveal: [{ within: '#side-nav', open: async function (p) {…} }],
       inner: '.ows-row',                 // one level in: action buttons in what a click opened
       served: sweep.servedBy(ROOT)       // (pathname) → true when the site serves it
     });
     r = { controls, clicks, held[], read[], skipped[], innerSkipped[], problems[{ kind, control, detail }] }

   Needs Playwright ≥ 1.23 (route.fallback). Not a test on its own: the
   caller decides what a problem fails.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path');

var CLICKABLE = 'a[href], button, summary, [role="button"], [role="tab"], [role="menuitem"], [tabindex="0"]';

/* What the deployed site serves at a path: the file, the file with .html
   (cleanUrls), a folder's index.html, a function under api/, or a rewrite or
   redirect in vercel.json that carries no host condition. */
function servedBy(root) {
  var vj = {}; try { vj = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')); } catch (e) {}
  var moves = (vj.rewrites || []).concat(vj.redirects || []).filter(function (r) { return !r.has && !r.missing; }).map(function (r) {
    var re = new RegExp('^' + String(r.source).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:\w+\*/g, '.*').replace(/:\w+/g, '[^/]+') + '$');
    return { re: re, to: r.destination };
  });
  function file(p) {
    var f = path.join(root, p);
    if (f.indexOf(root) !== 0) return false;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return true;
    if (fs.existsSync(f + '.html')) return true;
    if (fs.existsSync(path.join(f, 'index.html'))) return true;
    if (/^\/api\//.test(p) && fs.existsSync(f.replace(/\/$/, '') + '.js')) return true;
    return false;
  }
  return function (pathname) {
    var p = decodeURIComponent(String(pathname || '/'));
    if (file(p)) return true;
    for (var i = 0; i < moves.length; i++) if (moves[i].re.test(p)) {
      var to = String(moves[i].to);
      if (/^https?:/.test(to) || /:\w/.test(to)) return true;
      return file(to.split('?')[0]);
    }
    return false;
  };
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* in the page: tag every visible control under `scope` with data-sweep=<n>
   (document order) and describe it */
function tagIn(arg) {
  var scope = arg.scope, sel = arg.sel, skip = arg.skip, reveal = arg.reveal, start = arg.start;
  var vw = window.innerWidth, out = [], n = start;
  var roots = Array.prototype.slice.call(document.querySelectorAll(scope));
  var seen = [];
  roots.forEach(function (root) {
    Array.prototype.forEach.call(root.querySelectorAll(sel), function (el) {
      if (seen.indexOf(el) >= 0) return; seen.push(el);
      if (skip && el.matches(skip)) return;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      if (el.closest('[hidden]') || !el.getClientRects().length) return;
      var cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') return;
      var r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      var hidden = null; for (var i = 0; i < reveal.length; i++) if (el.closest(reveal[i])) hidden = i;
      if (hidden === null && (r.right <= 0 || r.left >= vw)) return;
      var key = el.id ? '#' + el.id : '';
      ['data-hub', 'data-tool', 'data-key', 'data-tab', 'data-row', 'data-open', 'data-assign', 'data-module', 'data-add-module', 'data-ask-module', 'data-remove-module', 'data-bill', 'data-need', 'data-sn'].forEach(function (a) { if (!key && el.hasAttribute(a)) key = '[' + a + '=' + el.getAttribute(a) + ']'; });
      var text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
      el.setAttribute('data-sweep', String(n));
      out.push({ i: n, label: el.tagName.toLowerCase() + key + ' "' + text + '"', href: el.tagName === 'A' ? el.getAttribute('href') : null, abs: el.tagName === 'A' ? el.href : null, target: el.getAttribute('target') || '', reveal: hidden });
      n++;
    });
  });
  return out;
}

/* in the page: the action buttons (not links: those are read) inside what a
   click opened, tagged data-sweep-inner=<n> */
function innerIn(arg) {
  var out = [];
  Array.prototype.forEach.call(document.querySelectorAll(arg.overlays), function (o) {
    if (o === document.body) return;
    Array.prototype.forEach.call(o.querySelectorAll(arg.inner), function (el) {
      if (el.matches('a[href]') || el.disabled || !el.getClientRects().length) return;
      if (arg.skip && el.matches(arg.skip)) return;
      var head = o.querySelector('h2, h3, [role="dialog"] [id$="title"]');
      el.setAttribute('data-sweep-inner', String(out.length));
      out.push({ j: out.length, label: (head ? head.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) + ' › ' : '') + (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 48) });
    });
  });
  return out;
}

/* in the page: what the last click left behind */
function inspectIn(arg) {
  var vw = window.innerWidth, vh = window.innerHeight, out = { flow: [], offscreen: [], links: [], open: [] };
  Array.prototype.forEach.call(document.body.children, function (el) {
    if (el.hasAttribute('data-sweep-base') || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName)) return;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'absolute' || cs.position === 'sticky') return;
    el.setAttribute('data-sweep-base', '1'); /* reported once, against the click that put it there */
    if (el.offsetHeight > 2) out.flow.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) + ' (' + el.offsetHeight + 'px high, position ' + cs.position + ')');
  });
  Array.prototype.forEach.call(document.querySelectorAll('[role="dialog"], [aria-modal="true"], .ows-drawer'), function (d) {
    if (!d.getClientRects().length || getComputedStyle(d).visibility === 'hidden') return;
    var r = d.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) out.offscreen.push((d.id ? '#' + d.id : d.className ? '.' + String(d.className).split(' ')[0] : d.tagName) + ' at ' + [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)].join(',') + ' in ' + vw + 'x' + vh);
  });
  if (arg.overlays) Array.prototype.forEach.call(document.querySelectorAll(arg.overlays), function (o) {
    out.open.push(o === document.body ? 'body.' + String(o.className).split(' ').filter(function (c) { return /open/.test(c); }).join('.') : (o.id ? '#' + o.id : '.' + String(o.className).split(' ')[0]));
    if (o !== document.body) Array.prototype.forEach.call(o.querySelectorAll('a[href]'), function (a) { out.links.push({ href: a.getAttribute('href'), abs: a.href, label: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) }); });
  });
  out.sideways = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  out.splash = !!(window.OmegaSplash && window.OmegaSplash.active);
  out.where = location.pathname + location.search;
  out.opened = (window.__sweepOpened || []).splice(0);
  out.alive = !!document.body && document.body.children.length > 0;
  return out;
}

async function run(p, opts) {
  opts = opts || {};
  var served = opts.served || function () { return true; };
  var origin = new URL(p.url()).origin;
  var sel = CLICKABLE + (opts.clickable ? ', ' + opts.clickable : '');
  var settle = opts.settle || 260;
  var reveal = opts.reveal || [];
  var report = { clicks: 0, held: [], read: [], problems: [], controls: 0, skipped: [], innerSkipped: [] };
  var current = null, held = [], innerSeen = {};
  function problem(kind, control, detail) { report.problems.push({ kind: kind, control: control, detail: detail }); }
  function onError(e) { if (current) problem('error', current, String(e && e.message || e).slice(0, 240)); }
  function onConsole(m) { if (current && m.type() === 'error' && !/^Failed to load resource/.test(m.text())) problem('error', current, 'console: ' + m.text().slice(0, 240)); }
  p.on('pageerror', onError); p.on('console', onConsole);

  /* where an address goes: a problem string, or null when the site serves it */
  function linkProblem(raw, abs) {
    raw = String(raw == null ? '' : raw);
    if (/^mailto:/i.test(raw)) { var to = raw.slice(7).split('?')[0]; try { to = decodeURIComponent(to); } catch (e) {} /* RFC 6068: the address may be percent-encoded */ return /^[^@\s,]+@[^@\s,]+\.[a-z]{2,}$/i.test(to) ? null : 'a mail link with no address: ' + raw.slice(0, 80); }
    if (/^(tel|sms):/i.test(raw)) return null;
    if (/^javascript:/i.test(raw)) return 'a javascript: link';
    if (raw === '' ) return 'an empty href';
    var u; try { u = new URL(abs || raw, origin + '/'); } catch (e) { return 'an address that does not parse: ' + raw.slice(0, 80); }
    if (u.origin !== origin) return u.protocol === 'https:' ? null : 'an off-site address that is not https: ' + u.href.slice(0, 100);
    if (/undefined|null|NaN|\[object/.test(u.pathname + u.search)) return 'an address built from a missing value: ' + (u.pathname + u.search).slice(0, 100);
    return served(u.pathname) ? null : 'an address the site does not serve: ' + u.pathname;
  }

  await p.route('**/*', function (r) {
    var q = r.request();
    if (q.isNavigationRequest() && q.frame() === p.mainFrame()) { held.push(q.url()); return r.abort('aborted'); }
    return r.fallback();
  });
  await p.evaluate(function () {
    window.__sweepOpened = [];
    window.open = function (u) { window.__sweepOpened.push(String(u)); return null; };
    Array.prototype.forEach.call(document.body.children, function (el) { el.setAttribute('data-sweep-base', '1'); });
  });

  async function closeAll(control) {
    var st = await p.evaluate(inspectIn, { overlays: opts.overlays });
    if (!st.open.length) return;
    await p.keyboard.press('Escape'); await wait(160);
    var again = await p.evaluate(inspectIn, { overlays: opts.overlays });
    if (again.open.length) {
      problem('escape', control, 'Escape leaves open: ' + again.open.join(', '));
      if (opts.forceClose) await opts.forceClose(p);
    }
  }

  var next = 0;
  for (var vi = 0; vi < (opts.views || []).length; vi++) {
    var view = opts.views[vi];
    await view.enter(p); await wait(settle);
    var scope = (opts.scope || 'body') + (vi === 0 && opts.chrome ? ', ' + opts.chrome : '');
    var revealSel = reveal.map(function (x) { return x.within; });
    var viewStart = next;
    var items = await p.evaluate(tagIn, { scope: scope, sel: sel, skip: opts.skip || '', reveal: revealSel, start: viewStart });
    next += items.length; report.controls += items.length;
    for (var k = 0; k < items.length; k++) {
      var it = items[k], control = view.name + ': ' + it.label;
      /* a new tab or a mail link is read, not followed */
      if (it.href != null && (it.target === '_blank' || /^(mailto|tel|sms):/i.test(it.href))) {
        var lp = linkProblem(it.href, it.abs); report.read.push(it.href);
        if (lp) problem('link', control, lp);
        continue;
      }
      /* re-rendered by an earlier click (a view that paints itself on entry):
         tag the view again in the same order and take the same control */
      if (!(await p.$('[data-sweep="' + it.i + '"]'))) {
        var again = await p.evaluate(tagIn, { scope: scope, sel: sel, skip: opts.skip || '', reveal: revealSel, start: viewStart });
        var same = again.filter(function (a) { return a.i === it.i; })[0];
        if (!same || same.label !== it.label) { report.skipped.push(control); continue; }
      }
      if (it.reveal !== null && it.reveal !== undefined && reveal[it.reveal].open) { await reveal[it.reveal].open(p); await wait(settle); }
      var before = await p.evaluate(function () { return location.pathname + location.search; });
      var heldAt = held.length;
      current = control;
      try { await p.locator('[data-sweep="' + it.i + '"]').click({ timeout: 2500 }); report.clicks++; }
      catch (e) { problem('click', control, String(e.message || e).split('\n')[0].slice(0, 200)); current = null; await closeAll(control); await view.enter(p); continue; }
      await wait(settle);
      var st = await judge(control, it, before, heldAt);
      if (!st) { current = null; break; }
      /* one level in: each action button in what this click opened, once */
      if (opts.inner && !st.left) {
        var inner = await p.evaluate(innerIn, { overlays: opts.overlays, inner: opts.inner, skip: opts.skip || '' });
        for (var q = 0; q < inner.length; q++) {
          if (innerSeen[inner[q].label]) continue; innerSeen[inner[q].label] = true;
          var ic = control + ' › ' + inner[q].label;
          await closeAll(control); await view.enter(p); await wait(60);
          if (it.reveal !== null && it.reveal !== undefined && reveal[it.reveal].open) { await reveal[it.reveal].open(p); await wait(settle); }
          if (!(await p.$('[data-sweep="' + it.i + '"]'))) { report.innerSkipped.push(ic); continue; }
          try { await p.locator('[data-sweep="' + it.i + '"]').click({ timeout: 2500 }); } catch (e) { report.innerSkipped.push(ic); continue; }
          await wait(settle);
          var again2 = await p.evaluate(innerIn, { overlays: opts.overlays, inner: opts.inner, skip: opts.skip || '' });
          var hit = again2.filter(function (x) { return x.label === inner[q].label; })[0];
          if (!hit) { report.innerSkipped.push(ic); continue; } /* an earlier row changed what this one says (Assign → Keep): state, not a fault */
          var before2 = await p.evaluate(function () { return location.pathname + location.search; }), heldAt2 = held.length;
          current = ic;
          try { await p.locator('[data-sweep-inner="' + hit.j + '"]').click({ timeout: 2500 }); report.clicks++; report.controls++; }
          catch (e) { problem('click', ic, String(e.message || e).split('\n')[0].slice(0, 200)); current = null; continue; }
          await wait(settle);
          var st2 = await judge(ic, null, before2, heldAt2);
          current = null;
          if (!st2) break;
          if (st2.left && opts.afterLeave) await opts.afterLeave(p);
        }
      }
      current = null;
      await closeAll(control);
      if (st.left && opts.afterLeave) await opts.afterLeave(p);
      await view.enter(p); await wait(60);
    }
  }
  await p.unroute('**/*');
  p.off('pageerror', onError); p.off('console', onConsole);
  return report;

  /* what the last click did: a problem per thing it broke; null when the page died */
  async function judge(control, it, before, heldAt) {
    var st = await p.evaluate(inspectIn, { overlays: opts.overlays }).catch(function () { return null; });
    if (!st || !st.alive) { problem('reload', control, 'the page did not survive the click'); return null; }
    var left = held.slice(heldAt);
    left.forEach(function (u) {
      report.held.push(u); var lp2 = linkProblem(u, u); if (lp2) problem('link', control, 'goes to ' + lp2);
      /* the same page again, for a view or the same address: a full reload where a view change was meant */
      var to = new URL(u), here = new URL(origin + before);
      /* a request never carries its #fragment: the link's own href does */
      if (it && it.abs) { try { var ah = new URL(it.abs); if (ah.origin === to.origin && ah.pathname === to.pathname) to = ah; } catch (e) {} }
      var same = to.origin === origin && to.pathname.replace(/\.html$/, '') === here.pathname.replace(/\.html$/, '');
      if (same && (to.hash || !to.search || to.search === here.search)) problem('reload', control, 'reloads this page (' + (to.pathname + to.search + to.hash) + ') instead of changing the view');
    });
    if (left.length) await p.evaluate(function () { if (window.OmegaSplash) window.OmegaSplash.done(); });
    else {
      if (st.splash) problem('reload', control, 'raised the loading screen and stayed on the page');
      if (st.where !== before) problem('reload', control, 'changed the address from ' + before + ' to ' + st.where + ' without leaving');
    }
    st.flow.forEach(function (f) { problem('flow', control, 'put ' + f + ' into the page flow instead of over it'); });
    st.offscreen.forEach(function (f) { problem('offscreen', control, f); });
    if (st.sideways) problem('sideways', control, 'the page scrolls sideways');
    st.links.forEach(function (l) { var lp3 = linkProblem(l.href, l.abs); if (lp3) problem('link', control + ' › "' + l.label + '"', lp3); });
    st.opened.forEach(function (u) { var lp4 = linkProblem(u, u); if (lp4) problem('link', control, 'window.open to ' + lp4); });
    st.left = left.length > 0;
    return st;
  }
}

module.exports = { run: run, servedBy: servedBy, CLICKABLE: CLICKABLE };
