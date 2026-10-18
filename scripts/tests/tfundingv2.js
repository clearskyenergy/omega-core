/* Marketplace v2: the readiness score, the financier list, and the data-room
   connectors. The live portal is not on this path.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/tfundingv2.js */
'use strict';
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var D = require('../_lib/firestore-double');
D.mock('../api/_lib/admin', {
  httpError: function (status, msg) { var e = new Error(msg); e.status = status; return e; },
  handler: function (fn) { return fn; },
  authenticate: function () { return Promise.reject(new Error('missing bearer token')); },
  db: function () { throw new Error('no Firestore in this test'); }
});
var B = require('../../api/_lib/bankability');
var V = require('../../api/_lib/vdr');
var EX = require('../../api/_lib/funding-v2-examples');
var API = require('../../api/funding-v2');
var handle = API.handle;

var pass = 0;
function ok(cond, msg) {
  assert.equal(!!cond, true, msg || 'assertion');
  pass++;
}

(async function () {

var points = B.CATEGORIES.reduce(function (n, c) { return n + c.points; }, 0);
ok(points === 100, 'category points sum to 100, got ' + points);
ok(B.DEFAULT_THRESHOLD === 80, 'the list line is 80');

var portal = fs.readFileSync(path.join(__dirname, '../../portals/finance/index.html'), 'utf8');
var m = /const DEV_STAGES = \[([\s\S]*?)\];/.exec(portal);
ok(m, 'the live portal still names its stages');
var liveStages = m[1].match(/'[^']+'/g).map(function (s) { return s.slice(1, -1); });
assert.deepEqual(B.DEV_STAGES, liveStages);
pass++;

function scored(id) {
  var pkg = EX.packages().filter(function (p) { return p.id === id; })[0];
  return { package: pkg, result: B.score(pkg) };
}
var complete = scored('preview-complete');
var ready = scored('preview-ready');
var thin = scored('preview-thin');
var blocked = scored('preview-blocked');

ok(complete.result.score === 100 && complete.result.visible, 'a complete package scores 100 and is listed');
ok(ready.result.score === 94 && ready.result.visible, 'a package with named gaps still clears 80, got ' + ready.result.score);
ok(thin.result.score === 74 && thin.result.hardFail.length === 0 && !thin.result.visible,
  'every hard gate can pass and the score still holds the package off the list, got ' + thin.result.score);
ok(!blocked.result.visible && blocked.result.hardFail.indexOf('design') >= 0 && blocked.result.hardFail.indexOf('returns') >= 0,
  'a missing one-line and missing returns block the package');
ok(blocked.result.checklist[0] === 'Financiers cannot see this yet.', blocked.result.checklist[0]);
ok(blocked.result.checklist.some(function (l) { return /one-line/.test(l); }), 'the checklist names the one-line');
ok(thin.result.checklist.some(function (l) { return /The score is 74/.test(l); }), 'the thin package says how far it is from the line');

var loi = B.score({ siteControl: { instrument: 'loi', date: '2026-01-01', party: 'Owner', documentId: 'd' } });
ok(!loi.items.filter(function (i) { return i.id === 'siteControl'; })[0].pass, 'a letter of intent does not clear site control');

var declined = B.score({ interconnection: { kind: 'declined', utility: 'U', source: 'Letter', asOf: '2026-01-01' } });
ok(declined.hardFail.indexOf('interconnection') >= 0, 'a declined interconnection is not listed');

var bareIrr = B.score({ returns: { irr: 12, npv: 1, paybackYears: 5, termYears: 10, basis: 'after-tax' } });
ok(bareIrr.hardFail.indexOf('returns') >= 0, 'an IRR of 12 is not read as 12%');
var neg = B.score(Object.assign({}, complete.package, { returns: { irr: -0.02, npv: -100, paybackYears: 0, termYears: 10, basis: 'after-tax' } }));
var ret = neg.items.filter(function (i) { return i.id === 'returns'; })[0];
ok(ret.pass && /negative/.test(ret.missing), 'a negative IRR is shown, not replaced');

var drawing = B.fromDrawing({
  name: 'Cummings', state: 'il', mw: 6.5, ask: 1000000, capexSource: 'benchmark',
  siteControl: 'LOI with the owner', interconnect: 'Utility said maybe',
  offtake: 'Speculative — no signed offtake', permits: 'Not started'
});
var drawn = B.score(drawing);
ok(drawn.hardFail.indexOf('siteControl') >= 0, 'free-text site control does not pass');
ok(drawn.hardFail.indexOf('interconnection') >= 0, 'free-text interconnection does not pass');
ok(drawn.hardFail.indexOf('cost') >= 0, 'a benchmark flag is not a cost source');
ok(drawing.offtake.position === 'merchant', 'the editor\'s speculative offtake becomes an explicit merchant position');

var grid = B.fromDrawing({
  grid: { utility: 'ComEd', source: 'Omega grid verdict', asOf: '2026-10-01', kind: 'screening' }
});
ok(B.score(grid).items.filter(function (i) { return i.id === 'interconnection'; })[0].pass, 'a verdict with utility, source and date is a screening');
ok(!B.score(B.fromDrawing({ grid: { utility: 'ComEd' } })).items.filter(function (i) { return i.id === 'interconnection'; })[0].pass,
  'a utility name alone is not interconnection evidence');

var site = {
  id: 'site-1', name: 'Preview site', state: 'IL', city: 'Joliet',
  latestModel: {
    irr: 0.11, npv: 250000, paybackYears: 7, termYears: 10, totalProjectCost: 1500000, at: '2026-10-15T12:00:00.000Z',
    serviceKw: 400, host: {
      ppa: { year1Kwh: 900000, ratePerKwh: 0.1 },
      storage: { streams: [{ name: 'Demand', tier: 'published' }], load: { source: 'bill', label: '12 months of bills', annualKwh: 900000 } }
    }
  }
};
var port = B.fromPortfolio(site);
var portScore = B.score(port);
ok(port.returns && port.returns.basis === 'after-tax' && port.returns.irr === 0.11, 'portfolio IRR is the model\'s after-tax figure');
ok(port.production && port.production.annualKwh === 900000, 'production is the load on the model');
ok(port.valueStack.streams[0].source === 'Site model host.storage.streams', 'a stream with a tier names the model as its source');
ok(portScore.hardFail.indexOf('design') >= 0, 'a portfolio model does not invent a one-line');
ok(!port.design, 'design stays empty when the site has none');

var crit = B.criteria({ minMw: 3, minIrr: 10, technology: 'storage', state: 'il', minStage: 'Contract executed', minScore: 80 });
ok(B.matches(complete.package, complete.result, crit), 'the complete package meets the financier minimums');
ok(!B.matches(ready.package, ready.result, crit), '2.5 MW solar+storage at 9% does not meet a 3 MW / 10% / storage minimum');
ok(!B.matches(thin.package, thin.result, crit), 'a package under the line never matches, whatever the minimums');
assert.throws(function () { B.criteria({ technology: 'coal' }); }, /Unknown technology/);
pass++;
assert.throws(function () { B.criteria({ minIrr: 150 }); }, /percent/);
pass++;
assert.throws(function () { B.compare([complete]); }, /two or three/);
pass++;
assert.throws(function () { B.compare([complete, thin]); }, /cannot see/);
pass++;
var cmp = B.compare([complete, ready]);
ok(cmp.rows.filter(function (r) { return r.label === 'IRR'; })[0].cells.join() === '12%,9%', cmp.rows);
ok(cmp.rows.filter(function (r) { return r.label === 'ROM'; })[0].cells[0] === '$4,800,000', 'ROM is the package amount');

var caller = { uid: 'u1', email: 'ada@preview.test', staff: false };
var staff = { uid: 's1', email: 'ada@clearsky-usa.com', staff: true };
var board = handle({ action: 'board', examples: true, criteria: { minIrr: 10 } }, caller, {}, {});
ok(board.deals.length === 1 && board.deals[0].id === 'preview-complete', 'the board lists only what clears the minimums');
ok(board.held.some(function (h) { return h.id === 'preview-thin' && !h.visible; }), 'the thin package is held, with its checklist');
ok(board.live === false && /not live deals/i.test(board.note), board.note);
ok(board.deals[0].illustrative === true, 'every example says it is illustrative');

assert.throws(function () { handle({ action: 'publish', package: complete.package }, staff, {}, { db: new D.DB() }); }, /preview/);
pass++;
assert.throws(function () { handle({ action: 'publish', package: { id: 'real-1' } }, staff, { FUNDING_V2_PUBLISH: 'true' }, { db: new D.DB() }); }, /cannot see/);
pass++;
var interest = handle({ action: 'interest', packageId: 'preview-complete' }, caller, {}, {});
ok(interest.stored === false && /live marketplace/.test(interest.note) && interest.event.stored === false, interest.note);
assert.throws(function () { handle({ action: 'request-info', packageId: 'preview-complete', note: 'no' }, caller, {}, {}); }, /sentence/);
pass++;

var db = new D.DB();
var pubPkg = JSON.parse(JSON.stringify(complete.package));
pubPkg.id = 'pkg-real-1';
pubPkg.illustrative = false;
var published = await handle({ action: 'publish', package: pubPkg }, staff, { FUNDING_V2_PUBLISH: 'true' }, { db: db });
var listed = await handle({ action: 'list', criteria: {} }, caller, { FUNDING_V2_PUBLISH: 'true' }, { db: db });
var quiet = handle({ action: 'list' }, caller, {}, { db: db });
ok(published.collection === 'funding_v2_packages' && /fin_projects was not written/.test(published.note), published.note);
ok(listed.live === true && listed.deals.length === 1 && listed.deals[0].id === 'pkg-real-1', 'a published package is listed');
ok(quiet.live === false && quiet.deals.length === 0, 'with publishing off the live list is empty');
var keys = [];
db.data.forEach(function (v, k) { keys.push(k); });
ok(keys.every(function (k) { return k.indexOf('fin_projects') !== 0; }), 'v2 does not write fin_projects: ' + keys.join(' '));
ok(keys.some(function (k) { return k.indexOf('funding_v2_packages/') === 0; }), 'v2 writes its own collection');

var saved = await handle({ action: 'interest', packageId: 'pkg-real-1' }, caller, { FUNDING_V2_PUBLISH: 'true' }, { db: db });
ok(saved.stored === true, 'interest is stored only on a published v2 package');
var evKeys = [];
db.data.forEach(function (v, k) { if (k.indexOf('/events/') >= 0) evKeys.push(k); });
ok(evKeys.length === 1 && db.data.get(evKeys[0]).type === 'interest', evKeys.join());

var plan = V.plan(complete.package);
ok(plan.folders[0] === '00 Index' && plan.folders.indexOf('05 Engineering') >= 0, 'the room has the standard folders');
ok(plan.index.some(function (r) { return r.slot === 'one-line' && r.folder === '05 Engineering'; }), 'the one-line is filed under engineering');
ok(plan.files[0].name === 'index.json', 'the index is a file in the room');
ok(plan.files.some(function (f) { return f.name === 'one-line.pdf'; }), 'a file with bytes is uploaded; the rest stay rows');

var calls = [];
function fakeFetch(url, opts) {
  calls.push({ url: url, opts: opts });
  var token = /Bearer ([^ ]+)/.exec(opts.headers.Authorization || '')[1];
  if (String(url).indexOf('fail') >= 0) {
    return Promise.resolve({ status: 401, text: function () { return Promise.resolve('bad ' + token); } });
  }
  return Promise.resolve({
    status: 201,
    text: function () { return Promise.resolve(JSON.stringify({ id: 'id-' + calls.length, entries: [{ id: 'box-file' }] })); }
  });
}
var env = { VDR_GOOGLE_ACCESS_TOKEN: 'google-secret-token', VDR_BOX_ACCESS_TOKEN: 'box-secret-token', VDR_GRAPH_ACCESS_TOKEN: 'graph-secret-token', VDR_GRAPH_DRIVE_ID: 'drive-1' };
ok(!V.configured('google-drive', {}).ok && V.configured('google-drive', {}).missing[0] === 'VDR_GOOGLE_ACCESS_TOKEN', 'a missing token is named, not invented');
var unconfigured = await V.sync('datasite', complete.package, env, { fetch: fakeFetch }).then(function () { return null; }, function (e) { return e; });
ok(unconfigured && unconfigured.status === 409 && calls.length === 0, 'Datasite is not called');
ok(/developer\.datasite\.com|login/.test(unconfigured.message) || /does not call/.test(V.PROVIDERS.filter(function (p) { return p.id === 'datasite'; })[0].note),
  'Datasite\'s note does not invent a request');

calls = [];
var drive = await V.sync('google-drive', complete.package, env, { fetch: fakeFetch });
ok(calls[0].url === 'https://www.googleapis.com/drive/v3/files', calls[0].url);
ok(calls.some(function (c) { return c.url.indexOf('uploadType=multipart') >= 0; }), 'files go through the multipart upload');
ok(JSON.stringify(drive).indexOf('google-secret-token') < 0, 'the Drive token is not in the result');
ok(calls.every(function (c) { return c.opts.headers.Authorization === 'Bearer google-secret-token'; }), 'Drive sends the bearer from the environment');
var folderCalls = calls.filter(function (c) { return c.url.indexOf('upload') < 0; });
ok(folderCalls.length === 1 + V.FOLDERS.length, 'root plus the standard folders, got ' + folderCalls.length);

calls = [];
var box = await V.sync('box', complete.package, env, { fetch: fakeFetch });
ok(calls[0].url === 'https://api.box.com/2.0/folders', calls[0].url);
ok(JSON.parse(calls[0].opts.body).parent.id === '0', 'Box starts at the root folder when no parent is set');
ok(calls.some(function (c) { return c.url === 'https://upload.box.com/api/2.0/files/content'; }), 'Box uses the direct upload host');
ok(JSON.stringify(box).indexOf('box-secret-token') < 0, 'the Box token is not in the result');

calls = [];
var graph = await V.sync('sharepoint', complete.package, env, { fetch: fakeFetch });
ok(calls[0].url === 'https://graph.microsoft.com/v1.0/drives/drive-1/root/children', calls[0].url);
ok(calls.some(function (c) { return c.url.indexOf(':/content') >= 0 && c.opts.method === 'PUT'; }), 'SharePoint uploads with PUT content');
ok(JSON.stringify(graph).indexOf('graph-secret-token') < 0, 'the Graph token is not in the result');

calls = [];
var leaked = await V.sync('google-drive', complete.package, { VDR_GOOGLE_ACCESS_TOKEN: 'google-secret-token' }, {
  fetch: function (url, opts) {
    calls.push(url);
    return Promise.resolve({ status: 401, text: function () { return Promise.resolve('nope google-secret-token'); } });
  }
}).then(function () { return null; }, function (e) { return e; });
ok(leaked && leaked.message.indexOf('google-secret-token') < 0, 'a refused request does not echo the token: ' + (leaked && leaked.message));

var cat = V.catalog({});
ok(cat.filter(function (p) { return p.implemented; }).map(function (p) { return p.id; }).join() === 'google-drive,box,sharepoint', 'three public connectors are implemented');
ok(cat.every(function (p) { return p.configured === false; }), 'nothing is configured without env');
var dealroom = cat.filter(function (p) { return p.id === 'dealroom'; })[0];
ok(dealroom.docs === 'https://dealroom.net/' && /not the dealroom\.co/.test(dealroom.note), 'DealRoom is the data room, not the company API');
ok(!cat.some(function (p) { return /api\.dealroom\.co/.test(p.docs); }), 'the company-database API is not a connector');

var src = fs.readFileSync(path.join(__dirname, '../../api/funding-v2.js'), 'utf8');
ok(src.indexOf('fin_projects') >= 0 && src.indexOf("collection('fin_projects'") < 0 && src.indexOf('fin_projects was not written') >= 0,
  'the endpoint names fin_projects only to say it does not write it');
ok(src.indexOf('A.authenticate') >= 0, 'the HTTP door checks the token');
ok(src.indexOf("=== 'true'") >= 0, 'publishing is a literal flag');

var page = fs.readFileSync(path.join(__dirname, '../../funding-v2.html'), 'utf8');
var display = fs.readFileSync(path.join(__dirname, '../../omega-bankability.js'), 'utf8');
ok(page.indexOf('ClearSky Energy Solutions LLC. Proprietary and Confidential') >= 0, 'the page carries the notice');
ok(page.indexOf('href="/finance"') >= 0, 'the preview points at the live marketplace');
ok(page.indexOf('fin_projects') < 0, 'the preview page does not touch fin_projects');
ok(display.indexOf('function score') < 0 && display.indexOf('DEFAULT_THRESHOLD') < 0, 'the browser file does not score');
ok(display.indexOf('OmegaBankability') >= 0, 'editor-v2 loads OmegaBankability');

var vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../../vercel.json'), 'utf8'));
var finance = vercel.rewrites.filter(function (r) { return r.source === '/finance'; })[0];
var preview = vercel.rewrites.filter(function (r) { return r.source === '/funding-v2'; })[0];
ok(finance && finance.destination === '/portals/finance', 'the live /finance rewrite is unchanged');
ok(preview && preview.destination === '/funding-v2.html', 'the preview has its own route');

var staffSync = await handle({ action: 'vdr-sync', provider: 'box', confirm: true, package: complete.package }, staff, env, { fetch: fakeFetch });
ok(staffSync.provider === 'box', 'staff can sync when the token is present');
assert.throws(function () {
  handle({ action: 'vdr-sync', provider: 'box', confirm: true, package: complete.package }, caller, env, { fetch: fakeFetch });
}, function (e) { return e.status === 403; });
pass++;
assert.throws(function () {
  handle({ action: 'vdr-sync', provider: 'box', package: complete.package }, staff, env, { fetch: fakeFetch });
}, function (e) { return e.status === 400; });
pass++;

console.log('tfundingv2: ' + pass + ' assertions passed');
})().catch(function (err) { console.error(err); process.exit(1); });
