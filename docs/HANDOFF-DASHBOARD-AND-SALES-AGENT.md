# Handoff: the dashboard render check, the first-run fixes, and the sales agent's first rung (for the packaging build)

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Owner: Tommy Gilmer (ClearSky). Written 2026-09-26, for the session building
`packaging: phase N` so it can fold this in when the phases are done.
Repo: `clearskyenergy/omega-core`.

- Branch: **`claude/stoic-goodall-zah8tv`**, based on `main` at `3b95b1f`
  (the merge of #133, the L2 closeout tool). The code is commit `e8a6262`;
  the commits after it on the branch are this note only.
- **Folded in on 2026-09-26** (branch `codex/dashboard-and-growth`, after
  the packaging stack landed on `main` through #144): §3's four conflicts
  resolved (only `package.json` needed a hand), and §4's items done —
  `applyToolLocks` reads a present `toolAccess` as the list, the starter
  set already asks the package-aware `OMEGATools.isUnlocked`, the dashboard
  check answers `/api/package-access` and gained the packaged `lite`
  tenant, the board reads the billing profile and the packaged states
  (`read-only` lifecycle), the day-11 email is recorded as not built, and
  presence is written from every page that runs `omega-tenant.js`.
- No pull request was open for it. Nothing was deployed. No rules changed.
- It was built while phases 0–6 were in flight and **deliberately stays off
  every file those phases edit**: `omega-tenant.js`, `omega-tools.js`,
  `omega-caps.js`, `editor.html`, `admin/`, `start.html`,
  `api/tenant-signup.js`, `api/tenant-approve.js`, `vercel.json`,
  `scripts/render-logic-pages.js`, `scripts/_lib/firestore-double.js`,
  `firestore.rules`. Read §3 for the four files both sides touch.

---

## 1. What is on the branch

Three things.

1. **A render check for the tenant dashboard.** `npm run check:dashboard`
   boots the real `index.html` in Chromium, signed in, with the Firebase
   compat SDK replaced by an in-memory double and three sample tenants: a
   brand-new trial behind the terms modal, a paying Standard tenant with a
   locked Quick Access tile, and a workspace awaiting approval. Desktop and
   a 390px phone. It fails on an uncaught or console error, an `/api/` call
   it does not answer, a request that would leave the machine, sideways
   scroll, a stray Firestore write, or a lock overlay outside its tile.
   `check:pages` never covered the dashboard; that is how the bugs below
   lived.
2. **The dashboard bugs it and two code reviews found, fixed in
   `index.html` only** (§2).
3. **The sales agent's first rung.** `GET /api/growth` (staff only,
   read-only) joins each workspace's signup, approval, presence, projects
   and billing and returns a stage, a priority and one next action. It
   carries no prices and no module list on purpose: the catalog and the
   price book are yours, one copy each. Design, rungs and what it needs
   from the ladder: `docs/SALES-AGENT.md`.

Files:

| File | New / changed | What |
|---|---|---|
| `scripts/_lib/firebase-double.js` | new | the compat SDK in memory: Firestore (queries, merges, sentinels, listeners, batches, transactions), auth, a storage stub; every write logged |
| `scripts/tests/tfirebasedouble.js` | new | 40 checks pinning the double's semantics (CI runs every `scripts/tests/t*.js`) |
| `scripts/_lib/dashboard-fixtures.js` | new | the three tenants, as document paths; `.example` domains only |
| `scripts/render-dashboard.js` | new | the check; `--shots DIR` writes screenshots |
| `index.html` | changed | the fixes in §2 (about 240 changed lines) |
| `api/_lib/growth.js` | new | the pure funnel judgement (stage, priority, action, why) |
| `api/growth.js` | new | the staff-only board endpoint |
| `scripts/tests/tgrowth.js` | new | 22 checks on the judgement and the endpoint (on `scripts/_lib/firestore-double.js`, unchanged) |
| `docs/SALES-AGENT.md` | new | the agent design |
| `package.json` | changed | one new script key, `check:dashboard` |
| `CLAUDE.md` | changed | two bullets under *Working conventions* |
| `.github/workflows/tests.yml` | changed | one new job, `render-dashboard`, appended at the end of the file |

---

## 2. What changed in `index.html`, and what to keep in mind for the package layer

Every item was confirmed by reading the whole path or by the render check;
none is a style change.

| Fix | Where (this branch) | Note for the phases |
|---|---|---|
| The locked Quick Access tile's overlay anchored to the page: an invisible click trap over the first screen and the "Upgrade" flashing that PR #126 describes. The lock CSS now targets `.locked[data-tool]` (any locked element is its own containing block, no hover lift while locked), the lock names the tool (`.pm-name` or `.ql-title`) and escapes it. | CSS near line 568; `lockTile` at 5250 | Same shape as #126's fix; §6 on what to do with that PR. |
| A workspace awaiting approval had every tool live: `applyToolLocks()` returned early for tier level 3 (trial maps to 3), and even when `omega-tenant.js` handed over `unlockedTools = []`, every later `OmegaBrand.resolve()` re-merged the workspace and recomputed the list from the tier. Now the early return is bypassed when `ws.pendingApproval`, and the list is forced to `[]` while pending. | `applyToolLocks` at 5204, the clamp at 5228 | **Your `lockedEntitlements` now also sets `ws.toolAccess = []`.** `applyToolLocks` still reads `toolAccess.length`, so `[]` reads as absent there. The pending clamp makes that moot for pending; for a packaged tenant, decide in your phase whether `applyToolLocks` should use `Array.isArray(ws.toolAccess)` too (CLAUDE.md: absent ≠ empty). You own that semantics change; this branch did not make it. |
| Application tiles carry `data-tool` now, and `_paintDash` re-runs `applyToolLocks()` at its end, so the plan's locks apply to the grid, not only to the three static Quick Access tiles. | `_tile`, `_localTile`, end of `_paintDash` (5426) | With `ws.packaged`, the list `applyToolLocks` reads must reflect `packageAccess.toolAccess`; your 3-line hunk in the billing read (§3) already returns early for `b.packaged === true` and leaves it to `omega-tenant.js`. Check a Lite tenant: tiles outside Lite must lock. |
| A new workspace opened on an empty "My Applications" pointing at a marketplace that is not on this page. When nothing is required or pinned, a starter set is painted: the first tools `OMEGATools.isUnlocked(t, ws)` allows, in catalogue order, with a note and a Marketplace link. | Pass 3 in `_paintDash`, 5459 | `isUnlocked` reads `toolAccess`, `toolOverrides`, tier. Under `modules[]` it must answer for the package. Verify a Lite tenant's starter set is Lite tools only, then add a packaged fixture to the render check (§5). |
| On a phone the sidebar was `display:none` and the drawer had five tabs, so To-Dos, Team, Feed, Chat, Quote Desk, JD and Deal Room had no way in. The drawer script now moves `#side-nav` into the hamburger drawer at ≤900px (and back), restyled as a light panel; the drawer's own tabs hide because the sidebar carries all of them. | CSS near 1174; `placeSide` at 5658 | Every reveal (`#sn-*`: staff nav, JD partners, pinned apps) still works because the element is moved, never copied. |
| Guides & Training linked to a walkthrough page, a PDF and a video that do not exist (a 404 on every dashboard). Block removed; `#video-modal` stays wired for when a video exists. An empty `data-block="quick"` container that drew a blank row is gone. | markup near 2115 and 2342 | If a guide ever exists, the block is in git history at `3b95b1f`. |
| A refused sign-in (no workspace for the address) painted the app shell, scrollable, under the login card. | 2908 | |
| A built-in block removed in Edit mode could never come back (`restoreBlock` existed, nothing called it). The palette lists hidden blocks under "Bring back". | `openPalette`, `DASH.restoreBlock` | |
| Deleting the last Task Flow phase threw mid-render and froze the board. | `TASKFLOW.render` | |
| `/#todos` (Projects links here) while signed out locked page scroll on the sign-in card; now it waits for `omega:entitlements`. | `fromHash` | |
| Overview widgets painted nothing without Chart.js; only the canvases are gated now. Board chart cards could draw before the roll-up landed; `renderCharts` now asks `DASH.redraw()`. | `renderWidgets`, `renderCharts` | |
| Smaller: the greeting used the whole email; the account modal printed raw ISO dates (`_acctDay`); developer copy under Project Portfolio; the page-global `postMessage()` shadowed `window.postMessage` (now `postTeamMessage`); sidebar app links ignored a tenant's custom tool URLs; 40px tap targets on the small close/delete controls; `100dvh` on the three drawers. | | |

Nothing here decides price, package or access. The gates the phases build
in `omega-caps.js` / `api/_lib/modules.js` stay the authority; the dashboard
only paints what `omega-tenant.js` hands it.

---

## 3. Merging: order and the four files both sides touch

Either order works. **Recommended: land the phases first, then merge this
branch** (or rebase it onto the new `main`), because this branch is small
and its conflicts are trivial, and the phases are not.

Measured against `origin/codex/packaging-phase-4` (the tip of the stack when
this was written):

| File | The stack's change | This branch's change | Resolution |
|---|---|---|---|
| `index.html` | 3 lines in the billing read inside `_omegaOnAuth` (main line 2944: `if (b.packaged === true) return;` and `Array.isArray(b.toolAccess)`) | nearest hunk is the refused-sign-in fix about 45 lines above (2908 here); the billing read is untouched | git merges it. Keep the stack's three lines. |
| `package.json` | rewrites the `check:pages` and `test` lines | adds one key, `check:dashboard`, on the line after `check:pages` | adjacent-line conflict: keep your `check:pages` line and this `check:dashboard` line. Optionally append `&& node scripts/render-dashboard.js` to your `check:pages` chain so one command runs every render check. |
| `CLAUDE.md` | the *Tool gating* section and several Omega Logic bullets | two bullets under *Working conventions*, after "Test as a tenant…" | keep both. When `modules[]` replaces tiers, reword the `check:dashboard` bullet's "paying Standard tenant" to the packaged fixture you add (§5). |
| `.github/workflows/tests.yml` | the `render` job's run line becomes `npm run check:pages`; a packaging test step | a whole new job `render-dashboard` appended at the end of the file | keep both. |

Everything else on this branch is a new file.

Commands:

```sh
git fetch origin claude/stoic-goodall-zah8tv
git merge --no-ff origin/claude/stoic-goodall-zah8tv     # after the phases are on main
# or, onto a phase branch to test together:
git checkout codex/packaging-phase-6 && git merge --no-ff origin/claude/stoic-goodall-zah8tv
```

If PR #126 (the locked-tile fix) is merged first, its `index.html` hunk
conflicts with this branch's lock CSS: take this branch's version (same
fix, plus the `data-tool` tiles) and keep #126's Tremco cleanup (§6).

---

## 4. What the packaged world changes for these files (your to-do when the phases land)

1. **`applyToolLocks` under `modules[]`.** Decide the `toolAccess: []`
   reading in `index.html` (§2, row 2). Verify: pending → everything locked;
   Lite → only Lite tools open, the rest locked with the overlay inside the
   tile; a paid package → its tools open. The render check measures the
   overlay; add the packaged fixtures and it measures them too.
2. **The starter set** (`_paintDash` pass 3) must show a Lite tenant only
   Lite tools. If `isUnlocked` is not the function that knows the package,
   swap the call for the one that is; it is one line, marked.
3. **`omega-tenant.js`'s new `fetch('/api/package-access')`**
   (`packageBillingChrome`) will show up in `check:dashboard` as an `/api/`
   route the stub does not answer, and the check fails on that by design.
   Answer it in `scripts/render-dashboard.js`'s stub server, next to the
   `/api/events` answer at line 60, with the package view for the fixture.
4. **The board's billing fields.** `api/growth.js` `assemble()` (line 36)
   reads `billing/current.tier`, `trialEndsAt`, `lastPaidAt`,
   `subscriptionDue`, `amountDue`, `status`, `paymentFailedAt`, and
   `who` = `omega_orgs.signup.email`, else the owner member (line 55). When
   phase 4 adds `billing/profile` (billing contact, AP address),
   `signedUpAt`, `billingDay`, `nextInvoiceOn`, trial-from-approval and the
   read-only-when-unpaid state: prefer the billing contact for `who`, and
   give `api/_lib/growth.js` `lifecycleOf()` (line 53) a `read-only`
   lifecycle (unpaid after trial end) ahead of `trial`. `scripts/tests/tgrowth.js`
   has a fixture per rule; add one per new field. **Do not add prices or
   module names to `growth.js`**: it says "send the proposal", the proposal
   tool prices it.
5. **The day-11 email.** When phase 4 sends it, record where (a field on
   `billing/current`, or a notification row) so the agent's routine can
   stand down that day instead of drafting a second "trial ends" mail.
   `docs/SALES-AGENT.md` §8 lists what else the agent expects from the
   ladder: the proposal tool's `context` / `recommend` actions (phase 6) and
   the usage counters (phase 7).
6. **Presence from every page.** `team_members.lastSeen` is written only by
   `index.html`, so a person who only opens the editor reads as
   "never signed in" on the board. The fix is one merge write in
   `omega-tenant.js` after entitlements land. It is yours to place, after
   your phases merge, because that file is yours right now.

---

## 5. How to verify after integrating

```sh
npm test                                    # the full chain (this branch: green)
node scripts/tests/tfirebasedouble.js       # all 40 firebase-double checks passed
node scripts/tests/tgrowth.js               # all 22 growth checks passed
node scripts/check-html-scripts.js index.html
npm run check:pages                         # render checks: all passed
npm run check:dashboard                     # dashboard render checks: all passed (4 scenarios)
npm run check:dashboard -- --shots /tmp/dash-shots   # plus screenshots, desktop and 390px
```

`check:dashboard` prints one JSON line per scenario (`newco`, `northstar`,
`northstar-phone`, `pending`) with what the page believed the plan was
(`ws.bound` and `ws.handed`), what it wrote, and the counts it painted, then
`FAIL <assertion> <detail>` lines if any. It needs the pre-installed
Chromium (or Playwright's) and is skipped, not failed, without one.

To add a packaged tenant: a fourth function in
`scripts/_lib/dashboard-fixtures.js` (copy `northstar`, set
`billing/current.packaged: true`, `modules: [...]`, and whatever
`omega-tenant.js` expects from `/api/package-access`), a stub answer for
that route (§4.3), and a `scenario('lite', …)` block in
`scripts/render-dashboard.js` after the `pending` one (line 299) asserting
the locks and the starter set. The `common()` helper checks the shell,
greeting, tenant name, the four Quick Access tiles, the KPI grid and the
team counts for any tenant.

---

## 6. Found on the way, not fixed on this branch

- **Team Hub writes are refused for a mixed-case sign-in email.** The
  client lowercases (`_meEmail()`), `firestore.rules` compares
  `request.auth.token.email` verbatim in the `team_members`,
  `team_messages`, `team_conversations` and `team_convo_messages` blocks.
  Fix is `.lower()` on both sides in those four blocks, like `userOrg()`
  already does. A rules change and a deploy; not done here.
- **`config.js` `upgradeEmail` / `supportEmail` and `mail.js`'s footer say
  `csebuilders.com`**, retired as a staff domain. The dashboard's "Request
  access" mails that address. Whether the mailbox is read is a question
  for Tommy; the sales agent design asks it (`docs/SALES-AGENT.md` §10).
- **PR #126** (`claude/sweet-albattani-a5ylek`): its dashboard fix is
  superseded by this branch; its Tremco cleanup is not (delete
  `tenants/tremco/tremco-patches.js`, its loader block in
  `tenants/tremco/config.js`, and the `MERGE.md` row). Cherry-pick that
  part or merge #126 first and take this branch's CSS.
- `applyToolLocks`, `lockTile`, `openUpgrade`, `showUpgradeModal` and
  `esc2` are declared inside `if (document.readyState === 'loading') { … }`
  in `index.html` (block-scoped function declarations). It works because
  an inline body script always runs while loading; moving them out is a
  safe tidy-up for whoever next edits that script.
- `_omegaOnAuth` carries a second copy of the entitlement merge (the
  billing read your 3-line hunk touches). `omega-tenant.js`'s
  `fireEntitlements` re-runs `applyToolLocks()` anyway, so that block could
  go; left for your phase since you are in it.
- The signup "order off the ladder" requirement is phase 4's billing step
  and phase 6's proposal tool; nothing on this branch touches signup.

---

## 7. One-line summary for the status table

`docs/PACKAGING-ROADMAP.md` status: *Dashboard render check + first-run
fixes + `/api/growth` (branch `claude/stoic-goodall-zah8tv`, code in
`e8a6262`, not merged): merge after the phases; conflicts only in `package.json`
(one key) and adjacent CSS if #126 lands first; then do §4 items 1–6.*
