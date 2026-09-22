/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A partner's site list and their screening scorecard, onto the OSA deals.

   The two files iQGen sent are the fixtures, in shape: the referral template
   coming back with sixty-odd "Edge Compute" sites at 1.0 MW and a few with
   no size, and a 100-point scorecard with nine axes, a ceiling row and a
   band table. Synthetic rows here, same layout, so the test does not carry a
   partner's data.

   Three parts. tenants/osa/site-screen.js is a UMD module and is exercised
   directly. tenants/osa/ingest-data.js is an IIFE over window, so it runs in
   a vm with the three globals it reads stubbed — enough to drive buildRows()
   and see aliasing, the batch defaults and the update matching land. Then
   the page is checked for the wiring.

     node scripts/tests/tositescreen.js                                    */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
function count(s, needle) { return s.split(needle).length - 1; }

const SS = require(path.join(ROOT, 'tenants', 'osa', 'site-screen.js'));

/* ── 1. project types in the partner's words ─────────────────────────── */
console.log('project type aliases');
{
  const known = ['solar', 'solar_bess', 'bess', 'compute', 'compute_gen', 'microgrid', 'der', 'dcfc', 'l2', 'charging_bess', 'powergen'];
  ok(SS.aliasProjectType('Edge Compute', known) === 'compute', '"Edge Compute" is compute');
  ok(SS.aliasProjectType('Modular Data Center', known) === 'compute', '"Modular Data Center" is compute');
  ok(SS.aliasProjectType('compute', known) === 'compute', 'a key of ours passes through');
  ok(SS.aliasProjectType('Solar + Storage', known) === 'solar_bess', '"Solar + Storage" is solar_bess');
  ok(SS.aliasProjectType('Battery', known) === 'bess', '"Battery" is bess');
  ok(SS.aliasProjectType('EV', known) === 'dcfc', '"EV" is fast charging');
  ok(SS.aliasProjectType('banana', known) === '', 'a word nobody recognises stays blank');
  ok(SS.aliasProjectType('Edge Compute', ['solar']) === '', 'an alias to a type this console does not build stays blank');
}

/* ── 2. site identity across the partner's prefix ────────────────────── */
console.log('site identity');
{
  ok(SS.siteKey('IQEDG Norwich Edge') === 'norwich edge', 'a leading all-caps partner code is dropped');
  ok(SS.siteKey('IQEDG EV Alamosa') === 'ev alamosa', 'only the first token, so EV survives');
  ok(SS.siteKey('IQEDG Preston Edge I') !== SS.siteKey('IQEDG Preston Edge II'), 'Preston I and Preston II are different sites');
  ok(SS.sameSite('Norwich Edge', 'IQEDG Norwich Edge'), 'the scorecard name matches the referral name');
  ok(!SS.sameSite('Ware Edge', 'Delaware Edge'), 'a suffix match is on a word boundary, not a substring');
  ok(SS.isYes('yes') && SS.isYes('Y') && SS.isYes('1') && SS.isYes('project') && !SS.isYes('no') && !SS.isYes(''), 'promote reads the usual yeses');

  const deals = [
    { id: 'a', name: 'IQEDG Norwich Edge', origination: { partnerOrg: 'iqgen.energy' }, externalIds: { partnerRef: 'CT-25' } },
    { id: 'b', name: 'IQEDG Salem Edge',   origination: { partnerOrg: 'iqgen.energy' }, externalIds: {} },
    { id: 'c', name: 'Norwich Edge',       origination: { partnerOrg: 'other.com' },     externalIds: {} }
  ];
  ok(SS.findExisting({ partnerOrg: 'iqgen.energy', ref: 'ct-25', name: 'Something else' }, deals).id === 'a', 'a ref wins over the name');
  ok(SS.findExisting({ partnerOrg: 'iqgen.energy', name: 'IQEDG Salem Edge' }, deals).id === 'b', 'the same site name under the same partner is the same deal');
  ok(SS.findExisting({ partnerOrg: 'new.com', name: 'Norwich Edge' }, deals) === null, 'never across partners');
}

/* ── 3. the scorecard ────────────────────────────────────────────────── */
console.log('the scorecard');
const CARD = [
  ['Shortlist — powered-land site screens, 100-point scorecard'],
  ['Run 19 Sep 2026 per the rubric.'],
  [],
  ['Ref', 'Site', 'Town / State', 'Utility', 'Zoning', 'Power - initial & certainty', 'Power - expansion & tariff',
   'Gas / on-site gen', 'Fiber', 'Land, water & climate', 'Zoning, entitlement & community', 'Market / tenant',
   'Adaptability / phaseability', 'Deal terms', 'TOTAL', 'Recommendation'],
  ['CT-25', 'Norwich Edge',   'Norwich, CT',  'Norwich Public Utilities', 'BP (Business Park)', 11, 6, 11, 5, 10, 11, 5, 4, 2, 65, 'CONDITIONAL GO'],
  ['CT-7',  'Preston Edge I', 'Preston, CT',  'Eversource CT',            'I (Industrial)',     10, 5,  9, 4, 10, 10, 4, 4, 2, 58, 'PAUSE'],
  ['MA-18', 'Rockland Edge',  'Rockland, MA', 'National Grid',            'H-1',                 7, 4,  8, 6,  6,  7, 7, 2, 1, 48, 'REJECT'],
  [null, 'Maximum available', null, null, null, 15, 10, 15, 10, 15, 15, 10, 5, 5, 100],
  [],
  ['Threshold bands (per skill rubric)'],
  ['Band', 'Meaning', null, null, 'Which sites'],
  ['80-100', 'Strong candidate. Move toward site control.'],
  ['65-79',  'Worth pursuing with conditions. Confirm specific items first; do not sign.'],
  ['50-64',  'Pause and verify the riskiest two or three items before deciding.'],
  ['Below 50', 'Reject unless a strategic reason exists (assemblage, corridor optionality).']
];
let card;
{
  card = SS.parseScorecard(CARD);
  ok(card.ok, 'a scorecard with a title block, a ceiling row and a band table parses');
  ok(card.axes.length === 9 && card.axes[0].max === 15 && card.axes[8].max === 5, 'nine axes, each with its ceiling');
  ok(card.rows.length === 3 && card.maxTotal === 100, 'three scored sites out of 100');
  ok(card.rows[0].ref === 'CT-25' && card.rows[0].state === 'CT' && card.rows[2].state === 'MA', 'ref and state come off the row');
  ok(card.bands.length === 4 && card.bands[3].lo === 0 && card.bands[3].hi === 49, 'four bands, "Below 50" read as 0–49');
  ok(card.threshold === 65, 'the pass line is the lowest band that still says pursue (' + card.threshold + ')');
  ok(SS.bandOf(58, card.bands).meaning.indexOf('Pause') === 0, '58 sits in the pause band');

  const p = SS.scorePayload(card.rows[0], card);
  ok(p.score === 65 && p.threshold === 65 && p.passes === true, 'Norwich at 65 passes at 65');
  ok(p.criteria.length === 9 && p.criteria[0].weight === 15 && p.criteria[0].value === 11 && p.criteria[0].note === '11/15', 'each axis becomes a criterion with the ceiling as its weight');
  ok(/CONDITIONAL GO/.test(p.summary) && /65\/100/.test(p.summary), 'the recommendation and the total travel as the summary');
  ok(SS.scorePayload(card.rows[1], card).passes === false, 'Preston at 58 does not pass');
  ok(SS.scorePayload(card.rows[2], card).passes === false, 'a REJECT never passes');

  const half = SS.parseScorecard(CARD.slice(0, 7));
  ok(half.ok && half.hasMaxRow === false && half.maxTotal === 100 && half.threshold === 65, 'without the ceiling row or bands: totals taken out of 100, default line 65, and said so');
  ok(SS.parseScorecard([['Site', 'Score'], ['A', 1]]).ok === false, 'a sheet with no Ref/TOTAL header is refused, not guessed');
}

/* ── 4. matching the scorecard to the deals ──────────────────────────── */
console.log('matching');
{
  const deals = [
    { id: 'n', name: 'IQEDG Norwich Edge',   stage: 'referred', origination: { partnerOrg: 'iqgen.energy' }, externalIds: {} },
    { id: 'p', name: 'IQEDG Preston Edge I', stage: 'referred', origination: { partnerOrg: 'iqgen.energy' }, externalIds: {} },
    { id: 'p2', name: 'IQEDG Preston Edge II', stage: 'referred', origination: { partnerOrg: 'iqgen.energy' }, externalIds: {} },
    { id: 'x', name: 'Rockland Edge',        stage: 'referred', origination: { partnerOrg: 'other.com' },     externalIds: {} },
    { id: 'r', name: 'IQEDG Rockland Edge',  stage: 'discarded', origination: { partnerOrg: 'iqgen.energy' }, externalIds: {} }
  ];
  const m = SS.matchScorecard(card, deals, 'iqgen.energy');
  ok(m[0].deal && m[0].deal.id === 'n' && m[0].how === 'name', 'Norwich matches by name across the prefix');
  ok(m[1].deal && m[1].deal.id === 'p', 'Preston Edge I matches Preston I, not Preston II');
  ok(m[2].deal === null && m[2].candidates.length === 0, 'Rockland does not match: the other partner’s is out of scope and ours is discarded');
  deals[0].externalIds.partnerRef = 'CT-25';
  ok(SS.matchScorecard(card, deals, 'iqgen.energy')[0].how === 'ref', 'a ref on the deal is matched first');
}

/* ── 5. the compute screen onto a deal ───────────────────────────────── */
console.log('compute screen mapping');
{
  const res = {
    verdict: 'conditional', offerable: true, verdictReason: 'fiber is a lateral',
    gateOrder: ['power', 'fiber', 'zoning', 'siteControl'],
    gates: { power: { status: 'unconfirmed', score: 40, headline: 'will-serve not confirmed', label: 'Power' },
             fiber: { status: 'conditional', score: 60, headline: '0.8 mi lateral', label: 'Fiber' },
             zoning: { status: 'pass', score: 100, headline: 'Industrial', label: 'Zoning' },
             siteControl: { status: 'unconfirmed', score: 20, headline: 'owner unknown', label: 'Site control' } },
    tranche: { n: 1, label: 'Simple land lease' },
    asks: [{ gate: 'power', ask: 'Confirm will-serve' }, 'Owner name'],
    findings: [{ severity: 'warn', text: 'parcel record missing' }],
    offer: { monthly: { base: 1200 } }, model: 'compute-lease-v1',
    site: { lat: 41.5, lng: -72.1, address: '40 Connecticut Ave, Norwich, CT' }
  };
  const rec = SS.leaseScreenRecord(res, { at: 't0', by: 'tj@ogisolar.com' });
  ok(rec.verdict === 'conditional' && rec.offerable === true && rec.gates.fiber.status === 'conditional', 'verdict and gates are kept');
  ok(rec.asks.length === 2 && rec.asks[0] === 'power: Confirm will-serve' && rec.asks[1] === 'Owner name', 'asks are flattened to sentences');
  ok(!('offer' in rec), 'the priced offer is NOT written to the deal');
  ok(rec.site.lat === 41.5 && rec.ranBy === 'tj@ogisolar.com', 'where and who');

  const pre = SS.leasePrescreen(res, { at: 't0', by: 'x' });
  ok(pre.verdict === 'pass' && pre.source === 'compute-lease' && /Fiber: 0.8 mi lateral/.test(pre.reason), 'conditional is a passing prescreen that names the condition');
  ok(SS.leasePrescreen({ verdict: 'disqualified', gates: { fiber: { status: 'fail', headline: 'no fiber' } } }).verdict === 'fail', 'only a disqualification fails the prescreen');
  ok(SS.leasePrescreen({ verdict: 'incomplete', gates: {} }).verdict === 'pass', 'incomplete — nobody answered yet — is not a fail');

  const rep = SS.repFromDeal({ address: 'A', sizeMw: 1, grid: { lat: 1, lng: 2 } });
  ok(rep.availableMw === 1 && rep.lat === 1 && rep.termYears === 15 && rep.willServe === undefined, 'the deal supplies what it knows and leaves the rest unknown');
}

/* ── 6. the editor link ──────────────────────────────────────────────── */
console.log('editor link');
{
  const d = { projectType: 'compute', address: '40 Connecticut Ave, Norwich, CT', sizeMw: 1 };
  const u = SS.editorLink('/editor.html', 'p1', d);
  ok(/\?project=p1&address=40%20Connecticut/.test(u) && /auto=compute/.test(u) && /mw=1/.test(u) && /from=portfolio/.test(u), 'a compute deal with an address opens with the autopilot parameters');
  ok(SS.editorLink('/editor.html', 'p1', { projectType: 'bess', address: 'x' }) === '/editor.html?project=p1', 'a battery deal opens plain');
  ok(SS.editorLink('/editor.html', 'p1', { projectType: 'compute' }) === '/editor.html?project=p1', 'no address, no autopilot');
  ok(SS.editorLink('/e?x=1', 'p1', null) === '/e?x=1&project=p1', 'an existing query string is respected');
}

/* ── 7. the importer's row builder, in a sandbox ─────────────────────── */
console.log('ingest-data.js buildRows');
{
  const src = fs.readFileSync(path.join(ROOT, 'tenants', 'osa', 'ingest-data.js'), 'utf8');
  const TYPES = [{ key: 'compute', categories: ['compute'] }, { key: 'bess', categories: ['bess'] },
                 { key: 'solar_bess', categories: ['solar', 'bess'] }, { key: 'dcfc', categories: ['dcfc'] }];
  const win = {
    CLEARSKY_CONFIG: { portfolio: { projectTypes: TYPES } },
    Portfolio: {
      num: function (v) { if (v == null || v === '') return null; var x = Number(String(v).replace(/[,$\s]/g, '')); return isFinite(x) ? x : null; },
      typeOf: function (k) { return TYPES.filter(function (t) { return t.key === k; })[0] || null; },
      normalizeUrl: function (u) { return u; }, stamp: function () { return 'now'; }
    },
    OmegaAccess: { orgName: function (o) { return o; } },
    SiteScreen: SS
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: 'ingest-data.js' });
  const IN = win.Ingest;
  ok(IN && typeof IN.buildRows === 'function' && typeof IN.promote === 'function'
     && typeof IN.applyScorecard === 'function' && typeof IN.screenCompute === 'function'
     && typeof IN.screenMany === 'function', 'Ingest exports buildRows, promote, applyScorecard, screenCompute, screenMany');
  ok(IN.FIELDS.filter(function (f) { return f.key === 'ref' || f.key === 'promote'; }).length === 2, 'the template carries Ref and Promote to project');

  const headers = ['Site name', 'Brought by (email domain)', 'Client (email domain)', 'Address', 'Project type',
                   'Site notes', 'Monthly bill (USD)', 'Annual kWh', 'Meters', 'Peak load (kW)', 'Target size (MW)',
                   'Channel', 'Referred date'];
  const sheet = { name: 's', rows: [
    headers,
    ['IQEDG Norwich Edge', 'iqgen.energy', '', '40 Connecticut Ave, Norwich, CT 06360', 'Edge Compute', '', '', '', '', '', '1.0', '', ''],
    ['IQEDG EV Alamosa',   'iqgen.energy', '', '610 State Ave Alamosa, CO 81101',      'Edge Compute', '', '', '', '', '', '',    '', ''],
    ['Hillside',           'iqgen.energy', '', 'somewhere',                              'Banana',       '', '', '', '', '', '2',   '', ''],
    ['No partner',         '',             '', 'x',                                      'bess',         '', '', '', '', '', '',    '', '']
  ] };
  const tpl = IN.mapFromTemplate(headers);
  ok(tpl && tpl.map.name === 0 && tpl.map.partnerOrg === 1, 'the referral file is recognised as our template with no mapping step');
  ok(tpl.map.ref == null && tpl.map.promote == null, 'a file without the two optional columns still maps');

  const existing = [{ id: 'd1', name: 'IQEDG Norwich Edge', origination: { partnerOrg: 'iqgen.energy' }, externalIds: {} }];
  const rows = IN.buildRows(sheet, tpl.map, { headerRow: 0, existing: existing, defaultSizeMw: 1 });
  ok(rows.length === 4 && rows[3].ok === false, 'four rows, the one with no originator refused');
  ok(rows[0].values.projectType === 'compute' && rows[1].values.projectType === 'compute', '"Edge Compute" lands as compute');
  ok(rows[2].values.projectType === '' && /not one we build/.test(rows[2].warnings.join(' ')), '"Banana" stays blank with the warning');
  ok(rows[0].values.sizeMw === 1 && rows[1].values.sizeMw === 1 && rows[2].values.sizeMw === 2, 'the batch default fills the empty size and never overrides a given one');
  ok(rows.defaulted.sizeMw === 1 && rows.defaulted.aliased === 2, 'the preview is told what was defaulted and what was aliased');
  ok(rows[0].updates && rows[0].updates.id === 'd1' && !rows[1].updates, 'the site already in the portfolio is an update, the new one is not');
  ok(rows[0].values.promote === false, 'no Promote column means nobody is promoted');

  const withCols = { name: 's', rows: [
    headers.concat(['Ref', 'Promote to project']),
    ['IQEDG Norwich Edge', 'iqgen.energy', '', 'addr', 'Edge Compute', '', '', '', '', '', '1', '', '', 'CT-25', 'yes'],
    ['IQEDG Salem Edge',   'iqgen.energy', '', 'addr', 'Edge Compute', '', '', '', '', '', '1', '', '', 'CT-14', '']
  ] };
  const tpl2 = IN.mapFromTemplate(withCols.rows[0]);
  const rows2 = IN.buildRows(withCols, tpl2.map, { headerRow: 0 });
  ok(rows2[0].values.ref === 'CT-25' && rows2[0].values.promote === true && rows2[1].values.promote === false, 'Ref and Promote are read when present');
  const bare = IN.buildRows(sheet, tpl.map, { headerRow: 0 });
  ok(bare[1].values.sizeMw === null, 'without a batch default the empty size stays empty — nothing is invented');
}

/* ── 8. the page and the deal model ──────────────────────────────────── */
console.log('portfolio.html and portfolio-data.js');
{
  const html = fs.readFileSync(path.join(ROOT, 'tenants', 'osa', 'portfolio.html'), 'utf8');
  ok(/<script src="\/tenants\/osa\/site-screen\.js\?v=\d+"><\/script>/.test(html), 'site-screen.js is loaded');
  ok(/<script src="\/omega-compute-lease\.js"><\/script>/.test(html) && /<script src="\/omega-grid-atlas-client\.js"><\/script>/.test(html), 'the compute screen client and its grid client are loaded');
  ok(html.indexOf('/omega-grid-atlas-client.js') < html.indexOf('/omega-compute-lease.js') && html.indexOf('/omega-compute-lease.js') < html.indexOf('/tenants/osa/ingest-data.js'), 'in dependency order, before the importer');
  ['importDefaults', 'openScorecardImport', 'scorecardSetup', 'scorecardPreview', 'screenCandidates', 'doScreenCompute', 'doScreenComputeOne'].forEach(function (n) {
    ok(count(html, 'function ' + n + '(') === 1, n + ' is defined exactly once');
  });
  ok(/value:'scorecard',label:'Upload a screening scorecard'/.test(html), 'the import dialog offers the scorecard');
  ok(/onclick="doScreenCompute\(\)"/.test(html), 'the pipeline has the bulk screen button');
  ok(/function openEditor\(projectId, dealId\)/.test(html) && /SiteScreen\.editorLink\(/.test(html), 'the editor link carries the deal');
  ok(count(html, "openEditor(\\''+esc(d.projectId)+'\\',\\''+esc(d.id)+'\\')") >= 3, 'the deal detail passes the deal into every editor link');
  ok(/IN\.runImport\(m\.rows,batch,function\(done,total\)\{[\s\S]*?\},\{ promote:/.test(html), 'the import runs with the promote decision');
  ok(/A\.saveOrg\(o\.id,f\)/.test(html), 'new partners are registered before the rows land');

  const pd = fs.readFileSync(path.join(ROOT, 'tenants', 'osa', 'portfolio-data.js'), 'utf8');
  ok(/leaseScreen: d\.leaseScreen \|\| null/.test(pd), 'normalize() carries leaseScreen');
  ok(/'grid','leaseScreen'\]/.test(pd), 'and KNOWN lists it, so it is not reported as unrecognised');
  ok(/MACHINE_PRESCREEN = \['grid-atlas', 'site-intel', 'compute-lease'\]/.test(pd), 'a compute-lease prescreen counts as a machine one');
  ok(/saveLeaseScreen:saveLeaseScreen/.test(pd) && count(pd, 'function saveLeaseScreen(') === 1, 'saveLeaseScreen is defined once and exported');
}

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
