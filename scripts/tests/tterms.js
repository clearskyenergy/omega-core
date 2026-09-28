/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The terms gate (omega-terms.js) against a Firestore stand-in that applies
 * the same create/update rule as `match /termsAcceptances/{uid}` in
 * firestore.rules: create pinned to the caller's uid and token email; update
 * only when the version changes; the timestamp is the server's.
 *
 * What it holds: a refused Accept is not believed until the record is read
 * back (a record already holding this version IS the acceptance: a second
 * tab, a modal left open), a stale token is refreshed once, a real refusal
 * says what to do and never claims the rule is missing, and a page never
 * stacks two blocking modals. */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
var source = fs.readFileSync(path.join(__dirname, '../../omega-terms.js'), 'utf8');

function dom() {
  function node(tag) {
    var n = { tagName: String(tag).toUpperCase(), children: [], parentNode: null, attrs: {}, style: {}, listeners: {}, textContent: '' };
    n.setAttribute = function (k, v) { n.attrs[k] = String(v); if (k === 'id') n.id = String(v); };
    n.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(n.attrs, k) ? n.attrs[k] : null; };
    n.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(n.attrs, k); };
    n.removeAttribute = function (k) { delete n.attrs[k]; };
    n.appendChild = function (c) { c.parentNode = n; n.children.push(c); return c; };
    n.insertBefore = function (c) { return n.appendChild(c); };
    n.removeChild = function (c) { n.children = n.children.filter(function (x) { return x !== c; }); c.parentNode = null; return c; };
    n.addEventListener = function (t, f) { (n.listeners[t] = n.listeners[t] || []).push(f); };
    return n;
  }
  function find(root, id) {
    if (root.id === id) return root;
    for (var i = 0; i < root.children.length; i++) { var f = find(root.children[i], id); if (f) return f; }
    return null;
  }
  function count(root, id) { var c = root.id === id ? 1 : 0; root.children.forEach(function (x) { c += count(x, id); }); return c; }
  var head = node('head'), body = node('body');
  return {
    readyState: 'complete', head: head, body: body, createElement: node,
    createTextNode: function (t) { var n = node('#text'); n.textContent = t; return n; },
    getElementById: function (id) { return find(head, id) || find(body, id); },
    addEventListener: function () {},
    count: function (id) { return count(body, id); }
  };
}

/* A page with showApp, the terms gate wrapped around it, and the stand-in. */
function page(opts) {
  opts = opts || {};
  var doc = dom(), shown = [], writes = [], tokens = [], signedOut = 0;
  var records = {}, tokenEmail = opts.tokenEmail === undefined ? 'pat@example.com' : opts.tokenEmail;
  if (opts.record) records.u1 = opts.record;
  var TS = { serverTimestamp: true };
  function denied() { var e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return e; }
  /* firestore.rules, match /termsAcceptances/{uid} */
  function allowed(uid, data) {
    var old = records[uid];
    if (opts.refuseAll) return false;
    if (data.uid !== uid || typeof tokenEmail !== 'string' || String(data.email).toLowerCase() !== tokenEmail.toLowerCase()) return false;
    if (typeof data.version !== 'string' || !data.version.length || data.acceptedAt !== TS) return false;
    return !old || data.version !== old.version;
  }
  var db = { collection: function (name) {
    assert.strictEqual(name, 'termsAcceptances');
    return { doc: function (uid) { return {
      get: function () {
        if (opts.readError) return Promise.reject(opts.readError);
        return Promise.resolve({ exists: !!records[uid], data: function () { return records[uid]; } });
      },
      set: function (data) {
        if (opts.writeError) return Promise.reject(opts.writeError);
        if (!allowed(uid, data)) return Promise.reject(denied());
        records[uid] = data; writes.push(data); return Promise.resolve();
      }
    }; } };
  } };
  var firestore = function () { return db; };
  firestore.FieldValue = { serverTimestamp: function () { return TS; } };
  var user = { uid: 'u1', email: opts.email === undefined ? 'pat@example.com' : opts.email,
    getIdToken: function (force) { tokens.push(force); if (force && opts.freshToken) tokenEmail = opts.freshToken; return Promise.resolve('token'); } };
  var ctx = {
    document: doc, setTimeout: function (fn) { return 0; },
    firebase: { apps: [{}], firestore: firestore, auth: function () { return { signOut: function () { signedOut++; } }; } },
    showApp: function (u) { shown.push(u); }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'omega-terms.js' });
  return {
    ctx: ctx, doc: doc, user: user, records: records, writes: writes, tokens: tokens,
    get shown() { return shown.length; }, get signedOut() { return signedOut; },
    open: function () { ctx.showApp(user); return settle(); },
    accept: function () { doc.getElementById('ot-accept').onclick(); return settle(); },
    decline: function () { doc.getElementById('ot-decline').onclick(); return settle(); },
    error: function () { var e = doc.getElementById('ot-err'); return e ? e.textContent : null; },
    modals: function () { return doc.count('ot-modal'); }
  };
}
function settle() { return new Promise(function (ok) { setTimeout(ok, 5); }); }

(async function () {
  var VERSION = page().ctx.OmegaTerms.VERSION;

  /* 1. first acceptance: one record, the page opens, the modal is gone */
  var p = page();
  await p.open();
  assert.strictEqual(p.modals(), 1, 'a first visit is met by the terms modal');
  assert.strictEqual(p.shown, 0, 'nothing renders before acceptance');
  await p.accept();
  assert.strictEqual(p.writes.length, 1, 'accepting records once');
  assert.strictEqual(p.writes[0].version, VERSION);
  assert.strictEqual(p.shown, 1, 'the page opens after acceptance');
  assert.strictEqual(p.modals(), 0, 'the modal closes');

  /* 2. an accepted version is not asked again */
  p = page({ record: { uid: 'u1', email: 'pat@example.com', version: VERSION } });
  await p.open();
  assert.strictEqual(p.modals(), 0, 'accepted terms open the page directly');
  assert.strictEqual(p.shown, 1);

  /* 3. THE REPORTED CASE: the modal is up, the same version is recorded
     elsewhere (another tab accepted), then Accept here. The rule refuses the
     unchanged version; the record is read back and the person goes on. */
  p = page();
  await p.open();
  p.records.u1 = { uid: 'u1', email: 'pat@example.com', version: VERSION };
  await p.accept();
  assert.strictEqual(p.error(), null, 'no error once the modal has closed');
  assert.strictEqual(p.modals(), 0, 'a refusal of an already-recorded version closes the modal');
  assert.strictEqual(p.shown, 1, 'and opens the page');
  assert.strictEqual(p.writes.length, 0, 'nothing was rewritten: the record stays as it was');

  /* 4. two requests for the gate on one page: ONE modal, both wait on it */
  p = page();
  p.ctx.showApp(p.user); p.ctx.showApp(p.user); await settle();
  assert.strictEqual(p.modals(), 1, 'a second request never stacks a second modal');
  await p.accept();
  assert.strictEqual(p.writes.length, 1, 'one acceptance recorded');
  assert.strictEqual(p.shown, 2, 'both requests get the answer');
  assert.strictEqual(p.modals(), 0);
  await p.open();
  assert.strictEqual(p.modals(), 0, 'after acceptance the gate lets the next request through');

  /* 5. a token minted before the email settled: refreshed once, then recorded */
  p = page({ tokenEmail: 'old@example.com', freshToken: 'pat@example.com' });
  await p.open(); await p.accept();
  assert.deepStrictEqual(p.tokens, [true], 'one forced token refresh');
  assert.strictEqual(p.writes.length, 1, 'recorded on the fresh token');
  assert.strictEqual(p.shown, 1);

  /* 6. a refusal that stands: said plainly, never "the rule is missing" */
  p = page({ refuseAll: true });
  await p.open(); await p.accept();
  assert.strictEqual(p.shown, 0, 'a refused acceptance does not open the page');
  assert.strictEqual(p.modals(), 1, 'the modal stays');
  assert.ok(/was refused/.test(p.error()) && /Sign out, sign in again/.test(p.error()) && /dev@clearsky-usa\.com/.test(p.error()), p.error());
  assert.ok(!/rule is missing/i.test(p.error()), 'it never guesses the rule is missing');
  assert.strictEqual(p.doc.getElementById('ot-accept').hasAttribute('disabled'), false, 'Accept can be pressed again');
  assert.deepStrictEqual(p.tokens, [true], 'tried once more on a fresh token first');

  /* 7. an account without an email is told so */
  p = page({ email: null });
  await p.open(); await p.accept();
  assert.ok(/no email address/.test(p.error()), p.error());
  assert.strictEqual(p.shown, 0);

  /* 8. offline: the connection, not a refusal */
  var off = new Error('offline'); off.code = 'unavailable';
  p = page({ writeError: off });
  await p.open(); await p.accept();
  assert.ok(/Check your connection/.test(p.error()), p.error());
  assert.deepStrictEqual(p.tokens, [], 'no token refresh for a network error');

  /* 9. a read that fails at load still fails CLOSED: the gate shows */
  var readErr = new Error('offline'); readErr.code = 'unavailable';
  p = page({ readError: readErr, record: { uid: 'u1', email: 'pat@example.com', version: VERSION } });
  await p.open();
  assert.strictEqual(p.modals(), 1, 'an unreadable record shows the gate');
  assert.strictEqual(p.shown, 0);

  /* 9b. an old record with no version at all is no acceptance: the re-accept records the current one */
  p = page({ record: { uid: 'u1', email: 'pat@example.com' } });
  await p.open(); assert.strictEqual(p.modals(), 1, 'a record without a version shows the gate');
  await p.accept();
  assert.strictEqual(p.writes.length, 1, 'and accepting writes the current version over it');
  assert.strictEqual(p.shown, 1);

  /* 10. Decline signs out and closes */
  p = page();
  await p.open(); await p.decline();
  assert.strictEqual(p.signedOut, 1, 'Decline signs out');
  assert.strictEqual(p.modals(), 0);
  assert.strictEqual(p.shown, 0);

  /* 11. the rule lives in firestore.rules only: no second copy in the client */
  assert.ok(!/allow create:/.test(source), 'omega-terms.js carries no copy of the rule');
  var rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
  var block = /match \/termsAcceptances\/\{uid\} \{[\s\S]*?\n    \}/.exec(rules);
  assert.ok(block && /version != resource\.data\.get\('version', ''\)/.test(block[0]) && /acceptedAt == request\.time/.test(block[0]), 'the stand-in above mirrors the live rule: update only on a new version (a record without one is no acceptance), server time');

  console.log('terms gate: records once, a refused re-accept of the recorded version opens the page, one modal per page, fresh token retry, honest refusal messages, fails closed');
})().catch(function (e) { console.error(e); process.exit(1); });
