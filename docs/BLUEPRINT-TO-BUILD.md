# Blueprint to Build — what Perplexity showed, and how OMEGA beats it

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 2026-10-16 after Tommy saw a Perplexity Instagram ad ("This is an
unfair advantage for contractors. @perplexity.ai reads blueprints, prices
jobs, and maps out builds") and asked why our tool can't do it. This file
explains what that ad really is, what OMEGA already has, what's missing, and
the plan for building it.

---

## 1. What Perplexity actually did

### The product behind the ad

The ad sells **Perplexity Computer**, launched February 2026. It's a general
cloud agent, not a construction product. You describe an outcome. It splits
the work into subtasks, sends each to whichever of its ~19–20 models suits it
(Claude for reasoning and code, Gemini for research, image and video models
for media), runs sub-agents in parallel inside a sandbox with a filesystem and
a browser, and hands back a finished artifact. That artifact is often a small
interactive web app ("micro-apps", with a *Created with Perplexity Computer*
watermark). It needs Perplexity Max at $200 a month and runs on credits.
Reviewers call it a generalist that dedicated tools will beat in their own
domain.

### What's on the screen

The app in the video ("Lumen Aesthetics · Mockups · Structure Model · Rev 2")
is one generated single-page app with:

| Area | What it shows |
|---|---|
| Left rail | Total **$1,504,250**, **$360 / SF**, concrete 132 CY, steel 9.5 TN, studs 763, then a list of **21 building systems** with a cost and a visibility eye each |
| Centre | A **three.js** model of a ~4,180 SF single-storey shell: grid bubbles, T.O. steel / parapet / ceiling dimension tags, RTUs on the roof |
| View bar | Iso · Top · Front · Side, a **cutaway** slider, and Finished · Explode · Orbit · Blueprint · Grid |
| Bottom | A **build sequence** player: step 9 of ~16 (*Exterior Framing*), 0.5×–4× speed, a phase strip (Site Prep → Footings → Underground → Rebar → Slab → Steel → Joists → Roofing → Framing → Envelope → Interior → MEP → Drywall → Ceilings → Finishes → Site), and **"In place $441,944"** counting up as the model builds |
| Right rail | **Takeoff**: system · key quantity · amount (Sitework 574 CY $20.4K, Structural Steel 7,969 LB $105.6K, Roofing + RTUs 4,259 SF $128.6K…) |

### How it was most likely made

1. **Reading the drawings:** a vision model reads PDF sheets for dimensions,
   grid lines, wall types and the schedules printed on the sheets.
2. **Quantities:** the model works out quantities from those dimensions, e.g.
   area × slab thickness → CY of concrete, perimeter × height → SF of
   envelope.
3. **Pricing:** quantity × a unit rate the model **supplied from its own
   knowledge or a web search**. There's no contractor price book, no local
   labour rate and no supplier quote. The $/SF lands on a believable round
   number ($360/SF).
4. **3D and animation:** a coding model writes the three.js scene by hand.
   The parts are boxes and extrusions tagged with a phase. The timeline
   reveals parts by phase and adds up their costs to give "in place".
5. **Shipping:** one HTML/React app goes out as the deliverable.

### What that means

- It's a **one-off demo**, labelled *Mockups* on its own screen. It was built
  for this one plan set. Nothing is saved, nobody reviews it, and there's no
  audit trail, no tenant, no price book, no proposal and no financing. Run it
  again and you get a different app with different numbers.
- The **look** is what sells it: the model building itself while the dollars
  count up, and every number clickable back to a system.
- The **substance** is thin. AI-guessed unit rates, no record of which sheet a
  quantity came from, nothing that holds up on an interconnection
  application, a permit or an investor's IC memo.

**We already have the substance. We're missing the input (reading the
drawings) and the show (the build-sequence view).**

---

## 2. What OMEGA already has (2026-10-16)

| Their feature | OMEGA today | Where |
|---|---|---|
| Prices the job | **Yes, and better.** Server-side cost engine. Quantities go up and priced lines come back from a real book (DOE/NREL solar, vendor book, NextNRG system rates, the Omega-Core skid, trenching, conduit), with contingency, the ITC basis and a range | `api/_lib/editor-cost.js` (`rollup(q)`), `teditorcost.js` |
| Takeoff from the drawing | **Yes.** Per-run conduit and trench footage, the BOM, schedules on the sheet | `editor.html` (Run, BOM), `rfq.html` |
| 3D model | **Partly.** 3D Site Visualizer ("render the drawn site map as a lit 3D model"), 3D Review mode, three.js r128 on the map, the 3D Fleet Simulator | `editor.html` (~148189, ~27851), `fleet-simulator-3d.html` |
| Plan set | **We produce them, they don't.** Black-and-white plan-set sheets, schedules, one-line, PDF export, permit creator, enlarged plot plan | `editor.html`, `permit.html`, `ClearSky_Enlarged_Plot_Plan_Generator.html` |
| AI reads documents | **Yes, for bills.** Claude reads utility bills into monthly data, server-side, metered per org | `api/omega-ai-extract.js` |
| Maps out the build | **No.** No construction sequence or schedule view | (gap) |
| Reads a blueprint | **No.** Every project is drawn by hand in Site Map | (gap) |
| What they can't do | Interconnection screen, hosting capacity, value stack, VPP, compute IRR, Pro Forma deck, Helios intake, finance marketplace, RFQ routing to vendors, Omega Logic plant and logistics | everywhere |

---

## 3. The improvements, in order

Each phase ships on its own, keeps CLAUDE.md's rules (ES5 tool code, no build
step, math in `/api/`, read and never invent, Firestore rules as the boundary)
and has a test that fails without it.

### Phase 1: Plan-set reader ("drop your drawings in"), the one that sells

> **Status, 2026-10-16: Phase 1 is built.** Build › 1 · Site › *Read Plans*;
> `CLAUDE.md`, *Read Plans*, says how it works. Where it differs from the plan
> below:
> - Placed equipment lands in a row at the centre of the view, to be dragged
>   into place. There is no two-point georeference yet: *Trace over this sheet*
>   puts a sheet on the canvas through the Site Overlay's upload, and Calibrate
>   Scale does the rest.
> - Items are placed as the editor's own equipment carrying the schedule's
>   model and rating. They are not matched to the catalogs by model number.
> - Solar arrays, runs and trenches are listed with their figures, not drawn.
> - A daily cap (80 sheets a workspace, 50 a person) stands in for per-sheet
>   metering until a price is set.
> - Not yet: reading dense sheets in tiles (each sheet goes as one 2,400 px
>   image; a vector PDF also sends its own text), and a run against real
>   customer plan sets with the live model. The tests use a made-up sample set
>   and a canned read.


**What it does:** the user drops a PDF plan set (site plan, single-line, civil,
electrical sheets, or a utility will-serve) into Site Map. A minute later they
see a **review panel**: every piece of equipment, rating, run, dimension and
note found, each with *sheet E-101, schedule row 4* and a thumbnail crop of
where it was read. They tick what's right. Ticked items are drawn on the map
as a draft layer, and Run prices it with the engine we already have.

**How to build it:**
- `POST /api/plan-read` (new), on the same pattern as `omega-ai-extract.js`:
  verified token, org from the token, gated on the plan, one usage count per
  sheet through `api/_lib/usage.js`, and the PDF stored under
  `projects/{id}/plans/`.
- Server side, split the PDF into pages (pdf-lib is already vendored), classify
  each sheet (site / electrical / civil / structural / title / other), then ask
  Claude for a **strict JSON schema** per sheet type. Every field carries
  `sheet`, `bbox` and `confidence`, and a field with nothing on the sheet comes
  back `null`, never a guess. That's the Helios intake rule ("a question the
  platform cannot answer stays blank").
- `api/_lib/plan-read.js` (pure) checks the answers against each other: the
  one-line's kW against the equipment schedule, conduit lengths against the
  scale bar, the transformer kVA against the service. Any disagreement goes on
  an `issues[]` list and is shown, never quietly resolved.
- **Georeferencing:** the user drops two points (a property corner and the
  meter, or the parcel outline from `api/parcel.js`) to scale and rotate the
  sheet over the satellite map. The sheet stays as an underlay at adjustable
  opacity so the person can trace or check anything.
- The editor maps reviewed items onto the existing catalogs (`BESS_CATALOG`,
  `DER_PV_MODULES`, `UTILITY_CATALOG`, `DC_CATALOG`) by model number, and
  anything without a match is placed as a generic box labelled *unmatched,
  from E-101*.
- **Never places anything without review.** The drawing guard
  (`drawingWriteAllowed()`, `savedBy`) already applies, because the save goes
  through the editor's own save.
- Tests: `scripts/tests/tplanread.js` checks the schema and the cross-checks
  against two or three committed sample sheets (ClearSky's own, with tenant
  names removed), with Claude stubbed.

**Also gets fixed here:** `omega-ai-extract.js` defaults to `claude-sonnet-5`
and accepts `body.model` from the browser. Move both readers to a current
model ID held in one place, and stop letting the client pick the model (a
client could pick the most expensive one on the platform's key).

### Phase 2: Build sequence ("maps out builds"), the one that demos

> **Status, 2026-10-16: Phase 2 is built.** *Build* on the 3D Site
> Visualizer's bar; `CLAUDE.md`, *Build sequence*, says how it works. Where it
> differs from the plan below:
> - The step for each of the Run's lines is one table in
>   `api/_lib/build-sequence.js`, not a `phase` key on each `editor-cost.js`
>   line. It throws if the roll-up ever adds a line the table doesn't cover,
>   so money can't be dropped without a failing test.
> - Durations are ClearSky planning rates (crew-days a unit, one crew a step,
>   crews added on big jobs), each printed with its working. Nothing on file
>   gives a utility's interconnection lead time (Grid Atlas carries none), so
>   that step, and engineering and permits, read *not on file* with no number.
> - The schedule is in the player (*Schedule & money*, with a CSV download).
>   Not yet: a schedule page in the proposal export, or seeding the project's
>   task board. The board (`project_tasks`) is written whole by `index.html`'s
>   task flow, so a second writer needs a merge rule first.
> - Explode is built. Cutaway isn't: the visualizer draws conduit at grade,
>   so there is nothing underground to cut away to yet.
> - Conduit stays a BOM estimate outside the Run total, as it is today, so
>   the trenching and wiring steps carry no money of their own and say why.

**What it does:** a **Build** player on the 3D Site Visualizer. Play, a
0.5×–4× speed control, and a phase strip for *our* work: Survey & layout →
Trenching & underground → Pads & foundations → Equipment set (BESS, skid,
switchgear) → Solar racking & modules → EV chargers → Terminations & wiring →
Utility interconnect → Commissioning → Energize. As it plays, the model
assembles and **"In place $X"** adds up from the Run's own lines.

**How to build it:**
- Every line `editor-cost.js` returns gets a `phase` key on the server, so the
  money in each phase is the Run's money and isn't recomputed in the browser.
- Durations per phase come from a server table (crew-days per unit: per 100 ft
  trench, per pad, per MW of solar, per charger), plus the utility's
  interconnect lead time from Grid Atlas when we know it. That gives a real
  Gantt we can export to the proposal and to `project_tasks`, so the Silmarillion
  board starts with the build already laid out.
- The browser only reveals meshes by phase. All the money and timing comes
  from `/api/`.
- Extra views from their bar that are worth copying: **Explode** (lift the
  equipment off its pads to show conduit stub-ups) and **Cutaway**
  (underground: trenches, duct banks, grounding).
- `npm run check:pages` renders the player, steps to the last phase and checks
  that "in place" equals the Run total.

### Phase 3: Takeoff by trade (the right rail)

> **Status, 2026-10-16: Phase 3 is built.** Cost › *Trades* in the right
> panel; `CLAUDE.md`, *Takeoff by trade*, says how it works. Where it differs
> from the plan below:
> - The trades are the Run's own lines regrouped on the server
>   (`api/_lib/takeoff.js`), using the build sequence's split of the money, so
>   the takeoff, the Build player and the Run total always agree to the cent.
>   The divisions are the ones the editor's Takeoff & Budget book already
>   uses.
> - There is no "Structural / Racking" trade of its own. The Run prices solar
>   installed per watt (modules, racking and labour together), so racking
>   can't be split out without inventing a number. Batteries, chargers and
>   generation are their own trades rather than one "Equipment" bucket.
> - No cubic yards. The drawing knows a pad's footprint (shown in SF on a
>   calibrated map) but not its thickness, so a volume would be a guess.
> - Not on the RFQ yet. `api/rfq.js` sends equipment lines to vendors by SKU
>   and has no idea of a trade or a subcontractor. Instead, each trade has
>   *Copy scope of work*: its quantities, ready to send for a bid, with no
>   prices. Sending trade scopes to subcontractors needs a decision on who
>   receives them.
> - The trench, the fence and the conduit are shown with their quantities.
>   They are never added to the money, because the Run doesn't price them.

Group the Run's existing lines by trade (CSI division or the EPC's own):
Sitework / Civil · Concrete · Electrical (DC, AC, MV) · Structural / Racking ·
Equipment · Utility · Soft costs. Each line shows its key quantity with units
(LF of trench, CY of concrete, EA chargers, kWh, kW-DC). One click on a line
highlights its parts in 2D and 3D, and clicking a part shows its line. Export
to CSV and onto the RFQ as each trade's scope.

### Phase 4: Show the money while you draw

> **Status, 2026-10-16: Phase 4 is built.** A readout beside the Run button;
> `CLAUDE.md`, *The Run, pinned*, says how it works. Where it differs from the
> plan below:
> - It sits beside the Run button, not on the map or in the status bar. The
>   status bar already overflows on anything narrower than a desktop: at
>   390 px every item on its right is off-screen. The Run button's row shows
>   on every screen, and nothing on the drawing is covered.
> - The total follows the drawing as it is priced (the cost engine already
>   prices every change). The $/W and the IRR are the Results rail's own,
>   shown only while the results are current, and never worked out a second
>   time.
> - $/W, not $/kWh: the rail has no $/kWh, and the summary only repeats
>   what the rail prints.
> - It re-runs after the save of a drawing changed in this tab, once the
>   drawing has sat saved for a moment. A project only opened, or a new
>   drawing never Run, waits for its first Run by hand, so opening a project
>   never writes to it.

Their screen feels alive because the total is always visible. Pin a slim
**Run summary** to Site Map (total, $/W or $/kWh, IRR once modelled) that
re-runs on save, debounced, using the existing auto-save of priced runs
(`omegaRunSave`). Read-only and unchecked plans wait, as they do today.

### Phase 5: Go past them (what a generalist can't do)

> **Status, 2026-10-16: "Real prices, not model guesses" is built** (on the
> takeoff, Cost › Trades). Every line and row of the takeoff is marked
> QUOTE, BOOK or BENCH. The head of the pane shows how much of the total
> rests on each, and the CSV carries the source of every line. The marks
> are read from what the Run already knows about each price, and name the
> kind of source, never a rate. *Plan set in → plan set out*,
> *drawing → financed project in one session* and *Jarvis does the whole
> thing* are next.

- **Plan set in → plan set out.** Read the customer's drawings (Phase 1) and
  issue our own permit/interconnect plan set from the reviewed model, with a
  **diff sheet** of what changed between their drawing and ours.
- **Drawing → financed project in one session.** After the Run comes the
  compute IRR, the value stack, the Helios intake and the finance hand-off,
  all from the same reviewed model. Perplexity stops at the price; we hand
  over a fundable deal.
- **Real prices, not model guesses.** Tenant price books, NextNRG and
  Clean Cell product lists, and RFQ quotes coming back from vendors. Mark each
  line *book*, *vendor quote* or *benchmark* so a reviewer can trust it.
- **Jarvis does the whole thing:** "Here's the plan set and last year's bills
  for 123 Main St." Jarvis runs plan-read, the bill reader, address lookup,
  the Run and the IRR through the existing `omega` MCP tools
  (`omega_address`, `omega_bill`, `omega_plan`, `omega_apply`, `omega_verify`,
  `omega_save`), and the person reviews each step. That's the
  "unfair advantage" ad, done properly, on a tool that keeps the result.

---

## 4. Order, effort, and what each one sells

| # | Build | Rough size | What it sells |
|---|---|---|---|
| 1 | Plan-set reader + review panel + underlay | 2–3 weeks | "Send us your drawings, get a priced project": the headline |
| 2 | Build sequence player + phased Run lines + Gantt | 1–2 weeks | The demo video; EPCs and installers |
| 3 | Takeoff by trade + two-way highlight | 3–5 days | EPC proposals, RFQ scopes |
| 4 | Pinned live Run summary | 2–3 days | Every session feels like the ad |
| 5 | Plan set in/out, Jarvis end-to-end | 2+ weeks | The thing no generalist agent can copy |

**Packaging:** plan-read is a **metered deliverable** (per sheet, through
`usage.js`), sold in Omega Design with an allowance and packs (Phase 7 billing
already does this). The build player belongs to whoever owns the 3D
visualizer. Names, shelf labels and marks go in `api/_lib/modules.js` only.

---

## 5. Risks and rules

- **Fake precision is the risk.** A misread 4000 A switchboard becomes a
  wrong price on a permit. Every read field shows its sheet, crop and
  confidence. Nothing gets drawn without a person ticking it. Cross-check
  disagreements are shown, never smoothed over.
- **Cost:** vision calls per sheet are real money. Meter per sheet, cap per
  org per day, cache by file hash, and skip non-relevant sheets (cover, notes)
  after classifying.
- **IP:** prompts, schemas, cross-check rules, phase tables and durations live
  in `/api/` and never reach a browser.
- **Customer documents:** store under the project's Storage path with the
  existing rules. Don't use them to train anything, and say so in the Terms
  if we haven't already.
- **Not doing:** general building (vertical) construction takeoff, i.e.
  drywall, finishes, furniture. That's their example, not our market. Stay on
  energy sites: BESS, solar, EV, microgrid, compute.

---

Sources for §1: [eesel.ai — Perplexity Computer guide](https://www.eesel.ai/blog/perplexity-computer) ·
[Thesys — Perplexity Computer](https://www.thesys.dev/blogs/perplexity-computer) ·
[Tech Jacks Solutions — Perplexity Computer](https://techjacksolutions.com/ai-tools/perplexity/perplexity-computer/) ·
[Perplexity — What is Perplexity Computer?](https://enterprise-prod.perplexity.ai/enterprise/videos/what-is-perplexity-computer).
The breakdown of the screen comes from the ad screenshot. The build steps in
§1 are inferred from what's on screen; Perplexity hasn't published how that
demo was made.
