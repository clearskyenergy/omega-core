/* New tenant (admin console) — the documents it actually writes.
   Creating a tenant is not undoable from the console (omega_orgs has no
   delete), so the shape of the three documents and the guards in front of
   them are worth pinning down before a real one is created. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'admin', 'admin-console.js'), 'utf8');

function grab(name) {
  const needle = 'function ' + name + '(';
  const i = SRC.indexOf(needle);
  if (i < 0) throw new Error('not found: ' + name);
  let k = SRC.indexOf('{', i), d = 0;
  for (;; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) break; } }
  return SRC.slice(i, k + 1);
}
const CONSTS = /var NT_BASE_HOST[\s\S]*?var NT_RESERVED = \[[^\]]*\];/.exec(SRC)[0];

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

/* ── the console's world, faked down to what these four functions touch ── */
const DOM = {};
function el(id) { return { id, value: '', textContent: '', disabled: false, focus() {} }; }
['nt-name','nt-domain','nt-vertical','nt-slug','nt-logo','nt-note','nt-start','nt-days',
 'nt-host','nt-ends','nt-msg','nt-btn','tn-new'].forEach(id => { DOM[id] = el(id); });
DOM['tn-new'].style = { display: 'none' };

const WRITES = [];
let ORG_EXISTS = false, HOST_TAKEN = false;
function docRef(pathStr) {
  return {
    _p: pathStr,
    get: () => Promise.resolve({
      exists: /^omega_orgs\//.test(pathStr) ? ORG_EXISTS : HOST_TAKEN,
      data: () => ({ name: 'Existing Co' })
    }),
    collection: c => ({ doc: d => docRef(pathStr + '/' + c + '/' + d) })
  };
}
const sandbox = {
  console, Promise, Date, isFinite, parseInt, JSON, String, Number,
  document: { getElementById: id => DOM[id] || null },
  currentUser: { email: 'tom@clearsky-usa.com' },
  loadTenants() {},
  db: { collection: c => ({ doc: d => docRef(c + '/' + d) }) },
  firebase: { firestore: { FieldValue: { serverTimestamp: () => '<ts>' } } }
};
sandbox.db.batch = () => ({
  set(ref, data) { WRITES.push({ path: ref._p, data }); },
  commit() { return Promise.resolve(); }
});
vm.createContext(sandbox);
vm.runInContext(CONSTS + '\n' + ['toggleNewTenant','ntSlugify','ntSuggest','ntTrialEnd','createTenant']
  .map(grab).join('\n'), sandbox);
const S = sandbox;

/* ── 1 · host derivation ─────────────────────────────────────────────── */
console.log('host');
ok(S.ntSlugify('Roam Energy') === 'roam-energy', 'a name slugifies');
ok(S.ntSlugify('roamenergy.co') === 'roamenergy-co', 'a dot is not a host separator');
DOM['nt-name'].value = 'Roam Energy';
DOM['nt-domain'].value = 'roamenergy.co';
DOM['nt-slug'].value = '';
S.ntSuggest();
ok(DOM['nt-slug'].value === 'roamenergy', 'host is suggested from the domain, not the name');
ok(DOM['nt-host'].textContent === 'roamenergy.clearskyomega.com', 'and shown in full before saving');
DOM['nt-slug'].value = 'roam';
S.ntSuggest();
ok(DOM['nt-host'].textContent === 'roam.clearskyomega.com', 'an edited host is respected, not re-derived');

/* The hint is the address the tenant actually gets, so it has to track the
   field it describes. It did not: nt-slug had no oninput, so typing a host by
   hand left the line underneath showing the previous derivation. */
const adminHtml = require('fs').readFileSync(
  require('path').join(__dirname, '..', '..', 'admin', 'index.html'), 'utf8');
const slugTag = /<input[^>]*id="nt-slug"[^>]*>/.exec(adminHtml);
ok(slugTag && /oninput="ntSuggest\(\)"/.test(slugTag[0]),
   'the host field refreshes its own hint as you type');

/* ── 2 · the trial window ────────────────────────────────────────────── */
console.log('trial');
DOM['nt-start'].value = '2026-09-09';
DOM['nt-days'].value = '14';
const end = S.ntTrialEnd();
ok(end.slice(0, 10) === '2026-09-23', '14 days from Wed 9 Sept ends 23 Sept');
ok(/T12:00:00/.test(end), 'stamped at midday UTC, so it does not expire early west of Greenwich');
ok(typeof end === 'string', 'stored as an ISO string, which is what _standing() parses');
DOM['nt-days'].value = '0';
ok(S.ntTrialEnd() === null, 'zero days means no trial rather than one that ended today');
S.ntSuggest();
ok(/bills from day one/.test(DOM['nt-ends'].textContent), 'and the form says so');
DOM['nt-days'].value = '14';

/* ── 3 · refusals ────────────────────────────────────────────────────── */
console.log('refusals');
function attempt(over) {
  Object.assign(DOM['nt-name'], { value: 'Roam Energy' });
  Object.assign(DOM['nt-domain'], { value: 'roamenergy.co' });
  Object.assign(DOM['nt-slug'], { value: 'roam' });
  Object.assign(DOM['nt-vertical'], { value: 'installer' });
  Object.assign(DOM['nt-logo'], { value: '' });
  Object.assign(DOM['nt-note'], { value: '' });
  DOM['nt-start'].value = '2026-09-09'; DOM['nt-days'].value = '14';
  Object.keys(over || {}).forEach(k => { DOM[k].value = over[k]; });
  WRITES.length = 0;
  S.createTenant();
  return DOM['nt-msg'].textContent;
}
ok(/name/.test(attempt({ 'nt-name': 'R' })), 'a one-letter company name is refused');
ok(/email domain/.test(attempt({ 'nt-domain': 'roamenergy' })), 'a bare word is not a domain');
ok(/reserved/.test(attempt({ 'nt-slug': 'admin' })), 'a reserved host is refused');
ok(WRITES.length === 0, 'nothing was written on any refusal');

/* ── 4 · the documents ───────────────────────────────────────────────── */
console.log('documents');
ORG_EXISTS = false; HOST_TAKEN = false;
attempt({ 'nt-note': 'Focus: DCFC + L2 installation' });
setTimeout(function () {
  ok(WRITES.length === 3, 'three documents: the org, its billing, the public mirror');
  const org = WRITES.find(w => w.path === 'omega_orgs/roamenergy.co');
  const bill = WRITES.find(w => /billing\/current$/.test(w.path));
  const pub = WRITES.find(w => /^tenant_public\//.test(w.path));

  ok(!!org, 'omega_orgs is keyed by the email domain');
  ok(org.data.name === 'Roam Energy', 'name');
  ok(org.data.vertical === 'installer', 'vertical');
  ok(org.data.status === 'active', 'opens active — nobody approves an account they just created');
  ok(org.data.domains[0] === 'roam.clearskyomega.com', 'workspace host');
  ok(org.data.receivesFullBom === false, 'not a distributor unless somebody says so');
  ok(org.data.createdBy === 'tom@clearsky-usa.com', 'who created it is on the record');

  ok(bill.data.tier === 'trial', 'billing tier is trial');
  ok(bill.data.trialEndsAt.slice(0, 10) === '2026-09-23', 'trial ends on the right day');
  ok(bill.data.paymentProvider === 'manual', 'no payment method assumed');

  ok(pub.path === 'tenant_public/roam.clearskyomega.com', 'mirror is keyed by hostname');
  ok(pub.data.orgId === 'roamenergy.co', 'and points back at the org');
  ok(pub.data.tier === 'trial' && pub.data.vertical === 'installer', 'mirror carries what the sign-in page paints from');

  /* 5 · the guard that matters most */
  console.log('overwrite guard');
  ORG_EXISTS = true;
  attempt({});
  setTimeout(function () {
    ok(WRITES.length === 0, 'an existing org is never overwritten');
    ok(/already has a workspace/.test(DOM['nt-msg'].textContent), 'and says which one');
    ORG_EXISTS = false; HOST_TAKEN = true;
    attempt({});
    setTimeout(function () {
      ok(WRITES.length === 0, 'a taken hostname writes nothing');
      ok(/already taken/.test(DOM['nt-msg'].textContent), 'and says so');
      console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
      process.exit(fails ? 1 : 0);
    }, 10);
  }, 10);
}, 10);
