/* Deal file completion and publishing a draft, in the financing marketplace
   (Tommy, 2026-09-30: "i want max deals in the room, but we should also have a
   metric that shows how much has been completed in the deal"). dealCompletion(),
   docsFor(), buildDeal() and draftPublishPatch() are cut out of the real page
   source, with the form's own field lists, and run here, so the score and the
   form cannot drift apart.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/tdealcompletion.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0;
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }

var src = fs.readFileSync(path.join(__dirname, '..', '..', 'portals', 'finance', 'index.html'), 'utf8');

/* the helpers, the technology tables, the form's field lists, the completion
   rule and buildDeal(), in page order */
var from = src.indexOf('const esc = s =>');
var endMark = '  d.complete = d.completion.pct;\n  return d;\n}\n';
var to = src.indexOf(endMark);
ok('the page carries the helpers through buildDeal()', from > 0 && to > from);
var cut = src.slice(from, to + endMark.length);
function line(re, what) { var m = src.match(re); ok('the page carries ' + what, !!m); return m ? m[0] : ''; }
function block(start, stop, what) {
  var a = src.indexOf(start), b = src.indexOf(stop, a);
  ok('the page carries ' + what, a > 0 && b > a);
  return src.slice(a, b);
}
var extra = [
  line(/const DEP_UNSTATED = \[.*\];/, 'the follow-up sentinels'),
  line(/const UNSTATED = \[.*\];/, 'the unstated sentinels'),
  line(/const FS_DRAFT = [^;]*;/, 'the stored statuses'),
  line(/const gatedTech\s*= [^\n]*/, 'the review gate'),
  block('function intakeStatusFor(d) {', '\n/* `owner` files', 'intakeStatusFor()'),
  block('function draftPublishPatch(d) {', '\nfunction publishedLine', 'draftPublishPatch()'),
  line(/const isDraft = [^\n]*/, 'isDraft()'),
  line(/const sentBack = [^\n]*/, 'the sent-back rule')
].join('\n');

var sb = { console: console, INTAKE: { gateEnabled: true, gateAll: false, gateTechs: ['datacenter'] }, ADMIN: false };
sb.isPlatformAdmin = function () { return sb.ADMIN; };
vm.createContext(sb);
vm.runInContext(cut + '\n' + extra + '\nthis.api = { buildDeal: buildDeal, dealCompletion: dealCompletion, docsFor: docsFor, '
  + 'hasDoc: hasDoc, draftPublishPatch: draftPublishPatch, ASSET_FIELDS: ASSET_FIELDS, DOC_PRESETS: DOC_PRESETS, '
  + 'FS_OPEN: FS_OPEN, FS_REVIEW: FS_REVIEW, sentBack: sentBack };', sb);
var A = sb.api;
var build = function (spec) { return A.buildDeal(JSON.parse(JSON.stringify(spec))); };
var labels = function (c) { return c.missing.map(function (m) { return m.label; }); };
var allDocs = function (d) { return A.docsFor(d).map(function (x) { return { label: x, url: 'https://drive.google.com/x' }; }); };

/* 1. nothing stated is 0%, and buildDeal()'s stand-ins are not answers */
var bare = build({ name: 'Bare', tech: 'solar', state: 'TX' });
ok('buildDeal() puts the score on the deal', bare.completion && bare.complete === bare.completion.pct);
ok('a deal with nothing stated is 0%', bare.complete === 0, bare.complete);
ok('the 0.1 MW stand-in is not a size', labels(bare.completion)[0] === 'Nameplate', labels(bare.completion));
ok('the size and the ask come first in what to fill in next',
  labels(bare.completion).slice(0, 2).join() === 'Nameplate,Capital ask', labels(bare.completion));
ok('the invented COD, IRR, DSCR and offtake are not scored as answers', bare.cod && bare.irr && bare.offtake && bare.completion.done === 0);
ok('"—" is unanswered', labels(bare.completion).indexOf('Site control') !== -1);
ok('a solar deal has no asset part, and the others carry the weight',
  bare.completion.parts.map(function (p) { return p.key; }).join() === 'project,status,docs', bare.completion.parts);

/* 2. every question answered is 100%, and only then */
var full = { name: 'Full', tech: 'hybrid', state: 'TX', mw: 5, mwh: 10, ask: 9e6, notes: 'Roof 2019.',
  siteControl: 'Letter of intent', interconnect: 'Not started', permits: 'Filed' };
full.links = allDocs(full);
var f = build(full);
ok('a hybrid deal with every question answered is 100%', f.complete === 100 && f.completion.band === 'good' && !f.completion.missing.length, f.completion.missing);
ok('"Not started" is an answer, not a blank', f.completion.parts[1].done === 3);
var noMwh = Object.assign({}, full, { mwh: 0 }); noMwh.links = full.links;
ok('a storage deal is asked for its MWh', labels(build(noMwh).completion).indexOf('Storage') !== -1, labels(build(noMwh).completion));
ok('a solar deal is not', labels(build(Object.assign({}, full, { tech: 'solar', links: [] })).completion).indexOf('Storage') === -1);
var partial = build(Object.assign({}, full, { links: [] }));
ok('the parts are weighted: project and status in full, no documents = 64%', partial.complete === 64, partial.complete);
ok('a band below 80', partial.completion.band === 'fair');

/* 3. an unsized opportunity is missing its size, whatever it says */
var pend = build(Object.assign({}, full, { sizePending: true, mw: 0, ask: 0 }));
ok('Size not determined yet leaves the size and the ask unanswered',
  labels(pend.completion).slice(0, 2).join() === 'Nameplate,Capital ask', labels(pend.completion));

/* 4. the asset block is the form's own list, follow-ups included only when opened */
var land = { name: 'Site', tech: 'land', state: 'TX', mw: 200, ask: 3e7, notes: 'n', siteControl: 'Letter of intent',
  interconnect: 'Study underway', permits: 'Filed', assetSpec: {} };
var fields = A.ASSET_FIELDS.land, seen = {};
fields.forEach(function (fd) {
  if (seen[fd.k]) return; seen[fd.k] = 1;
  if (fd.t === 'select') land.assetSpec[fd.k] = fd.o[fd.o.length - 1];
  else if (fd.t === 'number') land.assetSpec[fd.k] = 3;
  else land.assetSpec[fd.k] = 'stated';
});
land.links = allDocs(land);
var L = build(land);
ok('a land deal with every field of its form answered is 100%', L.complete === 100, L.completion.missing);
var one = JSON.parse(JSON.stringify(land)); delete one.assetSpec.sewer;
var L1 = build(one);
ok('one blank of sixty is never shown as 100%', L1.complete === 99 && labels(L1.completion).join() === 'Sewer / effluent', { pct: L1.complete, missing: labels(L1.completion) });
var nd = JSON.parse(JSON.stringify(land)); nd.assetSpec.iso = 'Not determined';
ok('"Not determined" is unanswered', labels(build(nd).completion).indexOf('ISO / RTO') !== -1);
var zero = JSON.parse(JSON.stringify(land)); zero.assetSpec.preIssues = 0;
ok('a zero is an answer', labels(build(zero).completion).indexOf('Pre-existing issues') === -1);
var none = JSON.parse(JSON.stringify(land)); none.assetSpec.powerLetter = 'None';
delete none.assetSpec.powerLetterBy; delete none.assetSpec.powerLetterDate; delete none.assetSpec.powerLetterMw;
var N = build(none);
ok('no letter: its issuer, date and MW are not asked for', N.complete === 100, labels(N.completion));
var issued = JSON.parse(JSON.stringify(land)); issued.assetSpec.powerLetter = 'Issued — copy available';
delete issued.assetSpec.powerLetterBy;
ok('a letter issued: who issued it is asked for', labels(build(issued).completion).indexOf('Issued by') !== -1, labels(build(issued).completion));
var req = labels(build(Object.assign({}, land, { assetSpec: {} })).completion);
ok('required asset fields come before optional ones', req.indexOf('Gross acres') < req.indexOf('Net usable acres'), req.slice(0, 8));

/* 5. documents follow the kind of deal */
var docs = function (tech) { return A.docsFor({ tech: tech }); };
ok('a data centre is asked for a tenant lease and not for bills, an offtake or a program award',
  docs('datacenter').indexOf('Tenant lease or LOI') !== -1 && docs('datacenter').indexOf('Utility bills') === -1
  && docs('datacenter').indexOf('Offtake / PPA') === -1 && docs('datacenter').indexOf('Program award letter') === -1, docs('datacenter'));
ok('a solar deal is not asked for a tenant lease or a program award',
  docs('solar').indexOf('Tenant lease or LOI') === -1 && docs('solar').indexOf('Program award letter') === -1, docs('solar'));
ok('a charging hub is asked for its program award', docs('ev').indexOf('Program award letter') !== -1);
ok('every document asked for is one the form offers', ['solar', 'hybrid', 'bess', 'ev', 'datacenter', 'land', 'micro', 'chp']
  .every(function (t) { return docs(t).every(function (x) { return A.DOC_PRESETS.indexOf(x) !== -1; }); }));
ok('twelve extracted statements are the utility bills', A.hasDoc({ bill: { totalKwh: 1 }, links: [] }, 'Utility bills'));
ok('a link counts by its label, whatever the case', A.hasDoc({ links: [{ label: ' site DETAILS ', url: 'https://x' }] }, 'Site details'));
ok('documents are named as documents, apart from the status questions',
  labels(bare.completion).indexOf('Document: Interconnection') !== -1 && labels(bare.completion).indexOf('Interconnection') !== -1);
ok('the Documents tab lists the missing ones from the same rule', src.indexOf('const missing = docsFor(d).filter(x => !hasDoc(d, x));') !== -1);

/* 6. the score is never stored */
var toDoc = src.slice(src.indexOf('function dealToDoc('), src.indexOf('function docToDeal('));
ok('dealToDoc() writes no completion field', toDoc.length > 100 && !/complet/i.test(toDoc));

/* 7. publishing a draft */
sb.ADMIN = false;
var P = function (spec) { return A.draftPublishPatch(build(Object.assign({ draft: true }, spec))); };
var p1 = P({ name: 'a', tech: 'solar', state: 'TX' });
ok('a draft with no size goes to the marketplace as Not sized, the 0.1 MW stand-in cleared',
  p1.status === A.FS_OPEN && p1.sizePending === true && p1.mw === 0, p1);
var p2 = P({ name: 'a', tech: 'solar', state: 'TX', mw: 4 });
ok('a stated size with no ask goes as Not sized and keeps the size', p2.sizePending === true && !('mw' in p2), p2);
var p3 = P({ name: 'a', tech: 'solar', state: 'TX', mw: 4, ask: 5e6 });
ok('a sized draft with an ask goes as it is', p3.status === A.FS_OPEN && !('sizePending' in p3) && !('mw' in p3), p3);
var p4 = P({ name: 'a', tech: 'datacenter', state: 'TX', mw: 40, ask: 5e8 });
ok('a technology an administrator reviews goes to review from a sponsor', p4.status === A.FS_REVIEW, p4);
sb.ADMIN = true;
ok('and straight to the marketplace from an administrator', P({ name: 'a', tech: 'datacenter', state: 'TX', mw: 40, ask: 5e8 }).status === A.FS_OPEN);
ok('the drawer\'s Publish no longer refuses an unsized draft', src.indexOf('Add the nameplate and capital ask before publishing.') === -1);
ok('a draft an administrator sent back is known as one', A.sentBack(build({ name: 'a', draft: true, reviewedAt: 1, reviewNote: 'no site control' })));
ok('a draft the sponsor saved is not', !A.sentBack(build({ name: 'a', draft: true })));
ok('a published deal is not, whatever it went through', !A.sentBack(build({ name: 'a', reviewedAt: 1 })));
ok('Publish drafts starts with a sent-back draft unticked', src.indexOf('pubRows.forEach(d => { pubSel[d.id] = !sentBack(d); });') !== -1);

console.log('tdealcompletion: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
