/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/gmaps-double.js — the Google Maps JavaScript API, offline
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Site Map (editor.html) anchors every piece of equipment to the ground and
   redraws it when the live map moves: zoom_changed, center_changed,
   bounds_changed and idle drive the anchor engine, the reprojection chain
   and the drawing scale (S.pxPerFt). Nothing could check that in a browser
   without Google's servers, so a render check served the Maps script as an
   empty file and the editor ran with no map at all. This is the answer for
   a render check: enough of google.maps, with a real camera and real event
   order, so the REAL editor creates its map through its own address path
   (fetchMap → _loadMapsAPI → _initGMap) and a check can zoom it.

   The camera: a centre and an integer zoom on a Web Mercator world, the
   same 156543.03392 m/px at zoom 0 the editor's own scale uses. setZoom /
   setCenter / panTo / panBy / fitBounds change it and fire as Google does:
   the *_changed event at once, inside the call; bounds_changed on the next
   animation frame; idle once the view has been still for IDLE_MS. Several
   changes in a row are one bounds_changed per frame and one idle.

   Also: LatLng, LatLngBounds, Point, Size, MVCObject, MVCArray, the event
   namespace (listeners, once, DOM listeners, trigger, clear), Marker,
   Polyline / Polygon / Circle / Rectangle, InfoWindow, OverlayView (panes;
   getProjection() is null, so the editor's projection falls back to its own
   math, which is what it does before Google's first draw), Geocoder (the
   address table handed to install(), else one fixed point), the elevation,
   max-zoom, street-view, directions and places services answering "no
   result", geometry.spherical / poly / encoding, importLibrary, and the
   enums. Any other name on google.maps is a harmless stub, recorded in
   google.maps.__double.unknown so a check can see what the page reached for.

   What it is not: tiles, imagery, a fractional or animated zoom, tilt.

   In a page: serve this file as the response to maps.googleapis.com/maps/
   api/js, followed by `GMapsDouble.install(window, opts)` and the callback
   the URL names (gmapsScript() below writes that body). ES5, one file;
   require() it in Node for gmapsScript().
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GMapsDouble = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var IDLE_MS = 160;                    /* still this long → idle */
  var M_PER_PX_Z0 = 156543.03392;       /* Web Mercator metres per px at zoom 0, the equator */
  var EARTH_R = 6378137;

  function install(win, opts) {
    opts = opts || {};
    if (win.google && win.google.maps && win.google.maps.__double) return win.google.maps;
    var doc = win.document;
    var raf = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : function (f) { return setTimeout(f, 16); };
    var state = { unknown: [], maps: [], geocoded: [] };

    /* ── events ─────────────────────────────────────────────────────────── */
    function bag(obj) {
      if (!obj.__gmEv) { try { Object.defineProperty(obj, '__gmEv', { value: {}, enumerable: false, configurable: true }); } catch (e) { obj.__gmEv = {}; } }
      return obj.__gmEv;
    }
    function listen(obj, name, fn, once) {
      var b = bag(obj), list = b[name] || (b[name] = []);
      var h = { fn: fn, once: !!once, removed: false, remove: function () { h.removed = true; var i = list.indexOf(h); if (i >= 0) list.splice(i, 1); } };
      list.push(h);
      return h;
    }
    function trigger(obj, name) {
      if (!obj) return;
      var args = [].slice.call(arguments, 2), b = obj.__gmEv, list = b && b[name];
      if (!list || !list.length) return;
      list.slice().forEach(function (h) {
        if (h.removed) return;
        if (h.once) h.remove();
        h.fn.apply(obj, args);
      });
    }
    var event = {
      addListener: function (obj, name, fn) { return listen(obj, name, fn, false); },
      addListenerOnce: function (obj, name, fn) { return listen(obj, name, fn, true); },
      addDomListener: function (el, name, fn, capture) {
        if (el && el.addEventListener) el.addEventListener(name, fn, !!capture);
        return { remove: function () { if (el && el.removeEventListener) el.removeEventListener(name, fn, !!capture); } };
      },
      addDomListenerOnce: function (el, name, fn, capture) {
        var h = event.addDomListener(el, name, function (e) { h.remove(); fn.call(this, e); }, capture);
        return h;
      },
      removeListener: function (h) { if (h && h.remove) h.remove(); },
      clearListeners: function (obj, name) { var b = obj && obj.__gmEv; if (b && b[name]) b[name].slice().forEach(function (h) { h.remove(); }); },
      clearInstanceListeners: function (obj) { var b = obj && obj.__gmEv; if (b) Object.keys(b).forEach(function (k) { b[k].slice().forEach(function (h) { h.remove(); }); }); },
      trigger: trigger,
      hasListeners: function (obj, name) { var b = obj && obj.__gmEv; return !!(b && b[name] && b[name].length); }
    };

    /* ── values ─────────────────────────────────────────────────────────── */
    function LatLng(a, b) {
      if (!(this instanceof LatLng)) return new LatLng(a, b);
      if (a && typeof a === 'object') { var lit = a; a = typeof lit.lat === 'function' ? lit.lat() : +lit.lat; b = typeof lit.lng === 'function' ? lit.lng() : +lit.lng; }
      this.__lat = Math.max(-90, Math.min(90, +a));
      var l = +b; if (isFinite(l)) { while (l > 180) l -= 360; while (l < -180) l += 360; }
      this.__lng = l;
    }
    LatLng.prototype.lat = function () { return this.__lat; };
    LatLng.prototype.lng = function () { return this.__lng; };
    LatLng.prototype.equals = function (o) { o = toLL(o); return !!o && Math.abs(o.lat() - this.__lat) < 1e-9 && Math.abs(o.lng() - this.__lng) < 1e-9; };
    LatLng.prototype.toJSON = function () { return { lat: this.__lat, lng: this.__lng }; };
    LatLng.prototype.toString = function () { return '(' + this.__lat + ', ' + this.__lng + ')'; };
    LatLng.prototype.toUrlValue = function (p) { p = p == null ? 6 : p; return this.__lat.toFixed(p) + ',' + this.__lng.toFixed(p); };
    function toLL(v) {
      if (!v) return null;
      if (v instanceof LatLng) return v;
      if (typeof v.lat === 'function' || typeof v.lat === 'number' || typeof v.lat === 'string') return new LatLng(v);
      return null;
    }

    function LatLngBounds(sw, ne) {
      if (!(this instanceof LatLngBounds)) return new LatLngBounds(sw, ne);
      if (sw && !(sw instanceof LatLng) && sw.south != null) { ne = { lat: sw.north, lng: sw.east }; sw = { lat: sw.south, lng: sw.west }; }
      this.__s = null; this.__w = null; this.__n = null; this.__e = null;
      if (sw) this.extend(sw);
      if (ne) this.extend(ne);
    }
    LatLngBounds.prototype.extend = function (p) {
      p = toLL(p); if (!p) return this;
      var la = p.lat(), lo = p.lng();
      if (this.__s == null) { this.__s = this.__n = la; this.__w = this.__e = lo; return this; }
      this.__s = Math.min(this.__s, la); this.__n = Math.max(this.__n, la);
      this.__w = Math.min(this.__w, lo); this.__e = Math.max(this.__e, lo);
      return this;
    };
    LatLngBounds.prototype.isEmpty = function () { return this.__s == null; };
    LatLngBounds.prototype.getSouthWest = function () { return new LatLng(this.__s || 0, this.__w || 0); };
    LatLngBounds.prototype.getNorthEast = function () { return new LatLng(this.__n || 0, this.__e || 0); };
    LatLngBounds.prototype.getCenter = function () { return new LatLng(((this.__s || 0) + (this.__n || 0)) / 2, ((this.__w || 0) + (this.__e || 0)) / 2); };
    LatLngBounds.prototype.contains = function (p) { p = toLL(p); return !!p && !this.isEmpty() && p.lat() >= this.__s && p.lat() <= this.__n && p.lng() >= this.__w && p.lng() <= this.__e; };
    LatLngBounds.prototype.intersects = function (b) { return !this.isEmpty() && !b.isEmpty() && !(b.__w > this.__e || b.__e < this.__w || b.__s > this.__n || b.__n < this.__s); };
    LatLngBounds.prototype.union = function (b) { if (b && !b.isEmpty()) { this.extend(b.getSouthWest()); this.extend(b.getNorthEast()); } return this; };
    LatLngBounds.prototype.toSpan = function () { return new LatLng((this.__n || 0) - (this.__s || 0), (this.__e || 0) - (this.__w || 0)); };
    LatLngBounds.prototype.equals = function (b) { return !!b && b.__s === this.__s && b.__w === this.__w && b.__n === this.__n && b.__e === this.__e; };
    LatLngBounds.prototype.toJSON = function () { return { south: this.__s, west: this.__w, north: this.__n, east: this.__e }; };
    LatLngBounds.prototype.toUrlValue = function (p) { return this.getSouthWest().toUrlValue(p) + ',' + this.getNorthEast().toUrlValue(p); };
    LatLngBounds.prototype.toString = function () { return '(' + this.getSouthWest() + ', ' + this.getNorthEast() + ')'; };

    function Point(x, y) { if (!(this instanceof Point)) return new Point(x, y); this.x = +x; this.y = +y; }
    Point.prototype.equals = function (o) { return !!o && o.x === this.x && o.y === this.y; };
    Point.prototype.toString = function () { return '(' + this.x + ', ' + this.y + ')'; };
    function Size(w, h, wu, hu) { if (!(this instanceof Size)) return new Size(w, h, wu, hu); this.width = +w; this.height = +h; this.widthUnit = wu; this.heightUnit = hu; }
    Size.prototype.equals = function (o) { return !!o && o.width === this.width && o.height === this.height; };
    Size.prototype.toString = function () { return '(' + this.width + ', ' + this.height + ')'; };

    /* ── MVC ────────────────────────────────────────────────────────────── */
    function MVCObject() {}
    MVCObject.prototype.get = function (k) { return this['__mvc_' + k]; };
    MVCObject.prototype.set = function (k, v) {
      var old = this['__mvc_' + k]; this['__mvc_' + k] = v;
      if (typeof this[k + '_changed'] === 'function') { try { this[k + '_changed'](old); } catch (e) {} }
      trigger(this, k + '_changed', old);
    };
    MVCObject.prototype.setValues = function (o) { var self = this; if (o) Object.keys(o).forEach(function (k) { var s = 'set' + k.charAt(0).toUpperCase() + k.slice(1); if (typeof self[s] === 'function' && s !== 'setValues') self[s](o[k]); else self.set(k, o[k]); }); };
    MVCObject.prototype.addListener = function (name, fn) { return listen(this, name, fn, false); };
    MVCObject.prototype.bindTo = function () {};
    MVCObject.prototype.unbind = function () {};
    MVCObject.prototype.unbindAll = function () {};
    MVCObject.prototype.notify = function (k) { trigger(this, k + '_changed'); };
    MVCObject.prototype.changed = function () {};
    function inherit(C) { C.prototype = Object.create(MVCObject.prototype); C.prototype.constructor = C; return C; }

    function MVCArray(a) { if (!(this instanceof MVCArray)) return new MVCArray(a); this.__a = (a || []).slice(); }
    inherit(MVCArray);
    MVCArray.prototype.getArray = function () { return this.__a; };
    MVCArray.prototype.getAt = function (i) { return this.__a[i]; };
    MVCArray.prototype.getLength = function () { return this.__a.length; };
    MVCArray.prototype.forEach = function (fn) { this.__a.slice().forEach(function (v, i) { fn(v, i); }); };
    MVCArray.prototype.indexOf = function (v) { return this.__a.indexOf(v); };
    MVCArray.prototype.insertAt = function (i, v) { this.__a.splice(i, 0, v); trigger(this, 'insert_at', i); };
    MVCArray.prototype.removeAt = function (i) { var v = this.__a.splice(i, 1)[0]; trigger(this, 'remove_at', i, v); return v; };
    MVCArray.prototype.setAt = function (i, v) { var o = this.__a[i]; this.__a[i] = v; trigger(this, 'set_at', i, o); };
    MVCArray.prototype.push = function (v) { this.insertAt(this.__a.length, v); return this.__a.length; };
    MVCArray.prototype.pop = function () { return this.__a.length ? this.removeAt(this.__a.length - 1) : undefined; };
    MVCArray.prototype.clear = function () { while (this.__a.length) this.pop(); };
    function toPath(p) {
      if (p instanceof MVCArray) return p;
      return new MVCArray((p || []).map(function (q) { return toLL(q) || q; }));
    }

    /* ── the camera ─────────────────────────────────────────────────────── */
    function mPerPx(lat, zoom) { return M_PER_PX_Z0 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom); }
    function divSize(div) {
      var w = (div && (div.offsetWidth || (div.getBoundingClientRect && div.getBoundingClientRect().width))) || 1200;
      var h = (div && (div.offsetHeight || (div.getBoundingClientRect && div.getBoundingClientRect().height))) || 800;
      return { w: w, h: h };
    }

    function GMap(div, o) {
      if (!(this instanceof GMap)) return new GMap(div, o);
      o = o || {};
      this.__div = div;
      this.__center = toLL(o.center) || new LatLng(opts.at || { lat: 41.8781, lng: -87.6298 });
      this.__zoom = o.zoom != null ? Math.round(+o.zoom) : 18;
      this.__type = o.mapTypeId || 'roadmap';
      this.__tilt = +o.tilt || 0; this.__heading = +o.heading || 0;
      this.__opts = {}; for (var k in o) this.__opts[k] = o[k];
      this.__boundsArmed = false; this.__idleTimer = null;
      this.controls = []; for (var i = 0; i <= 24; i++) this.controls.push(new MVCArray());
      this.overlayMapTypes = new MVCArray();
      this.data = new Data({ map: this });
      if (div && div.style && !div.style.position) div.style.position = 'relative';
      state.maps.push(this);
      var self = this;
      setTimeout(function () { trigger(self, 'projection_changed'); self.__moved(); trigger(self, 'tilesloaded'); }, 0);
    }
    inherit(GMap);
    /* After any change of view: bounds_changed on the next frame (once per
       frame however many changes), idle when it has been still IDLE_MS. */
    GMap.prototype.__moved = function () {
      var self = this;
      if (!self.__boundsArmed) {
        self.__boundsArmed = true;
        raf(function () { self.__boundsArmed = false; trigger(self, 'bounds_changed'); });
      }
      if (self.__idleTimer) clearTimeout(self.__idleTimer);
      self.__idleTimer = setTimeout(function () { self.__idleTimer = null; trigger(self, 'idle'); trigger(self, 'tilesloaded'); }, IDLE_MS);
    };
    GMap.prototype.getDiv = function () { return this.__div; };
    GMap.prototype.getCenter = function () { return this.__center; };
    GMap.prototype.getZoom = function () { return this.__zoom; };
    GMap.prototype.setZoom = function (z) {
      z = Math.max(0, Math.min(22, Math.round(+z)));
      if (!isFinite(z) || z === this.__zoom) return;
      this.__zoom = z; trigger(this, 'zoom_changed'); this.__moved();
    };
    GMap.prototype.setCenter = function (c) {
      c = toLL(c); if (!c) return;
      if (this.__center && this.__center.equals(c)) return;
      this.__center = c; trigger(this, 'center_changed'); this.__moved();
    };
    GMap.prototype.panTo = function (c) { this.setCenter(c); };
    GMap.prototype.panBy = function (dx, dy) {
      var c = this.__center, mpp = mPerPx(c.lat(), this.__zoom);
      this.setCenter(new LatLng(c.lat() - (+dy || 0) * mpp / 111320, c.lng() + (+dx || 0) * mpp / (111320 * Math.cos(c.lat() * Math.PI / 180))));
    };
    GMap.prototype.panToBounds = function (b) { if (b && !b.isEmpty()) this.setCenter(b.getCenter()); };
    GMap.prototype.getBounds = function () {
      var c = this.__center, sz = divSize(this.__div), mpp = mPerPx(c.lat(), this.__zoom);
      var dLat = (sz.h / 2) * mpp / 111320, dLng = (sz.w / 2) * mpp / (111320 * Math.cos(c.lat() * Math.PI / 180));
      return new LatLngBounds(new LatLng(c.lat() - dLat, c.lng() - dLng), new LatLng(c.lat() + dLat, c.lng() + dLng));
    };
    GMap.prototype.fitBounds = function (b, pad) {
      if (!(b instanceof LatLngBounds)) b = new LatLngBounds(b);
      if (b.isEmpty()) return;
      var p = typeof pad === 'number' ? pad : 0, sz = divSize(this.__div), ctr = b.getCenter();
      var spanM = Math.max((b.__n - b.__s) * 111320 / Math.max(1, sz.h - 2 * p), (b.__e - b.__w) * 111320 * Math.cos(ctr.lat() * Math.PI / 180) / Math.max(1, sz.w - 2 * p));
      var z = spanM > 0 ? Math.floor(Math.log(M_PER_PX_Z0 * Math.cos(ctr.lat() * Math.PI / 180) / spanM) / Math.LN2) : 21;
      var changed = false;
      if (!this.__center.equals(ctr)) { this.__center = ctr; changed = true; trigger(this, 'center_changed'); }
      z = Math.max(0, Math.min(21, z));
      if (z !== this.__zoom) { this.__zoom = z; changed = true; trigger(this, 'zoom_changed'); }
      if (changed) this.__moved();
    };
    GMap.prototype.setOptions = function (o) {
      o = o || {};
      for (var k in o) this.__opts[k] = o[k];
      if (o.center) this.setCenter(o.center);
      if (o.zoom != null) this.setZoom(o.zoom);
      if (o.mapTypeId) this.setMapTypeId(o.mapTypeId);
      if (o.tilt != null) this.setTilt(o.tilt);
      if (o.heading != null) this.setHeading(o.heading);
    };
    GMap.prototype.get = function (k) {
      if (k === 'center') return this.__center; if (k === 'zoom') return this.__zoom;
      if (k === 'mapTypeId') return this.__type;
      return k in this.__opts ? this.__opts[k] : MVCObject.prototype.get.call(this, k);
    };
    GMap.prototype.set = function (k, v) {
      if (k === 'center') return this.setCenter(v); if (k === 'zoom') return this.setZoom(v);
      if (k === 'mapTypeId') return this.setMapTypeId(v);
      this.__opts[k] = v; trigger(this, k + '_changed');
    };
    GMap.prototype.getMapTypeId = function () { return this.__type; };
    GMap.prototype.setMapTypeId = function (t) { if (t === this.__type) return; this.__type = t; trigger(this, 'maptypeid_changed'); };
    GMap.prototype.getTilt = function () { return this.__tilt; };
    GMap.prototype.setTilt = function (t) { t = +t || 0; if (t === this.__tilt) return; this.__tilt = t; trigger(this, 'tilt_changed'); };
    GMap.prototype.getHeading = function () { return this.__heading; };
    GMap.prototype.setHeading = function (h) { h = +h || 0; if (h === this.__heading) return; this.__heading = h; trigger(this, 'heading_changed'); };
    GMap.prototype.getRenderingType = function () { return 'RASTER'; };
    GMap.prototype.getMapCapabilities = function () { return { isAdvancedMarkersAvailable: false, isDataDrivenStylingAvailable: false }; };
    GMap.prototype.moveCamera = function (cam) { if (!cam) return; if (cam.center) this.setCenter(cam.center); if (cam.zoom != null) this.setZoom(cam.zoom); };
    GMap.prototype.getStreetView = function () { return this.__sv || (this.__sv = new StreetViewPanorama()); };
    GMap.prototype.setStreetView = function (p) { this.__sv = p; };
    GMap.prototype.getProjection = function () {
      /* Web Mercator world coordinates, 256 px at zoom 0, as Google's */
      return {
        fromLatLngToPoint: function (ll) {
          ll = toLL(ll); var s = Math.sin(ll.lat() * Math.PI / 180); s = Math.min(Math.max(s, -0.9999), 0.9999);
          return new Point(256 * (0.5 + ll.lng() / 360), 256 * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)));
        },
        fromPointToLatLng: function (p) {
          var n = Math.PI - 2 * Math.PI * p.y / 256;
          return new LatLng(180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), p.x / 256 * 360 - 180);
        }
      };
    };

    /* ── overlays ───────────────────────────────────────────────────────── */
    function Overlay(o) { this.__map = null; this.__visible = true; this.setOptions(o || {}); }
    inherit(Overlay);
    Overlay.prototype.setOptions = function (o) {
      o = o || {};
      for (var k in o) {
        if (k === 'map') continue;
        if (k === 'path') this.setPath(o.path); else if (k === 'paths') this.setPaths(o.paths);
        else if (k === 'position') this.setPosition(o.position); else this['__mvc_' + k] = o[k];
      }
      if ('map' in o) this.setMap(o.map);
    };
    Overlay.prototype.setMap = function (m) { if (m === this.__map) return; this.__map = m || null; trigger(this, 'map_changed'); };
    Overlay.prototype.getMap = function () { return this.__map; };
    Overlay.prototype.setVisible = function (v) { this.__visible = !!v; trigger(this, 'visible_changed'); };
    Overlay.prototype.getVisible = function () { return this.__visible; };
    Overlay.prototype.setPosition = function (p) { this.__pos = toLL(p) || p; trigger(this, 'position_changed'); };
    Overlay.prototype.getPosition = function () { return this.__pos || null; };
    Overlay.prototype.setPath = function (p) { this.__path = toPath(p); };
    Overlay.prototype.getPath = function () { return this.__path || (this.__path = new MVCArray()); };
    Overlay.prototype.setPaths = function (p) {
      var arr = (p instanceof MVCArray) ? p.getArray() : (p || []);
      var nested = arr.length && (Array.isArray(arr[0]) || arr[0] instanceof MVCArray);
      this.__paths = new MVCArray(nested ? arr.map(toPath) : [toPath(arr)]);
    };
    Overlay.prototype.getPaths = function () { return this.__paths || (this.__paths = new MVCArray([this.getPath()])); };
    ['Draggable', 'Editable', 'Icon', 'Title', 'Label', 'ZIndex', 'Opacity', 'Cursor', 'Clickable', 'Shape', 'Animation', 'Content', 'Radius', 'Center', 'Bounds'].forEach(function (n) {
      var k = n.charAt(0).toLowerCase() + n.slice(1);
      Overlay.prototype['set' + n] = function (v) { this['__mvc_' + k] = (k === 'center') ? (toLL(v) || v) : v; trigger(this, k + '_changed'); };
      Overlay.prototype['get' + n] = function () { return this['__mvc_' + k]; };
    });
    function Marker(o) { Overlay.call(this, o); } Marker.prototype = Object.create(Overlay.prototype); Marker.prototype.constructor = Marker;
    function Polyline(o) { Overlay.call(this, o); } Polyline.prototype = Object.create(Overlay.prototype); Polyline.prototype.constructor = Polyline;
    function Polygon(o) { Overlay.call(this, o); } Polygon.prototype = Object.create(Overlay.prototype); Polygon.prototype.constructor = Polygon;
    Polygon.prototype.getPath = function () { return this.getPaths().getAt(0) || new MVCArray(); };
    Polygon.prototype.setPath = function (p) { this.setPaths(p); };
    function Circle(o) { Overlay.call(this, o); } Circle.prototype = Object.create(Overlay.prototype); Circle.prototype.constructor = Circle;
    Circle.prototype.getBounds = function () {
      var c = this.getCenter(), r = +this.getRadius() || 0; if (!c) return null;
      var dLat = r / 111320, dLng = r / (111320 * Math.cos(c.lat() * Math.PI / 180));
      return new LatLngBounds(new LatLng(c.lat() - dLat, c.lng() - dLng), new LatLng(c.lat() + dLat, c.lng() + dLng));
    };
    function Rectangle(o) { Overlay.call(this, o); } Rectangle.prototype = Object.create(Overlay.prototype); Rectangle.prototype.constructor = Rectangle;
    function InfoWindow(o) { Overlay.call(this, o); } InfoWindow.prototype = Object.create(Overlay.prototype); InfoWindow.prototype.constructor = InfoWindow;
    InfoWindow.prototype.open = function (m) { this.__map = (m && m.getDiv) ? m : (m && m.map) || this.__map; trigger(this, 'domready'); };
    InfoWindow.prototype.close = function () { this.__map = null; trigger(this, 'closeclick'); };
    function GroundOverlay(url, bounds, o) { Overlay.call(this, o); this.__url = url; this.__bounds = bounds; }
    GroundOverlay.prototype = Object.create(Overlay.prototype); GroundOverlay.prototype.constructor = GroundOverlay;
    GroundOverlay.prototype.getUrl = function () { return this.__url; };
    function Layer(o) { Overlay.call(this, o); } Layer.prototype = Object.create(Overlay.prototype); Layer.prototype.constructor = Layer;

    /* OverlayView: onAdd then draw after setMap(map), off the caller's
       stack; draw again on every bounds_changed. getProjection() is null,
       which every caller in the editor already handles (it is null until
       Google's first draw). */
    function OverlayView() { this.__map = null; this.__panes = null; this.__h = null; }
    inherit(OverlayView);
    OverlayView.prototype.setMap = function (m) {
      var self = this;
      if (m === self.__map) return;
      if (self.__map) { if (self.__h) self.__h.remove(); self.__h = null; try { if (self.onRemove) self.onRemove(); } catch (e) {} }
      self.__map = m || null;
      if (!m) return;
      setTimeout(function () {
        if (self.__map !== m) return;
        try { if (self.onAdd) self.onAdd(); } catch (e) {}
        try { if (self.draw) self.draw(); } catch (e) {}
        self.__h = listen(m, 'bounds_changed', function () { try { if (self.draw) self.draw(); } catch (e) {} }, false);
      }, 0);
    };
    OverlayView.prototype.getMap = function () { return this.__map; };
    OverlayView.prototype.getProjection = function () { return null; };
    OverlayView.prototype.getPanes = function () {
      if (this.__panes) return this.__panes;
      var host = (this.__map && this.__map.getDiv && this.__map.getDiv()) || (doc && doc.body), panes = {};
      ['mapPane', 'overlayLayer', 'markerLayer', 'overlayMouseTarget', 'floatPane'].forEach(function (k) {
        var d = doc.createElement('div'); d.setAttribute('data-gm-pane', k); d.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;';
        if (host) host.appendChild(d);
        panes[k] = d;
      });
      return (this.__panes = panes);
    };
    OverlayView.preventMapHitsFrom = function () {};
    OverlayView.preventMapHitsAndGesturesFrom = function () {};
    function WebGLOverlayView() { OverlayView.call(this); }
    WebGLOverlayView.prototype = Object.create(OverlayView.prototype); WebGLOverlayView.prototype.constructor = WebGLOverlayView;
    WebGLOverlayView.prototype.requestRedraw = function () {};
    WebGLOverlayView.prototype.setMap = function (m) { this.__map = m || null; };

    function Data(o) { this.__f = []; this.__map = (o && o.map) || null; }
    inherit(Data);
    Data.prototype.add = function (f) { this.__f.push(f); return f; };
    Data.prototype.addGeoJson = function () { return []; };
    Data.prototype.loadGeoJson = function (u, o, cb) { if (cb) setTimeout(function () { cb([]); }, 0); };
    Data.prototype.forEach = function (fn) { this.__f.slice().forEach(fn); };
    Data.prototype.remove = function (f) { var i = this.__f.indexOf(f); if (i >= 0) this.__f.splice(i, 1); };
    Data.prototype.contains = function (f) { return this.__f.indexOf(f) >= 0; };
    Data.prototype.getFeatureById = function () { return undefined; };
    Data.prototype.setStyle = function (s) { this.__style = s; };
    Data.prototype.getStyle = function () { return this.__style; };
    Data.prototype.overrideStyle = function () {}; Data.prototype.revertStyle = function () {};
    Data.prototype.setMap = function (m) { this.__map = m || null; }; Data.prototype.getMap = function () { return this.__map; };
    Data.prototype.toGeoJson = function (cb) { cb({ type: 'FeatureCollection', features: [] }); };

    function ImageMapType(o) { o = o || {}; this.tileSize = o.tileSize || new Size(256, 256); this.name = o.name; this.maxZoom = o.maxZoom; this.minZoom = o.minZoom; this.__o = o; this.opacity = o.opacity == null ? 1 : o.opacity; }
    inherit(ImageMapType);
    ImageMapType.prototype.getTile = function () { return doc.createElement('div'); };
    ImageMapType.prototype.releaseTile = function () {};
    ImageMapType.prototype.setOpacity = function (v) { this.opacity = v; };
    ImageMapType.prototype.getOpacity = function () { return this.opacity; };
    function StyledMapType(styles, o) { ImageMapType.call(this, o); this.styles = styles; }
    StyledMapType.prototype = Object.create(ImageMapType.prototype); StyledMapType.prototype.constructor = StyledMapType;

    function StreetViewPanorama() { this.__visible = false; }
    inherit(StreetViewPanorama);
    StreetViewPanorama.prototype.setVisible = function (v) { this.__visible = !!v; trigger(this, 'visible_changed'); };
    StreetViewPanorama.prototype.getVisible = function () { return this.__visible; };
    StreetViewPanorama.prototype.setPosition = function () {}; StreetViewPanorama.prototype.getPosition = function () { return null; };
    StreetViewPanorama.prototype.setPov = function () {}; StreetViewPanorama.prototype.getPov = function () { return { heading: 0, pitch: 0 }; };
    StreetViewPanorama.prototype.setOptions = function () {};

    /* ── services: a fixed answer, async, callback and promise alike ────── */
    function answer(cb, results, status) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if (typeof cb === 'function') { try { cb(results, status); } catch (e) {} }
          if (status === 'OK') resolve({ results: results }); else resolve({ results: results || [] });
        }, 0);
      });
    }
    function Geocoder() {}
    Geocoder.prototype.geocode = function (req, cb) {
      req = req || {};
      var table = opts.geocode || {}, key = req.address ? String(req.address).trim().toLowerCase() : '';
      var at = (key && table[key]) || (req.location && toLL(req.location) && req.location) || opts.at || { lat: 41.8781, lng: -87.6298 };
      var ll = toLL(at), b = new LatLngBounds(new LatLng(ll.lat() - 0.0015, ll.lng() - 0.002), new LatLng(ll.lat() + 0.0015, ll.lng() + 0.002));
      state.geocoded.push(req.address || req.location || req.placeId || null);
      return answer(cb, [{ geometry: { location: ll, location_type: 'ROOFTOP', viewport: b, bounds: b },
        formatted_address: req.address || ll.toUrlValue(), place_id: 'gmaps-double', types: ['street_address'],
        address_components: [] }], 'OK');
    };
    function ElevationService() {}
    ElevationService.prototype.getElevationForLocations = function (req, cb) {
      var locs = (req && req.locations) || [];
      return answer(cb, locs.map(function (l) { return { elevation: 0, location: toLL(l), resolution: 30 }; }), 'OK');
    };
    ElevationService.prototype.getElevationAlongPath = function (req, cb) { return answer(cb, [], 'OK'); };
    function MaxZoomService() {}
    MaxZoomService.prototype.getMaxZoomAtLatLng = function (ll, cb) {
      var r = { status: 'OK', zoom: 21 };
      return new Promise(function (res) { setTimeout(function () { if (cb) { try { cb(r); } catch (e) {} } res(r); }, 0); });
    };
    function none() { function S() {} S.prototype = new Proxy({}, { get: function (t, k) { if (k === 'then') return undefined; return function () { var cb = [].slice.call(arguments).filter(function (a) { return typeof a === 'function'; })[0]; return answer(cb, null, 'ZERO_RESULTS'); }; } }); return S; }
    function Autocomplete(input, o) { this.__input = input; this.__o = o || {}; }
    inherit(Autocomplete);
    Autocomplete.prototype.getPlace = function () { return {}; };
    ['Bounds', 'ComponentRestrictions', 'Fields', 'Options', 'Types'].forEach(function (n) { Autocomplete.prototype['set' + n] = function () {}; });
    Autocomplete.prototype.getBounds = function () { return undefined; };

    var spherical = {
      computeDistanceBetween: function (a, b, r) {
        a = toLL(a); b = toLL(b); r = r || EARTH_R;
        var p1 = a.lat() * Math.PI / 180, p2 = b.lat() * Math.PI / 180, dp = p2 - p1, dl = (b.lng() - a.lng()) * Math.PI / 180;
        var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
      },
      computeLength: function (path, r) {
        var a = (path && path.getArray) ? path.getArray() : (path || []), s = 0;
        for (var i = 1; i < a.length; i++) s += spherical.computeDistanceBetween(a[i - 1], a[i], r);
        return s;
      },
      computeSignedArea: function (path, r) {
        var a = ((path && path.getArray) ? path.getArray() : (path || [])).map(toLL), n = a.length; r = r || EARTH_R;
        if (n < 3) return 0;
        var s = 0;
        for (var i = 0; i < n; i++) {
          var p1 = a[i], p2 = a[(i + 1) % n];
          s += (p2.lng() - p1.lng()) * Math.PI / 180 * (2 + Math.sin(p1.lat() * Math.PI / 180) + Math.sin(p2.lat() * Math.PI / 180));
        }
        return s * r * r / 2;
      },
      computeArea: function (path, r) { return Math.abs(spherical.computeSignedArea(path, r)); },
      computeHeading: function (a, b) {
        a = toLL(a); b = toLL(b);
        var p1 = a.lat() * Math.PI / 180, p2 = b.lat() * Math.PI / 180, dl = (b.lng() - a.lng()) * Math.PI / 180;
        var y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
        var h = Math.atan2(y, x) * 180 / Math.PI; return h >= 180 ? h - 360 : h;
      },
      computeOffset: function (from, d, heading, r) {
        from = toLL(from); r = r || EARTH_R;
        var dr = d / r, th = heading * Math.PI / 180, p1 = from.lat() * Math.PI / 180, l1 = from.lng() * Math.PI / 180;
        var p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(th));
        var l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
        return new LatLng(p2 * 180 / Math.PI, l2 * 180 / Math.PI);
      },
      computeOffsetOrigin: function (to, d, heading, r) { return spherical.computeOffset(to, d, heading + 180, r); },
      interpolate: function (a, b, f) { a = toLL(a); b = toLL(b); return new LatLng(a.lat() + (b.lat() - a.lat()) * f, a.lng() + (b.lng() - a.lng()) * f); }
    };
    var poly = {
      containsLocation: function (pt, polygon) {
        pt = toLL(pt);
        var a = polygon && polygon.getPath ? polygon.getPath().getArray().map(toLL) : [], inside = false;
        for (var i = 0, j = a.length - 1; i < a.length; j = i++) {
          var xi = a[i].lng(), yi = a[i].lat(), xj = a[j].lng(), yj = a[j].lat();
          if (((yi > pt.lat()) !== (yj > pt.lat())) && (pt.lng() < (xj - xi) * (pt.lat() - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
      },
      isLocationOnEdge: function () { return false; }
    };
    var encoding = {
      encodePath: function (path) {
        var a = (path && path.getArray) ? path.getArray() : (path || []), out = '', pl = 0, pg = 0;
        function enc(v) { v = v < 0 ? ~(v << 1) : (v << 1); var s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); }
        a.map(toLL).forEach(function (p) { var la = Math.round(p.lat() * 1e5), lo = Math.round(p.lng() * 1e5); out += enc(la - pl) + enc(lo - pg); pl = la; pg = lo; });
        return out;
      },
      decodePath: function (s) {
        var i = 0, la = 0, lo = 0, out = [];
        while (i < s.length) {
          var b, sh = 0, r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); la += (r & 1) ? ~(r >> 1) : (r >> 1);
          sh = 0; r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); lo += (r & 1) ? ~(r >> 1) : (r >> 1);
          out.push(new LatLng(la / 1e5, lo / 1e5));
        }
        return out;
      }
    };

    function AdvancedMarkerElement(o) { o = o || {}; this.position = o.position || null; this.map = o.map || null; this.content = o.content || null; this.title = o.title || ''; this.element = doc.createElement('div'); }
    AdvancedMarkerElement.prototype.addListener = function (n, fn) { return listen(this, n, fn, false); };
    function PinElement(o) { this.element = doc.createElement('div'); this.__o = o || {}; }

    var ControlPosition = {};
    ['TOP_LEFT', 'TOP_CENTER', 'TOP', 'TOP_RIGHT', 'LEFT_CENTER', 'LEFT_TOP', 'LEFT', 'LEFT_BOTTOM', 'RIGHT_TOP', 'RIGHT', 'RIGHT_CENTER', 'RIGHT_BOTTOM',
      'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM', 'BOTTOM_RIGHT', 'CENTER', 'BLOCK_START_INLINE_START', 'BLOCK_START_INLINE_CENTER', 'BLOCK_START_INLINE_END',
      'INLINE_START_BLOCK_CENTER', 'INLINE_START_BLOCK_START', 'INLINE_START_BLOCK_END', 'INLINE_END_BLOCK_START', 'INLINE_END_BLOCK_CENTER'].forEach(function (k, i) { ControlPosition[k] = i; });

    var known = {
      __double: state,
      version: '3.gmaps-double',
      Map: GMap, LatLng: LatLng, LatLngBounds: LatLngBounds, Point: Point, Size: Size,
      MVCObject: MVCObject, MVCArray: MVCArray, event: event,
      Marker: Marker, Polyline: Polyline, Polygon: Polygon, Circle: Circle, Rectangle: Rectangle, InfoWindow: InfoWindow,
      GroundOverlay: GroundOverlay, KmlLayer: Layer, TrafficLayer: Layer, TransitLayer: Layer, BicyclingLayer: Layer,
      OverlayView: OverlayView, WebGLOverlayView: WebGLOverlayView, Data: Data,
      ImageMapType: ImageMapType, StyledMapType: StyledMapType, StreetViewPanorama: StreetViewPanorama,
      Geocoder: Geocoder, ElevationService: ElevationService, MaxZoomService: MaxZoomService,
      StreetViewService: none(), DirectionsService: none(), DistanceMatrixService: none(), DirectionsRenderer: Layer,
      geometry: { spherical: spherical, poly: poly, encoding: encoding },
      places: { Autocomplete: Autocomplete, SearchBox: Autocomplete, AutocompleteService: none(), PlacesService: none(),
        AutocompleteSessionToken: function () {}, PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS', INVALID_REQUEST: 'INVALID_REQUEST', NOT_FOUND: 'NOT_FOUND' } },
      marker: { AdvancedMarkerElement: AdvancedMarkerElement, PinElement: PinElement },
      MapTypeId: { ROADMAP: 'roadmap', SATELLITE: 'satellite', HYBRID: 'hybrid', TERRAIN: 'terrain' },
      MapTypeControlStyle: { DEFAULT: 0, HORIZONTAL_BAR: 1, DROPDOWN_MENU: 2 },
      ControlPosition: ControlPosition,
      SymbolPath: { CIRCLE: 0, FORWARD_CLOSED_ARROW: 1, FORWARD_OPEN_ARROW: 2, BACKWARD_CLOSED_ARROW: 3, BACKWARD_OPEN_ARROW: 4 },
      Animation: { BOUNCE: 1, DROP: 2 }, StrokePosition: { CENTER: 0, INSIDE: 1, OUTSIDE: 2 },
      GeocoderStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS', ERROR: 'ERROR' }, GeocoderLocationType: { ROOFTOP: 'ROOFTOP', APPROXIMATE: 'APPROXIMATE' },
      ElevationStatus: { OK: 'OK' }, MaxZoomStatus: { OK: 'OK' }, StreetViewStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      DirectionsStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' }, TravelMode: { DRIVING: 'DRIVING', WALKING: 'WALKING' }, UnitSystem: { METRIC: 0, IMPERIAL: 1 },
      RenderingType: { RASTER: 'RASTER', VECTOR: 'VECTOR', UNINITIALIZED: 'UNINITIALIZED' }
    };
    known.importLibrary = function (name) {
      var lib = { core: known, maps: known, marker: known.marker, geometry: known.geometry, places: known.places,
        geocoding: { Geocoder: Geocoder }, elevation: { ElevationService: ElevationService }, streetView: { StreetViewPanorama: StreetViewPanorama, StreetViewService: known.StreetViewService },
        routes: { DirectionsService: known.DirectionsService } }[name] || known;
      return Promise.resolve(lib);
    };
    /* any other name: a constructor whose methods do nothing, recorded */
    function stub(name) {
      function Stub() {}
      Stub.prototype = new Proxy({}, { get: function (t, k) { if (k === 'then' || typeof k === 'symbol') return undefined; return function () {}; } });
      Stub.__unknown = name;
      return Stub;
    }
    var maps = new Proxy(known, {
      get: function (t, k) {
        if (k in t || typeof k === 'symbol' || k === 'then' || k === 'toJSON') return t[k];
        if (state.unknown.indexOf(k) < 0) state.unknown.push(k);
        return (t[k] = stub(k));
      }
    });
    win.google = win.google || {};
    win.google.maps = maps;
    return maps;
  }

  /* The body to serve for https://maps.googleapis.com/maps/api/js?...:
     this file, the install, and the callback the URL names, called off the
     loading script's stack as Google does. */
  function gmapsScript(source, url, opts) {
    var cb = null;
    try { cb = new URL(url).searchParams.get('callback'); } catch (e) {}
    return source + '\n;GMapsDouble.install(window, ' + JSON.stringify(opts || {}) + ');\n'
      + (cb && /^[A-Za-z_$][\w$.]*$/.test(cb) ? 'setTimeout(function(){ try { var f = window; ' + JSON.stringify(cb) + '.split(".").forEach(function (k) { f = f && f[k]; }); if (typeof f === "function") f(); } catch (e) { setTimeout(function () { throw e; }, 0); } }, 0);\n' : '');
  }

  return { install: install, gmapsScript: gmapsScript, IDLE_MS: IDLE_MS };
});
