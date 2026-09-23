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

if (fails) { console.log('trouteready: ' + fails + ' failed'); process.exit(1); }
console.log('trouteready: all passed');
