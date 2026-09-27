/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The one module menu, "The Ladder" (Phase 5, 10B; the words of 2026-09-27:
 * Opt in, Opt in and pay, Turn it on, Opt out, Cancel request). Server
 * catalog, server quotes and server-formatted prices only. Every change is a
 * POST to /api/plan-change, and every step shows what it does to the bill
 * before anything is written. The browser never prices anything and never
 * grants access — the tools appear when the server's projection says so.
 */
(function (global) {
  'use strict';
  var dialog, body, statusLine, trigger, keydown, request = 0, control = { canManage: false, pending: {}, loaded: false };
  /* Where the menu is open outside the editor (the workspace, the dashboard's
     Account panel, a locked tile), the page hands over its own package view,
     a callback and how to open; inside the editor OmegaCaps is the view. */
  var host = { view: null, onChanged: null, legacy: null, single: false, admin: undefined, company: null, key: null, options: null };
  /* opened with an intent ('add' | 'remove' | 'cancel'): the card for that
     module goes straight to that step's confirm panel, once */
  var intent = null;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
  /* "Office, Plant and Materials" */
  function names(list) { list = list || []; return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }
  /* "$1,299" out of "$1,299/month": the sentence already says monthly */
  function fee(display) { return String(display || '').replace(/\/month$/, ''); }
  function when(value) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '')); return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : String(value || ''); }
  function open_(map, key) { var e = map && map[key]; return !!e && e.status === 'requested'; }
  function byKey(state, key) { var rows = state.catalog || lastRows || []; for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i]; return null; }
  function nameOf(state, key) { var m = byKey(state, key); return m ? m.name : key; }
  function company(state) { return (state.legacy && state.legacy.company) || state.company || host.company || 'your workspace'; }
  function canChange(state) { return state.admin === false ? false : state.admin === true ? true : !!state.canManage; }
  function wants(key, kind) { if (intent && intent.key === key && intent.kind === kind) { intent = null; return true; } return false; }
  function withOrg(state, payload) { if (state.orgId) payload.orgId = state.orgId; return payload; }
  /* Where a module stands for this workspace: one answer per card, and the
     card's badge, price line and one control all follow it. */
  function standing(m, state) {
    if (m.key === 'lite') return 'lite';
    if (state.legacy) {
      var bl = state.legacy.billing || {}, st = (state.legacy.states || {})[m.key];
      if (open_(bl.optOuts, m.key)) return 'opting-out';
      if (open_(bl.optIns, m.key)) return 'requested';
      if (!st) st = state.owned || (state.ownedModules || []).indexOf(m.key) >= 0 ? 'held' : 'ask';
      return st === 'held' ? 'on' : st === 'part' ? 'part' : 'off';
    }
    var sum = state.summary || {}, on = !!state.owned || (sum.modules || []).indexOf(m.key) >= 0, bought = (sum.subscription || []).indexOf(m.key) >= 0;
    if (state.pending && state.pending[m.key]) return 'waiting';
    if ((sum.removalRequests || []).some(function (r) { return r.module === m.key; })) return 'removing';
    if (bought && !on) return 'bought';
    return on || bought ? 'on' : 'off';
  }
  var BADGE = { lite: '● On your plan', on: '● On your plan', removing: 'Opting out', 'opting-out': 'Opting out', waiting: 'Waiting for payment', bought: 'Bought · not on yet', requested: 'Opt-in requested', part: 'Partly included' };
  var HELD = { lite: 1, on: 1, removing: 1, 'opting-out': 1, bought: 1 };
  /* the card around a control follows the control's answer, so the badge and
     the price line never disagree with the button under them */
  function paintCard(el, st) {
    var card = el; while (card && !(card.className && /(^| )opm-card( |$)/.test(card.className))) card = card.parentNode;
    if (!card || !card.querySelector) return;
    var badge = card.querySelector('.opm-badge'), price = card.querySelector('.opm-price');
    if (badge) { badge.textContent = BADGE[st] || ''; badge.hidden = !BADGE[st]; badge.className = 'opm-badge' + (st === 'on' || st === 'lite' ? ' on' : ''); }
    if (price) price.textContent = HELD[st] ? 'In your plan' : card.getAttribute('data-price') || (card.getAttribute('data-loading') ? '' : 'Pricing unavailable');
    card.setAttribute('data-state', st);
  }
  /* One control, every place that sells a module: the Ladder, Your plan in
     the account pages and the staff record, the store. state: { canManage,
     admin, pending: { moduleKey: pendingChange }, summary, owned, legacy,
     catalog, ownedModules, orgId, company, loading, onChanged(result) }. */
  function subscribeControl(el, m, state) {
    el.textContent = ''; el.className = 'opm-act'; el.setAttribute('data-subscribe', m.key);
    var st = standing(m, state); paintCard(el, st);
    if (st === 'lite') { el.appendChild(node('p', 'Lite is the baseline and is always included.', 'opm-note')); return; }
    if (state.loading) return;
    var admin = canChange(state);
    function again() { subscribeControl(el, m, state); }
    function failed(e, fallback) {
      el.textContent = ''; el.appendChild(node('p', e.message, 'opm-reason'));
      row(el, [button('Try again', again)]);
      /* a plan billed outside the engine can always ask by email; the line
         is there only when the request itself could not be recorded */
      if (state.legacy && state.legacy.email && fallback) {
        var line = node('p', 'Or email ', 'opm-note'), a = node('a', state.legacy.email);
        a.href = 'mailto:' + encodeURIComponent(state.legacy.email) + '?subject=' + encodeURIComponent(fallback + ' for ' + company(state)) + '&body=' + encodeURIComponent(company(state) + ': ' + fallback + '. Lite stays included.');
        line.appendChild(a); el.appendChild(line);
      }
    }
    function done(result, text) {
      el.textContent = ''; if (text) el.appendChild(node('p', text, 'opm-wait'));
      if (state.onChanged) state.onChanged(result);
    }
    function busy(text) { el.textContent = ''; el.appendChild(node('p', text, 'opm-note')); }
    /* ── what is in flight says so, to everyone who can read the plan ── */
    var sum = state.summary || {}, bl = (state.legacy && state.legacy.billing) || {}, p = state.pending && state.pending[m.key];
    /* a short bold line says where it stands; the note under it says what that means for the bill */
    function standingLine(text, note) { el.appendChild(node('p', text, 'opm-wait')); if (note) el.appendChild(node('p', note, 'opm-note')); }
    if (st === 'waiting') {
      standingLine('Waiting for payment · ' + p.display + (p.expiresOn ? ' · pay by ' + when(p.expiresOn) : ''), 'It switches on when the payment clears.');
      if (p.paymentLink) el.appendChild(link(p.paymentLink, 'Pay in QuickBooks'));
    } else if (st === 'removing') {
      standingLine('Opting out · ' + (sum.nextReviewOn ? 'review on ' + when(sum.nextReviewOn) : 'at the next quarterly review'), 'It stays on, and billed, until your review; no refund for time already billed.');
    } else if (st === 'bought') {
      standingLine('Bought · not on yet', 'It switches on when your open invoice is paid.');
      if (sum.paymentLink) el.appendChild(link(sum.paymentLink, 'Pay in QuickBooks'));
    } else if (st === 'requested') {
      var oi = bl.optIns[m.key];
      standingLine('Opt-in requested' + (oi.requestedAt ? ' · ' + when(oi.requestedAt) : '') + (oi.display ? ' · ' + oi.display : ''), 'ClearSky moves you to monthly billing and confirms it; nothing is charged before you approve that invoice.');
    } else if (st === 'opting-out') {
      var oo = bl.optOuts[m.key];
      standingLine('Opting out · requested' + (oo.requestedAt ? ' ' + when(oo.requestedAt) : ''), 'ClearSky confirms the date and any price change in writing; access is unchanged until then.');
    } else if (st === 'part') {
      el.appendChild(node('p', 'Partly included: some of its tools are on your plan. Opting in adds the rest.', 'opm-note'));
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
      cancelPanel('Cancel the ' + names(p.names || [m.name]) + ' request?', 'Nothing is switched on and nothing is charged. The QuickBooks invoice stays open until ClearSky voids it; if it is paid anyway, ClearSky reviews it.', null, function () {
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
    function legacyCancel(field, action) {
      var map = bl[field] || {}, also = Object.keys(map).filter(function (k) {
        if (k === m.key || !open_(map, k)) return false;
        var dep = byKey(state, k);
        return field === 'optIns' ? !!dep && (dep.requires || []).indexOf(m.key) >= 0 : (m.requires || []).indexOf(k) >= 0;
      });
      var title = field === 'optIns' ? 'Cancel the opt-in request for ' + m.name + '?' : 'Cancel the opt-out of ' + m.name + '?';
      var extra = also.length ? (field === 'optIns' ? names(also.map(function (k) { return nameOf(state, k); })) + (also.length > 1 ? ' need' : ' needs') + ' it, so ' + (also.length > 1 ? 'those requests are' : 'that request is') + ' cancelled too.'
        : 'It needs ' + names(also.map(function (k) { return nameOf(state, k); })) + ', so ' + (also.length > 1 ? 'those are' : 'that is') + ' kept too.') : null;
      cancelPanel(title, 'Nothing about your bill changes.', extra, function () {
        busy('Cancelling…');
        var payload = { action: action }; payload[field === 'optIns' ? 'add' : 'remove'] = [m.key];
        api('/api/plan-change', withOrg(state, payload)).then(function (r) { remember(state, r); done(r, 'Cancelled. Nothing about your bill changes.'); }, function (e) { failed(e, 'Cancel the request for ' + m.name); });
      });
    }
    if (st === 'waiting') { row(el, [button('Cancel request', cancelChange)]); if (wants(m.key, 'cancel')) cancelChange(); return; }
    if (st === 'removing') { row(el, [button('Cancel request', cancelRemoval)]); if (wants(m.key, 'cancel')) cancelRemoval(); return; }
    if (st === 'requested') { var c1 = function () { legacyCancel('optIns', 'withdraw-opt-in'); }; row(el, [button('Cancel request', c1)]); if (wants(m.key, 'cancel')) c1(); return; }
    if (st === 'opting-out') { var c2 = function () { legacyCancel('optOuts', 'withdraw-opt-out'); }; row(el, [button('Cancel request', c2)]); if (wants(m.key, 'cancel')) c2(); return; }

    /* ── Opt out (of what is on, or bought and waiting for its invoice) ── */
    if (st === 'on' || st === 'bought') {
      var out = state.legacy ? function () {
        busy('Checking…');
        api('/api/plan-change', withOrg(state, { action: 'opt-out', remove: [m.key], dryRun: true })).then(function (q) {
          el.textContent = '';
          el.appendChild(node('p', 'Opt out of ' + names(q.names) + '?', 'opm-quote'));
          el.appendChild(node('p', q.note, 'opm-note'));
          if (q.names.length > 1) el.appendChild(node('p', 'Also opts out of ' + names(q.names.filter(function (n) { return n !== m.name; })) + ', which need' + (q.names.length > 2 ? '' : 's') + ' ' + m.name + '.', 'opm-note'));
          row(el, [button('Send opt-out request', function () {
            busy('Sending…');
            api('/api/plan-change', withOrg(state, { action: 'opt-out', remove: [m.key] })).then(function (r) { remember(state, r); done(r, 'Sent. ClearSky confirms the date and any price change with you.'); }, function (e) { failed(e, 'Opt out of ' + names(q.names)); });
          }, 'opm-primary'), button('Not now', again)]);
        }, function (e) { failed(e, 'Opt out of ' + m.name); });
      } : function () {
        busy('Checking what changes…');
        var ask = withOrg(state, { action: 'request-removal', remove: [m.key] });
        api('/api/plan-change', extend({ dryRun: true }, ask)).then(function (q) {
          el.textContent = '';
          var many = q.names.length > 1, until = q.reviewOn ? 'until your review on ' + when(q.reviewOn) : 'until your next quarterly review';
          var money = q.beforeDisplay && q.afterDisplay ? (fee(q.beforeDisplay) === fee(q.afterDisplay) ? 'Your monthly fee stays ' + fee(q.beforeDisplay) + '.' : 'From then your monthly fee goes from ' + fee(q.beforeDisplay) + ' to ' + fee(q.afterDisplay) + '.') : 'ClearSky confirms your new monthly fee at the review.';
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
      if (wants(m.key, 'remove')) out();
      return;
    }

    /* ── Opt in ── */
    function quote(plan) {
      busy('Pricing…');
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
            else { el.appendChild(node('p', 'Invoice created: ' + r.display + '. It switches on when the payment clears; pay by ' + when(r.expiresOn) + '.', 'opm-wait')); if (r.paymentLink) el.appendChild(link(r.paymentLink, 'Pay in QuickBooks')); }
            if (state.onChanged) state.onChanged(r);
          }, function (e) { failed(e); });
        }, 'opm-primary'), q.steer ? button(q.steer.display, function () { quote(q.steer.plan); }) : null, button('Not now', again)]);
      }, function (e) { failed(e); });
    }
    function legacyIn() {
      busy('Pricing…');
      api('/api/plan-change', withOrg(state, { action: 'opt-in', add: [m.key], dryRun: true })).then(function (q) {
        el.textContent = '';
        el.appendChild(node('p', 'Opt in to ' + names(q.names) + ' for ' + q.display + '?', 'opm-quote'));
        el.appendChild(node('p', q.note, 'opm-note'));
        if (q.add.length > 1) el.appendChild(node('p', 'Also adds ' + names(q.names.filter(function (n) { return n !== m.name; })) + ', which ' + m.name + ' needs.', 'opm-note'));
        row(el, [button('Request opt-in', function () {
          busy('Sending…');
          api('/api/plan-change', withOrg(state, { action: 'opt-in', add: [m.key] })).then(function (r) { remember(state, r); done(r, 'Requested ' + names(r.names) + ' at ' + r.display + '. ClearSky will confirm.'); }, function (e) { failed(e, 'Opt in to ' + names(q.names) + ' (' + q.display + ')'); });
        }, 'opm-primary'), button('Not now', again)]);
      }, function (e) { failed(e, 'Opt in to ' + m.name); });
    }
    var add = state.legacy ? legacyIn : function () { quote(null); };
    row(el, [button('Opt in', add, 'opm-primary')]);
    if (wants(m.key, 'add')) add();
  }
  /* a legacy write answers with the requests as stored; the menu's copy of
     the plan follows so the card redraws in its new state */
  function remember(state, r) {
    if (!state.legacy || !r) return;
    var b = state.legacy.billing = state.legacy.billing || {};
    if (r.optIns) b.optIns = extend({}, b.optIns || {}, r.optIns);
    if (r.optOuts) b.optOuts = extend({}, b.optOuts || {}, r.optOuts);
  }
  function loadControl() {
    return api('/api/plan-change').then(function (summary) {
      var pending = {}; (summary.pending || []).forEach(function (p) { (p.add || []).forEach(function (k) { pending[k] = p; }); });
      control = { canManage: true, pending: pending, loaded: true, summary: summary }; return control;
    }, function () { control = { canManage: false, pending: {}, loaded: true }; return control; });
  }
  function close() { if (dialog) dialog.remove(); if (keydown) document.removeEventListener('keydown', keydown); keydown = null; dialog = body = statusLine = null; intent = null; request++; if (trigger && trigger.focus) trigger.focus(); }
  function cardState(m) {
    var view = packageView();
    return { canManage: control.canManage, admin: host.admin, pending: control.pending, summary: control.summary, loading: !control.loaded,
      owned: !host.legacy && !!view && (view.modules || []).indexOf(m.key) >= 0, legacy: host.legacy, catalog: lastRows.length ? lastRows : view && view.catalog,
      ownedModules: view && view.modules, company: host.company, onChanged: changed };
  }
  function card(m, price, focus) {
    var el = node('section', '', 'opm-card'); el.setAttribute('data-module-card', m.key);
    if (price) el.setAttribute('data-price', price); else if (!control.loaded && !control.failed) el.setAttribute('data-loading', '1');
    var top = node('div', '', 'opm-top'); top.appendChild(node('span', m.name.slice(0, 1), 'opm-icon'));
    var badge = node('span', '', 'opm-badge'); badge.hidden = true; top.appendChild(badge); el.appendChild(top);
    el.appendChild(node('h3', m.name));
    var list = node('ul'); (m.features || []).forEach(function (f) { list.appendChild(node('li', f)); }); el.appendChild(list);
    el.appendChild(node('p', price || '', 'opm-price'));
    if (m.beta && m.beta.length) el.appendChild(node('p', 'BETA: ' + m.beta.join(', '), 'opm-note'));
    if (m.coverage) el.appendChild(node('p', m.coverage, 'opm-note'));
    if (m.agreement) el.appendChild(node('p', m.agreement, 'opm-note'));
    var state = cardState(m);
    /* one module on its own: say what else it brings before the button */
    if (host.single && dialog) {
      var need = (m.requires || []).filter(function (k) { var dep = byKey(state, k), at = dep && standing(dep, cardState(dep)); return k !== 'lite' && dep && !HELD[at] && at !== 'requested'; });
      if (need.length && !HELD[standing(m, state)]) el.appendChild(node('p', 'Also adds ' + names(need.map(function (k) { return nameOf(state, k); })) + ', which ' + m.name + ' needs.', 'opm-needs'));
    }
    // The control posts to the server; listing never changes modules[].
    subscribeControl(el.appendChild(node('div')), m, state);
    if (m.key === focus) { el.tabIndex = -1; el.setAttribute('data-selected', '1'); }
    return el;
  }
  var lastRows = [];
  function changed(result) {
    var user = global.firebase && global.firebase.auth().currentUser, caps = global.OmegaCaps;
    if (host.onChanged) { try { host.onChanged(result); } catch (e) {} }
    if (host.legacy) { if (body) render(lastRows, null); return; }
    var refresh = result && result.state === 'active' && caps && caps.fetchPackage && user && !host.view ? caps.fetchPackage(user).then(function () { caps.apply('standard'); }, function () {}) : Promise.resolve();
    refresh.then(function () { return control.canManage ? loadControl() : null; }).then(function () { control.canManage = decided; if (body) render(lastRows, null); });
  }
  var decided = false;
  function render(rows, focus, failure) {
    if (!body) return; lastRows = rows || [];
    body.textContent = '';
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
  function retry() { open(host.key, host.options); }
  function status(text, withRetry) {
    if (!statusLine) return; statusLine.textContent = text || '';
    if (withRetry) { statusLine.appendChild(document.createTextNode(' ')); statusLine.appendChild(button('Retry', retry, 'opm-link')); }
  }
  /* open(key, { view, onChanged, single, intent, admin, company, legacy:
     { company, email, billing, states } }). The Ladder is ONE dialog: the
     whole catalog, or (single) one module with what it needs; an intent
     skips the first click to the confirm panel that states the money. */
  function open(key, options) {
    options = options || {};
    close(); trigger = document.activeElement;
    var legacy = options.legacy ? extend({}, options.legacy) : null;
    if (legacy) { var lb = legacy.billing || {}; legacy.billing = extend({}, lb, { optIns: extend({}, lb.optIns || {}), optOuts: extend({}, lb.optOuts || {}) }); }
    host = { view: options.view || null, onChanged: options.onChanged || null, legacy: legacy, single: options.single === true && !!key, admin: typeof options.admin === 'boolean' ? options.admin : undefined,
      company: options.company || (legacy && legacy.company) || null, key: key || null, options: options };
    intent = key && ['add', 'remove', 'cancel'].indexOf(options.intent) >= 0 ? { key: key, kind: options.intent } : null;
    control = { canManage: false, pending: {}, loaded: false }; lastRows = []; decided = false;
    if (!document.getElementById('omega-package-menu-style')) styles();
    var view = packageView(); if (!view && !legacy) return false;
    var tokenRequest = ++request;
    dialog = node('div', '', 'opm-backdrop'); dialog.id = 'omega-package-menu';
    var panel = node('div', '', 'opm-dialog' + (host.single ? ' opm-single' : '')); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'opm-title');
    /* "The Ladder" (Tommy, 2026-09-26): build your own experience and pay
       for what you need to run your business; each Omega Logic department
       (Office, Plant, Materials & Purchasing, Logistics & Warranty, Customer
       App) is its own opt-in on it. That sentence belongs to Omega Logic, so
       it is said only when the Ladder opens on a department or on nothing. */
    var heading = node('h2', 'The Ladder'); heading.id = 'opm-title'; panel.appendChild(heading);
    if (!key || /^logic-/.test(key)) panel.appendChild(node('p', 'Build your own experience and pay for what you need to run your business. Omega Logic is by department: Office, Plant, Materials & Purchasing, Logistics & Warranty and the Customer App are each an opt-in.', 'opm-note'));
    var dismiss = node('button', 'Close', 'opm-close'); dismiss.type = 'button'; dismiss.onclick = close; panel.appendChild(dismiss);
    statusLine = node('p', legacy ? '' : 'Loading current pricing…', 'opm-note'); statusLine.setAttribute('role', 'status'); panel.appendChild(statusLine);
    body = node('div', '', 'opm-grid'); panel.appendChild(body);
    if (host.single) { var every = button('See every module', function () { open(key, extend({}, options, { single: false, intent: null })); }, 'opm-link'); every.id = 'opm-every'; panel.appendChild(every); }
    dialog.appendChild(panel); document.body.appendChild(dialog);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
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
    dismiss.focus();
    /* A plan billed outside the engine: the page's own price list and plan;
       every change is a request ClearSky confirms, so nothing waits on a
       server judgement before the cards can act. */
    if (legacy) {
      control = { canManage: true, pending: {}, loaded: true }; decided = true;
      status((legacy.company || 'This workspace') + ' is billed by ClearSky under its agreement. Opting in or out sends ClearSky a request with its price; nothing is charged, and nothing is switched off, until ClearSky confirms it with you. Lite is always included.');
      var rows = view && Array.isArray(view.catalog) && view.catalog.length ? view.catalog : null;
      if (rows) { render(rows, key); return true; }
      body.appendChild(node('p', 'Loading the modules…', 'opm-note'));
      global.fetch('/api/offerings', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); })
        .then(function (j) { if (tokenRequest === request && body) render(j.modules || [], key, !(j.modules || []).length); }, function () { if (tokenRequest === request && body) { status('Pricing could not be loaded.', true); render([], key, true); } });
      return true;
    }
    render(view.catalog || [], key);
    var user = global.firebase && global.firebase.auth().currentUser;
    if (!user || !user.getIdToken || !global.fetch) { status('Sign in to view current pricing.'); return true; }
    user.getIdToken().then(function (token) { return global.fetch('/api/package-catalog', { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } }); })
      .then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); })
      .then(function (result) {
        if (tokenRequest !== request || !body || global.firebase.auth().currentUser !== user) return;
        status('Monthly prices. What you opt in to is paid first and switches on when the payment clears; a module your plan already covers turns on at no charge. What you opt out of stays on, and billed, until the quarterly review. Lite is always included.');
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
  /* the dialog's styles, once, wherever it opens (the editor's tab() used to be the only caller) */
  function styles() {
    if (document.getElementById('omega-package-menu-style')) return;
    var style = node('style'); style.id = 'omega-package-menu-style'; style.textContent =
      '.opm-backdrop{position:fixed;inset:0;z-index:999999;background:#0008;display:flex;align-items:center;justify-content:center;padding:24px}' +
      /* the tokens also on .opm-host: a page that wraps the subscribe
         control outside the dialog (the marketplace's package store);
         dark follows the OS unless the editor's theme switch (data-omega-theme on <html>) says otherwise */
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
      '.opm-card[data-state="on"],.opm-card[data-state="lite"]{border-color:var(--opm-ok)}' +
      '.opm-top{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.opm-badge{font:600 11px system-ui;padding:3px 9px;border-radius:999px;background:var(--opm-sunk);color:var(--opm-sub);white-space:nowrap}.opm-badge.on{background:var(--opm-ok-bg);color:var(--opm-ok)}' +
      '.opm-card h3{font-size:16px;margin:10px 0}.opm-card ul{padding-left:18px;line-height:1.7;margin:0 0 10px}.opm-price{font-weight:600;margin:0 0 4px}.opm-note{font-size:12px;color:var(--opm-sub);line-height:1.6}' +
      '.opm-needs{font-size:12px;font-weight:600;color:var(--opm-blue);margin:0 0 6px}' +
      '.opm-icon{display:inline-flex;width:30px;height:30px;border-radius:7px;align-items:center;justify-content:center;background:var(--opm-sunk);color:var(--opm-blue);font-weight:700}' +
      '.opm-act{margin-top:auto;padding-top:10px;display:grid;gap:6px}.opm-act p{margin:0}.opm-quote{font-weight:600}.opm-wait{font-weight:600;color:var(--opm-blue)}.opm-reason{color:#B45F06;font-size:12px}' +
      '.opm-row{display:flex;flex-wrap:wrap;gap:6px}.opm-act button{font:500 13px system-ui;padding:7px 12px;border:1px solid var(--opm-border);border-radius:6px;background:var(--opm-surface);color:var(--opm-text);cursor:pointer}' +
      '.opm-act .opm-primary,.opm-dialog .opm-primary{background:var(--opm-blue);color:#fff;border-color:var(--opm-blue)}.opm-act a{color:var(--opm-blue)}' +
      '@media(max-width:560px){.opm-backdrop{padding:10px}.opm-dialog{padding:16px;max-height:94vh}.opm-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }
  function tab() {
    var tabs = document.getElementById('ribbon-tabs'); if (!tabs || document.getElementById('omega-package-tab')) return;
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
          shelf.appendChild(node('h4', { floor: 'Floor', addon: 'Add-on', standard: 'Standard', premium: 'Premium', deliverable: 'Deliverable', platform: 'Omega Logic' }[m.shelf] || m.shelf));
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
        if ((m.requires || []).indexOf('logic-office') >= 0) tags.appendChild(node('span', 'Needs Office', 'pkm-tag'));
        if (options.readOnly && owned && m.key !== 'lite') tags.appendChild(node('span', 'On · opt out at review', 'pkm-tag'));
        item.appendChild(tags); shelves[m.shelf].appendChild(item);
      });
    }
    draw(); return { value: function () { return selected.slice(); }, set: function (keys) { selected = keys.slice(); draw(); if (options.onChange) options.onChange(selected.slice()); } };
  }
  global.OmegaPackageMenu = { open: open, close: close, tab: tab, staffPreview: staffPreview, picker: picker, card: card, subscribeControl: subscribeControl, loadControl: loadControl, api: api, styles: styles };
})(typeof window !== 'undefined' ? window : this);
