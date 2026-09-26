# Phase 0 — verified fallback and 14-day signup ceiling

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Validated September 26, 2026. Draft PR; not merged.

PR #133 already merged the Level 2 closeout branch into main. This phase
therefore adds no duplicate merge. Internal fallback requires a literal
verified Firebase email at clearsky-usa.com. Existing billing still wins.
New signup trials default to 14 days and are clamped to 14 even if the
environment requests more. Repeat signup preserves the existing billing doc.

Approval-started trials, payment-first opt-ins and QuickBooks billing remain
in their roadmap phases; this is the approved signup-path fix only.

## Checks

- `npm test`: passed, including 56 capability assertions and 23 signup assertions.
- `npm run check:pages`: passed, 40 existing page scenarios plus 12 packaging browser assertions.
- HTML script-reference/syntax checks: 47 passed, 0 failed (included in npm test).
- `git diff --check`: passed.

The first full test run hit the existing custody event-order test's
same-millisecond ordering flake. The isolated rerun and full rerun passed;
no custody code was changed.

## Screenshots

Eight images: closeout and isolated ribbon, standard/deluxe × light/dark.
Closeout is currently light-only; its dark-request screenshots document that
existing limitation.

- [Standard light ribbon](screenshots/packaging-phase-0/standard-light-editor.png)
- [Deluxe dark ribbon](screenshots/packaging-phase-0/deluxe-dark-editor.png)
- [Standard closeout](screenshots/packaging-phase-0/standard-light-closeout.png)
- [All eight screenshots](screenshots/packaging-phase-0/)

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
