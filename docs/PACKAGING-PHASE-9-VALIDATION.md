# Packaging Phase 9 — the plant's doors follow the package; sign-in

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Branch `codex/packaging-phase-9`, stacked on Phase 8
([#143](https://github.com/clearskyenergy/omega-core/pull/143)); the draft PR
and Vercel preview links are added on push. No live organization, trial,
billing date, QuickBooks record, environment variable or deployed rule was
changed. Runtime flags remain off by default.

## What changed

**The doors that are not a member's follow the Plant part.** Phase 8 gated
every endpoint a member calls; the bench (a paired station token,
`api/mes-scan.js`), the test rig (a station token flagged machine,
`api/mes-test-result.js`) and a quality hold or release (a tenant
administrator, `api/plant-control.js`) authenticate differently and were
left open. `logic-access.requirePartIfPackaged(org, part)` now runs at each
of them, after the token or the administrator is known and before any work:
a PACKAGED workspace must hold Plant, judged exactly as `authorize()` judges
a member (Office in the package, the grant live, the part bought); a legacy
workspace, or one with no `omega_orgs` record yet, is left to the door's own
rule (`null`), so nothing changes for it. A packaged billing record with no
organization record is closed, never open by accident. The bench's status
line prints the refusal ("Plant is not in your Omega Logic package").

**A sign-in email is compared lower-cased in the rules.** The pages write a
person's address lower-cased, but a Firebase token from a password account
carries it as typed, so `request.auth.token.email` compared verbatim
refused every Team Hub write and the terms acceptance for anyone who signed
up with a capital letter (found by the dashboard handoff, §6). The four team
blocks (`team_members`, `team_messages`, `team_conversations`,
`team_convo_messages`), `termsAcceptances` and `isAdmin()` now compare
`.lower()` on the token side and on scalar data, as `userOrg()`,
`org_members` and `api/_lib/admin.js` already did. `scripts/check-rules.js`
finds no structural problem; the change takes effect only with the rules
deploy in the release checklist (§4).

**The preview sign-in refusal names the host.** `omega-auth-errors.js` maps
`auth/unauthorized-domain` on a `*.vercel.app` address to a sentence that
names the hostname to add to the authentication project's authorized
domains, and offers email and password, which does not check the list. On
any other host the message is unchanged. No vendor name is printed.

## Verification

- Full `npm test` and `npm run check:pages` passed locally (no page changed;
  the sandboxes and guides are unchanged).
- `scripts/test-logic-package.js` (17 checks): `requirePartIfPackaged` for a
  packaged workspace with and without the part, a package without Office, a
  legacy subscription (not judged), no record (not judged), packaged billing
  with no organization record (closed), an invalid org; and that every
  station verification in the bench, the rig's path after the station is
  known, and hold/release after the administrator check call it.
- `scripts/tests/tsigninemail.js` (new, 15 checks, in `npm test` and CI's
  `scripts/tests/t*.js` glob): every token-email compare in the five blocks
  is lower-cased, the `team_members` id is built from the lower-cased
  address, `isAdmin()` matches the domain lower-cased with `email_verified`,
  and the dashboard writes the address lower-cased.
- `scripts/tests/tautherrors.js` gained the preview-host case.
- The plant chain (`npm run test:plant`, 277 checks across eleven suites),
  staff-verified, Logic team, auth errors, customer accounts, partner scope,
  white label, hand-off and workflow suites still pass; `test-plant-work.js`'s
  admin stub gained `safeOrg`, which the door reads the org record by.

## Sandbox enablement and operator checks

Nothing new to enable. On a sandbox tenant packaged with Office and Plant:
pair a bench and scan a unit (it scans); remove Plant from the package (a
staff activation on the Package tab) and scan again — the bench prints
"Plant is not in your Omega Logic package"; post a rig result — 403 with the
same sentence; hold a unit from the plant app — the same. A legacy tenant's
bench must behave as before. For the rules: after the deploy, sign in with a
password account whose address has a capital letter, post one Team Hub
message and accept the terms. Real sandbox acceptance has **not** been
performed.

## Remaining acceptance and release debt

- The rules change is in the repo and not deployed; until the deploy the
  live rules still refuse mixed-case Team Hub writes.
- Adding a preview hostname to the authentication project's authorized
  domains is a console step nobody here can take; the message now says
  which hostname.
- Everything listed in `PACKAGING-PHASE-8-VALIDATION.md` and
  `PACKAGING-RELEASE-CHECKLIST.md` §7 stands, less the bench item.
