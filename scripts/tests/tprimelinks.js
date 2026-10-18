#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * A project Omega Prime made is connected everywhere it is listed (Tommy,
 * 2026-10-17: "when I open a project and it was made in Prime, I should be
 * able to access what I had made in Prime, and the quotes I had sent out and
 * able to go back and track if the quote had been sent and accepted … all
 * this needs to be connected and organized"; "this is so vital").
 *
 * Cut from the real pages and run in a VM:
 *   projects.html  primeCell(): the Omega Prime chip (back into Prime), the
 *                  proposal's standing from the server's mirror
 *                  (projects/{id}.prime.quote) linking to Prime's Track on
 *                  that quote, and the order in this workspace's Omega Logic;
 *                  the "Made in Omega Prime" filter
 *   workspace.html primeRow(): the same two links on an In flight card
 * Never a link for a project Prime did not make; every string escaped; a
 * status the server never sends cannot inject a class; an order in another
 * workspace is named, never linked. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function cut(src, start, end) {
  var i = src.indexOf(start); assert.ok(i >= 0, 'found ' + start);
  var j = src.indexOf(end, i + start.length); assert.ok(j > i, 'found the end of ' + start);
  return src.slice(i, j);
}

/* ── projects.html ─────────────────────────────────────────────────────── */
var pj = read('projects.html');
var pjCode = cut(pj, 'function esc(s)', '\n') + '\n' + cut(pj, 'const QUOTE_WORD = {', 'function openProject(id)');
var P = { WS: { orgId: 'sunwave.energy' } };
vm.createContext(P);
vm.runInContext(pjCode + '\nthis.primeCell = primeCell; this.primeOf = primeOf;', P);

assert.equal(P.primeCell({ id: 'p1', name: 'Plain' }), '', 'a project Prime did not make carries nothing'); count++;
assert.equal(P.primeCell({ id: 'p1', prime: 'x' }), '', 'a malformed prime field carries nothing'); count++;
var only = P.primeCell({ id: 'p 1/x', prime: { v: 2, step: 'map' } });
assert.match(only, /<a class="pt-chip prime" href="\/omega-prime\?id=p%201%2Fx" onclick="event\.stopPropagation\(\)"/, 'the way back into Prime, the id encoded'); count++;
assert.ok(only.indexOf('pt-chip q') < 0 && only.indexOf('pt-chip order') < 0, 'no proposal, no order: only the Prime chip'); count++;

var sent = P.primeCell({ id: 'p2', prime: { quote: { id: 'qt-0123456789abcdef', quoteNo: 'SUNWAV-Q-20261017-ABCDE', rev: 2, status: 'sent', sentAt: '2026-10-17T15:00:00.000Z' } } });
assert.match(sent, /<a class="pt-chip q sent" href="\/omega-prime\?id=p2&step=track&quote=qt-0123456789abcdef"/, 'the proposal chip opens Prime\'s Track on that quote'); count++;
assert.match(sent, />Proposal sent · [^<]+<\/a>/, 'it says sent, with the day'); count++;
assert.match(sent, /title="SUNWAV-Q-20261017-ABCDE rev 2 · track it in Omega Prime"/, 'the quote number in the tooltip'); count++;

var words = { draft: 'Proposal draft', viewed: 'Proposal viewed', approved: 'Proposal approved', declined: 'Proposal declined', expired: 'Proposal expired', withdrawn: 'Proposal withdrawn' };
Object.keys(words).forEach(function (st) {
  var h = P.primeCell({ id: 'p3', prime: { quote: { id: 'qt-1', status: st, sentAt: '2026-10-17T15:00:00Z', decidedAt: '2026-10-20T12:00:00Z' } } });
  assert.ok(h.indexOf('pt-chip q ' + st + '"') > 0 && h.indexOf('>' + words[st]) > 0, st); count++;
});
var hostile = P.primeCell({ id: 'p4', prime: { quote: { id: 'qt-"><img src=x>', quoteNo: '<b>x</b>', status: 'sent" onmouseover="x', sentAt: null } } });
assert.ok(hostile.indexOf('<img') < 0 && hostile.indexOf('<b>') < 0 && !/\sonmouseover=/.test(hostile), 'every string escaped, a forged status cannot add an attribute'); count++;
assert.match(hostile, /class="pt-chip q sentonmouseoverx"/, 'the status is reduced to letters before it becomes a class'); count++;
assert.match(hostile, />Proposal<\/a>/, 'an unknown status reads "Proposal", never the raw value'); count++;

var ours = P.primeCell({ id: 'p5', prime: { quote: { id: 'qt-2', status: 'approved', decidedAt: '2026-10-20T12:00:00Z' }, order: { org: 'sunwave.energy', id: 'prime_abc', orderNo: 'PRM-20261020-ABC123', at: 1 } } });
assert.match(ours, /<a class="pt-chip order" href="\/omega-logic\?org=sunwave\.energy&order=prime_abc#orders"[^>]*>Omega Logic · PRM-20261020-ABC123<\/a>/, 'the order opens in this workspace\'s Omega Logic'); count++;
var theirs = P.primeCell({ id: 'p6', prime: { order: { org: 'cleancell.us', id: 'prime_x', orderNo: 'PRM-1' } } });
assert.ok(/<span class="pt-chip order">Omega Logic · PRM-1<\/span>/.test(theirs) && theirs.indexOf('/omega-logic?') < 0, 'an order in another workspace is named, never linked'); count++;

/* the list wires them in: the row, the search on the quote number, the filter */
assert.match(pj, /<div class="pt-addr">\$\{esc\(p\.address\|\|'—'\)\}<\/div>\$\{primeCell\(p\)\}<\/div>/, 'every row carries its Prime cell'); count++;
assert.match(pj, /<option value="prime">Made in Omega Prime<\/option>/); assert.match(pj, /if \(sort === 'prime'\) filtered = filtered\.filter\(p => !!primeOf\(p\)\);/); count += 2;
assert.match(pj, /String\(pq\.quoteNo\|\|''\)\.toLowerCase\(\)\.includes\(q\)/, 'search finds a project by its proposal number'); count++;
assert.match(pj, /function openProject\(id\) \{ window\.location\.href = '\/editor\.html\?id='\+id; \}/, 'the row itself still opens Site Map'); count++;

/* ── workspace.html ────────────────────────────────────────────────────── */
var ws = read('workspace.html');
var wsCode = cut(ws, 'var PRIME_QUOTE_WORD = {', 'function openProject(id) {');
var W = { esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); } };
vm.createContext(W);
vm.runInContext(wsCode + '\nthis.primeRow = primeRow;', W);
assert.equal(W.primeRow('p1', { name: 'x' }), '', 'an In flight card for a non-Prime project is unchanged'); count++;
var card = W.primeRow('p 2', { prime: { quote: { id: 'qt-9', quoteNo: 'Q-9', status: 'viewed' } } });
assert.match(card, /<a class="ows-pill sm ghost" href="\/omega-prime\?id=p%202">Omega Prime<\/a>/); count++;
assert.match(card, /<a class="prime-q viewed" href="\/omega-prime\?id=p%202&amp;step=track&amp;quote=qt-9">Proposal viewed · Q-9<\/a>/, 'the card says where the proposal stands and opens Track on it'); count++;
assert.match(ws, /'<\/div>' \+ primeRow\(c\.id, p\) \+ '<\/article>'/, 'every project card carries the row'); count++;

console.log('tprimelinks: ' + count + ' assertions passed');
