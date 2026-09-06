# Rules for this portal live at the repo root

`firebase.json`, `firestore.rules`, `storage.rules` and `firestore.indexes.json`
were removed from this folder deliberately. They have not moved somewhere else
in here — they are gone, and the root ones are the only ones.

## Why

This folder is a copy of the standalone `finance-main` repo, and it arrived
with its own complete `firebase.json` pointing at its own `firestore.rules`.
Its `firebase-config.js` targets **`clearsky-portal`** — the same database the
root rules govern. Firestore has exactly one live ruleset per database, and
`firebase deploy` replaces it wholesale.

So anyone running `firebase deploy` from inside this directory would have
silently overwritten the platform ruleset with a 102 KB file that contains:

| collection | in root rules | in the copy that was here |
|---|---|---|
| `tenant_public` | yes | **no** |
| `project_tasks` | yes | **no** |
| `opportunities` / `rfqs` | yes | **no** |
| `capacityAllocations` | yes | **no** |
| `omega_orgs` + billing/members | full control plane | two passing mentions |

The result would not be an error. It would be a successful deploy that removes
the control plane, the capacity ledger — the thing that stops two reps selling
the same circuit — and the task board, with no failure anywhere to point at.
The finance portal would keep working perfectly, which is what makes it the
dangerous kind of mistake.

## Where they went

Root `firestore.rules` already contains the whole financing ruleset —
`fin_profiles`, `fin_projects`, offers, inquiries, `fin_views` (nested and
collection-group), `fin_orgs` and the unlocks ledger, `fin_settings`. It is a
superset, not a replacement. Deploy from the repo root:

```bash
cd <repo root> && firebase deploy --only firestore:rules,storage
```

## The standalone repo still has its copy

`finance-main` keeps these files, and the same overwrite is possible from
there. One database means one source of truth for its rules, and that is this
repository. If the finance repo stays deployable on its own, its rules deploy
needs disabling too — the app can ship from wherever; the rules cannot.
