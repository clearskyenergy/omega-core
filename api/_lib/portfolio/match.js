/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/match.js — which site a file belongs to
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. A portfolio package carries bills, interval files, plans and
   drawings beside the site list. Each file is matched to a site by
   SITE ID FIRST (a folder named by the ID, or the ID in the file name) and
   by NORMALIZED ADDRESS SECOND (street number + street name in the path).
   One clear match assigns; more than one, or none, goes to the review
   queue. A document is never quietly attached to the wrong site — the
   customer confirms the ambiguous ones (same rule tenants/osa/site-screen.js
   applies to a partner's scorecard).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var I = require('./ingest');

var SITELIST_EXT = /\.(csv|xlsx)$/i, INTERVAL_EXT = /\.(csv|txt)$/i, BILL_EXT = /\.(pdf|png|jpe?g)$/i, DOC_EXT = /\.(pdf|png|jpe?g|dxf|dwg|docx?|xlsx?|txt|kmz|kml)$/i;

/* What a file is, from its name and a look at its head. */
function classify(name, bytes) {
  var lower = String(name || '').toLowerCase(), base = lower.split('/').pop();
  if (SITELIST_EXT.test(base) && /site|portfolio|list|master|locations|index/.test(base)) return 'sitelist';
  if (INTERVAL_EXT.test(base)) {
    var head = bytes ? bytes.subarray(0, 4000).toString('utf8') : '';
    var lines = head.split(/\r?\n/).filter(Boolean), numeric = lines.filter(function (l) { return /(^|[,;\t])\s*-?\d+(\.\d+)?\s*$/.test(l); }).length;
    if (/interval|8760|load|profile|kw\b|demand/.test(base) || numeric >= Math.max(5, lines.length * 0.7)) return 'interval';
    if (SITELIST_EXT.test(base)) return 'sitelist';
  }
  if (/\.xlsx$/i.test(base)) return 'sitelist';
  if (BILL_EXT.test(base) && /bill|invoice|statement|utility|comed|pge|sce|duke|meter/.test(base)) return 'bill';
  if (DOC_EXT.test(base)) return /plan|one.?line|single.?line|sld|schedule|equipment|site|drawing|layout|survey/.test(base) ? 'document' : (BILL_EXT.test(base) ? 'bill' : 'document');
  return 'other';
}

function tokens(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean); }

/* files: [{ id, name }]  sites: [{ siteId, addressKey, name }]
   → [{ id, name, siteId|null, matchedBy, candidates, ambiguous }] */
function matchFiles(files, sites) {
  var byId = {}, addrIndex = [];
  (sites || []).forEach(function (s) {
    byId[I.siteIdKey(s.siteId)] = s.siteId;
    var street = (s.addressKey || '').split('|')[0], parts = street.split(' ').filter(Boolean);
    if (parts.length >= 2 && /^\d+$/.test(parts[0])) addrIndex.push({ siteId: s.siteId, number: parts[0], street: parts.slice(1, 3).join(' '), tokens: parts.slice(1) });
    var nameTokens = tokens(s.name).filter(function (t) { return t.length > 3; });
    if (nameTokens.length) addrIndex.push({ siteId: s.siteId, nameTokens: nameTokens });
  });
  return (files || []).map(function (f) {
    var path = String(f.name || ''), segs = path.split('/'), base = segs.pop(), hits = {};
    /* 1 · Site ID: a folder named by the ID, or the ID as a token of the file name. */
    segs.forEach(function (seg) { var k = I.siteIdKey(seg); if (byId[k]) hits[byId[k]] = 'siteId'; });
    if (!Object.keys(hits).length) {
      var baseKey = I.siteIdKey(base.replace(/\.[^.]+$/, ''));
      Object.keys(byId).forEach(function (k) { if (k.length >= 3 && (baseKey === k || baseKey.indexOf(k + '-') === 0 || baseKey.indexOf('-' + k + '-') >= 0 || baseKey.slice(-k.length - 1) === '-' + k)) hits[byId[k]] = 'siteId'; });
    }
    /* 2 · Address: street number + street name inside the path. */
    if (!Object.keys(hits).length) {
      var pathTokens = tokens(path);
      addrIndex.forEach(function (a) {
        if (a.number) { if (pathTokens.indexOf(a.number) >= 0 && a.tokens.some(function (t) { return t.length > 2 && pathTokens.indexOf(t) >= 0; })) hits[a.siteId] = hits[a.siteId] || 'address'; }
        else if (a.nameTokens && a.nameTokens.every(function (t) { return pathTokens.indexOf(t) >= 0; })) hits[a.siteId] = hits[a.siteId] || 'name';
      });
    }
    var ids = Object.keys(hits), firm = ids.filter(function (k) { return hits[k] !== 'name'; });
    /* A site-name match alone is a suggestion for the review queue, not an assignment. */
    if (firm.length === 1) return { id: f.id, name: path, siteId: firm[0], matchedBy: hits[firm[0]], candidates: ids, ambiguous: false };
    return { id: f.id, name: path, siteId: null, matchedBy: null, candidates: ids, ambiguous: ids.length > 0 };
  });
}

module.exports = { classify: classify, matchFiles: matchFiles };
