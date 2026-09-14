/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-auth-errors.js — what a person is told when sign-in fails.
 *
 * A raw Firebase string ("Firebase: Error (auth/invalid-login-credentials).")
 * is not an error message. It names our authentication vendor, it exposes an
 * internal code, it tells the reader nothing they can act on, and on a
 * customer-facing sign-in screen it reads as a broken product. It also leaks
 * which accounts exist, because the codes differ.
 *
 * So: no Firebase code ever reaches a screen. Every failure resolves to
 * plain language, and anything this file does not recognise resolves to
 * "Contact your account administrator" — the one instruction that is always
 * true when somebody cannot get in.
 *
 * text() is the whole interface, and it is defensive on purpose: it is given
 * Error objects, strings, and sometimes whatever a catch block caught. If a
 * caller hands it an unrecognised string that still smells like a vendor
 * message, it refuses that string rather than passing it through.
 *
 * ES5: every sign-in surface loads this, including the kiosk browsers.
 */
(function (root) {
  'use strict';

  var CONTACT = 'Contact your account administrator.';

  /* Codes worth a specific sentence, because the reader can act on them.
     Everything else falls through to CONTACT. */
  var KNOWN = {
    /* Wrong password and unknown account return the same thing by design —
       Firebase does not distinguish them to the client, and we would not want
       it to: a different message for each confirms which addresses exist. */
    'auth/invalid-credential':        'That email and password don’t match an account.',
    'auth/invalid-login-credentials': 'That email and password don’t match an account.',
    'auth/wrong-password':            'That email and password don’t match an account.',
    'auth/user-not-found':            'That email and password don’t match an account.',
    'auth/invalid-email':             'That email address doesn’t look right.',
    'auth/missing-password':          'Enter your password.',
    'auth/weak-password':             'Choose a password of at least 6 characters.',
    'auth/email-already-in-use':      'That email already has an account — sign in instead.',
    'auth/too-many-requests':         'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed':    'Couldn’t reach the network. Check your connection and try again.',
    'auth/popup-closed-by-user':      'The sign-in window closed before it finished.',
    'auth/cancelled-popup-request':   'The sign-in window closed before it finished.',
    'auth/popup-blocked':             'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
    /* These four are configuration, not user error. The person at the screen
       can do nothing about any of them, which is exactly when the contact
       line is the entire useful message. */
    'auth/user-disabled':             'This account has been disabled. ' + CONTACT,
    'auth/operation-not-allowed':     'This sign-in method isn’t enabled for your workspace. ' + CONTACT,
    'auth/unauthorized-domain':       'This site isn’t authorised for sign-in. ' + CONTACT,
    'auth/invalid-api-key':           'This workspace isn’t configured correctly. ' + CONTACT
  };

  /* Anything that looks like it came from the vendor rather than from us. */
  var VENDOR = /(^|\b)(firebase|auth\/|firestore\/|storage\/|functions\/|permission-denied|INTERNAL|INVALID_LOGIN_CREDENTIALS)/i;

  function codeOf(err) {
    if (!err) return '';
    if (typeof err === 'string') {
      var m = /\(?(auth\/[a-z0-9-]+)\)?/i.exec(err);
      return m ? m[1].toLowerCase() : '';
    }
    if (err.code) return String(err.code).toLowerCase();
    var m2 = /\(?(auth\/[a-z0-9-]+)\)?/i.exec(String(err.message || ''));
    return m2 ? m2[1].toLowerCase() : '';
  }

  /* The message to show. Never a code, never a vendor name. */
  function text(err, fallback) {
    var code = codeOf(err);
    if (code && KNOWN[code]) return KNOWN[code];

    /* An unrecognised code, or none. If the caller supplied its own wording
       use it — but only if it is OUR wording. A caller passing err.message
       through is the exact bug this file exists to stop, so a vendor-shaped
       fallback is discarded rather than displayed. */
    if (fallback && !VENDOR.test(String(fallback))) return String(fallback);
    return 'Sign-in didn’t work. ' + CONTACT;
  }

  /* For non-auth failures — a refused read, a failed write — where the page
     still has to say something. Same rule: never the vendor's words. */
  function opText(err, what) {
    var code = codeOf(err);
    if (code === 'auth/network-request-failed')
      return 'Couldn’t reach the network. Check your connection and try again.';
    return (what ? what + ' didn’t work. ' : 'That didn’t work. ') + CONTACT;
  }

  /* Last line of defence for code that already built a string: hand it here
     before display and a vendor message becomes the contact line. */
  function scrub(msg) {
    var s = String(msg == null ? '' : msg);
    if (!s) return '';
    return VENDOR.test(s) ? text(s) : s;
  }

  root.OmegaAuthError = { text: text, opText: opText, scrub: scrub,
                          codeOf: codeOf, CONTACT: CONTACT };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports)
  module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).OmegaAuthError;
