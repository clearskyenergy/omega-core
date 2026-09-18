# Integration contract

The package is a file overlay for the supplied static Omega/Vercel repository. The API helper `api/_lib/verify-token.js` is an existing prerequisite; this package deliberately does not replace it. The CLI and public review page work without Firebase. The API and Atlas site-check button use existing Firebase authentication.

## Manual host hook

Inside the existing `grid-atlas.html` closure, after `map` and `L` exist:

```js
window.OmegaFiberAtlasHost = { map: map, L: L };
```

After that inline script, before `</body>`:

```html
<script src="/omega-fiber-atlas.js"></script>
```

For a host that initializes later:

```js
window.OmegaFiberAtlas.init({ map: yourLeafletMap, L: window.L });
```

The new control owns its layers and does not depend on the older `grid-atlas-national.js` extension or a `window.GA` export. The provided Atlas archive did not load that national extension from its HTML. It does not replace existing power, parcel or other layers.

In `vercel.json`, merge this function entry:

```json
{
  "functions": {
    "api/fiber-screen.js": {
      "maxDuration": 30,
      "includeFiles": "data/fiber/**"
    }
  }
}
```

Preserve other `functions` entries and the remainder of your config. Place `private-fiber/`, `.fiber-cache/` and `*.fiber-backup` in both `.gitignore` and `.vercelignore`. The installer performs these edits with backups. Do not put private carrier quotes or licensed Location Fabric into `data/fiber/`: it is public static content.

## Reuse in another authorized API

After that API has authenticated and authorized its caller:

```js
var fiber = require('./_lib/fiber-evidence');
result.fiber = fiber.screen({
  lat: site.latitude,
  lon: site.longitude,
  radius_km: 25,
  requested_capacity_gbps: 100
});
```

The screening response is a data contract, not a claim of service. A `null` answer must render as **unknown**, never zero, false, unserved or a failed capacity check. A supplied target bandwidth is a requirement, not an observation.

## Scale and refreshing

The current roughly 10,000-record release uses a cached in-memory scan with spherical point-to-segment distance. It is small enough for a simple Vercel function; no route-provider HTTP request occurs during a site check. For millions of licensed routes or national FCC records, use the existing backend's indexed spatial delivery or vendor bounding-box API. Do not expand this in-memory scan into an unbounded nationwide location database.

The client displays data snapshots. Results do not depend on which map layers happen to be enabled. The endpoint reports radius, counts, result limits and truncation. The geometry is not surveyed: an apparently exact distance has no implied positional accuracy.

An upstream read failure should remain an error. The ETL rejects Overpass timeout remarks and ArcGIS truncation instead of overwriting the release with zero records. The first broad Overpass query in this research timed out; it was discarded and replaced with completed, separate queries.

## Carrier qualification record

Store this as a tenant-scoped record in your existing authorized workflow, using the actual parcel/demarcation ID. It is intentionally separate from the public route dataset:

```json
{
  "site_id": "YOUR_SITE_ID",
  "carrier": "CARRIER_NAME",
  "evidence_document_id": "YOUR_AUTHORIZED_DOCUMENT_ID",
  "qualified_at": "YYYY-MM-DD",
  "valid_until": "YYYY-MM-DD",
  "demarcation": null,
  "service_type": null,
  "committed_gbps": null,
  "upgrade_gbps": null,
  "available_strands": null,
  "access_point_confirmed": null,
  "lateral_route_confirmed": null,
  "diverse_entrances_confirmed": null,
  "shared_risk_review_completed": null,
  "delivery_date": null,
  "sla_reference": null
}
```

These are template placeholders, not observations. No new Firestore collection or access-rule mutation is shipped. The current screen does not ingest quotes automatically. Require dated, exact-site evidence and apply your existing tenant access controls before allowing these fields to change a site result.
