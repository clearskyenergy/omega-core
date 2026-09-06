window.CLEARSKY_CONFIG = {
  firebase: {
    apiKey: "AIzaSyABoM1lgOYUnd5ZadaoTMhYmA9cHa8Tyo0",
    authDomain: "clearsky-portal.firebaseapp.com",
    projectId: "clearsky-portal",
    storageBucket: "clearsky-portal.firebasestorage.app",
    messagingSenderId: "742134484347",
    appId: "1:742134484347:web:ab0f95fd221536158481de"
  },
  googleMapsKey: "AIzaSyC0roZ_qMwtbVzqRLtNx9nrCeaGqrE1sNs",
  // Domain gating happens via the WORKSPACES map in index.html (resolveWorkspace),
  // not here — leave null, same as the other portals.
  allowedDomain: null,
  companyName: "OMEGA",
  portalTitle: "OMEGA · Sales Demo Workspace",

  /* ─────────────────────────────────────────────────────────────────────────
     WHAT A BRAND-NEW ACCOUNT GETS
     ─────────────────────────────────────────────────────────────────────────
     This deployment runs in auto-tenant mode: whoever signs up gets a
     workspace keyed to their own email domain. These defaults are applied to
     every one of those workspaces, so a new account lands on a dashboard that
     already has Grid Atlas and the Financing Partners Portal in
     My Applications.

     requiredTools = pinned, non-removable dashboard tiles.
     customTools   = tools that live outside the shared omega-tools.js catalog,
                     or that need a fixed absolute URL (a separate deployment).

     NOTE ON KEYS: if omega-tools.js already carries Grid Atlas under a key,
     use THAT key here and the catalog entry wins automatically — the
     customTools entry below is only a fallback for a key the catalog lacks.
     Check the catalog before going live so you don't ship two tiles.
     ───────────────────────────────────────────────────────────────────────── */
  newAccountDefaults: {
    requiredTools: ['editor', 'grid_atlas', 'financing'],
    customTools: [
      {
        key:      'grid_atlas',
        name:     'Grid Atlas',
        desc:     'Hosting capacity, substations, transmission and fiber on one map, with site viability scoring.',
        category: 'design',
        href:     'https://tools.csebuilders.com/grid-atlas.html',
        icon:     'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16'
      },
      {
        key:      'financing',
        name:     'Financing Partners Portal',
        desc:     'Post projects to the capital deal room, track offers, and match with lenders and equity partners.',
        category: 'finance',
        href:     'https://financing.csebuilders.com/',
        icon:     'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'
      }
    ]
  }
};
