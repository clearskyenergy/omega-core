# scripts/ — never deployed (see vercel.json ignore)

| script | purpose | writes? |
|---|---|---|
| audit-counts.js | per-orgId doc counts across the collections that matter; `--diff a b` fails if any org lost docs | no |
| seed-omega-orgs.js | omega_orgs + billing/current + tenant_public from `tenants/*/tenant.json`; dry-run by default | with `--apply` |
| backfill-orgid.html | browser tool from the legacy repo: stamps orgId on older `projects` | yes (browser) |
| check-rules.js | rules sanity checks from the legacy repo | no |
| build_ilshines_layer.py | rebuilds the IL SHINES data layer | file only |

Cutover order: audit → backfill-orgid → seed (dry) → seed --apply → deploy rules → repoint one tenant's DNS → audit --diff.
