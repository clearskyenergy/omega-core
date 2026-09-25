# Route to Development — the document, and what the portal actually does

Source: Grant, *"OSA Project Lifecycle: The Quickest route from Origination to
Buyers Marketplace"*, 2026-08-31.

This maps that document onto the portal as it stands, names every gap, and
says which are code and which are decisions. It is written to be argued with —
if a mapping below is wrong, the mapping is what should change, not the
document.

---

## The two frames, and why both survive

The document and the portal are answering different questions, and it took a
while to see that they were not in conflict.

**The portal tracks a stage.** `referred → screening → qualified → pre_dev →
permitting → verified → marketplace → committed → funded → construction →
operating`. That answers *how far has this got*.

**The document tracks six data sets maturing.** Summary, Scope, Technical,
Engineering/IA, Financial, Legal. That answers *what is still missing before a
buyer will look at this* — and it is not the same question. A stage is a
pointer on a ladder; buyer-readiness is six tracks running in parallel, and a
project is ready when the last of them lands, not when the pointer reaches a
rung.

The two come apart constantly. A site can sit at `permitting` with no legal
package whatsoever, and the ladder will cheerfully report "permitting" while
the deal is unsellable.

So `route-to-development.js` adds the second frame alongside the first. It
writes no stage and reads no stage.

---

## The six data sets: where each one comes from

| Data set | Backed by | State |
|---|---|---|
| **Summary** | `summary` / `siteNotes`, `name`, `address` | ✅ computed |
| **Scope** | `projectType`, `categories`, `sizeMw`, `loadKw`, `annualKwh` | ✅ computed |
| **Technical** | `design.status`, `projectId` (the editor drawing) | ✅ computed |
| **Engineering / IA** | `permitting.applications`, `grid.score` | ⚠️ partial — no CIR quote field |
| **Financial** | `capexUsd`, `funding.requestedUsd`, `funding.committedUsd` | ✅ computed |
| **Legal** | — nothing | ❌ **unbacked** |

### Legal is the one that matters

There is nowhere on a deal to record a ground lease, a site lease, a PPA, a
SEPA, a joint development agreement, or an executed interconnection agreement.
Phase 4 of the document is entirely about those, and the portal cannot hold
any of them.

`agreementRef` exists and is **deliberately not used here**. It is the
origination fee agreement between OSA and the referring partner. It says
nothing about site control, and scoring it would make every referred deal look
legally packaged — a wrong signal, which is worse than an absent one.

So legal reports `unbacked`, not `missing`, and the distinction is the point:

- **missing** — work somebody has to do
- **unbacked** — work the portal cannot record

A project with everything else complete ceilings at **85%**, not 100%. That
ceiling is deliberate. Dropping legal from the denominator would let a project
read 100% while meaning "ready apart from the part nobody can fill in", which
is a sentence the buyer would otherwise discover on their own.

---

## Phase by phase

### 1 · Origination — *mostly there*

Intake exists (`intake_projects`, the new-project page, the bulk importer) and
captures address, utility usage and site particulars.

**Gap:** the document specifies an **API pushing intake data to ClickUp CRM**,
with Brad, Tommy and Ravi owning delivery, and notes that "how additional
events in Omega need to be transferred to Clickup needs to be mapped out."
Nothing in the portal talks to ClickUp. That mapping is undone and is a
decision before it is code.

### 2 · Evaluation — *half there*

Omega scores sites on zoning, permitting, grid and fiber today (`grid.score`,
`viability`). That is the first half.

**Gaps:**
- **OGI's external evaluation model.** The document has the full project file
  going out by API and specific results — or the top three highest-yielding
  project types — coming back. No such integration exists. This is the single
  largest missing piece, and it is what makes the "all possible highest
  yielding development options" idea work at all.
- **The Project Evaluation Matrix** as specified — a score-weighted matrix of
  100 projects showing which are closest to the Buyer's market. The portal's
  Matrix plots grid strength against bankability, which is a different axis
  pair. `closestToMarket()` now computes the document's ranking; it is not yet
  wired to the Matrix view.

### 3 · Design

**3.1 Technical** — there. Designs are built in the editor, `design.status`
tracks completion, and the document's "rescored on the matrix" now has
something to rescore against.

**3.2 Engineering** — partial. Permitting and interconnection are tracked.
**Gap:** CIR (Dan Duss) supplying project-specific engineering quotes *inside
the portal*, and those quotes flowing into the finance model. No request
mechanism, no quote field, no flow into finance.

**3.3 Product Choices and Procurement** — partial. `bom` exists.
**Gap:** the document's loop — export the BOM to wholesale accounts, get
pricing back, validate it, push validated pricing into the finance model. The
portal has the BOM but not the round trip, and not the Walters account
relationship or the income attribution the document mentions.

### 4 · Development Agreements — *absent*

See above. This is the unbacked data set. Everything in this phase — site
control, JDAs, interconnection agreements, permits as executed documents —
has no home.

### 5 · Finance Modelling and Funding — *there*

`funding`, `capexUsd`, `preDev` and the Funding view cover it. The document's
point that financial decisions influence the matrix score is now true:
`financial` carries 20% of readiness.

### 6 · Development — *out of scope*

The document says a full development process is covered separately. Nothing to
align to yet.

---

## The Buyers Portal — the three-step sell

The document's closing section is the clearest part of it, and the portal
implements none of it.

1. **Legal protections first.** NDA and Non-Circumvent, executed *in the
   portal*, before a buyer browses anything. No NDA flow exists. Grep finds no
   reference to either agreement anywhere in the codebase.
2. **A Buyer Folder customised per buyer**, formatted to that buyer's
   underwriting standards. No folder concept exists.
3. **Deliver the dossier** with the six complete verified data sets. The six
   are now computed; the packaging is not built.

Step 1 is the one to do first, and not only because it is first in the list: it
is a gate on sharing data, so building 2 and 3 before it means building a
distribution mechanism with no protection in front of it.

---

## A conflict worth settling

`PROCESS.md` in this folder describes a **different** pipeline: origination →
machine screen → human verification → commercial → third-party review →
bankable package, with gates between each.

Grant's document describes: origination → evaluation → design → agreements →
finance → development.

These overlap but are not the same ladder, and they disagree about where
third-party verification sits — `PROCESS.md` makes it the final gate before a
bankable package, while the route-to-development document does not mention
third-party sign-off at all.

Both are in the repo and neither references the other. Somebody should decide
which is canonical, or state explicitly that `PROCESS.md` describes the
verification business and this describes the development business. Until then
the portal is being built against two maps.

---

## What is built, and what is not

**Built** — `tenants/osa/route-to-development.js`, pinned by
`scripts/tests/trouteready.js`:

- the six data sets, with the document's own weighting intent
- `readiness(deal)` → per-set state, percentage, what is blocking
- `closestToMarket(deals)` → the document's matrix ranking
- `unbacked` as a distinct state, so legal cannot be silently ticked

**Not built** — and mostly not buildable without decisions:

- a legal document model (phase 4) — **the highest-value next piece**
- ClickUp intake sync
- the OGI external model API
- CIR engineering quote request and return
- BOM → wholesale pricing round trip
- NDA / non-circumvent execution
- the per-buyer Buyer Folder
- wiring `closestToMarket()` into the Matrix view

The readiness model is deliberately additive: it computes from fields that
already exist and writes nothing. It can sit in the portal without changing
how anybody works today, which is what makes it safe to land before the
decisions above are made.
