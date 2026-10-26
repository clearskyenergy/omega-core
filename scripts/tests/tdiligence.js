/* scripts/tests/tdiligence.js — the compute-site due diligence
   (api/_lib/portfolio/diligence.js) and its enable script.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Pure: no network, no Firestore (the enable script's dry run uses the
   portfolio fakes' in-memory store). Every rule the library states is
   pinned here, and the one that matters most — confirmed needs a document
   on the site's Files — is also mutation-tested: with its guard cut out
   the library accepts a confirmation this suite refuses. */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var D = require('../../api/_lib/portfolio/diligence'), P = require('../../api/_lib/portfolio/power');
var SRC = fs.readFileSync(path.join(ROOT, 'api/_lib/portfolio/diligence.js'), 'utf8');
var SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'tenants/solelacapital/portfolio-diligence.json'), 'utf8'));
var CFG = D.normalizeConfig(D.validateConfig(SEED));
var NOW = '2026-10-25T15:00:00.000Z', OWNER = 'thomas@solelacapital.com';
var FILES = ['f_willserve', 'f_ia', 'f_quote', 'f_deed', 'f_pa', 'f_lease', 'f_assign', 'f_amend', 'f_offtake', 'f_chips', 'f_survey', 'f_bill'].map(function (id) { return { id: id, uploadState: 'stored', archived: false }; })
  .concat([{ id: 'f_archived', uploadState: 'stored', archived: true }, { id: 'f_pending', uploadState: 'pending' }]);

var passed = 0, failed = 0, queue = [];
function test(name, fn) { queue.push([name, fn]); }
/* the workspace's one person is a MEMBER (2026-10-25): every change is made as one */
function ctx(site, extra) { return Object.assign({ site: site, config: CFG, now: NOW, by: OWNER, role: 'member', canEdit: true, files: FILES, agreements: [] }, extra || {}); }
function apply(site, action, input, extra) { var r = D.change(site.diligence, action, input, ctx(site, extra)); if (!r.unchanged) site.diligence = r.diligence; return r; }
function view(site, extra) { return D.view(site, Object.assign({ config: CFG, now: NOW, files: FILES, agreements: [] }, extra || {})); }
function refused(fn, status, re) {
  try { fn(); } catch (e) { assert.equal(e.status, status, 'status ' + e.status + ': ' + e.message); if (re) assert.ok(re.test(e.message), 'message: ' + e.message); return e; }
  assert.fail('expected a ' + status + ' refusal');
}
function code(v) { return v.flags.map(function (f) { return f.code; }); }
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1'); }
function doc(kind) { return { kind: 'document', doc: kind }; }
function chargerSite(extra) { return Object.assign({ siteId: 's_test', name: 'Test charging site', hostType: 'retail', tags: [], serviceCapacityKw: 1200, existingPeakKw: 420, installedKw: 900 }, extra || {}); }
/* walk a site to pursue with its screen done */
function screenedAndPursued(site) {
  ['power', 'interconnection', 'fiber'].forEach(function (g) { apply(site, 'gate', { gate: g, state: 'screened', source: { kind: 'public', name: 'Grid Atlas' } }); });
  apply(site, 'stage', { stage: 'screened' });
  apply(site, 'decide', { choice: 'pursue' });
  return site;
}

/* ── the switch ───────────────────────────────────────────────────────── */
test('D01 the switch is billing/current.toolOverrides[\'portfolio-diligence\'] === true, literally, and nothing else turns it on', function () {
  assert.equal(D.FLAG, 'portfolio-diligence');
  assert.equal(D.enabled({ toolOverrides: { 'portfolio-diligence': true } }), true);
  [undefined, null, {}, { toolOverrides: {} }, { toolOverrides: { 'portfolio-diligence': 'true' } }, { toolOverrides: { 'portfolio-diligence': 1 } },
   { toolOverrides: { 'portfolio-assets': true } }, { tier: 'enterprise', addons: ['portfolio-diligence'] }, { toolAccess: ['portfolio-diligence'] }]
    .forEach(function (b) { assert.equal(D.enabled(b), false, JSON.stringify(b)); });
});

test('D02 the workspace\'s own lists live in its config: core names none of them, and with no config every list is empty', function () {
  var code2 = stripComments(SRC).toLowerCase();
  ['lightsmith', 'solela', 'overbuilt-service', 'operating-charging', 'dark-charging', 'stranded-interconnection', 'half-built', 'portfolio-estate', 'ground-lease', 'revenue-share', '25000000', '35000000', 'amenity-only']
    .forEach(function (w) { assert.ok(code2.indexOf(w) < 0, 'core names ' + w); });
  var blank = D.normalizeConfig(null);
  assert.deepEqual(blank.intakeTypes, []); assert.deepEqual(blank.hostDeals, []); assert.deepEqual(blank.exclusions, []);
  assert.equal(blank.offtake.partner, null); assert.equal(blank.offtake.termYears, null); assert.equal(blank.offtake.feePct, null);
  assert.equal(blank.target, null); assert.equal(blank.removalMonths, null);
  /* no config: an intake type cannot be chosen, and the view says the offtake term is missing rather than inventing one */
  var s = chargerSite();
  refused(function () { D.change(null, 'profile', { intakeType: 'overbuilt-service' }, ctx(s, { config: blank })); }, 409, /No intake types are configured/);
  s.diligence = D.change(null, 'control', { route: 'lease', lease: { endDate: '2031-01-01' } }, ctx(s, { config: blank })).diligence;
  var v = D.view(s, { config: blank, now: NOW });
  assert.ok(code(v).indexOf('NO_OFFTAKE_TERM') >= 0, code(v).join());
  assert.equal(v.offtake.partner, undefined); assert.deepEqual(v.offtake.defaulted, []);
});

test('D03 pure ES5 with no clock: no arrow, template, let/const/class/async, Object.assign or Date.now; it requires power.js and the white-label rule, nothing else', function () {
  var c = stripComments(SRC);
  assert.ok(c.indexOf('=>') < 0, 'arrow'); assert.ok(c.indexOf('`') < 0, 'template literal');
  assert.ok(!/\b(const|let|class|async|await)\s/.test(c), 'ES2015 keyword');
  assert.ok(c.indexOf('Object.assign') < 0, 'Object.assign'); assert.ok(c.indexOf('Date.now(') < 0, 'Date.now'); assert.ok(!/new Date\(\s*\)/.test(c), 'new Date()');
  assert.deepEqual(c.match(/require\([^)]*\)/g), ["require('./power')", "require('../whitelabel')"], 'the register\u2019s headroom contract and the one white-label rule, nothing else');
  assert.ok(SRC.indexOf('© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.') > 0);
  refused(function () { D.change(null, 'decide', { choice: 'pursue' }, { site: {}, config: CFG, by: OWNER }); }, 500, /now/);
});

test('D04 the config: the seed validates, notes are not kept, a bad seed is refused naming every problem, the door\'s read drops a bad entry and says so', function () {
  assert.deepEqual(CFG.intakeTypes.map(function (x) { return x.key; }), ['overbuilt-service', 'operating-charging', 'dark-charging', 'stranded-interconnection', 'half-built', 'portfolio-estate']);
  assert.deepEqual(CFG.hostDeals.map(function (x) { return x.key; }), ['ground-lease', 'revenue-share', 'hybrid']);
  assert.deepEqual(CFG.exclusions.map(function (x) { return x.key; }), ['residential', 'amenity-only']);
  assert.deepEqual(CFG.offtake.partner, { key: 'lightsmith', name: 'Lightsmith Energy' });
  assert.equal(CFG.offtake.termYears, 6); assert.equal(CFG.offtake.feePct, 10); assert.equal(CFG.removalMonths, 6);
  assert.equal(CFG.offtake.stated.verified, false, 'the partner\'s stated terms are unverified'); assert.deepEqual(CFG.offtake.stated.returnPct, [25, 55]);
  assert.deepEqual(CFG.target, { label: 'Lightsmith\'s target deal', minUsd: 25000000, maxUsd: 35000000 });
  var stored = D.validateConfig(SEED);
  assert.ok(!Object.keys(stored).some(function (k) { return k.charAt(0) === '_'; }), 'a _note is never written');
  var bad = { intakeTypes: [{ key: 'Bad Key!', label: 'x' }, { key: 'ok', label: '' }], exclusions: [{ key: 'x', label: 'X', reason: 'r', match: [{ field: 'ownerName', in: ['a'] }] }],
    offtake: { termYears: 0, feePct: 140, partner: { key: 'p' } }, target: { minUsd: 10, maxUsd: 5 }, removalMonths: -1 };
  var e = refused(function () { D.validateConfig(bad); }, 400);
  ['intakeTypes[0]', 'intakeTypes[1]', 'exclusions[0].match[0]', 'offtake.termYears', 'offtake.feePct', 'offtake.partner', 'target', 'removalMonths'].forEach(function (w) { assert.ok(e.message.indexOf(w) >= 0, 'names ' + w + ': ' + e.message); });
  var lenient = D.normalizeConfig(bad);
  assert.deepEqual(lenient.intakeTypes, []); assert.equal(lenient.offtake.termYears, null); assert.ok(lenient.problems.length >= 6);
});

/* ── the call ─────────────────────────────────────────────────────────── */
test('D05 the call: pursue takes it to Pursue, a pass needs a reason, a reopened site goes back no further than screened, a repeat changes nothing', function () {
  var s = chargerSite();
  assert.equal(view(s).stage, 'brought-in', 'a site with no record yet is brought in');
  var r = apply(s, 'decide', { choice: 'pursue' });
  assert.equal(s.diligence.stage, 'pursue'); assert.equal(s.diligence.decision.choice, 'pursue'); assert.equal(s.diligence.decision.by, OWNER); assert.equal(s.diligence.decision.at, NOW);
  assert.deepEqual(r.event.from, { stage: 'brought-in', choice: null }); assert.deepEqual(r.event.to, { stage: 'pursue', choice: 'pursue' });
  assert.equal(apply(s, 'decide', { choice: 'pursue' }).unchanged, true, 'pressing E twice writes nothing');
  refused(function () { apply(s, 'decide', { choice: 'pass' }); }, 400, /reason/);
  refused(function () { apply(s, 'decide', { choice: 'pass', reason: 'no' }); }, 400, /reason/);
  apply(s, 'decide', { choice: 'pass', reason: 'Service too small for one skid' });
  assert.equal(s.diligence.stage, 'passed'); assert.equal(s.diligence.passedFrom, 'pursue'); assert.equal(view(s).decision.reason, 'Service too small for one skid');
  apply(s, 'decide', { choice: 'reopen' });
  assert.equal(s.diligence.stage, 'screened', 'a site passed at Pursue is reopened at screened, to be looked at again');
  assert.equal(s.diligence.decision, null);
  refused(function () { apply(s, 'decide', { choice: 'reopen' }); }, 409, /Only a passed site/);
  refused(function () { apply(s, 'decide', { choice: 'maybe' }); }, 400);
  assert.equal(s.diligence.history.length, 3);
  s.diligence.history.forEach(function (h) { assert.equal(h.by, OWNER); assert.equal(h.at, NOW); assert.equal(h.what, 'decision'); });
});

test('D06 exclusions: a recorded residential or amenity-only value passes the site by rule, derived and never stored; an editor (a member too) reverses it only with a reason, kept with who; a viewer cannot; a corrected fact lifts it', function () {
  var s = chargerSite({ hostType: 'multifamily' }), v = view(s);
  assert.equal(v.stage, 'passed'); assert.equal(v.decision.choice, 'pass'); assert.equal(v.decision.by, 'rule');
  assert.deepEqual(v.decision.auto, { rule: 'residential', label: 'Residential charging', field: 'hostType', value: 'multifamily' });
  assert.equal(v.decision.reason, 'Solela does not take residential charging sites'); assert.equal(code(v)[0], 'EXCLUDED');
  assert.equal(s.diligence, undefined, 'nothing is written by reading');
  refused(function () { apply(s, 'decide', { choice: 'pursue', reason: 'We want this one' }, { role: 'viewer', canEdit: false }); }, 403, /read the diligence/);
  refused(function () { apply(s, 'decide', { choice: 'pursue' }); }, 400, /excluded \(residential charging\): reversing an exclusion needs a reason/);
  refused(function () { apply(s, 'stage', { stage: 'screened' }); }, 409, /passed/);
  var r = apply(s, 'decide', { choice: 'pursue', reason: 'Commercial garage on a house meter; not residential charging' });
  assert.deepEqual(r.event.overrides, ['residential']); assert.equal(s.diligence.exclusionOverrides.residential.by, OWNER); assert.equal(s.diligence.exclusionOverrides.residential.role, 'member');
  assert.equal(s.diligence.exclusionOverrides.residential.field, 'hostType');
  v = view(s); assert.equal(v.stage, 'pursue'); assert.equal(v.decision.choice, 'pursue'); assert.equal(v.exclusions[0].overridden.reason, 'Commercial garage on a house meter; not residential charging');
  apply(s, 'chargers', { count: 12 });
  assert.equal(view(s).stage, 'pursue', 'the override stands after later changes');
  /* amenity-only, on the charger use recorded in diligence */
  var a = chargerSite();
  apply(a, 'chargers', { use: 'amenity', count: 4 });
  v = view(a); assert.equal(v.stage, 'passed'); assert.equal(v.decision.auto.rule, 'amenity-only'); assert.equal(v.decision.auto.field, 'chargers.use');
  apply(a, 'chargers', { use: 'public' });
  assert.equal(view(a).stage, 'brought-in', 'the use corrected: the rule no longer matches and the pass is gone');
  /* exact recorded values only: no guessing from a longer phrase; case does not matter */
  assert.equal(view({ facts: { locationType: { value: 'Multifamily Residential' } } }).stage, 'brought-in');
  assert.equal(view({ facts: { locationType: { value: 'Multifamily' } } }).stage, 'passed');
  assert.equal(view({ facts: { locationType: { value: 'Hotel' } } }).stage, 'brought-in');
  assert.equal(view({ tags: ['Amenity'] }).decision.auto.rule, 'amenity-only');
  /* a person who passed it keeps their reason under the rule */
  var p = chargerSite({ hostType: 'multifamily' });
  apply(p, 'decide', { choice: 'pass', reason: 'Residential and small' });
  assert.equal(view(p).decision.under.reason, 'Residential and small');
});

/* ── the stages ───────────────────────────────────────────────────────── */
test('D07 the stages: each forward move is earned, a jump checks every step it skips, a move back needs a note, and back before Pursue un-pursues it', function () {
  var s = chargerSite();
  refused(function () { apply(s, 'stage', { stage: 'screened' }); }, 409, /Screen power, interconnection and fiber first/);
  apply(s, 'gate', { gate: 'power', state: 'screened', source: { kind: 'public', name: 'Utility hosting map' } });
  refused(function () { apply(s, 'stage', { stage: 'screened' }); }, 409, /interconnection and fiber/);
  apply(s, 'gate', { gate: 'interconnection', state: 'working' });
  apply(s, 'gate', { gate: 'fiber', state: 'fails', value: { reason: 'No carrier within 5 miles' } });
  apply(s, 'stage', { stage: 'screened' });
  assert.equal(s.diligence.stage, 'screened', 'a failing gate is still screened');
  refused(function () { apply(s, 'stage', { stage: 'pursue' }); }, 409, /Earmarking is the call/);
  refused(function () { apply(s, 'stage', { stage: 'loi-sent' }); }, 409, /^Earmarked: /);
  apply(s, 'decide', { choice: 'pursue' });
  refused(function () { apply(s, 'stage', { stage: 'loi-sent' }); }, 409, /LOI as sent/);
  apply(s, 'offtake', { loiStatus: 'sent' });
  refused(function () { apply(s, 'stage', { stage: 'offtake' }); }, 409, /^Offtake: Name the offtaker/);
  apply(s, 'stage', { stage: 'loi-sent' });
  apply(s, 'offtake', { offtaker: { name: 'A compute buyer' }, status: 'proposed' });
  refused(function () { apply(s, 'stage', { stage: 'offtake' }); }, 409, /term sheet/);
  apply(s, 'offtake', { status: 'term-sheet' });
  apply(s, 'stage', { stage: 'offtake' });
  refused(function () { apply(s, 'stage', { stage: 'msa' }); }, 409, /Confirm the offtake/);
  refused(function () { apply(s, 'stage', { stage: 'loi-sent' }); }, 400, /note/);
  apply(s, 'stage', { stage: 'loi-sent', note: 'Buyer withdrew the term sheet' });
  assert.equal(s.diligence.stage, 'loi-sent'); assert.equal(s.diligence.decision.choice, 'pursue');
  var r = apply(s, 'stage', { stage: 'screened', note: 'Fiber failed; parking it' });
  assert.equal(s.diligence.stage, 'screened'); assert.equal(s.diligence.decision, null, 'back before Pursue un-pursues it'); assert.deepEqual(r.event.cleared, 'pursue');
  assert.equal(apply(s, 'stage', { stage: 'screened' }).unchanged, true);
  assert.equal(D.view(s, { config: CFG, now: NOW }).next.stage, 'pursue');
});

/* ── the gates ────────────────────────────────────────────────────────── */
test('D08 the gates: screened is public data only; confirmed needs a document of the gate\'s kind ON the site\'s Files, and a member may confirm; fails needs a reason; economics is never set by hand', function () {
  var s = chargerSite();
  refused(function () { apply(s, 'gate', { gate: 'fiber', state: 'screened' }); }, 400, /public data only/);
  refused(function () { apply(s, 'gate', { gate: 'fiber', state: 'screened', source: { kind: 'counterparty', name: 'The seller says so' } }); }, 400, /public data only/);
  apply(s, 'gate', { gate: 'fiber', state: 'screened', source: { kind: 'public', name: 'FCC National Broadband Map', ref: 'https://broadbandmap.fcc.gov' }, value: { carriers: ['Zayo', 'Lumen'], symmetric1g: true, lateralMi: 0.4 } });
  var fib = s.diligence.gates.fiber;
  assert.deepEqual(fib.value.carriers, ['Zayo', 'Lumen']); assert.equal(fib.value.symmetric1g, true); assert.equal(fib.value.lateralMi, 0.4);
  assert.equal(fib.source.kind, 'public'); assert.equal(fib.by, OWNER); assert.equal(fib.at, NOW);
  refused(function () { apply(s, 'gate', { gate: 'fiber', state: 'confirmed', value: { carrier: 'Zayo' } }); }, 400, /document on the site.s Files: fiber carrier quote/);
  refused(function () { apply(s, 'gate', { gate: 'fiber', state: 'confirmed', value: { carrier: 'Zayo' }, evidenceFileId: 'f_quote', source: { kind: 'public', name: 'map' } }); }, 400, /Say which document/);
  refused(function () { apply(s, 'gate', { gate: 'fiber', state: 'confirmed', value: { carrier: 'Zayo' }, evidenceFileId: 'f_quote', source: doc('will-serve') }); }, 400, /does not confirm fiber/);
  refused(function () { apply(s, 'gate', { gate: 'fiber', state: 'confirmed', value: { carrier: 'Zayo' }, evidenceFileId: 'f_nowhere', source: doc('carrier-quote') }); }, 409, /not on this site/);
  refused(function () { apply(s, 'gate', { gate: 'fiber', state: 'confirmed', value: { carrier: 'Zayo' }, evidenceFileId: 'f_archived', source: doc('carrier-quote') }); }, 409, /archived/);
  refused(function () { apply(s, 'gate', { gate: 'fiber', state: 'confirmed', value: { carrier: 'Zayo' }, evidenceFileId: 'f_pending', source: doc('carrier-quote') }); }, 409, /finish uploading/);
  refused(function () { apply(s, 'gate', { gate: 'fiber', state: 'confirmed', value: { carrier: 'Zayo' }, evidenceFileId: 'f_quote', source: doc('carrier-quote') }, { role: 'viewer', canEdit: false }); }, 403, /read the diligence but not change it/);
  refused(function () { apply(s, 'gate', { gate: 'fiber', state: 'confirmed', evidenceFileId: 'f_quote', source: doc('carrier-quote') }); }, 400, /Name the carrier/);
  apply(s, 'gate', { gate: 'fiber', state: 'confirmed', value: { carrier: 'Zayo', mrcUsd: 1850 }, evidenceFileId: 'f_quote', source: doc('carrier-quote') });
  fib = s.diligence.gates.fiber;
  assert.equal(fib.state, 'confirmed'); assert.deepEqual(fib.value.carriers, ['Zayo', 'Lumen'], 'a field not sent stays'); assert.equal(fib.source.name, 'Fiber carrier quote');
  apply(s, 'gate', { gate: 'fiber', state: 'confirmed', value: { lateralMi: null } });
  assert.equal(s.diligence.gates.fiber.value.lateralMi, null, 'a field sent blank is cleared');
  refused(function () { apply(s, 'gate', { gate: 'power', state: 'fails' }); }, 400, /reason/);
  apply(s, 'gate', { gate: 'power', state: 'fails', value: { reason: 'Utility declined the will-serve' } });
  assert.ok(code(view(s)).indexOf('GATE_FAILS') >= 0);
  refused(function () { apply(s, 'gate', { gate: 'economics', state: 'confirmed' }); }, 409, /never a state set by hand/);
  refused(function () { apply(s, 'gate', { gate: 'interconnection', state: 'screened', source: { kind: 'public', name: 'Map', ref: 'javascript:alert(1)' } }); }, 400, /http\(s\) address/);
  refused(function () { apply(s, 'gate', { gate: 'interconnection', state: 'screened', source: 'Grid Atlas' }); }, 400, /says what kind/);
  apply(s, 'gate', { gate: 'interconnection', state: 'screened', source: { kind: 'public', name: 'Utility queue report', ref: 'Q3 2026 report, p. 14' } });
  assert.equal(s.diligence.gates.interconnection.source.ref, 'Q3 2026 report, p. 14', 'a reference that is not a link is kept as text');
  refused(function () { apply(s, 'gate', { gate: 'zoning', state: 'open' }); }, 400);
  refused(function () { apply(s, 'gate', { gate: 'chips', state: 'maybe' }); }, 400);
  /* the document leaves the Files: the gate no longer reads confirmed */
  var gone = FILES.map(function (f) { return f.id === 'f_quote' ? Object.assign({}, f, { archived: true }) : f; });
  var v = view(s, { files: gone });
  assert.equal(v.gates.fiber.state, 'working'); assert.equal(v.gates.fiber.storedState, 'confirmed'); assert.ok(code(v).indexOf('EVIDENCE_GONE') >= 0);
  assert.equal(view(s).gates.fiber.state, 'confirmed');
});

test('D09 each confirming document names what it confirms: the will-serve kW, the utility, the carrier, the chips', function () {
  var s = chargerSite();
  refused(function () { apply(s, 'gate', { gate: 'power', state: 'confirmed', evidenceFileId: 'f_willserve', source: doc('will-serve') }); }, 400, /kW the will-serve letter commits to/);
  apply(s, 'gate', { gate: 'power', state: 'confirmed', evidenceFileId: 'f_willserve', source: doc('will-serve'), value: { willServeKw: 750, path: 'new-service', utility: 'SCE' } });
  refused(function () { apply(s, 'gate', { gate: 'interconnection', state: 'confirmed', evidenceFileId: 'f_ia', source: doc('interconnection-agreement') }); }, 400, /Name the utility/);
  apply(s, 'gate', { gate: 'interconnection', state: 'confirmed', evidenceFileId: 'f_ia', source: doc('interconnection-agreement'), value: { utility: 'SCE', kind: 'interconnection-agreement', approvedImportKw: 1000 } });
  refused(function () { apply(s, 'gate', { gate: 'chips', state: 'confirmed', evidenceFileId: 'f_chips', source: doc('chip-allocation') }); }, 400, /Name the chips/);
  apply(s, 'gate', { gate: 'chips', state: 'confirmed', evidenceFileId: 'f_chips', source: doc('chip-allocation'), value: { chipset: 'NVIDIA H200', gpus: 48, units: 1, leadWeeks: 36 } });
  var row = D.row(s, { config: CFG, now: NOW });
  assert.equal(row.chipset, 'NVIDIA H200'); assert.equal(row.gates.power, 'confirmed'); assert.equal(row.gates.chips, 'confirmed');
  refused(function () { apply(s, 'gate', { gate: 'chips', state: 'working', value: { gpus: 2.5 } }); }, 400, /whole number/);
  refused(function () { apply(s, 'gate', { gate: 'power', state: 'working', value: { phase: 2 } }); }, 400, /Phase/);
});

/* ── power ────────────────────────────────────────────────────────────── */
test('D10 the headroom is the service less the MEASURED peak, by the register\'s own headroom contract; the nameplate is never subtracted and never stands in for a peak', function () {
  var s = chargerSite(), h = D.headroom(s, D.current(null)), ref = P.headroom({ required: ['service'], limits: { service: { kw: 1200 } }, baselineKw: 420 });
  assert.equal(h.headroomKw, 780); assert.equal(h.headroomKw, ref.availableKw); assert.equal(h.nameplateKw, 900); assert.ok(h.headroomKw !== 1200 - 900);
  /* no measured peak: unknown, and the nameplate is named as NOT used */
  var n = chargerSite({ existingPeakKw: null });
  h = D.headroom(n, D.current(null));
  assert.equal(h.headroomKw, null); assert.equal(h.reason, 'NO_MEASURED_PEAK'); assert.ok(/900 kW nameplate is never subtracted/.test(h.flags.map(function (f) { return f.message; }).join(' ')));
  /* the intake's reported power is a peak only once its definition is resolved */
  var ev = chargerSite({ existingPeakKw: null, facts: { reportedPowerKw: { value: 380, reviewStatus: 'needs_definition_review', metricDefinition: 'unresolved_reported_peak_or_active_interval_p95' } } });
  h = D.headroom(ev, D.current(null));
  assert.equal(h.headroomKw, null); assert.ok(h.flags.some(function (f) { return f.code === 'PEAK_DEFINITION_UNRESOLVED'; }));
  ev.facts.reportedPowerKw.reviewStatus = 'reviewed';
  h = D.headroom(ev, D.current(null)); assert.equal(h.headroomKw, 820); assert.equal(h.peakSource, 'the reported peak (definition resolved)');
  assert.equal(D.headroom(chargerSite({ existingPeakKw: null, reportedPeakKw: 380, peakUnresolved: true }), D.current(null)).headroomKw, null);
  /* a full year of interval data comes first; a partial one after the entered peak, and is flagged when it is all there is */
  var iv = chargerSite({ powerEvidence: { interval: { coverage: { peakKw: 510, completeYear: true, coverage: 1 } } } });
  h = D.headroom(iv, D.current(null)); assert.equal(h.peakKw, 510); assert.equal(h.headroomKw, 690); assert.ok(h.flags.some(function (f) { return f.code === 'PEAK_SOURCES_DIFFER'; }));
  var part = chargerSite({ powerEvidence: { interval: { coverage: { peakKw: 300, completeYear: false, coverage: 0.4 } } } });
  assert.equal(D.headroom(part, D.current(null)).peakKw, 420, 'the entered peak before a partial interval series');
  part.existingPeakKw = null; h = D.headroom(part, D.current(null));
  assert.equal(h.peakKw, 300); assert.ok(h.flags.some(function (f) { return f.code === 'PEAK_PARTIAL'; }));
  /* a peak typed in diligence names its source; nameplate is refused as one */
  var t = chargerSite();
  refused(function () { apply(t, 'chargers', { peak: { kw: 900, source: 'nameplate' } }); }, 400, /Nameplate is not a measured peak/);
  refused(function () { apply(t, 'chargers', { peak: { kw: 450 } }); }, 400, /where the measured peak comes from/);
  refused(function () { apply(t, 'chargers', { peak: 450 }); }, 400, /kw, source/);
  refused(function () { apply(t, 'chargers', { peak: { kw: 450, source: 'bill', fileId: 'f_nowhere' } }); }, 409);
  apply(t, 'chargers', { count: 18, kw: 900, status: 'operating', network: 'ChargePoint', use: 'public', peak: { kw: 450, source: 'bill', period: 'Jul 2026', fileId: 'f_bill' } });
  h = D.headroom(t, t.diligence); assert.equal(h.peakKw, 450); assert.equal(h.headroomKw, 750); assert.equal(h.peakSource, 'a utility bill (billed demand), Jul 2026');
  /* dark chargers, an overload, a documented limit, a nameplate that disagrees */
  apply(t, 'chargers', { status: 'dark', kw: 1000 });
  h = D.headroom(t, t.diligence);
  assert.ok(h.flags.some(function (f) { return f.code === 'DARK_CHARGERS'; })); assert.ok(h.flags.some(function (f) { return f.code === 'NAMEPLATE_DIFFERS'; }));
  var o = chargerSite({ existingPeakKw: 1300 }); h = D.headroom(o, D.current(null));
  assert.equal(h.headroomKw, 0); assert.equal(h.overload, true); assert.ok(h.flags.some(function (f) { return f.code === 'OVERLOAD'; }));
  var doc2 = chargerSite({ powerEvidence: { limits: { approvedImport: { kw: 1000, evidenceFileId: 'f_willserve' }, service: { kw: 1600 } } } });
  h = D.headroom(doc2, D.current(null)); assert.equal(h.serviceKw, 1000); assert.equal(h.headroomKw, 580); assert.ok(/approvedImport/.test(h.serviceSource));
  assert.equal(D.headroom({ installedKw: 500 }, D.current(null)).reason, 'NO_SERVICE');
  /* the power path decides what the compute can have: the headroom, a will-serve for a new service, or an approved interconnection */
  var pp = chargerSite();
  assert.equal(D.headroom(pp, D.current(null)).availableKw, 780); assert.equal(D.headroom(pp, D.current(null)).path, 'existing-service');
  apply(pp, 'gate', { gate: 'power', state: 'working', value: { path: 'new-service' } });
  h = D.headroom(pp, pp.diligence); assert.equal(h.availableKw, null); assert.equal(h.headroomKw, 780); assert.ok(h.flags.some(function (f) { return f.code === 'NO_WILL_SERVE'; }));
  apply(pp, 'gate', { gate: 'power', state: 'working', value: { willServeKw: 1500 } });
  h = D.headroom(pp, pp.diligence); assert.equal(h.availableKw, 1500); assert.equal(h.availableBasis, 'the utility\u2019s will-serve for a new service');
  var ia = chargerSite({ serviceCapacityKw: null, existingPeakKw: null, installedKw: null });
  apply(ia, 'gate', { gate: 'power', state: 'working', value: { path: 'interconnection' } });
  apply(ia, 'gate', { gate: 'interconnection', state: 'working', value: { kind: 'interconnection-agreement', approvedImportKw: 4000 } });
  h = D.headroom(ia, ia.diligence); assert.equal(h.availableKw, 4000); assert.ok(!h.flags.some(function (f) { return f.code === 'NO_SERVICE'; }), 'a stranded interconnection is not asked for a service it does not use');
  assert.equal(D.row(ia, { config: CFG, now: NOW }).availableKw, 4000);
});

/* ── control ──────────────────────────────────────────────────────────── */
test('D11 control: each route is confirmed by its own paper, and the facts the paper rests on must agree', function () {
  var own = chargerSite();
  refused(function () { apply(own, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_deed', source: doc('deed') }); }, 409, /Choose how the site comes under control/);
  apply(own, 'control', { route: 'own' });
  refused(function () { apply(own, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_deed', source: doc('deed') }); }, 400, /owner entity/);
  apply(own, 'control', { own: { entity: 'Solela Sites I LLC' } });
  refused(function () { apply(own, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_lease', source: doc('lease') }); }, 400, /Signed lease does not confirm site control by ownership: that is the deed/);
  apply(own, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_deed', source: doc('deed') });
  assert.equal(view(own).control.term.perpetual, true); assert.equal(view(own).control.term.ok, true);
  /* buy: the signed purchase agreement puts it under contract; the deed closes it */
  var buy = chargerSite();
  apply(buy, 'control', { route: 'buy', buy: { priceUsd: '1,250,000', depositUsd: 50000, closingDate: '2027-02-01', contingencies: 'Utility will-serve; Phase I' } });
  assert.equal(buy.diligence.control.buy.priceUsd, 1250000);
  apply(buy, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_pa', source: doc('purchase-agreement') });
  assert.ok(code(view(buy)).indexOf('NOT_CLOSED') >= 0);
  apply(buy, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_deed', source: doc('deed') });
  assert.ok(code(view(buy)).indexOf('NOT_CLOSED') < 0, 'closed on the deed');
  /* lease: a lease that does not say it permits compute does not put the site under control for compute */
  var lease = chargerSite();
  apply(lease, 'control', { route: 'lease', lease: { rentMonthlyUsd: 4500, escalatorPct: 3, termYears: 10, startDate: '2026-11-01', renewals: 'Two 5-year options' } });
  refused(function () { apply(lease, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_lease', source: doc('lease') }); }, 409, /Say whether the signed lease permits compute/);
  apply(lease, 'control', { lease: { computePermitted: false } });
  refused(function () { apply(lease, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_lease', source: doc('lease') }); }, 409, /does not permit compute/);
  assert.ok(code(view(lease)).indexOf('LEASE_FORBIDS_COMPUTE') >= 0);
  apply(lease, 'control', { lease: { computePermitted: true } });
  var signedNo = [{ id: 'ag_l', type: 'lease', signed: true, endDate: '2036-10-31', computePermitted: false }];
  refused(function () { apply(lease, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_lease', source: doc('lease') }, { agreements: signedNo }); }, 409, /does not permit compute/, 'the signed paper wins over a typed yes');
  apply(lease, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_lease', source: doc('lease') });
  assert.equal(lease.diligence.gates.control.state, 'confirmed');
  refused(function () { apply(lease, 'control', { lease: { startDate: '2027-01-01', endDate: '2026-12-01' } }); }, 400, /ends before it starts/);
  refused(function () { apply(lease, 'control', { agreementId: 'ag_missing' }, { agreements: signedNo }); }, 409, /not on this site/);
  /* changing the route undoes a confirmation that was for the old one */
  var r = apply(lease, 'control', { route: 'buy' });
  assert.equal(lease.diligence.gates.control.state, 'working'); assert.ok(/back to working/.test(r.event.note));
  /* takeover: the assignment AND the amendment, the consent, and the equipment no longer handed to the host */
  var tk = chargerSite();
  apply(tk, 'control', { route: 'takeover', takeover: { currentHost: 'Host Account 7', termLeftYears: 9, termAsOf: '2026-10-01', revenueSharePct: 6, consentToAssign: 'requested', amendment: 'drafted', equipmentAtTermEnd: 'host' } });
  var flagsTk = code(view(tk));
  ['CONSENT_NEEDED', 'HOST_AGREEMENT_CHARGING_ONLY', 'EQUIPMENT_REVERTS_TO_HOST'].forEach(function (c) { assert.ok(flagsTk.indexOf(c) >= 0, c); });
  refused(function () { apply(tk, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_assign', source: doc('amendment') }); }, 400, /does not confirm site control by a takeover of the host agreement: that is the assignment of the site host agreement, with the amendment beside it/);
  refused(function () { apply(tk, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_assign', source: doc('assignment') }); }, 400, /Attach the amendment/);
  refused(function () { apply(tk, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_assign', source: doc('assignment'), value: { amendmentFileId: 'f_archived' } }); }, 409, /archived/);
  refused(function () { apply(tk, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_assign', source: doc('assignment'), value: { amendmentFileId: 'f_amend' } }); }, 409, /consent to assign/);
  apply(tk, 'control', { takeover: { consentToAssign: 'granted' } });
  refused(function () { apply(tk, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_assign', source: doc('assignment'), value: { amendmentFileId: 'f_amend' } }); }, 409, /amendment permitting compute and storage/);
  apply(tk, 'control', { takeover: { amendment: 'signed', computeStoragePermitted: true } });
  refused(function () { apply(tk, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_assign', source: doc('assignment'), value: { amendmentFileId: 'f_amend' } }); }, 409, /hand-over of the equipment/);
  apply(tk, 'control', { takeover: { equipmentAtTermEnd: 'owner' } });
  apply(tk, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_assign', source: doc('assignment'), value: { amendmentFileId: 'f_amend' } });
  var vt = view(tk);
  assert.equal(vt.gates.control.state, 'confirmed'); assert.ok(code(vt).indexOf('HOST_AGREEMENT_CHARGING_ONLY') < 0);
  /* either document leaving the Files undoes it */
  var noAmend = FILES.map(function (f) { return f.id === 'f_amend' ? Object.assign({}, f, { archived: true }) : f; });
  assert.equal(view(tk, { files: noAmend }).gates.control.state, 'working');
  assert.deepEqual(D.AGREEMENT_TYPES, ['deed', 'purchase_agreement', 'assignment', 'amendment']);
});

test('D12 the term check: control must outlast the offtake term plus the removal window, counted from the offtake start or, said plainly, from today', function () {
  var s = chargerSite();
  apply(s, 'control', { route: 'lease', lease: { endDate: '2030-01-01', computePermitted: true } });
  var t = view(s).control.term;
  assert.equal(t.termYears, 6); assert.equal(t.removalMonths, 6); assert.equal(t.start, '2026-10-25'); assert.equal(t.required, '2033-04-25');
  assert.equal(t.ok, false); assert.equal(t.shortMonths, 40);
  var msg = view(s).flags.filter(function (f) { return f.code === 'CONTROL_TERM_SHORT'; })[0].message;
  assert.ok(/Control ends 2030-01-01, 40 months before the 6-year offtake term plus the 6-month removal window ends \(2033-04-25\)/.test(msg), msg);
  assert.ok(code(view(s)).indexOf('TERM_FROM_TODAY') >= 0);
  apply(s, 'offtake', { startDate: '2027-07-01' });
  t = view(s).control.term; assert.equal(t.required, '2034-01-01'); assert.equal(t.startBasis, 'the offtake start');
  apply(s, 'control', { lease: { endDate: '2035-06-30' } });
  t = view(s).control.term; assert.equal(t.ok, true); assert.equal(t.shortMonths, 0);
  /* the offtake's own term wins over the workspace default */
  apply(s, 'offtake', { termYears: 10 });
  t = view(s).control.term; assert.equal(t.required, '2038-01-01'); assert.equal(t.ok, false);
  /* the signed lease's end wins over the typed one, and the difference is said */
  var ag = [{ id: 'ag_l', type: 'lease', signed: true, endDate: '2040-01-01', computePermitted: true }];
  t = D.view(s, { config: CFG, now: NOW, agreements: ag }).control.term;
  assert.equal(t.end, '2040-01-01'); assert.equal(t.endBasis, 'the signed lease'); assert.equal(t.ok, true);
  assert.ok(t.flags.some(function (f) { return f.code === 'TERMS_DIFFER'; }));
  /* a lease with a term but no start is counted from today, and says so */
  var u = chargerSite(); apply(u, 'control', { route: 'lease', lease: { termYears: 5 } });
  t = view(u).control.term; assert.equal(t.end, '2031-10-25'); assert.ok(/no start date/.test(t.endBasis));
  /* takeover on the intake's reported remaining term: a snapshot, not a signed date */
  var tk = chargerSite({ facts: { shaRemainingYears: { value: 3, importedAt: '2026-10-10T00:00:00.000Z' } } });
  apply(tk, 'control', { route: 'takeover' });
  t = view(tk).control.term; assert.equal(t.end, '2029-10-10'); assert.equal(t.ok, false);
  assert.ok(t.flags.some(function (f) { return f.code === 'TERM_FROM_SNAPSHOT'; }));
  var host = [{ id: 'imp-host-agreement', type: 'site_host_agreement', signed: true, endDate: '2034-12-31' }];
  t = D.view(tk, { config: CFG, now: NOW, agreements: host }).control.term; assert.equal(t.end, '2034-12-31'); assert.equal(t.ok, true);
  /* own and buy hold the site for as long as it is held */
  var o = chargerSite(); apply(o, 'control', { route: 'own' }); assert.equal(view(o).control.term.perpetual, true);
  var b = chargerSite(); apply(b, 'control', { route: 'buy' }); t = view(b).control.term; assert.equal(t.ok, true); assert.ok(t.flags.some(function (f) { return f.code === 'NOT_CLOSED'; }));
  /* no route, no term, no offtake term, no removal window: each named, none invented */
  assert.equal(view(chargerSite()).control.term.reason, 'NO_ROUTE');
  var nt = chargerSite(); apply(nt, 'control', { route: 'lease' }); assert.equal(view(nt).control.term.reason, 'TERM_UNKNOWN');
  var noRemoval = D.normalizeConfig(Object.assign({}, SEED, { removalMonths: null }));
  t = D.view(s, { config: noRemoval, now: NOW }).control.term; assert.ok(t.flags.some(function (f) { return f.code === 'NO_REMOVAL_WINDOW'; })); assert.equal(t.required, '2037-07-01');
  assert.equal(D.addMonths('2026-01-31', 1), '2026-02-28'); assert.equal(D.addMonths('2024-01-31', 1), '2024-02-29'); assert.equal(D.addMonths('2026-10-25', 78), '2033-04-25');
});

/* ── the offtake ──────────────────────────────────────────────────────── */
test('D13 the offtake: the workspace defaults fill what the site has not set and say so; the desk\'s offtaker shape is taken, less its price, term and status, which are the offtake\'s', function () {
  var s = chargerSite(), o = view(s).offtake;
  assert.deepEqual(o.partner, { key: 'lightsmith', name: 'Lightsmith Energy' }); assert.equal(o.termYears, 6); assert.equal(o.feePct, 10);
  assert.deepEqual(o.defaulted, ['partner', 'termYears', 'feePct']); assert.equal(o.loiStatus, 'none'); assert.equal(o.status, 'none');
  assert.equal(o.stated.verified, false); assert.ok(code(view(s)).indexOf('OFFTAKE_DEFAULTS') >= 0);
  /* the parked Compute desk's own payload */
  apply(s, 'offtake', { offtaker: { key: 'Buyer-A', name: 'Buyer A Compute', contact: 'ops@buyer-a.example', settlement: 'usd', rateBasis: 'H200 per GPU-hour, reserved', ratePerGpuHour: 2.35, termMonths: 72,
    minimumUnits: 2, acceptance: 'Burn-in 72 hours at 95% availability', status: 'term-sheet', note: 'Via the partner' }, takeOrPayPct: 80 });
  var off = s.diligence.offtake;
  assert.deepEqual(Object.keys(off.offtaker).sort(), ['acceptance', 'contact', 'key', 'minimumUnits', 'name', 'note', 'rateBasis', 'settlement']);
  assert.equal(off.offtaker.key, 'buyer-a'); assert.equal(off.pricePerGpuHour, 2.35); assert.equal(off.termYears, 6); assert.equal(off.status, 'term-sheet'); assert.equal(off.takeOrPayPct, 80);
  o = view(s).offtake; assert.deepEqual(o.defaulted, ['partner', 'feePct'], 'the term is the site\'s own now');
  apply(s, 'offtake', { offtaker: { contact: 'buyer-desk@buyer-a.example' } });
  assert.equal(s.diligence.offtake.offtaker.name, 'Buyer A Compute', 'a partial update keeps the named offtaker');
  var t = chargerSite(); refused(function () { apply(t, 'offtake', { offtaker: { contact: 'x' } }); }, 400, /Name the offtaker/);
  refused(function () { apply(s, 'offtake', { loiStatus: 'lost' }); }, 400); refused(function () { apply(s, 'offtake', { termYears: 0 }); }, 400); refused(function () { apply(s, 'offtake', { feePct: 120 }); }, 400);
  refused(function () { apply(s, 'offtake', { partner: { key: 'bad key', name: 'X' } }); }, 400);
  /* where the partner hand-off will land: the site's partners.<partner key>, read and never written here */
  s.partners = { lightsmith: { sentAt: '2026-10-24T10:00:00.000Z', by: OWNER, status: 'sent' } };
  assert.equal(view(s).partnerRecord.status, 'sent');
  /* a confirmed offtake whose signed terms are changed goes back to working */
  apply(s, 'offtake', { status: 'executed' });
  apply(s, 'gate', { gate: 'offtake', state: 'confirmed', evidenceFileId: 'f_offtake', source: doc('offtake-contract') });
  var r = apply(s, 'offtake', { pricePerGpuHour: 2.6 });
  assert.equal(s.diligence.gates.offtake.state, 'working'); assert.ok(/pricePerGpuHour/.test(r.event.note));
  apply(s, 'gate', { gate: 'offtake', state: 'confirmed', evidenceFileId: 'f_offtake', source: doc('msa') });
  apply(s, 'offtake', { loiStatus: 'signed' });
  assert.equal(s.diligence.gates.offtake.state, 'confirmed', 'the LOI status is not a signed term');
  apply(s, 'offtake', { status: 'declined' });
  assert.equal(s.diligence.gates.offtake.state, 'working', 'an offtake no longer executed is no longer confirmed');
  /* a direct deal says it has no partner; blank hands it back to the workspace default */
  apply(s, 'offtake', { partner: false, feePct: 0 });
  o = view(s).offtake; assert.equal(o.partner, false); assert.equal(o.feePct, 0); assert.deepEqual(o.defaulted, []); assert.equal(view(s).partnerRecord, null);
  apply(s, 'offtake', { partner: null, feePct: null });
  o = view(s).offtake; assert.equal(o.partner.key, 'lightsmith'); assert.deepEqual(o.defaulted, ['partner', 'feePct']);
  var u = chargerSite(); apply(u, 'offtake', { offtaker: { name: 'B' }, status: 'term-sheet' });
  refused(function () { apply(u, 'gate', { gate: 'offtake', state: 'confirmed', evidenceFileId: 'f_offtake', source: doc('offtake-contract') }); }, 409, /executed/);
});

/* ── economics ────────────────────────────────────────────────────────── */
/* the contract case's own output shape (api/_lib/compute-contract.js, PR #381): percents are percents, the terms echoed, capex its own total */
var CASE = { output: { ok: true, priced: true, model: 'compute-contract-v1', needs: [], chipset: { key: 'h100', name: 'NVIDIA H100', gpusPerNode: 8, nodeKw: 12.5 },
    partner: { name: 'Lightsmith Energy', feePct: 10, stated: true, verified: false }, contract: { termMonths: 72, pricePerGpuHour: 2.35, takeOrPayPct: 80, escalatorPct: 0, merchant: false },
    site: { route: 'lease', rentMonthly: 4500, rentEscalatorPct: 2.5, revenueSharePct: 0 },
    sizing: { units: 2, gpus: 96, itKw: 150, facilityKw: 180, basis: 'availableKw', availableKw: 780,
      byChipset: [{ key: 'h100', name: 'NVIDIA H100', gpusPerUnit: 48, units: 2, gpus: 96, itKwPerUnit: 75, facilityKwPerUnit: 90 }, { key: 'b200', name: 'NVIDIA B200', gpusPerUnit: 32, units: 2, gpus: 64, itKwPerUnit: 75, facilityKwPerUnit: 90 }] },
    capex: { unitCostUsd: 764000, unitCostSource: 'recorded', units: 2, equipment: 1528000, land: 0, total: 1528000 },
    returns: { projectIrrPct: 31.4, equityIrrPct: 44.2, roiPct: 188, paybackMonths: 26, equityPaybackMonths: 22, projectMultiple: 2.88, equityMultiple: 3.4, irrWithoutFeePct: 40.1, revenuePerYear: 1900000, partnerFeePerYear: 190000 },
    priceFor: { 25: 1.98, 30: 2.21, 55: 3.4 }, priceForPayback: { 24: 2.45 },
    ladder: [{ price: 1.4, projectIrrPct: 10.13, paybackMonths: 58, projectMultiple: 1.34, roiPct: 34, irrWithoutFeePct: 23.09, revenuePerYear: 1130000, partnerFeePerYear: 113000 },
      { price: 2.0, projectIrrPct: 54.17, paybackMonths: 26, projectMultiple: 2.89, roiPct: 189, irrWithoutFeePct: 73.31, revenuePerYear: 1620000, partnerFeePerYear: 162000 },
      { price: 2.6, projectIrrPct: 102.19, paybackMonths: 17, projectMultiple: 4.44, roiPct: 344, irrWithoutFeePct: 131.86, revenuePerYear: 2100000, partnerFeePerYear: 210000 }],
    ladderBasis: { centre: 2.35, centreBasis: 'contract', step: 0.05, points: 3 }, notes: ['Contract case'], disclaimer: 'Screening, not a return promise' },
  input: { chipset: 'h100', availableKw: 780, contract: { termMonths: 72, pricePerGpuHour: 2.35, takeOrPayPct: 80, partner: { name: 'Lightsmith Energy', feePct: 10 } }, site: { route: 'lease', rentMonthly: 4500 } }, at: '2026-10-25T14:00:00.000Z' };
function unpriced() { var c = JSON.parse(JSON.stringify(CASE)); c.output.priced = false; c.output.returns = null; c.output.contract.pricePerGpuHour = null; c.output.needs = ['contract.pricePerGpuHour']; return c; }
test('D14 economics is read off the record that computed it: screening figures read screened, the contract case on the offtake\'s own terms working, confirmed only on the confirmed offtake and control', function () {
  var none = view(chargerSite());
  assert.equal(none.gates.economics.state, 'open'); assert.equal(none.economics.source, null); assert.equal(none.economics.irrPct, null);
  var m = chargerSite({ latestModel: { irr: 0.1834, moic: 2.4, paybackYears: 3.5, termYears: 10, totalProjectCost: 1820000, skid: { units: 2 }, pods: 2, gpus: 96, at: '2026-10-20T00:00:00.000Z', modelId: 'm_1' } });
  var v = view(m);
  assert.equal(v.economics.source, 'compute-model'); assert.equal(v.economics.irrPct, 18.34); assert.equal(v.economics.roiPct, 140); assert.equal(v.economics.paybackMonths, 42);
  assert.equal(v.economics.units, 2); assert.equal(v.economics.unitsLabel, 'Omega-Core skids'); assert.equal(v.economics.capexUsd, 1820000);
  assert.equal(v.gates.economics.state, 'screened'); assert.equal(v.gates.economics.derived, true);
  var pf = view(chargerSite({ latestProforma: { projectIrrDefined: true, projectIrrAnnual: 0.221, paybackMonth: 30, pods: 3, investorCapital: 2100000, itKw: 225 } }));
  assert.equal(pf.economics.source, 'pod-proforma'); assert.equal(pf.economics.irrPct, 22.1); assert.equal(pf.economics.roiPct, null); assert.equal(pf.economics.computeKw, 225); assert.equal(pf.gates.economics.state, 'screened');
  assert.equal(view(chargerSite({ latestProforma: { projectIrrDefined: false, projectIrrAnnual: null, pods: 1 } })).economics.irrPct, null, 'an IRR not defined is not a number');
  /* the contract case, as it answers */
  var s = chargerSite();
  var e = D.view(s, { config: CFG, now: NOW, kase: CASE });
  assert.equal(e.economics.source, 'contract-case'); assert.equal(e.economics.irrPct, 31.4); assert.equal(e.economics.capexUsd, 1528000, 'the case\'s own capex total');
  assert.equal(e.economics.computeKw, 150); assert.equal(e.economics.units, 2); assert.equal(e.economics.irrWithoutFeePct, 40.1); assert.equal(e.economics.partnerFeePerYear, 190000);
  assert.deepEqual(e.economics.chipset, { key: 'h100', name: 'NVIDIA H100' }); assert.deepEqual(e.economics.byChipset.map(function (x) { return x.key + ':' + x.gpus; }), ['h100:96', 'b200:64']);
  assert.deepEqual(e.economics.priceFor, CASE.output.priceFor);
  assert.equal(e.gates.economics.state, 'screened', 'a case not on the offtake\'s own terms is a screen'); assert.ok(/none agreed yet/.test(e.gates.economics.note), e.gates.economics.note);
  /* the price slider: the server's rows, each with where it sits against the partner's stated band */
  assert.deepEqual(e.ladder.map(function (x) { return x.band; }), ['below', 'inside', 'above']);
  assert.equal(e.ladder[1].bandWords, 'Inside Lightsmith Energy’s 25–55% range (as stated, unverified)'); assert.equal(e.ladder[1].roiPct, 189); assert.equal(e.ladder[1].partnerFeePerYear, 162000);
  assert.equal(e.band.position, 'inside');
  assert.equal(D.view(s, { config: D.normalizeConfig(null), now: NOW, kase: CASE }).ladder[0].band, null, 'no stated band configured, none drawn');
  /* no contract price yet: the ladder still shows the range */
  var u = D.view(s, { config: CFG, now: NOW, kase: unpriced() });
  assert.equal(u.economics.irrPct, null); assert.equal(u.economics.priced, false); assert.deepEqual(u.economics.needs, ['contract.pricePerGpuHour']);
  assert.equal(u.gates.economics.state, 'screened'); assert.ok(/ladder shows the range/.test(u.gates.economics.note)); assert.equal(u.ladder.length, 3);
  /* on the offtake's own terms: working, then confirmed with the offtake and control */
  apply(s, 'offtake', { offtaker: { name: 'Buyer A' }, status: 'executed', pricePerGpuHour: 2.35, takeOrPayPct: 80 });
  e = D.view(s, { config: CFG, now: NOW, kase: CASE });
  assert.equal(e.gates.economics.state, 'working'); assert.ok(/offtake is confirmed and control is confirmed/.test(e.gates.economics.note), e.gates.economics.note);
  apply(s, 'gate', { gate: 'offtake', state: 'confirmed', evidenceFileId: 'f_offtake', source: doc('offtake-contract') });
  apply(s, 'control', { route: 'own', own: { entity: 'Solela Sites I LLC' } });
  apply(s, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_deed', source: doc('deed') });
  e = D.view(s, { config: CFG, now: NOW, kase: CASE, files: FILES });
  assert.equal(e.gates.economics.state, 'confirmed', e.gates.economics.note);
  apply(s, 'offtake', { pricePerGpuHour: 2.5 });
  apply(s, 'gate', { gate: 'offtake', state: 'confirmed', evidenceFileId: 'f_offtake', source: doc('offtake-contract') });
  e = D.view(s, { config: CFG, now: NOW, kase: CASE });
  assert.equal(e.gates.economics.state, 'screened'); assert.ok(/not on the contract price/.test(e.gates.economics.note));
  assert.ok(!s.diligence.gates.economics, 'the economics gate is never stored');
});

/* ── the whole way ────────────────────────────────────────────────────── */
test('D15 the whole way: brought in to confirmed, every gate on its document and the site survey on file, the history saying who did what', function () {
  var s = screenedAndPursued(chargerSite());
  apply(s, 'profile', { intakeType: 'operating-charging', hostDeal: 'ground-lease' });
  refused(function () { apply(s, 'profile', { intakeType: 'casino' }); }, 400, /Intake type must be one of/);
  apply(s, 'offtake', { loiStatus: 'sent' }); apply(s, 'stage', { stage: 'loi-sent' });
  apply(s, 'offtake', { offtaker: { name: 'Buyer A' }, status: 'term-sheet', pricePerGpuHour: 2.35, takeOrPayPct: 80 }); apply(s, 'stage', { stage: 'offtake' });
  apply(s, 'offtake', { status: 'executed' });
  apply(s, 'gate', { gate: 'offtake', state: 'confirmed', evidenceFileId: 'f_offtake', source: doc('msa') }); apply(s, 'stage', { stage: 'msa' });
  apply(s, 'gate', { gate: 'power', state: 'confirmed', evidenceFileId: 'f_willserve', source: doc('will-serve'), value: { willServeKw: 750 } });
  apply(s, 'gate', { gate: 'interconnection', state: 'confirmed', evidenceFileId: 'f_willserve', source: doc('will-serve'), value: { utility: 'SCE' } });
  apply(s, 'gate', { gate: 'fiber', state: 'confirmed', evidenceFileId: 'f_quote', source: doc('carrier-quote'), value: { carrier: 'Zayo' } });
  apply(s, 'control', { route: 'lease', lease: { startDate: '2026-11-01', termYears: 15, computePermitted: true } });
  apply(s, 'gate', { gate: 'control', state: 'confirmed', evidenceFileId: 'f_lease', source: doc('lease') });
  apply(s, 'gate', { gate: 'chips', state: 'confirmed', evidenceFileId: 'f_chips', source: doc('chip-allocation'), value: { chipset: 'NVIDIA H200' } });
  var k = { kase: CASE };
  refused(function () { apply(s, 'stage', { stage: 'confirmed' }, k); }, 409, /the site survey still to confirm/);
  refused(function () { apply(s, 'survey', { state: 'done' }); }, 400, /report is on the site.s Files/);
  apply(s, 'survey', { state: 'scheduled', date: '2026-11-12' });
  apply(s, 'survey', { state: 'done', fileId: 'f_survey', note: 'Pad and conduit path walked' });
  refused(function () { apply(s, 'stage', { stage: 'confirmed' }); }, 409, /economics still to confirm/, 'no contract case on file: economics is not confirmed');
  apply(s, 'stage', { stage: 'confirmed' }, k);
  var v = D.view(s, { config: CFG, now: NOW, kase: CASE, files: FILES });
  assert.equal(v.stage, 'confirmed'); assert.equal(v.next.note, 'Confirmed'); assert.equal(v.control.term.ok, true);
  D.GATES.forEach(function (g) { assert.equal(v.gates[g].state, 'confirmed', g); });
  assert.equal(v.intakeLabel, 'Operating charging site'); assert.equal(v.hostDealLabel, 'Ground lease');
  var whats = s.diligence.history.map(function (h) { return h.what; });
  ['gate:power', 'stage', 'decision', 'profile', 'offtake', 'gate:offtake', 'control', 'gate:control', 'gate:chips', 'survey'].forEach(function (w) { assert.ok(whats.indexOf(w) >= 0, w); });
  assert.equal(v.history[0].what, 'stage', 'newest first'); assert.equal(v.history[0].to, 'confirmed');
});

/* ── the register ─────────────────────────────────────────────────────── */
test('D16 the register: rows, the pipeline strip, filters by stage and gate, and the running tally against the target deal (a missing figure is missing, never zero)', function () {
  var a = screenedAndPursued(chargerSite({ siteId: 's_a', latestModel: { irr: 0.21, moic: 2.1, paybackYears: 3, totalProjectCost: 9000000, skid: { units: 10 } }, latestDesign: { compute: { kwIt: 750 } } }));
  var b = screenedAndPursued(chargerSite({ siteId: 's_b', serviceCapacityKw: 3000, existingPeakKw: 1000, latestModel: { irr: 0.17, moic: 1.8, paybackYears: 4, totalProjectCost: 12000000, skid: { units: 13 } } }));
  var c = screenedAndPursued(chargerSite({ siteId: 's_c', existingPeakKw: null }));
  var d = chargerSite({ siteId: 's_d', hostType: 'multifamily', latestModel: { irr: 0.3, totalProjectCost: 4000000 } });
  var e = chargerSite({ siteId: 's_e' });
  apply(e, 'gate', { gate: 'fiber', state: 'fails', value: { reason: 'No fiber within 10 miles' } });
  var rows = [a, b, c, d, e].map(function (s) { return D.row(s, { config: CFG, now: NOW }); });
  assert.deepEqual(rows.map(function (r) { return r.stage; }), ['pursue', 'pursue', 'pursue', 'passed', 'brought-in']);
  assert.equal(rows[3].decision.auto, true); assert.equal(rows[0].gates.power, 'screened'); assert.equal(rows[0].headroomKw, 780); assert.equal(rows[2].headroomKw, null);
  assert.equal(rows[0].irrPct, 21); assert.equal(rows[0].units, 10); assert.equal(rows[0].computeKw, 750); assert.equal(rows[0].next.stage, 'loi-sent');
  var strip = D.pipeline(rows), n = {}; strip.forEach(function (x) { n[x.stage] = x.count; });
  assert.deepEqual(strip.map(function (x) { return x.stage; }), ['brought-in', 'screened', 'pursue', 'loi-sent', 'offtake', 'msa', 'confirmed', 'passed']);
  assert.equal(n['brought-in'], 1); assert.equal(n.pursue, 3); assert.equal(n.passed, 1); assert.equal(n.screened, 0);
  assert.deepEqual(D.filterRows(rows, { stage: 'live' }).map(function (r) { return r.siteId; }), ['s_a', 's_b', 's_c', 's_e']);
  assert.deepEqual(D.filterRows(rows, { stage: 'passed' }).map(function (r) { return r.siteId; }), ['s_d']);
  assert.deepEqual(D.filterRows(rows, { gate: 'fiber:fails' }).map(function (r) { return r.siteId; }), ['s_e']);
  assert.deepEqual(D.filterRows(rows, { gate: 'any:fails' }).map(function (r) { return r.siteId; }), ['s_e']);
  assert.deepEqual(D.filterRows(rows, { stage: 'pursue', gate: 'control:open' }).map(function (r) { return r.siteId; }), ['s_a', 's_b', 's_c']);
  refused(function () { D.filterRows(rows, { stage: 'won' }); }, 400); refused(function () { D.filterRows(rows, { gate: 'fiber' }); }, 400);
  var t = D.tally(rows, CFG);
  assert.equal(t.sites, 3, 'pursued only: not the passed, not the undecided');
  assert.equal(t.capexUsd, 21000000); assert.equal(t.capexKnown, 2); assert.equal(t.units, 23); assert.equal(t.unitsKnown, 2);
  assert.equal(t.availableKw, 780 + 2000); assert.equal(t.availableKnown, 2); assert.equal(t.availableMw, 2.78); assert.equal(t.computeMw, 0.75); assert.equal(t.computeKnown, 1);
  assert.deepEqual(t.unitLabels, ['Omega-Core skids']);
  assert.equal(t.partial, true);
  assert.equal(t.target.minUsd, 25000000); assert.equal(t.target.ofMinPct, 84); assert.equal(t.target.toMinUsd, 4000000); assert.equal(t.target.within, false); assert.equal(t.target.over, false);
  assert.equal(D.tally(rows, D.normalizeConfig(null)).target, null, 'no target configured, none shown');
  var sch = D.schema(CFG);
  assert.deepEqual(sch.stages, D.STAGES); assert.equal(sch.config.exclusions[0].match, undefined, 'the page gets the rule\'s words, not its match list');
  assert.equal(sch.config.offtake.partner.name, 'Lightsmith Energy');
});

test('D17 the history is capped; an unknown action is refused', function () {
  var s = chargerSite();
  for (var i = 0; i < D.HISTORY_CAP + 30; i++) apply(s, 'chargers', { count: i });
  assert.equal(s.diligence.history.length, D.HISTORY_CAP); assert.equal(s.diligence.chargers.count, D.HISTORY_CAP + 29);
  refused(function () { apply(s, 'delete', {}); }, 400, /Unknown diligence action/);
  assert.deepEqual(D.ACTIONS, ['decide', 'stage', 'gate', 'control', 'offtake', 'chargers', 'profile', 'survey']);
});

/* ── switching it on ──────────────────────────────────────────────────── */
test('D18 the enable patch: the flag on with every other override kept, the seed\'s lists added, a list the workspace holds never overwritten, a second run a no-op', function () {
  var billing = { tier: 'standard', toolOverrides: { 'portfolio-assets': true, editor: false } };
  var p = D.enablePatch(billing, SEED);
  assert.equal(p.changed, true); assert.equal(p.flagWas, null);
  assert.deepEqual(p.toolOverrides, { 'portfolio-assets': true, editor: false, 'portfolio-diligence': true });
  assert.deepEqual(p.added, ['intakeTypes', 'hostDeals', 'exclusions', 'offtake', 'target', 'removalMonths']);
  var after = Object.assign({}, billing, { toolOverrides: p.toolOverrides, portfolioDiligence: p.config });
  var again = D.enablePatch(after, SEED);
  assert.equal(again.changed, false); assert.deepEqual(again.added, []);
  var edited = Object.assign({}, after, { portfolioDiligence: Object.assign({}, p.config, { removalMonths: 12 }) });
  delete edited.portfolioDiligence.target;
  var third = D.enablePatch(edited, SEED);
  assert.deepEqual(third.added, ['target']); assert.equal(third.config.removalMonths, 12, 'an edited list stands');
  assert.equal(D.enablePatch({ toolOverrides: { 'portfolio-diligence': false } }, SEED).flagWas, false);
  refused(function () { D.enablePatch(billing, { intakeTypes: 'all of them' }); }, 400, /intakeTypes must be a list/);
});

test('D19 the enable script: an offline dry run by default that writes nowhere; --apply refuses without --confirm-org repeating the org, without a seed, or with no org', function () {
  var env = Object.assign({}, process.env); delete env.FIREBASE_SERVICE_ACCOUNT; delete env.GOOGLE_APPLICATION_CREDENTIALS;
  function run(args) { return cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts/enable-portfolio-diligence.js')].concat(args), { cwd: ROOT, env: env, encoding: 'utf8', timeout: 60000 }); }
  var dry = run(['--org', 'solelacapital.com']);
  assert.equal(dry.status, 0, dry.stderr);
  var out = JSON.parse(dry.stdout.slice(0, dry.stdout.lastIndexOf('}') + 1));
  assert.equal(out.mode, 'dry-run (offline, in-memory)'); assert.equal(out.firstRun.changed, true); assert.equal(out.secondRun.changed, false);
  assert.equal(out.write.toolOverrides['portfolio-diligence'], true); assert.equal(out.write.toolOverrides['portfolio-assets'], true); assert.equal(out.docsWrittenOutsideWorkspace, 0);
  assert.ok(/Nothing was written anywhere/.test(dry.stdout));
  var noConfirm = run(['--org', 'solelacapital.com', '--apply']);
  assert.equal(noConfirm.status, 2); assert.ok(/--confirm-org must repeat --org/.test(noConfirm.stderr), noConfirm.stderr);
  var wrong = run(['--org', 'solelacapital.com', '--apply', '--confirm-org', 'cleancell.us']);
  assert.equal(wrong.status, 2);
  var noSeed = run(['--org', 'example-no-seed.com']);
  assert.equal(noSeed.status, 2); assert.ok(/No seed at tenants\/example-no-seed\/portfolio-diligence\.json/.test(noSeed.stderr), noSeed.stderr);
  assert.equal(run([]).status, 2);
  var src = fs.readFileSync(path.join(ROOT, 'scripts/enable-portfolio-diligence.js'), 'utf8');
  assert.ok(src.indexOf("if (CONFIRM !== ORG) throw") < src.indexOf("require('./_lib/live-admin')"), 'the refusal comes before any credential is touched');
  assert.ok(/omega_orgs\/' \+ org \+ ' does not exist/.test(src) && /billing\/current does not exist/.test(src), 'refuses a missing workspace or billing record');
  assert.ok(fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8').split('\n').indexOf('tenants/*/portfolio-diligence.json') >= 0, 'the seed is kept off the site');
  /* the white label: staged the staff way, mirrored through the one allowlist, never `enabled` (the storefront is sold apart) */
  assert.deepEqual(out.write.whiteLabel, { platformName: 'Solela Capital', shortName: 'Solela' }); assert.equal(out.firstRun.whiteLabel.on, true);
  assert.deepEqual(out.write.tenantPublic.whiteLabel, require('../../api/_lib/whitelabel').pickPublic(out.write.whiteLabel)); assert.ok(/not written/.test(out.write.tenantPublic.status));
  assert.deepEqual(out.secondRun.whiteLabel.added, [], 'a second run adds nothing'); assert.equal(require('../../api/_lib/storefront').storefrontEntitled({}, out.write.whiteLabel), false, 'naming the platform does not open the storefront');
  var tmp = path.join(require('os').tmpdir(), 'tdiligence-seed-' + process.pid + '.json');
  fs.writeFileSync(tmp, JSON.stringify(Object.assign({}, SEED, { whiteLabel: { platformName: 'X', enabled: true } })));
  try { var en = run(['--org', 'solelacapital.com', '--seed', tmp]); assert.equal(en.status, 2); assert.ok(/whiteLabel.enabled opens the public storefront/.test(en.stderr), en.stderr);
    fs.writeFileSync(tmp, JSON.stringify(Object.assign({}, SEED, { whiteLabel: { platformName: 'X', markUrl: 'https://x' } })));
    var mk = run(['--org', 'solelacapital.com', '--seed', tmp]); assert.equal(mk.status, 2); assert.ok(/not a key this script stages/.test(mk.stderr)); }
  finally { try { fs.unlinkSync(tmp); } catch (e) {} }
});

/* ── the approved mockup's card ───────────────────────────────────────── */
/* a screen as grid-screen.js answers: a usable point, a 69 kV substation, the FCC key unset */
function screenOf(extra) {
  return Object.assign({ v: 1, at: NOW, complete: true, located: { lat: 41.6, lng: -93.6, precision: 'exact', resolvedAddress: '1 Main St, Des Moines, IA', usable: true, approximate: false },
    power: { substation: 'Bondurant', kv: 69, distanceMi: 1.4, owner: 'MidAmerican' },
    fiber: { carriers: [], carriersRead: false, carriersStatus: 'needs-key', carriersNote: 'carrier names need the FCC key', symmetric1g: null, symmetricCount: null, lateralMi: 2.1, lateralTo: 'carrier facility DSM-1', carrierHotel: 'Des Moines IX', carrierHotelMi: 6, verdict: 'plausible' },
    hosting: { coverage: 'none', note: 'MidAmerican does not publish hosting capacity' }, utility: { name: 'MidAmerican Energy', key: 'midamerican', eiaId: null, basis: 'zip' },
    sources: { substations: 'HIFLD', peeringdb: 'PeeringDB', utility: 'the rate book, by ZIP' }, notes: [], errors: [] }, extra || {});
}
test('D21 the screen lands: power screened on the substation, fiber only on carriers read at the address, interconnection only on a published hosting figure; a person\'s own state stands; never confirmed', function () {
  var s = chargerSite();
  var r = apply(s, 'screen', { screen: screenOf() });
  assert.deepEqual(r.event.moved, ['power']); assert.equal(s.diligence.gates.power.state, 'screened'); assert.equal(s.diligence.gates.power.source.kind, 'public'); assert.equal(s.diligence.gates.power.source.screen, true);
  assert.equal(D.gateOf(s.diligence, 'fiber').state, 'open', 'no carriers read: the carrier hotel alone is not a fiber screen');
  assert.equal(D.gateOf(s.diligence, 'interconnection').state, 'open', 'a utility alone is not a screen of the interconnection');
  assert.equal(s.diligence.screen.power.kv, 69); assert.equal(s.diligence.screen.fiber.carrierHotelMi, 6);
  assert.ok(code(view(s)).indexOf('FCC_KEY_MISSING') >= 0);
  /* with the key: carriers read, 1 Gbps symmetric; and a published load hosting figure */
  var withKey = screenOf({ fiber: { carriers: ['Lumen', 'Zayo', 'Mediacom'], carriersRead: true, carriersStatus: 'read', carriersNote: null, symmetric1g: true, symmetricCount: 2, lateralMi: 0, carrierHotel: 'Des Moines IX', carrierHotelMi: 6 },
    hosting: { coverage: 'read', loadKw: 2100, storageKw: 1800, circuit: 'Feeder 12', substation: 'Bondurant', kv: 13.2, source: 'MidAmerican hosting capacity map' }, utility: { name: 'MidAmerican Energy', key: 'midamerican', basis: 'territory' } });
  apply(s, 'gate', { gate: 'power', state: 'working', value: { note: 'Asked the utility for the service record' } });
  r = apply(s, 'screen', { screen: withKey });
  assert.deepEqual(r.event.moved.sort(), ['fiber', 'interconnection']);
  assert.equal(s.diligence.gates.power.state, 'working', 'a gate a person took further is never moved back by the screen');
  assert.deepEqual(s.diligence.gates.fiber.value.carriers, ['Lumen', 'Zayo', 'Mediacom']); assert.equal(s.diligence.gates.fiber.value.symmetric1g, true);
  assert.equal(s.diligence.gates.interconnection.value.utility, 'MidAmerican Energy');
  /* a hand screen stands against a later automatic one; the screen refreshes only its own */
  var h = chargerSite();
  apply(h, 'gate', { gate: 'fiber', state: 'screened', source: { kind: 'public', name: 'Carrier’s own lit-building list' }, value: { carriers: ['Windstream'] } });
  apply(h, 'screen', { screen: withKey });
  assert.equal(h.diligence.gates.fiber.source.name, 'Carrier’s own lit-building list'); assert.deepEqual(h.diligence.gates.fiber.value.carriers, ['Windstream']);
  /* an approximate point screens nothing; the record keeps what it found */
  var a = chargerSite();
  r = apply(a, 'screen', { screen: screenOf({ located: { lat: 41.6, lng: -93.6, precision: 'area', usable: false, approximate: true } }) });
  assert.deepEqual(r.event.moved, []); assert.equal(D.gateOf(a.diligence, 'power').state, 'open'); assert.equal(a.diligence.screen.power.substation, 'Bondurant');
  /* the screen never confirms, and its record is bounded */
  D.GATES.forEach(function (g) { assert.notEqual(D.gateOf(s.diligence, g).state, 'confirmed'); });
  var big = screenOf({ fiber: { carriers: new Array(80).join('x,').split(','), carriersRead: true }, notes: new Array(40).join('n,').split(',') });
  assert.ok(D.cleanScreen(big).fiber.carriers.length <= 30); assert.ok(D.cleanScreen(big).notes.length <= 10);
  refused(function () { apply(a, 'screen', {}); }, 400, /No screen/);
});

test('D22 the Diligence card: one sentence a gate, where it came from, and the next thing to do; the state words and short names of the mockup', function () {
  var s = screenedAndPursued(chargerSite({ serviceCapacityKw: 800, existingPeakKw: 350, installedKw: 600 }));
  apply(s, 'screen', { screen: screenOf() });
  var v = view(s), L = v.lines;
  assert.equal(L.power.sentence, '800 kW service, 350 kW peak, so 450 kW free · 69 kV substation 1.4 mi'); assert.equal(L.power.sources, 'Site facts · Grid Atlas');
  assert.equal(L.interconnection.sentence, 'Will-serve not requested · utility found from the ZIP: MidAmerican Energy');
  assert.equal(L.interconnection.action.key, 'log-will-serve'); assert.equal(L.interconnection.action.label, 'Log will-serve request');
  assert.equal(L.interconnection.action.task.subject, 'Request a will-serve letter from MidAmerican Energy'); assert.deepEqual(L.interconnection.action.moves, { gate: 'interconnection', state: 'working' });
  assert.equal(L.fiber.sentence, 'Carrier names need the FCC key · carrier hotel 6 mi · lateral about 2.1 mi to carrier facility DSM-1'); assert.equal(L.fiber.sources, 'PeeringDB · confirm with a carrier quote');
  assert.equal(L.control.sentence, 'How the site comes under control is not chosen'); assert.equal(L.control.action.key, 'control-form');
  assert.equal(L.chips.sentence, 'Chips not chosen · allocation not requested · ~36 weeks'); assert.equal(L.chips.sources, 'Lead time from Lightsmith Energy, unverified');
  assert.equal(L.offtake.sentence, 'Lightsmith Energy LOI not sent · 6-year term · 10% fee · offtaker and price pending'); assert.equal(L.offtake.sources, 'Lightsmith Energy');
  assert.equal(L.offtake.action.key, 'loi-package'); assert.equal(L.offtake.action.label, 'Send LOI package to Lightsmith Energy');
  /* the mockup's other rows, once the facts are in */
  apply(s, 'control', { route: 'lease', lease: { rentMonthlyUsd: 11250, termYears: 15, computePermitted: true, startDate: '2026-11-01' } });
  apply(s, 'gate', { gate: 'chips', state: 'screened', source: { kind: 'model', name: 'The contract case sizing' }, value: { chipset: 'H100', gpus: 288 } });
  v = view(s); L = v.lines;
  assert.equal(L.control.sentence, 'Lease: $11k a month, 15 years · compute permitted · control to 2041-11-01'); assert.equal(L.control.sources, 'Agreements');
  assert.equal(L.chips.sentence, 'H100 · 288 GPUs · allocation not requested · ~36 weeks');
  assert.equal(v.gates.chips.stateLabel, 'Chosen', 'chips screened on the sizing read Chosen'); assert.equal(v.gates.chips.short, 'Chip');
  refused(function () { apply(s, 'gate', { gate: 'power', state: 'screened', source: { kind: 'model', name: 'x' } }); }, 400, /public data only/, 'only chips may rest on the sizing');
  refused(function () { apply(s, 'gate', { gate: 'chips', state: 'screened', source: { kind: 'model', name: 'x' }, value: { chipset: null } }); }, 400, /Name the chips/);
  apply(s, 'gate', { gate: 'interconnection', state: 'working' });
  v = view(s);
  assert.equal(v.gates.interconnection.stateLabel, 'In progress'); assert.equal(v.lines.interconnection.action, null, 'in progress: nothing more to log');
  assert.deepEqual(D.GATES.map(function (g) { return v.gates[g].short; }), ['Pwr', 'IX', 'Fbr', 'Ctl', 'Chip', 'Off', '$']);
  assert.equal(D.STAGE_LABEL.pursue, 'Earmarked'); assert.equal(D.CALL_LABEL.pursue, 'Earmark');
  /* sizing chips, one a chipset, from the contract case; the chosen one marked */
  var c = D.view(s, { config: CFG, now: NOW, kase: CASE });
  assert.deepEqual(c.sizing.byChipset.map(function (x) { return x.name + (x.chosen ? '*' : ''); }), ['NVIDIA H100*', 'NVIDIA B200']);
  assert.equal(c.sizing.words, 'Size from power · 450 kW is 2 skids');
  Object.keys(c.lines).forEach(function (k) { [c.lines[k].sentence, c.lines[k].sources].forEach(function (w) { assert.ok(w == null || !/undefined|NaN|null/.test(w), k + ': ' + w); }); });
});

test('D23 the name it prints is the workspace\u2019s: the white label\u2019s platform name where it is on, else the record\u2019s name; never a literal in core', function () {
  assert.deepEqual(D.brandOf({ name: 'Solela Capital' }, 'solelacapital.com'), { name: 'Solela Capital', shortName: null, source: 'workspace' });
  assert.deepEqual(D.brandOf({ name: 'Solela Capital LLC', whiteLabel: { platformName: 'Solela Capital', shortName: 'Solela' } }, 'solelacapital.com'), { name: 'Solela Capital', shortName: 'Solela', source: 'white-label' });
  assert.equal(D.brandOf({ name: 'Solela Capital LLC', whiteLabel: { platformName: 'Solela Capital', enabled: false } }).name, 'Solela Capital LLC', 'a white label switched off is not the name');
  assert.deepEqual(D.brandOf(null, 'solelacapital.com'), { name: 'solelacapital.com', shortName: null, source: 'org id' });
  assert.ok(stripComments(SRC).indexOf('Solela') < 0);
});

/* ── the rule that matters most, mutation-tested ──────────────────────── */
test('D20 mutation: with the document check cut out of the library, a confirmation on a document that is not on the Files gets through — the suite above refuses it', function () {
  var cut = SRC.replace(/function fileCheck\(files, id\) \{[\s\S]*?\n\}/, 'function fileCheck() { return {}; }');
  assert.notEqual(cut, SRC, 'the guard was found to cut');
  var mod = { exports: {} };
  vm.runInNewContext(cut, { module: mod, exports: mod.exports, require: function (p) { if (p === './power') return P; if (p === '../whitelabel') return require('../../api/_lib/whitelabel'); throw new Error('unexpected require ' + p); } }, { filename: 'diligence-mutant.js' });
  var M = mod.exports, s = chargerSite();
  var r = M.change(null, 'gate', { gate: 'fiber', state: 'confirmed', value: { carrier: 'Zayo' }, evidenceFileId: 'f_nowhere', source: doc('carrier-quote') }, ctx(s));
  assert.equal(r.diligence.gates.fiber.state, 'confirmed', 'the mutant accepts it');
  refused(function () { D.change(null, 'gate', { gate: 'fiber', state: 'confirmed', value: { carrier: 'Zayo' }, evidenceFileId: 'f_nowhere', source: doc('carrier-quote') }, ctx(s)); }, 409, /not on this site/);
});

(async function () {
  for (var i = 0; i < queue.length; i++) {
    try { await queue[i][1](); passed++; console.log('PASS ' + queue[i][0]); }
    catch (e) { failed++; console.log('FAIL ' + queue[i][0] + '\n     ' + (e && e.stack || e).split('\n').slice(0, 4).join('\n     ')); }
  }
  console.log('diligence: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
