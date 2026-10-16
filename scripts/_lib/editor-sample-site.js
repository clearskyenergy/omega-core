/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The editor's render checks' sample site, in one place: the offline Firebase
 * stand-in the editor boots on (a packaged workspace holding the modules a
 * check asks for), a small battery-and-chargers site placed with the
 * editor's own tools, and the visualizer's wrappers as it drew them. Each
 * function runs IN THE PAGE (context.addInitScript / page.evaluate), so it
 * may use only what the page has.
 * Used by scripts/render-build-sequence.js and scripts/render-takeoff.js. */
'use strict';

/* the Firebase compat surface the editor touches, offline (render-plan-read.js's) */
function fixture(opt) {
  window.__billing = { packaged: true, packagingState: 'paid', modules: (opt && opt.modules) || ['lite', 'plansets'] };
  var user = { uid: 'builder', email: 'designer@sunrise.example', emailVerified: true, displayName: 'Site Builder', getIdToken: function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? window.__billing : /^omega_orgs\/[^/]+$/.test(p) ? { name: 'Sunrise Solar', status: 'active', domains: [location.hostname] } : /members\//.test(p) ? { role: 'owner', status: 'active' } : null;
    return { exists: !!data, id: p.split('/').pop(), data: function () { return data; }, docs: [], empty: true, forEach: function () {} };
  }
  function ref(p) {
    return { collection: function (n) { return ref(p + '/' + n); }, doc: function (n) { return ref(p + '/' + n); },
      get: function () { return Promise.resolve(snapshot(p)); }, onSnapshot: function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
      where: function () { return this; }, orderBy: function () { return this; }, limit: function () { return this; },
      set: function () { throw new Error('Unexpected fixture write: ' + p); }, update: function () { throw new Error('Unexpected fixture update: ' + p); },
      add: function () { return Promise.resolve({ id: 'fixture-created' }); } };
  }
  var db = { collection: function (n) { return ref(n); }, settings: function () {}, enablePersistence: function () { return Promise.resolve(); } };
  window.__user = user; window.__listeners = [];
  var auth = { currentUser: null, onAuthStateChanged: function (fn) { window.__listeners.push(fn); return function () {}; }, getRedirectResult: function () { return Promise.resolve({}); }, setPersistence: function () { return Promise.resolve(); }, signOut: function () { return Promise.resolve(); } };
  function firestore() { return db; }
  firestore.FieldValue = { serverTimestamp: function () { return 'fixture-time'; } };
  function authentication() { return auth; }
  authentication.Auth = { Persistence: { LOCAL: 'local' } };
  authentication.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };
  var app = { firestore: firestore, auth: authentication };
  window.firebase = { apps: [app], initializeApp: function () { return app; }, app: function () { return app; }, firestore: firestore, auth: authentication };
  window.CLEARSKY_CONFIG = { firebase: {}, adminDomains: ['clearsky-usa.com'], tenant: { orgId: 'sunrise.example', name: 'Sunrise Solar', status: 'active' } };
  window.alert = function () {};
  window.confirm = function () { return true; };
}

/* A small battery-and-chargers site, placed with the editor's own tools. */
function placeSite() {
  var sc = document.getElementById('sc'), r = sc.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2;
  function at(dx, dy) { return window._plotUnproject({ x: cx + dx, y: cy + dy }); }
  function put(id, dx, dy) {
    var c = at(dx, dy), w = _eqDropW(id), def = EQ.filter(function (e) { return e.id === id; })[0];
    return addEl({ type: 'eq', eqId: id, label: def ? def.label : id, x: c.x - w / 2, y: c.y - w / 2, w: w, rot: 0, spec: _eqSpec(id) });
  }
  function charger(kind, cat, dx, dy) {
    var key = Object.keys(cat)[0], d = cat[key], c = at(dx, dy);
    var sh = { id: uid(), kind: kind, evId: key, pts: [{ x: c.x, y: c.y }], style: S.shapeStyle, color: SHAPE_STROKE, lf: d.lf, wf: d.wf, model: d.model, mfr: d.mfr, kw: d.kw,
      connectors: d.connectors, ports: d.ports, img: d.img, scaled: !!(S.pxPerFt > 0) };
    S.shapes.push(sh); renderShape(sh);
  }
  put('pole', 200, -70); put('hydrant', -170, 20);          /* what stands before the job starts */
  put('pad', -40, 0); put('pad', 40, 0);
  put('bess', -40, 0); put('pcs', 40, 0); put('xfmr', 120, 0);
  put('panel', -120, 80); put('disco', -80, 80); put('meter', -40, 80);
  put('bollard', 100, -30); put('bollard', 140, -30);
  put('fence', 40, -70);
  charger('evl2', EVC_L2, 180, 120); charger('evl2', EVC_L2, 215, 120); charger('evunit', EVC_UNIT, 270, 120);
  /* a 60 kW ground array north of the yard, drawn at the size its kW takes (DER build's block) */
  var o = at(-300, -470), ppf = (window.OmegaScale ? OmegaScale.pxPerFt() : (S.pxPerFt || 6));
  var sol = { id: uid(), kind: 'dersolar', mount: 'ground', pts: [{ x: o.x, y: o.y }], wPx: 600, hPx: 360, wFt: +(600 / ppf).toFixed(2), hFt: +(360 / ppf).toFixed(2),
    sqft: Math.round((600 / ppf) * (360 / ppf)), kw: 60, color: SHAPE_STROKE };
  S.shapes.push(sol); renderShape(sol);
  updShapeCount(); pushHist();
  /* a conduit run, the Draw › Conduit tool's own finish */
  S.condType = 'PVC-UG'; S.condPts = [at(120, 0), at(120, 120), at(270, 120)];
  finishConduit();
  if (typeof cancelConduit === 'function') try { cancelConduit(); } catch (e) {}
  try { setMode('select'); } catch (e) {}
}

/* Every wrapper the visualizer drew, as it drew it. */
function pieces() {
  var V = OmegaSiteVis._V(), byId = {}, out = [];
  V.site.items.forEach(function (it) { byId[it.id] = it; });
  Object.keys(V.layers).forEach(function (g) {
    (V.layers[g].children || []).forEach(function (w, i) {
      var it = g === 'conduit' ? null : byId[w.userData && w.userData.itemId];
      out.push({ g: g, i: i, arch: it ? it.arch : (g === 'conduit' ? 'conduit' : null), vis: w.visible, y: +w.position.y.toFixed(3), s: [+w.scale.x.toFixed(4), +w.scale.y.toFixed(4), +w.scale.z.toFixed(4)] });
    });
  });
  return out;
}


module.exports = { fixture: fixture, placeSite: placeSite, pieces: pieces };
