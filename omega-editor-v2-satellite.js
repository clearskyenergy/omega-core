/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-satellite.js — Google's satellite photo under the drawing.
 *
 * Omega Maximus drew Esri's World Imagery, which has nothing past level 19
 * (about 0.3 m a pixel) at the sites it was tried on, so closer than that
 * the photo went soft. Site Map is sharp there because it is Google's
 * satellite through the Maps JavaScript API and the browser key. This is
 * the same photo, the same key (config.js googleMapsKey, with the Settings ›
 * API Keys override `omegaMapsKey` Site Map reads too) and the same billing:
 * one map load a page, moving the map free (Tommy, 2026-10-20: "switch to
 * google satellite").
 *
 * The editor stays in charge: the map takes no input and is put where the
 * editor's view is (its centre and its scale) every time the view moves.
 * Past the deepest imagery Google has at the site (MaxZoomService), the map
 * is magnified by CSS up to one level, so the photo stays under the drawing;
 * deeper than that, or when Google cannot load (no key, a refused key,
 * offline), the editor shows Esri's tiles instead. Google's logo and terms
 * stay on the map; nothing here copies or exports its imagery.
 *
 * camera(center, pxPerFt, maxZoom) is pure, and is what the checks hold.
 */
(function (root) {
  'use strict';
  var FT_PER_M = 3.280839895;
  var MAX_OVERZOOM = 2;              /* one level of CSS magnification */
  var state = 'off', reason = '', map = null, host = null, maxZ = 20, maxAt = '', listeners = [], w0 = 0, h0 = 0, tilesIn = false;

  /* the browser Maps key: a machine's override first, as Site Map reads it */
  function key() {
    var k = '';
    try { k = (root.localStorage && root.localStorage.getItem('omegaMapsKey')) || ''; } catch (e) { k = ''; }
    if (!k && root.CLEARSKY_CONFIG && root.CLEARSKY_CONFIG.googleMapsKey) k = root.CLEARSKY_CONFIG.googleMapsKey;
    return String(k || '').trim();
  }
  /* Google's zoom for a scale: metres a CSS pixel at a latitude */
  function zoomFor(lat, pxPerFt) {
    if (!(pxPerFt > 0) || !isFinite(lat)) return NaN;
    var mpp = (1 / pxPerFt) / FT_PER_M;
    return Math.log(156543.03392 * Math.cos(lat * Math.PI / 180) / mpp) / Math.LN2;
  }
  /* where the map goes for a view: the centre, the zoom, the CSS scale past
     the deepest imagery, and whether Google shows at all */
  function camera(center, pxPerFt, maxZoom) {
    var z = zoomFor(center && center.lat, pxPerFt), mz = maxZoom > 0 ? maxZoom : 20, s = 1;
    if (!isFinite(z)) return { show: false };
    if (z > mz) { s = Math.pow(2, z - mz); z = mz; }
    return { center: { lat: center.lat, lng: center.lng }, zoom: z, scale: s, show: s <= MAX_OVERZOOM + 1e-9 };
  }
  function emit() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state); } catch (e) { /* a listener's error is its own */ } } }
  function fail(why) {
    state = 'failed';
    reason = why || 'Google Maps did not load.';
    if (host) host.style.display = 'none';
    emit();
  }
  function load(cb) {
    if (root.google && root.google.maps && root.google.maps.Map) { cb(null); return; }
    var k = key();
    if (!k) { cb('No Google Maps key is set.'); return; }
    if (typeof document === 'undefined') { cb('No page to load Google Maps into.'); return; }
    var name = '__omegaMaximusSatellite';
    root[name] = function () { cb(null); };
    /* Google calls this when it refuses the key (billing, the address, the API) */
    var prev = root.gm_authFailure;
    root.gm_authFailure = function () {
      fail('Google refused the Maps key on this address, so the photo is Esri’s.');
      if (typeof prev === 'function') { try { prev(); } catch (e) { /* theirs */ } }
    };
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(k) + '&v=weekly&callback=' + name;
    s.onerror = function () { cb('Google Maps did not load, so the photo is Esri’s.'); };
    document.head.appendChild(s);
  }
  /* Start once, into the element under the drawing; onChange hears every state */
  function start(el, onChange) {
    if (onChange) listeners.push(onChange);
    if (state !== 'off') return;
    host = el;
    state = 'loading';
    load(function (err) {
      if (err) { fail(err); return; }
      try {
        map = new root.google.maps.Map(host, {
          mapTypeId: 'satellite', center: { lat: 0, lng: 0 }, zoom: 18, tilt: 0, heading: 0,
          disableDefaultUI: true, gestureHandling: 'none', keyboardShortcuts: false, clickableIcons: false,
          isFractionalZoomEnabled: true, backgroundColor: '#E4E1D8'
        });
        /* whether the photo in view has finished loading (a render waits on it) */
        if (map.addListener) {
          map.addListener('bounds_changed', function () { tilesIn = false; });
          map.addListener('tilesloaded', function () { tilesIn = true; });
        }
        state = 'ready';
        emit();
      } catch (e) { fail('Google Maps did not start, so the photo is Esri’s.'); }
    });
  }
  /* the deepest imagery at the site, asked once a site point */
  function lookMax(site) {
    if (!site || !root.google || !root.google.maps.MaxZoomService) return;
    var k = (+site.lat).toFixed(4) + ',' + (+site.lng).toFixed(4);
    if (k === maxAt) return;
    maxAt = k;
    try {
      new root.google.maps.MaxZoomService().getMaxZoomAtLatLng({ lat: +site.lat, lng: +site.lng }, function (r) {
        if (r && r.status === 'OK' && r.zoom > 0 && r.zoom !== maxZ) { maxZ = r.zoom; emit(); }
      });
    } catch (e) { /* the default stands */ }
  }
  /* Put the map under the view. True when Google's photo is showing. */
  function frame(center, pxPerFt, w, h, site) {
    if (state !== 'ready' || !map || !host) return false;
    lookMax(site || center);
    var c = camera(center, pxPerFt, maxZ);
    if (!c.show) { host.style.display = 'none'; return false; }
    var W = Math.max(1, Math.round(w / c.scale)), H = Math.max(1, Math.round(h / c.scale));
    host.style.display = 'block';
    if (W !== w0 || H !== h0) { host.style.width = W + 'px'; host.style.height = H + 'px'; w0 = W; h0 = H; }
    host.style.left = Math.round((w - W) / 2) + 'px';
    host.style.top = Math.round((h - H) / 2) + 'px';
    host.style.transform = c.scale === 1 ? '' : 'scale(' + c.scale + ')';
    try { map.moveCamera({ center: c.center, zoom: c.zoom }); } catch (e) { map.setCenter(c.center); map.setZoom(c.zoom); }
    return true;
  }
  function hide() { if (host) host.style.display = 'none'; }

  root.OmegaEditorV2Satellite = {
    key: key, zoomFor: zoomFor, camera: camera, start: start, frame: frame, hide: hide,
    state: function () { return state; }, reason: function () { return reason; }, maxZoom: function () { return maxZ; },
    tilesLoaded: function () { return state === 'ready' && tilesIn; },
    VERSION: 'editor-v2-satellite/1'
  };
})(typeof window !== 'undefined' ? window : global);
