/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-aerial.js — a free ortho photo under the plot plan.
 *
 * The image is the U.S. Geological Survey National Map, ImageryOnly.
 * It is public domain. The sheet names the Survey. Nothing here is a
 * survey of the parcel, and a failed fetch is said so rather than drawn.
 */
(function (root) {
  'use strict';

  var G = root.OmegaEditorV2Geom || (typeof require === 'function' ? require('./omega-editor-v2-geom.js') : null);

  var ATTRIBUTION = 'U.S. Geological Survey, The National Map';
  var SERVICE = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export';

  function anchorOf(doc) {
    var a = doc && doc.anchor;
    if (!a || !isFinite(+a.lat) || !isFinite(+a.lng)) return null;
    return { lat: +a.lat, lng: +a.lng };
  }

  function wanted(doc) {
    if (!anchorOf(doc)) return false;
    if (doc.drawing && doc.drawing.aerial === false) return false;
    return true;
  }

  function feetBox(doc) {
    var ents = (doc && doc.entities) || [];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, i, e, pts, k, p;
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (!e) continue;
      pts = e.pts || null;
      if (!pts && isFinite(+e.x) && isFinite(+e.y)) pts = [{ x: +e.x, y: +e.y }];
      if (!pts) continue;
      for (k = 0; k < pts.length; k++) {
        p = pts[k];
        if (!isFinite(+p.x) || !isFinite(+p.y)) continue;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!isFinite(minX)) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    return { minX: minX - 8, minY: minY - 8, maxX: maxX + 8, maxY: maxY + 8 };
  }

  function bbox(doc) {
    var anchor = anchorOf(doc);
    if (!anchor || !G || !G.ftToLatLng) return null;
    var box = feetBox(doc);
    var sw = G.ftToLatLng(box.minX, box.minY, anchor);
    var ne = G.ftToLatLng(box.maxX, box.maxY, anchor);
    return {
      west: Math.min(sw.lng, ne.lng),
      south: Math.min(sw.lat, ne.lat),
      east: Math.max(sw.lng, ne.lng),
      north: Math.max(sw.lat, ne.lat)
    };
  }

  function exportUrl(box, width, height) {
    var w = width || 800, h = height || 600;
    return SERVICE + '?bbox=' + [box.west, box.south, box.east, box.north].join(',') +
      '&bboxSR=4326&imageSR=4326&size=' + w + ',' + h + '&format=jpg&f=image';
  }

  function bytesToB64(bytes) {
    var i, s = '';
    for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    if (typeof btoa === 'function') return btoa(s);
    return Buffer.from(s, 'latin1').toString('base64');
  }

  function fetchImage(doc, cb) {
    var box = bbox(doc);
    if (!box) { cb(new Error('no site point')); return; }
    if (typeof fetch !== 'function') { cb(new Error('no fetch')); return; }
    var url = exportUrl(box, 800, 600);
    fetch(url).then(function (res) {
      if (!res.ok) throw new Error('imagery ' + res.status);
      return res.arrayBuffer();
    }).then(function (buf) {
      var bytes = new Uint8Array(buf);
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('imagery was not a JPEG');
      cb(null, {
        jpeg: bytesToB64(bytes),
        width: 800,
        height: 600,
        attribution: ATTRIBUTION,
        bbox: box
      });
    }).catch(function (err) { cb(err); });
  }

  var api = {
    ATTRIBUTION: ATTRIBUTION,
    wanted: wanted,
    bbox: bbox,
    exportUrl: exportUrl,
    fetchImage: fetchImage,
    VERSION: 'editor-v2-aerial/1'
  };
  root.OmegaEditorV2Aerial = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
