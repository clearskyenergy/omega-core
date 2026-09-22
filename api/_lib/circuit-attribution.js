/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   THE CATALOGUE'S CIRCUITS, READ ONCE ON THE SERVER.

   A listing's serving circuit and its published hosting capacity used to be
   read in the browser, from the hosting polygons drawn for the map's current
   view. That works for a screen of pins and fails for a county: the phone
   app lists 100 listings across Cook County, the polygon layer refuses an
   extent that wide, and every card says "Circuit unknown". So the scheduled
   worker asks ComEd once per matched listing (the same point query, the same
   46 m rule the desktop tool uses), writes the answer onto the row, and from
   then on any client can sort the whole catalogue by available kW without
   drawing anything. A row records that it was tried, so a listing with no
   published circuit is not asked again; a fresh import clears it all.

   Pure apart from `fetchJson`, which the tests replace. */
'use strict';
var S = require('./comed-service');
var SOURCE = 'ComEd BESS hosting capacity, layer ' + S.ATTRIB_LAYER + ' within ' + S.NEAREST_M + ' m';
var SERVICE_NAME = (S.SERVICE.split('/services/')[1] || '').split('/')[0];

/* Matched street positions only: an area-centre pin is somebody's ZIP, not
   their parcel, and a circuit read there would be quoted as if it were. */
function candidates(rows) {
  return rows.filter(function (r) {
    return r && r.lat != null && r.lon != null && r.geocode && r.geocode.status === 'matched' && !(r.circuit && r.circuit.attempted);
  });
}
function num(v) { v = Number(v); return isFinite(v) ? v : null; }
/* Which circuit, when the buffer overlaps more than one: the one with the
   most capacity left, which is what a rep would quote. */
function pick(features) {
  var best = null, bestAvail = -Infinity;
  (features || []).forEach(function (f) {
    var a = f && f.attributes; if (!a) return;
    var id = String(a.Feeder || a.Feeder_N || '').trim(); if (!id) return;
    var np = num(a.BESS_HC), q = Math.max(0, num(a.Feeder_Q) || 0), avail = (np == null ? -1 : np) - q;
    if (avail > bestAvail) { bestAvail = avail; best = { feederId: id, sub: String(a.SS_N || '').trim(), nameplate: np, queue: q }; }
  });
  return best;
}
function apply(row, hit, at) {
  row.circuit = { attempted: true, status: hit ? 'attributed' : 'none', at: at, source: SOURCE, service: SERVICE_NAME };
  if (hit) { row.feederId = hit.feederId; row.sub = hit.sub; row.nameplate = hit.nameplate; row.queue = hit.queue; }
  else { row.feederId = ''; row.sub = ''; row.nameplate = null; row.queue = 0; }
}
/* One bounded pass over the rows not yet tried. Stops at the first transport
   or service error rather than marking rows tried on an answer it never got:
   that is what a service rotation looks like, and the fix is a constant in
   comed-service.js, not 3,000 rows stamped "no circuit". */
async function attributeRows(rows, fetchJson, opts) {
  opts = opts || {};
  var budget = opts.budgetMs || 25000, conc = Math.max(1, opts.concurrency || 4), start = Date.now();
  var now = opts.now || function () { return new Date().toISOString(); };
  var todo = candidates(rows), i = 0, attempted = 0, attributed = 0, none = 0, stop = false, transportError = null;
  async function worker() {
    while (!stop && i < todo.length && Date.now() - start < budget) {
      var r = todo[i++], j;
      try { j = await fetchJson(S.pointQueryUrl(r.lat, r.lon)); }
      catch (e) { stop = true; transportError = transportError || String(e && e.message || e); return; }
      if (stop) return;
      if (!j || j.error || !Array.isArray(j.features)) {
        stop = true;
        transportError = transportError || (j && j.error ? 'ComEd service error ' + (j.error.code || '') + ' ' + (j.error.message || '') : 'ComEd answered without features');
        return;
      }
      var hit = pick(j.features); apply(r, hit, now());
      attempted++; if (hit) attributed++; else none++;
    }
  }
  var ws = []; for (var k = 0; k < conc; k++) ws.push(worker());
  await Promise.all(ws);
  return { attempted: attempted, attributed: attributed, none: none, remaining: candidates(rows).length, transportError: transportError };
}
module.exports = { candidates: candidates, pick: pick, apply: apply, attributeRows: attributeRows, SOURCE: SOURCE, SERVICE_NAME: SERVICE_NAME };
