/* ═══════════════════════════════════════════════════════════════════════════════
   scripts/skyfund-sandbox/shim.js — SkyFund on a phone with nothing behind it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The storefront (portals/skyfund/index.html) talks to three things: the
   Firebase compat SDK (auth + Firestore), POST /api/invest, and Stripe
   Checkout by redirect. This file stands in for all three so the REAL page,
   unmodified in its logic, runs from a static link with state on the device.
   scripts/build-skyfund-sandbox.js prepends the per-unit projection tables
   and drops the result next to the page as sandbox.js.

   WHAT IS REAL HERE: the page, every screen, every flow, the sample projects.
   WHAT IS NOT: sign-in (any email works, no password is checked), payment
   (a simulated checkout sheet), and the numbers' provenance — the per-unit
   projections were computed ONCE by api/_lib/invest-math.js at build time
   and are only multiplied here, so the engine itself never ships.

   Never deployed. It lives under scripts/ (vercelignored) and is published
   only as a private test link.  ES5.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var KEY = 'skyfund_sandbox_v2';
  var PROJ = global.SKYFUND_PROJ || {};
  var SAMPLES = global.SKY_FUND_SAMPLES || [];
  var RULES = { minInvestment: 100, maxInvestment: 250000, nonAccreditedAnnualCap: 2500, accreditedRequiredAbove: 25000, allowedCountries: ['US'] };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function now() { return new Date().toISOString(); }
  function id(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function usd(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

  /* ── the store: one JSON blob on the device ────────────────────────────── */
  var store = null;
  function seed() {
    var docs = {};
    SAMPLES.forEach(function (s) {
      var c = clone(s); delete c.sample; c.slug = c.id; c.launchedAt = now(); c.updatedAt = now();
      docs['cf_campaigns/' + c.id] = c;
      docs['cf_campaigns/' + c.id + '/updates/u1'] = { title: 'Campaign is live', body: 'Thanks for looking. Questions go to the sponsor through the platform; every investor is emailed when there is news.', author: c.sponsorName, createdAt: now(), createdAtMs: Date.now() - 86400000 * 3 };
    });
    docs['cf_settings/rules'] = clone(RULES);
    return { docs: docs, users: {}, session: null, createdAt: now() };
  }
  function load() {
    try { var raw = global.localStorage && global.localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save() { try { global.localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  function reset() { store = seed(); save(); }
  store = load() || seed(); save();

  /* ── a Firestore look-alike over the store ─────────────────────────────── */
  var TS = { __sv: 'ts' };
  function resolve(data) {
    var out = {}, k;
    for (k in data) if (data.hasOwnProperty(k)) out[k] = (data[k] && data[k].__sv === 'ts') ? now() : data[k];
    return out;
  }
  function snap(path) {
    var d = store.docs[path];
    return { id: path.split('/').pop(), exists: !!d, data: function () { return d ? clone(d) : undefined; }, ref: docRef(path) };
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path: path,
      get: function () { return Promise.resolve(snap(path)); },
      set: function (data, opts) {
        var cur = store.docs[path], next = resolve(data);
        if (opts && opts.merge && cur) { var m = clone(cur), k; for (k in next) if (next.hasOwnProperty(k)) m[k] = next[k]; store.docs[path] = m; }
        else store.docs[path] = next;
        save(); return Promise.resolve();
      },
      update: function (data) { return this.set(data, { merge: true }); },
      delete: function () { delete store.docs[path]; save(); return Promise.resolve(); },
      collection: function (c) { return collRef(path + '/' + c); }
    };
  }
  function query(path, filters, lim) {
    return {
      where: function (f, op, v) { return query(path, filters.concat([[f, op, v]]), lim); },
      limit: function (n) { return query(path, filters, n); },
      orderBy: function () { return this; },
      get: function () {
        var docs = Object.keys(store.docs).filter(function (k) { return k.indexOf(path + '/') === 0 && k.slice(path.length + 1).indexOf('/') < 0; })
          .map(snap).filter(function (s) {
            var d = s.data();
            return filters.every(function (f) {
              var val = d[f[0]];
              if (f[1] === '==') return val === f[2];
              if (f[1] === 'in') return f[2].indexOf(val) >= 0;
              if (f[1] === 'array-contains') return Array.isArray(val) && val.indexOf(f[2]) >= 0;
              return true;
            });
          });
        if (lim) docs = docs.slice(0, lim);
        return Promise.resolve({ empty: !docs.length, size: docs.length, docs: docs, forEach: function (fn) { docs.forEach(fn); } });
      }
    };
  }
  function collRef(path) {
    var q = query(path, [], null);
    q.doc = function (did) { return docRef(path + '/' + (did || id('doc'))); };
    q.add = function (data) { var r = docRef(path + '/' + id('doc')); return r.set(data).then(function () { return r; }); };
    return q;
  }

  /* ── an Auth look-alike: any email, no password, remembered on the device ── */
  var listeners = [];
  function currentUser() {
    var u = store.session && store.users[store.session];
    if (!u) return null;
    return { uid: u.uid, email: u.email, displayName: u.name, emailVerified: true,
      getIdToken: function () { return Promise.resolve('sandbox:' + u.uid); },
      sendEmailVerification: function () { return Promise.resolve(); } };
  }
  function notify() { var u = currentUser(); listeners.forEach(function (cb) { setTimeout(function () { cb(u); }, 0); }); }
  function signInAs(email, name) {
    email = String(email || '').toLowerCase().trim();
    if (!email || email.indexOf('@') < 0) { var e = new Error('That email address is not valid.'); e.code = 'auth/invalid-email'; return Promise.reject(e); }
    var uid = 'u_' + email.replace(/[^a-z0-9]/g, '_');
    if (!store.users[uid]) store.users[uid] = { uid: uid, email: email, name: name || email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) };
    store.session = uid; save(); notify();
    return Promise.resolve({ user: currentUser() });
  }
  var auth = {
    onAuthStateChanged: function (cb) { listeners.push(cb); setTimeout(function () { cb(currentUser()); }, 0); return function () {}; },
    signInWithPopup: function () { return signInAs('demo.investor@gmail.com', 'Demo Investor'); },
    signInWithEmailAndPassword: function (email) { return signInAs(email); },
    createUserWithEmailAndPassword: function (email) { return signInAs(email); },
    signOut: function () { store.session = null; save(); notify(); return Promise.resolve(); },
    get currentUser() { return currentUser(); }
  };
  function GoogleAuthProvider() { this.setCustomParameters = function () {}; }

  var firebase = {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: function () { return firebase.apps[0]; },
    auth: function () { return auth; },
    firestore: function () { return { collection: collRef, doc: docRef }; }
  };
  firebase.auth.GoogleAuthProvider = GoogleAuthProvider;
  firebase.auth.EmailAuthProvider = { credential: function () { return {}; } };
  firebase.firestore.FieldValue = { serverTimestamp: function () { return TS; }, increment: function (n) { return n; } };
  global.firebase = firebase;
  global.CLEARSKY_CONFIG = global.CLEARSKY_CONFIG || { firebase: { projectId: 'skyfund-sandbox' }, platformName: 'SkyFund Sandbox' };

  /* ── /api/invest, answered locally from the per-unit tables ─────────────── */
  function campaign(cid) { return store.docs['cf_campaigns/' + cid] || null; }
  function committedThisYear(uid) {
    var y0 = new Date(new Date().getFullYear(), 0, 1).getTime(), sum = 0;
    Object.keys(store.docs).forEach(function (k) {
      if (k.indexOf('cf_pledges/') !== 0) return;
      var p = store.docs[k];
      if (p.investorUid === uid && (p.status === 'paid' || p.status === 'pending') && (p.createdAtMs || 0) >= y0) sum += p.amount;
    });
    return sum;
  }
  function projection(c, units) {
    var t = PROJ[c.id]; if (!t) return null;
    units = Math.max(0, Math.floor(Number(units) || 0));
    var amount = units * t.unitPrice, cum = 0, years = [];
    t.perUnitYears.forEach(function (d, i) { var v = d * units; cum += v; years.push({ year: i + 1, distribution: v, cumulative: cum }); });
    return { units: units, unitPrice: t.unitPrice, amount: amount, pctOfOffering: t.unitsTotal ? units / t.unitsTotal : 0,
      pctOfProject: t.unitsTotal ? units / t.unitsTotal * t.sharePct / 100 : 0, termYears: t.termYears, kind: t.kind, sharePct: t.sharePct,
      annualDistribution: t.perUnitAnnual * units, yieldPct: t.yieldPct, total: t.perUnitTotal * units, moic: t.moic,
      irrPct: t.irrPct, paybackYear: units > 0 ? t.paybackYear : null, codMonths: t.codMonths, years: years,
      remainingUnits: Math.max(0, (Number(c.unitsTotal) || 0) - (Number(c.unitsSold) || 0)) };
  }
  function eligibility(inv, amount, c, prior) {
    var reasons = [], minInv = Math.max(RULES.minInvestment, Number(c.minInvestment) || 0);
    if (amount < minInv) reasons.push('The minimum investment is ' + usd(minInv) + '.');
    if (amount > RULES.maxInvestment) reasons.push('The maximum investment is ' + usd(RULES.maxInvestment) + '.');
    if (inv.country && RULES.allowedCountries.indexOf(inv.country) < 0) reasons.push('Investing is currently open to residents of ' + RULES.allowedCountries.join(', ') + ' only.');
    var accredited = inv.accredited === true;
    if (!accredited && prior + amount > RULES.nonAccreditedAnnualCap) reasons.push('Non-accredited investors may invest up to ' + usd(RULES.nonAccreditedAnnualCap) + ' per year across all projects. You have ' + usd(Math.max(0, RULES.nonAccreditedAnnualCap - prior)) + ' remaining. Tick "accredited investor" to lift the cap in this sandbox.');
    if (amount > RULES.accreditedRequiredAbove && !accredited) reasons.push('Investments above ' + usd(RULES.accreditedRequiredAbove) + ' are open to accredited investors.');
    if (!inv.acceptedRisk) reasons.push('Please acknowledge the risk disclosure.');
    return { ok: !reasons.length, reasons: reasons, minInvestment: minInv, maxInvestment: RULES.maxInvestment };
  }
  function markPaid(pledgeId, pay) {
    var p = store.docs['cf_pledges/' + pledgeId]; if (!p || p.status === 'paid') return p;
    var c = campaign(p.campaignId); if (!c) return p;
    var first = !Object.keys(store.docs).some(function (k) { var q = store.docs[k]; return k.indexOf('cf_pledges/') === 0 && k !== 'cf_pledges/' + pledgeId && q.campaignId === p.campaignId && q.investorUid === p.investorUid && q.status === 'paid'; });
    c.raised = (Number(c.raised) || 0) + p.amount; c.unitsSold = (Number(c.unitsSold) || 0) + p.units; if (first) c.backers = (Number(c.backers) || 0) + 1;
    c.lastPledgeAt = now(); p.status = 'paid'; p.paidAt = now(); p.payment = pay || { provider: 'sandbox' }; save(); return p;
  }
  function markCancelled(pledgeId) { var p = store.docs['cf_pledges/' + pledgeId]; if (p && p.status === 'pending') { p.status = 'cancelled'; p.cancelledAt = now(); save(); } return p; }

  function api(body) {
    var u = currentUser();
    function err(status, msg) { var e = new Error(msg); e.status = status; throw e; }
    if (body.action === 'quote') {
      var c = campaign(body.campaignId); if (!c || ['live', 'funded', 'closed'].indexOf(c.status) < 0) err(404, 'campaign is not open');
      var p = projection(c, Math.floor((Number(body.amount) || 0) / c.unitPrice)); if (!p) err(404, 'campaign is not open');
      p.headline = c.headline; p.personalized = !!u;
      if (u) { var inv = store.docs['cf_investors/' + u.uid] || {}; inv = clone(inv); inv.acceptedRisk = true; var e = eligibility(inv, p.amount, c, committedThisYear(u.uid)); p.eligible = e.ok; p.reasons = e.reasons; p.minInvestment = e.minInvestment; p.maxInvestment = e.maxInvestment; }
      return p;
    }
    if (body.action === 'bankStatus') return { provider: 'none', plaid: false, stripe: false, escrowConfigured: false, distributionConfigured: false, sandbox: true };
    if (!u) err(401, 'missing bearer token');
    if (body.action === 'bankLinkToken' || body.action === 'bankLink' || body.action === 'bankRemove') err(400, 'Bank linking is not part of the phone sandbox; the simulated checkout stands in for every rail.');
    if (body.action === 'pledge') {
      var cc = campaign(body.campaignId); if (!cc) err(404, 'campaign not found');
      if (cc.status !== 'live') err(409, 'this campaign is not accepting investment');
      var at = body.attest || {};
      var units = Math.floor((Number(body.amount) || 0) / cc.unitPrice); if (units < 1) err(400, 'the minimum is one unit of ' + usd(cc.unitPrice));
      var remaining = Math.max(0, (Number(cc.unitsTotal) || 0) - (Number(cc.unitsSold) || 0)); if (units > remaining) err(409, 'only ' + remaining + ' units remain');
      var amount = units * cc.unitPrice;
      if (at.acceptedTerms !== true) err(400, 'Please accept the investment terms.');
      var prof = store.docs['cf_investors/' + u.uid] || {};
      var merged = { accredited: at.accredited === true || prof.accredited === true, country: String(at.country || prof.country || '').toUpperCase(), acceptedRisk: at.acceptedRisk === true };
      if (!merged.country) err(400, 'Country of residence is required.');
      var el = eligibility(merged, amount, cc, committedThisYear(u.uid)); if (!el.ok) err(403, el.reasons.join(' '));
      var perk = null; (cc.perks || []).forEach(function (k) { if (k.id === body.perkId) perk = k; });
      if (perk && Number(perk.minAmount) > amount) err(400, 'that perk needs at least ' + usd(perk.minAmount));
      var pr = projection(cc, units), pid = id('pl');
      store.docs['cf_pledges/' + pid] = { campaignId: cc.id, campaignTitle: cc.title, sponsorOrgId: cc.sponsorOrgId, investorUid: u.uid, investorEmail: u.email, investorName: at.name || u.displayName,
        amount: amount, units: units, unitPrice: cc.unitPrice, pctOfOffering: pr.pctOfOffering, pctOfProject: pr.pctOfProject, projectedAnnual: pr.annualDistribution, projectedTotal: pr.total,
        perkId: perk ? perk.id : null, perkTitle: perk ? perk.title : null, status: 'pending', paymentProvider: 'sandbox', createdAt: now(), createdAtMs: Date.now() };
      var pp = store.docs['cf_investors/' + u.uid] || { uid: u.uid, email: u.email, status: 'active', kyc: 'none', accreditedVerified: false, createdAt: now() };
      pp.name = at.name || pp.name || u.displayName; pp.country = merged.country; pp.accredited = merged.accredited; store.docs['cf_investors/' + u.uid] = pp; save();
      return { pledgeId: pid, url: '#/sandbox-checkout/' + pid, amount: amount, units: units };
    }
    if (body.action === 'cancel') { var cp = store.docs['cf_pledges/' + body.pledgeId]; if (!cp) err(404, 'pledge not found'); if (cp.investorUid !== u.uid) err(403, 'not your pledge'); markCancelled(body.pledgeId); return { ok: true }; }
    err(400, 'that action is not part of the sandbox');
  }
  var realFetch = global.fetch;
  global.fetch = function (url, opts) {
    if (String(url).replace(/^https?:\/\/[^\/]+/, '') !== '/api/invest') return realFetch ? realFetch.apply(global, arguments) : Promise.reject(new Error('no network in the sandbox'));
    return new Promise(function (res) {
      setTimeout(function () {
        var out, status = 200;
        try { out = api(JSON.parse((opts && opts.body) || '{}')); } catch (e) { status = e.status || 500; out = { error: e.message }; }
        res({ ok: status < 400, status: status, json: function () { return Promise.resolve(out); } });
      }, 180);
    });
  };

  /* ── simulations the controls sheet offers ─────────────────────────────── */
  function simulatePayPending() {
    var n = 0; Object.keys(store.docs).forEach(function (k) { if (k.indexOf('cf_pledges/') === 0 && store.docs[k].status === 'pending') { markPaid(k.split('/')[1], { provider: 'sandbox', note: 'controls sheet' }); n++; } });
    return n;
  }
  function simulateQuarter() {
    var u = currentUser(); if (!u) return 0;
    var mine = {}; Object.keys(store.docs).forEach(function (k) { var p = store.docs[k]; if (k.indexOf('cf_pledges/') === 0 && p.investorUid === u.uid && p.status === 'paid') mine[p.campaignId] = 1; });
    var n = 0;
    Object.keys(mine).forEach(function (cid) {
      var c = campaign(cid), t = PROJ[cid]; if (!c || !t) return;
      if (c.status === 'live') { c.status = 'funded'; c.fundedAt = now(); }
      var count = Object.keys(store.docs).filter(function (k) { return k.indexOf('cf_distributions/') === 0 && store.docs[k].campaignId === cid; }).length;
      var quarter = 'Q' + ((count % 4) + 1) + ' ' + (new Date().getFullYear() + 1 + Math.floor(count / 4));
      var distributable = t.distributableAnnual / 4, pool = distributable * t.sharePct / 100, perUnit = c.unitsSold ? pool / c.unitsSold : 0;
      store.docs['cf_distributions/' + id('d')] = { campaignId: cid, campaignTitle: c.title, sponsorOrgId: c.sponsorOrgId, period: quarter, grossRevenue: Math.round(distributable * 1.35), distributable: distributable, sharePct: t.sharePct, crowdPool: pool, unitsSold: c.unitsSold, perUnit: perUnit, status: 'paid', createdAt: now(), createdAtMs: Date.now() };
      store.docs['cf_campaigns/' + cid + '/updates/' + id('u')] = { title: quarter + ' distribution paid', body: 'The sponsor reported ' + usd(distributable) + ' of distributable cash for the quarter. The crowd pool is ' + usd(pool) + ', ' + '$' + perUnit.toFixed(2) + ' per unit.', author: 'ClearSky', createdAt: now(), createdAtMs: Date.now() };
      c.distributions = (c.distributions || 0) + 1; c.distributedTotal = (c.distributedTotal || 0) + pool; n++;
    });
    save(); return n;
  }

  global.SKYFUND_SANDBOX = { store: function () { return store; }, reset: reset, pay: function (pid) { return markPaid(pid, { provider: 'sandbox', card: '4242' }); }, cancel: markCancelled,
    payPending: simulatePayPending, quarter: simulateQuarter, api: api, currentUser: currentUser, projection: projection };

  /* ── the on-screen parts: strip, checkout sheet, controls sheet ─────────── */
  if (typeof document === 'undefined' || !document.addEventListener) return;
  function $(q) { return document.querySelector(q); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toast(msg, ms) { var t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.className = 'show'; clearTimeout(t._t); t._t = setTimeout(function () { t.className = ''; }, ms || 3500); }
  function closePageModals() { ['investModal', 'authModal'].forEach(function (i) { var m = document.getElementById(i); if (m) m.className = 'modal'; }); }

  var CSS = '.sb-strip{background:#6D5BD0;color:#fff;font:600 12px/1.3 Inter,system-ui,sans-serif;padding:6px 16px;display:flex;align-items:center;gap:8px;position:sticky;top:60px;z-index:39;min-width:0}' +
    '.sb-strip b{letter-spacing:.1em;text-transform:uppercase;font-size:10.5px;flex:none}.sb-strip span{opacity:.85;font-weight:500;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-strip button{flex:none;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:4px;padding:5px 10px;font:600 12px Inter,sans-serif;cursor:pointer}' +
    '.sb-sheet{position:fixed;inset:0;background:rgba(15,23,32,.6);z-index:80;display:flex;align-items:flex-end;justify-content:center}.sb-sheet .in{background:#fff;color:#14171A;width:100%;max-width:520px;border-radius:12px 12px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));font:400 14px/1.5 Inter,system-ui,sans-serif;max-height:92vh;overflow:auto}' +
    '@media(min-width:700px){.sb-sheet{align-items:center}.sb-sheet .in{border-radius:12px}}' +
    '.sb-sheet h2{font:700 19px/1.2 Archivo,Inter,sans-serif;margin:0 0 4px;letter-spacing:-.02em}.sb-sheet .sub{color:#5B6672;font-size:13px;margin:0 0 14px}' +
    '.sb-sheet .row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid rgba(20,23,26,.09);font-size:13.5px}.sb-sheet .row b{font-family:"IBM Plex Mono",ui-monospace,monospace;font-weight:500}' +
    '.sb-sheet .field{border:1px solid rgba(20,23,26,.16);border-radius:4px;padding:10px 12px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:15px;color:#14171A;background:#F5F4F0;margin-bottom:8px;display:flex;justify-content:space-between}.sb-sheet .field small{font:500 11px Inter,sans-serif;color:#8A94A0;text-transform:uppercase;letter-spacing:.06em}' +
    '.sb-btn{display:block;width:100%;border:1px solid transparent;border-radius:4px;padding:13px 16px;font:600 15px Inter,sans-serif;cursor:pointer;margin-top:10px}.sb-btn.gold{background:#C77A00;color:#fff}.sb-btn.blue{background:#2B5FA8;color:#fff}.sb-btn.ghost{background:#fff;color:#14171A;border-color:rgba(20,23,26,.16)}.sb-btn.red{background:#fff;color:#D9482B;border-color:rgba(217,72,43,.4)}' +
    '.sb-head{background:#16202B;color:#fff;margin:-20px -20px 16px;padding:14px 20px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:10px;font:600 13px Inter,sans-serif}.sb-head i{width:8px;height:8px;border-radius:50%;background:#F0B45C;display:inline-block}.sb-head span{opacity:.7;font-weight:500;margin-left:auto}' +
    '.sb-note{background:rgba(109,91,208,.1);border:1px solid rgba(109,91,208,.35);border-radius:6px;padding:10px 12px;font-size:12.5px;line-height:1.5;margin-top:12px}.sb-list{margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.6;color:#14171A}';

  var sheet = null;
  function closeSheet() { if (sheet && sheet.parentNode) sheet.parentNode.removeChild(sheet); sheet = null; }
  function openSheet(html) { closeSheet(); sheet = el('div', 'sb-sheet'); sheet.innerHTML = '<div class="in">' + html + '</div>'; sheet.addEventListener('click', function (ev) { if (ev.target === sheet) closeSheet(); }); document.body.appendChild(sheet); return sheet; }

  function checkout(pid) {
    var p = store.docs['cf_pledges/' + pid]; if (!p) { location.hash = '#/portfolio'; return; }
    closePageModals();
    var s = openSheet('<div class="sb-head"><i></i>Sandbox checkout<span>no real payment</span></div>' +
      '<h2>' + esc(p.campaignTitle) + '</h2><p class="sub">' + p.units + ' units × ' + usd(p.unitPrice) + ' · ' + (p.pctOfProject * 100).toFixed(4) + '% of project cash</p>' +
      '<div class="field"><span>4242 4242 4242 4242</span><small>test card</small></div><div style="display:flex;gap:8px"><div class="field" style="flex:1"><span>12 / 34</span><small>exp</small></div><div class="field" style="flex:1"><span>123</span><small>cvc</small></div></div>' +
      '<div class="row"><span>Total</span><b>' + usd(p.amount) + '</b></div>' +
      '<button class="sb-btn gold" id="sbPay">Pay ' + usd(p.amount) + '</button><button class="sb-btn ghost" id="sbCancel">Cancel and go back</button>' +
      '<div class="sb-note">In production this screen is Stripe Checkout on stripe.com. Here the button marks your commitment paid on this device and moves the project\'s raised total exactly the way the real ledger does.</div>');
    s.querySelector('#sbPay').onclick = function () { markPaid(pid, { provider: 'sandbox', card: '4242' }); closeSheet(); location.hash = '#/portfolio'; toast('Payment received (simulated). Your units are confirmed.', 4500); };
    s.querySelector('#sbCancel').onclick = function () { markCancelled(pid); closeSheet(); location.hash = '#/c/' + p.campaignId; toast('Checkout cancelled. The commitment was released.'); };
  }

  function controls() {
    var u = currentUser();
    var pend = 0, paid = 0; Object.keys(store.docs).forEach(function (k) { if (k.indexOf('cf_pledges/') !== 0) return; var st = store.docs[k].status; if (st === 'pending') pend++; if (st === 'paid') paid++; });
    var s = openSheet('<div class="sb-head"><i></i>Sandbox controls<span>state lives on this device</span></div>' +
      '<h2>What to try</h2><ol class="sb-list"><li>Browse projects, open one, move the slider — the projection updates.</li><li>Tap <b>Invest</b>, sign in with any email (no password check), confirm, pay with the test card.</li><li>Open <b>Portfolio</b>: units, share of project, projected income.</li><li>Come back here and <b>fast-forward a quarter</b> to see a distribution land.</li></ol>' +
      '<div class="row" style="margin-top:12px"><span>Signed in as</span><b style="font-family:Inter">' + (u ? esc(u.email) : 'nobody') + '</b></div><div class="row"><span>Commitments</span><b>' + paid + ' paid · ' + pend + ' pending</b></div>' +
      '<button class="sb-btn blue" id="sbQuarter"' + (u ? '' : ' disabled') + '>Fast-forward a quarter: fund my projects &amp; pay a distribution</button>' +
      '<button class="sb-btn ghost" id="sbPayAll"' + (pend ? '' : ' disabled') + '>Mark pending commitments as paid</button>' +
      '<button class="sb-btn red" id="sbReset">Reset the sandbox</button>' +
      '<div class="sb-note">Nothing here touches a real database, a real card, or ClearSky. Every number about money was computed by the real SkyFund engine at build time for these four projects; the app only multiplies by your units.</div>');
    s.querySelector('#sbQuarter').onclick = function () { var n = simulateQuarter(); closeSheet(); if (!n) { toast('Confirm an investment first, then fast-forward.'); return; } location.hash = '#/portfolio'; setTimeout(function () { location.reload(); }, 50); };
    s.querySelector('#sbPayAll').onclick = function () { var n = simulatePayPending(); closeSheet(); toast(n + ' commitment' + (n === 1 ? '' : 's') + ' marked paid.'); location.hash = '#/portfolio'; setTimeout(function () { location.reload(); }, 50); };
    s.querySelector('#sbReset').onclick = function () { if (!confirm('Reset the sandbox? Sign-in, commitments and distributions on this device are cleared.')) return; reset(); location.hash = '#/'; location.reload(); };
  }

  function route() {
    var h = location.hash || '';
    var m = /^#\/sandbox-checkout\/([^\/?]+)/.exec(h); if (m) { checkout(m[1]); return; }
    if (h === '#sandbox' || h === '#/sandbox') { history.replaceState({}, '', location.pathname + '#/account'); controls(); }
  }
  function install() {
    var style = el('style'); style.textContent = CSS; document.head.appendChild(style);
    var strip = el('div', 'sb-strip', '<b>Sandbox</b><span>Nothing is real · progress stays on this phone</span><button type="button">Controls</button>');
    strip.querySelector('button').onclick = controls;
    var top = $('header.top'); if (top && top.parentNode) top.parentNode.insertBefore(strip, top.nextSibling); else document.body.insertBefore(strip, document.body.firstChild);
    var link = document.getElementById('sponsorLink'); if (link) { link.textContent = 'Sandbox controls'; link.setAttribute('href', '#sandbox'); }
    document.addEventListener('click', function (ev) { var a = ev.target.closest && ev.target.closest('a[href="#sandbox"]'); if (a) { ev.preventDefault(); controls(); } }, true);
    global.addEventListener('hashchange', route);
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
}(typeof window !== 'undefined' ? window : this));
