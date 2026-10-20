/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   ═══════════════════════════════════════════════════════════════════════════
   /api/customer-quote — a seller's quote to its own customer, from an Omega
   Prime project: saved, priced on the server, sent, tracked, approved, and
   handed to the SELLER's own Omega Logic office to fulfil (prime-order.js:
   the workspace the rep is in); then the Teleios ladder.

   PUBLIC (no sign-in; the key from the email or the copied link is the
   credential; rate limited; Cache-Control private, no-store):
     GET  ?id=&key=                       the customer's view (counts a view;
                                          sent → viewed; expiry flipped)
     POST {action:'approve', id, key, name, title?, email?, agree:true, snapshot}
                                          the snapshot must be the one the
                                          customer was shown; idempotent; then
                                          the order, in the seller's Omega
                                          Logic (prime-order.js)
     POST {action:'decline', id, key, reason?}
     POST {action:'question', id, key, message, email?}   10 a link; the words
                                          kept on the quote (the last 20) through
                                          every edit and resend, and in its log

   THE SELLER (signed in; the project's OWN workspace only, or ClearSky
   staff — a JDA collaborator or an org_members grant quotes nothing here;
   a viewer may read, never write; the pricing gate is /api/price-site's):
     GET  ?list=1                          the workspace's quotes (the Desk)
     GET  ?projectId=                      the quotes on one project (Prime)
     GET  ?id=                             one quote, seller's view + ladder
                                          (a row's stage is the SAME ladder, its
                                          units and coverage read: one plant_units
                                          query an order, the catalog once an org)
     POST {action:'preview'|'save', projectId, id?, customer, pricing, terms}
     POST {action:'send', id, sendId, deliver:'email'|'link', message?}
     POST {action:'withdraw', id}
     POST {action:'handoff', id}           retry the order request

   ── THE PRICE IS THE SERVER'S ───────────────────────────────────────────
   preview and save re-run api/price-site.js through its exported _helpers
   (gate, orgPricing, validateInput, finish) on the project's OWN record:
   prime.layout and the battery resolved from the workspace's list by
   prime.unitKey, turned into the Run's input by omega-prime-project.js
   runInput() — the browser's Run and this door compute the inputs one way.
   A total in a body is never read; the rep chooses a markup or types the
   customer's total, and api/_lib/customer-quote.js does the arithmetic.

   ── SENDING: THE HELIOS INTAKE DOOR'S RULES ─────────────────────────────
   The project's own workspace (or staff), a workspace on record that is not
   pending, suspended or cancelled, not a personal email domain, not a
   viewer, a verified email or an owner/administrator of an active client
   (admin.clientAdmin). A sendId is claimed in a transaction before anything
   is mailed (the same id again answers with the first), at most
   PER_QUOTE_DAY sends a quote and PER_ORG_DAY a workspace each day (UTC) on
   omega_orgs/{org}/quote_counters (no rule opens it). Every send mints a new
   key (only its sha256 is stored), so the previous link dies. Email goes
   through mail.send with Reply-To and a copy to the rep; a white-labelled
   workspace without a verified whiteLabel.embed.mailFrom may send a LINK
   only — never a ClearSky From line under a white label. A mail failure
   puts the quote back as it was and answers 502.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), Q = require('./_lib/customer-quote'), PO = require('./_lib/prime-order'), T = require('./_lib/teleios');
var DECK = require('./_lib/deck-brand'), MAIL = require('./_lib/mail'), WL = require('./_lib/whitelabel'), KIT = require('./_lib/kit'), E = require('./_lib/embed');
var PUBLIC_DOMAINS = require('./_lib/public-domains'), X = require('./_lib/logic-access');
var PRICE = require('./price-site')._helpers;
/* the ONE Run input (a browser file, CommonJS-exported); the ONE battery
   list is Q.unitsFor (the same list prime-order checks the order line on) */
var PP = require('../omega-prime-project.js');

var CLOSED = ['pending', 'suspended', 'cancelled'], STALE_MS = 10 * 60 * 1000;
var TENANT_ACTIONS = ['preview', 'save', 'send', 'withdraw', 'handoff'], PUBLIC_ACTIONS = ['approve', 'decline', 'question'];
var FIELDS = {
  preview: ['action', 'projectId', 'id', 'customer', 'pricing', 'terms'], save: ['action', 'projectId', 'id', 'customer', 'pricing', 'terms'],
  send: ['action', 'id', 'sendId', 'deliver', 'message'], withdraw: ['action', 'id'], handoff: ['action', 'id'],
  approve: ['action', 'id', 'key', 'name', 'title', 'email', 'agree', 'snapshot'], decline: ['action', 'id', 'key', 'reason'], question: ['action', 'id', 'key', 'message', 'email']
};

function fail(status, message) { throw A.httpError(status, message); }
function coll(db) { return db.collection('customer_quotes'); }
function data(s) { return s && s.exists ? (s.data() || {}) : null; }
function str(v, n) { return Q.str(v, n); }
function clientIp(req) { var h = req.headers || {}; return String(h['x-forwarded-for'] || h['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim().slice(0, 64); }
function history(r, entry) { return (r.history || []).concat([entry]).slice(-50); }
function verified(caller) { return !!(caller.claims && caller.claims.email_verified === true); }
function home(orgRec) { return KIT.home(orgRec || {}, { wildcard: process.env.TENANT_WILDCARD_LIVE === 'true' }); }
function quoteUrl(orgRec, id, key) { return 'https://' + home(orgRec) + '/quote?id=' + encodeURIComponent(id) + '&key=' + key; }
function deskUrl(orgRec, id) { return 'https://' + home(orgRec) + '/rfq.html#customer' + (id ? '-' + encodeURIComponent(id) : ''); }
function event(tx, db, id, by, what, extra) { tx.create(coll(db).doc(id).collection('events').doc(), Object.assign({ at: Date.now(), by: by, what: what }, extra || {})); }
function notify(tx, db, org, kind, text, r) {
  tx.create(db.collection('omega_orgs').doc(org).collection('notifications').doc(), { kind: kind, text: text, quoteId: r.id, projectId: r.projectId || null, read: false, createdAt: A.FieldValue().serverTimestamp() });
}
async function mirror(db, r) {
  try {
    var pref = db.collection('projects').doc(String(r.projectId)), s = await pref.get();
    if (s.exists) await pref.update({ 'prime.quote': Q.mirror(r) });
  } catch (e) { console.error('[customer-quote] project mirror', e && e.message); }
}

/* ── who may act ──────────────────────────────────────────────────────── */
async function ownProject(db, caller, projectId) {
  projectId = str(projectId, 128);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) fail(400, 'projectId required');
  var ref = db.collection('projects').doc(projectId), project = data(await ref.get());
  if (!project) fail(404, 'Project not found');
  var org = A.safeOrg(project.orgId);
  if (!org) fail(409, 'This project has no workspace on its record, so it cannot be quoted in anyone’s name.');
  if (!caller.staff && caller.orgId !== org) fail(403, 'Only the project’s own workspace quotes it.');
  return { id: projectId, ref: ref, project: project, org: org };
}
async function ownQuote(db, caller, id) {
  if (!Q.validId(id)) fail(400, 'Invalid quote id');
  var r = data(await coll(db).doc(id).get());
  if (!r) fail(404, 'Quote not found');
  if (!caller.staff && caller.orgId !== r.orgId) fail(403, 'Only the workspace that made this quote may open it.');
  return r;
}
async function standing(db, caller, org, write) {
  if (caller.staff) return { member: null, viewer: false };
  /* A public mailbox domain is never a workspace: one 'gmail.com' bucket would
     share every unclaimed Gmail user's quotes (a personal workspace is keyed
     by its slug through the orgId claim, so it is unaffected). */
  if (PUBLIC_DOMAINS.indexOf(org) >= 0) fail(403, 'Quotes belong to a company workspace; sign in with your work email, or ask for a personal workspace to be set up.');
  /* The same reader rule as tenantReader() in firestore.rules and the
     office's logic-access: a verified email, or an owner or administrator of
     an ACTIVE client (admin.clientAdmin). An address anyone can open on the
     seller's domain without proving it never reads a customer's details,
     the cost or the margin, and never changes a live proposal (review,
     2026-10-17). */
  if (!verified(caller) && !(await A.clientAdmin(caller, org))) {
    fail(403, 'Verify your email address to open customer quotes: they carry your customers’ details and your margin. An owner or administrator of an active workspace may open them without it.');
  }
  var m = data(await db.collection('omega_orgs').doc(org).collection('members').doc(caller.uid).get());
  if (m && m.status && m.status !== 'active') fail(403, 'Your membership of this workspace is not active.');
  var viewer = !!m && m.role === 'viewer';
  if (write && viewer) fail(403, 'A viewer cannot change or send quotes; ask an owner, administrator or member of the workspace.');
  return { member: m, viewer: viewer };
}

/* ── the battery, the Run input, the price ────────────────────────────── */
var tenantCatalog = Q.tenantCatalog, unitsFor = Q.unitsFor;
/* the Run's input from the unit and the layout: omega-prime-project.js
   runInput(), the one the page's Run sends */
function runInputOf(unit, layout) {
  if (typeof PP.runInput !== 'function') fail(500, 'omega-prime-project.js runInput() is missing on this deployment');
  return PP.runInput(unit, layout) || {};
}
function clean(o) { var out = {}; Object.keys(o || {}).forEach(function (k) { if (o[k] !== undefined && o[k] !== null) out[k] = o[k]; }); return out; }
function sourceHash(project) { var pr = project.prime || {}; return Q.layoutHash(pr.layout || {}) + ':' + str(pr.unitKey || (pr.unit && pr.unit.key) || '', 120); }
/* The circuit as the Circuit step names it ("Circuit L5131 · substation
   S0711"): the utility's own circuit id first, the source's other name for
   it only beside it (ComEd's queue-report number, "queue report F1978"),
   then its substation. A source with no id leads with its name ("nearest
   transformer point"). */
function circuitLine(c) {
  if (!c || typeof c !== 'object') return str(c, 160);
  var id = str(c.id || c.feeder, 60), name = str(c.name, 60), sub = str(c.substation, 60);
  return [(id || name) + (id && name && name !== id ? ' (' + name + ')' : ''), sub ? 'substation ' + sub : ''].filter(Boolean).join(' · ');
}
function siteOf(project) {
  var pr = project.prime || {}, s = pr.site || {}, h = pr.hosting || {}, g = project.grid || {}, ms = project.mapState || {};
  var util = h.utility && typeof h.utility === 'object' ? (h.utility.display || h.utility.name || '') : (h.utility || '');
  var circ = circuitLine(h.circuit);
  if (!circ && g.circuit) circ = circuitLine(g.circuit);
  var address = s.addr || s.label || project.address || project.name || '';
  return { address: str(address, 400), lat: isFinite(+s.lat) ? +s.lat : (isFinite(+ms.lat) ? +ms.lat : null), lng: isFinite(+s.lng) ? +s.lng : (isFinite(+ms.lng) ? +ms.lng : null),
    zip: str(s.zip, 10) || (PP.zipOf ? PP.zipOf(address) : ''), utility: str(util, 160), circuit: str(circ, 160) };
}
function dataLogo(org) {
  var v = org && typeof org.logoUrl === 'string' ? org.logoUrl : '';
  return v.length <= 250000 && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '';
}
async function sellerOf(db, org, orgRec, caller, member) {
  var profile = null;
  try { profile = data(await db.collection('omega_orgs').doc(org).collection('billing').doc('profile').get()); } catch (e) { profile = null; }
  var b = DECK.brandOf(orgRec || {}, org, null, { profile: profile }), wl = orgRec && orgRec.whiteLabel, on = WL.isOn(wl);
  return { orgId: org, name: b.name, logoUrl: b.logoUrl || dataLogo(orgRec), accent: (b.colors && (b.colors.primary || b.colors.accent)) || DECK.hex(wl && wl.accent) || null,
    tagline: b.tagline || '', company: b.company || null, companySource: b.company ? b.company.source : null,
    rep: { name: str((member && member.name) || (caller.claims && caller.claims.name) || '', 120), email: String(caller.email || '').toLowerCase() },
    attribution: on ? b.attribution : 'Prepared with ' + b.platformName, platformName: b.platformName, whiteLabel: on,
    supportEmail: on ? Q.email(wl.supportEmail) : '' };
}
/* project + workspace → the battery, the layout, the server's cost */
async function priced(db, caller, P, now) {
  var prime = P.project.prime || {}, layout = prime.layout;
  if (!layout || !layout.unit) fail(409, 'Place the battery on the map in Omega Prime before quoting.');
  var root = db.collection('omega_orgs').doc(P.org);
  var got = await Promise.all([root.get(), root.collection('storefront').doc('config').get()]);
  var orgRec = data(got[0]), sf = data(got[1]) || {}, list = unitsFor(P.org, orgRec, sf);
  /* the unit the record resumes with, by Prime's own rule (restore(): the
     list's entry by key, a footprint the rep typed kept), and only one the
     workspace's list still offers: its maker and SKU route the order */
  var rs = PP.restore(P.project, list), unit = rs.unit, layout2 = rs.layout || layout;
  /* a charger, an array, a compute unit or a generator (main #348) is not a
     battery: the cost model prices a battery installation, so it is quoted
     from Site Map, never priced here as one */
  if (unit && unit.kind && unit.kind !== 'bess') fail(409, 'Quote required: the ' + (str(unit.name, 120) || 'unit') + ' is sized in Site Map. An Omega Prime proposal prices a battery installation.');
  var listed = !!unit && list.some(function (u) { return u && u.key === unit.key; });
  var key = str(prime.unitKey || (prime.unit && prime.unit.key) || layout.unitKey, 120);
  /* the same product under another key: a maker that has since published
     its reference unit as its own product (the list keeps one per SKU) */
  var sku = str((prime.unit && prime.unit.sku) || '', 100), same = !listed && sku ? list.filter(function (u) { return u && u.sku === sku; })[0] : null;
  if (same) {
    var typed = prime.unit && prime.unit.footprint === 'rep' ? prime.unit : null;
    unit = (same.footprint === 'none' || same.footprint === 'reference') && typed ? PP.repFootprint(same, typed.lFt, typed.wFt) : PP.snapshot(same);
    layout2 = PP.upgrade(layout, unit) || layout2; listed = true;
  }
  if (!listed) fail(409, 'The battery on this project (' + (key || 'none') + ') is not in your workspace’s list any more; choose it again in Omega Prime, then quote.');
  layout = layout2;
  var input = clean(runInputOf(unit, layout));
  PRICE.validateInput(input);
  var answer = PRICE.finish(caller, P.org, input, await PRICE.orgPricing(P.org, input));
  return { unit: unit, layout: layout, input: input, cost: Q.costOf(answer, input), orgRec: orgRec };
}
async function events(db, id) {
  try { var q = await coll(db).doc(id).collection('events').orderBy('at', 'desc').limit(20).get(); return q.docs.map(function (d) { return d.data(); }).reverse(); }
  catch (e) { return []; }
}
/* stale: the map or battery moved since the quote was priced. Only a quote
   that can still be saved or sent can be (Q.changeable): an approved quote
   is final, and telling the rep to save it again would be a dead end. */
function staleAgainst(r, p) { return Q.changeable(r.status) && (!p || sourceHash(p) !== r.layoutHash); }
async function stale(db, r) {
  if (!Q.changeable(r.status)) return false;
  try { return staleAgainst(r, data(await db.collection('projects').doc(String(r.projectId)).get())); } catch (e) { return false; }
}
/* A change after an approval is a NEW quote on the same site; its approval
   cannot be ordered while the earlier order is live (prime-order.js). The
   tenant view names the approved quote it would replace, its order, and
   whether that order is still live, so the page can say so before it is
   sent. Only for a quote that can still be sent; never an error. */
async function supersedesOf(db, r) {
  if (!r || !r.projectId || !Q.changeable(r.status)) return null;
  try {
    var got = await coll(db).where('orgId', '==', r.orgId).where('projectId', '==', String(r.projectId)).get();
    var prev = got.docs.map(function (d) { return d.data(); }).filter(function (x) { return x && x.id !== r.id && x.status === 'approved'; })
      .sort(function (a, b) { return ((b.acceptance && b.acceptance.approvedAt) || b.updatedAt || 0) - ((a.acceptance && a.acceptance.approvedAt) || a.updatedAt || 0); })[0];
    if (!prev) return null;
    var h = prev.handoff || {}, order = null;
    if (h.orderId && !h.error) {
      order = data(await db.collection('orders').doc(String(h.orderId)).get());
      if (order && (order.sourceQuoteId !== prev.id || order.sourceOrgId !== prev.orgId)) order = null;
    }
    return { quoteId: prev.id, quoteNo: prev.quoteNo, orderNo: (order && order.orderNo) || null, live: PO.live(order) };
  } catch (e) { console.error('[customer-quote] supersedes', e && e.message); return null; }
}

/* ── preview / save ───────────────────────────────────────────────────── */
async function compose(db, caller, input, now, write) {
  var prior = input.id != null && input.id !== '' ? await ownQuote(db, caller, input.id) : null;
  if (prior && input.projectId && input.projectId !== prior.projectId) fail(400, 'This quote belongs to another project');
  var P = await ownProject(db, caller, prior ? prior.projectId : input.projectId);
  var st = await standing(db, caller, P.org, write);
  if (prior && prior.status === 'approved') fail(409, 'An approved quote cannot be edited; start a new quote for a change.');
  await PRICE.gate(caller, P.org);
  E.rateLimit('customer-quote:' + P.org, 60);
  var pr = await priced(db, caller, P, now);
  var id = prior ? prior.id : (write ? Q.newId() : null);
  var rec = Q.compose({ id: id, orgId: P.org, projectId: P.id, quoteNo: prior ? prior.quoteNo : (id ? Q.quoteNo(pr.orgRec, P.org, id, now) : 'DRAFT'), rev: prior ? (prior.rev || 1) + (write ? 1 : 0) : 1,
    status: 'draft', customer: input.customer, pricing: input.pricing, terms: input.terms, unit: pr.unit, layout: pr.layout, layoutHash: sourceHash(P.project), site: siteOf(P.project),
    cost: pr.cost, seller: await sellerOf(db, P.org, pr.orgRec, caller, st.member) }, now);
  rec.createdAt = prior ? prior.createdAt : now; rec.createdBy = prior ? prior.createdBy : caller.email;
  rec.updatedAt = now; rec.updatedBy = caller.email; rec.acceptance = null; rec.snapshot = null; rec.mailState = null; rec.handoff = null;
  rec.history = prior ? prior.history || [] : [];
  /* what the customer asked survives the edit (the link it came in on does not) */
  rec.questions = prior ? Q.questionsOf(prior).slice(-Q.QUESTIONS_KEPT) : [];
  var sup = await supersedesOf(db, rec);
  if (!write) return { quote: Q.tenantView(rec, { events: [], stale: false, supersedes: sup }) };
  var what = prior ? 'Saved revision ' + rec.rev : 'Quote created';
  if (prior && prior.status !== 'draft') {
    Q.transition(prior, 'draft', now);
    if (prior.status === 'sent' || prior.status === 'viewed') { rec.history = history(rec, { at: now, by: caller.email, action: 'withdrawn-for-edit' }); what = 'Edited after it was sent: the link was withdrawn; saved revision ' + rec.rev; }
  }
  rec.history = history(rec, { at: now, by: caller.email, action: prior ? 'saved' : 'created', rev: rec.rev });
  var ref = coll(db).doc(rec.id);
  await db.runTransaction(async function (tx) {
    if (prior) { var cur = data(await tx.get(ref)); if (!cur || cur.updatedAt !== prior.updatedAt) fail(409, 'This quote changed while you were editing it; reload it and save again.'); }
    tx.set(ref, rec);
    event(tx, db, rec.id, caller.email, what);
  });
  await mirror(db, rec);
  return { quote: Q.tenantView(rec, { events: [{ at: now, what: what }], stale: false, supersedes: sup }) };
}

/* ── send ─────────────────────────────────────────────────────────────── */
async function send(db, caller, input, now) {
  var r = await ownQuote(db, caller, input.id), org = r.orgId;
  var orgRec = data(await db.collection('omega_orgs').doc(org).get());
  var st = await standing(db, caller, org, true);
  if (!caller.staff && PUBLIC_DOMAINS.indexOf(org) >= 0) fail(403, 'A quote is sent in a company’s name; sign in with your work email.');
  if (orgRec && orgRec.status && CLOSED.indexOf(orgRec.status) >= 0) fail(403, 'This workspace is ' + orgRec.status + ', so it cannot send quotes.');
  if (!caller.staff && !orgRec) fail(403, 'Sending a quote needs an OMEGA workspace on record for ' + org + '; ask ClearSky to set it up.');
  if (!verified(caller) && !caller.staff && !(await A.clientAdmin(caller, org))) fail(403, 'Verify your email address before sending a quote. An owner or administrator of an active workspace may send without it.');
  var deliver = input.deliver == null ? 'email' : input.deliver;
  if (deliver !== 'email' && deliver !== 'link') fail(400, 'deliver must be email or link');
  if (['draft', 'sent', 'viewed', 'expired'].indexOf(r.status) < 0) fail(409, 'A ' + r.status + ' quote cannot be sent' + (r.status === 'withdrawn' || r.status === 'declined' ? '; save it again to reopen it' : ''));
  if (await stale(db, r)) fail(409, 'The site changed in Omega Prime since this quote was priced; save the quote again to re-price it, then send it.');
  var wl = orgRec && orgRec.whiteLabel, wlOn = WL.isOn(wl), mailFrom = wlOn ? Q.email(wl.embed && wl.embed.mailFrom) : '';
  if (deliver === 'email') {
    if (!r.customer || !r.customer.email) fail(400, 'Add the customer’s email address to the quote, or send it as a link.');
    if (wlOn && !mailFrom) fail(409, 'This workspace is white-labelled and has no verified sending address of its own, so the proposal cannot be emailed from ClearSky’s mailbox; send it as a link instead.');
    if (!MAIL.configured()) fail(500, 'Mail is not configured on this deployment (MAIL_USER / MAIL_PASS); send it as a link instead.');
  }
  var sendId = str(input.sendId, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sendId)) fail(400, 'sendId required (8–64 letters, digits, - or _)');
  var message = Q.para(input.message, 2000);
  var key = Q.token(), seller = await sellerOf(db, org, orgRec, caller, st.member);
  var next = Object.assign({}, r, { seller: seller, status: 'sent', updatedAt: now, updatedBy: caller.email,
    /* valid through the END of the stated date (Q.validUntilAt: 23:59:59.999
       UTC), the date the email, the deck and the pages print */
    acceptance: { keyHash: Q.hashKey(key), sentAt: now, sentTo: deliver === 'email' ? r.customer.email : '', deliver: deliver, validUntil: Q.validUntilAt(now, r.terms.validDays),
      viewedAt: null, lastViewedAt: null, viewCount: 0, questionCount: 0 },
    mailState: deliver === 'email' ? 'sending' : 'manual' });
  next.snapshot = Q.snapshotOf(next);
  next.history = history(r, { at: now, by: caller.email, action: 'sent', deliver: deliver, to: next.acceptance.sentTo || null });
  var day = new Date(now).toISOString().slice(0, 10), ref = coll(db).doc(r.id), sref = ref.collection('sends').doc(sendId);
  var counters = db.collection('omega_orgs').doc(org).collection('quote_counters'), qc = counters.doc('q-' + r.id + '-' + day), oc = counters.doc('send-' + day);
  var repeat = await db.runTransaction(async function (tx) {
    var got = data(await tx.get(sref));
    if (got && got.state === 'sent') return got;
    if (got && got.state === 'sending' && now - (Number(got.startedAt) || 0) < STALE_MS) fail(409, 'This quote is already being sent; give it a minute, then reopen it to see whether it went.');
    var cur = data(await tx.get(ref)), a = data(await tx.get(qc)) || {}, b = data(await tx.get(oc)) || {};
    if (!cur || cur.updatedAt !== r.updatedAt) fail(409, 'This quote changed while it was being sent; reload it and send again.');
    var qn = Number(a.count) || 0, on = Number(b.count) || 0;
    if (!caller.staff && qn >= Q.PER_QUOTE_DAY) fail(429, 'This quote has been sent ' + qn + ' times today; try again tomorrow, or reply on the thread you already have.');
    if (!caller.staff && on >= Q.PER_ORG_DAY) fail(429, 'This workspace has sent ' + on + ' quotes today; try again tomorrow.');
    tx.set(sref, { state: 'sending', startedAt: now, by: caller.email, deliver: deliver, sentTo: next.acceptance.sentTo || null });
    tx.set(qc, { count: qn + 1, day: day, updatedAt: now });
    tx.set(oc, { count: on + 1, day: day, updatedAt: now });
    tx.set(ref, next);
    return null;
  });
  if (repeat) {
    var now2 = data(await ref.get()) || r;
    return { ok: true, repeat: true, url: null, mailState: repeat.mailState || now2.mailState || null, note: 'Already sent with this send id; the link is shown only once. Send again for a new link.', quote: Q.tenantView(now2, { events: await events(db, r.id), supersedes: await supersedesOf(db, now2) }) };
  }
  var url = quoteUrl(orgRec, r.id, key), mail = null;
  if (deliver === 'email') {
    try {
      mail = await MAIL.templates.customerQuote({ email: r.customer.email, cc: Q.email(caller.email) || undefined, replyTo: Q.email(caller.email) || undefined, from: mailFrom || undefined,
        brand: { name: seller.name, accent: seller.accent, supportEmail: seller.supportEmail || (seller.company && seller.company.email) || '', attribution: seller.attribution },
        customerName: r.customer.name, quoteNo: r.quoteNo, totalDisplay: Q.money(r.pricing && r.pricing.sellCents), siteLine: r.site && r.site.address,
        validUntil: new Date(next.acceptance.validUntil).toISOString().slice(0, 10), url: url, message: message, repName: seller.rep.name });
    } catch (e) { mail = { ok: false, error: str(e && e.message, 200) }; }
    if (!mail || mail.skipped || mail.ok === false) {
      /* nobody received the new link: put the quote back as it was */
      try {
        await db.runTransaction(async function (tx) {
          var cur = data(await tx.get(ref));
          if (cur && cur.acceptance && cur.acceptance.keyHash === next.acceptance.keyHash) tx.set(ref, r);
          tx.set(sref, { state: 'failed', startedAt: now, by: caller.email, deliver: deliver, error: str(mail && mail.error, 200) || 'not sent', failedAt: Date.now() });
        });
      } catch (e2) { console.error('[customer-quote] restore after mail failure', e2 && e2.message); }
      fail(502, 'The email could not be sent' + (mail && mail.error ? ' (' + str(mail.error, 160) + ')' : '') + '. Nothing changed; try again in a minute, or send it as a link.');
    }
  }
  /* sent: from here a failure is a warning, never an error (an error would invite a second send) */
  var warning = null, mailState = deliver === 'email' ? 'sent' : 'manual';
  try {
    await db.runTransaction(async function (tx) {
      var cur = data(await tx.get(ref));
      tx.set(sref, { state: 'sent', startedAt: now, sentAt: Date.now(), by: caller.email, deliver: deliver, sentTo: next.acceptance.sentTo || null, messageId: (mail && mail.id) || null, mailState: mailState });
      if (cur && cur.acceptance && cur.acceptance.keyHash === next.acceptance.keyHash) tx.update(ref, { mailState: mailState });
      event(tx, db, r.id, caller.email, deliver === 'email' ? 'Emailed to ' + r.customer.email : 'Link created to share by hand');
      tx.create(db.collection('omega_audit').doc(), { action: 'customer-quote-send', orgId: org, quoteId: r.id, projectId: r.projectId, by: caller.email, at: new Date(now).toISOString(), deliver: deliver, to: next.acceptance.sentTo || null, rev: r.rev });
    });
    next.mailState = mailState;
    await mirror(db, next);
  } catch (e) { console.error('[customer-quote] record send', e); warning = 'Sent. The send could not be recorded everywhere, so the Quote Desk may not show it yet.'; }
  return { ok: true, url: url, mailState: mailState, warning: warning, quote: Q.tenantView(next, { events: await events(db, r.id), supersedes: await supersedesOf(db, next) }) };
}

/* ── withdraw, handoff ────────────────────────────────────────────────── */
async function withdraw(db, caller, input, now) {
  var r = await ownQuote(db, caller, input.id);
  await standing(db, caller, r.orgId, true);
  Q.transition(r, 'withdrawn', now);
  var next = Object.assign({}, r, { status: 'withdrawn', updatedAt: now, updatedBy: caller.email, acceptance: r.acceptance ? Object.assign({}, r.acceptance, { keyHash: null }) : null,
    history: history(r, { at: now, by: caller.email, action: 'withdrawn' }) });
  var ref = coll(db).doc(r.id);
  await db.runTransaction(async function (tx) {
    var cur = data(await tx.get(ref)); if (!cur || cur.updatedAt !== r.updatedAt) fail(409, 'This quote changed; reload it first.');
    tx.set(ref, next); event(tx, db, r.id, caller.email, 'Withdrawn: the link no longer opens it');
  });
  await mirror(db, next);
  return { ok: true, quote: Q.tenantView(next, { events: await events(db, r.id), supersedes: await supersedesOf(db, next) }) };
}
/* The order, recorded on the quote either way: an order in the seller's own
   Omega Logic, or the reason in plain words for POST handoff to retry. */
async function runHandoff(db, r, by, now) {
  var h, tries = ((r.handoff && r.handoff.tries) || 0) + 1;
  try {
    var made = await PO.create(db, { quote: r, now: now, by: by });
    h = { orderId: made.orderId, orderNo: made.orderNo, org: made.org, workspace: made.workspace || null, manufacturer: made.manufacturer || null,
      reference: made.reference === true, procure: made.procure || null, at: now, error: null, tries: tries };
  } catch (e) {
    if (!(e && e.plain)) console.error('[customer-quote] handoff', e);
    h = { orderId: null, orderNo: null, org: null, workspace: null, manufacturer: null, reference: false, procure: null, at: now,
      error: e && e.plain ? str(e.message, 400) : 'The order could not be created just now. Press Retry in a minute; if it keeps failing, ClearSky can see why.', tries: tries };
  }
  var ref = coll(db).doc(r.id);
  try {
    await db.runTransaction(async function (tx) {
      var cur = data(await tx.get(ref));
      if (!cur) return;
      tx.update(ref, { handoff: h, history: history(cur, { at: now, by: by, action: h.error ? 'handoff-failed' : 'handed-off', orderNo: h.orderNo }) });
      event(tx, db, r.id, by, h.error ? 'Order not created: ' + h.error : 'Order ' + h.orderNo + ' is in ' + (h.workspace || h.org) + '’s Omega Logic to fulfil' + (h.procure ? ' (the battery is bought in from ' + (h.procure.mfr || 'its manufacturer') + ')' : ''));
    });
  } catch (e) { console.error('[customer-quote] record handoff', e && e.message); }
  return h;
}
async function handoff(db, caller, input, now) {
  var r = await ownQuote(db, caller, input.id);
  await standing(db, caller, r.orgId, true);
  if (r.status !== 'approved') fail(409, 'Only an approved quote is handed to Omega Logic.');
  if (r.handoff && r.handoff.orderId && !r.handoff.error) return { ok: true, handoff: r.handoff, quote: Q.tenantView(r, { events: await events(db, r.id) }) };
  var h = await runHandoff(db, r, caller.email, now);
  var next = Object.assign({}, r, { handoff: h });
  return { ok: !h.error, handoff: h, quote: Q.tenantView(next, { events: await events(db, r.id) }) };
}

/* ── the seller reads ─────────────────────────────────────────────────── */
/* ONE ladder for the detail and the Desk row: the order, its shipping
   units (one plant_units query an order), the units that replaced any of
   them under RMA (read by serial, only when a unit says it was replaced),
   and the catalog of the workspace that holds the order (coverage), read
   once an org per request through `cache`. */
var SERIAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/;
function productsOf(db, org, cache) {
  var memo = cache.products || (cache.products = {});
  if (!memo[org]) memo[org] = db.collection('omega_orgs').doc(org).collection('storefront').doc('config').get().then(function (s) { return (data(s) || {}).products || []; });
  return memo[org];
}
async function replacementsOf(db, org, units) {
  var have = {}, out = [], want = [];
  function more(list) { list.forEach(function (u) { var c = (u && u.custody) || {}; if (c.status === 'replaced' && SERIAL_ID.test(String(c.replacedBy || '')) && !have[c.replacedBy]) { have[c.replacedBy] = true; want.push(String(c.replacedBy)); } }); }
  units.forEach(function (u) { if (u && u.serial) have[u.serial] = true; });
  more(units);
  /* a replacement may itself have been replaced: a few hops, never a walk */
  for (var hop = 0; hop < 3 && want.length; hop++) {
    var batch = want.splice(0, 20);
    var got = await Promise.all(batch.map(function (serial) { return db.collection('plant_units').doc(org + '__' + serial).get().then(data, function () { return null; }); }));
    var found = got.filter(function (u) { return u && u.orgId === org; });
    out = out.concat(found); more(found);
  }
  return out;
}
async function ladderFor(db, r, now, cache) {
  cache = cache || {};
  var h = r.handoff || {}, order = null, units = [], replacements = [], products = [];
  if (h.orderId) {
    order = data(await db.collection('orders').doc(String(h.orderId)).get());
    if (order && (order.sourceQuoteId !== r.id || order.sourceOrgId !== r.orgId)) order = null;
    /* the order's own orgId as stored (the server wrote it; a personal
       workspace's slug has no dot, so it is not put through safeOrg) */
    var org = order && typeof order.orgId === 'string' && /^[^/]{1,253}$/.test(order.orgId) ? order.orgId : '';
    if (org) {
      try {
        var got = await Promise.all([db.collection('plant_units').where('orgId', '==', org).where('orderId', '==', String(h.orderId)).get(), productsOf(db, org, cache)]);
        units = got[0].docs.map(function (d) { return d.data(); });
        products = got[1];
        replacements = await replacementsOf(db, org, units);
      } catch (e) {
        /* the row still reads where the order is; only the unit steps wait */
        console.error('[customer-quote] ladder units', e && e.message);
      }
    }
  }
  return T.ladder({ quote: r, order: order, units: units, replacements: replacements, products: products, now: now, office: h.workspace || null, manufacturer: h.manufacturer || null });
}
/* The Desk's rows read the SAME ladder as the detail (units and coverage
   included), so a completed project reads Omega Teleios on the Desk too.
   Bounded: only a row with an order reads anything more, one plant_units
   query an order, the catalog once an org. */
async function rows(db, list, now) {
  var pids = {}, projects = {}, cache = {};
  list.forEach(function (r) { if (r.projectId) pids[r.projectId] = 1; });
  await Promise.all(Object.keys(pids).map(function (pid) { return db.collection('projects').doc(pid).get().then(function (s) { projects[pid] = data(s); }, function () { projects[pid] = null; }); }));
  return Promise.all(list.map(async function (r) {
    return Q.summaryRow(r, { stale: staleAgainst(r, projects[r.projectId]), stage: T.stage(await ladderFor(db, r, now, cache)) });
  }));
}
/* Is this workspace on Omega Logic — the SAME rule the hand-off runs
   (logic-access subscribed) — and may this person add it (an owner or
   administrator of the workspace, or staff)? Prime's Track and the Desk then
   open the workspace's own Omega Logic, or offer it: "Add Omega Logic" for
   whoever may add it (the Modules card, the one Opt-in door), "ask an owner
   or administrator" for everyone else (Tommy, 2026-10-17: "when I'm in
   Prime … it needs to link to my organization's Omega Logic and if we don't
   have Logic, then it will upsell the module or tell them to ask an admin to
   enroll"). Never a dead link. */
async function logicStanding(caller, org, member, now) {
  var on = false;
  try { on = X.subscribed(await X.context(org), now); } catch (e) { on = false; }
  var role = member && member.role;
  return { on: on, canAdd: !on && (!!caller.staff || role === 'owner' || role === 'admin'),
    url: on ? '/omega-logic?org=' + encodeURIComponent(org) : '/workspace#module-logic-office', module: 'logic-office' };
}
async function tenantGet(db, caller, q, now) {
  if (q.id) {
    var r = await ownQuote(db, caller, q.id);
    var st = await standing(db, caller, r.orgId, false);
    var parts = await Promise.all([events(db, r.id), stale(db, r), supersedesOf(db, r), ladderFor(db, r, now, {}), logicStanding(caller, r.orgId, st.member, now)]);
    return { quote: Q.tenantView(r, { events: parts[0], stale: parts[1], supersedes: parts[2] }), ladder: parts[3], logic: parts[4] };
  }
  if (q.projectId) {
    var P = await ownProject(db, caller, q.projectId);
    var sp = await standing(db, caller, P.org, false);
    var got = await coll(db).where('orgId', '==', P.org).where('projectId', '==', P.id).get();
    var list = got.docs.map(function (d) { return d.data(); }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return { quotes: await rows(db, list, now), logic: await logicStanding(caller, P.org, sp.member, now) };
  }
  if (q.list) {
    var org = caller.staff && q.org ? A.safeOrg(q.org) : caller.orgId;
    if (!org) fail(400, 'org required');
    var sl = await standing(db, caller, org, false);
    var all = await coll(db).where('orgId', '==', org).orderBy('updatedAt', 'desc').limit(100).get();
    return { quotes: await rows(db, all.docs.map(function (d) { return d.data(); }), now), logic: await logicStanding(caller, org, sl.member, now) };
  }
  fail(400, 'Ask for ?list=1, ?projectId= or ?id=');
}

/* ── the customer: no sign-in, the key is the credential ──────────────── */
async function openPublic(tx, ref, id, key) {
  var r = data(await tx.get(ref));
  if (!r || r.status === 'draft' || r.status === 'withdrawn' || !Q.verifyKey(r, key)) fail(404, 'Quote not found');
  return r;
}
async function publicView(db, req, q, now) {
  E.rateLimit('cq-view:' + clientIp(req), 60);
  if (!Q.validId(q.id)) fail(404, 'Quote not found');
  var ref = coll(db).doc(q.id), first = false, statusChanged = false;
  var r = await db.runTransaction(async function (tx) {
    var cur = await openPublic(tx, ref, q.id, q.key), acc = cur.acceptance, patch = {};
    if (Q.expired(cur, now)) { patch.status = 'expired'; cur.status = 'expired'; statusChanged = true; }
    first = !acc.viewedAt;
    if (first) patch['acceptance.viewedAt'] = now;
    patch['acceptance.lastViewedAt'] = now; patch['acceptance.viewCount'] = (Number(acc.viewCount) || 0) + 1;
    if (cur.status === 'sent') { patch.status = 'viewed'; cur.status = 'viewed'; statusChanged = true; }
    cur.acceptance = Object.assign({}, acc, { viewedAt: acc.viewedAt || now, lastViewedAt: now, viewCount: patch['acceptance.viewCount'] });
    tx.update(ref, patch);
    event(tx, db, cur.id, 'customer', first ? 'Opened by the customer' : 'Viewed again by the customer', { ipHash: Q.ipHash(clientIp(req), cur.orgId) });
    if (first) notify(tx, db, cur.orgId, 'quote-viewed', 'Quote ' + cur.quoteNo + ' was opened by ' + (cur.customer.company || cur.customer.name || 'the customer') + '.', cur);
    return cur;
  });
  if (statusChanged) await mirror(db, r);
  return { quote: Q.customerView(r) };
}
async function tellRep(db, r, o) {
  try {
    var orgRec = data(await db.collection('omega_orgs').doc(r.orgId).get()), s = r.seller || {}, rep = (s.rep && s.rep.email) || r.createdBy;
    if (!Q.email(rep) || !MAIL.configured()) return;
    /* a white label's own verified sending address when it has one */
    var wl = orgRec && orgRec.whiteLabel, from = WL.isOn(wl) ? Q.email(wl.embed && wl.embed.mailFrom) : '';
    await MAIL.templates.quoteDecision(Object.assign({ email: Q.email(rep), from: from || undefined, brand: { name: s.name, accent: s.accent, attribution: '' }, quoteNo: r.quoteNo,
      customerName: r.customer && r.customer.name, company: r.customer && r.customer.company, url: deskUrl(orgRec, r.id), replyTo: Q.email(r.customer && r.customer.email) || undefined }, o));
  } catch (e) { console.error('[customer-quote] rep mail', e && e.message); }
}
async function approve(db, req, b, now) {
  E.rateLimit('cq-act:' + clientIp(req), 10);
  if (!Q.validId(b.id)) fail(404, 'Quote not found');
  var name = str(b.name, 120), title = str(b.title, 120), mail = b.email == null || b.email === '' ? '' : Q.email(b.email);
  if (name.length < 2) fail(400, 'Type your name to approve the quote');
  if (b.email != null && b.email !== '' && !mail) fail(400, 'Enter your email address as name@company.com');
  if (b.agree !== true) fail(400, 'Tick the box to approve the quote as shown');
  if (typeof b.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(b.snapshot)) fail(400, 'Reload the quote and approve it again');
  var ref = coll(db).doc(b.id), outcome = 'approved';
  var r = await db.runTransaction(async function (tx) {
    var cur = await openPublic(tx, ref, b.id, b.key);
    if (cur.status === 'approved') { outcome = 'already'; return cur; }
    if (Q.expired(cur, now)) { tx.update(ref, { status: 'expired', updatedAt: now }); outcome = 'expired'; return cur; }
    Q.transition(cur, 'approved', now);
    if (b.snapshot !== cur.snapshot) fail(409, 'This quote changed since it was opened; reload it and review it again before approving.');
    var acc = Object.assign({}, cur.acceptance, { approvedAt: now, approvedBy: { name: name, title: title, email: mail }, ipHash: Q.ipHash(clientIp(req), cur.orgId),
      ua: str((req.headers || {})['user-agent'], 200), agreedSnapshot: b.snapshot });
    var next = Object.assign({}, cur, { status: 'approved', acceptance: acc, updatedAt: now, updatedBy: 'customer', history: history(cur, { at: now, by: 'customer', action: 'approved', name: name }) });
    tx.set(ref, next);
    event(tx, db, cur.id, 'customer', 'Approved by ' + name + (title ? ', ' + title : ''));
    notify(tx, db, cur.orgId, 'quote-approved', 'Quote ' + cur.quoteNo + ' was approved by ' + name + (cur.customer.company ? ' (' + cur.customer.company + ')' : '') + '.', cur);
    tx.create(db.collection('omega_audit').doc(), { action: 'customer-quote-approve', orgId: cur.orgId, quoteId: cur.id, projectId: cur.projectId, by: 'customer', name: name, at: new Date(now).toISOString(), rev: cur.rev, snapshot: b.snapshot });
    return next;
  });
  if (outcome === 'expired') { r.status = 'expired'; await mirror(db, r); fail(409, 'This quote expired on ' + new Date(r.acceptance.validUntil).toISOString().slice(0, 10) + '; ask for a new one.'); }
  if (outcome === 'already') {
    /* a retried approval makes no second order; a hand-off that never ran gets its run */
    if (!r.handoff) r.handoff = await runHandoff(db, r, 'customer', now);
    return { ok: true, repeat: true, quote: Q.customerView(r) };
  }
  r.handoff = await runHandoff(db, r, 'customer', now);
  await mirror(db, r);
  /* the order is the seller's own: the mail says it is with its own office */
  await tellRep(db, r, { decision: 'approved', approvedBy: name + (title ? ', ' + title : ''), orderNo: r.handoff.orderNo, manufacturer: r.handoff.orderNo ? 'your Omega Logic office' : null, handoffError: r.handoff.error });
  return { ok: true, quote: Q.customerView(r) };
}
async function decline(db, req, b, now) {
  E.rateLimit('cq-act:' + clientIp(req), 10);
  if (!Q.validId(b.id)) fail(404, 'Quote not found');
  var reason = Q.para(b.reason, 1000), ref = coll(db).doc(b.id), outcome = 'declined';
  var r = await db.runTransaction(async function (tx) {
    var cur = await openPublic(tx, ref, b.id, b.key);
    if (cur.status === 'declined') { outcome = 'already'; return cur; }
    Q.transition(cur, 'declined', now);
    var next = Object.assign({}, cur, { status: 'declined', updatedAt: now, updatedBy: 'customer', acceptance: Object.assign({}, cur.acceptance, { declinedAt: now, declineReason: reason }),
      history: history(cur, { at: now, by: 'customer', action: 'declined' }) });
    tx.set(ref, next);
    event(tx, db, cur.id, 'customer', 'Declined by the customer' + (reason ? ': ' + reason.slice(0, 200) : ''));
    notify(tx, db, cur.orgId, 'quote-declined', 'Quote ' + cur.quoteNo + ' was declined' + (cur.customer.company ? ' by ' + cur.customer.company : '') + '.', cur);
    tx.create(db.collection('omega_audit').doc(), { action: 'customer-quote-decline', orgId: cur.orgId, quoteId: cur.id, projectId: cur.projectId, by: 'customer', at: new Date(now).toISOString(), rev: cur.rev });
    return next;
  });
  if (outcome === 'declined') { await mirror(db, r); await tellRep(db, r, { decision: 'declined', reason: reason }); }
  return { ok: true, repeat: outcome === 'already', quote: Q.customerView(r) };
}
async function question(db, req, b, now) {
  E.rateLimit('cq-act:' + clientIp(req), 10);
  if (!Q.validId(b.id)) fail(404, 'Quote not found');
  var message = Q.para(b.message, 2000), from = b.email == null || b.email === '' ? '' : Q.email(b.email);
  if (message.length < 2) fail(400, 'Type your question');
  if (b.email != null && b.email !== '' && !from) fail(400, 'Enter your email address as name@company.com');
  var ref = coll(db).doc(b.id);
  var r = await db.runTransaction(async function (tx) {
    var cur = await openPublic(tx, ref, b.id, b.key), acc = cur.acceptance || {};
    if (['sent', 'viewed', 'expired'].indexOf(cur.status) < 0) fail(409, 'This quote is ' + cur.status + '; reply to the email you received instead.');
    /* the cap counts this LINK's questions (a resend opens ten more); the
       text of every question stays on the record, the last QUESTIONS_KEPT,
       through every edit and resend (a record from before 2026-10-17 kept
       its questions on the acceptance block: counted, then carried) */
    var asked = typeof acc.questionCount === 'number' && isFinite(acc.questionCount) ? acc.questionCount : (Array.isArray(acc.questions) ? acc.questions.length : 0);
    if (asked >= Q.QUESTION_CAP) fail(429, 'This quote has had ' + asked + ' questions; reply to the email you received instead.');
    var qs = Q.questionsOf(cur).concat([{ at: now, message: message, email: from, rev: cur.rev || 1, sentAt: typeof acc.sentAt === 'number' ? acc.sentAt : null }]).slice(-Q.QUESTIONS_KEPT);
    tx.update(ref, { questions: qs, 'acceptance.questionCount': asked + 1, updatedAt: now });
    /* the question's own words, in the quote's log (the seller's view) */
    event(tx, db, cur.id, 'customer', 'Question from the customer: ' + (message.length > 240 ? message.slice(0, 240) + '…' : message), { message: message, email: from || null });
    notify(tx, db, cur.orgId, 'quote-question', 'A question about quote ' + cur.quoteNo + ' from ' + (cur.customer.company || cur.customer.name || 'the customer') + '.', cur);
    cur.questions = qs; cur.acceptance = Object.assign({}, acc, { questionCount: asked + 1 }); cur.updatedAt = now;
    return cur;
  });
  await tellRep(db, r, { decision: 'question', message: message, replyTo: from || Q.email(r.customer && r.customer.email) || undefined });
  return { ok: true, questions: r.acceptance.questionCount };
}

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') fail(405, 'GET or POST required');
  var now = Date.now(), input = req.method === 'GET' ? (req.query || {}) : req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'a JSON object is required');
  var db = A.db();
  /* the public branch runs BEFORE sign-in: the key is the credential */
  if (req.method === 'GET' && input.key) return publicView(db, req, input, now);
  if (req.method === 'POST') {
    var action = input.action;
    if (TENANT_ACTIONS.indexOf(action) < 0 && PUBLIC_ACTIONS.indexOf(action) < 0) fail(400, 'action must be one of ' + TENANT_ACTIONS.concat(PUBLIC_ACTIONS).join(', '));
    if (Object.keys(input).some(function (k) { return FIELDS[action].indexOf(k) < 0; })) fail(400, 'Unsupported field');
    if (action === 'approve') return approve(db, req, input, now);
    if (action === 'decline') return decline(db, req, input, now);
    if (action === 'question') return question(db, req, input, now);
  }
  var caller = await A.authenticate(req);
  if (req.method === 'GET') return tenantGet(db, caller, input, now);
  switch (input.action) {
    case 'preview': return compose(db, caller, input, now, false);
    case 'save': return compose(db, caller, input, now, true);
    case 'send': return send(db, caller, input, now);
    case 'withdraw': return withdraw(db, caller, input, now);
    case 'handoff': return handoff(db, caller, input, now);
  }
});
module.exports._helpers = { tenantCatalog: tenantCatalog, unitsFor: unitsFor, siteOf: siteOf, sourceHash: sourceHash, sellerOf: sellerOf };
