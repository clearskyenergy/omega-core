/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/discreet.js — the names no file may say, matched unwritten
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ONE matcher, shared by scripts/tests/tdiscreet.js (everything the site
   serves) and scripts/test-office-pages.js (the office pages), so a name is
   added in one place and no test carries its own spelled-out copy.

   The buyer on Clean Cell's first live order — the company, its people,
   its PO code — must not appear in ANY file, this one included. So each of
   those is matched by the SHA-256 of the word, never written:

     lowercased whole words, and a compound however it is joined ('x-y',
     'xy', the 'xy' of a domain, or 'xy' inside a longer run of letters);
     CAPITALISED words matched as written — one of the buyer's names is
     also an ordinary lowercase word (an electrical quantity on the
     editor's disconnect labels and the EV workbook's charger pricing), so
     only its capitalised form, alone or as a camel-case segment, is the
     company.

   Another real customer of the sample tenant, a PO numbering and a
   hard-coded tenant name are plain patterns: they must never be SERVED,
   and the test has to say what it looks for.

   To add a hashed word (lowercase it first, unless it is a capitalised one):
     node -e "console.log(require('crypto').createHash('sha256').update('word').digest('hex'))"
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
function sha(w) { return crypto.createHash('sha256').update(w).digest('hex'); }

var BUYER_CO = 'the buyer on Clean Cell\'s first live order (the company)', BUYER_KEY = 'the buyer on Clean Cell\'s first live order (its domain or key)';
/* lowercased words. `len` is the word's length (only a word that long is
   hashed, which keeps an 11 MB page quick); `inside` marks a compound that
   is also looked for inside a longer run of letters, and `sum` (its
   character codes added up) picks the few windows of such a run worth
   hashing */
var WORDS = {
  '44079fc3a7b338a0858068833ce18ab29af77db3337442cbef7991acea87cb5d': { key: 'buyer', what: BUYER_KEY, len: 15, inside: true, sum: 1568 },
  '461f09556c26f2100aaac02b36fb3b73303bd9f884a937f7c983e1e5c1148a48': { key: '#461f09556c26f2100aaac02b36fb3b73303bd9f884a937f7c983e1e5c1148a48', what: 'a person at the buyer', len: 7 },
  '1ff6bb68cb39631e6b2c3b68721f7363687ea736a9427e237c8918a15349fccc': { key: '#1ff6bb68cb39631e6b2c3b68721f7363687ea736a9427e237c8918a15349fccc', what: 'the buyer\'s PO code', len: 4 }
};
/* capitalised words, as written */
var CAPITALISED = {
  '69ec088b2d55e36ecddba17f6b92e905e9bc1f04b58db9c4dc02a7fa92130028': { key: 'buyer', what: BUYER_CO, len: 8 }
};
var PLAIN = [
  { key: 'incharge', what: 'InCharge Energy, a Clean Cell customer', re: /incharge/gi },
  /* the PO-sheet example that named a customer's PO numbers (OFF-06), and the
     hard-coded, misspelled tenant name po-inbox printed for every tenant */
  { key: 'po-example', what: 'a real customer\'s PO numbering in a sample line', re: /\bINC-44\d\d\b/g },
  { key: 'tenant-hardcoded', what: 'a tenant\'s name hard-coded into a shared page', re: /CleanCell[’']s/g }
];
var COMPOUNDS = Object.keys(WORDS).filter(function (h) { return WORDS[h].inside; }).map(function (h) { return { hash: h, len: WORDS[h].len, sum: WORDS[h].sum }; });
function lengths(map) { var o = {}; Object.keys(map).forEach(function (h) { o[map[h].len] = 1; }); return o; }
var LENS = lengths(WORDS), CAP_LENS = lengths(CAPITALISED);

function lineAt(text, i) { return text.slice(0, Math.max(0, i)).split('\n').length; }

/* hits(text) → [{ key, what, n, sample, line }]: each thing found, how many
   times, and the first line it is on — the line says where, so a hashed
   word can be found without this file saying what it is */
function hits(text) {
  text = String(text == null ? '' : text);
  var found = [], low = text.toLowerCase(), by = {};
  function tally(entry, at, n, sample) {
    var k = entry.key + '|' + entry.what, h = by[k];
    if (!h) { h = by[k] = { key: entry.key, what: entry.what, n: 0, sample: sample, line: lineAt(text, at) }; found.push(h); }
    h.n += n;
  }
  PLAIN.forEach(function (d) { var m = text.match(d.re); if (m) tally(d, text.search(d.re), m.length, '"' + m[0] + '"'); });
  /* whole lowercase words, and a compound inside a longer run */
  var seen = {};
  (low.match(/[a-z0-9]+/g) || []).forEach(function (w) {
    if (seen[w] || w.length > 40) return; seen[w] = 1;
    var e = LENS[w.length] ? WORDS[sha(w)] : null;
    if (e) { var re = new RegExp('\\b' + w + '\\b', 'g'); tally(e, low.search(re), (low.match(re) || []).length, 'a hashed word'); return; }
    COMPOUNDS.forEach(function (c) {
      if (w.length <= c.len) return;
      var sum = 0, i; for (i = 0; i < c.len; i++) sum += w.charCodeAt(i);
      for (i = 0; i + c.len <= w.length; i++) {
        if (i) sum += w.charCodeAt(i + c.len - 1) - w.charCodeAt(i - 1);
        if (sum === c.sum && sha(w.slice(i, i + c.len)) === c.hash) { tally(WORDS[c.hash], low.indexOf(w), low.split(w).length - 1, 'a hashed word'); break; }
      }
    });
  });
  /* a compound written with a hyphen: each adjacent pair, joined */
  var pairs = {};
  low.split(/[^a-z0-9-]+/).forEach(function (run) {
    if (run.indexOf('-') < 0) return;
    var p = run.split('-');
    for (var i = 0; i + 1 < p.length; i++) {
      var joined = p[i] + p[i + 1], e = LENS[joined.length] ? WORDS[sha(joined)] : null;
      if (e && e.inside) { var pair = p[i] + '-' + p[i + 1]; if (!pairs[pair]) { pairs[pair] = 1; tally(e, low.indexOf(pair), low.split(pair).length - 1, 'a hashed word'); } }
    }
  });
  /* capitalised words and camel-case segments, as written */
  var caps = {};
  (text.match(/[A-Z][a-z]+/g) || []).forEach(function (w) {
    if (caps[w] || !CAP_LENS[w.length]) return; caps[w] = 1;
    var e = CAPITALISED[sha(w)];
    if (e) { var re = new RegExp(w + '(?![a-z])', 'g'); tally(e, text.search(re), (text.match(re) || []).length, 'a hashed word'); }
  });
  return found;
}

module.exports = { hits: hits, sha: sha, WORDS: WORDS, CAPITALISED: CAPITALISED, PLAIN: PLAIN };
