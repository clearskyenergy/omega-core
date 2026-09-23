# Jarvis — the phone app

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

`/jarvis-app` is `jarvis.html` on a phone, installable from the home screen
the way the Site Finder app is: manifest and service worker beside the page,
Vercel rewrites `/jarvis-app` and `/jarvis-app/(.*)` onto this folder,
`Service-Worker-Allowed: /jarvis-app` on `sw.js`.

On an iPhone: open it in Safari, Share → Add to Home Screen. On Android or
desktop Chrome: the Install button on the Account page, or the browser's
install icon. Notifications on iOS only work from the installed app.

**Same brain, same account, same endpoints.** It signs in with the same
Firebase account and POSTs one line to the `twinChat` function, which
verifies the ID token and checks the allowlist SERVER SIDE. Factory
questions go to `/api/jarvis-operations` (`?org=` pins a tenant, as on the
desktop page).

| Screen | What it does | Where it comes from |
|---|---|---|
| Chat | The thread, a question, the priced answer | `twinChat` GET / POST, `/api/jarvis-operations` |
| Voice | Tap to talk (one utterance, wake word stripped), the reply spoken; Record a call, filed as a meeting | `twinChat/speak`, the browser's own voice as the floor, `twinChat/meeting` |
| Account | Notifications, install, what Jarvis does and spends (switches), the desktop links, sign out | `mission-push.js` pointed at this app's worker, `/api/push-key`, `/api/push-subscribe`, `twinChat/settings` |

What is different from the desktop page, and why: voice is tap-to-talk
because a phone will not keep a background microphone open; the 3D avatar
stays on the desktop and the orb is the phone's face; push notifications are
the one thing the phone can do that a tab cannot.

Nothing is copied from the desktop page except the orb. The push flow is the
shared `mission-push.js`, which reads `window.JARVIS_PUSH_SW_URL` and
`window.JARVIS_PUSH_SCOPE` when set before it loads.

Icons: `node scripts/make-jarvis-icons.js` (the OMEGA mark in the orb's cyan
over the page's navy, through the one PNG codec in `make-app-icons.js`).

Test: `PLAYWRIGHT_MODULE=<playwright> SITEFINDER_BROWSER=bundled node scripts/test-jarvis-app.js`
(or with the Chrome channel and the optional Playwright install in
`scripts/site-agent`).
