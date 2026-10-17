# Site Map editor audit

The site/system designer is `editor.html` (Site Map Designer Pro), about 179,000 lines and 11 MB, plus `omega-*.js` modules it loads. One static page is the whole product: ribbon, canvas, one-line, guided builds, exports. There is no bundler. This note is what that page actually does today, where it is not yet a CAD-grade tool, and what this change fixed.

## How it is built

**State.** One object, `S`, holds the drawing: `elements`, `conduits`, `shapes`, `_trench` (the spine), `_trenches` (guided-build runs), `bessList`, `pxPerFt`, `unitLabel`, and `history`. `window.S = S` so later script blocks see it. Selection is split across `S.sel`, `S.selIds`, `_selShapeId` and `_selCondId`.

**Rendering.** Equipment is DOM under `#els`. Conduits, shapes, dimensions and the snap grid are SVG under `#csvg`. The basemap is a Google map, a frozen static image, or an uploaded photo, transformed by `BG` (`scale`, `tx`, `ty`, `rot`). A full repaint clears `innerHTML` and redraws. There is no scene graph and no retained-mode spatial index.

**Coordinates and units.** Stored positions are canvas pixels. Ground length is feet: pixels divided by `S.pxPerFt`, or, for anything with `_geoPts`, the haversine of those anchors (`_groundPolyFt`). On a live map the scale belongs to the current zoom, not to the undo stack (`_viewOwnsScale`). Snap is `_derSnapPt`: when SNAP is on, points round to `SNAP_FT` (5 ft) times the scale. ORTHO locks a drag to the dominant axis. The status bar prints the cursor as feet only after a scale exists.

**Input.** Mouse and touch handlers on the canvas and on `document` (`globalMM` / `globalMU`). Tools are `S.mode`. Keyboard: Escape cancels a draw then clears selection, Delete/Backspace deletes the current selection, Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z and Ctrl+Y redo, and the capture-phase clipboard owns Cmd/Ctrl+C/X/V/D. Guided builds intercept Cmd+Z so it removes the last trench point instead of a whole leg.

**Undo.** `pushHist` / `undoLast` keep 30 deep copies. A fix pack replaces both: the snapshot includes elements, conduits, shapes, the trench spine, the drawn runs, and (only when the drawing owns the scale) `pxPerFt`. Restore clones out of the snapshot so a later drag cannot mutate history. `omegaHistBatch` collapses a guided-build leg into one step. Redo is a separate stack in the Omega Edit block; it snapshots the state being left and restores it by pushing that snapshot through `undoLast`.

**Persistence.** `saveProject` writes `projects/{id}` in Firestore. Images stay in `localStorage` and Storage because of the 1 MB document cap. Overlapping saves coalesce. A transaction refuses to overwrite a newer `updatedAt` unless the person presses Save again. Recomputable terrain samples and per-table PV geometry are shed if the payload would not fit. Autosave is every 60 seconds once the tab is signed in, has a project, and is dirty or has been touched. `beforeunload` warns when the sheet is dirty. A successful save clears the dirty flag.

**What already works.** Guided BESS, EV and compute builds; geo anchors so a trench length survives zoom; a scale that undo does not roll backwards on a map; copy/paste of elements, shapes and conduits; element move/resize/rotate recorded in history; a history baseline re-seeded after load so the first undo does not blank the drawing; PDF, spreadsheet and one-line export; a separate Architecture workspace (`OmegaArch`) with its own snaps, layers and DXF for that surface only. The map canvas itself does not go through that workspace.

## Gaps

### Robustness

- **Redo dropped the trench runs.** The redo snapshot copied elements, conduits, shapes and the spine, and not `S._trenches`. `undoLast` restores runs only when the snapshot has them, so Redo put equipment back onto the runs from the undone step. Fixed in this change.
- **Work with no account had no close prompt and no local copy.** `beforeunload` required a signed-in user and a project id. A drawing made before sign-in, or before the first save, closed with no warning. A failed save left the only copy in the tab. Fixed here with a local draft and a prompt that follows the dirty sheet, not the account.
- **Loading cleared the dirty flag even if the person had already edited.** The history reseed after `_loadProject` always set `_workDirty` false. An edit during that window was no longer "unsaved". Fixed: a history longer than the boot snapshot keeps the flag.
- **History is 30 full JSON clones.** A large campus clones the whole drawing on every mouse-up. That is correct and it will hitch. It is not a crash, and it is the next performance limit.
- **Two more undo stacks** live inside the one-line CAD kit and the Architecture workspace. They do not share the map's history. Undoing in one surface does not undo the other.

### Performance

- Repaint is `innerHTML = ''` plus a walk of every element, conduit and shape. Fine for a few dozen objects. A traced PV field with hundreds of tables, or a conduit schedule redraw on every undo, is O(n) DOM work on the main thread.
- The snap grid draws a line per cell across the SVG viewBox. It bails out when the step is under 3 px. At a mid zoom on a wide canvas it is still a lot of nodes, rebuilt on toggle rather than on pan.
- `localStorage` images (frozen map, stencil) compete with the new draft for the same quota. The draft sheds table geometry and refuses a payload over 1.5 MB rather than writing a partial lie.

### UX

- Snap is 5 ft and not editable from the status bar. That is a reasonable utility-scale default and a coarse one for a charger pedestal or a conduit bend. Ortho and polar tracking exist in the Architecture workspace, not as object snaps (endpoint, midpoint, intersection) on the map.
- The ribbon is the command surface. There is no command line on the map, and shortcuts are a short list (select, conduit, undo, clipboard, escape, delete), not a CAD accelerator set.
- Selection is one object, plus a separate multi mode (`S.selIds` / `o2Picked`) that does not share one property editor. There is no marquee that edits a mixed set in one gesture.
- Layers are per tool (a class hidden in `S.o2Hidden`), not named CAD layers with lock, isolate and plot style.
- The status bar labelled cursor numbers **ft** even when they were still pixels. Fixed: the unit follows the number.

### Correctness

- Lengths with ground anchors are trustworthy. Lengths without them are pixels over the live map scale, and an uploaded photo keeps its own calibration. That split is documented in `scripts/tests/ttrenchft.js` and it is the right one.
- `_derSnapPt` used to run `Math.round` on NaN and hand the NaN onward. Fixed: a non-finite point is left alone.
- Equipment footprints and the cost engine are server-side where the price lives. The browser still owns placement geometry. A bad `pxPerFt` (the bug the scale-ownership fix closed) used to double every trench.
- DXF export exists on the Architecture workspace, not as a round-trip of the map drawing. PDF export is a screenshot of the canvas (`html2canvas` / jsPDF), so line weights are pixels, not paper space.

### What an enterprise CAD editor still needs

In the order that protects drawings first:

1. **Do not lose the drawing.** Local draft, close prompt, stale-save guard, oversize shed. The first three are in place after this change; the draft is per browser, not a server version list.
2. **Units that cannot lie.** Ground anchors for every new run; the cursor unit matching the number; a named snap increment. Object snaps and a typed distance ("12'6\"") are not built.
3. **Undo that covers every gesture, with redo of the same snapshot.** Element, shape, conduit and trench edits are covered. Property-panel edits, layer visibility and the one-line are not all on this stack. Redo now includes the runs.
4. **One selection model.** Marquee, shift-add, multi-edit of rotation and layer, grips that share the snap engine.
5. **Named layers.** Lock, isolate, plot. The class hide-list is not that.
6. **Large-drawing performance.** Spatial index, incremental SVG, history that stores a patch instead of a full clone past a few hundred objects.
7. **Crash recovery across devices.** The draft is `localStorage` on this machine. A server-side revision the stale-save guard can offer ("theirs / mine") is the missing half.
8. **Import and export.** DXF in and out of the map drawing, PDF in paper space with dimensions that are real measurements, not a bitmap.
9. **Dimensions.** Some arrow markup exists (`_ensureDimArrows`). There is no associative dimension that updates when the object moves.
10. **Errors a person can act on.** Save failures already name permission, size and a crashed Firebase client. Geometry errors (a conduit with a non-finite vertex, a self-intersecting trench) are still silent.
11. **Accessibility.** The save indicator is a live region. Most of the ribbon is click-only, the canvas is not keyboard-navigable, and contrast on the dark status bar is the theme's problem, not a CAD cursor.
12. **Tests.** History, trench length, save guards and the recovery rules are node tests that cut functions out of the page. There is no browser test that drags a charger, undoes, redoes and reloads.

## This change

- Redo snapshots include `S._trenches`, so a redo restores runs with the legs.
- `omega-editor-recovery.js` writes a debounced local draft while the sheet is dirty, offers Restore or Discard when that draft is newer than the copy this tab loaded and belongs to the same project, and drops it on a successful save. Table geometry is shed. A draft over 1.5 MB is refused out loud.
- Closing the tab warns whenever the sheet is dirty or a save is in flight, including before sign-in. An empty boot does not warn.
- The load-time history reseed no longer clears the dirty flag if the person already edited.
- Snap ignores non-finite points. The status readout shows `ft` or `px` to match the number.

## Still on the roadmap

Object snaps and a typed snap distance, one selection model, named layers, patch-based undo past a few hundred objects, server-side revisions, DXF round-trip of the map, associative dimensions, keyboard access to the canvas, and a browser test that drives a real edit. None of those are started here, because each one can change a drawing a customer already has.
