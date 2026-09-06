/* ═══════════════════════════════════════════════════════════════════════════════
   /config.js — demo.clearskyomega.com  (OMEGA sales demo)

   Drop-in replacement. Fill in the `firebase` block from your existing
   config.js, then deploy this alongside omega-brand.js.
   ═══════════════════════════════════════════════════════════════════════════════ */
window.CLEARSKY_CONFIG = {

  /* ── Firebase ──────────────────────────────────────────────────────────────
     PASTE YOUR EXISTING VALUES HERE — these are the only fields I can't fill
     in for you, and the portal will not sign anyone in until they're real.  */
  firebase: {
    apiKey:            'REPLACE_ME',
    authDomain:        'REPLACE_ME.firebaseapp.com',
    projectId:         'REPLACE_ME',
    storageBucket:     'REPLACE_ME.appspot.com',
    messagingSenderId: 'REPLACE_ME',
    appId:             'REPLACE_ME'
  },

  /* ── The tenant this deployment runs as ─────────────────────────────────── */
  tenant: {
    type:          'developer',
    orgId:         'clearsky-usa.com',   // scopes every Firestore read
    clientName:    'OMEGA',
    accountTier:   'Enterprise',
    tierLevel:     3,                    // Enterprise — all tools unlocked
    allowedDomain: 'clearsky-usa.com',   // primary sign-in domain
    requiredTools: ['editor', 'investment'],
    logo:          '/omega-logo.png',

    /* Individual accounts allowed in alongside the domain above. Use this for
       Gmail rather than adding 'gmail.com' to allowedDomains — that would let
       ANY Google account into the demo. */
    allowedEmails: [
      'tom@gmail.com'                    // ← replace with your actual Gmail
    ],

    exportBrand: {
      logo:              '/omega-logo.png',
      name:              'OMEGA',
      poweredBy:         'Powered by ClearSky-OMEGA',
      platformCopyright: '© 2026 ClearSky Energy Solutions LLC · ClearSky-OMEGA platform'
    }
  },

  /* ── Engineers who may preview this deployment ──────────────────────────── */
  adminDomains: ['csebuilders.com'],

  platformName: 'ClearSky-OMEGA',
  supportEmail: 'dev@clearsky-usa.com'
};
