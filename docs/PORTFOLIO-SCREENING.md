# Portfolio BESS screening and sizing

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

The customer portal's **Size a system → Portfolio upload**. A buyer uploads
many sites at once — a site list with bills, interval files and drawings —
and every site is validated, matched to its documents, screened and sized
on its own, with the data it actually has. This note is the design, the
data model, the statuses, and the honest list of what is not built.

## 1. Where it lives

```
portals/customer/index.html       the Size a system view: Single site (the
                                  supplier's sizer, framed in plain mode) or
                                  Portfolio upload
portals/customer/portfolio.js     the four-step workflow, ES5, renders only
                                  what the API returns
api/customer-portfolio.js         the ONE door: GET template/list/detail/
                                  site/export/report, POST create/upload/
                                  assign/analyze/rerun/add-to-projects
api/_lib/portfolio/
  zip.js       minimal ZIP reader — traversal, absolute paths, encrypted,
               spanned and ZIP64 entries refused; entry/total size caps
  csv.js       RFC 4180 parser with delimiter detection; writer
  xlsx.js      minimal .xlsx reader (shared strings, inline strings); writer
  template.js  the field catalogue: canonical keys, header aliases, units
  ingest.js    site list rows → site records with provenance on every value
  match.js     which site a file belongs to: Site ID first, address second
  interval.js  interval / 8760 CSV → a load series (reuses bess-engine)
  quality.js   data sufficiency: detailed | preliminary | screening | insufficient
  size.js      the sizing: engine path by data level, electrical caps,
               product fit, physical fit, alternatives, confidence
  screen.js    screening factors → Pass | Conditional | Needs Information |
               Hold — Grid Constraint | Not Viable
  finance.js   savings / CAPEX / payback only when the inputs exist
  aggregate.js portfolio summary; the API's site projection
  report.js    executive report, per-site report, CSV export
  run.js       intake (uploads → package) and processSite (one site,
               start to finish, catching its own errors)
scripts/test-portfolio.js         the thirteen named checks + templates and
                                  unsafe archives
scripts/preview-logic.js          local read-only fixture: the real pipeline
                                  run once on example data
docs/portfolio-upload-template.csv the sheet to send a customer
```

Reused, not rewritten: `api/_lib/bess-engine.js` (`sizeFromInterval`,
`sizeFromMonthly`, `parseInterval`, `detectInterval`, `monthSpans`,
`defaultTariff`, `derate`), `api/_lib/product-fit.js` (`fitProducts`),
`api/_lib/logic-catalog.js` (`designs`, `select`), `api/_lib/site-score.js`
(`modelLoad`, the EUI estimate for a screening-only site),
`api/_lib/buyer-design.js` (`access` — the same customer scope Design Studio
uses), `api/_lib/po-intake.js` (`bucket` — the private Storage bucket),
`api/customer-design.js`'s project shape (Add to Projects writes the same
record Design Studio reads).

## 2. Data flow

```
browser        POST create {files:[{name,base64}]}          ≤ 4 MB per request
   │
api/customer-portfolio ── R.intake ──► zip.extract (safe) ── classify each file
   │                                    sitelist → csv/xlsx → I.siteList
   │                                    interval → V.series summary
   │                                    bill/document → stored, not read
   │
   ├─ sites/{siteId}   fields{prov}, months[], documents[], status:'uploaded'
   ├─ portfolio.files  every file with siteId | null, matchedBy, candidates
   └─ Storage          logic-portfolio/{org}/{cid}/{pid}/{sha256}  (private)

browser        POST assign {fileId, siteId}      the review queue, by hand
browser        POST analyze {batch}              repeat until remaining = 0
   │
   └─ per site: R.processSite ── Q.assess ─► S.size ─► SC.screen ─► F.evaluate
                                 (interval file read back from Storage at run
                                  time; its values are never stored on the
                                  Firestore record)
                └─ status sized | needs_information | on_hold | failed

browser        GET  portfolio=…                 rows, summary, review queue
               GET  portfolio=…&site=…          the whole site record
               GET  …&export=csv | &report=executive | &report=site&site=…
               POST upload {siteId, files}      "Provide missing information":
                                                reprocesses THAT site only
               POST rerun {siteId?}             one site, or queue them all
               POST add-to-projects {siteId}    projects/pf-<key> + Design
                                                Studio link (editor entitlement)
```

## 3. Storage

```
omega_orgs/{org}/customers/{cid}/portfolios/{pid}
  name, key (sha256 of the sorted file hashes — the duplicate guard),
  status, files[], problems[], history[], siteCount, summary, customerId
omega_orgs/{org}/customers/{cid}/portfolios/{pid}/sites/{siteId}
  siteId, name, addressLine, addressKey, fields{ key: provenance record },
  months[], documents[], warnings[], quality, sizing, screening, financial,
  nextAction, status, error, history[], projectId, interval (summary only)
Storage  logic-portfolio/{org}/{cid}/{pid}/{sha256}   private, attachment,
                                                       never served by URL
```

The browser cannot read any of it: Firestore rules deny `omega_orgs/**`
subcollections by default and this API is Admin-SDK only, scoped by
`buyer-design.access()` to the signed-in customer's own account. **No rules
change is needed** for this feature.

A provenance record is `{ value, units, kind, confidence, source:{file,
field, row}, importedAt }` with `kind` one of `supplied | measured |
calculated | estimated | proxied | assumed | ai-extracted`. Nothing is
written as `supplied` unless it came from the customer's file.

## 4. Data sufficiency and what each level gets

| level        | needs                                   | sizing                       |
|--------------|-----------------------------------------|------------------------------|
| detailed     | a complete year of interval data        | `sizeFromInterval`, confidence ~85 |
| preliminary  | ≥ 3 months of interval, or ≥ 6 billed months of kW and kWh | `sizeFromInterval` on the partial year, or `sizeFromMonthly`; confidence 55–65 (35 for one bill) |
| screening    | a peak kW, an annual kWh, or building sq ft + type | a RANGE from synthetic months or the site-score EUI; confidence ~20; never added into portfolio totals |
| insufficient | none of the above                       | `Unable to Size` + the exact requests |

The tariff, if the customer supplied one, is used as supplied; otherwise the
engine's default tariff is used and every result says so (`assumptions[]`).
An electrical limit (interconnection limit, transformer kVA × 0.8, main
service kVA × 0.8) caps the recommendation and names itself in
`constraints.cappedBy`; with no limit at all the result carries a
`verification` note instead of an invented one. Hosting-capacity figures are
a supplied input and are never treated as feeder proof or utility approval.

## 5. Screening dispositions

`Pass` · `Conditional` · `Needs Information` · `Hold — Grid Constraint` ·
`Not Viable`. Every disposition carries `reasons[]`, the `factors{}` it was
built from, a `blocker` if there is one, and the `caveat` — "preliminary
platform screening, not utility approval, a permit, final engineering or
interconnection approval". Screening and sizing are separate: a site can be
`Conditional` with a `Detailed Size Complete`, and `Needs Information` with
`Unable to Size`.

## 6. Portfolio statuses

Portfolio: `uploaded → documents_matched → analyzing → report_ready`; `failed`
only if the package itself could not be read. Site: `uploaded | queued |
analyzing | sized | needs_information | on_hold | failed`. Processing is
client-driven in batches (`analyze` → up to 8 sites per call, repeated until
`remaining = 0`); each site catches its own error, so one bad site never
stops the batch, and a rerun of one site never touches another. Re-uploading
the same package (same file hashes) opens the existing portfolio and creates
nothing.

## 7. Safety

- Request cap 4 MB, file cap 25 MB, ZIP caps 400 entries / 25 MB entry /
  60 MB total; type allowlist by extension AND magic bytes (a `.pdf` that is
  not a PDF is refused); file names sanitised path-segment by path-segment.
- Traversal (`../`), absolute paths, control characters, encrypted, spanned
  and ZIP64 archives are refused before any byte is read.
- Documents are stored as attachments under a private prefix and are never
  returned by URL. Bills are kept for the record and for a human.
- Tenant and customer isolation is the same `access()` Design Studio uses;
  test 12 asserts a second customer sees nothing and a bad org is refused.
- Nothing is sized, scored or totalled in the browser.

## 8. Not built — say so before selling it

- **No bill extraction.** PDFs and images are stored and matched, not read.
  Nothing is `ai-extracted`; the `kind` exists so a future extractor has a
  labelled place, and a value it produced would carry `confidence: 'low'`
  until a person confirmed it. A site with only bills is `insufficient`
  until the monthly figures are typed into the site list.
- **No parcel / Regrid spend.** The portfolio tool does not call
  `api/parcel.js`; an installation area is a supplied field.
- **No hosting-capacity lookup.** Supplied only.
- **XLSX export is not implemented** — CSV, the executive report and the
  per-site report (HTML, print to PDF) are. The template downloads as CSV
  and XLSX.
- **IRR, NPV, incentives, tax** are `null` with a reason; savings/CAPEX/
  simple payback appear only when the inputs exist, labelled `preliminary`
  when the tariff was assumed.
- **Office-side view** of a customer's portfolios (the supplier watching
  what its buyers uploaded) is not built; the data is there.
- **Background processing** is the client-driven batch loop, not a queue.
  Closing the tab pauses the run; reopening resumes it.
