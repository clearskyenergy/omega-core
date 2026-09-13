# Engineering drawing handoff

The user's release requirement is a coordinated plot-plan and one-line package
that an engineering firm can review, revise and issue with minimal redrafting.
PowerPoint drawing objects must remain individually editable. A map photograph
can remain a separate, removable image. Export editability does not certify the
engineering design or authorize a seal.

## Implemented in this pass

- `omega-plot-editable.js` converts supported SVG geometry into native
  PowerPoint freeforms and text boxes with descriptive Selection Pane names.
  Lines, rectangles, polygons, circles, ellipses, quadratic/cubic paths and
  plain text retain separate objects. Embedded PNG/JPEG images remain separate
  images when their placement needs no crop or rotation.
- Drawing coordinates use the actual `PP_DPI` of 96, preserving physical paper
  dimensions. Editable export bypasses the flattened live-canvas screenshot.
- A locally vendored PptxGenJS 4.0.1 runs in an isolated iframe so the older
  application-wide export library is not replaced. Its MIT license is included.
- Export checks every selected sheet before writing. Unsupported geometry
  produces an error identifying the sheet. No automatic raster fallback or
  skipped-sheet success is allowed in editable mode.
- The image-based PPTX remains separately labeled for preview. The permit PPTX
  entry now opens the current project's sheet selection. It no longer rewrites
  another project's permit deck, engineering contacts or default nameplates.
- Grounding details no longer default to a conductor size, prescribe an
  electrode size or assert that every container has two grounding terminals.
  Fence/ground details explicitly identify their remaining template assumptions.
- Export format intent is consumed before asynchronous work, and a busy lock
  prevents concurrent exports and releases on failure or empty selection.

## Verification actually completed

Run from the repository root:

```
node scripts/tests/teditable-pptx.js
node scripts/tests/tdrawing-critical.js
node scripts/check-html-scripts.js editor.html
```

Tests passed for native PPTX XML shapes/text, curve commands, coordinate
transforms, paper dimensions, removing an object from an export, unsupported
path rejection, export-state recovery, earlier plot/one-line regressions and
editor script parsing. The PPTX test writes and inspects a real ZIP package
using the bundled exporter. It does not exercise the live SVG DOM compiler or
PowerPoint's editing application.

## Known limitations: do not deploy as a finished engineering exporter

Browser SVG compilation, layout fidelity, download behavior and application
editing have not been exercised in a live browser or Microsoft PowerPoint.
Clipping/masks/filters, rich `tspan` text, SVG markers, SVG arc/smooth-path
commands, rounded rectangles, SVG `<use>` objects, cropped/rotated images and
nonuniform text transforms are deliberately refused. Some current map and
one-line sheets contain these features, so a complete selected set may stop
with an unsupported-feature error. Support must be completed and visually
verified before calling this a fully editable export of every sheet.

Circles/ellipses use standard cubic approximations; dash patterns normalize to
PowerPoint dashes. Text placement relies on browser font metrics. These require
comparison at printed sheet size. PowerPoint changes do not synchronize back to
OMEGA, and independently editable lines are not automatically attached native
PowerPoint connectors. Moving equipment there requires checking its connections.

The existing vector plot reconstruction has not been proven equivalent to the
live canvas. Grounding/fencing illustrations still need project-driven geometry
and reviewed construction specifications. One-line generation still synthesizes
topology independently of the placed conduit graph. Other sheet renderers still
contain generic structural/electrical assumptions. No calculation, professional
review or engineering seal was completed by this software pass.

## Required acceptance before an engineering-firm handoff

1. Use the firm's approved title blocks, drafting conventions, sheet index,
   revision fields, detail library and verified project inputs.
2. Reconcile one shared equipment/connection graph across the site, one-line,
   conductor schedule, equipment schedule and all exports. Preserve IDs,
   quantities and source revisions. Flag missing/duplicate/disconnected nodes.
3. Verify boundaries, map calibration, north, dimensions, equipment clearances,
   fence/gate geometry, access and actual conduit/trench routing against reviewed
   site information. Do not infer underground utilities from imagery.
4. Replace generic grounding and fencing sketches with the approved project's
   electrode/bonding design, equipment terminal details, fence/gate dimensions,
   materials, foundation/attachment design and supporting calculations.
5. Record the electrical design basis: service, POI, equipment nameplates,
   AC/DC interfaces, protection, conductors, grounding/bonding and relevant
   studies. Requirements must follow the actual jurisdiction and utility.
6. Export the full set at each supported paper size. Inspect PDF and PPTX for
   content parity, missing objects, text overflow, leader placement, linework,
   scale, north, clipping and sheet cross-references.
7. Open PPTX in the firm's application. Delete/add fence segments and grounding
   notes; move equipment; revise a one-line connection; edit title blocks;
   save/reopen and export to PDF. Verify the revisions persist and remain legible.
8. Obtain the responsible engineering firm's review and acceptance of a real
   representative project. Record that review against the exact issued revision.

This is a source update for further integration, not a completed permit set.
Restore the complete repository before whole-platform release verification;
the previously identified truncated index and preview remain unresolved.
