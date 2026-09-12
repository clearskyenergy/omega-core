/* /api/invest and /api/invest-webhook against an in-memory Firestore.
   The money path — pledge → paid → counters → refund — is the part of this
   surface that must not be trusted because it renders, so it is driven here
   end to end with the real handler code and stubbed infrastructure:
   _lib/admin (auth + db), _lib/mail (never sends), stripe (never charges).
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var path = require('path');
var Module = require('module');

var fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
function near(a, b, tol) { return Math.abs(Number(a) - Number(b)) <= (tol || 1e-6); }

/* ── an in-memory Firestore: enough of the Admin SDK for these handlers ── */
var STORE = {};
var seq = 0;
function genId() { return 'gen' + (++seq); }
function TS(ms) { return { toMillis: function () { return ms; }, toDate: function () { return new Date(ms); }, __ts: ms }; }
var FieldValue = { serverTimestamp: function () { return { __sentinel: 'ts' }; }, increment: function (n) { return { __sentinel: 'inc', n: n }; } };
function resolveSentinels(existing, data) {
  var out = {};
  Object.keys(data).forEach(function (k) {
    var v = data[k];
    if (v && typeof v === 'object' && v.__sentinel === 'ts') out[k] = TS(Date.now());
    else if (v && typeof v === 'object' && v.__sentinel === 'inc') out[k] = (Number(existing && existing[k]) || 0) + v.n;
    else out[k] = v;
  });
  return out;
}
function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o, function (k, v) { return v && v.__ts ? { __tsjson: v.__ts } : v; }), function (k, v) { return v && v.__tsjson ? TS(v.__tsjson) : v; }); }
function snapOf(p) { var d = STORE[p]; return { id: p.split('/').pop(), exists: !!d, data: function () { return clone(d); }, ref: ref(p) }; }
function ref(p) {
  return {
    id: p.split('/').pop(), path: p,
    get: function () { return Promise.resolve(snapOf(p)); },
    set: function (data, opts) { writeDoc(p, data, opts && opts.merge); return Promise.resolve(); },
    delete: function () { delete STORE[p]; return Promise.resolve(); },
    collection: function (c) { return coll(p + '/' + c); }
  };
}
function writeDoc(p, data, merge) {
  var cur = STORE[p];
  var resolved = resolveSentinels(cur, data);
  STORE[p] = merge && cur ? Object.assign({}, cur, resolved) : resolved;
}
function coll(p) {
  return {
    path: p,
    doc: function (id) { return ref(p + '/' + (id || genId())); },
    where: function (f, op, v) { return query(p, [[f, op, v]], null); },
    get: function () { return query(p, [], null).get(); }
  };
}
function query(p, filters, lim) {
  return {
    where: function (f, op, v) { return query(p, filters.concat([[f, op, v]]), lim); },
    limit: function (n) { return query(p, filters, n); },
    get: function () {
      var docs = Object.keys(STORE).filter(function (k) { return k.indexOf(p + '/') === 0 && k.slice(p.length + 1).indexOf('/') < 0; })
        .map(snapOf).filter(function (s) {
          var d = s.data();
          return filters.every(function (f) { var val = d[f[0]]; if (f[1] === '==') return val === f[2]; if (f[1] === 'in') return f[2].indexOf(val) >= 0; throw new Error('op ' + f[1]); });
        });
      if (lim) docs = docs.slice(0, lim);
      return Promise.resolve({ empty: !docs.length, size: docs.length, docs: docs, forEach: function (fn) { docs.forEach(fn); } });
    }
  };
}
var DB = {
  collection: coll,
  batch: function () { var ops = []; var b = { set: function (r, d, o) { ops.push(function () { return r.set(d, o); }); return b; }, delete: function (r) { ops.push(function () { return r.delete(); }); return b; }, commit: function () { return ops.reduce(function (pr, f) { return pr.then(f); }, Promise.resolve()); } }; return b; },
  runTransaction: function (fn) { var t = { get: function (x) { return x.get(); }, set: function (r, d, o) { return r.set(d, o); } }; return fn(t); }
};

/* ── stubbed _lib/admin, _lib/mail, stripe ─────────────────────────────── */
var STAFF = ['csebuilders.com', 'clearsky-usa.com'];
function orgOf(e) { return String(e || '').toLowerCase().split('@')[1] || ''; }
function httpError(s, m) { var e = new Error(m); e.status = s; return e; }
var ADMIN = {
  db: function () { return DB; }, FieldValue: function () { return FieldValue; }, httpError: httpError, orgOf: orgOf,
  authenticate: function (req) {
    var m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return Promise.reject(httpError(401, 'missing bearer token'));
    var parts = m[1].split(':'); var email = parts[1];
    return Promise.resolve({ uid: parts[0], email: email, orgId: orgOf(email), staff: STAFF.indexOf(orgOf(email)) >= 0, claims: { name: parts[2] || '', email_verified: true } });
  },
  canActInOrg: function (caller, o) { return Promise.resolve(caller.staff || caller.orgId === o); },
  handler: function (fn) {
    return function (req, res) {
      return Promise.resolve().then(function () { return fn(req, res); })
        .then(function (out) { res.status(200).json(out); })
        .catch(function (err) { res.status(err.status || 500).json({ error: err.message }); });
    };
  }
};
var MAILS = [];
var MAIL = { send: function (to, subject) { MAILS.push({ to: to, subject: subject }); return Promise.resolve({ skipped: true }); }, layout: function (t, b) { return b; }, esc: function (s) { return String(s); }, row: function () { return ''; } };
var STRIPE_CALLS = [];
var STRIPE_EVENT = null;
function stripeStub() {
  return {
    checkout: { sessions: { create: function (o) { STRIPE_CALLS.push(['session', o]); return Promise.resolve({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1', payment_intent: 'pi_test_1' }); }, expire: function (id) { STRIPE_CALLS.push(['expire', id]); return Promise.resolve({}); } } },
    refunds: { create: function (o) { STRIPE_CALLS.push(['refund', o]); return Promise.resolve({ id: 're_' + o.payment_intent }); } },
    webhooks: { constructEvent: function () { return STRIPE_EVENT; } }
  };
}
var realLoad = Module._load;
Module._load = function (request, parent) {
  if (request === 'stripe') return stripeStub;
  if (/_lib\/admin$/.test(request) || /\.\/admin$/.test(request)) return ADMIN;
  if (/_lib\/mail$/.test(request)) return MAIL;
  return realLoad.apply(this, arguments);
};
var API = require(path.join(__dirname, '..', '..', 'api', 'invest.js'));
var WEBHOOK = require(path.join(__dirname, '..', '..', 'api', 'invest-webhook.js'));

function call(body, who) {
  return new Promise(function (resolve) {
    var res = { _s: 200, status: function (s) { this._s = s; return this; }, json: function (j) { resolve({ status: this._s, body: j }); }, end: function () { resolve({ status: this._s }); }, setHeader: function () {} };
    API({ method: 'POST', headers: who ? { authorization: 'Bearer ' + who, origin: 'https://app.clearskyomega.com' } : { origin: 'https://app.clearskyomega.com' }, body: body }, res);
  });
}
function hook(evt) {
  STRIPE_EVENT = evt;
  return new Promise(function (resolve) {
    var handlers = {};
    var req = { method: 'POST', headers: { 'stripe-signature': 'x' }, on: function (ev, fn) { handlers[ev] = fn; } };
    var res = { _s: 200, status: function (s) { this._s = s; return this; }, json: function (j) { resolve({ status: this._s, body: j }); }, send: function (t) { resolve({ status: this._s, body: t }); }, end: function () { resolve({ status: this._s }); } };
    WEBHOOK(req, res);
    handlers.data(Buffer.from('{}')); handlers.end();
  });
}
var SPONSOR = 'u-sponsor:dev@concordenergyusa.com:Dev Person';
var STAFFER = 'u-staff:ops@csebuilders.com:Ops';
var INV1 = 'u-inv1:alice@gmail.com:Alice Investor';
var INV2 = 'u-inv2:bob@outlook.com:Bob';
process.env.STRIPE_SECRET_KEY = '';   /* manual mode first */

function seed() {
  STORE = {};
  STORE['cf_campaigns/live1'] = { title: 'Compute container', type: 'compute', status: 'live', sponsorOrgId: 'concordenergyusa.com', goal: 500000, unitPrice: 100, unitsTotal: 5000, raised: 0, unitsSold: 0, backers: 0, minInvestment: 100,
    deadline: new Date(Date.now() + 30 * 86400000).toISOString(), offer: { kind: 'compute', sharePct: 40, termYears: 10, distributableAnnual: 180000, escalatorPct: 2, codMonths: 6, platformFeePct: 3 },
    perks: [{ id: 'p2', title: 'Rack sponsor', minAmount: 2500 }] };
  STORE['cf_campaigns/draft1'] = { title: 'Draft microgrid', type: 'microgrid', status: 'draft', sponsorOrgId: 'concordenergyusa.com', goal: 100000, unitPrice: 100, minInvestment: 100,
    deadline: new Date(Date.now() + 10 * 86400000).toISOString(), offer: { kind: 'ppa', sharePct: 30, termYears: 8, distributableAnnual: 40000 }, raised: 0, unitsSold: 0, backers: 0 };
  STORE['cf_campaigns/bad1'] = { title: 'Bad', type: 'solar', status: 'draft', sponsorOrgId: 'concordenergyusa.com', goal: 500, unitPrice: 100, offer: { sharePct: 0 }, raised: 0, unitsSold: 0, backers: 0 };
}

Promise.resolve().then(function () {
  seed();
  console.log('quote');
  return call({ action: 'quote', campaignId: 'live1', amount: 5000 }).then(function (r) {
    ok(r.status === 200, 'anonymous quote on a live campaign answers');
    ok(r.body.units === 50 && near(r.body.pctOfProject, 0.004), '50 units, 0.4% of the project');
    ok(r.body.personalized === false, 'not personalised without a token');
    ok(r.body.headline && near(r.body.headline.targetYieldPct, 14.688, 0.001), 'headline rides along');
    return call({ action: 'quote', campaignId: 'draft1', amount: 500 });
  }).then(function (r) {
    ok(r.status === 404, 'a draft cannot be quoted (' + r.status + ')');
    return call({ action: 'quote', campaignId: 'live1', amount: 1000 }, INV1);
  }).then(function (r) {
    ok(r.body.personalized === true && r.body.eligible === true, 'personalised quote says a retail investor is eligible for $1,000');
    return call({ action: 'quote', campaignId: 'live1', amount: 30000 }, INV1);
  }).then(function (r) {
    ok(r.body.eligible === false && /accredited/i.test(r.body.reasons.join(' ')), '$30,000 needs accreditation (' + r.body.reasons[0] + ')');
  });
}).then(function () {
  console.log('pledge — refusals');
  return call({ action: 'pledge', campaignId: 'live1', amount: 500 }).then(function (r) {
    ok(r.status === 401, 'no token → 401');
    return call({ action: 'pledge', campaignId: 'live1', amount: 500, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, SPONSOR);
  }).then(function (r) {
    ok(r.status === 403 && /own campaign/.test(r.body.error), 'the sponsor cannot invest in its own campaign');
    return call({ action: 'pledge', campaignId: 'live1', amount: 50, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV1);
  }).then(function (r) {
    ok(r.status === 400 && /minimum is one unit/.test(r.body.error), 'below one unit is refused');
    return call({ action: 'pledge', campaignId: 'live1', amount: 500, attest: { acceptedRisk: true, acceptedTerms: false, country: 'US' } }, INV1);
  }).then(function (r) {
    ok(r.status === 400 && /terms/.test(r.body.error), 'terms must be accepted');
    return call({ action: 'pledge', campaignId: 'live1', amount: 500, attest: { acceptedRisk: false, acceptedTerms: true, country: 'US' } }, INV1);
  }).then(function (r) {
    ok(r.status === 403 && /risk/.test(r.body.error), 'risk acknowledgement is enforced server-side');
    return call({ action: 'pledge', campaignId: 'live1', amount: 500, attest: { acceptedRisk: true, acceptedTerms: true, country: 'DE' } }, INV1);
  }).then(function (r) {
    ok(r.status === 403 && /residents/.test(r.body.error), 'country outside the list is refused');
    return call({ action: 'pledge', campaignId: 'live1', amount: 500, attest: { acceptedRisk: true, acceptedTerms: true } }, INV1);
  }).then(function (r) {
    ok(r.status === 400 && /Country/.test(r.body.error), 'a pledge with no country is refused');
    return call({ action: 'pledge', campaignId: 'live1', amount: 3000, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV1);
  }).then(function (r) {
    ok(r.status === 403 && /per year/.test(r.body.error), 'non-accredited annual cap applies');
    return call({ action: 'pledge', campaignId: 'draft1', amount: 500, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV1);
  }).then(function (r) {
    ok(r.status === 409, 'cannot pledge to a draft');
    return call({ action: 'pledge', campaignId: 'live1', amount: 2000, perkId: 'p2', attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV1);
  }).then(function (r) {
    ok(r.status === 400 && /perk/.test(r.body.error), 'a perk below its minimum is refused');
    ok(Object.keys(STORE).filter(function (k) { return k.indexOf('cf_pledges/') === 0; }).length === 0, 'no pledge row was written by any refusal');
  });
}).then(function () {
  console.log('pledge — manual mode, then paid');
  var pid;
  return call({ action: 'pledge', campaignId: 'live1', amount: 550, attest: { name: 'Alice Q', acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV1).then(function (r) {
    ok(r.status === 200 && r.body.manual === true, 'without Stripe the pledge is manual');
    ok(r.body.amount === 500 && r.body.units === 5, '$550 buys 5 whole units for $500');
    pid = r.body.pledgeId;
    var p = STORE['cf_pledges/' + pid];
    ok(p && p.status === 'pending' && p.investorUid === 'u-inv1' && p.sponsorOrgId === 'concordenergyusa.com', 'pending row carries investor and sponsor org');
    ok(near(p.pctOfProject, 0.0004), '5 of 5,000 units × 40% = 0.04% of the project');
    ok(STORE['cf_investors/u-inv1'] && STORE['cf_investors/u-inv1'].country === 'US' && STORE['cf_investors/u-inv1'].kyc === 'none', 'profile created from the attestation, kyc untouched');
    ok(STORE['cf_campaigns/live1'].raised === 0, 'counters do not move on a pending pledge');
    ok(MAILS.length === 1 && MAILS[0].to === 'alice@gmail.com', 'receipt emailed');
    return call({ action: 'confirm', pledgeId: pid }, INV1);
  }).then(function (r) {
    ok(r.status === 403, 'an investor cannot confirm their own payment');
    return call({ action: 'confirm', pledgeId: pid, reference: 'wire 123' }, STAFFER);
  }).then(function (r) {
    ok(r.status === 200 && r.body.already === false, 'staff confirms');
    var c = STORE['cf_campaigns/live1'], p = STORE['cf_pledges/' + pid];
    ok(p.status === 'paid' && p.payment.reference === 'wire 123', 'pledge is paid with the reference');
    ok(c.raised === 500 && c.unitsSold === 5 && c.backers === 1, 'raised 500, 5 units, 1 backer');
    return call({ action: 'confirm', pledgeId: pid }, STAFFER);
  }).then(function (r) {
    ok(r.body.already === true && STORE['cf_campaigns/live1'].raised === 500, 'confirming twice is a no-op');
    return call({ action: 'pledge', campaignId: 'live1', amount: 300, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV1);
  }).then(function (r) {
    ok(r.status === 200, 'second pledge by the same investor (500 + 300 under the 2,500 cap)');
    return call({ action: 'confirm', pledgeId: r.body.pledgeId }, STAFFER);
  }).then(function () {
    var c = STORE['cf_campaigns/live1'];
    ok(c.raised === 800 && c.unitsSold === 8 && c.backers === 1, 'backers counts distinct investors, not pledges');
    return call({ action: 'pledge', campaignId: 'live1', amount: 1800, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV1);
  }).then(function (r) {
    ok(r.status === 403 && /remaining/.test(r.body.error), 'the cap counts what is already committed this year');
  });
}).then(function () {
  console.log('pledge — Stripe mode and the webhook');
  process.env.STRIPE_SECRET_KEY = 'sk_test';
  var pid;
  return call({ action: 'pledge', campaignId: 'live1', amount: 1000, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV2).then(function (r) {
    ok(r.status === 200 && /checkout\.stripe/.test(r.body.url), 'with a key the pledge returns a Checkout URL');
    pid = r.body.pledgeId;
    var s = STRIPE_CALLS[STRIPE_CALLS.length - 1][1];
    ok(s.mode === 'payment' && s.line_items[0].quantity === 10 && s.line_items[0].price_data.unit_amount === 10000, 'session: 10 units at $100.00');
    ok(s.metadata.kind === 'cf_pledge' && s.metadata.pledgeId === pid, 'session carries the pledge id');
    ok(/\/skyfund\?paid=/.test(s.success_url) && /\/skyfund\?cancelled=/.test(s.cancel_url), 'return URLs land on the storefront');
    ok(STORE['cf_pledges/' + pid].stripeSessionId === 'cs_test_1', 'session id stored on the pledge');
    return hook({ type: 'checkout.session.completed', created: 1700000000, data: { object: { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_test_1', amount_total: 100000, currency: 'usd', metadata: { kind: 'cf_pledge', pledgeId: pid } } } });
  }).then(function (r) {
    ok(r.status === 200 && r.body.received, 'webhook acknowledged');
    var c = STORE['cf_campaigns/live1'], p = STORE['cf_pledges/' + pid];
    ok(p.status === 'paid' && p.payment.provider === 'stripe', 'pledge paid by webhook');
    ok(c.raised === 1800 && c.unitsSold === 18 && c.backers === 2, 'counters: 1,800 / 18 / 2');
    return hook({ type: 'checkout.session.completed', created: 1700000001, data: { object: { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_test_1', metadata: { kind: 'cf_pledge', pledgeId: pid } } } });
  }).then(function () {
    ok(STORE['cf_campaigns/live1'].raised === 1800, 'a retried webhook does not double count');
    return hook({ type: 'invoice.paid', created: 1, data: { object: { id: 'in_1' } } });
  }).then(function (r) {
    ok(r.status === 200 && r.body.ignored === 'invoice.paid', 'billing events are ignored, not errors');
    return hook({ type: 'charge.refunded', created: 1700000002, data: { object: { id: 'ch_1', payment_intent: 'pi_test_1', amount_refunded: 100000 } } });
  }).then(function () {
    var c = STORE['cf_campaigns/live1'], p = STORE['cf_pledges/' + pid];
    ok(p.status === 'refunded', 'charge.refunded flips the pledge');
    ok(c.raised === 800 && c.unitsSold === 8 && c.backers === 1, 'refund reverses the counters and the backer');
    return call({ action: 'pledge', campaignId: 'live1', amount: 200, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV2);
  }).then(function (r) {
    pid = r.body.pledgeId;
    return call({ action: 'cancel', pledgeId: pid }, INV1);
  }).then(function (r) {
    ok(r.status === 403, 'another investor cannot cancel it');
    return call({ action: 'cancel', pledgeId: pid }, INV2);
  }).then(function (r) {
    ok(r.status === 200 && STORE['cf_pledges/' + pid].status === 'cancelled', 'the owner cancels a pending pledge');
    ok(STRIPE_CALLS.some(function (c) { return c[0] === 'expire'; }), 'the Checkout session is expired with it');
    return hook({ type: 'checkout.session.expired', created: 1, data: { object: { id: 'cs_x', metadata: { kind: 'cf_pledge', pledgeId: pid } } } });
  }).then(function (r) {
    ok(r.status === 200, 'an expiry event on an already-cancelled pledge is acknowledged');
  });
}).then(function () {
  console.log('sponsor: submit; staff: review, launch, close, distribute');
  return call({ action: 'submit', campaignId: 'draft1' }, INV1).then(function (r) {
    ok(r.status === 403, 'a stranger cannot submit');
    return call({ action: 'submit', campaignId: 'bad1' }, SPONSOR);
  }).then(function (r) {
    ok(r.status === 400 && /Goal/.test(r.body.error) && /Share/.test(r.body.error), 'bad terms are named (' + r.body.error.slice(0, 60) + '…)');
    return call({ action: 'submit', campaignId: 'draft1' }, SPONSOR);
  }).then(function (r) {
    ok(r.status === 200 && STORE['cf_campaigns/draft1'].status === 'review', 'sponsor submits a valid draft');
    ok(Object.keys(STORE).some(function (k) { return k.indexOf('omega_orgs/csebuilders.com/notifications/') === 0; }), 'ClearSky gets a notification row');
    return call({ action: 'review', campaignId: 'draft1', decision: 'launch' }, SPONSOR);
  }).then(function (r) {
    ok(r.status === 403, 'the sponsor cannot launch');
    return call({ action: 'review', campaignId: 'draft1', decision: 'return', note: 'Attach the PPA.' }, STAFFER);
  }).then(function (r) {
    ok(r.status === 200 && STORE['cf_campaigns/draft1'].status === 'draft' && STORE['cf_campaigns/draft1'].reviewNote === 'Attach the PPA.', 'returned to draft with the note');
    return call({ action: 'review', campaignId: 'draft1', decision: 'launch' }, STAFFER);
  }).then(function (r) {
    var c = STORE['cf_campaigns/draft1'];
    ok(r.status === 200 && c.status === 'live' && c.unitsTotal === 1000, 'launched: live, 1,000 units');
    ok(c.headline && near(c.headline.sharePct, 30) && c.headline.targetYieldPct > 0, 'headline computed and stored');
    ok(typeof c.slug === 'string' && /^draft-microgrid/.test(c.slug), 'slug minted from the title');
    return call({ action: 'distribute', campaignId: 'live1', period: '2027-Q1', distributable: 50000 }, STAFFER);
  }).then(function (r) {
    ok(r.status === 409, 'no distributions on a live campaign');
    return call({ action: 'close', campaignId: 'live1', outcome: 'funded' }, STAFFER);
  }).then(function (r) {
    var c = STORE['cf_campaigns/live1'];
    ok(r.status === 200 && c.status === 'funded' && c.proceeds.fee === 24 && c.proceeds.net === 776, 'funded; 3% fee on $800');
    return call({ action: 'distribute', campaignId: 'live1', period: '2027-Q1', grossRevenue: 60000, distributable: 50000 }, STAFFER);
  }).then(function (r) {
    ok(r.status === 200 && near(r.body.crowdPool, 20000) && near(r.body.perUnit, 2500), '$50,000 × 40% = $20,000 pool; ÷ 8 units = $2,500/unit');
    var d = Object.keys(STORE).filter(function (k) { return k.indexOf('cf_distributions/') === 0; });
    ok(d.length === 1 && STORE[d[0]].period === '2027-Q1' && STORE[d[0]].status === 'declared', 'distribution row declared');
    ok(STORE['cf_campaigns/live1'].distributions === 1 && near(STORE['cf_campaigns/live1'].distributedTotal, 20000), 'campaign tallies it');
    return call({ action: 'distribute', campaignId: 'live1', period: '2027-Q2', distributable: 0 }, STAFFER);
  }).then(function (r) {
    ok(r.status === 400, 'a zero distribution is refused');
  });
}).then(function () {
  console.log('close as failed');
  seed(); MAILS.length = 0; STRIPE_CALLS.length = 0;
  process.env.STRIPE_SECRET_KEY = 'sk_test';
  var stripePid, manualPid, pendingPid;
  return call({ action: 'pledge', campaignId: 'live1', amount: 1000, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV2).then(function (r) {
    stripePid = r.body.pledgeId;
    return hook({ type: 'checkout.session.completed', created: 1, data: { object: { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_test_1', metadata: { kind: 'cf_pledge', pledgeId: stripePid } } } });
  }).then(function () {
    process.env.STRIPE_SECRET_KEY = '';
    return call({ action: 'pledge', campaignId: 'live1', amount: 500, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV1);
  }).then(function (r) {
    manualPid = r.body.pledgeId;
    return call({ action: 'confirm', pledgeId: manualPid }, STAFFER);
  }).then(function () {
    return call({ action: 'pledge', campaignId: 'live1', amount: 200, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } }, INV1);
  }).then(function (r) {
    pendingPid = r.body.pledgeId;
    ok(STORE['cf_campaigns/live1'].raised === 1500 && STORE['cf_campaigns/live1'].backers === 2, 'two paid pledges, one pending');
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    return call({ action: 'close', campaignId: 'live1', outcome: 'failed', note: 'missed minimum' }, STAFFER);
  }).then(function (r) {
    var c = STORE['cf_campaigns/live1'];
    ok(r.status === 200 && c.status === 'closed' && c.outcome === 'failed', 'closed as failed');
    ok(STORE['cf_pledges/' + stripePid].status === 'refunded' && STRIPE_CALLS.some(function (x) { return x[0] === 'refund' && x[1].payment_intent === 'pi_test_1'; }), 'the Stripe pledge was refunded through Stripe');
    ok(STORE['cf_pledges/' + manualPid].status === 'paid' && STORE['cf_pledges/' + manualPid].refundDue === true, 'the manual pledge is flagged refund-due, not silently flipped');
    ok(STORE['cf_pledges/' + pendingPid].status === 'cancelled', 'the pending pledge is cancelled');
    ok(c.raised === 500 && c.unitsSold === 5 && c.backers === 1, 'counters reflect only the money still held');
    return call({ action: 'refund', pledgeId: manualPid, reason: 'wired back' }, STAFFER);
  }).then(function (r) {
    ok(r.status === 200 && STORE['cf_pledges/' + manualPid].status === 'refunded' && STORE['cf_campaigns/live1'].raised === 0 && STORE['cf_campaigns/live1'].backers === 0, 'manual refund recorded; everything back to zero');
  });
}).then(function () {
  console.log(fails ? '\n' + fails + ' failing' : '\nall passing');
  process.exit(fails ? 1 : 0);
}).catch(function (e) { console.error('  CRASH', e); process.exit(1); });
