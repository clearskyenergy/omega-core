# CleanCell launch — Claude Code handoff

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Updated: 2026-09-21 (evening, after live verification). Read AGENTS.md before acting. This is a continuation handoff, not evidence that all requested features are complete.

## Status at this handoff

The company PO launch is live and was live-verified on 2026-09-21. Every step under the earlier "Immediate next steps" is done and recorded below — **do not repeat them**. In particular, do not re-decline, re-submit or re-upload the two system test POs; they are closed records with audit notes.

## Verified release

- Production: https://silmarillion.clearskyomega.com (Vercel projects `omega-core` and `omega-doom-production` both deployed `main`).
- PR #65 merged (`7f8ba54`, implementation `7802f90`): company accounts, PO intake, private uploads, reviewed order entry, logistics ledger.
- PR #67 merged (`7676079`): upgrade log release entry and the download-authorization lifecycle test. Production deployment of `7676079` recorded 2026-09-22T00:01Z.
- PR #68 (`codex/po-launch-followups`): logistics order list excludes unconverted and declined PO intake server-side; the inbox "Update review" action is an inline form instead of two browser `prompt()` dialogs.
- Live Harbor Charging company under CleanCell: `company_2b06b22951a9dd00659e1c59c676c523cb69474e`, domain `harborcharging.com` (descriptive only), active, free customer account. No customer contact, login or access grant exists because none was supplied.

## Completed 2026-09-21 (do not repeat)

1. Browser control reconnected in a fresh Chrome tab using the existing authorized Tom session.
2. `SYSTEM-VERIFY-20260921-NOT-AN-ORDER` (`po_05cf050cf5358cc9f885c689baa6b1c4a35016a2`) closed as `po_declined`, note "System release verification complete; not a customer order. No charge or fulfillment." Audit preserved.
3. `SYSTEM-UPLOAD-20260921-NOT-AN-ORDER` (`po_0c5633c97a08f8ab51429c2491483a418aa9b147`) submitted with the public logo `assets/clearsky-omega-dark.png` (90,365 bytes): `POST /api/po-intake` 200, original stored under private `logic-po/**`.
4. Authenticated download of that original verified: `GET /api/po-intake?…&id=…&file=…` 200, 90,365-byte `application/octet-stream`, original filename. Then closed as `po_declined`, note "System upload and authenticated download verification complete; not a customer order. No charge or fulfillment."
5. Navigation verified signed in as staff: customer portal (Company POs & deliveries), URL Generator (Customer walkthrough, Customer login, Company PO inbox, Editor Lite, Battery sizer), office (Company accounts & POs, Logistics & receiving, URL Generator), logistics page. No console errors.
6. `docs/CLEANCELL-UPGRADE-LOG.md` carries a dated production release entry superseding its earlier "not deployed" status (PR #67). The refresh copy under `~/.codex/visualizations/2026/09/21/01a0c151-a2f4-78c3-a44e-73054743ae29/cleancell-agreement/` was updated.
7. Fixture server `scripts/preview-po-intake.js` on port 8817 stopped.
8. No invoice, charge, work order, wire, carrier booking or shipment was created by any of the above.

## Workspace state

- Main checkout `/Users/tommyg/omega-core` is on `main`, fast-forwarded to `origin/main`. Untracked and deliberately uncommitted: `assets/doom/doom-articulated.glb`, `assets/doom/doom-articulated.gltf`, `scripts/build-doom-model.py` — the rejected geometric DOOM prototype per `assets/doom/README.md`; nothing references them. Leave them for the user to delete.
- Worktree `/private/tmp/omega-logic-po-lifecycle` is on `codex/po-launch-followups`. `codex/logic-po-lifecycle` and `codex/cleancell-launch-verification` are merged; stale worktree registrations were pruned.
- Other things running on this machine that are NOT part of this launch and must not be killed: a ChatGPT Codex sandbox with write access to the main checkout (since 08:24 on 2026-09-21), `node scripts/stage-crexi-import.js` (127.0.0.1:49920) and several `scripts/site-agent/server.js` instances (PR #51).
- Open PRs by others, separate streams: #46 (fiber state expansion), #48, #50, #51 (drafts). Not part of this launch; do not merge them for it.

## Live links

- Website button: https://silmarillion.clearskyomega.com/customer-start?org=cleancell.us
- Customer login: https://silmarillion.clearskyomega.com/portals/customer?org=cleancell.us
- Customer company PO inbox: https://silmarillion.clearskyomega.com/po-inbox?org=cleancell.us
- Office: https://silmarillion.clearskyomega.com/omega-logic?org=cleancell.us
- Office company accounts: https://silmarillion.clearskyomega.com/po-inbox?office=1&org=cleancell.us
- Harbor office: https://silmarillion.clearskyomega.com/po-inbox?office=1&org=cleancell.us&customerId=company_2b06b22951a9dd00659e1c59c676c523cb69474e
- URL Generator: https://silmarillion.clearskyomega.com/logic-urls?org=cleancell.us
- Logistics: https://silmarillion.clearskyomega.com/logic-logistics?org=cleancell.us

## Implemented behavior and code

- `api/_lib/po-intake.js`, `api/po-intake.js`, `po-inbox.html`: company accounts, explicit contact membership, office/customer PO submission, private originals (PDF/PNG/JPEG up to 2 MB), inline review (status + note), same-order conversion into approved catalog lines and multi-site allocations. Files are untrusted, signature checked, NOT malware scanned or OCR parsed. No domain-wide access inferred from a company's domain.
- `api/customer-po.js`, `customer-po.html`, `api/_lib/order-lifecycle.js`: catalog PO entry, quantity/destination validation, idempotent company PO number, no automatic commercial acceptance. Uploaded drafts and catalog orders share the uniqueness key.
- `api/logic-logistics.js`, `logic-logistics.html`: serialized load planning and manual pickup/location/delivery/receiving records. Pickup requires payment reconciliation and QA gates. The order list excludes unconverted PO intake (including declined). No GPS or carrier booking is connected.
- `api/_lib/logic-workflow.js`: prevents pricing unconverted PO intake; blocks legacy shipment completion for destination-planned orders.
- `omega-logic.html`, `portals/customer/index.html`, `customer-start.html`, `api/logic-urls.js`: company inbox/logistics links, login-first copy and secondary signup, generated public PO inbox URL.
- The main portal's My Orders tab is still personal-email scoped; the company PO inbox supplies shared company visibility. Do not represent every legacy tab as company-shared.
- Firebase is the only database. Private `logic-po/**` Storage prefix remains default-denied to browsers; the authorized API mediates downloads. No rules deployment was needed.

## Verification evidence

- Full `npm test` passed from the isolated worktree with `NODE_PATH=/Users/tommyg/omega-core/node_modules` before PR #65 merged; GitHub release checks passed on #65, #67 and the follow-up.
- Lifecycle suite now covers cross-company/tenant denial, disabled/unverified users, office viewer denial, private download with company-membership check, upload retry, duplicate PO prevention, preserved originals, catalog conversion, payment/QA holds, and the logistics list exclusion.
- Live evidence for upload, download and decline is in `docs/CLEANCELL-UPGRADE-LOG.md` (release entry dated 2026-09-21). Mocks do NOT prove live payment, carrier or mailbox provider behavior.

## Not complete / launch dependencies

- Live CleanCell catalog is empty. Obtain approved SKUs/specs/prices; do not invent production products. Demonstration equipment must stay clearly labeled.
- QuickBooks automation is not active in the live office. Configure and verify before claiming invoice/deposit-to-production automation. Default deposit approved by the user: 30% on order; account-specific terms override. A PO is not payment evidence.
- Customer editor subscription displays $799/month; checkout is not enabled and nothing was charged.
- Harbor contact emails are required to assign customer logins. Do not infer membership from an email domain or bypass verification for admin@ addresses.
- Email-to-PO ingestion is NOT connected (needs mailbox/provider, authenticated inbound processing, attachment handling, sender-to-company review, deduplication, audit; unknown senders must not gain company access).
- Automated portfolio ZIP screening, batch sizing/optimization and document extraction are NOT live.
- Logistics is manual event tracking, not carrier booking or live GPS. Onward transfers, load cancellation/replanning, shortage resolution and commissioning approval remain to build.
- Load limit 100 shipping serials; fulfillment query limit 400 components — scale before a large production pilot.
- Evidence is text/reference, not uploaded receiving photos or signed POD.
- Processing fee, bank/wire provider and settlement integration are unresolved. Do not invent fees or initiate transfers.
- Editor guided-build/catalog restrictions, tenant theme settings, station customization and plant-manager flow remain in the broader acceptance matrix.

## Next steps (each needs client input or a decision first)

1. Get Harbor's named contacts from CleanCell, then assign logins in the Harbor office inbox ("Assign a customer login"). Send nothing automatically.
2. Get the approved CleanCell product list and import it with `scripts/import-products.js` (see `docs/product-list-template.csv`); refuse cost-basis columns.
3. Decide the receiving mailbox/provider for email-to-PO intake before any ingestion code is written.
4. Activate and verify QuickBooks in the live office before representing invoicing automation.
5. Confirm processing fee and settlement policy; record, never initiate, wires.

## Tool/approval limitations

- A prior attempt to download all Vercel production environment secrets was explicitly denied. Do NOT retry broad secret extraction. Use existing authorized deployment connections and the signed-in application UI. Never extract Firebase tokens from browser state or commit secrets.
- Chrome's file-upload tool can only read files inside the session's working directory; use `/Users/tommyg/omega-core/assets/...`, not a `/private/tmp` worktree path.

## Existing deliverables

Under `/Users/tommyg/.codex/visualizations/2026/09/21/01a0c151-a2f4-78c3-a44e-73054743ae29/cleancell-agreement/`:

- `CleanCell-OMEGA-Logic-MOU-Draft.docx` (nonbinding draft, unresolved commercial terms explicit)
- `CleanCell-OMEGA-Logic-Executive-Summary.docx`
- `CLEANCELL-UPGRADE-LOG.md` (refresh copy; canonical is `docs/CLEANCELL-UPGRADE-LOG.md`)

Earlier walkthrough deck and screenshot ZIP are in the sibling `omega-logic-deck/output/` directory.

## Completion standard

Report what is live separately from mocked tests and provider-dependent work. Give usable customer and office links. Preserve test records as declined with audit notes. Never claim the entire requested ecosystem complete while email intake, portfolio automation, payments or commissioning are unverified or absent.
