/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  /api/logic-kit              every Omega Logic subscriber with its kit
        ?org=<orgId>                one workspace: items, guides, ready
                                    messages per audience, the send log
   POST /api/logic-kit { org, action: 'sent', audience, to, channel, note }
                                    log that a kit went out (Jarvis or a
                                    person), under omega_orgs/{org}/kit_sends

   ClearSky owner only (logic-access.requireOwner): this is where ClearSky
   keeps track of what each customer was given, not a tenant page. The
   list itself is api/_lib/kit.js; nothing here invents an address. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), K = require('./_lib/kit'), L = require('./_lib/logic-admin');
function clean(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 160); }
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req); X.requireOwner(caller);
  var db = A.db(), b = req.body || {}, org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org), now = new Date().toISOString();
  function kitOf(id, d) { return K.forOrg(id, { name: d.name || id, host: Array.isArray(d.domains) && d.domains[0] && d.domains[0] !== 'silmarillion.clearskyomega.com' && d.hostAttached === true ? d.domains[0] : null }); }
  if (req.method === 'GET') {
    if (!org) {
      var all = await db.collection('omega_orgs').orderBy('__name__').limit(300).get(), rows = [];
      all.forEach(function (s) { var d = s.data(); if (d.supersededBy) return; if (req.query.all === '1' || L.isLogic(d)) rows.push({ id: s.id, name: d.name || s.id, status: d.status || 'active', domains: d.domains || [] }); });
      return { owner: true, subscribers: rows, guides: K.GUIDES.map(function (g) { return { key: g.key, name: g.name, audience: g.audience, covers: g.covers, url: K.ORIGIN + g.path }; }), items: K.ITEMS.map(function (i) { return { key: i.key, name: i.name, audience: i.audience, kind: i.kind, path: i.path, sandbox: i.sandbox ? K.ORIGIN + i.sandbox : null, guide: i.guide ? K.ORIGIN + i.guide : null }; }) };
    }
    var snap = await db.collection('omega_orgs').doc(org).get(); if (!snap.exists) throw A.httpError(404, 'No tenant record for ' + org);
    var d = snap.data(), kit = kitOf(org, d), sends = await db.collection('omega_orgs').doc(org).collection('kit_sends').orderBy('at', 'desc').limit(100).get();
    return { owner: true, org: org, name: d.name || org, status: d.status || 'active', brand: require('./_lib/logic-brand')(d), kit: kit,
      messages: { plant: K.message(kit, 'plant'), office: K.message(kit, 'office'), customer: K.message(kit, 'customer') },
      sends: sends.docs.map(function (s) { return Object.assign({ id: s.id }, s.data()); }) };
  }
  if (b.action !== 'sent') throw A.httpError(400, 'Unknown kit action');
  if (!org) throw A.httpError(400, 'org required');
  var audience = ['plant', 'office', 'customer', 'all'].indexOf(b.audience) >= 0 ? b.audience : null; if (!audience) throw A.httpError(400, 'audience must be plant, office, customer or all');
  var to = clean(b.to, 200); if (!to) throw A.httpError(400, 'Say who it went to');
  var rec = { orgId: org, audience: audience, to: to, channel: ['email', 'sms', 'jarvis', 'in-person', 'other'].indexOf(b.channel) >= 0 ? b.channel : 'email', note: clean(b.note, 500), guides: (Array.isArray(b.guides) ? b.guides : []).map(function (g) { return clean(g, 80); }).slice(0, 8), by: caller.email, at: now };
  var ref = db.collection('omega_orgs').doc(org).collection('kit_sends').doc(); await ref.create(rec);
  return { ok: true, id: ref.id, send: rec };
});
