# Site Finder server contracts and deployment

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

No production calls were made. Crexi account access is not an API agreement, credential, endpoint or verified payload. The adapter is unverified until those are supplied. All examples in tests are synthetic fixtures.

## Server configuration

Deploy the four endpoints/library changes together with `api/_lib/cost-model.js`, `api/_lib/value-stack.js` and the matching thin clients. Scoring EUI and load-factor tables live only in `api/_lib/site-score.js`. Clients leave modelled energy unknown until `scored[].annualKwh` arrives.

| Environment variable | Meaning / default |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Existing Firebase Admin service-account JSON for `clearsky-portal`; required for entitlement/config/counter reads. |
| `CREXI_BASE_URL` | Operator-approved HTTPS API/proxy base. No query, fragment, credentials, literal IP or non-443 port. No vendor hostname is assumed. |
| `CREXI_API_KEY` | Server-only credential; never store it in tenant prefs. |
| `CREXI_KEYLESS_PROXY` | Defaults off. Exact `true` permits an approved proxy that holds its own credentials. Without a usable key or this setting, the feed stays disconnected. |
| `CREXI_ALLOWED_BASE_URLS` | Comma-separated exact HTTPS bases a tenant may select via `baseUrl`/`proxy`. `CREXI_BASE_URL` is also approved. Only list operator-controlled/trusted destinations; this is the outbound trust boundary. |
| `CREXI_SEARCH_PATH` | Default `/crexi/search`. Configure the actual proxy/vendor path; slash-prefixed path segments only. |
| `CREXI_DETAIL_PATH` | Default `/crexi/detail`. Same path restrictions. |
| `CREXI_AUTH_HEADER` | Default `Authorization`; use the provider's confirmed header name. |
| `CREXI_AUTH_SCHEME` | Default `Bearer`; explicitly empty means send the key without a prefix. |
| `CREXI_SEARCH_BILLED` | Default on: each search claims one lookup. Set exact `false` only if the approved agreement says searches are free. This is per-request accounting, not per-returned-record billing. |
| `LISTINGS_DAILY_CAP` | Positive integer fallback, default 60; overridden by billing `listingLookupsPerDay`, including zero to stop spend. |

The platform key is withheld whenever the tenant selects a base. Such a proxy needs `CREXI_KEYLESS_PROXY=true` and must hold its own credential. Tenant `apiKey`, routes, auth headers and `searchBilled` are ignored. Redirects are refused. Upstream responses are limited to 2 MiB and 12 seconds.

## Tenant configuration and access

Read `toolData/{orgId}/prefs/apiSettings`, preferably `{data:{crexi:{enabled,map,params,baseUrl}}}`; the flat `crexi` wrapper and `proxy` alias also work. `enabled:false` disables the feed. `baseUrl` is optional and must exactly match an approved base.

`map` maps normalized field names to one or more dotted raw-payload paths. Configure it from an actual supplied record, not guessed schema. Supported keys: `id`, `addr`, `city`, `state`, `zip`, `lat`, `lon`, `sqft`, `lotAcres`, `type`, `subtype`, `yearBuilt`, `zoning`, `ownerName`, `brokerName`, `brokerFirm`, `brokerPhone`, `brokerEmail`, `dealType`, `askPrice`, `askRate`, `capRate`, `daysOnMarket`, `url`, `lastSaleDate`, `lastSalePrice`, `photos`. Coordinates are degrees, building area square feet, lot area acres, and prices USD; this adapter does not infer units. Search needs valid coordinates; useful detail needs an ID or address. Configure only fields actually present. A saved map is not proof of validation; `fieldMap.confirmed` remains false.

`params` optionally maps these request parameter names: `minLat`, `maxLat`, `minLon`, `maxLon`, `types`, `minSqft`, `limit`, `q`, `lat`, `lon`, `id`. Defaults use those exact names. Routes/envelopes must match the approved proxy contract: search accepts an array or `{results:[]}`, `{data:[]}`, `{listings:[]}`; detail additionally accepts one object or `{result:{...}}`.

All endpoints verify Firebase bearer auth, validate/authorize the target `orgId`, read `billing/current`, and honor tenant status, membership and tool restrictions. Absent legacy tenant/member records remain compatible; present non-active statuses and empty tool lists deny access. Read failures fail closed. Staff may select another valid org and bypass product/status gates, but billing must still be readable and listing quotas still apply.

Site Finder is available across tiers unless explicitly disabled. Pricing also permits Cost Estimator access: deluxe/enterprise/partner/internal or explicit `costestimator:true`, intersected with tool lists. Listings additionally needs tier deluxe/enterprise/partner/internal, add-on `listings`, or `toolOverrides.listings:true`; explicit false wins. Set those only in server-controlled `omega_orgs/{orgId}/billing/current`.

The existing unfinished adapter's storage paths remain: `listing_cache/{sha256}` (24-hour positive cache, tenant/connection/request scoped) and `omega_orgs/{orgId}/counters/listings` (atomic UTC-day counter). They must remain inaccessible to browser rules. No new browser access or rules changes were made. Concurrent cache misses can each spend a lookup; the daily cap still bounds them. Minute rate limits are instance-local.

## Exact client contracts

All responses use `Cache-Control: private, no-store`. Errors are JSON `{error}` with 400/401/403/405/429/502/503 as applicable; internal/provider error bodies are not returned.

- `POST /api/site-score`: `{action:'score',orgId?,rows:[{id,type,sqft,lotAcres,annualKwh:{value,src},loadFactor,feederId,nameplate,queue,service:{kva},serviceKva}],circuits:{[rowId]:{known,sellable,feederId,nameplate,queue,firm,soft,fromRecord}},use:'bess'|'load',hours?}`. Hours default to the server model, range `(0,24]`. Scores at most 500 rows. Response: `{scored:[{id,feederId,score,outOf,capped,cappedWhy,terms,loadScore,loadOutOf,loadTerms,kw,kwh,loadCeiling,circuitCeiling,circuitLimited,binds,circuitSrc,circuitKnown,why,annualKwh,peakKw,loadKw,basis,reason,band,hours}],weights,weightsSource,weightsVersion,bands,use,hours,truncated,notes,asOf,limit:500}`. `score` follows `use`; `loadScore` always means large-load scoring. `truncated` is a count. Bad rows are skipped with notes or returned `{id,error}`. Compatibility `scores[id]` contains `{battery,load,largeLoad,size,loadModel,band,inputBasis}`; legacy `useType`, numeric `annualKwh`+`peakSource`, and nested `circuit.sellableKw` are accepted. Derived client sizing is ignored. Inputs remain caller-supplied screening facts, not verified capacity or a reservation.
- `GET /api/site-score?orgId=...` or POST `{action:'weights',orgId?}`: `{weights,weightsSource,weightsVersion,bands,notes,asOf,limit}`. Weights come from `toolData/{orgId}/tools/sitefinder.data.weights`; invalid/unreadable weights explicitly fall back to defaults. Version is SHA-256 of effective weights.
- `POST /api/price-site`: `{orgId?,kw,hours?,volt,poiFt,padArea,soil,ahj,labor,utilityUpgrade,carryUpgrade,quoteDate,supplierKey?,installerKey?,site?,gaps?,assumedSize?}`. Positive kW ≤10,000,000; hours `(0,24]`; nonnegative trench length ≤10,000,000 ft and pad area ≤1,000,000,000 sqft. Supplier/installer keys select own stored records in `toolData/{orgId}/tools/costestimator.data`; omitted uses saved selection, empty selects none. Non-staff request `rates`/`installer` overrides are ignored and reported. Response retains `type:'clearsky.cost-estimate/1'`, `total/subtotal/perKw/perKwh` with `lo/base/hi`, `subtotalPerKwh`, `divisions`, `markups`, `upgradeLine`, `sourcing`, `exposures`, supplier metadata, defaults/rejections and estimate-class fields; `accuracy` includes dollar bounds. `financial:{stack,incentives,utility,netCostUsd,paybackYears,basis}` uses the existing ComEd/PJM scenario and returned kWh/hours. Eligibility/rates are not independently verified for each site.
- `POST /api/listings`: `{op:'detail',orgId?,siteId?,address,city?,state?,zip?,lat?,lon?,listingId?}`. `siteId` is client identity only. Lookup requires listing ID, street address, or a coordinate pair. Response: `{ok,connected,found?,record,listing?,spent,source:'crexi',provider:'crexi',asOf,allowance:{day,cap,used,remaining,resetsAt,counted},reason?,cache?}`. `record` and `listing` alias the normalized record. Unconfigured returns `ok:false,connected:false,record:null,spent:false`; no-match returns `ok:false,found:false,spent:true`; cache hit has `spent:false`. `spent` means a lookup allowance was consumed, not confirmation of a vendor invoice. Upstream failure after a claim returns 502 with `spent` and `allowance`; exhausted quota returns 429 with allowance.
- Listings `op:'search'`: `{bbox:{n,s,e,w},types?,minSqft?,limit?}`. Bounds must be valid and ≤6° longitude/5° latitude; limit defaults 200, capped at 300. Returns `listings,count,returned,truncated,dropped,typesRequested,audit,allowance,spent` plus the common envelope. Types are passed upstream. Coordinates/bounds and minimum size are enforced locally.
- Listings `op:'probe'`: staff-only `{sample:<one raw record or JSON string>,orgId?}`. Works offline without feed credentials and does not spend; returns mapped/unmapped fields and normalized preview. Use a real supplied sample before enabling a feed. Never present synthetic test fixtures as live records.

## Local verification

Run `node --test tests/sitefinder-server.test.js` and `node scripts/test-site-market-contract.js`. These use synthetic data and mocked auth/Firestore/fetch; the server test also executes the real scoring client's serializer against the endpoint. No deployment, production read/write or paid lookup is part of verification.
