# OMEGA site-building agent for Claude Code — v0.1

This package contains a Claude Code agent, a local MCP tool server, a constrained
site planner and an adapter to the existing OMEGA editor. It is an executable
prototype, not a verified autonomous engineering system. Claude Code and a live
signed-in browser were unavailable during development; those integrations have
not been run here. The planner, adapter with editor doubles, and MCP stdio
transport were tested locally.

## Workflow

Address → editor geocoder → real parcel lookup + OSM building/road context →
bill fact extraction → missing-evidence checks → battery/gear placement →
obstacle-avoiding conduit/trench route → editor placement → screenshot and
model read-back → Save Project.

An address or bill starts the workflow. It does not supply a confirmed service
wall, property survey, manufacturer clearances or underground utility locate.
The agent reuses supplied evidence and asks only for missing facts. It does not
silently make those facts up. OSM building/road geometry is labeled unverified.

## Install in a complete OMEGA checkout

Copy the bundle into the repository root, preserving its directory structure.
It adds files; it does not replace editor.html. Use the complete current editor
with its shared scripts and Maps/Firebase configuration. The previously found
truncated repository copies still need recovery for whole-platform validation.

The local agent has its own dependency folder and creates no browser build step:

```sh
npm install --prefix scripts/site-agent
node scripts/tests/tsite-agent.js
```

Use an installed Chrome/Chromium in a dedicated local automation profile, with
remote debugging bound to loopback on port 9222. Sign in to OMEGA normally in
that browser. Do not expose the debugging port on the network or share your
credentials. Open exactly one tab at your trusted editor URL. Use a fresh empty
canvas for this prototype; it refuses to overwrite existing drawings.

Register the server from the OMEGA checkout in Claude Code. Replace the URL
below if your authorized staging editor uses a different host or query string.
The URL must match the open browser tab exactly, including query parameters.

```sh
claude mcp add --transport stdio --env OMEGA_EDITOR_URL=https://staging.clearskyomega.com/editor.html --env OMEGA_CDP_URL=http://127.0.0.1:9222 omega -- node scripts/site-agent/server.js
claude mcp list
claude
```

The agent definition is in `.claude/agents/omega-site-builder.md`. Ask Claude:

> Use omega-site-builder to build a site concept for [address]. Read the attached
> utility bill and site information. Reuse my confirmed inputs, identify anything
> missing, place and verify the concept in the editor, then save the project.

Claude Code retains its normal tool permissions. No permission-bypass option or
new credentials are embedded in this package. Browser tools are constrained to
the exact configured editor tab; the MCP interface has no arbitrary JavaScript
or generic browser-navigation tool.

## Site input and placement rules

`example-site.json` is a **synthetic test fixture**, not defaults for a real site.
All spatial coordinates are local feet: x east, y north, relative to `origin`.
The parcel must be a simple open polygon: omit a duplicate closing vertex.
`geometrySource`, `equipmentSource`, `service.source` and `constraints.basis`
record where the inputs came from; the agent must not fabricate them.

- Battery: model, kW/kWh, actual footprint, cable-entry side. Placement checks
  the footprint plus supplied clearance against parcel setbacks, the building,
  working area and reviewed obstacles. It tries 0° and 90° orientations.
- Switchgear: model, footprint, mounting arrangement, confirmed building wall
  and distance along that wall. Offset is measured from minimum x on north/south
  walls and minimum y on east/west walls. The gear is placed outside the building
  against that wall; its supplied front working area must remain clear.
- Obstacles: reviewed conservative rectangles for access, doors, drainage,
  easements, utilities and other equipment. Their absence cannot establish that
  a site has no unknown obstructions.
- Routes: continuous orthogonal routes with the supplied width, inside parcel
  setbacks and outside building/obstacle envelopes. The planner uses A* routing
  for up to 24 shortlisted placements and chooses the shortest found route.
  “Blocked” means this bounded search found no solution, not that none exists.
- Surface: one confirmed `soil` or `concrete` corridor per plan. Mixed surfaces
  require segmentation not implemented in this prototype.

The current planner uses an axis-aligned building envelope. It is conservative
for irregular geometry and may reject a feasible real site. Large sites, multiple
buildings, many batteries, access-road design, transformer/PCS/disconnect
topology, multiple meters and multiple surface sections need further development.
The two-node battery-to-switchgear concept is not a complete electrical one-line.

## What is actually drawn

The adapter calls the editor's `_evAdd`, `renderEl`, `renderShape`,
`renderConduit`, `_dcfcRenderTrenches`, `_geoStampAll` and `saveProject` functions.
It creates a parcel outline, reviewed building envelope, battery, switchgear,
bonded conduit and a separately tracked trench. Physical equipment dimensions
override the editor's minimum symbol-size floor. Trench and conduit entries use
the editor's existing data structures and carry the agent run ID.

Plans expire after 30 minutes. A SHA-256 state revision binds each plan to its
project, canvas and map; edits invalidate application/saving. Applying twice is
refused. A placement error restores the pre-operation canvas and history. A
successful apply is initially unsaved. Read-back must verify the expected object
counts, endpoint bonds and unchanged revision before the save tool will run.
Actual persistence is reported only if the editor reports a successful save.

## Tests and acceptance gaps

`node scripts/tests/tsite-agent.js` passes:

- footprint placement and parcel containment;
- confirmed service-wall alignment;
- obstacle avoidance and blocked full-width barriers;
- missing evidence and invalid polygon refusal;
- MCP initialize/tools-list/unknown-tool behavior;
- adapter equipment dimensions, conduit bonds and trench schema;
- changed-state rejection, dirty state and rollback on renderer failure.

A separate real stdio subprocess check passed initialize + tools/list and clean
shutdown. These are offline tests. They do not prove live Google Maps geocoding,
GIS imports, visual map alignment, GPU rendering, Firebase persistence, or Claude
Code execution. No real site was built or saved during this development pass.

Before production use, run a surveyed test site in staging and inspect the
generated geometry, screenshot, zoom/pan alignment, save/reload and failure paths.
Manufacturer installation review, voltage/conductor/protection sizing, utility
approval, construction bend radii, trench depth/sections and field utility locate
remain explicitly unverified. No code-compliance default numbers are invented.

## Integration references

- [Claude Code MCP setup](https://code.claude.com/docs/en/mcp-quickstart)
- [Claude Code agent files](https://code.claude.com/docs/en/sub-agents)
- [Playwright CDP attachment](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
- [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
