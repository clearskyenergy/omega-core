# Track A — seven project cards and ribbon polish

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Validated September 26, 2026. Draft PR; not merged.

The shared project creator now presents seven illustrated multi-select
cards, retains the existing scope vocabulary and primary-type precedence,
and supports keyboard focus wrapping and return. The editor recognises the
Building / Net-Zero type. Ribbon icons share a stroke/size treatment, long
labels fit two lines, and duplicate Calibrate/Export for Validation controls and retired
standalone BESS Config/Viability buttons stay hidden. Draw functions remain.

Full package-based workspace filtering, All tools, the results rail and
broader empty states are outside this approved polish slice.

## Checks

- `npm test`: passed, including 36 project-creation behavior assertions.
- `npm run check:pages`: passed, 40 existing page scenarios plus 76 packaging browser assertions.
- Browser coverage: seven cards, mixed BESS + Level 2 save, tenant binding, tablet fit, keyboard wrap/return, retained draw controls, two-line labels and late duplicate hiding.
- HTML script-reference/syntax checks: 47 passed, 0 failed (included in npm test).
- `git diff --check`: passed.

## Screenshots

Twenty images: start dialog (desktop/tablet) and isolated Build/Draw/Output
ribbon, standard/deluxe × light/dark. Start-dialog fixtures load the real
shared component; unit tests also check that index.html and projects.html
keep using that same component.

- [Standard light project chooser](screenshots/packaging-phase-a/standard-light-start.png)
- [Deluxe dark tablet chooser](screenshots/packaging-phase-a/deluxe-dark-start-tablet.png)
- [Deluxe light ribbon](screenshots/packaging-phase-a/deluxe-light-editor.png)
- [Standard dark Draw](screenshots/packaging-phase-a/standard-dark-draw.png)
- [All twenty screenshots](screenshots/packaging-phase-a/)

## Review limits

Screenshots run offline with mock Firebase data, no live API calls or writes.
`standard` and `deluxe` are existing legacy capability tiers, not the future
Lite/Field packages. Literal Lite plus paid-module acceptance needs Phases
1–3. Ribbon captures execute its real markup/styles and owner modules in
isolation; they do not verify the complete authenticated Maps editor.
The admin prototype source was read; browser access to the local prototype
was blocked, so no rendered-prototype comparison is claimed.

No main merge, rules deployment, QuickBooks operation or live tenant change
was performed. The user's original checkout and editor edits were preserved.

## Reproduce

Run `npm test`, then `npm run check:pages` with Playwright and Chromium
installed. `PLAYWRIGHT` may point to the Playwright module and `CHROME` to
the Chromium executable. The new browser check fails if they are missing;
it does not silently claim screenshots passed. GitHub CI runs the new
behavior tests and the combined page command. No build step is added.
