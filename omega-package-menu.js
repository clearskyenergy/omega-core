/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The one module menu, "The Ladder" (Phase 5, 10B; the words of 2026-09-27:
 * Opt in, Opt in and pay, Turn it on, Opt out, Cancel request). Server
 * catalog, server quotes and server-formatted prices only. Every change is a
 * POST to /api/plan-change, and every step shows what it does to the bill
 * before anything is written. The browser never prices anything and never
 * grants access — the tools appear when the server's projection says so.
 * A plan billed outside the engine opts in by card where the server says its
 * plan can switch the module on exactly (an add-on on its own QuickBooks
 * invoice, on when paid, stopped at the end of the month paid for:
 * api/_lib/addons.js), and by recorded request everywhere else.
 */
(function (global) {
  'use strict';
  var dialog, body, statusLine, introLine, trigger, keydown, request = 0, control = { canManage: false, pending: {}, loaded: false };
  /* Where the menu is open outside the editor (the workspace, the dashboard's
     Account panel, a locked tile), the page hands over its own package view,
     a callback and how to open; inside the editor OmegaCaps is the view and
     the refresh. */
  var host = { view: null, onChanged: null, legacy: null, single: false, admin: undefined, company: null, orgId: null, key: null, options: null };
  /* opened with an intent ('add' | 'remove' | 'cancel'): the card for that
     module goes straight to that step's confirm panel, once. The first
     loaded render of that card spends it whether or not the card is in the
     state the intent names (an Opt out opened on a module already opting
     out): an intent left armed would fire the opposite step, unasked, the
     moment a Cancel request redraws the card. */
  var intent = null;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* an add-on on a plan billed outside the engine bills on the workspace's
     rail (api/_lib/addons.js rail(): QuickBooks, or Stripe under
     PACKAGING_PROVIDER=stripe); the server names it (payWith) on every quote,
     purchase and pending record, so this is only the word before an answer */
  var ADDON_RAIL = 'QuickBooks';
  function packageView() { return host.view || (global.OmegaCaps && global.OmegaCaps.packageAccess()); }
  function api(path, payload) {
    var user = global.firebase && global.firebase.auth().currentUser;
    if (!user || !user.getIdToken || !global.fetch) return Promise.reject(new Error('Sign in to continue'));
    return user.getIdToken().then(function (token) {
      var opts = { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } };
      if (payload) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(payload); }
      return global.fetch(path, opts);
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request refused'); if (global.firebase.auth().currentUser !== user) throw new Error('Account changed'); return j; }); });
  }
  /* a fresh object from several (ES5: no Object.assign on the kiosk browsers) */
  function extend() { var out = {}; for (var i = 0; i < arguments.length; i++) { var src = arguments[i]; if (src) for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k]; } return out; }
  function node(tag, text, cls) { var el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; }
  function link(href, text) { var a = node('a', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }
  function button(text, fn, cls) { var b = node('button', text, cls); b.type = 'button'; b.onclick = fn; return b; }
  function row(el, buttons) { var r = node('div', '', 'opm-row'); buttons.forEach(function (b) { if (b) r.appendChild(b); }); el.appendChild(r); return r; }
  /* "Logic Office, Logic Plant and Logic Purchasing" */
  function names(list) { list = list || []; return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }
  /* "$1,299" out of "$1,299/month": the sentence already says monthly */
  function fee(display) { return String(display || '').replace(/\/month$/, ''); }
  function when(value) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '')); return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : String(value || ''); }
  /* the pay link's words follow the rail the invoice is on (billing-driver
     payWith: Stripe or QuickBooks), never a name kept here */
  function payWords(payWith) { return payWith ? 'Pay in ' + payWith : 'Pay the invoice'; }
  function open_(map, key) { var e = map && map[key]; return !!e && e.status === 'requested'; }
  function byKey(state, key) { var rows = state.catalog || lastRows || []; for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i]; return null; }
  function nameOf(state, key) { var m = byKey(state, key); return m ? m.name : key; }
  /* the dialog's company only while the dialog is open: a control on a page
     (addOnControl) never names the last workspace the dialog showed */
  function company(state) { return (state.legacy && state.legacy.company) || state.company || (dialog && host.company) || 'your workspace'; }
  function canChange(state) { return state.admin === false ? false : state.admin === true ? true : !!state.canManage; }
  function withOrg(state, payload) { if (state.orgId) payload.orgId = state.orgId; return payload; }
  /* ── ADD-ONS ON A PLAN BILLED OUTSIDE THE ENGINE ──────────────────────
     What the plan bought by card (api/_lib/addons.js): the summary's view
     (legacy.addOns, from GET /api/plan-change) or the billing record's own
     block (legacy.billing.addOns). Both carry live[], accessUntil,
     pending[] (each { id, purpose 'purchase'|'renewal', add, names,
     display, paymentLink, expiresOn, payWith }) and the ones opted out of,
     `ending` (the record's map by key, or the view's list). */
  function addOnsOf(state) { var l = state.legacy; return (l && (l.addOns || (l.billing && l.billing.addOns))) || null; }
  function addOnLive(ao, key) { return !!ao && Array.isArray(ao.live) && ao.live.indexOf(key) >= 0 && (typeof ao.accessUntil !== 'number' || Date.now() < ao.accessUntil); }
  function addOnPending(ao, key, purpose) {
    var list = (ao && ao.pending) || [];
    for (var i = 0; i < list.length; i++) if ((list[i].purpose || 'purchase') === purpose && (list[i].add || []).indexOf(key) >= 0) return list[i];
    return null;
  }
  function addOnEnding(ao, key) {
    var e = ao && ao.ending; if (!e) return null;
    if (Array.isArray(e)) { for (var i = 0; i < e.length; i++) if (e[i] && e[i].key === key) return e[i]; return null; }
    return e[key] && e[key].status === 'requested' ? e[key] : null;
  }
  function copyAddOns(a) {
    if (!a) return null;
    return extend({}, a, { live: (a.live || []).slice(), pending: (a.pending || []).slice(), ending: Array.isArray(a.ending) ? a.ending.slice() : extend({}, a.ending || {}) });
  }
  /* Where a module stands for this workspace: one answer per card, and the
     card's badge, price line and one control all follow it. */
  function standing(m, state) {
    if (m.key === 'lite') return 'lite';
    if (state.legacy) {
      /* what was bought by card first (waiting, renewing, opting out, on),
         then what the plan holds and the requests on it: the precedence of
         OmegaWorkspaceHub.moduleCard, so the menu, the Modules page and Plan
         & billing tell one story. Only activation closes a legacy request,
         so one stays open after ClearSky acts on it through the tier or an
         add-on: an opt-out counts only while the module is held (or partly),
         an opt-in only while it is not held. Nothing known about the plan
         (no states, no owned list): the record is all there is. */
      var bl = state.legacy.billing || {}, st = (state.legacy.states || {})[m.key], ao = addOnsOf(state);
      if (!st && (state.owned || Array.isArray(state.ownedModules))) st = state.owned || state.ownedModules.indexOf(m.key) >= 0 ? 'held' : 'ask';
      if (addOnPending(ao, m.key, 'purchase')) return 'addon-waiting';
      if (addOnLive(ao, m.key) && addOnPending(ao, m.key, 'renewal')) return 'addon-renewal';
      if (addOnLive(ao, m.key) && addOnEnding(ao, m.key)) return 'addon-leaving';
      if (open_(bl.optOuts, m.key) && (!st || st === 'held' || st === 'part')) return 'opting-out';
      if (addOnLive(ao, m.key)) return 'addon-on';
      if (open_(bl.optIns, m.key) && st !== 'held') return 'requested';
      return st === 'held' ? 'on' : st === 'part' ? 'part' : 'off';
    }
    var sum = state.summary || {}, on = !!state.owned || (sum.modules || []).indexOf(m.key) >= 0, bought = (sum.subscription || []).indexOf(m.key) >= 0;
    if (state.pending && state.pending[m.key]) return 'waiting';
    if ((sum.removalRequests || []).some(function (r) { return r.module === m.key; })) return 'removing';
    if (bought && !on) return 'bought';
    return on || bought ? 'on' : 'off';
  }
  var BADGE = { lite: '● On your plan', on: '● On your plan', 'addon-on': '● On your plan', removing: 'Opting out', 'opting-out': 'Opting out', 'addon-leaving': 'Opting out',
    waiting: 'Waiting for payment', 'addon-waiting': 'Waiting for payment', 'addon-renewal': 'Waiting for payment', bought: 'Bought · not on yet', requested: 'Opt-in requested', part: 'Partly included' };
  var HELD = { lite: 1, on: 1, removing: 1, 'opting-out': 1, bought: 1, 'addon-on': 1, 'addon-leaving': 1, 'addon-renewal': 1 };
  /* a module somebody already asked for or is paying for: an Opt in would not add it again */
  var ASKED = { requested: 1, waiting: 1, 'addon-waiting': 1 };
  function cardOf(el) { var card = el; while (card && !(card.className && /(^| )opm-card( |$)/.test(card.className))) card = card.parentNode; return card && card.querySelector ? card : null; }
  /* the card's own "Also adds …" line speaks while the card is at rest; an
     Opt in confirm panel states the server's own line in its place */
  function needsLine(el, show) { var card = cardOf(el), line = card && card.querySelector('.opm-needs'); if (line) line.hidden = !show; }
  /* the card around a control follows the control's answer, so the badge and
     the price line never disagree with the button under them */
  function paintCard(el, st) {
    var card = cardOf(el);
    if (!card) return;
    var badge = card.querySelector('.opm-badge'), price = card.querySelector('.opm-price');
    if (badge) { badge.textContent = BADGE[st] || ''; badge.hidden = !BADGE[st]; badge.className = 'opm-badge' + (st === 'on' || st === 'lite' || st === 'addon-on' ? ' on' : ''); }
    if (price) price.textContent = HELD[st] ? 'In your plan' : card.getAttribute('data-price') || (card.getAttribute('data-loading') ? '' : 'Pricing unavailable');
    card.setAttribute('data-state', st);
  }
  /* One control, every place that sells a module: the Ladder, Your plan in
     the account pages and the staff record. state: { canManage, admin,
     pending: { moduleKey: pendingChange }, summary, owned, legacy, catalog,
     ownedModules, orgId, company, loading, onChanged(result) }. */
  function subscribeControl(el, m, state) {
    el.textContent = ''; el.className = 'opm-act'; el.setAttribute('data-subscribe', m.key);
    var st = standing(m, state); paintCard(el, st); needsLine(el, true);
    if (st === 'lite') { el.appendChild(node('p', (m.name || 'Omega Design') + ' is the baseline and is always included.', 'opm-note')); return; }
    if (state.loading) return;
    /* the intent is spent here, on the first loaded render of its card,
       whatever the card turns out to be (see `intent`) */
    var step = intent && intent.key === m.key ? intent.kind : null; if (step) intent = null;
    var admin = canChange(state);
    function again() { subscribeControl(el, m, state); }
    function failed(e, fallback) {
      el.textContent = ''; el.appendChild(node('p', e.message, 'opm-reason'));
      row(el, [button('Try again', again)]);
      /* a plan billed outside the engine can always ask by email; the line
         is there only when the request itself could not be recorded */
      if (state.legacy && state.legacy.email && fallback) {
        var line = node('p', 'Or email ', 'opm-note'), a = node('a', state.legacy.email);
        a.href = 'mailto:' + encodeURIComponent(state.legacy.email) + '?subject=' + encodeURIComponent(fallback + ' for ' + company(state)) + '&body=' + encodeURIComponent(company(state) + ': ' + fallback + '. Omega Design stays included.');
        line.appendChild(a); el.appendChild(line);
      }
    }
    function done(result, text) {
      el.textContent = ''; if (text) el.appendChild(node('p', text, 'opm-wait'));
      if (state.onChanged) state.onChanged(result);
    }
    function busy(text) { el.textContent = ''; el.appendChild(node('p', text, 'opm-note')); }
    /* ── what is in flight says so, to everyone who can read the plan ── */
    var sum = state.summary || {}, bl = (state.legacy && state.legacy.billing) || {}, p = state.pending && state.pending[m.key], ao = addOnsOf(state);
    var ap = st === 'addon-waiting' ? addOnPending(ao, m.key, 'purchase') : st === 'addon-renewal' ? addOnPending(ao, m.key, 'renewal') : null;
    /* a short bold line says where it stands; the note under it says what that means for the bill */
    function standingLine(text, note) { el.appendChild(node('p', text, 'opm-wait')); if (note) el.appendChild(node('p', note, 'opm-note')); }
    /* expiresOn is the billing date the change was priced up to: that day the
       renewal is issued and an unpaid change expires (a later payment only
       reaches ClearSky's review), so the last day to pay is the day BEFORE,
       as the server's own quote says: "pay before …" */
    if (st === 'waiting') {
      standingLine('Waiting for payment · ' + p.display + (p.expiresOn ? ' · pay before ' + when(p.expiresOn) : ''), 'It switches on when the payment clears.' + (p.expiresOn ? ' Unpaid, the request expires on ' + when(p.expiresOn) + '.' : ''));
      if (p.paymentLink) el.appendChild(link(p.paymentLink, payWords(p.payWith)));
    } else if (st === 'addon-waiting') {
      /* an add-on bought by card: its own QuickBooks invoice, on when paid */
      standingLine('Waiting for payment · ' + ap.display + (ap.expiresOn ? ' · pay before ' + when(ap.expiresOn) : ''),
        ap.opened ? 'The payment page opened in a new tab: pay by card there, or with the card saved there. It switches on the moment the payment clears.'
          : ap.payLinkMissing ? 'The invoice was emailed to your billing address: pay it there and it switches on the moment the payment clears.'
          : 'Pay by card on the secure payment page, or with the card saved there. It switches on the moment the payment clears.');
      if (ap.paymentLink) { var pa = link(ap.paymentLink, 'Pay ' + ap.display + ' in ' + (ap.payWith || (ao && ao.payWith) || ADDON_RAIL)); pa.className = 'opm-paylink'; el.appendChild(pa); }
    } else if (st === 'addon-renewal') {
      standingLine('Waiting for payment · ' + ap.display + ' renewal', 'Your add-ons renew each month on their own invoice. Pay it to keep them on; unpaid, they switch off after the grace period.');
      if (ap.paymentLink) { var pr = link(ap.paymentLink, 'Pay ' + ap.display + ' in ' + (ap.payWith || (ao && ao.payWith) || ADDON_RAIL)); pr.className = 'opm-paylink'; el.appendChild(pr); }
    } else if (st === 'removing') {
      standingLine('Opting out · ' + (sum.nextReviewOn ? 'review on ' + when(sum.nextReviewOn) : 'at the next quarterly review'), 'It stays on, and billed, until your review; no refund for time already billed.');
    } else if (st === 'addon-leaving') {
      var en = addOnEnding(ao, m.key), until = en.endsOn || (ao && ao.nextInvoiceOn);
      standingLine('Opting out · ' + (until ? 'on until ' + when(until) : 'at the end of the month paid for'), 'It stays on until the end of the month you paid for, and is not renewed. No refund for time already paid.');
    } else if (st === 'addon-on') {
      el.appendChild(node('p', 'Added to your plan by card' + (ao && ao.nextInvoiceOn ? ' · renews on ' + when(ao.nextInvoiceOn) : '') + '.', 'opm-note'));
    } else if (st === 'bought') {
      standingLine('Bought · not on yet', 'It switches on when your open invoice is paid.');
      if (sum.paymentLink) el.appendChild(link(sum.paymentLink, payWords(sum.payWith)));
    } else if (st === 'requested') {
      var oi = bl.optIns[m.key];
      standingLine('Opt-in requested' + (oi.requestedAt ? ' · ' + when(oi.requestedAt) : '') + (oi.display ? ' · ' + oi.display : ''), 'ClearSky moves you to monthly billing and confirms it; nothing is charged before you approve that invoice.');
    } else if (st === 'opting-out') {
      var oo = bl.optOuts[m.key];
      standingLine('Opting out · requested' + (oo.requestedAt ? ' ' + when(oo.requestedAt) : ''), 'ClearSky confirms the date and any price change in writing; access is unchanged until then.');
    } else if (st === 'part') {
      /* part of it is on the plan: some of its tools, or some of its commands
         in Site Map (the one legacy rule, OmegaWorkspaceHub.moduleState) */
      el.appendChild(node('p', 'Partly included: some of it is on your plan already, in its tools or in Site Map. Opting in adds the rest.', 'opm-note'));
    }
    if (!admin) { el.appendChild(node('p', 'An owner or administrator of ' + company(state) + ' changes modules.', 'opm-note')); return; }

    /* ── Cancel request: whatever is in flight, the same undo ── */
    function cancelPanel(title, text, extra, go) {
      el.textContent = '';
      el.appendChild(node('p', title, 'opm-quote'));
      el.appendChild(node('p', text, 'opm-note'));
      if (extra) el.appendChild(node('p', extra, 'opm-note'));
      row(el, [button('Cancel request', go, 'opm-primary'), button('Not now', again)]);
    }
    function cancelChange() {
      cancelPanel('Cancel the ' + names(p.names || [m.name]) + ' request?', 'Nothing is switched on and nothing is charged. ' + (p.payWith ? 'The ' + p.payWith + ' invoice' : 'The invoice') + ' stays open until ClearSky voids it; if it is paid anyway, ClearSky reviews it.', null, function () {
        busy('Cancelling…');
        api('/api/plan-change', withOrg(state, { action: 'cancel', changeId: p.id })).then(function (r) { done(r, 'Cancelled. Nothing is charged.'); }, function (e) { failed(e); });
      });
    }
    function cancelRemoval() {
      busy('Checking…');
      var ask = withOrg(state, { action: 'withdraw-removal', remove: [m.key] });
      api('/api/plan-change', extend({ dryRun: true }, ask)).then(function (q) {
        cancelPanel('Cancel the opt-out of ' + names(q.names) + '?', 'Nothing about your bill changes: ' + names(q.names) + (q.names.length > 1 ? ' stay' : ' stays') + ' on your plan as it is today.',
          q.names.length > 1 ? 'The modules it needs are kept too.' : null, function () {
            busy('Saving…');
            api('/api/plan-change', extend({ previewId: q.previewId }, ask)).then(function (r) { done(r, 'Kept. Nothing about your bill changes.'); }, function (e) { failed(e); });
          });
      }, function (e) { failed(e); });
    }
    /* a legacy request: the catalog says what goes with it; the server decides */
    /* the server's own rule says what a cancel takes back (the withdraw
       dry run: the modules that need this one, or the prerequisites this
       request pulled in); the panel names it and writes nothing first */
    function legacyCancel(field, action) {
      busy('Checking…');
      var payload = { action: action }; payload[field === 'optIns' ? 'add' : 'remove'] = [m.key];
      api('/api/plan-change', withOrg(state, extend({ dryRun: true }, payload))).then(function (q) {
        var others = (q.names || []).filter(function (n) { return n !== m.name; });
        var title = field === 'optIns' ? 'Cancel the opt-in request for ' + m.name + '?' : 'Cancel the opt-out of ' + m.name + '?';
        var extra = others.length ? (field === 'optIns' ? 'This also cancels the request for ' + names(others) + '.' : 'This also keeps ' + names(others) + ', which ' + m.name + ' needs.') : null;
        cancelPanel(title, q.note || 'Nothing about your bill changes.', extra, function () {
          busy('Cancelling…');
          api('/api/plan-change', withOrg(state, payload)).then(function (r) { remember(state, r); done(r, 'Cancelled. Nothing about your bill changes.'); }, function (e) { failed(e, 'Cancel the request for ' + m.name); });
        });
      }, function (e) { failed(e, 'Cancel the request for ' + m.name); });
    }
    /* an add-on purchase still waiting for payment (plan-change addon-cancel
       with its id): nothing is switched on and nothing is charged */
    function addOnCancel() {
      cancelPanel('Cancel the ' + names(ap.names || [m.name]) + ' request?', 'Nothing is switched on and nothing is charged. The ' + (ap.payWith || ADDON_RAIL) + ' invoice stays open until ClearSky voids it; if it is paid anyway, ClearSky reviews it.', null, function () {
        busy('Cancelling…');
        api('/api/plan-change', withOrg(state, { action: 'addon-cancel', addOnId: ap.id })).then(function (r) { remember(state, r); done(r, 'Cancelled. Nothing is charged.'); }, function (e) { failed(e); });
      });
    }
    /* an add-on opted out of (addOns.ending): keep it after all
       (withdraw-addon-cancel), priced by the server's dry run first */
    function addOnKeep() {
      busy('Checking…');
      var ask = withOrg(state, { action: 'withdraw-addon-cancel', remove: [m.key] });
      api('/api/plan-change', extend({ dryRun: true }, ask)).then(function (q) {
        var others = (q.names || []).filter(function (n) { return n !== m.name; });
        cancelPanel('Cancel the opt-out of ' + names(q.names || [m.name]) + '?', q.note || 'It stays on and renews with your other add-ons.', others.length ? 'This also keeps ' + names(others) + ', which ' + m.name + ' needs.' : null, function () {
          busy('Saving…');
          api('/api/plan-change', ask).then(function (r) { remember(state, r); done(r, 'Kept. ' + names(r.names || q.names || [m.name]) + ((r.names || q.names || []).length > 1 ? ' stay' : ' stays') + ' on and renew' + ((r.names || q.names || []).length > 1 ? '' : 's') + ' with your add-ons.'); }, function (e) { failed(e); });
        });
      }, function (e) { failed(e); });
    }
    /* "I've paid" on an add-on invoice: the platform looks at QuickBooks now
       (plan-change reconcile-now, one look every eight seconds) and answers
       with the add-ons as they stand; the card follows that answer */
    function addOnPaid() {
      var note = node('p', '', 'opm-note opm-check'); note.setAttribute('role', 'status');
      var b = button("I've paid", function () {
        b.disabled = true; b.textContent = 'Checking your payment…'; note.textContent = '';
        api('/api/plan-change', withOrg(state, { action: 'reconcile-now' })).then(function (r) {
          var now = r && r.addOns, still = now ? !!addOnPending(now, m.key, ap.purpose || 'purchase') : true;
          if (now) remember(state, { addOns: now });
          if (!still && (ap.purpose === 'renewal' || addOnLive(now, m.key))) { if (state.onChanged) state.onChanged({ state: 'active', add: [m.key], live: now.live || [] }); return; }
          if (!still) { if (state.onChanged) state.onChanged(r); return; }
          b.disabled = false; b.textContent = "I've paid";
          note.textContent = r && r.throttled ? 'Checked a moment ago. Try again in a few seconds.' : r && r.error ? r.error
            : (ap.payWith || ADDON_RAIL) + ' does not show this payment yet. A card payment usually shows within a minute.';
        }, function (e) { b.disabled = false; b.textContent = "I've paid"; note.textContent = e.message; });
      });
      return { button: b, note: note };
    }
    if (st === 'waiting') {
      /* "I've paid" asks the platform to look now instead of the hourly run */
      var check = paidCheck(m, state);
      row(el, [check.button, button('Cancel request', cancelChange)]); el.appendChild(check.note);
      if (step === 'cancel') cancelChange(); return;
    }
    if (st === 'addon-waiting') { var ac = addOnPaid(); row(el, [ac.button, button('Cancel request', addOnCancel)]); el.appendChild(ac.note); if (step === 'cancel') addOnCancel(); return; }
    /* a renewal is paid or lapses: it cannot be cancelled, and an opt-out
       waits until it is paid (the server says so too) */
    if (st === 'addon-renewal') { var rc = addOnPaid(); row(el, [rc.button]); el.appendChild(rc.note); return; }
    if (st === 'removing') { row(el, [button('Cancel request', cancelRemoval)]); if (step === 'cancel') cancelRemoval(); return; }
    if (st === 'addon-leaving') { row(el, [button('Cancel request', addOnKeep)]); if (step === 'cancel') addOnKeep(); return; }
    if (st === 'requested') { var c1 = function () { legacyCancel('optIns', 'withdraw-opt-in'); }; row(el, [button('Cancel request', c1)]); if (step === 'cancel') c1(); return; }
    if (st === 'opting-out') { var c2 = function () { legacyCancel('optOuts', 'withdraw-opt-out'); }; row(el, [button('Cancel request', c2)]); if (step === 'cancel') c2(); return; }

    /* ── Opt out of an add-on bought by card: it stops at the end of the
       month paid for (plan-change addon-cancel with the module), never the
       recorded opt-out, and the dry run states the money first ── */
    if (st === 'addon-on') {
      var stop = function () {
        busy('Checking…');
        var ask = withOrg(state, { action: 'addon-cancel', remove: [m.key] });
        api('/api/plan-change', extend({ dryRun: true }, ask)).then(function (q) {
          el.textContent = '';
          el.appendChild(node('p', 'Opt out of ' + names(q.names) + '?', 'opm-quote'));
          el.appendChild(node('p', q.note, 'opm-note'));
          if (q.names.length > 1) el.appendChild(node('p', 'Also opts out of ' + names(q.names.filter(function (n) { return n !== m.name; })) + ', which need' + (q.names.length > 2 ? '' : 's') + ' ' + m.name + '.', 'opm-note'));
          row(el, [button('Opt out', function () {
            busy('Saving…');
            api('/api/plan-change', ask).then(function (r) { remember(state, r); done(r, 'Done. ' + names(r.names || q.names) + ((r.names || q.names).length > 1 ? ' stay' : ' stays') + ' on until ' + when(r.endsOn || q.endsOn) + ' and ' + ((r.names || q.names).length > 1 ? 'are' : 'is') + ' not renewed.'); }, function (e) { failed(e); });
          }, 'opm-primary'), button('Not now', again)]);
        }, function (e) { failed(e); });
      };
      row(el, [button('Opt out', stop)]);
      if (step === 'remove') stop();
      return;
    }

    /* ── Opt out (of what is on, or bought and waiting for its invoice) ── */
    if (st === 'on' || st === 'bought') {
      var out = state.legacy ? function () {
        busy('Checking…');
        api('/api/plan-change', withOrg(state, { action: 'opt-out', remove: [m.key], dryRun: true })).then(function (q) {
          el.textContent = '';
          el.appendChild(node('p', 'Opt out of ' + names(q.names) + '?', 'opm-quote'));
          el.appendChild(node('p', q.note, 'opm-note'));
          if (q.names.length > 1) el.appendChild(node('p', 'Also opts out of ' + names(q.names.filter(function (n) { return n !== m.name; })) + ', which need' + (q.names.length > 2 ? '' : 's') + ' ' + m.name + '.', 'opm-note'));
          if (q.closes && q.closes.length) el.appendChild(node('p', 'It also closes your open opt-in request for ' + names(q.closes) + '.', 'opm-note'));
          row(el, [button('Send opt-out request', function () {
            busy('Sending…');
            api('/api/plan-change', withOrg(state, { action: 'opt-out', remove: [m.key], previewId: q.previewId })).then(function (r) { remember(state, r); done(r, 'Sent. ClearSky confirms the date and any price change with you.'); }, function (e) { failed(e, 'Opt out of ' + names(q.names)); });
          }, 'opm-primary'), button('Not now', again)]);
        }, function (e) { failed(e, 'Opt out of ' + m.name); });
      } : function () {
        busy('Checking what changes…');
        var ask = withOrg(state, { action: 'request-removal', remove: [m.key] });
        api('/api/plan-change', extend({ dryRun: true }, ask)).then(function (q) {
          el.textContent = '';
          var many = q.names.length > 1, until = q.reviewOn ? 'until your review on ' + when(q.reviewOn) : 'until your next quarterly review';
          /* both figures are the server's, priced ON the review day (a credit
             that has ended by then is not in either), and "after" takes out
             everything already queued for that review, which it names */
          var leaving = Array.isArray(q.alsoLeaving) ? q.alsoLeaving : [];
          var money = q.beforeDisplay && q.afterDisplay ? (fee(q.beforeDisplay) === fee(q.afterDisplay) ? 'Your monthly fee stays ' + fee(q.beforeDisplay) + '.' : 'From then your monthly fee goes from ' + fee(q.beforeDisplay) + ' to ' + fee(q.afterDisplay) + ' (both as priced on the review day' + (leaving.length ? ', with ' + names(leaving) + ' already leaving then too' : '') + ').') : 'ClearSky confirms your new monthly fee at the review.';
          el.appendChild(node('p', 'Opt out of ' + names(q.names) + '?', 'opm-quote'));
          el.appendChild(node('p', 'You keep ' + names(q.names) + ', and keep paying for ' + (many ? 'them' : 'it') + ', ' + until + '. ' + money + ' No refund for time already billed.', 'opm-note'));
          if (many) el.appendChild(node('p', 'Also opts out of ' + names(q.names.filter(function (n) { return n !== m.name; })) + ', which need' + (q.names.length > 2 ? '' : 's') + ' ' + m.name + '.', 'opm-note'));
          row(el, [button('Request opt-out', function () {
            busy('Saving…');
            api('/api/plan-change', extend({ previewId: q.previewId }, ask)).then(function (r) { done(r, 'Requested. ' + names(r.names || q.names) + (many ? ' stay' : ' stays') + ' on ' + until + '.'); }, function (e) { failed(e); });
          }, 'opm-primary'), button('Not now', again)]);
        }, function (e) { failed(e); });
      };
      row(el, [button('Opt out', out)]);
      if (step === 'remove') out();
      return;
    }

    /* ── Opt in ── */
    function quote(plan) {
      needsLine(el, false); busy('Pricing…');
      var ask = withOrg(state, { action: 'quote', add: [m.key] }); if (plan) ask.plan = plan;
      api('/api/plan-change', ask).then(function (q) {
        el.textContent = '';
        el.appendChild(node('p', q.display.today, 'opm-quote'));
        el.appendChild(node('p', q.display.then, 'opm-note'));
        el.appendChild(node('p', q.display.activation, 'opm-note'));
        if (q.serviceFeeNote) el.appendChild(node('p', q.serviceFeeNote, 'opm-note'));
        if (q.add.length > 1) el.appendChild(node('p', 'Also adds ' + names((q.addNames || q.add).filter(function (n, i) { return q.add[i] !== m.key; })) + ', which ' + m.name + ' needs.', 'opm-note'));
        if (!q.canApply) { el.appendChild(node('p', q.reason, 'opm-reason')); row(el, [button('Not now', again)]); return; }
        row(el, [button(q.included ? 'Turn it on' : 'Opt in and pay', function () {
          busy(q.included ? 'Turning it on…' : 'Creating your invoice…');
          var go = withOrg(state, { action: 'apply', add: [m.key], previewId: q.previewId, effectiveAt: q.effectiveAt }); if (plan) go.plan = plan;
          api('/api/plan-change', go).then(function (r) {
            el.textContent = '';
            if (r.state === 'active') el.appendChild(node('p', 'On. Your tools are updating…', 'opm-quote'));
            else { el.appendChild(node('p', 'Invoice created: ' + r.display + '. It switches on when the payment clears.' + (r.expiresOn ? ' Pay before ' + when(r.expiresOn) + '; unpaid, the request expires that day.' : ''), 'opm-wait')); if (r.paymentLink) el.appendChild(link(r.paymentLink, payWords(r.payWith))); }
            if (state.onChanged) state.onChanged(r);
          }, function (e) { failed(e); });
        }, 'opm-primary'), q.steer ? button(q.steer.display, function () { quote(q.steer.plan); }) : null, button('Not now', again)]);
      }, function (e) { failed(e); });
    }
    /* a legacy opt-in the server cannot sell by card: the recorded request,
       priced first (opt-in dry run), with the server's reason it is a
       request (why) when it gave one */
    function legacyIn(why) {
      needsLine(el, false); busy('Pricing…');
      api('/api/plan-change', withOrg(state, { action: 'opt-in', add: [m.key], dryRun: true })).then(function (q) {
        el.textContent = '';
        el.appendChild(node('p', 'Opt in to ' + names(q.names) + ' for ' + q.display + '?', 'opm-quote'));
        if (why) el.appendChild(node('p', why, 'opm-reason'));
        el.appendChild(node('p', q.note, 'opm-note'));
        if (q.add.length > 1) el.appendChild(node('p', 'Also adds ' + names(q.names.filter(function (n) { return n !== m.name; })) + ', which ' + m.name + ' needs.', 'opm-note'));
        row(el, [button('Request opt-in', function () {
          busy('Sending…');
          api('/api/plan-change', withOrg(state, { action: 'opt-in', add: [m.key] })).then(function (r) { remember(state, r); done(r, 'Requested ' + names(r.names) + ' at ' + r.display + '. ClearSky will confirm.'); }, function (e) { failed(e, 'Opt in to ' + names(q.names) + ' (' + q.display + ')'); });
        }, 'opm-primary'), button('Not now', again)]);
      }, function (e) { failed(e, 'Opt in to ' + m.name); });
    }
    /* ── Opt in on a plan billed outside the engine: the server says first
       whether its plan can switch the module on EXACTLY (plan-change
       addon-quote, api/_lib/addons.js). Then it is paid by card on its own
       QuickBooks invoice and switches on when the payment clears; otherwise
       it is the recorded request above. An answer that could not be had at
       all falls back to the request, which ClearSky always takes. ── */
    function legacyAdd() {
      needsLine(el, false); busy('Pricing…');
      api('/api/plan-change', withOrg(state, { action: 'addon-quote', add: [m.key] })).then(function (q) {
        if (!q.canBuy && q.request) { legacyIn(q.reason); return; }
        el.textContent = '';
        el.appendChild(node('p', q.display.today, 'opm-quote'));
        el.appendChild(node('p', q.display.then, 'opm-note'));
        if (q.add.length > 1) el.appendChild(node('p', 'Also adds ' + names((q.addNames || q.add).filter(function (n, i) { return q.add[i] !== m.key; })) + ', which ' + m.name + ' needs.', 'opm-note'));
        el.appendChild(node('p', q.display.activation, 'opm-note'));
        if (q.display.plan) el.appendChild(node('p', q.display.plan, 'opm-note'));
        if (!q.canBuy) { el.appendChild(node('p', q.reason + (q.detail ? ' (' + q.detail + ')' : ''), 'opm-reason')); row(el, [button('Not now', again)]); return; }
        if (q.needsProfile) { profile(q); return; }
        row(el, [button(q.included ? 'Turn it on' : 'Opt in and pay', function () { buy(q); }, 'opm-primary'), button('Not now', again)]);
      }, function () { legacyIn(null); });
    }
    /* who QuickBooks invoices, asked once (the same form as signup), saved
       through /api/billing-profile; then the price again */
    function profile() {
      var P = global.OmegaBillingProfile;
      el.appendChild(node('p', 'First, who the invoice goes to. It is saved once and used for every invoice.', 'opm-note'));
      if (!P) { el.appendChild(node('p', 'Add your billing contact on Plan & billing, then come back.', 'opm-reason')); row(el, [button('Not now', again)]); return; }
      var form = node('div', '', 'opm-profile'), fields = P.render(form, {}); el.appendChild(form);
      var save = button('Save and continue', function () {
        if (!fields.valid()) return;
        save.disabled = true; save.textContent = 'Saving…';
        api('/api/billing-profile', withOrg(state, { profile: fields.value() })).then(function () { legacyAdd(); }, function (e) { save.disabled = false; save.textContent = 'Save and continue'; el.appendChild(node('p', e.message, 'opm-reason')); });
      }, 'opm-primary');
      row(el, [save, button('Not now', again)]);
    }
    function buy(q) {
      /* the payment page opens on THIS click (a tab opened after the answer
         would be a blocked pop-up) and waits on a note until its address is
         known; it never holds a reference back to this page */
      var tab = null;
      if (!q.included) {
        try { tab = global.open('', '_blank'); if (tab) { tab.opener = null; tab.document.title = 'Opening your invoice…'; tab.document.body.innerHTML = '<p style="font:16px system-ui,sans-serif;padding:32px;color:#14171A">Preparing your invoice…</p>'; } } catch (e) { tab = null; }
      }
      busy(q.included ? 'Turning it on…' : 'Creating your invoice…');
      api('/api/plan-change', withOrg(state, { action: 'addon-buy', add: [m.key], previewId: q.previewId, effectiveAt: q.effectiveAt })).then(function (r) {
        if (r.state === 'active') { if (tab) { try { tab.close(); } catch (e) {} } remember(state, r); done(r, 'On. ' + names(r.addNames || [m.name]) + ((r.addNames || []).length > 1 ? ' are' : ' is') + ' on now.'); return; }
        var opened = false;
        if (tab && r.paymentLink) { try { tab.location.replace(r.paymentLink); opened = true; } catch (e) {} }
        if (tab && !opened) { try { tab.close(); } catch (e) {} }
        remember(state, extend({}, r, { opened: opened }));
        done(r, 'Invoice created: ' + r.display + '. It switches on when the payment clears.');
      }, function (e) { if (tab) { try { tab.close(); } catch (x) {} } failed(e); });
    }
    var add = state.legacy ? legacyAdd : function () { quote(null); };
    row(el, [button('Opt in', add, 'opm-primary')]);
    if (step === 'add') add();
  }
  /* a legacy write answers with the requests (or the add-ons) as stored; the
     menu's copy of the plan follows so the card redraws in its new state */
  function remember(state, r) {
    if (!state.legacy || !r) return;
    var b = state.legacy.billing = state.legacy.billing || {};
    if (r.optIns) b.optIns = extend({}, b.optIns || {}, r.optIns);
    if (r.optOuts) b.optOuts = extend({}, b.optOuts || {}, r.optOuts);
    var ao = state.legacy.addOns = copyAddOns(addOnsOf(state)) || { live: [], pending: [], ending: {} };
    /* the add-ons as the server has them now (reconcile-now) replace ours */
    if (r.addOns) { state.legacy.addOns = copyAddOns(r.addOns); return; }
    /* addon-buy: waiting for payment, or on at once; either way `live` is the server's */
    if (r.addOnId && r.state === 'awaiting_payment') {
      ao.pending = ao.pending.filter(function (p) { return p.id !== r.addOnId; }).concat([{ id: r.addOnId, purpose: 'purchase', add: r.add || [], names: r.addNames || r.names || [], display: r.display,
        paymentLink: r.paymentLink || null, payLinkMissing: !!r.payLinkMissing, expiresOn: r.expiresOn || null, payWith: r.payWith || ADDON_RAIL, opened: r.opened === true }]);
    }
    if (r.addOnId && Array.isArray(r.live)) ao.live = r.live.slice();
    /* addon-cancel of a purchase: it no longer waits */
    if (r.addOnId && r.state === 'cancelled') ao.pending = ao.pending.filter(function (p) { return p.id !== r.addOnId; });
    /* addon-cancel / withdraw-addon-cancel of a paid add-on: the server's map */
    if (r.ending) ao.ending = Array.isArray(r.ending) ? r.ending.slice() : extend({}, r.ending);
  }
  /* ── "I'VE PAID" ────────────────────────────────────────────────────────
     Paying happens on the provider's page (Stripe's or QuickBooks'), in
     another tab; the module switches on when the platform sees the payment,
     which the hourly runner does on its own. This asks it to look now
     (plan-change reconcile-now, one look per workspace every eight seconds)
     and then asks the editor's plan again, so the person who just paid sees
     the tools without a reload. The browser decides nothing: the summary's
     own pending list says whether the change still waits. */
  function paidCheck(m, state) {
    /* the workspace the card belongs to (staff act for a tenant in the master
       console) and the page's own "it changed" (the store, the console, the
       editor's dialog) */
    var note = node('p', '', 'opm-note'), orgId = state.orgId || (state.summary || {}).orgId || null;
    note.setAttribute('role', 'status');
    var b = button("I've paid", function () {
      b.disabled = true; b.textContent = 'Checking your payment…'; note.textContent = '';
      var said = null, ask = { action: 'reconcile-now' }; if (orgId) ask.orgId = orgId;
      api('/api/plan-change', ask).then(function (r) { said = r; }, function (e) { said = { error: e.message }; })
        .then(function () { return api('/api/plan-change' + (orgId ? '?orgId=' + encodeURIComponent(orgId) : '')); })
        .then(function (summary) {
          var still = (summary.pending || []).some(function (p) { return (p.add || []).indexOf(m.key) >= 0; });
          if (!still) { (state.onChanged || changed)({ state: 'active', add: [m.key] }); return; }
          b.disabled = false; b.textContent = "I've paid";
          note.textContent = said && said.throttled ? 'Checked a moment ago. Try again in a few seconds.' :
            said && said.error ? said.error : ((said && said.payWith) || 'The invoice') + ' does not show this payment yet. A card payment usually shows within a minute.';
        }, function () { b.disabled = false; b.textContent = "I've paid"; note.textContent = 'The payment could not be checked right now. Try again in a moment.'; });
    });
    return { button: b, note: note };
  }
  /* ── ADD TO PLAN, THE OLD DOOR ─────────────────────────────────────────
     addOnControl(target, m, { canManage, pending, onChanged }) was the
     separate card-payment control. It is the one control now: the legacy
     path of subscribeControl, whose Opt in asks the server whether the
     module can be bought by card (addon-quote) and otherwise records the
     request, in the words every module surface uses. */
  function addOnControl(target, m, state) {
    state = state || {};
    target.setAttribute('data-addon', m.key);
    /* no dialog to redraw it: after a write the control redraws itself in
       its new state (waiting for payment, on), after the page has heard */
    var own = { canManage: !!state.canManage, admin: state.canManage === true, orgId: state.orgId || null, catalog: state.catalog || null,
      onChanged: function (r) { if (state.onChanged) { try { state.onChanged(r); } catch (e) {} } subscribeControl(target, m, own); },
      legacy: { company: state.company || null, email: state.email || null, billing: {}, states: {}, addOns: { live: [], pending: state.pending ? [state.pending] : [], ending: {} } } };
    subscribeControl(target, m, own);
  }
  /* ── WHERE A MODULE LIVES IN THE EDITOR ─────────────────────────────────
     Read off the ribbon as it stands, by the same owners() rule that gates
     it, so there is no second list of which tab a module is on. Prefers the
     catalog's editorPage when the module has one. */
  function usable(el) {
    return !el.hasAttribute('data-packaging-retired') && !el.hasAttribute('data-omega-retired') && !el.hasAttribute('data-shelf-dupe') && !el.classList.contains('omega-gated-hidden');
  }
  function places() {
    /* a package, or a legacy plan whose catalog came with its add-ons */
    var caps = global.OmegaCaps, out = {}; if (!caps || !(caps.packageAccess() || (caps.legacyView && caps.legacyView())) || !document.getElementById('ribbon')) return out;
    var els = document.querySelectorAll('#ribbon .ribbon-page .rbtn,#ribbon .ribbon-page .rsbtn');
    for (var i = 0; i < els.length; i++) {
      var el = els[i]; if (!usable(el) || !caps.allowedElement(el)) continue;
      var own = caps.owners(el.id || '', el.getAttribute('onclick') || ''); if (!own.length) continue;
      var page = el.closest('.ribbon-page').getAttribute('data-page'), tab = document.querySelector('#ribbon-tabs .rtab[data-page="' + page + '"]');
      if (!tab) continue;
      own.forEach(function (key) {
        /* the module's own page wins: its editorPage, else the tab that
           carries its name (data-module: Compute's commands are on Compute,
           though Compute Build sits on Build) */
        var grant = caps.MODULE_GRANTS[key] || {}, held = out[key], named = document.querySelector('#ribbon .ribbon-page[data-module="' + key + '"]');
        var home = grant.editorPage || (named ? named.getAttribute('data-page') : null);
        if (held && (held.page === home || page !== home)) return;
        out[key] = { el: el, page: page, tab: tab.textContent.replace(/\s+/g, ' ').trim() };
      });
    }
    return out;
  }
  function where(key) { return places()[key] || null; }
  function showMe(key) {
    var hit = where(key); if (!hit) return false;
    close();
    /* Under a package nothing but the package hides a tool (no Designer
       mode, no project filter), so the tab is always there to open. */
    if (typeof global.rbTab === 'function') global.rbTab(hit.page);
    hit.el.setAttribute('data-opm-spot', '1');
    if (hit.el.scrollIntoView) hit.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    /* keyboard focus goes where the eye is sent */
    if (hit.el.focus) { try { hit.el.focus({ preventScroll: true }); } catch (e) { hit.el.focus(); } }
    setTimeout(function () { hit.el.removeAttribute('data-opm-spot'); }, 2600);
    return true;
  }
  /* a module's name as the editor's own projection has it (the toast speaks
     where no catalog row is at hand) */
  function grantName(key) { var g = global.OmegaCaps && global.OmegaCaps.MODULE_GRANTS[key]; return g ? g.name : key; }
  /* ── SAY WHAT CHANGED ───────────────────────────────────────────────────
     OmegaCaps.refresh() announces a plan that moved while the editor was
     open. Without a word the ribbon just rearranges itself: a tab appears
     that nobody asked where to find, or the tools someone was using vanish.
     One line, what moved, where it is, and a way to it. */
  var toastTimer = null;
  /* One live region, in the page before anything is said into it: a region
     inserted already filled in is often not announced by screen readers. */
  function announce(text) {
    var live = document.getElementById('omega-plan-live');
    if (!live) {
      live = node('div'); live.id = 'omega-plan-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
      live.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
      document.body.appendChild(live);
    }
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 60);
  }
  function toast(text, action) {
    styles();
    var old = document.getElementById('omega-plan-toast'); if (old) old.remove();
    if (toastTimer) clearTimeout(toastTimer);
    var t = node('div', '', 'opm-toast'); t.id = 'omega-plan-toast';
    t.appendChild(node('span', text));
    announce(text);
    if (action) t.appendChild(action);
    t.appendChild(button('Dismiss', function () { t.remove(); }, 'opm-x'));
    document.body.appendChild(t);
    function later() { toastTimer = setTimeout(function () { if (t.matches(':hover') || t.contains(document.activeElement)) return later(); t.remove(); }, 12000); }
    later();
    return t;
  }
  function planChanged(e) {
    var d = e.detail || {};
    notice();
    /* With The Ladder open the card itself says it ("On your plan · Show
       me"); a toast over the dialog would only cover it. A member's cards
       stay a member's: the controls reload and who may change modules is
       what the dialog already decided. */
    if (body) {
      if (host.legacy || !control.loaded) { if (control.loaded) render(lastRows, null); return; }
      loadControl().then(function () { control.canManage = decided; if (body) render(lastRows, null); });
      return;
    }
    if (!document.getElementById('ribbon')) return;
    /* a package's modules, or the add-ons a legacy plan switched on or off */
    var added = (d.packaged ? d.added : d.addOnsAdded || []).filter(function (k) { return k !== 'lite'; }), removed = d.packaged ? d.removed : d.addOnsRemoved || [];
    if (d.refused) return toast(d.refused + ' Saved projects stay available. Your workspace administrator can check your access.', link('/workspace', 'Workspace'));
    if (d.readOnly && !d.wasReadOnly) return toast('This workspace is read-only now. Saved projects stay available; pay to keep creating and exporting.', link('/workspace#billing', 'Plan & billing'));
    if (d.recovered) return toast(d.readOnly ? 'Your plan is loaded. This workspace is read-only; saved projects stay available.' : 'Your plan is loaded. Your tools are back.', d.readOnly ? link('/workspace#billing', 'Plan & billing') : null);
    if (added.length) {
      var map = places(), hit = null, i;
      for (i = 0; i < added.length && !hit; i++) hit = map[added[i]] ? added[i] : null;
      var place = hit ? map[hit] : null, text = names(added.map(grantName)) + (added.length > 1 ? ' are' : ' is') + ' on.';
      if (place) return toast(text + ' ' + (added.length > 1 ? grantName(hit) + ' is' : 'Find it') + ' on the ' + place.tab + ' tab.', button('Show me', function () { var t = document.getElementById('omega-plan-toast'); if (t) t.remove(); showMe(hit); }, 'opm-primary'));
      return toast(text + ' Open it from your workspace.', link('/workspace', 'Workspace'));
    }
    if (!d.readOnly && d.wasReadOnly) return toast('Your workspace is open again. Your tools are back.');
    if (removed.length) return toast(names(removed.map(grantName)) + (removed.length > 1 ? ' are' : ' is') + ' no longer on your plan. Saved work stays available.', link('/workspace#billing', 'Plan & billing'));
    if (d.packaged !== d.wasPackaged || !d.packaged) return toast('Your plan changed. The ribbon now shows what it includes.');
  }
  /* ── THE PLAN'S STATE, IN THE EDITOR ────────────────────────────────────
     The dashboard has always said "your trial ends on …" and "this
     workspace is read-only, pay to continue"; the editor, where the tools
     actually disappear, said nothing, and a read-only workspace opened on a
     near-empty ribbon with no reason given. The same server notice
     (package-access billingNotice), the same pay link, and "I've paid". A
     plan that could not be checked (OmegaCaps' unchecked view: pending, not
     loading) says so and offers Try again. */
  /* signed in to the editor itself: never the sign-in screen's locked
     placeholder, never the customer's Editor Lite frame (its own access) */
  function ownEditor() {
    try { return !/[?&]customerEngine=1(&|$)/.test(global.location.search) && !!(global.firebase && global.firebase.apps && global.firebase.apps.length && global.firebase.auth().currentUser); } catch (e) { return false; }
  }
  function notice() {
    var caps = global.OmegaCaps, view = caps && caps.packageAccess(), ribbon = document.getElementById('ribbon'), bar = document.getElementById('omega-plan-notice');
    var own = ownEditor();
    var n = own && view && !view.staff && !view.preview && (view.refused ? { text: view.refused + ' Saved projects stay available. Your workspace administrator can check your access.', refused: true } :
      view.billingNotice || (view.pending && !view.loading ? { text: 'Your plan could not be checked. Saved projects stay available; your tools come back when the connection does.', retry: true } : null));
    if (!n || !ribbon || host.view) { if (bar) bar.remove(); return; }
    var key = [n.text, n.payUrl || '', view.readOnly ? 1 : 0].join('|');
    if (bar && bar.getAttribute('data-notice') === key) return;
    styles();
    if (!bar) { bar = node('div'); bar.id = 'omega-plan-notice'; bar.setAttribute('role', 'status'); }
    var anchor = document.getElementById('omega-workspace-controls') || ribbon;
    if (bar.nextSibling !== anchor) anchor.parentNode.insertBefore(bar, anchor);
    bar.textContent = ''; bar.setAttribute('data-notice', key); bar.className = 'opm-notice' + (view.readOnly ? ' opm-bad' : '');
    bar.appendChild(node('span', n.text));
    if (n.payUrl) bar.appendChild(link(n.payUrl, payWords(n.payWith)));
    if (n.refused) { bar.appendChild(link('/workspace', 'Workspace')); return; }
    if (n.retry) {
      var said = node('p', '', 'opm-note'); said.setAttribute('role', 'status');
      var again = button('Try again', function () {
        again.disabled = true; again.textContent = 'Checking…'; said.textContent = '';
        (caps.refresh ? caps.refresh() : Promise.resolve(null)).then(function (r) {
          if (!again.isConnected) return;
          again.disabled = false; again.textContent = 'Try again';
          said.textContent = !r || r.unavailable ? 'Still can\'t reach the server. Check the connection and try again.' : '';
        });
      });
      bar.appendChild(again); bar.appendChild(said); return;
    }
    if (n.payUrl || view.readOnly) {
      var note = node('p', '', 'opm-note'); note.setAttribute('role', 'status');
      var paid = button("I've paid", function () {
        paid.disabled = true; paid.textContent = 'Checking…'; note.textContent = '';
        /* a member may not ask for a look at the payment (an owner's action), so a
           refusal only skips that step; re-reading the plan is theirs too */
        var told = null;
        api('/api/plan-change', { action: 'reconcile-now' }).then(function (j) { told = j; }, function (e) { told = { refused: e.message }; })
          .then(function () { return caps.refresh ? caps.refresh() : null; }).then(function (r) {
            if (!paid.isConnected) return;
            paid.disabled = false; paid.textContent = "I've paid";
            if (r && r.changed) return;
            note.textContent = r && r.unavailable ? 'Can\'t reach the server right now. Try again in a moment.' :
              told && told.throttled ? 'Checked a moment ago. Try again in a few seconds.' :
              told && told.error ? told.error : 'Not showing as paid yet. A card payment usually shows within a minute.';
          });
      });
      bar.appendChild(paid); bar.appendChild(link('/workspace#billing', 'Plan & billing')); bar.appendChild(note);
      return;
    }
    bar.appendChild(link('/workspace#billing', 'Plan & billing'));
  }
  if (global.document && global.document.addEventListener) global.document.addEventListener('omega:plan-changed', planChanged);
  function loadControl() {
    return api('/api/plan-change').then(function (summary) {
      var pending = {}; (summary.pending || []).forEach(function (p) { (p.add || []).forEach(function (k) { pending[k] = p; }); });
      /* a member reads the summary too; the server says who may change it */
      control = { canManage: summary.canManage !== false, pending: pending, loaded: true, summary: summary }; return control;
    }, function () { control = { canManage: false, pending: {}, loaded: true }; return control; });
  }
  /* focus goes back only when a dialog was open: from a toast's Show me,
     "trigger" is whatever had focus the last time The Ladder opened */
  function close() { var had = !!dialog; if (dialog) dialog.remove(); if (keydown) document.removeEventListener('keydown', keydown); keydown = null; dialog = body = statusLine = introLine = null; intent = null; request++; if (had && trigger && trigger.focus) trigger.focus(); trigger = null; }
  function cardState(m) {
    var view = packageView();
    return { canManage: control.canManage, admin: host.admin, pending: control.pending, summary: control.summary, loading: !control.loaded,
      owned: !host.legacy && !!view && (view.modules || []).indexOf(m.key) >= 0, legacy: host.legacy, catalog: lastRows.length ? lastRows : view && view.catalog,
      ownedModules: view && view.modules, company: host.company, orgId: host.orgId, onChanged: changed };
  }
  function card(m, price, focus) {
    var el = node('section', '', 'opm-card'); el.setAttribute('data-module-card', m.key);
    if (price) el.setAttribute('data-price', price); else if (!control.loaded && !control.failed) el.setAttribute('data-loading', '1');
    var top = node('div', '', 'opm-top'); top.appendChild(node('span', m.mark || m.name.slice(0, 1), 'opm-icon'));
    var badge = node('span', '', 'opm-badge'); badge.hidden = true; top.appendChild(badge); el.appendChild(top);
    el.appendChild(node('h3', m.name));
    var state = cardState(m), own = standing(m, state);
    /* held, in the editor: where it is on the ribbon, and a way to it */
    var spot = !host.view && !host.legacy && m.key !== 'lite' && own === 'on' && (spots || {})[m.key];
    if (spot) { var on = node('p', '', 'opm-on'); on.appendChild(node('span', 'On the ' + spot.tab + ' tab')); on.appendChild(button('Show me', function () { showMe(m.key); }, 'opm-link')); el.appendChild(on); }
    var list = node('ul'); (m.features || []).forEach(function (f) { list.appendChild(node('li', f)); }); el.appendChild(list);
    el.appendChild(node('p', price || '', 'opm-price'));
    if (m.beta && m.beta.length) el.appendChild(node('p', 'BETA: ' + m.beta.join(', '), 'opm-note'));
    if (m.coverage) el.appendChild(node('p', m.coverage, 'opm-note'));
    if (m.agreement) el.appendChild(node('p', m.agreement, 'opm-note'));
    /* one module on its own: say what else it brings before the button —
       only what an Opt in would still add (not held, not already asked for
       or waiting on an invoice), and only on a card that can still opt in */
    if (host.single && dialog) {
      var need = (m.requires || []).filter(function (k) { var dep = byKey(state, k), at = dep && standing(dep, cardState(dep)); return k !== 'lite' && dep && !HELD[at] && !ASKED[at]; });
      if (need.length && !HELD[own] && !ASKED[own]) el.appendChild(node('p', 'Also adds ' + names(need.map(function (k) { return nameOf(state, k); })) + ', which ' + m.name + ' needs.', 'opm-needs'));
    }
    // The control posts to the server; listing never changes modules[].
    subscribeControl(el.appendChild(node('div')), m, state);
    if (m.key === focus) { el.tabIndex = -1; el.setAttribute('data-selected', '1'); }
    return el;
  }
  var lastRows = [], spots = null;
  function changed(result) {
    var caps = global.OmegaCaps;
    if (host.onChanged) { try { host.onChanged(result); } catch (e) {} }
    if (host.legacy) { if (body) render(lastRows, null); return; }
    /* Re-read in place (OmegaCaps.refresh): the tools appear, the toast says
       where, and the ribbon never blinks through the locked state. */
    var refresh = result && result.state === 'active' && caps && caps.refresh && !host.view ? caps.refresh().then(null, function () {}) : Promise.resolve();
    refresh.then(function () { return control.canManage ? loadControl() : null; }).then(function () { control.canManage = decided; if (body) render(lastRows, null); });
  }
  var decided = false;
  /* "The Ladder" (Tommy, 2026-09-26): build your own experience and pay for
     what you need to run your business; each Omega Logic department is its
     own opt-in on it. The departments are named from the catalog's Omega
     Logic shelf (api/_lib/modules.js), never a list kept here. */
  function sayIntro(rows) {
    if (!introLine) return;
    var depts = (rows || []).filter(function (m) { return m.shelf === 'platform'; }).map(function (m) { return m.name; });
    introLine.textContent = 'Build your own experience and pay for what you need to run your business. ' + (depts.length ? 'Omega Logic is by department: ' + names(depts) + (depts.length > 1 ? ' are each an opt-in.' : ' is an opt-in.') : 'Each Omega Logic department is its own opt-in.');
  }
  function render(rows, focus, failure) {
    if (!body) return; lastRows = rows || [];
    body.textContent = ''; spots = host.view || host.legacy ? {} : places();
    if (lastRows.length) sayIntro(lastRows);
    var shown = host.single ? lastRows.filter(function (m) { return m.key === host.key; }) : lastRows;
    shown.forEach(function (m) { body.appendChild(card(m, m.priceDisplay || m.monthlyDisplay, focus)); });
    /* an empty grid is never "you have everything": the catalog always
       lists every module, held or not, so empty means it did not load */
    if (!body.children.length) {
      if (!failure && !control.loaded && !host.legacy) body.appendChild(node('p', 'Loading the modules…', 'opm-note'));
      else if (!failure && host.single && lastRows.length) body.appendChild(node('p', 'That module is not in this catalog.', 'opm-note'));
      else { body.appendChild(node('p', 'Pricing could not be loaded.', 'opm-note')); row(body, [button('Retry', retry, 'opm-primary')]); }
    }
    var selected = body.querySelector('[data-selected]'); if (selected && focus) { selected.scrollIntoView({ block: 'nearest' }); selected.focus(); }
  }
  /* Retry re-opens the same way; a plan that could not be checked asks the
     editor's plan again first (OmegaCaps.refresh, no reload) */
  function retry() {
    var caps = global.OmegaCaps, view = !host.view && caps && caps.packageAccess();
    if (view && view.pending && !view.loading && caps.refresh) { caps.refresh().then(null, function () {}).then(function () { open(host.key, host.options); }); return; }
    open(host.key, host.options);
  }
  function status(text, withRetry) {
    if (!statusLine) return; statusLine.textContent = text || '';
    if (withRetry) { statusLine.appendChild(document.createTextNode(' ')); statusLine.appendChild(button('Retry', retry, 'opm-link')); }
  }
  /* open(key, { view, onChanged, single, intent, admin, company, orgId,
     legacy: { company, email, billing, states, addOns } }). The Ladder is ONE
     dialog: the whole catalog, or (single) one module with what it needs; an
     intent skips the first click to the confirm panel that states the money.
     legacy.addOns is the plan's add-ons as GET /api/plan-change summarises
     them; absent, billing.addOns (the record's own block) is read. */
  function open(key, options) {
    options = options || {};
    close(); trigger = document.activeElement;
    var legacy = options.legacy ? extend({}, options.legacy) : null;
    if (legacy) {
      var lb = legacy.billing || {};
      legacy.billing = extend({}, lb, { optIns: extend({}, lb.optIns || {}), optOuts: extend({}, lb.optOuts || {}) });
      legacy.addOns = copyAddOns(legacy.addOns || lb.addOns);
    }
    host = { view: options.view || null, onChanged: options.onChanged || null, legacy: legacy, single: options.single === true && !!key, admin: typeof options.admin === 'boolean' ? options.admin : undefined,
      company: options.company || (legacy && legacy.company) || null, orgId: options.orgId || null, key: key || null, options: options };
    intent = key && ['add', 'remove', 'cancel'].indexOf(options.intent) >= 0 ? { key: key, kind: options.intent } : null;
    control = { canManage: false, pending: {}, loaded: false }; lastRows = []; decided = false;
    if (!document.getElementById('omega-package-menu-style')) styles();
    var view = packageView(); if (!view && !legacy) return false;
    var tokenRequest = ++request;
    dialog = node('div', '', 'opm-backdrop'); dialog.id = 'omega-package-menu';
    var panel = node('div', '', 'opm-dialog' + (host.single ? ' opm-single' : '')); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'opm-title');
    var heading = node('h2', 'The Ladder'); heading.id = 'opm-title'; panel.appendChild(heading);
    /* the Omega Logic sentence belongs to Omega Logic: said only when the
       Ladder opens on a department or on nothing */
    if (!key || /^logic-/.test(key)) { introLine = node('p', '', 'opm-note'); panel.appendChild(introLine); sayIntro(view && view.catalog); }
    var dismiss = node('button', 'Close', 'opm-close'); dismiss.type = 'button'; dismiss.onclick = close; panel.appendChild(dismiss);
    statusLine = node('p', legacy ? '' : 'Loading current pricing…', 'opm-note'); statusLine.setAttribute('role', 'status'); panel.appendChild(statusLine);
    body = node('div', '', 'opm-grid'); panel.appendChild(body);
    if (host.single) { var every = button('See every module', function () { open(key, extend({}, options, { single: false, intent: null })); }, 'opm-link'); every.id = 'opm-every'; panel.appendChild(every); }
    dialog.appendChild(panel); document.body.appendChild(dialog);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    trap(panel);
    dismiss.focus();
    /* A plan billed outside the engine: the page's own price list and plan;
       nothing waits on a server judgement before the cards can act, and each
       Opt in asks the server whether it is a card purchase or a request. */
    if (legacy) {
      control = { canManage: true, pending: {}, loaded: true }; decided = true;
      status((legacy.company || 'This workspace') + ' is billed by ClearSky under its agreement. A module your plan can switch on by itself is paid by card on its own ' + ADDON_RAIL + ' invoice and switches on when the payment clears; any other opt-in or opt-out sends ClearSky a request with its price, and nothing is charged, and nothing is switched off, until ClearSky confirms it with you. Omega Design is always included.');
      var rows = view && Array.isArray(view.catalog) && view.catalog.length ? view.catalog : null;
      if (rows) { render(rows, key); return true; }
      body.appendChild(node('p', 'Loading the modules…', 'opm-note'));
      global.fetch('/api/offerings', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); })
        .then(function (j) { if (tokenRequest === request && body) render(j.modules || [], key, !(j.modules || []).length); }, function () { if (tokenRequest === request && body) { status('Pricing could not be loaded.', true); render([], key, true); } });
      return true;
    }
    /* the editor's own view while its plan is loading, refused or could not
       be checked is not a package: nothing is offered on it (every card
       would say Opt in, including what the workspace holds) */
    if (!host.view && view.pending) {
      status(view.refused ? view.refused + ' Saved projects stay available.' : view.loading ? 'Loading your plan…' : 'Your plan could not be checked, so what you hold and what each module costs cannot be shown yet.', !view.refused && !view.loading);
      return true;
    }
    render(view.catalog || [], key);
    var user = global.firebase && global.firebase.auth().currentUser;
    if (!user || !user.getIdToken || !global.fetch) { status('Sign in to view current pricing.'); return true; }
    user.getIdToken().then(function (token) { return global.fetch('/api/package-catalog', { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } }); })
      .then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); })
      .then(function (result) {
        if (tokenRequest !== request || !body || global.firebase.auth().currentUser !== user) return;
        status('Monthly prices. What you opt in to is paid first and switches on when the payment clears; a module your plan already covers turns on at no charge. What you opt out of stays on, and billed, until the quarterly review. Omega Design is always included.');
        /* who may change modules is the server's answer (or the page's, when
           it knows); the plan's summary is read by anyone who can read it,
           so a member sees what is in flight without the buttons */
        decided = host.admin !== undefined ? host.admin : !!result.canManage;
        lastRows = result.modules || [];
        return loadControl().then(function () {
          if (tokenRequest !== request || !body) return;
          control.canManage = decided;
          render(result.modules, key, !(result.modules || []).length);
        });
      }, function () {
        /* no prices, no buttons: nothing can be quoted without the book */
        if (tokenRequest === request) { status('Pricing could not be loaded.', true); control.failed = true; render(view.catalog || [], key, true); }
      });
    return true;
  }
  /* Escape closes; Tab stays inside the dialog */
  function trap(panel) {
    keydown = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        var focusable = panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]');
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
  }
  /* ── OPT IN, WHERE THE PLAN STOPS ───────────────────────────────────────
     Tommy, 2026-09-27: "if there is something that they don't have, it
     shouldn't be blank on the panel. It should say opt in and then allow
     them to add that as a purchase ... linked to the module ... linked to
     the payment ... something that updates their bill so that we can bill
     them for it." OmegaCaps marks a tab the plan opens nothing on where a
     module for sale has commands (data-optin: the same owners() rule that
     hides them). While it is the tab on screen, the ribbon shows those
     modules, the server's price and Opt in, instead of nothing. Opt in is
     the ONE purchase each kind of plan already has: a package opens The
     Ladder on the module (plan-change quote and apply, the invoice on its
     own rail, on when paid); a plan billed outside the engine adds it to
     the plan (addOnControl: addon-quote, addon-buy, QuickBooks' card page,
     I've paid; on when paid, renewed monthly on its own invoice beside the
     plan). Nothing here prices, grants or opens a command: when the
     payment clears the plan is read again (OmegaCaps.refresh) and the tab
     fills by itself. */
  var lockPrices = null, lockAsked = null, lockWatch = null;
  function optIn() {
    var caps = global.OmegaCaps, ribbon = document.getElementById('ribbon');
    if (!caps || !caps.lockedTabs || !ribbon) return;
    var strip = document.getElementById('ribbon-tabs');
    /* whoever switches the tab (a click, the phone's menu, Search tools) */
    if (!lockWatch && strip && global.MutationObserver) { lockWatch = new MutationObserver(function () { optIn(); }); lockWatch.observe(strip, { attributes: true, subtree: true, attributeFilter: ['class'] }); }
    var active = document.querySelector('#ribbon-tabs .rtab.active'), page = active && active.getAttribute('data-page'), lock = null;
    if (active && active.hasAttribute('data-optin') && !active.hasAttribute('data-omega-mode-hidden')) caps.lockedTabs().forEach(function (l) { if (l.page === page) lock = l; });
    var panel = document.getElementById('omega-optin');
    if (!lock || !ownEditor()) { if (panel) panel.className = 'oin'; return; }
    styles();
    if (!panel) { panel = node('div'); panel.id = 'omega-optin'; panel.setAttribute('role', 'region'); }
    if (panel.parentNode !== ribbon) ribbon.appendChild(panel);
    var view = caps.packageAccess(), key = [page, lock.modules.join(' '), view ? 'package' : 'plan', lockPrices ? 'priced' : ''].join('|');
    var shown = panel.className === 'oin oin-on' && panel.getAttribute('data-page') === page;
    if (panel.getAttribute('data-for') !== key) { drawLock(panel, lock); panel.setAttribute('data-for', key); }
    panel.setAttribute('aria-label', lock.label + ' is not on your plan'); panel.setAttribute('data-page', page);
    panel.className = 'oin oin-on';
    /* the ribbon is one scroller for every tab: the offer opens at its start,
       not wherever the last tab was scrolled to (on a phone, past its title) */
    if (!shown) { ribbon.scrollLeft = 0; ribbon.scrollTop = 0; }
    askPrices(view);
  }
  function drawLock(panel, lock) {
    var grants = global.OmegaCaps.MODULE_GRANTS;
    panel.textContent = '';
    var lead = node('div', '', 'oin-lead'), many = lock.modules.length > 1;
    lead.appendChild(node('b', lock.label + ' is not on your plan'));
    lead.appendChild(node('span', !lock.modules.length ? 'Its tools come with a module you can add to your plan.'
      : 'Opt in to ' + (many ? 'the module you need' : 'add ' + nameOf(lock.modules[0])) + '. ' + (many ? 'Each switches' : 'It switches') + ' on when the payment clears.'));
    panel.appendChild(lead);
    lock.modules.forEach(function (key) {
      var m = grants[key] || { key: key, name: key }, row = node('div', '', 'oin-mod'), text = node('div', '', 'oin-text'), line = node('small');
      row.setAttribute('data-optin-module', key);
      row.appendChild(node('span', m.mark || String(m.name).charAt(0), 'oin-mark'));
      text.appendChild(node('b', m.name));
      if (lockPrices && lockPrices[key]) line.appendChild(node('span', lockPrices[key], 'oin-price'));
      if ((m.features || [])[0]) line.appendChild(node('span', (line.firstChild ? ' · ' : '') + m.features[0], 'oin-feat'));
      text.appendChild(line);
      row.appendChild(text);
      var go = button('Opt in', function () { optInTo(key); }, 'oin-go'); go.setAttribute('aria-label', 'Opt in to ' + m.name);
      row.appendChild(go); panel.appendChild(row);
    });
    /* the server did not say which module: the workspace's Modules page
       does, in a new tab (the drawing here may not be saved) */
    if (!lock.modules.length) { var row = node('div', '', 'oin-mod'), a = link('/workspace#modules', 'Opt in on Modules'); a.className = 'oin-go'; row.appendChild(a); panel.appendChild(row); }
  }
  /* the price list the plan buys from: a package's (its own book) or the public one */
  function askPrices(view) {
    var want = view ? 'package' : 'plan';
    if (lockAsked === want) return;
    lockAsked = want;
    var ask = view ? api('/api/package-catalog') : global.fetch ? global.fetch('/api/offerings').then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); }) : Promise.reject(new Error('unavailable'));
    ask.then(function (j) {
      if (lockAsked !== want) return;
      var out = {}; (j.modules || []).forEach(function (m) { if (m.priceDisplay) out[m.key] = m.priceDisplay; });
      lockPrices = out; optIn();
    }, function () {
      /* no price list: the offer stands without prices (the quote has the
         server's), and it is asked again a minute later, never in a loop */
      setTimeout(function () { if (lockAsked === want) lockAsked = null; }, 60000);
    });
  }
  function optInTo(key) {
    var caps = global.OmegaCaps;
    if (caps && caps.packageAccess()) return open(key);
    return addOnDialog(key);
  }
  /* Opt in on a plan billed outside the engine: the module's card and the
     Add to plan control. Who may buy and what already waits for payment
     come from the workspace's own billing summary; when it cannot be read
     the server still decides on the first press. */
  function addOnDialog(key) {
    var caps = global.OmegaCaps, m = caps && caps.MODULE_GRANTS[key];
    if (!m) return false;
    close(); trigger = document.activeElement;
    host = { view: null, onChanged: null, legacy: null };
    styles();
    dialog = node('div', '', 'opm-backdrop'); dialog.id = 'omega-package-menu';
    var panel = node('div', '', 'opm-dialog opm-one'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'opm-title');
    var heading = node('h2', 'Opt in: ' + m.name); heading.id = 'opm-title'; panel.appendChild(heading);
    if (m.blurb) panel.appendChild(node('p', m.blurb, 'opm-note'));
    var dismiss = button('Close', close); panel.appendChild(dismiss);
    var card = node('section', '', 'opm-card'); card.setAttribute('data-module-card', key);
    card.appendChild(node('span', m.mark || String(m.name).charAt(0), 'opm-icon'));
    card.appendChild(node('h3', m.name));
    var list = node('ul'); (m.features || []).forEach(function (f) { list.appendChild(node('li', f)); }); card.appendChild(list);
    card.appendChild(node('p', (lockPrices && lockPrices[key]) || 'Priced when you add it', 'opm-price'));
    card.appendChild(node('p', 'Added to your plan as its own monthly line. Your plan and its billing stay as they are.', 'opm-note'));
    var act = node('div', 'Loading…', 'opm-act'); card.appendChild(act);
    panel.appendChild(card); dialog.appendChild(panel); document.body.appendChild(dialog);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    trap(panel); dismiss.focus();
    var token = ++request;
    function control(state) { if (token !== request || !act.isConnected) return; state.onChanged = bought; addOnControl(act, m, state); }
    api('/api/plan-change').then(function (s) {
      var waiting = null;
      (((s && s.addOns) || {}).pending || []).forEach(function (p) { if (!waiting && (p.add || []).indexOf(key) >= 0) waiting = p; });
      control({ canManage: s.canManage !== false, pending: waiting });
    }, function () { control({ canManage: true, pending: null }); });
    return true;
  }
  /* paid (or nothing owed): read the plan again; when it moved, the tab
     fills and the toast says where, so the dialog steps aside. When the
     plan could not be read, "Paid. … is on." stays on screen and the next
     re-check (focus, ten minutes) opens the tab. */
  function bought(r) {
    var caps = global.OmegaCaps;
    if (!r || r.state !== 'active' || !caps || !caps.refresh) return;
    caps.refresh().then(function (d) { if (d && d.changed) close(); }, function () {});
  }
  /* the dialog's styles, once, wherever it opens (the editor's tab() used to be the only caller) */
  function styles() {
    if (document.getElementById('omega-package-menu-style')) return;
    var style = node('style'); style.id = 'omega-package-menu-style'; style.textContent =
      '.opm-backdrop{position:fixed;inset:0;z-index:999999;background:#0008;display:flex;align-items:center;justify-content:center;padding:24px}' +
      /* the tokens also on .opm-host: a page that wraps the subscribe
         control outside the dialog; dark follows the OS unless the editor's
         theme switch (data-omega-theme on <html>) says otherwise */
      '.opm-backdrop,.opm-host{--opm-surface:#fff;--opm-text:#14171A;--opm-sub:#5B6672;--opm-border:#E1E7EB;--opm-sunk:#EEF1F3;--opm-blue:#2B5FA8;--opm-ok:#0B7A43;--opm-ok-bg:#E3F4EA}' +
      '@media(prefers-color-scheme:dark){html:not([data-omega-theme="light"]) .opm-backdrop,html:not([data-omega-theme="light"]) .opm-host{--opm-surface:#172029;--opm-text:#E6EBF0;--opm-sub:#94A1AE;--opm-border:#26323E;--opm-sunk:#10161D;--opm-blue:#6E9BE0;--opm-ok:#6FD39B;--opm-ok-bg:#12301F}}' +
      'html[data-omega-theme="dark"] .opm-backdrop,html[data-omega-theme="dark"] .opm-host{--opm-surface:#172029;--opm-text:#E6EBF0;--opm-sub:#94A1AE;--opm-border:#26323E;--opm-sunk:#10161D;--opm-blue:#6E9BE0;--opm-ok:#6FD39B;--opm-ok-bg:#12301F}' +
      '.opm-dialog{position:relative;width:1040px;max-width:100%;max-height:88vh;overflow:auto;background:var(--opm-surface);color:var(--opm-text);border:1px solid var(--opm-border);border-radius:14px;padding:24px;font:14px system-ui}' +
      '.opm-dialog>.opm-close{position:absolute;top:20px;right:20px}.opm-dialog>h2{padding-right:96px}.opm-dialog>.opm-note{margin:0 0 6px;max-width:760px}' +
      '.opm-dialog.opm-single{width:520px}.opm-single .opm-grid{grid-template-columns:1fr}' +
      '.opm-dialog h2{margin:0 0 12px;font:700 24px system-ui;text-transform:none;letter-spacing:normal;color:var(--opm-text)}.opm-dialog button{font:inherit;padding:8px 14px;border:1px solid var(--opm-border);border-radius:6px;cursor:pointer;background:var(--opm-surface);color:var(--opm-text)}' +
      '.opm-dialog .opm-link,.opm-host .opm-link{border:0;background:none;padding:4px 0;color:var(--opm-blue);text-decoration:underline;font-size:13px}' +
      '.opm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:14px;margin-top:18px}' +
      '.opm-card{border:1px solid var(--opm-border);border-radius:10px;padding:18px;display:flex;flex-direction:column}.opm-card[data-selected]{outline:2px solid var(--opm-blue)}' +
      '.opm-card[data-state="on"],.opm-card[data-state="lite"],.opm-card[data-state="addon-on"]{border-color:var(--opm-ok)}' +
      '.opm-top{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.opm-badge{font:600 11px system-ui;padding:3px 9px;border-radius:999px;background:var(--opm-sunk);color:var(--opm-sub);white-space:nowrap}.opm-badge.on{background:var(--opm-ok-bg);color:var(--opm-ok)}' +
      '.opm-card h3{font-size:16px;margin:10px 0}.opm-card ul{padding-left:18px;line-height:1.7;margin:0 0 10px}.opm-price{font-weight:600;margin:0 0 4px}.opm-note{font-size:12px;color:var(--opm-sub);line-height:1.6}' +
      '.opm-needs{font-size:12px;font-weight:600;color:var(--opm-blue);margin:0 0 6px}' +
      '.opm-icon{display:inline-flex;width:30px;height:30px;border-radius:7px;align-items:center;justify-content:center;background:var(--opm-sunk);color:var(--opm-blue);font-weight:700}' +
      '.opm-act{margin-top:auto;padding-top:10px;display:grid;gap:6px}.opm-act p{margin:0}.opm-quote{font-weight:600}.opm-wait{font-weight:600;color:var(--opm-blue)}.opm-reason{color:#B45F06;font-size:12px}' +
      '.opm-row{display:flex;flex-wrap:wrap;gap:6px}.opm-act button{font:500 13px system-ui;padding:7px 12px;border:1px solid var(--opm-border);border-radius:6px;background:var(--opm-surface);color:var(--opm-text);cursor:pointer}' +
      '.opm-act .opm-primary,.opm-dialog .opm-primary{background:var(--opm-blue);color:#fff;border-color:var(--opm-blue)}.opm-act a{color:var(--opm-blue)}' +
      /* an add-on's pay link is a button; the billing contact a short form */
      '.opm-act a.opm-paylink{display:inline-flex;align-items:center;justify-self:start;padding:7px 12px;border-radius:6px;background:var(--opm-blue);border:1px solid var(--opm-blue);color:#fff;text-decoration:none;font:600 13px system-ui}' +
      '.opm-profile{display:grid;gap:8px;max-height:52vh;overflow:auto;padding:2px}.opm-profile .obp-field{display:grid;gap:3px;font:500 12px system-ui;color:var(--opm-sub)}' +
      '.opm-profile .obp-field input,.opm-profile .obp-field select{font:14px system-ui;padding:7px 9px;border:1px solid var(--opm-border);border-radius:6px;background:var(--opm-surface);color:var(--opm-text);min-width:0}' +
      '.opm-profile .obp-field input[type=checkbox]{justify-self:start;width:auto}' +
      /* held, in the editor: where it is, and Show me */
      '.opm-on{display:flex;align-items:center;gap:10px;margin:-4px 0 6px;font-size:12px;font-weight:600;color:var(--opm-ok)}' +
      '.opm-dialog .opm-on .opm-link{padding:2px 8px;font:600 12px system-ui;background:transparent;color:var(--opm-blue)}' +
      /* the strip and the toast sit in the editor's own chrome: its tokens, both themes */
      '.opm-notice{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:7px 14px;font:12.5px/1.45 system-ui;background:var(--panel,#16202B);color:var(--text,#E6EBF0);border-bottom:1px solid var(--border,#26323E);border-left:3px solid var(--accent,#4A8FD8)}' +
      '.opm-notice.opm-bad{border-left-color:var(--warn,#C9A24E)}.opm-notice span{flex:1 1 320px}.opm-notice a{color:var(--accent,#4A8FD8);font-weight:600}.opm-notice p{margin:0;flex-basis:100%;color:var(--sub,#94A1AE)}.opm-notice p:empty{display:none}' +
      '.opm-notice button,.opm-toast button{font:600 12px system-ui;padding:5px 11px;border-radius:6px;border:1px solid var(--border,#26323E);background:transparent;color:var(--text,#E6EBF0);cursor:pointer}' +
      '.opm-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:1000000;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;width:max-content;max-width:min(620px,calc(100vw - 32px));box-sizing:border-box;padding:12px 14px 12px 16px;border-radius:10px;border:1px solid var(--border,#26323E);background:var(--panel,#16202B);color:var(--text,#E6EBF0);font:13px/1.45 system-ui;box-shadow:0 10px 32px #0006}' +
      '.opm-toast span{flex:1 1 260px}.opm-toast a{color:var(--accent,#4A8FD8);font-weight:600}.opm-toast .opm-primary{background:var(--accent,#4A8FD8);border-color:var(--accent,#4A8FD8);color:var(--on-accent,#fff)}.opm-toast .opm-x{border-color:transparent;color:var(--sub,#94A1AE)}' +
      '[data-opm-spot]{outline:2px solid var(--accent,#4A8FD8)!important;outline-offset:2px;border-radius:6px;animation:opm-spot 1.3s ease-in-out 2}' +
      '@keyframes opm-spot{50%{outline-color:transparent}}@media(prefers-reduced-motion:reduce){[data-opm-spot]{animation:none}}' +
      '@media(max-width:560px){.opm-backdrop{padding:10px}.opm-dialog{padding:16px;max-height:94vh}.opm-grid{grid-template-columns:1fr}}' +
      /* Opt in where the plan stops: in the ribbon, in the editor's own tokens, both themes */
      '#omega-optin{display:none}#omega-optin.oin-on{display:flex;align-items:stretch;flex:0 0 auto;min-width:100%;height:100%;box-sizing:border-box}' +
      '.oin-lead{display:flex;flex-direction:column;justify-content:center;gap:3px;flex:0 0 auto;width:230px;scroll-snap-align:start;padding:6px 14px;box-sizing:border-box;border-right:1px solid var(--border,#26323E);font:11.5px/1.4 system-ui,sans-serif;color:var(--sub,#94A1AE)}' +
      '.oin-lead b{font-size:12.5px;color:var(--text,#E6EBF0)}' +
      '.oin-mod{display:flex;align-items:center;gap:10px;flex:0 0 auto;max-width:360px;padding:6px 14px;box-sizing:border-box;border-right:1px solid var(--border,#26323E)}' +
      '.oin-mark{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;background:var(--hover,#1E2A36);color:var(--accent,#4A8FD8);font:700 13px system-ui,sans-serif}' +
      '.oin-text{display:flex;flex-direction:column;gap:2px;min-width:0}.oin-text b{font:600 12.5px system-ui,sans-serif;color:var(--text,#E6EBF0);white-space:nowrap}' +
      '.oin-text small{font:11px/1.35 system-ui,sans-serif;color:var(--sub,#94A1AE);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.oin-text small:empty{display:none}' +
      '.oin-go{flex:0 0 auto;padding:7px 14px;border-radius:6px;border:1px solid var(--accent,#4A8FD8);background:var(--accent,#4A8FD8);color:var(--on-accent,#fff);font:600 12px system-ui,sans-serif;white-space:nowrap;text-decoration:none;cursor:pointer}' +
      '.oin-go:focus-visible{outline:2px solid var(--text,#E6EBF0);outline-offset:2px}' +
      /* under a package the ribbon wraps its groups; the offer wraps with it */
      'body[data-packaged-editor="1"] #omega-optin.oin-on{flex:1 1 100%;width:100%;min-width:0;flex-wrap:wrap;height:auto}' +
      'body.omega-dock-left #omega-optin.oin-on{flex-direction:column;height:auto}body.omega-dock-left .oin-lead,body.omega-dock-left .oin-mod{width:auto;max-width:none;border-right:none;border-bottom:1px solid var(--hairline,#26323E)}' +
      /* a phone: the first module and its Opt in fit the screen, the next one peeks */
      '@media(max-width:520px){.oin-lead{width:124px;padding:6px 10px}.oin-lead span,.oin-mark,.oin-feat{display:none}' +
      '.oin-mod{flex-direction:column;align-items:flex-start;justify-content:center;gap:5px;max-width:190px;padding:6px 10px}.oin-go{padding:5px 12px}}' +
      '.opm-dialog.opm-one{width:560px}';
    document.head.appendChild(style);
  }
  function tab() {
    var tabs = document.getElementById('ribbon-tabs'), view = global.OmegaCaps && global.OmegaCaps.packageAccess();
    /* not while sign-in is still reading the plan: nothing to offer yet */
    if (view && view.loading) return;
    if (!tabs || document.getElementById('omega-package-tab')) return;
    styles();
    var button = node('button', 'The Ladder', 'rtab'); button.id = 'omega-package-tab'; button.title = 'The Ladder: build your own experience and pay for what you need'; button.type = 'button'; button.onclick = function () { open(); }; tabs.appendChild(button);
  }
  function staffPreview() {
    var view = global.OmegaCaps && global.OmegaCaps.packageAccess(), bar = document.getElementById('omega-workspace-controls');
    var existing = document.getElementById('omega-package-preview');
    if (!view || !view.canPreview) { if (existing) existing.remove(); return; }
    if (!bar || existing) return;
    var label = node('label', 'Viewing as '); label.id = 'omega-package-preview';
    var select = node('select'); select.setAttribute('aria-label', 'Viewing as package');
    var choices = { staff: null, lite: ['lite'] };
    Object.keys(view.starters || {}).forEach(function (key) { choices[key] = view.starters[key]; });
    Object.keys(choices).forEach(function (key) { var option = node('option', key === 'staff' ? 'Staff · all tools' : key); option.value = key; select.appendChild(option); });
    var notice = node('span'); notice.setAttribute('role', 'status');
    select.onchange = function () {
      var selected = select.value, user = global.firebase && global.firebase.auth().currentUser;
      if (!user || !user.getIdToken) return;
      select.disabled = true; notice.textContent = 'Loading preview…';
      user.getIdToken().then(function (token) {
        var options = { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } };
        if (selected !== 'staff') { options.method = 'POST'; options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify({ previewModules: choices[selected] }); }
        return global.fetch('/api/package-access', options);
      }).then(function (response) { if (!response.ok) throw new Error('Preview unavailable'); return response.json(); })
        .then(function (projection) {
          if (global.firebase.auth().currentUser !== user) throw new Error('Account changed');
          if (!projection.canPreview) throw new Error('Staff preview unavailable');
          global.OmegaCaps.setPackage(projection); global.OmegaCaps.apply('standard');
          notice.textContent = selected === 'staff' ? '' : 'Presentation preview'; select.disabled = false;
        }, function () { notice.textContent = 'Preview unavailable. Try again.'; select.disabled = false; });
    };
    label.appendChild(select); label.appendChild(notice); bar.appendChild(label);
  }
  // The same server catalog drives the staff picker, signup and customer view.
  // Dependencies are presentation only; the server independently normalizes
  // every selection and is the sole authority for prices and access.
  // options.notes { moduleKey: text } labels a module (the staff record marks
  // what a tenant asked to opt in to or out of).
  function picker(host, options) {
    var rows = options.catalog || [], selected = (options.modules || ['lite']).slice(), notes = options.notes || {};
    var office = rows.filter(function (m) { return m.key === 'logic-office'; })[0];
    function choose(key, on) {
      if (key === 'lite') return;
      if (on) {
        if (selected.indexOf(key) < 0) selected.push(key);
        var match = rows.filter(function (m) { return m.key === key; })[0];
        (match.requires || []).forEach(function (dep) { if (selected.indexOf(dep) < 0) selected.push(dep); });
      } else selected = selected.filter(function (k) {
        var match = rows.filter(function (m) { return m.key === k; })[0];
        return k !== key && (!match || (match.requires || []).indexOf(key) < 0);
      });
      draw(); if (options.onChange) options.onChange(selected.slice());
    }
    function draw() {
      host.textContent = ''; var shelves = {};
      rows.forEach(function (m) {
        if (!shelves[m.shelf]) {
          var shelf = node('div', '', 'pkm-shelf');
          shelf.appendChild(node('h4', m.shelfLabel || m.shelf));
          var grid = node('div', '', 'pkm-mods'); shelf.appendChild(grid); shelves[m.shelf] = grid; host.appendChild(shelf);
        }
        var owned = selected.indexOf(m.key) >= 0, item = node('label', '', 'pkm-mod' + (owned ? ' on' : ''));
        item.setAttribute('data-module-card', m.key);
        var checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = owned;
        checkbox.disabled = options.readOnly === true || m.key === 'lite'; checkbox.setAttribute('aria-label', m.name);
        checkbox.onchange = function () { choose(m.key, checkbox.checked); };
        item.appendChild(checkbox); var title = node('span', '', 'pkm-name'); title.appendChild(node('b', m.name)); title.appendChild(node('span', m.priceDisplay || 'Pricing unavailable', 'pkm-price')); item.appendChild(title);
        item.appendChild(node('span', (m.features || []).join(' · '), 'pkm-desc'));
        if (m.coverage) item.appendChild(node('span', m.coverage, 'pkm-desc'));
        if (m.agreement) item.appendChild(node('span', m.agreement, 'pkm-desc'));
        var tags = node('span', '', 'pkm-tags');
        if (notes[m.key]) { var flag = node('span', notes[m.key], 'pkm-tag flag'); flag.setAttribute('data-request', m.key); flag.style.fontWeight = '700'; tags.appendChild(flag); }
        if (m.usageDisplay) tags.appendChild(node('span', m.usageDisplay, 'pkm-tag'));
        if (m.key === 'lite') tags.appendChild(node('span', 'Always included', 'pkm-tag'));
        if (m.beta && m.beta.length) tags.appendChild(node('span', 'BETA', 'pkm-tag beta'));
        if ((m.requires || []).indexOf('logic-office') >= 0) tags.appendChild(node('span', 'Needs ' + (office ? office.name : 'Logic Office'), 'pkm-tag'));
        if (options.readOnly && owned && m.key !== 'lite') tags.appendChild(node('span', 'On · opt out at review', 'pkm-tag'));
        item.appendChild(tags); shelves[m.shelf].appendChild(item);
      });
    }
    draw(); return { value: function () { return selected.slice(); }, set: function (keys) { selected = keys.slice(); draw(); if (options.onChange) options.onChange(selected.slice()); } };
  }
  global.OmegaPackageMenu = { open: open, close: close, tab: tab, staffPreview: staffPreview, picker: picker, card: card, subscribeControl: subscribeControl, addOnControl: addOnControl, loadControl: loadControl, api: api, styles: styles,
    notice: notice, where: where, places: places, showMe: showMe, optIn: optIn, addOnDialog: addOnDialog };
})(typeof window !== 'undefined' ? window : this);
