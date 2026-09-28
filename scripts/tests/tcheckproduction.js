/* check-production judges a deployment from what it answers the public: the rail, the book, the guarded routes, the served files.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/tcheckproduction.js */
'use strict';
var path = require('path'), C = require(path.join(__dirname, '..', 'check-production.js'));
var B = require(path.join(__dirname, '..', '..', 'api', '_lib', 'pricebook.js'));
var pass = 0, fail = 0;
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
function find(v, re) { return v.rows.filter(function (r) { return re.test(r.name); })[0]; }
function good(over) {
  var files = {}; C.FILES.forEach(function (f) { files[f] = { status: 200, served: 'h-' + f, local: 'h-' + f }; });
  var f = { host: 'x.example',
    offerings: { status: 200, json: { pricebookVersion: B.VERSION, source: 'seeded', signup: { packaged: true, payNow: true, payWith: 'Stripe' } } },
    webhook: { status: 400, body: 'bad signature' }, runner: { status: 401 }, planChange: { status: 401 },
    auth: { status: 200, json: { google: true } }, files: files };
  return Object.assign(f, over || {});
}

/* clean URLs */
ok('index is the root', C.pathOf('index.html') === '/');
ok('a page loses its extension', C.pathOf('workspace.html') === '/workspace');
ok('a folder index is the folder', C.pathOf('plant/index.html') === '/plant');
ok('a script keeps its name', C.pathOf('omega-caps.js') === '/omega-caps.js');

/* the good deployment */
var v = C.judge(good(), { expectStripe: true });
ok('a live Stripe deployment on this tree passes', v.ok, v.rows.filter(function (r) { return !r.ok; }));
ok('every served file is a row', v.rows.filter(function (r) { return /^serves/.test(r.name); }).length === C.FILES.length);

/* the rail */
var qb = good(); qb.offerings.json.signup.payWith = 'QuickBooks';
v = C.judge(qb, { expectStripe: true });
ok('QuickBooks fails the go-live check', !v.ok && find(v, /rail is Stripe/).ok === false, find(v, /rail/));
v = C.judge(qb, {});
ok('without --expect-stripe the rail is only reported', v.ok && find(v, /rail/).note === 'QuickBooks', find(v, /rail/));

/* the book */
var old = good(); old.offerings.json.pricebookVersion = '2025-01';
ok('another book version fails', !C.judge(old, {}).ok);
var prop = good(); prop.offerings.json.pricebookVersion = B.VERSION + '-proposed';
ok('a proposed book fails', !C.judge(prop, {}).ok);
var code = good(); code.offerings.json.source = 'proposed';
ok('an unseeded book fails', !C.judge(code, {}).ok);

/* signup switches */
var closed = good(); closed.offerings.json.signup.payNow = false;
ok('signup without pay-now fails', !C.judge(closed, {}).ok);

/* the routes */
var nohook = good(); nohook.webhook = { status: 404, body: '' };
ok('a missing webhook route fails', !C.judge(nohook, {}).ok && find(C.judge(nohook, {}), /webhook/).note === 'HTTP 404 ');
var open = good(); open.runner = { status: 200 };
ok('an unguarded runner fails', !C.judge(open, {}).ok);
var noauth = good(); noauth.auth = { status: 200, json: { google: false } };
ok('Google not registered on the host fails', !C.judge(noauth, {}).ok);

/* the files */
var stale = good(); stale.files['omega-caps.js'] = { status: 200, served: 'other', local: 'h-omega-caps.js' };
v = C.judge(stale, {});
ok('a served file that differs fails and says so', !v.ok && find(v, /omega-caps\.js/).note === 'differs');
var gone = good(); gone.files['start.html'] = { status: 404, served: null, local: 'h' };
ok('a page not served fails', !C.judge(gone, {}).ok);
var down = good(); down.files['index.html'] = { status: 0, served: null, local: 'h', error: 'timed out' };
v = C.judge(down, {});
ok('a network failure is a failure, named', !v.ok && find(v, /index\.html/).note === 'timed out');

/* no answer at all */
v = C.judge({ offerings: { status: 0, error: 'ECONNREFUSED' } }, {});
ok('a dead host fails every row and names the error', !v.ok && v.rows[0].note === 'ECONNREFUSED');

console.log('tcheckproduction: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
