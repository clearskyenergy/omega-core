# Editor chrome theme

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

The editor's chrome (the title bar, the ribbon, every panel, menu, dialog
and piece of canvas furniture) is painted from ONE token set and follows
the operating system's colour scheme. Light is what Tommy asked for after
the ribbon was restyled ("I love the top panel; now let's make the outside
parts match our theme a little more, easier on the eyes"); dark is the
graphite chrome the editor already had. Nothing moved, nothing was renamed,
no behaviour changed: colours only.

## Where the tokens live

`editor.html`, `<style id="omega-ui-theme">`, the last-loaded `:root`.

- `:root { … }` holds the DARK values. They are the default, so a browser
  that says nothing about colour scheme gets graphite as before.
- `@media (prefers-color-scheme: light) { html:not([data-omega-theme="dark"]) { … } }`
  holds the LIGHT values for a system set to light.
- `html[data-omega-theme="light"] { … }` holds the same light values for a
  person who pinned light regardless of the system.
- The two light blocks are IDENTICAL on purpose (`teditortheme.js` asserts
  it). Edit both or neither.
- The accent variants (`html[data-omega-accent="green"|"amber"]`) are placed
  AFTER the light blocks so a chosen accent wins in either scheme.

The ribbon's own scoped light block (`<style id="omega-packaging-ribbon-style">`)
collapsed onto this set: it only names which token paints its ground
(`#tb,#ribbon{background:var(--navy)}`).

## The switch

`OmegaUI.theme('auto' | 'light' | 'dark')`, next to `OmegaUI.accent()` and
persisted exactly the same way: `data-omega-theme` on `<html>` (absent means
auto), remembered in `localStorage` as `omega.ui.theme`, restored on boot.
The command palette (Ctrl/⌘+K) carries *Theme: Auto (follow the system)*,
*Theme: Light* and *Theme: Dark* beside the accent entries. There is no
other visible control, because the accent had none.

`omega-package-menu.js` keeps its own `--opm-*` tokens (it opens on pages
without the editor's set) but its dark block now honours `data-omega-theme`
the same way.

## The tokens

| token | dark (graphite) | light | what it paints |
|---|---|---|---|
| `--navy` | `#1F2124` | `#FFFFFF` | title bar, ribbon, context menu, darkest chrome |
| `--blue` | `#34383D` | `#E6EEF9` | mid chrome, quiet button ground |
| `--bg` | `#2C2F33` | `#F5F4F0` | canvas surround, a well inside a panel |
| `--panel` | `#25282B` | `#FFFFFF` | side panels, menus, dialogs, legend, floating panels |
| `--surface` | `#33373C` | `#EEF1F3` | inset fields, cards, bars inside a panel |
| `--border` | `#43474D` | `#D7DFE6` | hairline rules, field borders |
| `--text` | `#E6E8EA` | `#16202B` | primary type |
| `--sub` | `#9AA1A9` | `#526273` | captions, secondary type |
| `--icon` | `#C4CAD1` | `#526273` | monochrome ribbon icon |
| `--ink` | `#14171A` | `#16202B` | dark type on a light or accent ground |
| `--accent` / `--accent-2` | `#3E8FCC` / `#5CA6DF` | `#2B5FA8` / `#33629F` | the one highlight; `-2` is the legible text shade |
| `--on-accent` | `#FFFFFF` | `#FFFFFF` | type on an accent ground (dark ink under the green/amber accents) |
| `--hl` / `--hl-dim` | accent / `rgba(62,143,204,.16)` | `#2B5FA8` / `#E6EEF9` | active tab, selected row |
| `--gold` | `#5CA6DF` | `#2B5FA8` | section headings (`.sec-h`); 5.9:1 on `--panel` |
| `--scrim` | `rgba(4,10,20,.72)` | `rgba(22,32,43,.45)` | the dim behind every full-screen dialog |
| `--hover` | `rgba(255,255,255,.06)` | `rgba(22,32,43,.05)` | row / button hover on a panel |
| `--hover-strong` | `rgba(255,255,255,.12)` | `rgba(22,32,43,.10)` | pressed / selected fill |
| `--inset` | `rgba(0,0,0,.22)` | `rgba(22,32,43,.05)` | sunken field, list well, code box |
| `--hairline` | `rgba(255,255,255,.08)` | `rgba(22,32,43,.08)` | faint divider inside a panel |
| `--shadow` | `0 10px 30px rgba(0,0,0,.45)` | `0 10px 30px rgba(22,32,43,.18)` | floating menu / dialog shadow |
| `--grid-dot` | `rgba(255,255,255,.07)` | `rgba(22,32,43,.10)` | canvas grid dots |
| `--ok` / `--warn` / `--bad` | `#5EA97B` / `#C9A24E` / `#C97A72` | `#2E7D4F` / `#9A6B00` / `#B3382E` | status text and borders that MEAN something |
| `--on-status` | `#FFFFFF` | `#FFFFFF` | type on a status ground |
| `--green` / `--amber` / `--red` / `--purple` | muted graphite set | darker, legible on white | coloured headings and labels |
| `--gb-*` | graphite | white cards, accent action button | the guided-build wizard card |

`--gb-blue-deep` stays a filled accent in light (`#2B5FA8`) because the
wizard's action label is `--on-accent`.

## The rule for a new panel

1. Ground: `background:var(--panel)` (a dialog, a menu, a floating panel) or
   `var(--surface)` (a card or bar inside one). Never a hex.
2. Edges: `border:1px solid var(--border)`; a divider inside is
   `var(--hairline)`.
3. Type: `color:var(--text)`, captions `var(--sub)`. A coloured heading is
   `var(--gold)`, `var(--accent-2)`, `var(--green)`, `var(--amber)` or
   `var(--purple)`: those carry a shade that reads on both grounds. Never
   `#60A5FA`, `#A78BFA`, `#22C55E`, `#FBBF24` as TEXT.
4. States: hover `var(--hover)`, pressed or selected `var(--hover-strong)`,
   a sunken field `var(--inset)`, focus `var(--accent)`.
5. A full-screen dim is `var(--scrim)` and nothing else; a floating thing
   casts `var(--shadow)`.
6. Dark type on an accent or status button is `var(--on-accent)` /
   `var(--on-status)`, never `#fff` or `#0B1F10`.
7. A colour that carries meaning (a status chip, a draw swatch, a chart
   series, a gradient button, the SLD paper sheet) stays a literal, and a
   canvas, SVG, PDF or exported HTML document never gets a `var()`: there is
   no token set where it is painted.

`scripts/tests/teditortheme.js` fails when a listed region gains a literal
from the recurring dark set; `scripts/render-editor-theme.js` (in
`check:pages`) renders the File menu, both side panels, the guided build and
the export modal in both schemes and asserts the ground and 4.5:1 text.
`scripts/_lib/editor-theme-retoken.py` is the scripted substitution that did
the bulk of the pass (css | markup | js | navy | navy-markup | navy-js);
it is a one-off helper, kept so the same rule can be re-run, not a build
step.

## What is not done

- Only the recurring literal families were tokenised. Dialog builders in
  JS still carry one-off literals (`#4C8DFF`, `#38BDF8` borders,
  `#B45309`-style coloured buttons, gradient buttons): those are meaning or
  accent colours and read on both grounds, but they do not follow the
  accent variants.
- Exported HTML reports and PDF decks keep their own palettes by design.
  The plot-plan and one-line exports were not reviewed for a light chrome.
- The canvas grid follows `--grid-dot`; a satellite map is what it is.
- The Chromium check covers five surfaces. The compass, diagnostics, SOS,
  ARR, Project Intelligence, value workbench and the JS-built dialogs were
  tokenised by the same script and eyeballed, not rendered.
- No visible theme control beyond the command palette; the account page's
  appearance settings, if one is wanted, is a separate change.
- Google Maps' own controls and the ribbon icon SVGs are untouched.
