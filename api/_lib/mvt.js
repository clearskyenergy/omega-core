/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/mvt.js — the polygon under a point, read out of a Mapbox Vector
   Tile
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The editor's Parcel Lines are the licensed source's map tiles
   (api/parcel-tiles.js). The same tiles are served as vector tiles, and a
   vector tile carries each parcel's outline. This is the small, pure reader
   api/parcel.js uses to take the lot under a point out of one: no
   dependency, no network, no key.

   A vector tile is protobuf: Tile { layers = 3 }, Layer { name = 1,
   features = 2, keys = 3, values = 4, extent = 5 }, Feature { tags = 2,
   type = 3 (3 is a polygon), geometry = 4 }. Geometry is a command stream
   (MoveTo 1, LineTo 2, ClosePath 7) of zig-zag deltas in tile units, y down.

   WHAT IT WILL NOT SAY. A polygon cut by the tile's edge is not the whole
   lot: `clipped` is true when any vertex of the ring lies on or past the
   tile's own square, and the caller asks a wider tile rather than keep it.
   Holes are ignored (the outline is the lot line). Nothing is invented: no
   polygon under the point is null.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

function Reader(buf, pos, end) { this.b = buf; this.p = pos || 0; this.e = end == null ? buf.length : end; }
Reader.prototype.varint = function () {
  var r = 0, s = 0, b;
  do {
    if (this.p >= this.e) throw new Error('truncated tile');
    b = this.b[this.p++];
    r += (b & 0x7f) * Math.pow(2, s); s += 7;
  } while (b >= 0x80 && s < 70);
  return r;
};
Reader.prototype.skip = function (wire) {
  if (wire === 0) this.varint();
  else if (wire === 1) this.p += 8;
  else if (wire === 2) { var n = this.varint(); this.p += n; }
  else if (wire === 5) this.p += 4;
  else throw new Error('unreadable tile');
  if (this.p > this.e) throw new Error('truncated tile');
};
/* fn(field, wire, reader): reads the field or returns false to have it skipped */
Reader.prototype.each = function (fn) {
  while (this.p < this.e) {
    var tag = this.varint(), field = Math.floor(tag / 8), wire = tag & 7;
    if (fn(field, wire, this) === false) this.skip(wire);
  }
};
Reader.prototype.sub = function () { var n = this.varint(), r = new Reader(this.b, this.p, this.p + n); if (r.e > this.e) throw new Error('truncated tile'); this.p += n; return r; };
Reader.prototype.string = function () { var r = this.sub(); return r.b.toString('utf8', r.p, r.e); };
Reader.prototype.packed = function () { var r = this.sub(), out = []; while (r.p < r.e) out.push(r.varint()); return out; };

function zig(n) { return n % 2 ? -(n + 1) / 2 : n / 2; }

function value(r) {
  var v = null;
  r.each(function (f, w, rd) {
    if (f === 1 && w === 2) v = rd.string();
    else if (f === 2 && w === 5) { v = rd.b.readFloatLE ? rd.b.readFloatLE(rd.p) : null; rd.p += 4; }
    else if (f === 3 && w === 1) { v = rd.b.readDoubleLE ? rd.b.readDoubleLE(rd.p) : null; rd.p += 8; }
    else if ((f === 4 || f === 5) && w === 0) v = rd.varint();
    else if (f === 6 && w === 0) v = zig(rd.varint());
    else if (f === 7 && w === 0) v = rd.varint() !== 0;
    else return false;
  });
  return v;
}

/* the command stream → rings of [x, y] in tile units (the closing vertex not repeated) */
function rings(geom) {
  var out = [], ring = null, x = 0, y = 0, i = 0;
  while (i < geom.length) {
    var cmd = geom[i] & 7, n = Math.floor(geom[i] / 8); i++;
    if (cmd === 1 || cmd === 2) {
      for (var k = 0; k < n && i + 1 < geom.length; k++, i += 2) {
        x += zig(geom[i]); y += zig(geom[i + 1]);
        if (cmd === 1) { if (ring && ring.length >= 3) out.push(ring); ring = [[x, y]]; }
        else if (ring) ring.push([x, y]);
      }
    } else if (cmd === 7) { if (ring && ring.length >= 3) out.push(ring); ring = null; }
    else break;
  }
  if (ring && ring.length >= 3) out.push(ring);
  return out;
}
function area2(r) { var a = 0; for (var i = 0; i < r.length; i++) { var p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; }
function inside(x, y, r) {
  var c = false;
  for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
    var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/* every polygon feature in the tile: { layer, extent, props, rings } */
function polygons(buf) {
  var out = [];
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  new Reader(buf).each(function (f, w, rd) {
    if (!(f === 3 && w === 2)) return false;
    var L = rd.sub(), name = '', extent = 4096, keys = [], vals = [], feats = [];
    L.each(function (lf, lw, lr) {
      if (lf === 1 && lw === 2) name = lr.string();
      else if (lf === 2 && lw === 2) feats.push(lr.sub());
      else if (lf === 3 && lw === 2) keys.push(lr.string());
      else if (lf === 4 && lw === 2) vals.push(value(lr.sub()));
      else if (lf === 5 && lw === 0) extent = lr.varint();
      else return false;
    });
    feats.forEach(function (F) {
      var type = 0, tags = [], geom = [];
      F.each(function (ff, fw, fr) {
        if (ff === 2 && fw === 2) tags = fr.packed();
        else if (ff === 3 && fw === 0) type = fr.varint();
        else if (ff === 4 && fw === 2) geom = fr.packed();
        else return false;
      });
      if (type !== 3) return;
      var props = {};
      for (var i = 0; i + 1 < tags.length; i += 2) if (keys[tags[i]] != null) props[keys[tags[i]]] = vals[tags[i + 1]];
      out.push({ layer: name, extent: extent, props: props, rings: rings(geom) });
    });
  });
  return out;
}

/* Web-Mercator tile arithmetic */
function tileOf(lat, lng, z) {
  var n = Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
  var fx = (lng + 180) / 360 * n, fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { z: z, x: Math.floor(fx), y: Math.floor(fy), fx: fx - Math.floor(fx), fy: fy - Math.floor(fy) };
}
function toLatLng(t, px, py, extent) {
  var n = Math.pow(2, t.z), x = (t.x + px / extent) / n, y = (t.y + py / extent) / n;
  return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI, x * 360 - 180];
}

/* The polygon under (lat, lng) in the tile `t` (from tileOf at the tile's own zoom).
   → { ring: [[lat, lng], …] open, props, layer, clipped } or null. Where polygons overlap, the smallest wins. */
function polygonAt(buf, t, lat, lng) {
  var here = tileOf(lat, lng, t.z);
  if (here.x !== t.x || here.y !== t.y) return null;
  var best = null;
  polygons(buf).forEach(function (f) {
    var px = here.fx * f.extent, py = here.fy * f.extent;
    f.rings.forEach(function (r) {
      var a = Math.abs(area2(r)); if (!(a > 0) || !inside(px, py, r)) return;
      /* an exterior ring only: a hole under the point means the point is not on this lot. Exterior rings wind one
         way and holes the other; the first ring of a feature is exterior, so judge the rest against it */
      if (r !== f.rings[0] && (area2(r) > 0) !== (area2(f.rings[0]) > 0)) { if (best && best.f === f) best = null; return; }
      if (!best || a < best.a) best = { a: a, f: f, r: r };
    });
  });
  if (!best) return null;
  var ex = best.f.extent, clipped = best.r.some(function (p) { return p[0] <= 0 || p[1] <= 0 || p[0] >= ex || p[1] >= ex; });
  var ring = best.r.map(function (p) { return toLatLng(t, p[0], p[1], ex); }), last = ring[ring.length - 1];
  if (ring.length > 3 && last[0] === ring[0][0] && last[1] === ring[0][1]) ring.pop();
  return { ring: ring, props: best.f.props, layer: best.f.layer, clipped: clipped };
}

module.exports = { polygons: polygons, polygonAt: polygonAt, tileOf: tileOf, toLatLng: toLatLng, rings: rings };
