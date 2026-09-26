/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Private billing-profile schema. Never mirror this into tenant_public.
 */
'use strict';
var FIELDS = ['legalName', 'contactName', 'email', 'apEmail', 'phone', 'address', 'website', 'taxExempt', 'resaleNumber', 'poRequired', 'poNumber', 'vertical', 'teamSize'];
function fail(message) { var e = new Error(message); e.status = 400; throw e; }
function text(value, name, required, max) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || /[\u0000-\u001f]/.test(value)) fail('Invalid ' + name);
  value = value.trim(); if (required && !value) fail(name + ' is required'); return value;
}
function email(value, name, required) {
  var v = text(value, name, required, 254).toLowerCase();
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Invalid ' + name);
  return v;
}
function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Billing profile is required');
  if (Object.keys(input).some(function (k) { return FIELDS.indexOf(k) < 0; })) fail('Unsupported billing profile field');
  var a = input.address;
  if (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).some(function (k) { return ['line1', 'line2', 'city', 'state', 'postalCode', 'country'].indexOf(k) < 0; })) fail('Billing address is required');
  var address = {};
  ['line1', 'line2', 'city', 'state', 'postalCode', 'country'].forEach(function (k) { address[k] = text(a[k], 'address.' + k, k !== 'line2', 100); });
  if (['oem', 'developer', 'epc', 'installer'].indexOf(input.vertical) < 0) fail('Company type is required');
  if (!Number.isInteger(input.teamSize) || input.teamSize < 1 || input.teamSize > 100000) fail('Approximate team size is required');
  ['taxExempt', 'poRequired'].forEach(function (k) { if (input[k] != null && typeof input[k] !== 'boolean') fail('Invalid ' + k); });
  var website = text(input.website, 'website', false, 500);
  if (website && !/^https?:\/\/[^\s]+$/.test(website)) fail('Website must be an http(s) URL');
  return { legalName: text(input.legalName, 'Legal company name', true, 100), contactName: text(input.contactName, 'Billing contact name', true, 100),
    email: email(input.email, 'Billing email', true), apEmail: email(input.apEmail, 'AP email', false), phone: text(input.phone, 'Billing phone', true, 30),
    address: address, website: website, taxExempt: input.taxExempt === true, resaleNumber: text(input.resaleNumber, 'Resale number', false, 50),
    poRequired: input.poRequired === true, poNumber: text(input.poNumber, 'PO number', input.poRequired === true, 100), vertical: input.vertical, teamSize: input.teamSize };
}
function customer(profile, orgId) {
  var p = normalize(profile), names = p.contactName.split(/\s+/), given = names.shift(), a = p.address;
  var out = { DisplayName: 'OMEGA-' + orgId, CompanyName: p.legalName, GivenName: given, FamilyName: names.join(' '),
    PrimaryEmailAddr: { Address: p.email }, PrimaryPhone: { FreeFormNumber: p.phone },
    BillAddr: { Line1: a.line1, Line2: a.line2, City: a.city, CountrySubDivisionCode: a.state, PostalCode: a.postalCode, Country: a.country }, Taxable: !p.taxExempt };
  if (p.website) out.WebAddr = { URI: p.website };
  if (p.resaleNumber) out.ResaleNum = p.resaleNumber;
  return out;
}
function stored(record) {
  var out = {}; FIELDS.forEach(function (k) { if (record && record[k] !== undefined) out[k] = record[k]; });
  return normalize(out);
}
module.exports = { normalize: normalize, customer: customer, stored: stored };
