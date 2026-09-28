#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/check-production.js
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Reads a deployment's billing state and parity from OUTSIDE, with no
   credentials: which rail it sells on, whether its seeded price book is this
   tree's release version, whether the billing routes are deployed and
   guarded, and whether the billing pages it serves are this tree's.

   WHY. The dashboards (Vercel's variables, Stripe's keys) are not reachable
   from every place the work is done — on 2026-09-28 the merge landed from a
   cloud session with no tokens while the owner's own internet was down. What
   IS reachable from anywhere is what the deployment answers the public:
   `/api/offerings` says `signup.payWith` off PACKAGING_PROVIDER, its
   `pricebookVersion` and `source` off the seeded book, the guarded routes
   answer 400/401 to a stranger (a missing route answers 404), and a served
   file either hashes to this tree's or does not. Together they say whether
   the flip is done and the code it flips is live, before anyone signs in.

   node scripts/check-production.js [--host <host>] [--expect-stripe] [--json]
     --host           silmarillion.clearskyomega.com by default
     --expect-stripe  the go-live check: the rail must read Stripe
     --json           the rows as JSON instead of the list
   Exit 1 when a check fails. Nothing is written anywhere.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var https = require('https'), fs = require('fs'), path = require('path'), crypto = require('crypto');
var B = require(path.join(__dirname, '..', 'api', '_lib', 'pricebook.js'));

var HOME = 'silmarillion.clearskyomega.com';
/* the billing runtime and the pages that draw it: what a flip and a merge change */
var FILES = ['omega-package-menu.js', 'omega-caps.js', 'omega-workspace-hub.js', 'omega-editor-plan.js', 'omega-tenant.js',
  'omega-workspace-shell.js', 'workspace.html', 'index.html', 'start.html', 'marketplace.html', 'login.html'];
/* Vercel's clean URLs: a page is served without its extension, index at the root */
function pathOf(file) {
  if (file === 'index.html') return '/';
  if (/\/index\.html$/.test(file)) return '/' + file.replace(/\/index\.html$/, '');
  if (/\.html$/.test(file)) return '/' + file.replace(/\.html$/, '');
  return '/' + file;
}
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

/* ── the probes: what the host answered, nothing judged yet ── */
function fetch(host, method, p, body) {
  return new Promise(function (resolve) {
    var req = https.request({ host: host, method: method, path: p, timeout: 30000,
      headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {} }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }); });
    });
    req.on('timeout', function () { req.destroy(new Error('timed out')); });
    req.on('error', function (e) { resolve({ status: 0, body: '', error: e.message }); });
    if (body) req.write(body);
    req.end();
  });
}
async function probe(host, root) {
  var facts = { host: host, files: {} };
  var off = await fetch(host, 'GET', '/api/offerings');
  facts.offerings = off; try { facts.offerings.json = JSON.parse(off.body); } catch (e) { facts.offerings.json = null; }
  facts.webhook = await fetch(host, 'POST', '/api/stripe-webhook', JSON.stringify({ id: 'evt_probe', type: 'invoice.paid' }));
  facts.runner = await fetch(host, 'GET', '/api/billing-run');
  facts.planChange = await fetch(host, 'GET', '/api/plan-change');
  facts.auth = await fetch(host, 'GET', '/api/auth-check'); try { facts.auth.json = JSON.parse(facts.auth.body); } catch (e) { facts.auth.json = null; }
  for (var i = 0; i < FILES.length; i++) {
    var f = FILES[i], r = await fetch(host, 'GET', pathOf(f)), local = null;
    try { local = sha(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) {}
    facts.files[f] = { status: r.status, served: r.status === 200 ? sha(r.body) : null, local: local, error: r.error };
  }
  return facts;
}

/* ── the judgement, pure ── */
function judge(facts, opts) {
  opts = opts || {};
  var rows = [], o = facts.offerings || {}, j = o.json || {}, s = j.signup || {};
  function row(name, ok, note) { rows.push({ name: name, ok: !!ok, note: note || '' }); }
  row('the price list answers', o.status === 200 && o.json, o.status ? 'HTTP ' + o.status : (o.error || 'no answer'));
  row('the seeded book is this tree\'s release version ' + B.VERSION,
    j.source === 'seeded' && j.pricebookVersion === B.VERSION && !/-proposed$/.test(String(j.pricebookVersion)),
    (j.source || '?') + ' ' + (j.pricebookVersion || '?'));
  row('signup is packaged and pays now', s.packaged === true && s.payNow === true,
    'packaged ' + s.packaged + ', payNow ' + s.payNow);
  var rail = s.payWith || '?';
  row(opts.expectStripe ? 'the rail is Stripe' : 'the rail (PACKAGING_PROVIDER)', opts.expectStripe ? rail === 'Stripe' : !!s.payWith, rail);
  var w = facts.webhook || {};
  row('the Stripe webhook route is deployed and checks signatures', w.status === 400, w.status ? 'HTTP ' + w.status + ' ' + String(w.body || '').slice(0, 40) : (w.error || 'no answer'));
  var r = facts.runner || {};
  row('the hourly billing runner is deployed and guarded', r.status === 401, r.status ? 'HTTP ' + r.status : (r.error || 'no answer'));
  var pc = facts.planChange || {};
  row('plan-change is deployed and needs a token', pc.status === 401, pc.status ? 'HTTP ' + pc.status : (pc.error || 'no answer'));
  var a = facts.auth || {}, aj = a.json || {};
  row('Google sign-in is registered on this host', a.status === 200 && aj.google === true, a.status ? 'HTTP ' + a.status + ' google ' + aj.google : (a.error || 'no answer'));
  var files = facts.files || {};
  Object.keys(files).forEach(function (f) {
    var x = files[f] || {};
    row('serves this tree\'s ' + f, x.status === 200 && x.local && x.served === x.local,
      x.status !== 200 ? (x.status ? 'HTTP ' + x.status : (x.error || 'no answer')) : !x.local ? 'not in this tree' : x.served === x.local ? 'same' : 'differs');
  });
  return { ok: rows.every(function (x) { return x.ok; }), rows: rows };
}

function args(argv) {
  var out = { host: HOME, expectStripe: false, json: false };
  for (var i = 0; i < argv.length; i++) {
    var v = argv[i];
    if (v === '--expect-stripe') out.expectStripe = true;
    else if (v === '--json') out.json = true;
    else if (v === '--host' && argv[i + 1]) { out.host = String(argv[++i]).replace(/^https?:\/\//, '').replace(/\/.*$/, ''); }
    else throw new Error('Usage: node scripts/check-production.js [--host <host>] [--expect-stripe] [--json]');
  }
  return out;
}
async function main() {
  var a = args(process.argv.slice(2)), facts = await probe(a.host, path.join(__dirname, '..')), v = judge(facts, a);
  if (a.json) { console.log(JSON.stringify({ host: a.host, ok: v.ok, rows: v.rows }, null, 2)); }
  else {
    console.log('check-production: ' + a.host);
    v.rows.forEach(function (r) { console.log('  ' + (r.ok ? '✔' : '✖') + ' ' + r.name + (r.note ? '  — ' + r.note : '')); });
    console.log(v.ok ? 'check-production: ok' : 'check-production: FAILED');
  }
  process.exit(v.ok ? 0 : 1);
}
if (require.main === module) main().catch(function (e) { console.error(e.message); process.exit(1); });
module.exports = { judge: judge, probe: probe, pathOf: pathOf, FILES: FILES, HOME: HOME };
