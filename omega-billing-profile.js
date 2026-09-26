/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Shared input-only billing contact form. No card fields or financial math.
 */
(function (global) {
  'use strict';
  function render(host, profile) {
    profile = profile || {}; host.textContent = ''; var controls = {}, address = profile.address || {};
    function field(key, label, value, type, required, choices) {
      var wrap = document.createElement('label'); wrap.className = 'obp-field'; wrap.appendChild(document.createTextNode(label + (required ? ' *' : '')));
      var input = document.createElement(choices ? 'select' : 'input'); input.setAttribute('data-profile-field', key);
      if (choices) choices.forEach(function (pair) { var opt = document.createElement('option'); opt.value = pair[0]; opt.textContent = pair[1]; input.appendChild(opt); });
      else input.type = type || 'text';
      input.required = !!required; if (type === 'number') { input.min = '1'; input.max = '100000'; input.step = '1'; }
      if (type === 'checkbox') input.checked = value === true; else input.value = value == null ? '' : value;
      wrap.appendChild(input); host.appendChild(wrap); controls[key] = input;
    }
    field('legalName', 'Legal company name', profile.legalName, 'text', true);
    field('contactName', 'Billing contact name', profile.contactName, 'text', true);
    field('email', 'Billing email', profile.email, 'email', true);
    field('apEmail', 'AP email (CC)', profile.apEmail, 'email');
    field('phone', 'Billing phone', profile.phone, 'tel', true);
    [['line1', 'Address line 1'], ['line2', 'Address line 2'], ['city', 'City'], ['state', 'State / region'], ['postalCode', 'ZIP / postal code'], ['country', 'Country']].forEach(function (pair) { field('address.' + pair[0], pair[1], address[pair[0]], 'text', pair[0] !== 'line2'); });
    field('website', 'Website', profile.website, 'url');
    field('vertical', 'Company type', profile.vertical || 'developer', null, true, [['developer', 'Developer / owner'], ['epc', 'EPC / engineering'], ['installer', 'Installer'], ['oem', 'OEM']]);
    field('teamSize', 'Approximate team size', profile.teamSize, 'number', true);
    field('taxExempt', 'Sales-tax exempt', profile.taxExempt, 'checkbox');
    field('resaleNumber', 'Exemption / resale number', profile.resaleNumber);
    field('poRequired', 'PO required on invoices', profile.poRequired, 'checkbox');
    field('poNumber', 'PO number', profile.poNumber);
    function value() {
      var out = { address: {} };
      Object.keys(controls).forEach(function (key) { var input = controls[key], v = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value.trim();
        if (key.indexOf('address.') === 0) out.address[key.slice(8)] = v; else out[key] = v;
      }); return out;
    }
    return { value: value, valid: function () { return Object.keys(controls).every(function (key) { return controls[key].reportValidity(); }); } };
  }
  global.OmegaBillingProfile = { render: render };
})(typeof window !== 'undefined' ? window : this);
