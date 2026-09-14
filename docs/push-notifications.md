# Push notifications on the mission dashboard

Built 2026-09-14. The "push" half of the phone-app item. Four files, one
config step, and one line in `mission.html` that is deliberately not yet
added — see **Wiring** below.

## The iOS facts that shape all of it

- **Web Push only reaches an installed PWA.** On iPhone a normal Safari tab
  has no `PushManager` at all. The page must be added to the Home Screen and
  opened from there. `/mission` became installable in `012188f`, so this is
  unblocked — but it means a capability check that only asks "does
  `PushManager` exist" reports *not supported* on a phone that supports it
  fine, one tap away. `mission-push.js` tells those two cases apart and
  returns `needs-install` for the second.
- **Permission must be requested inside a user gesture**, and on iOS a refusal
  is permanent for that origin until the app is deleted and re-added. Nothing
  here ever asks on load. `JarvisPush.enable()` is called from a tap, or the
  question never gets asked.
- **`userVisibleOnly: true` is mandatory**, and a push event that ends without
  showing a notification counts as a silent push — enough of them and the
  subscription is revoked. The worker therefore shows one on every path,
  including when the payload is missing or unparseable.

## The four files

| file | what it is |
|---|---|
| `mission-sw.js` | the service worker. **Caches nothing** — see below |
| `mission-push.js` | the client. Self-contained, namespaced `window.JarvisPush` |
| `api/push-key.js` | `GET` → the VAPID public key |
| `api/push-subscribe.js` | `POST`/`DELETE` → remember/forget one device for the signed-in user |
| `api/push-send.js` | `POST` → send to yourself; staff only to send to anyone else |

**The worker caches nothing on purpose.** `tenants/nextnrg/sw.js` carries the
scar: its v1 was cache-first for every request including the app's own HTML,
and a stale `editor.html` became permanent for anyone who had loaded it once.
A dashboard silently serving yesterday's build is worse than one that is
plainly down, because nobody thinks to look. There is no fetch handler here at
all. If offline support is ever wanted, it must be network-first and must
never store a document from this origin.

**Scope is `/mission`, not `/`.** A root-scoped worker would sit in front of
`editor.html`, `projects.html` and every tool on the wildcard domain, for every
tenant — an enormous blast radius for a notification feature.

## Configuration (once, in Vercel)

Three environment variables. The keypair was generated on Thomas's Mac and the
private half is at `~/jarvis/work/secrets/vapid-mission.json` (mode 600) — it
has never been printed to a transcript and must never enter the repo.

```
VAPID_PUBLIC_KEY   = BEPwdpsVS1Ux5bQBsOMRc3lZFG9o0mvh6pqkj3NtUQqjEZ8RMZn71gtypYfc2HuXznK2umgej5Hioqt7lYrR2D8
VAPID_PRIVATE_KEY  = (the privateKey field of that file)
VAPID_SUBJECT      = mailto:tom@clearsky-usa.com     (optional; this is the default)
```

The public key is public by design — the same class as the Firebase web
`apiKey`. It identifies the sender so the push service can verify our
signature and can do nothing on its own. Without both keys set, `/api/push-key`
and `/api/push-send` answer `503 push is not configured` and the dashboard
degrades quietly instead of throwing.

The key is **served**, never hardcoded in the page, so the two halves cannot
drift: a baked-in key keeps working until someone rotates the server's, and
then every existing subscription fails at *send* time with a 403 — long after
the change, in a different system, to a user who did nothing wrong.

## Wiring (the one line, not yet added)

`mission.html` has 189 uncommitted lines from another session as of
2026-09-14, so this was left out rather than cause a merge conflict. When that
work lands, add:

```html
<script src="/mission-push.js" defer></script>
```

and call `JarvisPush.enable()` from a settings row or button. `JarvisPush`
also exposes `state()`, `describe()` (a ready-made label for that row),
`disable()` and `installed()`. It needs no other change: it finds the page's
existing `token()` for auth, or accepts one via `JarvisPush.setToken(fn)`.

## Sending one

```
POST /api/push-send
Authorization: Bearer <Firebase ID token>
{ "title": "JARVIS", "body": "Draft ready for approval", "url": "/mission" }
```

Anyone signed in may push to themselves — that is how the dashboard tests its
own setup and how the twin nudges Thomas on his own account. Pushing to
*another* person is staff-only: a notification bypasses every app the
recipient chose to close, and an endpoint where any tenant user could address
any other is a harassment vector with our name on the banner.

`404`/`410` from a push service mean the subscription is gone for good; those
rows delete themselves on the spot rather than being retried forever. Other
errors are left alone, because a transient 500 is not evidence of anything.

## Storage

`push_subs`, one document per endpoint URL (sha256, first 40 chars — the URL
is the identity of a device+browser, so re-subscribing updates in place rather
than leaving a duplicate that gets pushed to twice). The owning `uid` comes
from the verified token and is never taken from the request body.

Written only by the Admin SDK, which bypasses rules. Firestore denies
unmatched collections to clients by default, so `push_subs` is already
unreadable from a browser; `firestore.rules` was deliberately not edited for
this, since an explicit block would need its own rules deploy. Add one if you
want the belt as well as the braces.

## Verified locally

- Payload encryption and VAPID signing exercised end to end against a real
  P-256 subscription: 172-byte `aes128gcm` body, signed JWT present.
- `applicationServerKey` decodes to 65 bytes beginning `0x04` (an
  uncompressed P-256 point), which is what the browser requires.
- Endpoint hashing stable and Firestore-path-safe.
- `npm test` passes; the four `skyfund-sandbox` failures are pre-existing
  (from `bb2f5cb`) and unrelated.

**Not verified:** an actual notification on an actual iPhone. That needs the
env vars set, a deploy, and the page installed to the Home Screen.
