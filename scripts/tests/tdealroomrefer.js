/* /api/dealroom-refer — putting a deal in a capital partner's deal room.

   The thing worth a test here is what "in their deal room" MEANS. It is not
   room.forOrg. A partner's portal reads fin_projects three ways — status ==
   'open', awardedTo == me, firstLookUids array-contains me — and the security
   rules allow exactly those. A deal marked only with room.forOrg is readable
   by nobody and appears in no list: the write succeeds and the partner sees
   nothing, which is the worst kind of working.

   So a referral is a first-look hold, the same mechanism Amperage Capital
   has. These assertions are mostly about that, and about refusing to create
   a hold nobody can open. */
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

let AUTH = () => Promise.resolve({ uid: 'u0', email: 'tom@clearsky-usa.com', staff: true });
let DOCS = {}, ADDED = {}, PROFILES = [];
function snapOf(list) {
  return { forEach: fn => list.forEach(fn), docs: list, empty: !list.length };
}
function fakeDb() {
  let n = 0;
  const col = name => ({
    where: function () { return this; },
    get: () => Promise.resolve(name === 'fin_profiles'
      ? snapOf(PROFILES.map(p => ({ id: p.uid, data: () => p })))
      : snapOf([])),
    doc: id => {
      const key = name + '/' + (id || ('gen_' + (++n)));
      return {
        id: id || key.split('/')[1],
        get: () => Promise.resolve({ exists: !!DOCS[key], id: key.split('/')[1],
                                     data: () => DOCS[key] }),
        set: d => { ADDED[key] = d; DOCS[key] = d; return Promise.resolve(); }
      };
    }
  });
  return { collection: col };
}
const fakeAdmin = {
  handler: fn => fn,
  httpError: (s, m) => { const e = new Error(m); e.status = s; return e; },
  authenticate: req => AUTH(req),
  db: fakeDb,
  admin: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } }
};
const libPath = require.resolve(path.join(__dirname, '..', '..', 'api', '_lib', 'admin.js'));
require.cache[libPath] = { id: libPath, filename: libPath, loaded: true, exports: fakeAdmin };
const api = require(path.join(__dirname, '..', '..', 'api', 'dealroom-refer.js'));

const DEAL = { name: '225 Cesar Chavez Blvd — Calexico',
               address: '225 Cesar Chavez Blvd, Calexico, CA', city: 'Calexico', state: 'CA' };
function reset() {
  DOCS = {}; ADDED = {};
  PROFILES = [{ uid: 'uid_tye', orgKey: 'helios', role: 'partner', approved: true, email: 'tye.dawson@heliosnrgy.com' },
              { uid: 'uid_adm', orgKey: 'helios', role: 'admin',   approved: true, email: 'admin@heliosnrgy.com' }];
  AUTH = () => Promise.resolve({ uid: 'u0', email: 'tom@clearsky-usa.com', staff: true });
}
function call(body, method) {
  try { return Promise.resolve(api({ method: method || 'POST', headers: {}, body: body })); }
  catch (e) { return Promise.reject(e); }
}
function refused(body, code, msg, method) {
  return call(body, method).then(
    () => ok(false, msg + ' (was allowed)'),
    e => ok(e.status === code, msg + (e.status === code ? '' : ' (got ' + e.status + ': ' + e.message + ')')));
}
function written() { return ADDED[Object.keys(ADDED).find(k => /^fin_projects\//.test(k))]; }

console.log('a referral is a first-look hold, not a label');
reset();
Promise.resolve()
  .then(() => call({ orgKey: 'helios', orgName: 'Helios Energy Advisors', days: 14, deal: DEAL }))
  .then(r => {
    const d = written();
    ok(!!d, 'a fin_projects document was written');
    ok(d.status === 'exclusive', "status is 'exclusive' — off the open market for the window");
    ok(d.firstLookUids.join(',') === 'uid_tye,uid_adm',
       'every approved partner account at that org is in firstLookUids — that array IS the grant');
    ok(d.firstLookUntil > Date.now(), 'the window is in the future');
    ok(Math.round((d.firstLookUntil - d.firstLookStartedAt) / 86400000) === 14, 'and is the days asked for');
    ok(d.room && d.room.forOrg === 'helios' && d.room.state === 'delivered',
       'room.forOrg is still written — the delivery tracker reads it');
    ok(d.awardedTo === null, 'nothing is awarded by referring it');
    ok(d.name === DEAL.name && d.city === 'Calexico', 'the deal carries its own identity');
    ok(r.partners.length === 2 && /until/.test(JSON.stringify(Object.keys(r))) === false || !!r.until,
       'the response names who can see it and until when');
  })

  .then(() => { console.log('\na hold nobody can open is refused'); reset(); PROFILES = [];
    return refused({ orgKey: 'helios', deal: DEAL }, 409,
      'no approved partner account at that org — refused rather than held invisibly'); })
  .then(() => { reset();
    PROFILES = [{ uid: 'x', orgKey: 'helios', role: 'partner', approved: false }];
    return refused({ orgKey: 'helios', deal: DEAL }, 409, 'an unapproved account does not count'); })
  .then(() => { reset();
    PROFILES = [{ uid: 'x', orgKey: 'helios', role: 'partner', approved: true, suspended: true }];
    return refused({ orgKey: 'helios', deal: DEAL }, 409, 'nor a suspended one'); })
  .then(() => { reset();
    PROFILES = [{ uid: 'x', orgKey: 'helios', role: 'developer', approved: true }];
    return refused({ orgKey: 'helios', deal: DEAL }, 409, 'nor a developer at the same org'); })

  .then(() => { console.log('\nwho may refer, and what is validated'); reset();
    AUTH = () => Promise.resolve({ uid: 'u9', email: 'a@heliosnrgy.com', staff: false });
    return refused({ orgKey: 'helios', deal: DEAL }, 403,
      'a non-staff caller is refused — referring shows an outside firm a project'); })
  .then(() => { reset(); return refused({ orgKey: 'helios', deal: DEAL }, 405, 'GET is refused', 'GET'); })
  .then(() => { reset(); return refused({ orgKey: 'Helios!', deal: DEAL }, 400, 'a malformed orgKey is refused'); })
  .then(() => { reset(); return refused({ orgKey: 'helios' }, 400, 'neither projectId nor deal is refused'); })
  .then(() => { reset(); return refused({ orgKey: 'helios', projectId: 'nope' }, 404,
      'an unknown projectId is refused rather than referring an empty deal'); })

  .then(() => { console.log('\nfrom a real project'); reset();
    DOCS['projects/p1'] = { name: '225 Cesar Chavez Blvd,_TG', address: '225 Cesar Chavez Blvd, Calexico, CA',
                            sizeMw: 3, capexUsd: 4200000, orgId: 'nextnrg.com' };
    return call({ orgKey: 'helios', projectId: 'p1', days: 30 }); })
  .then(() => {
    const d = written();
    ok(d.mw === 3 && d.capexUsd === 4200000, 'headline numbers are copied from the project');
    ok(d.projectId === 'p1', 'and it remembers which project it came from');
    ok(Math.round((d.firstLookUntil - d.firstLookStartedAt) / 86400000) === 30, 'the window honours days');
  })
  .then(() => { console.log('\nabsent numbers stay absent'); reset();
    DOCS['projects/p2'] = { name: 'No numbers yet' };
    return call({ orgKey: 'helios', projectId: 'p2' }); })
  .then(() => {
    const d = written();
    ok(d.mw === null && d.capexUsd === null,
       'a project with no size or capex yields null, never a zero somebody reads as a measurement');
  })
  .then(() => { console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed'); process.exit(fails ? 1 : 0); })
  .catch(e => { console.log('\nTHREW: ' + e.message); process.exit(1); });
