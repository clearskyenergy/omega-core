# ZTMM container data centre — engineering basis in the editor

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 20 September 2026. Records what was read off two vendor documents
and where it landed in `editor.html`, so the next person can tell a
datasheet number from a planning guess.

Source documents (not committed; held in the project data room):

- **ZTMM "Container Data Center" Layout-01**, dated 2026.9.18 — the 1 MW
  IT layout with six compute racks, one sheet, dimensioned.
- **ZTMM Modular AI Data Center Design Concept EN** — Manus Bio, Augusta
  GA; 1 / 3 / 5 MW IT options, six pages. The 3 MW and 5 MW layouts are
  reproduced as thumbnails in this document; their dimensions were read
  from the container count and the 40 ft / 3800 mm module.

Both are marked *preliminary design concept, for technical and budgetary
discussion*. The vendor's own closing note: final equipment is refined
against the confirmed server OEM, rack dimensions, site one-line, BESS
interface and project approvals. Everything below inherits that caveat.

---

## What the drawings say

### The container

Every module is one ISO-class container, **12192 mm (40 ft) long × 3800 mm
(12′-6″) wide**. Blocks are containers stacked long-side to long-side, so a
block pad is **40 ft × (12.5 ft × containers)**. There are two container
types:

| POD | Contents (1 MW sheet) |
|---|---|
| **IT POD** | 6 × 150 kW compute racks + 1 × 20 kW network rack on a hot aisle; 2 × CDU ≥ 900 kW (1 main / 1 spare); 3 × 60 kW in-row precision AC (2 main / 1 spare); FM200 |
| **ELE POD** | ATS → UPS1 input maintenance bypass, UPS2 input maintenance bypass → 1125 kVA UPS + 500 kVA UPS → UPS output 1, UPS output 2 → AC output cabinet; 2 × 45 kW in-room AC (1 main / 1 spare); FM200 |

### The plant, outside the containers

Air-cooled magnetic-levitation chillers, a chilled-water storage tank and a
hydraulic module sit beside the stack. **None of them is dimensioned on any
sheet.** The editor counts them and does not draw them.

### Cooling

- Rack heat split 90 % liquid / 10 % air ("air-liquid ratio 1/9").
- Path: cold plate → secondary liquid loop → CDU → primary chilled-water
  loop → hydraulic module → chiller plant.
- Secondary (CDU) side: 25 % propylene glycol, 35 / 45 °C supply / return.
- Primary side: 25 % ethylene glycol, 18 / 26 °C supply / return.
- Non-evaporative; free cooling when Augusta ambient allows. **No site
  water.**

### Electrical

Incoming power → ATS → UPS input → maintenance bypass → UPS → UPS output →
IT and required auxiliary loads. Redundancy is *N* as drawn, with options
added per project. The site-level utility and BESS interface is left to the
project one-line.

### The three published blocks

| | 1 MW (Layout-01) | 3 MW (§3) | 5 MW (§4) |
|---|---|---|---|
| Compute racks @ 150 kW | 6 | 20 (2 PODs × 2 rows × 5) | 35 (14 + 7 + 14) |
| Network racks @ 20 kW | 1 | 4 | 5 |
| **IT load** | **920 kW** | **3,080 kW** | **5,350 kW** |
| IT PODs / ELE PODs | 1 / 1 | 2 / 2 | 3 / 4 |
| Containers · pad | 2 · 40 × 25 ft | 4 · 40 × 50 ft | 7 · 40 × 87.5 ft |
| Stack, top to bottom | IT, ELE | ELE, IT, IT, ELE | ELE, ELE, IT, IT, IT, ELE, ELE |
| CDU | 2 × ≥ 900 kW | 4 × ≥ 1500 kW | 4 × ≥ 2100 + 2 × ≥ 1050 kW |
| In-row AC (60 kW) | 3 (2 + 1) | 12 (4 + 2 per POD) | 15 (POD-1/3: 4 + 2; POD-2: 2 + 1) |
| In-room AC (ELE PODs) | 2 × 45 kW | 4 × 60 kW | 4 × 60 kW + 4 × 45 kW |
| UPS | 1125 + 500 kVA | 4 × 1000 kVA | 5 × 1250 kVA as labelled ¹ |
| Chillers | 2 × 1200 kW (1 + 1) | 4 × 1200 kW (3 + 1) | 4 × 2000 kW (3 + 1) |
| Chilled-water tanks | 1 | 2 | 2 |
| Hydraulic module | 1 | 1 | "40 ft + 20 ft" |

¹ The 5 MW sheet labels "1250kVA UPS5" in two different ELE PODs. Counted
once, as labelled, and noted on the block rather than silently made six.

**Option B** (concept §2): the 1 MW block with a seventh rack, ≈ 1.05 MW of
compute. The concept says CDU, chiller and electrical sizing rise with it
and must be evaluated with the cooling redundancy. Only Option A is drawn.

---

## Where it landed

| Editor location | What |
|---|---|
| `DC_CATALOG.dc_ztmm1` | The 1 MW unit, `kw:920`, `lf:40, wf:25`, `cooling:'external-chiller'`, `water:0`, `verified:` cites the sheet |
| `DC_CATALOG.dc_ztmm1b` | Option B, `kw:1070`, seven racks, carries the not-resized caveat in `spec` |
| `ZTMM_BLOCKS` | The table above, one row per published block, with `stack[]` for the renderer |
| `ztmmPlan(itKw, unit)` | Picks the block on the vendor's nominal size (a 1 MW ask is the 1 MW block); inside it counts the racks the load populates at 150 kW after the network racks, and reports spare positions or racks *over* the drawing (a 1,000 kW ask is 6.5 racks in a six-rack POD, which is what Option B is for). Past 5 MW, tiles 5 MW blocks and flags `extrapolated` |
| `OmegaCompute.size()` | When the chosen unit is ZTMM, pod count and per-pod footprint come from the plan; `r.ztmm` rides in the result and into `S.computeBuild.ztmm` |
| Compute Build dialog | New **Compute unit** select (defaults to ZTMM); a **Modular plant · ZTMM** card lists racks, containers, chillers, CDUs, AC, UPS, tanks, and the undimensioned-plant note |
| Guided Build, modular format | Seeds `dc_ztmm1` instead of the nominal `dc_mdc1` |
| `placeAt()` / `OmegaComputePlace.build()` | Each block is one `derdc` shape at its own footprint and IT kW, with `ztmm.stack` |
| `_derRenderDc()` | Draws the container stack with IT POD / ELE POD strips and a "chillers off-pad" label |
| Data Ctr ▾ flyout, Insert palette, `EQ_BLOCK`, `EQ_FT`, `EQ_ARCH` | The unit is placeable by hand and exports to DXF / the one-line as a compute pod |
| Plan-sheet note (`noteText()`) | One line naming racks, containers, chillers, CDU, UPS, no site water, and the off-pad plant |

Test: `node scripts/tests/tztmm.js` — evaluates the catalogue and planner
out of `editor.html` and checks the rows against the sheets.

## What was deliberately NOT taken

- **Chiller yard footprint.** Not on any sheet. The build reserves nothing
  and says so; inventing a yard would make the land-fit test lie.
- **Facility power / PUE.** The sheets give cooling *capacities* (1200 kW
  chiller, 60 kW in-row), not electrical draw. PUE stays a user input.
- **Utility voltage and the BESS interface.** Left to the project one-line
  by the vendor; `volts:null` on the rows.
- **Cost.** None in either document.
- **A 7-rack drawing.** Option B is text and a thumbnail; the row says the
  plant is the Option A plant until the vendor resizes it.

## What would make the tool better next

- A dimensioned plant sheet from ZTMM (chillers, tank, hydraulic module)
  so the chiller yard can be placed and fenced, not just counted.
- Electrical draw for the chillers and CDUs, which would let the sizer
  derive PUE for this product instead of asking for it.
- The rack OEM and rack dimensions the concept says the final design waits
  on.
