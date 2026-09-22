/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/kmz.js — a site outline in, a Google Earth file out (and back)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHAT THIS DOES. Builds the KML for a site — the parcel ring, its label, and
   whatever traced context (transmission, substation, gas) was kept on the
   record — and wraps it as a KMZ, which is a zip with doc.kml inside. It also
   opens a KMZ an agent uploads, so the same file the site team drew in Google
   Earth can be pushed in from ChatGPT without anyone unzipping it first.

   WHY THERE IS A ZIP IMPLEMENTATION HERE. The browser side uses JSZip from a
   CDN; the server has no package for it and adding one for two entry points
   is not worth a dependency. Node ships deflate/inflate in zlib, and a zip
   file is a handful of little-endian headers around that. Stored and deflated
   entries are read; deflated entries are written. Nothing else — no
   encryption, no zip64, no multi-disk — because Google Earth writes none of it.

   COORDINATES. KML is lng,lat[,alt] — the opposite of the lat,lng most of the
   platform speaks. Outlines are stored as [lng,lat] rings (matching
   omega-site-intel.js, which reads the same files) so nothing here swaps.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var zlib = require('zlib');

/* ── XML ───────────────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function coordList(pts) {
  return pts.map(function (p) { return (+p[0]).toFixed(6) + ',' + (+p[1]).toFixed(6) + ',0'; }).join(' ');
}
function closeRing(ring) {
  if (!ring || ring.length < 3) return ring || [];
  var a = ring[0], z = ring[ring.length - 1];
  return (a[0] === z[0] && a[1] === z[1]) ? ring : ring.concat([a]);
}

/* site: { name, description?, ring:[[lng,lat],…], features?:[{type, coords, name, kind}] , point?:[lng,lat] }
   Returns KML text. A site with no ring and no point still gets a document
   with a name, so the caller can say "here is what we have" honestly. */
function buildKML(site) {
  site = site || {};
  var name = site.name || 'Site';
  var parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<kml xmlns="http://www.opengis.net/kml/2.2"><Document>');
  parts.push('<name>' + esc(name) + '</name>');
  if (site.description) parts.push('<description>' + esc(site.description) + '</description>');
  parts.push('<Style id="parcel"><LineStyle><color>ff00d7ff</color><width>3</width></LineStyle>' +
             '<PolyStyle><color>3300d7ff</color></PolyStyle></Style>');
  parts.push('<Style id="line"><LineStyle><color>ff0000ff</color><width>2</width></LineStyle></Style>');
  parts.push('<Style id="gas"><LineStyle><color>ff00a5ff</color><width>2</width></LineStyle></Style>');
  parts.push('<Style id="pin"><IconStyle><scale>1.1</scale></IconStyle></Style>');

  if (site.ring && site.ring.length >= 3) {
    parts.push('<Placemark><name>' + esc(name) + (site.acres ? ' — ' + Math.round(site.acres) + ' acres' : '') +
      '</name><styleUrl>#parcel</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>' +
      coordList(closeRing(site.ring)) + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>');
  } else if (site.point && site.point.length === 2) {
    parts.push('<Placemark><name>' + esc(name) + '</name><styleUrl>#pin</styleUrl><Point><coordinates>' +
      coordList([site.point]) + '</coordinates></Point></Placemark>');
  }

  (site.features || []).forEach(function (f) {
    if (!f || !Array.isArray(f.coords) || !f.coords.length) return;
    var label = f.name || f.kind || 'Feature';
    if (f.type === 'polygon' && f.coords.length >= 3) {
      parts.push('<Placemark><name>' + esc(label) + '</name><styleUrl>#parcel</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>' +
        coordList(closeRing(f.coords)) + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>');
    } else if (f.type === 'line' && f.coords.length >= 2) {
      parts.push('<Placemark><name>' + esc(label) + '</name><styleUrl>#' + (f.kind === 'gas' ? 'gas' : 'line') +
        '</styleUrl><LineString><tessellate>1</tessellate><coordinates>' + coordList(f.coords) + '</coordinates></LineString></Placemark>');
    } else if (f.type === 'point') {
      parts.push('<Placemark><name>' + esc(label) + '</name><styleUrl>#pin</styleUrl><Point><coordinates>' +
        coordList([f.coords[0]]) + '</coordinates></Point></Placemark>');
    }
  });

  parts.push('</Document></kml>');
  return parts.join('\n');
}

/* ── CRC-32, the one thing zip needs that zlib does not export ────────────── */
var CRC_TABLE = (function () {
  var t = new Int32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  var c = -1;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* ── zip writer: one or more entries, deflated ────────────────────────────── */
function dosTime(d) {
  d = d || new Date();
  var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time & 0xFFFF, date: date & 0xFFFF };
}
function zip(entries) {
  var locals = [], centrals = [], offset = 0, dt = dosTime();
  entries.forEach(function (e) {
    var name = Buffer.from(e.name, 'utf8');
    var data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8');
    var comp = zlib.deflateRawSync(data);
    var crc = crc32(data);
    var lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt16LE(dt.time, 10); lh.writeUInt16LE(dt.date, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    var ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10); ch.writeUInt16LE(dt.time, 12); ch.writeUInt16LE(dt.date, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp);
    centrals.push(ch, name);
    offset += lh.length + name.length + comp.length;
  });
  var cdSize = centrals.reduce(function (a, b) { return a + b.length; }, 0);
  var end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat(locals.concat(centrals, [end]));
}

/* ── zip reader: walks the central directory, inflates the entries ─────────── */
function unzip(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  var eocd = -1;
  for (var i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file (no end-of-directory record)');
  var count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
  var out = [], p = cdOff;
  for (var n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip directory');
    var method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    var nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    var loff = buf.readUInt32LE(p + 42);
    var name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + elen + clen;
    if (loff + 30 > buf.length || buf.readUInt32LE(loff) !== 0x04034b50) throw new Error('corrupt zip entry ' + name);
    var lnlen = buf.readUInt16LE(loff + 26), lelen = buf.readUInt16LE(loff + 28);
    var start = loff + 30 + lnlen + lelen;
    var raw = buf.slice(start, start + csize);
    var data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error('unsupported zip method ' + method + ' in ' + name);
    if (usize && data.length !== usize) throw new Error('size mismatch in ' + name);
    out.push({ name: name, data: data });
  }
  return out;
}

/* KMZ → KML text. Prefers doc.kml; takes the first .kml otherwise. */
function kmlFromKMZ(buf) {
  var entries = unzip(buf);
  var kml = entries.filter(function (e) { return /\.kml$/i.test(e.name); });
  if (!kml.length) throw new Error('that .kmz has no .kml inside it');
  var pick = kml.filter(function (e) { return /(^|\/)doc\.kml$/i.test(e.name); })[0] || kml[0];
  return pick.data.toString('utf8');
}
function kmzFromKML(kmlText) { return zip([{ name: 'doc.kml', data: kmlText }]); }
function buildKMZ(site) { return kmzFromKML(buildKML(site)); }

/* Is this buffer a zip (KMZ) or text (KML)? A KMZ starts with "PK". */
function isZip(buf) { return Buffer.isBuffer(buf) && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4B; }

module.exports = { buildKML: buildKML, buildKMZ: buildKMZ, kmzFromKML: kmzFromKML, kmlFromKMZ: kmlFromKMZ,
  zip: zip, unzip: unzip, crc32: crc32, isZip: isZip, closeRing: closeRing, esc: esc };
