# SPATCO Energy Solutions — Portal Setup

A SPATCO-branded ClearSky-OMEGA portal. The **Site Designer & Permit Engine
(editor)** is live; every other module shows an **"Upgrade"** overlay you can
unlock later.

## What's in this portal
- **SPATCO branding** — their teal/aqua palette (from their logo), name, logo on
  the login and topbar, `@spatco.com` login restriction.
- **Editor live** — "Site Designer & Permit Engine" and "Open a Sandbox" both
  open the editor. This is where you demo the engineering, permit-set generation,
  and AI efficiencies.
- **13 tools locked** — BESS Pro Forma, DCFC, Residential Analyzer, 3D Fleet,
  Sales Proposal, Value Stack, Investment Analysis, Permit Creator, AHJ Portal,
  Procurement, Aggregators, Financing, AI Offtakers — each shows an "Upgrade"
  badge, a hover overlay, and an upgrade modal that emails dev@clearsky-usa.com.

## Files to put in the SPATCO repo
1. `spatco-index.html` → rename to **`index.html`** in the repo root.
2. `spatco-logo.jpg` → **`spatco-logo.jpg`** in the repo root (referenced by the
   login + topbar).
3. **`editor.html`** → your editor tool (the `editor-nextnrg-monday-api.html`
   file, renamed to `editor.html`). The portal opens `/editor.html?id=...`.
4. Optional now, needed when you unlock them: `proforma.html`, `permit.html`,
   `investment-analysis.html`, etc. Until they exist, the tiles are locked anyway.

## To unlock more tools later
In `index.html`, find the SPATCO tenant (`'spatco.com'` in `WORKSPACES`) and add
tool keys to `unlockedTools`:

```js
unlockedTools: ['editor'],                       // now — editor only
unlockedTools: ['editor','permit','proforma'],   // later — unlock more
```

Tool keys: `editor, proforma, dcfc, apartment, fleet, sales, valuestack,
investment, permit, ahj, procurement, aggregators, financing, offtakers`.

## Login / tenant
- Only `@spatco.com` emails resolve to the SPATCO workspace (email-domain scoped,
  same multi-tenant model as NextNRG).
- To test before SPATCO has accounts, you can temporarily add your own domain to
  the SPATCO tenant's `allowedDomain`, or sign in with a `@spatco.com` test user.

## Walkthrough script (selling engineering + permits + AI)
1. **Login** → SPATCO-branded, feels like their own platform.
2. **Dashboard** → Portfolio Command Center (starts empty; fills as they add sites).
3. **Open "Site Designer & Permit Engine"** → this is the pitch:
   - Guided build on live satellite imagery
   - Equipment placement, conduit routing, one-line diagrams
   - **AHJ-ready permit set generation** (the permit-building capability)
   - **AI assist** for engineering notes and placement (the AI efficiencies)
4. **Hover a locked tile** → show the "Upgrade" overlay. Message: "This is the
   full OMEGA suite — financial modeling, investor underwriting, procurement.
   Start with the Site Designer, unlock the rest as you grow."

The lock overlays are the upsell: they see the whole platform's breadth while
using the one tool today.

## Notes
- Single-file HTML, ES5, no build step — deploys to Vercel like your other repos.
- The IP-attribution comments correctly state ClearSky owns the platform; exports
  are SPATCO-branded. Verified: HTML balanced, JS syntax clean, tool-gating tested
  (2 live / 13 locked).
