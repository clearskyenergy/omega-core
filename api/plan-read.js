/* POST /api/plan-read — read a customer's plan set, one sheet at a time.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body: { action: 'read',  fileName, sheet: { page, of, text, image } }
         { action: 'check', sheets: [ the 'read' answers ] }

   ── TWO STEPS, ONE DOOR ──
   read   one sheet: the browser renders the PDF page to a JPEG and pulls
          its text layer (pdf.js, omega-plan-read.js); this sends both to
          the model with api/_lib/plan-read.js's prompt and schema and
          returns the sheet normalised: every item and fact with the words
          it was read from and where on the sheet they are. The same sheet
          read again (same image, same text) is answered from the workspace's
          own cache and costs nothing.
   check  the sheets together: the same unit on the site plan and the
          single-line merged into one, and every place two sheets disagree
          (api/_lib/plan-read.js check). Pure; nothing is called or stored.

   Nothing here touches the drawing. The editor places what a person ticks,
   through its own tools.

   ── WHO ──
   A signed-in person of a workspace whose plan opens Site Map (a package:
   Omega Design, which every package holds; a legacy plan: the editor, as
   its own gate reads it), not a disabled member or a viewer (a package's
   viewer is read-only), not a workspace that is
   pending, suspended or cancelled, with a verified email or as an owner or
   administrator of an active client (admin.clientAdmin, as on plan-change).
   Reading costs ClearSky money per sheet, so a workspace reads at most
   PER_ORG_DAY sheets and a person PER_USER_DAY each day (UTC), counted in a
   transaction on omega_orgs/{org}/plan_read_counters/{day}; a cached sheet
   is free and a failed read gives its place back. Staff are capped at
   STAFF_DAY. The counters and the cache (omega_orgs/{org}/plan_reads) are
   Admin SDK only: the rules close both.

   ── WHICH MODEL ──
   OMEGA_PLAN_MODEL, else Claude Opus 5.5; the effort is OMEGA_PLAN_EFFORT,
   else medium. Never from the request body: a browser does not pick what
   ClearSky pays for. The key is the workspace's own AI_KEY_<ORG>, else
   ANTHROPIC_API_KEY, the same order as the bill reader. A refusal is
   retried on Anthropic's recommended fallback (fallbacks: "default");
   OMEGA_PLAN_FALLBACKS=off turns that off. */
'use strict';
var crypto = require('crypto');
var A = require('./_lib/admin');
var P = require('./_lib/plan-read');
var AIERR = require('./_lib/ai-errors');

var PER_ORG_DAY = 80, PER_USER_DAY = 50, STAFF_DAY = 300;
var MAX_IMAGE_BYTES = 3600000, MAX_TEXT = 24000, MAX_SHEETS = 60, TIMEOUT_MS = 55000;
var CLOSED = ['pending', 'suspended', 'cancelled'];

function str(v, max) { v = (typeof v === 'string' || typeof v === 'number') ? String(v) : ''; return v.replace(/\r/g, '').trim().slice(0, max || 200); }
function data(s) { return s && s.exists ? (s.data() || {}) : null; }
function today(now) { return new Date(now).toISOString().slice(0, 10); }
function model() { return process.env.OMEGA_PLAN_MODEL || 'claude-opus-5-5'; }
function keyFor(org) {
  var name = 'AI_KEY_' + String(org).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (process.env[name]) return { key: process.env[name], source: 'tenant' };
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'platform' };
  return null;
}

/* The plan behind the button: the caller's own workspace opens Site Map. */
async function entitle(caller) {
  var org = A.safeOrg(caller.orgId);
  if (!org) throw A.httpError(403, 'No workspace on this account.');
  if (caller.staff) return { org: org };
  var db = A.db(), root = db.collection('omega_orgs').doc(org), records;
  try {
    records = await Promise.all([root.get(), root.collection('billing').doc('current').get(), root.collection('members').doc(caller.uid).get()]);
  } catch (e) { throw A.httpError(503, 'Could not check this workspace\'s plan right now; try again in a minute.'); }
  var rec = data(records[0]), bill = data(records[1]) || {}, member = data(records[2]);
  if (rec && CLOSED.indexOf(rec.status) >= 0) throw A.httpError(403, 'This workspace is not active.');
  if (bill.packaged === true) {
    var access = require('./_lib/package-access');
    try { access.requireModule(access.project(caller, bill, rec, member, Date.now()), 'lite', { produce: true }); }
    catch (e) { throw A.httpError(e.status || 403, (e.message || 'Not in your package') + ' — reading a plan set is part of Omega Design.'); }
  } else {
    if (member && member.status && member.status !== 'active') throw A.httpError(403, 'Your membership of this workspace is not active.');
    if (member && member.role === 'viewer') throw A.httpError(403, 'A viewer cannot read plan sets; ask your workspace admin.');
    if (member && Array.isArray(member.toolAccess) && member.toolAccess.indexOf('editor') < 0) throw A.httpError(403, 'Your account does not include Site Map; ask your workspace admin for access.');
    var AD = require('./_lib/addons'), ctx = AD.judge(org, bill, AD.live(bill, Date.now())).ctx;
    var editor = !ctx.tool || !ctx.tool('editor') || !ctx.canOpen || ctx.canOpen('editor');
    if (!editor) throw A.httpError(403, 'Site Map is not in this workspace\'s product.');
  }
  if (!(caller.claims && caller.claims.email_verified === true) && !(await A.clientAdmin(caller, org))) {
    throw A.httpError(403, 'Verify your email address to read plan sets (the link is in your inbox; Account › Resend if it is not).');
  }
  return { org: org };
}

/* Hold one place in today's count, or refuse. Returns the counts after. */
async function reserve(db, org, caller, now) {
  var ref = db.collection('omega_orgs').doc(org).collection('plan_read_counters').doc(today(now));
  return db.runTransaction(async function (tx) {
    var c = data(await tx.get(ref)) || { n: 0, users: {} }, users = c.users || {}, mine = users[caller.uid] || 0;
    var orgCap = caller.staff ? STAFF_DAY : PER_ORG_DAY, userCap = caller.staff ? STAFF_DAY : PER_USER_DAY;
    if ((c.n || 0) >= orgCap) throw A.httpError(429, 'This workspace has read ' + orgCap + ' sheets today, the daily limit. Sheets already read open again for free; new ones can be read tomorrow.');
    if (mine >= userCap) throw A.httpError(429, 'You have read ' + userCap + ' sheets today, the daily limit for one person. Sheets already read open again for free.');
    users[caller.uid] = mine + 1;
    tx.set(ref, { n: (c.n || 0) + 1, users: users, day: today(now), updatedAt: now });
    return { used: (c.n || 0) + 1, of: orgCap };
  });
}
/* A read that failed gives its place back (best effort: a lost release only
   costs the workspace one sheet of today's allowance). */
async function release(db, org, caller, now) {
  var ref = db.collection('omega_orgs').doc(org).collection('plan_read_counters').doc(today(now));
  try {
    await db.runTransaction(async function (tx) {
      var c = data(await tx.get(ref)); if (!c) return;
      var users = c.users || {}; users[caller.uid] = Math.max(0, (users[caller.uid] || 0) - 1);
      tx.set(ref, { n: Math.max(0, (c.n || 0) - 1), users: users, day: c.day || today(now), updatedAt: now });
    });
  } catch (e) { console.error('[plan-read] release', e && e.message); }
}

function image(dataUrl) {
  var m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw A.httpError(400, 'Each sheet is sent as a JPEG or PNG image.');
  var bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw A.httpError(413, 'That sheet image is too large to read; it is sent at 2,400 pixels on its long side.');
  var jpeg = bytes[0] === 0xff && bytes[1] === 0xd8, png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if ((m[1] === 'image/jpeg' && !jpeg) || (m[1] === 'image/png' && !png)) throw A.httpError(400, 'That sheet image is not a JPEG or PNG.');
  return { mediaType: m[1], base64: m[2], bytes: bytes };
}

async function callModel(key, body, staff) {
  var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
  var headers = { 'content-type': 'application/json', 'x-api-key': key.key, 'anthropic-version': '2023-06-01' };
  if (body.fallbacks) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  if (process.env.ANTHROPIC_WORKSPACE_ID) headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
  var r, out;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
    out = await r.json();
  } catch (e) {
    throw A.httpError(504, e && e.name === 'AbortError' ? 'Reading this sheet took too long. Try it again; a very dense sheet can be split out of the PDF and read on its own.' : 'Could not reach the plan reader. Try again in a minute.');
  } finally { if (timer) clearTimeout(timer); }
  if (!r.ok) {
    var raw = (out && out.error && out.error.message) || '';
    console.error('[plan-read] upstream', r.status, raw);
    var f = AIERR.aiFailure(r.status, raw, { subject: 'The plan reader', staff: !!staff, staffHint: 'check the ' + key.source + ' AI key on the deployment' });
    throw A.httpError(f.status, f.message);
  }
  if (out.stop_reason === 'refusal') throw A.httpError(422, 'The plan reader declined this sheet. Draw it by hand, or try the next sheet.');
  if (out.stop_reason === 'max_tokens') throw A.httpError(502, 'This sheet holds more than one read can return. Read it again; if it fails twice, split it out of the PDF.');
  var text = (out.content || []).filter(function (b) { return b && b.type === 'text'; }).map(function (b) { return b.text; }).join('\n');
  var parsed = P.parse(text);
  if (!parsed) throw A.httpError(502, 'The plan reader returned something this page could not use. Try the sheet again.');
  return { raw: parsed, usage: out.usage || null, served: out.model || body.model };
}

module.exports = A.handler(async function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = (req.body && typeof req.body === 'object') ? req.body : {};
  var action = str(b.action || 'read', 8);
  if (['read', 'check'].indexOf(action) < 0) throw A.httpError(400, 'action must be read or check');
  var caller = await A.authenticate(req);

  if (action === 'check') {
    var list = Array.isArray(b.sheets) ? b.sheets.slice(0, MAX_SHEETS) : [];
    if (!list.length) throw A.httpError(400, 'No sheets to check.');
    return { ok: true, result: P.check(list.map(P.revive)) };
  }

  var ent = await entitle(caller);
  var key = keyFor(ent.org);
  if (!key) throw A.httpError(503, 'Plan reading is not switched on for this deployment yet (no AI key). Nothing was read or counted.');
  var s = (b.sheet && typeof b.sheet === 'object') ? b.sheet : {};
  var page = Math.max(1, Math.min(999, Math.floor(+s.page || 1))), of = Math.max(page, Math.min(999, Math.floor(+s.of || page)));
  var img = image(s.image), text = str(s.text, MAX_TEXT), fileName = str(b.fileName, 160) || 'plan set';
  var db = A.db(), now = Date.now();
  var hash = crypto.createHash('sha256').update(img.bytes).update('\n' + text + '\n' + P.VERSION).digest('hex');
  var cacheRef = db.collection('omega_orgs').doc(ent.org).collection('plan_reads').doc(hash);
  var hit = data(await cacheRef.get());
  if (hit && hit.version === P.VERSION && hit.raw) return { ok: true, cached: true, sheet: P.normalize(hit.raw, { page: page }) };

  var count = await reserve(db, ent.org, caller, now), answer;
  try {
    answer = await callModel(key, P.request({ page: page, of: of, fileName: fileName, text: text, mediaType: img.mediaType, imageBase64: img.base64 },
      { model: model(), effort: process.env.OMEGA_PLAN_EFFORT || 'medium', fallbacks: process.env.OMEGA_PLAN_FALLBACKS !== 'off' }), caller.staff);
  } catch (e) { await release(db, ent.org, caller, now); throw e; }
  var sheet = P.normalize(answer.raw, { page: page });
  try {
    await cacheRef.set({ version: P.VERSION, raw: answer.raw, model: answer.served, usage: answer.usage, uid: caller.uid, fileName: fileName, page: page, at: now });
  } catch (e) { console.error('[plan-read] cache write', e && e.message); }
  return { ok: true, cached: false, sheet: sheet, today: count };
});
module.exports.limits = { PER_ORG_DAY: PER_ORG_DAY, PER_USER_DAY: PER_USER_DAY, STAFF_DAY: STAFF_DAY };
