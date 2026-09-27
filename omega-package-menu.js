/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The shared package gallery and the subscribe control (Phase 5). Server
 * catalog, server quotes and server-formatted prices only. Subscribing posts
 * to /api/plan-change; the browser never prices anything and never grants
 * access — the tools appear when the server's projection says so.
 */
(function (global) {
  'use strict';
  var dialog, body, trigger, keydown, request = 0, control = { canManage: false, pending: {}, loaded: false };
  /* Where the menu is open outside the editor (the dashboard's Account panel,
     a locked tile), the page hands over its own package view and a callback;
     inside the editor OmegaCaps is the view and the refresh. */
  var host = { view: null, onChanged: null, legacy: null };
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
  function link(href, text) { var a = node('a', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }
  function button(text, fn, cls) { var b = node('button', text, cls); b.type = 'button'; b.onclick = fn; return b; }
  function removalControl(target, m, state) {
    if (m.key === 'lite') { target.appendChild(node('p', 'Lite is the baseline and is always included.', 'opm-note')); return; }
    if (!state.canManage) { target.appendChild(node('p', 'Ask your workspace administrator to opt out of this module.', 'opm-note')); return; }
    var queued = ((state.summary || {}).removalRequests || []).some(function (r) { return r.module === m.key; });
    if (queued) target.appendChild(node('p', 'Opt-out requested · quarterly review. Access and charges remain unchanged.', 'opm-wait'));
    function review() {
      target.textContent = 'Reviewing…';
      var action = queued ? 'withdraw-removal' : 'request-removal';
      var preview = state.legacy ? Promise.resolve(legacyRemoval(m, state)) : api('/api/plan-change', { action: action, orgId: state.orgId || (state.summary || {}).orgId, remove: [m.key], dryRun: true });
      preview.then(function (q) {
        target.textContent = '';
        target.appendChild(node('p', (queued ? 'Keep: ' : 'Opt out: ') + q.names.join(', '), 'opm-quote'));
        target.appendChild(node('p', q.note, 'opm-note'));
        if (q.names.length > 1) target.appendChild(node('p', queued ? 'The modules it needs are kept too.' : 'This includes the modules that depend on it.', 'opm-note'));
        if (state.legacy) {
          var mail = node('a', 'Email opt-out request');
          mail.href = 'mailto:' + encodeURIComponent(state.legacy.email) + '?subject=' + encodeURIComponent('Opt out: ' + m.name + ' for ' + state.legacy.company)
            + '&body=' + encodeURIComponent('Please review the opt-out of ' + q.names.join(', ') + ' for ' + state.legacy.company + '. Confirm the effective date and any billing change under our existing agreement. Lite remains included.');
          target.appendChild(mail);
        } else target.appendChild(button(queued ? 'Confirm keep modules' : 'Confirm opt-out request', function () {
          target.textContent = 'Saving request…';
          api('/api/plan-change', { action: action, orgId: state.orgId || (state.summary || {}).orgId, remove: [m.key], previewId: q.previewId }).then(function (r) {
            target.textContent = r.note; if (state.onChanged) state.onChanged(r);
          }, failed);
        }, 'opm-primary'));
        target.appendChild(button('Cancel', function () { subscribeControl(target, m, state); }));
      }, failed);
    }
    function failed(e) { target.textContent = ''; target.appendChild(node('p', e.message, 'opm-reason')); target.appendChild(button('Try again', review)); }
    target.appendChild(button(queued ? 'Keep module' : 'Opt out', review));
  }
  /* Legacy billing stays on its existing support path. Catalog dependencies
     only explain the request; this browser never changes a grant or price. */
  function legacyRemoval(m, state) {
    var remove = [m.key], changed = true, rows = state.catalog || [], owned = state.ownedModules || [];
    while (changed) { changed = false; rows.forEach(function (row) {
      if (owned.indexOf(row.key) >= 0 && remove.indexOf(row.key) < 0 && (row.requires || []).some(function (k) { return remove.indexOf(k) >= 0; })) { remove.push(row.key); changed = true; }
    }); }
    return { names: rows.filter(function (row) { return remove.indexOf(row.key) >= 0; }).map(function (row) { return row.name; }),
      note: 'This workspace is billed outside the package engine. ClearSky will confirm the effective date and any billing change under your existing agreement. Sending the request does not change access, cancel charges or issue a refund. Lite remains included.' };
  }
  /* One control, three places: the editor's + Modules gallery, Your plan in
     the account pages, and the staff record. state: { canManage, pending:
     { moduleKey: pendingChange }, onChanged(result), actor }. */
  function subscribeControl(host, m, state) {
    host.textContent = ''; host.className = 'opm-act'; host.setAttribute('data-subscribe', m.key);
    if (m.key === 'lite' || state.owned || ((state.summary || {}).subscription || []).indexOf(m.key) >= 0) { removalControl(host, m, state); return; }
    var pendingChange = state.pending && state.pending[m.key];
    if (!state.canManage) { host.appendChild(node('p', 'Ask your workspace administrator to add this module.', 'opm-note')); return; }
    if (pendingChange) {
      host.appendChild(node('p', 'Waiting for payment · ' + pendingChange.display + ' · expires ' + pendingChange.expiresOn, 'opm-wait'));
      if (pendingChange.paymentLink) host.appendChild(link(pendingChange.paymentLink, 'Pay in QuickBooks'));
      var check = paidCheck(m, state);
      host.appendChild(check.button); host.appendChild(check.note);
      host.appendChild(button('Cancel request', function () {
        host.textContent = 'Cancelling…';
        api('/api/plan-change', { action: 'cancel', changeId: pendingChange.id }).then(function (r) { if (state.onChanged) state.onChanged(r); }, function (e) { host.textContent = e.message; });
      }));
      return;
    }
    function quote(plan) {
      host.textContent = 'Pricing…';
      var body = { action: 'quote', add: [m.key] }; if (plan) body.plan = plan;
      api('/api/plan-change', body).then(function (q) {
        host.textContent = '';
        host.appendChild(node('p', q.display.today, 'opm-quote'));
        host.appendChild(node('p', q.display.then, 'opm-note'));
        host.appendChild(node('p', q.display.activation, 'opm-note'));
        if (q.serviceFeeNote) host.appendChild(node('p', q.serviceFeeNote, 'opm-note'));
        if (q.add.length > 1) host.appendChild(node('p', 'Also adds what it needs: ' + (q.addNames || q.add).filter(function (n, i) { return q.add[i] !== m.key; }).join(', '), 'opm-note'));
        if (!q.canApply) { host.appendChild(node('p', q.reason, 'opm-reason')); host.appendChild(button('Close', function () { subscribeControl(host, m, state); })); return; }
        var row = node('div', '', 'opm-row');
        row.appendChild(button(q.included ? 'Turn it on' : 'Subscribe and pay', function () {
          host.textContent = q.included ? 'Turning it on…' : 'Creating your invoice…';
          var body = { action: 'apply', add: [m.key], previewId: q.previewId, effectiveAt: q.effectiveAt }; if (plan) body.plan = plan;
          api('/api/plan-change', body).then(function (r) {
            host.textContent = '';
            if (r.state === 'active') host.appendChild(node('p', 'Added. Your tools are updating…', 'opm-quote'));
            else { host.appendChild(node('p', 'Invoice created: ' + r.display + '. It switches on when the payment clears; pay before ' + r.expiresOn + '.', 'opm-wait')); if (r.paymentLink) host.appendChild(link(r.paymentLink, 'Pay in QuickBooks')); }
            if (state.onChanged) state.onChanged(r);
          }, function (e) { host.textContent = ''; host.appendChild(node('p', e.message, 'opm-reason')); host.appendChild(button('Try again', function () { subscribeControl(host, m, state); })); });
        }, 'opm-primary'));
        if (q.steer) row.appendChild(button(q.steer.display, function () { quote(q.steer.plan); }));
        row.appendChild(button('Cancel', function () { subscribeControl(host, m, state); }));
        host.appendChild(row);
      }, function (e) { host.textContent = ''; host.appendChild(node('p', e.message, 'opm-reason')); host.appendChild(button('Try again', function () { subscribeControl(host, m, state); })); });
    }
    host.appendChild(button('Subscribe', function () { quote(null); }, 'opm-primary'));
  }
  /* ── "I'VE PAID" ────────────────────────────────────────────────────────
     Paying happens on QuickBooks' page, in another tab; the module switches
     on when the platform sees the payment, which the hourly runner does on
     its own. This asks it to look now (plan-change reconcile-now, one look
     per workspace every eight seconds) and then asks the editor's plan
     again, so the person who just paid sees the tools without a reload.
     The browser decides nothing: `cleared()` reads the server's answer. */
  function paidCheck(m, state) {
    /* the workspace the card belongs to (staff act for a tenant in the master
       console) and the page's own "it changed" (the store, the console, the
       editor's dialog) */
    var note = node('p', '', 'opm-note'), orgId = state.orgId || (state.summary || {}).orgId || null;
    note.setAttribute('role', 'status');
    var b = button("I've paid", function () {
      b.disabled = true; b.textContent = 'Checking QuickBooks…'; note.textContent = '';
      var said = null, ask = { action: 'reconcile-now' }; if (orgId) ask.orgId = orgId;
      api('/api/plan-change', ask).then(function (r) { said = r; }, function (e) { said = { error: e.message }; })
        .then(function () { return api('/api/plan-change' + (orgId ? '?orgId=' + encodeURIComponent(orgId) : '')); })
        .then(function (summary) {
          var still = (summary.pending || []).some(function (p) { return (p.add || []).indexOf(m.key) >= 0; });
          if (!still) { (state.onChanged || changed)({ state: 'active', add: [m.key] }); return; }
          b.disabled = false; b.textContent = "I've paid";
          note.textContent = said && said.throttled ? 'Checked a moment ago. Try again in a few seconds.' :
            said && said.error ? said.error : 'QuickBooks does not show this payment yet. A card payment usually shows within a minute.';
        }, function () { b.disabled = false; b.textContent = "I've paid"; note.textContent = 'The payment could not be checked right now. Try again in a moment.'; });
    });
    return { button: b, note: note };
  }
  /* ── WHERE A MODULE LIVES IN THE EDITOR ─────────────────────────────────
     Read off the ribbon as it stands, by the same owners() rule that gates
     it, so there is no second list of which tab a module is on. Prefers the
     catalog's editorPage when the module has one. */
  function usable(el) {
    return !el.hasAttribute('data-packaging-retired') && !el.hasAttribute('data-omega-retired') && !el.hasAttribute('data-shelf-dupe') && !el.classList.contains('omega-gated-hidden');
  }
  function places() {
    var caps = global.OmegaCaps, out = {}; if (!caps || !caps.packageAccess() || !document.getElementById('ribbon')) return out;
    var els = document.querySelectorAll('#ribbon .ribbon-page .rbtn,#ribbon .ribbon-page .rsbtn');
    for (var i = 0; i < els.length; i++) {
      var el = els[i]; if (!usable(el) || el.hasAttribute('data-package-hidden') || el.hasAttribute('data-cap-blocked')) continue;
      var own = caps.owners(el.id || '', el.getAttribute('onclick') || ''); if (!own.length) continue;
      var page = el.closest('.ribbon-page').getAttribute('data-page'), tab = document.querySelector('#ribbon-tabs .rtab[data-page="' + page + '"]');
      if (!tab) continue;
      own.forEach(function (key) {
        var grant = caps.MODULE_GRANTS[key] || {}, held = out[key];
        if (held && (held.page === grant.editorPage || page !== grant.editorPage)) return;
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
    setTimeout(function () { hit.el.removeAttribute('data-opm-spot'); }, 2600);
    return true;
  }
  function nameOf(key) { var g = global.OmegaCaps && global.OmegaCaps.MODULE_GRANTS[key]; return g ? g.name : key; }
  function sentence(list) { return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }
  /* ── SAY WHAT CHANGED ───────────────────────────────────────────────────
     OmegaCaps.refresh() announces a plan that moved while the editor was
     open. Without a word the ribbon just rearranges itself: a tab appears
     that nobody asked where to find, or the tools someone was using vanish.
     One line, what moved, where it is, and a way to it. */
  var toastTimer = null;
  function toast(text, action) {
    styles();
    var old = document.getElementById('omega-plan-toast'); if (old) old.remove();
    if (toastTimer) clearTimeout(toastTimer);
    var t = node('div', '', 'opm-toast'); t.id = 'omega-plan-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
    t.appendChild(node('span', text));
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
       me"); a toast over the dialog would only cover it. */
    /* a member's cards stay a member's: only a manager's controls are reloaded */
    if (body) { (control.canManage ? loadControl() : Promise.resolve()).then(function () { if (body) render(lastRows, null); }); return; }
    if (!document.getElementById('ribbon')) return;
    var added = (d.packaged ? d.added : []).filter(function (k) { return k !== 'lite'; }), removed = d.packaged ? d.removed : [];
    if (d.readOnly && !d.wasReadOnly) return toast('This workspace is read-only now. Saved projects stay available; pay to keep creating and exporting.', link('/workspace#billing', 'Plan & billing'));
    if (d.recovered) return toast(d.readOnly ? 'Your plan is loaded. This workspace is read-only; saved projects stay available.' : 'Your plan is loaded. Your tools are back.', d.readOnly ? link('/workspace#billing', 'Plan & billing') : null);
    if (added.length) {
      var map = places(), hit = null, i;
      for (i = 0; i < added.length && !hit; i++) hit = map[added[i]] ? added[i] : null;
      var place = hit ? map[hit] : null, text = sentence(added.map(nameOf)) + (added.length > 1 ? ' are' : ' is') + ' on.';
      if (place) return toast(text + ' ' + (added.length > 1 ? nameOf(hit) + ' is' : 'Find it') + ' on the ' + place.tab + ' tab.', button('Show me', function () { var t = document.getElementById('omega-plan-toast'); if (t) t.remove(); showMe(hit); }, 'opm-primary'));
      return toast(text + ' Open it from your workspace.', link('/workspace', 'Workspace'));
    }
    if (!d.readOnly && d.wasReadOnly) return toast('Your workspace is open again. Your tools are back.');
    if (removed.length) return toast(sentence(removed.map(nameOf)) + (removed.length > 1 ? ' are' : ' is') + ' no longer on your plan. Saved work stays available.', link('/workspace#billing', 'Plan & billing'));
    if (d.packaged !== d.wasPackaged || !d.packaged) return toast('Your plan changed. The ribbon now shows what it includes.');
  }
  /* ── THE PLAN'S STATE, IN THE EDITOR ────────────────────────────────────
     The dashboard has always said "your trial ends on …" and "this
     workspace is read-only, pay to continue"; the editor, where the tools
     actually disappear, said nothing, and a read-only workspace opened on a
     near-empty ribbon with no reason given. The same server notice
     (package-access billingNotice), the same pay link, and "I've paid". */
  function notice() {
    var caps = global.OmegaCaps, view = caps && caps.packageAccess(), ribbon = document.getElementById('ribbon'), bar = document.getElementById('omega-plan-notice');
    /* signed in to the editor itself: never the sign-in screen's locked
       placeholder, never the customer's Editor Lite frame (its own access) */
    var own = false;
    try { own = !/[?&]customerEngine=1(&|$)/.test(global.location.search) && !!(global.firebase && global.firebase.apps && global.firebase.apps.length && global.firebase.auth().currentUser); } catch (e) { own = false; }
    var n = own && view && !view.staff && !view.preview && (view.billingNotice || (view.pending ? { text: 'Your plan could not be checked. Saved projects stay available; your tools come back when the connection does.', retry: true } : null));
    if (!n || !ribbon || host.view) { if (bar) bar.remove(); return; }
    var key = [n.text, n.payUrl || '', view.readOnly ? 1 : 0].join('|');
    if (bar && bar.getAttribute('data-notice') === key) return;
    styles();
    if (!bar) { bar = node('div'); bar.id = 'omega-plan-notice'; bar.setAttribute('role', 'status'); }
    var anchor = document.getElementById('omega-workspace-controls') || ribbon;
    if (bar.nextSibling !== anchor) anchor.parentNode.insertBefore(bar, anchor);
    bar.textContent = ''; bar.setAttribute('data-notice', key); bar.className = 'opm-notice' + (view.readOnly ? ' opm-bad' : '');
    bar.appendChild(node('span', n.text));
    if (n.payUrl) bar.appendChild(link(n.payUrl, 'Pay in QuickBooks'));
    if (n.retry) bar.appendChild(button('Try again', function () { if (caps.refresh) caps.refresh(); }));
    else if (n.payUrl || view.readOnly) {
      var note = node('p', '', 'opm-note'); note.setAttribute('role', 'status');
      var paid = button("I've paid", function () {
        paid.disabled = true; paid.textContent = 'Checking…'; note.textContent = '';
        /* a member may not ask QuickBooks to look (an owner's action), so a
           refusal only skips that step; re-reading the plan is theirs too */
        api('/api/plan-change', { action: 'reconcile-now' }).then(null, function () {}).then(function () { return caps.refresh ? caps.refresh() : null; }).then(function (r) {
          paid.disabled = false; paid.textContent = "I've paid";
          if (!r || !r.changed) note.textContent = 'Not showing as paid yet. A card payment usually shows within a minute.';
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
      control = { canManage: true, pending: pending, loaded: true, summary: summary }; return control;
    }, function () { control = { canManage: false, pending: {}, loaded: true }; return control; });
  }
  function node(tag, text, cls) { var el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; }
  function close() { if (dialog) dialog.remove(); if (keydown) document.removeEventListener('keydown', keydown); keydown = null; dialog = body = null; request++; if (trigger && trigger.focus) trigger.focus(); }
  function card(m, price, focus) {
    var el = node('section', '', 'opm-card'); el.setAttribute('data-module-card', m.key);
    el.appendChild(node('span', m.name.slice(0, 1), 'opm-icon'));
    el.appendChild(node('h3', m.name));
    var view = packageView(), owned = view && (view.modules || []).indexOf(m.key) >= 0;
    if (owned && !host.legacy) {
      var on = node('p', '', 'opm-on'); on.appendChild(node('span', m.key === 'lite' ? 'Always on' : 'On your plan'));
      if (m.key !== 'lite' && !host.view && (spots || {})[m.key]) on.appendChild(button('Show me', function () { showMe(m.key); }, 'opm-link'));
      el.appendChild(on);
    }
    var list = node('ul'); (m.features || []).forEach(function (f) { list.appendChild(node('li', f)); }); el.appendChild(list);
    el.appendChild(node('p', price || 'Pricing unavailable', 'opm-price'));
    if (m.beta && m.beta.length) el.appendChild(node('p', 'BETA: ' + m.beta.join(', '), 'opm-note'));
    if (m.coverage) el.appendChild(node('p', m.coverage, 'opm-note'));
    if (m.agreement) el.appendChild(node('p', m.agreement, 'opm-note'));
    // The control posts to the server; listing never changes modules[].
    subscribeControl(el.appendChild(node('div')), m, { canManage: control.canManage, pending: control.pending, summary: control.summary, owned: owned, legacy: host.legacy, catalog: view && view.catalog, ownedModules: view && view.modules, onChanged: changed });
    if (m.key === focus) { el.tabIndex = -1; el.setAttribute('data-selected', '1'); }
    return el;
  }
  var lastRows = [];
  function changed(result) {
    var caps = global.OmegaCaps;
    /* Re-read in place (OmegaCaps.refresh): the tools appear, the toast says
       where, and the ribbon never blinks through the locked state. */
    var refresh = result && result.state === 'active' && caps && caps.refresh && !host.view ? caps.refresh().then(null, function () {}) : Promise.resolve();
    if (host.onChanged) { try { host.onChanged(result); } catch (e) {} }
    refresh.then(loadControl).then(function () { if (body) render(lastRows, null); });
  }
  var spots = null;
  function render(rows, focus) {
    if (!body) return; lastRows = rows;
    body.textContent = ''; spots = host.view ? {} : places();
    rows.forEach(function (m) { body.appendChild(card(m, m.priceDisplay, focus)); });
    if (!body.children.length) body.appendChild(node('p', 'Your package includes every module in this catalog.'));
    var selected = body.querySelector('[data-selected]'); if (selected) { selected.scrollIntoView({ block: 'nearest' }); selected.focus(); }
  }
  function open(key, options) {
    close(); trigger = document.activeElement;
    host = { view: options && options.view ? options.view : null, onChanged: options && options.onChanged ? options.onChanged : null, legacy: options && options.legacy ? options.legacy : null };
    control = { canManage: false, pending: {}, loaded: false };
    if (!document.getElementById('omega-package-menu-style')) styles();
    var view = packageView(); if (!view) return false;
    var tokenRequest = ++request;
    dialog = node('div', '', 'opm-backdrop'); dialog.id = 'omega-package-menu';
    var panel = node('div', '', 'opm-dialog'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'opm-title');
    /* "The Ladder" (Tommy, 2026-09-26): build your own experience and pay
       for what you need to run your business; each Omega Logic department
       (Office, Plant, Materials & Purchasing, Logistics & Warranty, Customer
       App) is its own opt-in on it. */
    var heading = node('h2', host.legacy ? 'Opt out of a module' : 'The Ladder'); heading.id = 'opm-title'; panel.appendChild(heading);
    panel.appendChild(node('p', 'Build your own experience and pay for what you need to run your business. Omega Logic is by department: Office, Plant, Materials & Purchasing, Logistics & Warranty and the Customer App are each an opt-in.', 'opm-note'));
    var dismiss = node('button', 'Close'); dismiss.type = 'button'; dismiss.onclick = close; panel.appendChild(dismiss);
    var status = node('p', 'Loading current pricing…', 'opm-note'); status.setAttribute('role', 'status'); panel.appendChild(status);
    body = node('div', '', 'opm-grid'); panel.appendChild(body); dialog.appendChild(panel); document.body.appendChild(dialog);
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
    render(view.catalog || [], key); dismiss.focus();
    if (host.legacy) {
      control = { canManage: true, pending: {}, loaded: true };
      status.textContent = 'Review the request before sending it to ClearSky. Lite is always included.';
      render((view.catalog || []).filter(function (m) { return m.key === key; }), key); return true;
    }
    var user = global.firebase && global.firebase.auth().currentUser;
    if (!user || !user.getIdToken || !global.fetch) { status.textContent = 'Sign in to view current pricing.'; return true; }
    user.getIdToken().then(function (token) { return global.fetch('/api/package-catalog', { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } }); })
      .then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); })
      .then(function (result) {
        if (tokenRequest !== request || !body || global.firebase.auth().currentUser !== user) return;
        status.textContent = 'Monthly prices. Additions switch on when payment clears. Optional modules can be opted out at the quarterly review; Lite is always included.';
        control = { canManage: false, pending: {}, loaded: false }; render(result.modules, key);
        if (result.canManage) loadControl().then(function () { if (tokenRequest === request && body) render(result.modules, key); });
      }, function () { if (tokenRequest === request) status.textContent = 'Current pricing is unavailable. Please try again later.'; });
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
      '.opm-backdrop,.opm-host{--opm-surface:#fff;--opm-text:#14171A;--opm-sub:#5B6672;--opm-border:#E1E7EB;--opm-sunk:#EEF1F3;--opm-blue:#2B5FA8}' +
      '@media(prefers-color-scheme:dark){html:not([data-omega-theme="light"]) .opm-backdrop,html:not([data-omega-theme="light"]) .opm-host{--opm-surface:#172029;--opm-text:#E6EBF0;--opm-sub:#94A1AE;--opm-border:#26323E;--opm-sunk:#10161D;--opm-blue:#6E9BE0}}' +
      'html[data-omega-theme="dark"] .opm-backdrop,html[data-omega-theme="dark"] .opm-host{--opm-surface:#172029;--opm-text:#E6EBF0;--opm-sub:#94A1AE;--opm-border:#26323E;--opm-sunk:#10161D;--opm-blue:#6E9BE0}' +
      '.opm-dialog{width:1040px;max-width:100%;max-height:88vh;overflow:auto;background:var(--opm-surface);color:var(--opm-text);border:1px solid var(--opm-border);border-radius:14px;padding:24px;font:14px system-ui}' +
      '.opm-dialog h2{margin:0 0 12px;font-size:24px}.opm-dialog button{font:inherit;padding:8px 14px;border:1px solid var(--opm-border);border-radius:6px;cursor:pointer}' +
      '.opm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:14px;margin-top:18px}' +
      '.opm-card{border:1px solid var(--opm-border);border-radius:10px;padding:18px}.opm-card[data-selected]{outline:2px solid var(--opm-blue)}' +
      '.opm-card h3{font-size:16px;margin:10px 0}.opm-card ul{padding-left:18px;line-height:1.7}.opm-price{font-weight:600}.opm-note{font-size:12px;color:var(--opm-sub);line-height:1.6}' +
      '.opm-icon{display:inline-flex;width:30px;height:30px;border-radius:7px;align-items:center;justify-content:center;background:var(--opm-sunk);color:var(--opm-blue);font-weight:700}' +
      '.opm-act{margin-top:10px;display:grid;gap:6px}.opm-act p{margin:0}.opm-quote{font-weight:600}.opm-wait{font-weight:600;color:var(--opm-blue)}.opm-reason{color:#B45F06;font-size:12px}' +
      '.opm-row{display:flex;flex-wrap:wrap;gap:6px}.opm-act button{font:500 13px system-ui;padding:7px 12px;border:1px solid var(--opm-border);border-radius:6px;background:var(--opm-surface);color:var(--opm-text);cursor:pointer}' +
      '.opm-act .opm-primary{background:var(--opm-blue);color:#fff;border-color:var(--opm-blue)}.opm-act a{color:var(--opm-blue)}' +
      '.opm-on{display:flex;align-items:center;gap:10px;margin:-4px 0 4px;font-size:12px;font-weight:600;color:var(--opm-green,#2E7D4F)}' +
      '@media(prefers-color-scheme:dark){html:not([data-omega-theme="light"]) .opm-on{--opm-green:#6FBB84}}html[data-omega-theme="dark"] .opm-on{--opm-green:#6FBB84}' +
      '.opm-dialog .opm-on .opm-link{padding:2px 8px;font:600 12px system-ui;background:transparent;color:var(--opm-blue)}' +
      /* the strip and the toast sit in the editor's own chrome: its tokens, both themes */
      '.opm-notice{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:7px 14px;font:12.5px/1.45 system-ui;background:var(--panel,#16202B);color:var(--text,#E6EBF0);border-bottom:1px solid var(--border,#26323E);border-left:3px solid var(--accent,#4A8FD8)}' +
      '.opm-notice.opm-bad{border-left-color:var(--warn,#C9A24E)}.opm-notice span{flex:1 1 320px}.opm-notice a{color:var(--accent,#4A8FD8);font-weight:600}.opm-notice p{margin:0;flex-basis:100%;color:var(--sub,#94A1AE)}.opm-notice p:empty{display:none}' +
      '.opm-notice button,.opm-toast button{font:600 12px system-ui;padding:5px 11px;border-radius:6px;border:1px solid var(--border,#26323E);background:transparent;color:var(--text,#E6EBF0);cursor:pointer}' +
      '.opm-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:1000000;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;max-width:min(620px,calc(100vw - 32px));padding:12px 14px 12px 16px;border-radius:10px;border:1px solid var(--border,#26323E);background:var(--panel,#16202B);color:var(--text,#E6EBF0);font:13px/1.45 system-ui;box-shadow:0 10px 32px #0006}' +
      '.opm-toast span{flex:1 1 260px}.opm-toast a{color:var(--accent,#4A8FD8);font-weight:600}.opm-toast .opm-primary{background:var(--accent,#4A8FD8);border-color:var(--accent,#4A8FD8);color:var(--on-accent,#fff)}.opm-toast .opm-x{border-color:transparent;color:var(--sub,#94A1AE)}' +
      '[data-opm-spot]{outline:2px solid var(--accent,#4A8FD8)!important;outline-offset:2px;border-radius:6px;animation:opm-spot 1.3s ease-in-out 2}' +
      '@keyframes opm-spot{50%{outline-color:transparent}}@media(prefers-reduced-motion:reduce){[data-opm-spot]{animation:none}}';
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
  function picker(host, options) {
    var rows = options.catalog || [], selected = (options.modules || ['lite']).slice();
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
  global.OmegaPackageMenu = { open: open, close: close, tab: tab, staffPreview: staffPreview, picker: picker, card: card, subscribeControl: subscribeControl, loadControl: loadControl, api: api, styles: styles,
    notice: notice, where: where, places: places, showMe: showMe };
})(typeof window !== 'undefined' ? window : this);
