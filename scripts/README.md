# scripts/ — never deployed (see vercel.json ignore)

| script | purpose | writes? |
|---|---|---|
| audit-counts.js | per-orgId doc counts across the collections that matter; `--diff a b` fails if any org lost docs | no |
| seed-omega-orgs.js | omega_orgs + billing/current + tenant_public from `tenants/*/tenant.json`; dry-run by default | with `--apply` |
| backfill-orgid.html | browser tool from the legacy repo: stamps orgId on older `projects` | yes (browser) |
| check-rules.js | rules sanity checks from the legacy repo | no |
| build_ilshines_layer.py | rebuilds the IL SHINES data layer | file only |
| steward/guard.js | the invariants of CLAUDE.md, checked mechanically; gates every PR | no |
| steward/run.js | the daily pass: integrity, tests, live probe, data + fiber, interface | no |
| steward/api-registry.js | every /api/ endpoint, its auth class and what it spends | no |
| steward/probe.js | does the deployment still refuse an anonymous caller? | no |
| steward/data-watch.js | data-layer freshness and the fiber sources | no |
| steward/ux-review.js | mechanical UX/accessibility findings across every page | no |

Cutover order: audit → backfill-orgid → seed (dry) → seed --apply → deploy rules → repoint one tenant's DNS → audit --diff.

The steward is documented in `scripts/steward/README.md` — what it checks,
how its credential is scoped, and what it is deliberately not allowed to do.
