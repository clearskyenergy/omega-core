/* Buyer-folder readiness, against Grant's "Route to Development" (2026-08-31).

   The document's closing section is unambiguous about the deliverable: a buyer
   gets "the six complete, verified data sets" — Summary, Scope, Technical,
   Engineering/IA, Financial, Legal. This pins that the portal computes those
   six honestly, and in particular that it does not flatter a project.

   The case that matters most is LEGAL. The portal has nowhere to record a
   ground lease, a PPA or a JDA, so legal can never read ready. It would be
   easy to drop it from the denominator and let a well-built project show
   100% — and that number would mean "ready apart from the part nobody can
   fill in", which is the sentence a buyer discovers for themselves. */
'use strict';
const path = require('path');
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

global.window = {};
require(path.join(__dirname, '..', '..', 'tenants', 'osa', 'route-to-development.js'));
const R = global.window.RouteToDevelopment;

ok(!!R && typeof R.readiness === 'function', 'module exposes readiness()');
ok(R.SETS.length === 6, 'there are six data sets, as the document says');
ok(R.SETS.map(s => s.key).join(',') === 'summary,scope,technical,engineering,financial,legal',
   'and they are the document’s six, in its order');

/* An empty deal: nothing recorded anywhere. */
const empty = R.readiness({});
ok(empty.pct === 0, 'an empty deal is 0% ready');
ok(empty.ready === false, 'and is not buyer ready');
ok(empty.blocking.length === 6, 'with all six named as blocking');

/* A deal with everything the portal CAN record, filled in properly. */
const full = R.readiness({
  name: 'Hillside Bottling', address: '600 N Union Ave, Havre de Grace, MD',
  summary: 'Roof recently replaced; switchgear in the north bay and room behind the plant for a ground mount.',
  projectType: 'bess', categories: ['bess'], sizeMw: 3, loadKw: 480, annualKwh: 1120000,
  projectId: 'proj_1', design: { status: 'complete' },
  permitting: { startedAt: '2026-08-01', ahj: 'Havre de Grace',
                applications: [{ status: 'filed' }] },
  grid: { score: 72, substations: [{ id: 's1' }] },
  capexUsd: 4200000, funding: { requestedUsd: 3000000 }
});
ok(full.sets.find(s => s.key === 'summary').state === 'ready', 'a written thesis makes summary ready');
ok(full.sets.find(s => s.key === 'scope').state === 'ready', 'type, size and load make scope ready');
ok(full.sets.find(s => s.key === 'technical').state === 'ready', 'a complete design makes technical ready');
ok(full.sets.find(s => s.key === 'engineering').state === 'ready', 'a filed application plus grid makes engineering ready');
ok(full.sets.find(s => s.key === 'financial').state === 'ready', 'capex plus a raise makes financial ready');

/* THE POINT. Everything recordable is done, and it still is not sellable. */
ok(full.sets.find(s => s.key === 'legal').state === 'unbacked',
   'legal reports unbacked — not missing, because there is nowhere to record it');
ok(full.ready === false, 'a project cannot be buyer ready while a data set is unbacked');
ok(full.pct === 85, 'and it ceilings at 85%, not 100% (got ' + full.pct + ')');
ok(full.ceiling === true, 'the ceiling is reported, so the UI can explain the missing 15%');

/* agreementRef is the ORIGINATION fee agreement, not site control. Scoring it
   would make every referred deal look legally packaged. */
const feeOnly = R.readiness({ agreementRef: 'OSA-2026-014', name: 'X', address: 'Y' });
ok(feeOnly.sets.find(s => s.key === 'legal').state === 'unbacked',
   'an origination fee agreement does not count as legal packaging');

/* Partial credit, so a half-built project outranks an empty one. */
const partial = R.readiness({ name: 'Y', address: 'Z', projectType: 'solar', projectId: 'p' });
ok(partial.pct > 0 && partial.pct < full.pct, 'a partly built project scores between the two');

/* The matrix question: which are closest to the Buyer's market. */
const ranked = R.closestToMarket([{ name: 'empty' }, {
  name: 'full', address: 'A', summary: 'x'.repeat(50), projectType: 'bess',
  sizeMw: 2, loadKw: 100, projectId: 'p', design: { status: 'complete' },
  permitting: { applications: [{ status: 'filed' }] }, grid: { score: 60 },
  capexUsd: 1000, funding: { requestedUsd: 500 }
}]);
ok(ranked[0].deal.name === 'full', 'closestToMarket ranks the more complete project first');
ok(ranked.length === 2, 'and keeps every project in the list');

/* ── The upgrade is ADDITIVE ──────────────────────────────────────────────
   Buyer-folder readiness answers a different question from the Matrix, so it
   was added as a fifth rendering rather than replacing anything. These pin
   that: the Matrix and the JD partners view in particular were called out as
   must-keeps, and a future tidy-up that "simplifies" the portfolio views would
   otherwise take them silently. */
const fs2 = require('fs');
const page = fs2.readFileSync(
  path.join(__dirname, '..', '..', 'tenants', 'osa', 'portfolio.html'), 'utf8');

['matrix', 'jd', 'partners', 'funding', 'supply', 'inbox',
 'design', 'work', 'users', 'settings', 'orgs', 'verify'].forEach(function (v) {
  ok(page.indexOf('data-view="' + v + '"') >= 0, 'the ' + v + ' sidebar entry survives');
});
ok(page.indexOf('id="v-matrix"') >= 0, 'the Matrix view survives');
ok(page.indexOf('id="v-jd"') >= 0, 'the JD partners view survives');
ok(page.indexOf('id="v-buyer"') >= 0, 'and the Buyer Folder view was added');
ok(/label:'Matrix'/.test(page) && /label:'Buyer Folder'/.test(page),
   'the portfolio switcher gained Buyer Folder without losing Matrix');

/* ── AGAINST THE SHAPE THE CONSOLE ACTUALLY PASSES ────────────────────────
   Every case above hands readiness() a hand-written flat object, and that is
   how the load bug survived being tested: the console does not pass flat
   objects. portfolio.html calls closestToMarket(S.deals), and S.deals are
   Portfolio.normalize()'d, which nests monthlyBillUsd / annualKwh / loadKw
   under `energy`. Read flat, those were zero on every real deal, so scope
   could never reach ready and its detail line read "No load or usage data"
   however much the intake form had collected.

   So this runs the REAL normaliser rather than a copy of what it is believed
   to produce. A fixture that agrees with the model instead of with the
   product tests nothing. */
global.window.Portfolio = undefined;
require(path.join(__dirname, '..', '..', 'tenants', 'osa', 'portfolio-data.js'));
const Portfolio = global.window.Portfolio;
ok(typeof Portfolio.normalize === 'function', 'the real portfolio normaliser loads');

const normalised = Portfolio.normalize('d1', {
  name: 'Hillside Bottling', address: '600 N Union Ave, Havre de Grace, MD',
  siteNotes: 'Roof recently replaced; switchgear in the north bay and room behind the plant.',
  projectType: 'bess', categories: ['bess'], sizeMw: 3,
  energy: { loadKw: 480, annualKwh: 1120000, monthlyBillUsd: 18400 }
});
ok(normalised.energy.loadKw === 480, 'normalize() nests the load under energy, as the console sees it');
ok(normalised.loadKw === undefined, 'and does NOT leave a flat copy behind');

const real = R.readiness(normalised);
ok(real.sets.find(s => s.key === 'scope').state === 'ready',
   'scope reads ready on a normalised deal with a size and a load');
ok(real.sets.find(s => s.key === 'scope').detail === 'Type, size and load recorded',
   'and says so, instead of "No load or usage data"');

/* A normalised deal with the energy block EMPTY is still honestly incomplete —
   the fix must not make every deal look scoped. */
const noLoad = R.readiness(Portfolio.normalize('d2', {
  name: 'X', address: 'Y', projectType: 'bess', sizeMw: 3
}));
ok(noLoad.sets.find(s => s.key === 'scope').state === 'partial',
   'a normalised deal with no usage data is still only partial on scope');

if (fails) { console.log('trouteready: ' + fails + ' failed'); process.exit(1); }
console.log('trouteready: all passed');
