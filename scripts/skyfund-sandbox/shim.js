/* ═══════════════════════════════════════════════════════════════════════════════
   scripts/skyfund-sandbox/shim.js — SkyFund on a phone with nothing behind it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The storefront (portals/skyfund/index.html) talks to three things: the
   Firebase compat SDK (auth + Firestore), POST /api/invest, and Stripe
   Checkout by redirect. This file stands in for all three so the REAL page,
   unmodified in its logic, runs from a static link with state on the device.
   scripts/build-skyfund-sandbox.js prepends the per-unit projection tables
   and drops the result next to the page as sandbox.js.

   It stands in for BOTH pages: the storefront and the sponsor console next
   to it (sponsor.html), which is how a partner lists a site and how ClearSky
   reviews, launches and pays it. Who you are is your email domain, the same
   rule the real console mirrors: @csebuilders.com is ClearSky, anything else
   is a sponsor for that domain.

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
  var DRAFT = global.SKYFUND_DRAFT || null;
  /* Mirrors STAFF in sponsor.html and the domain arm of isPlatformAdmin(). */
  var STAFF_DOMAINS = ['csebuilders.com', 'clearsky-usa.com'];
  var RULES = { minInvestment: 100, maxInvestment: 250000, nonAccreditedAnnualCap: 2500, accreditedRequiredAbove: 25000, allowedCountries: ['US'] };
  /* Same menu the page and api/invest.js accept: an off-menu share is none. */
  var GIVE_PCTS = [0, 5, 10, 25], PROGRAMS = ['energy-relief', 'stem-trades', 'resilience', 'habitat'];
  function giveBackOf(g) { g = g || {}; var pct = Number(g.pct) || 0; if (GIVE_PCTS.indexOf(pct) < 0) pct = 0; var pr = PROGRAMS.indexOf(g.program) >= 0 ? g.program : PROGRAMS[0]; return { pct: pct, program: pct ? pr : null }; }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function now() { return new Date().toISOString(); }
  function id(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function usd(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function orgOf(email) { var d = String(email || '').toLowerCase().split('@')[1] || ''; return d === 'fenecon.de' || d === 'fenecon.us' ? 'fenecon.com' : d; }
  function isStaff(u) { return !!u && STAFF_DOMAINS.indexOf(orgOf(u.email)) >= 0; }
  function canAct(u, org) { return isStaff(u) || (!!u && orgOf(u.email) === String(org || '')); }

  /* ── the store: one JSON blob on the device ────────────────────────────── */
  var store = null;
  function seed() {
    var docs = {};
    SAMPLES.forEach(function (s) {
      var c = clone(s); delete c.sample; c.slug = c.id; c.launchedAt = now(); c.updatedAt = now();
      docs['cf_campaigns/' + c.id] = c;
      docs['cf_campaigns/' + c.id + '/updates/u1'] = { title: 'Campaign is live', body: 'Thanks for looking. Questions go to the sponsor through the platform; every investor is emailed when there is news.', author: c.sponsorName, createdAt: now(), createdAtMs: Date.now() - 86400000 * 3 };
    });
    if (DRAFT) {
      var d = clone(DRAFT); delete d.sample; d.slug = d.id; d.createdAt = now(); d.updatedAt = now();
      docs['cf_campaigns/' + d.id] = d;
    }
    docs['cf_settings/rules'] = clone(RULES);
    docs['cf_settings/impact'] = { givenToCommunity: 41250, investorsGiving: 388, programs: 4, sample: true };
    return { docs: docs, users: {}, files: {}, session: null, createdAt: now() };
  }
  function load() {
    try { var raw = global.localStorage && global.localStorage.getItem(KEY); var s = raw ? JSON.parse(raw) : null; if (s && !s.files) s.files = {}; return s; } catch (e) { return null; }
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

  /* ── a Storage look-alike: the file becomes a data URL on the device ─────
     The sponsor console uploads cover images. Nothing leaves the phone; the
     URL it hands back is the image itself, which the campaign page renders
     the same way it renders a real download URL. */
  function storageRef(path) {
    var self = {
      _url: null,
      put: function (file) {
        return new Promise(function (res, rej) {
          if (file && file.size > 1500000) { rej(new Error('The sandbox keeps images on the device, so it caps them at 1.5 MB. Pick a smaller one.')); return; }
          var r = new global.FileReader();
          r.onload = function () { self._url = r.result; store.files[path] = r.result; save(); res({ ref: self }); };
          r.onerror = function () { rej(new Error('could not read that file')); };
          r.readAsDataURL(file);
        });
      },
      getDownloadURL: function () { return Promise.resolve(self._url || store.files[path] || ''); }
    };
    return self;
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
    /* No real popup. On the sponsor console the person is a partner or
       ClearSky, so the stand-in identity matches the page they are on. */
    signInWithPopup: function () {
      return /sponsor/.test(String(global.location && global.location.pathname))
        ? signInAs('demo@csebuilders.com', 'ClearSky Demo')
        : signInAs('demo.investor@gmail.com', 'Demo Investor');
    },
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
    firestore: function () { return { collection: collRef, doc: docRef }; },
    storage: function () { return { ref: storageRef }; }
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
  /* One payout row per holder, paid. The rail is simulated to the same shape
     the portfolio reads: cf_payouts is what turns "declared" into "received". */
  function payoutsFor(distributionId, d) {
    var n = 0;
    Object.keys(store.docs).forEach(function (k) {
      if (k.indexOf('cf_pledges/') !== 0) return;
      var p = store.docs[k];
      if (p.campaignId !== d.campaignId || p.status !== 'paid') return;
      var amount = (Number(d.perUnit) || 0) * (Number(p.units) || 0);
      store.docs['cf_payouts/' + id('po')] = { distributionId: distributionId, campaignId: d.campaignId, campaignTitle: d.campaignTitle,
        investorUid: p.investorUid, investorEmail: p.investorEmail, units: p.units, perUnit: d.perUnit, amount: amount,
        giveBackPct: p.giveBackPct || 0, giveBackProgram: p.giveBackProgram || null,
        status: 'paid', paidAt: now(), createdAt: now(), createdAtMs: Date.now() };
      n++;
    });
    d.status = 'paid'; d.payoutTotal = (Number(d.perUnit) || 0) * (Number(d.unitsSold) || 0); d.updatedAt = now();
    return n;
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
    if (body.action === 'allocationRequest') {
      var nm = String(body.name || '').trim(), em = String(body.email || '').trim().toLowerCase();
      if (!nm || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) err(400, 'Your name and a working email are needed.');
      var aid = id('al');
      store.docs['cf_allocation_requests/' + aid] = { name: nm, email: em, org: String(body.org || '').trim(), type: String(body.type || 'other'), size: String(body.size || ''), note: String(body.note || '').slice(0, 2000), investorUid: u ? u.uid : null, status: 'new', createdAt: now(), createdAtMs: Date.now() };
      save(); return { ok: true, id: aid };
    }
    if (!u) err(401, 'missing bearer token');
    if (body.action === 'bankLinkToken' || body.action === 'bankLink' || body.action === 'bankRemove') err(400, 'Bank linking is not part of the phone sandbox; the simulated checkout stands in for every rail.');
    if (body.action === 'pledge') {
      var cc = campaign(body.campaignId); if (!cc) err(404, 'campaign not found');
      if (cc.status !== 'live') err(409, 'this campaign is not accepting investment');
      var at = body.attest || {}, gb = giveBackOf(body.giveBack);
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
        perkId: perk ? perk.id : null, perkTitle: perk ? perk.title : null, giveBackPct: gb.pct, giveBackProgram: gb.program, status: 'pending', paymentProvider: 'sandbox', createdAt: now(), createdAtMs: Date.now() };
      var pp = store.docs['cf_investors/' + u.uid] || { uid: u.uid, email: u.email, status: 'active', kyc: 'none', accreditedVerified: false, createdAt: now() };
      pp.name = at.name || pp.name || u.displayName; pp.country = merged.country; pp.accredited = merged.accredited; pp.giveBack = { pct: gb.pct, program: gb.program }; store.docs['cf_investors/' + u.uid] = pp; save();
      return { pledgeId: pid, url: '#/sandbox-checkout/' + pid, amount: amount, units: units };
    }
    /* ── the sponsor console's actions ─────────────────────────────────────
       Same refusals as api/invest.js, same shapes back. The one thing the
       sandbox cannot do is PRICE a campaign: yield, IRR, multiple and
       payback come from api/_lib/invest-math.js, which runs on the platform
       and is deliberately not in this file. The five sample projects carry
       tables the engine computed at build time, so launching one of those is
       real; launching a campaign invented on the phone says so plainly. */
    function needCampaign(cid) { var c = campaign(cid); if (!c) err(404, 'campaign not found'); return c; }
    function validateTerms(c) {
      var out = [];
      if (!c.title || String(c.title).trim().length < 4) out.push('Title is required.');
      if (['compute', 'microgrid', 'bess', 'solar', 'ev'].indexOf(c.type) < 0) out.push('Project type is required.');
      if (!(Number(c.goal) >= 1000)) out.push('Goal must be at least $1,000.');
      if (!(Number(c.unitPrice) >= 1)) out.push('Unit price must be at least $1.');
      if (!(Number((c.offer || {}).sharePct) > 0)) out.push('Share offered to investors must be above 0%.');
      if (!(Number((c.offer || {}).distributableAnnual) > 0)) out.push('Projected annual distributable cash must be above $0.');
      if (['ppa', 'compute', 'hybrid'].indexOf((c.offer || {}).kind) < 0) out.push('Offer kind must be ppa, compute or hybrid.');
      if (!c.deadline || isNaN(new Date(c.deadline).getTime())) out.push('A funding deadline is required.');
      else if (new Date(c.deadline).getTime() < Date.now() + 86400000) out.push('The deadline must be at least a day away.');
      if (Number(c.minRaise) > Number(c.goal)) out.push('Minimum raise cannot exceed the goal.');
      return out;
    }
    if (body.action === 'submit') {
      var sc = needCampaign(body.campaignId);
      if (!canAct(u, sc.sponsorOrgId)) err(403, 'not your campaign');
      if (sc.status !== 'draft') err(409, 'campaign is ' + sc.status);
      var sp = validateTerms(sc); if (sp.length) err(400, sp.join(' '));
      sc.status = 'review'; sc.submittedAt = now(); sc.submittedBy = u.email; sc.reviewNote = null; sc.updatedAt = now();
      save(); return { ok: true, status: 'review' };
    }
    if (['review', 'close', 'distribute', 'payout', 'payoutMark', 'confirm', 'refund', 'investor', 'settings'].indexOf(body.action) >= 0 && !isStaff(u))
      err(403, 'admin only — sign in with a @csebuilders.com address to act as ClearSky');
    if (body.action === 'review') {
      var rc = needCampaign(body.campaignId);
      if (body.decision === 'return') {
        if (['review', 'draft'].indexOf(rc.status) < 0) err(409, 'campaign is ' + rc.status);
        rc.status = 'draft'; rc.reviewNote = body.note || 'Returned for changes.'; rc.reviewedBy = u.email; rc.updatedAt = now();
        save(); return { ok: true, status: 'draft' };
      }
      if (body.decision !== 'launch') err(400, 'decision must be launch|return');
      if (['review', 'draft'].indexOf(rc.status) < 0) err(409, 'campaign is ' + rc.status);
      var rp = validateTerms(rc); if (rp.length) err(400, rp.join(' '));
      var tbl = PROJ[rc.id];
      if (!tbl) err(400, 'This offline sandbox cannot price a new offering. Yield, IRR, multiple and payback come from the SkyFund returns engine, which runs on the platform, and only the sample projects carry figures it computed at build time. Everything up to here — the listing, the terms, the review — is exactly what the real console does.');
      rc.status = 'live';
      rc.headline = { unitPrice: tbl.unitPrice, unitsTotal: tbl.unitsTotal, targetYieldPct: tbl.yieldPct, irrPct: tbl.irrPct, moic: tbl.moic, termYears: tbl.termYears, sharePct: tbl.sharePct, kind: tbl.kind, paybackYear: tbl.paybackYear };
      rc.launchedAt = now(); rc.reviewedBy = u.email; rc.reviewNote = body.note || null; rc.updatedAt = now();
      save(); return { ok: true, status: 'live', headline: rc.headline, unitsTotal: tbl.unitsTotal };
    }
    if (body.action === 'close') {
      var cc2 = needCampaign(body.campaignId);
      if (cc2.status !== 'live') err(409, 'campaign is ' + cc2.status);
      if (body.outcome === 'funded') { cc2.status = 'funded'; cc2.fundedAt = now(); cc2.closedBy = u.email; cc2.updatedAt = now(); save(); return { ok: true, status: 'funded' }; }
      if (body.outcome !== 'failed') err(400, 'outcome must be funded|failed');
      var refunded = 0;
      Object.keys(store.docs).forEach(function (k) {
        if (k.indexOf('cf_pledges/') !== 0) return;
        var p = store.docs[k]; if (p.campaignId !== cc2.id) return;
        if (p.status === 'pending') { markCancelled(k.split('/')[1]); return; }
        if (p.status !== 'paid') return;
        p.status = 'refunded'; p.refundedAt = now();
        cc2.raised = Math.max(0, (Number(cc2.raised) || 0) - p.amount);
        cc2.unitsSold = Math.max(0, (Number(cc2.unitsSold) || 0) - p.units);
        cc2.backers = Math.max(0, (Number(cc2.backers) || 0) - 1);
        refunded++;
      });
      cc2.status = 'closed'; cc2.outcome = 'failed'; cc2.closedAt = now(); cc2.closedBy = u.email; cc2.closeNote = body.note || null; cc2.updatedAt = now();
      save(); return { ok: true, status: 'closed', refunds: refunded };
    }
    if (body.action === 'distribute') {
      var dc = needCampaign(body.campaignId);
      if (dc.status !== 'funded') err(409, 'distributions are declared on funded campaigns only');
      var unitsSold = Number(dc.unitsSold) || 0; if (unitsSold < 1) err(409, 'no units are held');
      var distributable = Number(body.distributable); if (!(distributable > 0)) err(400, 'distributable must be above 0');
      if (!body.period) err(400, 'period is required (e.g. 2027-Q1)');
      var sharePct = Number((dc.offer || {}).sharePct) || 0;
      var pool = distributable * sharePct / 100, per = pool / unitsSold, did = id('d');
      store.docs['cf_distributions/' + did] = { campaignId: dc.id, campaignTitle: dc.title, sponsorOrgId: dc.sponsorOrgId, period: String(body.period),
        grossRevenue: Number(body.grossRevenue) || null, distributable: distributable, sharePct: sharePct, crowdPool: pool, unitsSold: unitsSold, perUnit: per,
        note: body.note || null, status: 'declared', declaredBy: u.email, createdAt: now(), createdAtMs: Date.now() };
      dc.distributions = (dc.distributions || 0) + 1; dc.distributedTotal = (dc.distributedTotal || 0) + pool; dc.updatedAt = now();
      save(); return { ok: true, id: did, crowdPool: pool, perUnit: per };
    }
    if (body.action === 'payout') {
      var dd = store.docs['cf_distributions/' + body.distributionId]; if (!dd) err(404, 'distribution not found');
      if (dd.status === 'paid') return { ok: true, already: true };
      var n = payoutsFor(body.distributionId, dd);
      save(); return { ok: true, paid: n, unbanked: 0 };
    }
    if (body.action === 'payoutMark') {
      var po = store.docs['cf_payouts/' + body.payoutId]; if (!po) err(404, 'payout not found');
      po.status = 'paid'; po.paidAt = now(); save(); return { ok: true };
    }
    if (body.action === 'confirm') {
      var cp2 = store.docs['cf_pledges/' + body.pledgeId]; if (!cp2) err(404, 'pledge not found');
      if (cp2.status === 'paid') return { ok: true, already: true };
      markPaid(body.pledgeId, { provider: 'manual', reference: body.reference || null, confirmedBy: u.email });
      return { ok: true, already: false };
    }
    if (body.action === 'refund') {
      var rr = store.docs['cf_pledges/' + body.pledgeId]; if (!rr) err(404, 'pledge not found');
      if (rr.status !== 'paid') err(409, 'pledge is ' + rr.status);
      var rcamp = campaign(rr.campaignId);
      rr.status = 'refunded'; rr.refundedAt = now(); rr.refundReason = body.reason || null;
      if (rcamp) { rcamp.raised = Math.max(0, (Number(rcamp.raised) || 0) - rr.amount); rcamp.unitsSold = Math.max(0, (Number(rcamp.unitsSold) || 0) - rr.units); rcamp.backers = Math.max(0, (Number(rcamp.backers) || 0) - 1); }
      save(); return { ok: true };
    }
    if (body.action === 'investor') {
      var iv = store.docs['cf_investors/' + body.uid]; if (!iv) err(404, 'investor not found');
      if (body.kyc) iv.kyc = String(body.kyc);
      if (body.accreditedVerified !== undefined) iv.accreditedVerified = body.accreditedVerified === true;
      if (body.status) iv.status = String(body.status);
      iv.updatedAt = now(); save(); return { ok: true };
    }
    if (body.action === 'settings') {
      var rl = store.docs['cf_settings/rules'] || {};
      ['minInvestment', 'maxInvestment', 'nonAccreditedAnnualCap', 'accreditedRequiredAbove'].forEach(function (k) {
        var v = (body.rules || {})[k]; if (v === undefined || v === null || v === '') return;
        var nn = Number(v); if (!isFinite(nn) || nn < 0) err(400, k + ' must be a non-negative number'); rl[k] = nn;
      });
      if ((body.rules || {}).allowedCountries !== undefined) {
        var list = body.rules.allowedCountries; if (!Array.isArray(list)) list = String(list).split(/[,\s]+/);
        rl.allowedCountries = list.map(function (x) { return String(x).trim().toUpperCase(); }).filter(function (x) { return /^[A-Z]{2}$/.test(x); });
      }
      store.docs['cf_settings/rules'] = rl; save(); return { ok: true, rules: clone(rl) };
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
      var dk = id('d');
      store.docs['cf_distributions/' + dk] = { campaignId: cid, campaignTitle: c.title, sponsorOrgId: c.sponsorOrgId, period: quarter, grossRevenue: Math.round(distributable * 1.35), distributable: distributable, sharePct: t.sharePct, crowdPool: pool, unitsSold: c.unitsSold, perUnit: perUnit, status: 'paid', createdAt: now(), createdAtMs: Date.now() };
      store.docs['cf_campaigns/' + cid + '/updates/' + id('u')] = { title: quarter + ' distribution paid', body: 'The sponsor reported ' + usd(distributable) + ' of distributable cash for the quarter. The crowd pool is ' + usd(pool) + ', ' + '$' + perUnit.toFixed(2) + ' per unit.', author: 'ClearSky', createdAt: now(), createdAtMs: Date.now() };
      c.distributions = (c.distributions || 0) + 1; c.distributedTotal = (c.distributedTotal || 0) + pool;
      /* The one-tap investor demo pays as well as declares, so "distributions
         received" moves. A distribution declared from the sponsor console
         stays 'declared' until staff press Pay out, the way the real one does. */
      payoutsFor(dk, store.docs['cf_distributions/' + dk]); n++;
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

  function onSponsor() { return /sponsor/.test(String(global.location && global.location.pathname)); }
  function sponsorControls() {
    var u = currentUser(), org = u ? orgOf(u.email) : '';
    var d = DRAFT ? store.docs['cf_campaigns/' + DRAFT.id] : null;
    var s = openSheet('<div class="sb-head"><i></i>Sandbox controls<span>sponsor console</span></div>' +
      '<h2>Who you are is your email</h2><p class="sub">No password is checked. The domain decides what you can do — the same rule the real console uses.</p>' +
      '<div class="row"><span>Signed in as</span><b style="font-family:Inter">' + (u ? esc(u.email) : 'nobody') + '</b></div>' +
      '<div class="row"><span>Acting as</span><b style="font-family:Inter">' + (u ? (isStaff(u) ? 'ClearSky (admin)' : esc(org) + ' (sponsor)') : '—') + '</b></div>' +
      '<ol class="sb-list"><li><b>anything@northgatecompute.com</b> — the partner with a site to list. Their draft, <i>' + esc(d ? d.title : 'the fifth listing') + '</i>, is waiting: open it, edit the story, then <b>Submit for review</b>.</li>' +
      '<li><b>anything@csebuilders.com</b> — ClearSky. The <b>Review queue</b> holds what partners submitted; <b>Launch</b> puts it in front of investors, and it appears on the storefront.</li>' +
      '<li>Once a campaign is <b>funded</b>, declare a distribution and <b>Pay out</b> — the money then shows as received in the investor\'s portfolio.</li></ol>' +
      '<button class="sb-btn ghost" id="sbAsSponsor">Sign in as the partner</button>' +
      '<button class="sb-btn blue" id="sbAsStaff">Sign in as ClearSky</button>' +
      '<button class="sb-btn ghost" id="sbStore">Open the investor storefront</button>' +
      '<div class="sb-note">The one thing this offline copy will not do is PRICE a campaign you invent here: yield, IRR, multiple and payback come from the returns engine on the platform, and only the five sample projects carry figures it computed. Everything else — listing, review, launch, distributions — is the real flow.</div>');
    s.querySelector('#sbAsSponsor').onclick = function () { signInAs((DRAFT ? 'partner@' + DRAFT.sponsorOrgId : 'partner@northgatecompute.com'), 'Northgate Partner').then(function () { location.reload(); }); };
    s.querySelector('#sbAsStaff').onclick = function () { signInAs('demo@csebuilders.com', 'ClearSky Demo').then(function () { location.reload(); }); };
    s.querySelector('#sbStore').onclick = function () { location.href = 'index.html'; };
  }
  function controls() {
    if (onSponsor()) return sponsorControls();
    var u = currentUser();
    var pend = 0, paid = 0; Object.keys(store.docs).forEach(function (k) { if (k.indexOf('cf_pledges/') !== 0) return; var st = store.docs[k].status; if (st === 'pending') pend++; if (st === 'paid') paid++; });
    var s = openSheet('<div class="sb-head"><i></i>Sandbox controls<span>state lives on this device</span></div>' +
      '<h2>What to try</h2><ol class="sb-list"><li>Browse projects, open one, move the slider — the projection updates.</li><li>Tap <b>Invest</b>, sign in with any email (no password check), confirm, pay with the test card.</li><li>Open <b>Portfolio</b>: units, share of project, projected income.</li><li>Come back here and <b>fast-forward a quarter</b> to see a distribution paid into your portfolio.</li><li>On the confirm screen pick a <b>give-back</b> share — the portfolio then shows what each distribution sends to the community.</li><li>The front page ends with the <b>family office &amp; institutions</b> card; the request form works too.</li></ol>' +
      '<div class="row" style="margin-top:12px"><span>Signed in as</span><b style="font-family:Inter">' + (u ? esc(u.email) : 'nobody') + '</b></div><div class="row"><span>Commitments</span><b>' + paid + ' paid · ' + pend + ' pending</b></div>' +
      '<button class="sb-btn blue" id="sbQuarter"' + (u ? '' : ' disabled') + '>Fast-forward a quarter: fund my projects &amp; pay a distribution</button>' +
      '<button class="sb-btn ghost" id="sbPayAll"' + (pend ? '' : ' disabled') + '>Mark pending commitments as paid</button>' +
      '<button class="sb-btn ghost" id="sbSponsor">Open the sponsor console (the partner\'s side)</button>' +
      '<button class="sb-btn red" id="sbReset">Reset the sandbox</button>' +
      '<div class="sb-note">Nothing here touches a real database, a real card, or ClearSky. Every number about money was computed by the real SkyFund engine at build time for these four projects; the app only multiplies by your units.</div>');
    s.querySelector('#sbQuarter').onclick = function () { var n = simulateQuarter(); closeSheet(); if (!n) { toast('Confirm an investment first, then fast-forward.'); return; } location.hash = '#/portfolio'; setTimeout(function () { location.reload(); }, 50); };
    s.querySelector('#sbPayAll').onclick = function () { var n = simulatePayPending(); closeSheet(); toast(n + ' commitment' + (n === 1 ? '' : 's') + ' marked paid.'); location.hash = '#/portfolio'; setTimeout(function () { location.reload(); }, 50); };
    s.querySelector('#sbSponsor').onclick = function () { location.href = 'sponsor.html'; };
    s.querySelector('#sbReset').onclick = function () { if (!confirm('Reset the sandbox? Sign-in, commitments and distributions on this device are cleared.')) return; reset(); location.hash = '#/'; location.reload(); };
  }

  function route() {
    var h = location.hash || '';
    var m = /^#\/sandbox-checkout\/([^\/?]+)/.exec(h); if (m) { checkout(m[1]); return; }
    if (h === '#sandbox' || h === '#/sandbox') { history.replaceState({}, '', location.pathname + '#/account'); controls(); }
  }
  function install() {
    var style = el('style'); style.textContent = CSS; document.head.appendChild(style);
    var strip = el('div', 'sb-strip', '<b>Sandbox</b><span>' + (onSponsor() ? 'Nothing is real · you are whoever your email domain says' : 'Nothing is real · progress stays on this phone') + '</span><button type="button">Controls</button>');
    strip.querySelector('button').onclick = controls;
    var top = $('header.top'); if (top && top.parentNode) top.parentNode.insertBefore(strip, top.nextSibling); else document.body.insertBefore(strip, document.body.firstChild);
    document.addEventListener('click', function (ev) { var a = ev.target.closest && ev.target.closest('a[href="#sandbox"]'); if (a) { ev.preventDefault(); controls(); } }, true);
    global.addEventListener('hashchange', route);
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
}(typeof window !== 'undefined' ? window : this));
