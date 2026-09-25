/* ════════════════════════════════════════════════════════════════════════
   omega-logic-signin.js — the ONE Omega Logic sign-in, and "which company"
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Omega Logic is ClearSky's product and a tenant is a workspace in it — the
   way you sign in to QuickBooks and then open your company. So the phone app
   (/office/app) and the desktop office (/omega-logic) open on the SAME
   Omega Logic sign-in, with no company in the address, and after it
   /api/logic-workspaces says where this person may go:
     one workspace   straight in
     several         a list to pick from (the ClearSky owner sees them all)
     none            what to do about it, in plain words
   Sign-in is Google or email + password, as on the dashboard; a page that
   passes linkUrl (the phone app) offers a sign-in LINK by email first, as
   the app guide shows ("or with any work email · Email me a sign-in link"),
   with the password one tap away. Nothing here decides access: every
   office endpoint still runs its own check.

     OmegaLogicSignIn.signIn(el, { auth, lede, linkUrl, linkKey })  draw the sign-in
       …and, for a page that is NOT Omega Logic's (the customer app, which
       wears the supplier's white label), four optional keys; with none of
       them the office's sign-in draws exactly as it always has:
         brand   { name, logoUrl }  "Sign in to <name>", the supplier's mark,
                                    no Omega Logic name, icon or fine print
         labels  { title, fine, emailLabel, installed, linkSent(email),
                   home }  its own words: `installed` is the one line an
                   iPhone home-screen app shows under the lede (why there
                   is no emailed link there); `home` is the path named in
                   "open <host><home> in Safari" (default /logic)
         ids     { email, submit }  keep the page's own element ids
         create  true: "First time here? Create a password" (email and
                 password sign-up; the address is then confirmed by a
                 link, which may open in Safari: confirming is all it does)
     OmegaLogicSignIn.resolve(auth)                       → Promise<{ owner, workspaces[], reason, note }>
     OmegaLogicSignIn.choose(el, data, onPick, onSignOut) draw the picker / the dead end

   ES5, no build step, no Firebase import of its own: the page passes its
   firebase.auth(). The Google button keeps id="signin" (render checks and
   the sandboxes press it).
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var CSS = '.ols{max-width:380px;margin:28px auto 40px;padding:0 4px;text-align:center}'
    + '.ols-mark{width:84px;height:84px;border-radius:20px;display:block;margin:0 auto 14px;box-shadow:0 6px 18px rgba(12,24,36,.18)}'
    + '.ols h1{font-size:23px;margin:0 0 6px;letter-spacing:-.3px;line-height:1.2}'
    + '.ols .ols-lede{color:#4b6270;margin:0 0 20px;font-size:14.5px;line-height:1.45}'
    + '.ols button,.ols input{font:inherit;width:100%;min-height:48px;border-radius:12px;box-sizing:border-box}'
    + '.ols .ols-google{background:#0C1824;color:#fff;border:0;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer}'
    + '.ols .ols-google svg{width:20px;height:20px;background:#fff;border-radius:50%;padding:2px}'
    + '.ols .ols-or{display:flex;align-items:center;gap:10px;color:#5a7280;font-size:12.5px;margin:16px 0}.ols .ols-or:before,.ols .ols-or:after{content:"";flex:1;height:1px;background:#dbe6ea}'
    + '.ols form{display:grid;gap:10px;text-align:left}.ols label{font-size:12.5px;color:#4b6270;margin-bottom:-6px}'
    + '.ols input{border:1px solid #cfdde3;padding:0 14px;background:#fff}.ols input:focus{outline:2px solid #1fb6c9;border-color:#1fb6c9}'
    + '.ols .ols-submit{background:#fff;border:1.5px solid #0C1824;color:#0C1824;font-weight:700;cursor:pointer}'
    + '.ols .ols-link{background:none;border:0;min-height:40px;color:#0e7c8b;font-size:13.5px;cursor:pointer;width:auto;margin-top:4px}'
    + '.ols .ols-msg{min-height:20px;font-size:13.5px;color:#B42318;margin:10px 0 0}.ols .ols-msg.ok{color:#0e7c8b}'
    + '.ols .ols-list{display:grid;gap:10px;text-align:left;margin-top:6px}'
    + '.ols .ols-ws{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#fff;border:1px solid #cfdde3;padding:12px 14px;text-align:left;cursor:pointer}'
    + '.ols .ols-ws b{display:block;font-size:15.5px;color:#0C1824}.ols .ols-ws small{color:#5a7280;font-size:12.5px}.ols .ols-ws span{color:#0e7c8b;font-size:20px}'
    + '.ols .ols-fine{color:#5a7280;font-size:12.5px;margin-top:22px}'
    + '.ols .ols-find{margin:4px 0 2px}';
  function style() { if (document.getElementById('ols-css')) return; var s = document.createElement('style'); s.id = 'ols-css'; s.textContent = CSS; document.head.appendChild(s); }
  var G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.7 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
  var MARK = '<img class="ols-mark" src="/icons/omega-logic-192.png" width="84" height="84" alt="">';
  /* Firebase's codes, said the way a person would. `home` is the path a
     browser can open instead (/logic unless the page says otherwise). */
  function said(e, home) {
    var c = String((e && e.code) || '');
    if (/popup-closed|cancelled-popup/.test(c)) return '';
    if (/wrong-password|user-not-found|invalid-credential|invalid-login/.test(c)) return 'That email and password do not match. If you have only ever used Google, tap \u201cForgot password?\u201d to set a password, then sign in here.';
    if (/invalid-email/.test(c)) return 'That does not look like an email address.';
    if (/too-many-requests/.test(c)) return 'Too many tries for this email. Wait a few minutes, or tap \u201cForgot password?\u201d to set a new password.';
    if (/omega\/no-google-here/.test(c)) return 'Google\u2019s sign-in window can\u2019t open in this browser (an app\u2019s built-in browser, or pop-ups are blocked). Open ' + global.location.host + (home || '/logic') + ' in Safari or Chrome, or sign in with your email and password below.';
    if (/email-already-in-use/.test(c)) return 'That email already has a sign-in here. Tap \u201cForgot password?\u201d to set a password, then sign in.';
    if (/weak-password/.test(c)) return 'Choose a password of at least 6 characters.';
    if (/network/.test(c)) return 'No connection. Check your signal and try again.';
    if (/popup-blocked/.test(c)) return 'Your browser blocked the Google window. Allow pop-ups for this site, or sign in with email.';
    /* never a raw vendor string on a screen (omega-auth-errors.js) */
    return global.OmegaAuthError ? global.OmegaAuthError.text(e) : 'Sign-in didn\u2019t work. Contact your account administrator.';
  }

  /* A supplier's own mark: an https address or a path on this site, never
     another scheme. */
  function logoOf(u) { u = String(u || ''); return /^(https:\/\/[^\s"'<>]+|\/(?!\/)[^\s"'<>]*)$/.test(u) ? u : ''; }
  var BRAND_CSS = '.ols .ols-logo{display:block;max-height:44px;max-width:200px;width:auto;margin:0 auto 16px}'
    + '.ols .ols-note{color:#4b6270;background:#f1f6f8;border-radius:10px;padding:10px 12px;margin:-8px 0 18px;font-size:13.5px;line-height:1.45;text-align:left}';
  function brandStyle() { if (document.getElementById('ols-css-brand')) return; var s = document.createElement('style'); s.id = 'ols-css-brand'; s.textContent = BRAND_CSS; document.head.appendChild(s); }

  function signIn(el, opts) {
    opts = opts || {}; style();
    /* an emailed sign-in link opens in Safari, never inside an app on the
       home screen: there it is email and password */
    var installed = global.navigator.standalone === true;
    var auth = opts.auth, canLink = !installed && !!(opts.linkUrl && auth && typeof auth.sendSignInLinkToEmail === 'function'), byLink = canLink;
    /* a supplier's page (opts.brand): its name and mark, its words; the
       office passes none of these and draws as it always has */
    var brand = opts.brand && typeof opts.brand === 'object' ? opts.brand : null, L = opts.labels || {}, ids = opts.ids || {}, home = L.home || '/logic';
    var EID = ids.email || 'ols-email', canCreate = !!opts.create && !!(auth && typeof auth.createUserWithEmailAndPassword === 'function'), creating = false;
    if (brand || L.installed) brandStyle();
    var logo = brand ? logoOf(brand.logoUrl) : '';
    var mark = brand ? (logo ? '<img class="ols-logo" src="' + esc(logo) + '" alt="' + esc(brand.name || '') + '">' : '') : MARK;
    var title = L.title || (brand ? 'Sign in' + (brand.name ? ' to ' + brand.name : '') : 'Sign in to Omega Logic');
    el.innerHTML = '<div class="ols">' + mark + '<h1>' + esc(title) + '</h1><p class="ols-lede">' + esc(opts.lede || 'Your business in one place. Sign in with your work account and you go straight to your company.') + '</p>'
      + (installed && L.installed ? '<p class="ols-note" id="ols-installed">' + esc(L.installed) + '</p>' : '')
      + '<button type="button" class="ols-google" id="signin">' + G + 'Continue with Google</button>'
      + '<div class="ols-or">' + (canLink ? 'or with any work email' : 'or with email') + '</div>'
      + '<form id="ols-form" novalidate><label for="' + esc(EID) + '">' + esc(L.emailLabel || 'Work email') + '</label><input id="' + esc(EID) + '" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="you@company.com" required>'
      + '<label for="ols-pass" class="ols-pw">Password</label><input id="ols-pass" class="ols-pw" type="password" autocomplete="current-password"><button class="ols-submit" type="submit"' + (ids.submit ? ' id="' + esc(ids.submit) + '"' : '') + '>Sign in</button></form>'
      + (canLink ? '<button type="button" class="ols-link" id="ols-mode"></button>' : '')
      + '<button type="button" class="ols-link" id="ols-forgot">Forgot password?</button>'
      + (canCreate ? '<button type="button" class="ols-link" id="ols-new"></button>' : '')
      + '<p class="ols-msg" id="ols-msg" role="status"></p>'
      + (brand ? (L.fine ? '<p class="ols-fine">' + esc(L.fine) + '</p>' : '') + '</div>' : '<p class="ols-fine">Omega Logic by ClearSky. Your company is chosen from the account you sign in with.</p></div>');
    var msg = el.querySelector('#ols-msg');
    function say(t, ok) { msg.textContent = t || ''; msg.className = 'ols-msg' + (ok ? ' ok' : ''); }
    function field() { return el.querySelector('#' + EID); }
    /* the email LINK (no password to remember) or the password: one form */
    function mode() {
      Array.prototype.forEach.call(el.querySelectorAll('.ols-pw'), function (x) { x.hidden = byLink; x.style.display = byLink ? 'none' : ''; });
      el.querySelector('.ols-submit').textContent = byLink ? 'Email me a sign-in link' : creating ? 'Create my sign-in' : 'Sign in';
      el.querySelector('#ols-forgot').hidden = byLink;
      var m = el.querySelector('#ols-mode'); if (m) m.textContent = byLink ? 'Use a password instead' : 'Email me a sign-in link instead';
      var n = el.querySelector('#ols-new');
      if (n) { n.hidden = byLink; n.textContent = creating ? 'I have a sign-in: use my password' : 'First time here? Create a password'; }
      var pw = el.querySelector('#ols-pass'); if (pw && pw.setAttribute) pw.setAttribute('autocomplete', creating ? 'new-password' : 'current-password');
    }
    mode();
    if (canLink) el.querySelector('#ols-mode').onclick = function () { byLink = !byLink; creating = false; say(''); mode(); };
    if (canCreate) el.querySelector('#ols-new').onclick = function () { creating = !creating; say(creating ? (L.createHint || 'Type your work email and choose a password (at least 6 characters). We email you a link to confirm the address.') : '', true); mode(); };
    /* the installed app signs in through this host (config.js); ask once
       whether Google accepts that yet (api/auth-check), so nobody is sent
       to Google's "Access blocked" page. null = could not tell = try. */
    var googleHere = installed && global.fetch ? global.fetch('/api/auth-check', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) { return d && typeof d.google === 'boolean' ? d.google : null; }, function () { return null; }) : null;
    el.querySelector('#signin').onclick = function () {
      say('');
      var p = new global.firebase.auth.GoogleAuthProvider();
      p.setCustomParameters && p.setCustomParameters({ prompt: 'select_account' });
      /* an iPhone home-screen app (navigator.standalone) cannot use Google's
         pop-up (iOS never even reports it blocked), and a redirect through
         clearsky-portal.firebaseapp.com loses the result to Safari's storage
         partitioning: config.js points the auth domain at this site there
         (served by the /__/auth proxy in vercel.json), so the redirect is
         same-origin. Everywhere else: pop-up first, redirect if blocked. */
      if (installed && googleHere) {
        var gb = el.querySelector('#signin'); gb.disabled = true; say('One moment\u2026', true);
        return googleHere.then(function (ok) {
          gb.disabled = false;
          if (ok === false) {
            say('Google sign-in is not switched on for the installed app yet. Sign in with your email and password below (only ever used Google? Type your email and tap \u201cForgot password?\u201d to set one), or open ' + global.location.host + home + ' in Safari and continue with Google there.');
            var em = field(); if (em) em.focus();
            return;
          }
          say(''); auth.signInWithRedirect(p)['catch'](function (e) { say(said(e, home)); });
        });
      }
      (installed && auth.signInWithRedirect ? auth.signInWithRedirect(p) : auth.signInWithPopup(p)['catch'](function (e) {
        /* a redirect only comes back when the auth helper is on THIS site
           (config.js); through clearsky-portal.firebaseapp.com every current
           browser loses the result to storage partitioning and the person
           lands on Google's "missing initial state" page instead. So when
           the pop-up cannot open and the helper is elsewhere, say so. */
        if (/popup-blocked|operation-not-supported|web-storage/.test(String(e && e.code))) {
          var home = auth.app && auth.app.options && auth.app.options.authDomain === global.location.host;
          if (home && auth.signInWithRedirect) return auth.signInWithRedirect(p);
          throw { code: 'omega/no-google-here' };
        }
        throw e;
      }))['catch'](function (e) { say(said(e, home)); });
    };
    el.querySelector('#ols-form').onsubmit = function (ev) {
      ev.preventDefault();
      var em = field().value.trim(), pw = el.querySelector('#ols-pass').value;
      if (byLink) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return say('Enter your work email.');
        var lb = el.querySelector('.ols-submit'); lb.disabled = true; say('Sending\u2026', true);
        try { global.localStorage.setItem(opts.linkKey || 'omega_logic_link_email', JSON.stringify(em)); } catch (e) {}
        return Promise.resolve().then(function () { return auth.sendSignInLinkToEmail(em, { url: opts.linkUrl, handleCodeInApp: true }); })
          .then(function () { say(typeof L.linkSent === 'function' ? L.linkSent(em) : 'Check your inbox: a sign-in link is on its way to ' + em + '. Open it on this device.', true); }, function (e) { say(said(e, home)); })
          .then(function () { lb.disabled = false; });
      }
      if (!em || !pw) return say('Enter your work email and password.');
      var b = el.querySelector('.ols-submit'); b.disabled = true;
      /* a new sign-in: the account, then the link that confirms the
         address (the portal's endpoints read nothing for an address that
         is not confirmed) */
      if (creating) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { b.disabled = false; return say('Enter your work email.'); }
        say('Creating your sign-in\u2026', true);
        return Promise.resolve().then(function () { return auth.createUserWithEmailAndPassword(em, pw); })
          .then(function (cred) { var u = (cred && cred.user) || auth.currentUser; return u && !u.emailVerified && u.sendEmailVerification ? u.sendEmailVerification() : null; })
          .then(function () { say(typeof L.created === 'function' ? L.created(em) : 'Done. We emailed a link to ' + em + ' to confirm it is yours: open it, then come back here.', true); }, function (e) { say(said(e, home)); })
          .then(function () { b.disabled = false; });
      }
      say('Signing in\u2026', true);
      Promise.resolve().then(function () { return auth.signInWithEmailAndPassword(em, pw); })['catch'](function (e) { say(said(e, home)); }).then(function () { b.disabled = false; });
    };
    el.querySelector('#ols-forgot').onclick = function () {
      var em = field().value.trim();
      if (!em) { say('Type your work email above, then tap \u201cForgot password?\u201d again.'); field().focus(); return; }
      var sent = function () { say(typeof L.resetSent === 'function' ? L.resetSent(em) : 'If that email has a password here, a reset link is on its way.', true); };
      /* the same answer whether or not the email has an account */
      Promise.resolve().then(function () { return auth.sendPasswordResetEmail(em); }).then(sent, function (e) { if (/user-not-found/.test(String(e && e.code))) return sent(); say(said(e, home)); });
    };
  }

  function ask(auth, fresh) {
    return auth.currentUser.getIdToken(!!fresh).then(function (t) { return fetch('/api/logic-workspaces', { headers: { Authorization: 'Bearer ' + t } }); })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Could not find your company.'); return d; }); });
  }
  function resolve(auth) {
    if (!auth.currentUser) return Promise.reject(new Error('Sign in first.'));
    return ask(auth).then(function (d) {
      /* just clicked the verification link? the cached token still says
         unverified for up to an hour: reload the user and ask once more */
      if (d.reason !== 'verify' || !auth.currentUser.reload) return d;
      return auth.currentUser.reload().then(function () { return auth.currentUser.emailVerified ? ask(auth, true) : d; }, function () { return d; });
    });
  }

  function choose(el, data, onPick, onSignOut, auth) {
    style(); data = data || {};
    var list = data.workspaces || [], email = esc(data.email || '');
    if (!list.length && !data.owner) {
      var dom = String(data.email || '').split('@')[1] || '';
      el.innerHTML = '<div class="ols">' + MARK + '<h1>' + (data.reason === 'verify' ? 'Confirm your email first' : dom ? 'No workspace at ' + esc(dom) : 'Nowhere to go yet') + '</h1><p class="ols-lede">' + esc(data.note || 'This email is not on an Omega Logic workspace yet.') + '</p>'
        + '<p class="ols-lede" style="margin-top:-8px">Signed in as <b>' + email + '</b></p>'
        + (data.reason === 'verify' && auth && auth.currentUser && auth.currentUser.sendEmailVerification ? '<button type="button" class="ols-submit" id="ols-verify">Send the link again</button><div style="height:10px"></div>' : '')
        + '<button type="button" class="ols-google" id="ols-out">Sign in with another account</button><p class="ols-msg" id="ols-msg" role="status"></p></div>';
      el.querySelector('#ols-out').onclick = onSignOut;
      var v = el.querySelector('#ols-verify');
      if (v) v.onclick = function () { v.disabled = true; auth.currentUser.sendEmailVerification().then(function () { el.querySelector('#ols-msg').className = 'ols-msg ok'; el.querySelector('#ols-msg').textContent = 'Sent. Open the link, then sign in again.'; }, function (e) { v.disabled = false; el.querySelector('#ols-msg').textContent = said(e) || 'Could not send the link. Try again in a few minutes.'; }); };
      return;
    }
    el.innerHTML = '<div class="ols">' + MARK + '<h1>' + (data.owner ? 'Open a workspace' : 'Choose your company') + '</h1><p class="ols-lede">Signed in as <b>' + email + '</b></p>'
      + (list.length > 8 ? '<input class="ols-find" id="ols-find" type="search" placeholder="Find a workspace" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Find a workspace">' : '')
      + '<div class="ols-list">' + list.map(function (w, i) {
        return '<button type="button" class="ols-ws" data-ws="' + i + '"><div><b>' + esc(w.name || w.orgId) + '</b><small>' + esc(w.orgId) + (w.role && w.role !== 'clearsky' ? ' \u00b7 ' + esc(w.role) : '') + (w.status && w.status !== 'active' ? ' \u00b7 ' + esc(w.status) : '') + '</small></div><span aria-hidden="true">\u203a</span></button>';
      }).join('') + '</div>'
      + (data.owner && !list.length ? '<p class="ols-lede">No Omega Logic workspaces yet.</p>' : '')
      + (data.limited ? '<p class="ols-fine">Showing the first ' + list.length + '. Open the desktop directory for the rest.</p>' : '')
      + '<button type="button" class="ols-link" id="ols-out">Sign in with another account</button></div>';
    Array.prototype.forEach.call(el.querySelectorAll('[data-ws]'), function (b) { b.onclick = function () { onPick(list[Number(b.getAttribute('data-ws'))].orgId); }; });
    el.querySelector('#ols-out').onclick = onSignOut;
    var find = el.querySelector('#ols-find');
    if (find) find.oninput = function () {
      var f = String(find.value || '').toLowerCase().trim();
      Array.prototype.forEach.call(el.querySelectorAll('[data-ws]'), function (b) { var w = list[Number(b.getAttribute('data-ws'))]; b.hidden = !!f && (String(w.name || '') + ' ' + w.orgId).toLowerCase().indexOf(f) < 0; b.style.display = b.hidden ? 'none' : ''; });
    };
  }

  /* the Firebase config for this page: on an iPhone home-screen app the
     auth helper is served from this site (vercel.json proxies /__/auth and
     /__/firebase to the project's firebaseapp.com), so the sign-in result
     is not lost to Safari's storage partitioning. Needs
     https://<this host>/__/auth/handler among the Google OAuth client's
     authorised redirect URIs. */
  /* config.js now makes that choice itself, before any script loads:
     omega-tenant.js starts Firebase as soon as it loads, so a switch made
     here, in the page's own start-up, came too late and the installed app
     kept redirecting through firebaseapp.com and coming back signed out.
     Kept so a page that still calls it gets the config unchanged. */
  function config(cfg) { return cfg || {}; }
  global.OmegaLogicSignIn = { signIn: signIn, resolve: resolve, choose: choose, config: config };
})(window);
