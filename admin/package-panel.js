/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Staff and tenant doors share the catalog/menu and authenticated endpoints.
 * No financial calculations, direct billing writes or simulated payment here.
 */
(function (global) {
  'use strict';
  var host, orgId, user, record, picker, profileForm, selected, preview, sequence = 0, quoteSequence = 0;
  function el(tag, text, cls) { var n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; }
  function $(id) { return document.getElementById('pp-' + id); }
  function button(text, fn, cls) { var b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; }
  function request(path, body) {
    var current = user;
    return current.getIdToken().then(function (token) {
      if (global.firebase.auth().currentUser !== current) throw new Error('Sign in again');
      var opts = { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } };
      if (body) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
      return global.fetch(path, opts);
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request refused'); if (global.firebase.auth().currentUser !== current) throw new Error('Account changed'); return j; }); });
  }
  function message(text, bad) { $('message').textContent = text || ''; $('message').className = 'pp-message' + (bad ? ' error' : ''); }
  function tab(key) {
    host.querySelectorAll('[data-pp-tab]').forEach(function (n) { n.setAttribute('aria-selected', n.getAttribute('data-pp-tab') === key ? 'true' : 'false'); });
    host.querySelectorAll('[data-pp-pane]').forEach(function (n) { n.hidden = n.getAttribute('data-pp-pane') !== key; });
  }
  function choice(id, entries, value) {
    var n = el('select'); n.id = 'pp-' + id; n.setAttribute('aria-label', id.replace(/-/g, ' '));
    entries.forEach(function (pair) { var o = el('option', pair[1]); o.value = pair[0]; n.appendChild(o); }); n.value = value; return n;
  }
  function input(id, label, value, type, parent) {
    var wrap = el('label', label), n = el('input'); n.id = 'pp-' + id; n.type = type || 'text';
    if (type === 'checkbox') n.checked = value === true; else n.value = value == null ? '' : value;
    wrap.appendChild(n); parent.appendChild(wrap); return n;
  }
  function terms() {
    var fee = { mode: $('fee-mode').value, appliesTo: $('fee-scope').value };
    if (fee.mode !== 'standard') fee.reason = $('fee-reason').value.trim();
    if (fee.mode === 'custom') fee.amountDollars = $('fee-amount').value.trim();
    return { orgId: orgId, modules: picker.value(), pricebookVersion: record.pricebookVersion,
      plan: $('plan').value, interval: $('interval').value, credit: $('credit').checked,
      builders: Number($('builders').value), viewers: Number($('viewers').value), serviceFee: fee };
  }
  function refreshQuote() {
    preview = null; $('apply').disabled = true; var ticket = ++quoteSequence;
    $('fee-amount').parentNode.hidden = $('fee-mode').value !== 'custom';
    $('fee-reason').parentNode.hidden = $('fee-mode').value === 'standard';
    $('fee-scope').hidden = $('fee-mode').value === 'standard';
    if ($('interval').value === 'annual') { $('credit').checked = false; $('credit').disabled = true; } else $('credit').disabled = false;
    request('/api/package-catalog', terms()).then(function (data) {
      if (ticket !== quoteSequence) return; var q = data.quote;
      $('list').textContent = q.display.list; $('fits').textContent = q.display.plan;
      $('monthly').textContent = q.display.recurring; $('first').textContent = q.display.monthly;
      $('fee').textContent = q.display.serviceFee; $('fit').textContent = q.display.fit;
      $('annual').textContent = $('interval').value === 'annual' ? q.display.annualBeforeCredit : '';
      $('usage').textContent = q.display.usage.length ? q.display.usage.join(' · ') : 'No metered modules selected';
      $('review').disabled = false; message('');
    }, function (e) { if (ticket !== quoteSequence) return; $('review').disabled = true; message(e.message, true); });
  }
  function review() {
    var ticket = quoteSequence, body = terms(); body.action = record.status === 'pending' ? 'approve' : 'activate'; body.dryRun = true;
    $('review').disabled = true; message('Preparing the exact billing changes…');
    request('/api/tenant-package', body).then(function (data) {
      if (ticket !== quoteSequence) return;
      preview = { result: data, body: Object.assign({}, body, { previewId: data.previewId, effectiveAt: data.effectiveAt, dryRun: false }) };
      $('write-billing').textContent = JSON.stringify(data.billingPatch, null, 2);
      $('write-customer').textContent = JSON.stringify(data.customer, null, 2);
      $('write-invoice').textContent = data.invoice ? JSON.stringify(data.invoice, null, 2) : 'No invoice at approval. Scheduled for trial end; QuickBooks will calculate tax:\n\n' + JSON.stringify(data.scheduledInvoice, null, 2);
      $('apply').textContent = data.trialStartsOnApproval ? 'Approve and start trial' : 'Activate and create invoice';
      $('apply').disabled = !data.canApply; $('review').disabled = false; message(data.notice); tab('write');
    }, function (e) { $('review').disabled = false; message(e.message, true); });
  }
  function apply() {
    if (!preview) return; var body = preview.body; $('apply').disabled = true;
    request('/api/tenant-package', body).then(function (result) { load().then(function () { message(result.trialEndsAt ? 'Approved. Trial ends ' + new Date(result.trialEndsAt).toLocaleDateString() + '.' : 'Invoice created. Waiting for QuickBooks payment confirmation.'); }); }, function (e) { message(e.message, true); preview = null; });
  }
  function history(rows, pane) {
    if (!rows.length) { pane.appendChild(el('p', 'No billing changes recorded.', 'pp-note')); return; }
    var table = el('table', '', 'pp-history'), thead = el('thead'), tr = el('tr');
    ['When', 'Who', 'Change'].forEach(function (x) { tr.appendChild(el('th', x)); }); thead.appendChild(tr); table.appendChild(thead);
    var body = el('tbody'); rows.forEach(function (row) { var r = el('tr'); r.appendChild(el('td', typeof row.at === 'number' ? new Date(row.at).toLocaleString() : String(row.at || ''))); r.appendChild(el('td', row.by || 'System'));
      var d = el('td', row.action || 'Billing updated'), details = el('details'), summary = el('summary', 'Before and after'); details.appendChild(summary); details.appendChild(el('pre', JSON.stringify({ was: row.was, now: row.changed }, null, 2))); d.appendChild(details); r.appendChild(d); body.appendChild(r);
    }); table.appendChild(body); pane.appendChild(table);
  }
  function render(data, profile) {
    record = data; selected = data.billing.proposedPackage || data.billing; host.textContent = '';
    var heading = el('div', '', 'pp-head'), title = el('div'); title.appendChild(el('h2', data.name)); title.appendChild(el('div', orgId + ' · ' + data.pricebookVersion, 'pp-sub')); heading.appendChild(title); heading.appendChild(el('span', data.billing.packagingState || data.status, 'pp-pill')); host.appendChild(heading);
    var tabs = el('div', '', 'pp-tabs'); tabs.setAttribute('role', 'tablist'); host.appendChild(tabs);
    var panes = {};
    [['pkg', 'Package'], ['write', 'What Activate writes'], ['cust', data.canManagePackage ? 'Customer’s "Your plan"' : 'Your plan'], ['hist', 'History']].forEach(function (pair) {
      if (!data.canManagePackage && (pair[0] === 'pkg' || pair[0] === 'write')) return;
      var b = button(pair[1], function () { tab(pair[0]); }); b.setAttribute('role', 'tab'); b.setAttribute('data-pp-tab', pair[0]); tabs.appendChild(b);
      var pane = el('div', '', 'pp-pane'); pane.setAttribute('data-pp-pane', pair[0]); pane.setAttribute('role', 'tabpanel'); panes[pair[0]] = pane; host.appendChild(pane);
    });
    var msg = el('div', '', 'pp-message'); msg.id = 'pp-message'; msg.setAttribute('role', 'status'); host.appendChild(msg);
    if (data.canManagePackage) {
      var grid = el('div', '', 'pp-grid'), left = el('div'), rail = el('aside', '', 'pp-summary'); panes.pkg.appendChild(grid); grid.appendChild(left); grid.appendChild(rail);
      var row = el('div', '', 'pp-row'); row.appendChild(el('span', 'Customer type', 'pp-note'));
      row.appendChild(choice('starter', Object.keys(data.starters).map(function (k) { return [k, (data.starterLabels || {})[k] || k]; }), Object.keys(data.starters)[0]));
      row.appendChild(button('Apply starter pack', function () { picker.set(data.starters[$('starter').value]); })); left.appendChild(row);
      var menu = el('div'); left.appendChild(menu); picker = global.OmegaPackageMenu.picker(menu, { catalog: data.modules, modules: selected.modules || ['lite'], onChange: refreshQuote });
      rail.appendChild(el('div', 'Menu value (list)', 'pp-k')); var list = el('div', 'Loading…', 'pp-big'); list.id = 'pp-list'; rail.appendChild(list);
      [['fits', 'Plan that fits'], ['monthly', 'Monthly charge'], ['first', 'During credit window'], ['fee', 'Service fee / year']].forEach(function (p) { var r = el('div', '', 'pp-stat'); r.appendChild(el('span', p[1])); var v = el('span', '—'); v.id = 'pp-' + p[0]; r.appendChild(v); rail.appendChild(r); });
      rail.appendChild(choice('plan', [['auto', 'Lowest monthly price'], ['alacarte', 'Lite + modules'], ['field', 'Field'], ['pro', 'Pro']], selected.plan || 'auto'));
      rail.appendChild(choice('interval', [['monthly', 'Monthly invoices'], ['annual', 'Annual prepay']], selected.interval || 'monthly'));
      input('credit', 'Transformation credit ' + data.defaults.credit.pct + '% · ' + data.defaults.credit.days + ' days ', !!selected.credit, 'checkbox', rail);
      var fee = selected.serviceFee || {};
      rail.appendChild(choice('fee-mode', [['standard', 'Charge standard service fee'], ['custom', 'Custom service fee'], ['waived', 'Waive service fee']], fee.mode || 'standard'));
      input('fee-amount', 'Custom service fee (USD)', fee.amountDollars, 'text', rail).inputMode = 'decimal';
      input('fee-reason', 'Reason for fee change', fee.reason, 'text', rail);
      rail.appendChild(choice('fee-scope', [['first-year', 'First year only'], ['every-year', 'Every year']], fee.appliesTo || 'first-year'));
      input('builders', 'Builder logins', selected.builders == null ? data.defaults.builders : selected.builders, 'number', rail);
      input('viewers', 'Viewer logins', selected.viewers == null ? data.defaults.viewers : selected.viewers, 'number', rail);
      var annual = el('div', '', 'pp-note'); annual.id = 'pp-annual'; rail.appendChild(annual);
      var usage = el('div', '', 'pp-note'); usage.id = 'pp-usage'; rail.appendChild(usage);
      var fit = el('div', '', 'pp-fit'); fit.id = 'pp-fit'; rail.appendChild(fit);
      rail.appendChild(el('div', data.billing.billingDay ? 'Billing day: ' + data.billing.billingDay : 'Billing date follows the original signup day.', 'pp-note'));
      var reviewButton = button('Review activation', review, 'pp-primary'); reviewButton.id = 'pp-review'; reviewButton.disabled = true; rail.appendChild(reviewButton);
      var proposal = button('Send as proposal · coming'); proposal.disabled = true; rail.appendChild(proposal);
      rail.appendChild(el('div', 'Approval starts one trial of at most 14 days. Paid activation waits for QuickBooks payment. Enterprise requires a staff quote.', 'pp-note'));
      rail.querySelectorAll('input,select').forEach(function (n) { n.onchange = refreshQuote; });
      var two = el('div', '', 'pp-two'); panes.write.appendChild(two);
      [['write-invoice', 'QuickBooks invoice'], ['write-billing', 'Billing record'], ['write-customer', 'QuickBooks customer']].forEach(function (p) { var area = el('div'); area.appendChild(el('h3', p[1])); var pre = el('pre', 'Choose Review activation to load the server preview.'); pre.id = 'pp-' + p[0]; area.appendChild(pre); two.appendChild(area); });
      var applyButton = button('Apply reviewed changes', apply, 'pp-primary'); applyButton.id = 'pp-apply'; applyButton.disabled = true; panes.write.appendChild(applyButton);
    }
    panes.cust.appendChild(el('p', data.canManagePackage ? 'Read-only preview of this tenant’s current plan. Subscription changes open in Your plan after checkout is available.' : 'Your current modules. Subscription checkout is being prepared.', 'pp-note'));
    if (data.billing.paymentLink) { var pay = el('a', 'Pay in QuickBooks', 'pp-pay'); pay.href = data.billing.paymentLink; pay.target = '_blank'; pay.rel = 'noopener'; panes.cust.appendChild(pay); }
    global.OmegaPackageMenu.picker(panes.cust.appendChild(el('div')), { catalog: data.modules, modules: data.billing.modules || ['lite'], readOnly: true });
    history(data.history, panes.hist);
    if (data.canManagePackage && data.audit.length) { panes.hist.appendChild(el('h3', 'Admin audit')); history(data.audit, panes.hist); }
    var details = el('details'), summary = el('summary', 'Billing contact and address'); details.appendChild(summary); var form = el('div', '', 'obp-grid'); details.appendChild(form);
    profileForm = global.OmegaBillingProfile.render(form, profile.profile); details.appendChild(button('Save billing profile', function () {
      if (!profileForm.valid()) return;
      request('/api/billing-profile', { orgId: orgId, profile: profileForm.value() }).then(function () { preview = null; if ($('apply')) $('apply').disabled = true; message('Billing profile saved. Refresh the activation preview before applying.'); }, function (e) { message(e.message, true); });
    }));
    (panes.pkg || panes.cust).appendChild(details);
    if (profile.canUploadCertificate) {
      var certificate = el('p', profile.certificate ? 'Certificate attached: ' + profile.certificate.path.split('/').pop() : 'Optional exemption certificate · staff only', 'pp-note'); details.appendChild(certificate);
      var file = el('input'); file.type = 'file'; file.accept = '.pdf,.png,.jpg,.jpeg'; file.setAttribute('aria-label', 'Exemption certificate'); details.appendChild(file);
      details.appendChild(button('Upload certificate', function () {
        var selectedFile = file.files && file.files[0];
        if (!selectedFile || selectedFile.size >= 8 * 1024 * 1024 || ['application/pdf', 'image/png', 'image/jpeg'].indexOf(selectedFile.type) < 0) { message('Choose a PDF, PNG or JPEG under 8 MB.', true); return; }
        if (!global.firebase.storage) { message('Storage is unavailable. Reload and try again.', true); return; }
        var filePath = 'billing-certificates/' + orgId + '/' + Date.now() + '-' + selectedFile.name.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 140);
        message('Uploading the private certificate…');
        global.firebase.storage().ref(filePath).put(selectedFile, { contentType: selectedFile.type }).then(function () {
          return request('/api/billing-profile', { orgId: orgId, certificatePath: filePath });
        }).then(function () { certificate.textContent = 'Certificate attached: ' + selectedFile.name; message('Certificate attached. Only verified ClearSky staff can read it.'); }, function (e) { message(e.message, true); });
      }));
    }
    tab(data.canManagePackage ? 'pkg' : 'cust'); if (data.canManagePackage) refreshQuote();
  }
  function load() {
    var ticket = ++sequence;
    return Promise.all([request('/api/tenant-package?orgId=' + encodeURIComponent(orgId)), request('/api/billing-profile?orgId=' + encodeURIComponent(orgId))]).then(function (rows) { if (ticket === sequence) render(rows[0], rows[1]); }, function (e) { if (ticket === sequence) { host.textContent = ''; host.appendChild(el('p', e.message, 'pp-message error')); } });
  }
  global.OmegaPackagePanel = { mount: function (element, org, signedInUser) { host = element; orgId = org; user = signedInUser; return load(); }, clear: function () { sequence++; quoteSequence++; preview = null; user = null; if (host) host.textContent = ''; } };
})(window);
