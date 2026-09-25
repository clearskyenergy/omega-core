# scripts/ — never deployed (see vercel.json ignore)

| script | purpose | writes? |
|---|---|---|
| audit-counts.js | per-orgId doc counts across the collections that matter; `--diff a b` fails if any org lost docs | no |
| audit-unverified-staff.js | lists @clearsky-usa.com / @csebuilders.com Auth accounts with an unverified email — the people who stop being staff now that staff needs `email_verified`; run before the rules deploy. `--all` lists every staff-domain account and whether it is staff | no |
| seed-omega-orgs.js | omega_orgs + billing/current + tenant_public from `tenants/*/tenant.json`; dry-run by default | with `--apply` |
| backfill-orgid.html | browser tool from the legacy repo: stamps orgId on older `projects` | yes (browser) |
| check-rules.js | rules sanity checks from the legacy repo | no |
| build_ilshines_layer.py | rebuilds the IL SHINES data layer | file only |
| publish-tools.js | diffs `SEED_TOOLS` against the live `tools/` collection — what the admin console's "Import / Update Applications" button would change; dry-run by default | with `--apply` |
| test-publish-tools.js | 47 checks over that diff and over `publishToFirestore`'s `--only` filter; no Firestore needed | no |
| agent-key.js | mint, list or revoke an agent key for `/api/agent/*` (the CFA/OGI JV ChatGPT Action); the plaintext is printed once to stderr and only its SHA-256 is stored; dry-run by default — see `docs/AGENT-CONNECTOR.md` | with `--apply` |
| test-agent-sites.js | ~100 checks over the agent site API: key scoping, upload shape, additive updates, signed KMZ links, zip round-trip; handlers run against an in-memory Firestore | no |

Cutover order: audit → backfill-orgid → seed (dry) → seed --apply → deploy rules → repoint one tenant's DNS → audit --diff.

## Publishing the tool catalog

The admin console's **Import / Update Applications** button is the normal path
and goes *through* `firestore.rules` as a signed-in staff identity. It also
publishes blind: all 44 tools in one batch, with a count for a receipt.

`publish-tools.js` exists for the times that is not enough — `set(..., {merge:
true})` keeps fields that are not in `SEED_TOOLS` and silently reverts every
field that is, so a tool somebody tuned directly in Firestore goes back to the
seed and nobody finds out until a tenant loses access.

```
npm run tools:dry                                  # diff the whole catalog
node scripts/publish-tools.js --only computelease  # diff one tool
npm run tools:apply                                # publish all
node scripts/publish-tools.js --apply --only computelease
```

It reports NEW, CHANGED (field by field, live → seed), ORDER ONLY (`sort`
moved and nothing else), HAND-EDITED (fields that exist only in Firestore —
merge keeps them, but nothing in the repo knows they are there) and ORPHANED
(documents with no catalog entry; the publish neither touches nor deletes
them, so a retired tool keeps appearing in portals until somebody removes the
doc by hand).

`--apply` calls the same `OMEGATools.publishToFirestore()` the button calls,
through a shim — the Admin SDK's `batch`/`set`/`FieldValue` surface matches the
compat SDK's. There is one implementation of the write.

⚠ **This bypasses `firestore.rules`.** The Admin SDK is a second trust
boundary; `match /tools/{toolId} { allow write: if isAdmin() }` does not apply
to it. Credential is `FIREBASE_SERVICE_ACCOUNT` (same variable
`seed-omega-orgs.js` takes) or gcloud application-default. Prefer the button
for a routine publish; use this when you want the diff first.
