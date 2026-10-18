# Editor v2 — permit set and single-line

`editor-v2.html` builds a permit plan set and a single-line diagram from the drawing. Site Map (`editor.html`) is unchanged. This preview does not replace it.

Outputs is one button. The dialog says ready or not ready in one sentence. Preview and Export are one click each. The code sections, the schedules, and the open items are on the sheets.

## What Site Map already does

The Output ribbon in `editor.html` is the inventory. v2 keeps the documents an engineer reviews. It does not keep the modal that drafts them by hand.

| Site Map output | What it is | In this preview |
|---|---|---|
| Plot plan E0, E1.0, E1.1, E1.2 | Cover, demolition, site, equipment | Cover G-001, site plan C-001, equipment layout E-001. Demolition is C-002 only when the drawing marks an item. An empty demolition sheet is not issued. |
| One-line E2.0 | Auto from the drawing, plus a manual node editor (auto / BESS / EV / both / solar / DER / compute, MV toggle) | E-002 is generated from the v2 drawing. There is no manual node editor. |
| Conductor, equipment, string, placard, grounding content inside those exports | Schedules and notes | E-004 through E-008, plus A-001 for catalog datasheets on file. |
| Blueprint / PDF | An AI-enhanced capture of the canvas | Not rebuilt. It stays on Site Map. |
| Permit Creator | Beta, and the original send is commented out | Not rebuilt. |
| Proposal, interactive report, spec sheet | Customer-facing reports | Not rebuilt. The spec appendix is the datasheet list only. |
| Export for CAD | A DXF of the drawing | Still in Outputs, as Drawing file. The permit set has its own DXF. |
| Export to Monday, Omega-Core qualify, Export for Validation | Other products | Not rebuilt. They are not a permit set. |

The Site Map one-line was not ported. It is a manual editor on canvas pixels, and the topology it guesses is not the v2 document. v2 generates the diagram from the equipment, the conduit, and `doc.electrical`.

## What the old drawings actually printed

Site Map's plot-plan dialog (`openPlotPlanExport`) and its one-line (`sldFromSite`, `_olRender`) are the inventory. Guided builds in that editor place `evgear` with a role (`bgbRole`, `evKind`, `bgbKw`, `bgbKwh`), and several sheets only saw that gear because they looked past `type === 'eq'`. v2 has one equipment type. A guided build writes it through `OmegaEditorV2Guided.apply`, and every sheet reads that document.

| Old sheet | What it carried | Where it is now |
|---|---|---|
| E0 cover | Banner, general notes (codes, discrepancies, OSHA, manufacturer instructions, manuals, lifecycle, work before approval, barricades, job-site conditions), optional model-written notes, electrical notes (690.17, 690/706 marking, 690.45/690.47/706 grounding, color code, circuit ID, flex, optional standby, a named battery called pre-engineered), site aerial or a placeholder, site table (project, address, APN, lat/long, zoning, flood, utility, code/AHJ, system voltage), equipment schedule, scope of work, sheet index, BESS fleet summary | G-001. General notes, electrical notes, scope, site information, job number, designed by, checked by, and the sheet index are printed from the document. The aerial is a gap. Model-written notes are a gap. |
| Title block | Company, address, phone, license, project, site address, APN, scale `1" = N'`, date, revision table (REV / description / date; first row defaulted to "A" and "30% DESIGN"), designed by, checked by, job no., sheet number and name | Every sheet: project, address, customer, sheet number, `Rev ` plus the drawing's revision (Rev 0 when the project does not set one), date, "Issued for review", blank seal and signature. Scale is on C-001 as `1 in = N ft`. Job number, designed by, and checked by are on the cover. Company letterhead beyond the project record is not invented. |
| E1.0 / E1.1 | Wide and enlarged plot, north, scale bar, property, setbacks, equipment, NFPA 855 clearances, transformer clearances, fire access, fences and gates, conduit and trench with lengths, POI and meter, map underlay, conduit overlay | C-001, one scale chosen from the stated list so the site fits, north up, TRUE NORTH, scale bar, property, setbacks, equipment tags, 10 ft dashed exposure around each battery, conduit lengths, fence note. Enlarged and underlay are gaps. |
| E1.2 demolition | Optional existing-conditions / removal sheet | C-002 when an entity is `type: 'demo'` or `demo: true`. Only the marked items. |
| E2.0 one-line | Utility, meter, collector bus, transformer, inverter or PCS, PV, BESS, building loads; modes auto / BESS / EV / both / solar / DER / compute; block-level MV when many containers; a manual editor after generation | E-002 from the document: utility, meter, main, transformer when one is placed, bus, one branch per circuit (device, disconnect, PCS or inverter, end equipment), ground. Orthogonal. No manual editor. MV relay only when the project carries it. |
| E3.0 / E4.0 signage | Colored sign faces from `PP_SIGN_SETS`: BESS (690.17/706.16, 110.27/706.16, 706.16(A), 706.15/IFC 1207.6, IFC 1207.11), EV (MUTCD, ADA 502/208, 625.43/110.27, 625.15, 625.42, 625.50), solar (690.13, 690.56(C), dual source, 690.53, 705.12, HV DC), DER (705.10, 705.20, directory, nameplate, shutoff, HV), data center (110.16/70E, 705.10/708.10, COPS 708, nameplate, 645.10/708.24, 110.27) | E-007 prints the legend and the section (ESS emergency shutoff, ESS nameplate, no smoking, PV system disconnect, PV DC nameplate, EVSE nameplate, EV disconnect, arc flash when a compute load is drawn). The colored face is a gap. An accessible stall and an EPO button location are not invented. |
| E5.0 schedule | TAG, service/run, type, conduit, from, to, length; total; continuation; unscaled warning; trench counted once; equipment MARK, equipment, size, rating, runs; notes on risers, engineer confirmation, trench once, diagrammatic routing, NEC Article 300 | E-004 circuits plus conduit columns Run, Length, Spec, From, To, Trade size. The same notes, including field-verify, risers, trench counted once, and Article 300. E-005 is the equipment schedule: tag, name, kW, kWh, plan size, nameplate. |
| S1.1 / S1.2 pads | Structural pad and gear-pad sections | E-001 prints the plan size and says a structural pad section is not designed. |
| S1.3–S1.5 racking | Solar racking sections, issued when that mount exists | E-006 states the mount, the module, and the table count. It is not a structural section. |
| S2.0 grounding | Grounding sheet | E-008, Table 250.122. The electrode is not designed. |
| S3.0 fencing | Fence detail | C-001 notes a drawn fence and says post, fabric, and foundation are not designed. |
| Cover equipment cell | Manufacturer, model, cell configuration, kWh, kW, voltage, max A, and a hardcoded "UL9540 / NFPA855" and "UL1741" | Maker, model, kW, and kWh print when the build or the equipment carries them. A listing is not claimed unless the record states it. |
| Cover flood cell | Defaulted to zone X | Printed only when the project names a zone. Otherwise "not on the project". |
| Spreadsheet and geo exports | BOM, financial, 8760, project sheet, GeoJSON, KML, PPTX | Not permit drawings. PDF and DXF are the set. |

Guided-build gear in Site Map was skipped by anything that only looked at `type === 'eq'`. v2 does not have that split. `apply` writes `type: 'equip'` with the key, the ratings, the maker, the model, conduit from/to, the trench, the fence, the notes, and demolition, all stamped `source: 'guided'`.

## Guided builds

Most people draw with a guided build. The drawings have to follow that result.

`OmegaEditorV2Guided.apply(doc, build)` writes the build onto the design model. A later build removes only the entities it stamped. A mark the person added by hand stays. `doc.electrical`, `doc.drawing`, and `doc.guided` survive save and restore. The editor's `applyGuidedBuild` commits that document and runs the same refresh the drawing already uses, so Outputs rebuilds. There is no second button.

The phrases in `omega-editor-v2-guided.js` are the old facts a set has to keep printing. `npm run test:editor-v2-guided` builds the BESS, DCFC, Level 2, and commercial PV examples and fails if any phrase for that kind is missing. It also fails if a 1 MW build, reduced to 250 kW, still shows the 1600 A / three-set callout, and if a hand-drawn mark disappears.

## What this set does not do

These are gaps. They are listed in `OmegaEditorV2Guided.gaps` and locked by the same test, so one cannot disappear without the test saying so.

| Gap | Why it is not in the set |
|---|---|
| Satellite underlay | The old plot plan could lay a photo under E1.0. This set has no image to register. The plan is linework at a stated scale. |
| Colored sign faces | The old signage sheets drew colored rectangles. This set prints the legend and the section. |
| Structural pad and gear pad | S1.1 and S1.2 were foundation sections. Footprints are printed. A foundation is not designed. |
| Racking sections | S1.3–S1.5. The array sheet states the mount, the module, and the table count. |
| Fence section | S3.0. A drawn fence is noted. Post, fabric, and foundation are not designed. |
| Grounding electrode | Rod count, resistance, and the bonding jumper are not designed. Table 250.122 equipment grounding conductors are. |
| Conduit fill | Chapter 9 fill needs a trade size and an insulation area. Trade size stays blank until the run carries one. The old schedule also left fill to the engineer when the trade size was unknown. |
| Flood zone defaulted to X | The old cover did. This set prints the zone only when the project names it. |
| Manufacturer filled in | The old cover once prefilled a battery maker. A maker or model prints only when the build carries it. |
| UL 9540 / UL 1741 cell | The old cover printed those as the certification even when the unit was not identified. This set does not claim a listing the record does not state. |
| PowerPoint | The old dialog could export one. This set exports PDF and DXF. |
| Model-written cover notes | The old cover could append them. These notes are the standard language plus the drawing. |
| Manual one-line editor | The old diagram could be dragged after generation. This diagram is regenerated from the design model. |
| Medium-voltage relay template | Relay, AIC, and a utility reclose scheme print only when the project carries them. |
| Accessible stall drawn by default | An accessible EV stall is not marked unless the build marks one. |
| Existing-conditions survey | Demolition lists only what the build marked. A survey of existing conditions is not invented. |

Improvements over the old set, held by the same test: no default flood zone, no invented manufacturer, no unclaimed listing, no empty demolition sheet, Rev 0 unless the project sets a revision, datasheets only when one is on file, and the conductor schedule changes when the build's ratings change.

## What a set contains

Every sheet has the project, the address, the customer, the sheet number, Rev 0, the date, "Issued for review", and a blank seal, signature, and date. The stamp is blank on purpose. Exporting does not seal anything.

| Sheet | What it shows |
|---|---|
| G-001 | Title, sheet index, the code editions used, a vicinity note. |
| C-001 | Site plan to a stated scale, north up, property line, setbacks, equipment tags, a 10 ft dashed box around each battery, conduit, scale bar. |
| E-001 | Plan-view sizes of the placed equipment. These are not surveyed elevations. |
| E-002 | Single-line. The same diagram is the single-line export. |
| E-003 | Service three-line. Branch circuits stay on the single-line. A single-phase service says so and does not invent a three-line. |
| E-004 | Conductor and conduit schedule, with the section on each row. |
| E-005 | Equipment schedule and the transformer nameplate. |
| E-006 | Modules and strings. String length is blank unless Voc and Isc are on the array. |
| E-007 | Placards, each with its section. |
| E-008 | Equipment grounding conductor from Table 250.122. The grounding electrode is not designed. |
| E-009 | Every check: passed, review, or blocking. |
| A-001 | Datasheet name when the equipment or the catalog map has one. Otherwise "Datasheet not on file." |

Sizes are ANSI D (34×22, the default), ARCH D (36×24), and 11×17. PDF and DXF. The DXF is in inches (`$INSUNITS` 1), sheets side by side.

A ready set is titled "Issued for review. Not sealed." A set with a blocking check is titled "NOT FOR PERMIT" and Export is disabled. Preview still opens.

## Ready and not ready

Ready means the drawing has electrical equipment and no check of severity `block`. A review note is printed on E-009 and counted in the one sentence ("Ready to review. N notes are printed in the set."). It does not add a panel to the canvas, and it does not add fields to the ribbon.

Blocking checks, each cited on E-009:

- Nothing electrical is drawn.
- A circuit is past the 6,000 A standard device in 240.6(A), or past 12 parallel sets of Table 310.16 copper.
- 705.12(B) was checked and the bus does not accept the source.
- A supply-side conductor is smaller than 6 AWG copper (705.11(B)).
- A Level 2 charger is on a service above 240 V and no transformer secondary at 240 V or below is drawn (625.40, 625.41).

Anything else is a note. Missing bus rating, assumed 480 V, assumed power factor, a battery larger than its PCS, voltage drop, a missing conduit, a missing transformer impedance, strings, fire access, and a gate are notes.

The readiness score is passed applicable checks over applicable checks. The blank seal is informational. It is not a note and it does not block.

## How the numbers are chosen

`omega-editor-v2-electrical.js` is the only place these numbers are computed. The sheets and the single-line read it. It is not `api/_lib/bess-design-engine.js` (that engine sizes millimetre cable for a different workbook) and it is not Site Map's Run, which still lives inside `editor.html`. A later port of Run should call this module. This change does not wire that port.

Service defaults, used only when `doc.electrical` does not say, and labeled as assumptions on the sheet:

- 480 V, three-phase, power factor 0.95.
- Interconnection method `auto`: the 100% rule when it passes, otherwise the 120% rule when the bus and the main are both entered, otherwise "not checked". A main rating is never invented so that 705.12 can be run.
- Ambient correction (Table 310.15(B)(1)) runs only when `electrical.ambientC` is set. Bundling is not applied. Conduit fill is not calculated.

Continuous current is nameplate current × 1.25.

- ESS output is the PCS kW when a PCS is paired, otherwise the battery kW, and the sheet says which. NEC 2023 706.30(A), conductors and the device at 125% under 706.31. A battery larger than its PCS is a note, not a second circuit.
- PV inverter output is continuous under 690.8(A). The AC kW is the array layout at DC:AC 1.25 (that ratio is the layout, not the NEC 125% factor; both can apply and they are labeled separately) unless the array carries `invKw`. Conductors 690.8(B)(1), device 690.9. Source-circuit current and string length need module Isc and Voc (690.7, 690.8(A)(1)(a)). The EAGLE G7B wattage is known; those electrical values are not, so no string count is invented. A system of 100 kW or more follows 690.8(A)(1)(a)(2) and is not run from wattage alone.
- EV supply equipment is continuous under 625.41. A charger at `level: 'dcfc'` or at 50 kW or more stays at the service voltage. Level 2 is 208 V single-phase when the service is above 240 V.
- Compute and other loads are treated as continuous feeders under 215.2(A)(1) and 215.3. That is an assumption about the duty, stated on the sheet. It is not a GPU code section.

Conductors are the 75°C copper column of Table 310.16, because 110.14(C) limits the termination unless the equipment says otherwise. 240.4(D) caps 14, 12, and 10 AWG. 240.4(B) allows the next higher standard device at 800 A and below when the ampacity is not itself a standard size. Parallel sets follow 310.10(G): 1/0 and larger, at most 12 sets. The equipment grounding conductor is Table 250.122 copper. A size of 250 and above is printed as kcmil.

Voltage drop uses Chapter 9, Table 8, uncoated copper, K = 12.9. One drawn conduit is the length of every circuit, and E-004 says so. Several conduits are listed and not assigned. The 3% / 5% figures are informational notes in 210.19(A)(1) and 215.2(A)(1). They are not a blocking failure.

The interconnection:

- 705.12(B)(1): main device + 125% of the source current ≤ the bus.
- 705.12(B)(2): that sum ≤ 120% of the bus, only with the sources at opposite ends and the source device not relocated. The 2023 marking moved toward 705.30; the placard tells the engineer to confirm the subsection.
- 705.11 supply side: conductors at 125% and not smaller than 6 AWG copper. The disconnect is 705.11(D). The splice follows 705.11(C) and 230.46. The 120% rule does not apply. The utility still has to accept the tap.

Transformer kVA is the larger of source kW and load kW, divided by the power factor, rounded up to a standard nameplate. NEC 450 does not set a multiplier. 450.3 overcurrent is not calculated without percent impedance and the winding configuration. A missing %Z is left blank. It is not filled with 5.75.

Outdoor battery separation uses NFPA 855 (2023) 9.5.2.6.1 and IFC 1207.8.3: 10 ft from lot lines, public ways, buildings, stored combustibles, hazardous materials, high-piled stock, and other exposures. A fire barrier, and a remote installation more than 100 ft from those exposures, are classifications this drawing cannot make, so a shortfall is a review. Unit separation of 3 ft follows IFC 1207.5.3 and NFPA 855 Table 9.5.2 / 9.4.2 where that table requires it. A remote outdoor installation is not always in that table. Under 3 ft is a review. Fire apparatus access (IFC 503) is a review until a note on the drawing says "fire access" or "apparatus". A fence with no "gate" note is a review. Widths are not invented.

Placards name the section and, where the drawing cannot decide, say so. Rapid shutdown (690.56(C)) is printed as applying only where 690.12 applies; a ground array does not settle that. Arc-flash incident energy is not calculated. NFPA 70E is the work-practice standard.

## What Thomas still has to decide

These are jurisdiction and nameplate facts. The set leaves them blank or marks them as assumptions rather than inventing them.

- The adopted NEC edition, and any local amendment. The calculation is NEC 2023. `electrical.adoptedNec` prints a review when it differs.
- The adopted IFC and NFPA 855 edition. `electrical.ifcEdition` is printed when it is set. Whether the site is remote (more than 100 ft from exposures) or near them.
- Utility interconnection: the method the utility will accept, metering, relaying, and reclose. Supply-side still needs the utility's acceptance.
- Fire apparatus access and water supply: IFC 503 and the NFPA 855 water-supply chapter. This set does not size a hydrant or an access road.
- Placard wording beyond the NEC minimum, in the AHJ's own legend.
- Transformer percent impedance and vector group, from the nameplate. 450.3 is not run without them.
- Arc-flash incident energy.
- Soil resistivity and the grounding electrode (250.50, and 690.47 where there is PV). The electrode is not designed.
- Structural wind and seismic, and flood.
- Module Voc, Vmp, and Isc, until a datasheet is on the equipment. String length stays blank until then.
- Raceway trade size, so Chapter 9 fill can be run.
- Ambient temperature, if the 30°C table should be corrected.
- Whether 690.12 rapid shutdown applies (array on or in a building).

Also still only on Site Map, and not part of this set: the AI blueprint, Monday export, the PE validation send, the proposal, the interactive report, and Omega-Core qualify.

## Tests

`npm run test:editor-v2-outputs` runs `scripts/tests/teditorv2outputs.js`. `npm run test:editor-v2-guided` runs `scripts/tests/teditorv2guided.js`.

The golden files in `scripts/fixtures/editor-v2-outputs/` lock the sample industrial site, a 1 MW / 4-hour battery, a commercial array, and a four-charger DCFC site. Beside those files, the test works the 125% factor, 240.6 and 240.4(D), parallel sets, both bus rules, the 6 AWG supply-side minimum, voltage drop as a note, battery spacing, Level 2 on 480 V, and a kW edit that changes the device. Sheet tests cover the three sizes, the PDF header and trailer, the DXF units, orthogonal wires, and labels that do not overlap.

The guided test builds a 1 MW battery, a four-charger DCFC site, a Level 2 site, and a commercial array from `OmegaEditorV2Guided.examples`, then requires every old permit-set phrase for that kind. It requires the tags, the APN, the job number, the names, the demolition item, the 1600 A callout, and the refusal to print flood zone X or a UL listing. It then applies the same battery at 250 kW and requires the 400 A / 600 kcmil callout, with a hand-drawn mark still on the document after save and restore.
