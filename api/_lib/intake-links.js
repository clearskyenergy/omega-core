/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/intake-links.js — shareable site-intake links for the OSA portfolio
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHAT A LINK IS. A row in intake_links/{il_…} (Admin SDK only; firestore.rules
   closes the collection explicitly). The id IS the link: /site-intake?l=il_…
   Anyone holding it can file ONE kind of thing — a site, into the portfolio's
   `deals`, at stage `referred`, originated by the org the link was made for,
   channel 'Intake link'. Nothing else: a link reads nothing back, never
   matches or updates an existing deal, and never touches attribution, stage
   or money. A leaked link costs at most its daily cap of referrals, and its
   maker revokes it in one click.

   WHO MAKES ONE (manager()):
     - ClearSky staff (a verified @clearsky-usa.com token): any org;
     - an OSA portfolio owner or administrator (omega_users role owner|admin,
       active): any org — the same people who may set attribution there;
     - a limited administrator: the orgs named on their account, and their own;
     - a partner administrator: their own org only;
     - the JV's agent key with sites:write (api/agent/intake-links.js): the
       key's own org; an admin key, any org.
   Mirrors ROLES[].can in tenants/osa/access-data.js (approve_any,
   approve_scoped, approve_own_org), checked here because a hidden button is
   not a gate.

   WHAT A SUBMISSION BECOMES is newDealDoc() in agent-sites.js — the same deal
   the agent's uploadSites and the portfolio's own Add write — with the
   submitter as the contact and `intake{}` saying which link it came through.
   The outline (a KMZ/KML from Google Earth) goes through the ONE reader,
   agent-sites.uploadOutline.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
var A = require('./admin');
var Auth = require('./agent-auth');
var S = require('./agent-sites');

var COLLECTION = 'intake_links';
var ID_RE = /^il_[0-9a-f]{32}$/;
var DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
var EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
var DEFAULT_CAP = 50, MAX_CAP = 200;
var MAX_FILE_B64 = 4 * 1024 * 1024;   /* ~3 MB of KMZ; Vercel's body limit is 4.5 MB */
var MAX_LIST = 200;
var CHANNEL = 'Intake link';
var MANAGE_ANY = { owner: 1, admin: 1 };

function str(v) { return String(v == null ? '' : v).trim(); }
function lower(v) { return str(v).toLowerCase(); }
function stamp() { return new Date().toISOString(); }
function mintId() { return 'il_' + crypto.randomBytes(16).toString('hex'); }
function looksLikeId(s) { return ID_RE.test(String(s || '')); }
function urlFor(base, id) { return String(base || '') + '/site-intake?l=' + id; }
/* What the submitter is told: six characters of its own, stored on the deal
   (intake.reference) so the office can find it, and never part of a deal id. */
function mintReference() {
  var A32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = crypto.randomBytes(6), out = '';
  for (var i = 0; i < 6; i++) out += A32[b[i] % A32.length];
  return out;
}

/* ── who may make, list and revoke links ───────────────────────────────── */
/* Resolves { by, email, uid, anyOrg, orgs[], orgId, agent }. */
function manager(req) {
  var h = (req.headers && req.headers.authorization) || '';
  var m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  if (m && Auth.looksLikeKey(m[1].trim())) {
    return Auth.authenticate(req).then(function (k) {
      Auth.requireScope(k, 'sites:write');
      return { agent: true, by: 'agent:' + (k.label || k.keyId.slice(0, 8)), email: '', uid: '',
               anyOrg: k.admin === true, orgId: k.orgId, orgs: [k.orgId] };
    });
  }
  return A.authenticate(req).then(function (c) {
    if (c.staff) return { agent: false, by: c.email, email: c.email, uid: c.uid, anyOrg: true, orgId: lower(c.orgId), orgs: [] };
    return A.db().collection('omega_users').doc(c.uid).get().then(function (s) {
      var u = s.exists ? (s.data() || {}) : null;
      if (!u) throw A.httpError(403, 'you do not have an account in the OSA workspace');
      if (u.status && u.status !== 'active') throw A.httpError(403, 'your account is ' + u.status);
      var own = lower(u.orgId || A.orgOf(c.email));
      var base = { agent: false, by: c.email, email: c.email, uid: c.uid, orgId: own };
      if (MANAGE_ANY[u.role]) return Object.assign(base, { anyOrg: true, orgs: [] });
      if (u.role === 'limited_admin') {
        var scoped = (u.manageOrgs || []).map(lower).filter(Boolean);
        if (scoped.indexOf(own) < 0) scoped.push(own);
        return Object.assign(base, { anyOrg: false, orgs: scoped });
      }
      if (u.role === 'partner_admin') return Object.assign(base, { anyOrg: false, orgs: [own] });
      throw A.httpError(403, 'only an administrator can make intake links');
    });
  });
}
function mayUse(mgr, orgId) { return mgr.anyOrg || mgr.orgs.indexOf(lower(orgId)) >= 0; }

/* What a manager sees of a link. */
function view(id, d, base) {
  d = d || {};
  return { id: id, url: urlFor(base, id), orgId: d.orgId || '', partnerName: d.partnerName || '', label: d.label || '',
           active: d.active !== false && !(d.expiresAt && Date.parse(d.expiresAt) < Date.now()),
           revoked: d.active === false, expiresAt: d.expiresAt || null, dailyCap: d.dailyCap || DEFAULT_CAP,
           count: d.count || 0, lastSubmittedAt: d.lastSubmittedAt || null,
           createdAt: d.createdAt || null, createdBy: (d.createdBy || {}).by || '' };
}

function create(mgr, body, base) {
  body = body || {};
  var orgId = lower(body.org || body.orgId) || mgr.orgId;
  if (!orgId || !DOMAIN_RE.test(orgId)) throw A.httpError(400, 'org must be an email domain, e.g. ogisolar.com');
  if (!mayUse(mgr, orgId)) throw A.httpError(403, 'you may make links only for ' + (mgr.orgs.join(', ') || 'your own organisation'));
  var label = str(body.label).slice(0, 80);
  if (!label) throw A.httpError(400, 'give the link a label, e.g. "Landowner outreach — Texas"');
  var cap = body.dailyCap == null || body.dailyCap === '' ? DEFAULT_CAP : Math.floor(Number(body.dailyCap));
  if (!(cap >= 1 && cap <= MAX_CAP)) throw A.httpError(400, 'dailyCap must be 1 to ' + MAX_CAP);
  var expiresAt = null;
  if (body.expiresAt) {
    var t = Date.parse(body.expiresAt);
    if (isNaN(t) || t <= Date.now()) throw A.httpError(400, 'expiresAt must be a future date');
    if (t > Date.now() + 366 * 86400000) throw A.httpError(400, 'a link lasts at most a year');
    expiresAt = new Date(t).toISOString();
  }
  var db = A.db();
  return db.collection('omega_partner_orgs').doc(orgId).get().then(function (o) {
    var known = o.exists ? (o.data() || {}) : {};
    var id = mintId();
    var doc = {
      orgId: orgId, partnerName: str(body.partnerName).slice(0, 120) || str(known.name).slice(0, 120),
      label: label, active: true, expiresAt: expiresAt, dailyCap: cap,
      count: 0, day: '', dayCount: 0, lastSubmittedAt: null,
      /* who to tell when a site comes in: the person who made it, never an
         address from the public form (an open form that mails a typed
         address is a spam relay) */
      notify: mgr.email ? lower(mgr.email) : '',
      createdBy: { by: mgr.by, email: lower(mgr.email), uid: mgr.uid || '' }, createdAt: stamp()
    };
    return db.collection(COLLECTION).doc(id).set(doc).then(function () { return view(id, doc, base); });
  });
}

function list(mgr, base) {
  var db = A.db(), col = db.collection(COLLECTION);
  var queries = mgr.anyOrg ? [col.limit(MAX_LIST)] : mgr.orgs.map(function (o) { return col.where('orgId', '==', o).limit(MAX_LIST); });
  return Promise.all(queries.map(function (q) { return q.get(); })).then(function (snaps) {
    var out = [], seen = {};
    snaps.forEach(function (snap) {
      snap.forEach(function (d) { if (seen[d.id]) return; seen[d.id] = 1; out.push(view(d.id, d.data(), base)); });
    });
    out.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    return { ok: true, links: out };
  });
}

function revoke(mgr, id) {
  if (!looksLikeId(id)) throw A.httpError(400, 'id must be a link id (il_…)');
  var ref = A.db().collection(COLLECTION).doc(id);
  return ref.get().then(function (s) {
    if (!s.exists || !mayUse(mgr, (s.data() || {}).orgId)) throw A.httpError(404, 'no such link');
    return ref.update({ active: false, revokedAt: stamp(), revokedBy: mgr.by }).then(function () {
      return { ok: true, id: id, revoked: true };
    });
  });
}

/* ── the public side ───────────────────────────────────────────────────── */
/* A link that may take a submission, or a 404/410 that says nothing more. */
function resolve(id) {
  if (!looksLikeId(id)) return Promise.reject(A.httpError(404, 'this link is not recognised'));
  return A.db().collection(COLLECTION).doc(id).get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'this link is not recognised');
    var d = s.data() || {};
    if (d.active === false) throw A.httpError(410, 'this link has been closed; ask whoever sent it for a new one');
    if (d.expiresAt && Date.parse(d.expiresAt) < Date.now()) throw A.httpError(410, 'this link has expired; ask whoever sent it for a new one');
    return { id: id, data: d };
  });
}

/* Validate a public submission. Returns { spam } | { ok:false, error } | { ok:true, site, submitter }. */
function validateSubmission(body) {
  body = body || {};
  if (str(body.website)) return { spam: true };       /* the field a person never sees */
  var who = body.submitter || {}, raw = body.site || {};
  var name = str(who.name).slice(0, 120), email = lower(who.email).slice(0, 160);
  if (!name) return { ok: false, error: 'your name is required' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'a valid email address is required' };
  if (raw.kmzBase64 != null && (typeof raw.kmzBase64 !== 'string' || raw.kmzBase64.length > MAX_FILE_B64))
    return { ok: false, error: 'the map file must be under 3 MB' };
  /* Only the fields the form has. Never externalId (it would let a stranger
     address a deal) and never an outline array (the file is the outline). */
  var v = S.validateSite({
    name: raw.name, address: raw.address, state: raw.state, lat: raw.lat, lng: raw.lng, acres: raw.acres,
    sizeMw: raw.sizeMw, sizeMwh: raw.sizeMwh, projectType: raw.projectType, notes: raw.notes,
    kml: raw.kml, kmzBase64: raw.kmzBase64, fileName: raw.fileName,
    contactName: name, contactEmail: email
  });
  if (!v.ok) return v;
  if (!v.site.address && v.site.lat == null && !v.site.kml && !v.site.kmzBase64)
    return { ok: false, error: 'give the site an address, coordinates or a Google Earth file' };
  return { ok: true, site: v.site, submitter: {
    name: name, email: email, company: str(who.company).slice(0, 120), phone: str(who.phone).slice(0, 40)
  } };
}

/* Take one place in the link's day, in a transaction. Re-checks the link
   inside it so a revoke between resolve() and here still wins. */
function claim(id) {
  var db = A.db(), ref = db.collection(COLLECTION).doc(id), at = stamp(), day = at.slice(0, 10);
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (s) {
      var d = s.exists ? (s.data() || {}) : null;
      if (!d || d.active === false) throw A.httpError(410, 'this link has been closed; ask whoever sent it for a new one');
      var n = d.day === day ? Number(d.dayCount || 0) : 0;
      if (n >= Number(d.dailyCap || DEFAULT_CAP)) throw A.httpError(429, 'this link has taken all the sites it can today; try again tomorrow');
      tx.update(ref, { day: day, dayCount: n + 1, count: Number(d.count || 0) + 1, lastSubmittedAt: at });
      return true;
    });
  });
}

/* The deal a submission becomes. `link` is resolve()'s answer. */
function dealFor(link, site, submitter, outline, grid) {
  var d = link.data, who = submitter.name + (submitter.company ? ' (' + submitter.company + ')' : '');
  var caller = { orgId: d.orgId, partnerName: d.partnerName || '', label: 'intake link "' + d.label + '"' };
  var doc = S.newDealDoc(site, caller, outline, grid, 'intake:' + link.id.slice(3, 11) + ':' + Date.now(), {
    channel: CHANNEL,
    said: 'Submitted by ' + who + ' <' + submitter.email + '> through the intake link "' + d.label + '".',
    note: 'Submitted through intake link "' + d.label + '"'
  });
  doc.intake = { linkId: link.id, label: d.label, reference: mintReference(), submittedAt: stamp(),
                 submitter: { name: submitter.name, email: submitter.email, company: submitter.company, phone: submitter.phone } };
  return doc;
}

module.exports = {
  COLLECTION: COLLECTION, CHANNEL: CHANNEL, DEFAULT_CAP: DEFAULT_CAP, MAX_FILE_B64: MAX_FILE_B64,
  looksLikeId: looksLikeId, urlFor: urlFor, manager: manager, mayUse: mayUse, view: view,
  create: create, list: list, revoke: revoke, resolve: resolve,
  validateSubmission: validateSubmission, claim: claim, dealFor: dealFor
};
