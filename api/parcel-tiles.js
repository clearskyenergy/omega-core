/* ═══════════════════════════════════════════════════════════════════════════════
   /api/parcel-tiles  —  every parcel line in the country, as map tiles
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   POST  (Bearer ID token)       → { ok:true, ticket, minZoom, source:'Regrid' }
                                   { ok:false, reason:'not-configured' |
                                     'no-tile-access' | 'switched-off' }
   GET   ?z=&x=&y=&t=<ticket>    → one 256 px PNG of parcel lines (Regrid's
                                   own style; the editor recolours it)

   WHY. A customer asked for the map to show "the parcels like what the GIS
   would show and the property boundaries". County GIS draws every lot, but
   only for its own county, and only some counties publish a layer the
   editor can draw (omega-parcel-sources.js lists the ones that do). Regrid
   publishes the same lines for every county in the country as tiles, under
   a Tileserver subscription (https://regrid.com/terms/api: "use Company's
   raster (PNG) and vector (MVT) tiles to show parcel boundaries on
   Customer's … interactive map"). This is that, for the editor's View ›
   Parcel Lines.

   WHY A RELAY AND NOT THE TILE URL IN THE PAGE. Regrid's tiles take the
   account's token in the URL, and it is the same token api/parcel.js spends
   on metered point lookups. In a page it would be in the source, the
   network tab and every tenant's cache. So the page asks here, and this
   asks Regrid with the token it never sends back.

   THE TICKET. A tile request is an <img>: it cannot carry an ID token. The
   POST — a signed-in member of an active workspace — hands out a ticket,
   and a tile is served only with a valid one. The ticket is the SAME for
   everyone in a calendar month (an HMAC of the month under a key derived
   from REGRID_TOKEN; last month's is still honoured across the turn), which
   is what lets Vercel's edge cache one copy of a tile for every customer:
   a block somebody has already looked at this month costs nothing. It is
   accounting and hygiene, not a security boundary — the lines are public
   record and the page that shows them is ours. A leaked ticket is worth a
   month of tiles, and rotating REGRID_TOKEN rotates every ticket.

   WHO. Every active workspace, every plan: Parcel Lines is an Omega Design
   view (api/_lib/modules.js), and the edge cache, not the plan, is the
   spend control. One tenant can be switched off with
   billing/current.toolOverrides.parcelTiles === false. Staff pass.

   ON ONLY WHEN IT WORKS. Without REGRID_TOKEN the POST says
   'not-configured' and the editor keeps drawing the free county layers.
   With a token whose subscription has no tile access, Regrid refuses the
   tile, and one probe (remembered for ten minutes) turns that into
   'no-tile-access' instead of a map full of broken images.

   NOTHING UPSTREAM IS ECHOED. Not the token, not Regrid's error body, not
   the URL that was asked.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
var A = require('./_lib/admin');
var P = require('./parcel.js')._helpers;

var TILE_ROOT = 'https://tiles.regrid.com/api/v1/parcels/';
var MIN_Z = 15, MAX_Z = 21;
var TIMEOUT_MS = 8000;
/* A block in downtown Peoria at z16: parcels on every side, so a working
   subscription always answers it with a picture. */
var PROBE = { z: 16, x: 16454, y: 24649 };
var PROBE_TTL_MS = 10 * 60 * 1000;
var probeMemo = { at: 0, ok: null };

function token() { return process.env.REGRID_TOKEN || ''; }

/* The month a ticket names, as 'YYYY-MM' in UTC. */
function monthOf(ms) { return new Date(ms).toISOString().slice(0, 7); }
function monthBefore(ms) {
  var d = new Date(ms);
  return monthOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}
function key() { return crypto.createHash('sha256').update('omega-parcel-tiles|' + token()).digest(); }
function sign(month) {
  return month + '.' + crypto.createHmac('sha256', key()).update(month).digest('base64')
    .replace(/[+/=]/g, '').slice(0, 24);
}
/* This month's or last month's, exactly; anything else is not a ticket. */
function ticketOk(t, now) {
  if (typeof t !== 'string' || t.length > 64 || !token()) return false;
  var month = t.slice(0, 7);
  if (month !== monthOf(now) && month !== monthBefore(now)) return false;
  var good = sign(month);
  return t.length === good.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(good));
}

/* z/x/y as integers on the map, or null. Below MIN_Z a tile is a smear of
   lines and the most expensive kind to fill, so it is never asked. */
function tileOf(q) {
  var z = Number(q.z), x = Number(q.x), y = Number(q.y);
  if (![z, x, y].every(function (n) { return Number.isInteger(n); })) return null;
  if (z < MIN_Z || z > MAX_Z) return null;
  var n = Math.pow(2, z);
  if (x < 0 || x >= n || y < 0 || y >= n) return null;
  return { z: z, x: x, y: y };
}

function upstreamUrl(t) {
  return TILE_ROOT + t.z + '/' + t.x + '/' + t.y + '.png?token=' + encodeURIComponent(token());
}

/* One PNG, or a thrown error carrying only a status or 'timeout'. */
function fetchTile(t) {
  var ctl = new AbortController();
  var timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
  return fetch(upstreamUrl(t), { signal: ctl.signal, headers: { 'User-Agent': 'ClearSky-OMEGA parcel tiles (https://clearskyomega.com)' } })
    .then(function (r) {
      var type = String(r.headers && r.headers.get ? r.headers.get('content-type') || '' : '');
      if (!r.ok || type.indexOf('image/png') !== 0) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.arrayBuffer();
    })
    .then(function (buf) { clearTimeout(timer); return Buffer.from(buf); },
          function (err) { clearTimeout(timer); throw err; });
}

/* Does this token's subscription draw tiles? Remembered briefly, so a page
   load does not cost a probe and a fixed subscription is seen within ten
   minutes. A probe that times out is not remembered either way. */
function probe(now) {
  if (probeMemo.ok !== null && now - probeMemo.at < PROBE_TTL_MS) return Promise.resolve(probeMemo.ok);
  return fetchTile(PROBE).then(function () { probeMemo = { at: now, ok: true }; return true; },
    function (err) {
      if (err && err.name === 'AbortError') return false;
      probeMemo = { at: now, ok: false };
      console.warn('[parcel-tiles] Regrid refused the probe tile (' + (err && err.message) + ') — no tile access on this token?');
      return false;
    });
}

/* ── POST: a ticket for a signed-in member of an active workspace ───────── */
var issue = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'GET a tile or POST for a ticket');
  return A.authenticate(req).then(function (caller) {
    /* parcel.js's own gate: an inactive or unknown workspace is refused here
       (403), the same as for a point lookup. */
    return P.entitle(caller).then(function () {
      if (!token()) return { ok: false, reason: 'not-configured' };
      var off = caller.staff ? Promise.resolve(false) : A.billingOf(caller.orgId).then(function (bill) {
        return !!(bill && bill.toolOverrides && bill.toolOverrides.parcelTiles === false);
      }, function () { return false; });
      return off.then(function (isOff) {
        if (isOff) return { ok: false, reason: 'switched-off' };
        var now = Date.now();
        return probe(now).then(function (ok) {
          if (!ok) return { ok: false, reason: 'no-tile-access' };
          return { ok: true, ticket: sign(monthOf(now)), minZoom: MIN_Z, maxZoom: MAX_Z, source: 'Regrid' };
        });
      });
    });
  });
});

/* ── GET: one tile ──────────────────────────────────────────────────────── */
function tile(req, res) {
  var q = req.query || {};
  function refuse(status, msg) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json({ error: msg });
  }
  if (!token()) return refuse(404, 'parcel tiles are not set up');
  var t = tileOf(q);
  if (!t) return refuse(400, 'z must be ' + MIN_Z + '–' + MAX_Z + ' and x, y a tile on the map');
  if (!ticketOk(q.t, Date.now())) return refuse(403, 'ticket expired or not valid; POST /api/parcel-tiles for a new one');
  return fetchTile(t).then(function (png) {
    res.setHeader('Content-Type', 'image/png');
    /* A browser keeps it a day; the edge keeps it the rest of the month,
       for everyone holding this month's ticket. */
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400');
    res.statusCode = 200;
    return res.end(png);
  }, function (err) {
    var why = err && err.name === 'AbortError' ? 'timed out' : 'did not answer';
    console.warn('[parcel-tiles] Regrid ' + why + ' for ' + t.z + '/' + t.x + '/' + t.y + (err && err.status ? ' (' + err.status + ')' : ''));
    return refuse(502, 'the parcel tile service ' + why);
  });
}

module.exports = function (req, res) {
  if (req.method === 'GET') return tile(req, res);
  return issue(req, res);
};

/* Pure parts and the probe memo, for scripts/tests/tparceltiles.js. */
module.exports._helpers = {
  monthOf: monthOf, monthBefore: monthBefore, sign: sign, ticketOk: ticketOk, tileOf: tileOf,
  upstreamUrl: upstreamUrl, probe: probe, PROBE: PROBE, MIN_Z: MIN_Z, MAX_Z: MAX_Z,
  resetProbe: function () { probeMemo = { at: 0, ok: null }; }
};
