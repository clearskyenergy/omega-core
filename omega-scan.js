/* ═══════════════════════════════════════════════════════════════════════════
   omega-scan.js — the camera barcode reader every Omega Logic page uses
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The office app's Sites tab, the plant bench (plant/station.html) and the
   desktop Sites & custody page scan a unit's label with the phone's camera.
   They used the browser's own BarcodeDetector, which Safari does not have —
   so on every iPhone (Safari, a home-screen app, Chrome on iOS: all WebKit)
   the Camera button said the phone could not scan.

   Here: the browser's own detector where it has one that reads our labels
   (QR, Data Matrix, Code 128); everywhere else the same API from ZXing
   (barcode-detector 3.2.2 on zxing-wasm 3.1.3, MIT; ZXing-C++ Apache-2.0),
   served from this site under /vendor/zxing/3.1.3/ — not a CDN, so a
   scan never depends on a third party and the wasm is the file whose
   SHA-256 the library pins. It is loaded only when someone taps Camera.

     OmegaScan.start(videoEl, onCode) → Promise<stop()>   rejects with an
       Error whose message a person can act on (no camera, permission
       refused, reader did not load). onCode(text) fires once; the camera
       is already stopped when it does.
     OmegaScan.detector(formats)      → Promise<detector>
     OmegaScan.canCamera()            → whether this page may ask at all
   ES5.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var BASE = '/vendor/zxing/3.1.3/', FORMATS = ['qr_code', 'data_matrix', 'code_128'], loading = null;

  function canCamera() {
    var n = global.navigator;
    return !!(n && n.mediaDevices && typeof n.mediaDevices.getUserMedia === 'function') && global.isSecureContext !== false;
  }
  /* our ZXing reader, once per page */
  function load() {
    if (global.BarcodeDetectionAPI && global.BarcodeDetectionAPI.BarcodeDetector) return Promise.resolve(global.BarcodeDetectionAPI);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = BASE + 'barcode-detector-ponyfill.js'; s.async = true;
      s.onload = function () {
        var api = global.BarcodeDetectionAPI;
        if (!api || !api.BarcodeDetector) { reject(new Error('The barcode reader did not load. Refresh and try again.')); return; }
        try { api.prepareZXingModule({ overrides: { locateFile: function (path, prefix) { return /\.wasm$/.test(path) ? BASE + path : prefix + path; } } }); } catch (e) {}
        resolve(api);
      };
      s.onerror = function () { reject(new Error('The barcode reader did not load. Check your signal and try again.')); };
      (document.head || document.documentElement).appendChild(s);
    });
    loading['catch'](function () { loading = null; });
    return loading;
  }
  function ours(formats) { return load().then(function (api) { return new api.BarcodeDetector({ formats: formats }); }); }
  /* the browser's own detector when it reads every format we print */
  function detector(formats) {
    formats = formats || FORMATS;
    var Native = global.BarcodeDetector;
    if (typeof Native !== 'function' || global.OMEGA_SCAN_ZXING || typeof Native.getSupportedFormats !== 'function') return ours(formats);
    return Native.getSupportedFormats().then(function (have) {
      for (var i = 0; i < formats.length; i++) if ((have || []).indexOf(formats[i]) < 0) return ours(formats);
      return new Native({ formats: formats });
    }, function () { return ours(formats); });
  }
  function said(e) {
    var n = String(e && e.name || '');
    if (/NotAllowed|Security|PermissionDenied/.test(n)) return new Error('The camera is blocked for this page. Allow it (Settings → Safari → Camera, or the aA menu → Website Settings), then tap Camera again.');
    if (/NotFound|Overconstrained|DevicesNotFound/.test(n)) return new Error('No camera was found on this device; type the serial.');
    if (/NotReadable|TrackStart|Abort/.test(n)) return new Error('The camera is busy in another app. Close it and tap Camera again.');
    return e instanceof Error && e.message ? e : new Error('The camera could not start; type the serial.');
  }
  /* camera on, read until one code, camera off */
  function start(video, onCode, formats) {
    if (!canCamera()) return Promise.reject(new Error('This browser cannot use the camera here; type the serial.'));
    var stream = null, timer = null, done = false, busy = false;
    function stop() {
      done = true;
      if (timer) { clearInterval(timer); timer = null; }
      if (stream) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); stream = null; }
      try { video.srcObject = null; } catch (e) {}
    }
    return detector(formats).then(function (det) {
      return global.navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (st) {
        if (done) { st.getTracks().forEach(function (t) { t.stop(); }); return stop; }
        stream = st;
        video.setAttribute('playsinline', ''); video.muted = true; video.srcObject = st;
        var p = video.play(); if (p && p['catch']) p['catch'](function () {});
        timer = setInterval(function () {
          if (busy || done || video.readyState < 2) return;
          busy = true;
          det.detect(video).then(function (codes) {
            busy = false;
            var val = codes && codes.length ? String(codes[0].rawValue || '').trim() : '';
            if (val && !done) { stop(); onCode(val); }
          }, function () { busy = false; });
        }, 250);
        return stop;
      });
    })['catch'](function (e) { stop(); throw said(e); });
  }
  global.OmegaScan = { start: start, detector: detector, canCamera: canCamera, load: load, FORMATS: FORMATS, BASE: BASE };
})(window);
