# Event Layer — step one

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Usage telemetry from every tenant, so Jarvis can reason over what tenants
actually do on the platform, not only over meeting data. The design and its
decisions are in the vault note "Event Layer — Step One Scope" (2026-09-11).
This file is the runbook: what was built, and the steps that turn it on.

```
browser                     Vercel                         GCP (clearsky-portal)
omega-events.js  ──POST──▶  api/events.js  ──publish──▶  topic omega-events
 (injected by               verify token, stamp               │ push
  omega-brand.js)           uid/orgId/tenant, terms,          ▼
                            config + exclusion gates    fn eventsIngest (twin repo)
                                                              │
                                              twin_events (TTL 90 d) + GCS overflow
                                                              │
                                           Mac: bin/twin events · bin/findings (L1)
                                                · bin/propose (L2)
```

## The catalogue

`api/_lib/events.js` is the allowlist. Ten events plus `activity.rollup`:

| event | where it is emitted |
|---|---|
| `session.started` | omega-events.js, once per tab after sign-in |
| `tool.opened` | omega-events.js, from the page path against `OMEGATools` |
| `tool.run` | editor: `/api/bess-size` (`request()`), Grid Atlas pre-screen (`run()`), autopilot parcel lookup (`parcel()`) — full raw inputs and outputs |
| `tool.error` | window `error` / `unhandledrejection`, plus `OmegaEvents.run()` failures; never sampled |
| `project.created` | editor new-project modal + first save, omega-newproject.js, omega-intake.js, omega-delivery.js |
| `product.selected` | editor `saveBess()` |
| `sitemap.build.completed` | editor autopilot `report()`, once per run, at its end |
| `score.computed` | Grid Atlas pre-screen answer (score, pass/fail band, model/build) |
| `fin.application.submitted` | finance portal `saveDeal()` after the write lands |
| `fin.offer.responded` | finance portal `setOfferStatus()` |
| `activity.rollup` | omega-events.js: yesterday's exact per-tool counts, unsampled |

The parcel lookup's owner name and APN are deliberately NOT recorded: they are
a third party's, not the customer's calculation data.

## Gates, all of which must say yes

1. **Terms.** `termsAcceptances/{uid}.version === '2026-09-23'`. Only the
   portal home (`index.html`) shows the terms modal, so a user who only ever
   opens the editor or the finance portal will not re-accept and will emit
   nothing. That is the safe direction; widening the modal to those pages is
   a separate change.
2. **Config.** `event_config/current` `{ enabled: true, sampleRate: 0.25 }`.
   No document = off.
3. **Exclusions.** `event_exclusions/{orgId}` or
   `event_exclusions/host:{hostname}` (any doc without `active: false`).
   Checked in `api/events.js` AND again in `eventsIngest`.

## Turning it on — every step below leaves this machine; each needs Thomas

Order matters: nothing emits until step 7, and step 6 must come before it.

1. **Rules.** Deploy `firestore.rules` (adds `event_config`, `event_exclusions`).
2. **Topic and bucket.**
   ```
   gcloud pubsub topics create omega-events --project clearsky-portal
   gcloud storage buckets create gs://clearsky-portal-twin-events --project clearsky-portal --location us-central1 --uniform-bucket-level-access
   gcloud storage buckets update gs://clearsky-portal-twin-events --lifecycle-file=<(echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":90}}]}')
   gcloud firestore fields ttls update expireAt --collection-group=twin_events --enable-ttl --project clearsky-portal
   ```
3. **Workload Identity Federation (IAM — the security-sensitive step).**
   Vercel project `omega-core` (`prj_agDO1FYrjsMfMiUM6MWDOcrSN0nY`), team
   `team_Wp71sXJZ8QZlvyxosn3kPGiU`. Turn on Vercel → Settings → Security →
   **Secure backend access with OIDC federation** (team issuer mode). Then,
   with `PN=$(gcloud projects describe clearsky-portal --format='value(projectNumber)')`
   and `TEAM` = the team's URL slug:
   ```
   gcloud iam workload-identity-pools create vercel --location=global --project clearsky-portal
   gcloud iam workload-identity-pools providers create-oidc omega-core \
     --location=global --workload-identity-pool=vercel --project clearsky-portal \
     --issuer-uri="https://oidc.vercel.com/$TEAM" --allowed-audiences="https://vercel.com/$TEAM" \
     --attribute-mapping="google.subject=assertion.sub,attribute.project=assertion.project,attribute.environment=assertion.environment" \
     --attribute-condition="assertion.owner=='$TEAM' && assertion.project=='omega-core' && assertion.environment=='production'"
   gcloud pubsub topics add-iam-policy-binding omega-events --project clearsky-portal \
     --role=roles/pubsub.publisher \
     --member="principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/vercel/attribute.project/omega-core"
   ```
   The binding is on the ONE topic, publisher only. No service account, no
   key (the org policy forbids keys anyway). Previews are excluded by the
   `environment=='production'` condition.
4. **Vercel env** (production): `GCP_WIF_AUDIENCE =
   //iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/vercel/providers/omega-core`.
   Not a secret. Leave `GCP_WIF_SERVICE_ACCOUNT` unset.
5. **Deploy the twin's `eventsIngest`** (twin repo): `firebase deploy --only functions:eventsIngest`.
6. **Exclusions, BEFORE enabling.** Signed agreements are not amended by a
   clickwrap bump. Until counsel clears each one:
   - `event_exclusions/fenecon.com` `{ reason: 'signed OEM agreement — awaiting counsel', since: <date> }`
   - `event_exclusions/host:osa.clearskyomega.com` `{ reason: 'OSA JV agreement — awaiting counsel' }`
   - any other tenant on signed paper (the audit is step 2 of the scope note's sequence).
   Clearing one later is `active: false` on its doc — no deploy.
7. **Merge and ship omega-core**, then write `event_config/current`
   `{ enabled: true, sampleRate: 0.25 }`. Users re-accept at next portal
   login; events start from each user as they do.
8. **Check:** `bin/twin events` on the Mac; `bin/findings` prints
   "Usage: N usage events from M tenants".

## Switching it off

`event_config/current.enabled = false`. The client asks once per tab (cached
10 minutes), and the endpoint refuses on its next config read (60 s cache).
