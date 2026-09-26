/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The shared package gallery. Server catalog and server-formatted prices only.
 * Phase 5 supplies the paid subscription action; this phase never grants access.
 */
(function (global) {
  'use strict';
  var dialog, body, trigger, request = 0;
  function node(tag, text, cls) { var el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; }
  function close() { if (dialog) dialog.remove(); dialog = body = null; request++; if (trigger && trigger.focus) trigger.focus(); }
  function card(m, price, focus) {
    var el = node('section', '', 'opm-card'); el.setAttribute('data-module-card', m.key);
    el.appendChild(node('span', m.name.slice(0, 1), 'opm-icon'));
    el.appendChild(node('h3', m.name));
    var list = node('ul'); (m.features || []).forEach(function (f) { list.appendChild(node('li', f)); }); el.appendChild(list);
    el.appendChild(node('p', price || 'Pricing unavailable', 'opm-price'));
    if (m.beta && m.beta.length) el.appendChild(node('p', 'BETA: ' + m.beta.join(', '), 'opm-note'));
    if (m.coverage) el.appendChild(node('p', m.coverage, 'opm-note'));
    if (m.agreement) el.appendChild(node('p', m.agreement, 'opm-note'));
    // No disabled selling control or pretend checkout. Phase 5 installs an action
    // only after the pay-first endpoint exists. Listing never changes modules[].
    el.appendChild(node('p', 'Subscription checkout is being prepared. Your current access is unchanged.', 'opm-note'));
    if (m.key === focus) { el.tabIndex = -1; el.setAttribute('data-selected', '1'); }
    return el;
  }
  function render(rows, focus) {
    if (!body) return;
    body.textContent = '';
    var access = global.OmegaCaps && global.OmegaCaps.packageAccess(), owned = access ? access.modules : [];
    rows.filter(function (m) { return owned.indexOf(m.key) < 0; }).forEach(function (m) { body.appendChild(card(m, m.priceDisplay, focus)); });
    if (!body.children.length) body.appendChild(node('p', 'Your package includes every module in this catalog.'));
    var selected = body.querySelector('[data-selected]'); if (selected) { selected.scrollIntoView({ block: 'nearest' }); selected.focus(); }
  }
  function open(key) {
    close(); trigger = document.activeElement;
    var view = global.OmegaCaps && global.OmegaCaps.packageAccess(); if (!view) return false;
    var tokenRequest = ++request;
    dialog = node('div', '', 'opm-backdrop'); dialog.id = 'omega-package-menu';
    var panel = node('div', '', 'opm-dialog'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'opm-title');
    var heading = node('h2', 'Add to your workspace'); heading.id = 'opm-title'; panel.appendChild(heading);
    var dismiss = node('button', 'Close'); dismiss.type = 'button'; dismiss.onclick = close; panel.appendChild(dismiss);
    var status = node('p', 'Loading current pricing…', 'opm-note'); status.setAttribute('role', 'status'); panel.appendChild(status);
    body = node('div', '', 'opm-grid'); panel.appendChild(body); dialog.appendChild(panel); document.body.appendChild(dialog);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { e.preventDefault(); dismiss.focus(); }
    });
    render(view.catalog || [], key); dismiss.focus();
    var user = global.firebase && global.firebase.auth().currentUser;
    if (!user || !user.getIdToken || !global.fetch) { status.textContent = 'Sign in to view current pricing.'; return true; }
    user.getIdToken().then(function (token) { return global.fetch('/api/package-catalog', { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } }); })
      .then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); })
      .then(function (result) {
        if (tokenRequest !== request || !body || global.firebase.auth().currentUser !== user) return;
        status.textContent = 'Monthly prices. Subscription changes require confirmed payment.'; render(result.modules, key);
      }, function () { if (tokenRequest === request) status.textContent = 'Current pricing is unavailable. Please try again later.'; });
    return true;
  }
  function tab() {
    var host = document.getElementById('ribbon-tabs'); if (!host || document.getElementById('omega-package-tab')) return;
    var style = node('style'); style.textContent =
      '.opm-backdrop{position:fixed;inset:0;z-index:999999;background:#0008;display:flex;align-items:center;justify-content:center;padding:24px}' +
      '.opm-backdrop{--opm-surface:#fff;--opm-text:#14171A;--opm-sub:#5B6672;--opm-border:#E1E7EB;--opm-sunk:#EEF1F3;--opm-blue:#2B5FA8}' +
      '@media(prefers-color-scheme:dark){.opm-backdrop{--opm-surface:#172029;--opm-text:#E6EBF0;--opm-sub:#94A1AE;--opm-border:#26323E;--opm-sunk:#10161D;--opm-blue:#6E9BE0}}' +
      '.opm-dialog{width:1040px;max-width:100%;max-height:88vh;overflow:auto;background:var(--opm-surface);color:var(--opm-text);border:1px solid var(--opm-border);border-radius:14px;padding:24px;font:14px system-ui}' +
      '.opm-dialog h2{margin:0 0 12px;font-size:24px}.opm-dialog button{font:inherit;padding:8px 14px;border:1px solid var(--opm-border);border-radius:6px;cursor:pointer}' +
      '.opm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:14px;margin-top:18px}' +
      '.opm-card{border:1px solid var(--opm-border);border-radius:10px;padding:18px}.opm-card[data-selected]{outline:2px solid var(--opm-blue)}' +
      '.opm-card h3{font-size:16px;margin:10px 0}.opm-card ul{padding-left:18px;line-height:1.7}.opm-price{font-weight:600}.opm-note{font-size:12px;color:var(--opm-sub);line-height:1.6}' +
      '.opm-icon{display:inline-flex;width:30px;height:30px;border-radius:7px;align-items:center;justify-content:center;background:var(--opm-sunk);color:var(--opm-blue);font-weight:700}';
    document.head.appendChild(style);
    var button = node('button', '+ Modules', 'rtab'); button.id = 'omega-package-tab'; button.type = 'button'; button.onclick = function () { open(); }; host.appendChild(button);
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
        if (options.readOnly && owned) tags.appendChild(node('span', 'On · remove at review', 'pkm-tag'));
        item.appendChild(tags); shelves[m.shelf].appendChild(item);
      });
    }
    draw(); return { value: function () { return selected.slice(); }, set: function (keys) { selected = keys.slice(); draw(); if (options.onChange) options.onChange(selected.slice()); } };
  }
  global.OmegaPackageMenu = { open: open, close: close, tab: tab, staffPreview: staffPreview, picker: picker };
})(typeof window !== 'undefined' ? window : this);
