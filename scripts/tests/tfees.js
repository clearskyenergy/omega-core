/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ClearSky's commission on a financing deal: set per capital partner, applied
   to every offer, stamped by the server, untouchable by the partner.

   Amperage Capital pays 2.5% at NTP and 2.5% at COD (a finders fee, by
   milestone). Budderfly pays 1% of the offer, built onto the price (a
   transaction fee). A partner may owe either, both, or nothing. The number a
   partner sees as they type must be the number ClearSky invoices, so one
   module (omega-fees.js) serves both the browser and /api/offer, and the
   rules refuse a partner any write to pricing on their own offer. */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.005 : tol);

const FEES = require(path.join(ROOT, 'omega-fees.js'));
const AMPERAGE  = { finders: [{ milestone: 'NTP', pct: 2.5 }, { milestone: 'COD', pct: 2.5 }] };
const BUDDERFLY = { transactionPct: 1 };
const BOTH      = { transactionPct: 1, finders: AMPERAGE.finders };

/* ── 1. the fee maths ─────────────────────────────────────────────────── */
console.log('fee schedules');
{
  let p = FEES.price(1000000, AMPERAGE);
  ok(p.mode === 'finders' && p.transactionFee === 0, 'Amperage: a finders fee only, nothing built onto the price');
  ok(p.finders.length === 2 && p.finders[0].amount === 25000 && p.finders[1].milestone === 'COD', 'Amperage: 2.5% at NTP and 2.5% at COD on a $1M offer is $25,000 each');
  ok(p.findersTotal === 50000 && p.dueAtClose === 1000000 && p.total === 1050000, 'Amperage: $1M to the sponsor at close, $1.05M all in');

  p = FEES.price(2000000, BUDDERFLY);
  ok(p.mode === 'transaction' && p.transactionFee === 20000 && p.finders.length === 0, 'Budderfly: 1% of a $2M offer is $20,000, no milestones');
  ok(p.dueAtClose === 2020000 && p.total === 2020000, 'Budderfly: the fee is built onto the price at close');

  p = FEES.price(1000000, BOTH);
  ok(p.mode === 'both' && p.total === 1060000 && p.feesTotal === 60000, 'both kinds together: $10,000 at close plus $50,000 at milestones');

  p = FEES.price(1000000, { waived: true, transactionPct: 5, finders: AMPERAGE.finders });
  ok(p.mode === 'waived' && p.total === 1000000 && p.feesTotal === 0, 'waived wins over any rate on the record');
  ok(FEES.describe({ waived: true }) === 'Fees waived', 'a waiver reads as one');
  ok(FEES.price(500000, {}).waived === true && FEES.price(500000, null).total === 500000, 'no schedule at all prices as a waiver, never as a guess');

  const junk = FEES.normalize({ transactionPct: 'abc', finders: [{ milestone: '', pct: 3 }, { milestone: 'NTP', pct: -2 }, null, { milestone: 'COD', pct: '2.5' }] });
  ok(junk.transactionPct === 0 && junk.finders.length === 1 && junk.finders[0].pct === 2.5, 'garbage rows are dropped, a string percentage is read');
  ok(FEES.normalize({ transactionPct: 250 }).transactionPct === 100, 'a rate is clamped to 100%');
  ok(FEES.price(333.333, BUDDERFLY).transactionFee === 3.33 && FEES.price(333.333, BUDDERFLY).offer === 333.33, 'money is rounded to cents');
  ok(FEES.describe(AMPERAGE) === 'Finders fee 2.5% at NTP, 2.5% at COD', 'the schedule reads as a sentence: ' + FEES.describe(AMPERAGE));
  ok(/Transaction fee 1% of the offer .* Finders fee/.test(FEES.describe(BOTH)), 'both parts are named');
  ok(JSON.stringify(FEES.normalize(FEES.normalize(BOTH))) === JSON.stringify(FEES.normalize(BOTH)), 'normalising twice changes nothing');
  ok(FEES.normalize({ note: 'x'.repeat(400) }).note.length === 300, 'a note is capped');
}

/* ── 2. /api/offer: priced by the server, gated like the rules ────────── */
console.log('\n/api/offer');
let AUTH, DOCS, DEGRADED = false;
function fakeDb() {
  const node = p => ({
    id: p.split('/').pop(),
    get: () => Promise.resolve({ exists: !!DOCS[p], id: p.split('/').pop(), data: () => DOCS[p] }),
    set: (d, o) => { DOCS[p] = (o && o.merge) ? Object.assign({}, DOCS[p] || {}, d) : d; return Promise.resolve(); },
    update: d => { DOCS[p] = Object.assign({}, DOCS[p] || {}, d); return Promise.resolve(); },
    collection: n => ({ doc: id => node(p + '/' + n + '/' + id) })
  });
  return { collection: n => ({ doc: id => node(n + '/' + id) }) };
}
const fakeAdmin = {
  handler: fn => fn,
  httpError: (s, m) => { const e = new Error(m); e.status = s; return e; },
  authenticate: req => AUTH(req),
  isDegraded: () => DEGRADED,
  db: fakeDb,
  FieldValue: () => ({ serverTimestamp: () => 'TS' }),
  init: () => ({ auth: () => fakeAuthSdk }),
  admin: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
  billingOf: () => Promise.resolve({ tier: 'partner' })
};
let USERS = {};
const fakeAuthSdk = {
  getUserByEmail: e => USERS[e] ? Promise.resolve(USERS[e]) : Promise.reject(Object.assign(new Error('nf'), { code: 'auth/user-not-found' })),
  createUser: r => { USERS[r.email] = { uid: 'uid_' + Object.keys(USERS).length, email: r.email }; return Promise.resolve(USERS[r.email]); },
  generatePasswordResetLink: e => Promise.resolve('https://reset.example/' + encodeURIComponent(e))
};
const libPath = require.resolve(path.join(ROOT, 'api', '_lib', 'admin.js'));
require.cache[libPath] = { id: libPath, filename: libPath, loaded: true, exports: fakeAdmin };
const offerApi = require(path.join(ROOT, 'api', 'offer.js'));
const provisionApi = require(path.join(ROOT, 'api', 'provision-partner.js'));

const NOW = Date.now(), DAY = 86400000;
function reset() {
  DEGRADED = false;
  AUTH = () => Promise.resolve({ uid: 'u_bud', email: 'deals@budderfly.com', orgId: 'budderfly.com', staff: false });
  DOCS = {
    'fin_profiles/u_bud': { role: 'partner', approved: true, suspended: false, orgKey: 'budderfly', orgId: 'budderfly.com', name: 'Bud Analyst', org: 'Budderfly', email: 'deals@budderfly.com' },
    'fin_profiles/u_dev': { role: 'developer', approved: true, orgKey: 'nextnrg', name: 'Dev' },
    'fin_profiles/u_tom': { role: 'admin', approved: true, orgKey: 'clearsky', email: 'tom@clearsky-usa.com' },
    'fin_orgs/budderfly': { name: 'Budderfly', orgId: 'budderfly.com', fees: BUDDERFLY },
    'fin_projects/open1': { name: 'Open deal', status: 'open', developerUid: 'u_dev' },
    'fin_projects/held1': { name: 'Held deal', status: 'exclusive', firstLookUids: ['u_bud'], firstLookUntil: NOW + 7 * DAY },
    'fin_projects/stale1': { name: 'Stale hold', status: 'exclusive', firstLookUids: ['u_bud'], firstLookUntil: NOW - DAY },
    'fin_projects/room1': { name: 'Room deal', status: 'review', room: { forOrg: 'Budderfly', forOrgId: 'budderfly.com', state: 'delivered' } },
    'fin_projects/roomstale': { name: 'Room, window closed', status: 'exclusive', firstLookUids: ['u_bud'], firstLookUntil: NOW - DAY, room: { forOrgId: 'budderfly.com', state: 'delivered' } },
    'fin_projects/roomopen': { name: 'Room, then released', status: 'open', room: { forOrgId: 'budderfly.com', state: 'delivered' } },
    'fin_projects/won1': { name: 'Awarded', status: 'awarded', awardedTo: 'u_other' }
  };
}
const call = (body, extra) => Promise.resolve().then(() => offerApi(Object.assign({ method: 'POST', headers: {}, body }, extra || {})));
function refused(body, code, msg, extra) {
  return call(body, extra).then(() => ok(false, msg + ' (was allowed)'),
    e => ok(e.status === code, msg + (e.status === code ? '' : ' (got ' + e.status + ': ' + e.message + ')')));
}

reset();
Promise.resolve()
  .then(() => { AUTH = () => Promise.resolve({ uid: 'nobody', email: 'x@y.com', staff: false }); return refused({ dealId: 'open1', amount: 1000000 }, 403, 'a stranger with no financing profile is refused'); })
  .then(() => { reset(); AUTH = () => Promise.resolve({ uid: 'u_dev', email: 'd@nextnrg.com', staff: false }); return refused({ dealId: 'open1', amount: 1 }, 403, 'a sponsor cannot make an offer'); })
  .then(() => { reset(); DOCS['fin_profiles/u_bud'].approved = false; return refused({ dealId: 'open1', amount: 1 }, 403, 'an unapproved partner is refused'); })
  .then(() => { reset(); DOCS['fin_profiles/u_bud'].suspended = true; return refused({ dealId: 'open1', amount: 1 }, 403, 'a suspended partner is refused'); })
  .then(() => { reset(); return refused({ dealId: 'won1', amount: 1 }, 409, 'an awarded deal takes no offers'); })
  .then(() => { reset(); return refused({ dealId: 'open1', amount: 1000000 }, 403, 'an open deal the firm has not unlocked is refused, as the rules refuse it'); })
  .then(() => { reset(); return refused({ dealId: 'stale1', amount: 1000000 }, 409, 'a first-look hold whose window closed is refused'); })
  .then(() => { reset(); return refused({ dealId: 'roomstale', amount: 1000000 }, 409, 'a room delivery whose window closed is refused too — the room does not outlive the clock'); })
  .then(() => { reset(); return refused({ dealId: 'roomopen', amount: 1000000 }, 403, 'a room deal released to the marketplace is unlocked like any other'); })
  .then(() => { reset(); return refused({ dealId: 'nope', amount: 1 }, 404, 'a missing deal is a 404'); })
  .then(() => { reset(); return refused({ dealId: 'held1' }, 400, 'no amount, no offer'); })
  .then(() => { reset(); return refused({ dealId: 'held1', amount: 1 }, 405, 'GET is refused', { method: 'GET' }); })
  .then(() => {
    reset();
    DOCS['fin_orgs/budderfly/unlocks/open1'] = { uid: 'u_bud' };
    return call({ dealId: 'open1', amount: 2000000, instrument: 'Senior debt', rate: 7.25, termYears: 18,
                  conditions: ['Site control'], docs: [{ label: 'Term sheet', url: 'https://x.example/ts.pdf' }, { label: 'bad', url: 'javascript:alert(1)' }],
                  pricing: { total: 1 }, pricedBy: 'me' })
      .then(r => {
        const o = DOCS['fin_projects/open1/offers/u_bud'];
        ok(r.ok && r.via === 'open' && !!o, 'an unlocked open deal takes the offer');
        ok(o.pricing.total === 2020000 && o.pricing.transactionFee === 20000, 'Budderfly: $2M offer priced at $2,020,000 with the 1% built on');
        ok(o.pricedBy === 'server' && o.pricingPending === false && o.feesSet === true, 'the price is the server\'s, and marked as such');
        ok(o.pricing.total !== 1, 'a price sent by the client is ignored');
        ok(o.status === 'submitted' && o.partnerUid === 'u_bud' && o.uid === 'u_bud' && o.dealId === 'open1' && !!o.createdAt, 'the offer carries what the portal\'s group query needs');
        ok(o.docs.length === 1 && o.docs[0].url.indexOf('https://') === 0, 'only https links survive');
        ok(o.rate === 7.25 && o.termYears === 18 && o.instrument === 'Senior debt', 'the terms ride along');
        ok(JSON.stringify(o.feesApplied) === JSON.stringify(FEES.normalize(BUDDERFLY)), 'the schedule it was priced under is stored with it');
      });
  })
  .then(() => {
    reset();
    DOCS['fin_orgs/budderfly'].fees = AMPERAGE;
    return call({ dealId: 'held1', amount: 1000000 }).then(r => {
      const o = DOCS['fin_projects/held1/offers/u_bud'];
      ok(r.via === 'first-look' && o.pricing.findersTotal === 50000 && o.pricing.total === 1050000 && o.pricing.dueAtClose === 1000000,
         'a live first-look hold takes the offer with no unlock; Amperage terms: $1M at close, $50,000 at NTP and COD');
    });
  })
  .then(() => {
    reset();
    return call({ dealId: 'room1', amount: 750000 }).then(r => {
      ok(r.via === 'room' && DOCS['fin_projects/room1/offers/u_bud'].pricing.total === 757500,
         'a deal delivered into the firm\'s room takes an offer, whatever its marketplace status');
    });
  })
  .then(() => {
    reset(); DOCS['fin_profiles/u_bud'].orgId = 'somebody-else.com';
    return refused({ dealId: 'room1', amount: 1 }, 409, 'a room addressed to another firm is not this firm\'s');
  })
  .then(() => {
    reset();
    return call({ dealId: 'held1', amount: 1000000, dryRun: true }).then(r => {
      ok(r.dryRun === true && r.pricing.total === 1010000 && !DOCS['fin_projects/held1/offers/u_bud'], 'a dry run prices without writing');
      ok(r.describe === 'Transaction fee 1% of the offer', 'and says what schedule it used');
    });
  })
  .then(() => {
    reset(); delete DOCS['fin_orgs/budderfly'].fees;
    return call({ dealId: 'held1', amount: 1000000 }).then(r => {
      ok(r.feesSet === false && r.pricing.waived === true && r.pricing.total === 1000000, 'no schedule on the org: priced as a waiver and flagged feesSet:false, so the administrator sees it');
    });
  })
  .then(() => {
    reset(); DOCS['fin_projects/held1/offers/u_bud'] = { amount: 1000000, partnerUid: 'u_bud', pricingPending: true, status: 'submitted' };
    return refused({ dealId: 'held1', partnerUid: 'u_bud', reprice: true }, 403, 'a partner cannot re-price their own offer');
  })
  .then(() => {
    reset(); DOCS['fin_projects/held1/offers/u_bud'] = { amount: 1000000, partnerUid: 'u_bud', pricingPending: true, status: 'submitted' };
    AUTH = () => Promise.resolve({ uid: 'u_tom', email: 'tom@clearsky-usa.com', staff: true });
    return call({ dealId: 'held1', partnerUid: 'u_bud', reprice: true }).then(r => {
      const o = DOCS['fin_projects/held1/offers/u_bud'];
      ok(r.repriced && o.pricing.total === 1010000 && o.pricingPending === false && o.pricedBy === 'tom@clearsky-usa.com', 'ClearSky prices an offer that was filed while the server was down');
      ok(o.amount === 1000000 && o.status === 'submitted', 'and touches nothing else on it');
    });
  })
  .then(() => {
    reset(); AUTH = () => Promise.resolve({ uid: 'u_tom', email: 'tom@clearsky-usa.com', staff: true });
    return refused({ dealId: 'held1', partnerUid: 'u_bud', reprice: true }, 404, 're-pricing an offer that does not exist is a 404');
  })
  .then(() => { reset(); DEGRADED = true; return refused({ dealId: 'held1', amount: 1 }, 503, 'no service account: 503, so the portal files it unpriced instead'); })

  /* ── 3. provisioning sets the fees on the org ─────────────────────────── */
  .then(() => {
    console.log('\n/api/provision-partner');
    reset(); USERS = {};
    AUTH = () => Promise.resolve({ uid: 'u_tom', email: 'tom@clearsky-usa.com', staff: true });
    const body = { orgId: 'amperagecap.com', name: 'Amperage Capital', orgKey: 'amperage-capital', tier: 'partner',
                   fees: { finders: [{ milestone: 'NTP', pct: '2.5' }, { milestone: 'COD', pct: 2.5 }], transactionPct: 0 },
                   people: [{ email: 'deals@amperagecap.com', name: 'Deals', role: 'partner' }] };
    return provisionApi({ method: 'POST', headers: {}, body }).then(() => {
      const org = DOCS['fin_orgs/amperage-capital'];
      ok(!!org && JSON.stringify(org.fees) === JSON.stringify(FEES.normalize(AMPERAGE)), 'standing up Amperage writes their 2.5% NTP / 2.5% COD schedule, normalised');
      ok(org.feesSetBy === 'tom@clearsky-usa.com' && typeof org.feesSetAt === 'number', 'and records who set it');
      return provisionApi({ method: 'POST', headers: {}, body: Object.assign({}, body, { orgKey: 'nofees', fees: undefined }) });
    }).then(() => {
      ok(!('fees' in DOCS['fin_orgs/nofees']), 'a partner set up without fees has no schedule, not a waived one');
    });
  })

  /* ── 4. the rules and the wiring ─────────────────────────────────────── */
  .then(() => {
    console.log('\nrules and wiring');
    const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    ok(RULES.indexOf("&& request.resource.data.get('fees', null) == resource.data.get('fees', null)") > 0, 'fin_orgs: a partner spending an unlock cannot move their own fees');
    ok(RULES.indexOf("&& request.resource.data.get('fees', null) == null\n                        && request.resource.data.used == 1") > 0, 'fin_orgs: a partner creating their own record cannot give themselves fees');
    ok(RULES.indexOf('function noPricingKeys()') > 0 && RULES.indexOf('&& noPricingKeys()\n') > 0, 'offers: a partner cannot create an offer carrying a price');
    ok((RULES.match(/&& pricingUntouched\(\)/g) || []).length === 2, 'offers: neither the partner nor the sponsor can move a price on update');

    const HTML = fs.readFileSync(path.join(ROOT, 'portals', 'finance', 'index.html'), 'utf8');
    ok(HTML.indexOf('<script src="/omega-fees.js"></script>') > 0, 'the portal loads the same fee module the server uses');
    ok(HTML.indexOf("partner: [['room','Deal room'],") > 0 && HTML.indexOf('function partnerRoom()') > 0, 'a capital partner lands in their deal room');
    ok(HTML.indexOf("await apiPost('/api/offer', Object.assign({}, body, {dealId: d.docId}))") > 0, 'an offer goes to the server to be priced');
    ok(HTML.indexOf('Object.assign({}, body, {pricingPending: true})') > 0 && HTML.indexOf('err.status === 503 || err.status === 404 || err.status === 0') > 0, 'and is filed unpriced, visibly, only when the server is not there');
    ok(HTML.indexOf('id="apOrg"') > 0 && HTML.indexOf("approveDeal(val, mode, days, org, forever)") > 0, 'the approve dialog routes to any partner, for a window or until released');
    ok(HTML.indexOf("case 'push-partner': approveModal(val, {routeOnly: true}); break;") > 0, 'an open deal can be moved into a partner\'s room');
    ok(HTML.indexOf('gateAll:         true') > 0 && HTML.indexOf('(INTAKE.gateAll || (INTAKE.gateTechs || []).indexOf(t) !== -1)') > 0, 'every filed deal stops for review by default');
    ok(HTML.indexOf('data-act="edit-fees"') > 0 && HTML.indexOf('function feesModal(orgKey)') > 0 && HTML.indexOf('async function saveFees(orgKey)') > 0, 'administrators set a partner\'s fees under Organizations');
    ok(HTML.indexOf('async function ensurePartnerRoom(p)') > 0 && HTML.indexOf('await ensurePartnerRoom(p)') > 0, 'approving a partner account creates their deal room');
    ok(HTML.indexOf("'room.forOrgId': orgIdOf(orgKey) || null") > 0, 'routing a deal addresses the room the partner\'s query reads');
    ok(HTML.indexOf('function offerPricingHtml(o, d)') > 0 && HTML.indexOf('${offerPricingHtml(o, d)}') > 0, 'the offer card shows the fees to the partner and to ClearSky');

    const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const hostRoutes = h => VERCEL.rewrites.filter(r => (r.has || []).some(x => x.type === 'host' && x.value === h));
    const hostRedirects = h => (VERCEL.redirects || []).filter(r => (r.has || []).some(x => x.type === 'host' && x.value === h));
    ['finance.csebuilders.com', 'financing.csebuilders.com'].forEach(h => {
      const rs = hostRoutes(h);
      /* Vercel serves the filesystem before rewrites, so the root index.html
         would win a rewrite of "/": the front door is a redirect to /finance,
         which then rewrites to the portal (b4fbeb1). */
      ok(hostRedirects(h).some(r => r.source === '/' && r.destination === '/finance'), h + ' front door redirects into the portal');
      ok(VERCEL.rewrites.some(r => r.source === '/finance' && r.destination === '/portals/finance' && (!r.has || rs.indexOf(r) >= 0)), h + ' serves the portal from omega-core');
      ok(rs.some(r => r.source === '/dealroom' && r.destination === '/portals/finance/dealroom'), h + ' serves the deal rooms page');
    });
    const IGN = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8');
    ok(!/^\*\.js\s*$/m.test(IGN) && IGN.indexOf('omega-fees') < 0, 'omega-fees.js deploys with the site');
    ok(fs.existsSync(path.join(ROOT, 'omega-logo.png')), 'the deal-room page\'s logo resolves at the root on the finance host');
  })
  .then(() => {
    console.log(fails ? '\nFAILURES: ' + fails : '\nALL PASS');
    process.exit(fails ? 1 : 0);
  })
  .catch(e => { console.error('test crashed:', e); process.exit(1); });
