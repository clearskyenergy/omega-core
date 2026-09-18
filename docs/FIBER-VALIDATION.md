# Validation — 2026-09-18

Completed:

- 12 Node tests passed: unknown/empty coverage, capacity non-inference, planned-route exclusion, facility separation, distance math including the antimeridian, input validation, result limits, data hashes/IDs/coordinates, and API authorization paths.
- 3 Python tests passed: optical versus unknown/copper/subsea/building classification, incomplete-source rejection, and FCC ID/speed handling.
- The installer was applied to a copy of the supplied Omega HTML and Vercel config, then applied again. The second pass made no changes, and the original files were backed up.
- All JavaScript parsed. The standalone review file's embedded JSON parsed successfully.
- GeoJSON counts and SHA-256 hashes match the manifest. Each record has a source URL and observation metadata. Public records contain no verified available capacity.
- National OSM requests completed for optical-tagged ways, telecom facilities, and generic telecom ways. A larger earlier request timed out and was excluded.
- California August 2026 network design, partner design, and current project status were retrieved. The status source preserves Installation, Pre-Construction and Ready-to-Connect.
- State intersection audit: optical-route records in 13 states; telecom-facility records in all 50 states. Counts are not completeness estimates.
- An offline Chicago example requests 100 Gbps and correctly returns unknown site capacity even with nearby infrastructure records.

Not verified in this environment:

- Live Firebase sign-in, actual tenant Firestore permissions, or Vercel deployment. API tests use controlled authentication mocks; they do not prove the production helper or tenant documents.
- Interactive browser rendering. A local Playwright check was attempted, but the environment had no browser executable and browser downloads timed out. No successful UI screenshot or rendered-layout assertion is claimed.
- Carrier access, committed/spare bandwidth, a buildable lateral, pricing, latency or physically diverse service. These require exact-site carrier evidence.
- A full live rerun of the packaged refresh command. Its constituent source requests and normalization were exercised; future live availability, rate limits and schema changes are outside this release.

Before production rollout, deploy to your existing staging environment, sign in as an authorized member, verify the Fiber Evidence map control, select a site, inspect the returned source links, and check a disabled Grid Atlas membership path. Keep the data's unknown values visible.
