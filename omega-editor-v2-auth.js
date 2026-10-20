/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Site Plan sign-in. Same Firebase project and LOCAL persistence as Site
 * Map (editor.html). The public web config is config.js CLEARSKY_CONFIG.
 * This file does not size, price, or place a build.
 */
(function (root) {
  'use strict';

  var auth = null;
  var readyP = null;

  function cfg() {
    var c = root.CLEARSKY_CONFIG;
    return c && c.firebase ? c.firebase : null;
  }

  function firebaseReady() {
    return !!(root.firebase && root.firebase.initializeApp && root.firebase.auth);
  }

  function ensure() {
    if (auth) return auth;
    if (!firebaseReady()) return null;
    var conf = cfg();
    if (!conf || !conf.projectId) return null;
    try {
      if (!root.firebase.apps || !root.firebase.apps.length) root.firebase.initializeApp(conf);
      auth = root.firebase.auth();
      auth.setPersistence(root.firebase.auth.Auth.Persistence.LOCAL).catch(function () {});
      auth.getRedirectResult().catch(function () {});
    } catch (e) {
      auth = null;
    }
    return auth;
  }

  function whenReady() {
    if (readyP) return readyP;
    if (typeof document === 'undefined') return Promise.resolve(null);
    var a = ensure();
    if (!a) return Promise.resolve(null);
    readyP = new Promise(function (resolve) {
      var done = false;
      function finish(u) {
        if (done) return;
        done = true;
        resolve(u || null);
      }
      try {
        var unsub = a.onAuthStateChanged(function (u) {
          try { if (typeof unsub === 'function') unsub(); } catch (e) {}
          finish(u);
        });
      } catch (e) { finish(null); }
    });
    return readyP;
  }

  function idToken() {
    return whenReady().then(function () {
      var a = ensure();
      var u = a && a.currentUser;
      if (!u || typeof u.getIdToken !== 'function') return '';
      return u.getIdToken().then(function (t) { return t || ''; }, function () { return ''; });
    });
  }

  function signIn() {
    return whenReady().then(function () {
      if (!ensure()) return Promise.reject(new Error('Sign-in is unavailable. Check the connection and refresh.'));
      var provider = new root.firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      return auth.signInWithPopup(provider).then(function (result) {
        return (result && result.user) || auth.currentUser;
      }, function (err) {
        var code = err && err.code;
        if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          return auth.signInWithRedirect(provider);
        }
        var msg = 'Sign-in did not finish.';
        if (code === 'auth/unauthorized-domain') msg = 'Sign-in is not enabled for this site yet.';
        var out = new Error(msg);
        out.code = code || '';
        return Promise.reject(out);
      });
    });
  }

  if (typeof document !== 'undefined') whenReady();

  var api = {
    idToken: idToken,
    signIn: signIn,
    whenReady: whenReady,
    projectId: function () { var c = cfg(); return c && c.projectId ? c.projectId : ''; },
    VERSION: 'editor-v2-auth/1'
  };
  root.OmegaEditorV2Auth = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
