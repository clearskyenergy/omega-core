/* ═══════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · omega-site-intel.js  (v1)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Turns a hand-drawn Google Earth KMZ into a scored site.

   ─────────────────────────────────────────────────────────────────────────
   WHY THIS EXISTS
   ─────────────────────────────────────────────────────────────────────────
   The site team already does this analysis. They open Google Earth, trace the
   parcel, draw the transmission line, drop a pin on the substation, and label
   it "345kV PNM" / "1,203 acres". That KMZ is a complete interconnection
   screening — it is just locked in a file nobody downstream can read.

   Meanwhile the portfolio matrix has an empty grid axis because it waits on
   Grid Atlas (an HTML page with no API) and on OGI (an endpoint that is not
   configured). Two axes, both blocked on somebody else's service, while the
   evidence sits in a folder of KMZs.

   This computes the grid axis from the geometry. No API key, no network, no
   second implementation to drift out of sync.

   ─────────────────────────────────────────────────────────────────────────
   WHAT IT IS NOT
   ─────────────────────────────────────────────────────────────────────────
   It is not a utility study and it must never be presented as one. Every
   number here comes from a line somebody drew by eye over imagery. The
   capacity figures are planning heuristics keyed to voltage class, NOT
   thermal ratings, NOT ATC, and NOT a queue position. A 345 kV line on the
   fence tells you the corridor exists; it tells you nothing about whether
   there is headroom on it.

   So every derived value carries an evidence tag, and `verified` is never one
   of them until a human attaches a source. The score is a SCREENING RANK —
   it puts the best sites at the top of the list. It does not clear one.

   ─────────────────────────────────────────────────────────────────────────
   ES5 ON PURPOSE
   ─────────────────────────────────────────────────────────────────────────
   Per CLAUDE.md: no build step. var/function only, so this runs in the
   editor, in the OSA portfolio, and in a kiosk browser without transpiling.

   Console: OmegaSiteIntel.demo(kmlText)
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var R_EARTH   = 6378137;              /* WGS84 semi-major, metres */
  var M2_PER_AC = 4046.8564224;
  var M_PER_MI  = 1609.344;
  var FT_PER_M  = 3.280839895;

  /* Hand-traced rings are not survey-accurate. Anything this close is treated
     as on the parcel rather than beside it. */
  var ON_PARCEL_FT = 200;
  var ADJACENT_FT  = 1320;                /* a quarter mile */

  /* PLANNING SETBACKS, NOT CODE. A screening buffer that scales with diameter,
     because the consequence area of a hazardous liquid line does. The real
     number is the recorded easement plus the operator's own potential impact
     radius under 49 CFR 195, and neither is in a KMZ — so this exists to size
     the problem, and gets replaced the moment a title report or a one-call
     ticket comes back. Override with OmegaSiteIntel.setHazardSetback(). */
  var HAZ_SETBACK_MIN_FT = 100;
  var HAZ_SETBACK_PER_IN = 25;
  function hazardSetbackFt(diameterIn) {
    if (!diameterIn) return HAZ_SETBACK_MIN_FT;
    return Math.max(HAZ_SETBACK_MIN_FT, Math.round(diameterIn * HAZ_SETBACK_PER_IN));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     1.  GEODESY
     Areas are geodesic. A planar shoelace on lat/lon degrees is wrong by the
     cosine of the latitude — on a 1,200 acre parcel at 32°N that is roughly
     180 acres of lease payment, which is not a rounding error.
     ═══════════════════════════════════════════════════════════════════════ */
  function toRad(d) { return d * Math.PI / 180; }

  function haversineM(a, b) {
    var dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function areaM2(ring) {
    if (!ring || ring.length < 3) return 0;
    var r = ring.slice();
    if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r.push(r[0]);
    var t = 0;
    for (var i = 0; i < r.length - 1; i++) {
      t += toRad(r[i + 1][0] - r[i][0]) *
           (2 + Math.sin(toRad(r[i][1])) + Math.sin(toRad(r[i + 1][1])));
    }
    return Math.abs(t * R_EARTH * R_EARTH / 2);
  }
  function areaAcres(ring) { return areaM2(ring) / M2_PER_AC; }

  function lengthM(coords) {
    var m = 0;
    for (var i = 0; i < coords.length - 1; i++) m += haversineM(coords[i], coords[i + 1]);
    return m;
  }

  /* Closed within ~1 m. Google Earth writes the first vertex again exactly,
     but a ring traced in another tool and round-tripped can drift slightly,
     and a parcel that misses closure by half a metre is still a parcel. */
  function isClosed(coords) {
    if (!coords || coords.length < 4) return false;
    return haversineM(coords[0], coords[coords.length - 1]) < 1.0;
  }

  function centroid(ring) {
    var x = 0, y = 0, n = 0;
    for (var i = 0; i < ring.length; i++) { x += ring[i][0]; y += ring[i][1]; n++; }
    return n ? [x / n, y / n] : null;
  }

  /* Perpendicular distance from a point to a polyline, walking segments.
     Local-tangent-plane projection: over the few miles that separate a parcel
     from its substation the error is centimetres, and it avoids a full
     geodesic inverse per segment. */
  function distToSegM(p, a, b) {
    var latRef = toRad((a[1] + b[1]) / 2);
    var kx = Math.cos(latRef) * R_EARTH * Math.PI / 180, ky = R_EARTH * Math.PI / 180;
    var px = (p[0] - a[0]) * kx, py = (p[1] - a[1]) * ky;
    var bx = (b[0] - a[0]) * kx, by = (b[1] - a[1]) * ky;
    var L2 = bx * bx + by * by;
    if (L2 === 0) return Math.sqrt(px * px + py * py);
    var t = Math.max(0, Math.min(1, (px * bx + py * by) / L2));
    var dx = px - t * bx, dy = py - t * by;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function distPointToLineM(p, line) {
    var best = Infinity;
    for (var i = 0; i < line.length - 1; i++) {
      var d = distToSegM(p, line[i], line[i + 1]);
      if (d < best) best = d;
    }
    return best;
  }
  /* Closest approach between a ring and a polyline. Checked both ways: a
     short line ending inside a big parcel is missed if you only walk one. */
  function distRingToLineM(ring, line) {
    var best = Infinity, i, d;
    for (i = 0; i < ring.length; i++) { d = distPointToLineM(ring[i], line); if (d < best) best = d; }
    for (i = 0; i < line.length; i++) { d = distPointToLineM(line[i], ring); if (d < best) best = d; }
    return best;
  }

  /* Ray casting in degree space. Only ever used to ask "is this pin inside
     this parcel", where the parcel spans a mile or two and the distortion
     cannot flip the answer. */
  function pointInRing(p, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > p[1]) !== (yj > p[1])) &&
          (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function bboxOverlap(a, b) {
    var A = bbox(a), B = bbox(b);
    return !(A.e < B.w || B.e < A.w || A.n < B.s || B.n < A.s);
  }
  function bbox(ring) {
    var w = 180, e = -180, s = 90, n = -90;
    for (var i = 0; i < ring.length; i++) {
      if (ring[i][0] < w) w = ring[i][0];
      if (ring[i][0] > e) e = ring[i][0];
      if (ring[i][1] < s) s = ring[i][1];
      if (ring[i][1] > n) n = ring[i][1];
    }
    return { w: w, e: e, s: s, n: n };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     2.  PARSING
     ═══════════════════════════════════════════════════════════════════════ */

  /* Entities are decoded, and that is not cosmetic. Google Earth writes a
     pipeline diameter as 5.56&quot; — the inch mark is escaped because KML is
     XML. Without this the diameter never parses, every gas line reads as
     unknown, and the gas component of the score is silently zero on a site
     that has three of them. */
  var ENTS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decodeEnts(s) {
    return String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (m, e) {
      if (e.charAt(0) === '#') {
        var n = e.charAt(1) === 'x' || e.charAt(1) === 'X'
          ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(n) ? String.fromCharCode(n) : m;
      }
      var v = ENTS[e.toLowerCase()];
      return v === undefined ? m : v;
    });
  }
  function strip(s) {
    return decodeEnts(String(s || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  }
  function validLngLat(p) {
    return p && isFinite(p[0]) && isFinite(p[1]) &&
           Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  }

  /* Regex rather than DOMParser so the same code runs in a node test harness
     and in the browser, matching the existing GIS engine in editor.html. */
  function parseKML(text) {
    var out = { features: [], errors: [], srcType: 'kml' };
    if (typeof text !== 'string') { out.errors.push('KML must be text.'); return out; }
    var pms = text.split(/<Placemark[\s>]/i).slice(1);
    if (!pms.length) { out.errors.push('No <Placemark> elements found.'); return out; }

    pms.forEach(function (pm) {
      var name = strip((pm.match(/<name>([\s\S]*?)<\/name>/i) || [])[1] || '');
      var desc = strip((pm.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '');
      var props = { name: name, description: desc };
      (pm.match(/<SimpleData name="([^"]+)">([\s\S]*?)<\/SimpleData>/gi) || [])
        .forEach(function (row) {
          var m = row.match(/name="([^"]+)">([\s\S]*?)</i);
          if (m) props[m[1]] = strip(m[2]);
        });

      var isPoly = /<Polygon[\s>]/i.test(pm);
      var isLine = /<LineString[\s>]/i.test(pm);

      /* A LookAt block carries <longitude>/<latitude> that are NOT geometry —
         they are the camera. Only <coordinates> is read, so the camera can
         never be mistaken for a placemark's position. */
      (pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/gi) || []).forEach(function (b, i) {
        var pts = b.replace(/<\/?coordinates>/gi, '').trim().split(/\s+/)
          .map(function (t) { var a = t.split(','); return [parseFloat(a[0]), parseFloat(a[1])]; })
          .filter(validLngLat);
        if (!pts.length) return;
        if (isPoly && i === 0) { if (pts.length > 2) out.features.push({ type: 'polygon', coords: pts, props: props }); }
        else if (isLine)       { if (pts.length > 1) out.features.push({ type: 'line',    coords: pts, props: props }); }
        else if (!isPoly)      { out.features.push({ type: 'point', coords: [pts[0]], props: props }); }
      });
    });
    if (!out.features.length && !out.errors.length) out.errors.push('No usable coordinates in the KML.');
    return out;
  }

  /* KMZ is a zip with doc.kml inside. Every file the site team produces is a
     KMZ — Google Earth saves that by default — and the importer could not
     read one at all. */
  function parseKMZ(arrayBuffer) {
    if (typeof global.JSZip === 'undefined')
      return Promise.reject(new Error('JSZip is not loaded, so .kmz cannot be opened. Load it first, or unzip the file and import the .kml.'));
    return global.JSZip.loadAsync(arrayBuffer).then(function (zip) {
      var entry = zip.file(/\.kml$/i)[0];
      if (!entry) throw new Error('That .kmz has no .kml inside it.');
      return entry.async('string').then(parseKML);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     3.  FEATURE CLASSIFICATION
     ═══════════════════════════════════════════════════════════════════════

     The old classifier assigned ONE kind to a whole file. Every real site
     KMZ holds a parcel AND transmission AND substations AND pipelines, so
     one kind per file paints all of it the same colour and throws away the
     distinctions that matter.

     The vocabulary below is taken from 18 live site files, not invented:

       layout / aerial / Boundary        the parcel ring
       345kV PNM                         transmission, voltage + owner
       2/345kV PNM                       TWO CIRCUITS at 345 kV
       69/138kV AEP sub                  a substation with 69 and 138 windings
       gen-tie                           an existing generator lead
       natural gas - <operator> - 4.5"   fuel supply, diameter in inches
       crude oil - <operator> - 36"      NOT fuel. A hazard and a setback.
       1,203 acres                       the team's own acreage claim

     Note the slash means two different things and the geometry disambiguates
     it: on a LINE, "2/345kV" is a circuit count; on a POINT, "69/138kV" is
     the transformer's low and high side. Getting that backwards would report
     a 69 kV substation as two circuits of 138. */

  var RE_ACRES  = /^\s*([\d,]+(?:\.\d+)?)\s*(?:ac|acre|acres)\s*$/i;
  var RE_KV     = /(\d+(?:\.\d+)?)\s*k\.?v\b/i;           /* fixes \bkv\b, which never matched "345kV" */
  var RE_CIRC   = /^\s*(\d)\s*\/\s*\d+(?:\.\d+)?\s*k\.?v/i;
  var RE_SUBKV  = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*k\.?v/i;
  var RE_DIAM   = /(\d+(?:[.,]\d+)?)\s*"/;
  var RE_MW     = /(\d+(?:\.\d+)?)\s*mw\b/i;

  var PARCEL_WORDS = /\b(layout|aerial|boundary|parcel|tract|lot|apn|site)\b/i;
  var HAZARD_WORDS = /\b(crude oil|highly volatile liquid|\bhvl\b|refined product|petroleum product|anhydrous ammonia)\b/i;
  var GAS_WORDS    = /\b(natural gas|gas (?:pipe)?line|gas utility)\b/i;
  var SUB_WORDS    = /\b(sub|subs|substation|switchyard|switching station)\b/i;
  var RAIL_WORDS   = /\b(railroad|railway|\brail\b|\brr\b)\b/i;
  var GENTIE_WORDS = /\bgen[-\s]?tie\b/i;
  var GEN_WORDS    = /\b(wind farm|solar farm|wind|solar|generating station|power plant)\b/i;
  var FIBER_WORDS  = /\b(fiber|fibre|telecom|conduit|dark fiber)\b/i;
  var WATER_WORDS  = /\b(water|well|aquifer|effluent|reclaimed)\b/i;
  var ROAD_WORDS   = /\b(road|hwy|highway|access|county road|\bcr\b|\bfm\b)\b/i;

  /* Owner is what is left once the technical tokens are removed. "345kV AEP
     TX north" is AEP TX north; "138kV" alone has no owner, and an empty
     string is the honest answer rather than a guess. */
  function ownerOf(name) {
    return String(name || '')
      .replace(/^\s*\d\s*\//, ' ')
      .replace(/\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*k\.?v/ig, ' ')
      .replace(/\d+(?:\.\d+)?\s*k\.?v/ig, ' ')
      .replace(/\b(sub|substation|switchyard|line|transmission|gen[-\s]?tie)\b/ig, ' ')
      .replace(/[-–,]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* Pipelines arrive as "commodity - operator - diameter". The separator is
     inconsistent across the corpus (comma in some files, hyphen in others,
     sometimes both), so it is split on either and the parts identified by
     what they look like rather than by position. */
  function pipelineParts(name) {
    var diam = null, m = RE_DIAM.exec(name);
    if (m) diam = parseFloat(String(m[1]).replace(',', '.'));
    var operator = String(name || '')
      .replace(/\d+(?:[.,]\d+)?\s*"/g, ' ')
      .replace(HAZARD_WORDS, ' ').replace(GAS_WORDS, ' ')
      .replace(/[-–,]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { diameterIn: diam, operator: operator };
  }

  function classify(f) {
    var name = String((f.props && f.props.name) || '');
    var type = f.type;
    var c = { kind: 'other', label: name, attrs: {} };

    /* An acreage pin is a LABEL, not a location. Caught first: "1,203 acres"
       would otherwise fall through to 'other' and the stated acreage —
       the one number the team actually vouches for — would be lost. */
    var ac = RE_ACRES.exec(name);
    if (type === 'point' && ac) {
      c.kind = 'acreage_label';
      c.attrs.acres = parseFloat(ac[1].replace(/,/g, ''));
      return c;
    }

    if (type === 'point') {
      if (SUB_WORDS.test(name) || RE_KV.test(name)) {
        c.kind = 'substation';
        var sk = RE_SUBKV.exec(name);
        if (sk) {                       /* 69/138kV → low 69, high 138 */
          c.attrs.kvLow  = parseFloat(sk[1]);
          c.attrs.kvHigh = parseFloat(sk[2]);
          c.attrs.kv     = Math.max(c.attrs.kvLow, c.attrs.kvHigh);
        } else {
          var k = RE_KV.exec(name);
          if (k) c.attrs.kv = parseFloat(k[1]);
        }
        c.attrs.owner = ownerOf(name);
        /* A bare "SUB" is real and common. It is a substation with unknown
           voltage, which is worth strictly less than a known one — and the
           score has to be able to tell the difference. */
        if (c.attrs.kv == null) c.attrs.kvUnknown = true;
        return c;
      }
      var mw = RE_MW.exec(name);
      if (mw || GEN_WORDS.test(name)) {
        c.kind = 'generation';
        if (mw) c.attrs.mw = parseFloat(mw[1]);
        c.attrs.owner = ownerOf(name);
        return c;
      }
      c.kind = 'marker';
      return c;
    }

    /* ── lines and rings ── */
    if (HAZARD_WORDS.test(name)) {
      c.kind = 'pipeline_hazard';
      var hp = pipelineParts(name);
      c.attrs.diameterIn = hp.diameterIn;
      c.attrs.operator   = hp.operator;
      c.attrs.commodity  = (HAZARD_WORDS.exec(name) || [])[0] || 'hazardous liquid';
      return c;
    }
    if (GAS_WORDS.test(name)) {
      c.kind = 'pipeline_gas';
      var gp = pipelineParts(name);
      c.attrs.diameterIn = gp.diameterIn;
      c.attrs.operator   = gp.operator;
      return c;
    }
    if (GENTIE_WORDS.test(name)) { c.kind = 'gentie'; c.attrs.owner = ownerOf(name); return c; }
    if (RAIL_WORDS.test(name))   { c.kind = 'rail';    return c; }
    if (FIBER_WORDS.test(name))  { c.kind = 'fiber';   return c; }
    if (WATER_WORDS.test(name))  { c.kind = 'water';   return c; }

    if (RE_KV.test(name)) {
      c.kind = 'transmission';
      c.attrs.kv = parseFloat(RE_KV.exec(name)[1]);
      var cc = RE_CIRC.exec(name);
      c.attrs.circuits = cc ? parseInt(cc[1], 10) : 1;
      c.attrs.owner = ownerOf(name);
      return c;
    }

    /* Parcel last. "layout" and "aerial" carry no semantics on their own, so
       a closed ring of any name is treated as a candidate parcel — that is
       how the team draws them and the geometry is the real signal. */
    if (PARCEL_WORDS.test(name) || isClosed(f.coords)) {
      c.kind = 'parcel';
      c.attrs.acres  = areaAcres(f.coords);
      c.attrs.closed = isClosed(f.coords);
      return c;
    }
    if (ROAD_WORDS.test(name)) { c.kind = 'road'; return c; }
    return c;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4.  SITE INTAKE
     Collapses classified features into the input packet the AutoDesign
     engine and the portfolio matrix both want.
     ═══════════════════════════════════════════════════════════════════════ */

  function intake(features, siteName) {
    var F = features.map(function (f) {
      var c = classify(f);
      return { type: f.type, coords: f.coords, name: c.label, kind: c.kind, attrs: c.attrs };
    });

    var s = {
      site: siteName || '',
      features: F,
      flags: [],                 /* things a human has to resolve */
      evidence: 'kmz_traced'     /* never 'verified'. See the header. */
    };

    var of = function (k) { return F.filter(function (x) { return x.kind === k; }); };

    /* ── acreage ─────────────────────────────────────────────────────────
       Two independent numbers: what the team wrote on the pin, and what
       their own polygon measures. The AutoDesign spec's rule is to DEFAULT
       LOWER when they disagree by more than 5%, and to say so. */
    var labels = of('acreage_label');
    var rings  = of('parcel');

    s.statedAcres = labels.length
      ? labels.reduce(function (a, x) { return a + x.attrs.acres; }, 0) : null;

    /* Overlapping rings are double-counted acreage. One file in the corpus
       carries both a `layout` ring and four `Boundary` polygons over the
       same ground; summing them reports twice the land that exists. */
    var kept = [], dropped = 0;
    rings.forEach(function (r) {
      var dup = false;
      for (var i = 0; i < kept.length; i++) {
        if (!bboxOverlap(r.coords, kept[i].coords)) continue;
        var cen = centroid(r.coords), cen2 = centroid(kept[i].coords);
        if ((cen  && pointInRing(cen,  kept[i].coords)) ||
            (cen2 && pointInRing(cen2, r.coords))) { dup = true; break; }
      }
      if (dup) dropped++; else kept.push(r);
    });
    if (dropped) {
      s.flags.push({ level: 'warn', code: 'overlapping_parcels',
        msg: dropped + ' parcel ring' + (dropped > 1 ? 's overlap' : ' overlaps') +
             ' another and ' + (dropped > 1 ? 'were' : 'was') +
             ' excluded from the acreage total. Confirm which ring is the parcel of record.' });
    }

    s.parcelRings   = kept;
    s.computedAcres = kept.length
      ? kept.reduce(function (a, r) { return a + r.attrs.acres; }, 0) : null;

    if (s.statedAcres != null && s.computedAcres != null && s.statedAcres > 0) {
      s.acresDeltaPct = ((s.computedAcres - s.statedAcres) / s.statedAcres) * 100;
      if (Math.abs(s.acresDeltaPct) > 5) {
        s.grossAcres = Math.min(s.statedAcres, s.computedAcres);   /* default lower */
        s.flags.push({ level: 'warn', code: 'acreage_discrepancy',
          msg: 'Stated ' + Math.round(s.statedAcres) + ' ac vs traced ' +
               Math.round(s.computedAcres) + ' ac (' +
               (s.acresDeltaPct > 0 ? '+' : '') + s.acresDeltaPct.toFixed(1) +
               '%). Using the lower figure until a survey or deed settles it.' });
      } else {
        s.grossAcres = s.statedAcres;
      }
    } else {
      s.grossAcres = s.statedAcres != null ? s.statedAcres : s.computedAcres;
      if (s.statedAcres == null && s.computedAcres != null)
        s.flags.push({ level: 'info', code: 'acreage_traced_only',
          msg: 'Acreage is measured off the traced ring only — no stated figure to check it against.' });
    }

    /* ── transmission ────────────────────────────────────────────────────
       Ranked by voltage, then by how close it comes to the parcel. Distance
       is measured ring-to-line, so a line that clips the corner reads as
       zero rather than as the distance to some arbitrary centre. */
    var ref = kept.length ? kept[0].coords : null;
    var lines = of('transmission');
    lines.forEach(function (L) {
      L.distM = ref ? distRingToLineM(ref, L.coords) : null;
      L.lengthM = lengthM(L.coords);
    });
    lines.sort(function (a, b) {
      if ((b.attrs.kv || 0) !== (a.attrs.kv || 0)) return (b.attrs.kv || 0) - (a.attrs.kv || 0);
      return (a.distM == null ? 1e9 : a.distM) - (b.distM == null ? 1e9 : b.distM);
    });
    s.transmission = lines;
    s.maxKv = lines.length ? (lines[0].attrs.kv || null) : null;

    /* Total circuits AT the top voltage. Two circuits at 345 is redundancy;
       a 345 and a 69 sharing a corridor is not, and a data centre buyer is
       asking about the first one. */
    s.circuitsAtMaxKv = lines.reduce(function (n, L) {
      return L.attrs.kv === s.maxKv ? n + (L.attrs.circuits || 1) : n;
    }, 0);

    s.nearestLineM = lines.reduce(function (m, L) {
      return (L.distM != null && L.distM < m) ? L.distM : m; }, Infinity);
    if (!isFinite(s.nearestLineM)) s.nearestLineM = null;

    /* ── substations ─────────────────────────────────────────────────────
       The single biggest cost driver on the interconnect. Distance from the
       parcel to the nearest one is the gen-tie length. */
    var subs = of('substation');
    subs.forEach(function (P) {
      P.distM = ref ? distPointToLineM(P.coords[0], ref) : null;
      if (ref && pointInRing(P.coords[0], ref)) P.distM = 0;   /* inside the fence */
    });
    subs.sort(function (a, b) {
      return (a.distM == null ? 1e9 : a.distM) - (b.distM == null ? 1e9 : b.distM); });
    s.substations = subs;
    s.nearestSubM = subs.length ? subs[0].distM : null;
    s.nearestSubKv = subs.length ? (subs[0].attrs.kv || null) : null;

    /* Highest substation voltage anywhere in the file — a 69 kV sub next
       door with a 345 kV sub four miles off is a different site from one
       with only the 69. */
    s.maxSubKv = subs.reduce(function (m, P) {
      return (P.attrs.kv && P.attrs.kv > m) ? P.attrs.kv : m; }, 0) || null;

    if (subs.length && subs.every(function (P) { return P.attrs.kvUnknown; })) {
      s.flags.push({ level: 'info', code: 'sub_voltage_unknown',
        msg: 'The substation pin carries no voltage, so its capacity is scored conservatively. Label it (e.g. "69/138kV") to lift the score.' });
    }

    /* ── gas and hazard ──────────────────────────────────────────────────
       These look alike in a KMZ and are opposites in a pro forma. Natural
       gas is bridge power and a generation option. Crude and HVL are a
       setback, an evacuation plan and a construction risk — an asset in one
       column and a liability in the other, and both were previously just
       'other'. */
    var gas = of('pipeline_gas');
    gas.forEach(function (G) { G.distM = ref ? distRingToLineM(ref, G.coords) : null; });
    gas.sort(function (a, b) { return (b.attrs.diameterIn || 0) - (a.attrs.diameterIn || 0); });
    s.gas = gas;
    s.maxGasDiameterIn = gas.reduce(function (m, G) {
      return (G.attrs.diameterIn && G.attrs.diameterIn > m) ? G.attrs.diameterIn : m; }, 0) || null;
    s.nearestGasM = gas.reduce(function (m, G) {
      return (G.distM != null && G.distM < m) ? G.distM : m; }, Infinity);
    if (!isFinite(s.nearestGasM)) s.nearestGasM = null;

    /* HAZARD PROXIMITY IS A BAND, NOT A CROSSING TEST.

       This was originally "distance < 1 m = crosses", and on the corpus that
       reported every site as clean — including one carrying a 36" crude line
       and a 30" HVL line 58 to 158 FEET off the boundary. A ring traced by
       hand over imagery is not survey-accurate to the metre, so an exact
       crossing test asks a question the data cannot answer.

       Anything inside ON_PARCEL_FT is treated as on the parcel: it is within
       the tracing error, and at that range the setback lands on the site
       either way. */
    var haz = of('pipeline_hazard');
    haz.forEach(function (H) {
      H.distM = ref ? distRingToLineM(ref, H.coords) : null;
      H.setbackFt = hazardSetbackFt(H.attrs.diameterIn);
      H.proximity = !ref || H.distM == null ? 'unknown'
        : H.distM <= ON_PARCEL_FT / FT_PER_M   ? 'on_parcel'
        : H.distM <= ADJACENT_FT / FT_PER_M    ? 'adjacent'
        : H.distM <= 0.5 * M_PER_MI            ? 'nearby'
                                               : 'distant';
      /* The corridor the setback consumes, both sides of the line, over the
         length that runs against the parcel. An area estimate for screening —
         it does not clip to the boundary, so it is an upper bound. */
      H.lengthM = lengthM(H.coords);
      H.corridorAcres = (H.proximity === 'on_parcel')
        ? (H.lengthM * (H.setbackFt * 2 / FT_PER_M)) / M2_PER_AC : 0;
    });
    haz.sort(function (a, b) { return (a.distM == null ? 1e9 : a.distM) - (b.distM == null ? 1e9 : b.distM); });
    s.hazards = haz;

    s.hazardOnParcel = haz.filter(function (H) { return H.proximity === 'on_parcel'; }).length;
    s.hazardAdjacent = haz.filter(function (H) { return H.proximity === 'adjacent'; }).length;
    s.hazardCrossings = s.hazardOnParcel;          /* kept: older callers read this */
    s.hazardCorridorAcres = haz.reduce(function (a, H) { return a + H.corridorAcres; }, 0);

    if (s.hazardOnParcel) {
      var biggest = haz.filter(function (H) { return H.proximity === 'on_parcel'; })
        .reduce(function (m, H) { return (H.attrs.diameterIn || 0) > (m.attrs.diameterIn || 0) ? H : m; });
      s.flags.push({ level: 'warn', code: 'hazard_pipeline_on_site',
        msg: s.hazardOnParcel + ' hazardous-liquid pipeline' + (s.hazardOnParcel > 1 ? 's run' : ' runs') +
             ' on or within ' + ON_PARCEL_FT + ' ft of the parcel — largest is ' +
             (biggest.attrs.diameterIn ? biggest.attrs.diameterIn + '" ' : '') +
             (biggest.attrs.commodity || 'hazardous liquid') +
             ' (' + (biggest.attrs.operator || 'operator not named') + '). ' +
             'A planning setback takes roughly ' + Math.round(s.hazardCorridorAcres) +
             ' ac out of the buildable area. Confirm the recorded easement and the ' +
             'operator\'s own impact radius before any layout is fixed.' });
    }
    if (s.hazardAdjacent) {
      s.flags.push({ level: 'info', code: 'hazard_pipeline_adjacent',
        msg: s.hazardAdjacent + ' hazardous-liquid pipeline' + (s.hazardAdjacent > 1 ? 's' : '') +
             ' within ' + ADJACENT_FT + ' ft of the boundary. Not on the site, but it constrains ' +
             'access, trenching and where the gen-tie can cross.' });
    }

    /* Buildable is gross less the hazard corridor. It is NOT the AutoDesign
       buildable figure — SFHA, wetlands, easements, setbacks and slope all
       come off as well, and none of those are in a KMZ. It is the ceiling
       that ceiling has to sit under. */
    s.buildableCeilingAcres = s.grossAcres != null
      ? Math.max(0, s.grossAcres - s.hazardCorridorAcres) : null;

    s.gentie     = of('gentie');
    s.generation = of('generation');
    s.rail       = of('rail');

    if (!kept.length) {
      s.flags.push({ level: 'error', code: 'no_parcel',
        msg: 'No closed parcel ring in the file, so nothing can be measured from it. Draw the boundary as a closed shape.' });
    }
    if (!lines.length && !subs.length) {
      s.flags.push({ level: 'error', code: 'no_grid',
        msg: 'No transmission line and no substation in the file. The grid score cannot be computed.' });
    }
    return s;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     5.  GRID SCORE  —  the matrix's horizontal axis
     ═══════════════════════════════════════════════════════════════════════

     0–100, "can it be built". Five components, each capped, each returned
     with its own reason so the number is never a black box: anyone can see
     which component cost the site its points and go fix that one thing.

     THE WEIGHTS ARE A JUDGEMENT, and they encode a specific view of what
     kills a data centre interconnect:

       voltage class  35   the ceiling on how much load can ever be served
       sub distance   25   the gen-tie is the cheque you write first
       redundancy     15   N-1 is table stakes for a compute buyer
       land           15   acres set the MW the site could physically host
       gas / bridge   10   what carries you through a 4-year queue

     Voltage outweighs distance because distance is money and voltage is a
     ceiling: you can pay to cross five miles, but you cannot buy headroom
     onto a 69 kV line that does not have it.

     WHAT THIS CANNOT SEE, and why no score should be read as a clearance:
     queue position, thermal ratings, ATC, curtailment history, the utility's
     own plans. A 345 kV line on the fence with a full queue behind it scores
     high here and is undevelopable. That is why the output carries
     `evidence: 'kmz_traced'` and a confidence, and why the matrix must show
     both. */

  var W = { voltage: 35, distance: 25, redundancy: 15, land: 15, gas: 10 };

  /* Planning heuristics keyed to voltage class — typical deliverable load
     for a single point of interconnection at that class. NOT thermal
     ratings. Used for ranking and for a sanity check against the acreage,
     never as a capacity commitment. */
  function mwCeilingFor(kv) {
    if (!kv) return null;
    if (kv >= 500) return 2000;
    if (kv >= 345) return 1000;
    if (kv >= 230) return 500;
    if (kv >= 138) return 250;
    if (kv >= 115) return 200;
    if (kv >= 69)  return 75;
    return 25;
  }

  function scoreVoltage(kv) {
    if (!kv) return 0;
    if (kv >= 500) return 1.00;
    if (kv >= 345) return 0.95;
    if (kv >= 230) return 0.78;
    if (kv >= 138) return 0.58;
    if (kv >= 115) return 0.50;
    if (kv >= 69)  return 0.28;
    return 0.10;
  }

  /* Gen-tie cost is roughly linear in distance; the score is not. Under a
     mile is a normal scope item, five miles is a separate project with its
     own easements, and past ten the interconnect stops being an interconnect
     and becomes a transmission build. */
  function scoreDistance(m) {
    if (m == null) return 0;
    var mi = m / M_PER_MI;
    if (mi <= 0.25) return 1.00;
    if (mi <= 0.5)  return 0.92;
    if (mi <= 1)    return 0.82;
    if (mi <= 2)    return 0.65;
    if (mi <= 3)    return 0.50;
    if (mi <= 5)    return 0.33;
    if (mi <= 10)   return 0.15;
    return 0.05;
  }

  function gridScore(s, opts) {
    opts = opts || {};
    var targetMw = opts.targetMw || null;
    var parts = [], total = 0;

    function add(key, weight, frac, note) {
      var pts = Math.round(weight * Math.max(0, Math.min(1, frac)) * 10) / 10;
      parts.push({ key: key, points: pts, max: weight, note: note });
      total += pts;
    }

    /* 1. Voltage — the best of the line and the substation. A 345 kV line on
          the boundary counts even where the mapped substation is only 69. */
    var kv = Math.max(s.maxKv || 0, s.maxSubKv || 0) || null;
    add('voltage', W.voltage, scoreVoltage(kv),
        kv ? (kv + ' kV available' + (s.maxSubKv && s.maxSubKv >= (s.maxKv || 0) ? ' at the substation' : ' on the corridor'))
           : 'No voltage identified in the file');

    /* 2. Distance to the point of interconnection. The substation is the
          real POI; a line is scored at a penalty because tapping one still
          means building a switchyard. */
    var dM = s.nearestSubM, via = 'substation';
    if (dM == null && s.nearestLineM != null) { dM = s.nearestLineM; via = 'line tap'; }
    var dFrac = scoreDistance(dM);
    if (via === 'line tap') dFrac *= 0.7;
    add('distance', W.distance, dFrac,
        dM == null ? 'No point of interconnection located'
                   : (dM / M_PER_MI).toFixed(2) + ' mi to the nearest ' + via +
                     (via === 'line tap' ? ' (no substation mapped — a tap needs a new switchyard)' : ''));

    /* 3. Redundancy. One circuit is a single point of failure and a compute
          buyer will price that in; two at the same voltage is the ask. */
    var nc = s.circuitsAtMaxKv || 0;
    var subCount = (s.substations || []).length;
    var rFrac = 0, rNote;
    if (nc >= 2)                { rFrac = 1.00; rNote = nc + ' circuits at ' + s.maxKv + ' kV'; }
    else if (subCount >= 2)     { rFrac = 0.70; rNote = subCount + ' substations mapped — a second source is plausible'; }
    else if (nc === 1)          { rFrac = 0.35; rNote = 'Single circuit at ' + s.maxKv + ' kV'; }
    else                        { rFrac = 0;    rNote = 'No transmission circuit identified'; }
    add('redundancy', W.redundancy, rFrac, rNote);

    /* 4. Land. Scored against what the grid could actually deliver, not in
          the abstract: 2,000 acres on a 69 kV line is not a 2,000 acre data
          centre. The binding constraint is whichever runs out first. */
    var acres = s.grossAcres || 0;
    var mwCeil = mwCeilingFor(kv);
    var mwFromLand = acres * 2.25;            /* AutoDesign: ~2–2.5 MW/ac */
    var hostable = mwCeil != null ? Math.min(mwFromLand, mwCeil) : mwFromLand;
    var lFrac, lNote;
    if (!acres) { lFrac = 0; lNote = 'No measurable acreage'; }
    else {
      var basis = targetMw || 100;
      lFrac = Math.max(0, Math.min(1, hostable / basis));
      lNote = Math.round(acres) + ' ac → ~' + Math.round(hostable) + ' MW hostable' +
              (mwCeil != null && mwFromLand > mwCeil
                ? ' (land supports ~' + Math.round(mwFromLand) + ' MW; the ' + kv + ' kV service is the ceiling)'
                : '') +
              (targetMw ? ' against a ' + targetMw + ' MW target' : '');
    }
    add('land', W.land, lFrac, lNote);

    /* 5. Gas. Not power, but it is what gets a site to revenue while the
          interconnect queue runs. Diameter is the proxy for deliverability. */
    var d = s.maxGasDiameterIn, gFrac, gNote;
    if (!d) { gFrac = 0; gNote = 'No gas pipeline mapped'; }
    else {
      gFrac = d >= 20 ? 1.0 : d >= 12 ? 0.8 : d >= 6 ? 0.55 : 0.3;
      var gmi = s.nearestGasM != null ? s.nearestGasM / M_PER_MI : null;
      if (gmi != null && gmi > 2) gFrac *= 0.6;
      gNote = d + '" gas line' + (gmi != null ? ' at ' + gmi.toFixed(2) + ' mi' : '');
    }
    add('gas', W.gas, gFrac, gNote);

    /* Hazard penalty. Applied AFTER the components rather than inside land,
       because it is a risk and a schedule problem as much as an area one —
       burying it in the acreage would hide it. */
    var penalty = 0, hnote = null;
    if (s.hazardOnParcel || s.hazardAdjacent) {
      /* On-parcel lines cost real points; adjacent ones cost a token amount,
         because they constrain access and the gen-tie route without taking
         land. Capped so a pipeline corridor can never by itself sink a site
         that is otherwise strong — it is a cost and a schedule item, not a
         disqualification. */
      penalty = Math.min(18, (s.hazardOnParcel || 0) * 5 + (s.hazardAdjacent || 0) * 1.5);
      var lost = s.hazardCorridorAcres ? ', ~' + Math.round(s.hazardCorridorAcres) + ' ac of setback' : '';
      hnote = (s.hazardOnParcel || 0) + ' on-parcel and ' + (s.hazardAdjacent || 0) +
              ' adjacent hazardous-liquid line' +
              ((s.hazardOnParcel + s.hazardAdjacent) > 1 ? 's' : '') + lost;
      penalty = Math.round(penalty * 10) / 10;
      parts.push({ key: 'hazard', points: -penalty, max: 0, note: hnote });
      total -= penalty;
    }

    total = Math.max(0, Math.min(100, Math.round(total)));

    /* Confidence is NOT the score. A site can score 90 on a file that is
       missing half its labels, and the matrix has to be able to show that
       the 90 is thin. */
    var missing = [];
    if (!s.statedAcres || !s.computedAcres) missing.push('a cross-checked acreage');
    if (!s.substations.length)              missing.push('a substation');
    if (!s.maxKv)                           missing.push('a line voltage');
    if (s.substations.length && s.substations.every(function (P) { return P.attrs.kvUnknown; }))
      missing.push('substation voltage');
    var errs = s.flags.filter(function (f) { return f.level === 'error'; }).length;
    var conf = errs ? 'low' : missing.length >= 2 ? 'low' : missing.length ? 'medium' : 'good';

    return {
      score: total,
      confidence: conf,
      hazardOnParcel: s.hazardOnParcel || 0,
      hazardAdjacent: s.hazardAdjacent || 0,
      hazardCorridorAcres: Math.round(s.hazardCorridorAcres || 0),
      buildableCeilingAcres: s.buildableCeilingAcres != null ? Math.round(s.buildableCeilingAcres) : null,
      missing: missing,
      components: parts,
      kv: kv,
      mwHostable: acres ? Math.round(hostable) : null,
      mwCeiling: mwCeil,
      poiMi: dM != null ? Math.round(dM / M_PER_MI * 100) / 100 : null,
      poiVia: dM != null ? via : null,
      evidence: s.evidence,
      flags: s.flags
    };
  }

  /* One call: bytes or text in, scored site out. */
  function analyzeKML(text, siteName, opts) {
    var p = parseKML(text);
    var s = intake(p.features, siteName);
    return { intake: s, grid: gridScore(s, opts), errors: p.errors };
  }
  function analyzeKMZ(buf, siteName, opts) {
    return parseKMZ(buf).then(function (p) {
      var s = intake(p.features, siteName);
      return { intake: s, grid: gridScore(s, opts), errors: p.errors };
    });
  }

  global.OmegaSiteIntel = {
    parseKML: parseKML, parseKMZ: parseKMZ,
    classify: classify, intake: intake, gridScore: gridScore,
    analyzeKML: analyzeKML, analyzeKMZ: analyzeKMZ,
    mwCeilingFor: mwCeilingFor,
    hazardSetbackFt: hazardSetbackFt,
    setHazardSetback: function (minFt, perIn) {
      if (isFinite(minFt)) HAZ_SETBACK_MIN_FT = +minFt;
      if (isFinite(perIn)) HAZ_SETBACK_PER_IN = +perIn;
      return { minFt: HAZ_SETBACK_MIN_FT, perIn: HAZ_SETBACK_PER_IN };
    },
    decodeEnts: decodeEnts,
    geo: { haversineM: haversineM, areaAcres: areaAcres, lengthM: lengthM,
           isClosed: isClosed, pointInRing: pointInRing,
           distPointToLineM: distPointToLineM, distRingToLineM: distRingToLineM },
    WEIGHTS: W,
    VERSION: 'site-intel/1.0'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.OmegaSiteIntel;

})(typeof window !== 'undefined' ? window : globalThis);
