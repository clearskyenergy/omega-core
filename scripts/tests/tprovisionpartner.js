/* /api/provision-partner — standing up a capital partner, offline.

   This is the most privileged endpoint in the codebase: it creates sign-in
   accounts and marks profiles approved, which is how a person gets in at all.
   So most of what follows is about who may call it and what it refuses.

   The rule it exists to enforce is that no password crosses the boundary.
   Accounts are created without one and a single-use reset link comes back
   instead. A password somebody else picks has to be communicated, which puts
   it in a chat log or an email; a link the holder uses once does not. A
   caller that sends one is refused rather than having it quietly dropped —
   silently ignoring a password the caller believed was set is how somebody
   ends up locked out and unable to say why. */
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

let AUTH = () => Promise.resolve({ uid: 'u0', email: 'tom@clearsky-usa.com',
                                   orgId: 'clearsky-usa.com', staff: true });
let DOCS = {}, USERS = {}, RESET_OK = true;
function fakeDb() {
  const col = base => ({
    doc: id => {
      const p = base + '/' + id;
      return { get: () => Promise.resolve({ exists: !!DOCS[p], data: () => DOCS[p] }),
               set: (d) => { DOCS[p] = Object.assign({}, DOCS[p], d); return Promise.resolve(); },
               collection: n => col(p + '/' + n) };
    }
  });
  return { collection: n => col(n) };
}
const fakeAuthSdk = {
  getUserByEmail: e => USERS[e]
    ? Promise.resolve(USERS[e])
    : Promise.reject(Object.assign(new Error('nf'), { code: 'auth/user-not-found' })),
  createUser: r => { USERS[r.email] = { uid: 'uid_' + Object.keys(USERS).length, email: r.email };
                     return Promise.resolve(USERS[r.email]); },
  generatePasswordResetLink: e => RESET_OK
    ? Promise.resolve('https://reset.example/' + encodeURIComponent(e))
    : Promise.reject(new Error('no link'))
};
const fakeAdmin = {
  handler: fn => fn,
  httpError: (s, m) => { const e = new Error(m); e.status = s; return e; },
  authenticate: req => AUTH(req),
  db: fakeDb,
  init: () => ({ auth: () => fakeAuthSdk }),
  admin: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
  billingOf: () => Promise.resolve({ tier: 'partner' })
};
const libPath = require.resolve(path.join(__dirname, '..', '..', 'api', '_lib', 'admin.js'));
require.cache[libPath] = { id: libPath, filename: libPath, loaded: true, exports: fakeAdmin };
const api = require(path.join(__dirname, '..', '..', 'api', 'provision-partner.js'));

const HELIOS = {
  orgId: 'heliosnrgy.com', name: 'Helios Energy', orgKey: 'helios',
  kind: 'investor', tier: 'partner', requiredTools: ['financing'],
  people: [
    { email: 'tye.dawson@heliosnrgy.com',    name: 'Tye Dawson',    role: 'partner' },
    { email: 'jack.degiulio@heliosnrgy.com', name: 'Jack DeGiulio', role: 'partner' },
    { email: 'admin@heliosnrgy.com',         name: 'Helios Admin',  role: 'admin'   }
  ]
};
function call(body, method) {
  DOCS = DOCS || {};
  try { return Promise.resolve(api({ method: method || 'POST', headers: {}, body: body })); }
  catch (e) { return Promise.reject(e); }
}
function reset() { DOCS = {}; USERS = {}; RESET_OK = true;
  AUTH = () => Promise.resolve({ uid: 'u0', email: 'tom@clearsky-usa.com',
                                 orgId: 'clearsky-usa.com', staff: true }); }

function refused(body, code, msg, method) {
  return call(body, method).then(
    () => ok(false, msg + ' (was allowed)'),
    e => ok(e.status === code, msg + (e.status === code ? '' : ' (got ' + e.status + ': ' + e.message + ')')));
}

console.log('no password crosses this boundary');
reset();
Promise.resolve()
  .then(() => refused(Object.assign({ password: 'test1234' }, HELIOS), 400,
                      'a password in the body is refused, not ignored'))
  .then(() => refused(Object.assign({ initialPassword: 'test1234' }, HELIOS), 400,
                      'and so is initialPassword'))

  .then(() => { console.log('\nwho may call it'); reset();
    AUTH = () => Promise.resolve({ uid: 'u9', email: 'pm@heliosnrgy.com',
                                   orgId: 'heliosnrgy.com', staff: false });
    return refused(HELIOS, 403, 'a non-staff caller is refused, even for their own org'); })
  .then(() => { AUTH = () => Promise.reject(fakeAdmin.httpError(401, 'invalid token'));
    return refused(HELIOS, 401, 'an unauthenticated caller is refused'); })
  .then(() => { reset(); return refused(HELIOS, 405, 'GET is refused', 'GET'); })

  .then(() => { console.log('\nwhat it validates'); reset();
    return refused(Object.assign({}, HELIOS, { orgId: 'not-a-domain' }), 400, 'orgId must be a domain'); })
  .then(() => refused(Object.assign({}, HELIOS, { orgKey: 'Helios Energy!' }), 400,
                      'orgKey must be a safe key — it is written into deal documents'))
  .then(() => refused(Object.assign({}, HELIOS, { people: [] }), 400, 'at least one person is required'))
  .then(() => refused(Object.assign({}, HELIOS, {
      people: [{ email: 'someone@gmail.com', name: 'X', role: 'partner' }] }), 400,
      'an account on another domain is refused — that would be a seat for an outsider'))
  .then(() => refused(Object.assign({}, HELIOS, {
      people: [{ email: 'a@heliosnrgy.com', name: 'X', role: 'superuser' }] }), 400,
      'an unknown role is refused'))

  .then(() => { console.log('\nthe happy path'); reset(); return call(HELIOS); })
  .then(r => {
    ok(r.accounts.length === 3, 'three accounts came back');
    ok(r.accounts.every(a => a.status === 'created'), 'all three were created');
    ok(r.accounts.every(a => /^https:\/\/reset\./.test(a.resetLink || '')),
       'each carries its own single-use reset link');
    ok(!JSON.stringify(r).match(/password/i), 'and no password appears anywhere in the response');
    ok(DOCS['fin_orgs/helios'] && DOCS['fin_orgs/helios'].active === true, 'fin_orgs written');
    ok(DOCS['omega_orgs/heliosnrgy.com'].financeOrgKey === 'helios',
       'the tenant carries financeOrgKey, which is what the dashboard panels resolve');
    ok((DOCS['omega_orgs/heliosnrgy.com'].requiredTools || []).indexOf('financing') >= 0,
       'the financing portal is pinned as a required tool');
    ok(DOCS['omega_orgs/heliosnrgy.com/billing/current'].tier === 'partner', 'billing written');
    ok(DOCS['omega_partner_orgs/heliosnrgy.com'].kind === 'investor',
       'the partner org is an investor, so they appear in the Send to deal room chooser');
    ok(DOCS['omega_partner_orgs/heliosnrgy.com'].jd.active === true, 'and are an active JD partner');
    const profiles = Object.keys(DOCS).filter(k => /^fin_profiles\//.test(k));
    ok(profiles.length === 3, 'three finance profiles written');
    ok(profiles.every(k => DOCS[k].approved === true),
       'pre-approved — a self-signed-up profile sees nothing until somebody approves it');
    ok(profiles.every(k => DOCS[k].orgKey === 'helios'), 'all scoped to the finance orgKey');
    ok(DOCS['fin_profiles/uid_2'].role === 'admin', 'the admin account keeps its admin role');
  })

  .then(() => { console.log('\nre-running is safe'); return call(HELIOS); })
  .then(r => {
    ok(r.accounts.every(a => a.status === 'existing'),
       'a second run reports the accounts as existing rather than failing');
    ok(r.accounts.every(a => a.resetLink), 'and still returns a link — usually why it is re-run');
  })
  .then(() => { console.log('\nwhen a reset link cannot be made'); reset(); RESET_OK = false;
    return call(HELIOS); })
  .then(r => {
    ok(r.accounts.length === 3, 'the accounts are still created');
    ok(r.accounts.every(a => a.resetLink === null && /Forgot password/.test(a.note || '')),
       'and each says how to set a password instead of failing the whole run');
  })
  .then(() => { console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
                process.exit(fails ? 1 : 0); })
  .catch(e => { console.log('\nTHREW: ' + e.message); process.exit(1); });
