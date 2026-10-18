# Launching the v2 experience

The new experience is built beside the current one, then turned on with
one switch. The old pages stay where they are. Flipping the switch back
is the rollback. Nothing in this change turns it on: an org with no
value, and a browser with no override, still get the classic pages.

| Track | Classic (stays) | v2 (when it has landed) |
| --- | --- | --- |
| Workspace | `/workspace` | `/workspace-v2` (this tree) |
| Editor | `/editor.html` | `/editor-v2` |
| Portfolio / CRM | `/portfolio.html` | `/portfolio-v2` |
| Omega Prime | `/omega-prime.html` | `/omega-prime-v2` |
| Finance marketplace | `/finance` | `/finance-v2` |

`/finance` and `/portals/finance` are the same classic page. A twin that
is not in the tree yet is not a destination: the router and the
workspace v2 doors keep the classic path. Landing a page is two edits in
the same change — add the file, set `landed: true` for that key in
`omega-experience.js`. `scripts/tests/texperience.js` fails if those two
disagree.

## The switch

Name: `omega-experience`. Values: `classic` and `v2`. Anything else is
ignored.

Resolution, first hit wins:

1. `?ui=v2` or `?ui=classic` on this visit. `?ui=v1` is the same choice
   as `?ui=classic` (the link the journey release already used). It is
   written to `localStorage` key `omega-experience` on this browser.
2. That remembered choice.
3. `omega_orgs/{orgId}/members/{uid}.experience`
4. `omega_orgs/{orgId}.experience`
5. `classic`

Absent means classic. The journey release sent every `/workspace`
visit to `/workspace-v2` from the page itself. This switch is that
choice now: with no flag and no `?ui=`, `/workspace` is the classic
home again, and `/workspace-v2` still opens the journey when you go
there. Signup does not write the field
(`api/tenant-signup.js`). The browser only reads it. A tenant admin
cannot set the org field (`brandingOnly()` does not list it) and a
member cannot set their own (`selfSafeFields()` is name and updatedAt).
ClearSky staff (`isAdmin()`) write both fields. There is no second copy
of the list of routes and no second resolver.

`omega-tenant.js` copies the two fields onto the workspace
(`experience`, `experienceUser`) only when the value is exactly
`classic` or `v2`, and dispatches them with `omega:entitlements`. The
editor does not load that runtime; `omega-experience.js` reads the same
two documents itself once Firebase is already up. It never starts
Firebase.

This is not `homeOf()` (`omega_home`, `?home=`, `shell: 'classic'`).
That chooses the classic dashboard or the workspace. This chooses which
experience of a page.

## What the router does

`omega-experience.js` is the helper. These pages load it: the workspace
and workspace v2, the dashboard, Projects, the marketplace, Portfolio,
the site record, the editor, Omega Prime, and the finance marketplace.
A page whose path is not in the table does nothing.

When the switch resolves to `v2` and the twin has landed, a classic
route is replaced with the v2 route. The rest of the query and the hash
come along. `?ui=` is removed from the address it sends you to.

Plan & billing, Modules, Tools, Team and Feed are still the classic
workspace. A hash of `#billing`, `#modules`, `#tools`, `#team`,
`#feed`, `#plans`, `#flight` or `#module-…` is left on `/workspace`,
so turning an org on does not hide those pages.

A v2 address opened directly stays on v2, including while the default
is classic. That is how `/workspace-v2` is reviewed before anyone is
sent there. A tab the router itself sent (this tab only) returns to the
classic route on the next load once the switch resolves to classic, so
a flipped org comes back without a deploy. `?ui=classic` leaves
immediately and is remembered, which is what **Switch to classic** in
the v2 rail does. An org still set to `v2` does not pull that browser
back.

Workspace v2 links the other v2 routes through the same table, so the
day a twin lands, its doors on the journey home follow. Until then they
stay on `/editor.html`, `/portfolio.html`, `/omega-prime.html` and
`/finance`.

## Rollout

1. **Internal.** Staff set `members/{uid}.experience` to `v2` for the
   people looking at it. The org field stays unset. Everyone else is
   unchanged. A person opts this browser out with Switch to classic.
2. **Pilot orgs.** Staff set `omega_orgs/{orgId}.experience` to `v2`.
   The org follows. A member field, or a browser that chose
   `?ui=classic`, stays on classic.
3. **Default.** A later change of the fallback in `resolve()` from
   `classic` to `v2`. Not this change. Until that edit, an org with no
   field is classic.
4. **Classic retired.** The old pages are removed after the fallback
   has been `v2` and the override is no longer how people work. Not
   this change. Until then every classic URL still answers.

## Rollback

Set the org field to `classic`, or delete it. The next load of a
classic URL stays there, and a tab the router had sent returns to
classic on its next load. No deploy.

A personal override survives an org flip on purpose. `?ui=v2`
(remembered) and `members/{uid}.experience = v2` keep that person on
v2. To bring one person back, delete the member field and have them
open Switch to classic (or clear the `omega-experience` key). To bring
one browser back, Switch to classic is enough.

Turning the fallback itself to `v2` (stage 3) is a code change. The
rollback of that stage is reverting that one line. Stages 1 and 2 roll
back by the field alone.
