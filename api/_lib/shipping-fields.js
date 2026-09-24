/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   shipping-fields.js — what a catalog PRODUCT weighs, how tall it stands,
   its NMFC freight class, whether it stacks and how it must be handled.

   ONE validator for the five optional fields, shared by the catalog writer
   (api/_lib/logic-catalog.js), the product importer
   (scripts/import-products.js — which keeps the column names and the unit
   conversion; this file only judges the converted value) and the freight
   plan (api/_lib/freight.js), which reads them for estimates.

   No require() at all, on purpose: scripts/import-products.js is spawned
   without the Admin SDK installed, and custody.js → admin.js needs it. ES5 because
   api/_lib/freight.js is bundled into the public sandbox with it.

   Stored flat on the product row, next to widthFt / depthFt:
     weightLb      number, 1–200,000
     heightFt      number, 0.5–80 (the same plausibility band as the
                   footprint in import-products.js)
     freightClass  string, one of FREIGHT_CLASSES ('77.5', not '77.50')
     stackable     boolean; ABSENT means not on file — blank is not "no"
     handlingNote  string, at most 200 characters
   Products only; a component or a service carries none of them.

   Never published: api/embed-config.js builds its answer key by key and
   names none of these (scripts/test-freight.js asserts it). Missing values
   read "not on file" and are never guessed. */
'use strict';

var FIELDS = ['weightLb', 'heightFt', 'freightClass', 'stackable', 'handlingNote'];
var FREIGHT_CLASSES = ['50', '55', '60', '65', '70', '77.5', '85', '92.5', '100', '110', '125', '150', '175', '200', '250', '300', '400', '500'];
var LIMITS = { weightLb: { min: 1, max: 200000, unit: 'lb' }, heightFt: { min: 0.5, max: 80, unit: 'ft' } };
var NOT_ON_FILE = 'not on file';
var LABELS = { weightLb: 'Weight', heightFt: 'Height', freightClass: 'Freight class', stackable: 'Stackable', handlingNote: 'Handling note' };

function bad(msg) { var e = new Error(msg); e.status = 400; return e; }
function blank(v) { return v === null || v === undefined || (typeof v === 'string' && v.replace(/^\s+|\s+$/g, '') === ''); }
function trim(v) { return String(v).replace(/^\s+|\s+$/g, ''); }

/* one field → its stored value, or null when blank; a bad value throws 400 */
function value(key, v) {
  if (FIELDS.indexOf(key) < 0) throw bad('Unknown shipping field ' + key);
  if (blank(v)) return null;
  if (key === 'weightLb' || key === 'heightFt') {
    if (typeof v === 'boolean') throw bad(LABELS[key] + ' must be a number');
    var n = Number(typeof v === 'string' ? trim(v).replace(/,/g, '') : v), L = LIMITS[key];
    if (!isFinite(n) || n < L.min || n > L.max) throw bad(LABELS[key] + ' must be ' + L.min + '–' + L.max.toLocaleString('en-US') + ' ' + L.unit + ' (got ' + trim(v) + ')');
    return Math.round(n * 100) / 100;
  }
  if (key === 'freightClass') {
    var s = trim(v), num = Number(s), c = /^\d+(\.\d+)?$/.test(s) && isFinite(num) ? String(num) : s;
    if (FREIGHT_CLASSES.indexOf(c) < 0) throw bad('Freight class must be an NMFC class: ' + FREIGHT_CLASSES.join(', ') + ' (got ' + s + ')');
    return c;
  }
  if (key === 'stackable') {
    if (v === true || v === false) return v;
    var t = trim(v).toLowerCase();
    if (['yes', 'y', '1', 'true'].indexOf(t) >= 0) return true;
    if (['no', 'n', '0', 'false'].indexOf(t) >= 0) return false;
    throw bad('Stackable must be yes or no (got ' + trim(v) + ')');
  }
  /* handlingNote */
  var h = trim(v);
  if (/[\u0000-\u001f\u007f]/.test(h)) throw bad('Handling note must be one line of plain text');
  if (h.length > 200) throw bad('Handling note: at most 200 characters');
  return h;
}

/* only the fields PRESENT on p; a present blank becomes null, which clears
   it; an absent one is left out, so a save that does not send it keeps the
   stored value */
function pick(p) {
  var out = {};
  if (!p || typeof p !== 'object') return out;
  for (var i = 0; i < FIELDS.length; i++) {
    var k = FIELDS[i];
    if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = value(k, p[k]);
  }
  return out;
}

function has(p, k) { return !!p && p[k] !== null && p[k] !== undefined && p[k] !== ''; }
function fmt(n) { var r = Math.round(Number(n) * 100) / 100; return r.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
/* W × D × H in feet; a missing side says so rather than being guessed */
function dims(p) {
  var parts = ['widthFt', 'depthFt', 'heightFt'], any = false, out = [];
  for (var i = 0; i < parts.length; i++) {
    if (has(p, parts[i]) && isFinite(Number(p[parts[i]]))) { any = true; out.push(String(Math.round(Number(p[parts[i]]) * 100) / 100)); }
    else out.push(NOT_ON_FILE);
  }
  return any ? out.join(' × ') : NOT_ON_FILE;
}
/* display strings for one product */
function describe(p) {
  p = p || {};
  return {
    weight: has(p, 'weightLb') ? fmt(p.weightLb) + ' lb' : NOT_ON_FILE,
    dims: dims(p) === NOT_ON_FILE ? NOT_ON_FILE : dims(p) + ' ft',
    freightClass: has(p, 'freightClass') ? String(p.freightClass) : NOT_ON_FILE,
    stackable: p.stackable === true ? 'yes' : p.stackable === false ? 'no' : NOT_ON_FILE,
    handling: has(p, 'handlingNote') ? String(p.handlingNote) : NOT_ON_FILE
  };
}

module.exports = { FIELDS: FIELDS, FREIGHT_CLASSES: FREIGHT_CLASSES, LIMITS: LIMITS, NOT_ON_FILE: NOT_ON_FILE, value: value, pick: pick, describe: describe, dims: dims };
