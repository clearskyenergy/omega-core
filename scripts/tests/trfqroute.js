/* /api/rfq.js routing — who actually receives a quote request.
   This is the part with no UI to look at: the fan-out decides who sees which
   slice of somebody's BOM, and getting it wrong either leaks a takeoff to a
   competitor or silently tells a customer there is nobody to ask. */
const path = require('path'), Module = require('module');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

/* ── a Firestore stood up out of plain objects ───────────────────────── */
const WRITES = [];
function makeDb(data) {
  function coll(name, parentPath) {
    const p = (parentPath ? parentPath + '/' : '') + name;
    const api = {
      _p: p,
      doc(id) {
        const dp = p + '/' + (id || 'auto' + WRITES.length);
        return { _p: dp, id: id || 'auto',
                 get: () => Promise.resolve({ exists: dp in data, id: id, data: () => data[dp] }),
                 collection: n => coll(n, dp) };
      },
      where(field, op, val) {
        const rows = Object.keys(data)
          .filter(k => k.indexOf(p + '/') === 0 && k.slice(p.length + 1).indexOf('/') < 0)
          .map(k => ({ id: k.slice(p.length + 1), data: () => data[k], _raw: data[k] }))
          .filter(r => op === 'array-contains'
            ? (r._raw[field] || []).indexOf(val) >= 0
            : r._raw[field] === val);
        const q = { limit: () => q, get: () => Promise.resolve({ empty: !rows.length, docs: rows }) };
        return q;
      },
      get() {
        const rows = Object.keys(data)
          .filter(k => k.indexOf(p + '/') === 0 && k.slice(p.length + 1).indexOf('/') < 0)
          .map(k => ({ id: k.slice(p.length + 1), data: () => data[k] }));
        return Promise.resolve({ docs: rows });
      }
    };
    return api;
  }
  return {
    collection: n => coll(n, ''),
    batch: () => ({ set(ref, d) { WRITES.push({ path: ref._p, data: d }); },
                    update(ref, d) { WRITES.push({ path: ref._p, data: d, update: true }); },
                    commit: () => Promise.resolve() })
  };
}

/* ── stand in for _lib/admin so no credential is needed ──────────────── */
let DB = null;
const fakeAdmin = {
  handler: fn => fn,
  httpError: (s, m) => { const e = new Error(m); e.status = s; return e; },
  authenticate: () => Promise.resolve({ uid: 'u1', email: 'pm@concord.com',
                                        orgId: 'concordenergyusa.com', staff: false }),
  canActInOrg: (c, o) => Promise.resolve(c.orgId === o),
  db: () => DB,
  FieldValue: () => ({ serverTimestamp: () => '<ts>' })
};
const libPath = require.resolve(path.join(__dirname, '..', '..', 'api', '_lib', 'admin.js'));
require.cache[libPath] = { id: libPath, filename: libPath, loaded: true, exports: fakeAdmin };
const rfq = require(path.join(__dirname, '..', '..', 'api', 'rfq.js'));

/* ── the world ───────────────────────────────────────────────────────── */
function world() {
  return {
    'projects/p1': { orgId: 'concordenergyusa.com', name: 'Model Tobacco BESS',
                     state: 'IL', sizeKw: 2508 },
    'omega_orgs/concordenergyusa.com': { name: 'Concord Energy' },
    'omega_orgs/walterswholesale.com': { name: 'Walters Wholesale', receivesFullBom: true, status: 'active' },
    'omega_orgs/cityelectricsupply.com': { name: 'City Electric Supply', receivesFullBom: true, status: 'active' },
    'omega_orgs/fenecon.com': { name: 'FENECON GmbH', brands: ['fenecon'], vertical: 'oem' }
  };
}
function file(body) {
  WRITES.length = 0;
  return rfq({ method: 'POST', headers: {}, body: body });
}
const BESS = { sku: 'FENECON-IND-XXL', manufacturer: 'FENECON', qty: 1, unit: 'ea',
               description: 'BESS assembly (container + racks + PCS)', category: 'Power Equipment' };
const EMT = { sku: '', manufacturer: '', qty: 400, unit: 'LF', description: '2 in. EMT', category: 'Conduit' };

function recips() {
  return WRITES.filter(w => /\/recipients\//.test(w.path))
               .map(w => ({ org: w.path.split('/').pop(), d: w.data }));
}

(async function () {
  /* ── 1 · the Fenecon case the whole thing exists for ──────────────── */
  console.log('a Fenecon battery on the map');
  DB = makeDb(world());
  await file({ projectId: 'p1', bom: [BESS, EMT],
               toOrgIds: ['walterswholesale.com'], zip: '60123', accounts: { 'walterswholesale.com': 'W-88421' } });
  let r = recips();
  ok(r.length === 2, 'two recipients: the distributor picked and the factory that makes the battery');
  const fen = r.find(x => x.org === 'fenecon.com');
  const wal = r.find(x => x.org === 'walterswholesale.com');
  ok(!!fen, 'FENECON is routed by the brand on the line, with no /equipment row anywhere');
  ok(fen.d.scope === 'line-items' && fen.d.lines.length === 1, 'and receives only its own line');
  ok(fen.d.lines[0].sku === 'FENECON-IND-XXL', 'the catalogue key travels with it');
  ok(fen.d.contact === null && fen.d.revealed === false, 'the customer stays anonymous to the factory');
  ok(!!fen.d.distributors && fen.d.distributors[0].orgId === 'walterswholesale.com',
     'and the factory is told which distributor to price through');
  ok(fen.d.distributors[0].name === 'Walters Wholesale', 'by name, not just an orgId');
  ok(wal.d.scope === 'full-bom' && wal.d.lines.length === 2, 'the distributor gets the whole BOM');
  ok(wal.d.customerNumber === 'W-88421', 'with the account number the customer gave');
  ok(wal.d.contact && wal.d.contact.orgName === 'Concord Energy', 'and knows who it is quoting');
  ok(wal.d.distributors == null, 'but is not told who else is bidding');

  /* ── 2 · the customer chooses; it is not a broadcast ──────────────── */
  console.log('choosing recipients');
  DB = makeDb(world());
  await file({ projectId: 'p1', bom: [BESS, EMT], toOrgIds: ['cityelectricsupply.com'], zip: '60123' });
  r = recips();
  ok(!r.find(x => x.org === 'walterswholesale.com'),
     'a distributor not picked is not sent the BOM, flag or no flag');
  ok(!!r.find(x => x.org === 'cityelectricsupply.com'), 'the one picked is');
  ok(r.find(x => x.org === 'fenecon.com').d.distributors[0].orgId === 'cityelectricsupply.com',
     'and the factory is told about that one, not the other');

  /* ── 3 · no distributor picked ────────────────────────────────────── */
  console.log('asked directly');
  DB = makeDb(world());
  await file({ projectId: 'p1', bom: [BESS], toOrgIds: [], zip: '60123' });
  r = recips();
  ok(r.length === 1 && r[0].org === 'fenecon.com', 'with no distributor named, only the factory');
  ok(Array.isArray(r[0].d.distributors) && r[0].d.distributors.length === 0,
     'and it is told there is none, rather than left guessing');

  /* ── 4 · a brand nobody claims ────────────────────────────────────── */
  console.log('an unclaimed brand');
  const w = world(); delete w['omega_orgs/fenecon.com'];
  DB = makeDb(w);
  await file({ projectId: 'p1', bom: [BESS, EMT], toOrgIds: ['walterswholesale.com'], zip: '60123' });
  r = recips();
  ok(r.length === 1 && r[0].org === 'walterswholesale.com',
     'a brand with no tenant behind it routes nowhere rather than to somebody wrong');

  /* ── 5 · nothing routable ─────────────────────────────────────────── */
  console.log('nothing to route');
  DB = makeDb(world());
  const out = await file({ projectId: 'p1', bom: [EMT], toOrgIds: [], zip: '60123' });
  ok(out.rfqId === null && /no routable/.test(out.skipped || ''),
     'a conduit-only BOM with nobody picked writes nothing and says why');
  ok(recips().length === 0, 'and no recipient document is created');

  /* ── 6 · you are never a recipient of your own request ────────────── */
  console.log('self');
  const w2 = world();
  w2['omega_orgs/concordenergyusa.com'].receivesFullBom = true;
  w2['omega_orgs/concordenergyusa.com'].status = 'active';
  DB = makeDb(w2);
  await file({ projectId: 'p1', bom: [BESS, EMT], toOrgIds: ['concordenergyusa.com','walterswholesale.com'], zip: '60123' });
  ok(!recips().find(x => x.org === 'concordenergyusa.com'), 'the customer never receives its own BOM');

  /* ── 7 · not your project ─────────────────────────────────────────── */
  console.log('authorisation');
  const w3 = world();
  w3['projects/p1'].orgId = 'someoneelse.com';
  DB = makeDb(w3);
  let threw = null;
  try { await file({ projectId: 'p1', bom: [BESS], zip: '60123' }); } catch (e) { threw = e; }
  ok(threw && threw.status === 403, 'filing an RFQ on somebody else\'s project is refused');
  ok(recips().length === 0, 'and writes nothing');

  console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
