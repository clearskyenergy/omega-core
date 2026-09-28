/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Shared input-only billing contact form. No card fields or financial math.
 * render(host, profile, { compact: true }) — the signup's short form: what the
 * server requires (api/_lib/billing-profile.js) up front, and the optional or
 * already-known fields (company type, country, AP email, PO, tax) folded into
 * "More billing options". Same fields, same value(); only the layout differs.
 */
(function (global) {
  'use strict';
  var MORE = ['address.line2', 'address.country', 'vertical', 'apEmail', 'website', 'taxExempt', 'resaleNumber', 'poRequired', 'poNumber'];
  function render(host, profile, opts) {
    profile = profile || {}; opts = opts || {}; host.textContent = ''; var controls = {}, address = profile.address || {}, more = null, moreGrid = null;
    if (opts.compact) {
      more = document.createElement('details'); more.className = 'obp-more';
      var summary = document.createElement('summary'); summary.textContent = 'More billing options'; more.appendChild(summary);
      var sub = document.createElement('span'); sub.className = 'obp-more-sub'; sub.textContent = 'Company type, country, AP email, PO and tax exemption'; summary.appendChild(sub);
      moreGrid = document.createElement('div'); moreGrid.className = 'obp-grid'; more.appendChild(moreGrid);
    }
    function field(key, label, value, type, required, choices) {
      var wrap = document.createElement('label'); wrap.className = 'obp-field' + (opts.compact && key === 'address.line1' ? ' obp-wide' : ''); wrap.appendChild(document.createTextNode(label + (required ? ' *' : '')));
      var input = document.createElement(choices ? 'select' : 'input'); input.setAttribute('data-profile-field', key);
      if (choices) choices.forEach(function (pair) { var opt = document.createElement('option'); opt.value = pair[0]; opt.textContent = pair[1]; input.appendChild(opt); });
      else input.type = type || 'text';
      input.required = !!required; if (type === 'number') { input.min = '1'; input.max = '100000'; input.step = '1'; }
      if (type === 'checkbox') input.checked = value === true; else input.value = value == null ? '' : value;
      wrap.appendChild(input); (more && MORE.indexOf(key) >= 0 ? moreGrid : host).appendChild(wrap); controls[key] = input;
    }
    field('legalName', 'Legal company name', profile.legalName, 'text', true);
    field('contactName', 'Billing contact name', profile.contactName, 'text', true);
    field('email', 'Billing email', profile.email, 'email', true);
    if (!opts.compact) field('apEmail', 'AP email (CC)', profile.apEmail, 'email');
    field('phone', 'Billing phone', profile.phone, 'tel', true);
    [['line1', 'Address line 1'], ['line2', 'Address line 2'], ['city', 'City'], ['state', 'State / region'], ['postalCode', 'ZIP / postal code'], ['country', 'Country']].forEach(function (pair) { field('address.' + pair[0], pair[1], address[pair[0]], 'text', pair[0] !== 'line2'); });
    if (opts.compact) field('teamSize', 'Approximate team size', profile.teamSize, 'number', true);
    if (opts.compact) field('apEmail', 'AP email (CC)', profile.apEmail, 'email');
    field('website', 'Website', profile.website, 'url');
    field('vertical', 'Company type', profile.vertical || 'developer', null, true, [['developer', 'Developer / owner'], ['epc', 'EPC / engineering'], ['installer', 'Installer'], ['oem', 'OEM']]);
    if (!opts.compact) field('teamSize', 'Approximate team size', profile.teamSize, 'number', true);
    field('taxExempt', 'Sales-tax exempt', profile.taxExempt, 'checkbox');
    field('resaleNumber', 'Exemption / resale number', profile.resaleNumber);
    field('poRequired', 'PO required on invoices', profile.poRequired, 'checkbox');
    field('poNumber', 'PO number', profile.poNumber);
    if (more) host.appendChild(more);
    function value() {
      var out = { address: {} };
      Object.keys(controls).forEach(function (key) { var input = controls[key], v = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value.trim();
        if (key.indexOf('address.') === 0) out.address[key.slice(8)] = v; else out[key] = v;
      }); return out;
    }
    /* a field folded away that needs fixing is shown before the browser says why */
    return { value: value, valid: function () { return Object.keys(controls).every(function (key) {
      var input = controls[key];
      if (more && !more.open && more.contains(input) && !input.checkValidity()) more.open = true;
      return input.reportValidity();
    }); } };
  }
  global.OmegaBillingProfile = { render: render };
})(typeof window !== 'undefined' ? window : this);
