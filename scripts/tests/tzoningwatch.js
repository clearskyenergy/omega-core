#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Zoning & legislation, as reported (omega-zoning-watch.js and
 * data/zoning/measures.json). Holds, with no network:
 *   1. the judge has NO pass — "none on file" is conditional and says the
 *      coverage is incomplete; an uncovered state, an unresolved county and
 *      an unloaded tracker are unknown, never a reading;
 *   2. a restriction reported in force is a reported risk; one whose expiry
 *      date has passed is a question, not a finding; a proposed one is not
 *      in force; chamber passage is never promoted;
 *   3. matching is by state, county FIPS and subject, and a municipal
 *      measure is said to apply inside its municipality;
 *   4. THE DATASET: every record carries a jurisdiction, a status from the
 *      vocabulary, a county FIPS that belongs to its state, a summary, and
 *      at least one https source with who published it and when it was
 *      read — and no compiled commercial tracker is a source;
 *   5. the page and the three due-diligence profiles are wired to it. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..');
var Z = require(path.join(ROOT, 'omega-zoning-watch.js'));
var DD = require(path.join(ROOT, 'grid-atlas-dd.js'));
var n = 0;
function ok(c, m) { assert.ok(c, m); n++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); n++; }

/* ── fixture ───────────────────────────────────────────────────────────── */
var D = { builtAt: '2026-11-09T00:00:00Z', states: ['MO', 'OK'], records: [
  { id: 'mo-x-moratorium', state: 'MO', level: 'municipal', jurisdiction: 'City of X', countyFips: ['29183'], subjects: ['data-center'], type: 'moratorium', effect: 'restrictive',
    title: 'One-year moratorium on data centers', status: 'active', statusDate: '2025-08-20', expires: '2026-08-20', summary: 's', sources: [{ url: 'https://example.gov/a' }] },
  { id: 'mo-y-bess', state: 'MO', level: 'county', jurisdiction: 'Y County', countyFips: ['29001'], subjects: ['bess'], type: 'zoning', effect: 'restrictive',
    title: 'BESS setback ordinance', status: 'proposed', statusDate: '2026-03-01', summary: 's', sources: [{ url: 'https://example.gov/b' }] },
  { id: 'mo-state-incentive', state: 'MO', level: 'state', jurisdiction: 'State of Missouri', countyFips: [], subjects: ['data-center'], type: 'law', effect: 'fiscal',
    title: 'Data center sales tax exemption', status: 'enacted', statusDate: '2025-04-09', summary: 's', sources: [{ url: 'https://example.gov/c' }] },
  { id: 'mo-state-bill', state: 'MO', level: 'state', jurisdiction: 'State of Missouri', countyFips: [], subjects: ['data-center', 'bess'], type: 'bill', effect: 'restrictive',
    title: 'Large-load siting bill', status: 'pending', statusDate: '2026-02-11', summary: 's', sources: [{ url: 'https://example.gov/d' }] },
  { id: 'ok-state-mor', state: 'OK', level: 'state', jurisdiction: 'State of Oklahoma', countyFips: [], subjects: ['bess'], type: 'moratorium', effect: 'restrictive',
    title: 'Statewide pause', status: 'enacted', statusDate: '2026-05-01', summary: 's', sources: [{ url: 'https://example.gov/e' }] }
] };
function J(q) { return Z.judge(D, q); }

/* ── 1 · no pass, and what is unknown ──────────────────────────────────── */
var all = [J({ state: 'MO', county: '29183', subject: 'data-center', today: '2026-01-01' }), J({ state: 'MO', county: '29999', subject: 'data-center' }),
           J({ state: 'TX', county: '48001' }), J({}), Z.judge(null, { state: 'MO', county: '29183' })];
all.forEach(function (r) { ['local', 'state'].forEach(function (k) { ok(['risk', 'conditional', 'unknown'].indexOf(r.rows[k].status) >= 0, 'a zoning row is risk, conditional or unknown — never pass'); }); });
var empty = J({ state: 'MO', county: '29999', countyName: 'Nowhere County', subject: 'data-center' });
eq(empty.rows.local.status, 'conditional', 'no local record is conditional, not a pass');
ok(/none on file/.test(empty.rows.local.value) && /Coverage is incomplete/.test(empty.rows.local.note) && /not a finding that none exists/.test(empty.rows.local.note), '"none on file" says the coverage is incomplete');
ok(/Nowhere County/.test(empty.rows.local.note), 'and names the county it looked in');
eq(J({ state: 'TX', county: '48001' }).rows.local.status, 'unknown', 'a state the tracker does not cover is unknown');
ok(/no coverage for TX/.test(J({ state: 'TX', county: '48001' }).rows.state.note), 'and says so');
eq(J({}).rows.local.status, 'unknown', 'an unresolved county is unknown');
eq(J({ state: 'MO' }).rows.local.status, 'unknown', 'a state without a county still leaves the local row unknown');
eq(J({ state: 'MO' }).rows.state.status, 'conditional', 'while the state row is read');
eq(Z.judge(null, { state: 'MO', county: '29183' }).rows.local.status, 'unknown', 'an unloaded tracker is not a reading');

/* ── 2 · in force, lapsed, moving ──────────────────────────────────────── */
var inForce = J({ state: 'MO', county: '29183', subject: 'data-center', today: '2026-01-15' });
eq(inForce.rows.local.status, 'risk', 'a moratorium reported in force is a reported risk');
ok(/City of X/.test(inForce.rows.local.note) && /inside that municipality/.test(inForce.rows.local.note), 'it names the jurisdiction and says a municipal measure applies inside it');
var lapsed = J({ state: 'MO', county: '29183', subject: 'data-center', today: '2026-11-09' });
eq(lapsed.rows.local.status, 'conditional', 'past its reported expiry date it is a question, not a risk');
ok(/lapsed or been extended/.test(lapsed.rows.local.note), 'and the note says it may have lapsed or been extended');
eq(Z.standing(D.records[0], '2026-11-09'), 'lapsed?', 'standing: in force with a passed expiry is "lapsed?"');
eq(Z.standing(D.records[0], '2026-01-15'), 'active', 'standing: before the expiry it is as reported');
var moving = J({ state: 'MO', county: '29001', subject: 'bess' });
eq(moving.rows.local.status, 'conditional', 'a proposed restriction is not in force');
ok(/proposed or pending/.test(moving.rows.local.value), 'and is called proposed or pending');
var st = J({ state: 'MO', county: '29183', subject: 'data-center', today: '2026-11-09' }).rows.state;
eq(st.status, 'conditional', 'state laws and bills are read, not scored as a block');
ok(/1 in force · 1 moving/.test(st.value), 'in force and moving are counted apart');
ok(/a bill that passed one chamber is not law/.test(st.note), 'the state note refuses to promote a pending bill');
eq(J({ state: 'OK', county: '40081', subject: 'bess' }).rows.state.status, 'risk', 'only a state MORATORIUM in force is a risk on its own');

/* ── 3 · matching ──────────────────────────────────────────────────────── */
eq(Z.match(D, { state: 'MO', county: '29183', subject: 'data-center' }).local.map(function (r) { return r.id; }), ['mo-x-moratorium'], 'local records match by county');
eq(Z.match(D, { state: 'MO', county: '29183', subject: 'bess' }).local.length, 0, 'and by subject');
eq(Z.match(D, { state: 'MO', county: '29183', subject: 'bess' }).state.map(function (r) { return r.id; }), ['mo-state-bill'], 'state records match by subject too');
eq(Z.match(D, { state: 'MO', county: '29183' }).state.length, 2, 'no subject means every subject');
eq(Z.match(D, { state: 'MO', county: '29183', subject: 'data-center', today: '2026-01-15' }).state.map(function (r) { return r.id; }), ['mo-state-incentive', 'mo-state-bill'], 'a state list leads with what is law, then what is moving');
/* local lists lead with a restriction in force; the searched address may
   name the city, which then leads its rank — it orders, it never filters */
var two = { builtAt: '2026-11-09T00:00:00Z', states: ['OK'], records: [
  { id: 'a-broken-arrow', state: 'OK', level: 'municipal', jurisdiction: 'City of Broken Arrow', countyFips: ['40143'], subjects: ['data-center'], type: 'moratorium', effect: 'restrictive', title: 'm', status: 'active', statusDate: '2026-06-15', summary: 's', sources: [] },
  { id: 'b-tulsa', state: 'OK', level: 'municipal', jurisdiction: 'City of Tulsa', countyFips: ['40143'], subjects: ['data-center'], type: 'moratorium', effect: 'restrictive', title: 'm', status: 'active', statusDate: '2026-03-25', summary: 's', sources: [] },
  { id: 'c-rezoning', state: 'OK', level: 'municipal', jurisdiction: 'City of Sand Springs', countyFips: ['40143'], subjects: ['data-center'], type: 'decision', effect: 'enabling', title: 'r', status: 'enacted', statusDate: '2026-10-01', summary: 's', sources: [] }
] };
eq(Z.match(two, { state: 'OK', county: '40143' }).local.map(function (r) { return r.id; }), ['a-broken-arrow', 'b-tulsa', 'c-rezoning'], 'without a hint: restrictions in force first, newest first');
eq(Z.match(two, { state: 'OK', county: '40143', placeHint: '2711 S Harvard Ave, Tulsa, OK' }).local.map(function (r) { return r.id; }), ['b-tulsa', 'a-broken-arrow', 'c-rezoning'], 'an address naming the city puts that city first');
eq(Z.match(two, { state: 'OK', county: '40143', placeHint: 'Sand Springs, OK' }).local.map(function (r) { return r.id; })[0], 'a-broken-arrow', 'the hint orders within a rank and never lifts an enabling record over a restriction');
eq(Z.match(two, { state: 'OK', county: '40143', placeHint: 'Tulsa' }).local.length, 3, 'and never filters');
eq(Z.fipsOf('400819617004056'), { state: 'OK', stateFips: '40', county: '40081' }, 'a census block GEOID gives the state and county');
eq(Z.fipsOf('8826ea51ddfffff'), null, 'an H3 index is not a census GEOID');
eq(Z.fipsOf(''), null, 'nothing in, nothing out');

/* ── 4 · the dataset ───────────────────────────────────────────────────── */
var data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/zoning/measures.json'), 'utf8'));
var FIPS_OF = {}; Object.keys(Z.STATE_FIPS).forEach(function (f) { FIPS_OF[Z.STATE_FIPS[f]] = f; });
ok(Array.isArray(data.states) && data.states.length >= 1 && /^\d{4}-\d{2}-\d{2}/.test(data.builtAt), 'the dataset says which states it covers and when it was built');
ok(/not verified/i.test(data.scope || ''), 'and says at the top that it is reported, not verified');
ok(data.records.length >= 20, 'it is a seed worth loading (' + data.records.length + ' records)');
var ids = {};
data.records.forEach(function (r) {
  var where = r.id + ': ';
  ok(/^[a-z0-9-]+$/.test(r.id) && !ids[r.id], where + 'a unique slug id'); ids[r.id] = 1;
  ok(data.states.indexOf(r.state) >= 0, where + 'its state is a covered state');
  ok(['state', 'county', 'municipal'].indexOf(r.level) >= 0, where + 'level');
  ok(r.jurisdiction && r.title && r.summary && r.summary.length >= 20, where + 'jurisdiction, title and a summary');
  ok(Z.STATUS[r.status], where + 'status is in the vocabulary (' + r.status + ')');
  ok(['restrictive', 'enabling', 'procedural', 'fiscal'].indexOf(r.effect) >= 0, where + 'effect');
  ok(Array.isArray(r.subjects) && r.subjects.length && r.subjects.every(function (s) { return Z.SUBJECT[s]; }), where + 'subjects');
  ok(Array.isArray(r.countyFips), where + 'countyFips is a list');
  if (r.level === 'state') eq(r.countyFips.length, 0, where + 'a state measure names no county');
  else ok(r.countyFips.length >= 1 && r.countyFips.every(function (f) { return /^\d{5}$/.test(f) && f.slice(0, 2) === FIPS_OF[r.state]; }), where + 'county FIPS belong to its state');
  ['statusDate', 'effective', 'expires'].forEach(function (k) { ok(r[k] == null || /^\d{4}-\d{2}-\d{2}$/.test(r[k]), where + k + ' is a date or null'); });
  ok(Array.isArray(r.sources) && r.sources.length >= 1, where + 'at least one source');
  r.sources.forEach(function (s) {
    ok(/^https:\/\//.test(s.url), where + 'source is an https link');
    ok(!/infrasale/i.test(s.url), where + 'no compiled commercial tracker is a source');
    ok(s.publisher && ['primary', 'news'].indexOf(s.kind) >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(s.retrieved || ''), where + 'who published it, what kind, and when it was read');
  });
});
data.states.forEach(function (s) { ok(data.records.some(function (r) { return r.state === s; }), s + ' has at least one record'); });
/* the real data through the real judge: no row is ever a pass */
data.records.forEach(function (r) {
  var j = Z.judge(data, { state: r.state, county: (r.countyFips || [])[0] || null, subject: r.subjects[0] });
  ok(j.covered && ['risk', 'conditional', 'unknown'].indexOf(j.rows.local.status) >= 0 && ['risk', 'conditional'].indexOf(j.rows.state.status) >= 0, r.id + ' judges without a pass');
});

/* ── 5 · the page and the checklists ───────────────────────────────────── */
var html = fs.readFileSync(path.join(ROOT, 'grid-atlas.html'), 'utf8');
ok(/<script src="\/omega-zoning-watch\.js"><\/script>/.test(html), 'the page loads the module');
ok(/OmegaZoningWatch\.judge\(/.test(html) && /OmegaZoningWatch\.fipsOf\(bdc\.block\.geoid\)/.test(html), 'the pin analysis judges the county the FCC lookup found');
ok(/zoning: zj\?zj\.rows:null/.test(html), 'and hands the readings to the due-diligence checklist');
function item(r, id) { var hit = null; r.sections.forEach(function (s) { s.items.forEach(function (it) { if (it.id === id) hit = it; }); }); return hit; }
[['compute', 'cp'], ['bess', 'bs'], ['supercharger', 'sc']].forEach(function (p) {
  var none = DD.run(p[0], {});
  eq(item(none, p[1] + '-zl').status, 'unknown', p[0] + ': no zoning answer is unknown');
  var got = DD.run(p[0], { zoning: { local: { status: 'risk', value: '1 reported in force', note: 'x' }, state: { status: 'conditional', value: 'none on file', note: 'y' } } });
  eq(item(got, p[1] + '-zl').status, 'risk', p[0] + ': a reported local restriction reaches the checklist');
  eq(item(got, p[1] + '-zs').status, 'conditional', p[0] + ': the state reading reaches the checklist');
});
ok(/reported, not verified/i.test(Z.DISCLAIMER) && /Not legal advice/.test(Z.DISCLAIMER), 'the disclaimer says reported, not verified, and not legal advice');

console.log('tzoningwatch: ' + n + ' checks passed');
