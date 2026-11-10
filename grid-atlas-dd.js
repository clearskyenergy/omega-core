/* ═══════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · grid-atlas-dd.js  (v1 · 2026-11-09)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Due-diligence checklists for Grid Atlas: Tesla Supercharger / DC fast
   charging, BESS, and modular AI compute. Pure judgement over an evidence
   object the page assembles from its own loaded layers — no DOM, no network,
   so scripts/tests/tgridatlasdd.js can hold every verdict.

   WHY: the "project profile" dropdown only switched layers on; it ran no
   checks. Rextag sells exactly this missing piece — attributed grid layers
   plus a screening read per site. This file is that read, mapped to the
   checklists a lender actually asks for. The compute profile IS the
   Solela / Francis Energy "Site Readiness Checklist — 1 MW Modular AI
   Compute Deployment" (2026-11), section for section; items a map cannot
   answer are carried as OPEN items with the evidence the checklist names,
   never guessed.

   HONESTY RULES (same as analyze()'s wScore and api/grid-atlas.js):
   · unknown  = the source was never consulted (layer off). NOT a zero.
   · open     = a human must produce the evidence (title report, will-serve).
   · pass / conditional / risk are only ever given on a measured reading,
     and every one names what it measured. A screening read clears nothing:
     the verdict text says so.

   Evidence object (every key optional; null/undefined = not measured):
     subKm, subName, subKv          nearest substation (km, name, kV)
     txKm, txKv                     nearest transmission line
     lineKvMax                      highest kV seen nearby (line or sub)
     mwBand (string), mwLow (MW)    screening capacity band + lower bound
     utilityMeasured, utility       serving-utility polygon consulted / name
     isoMeasured, iso               ISO/RTO polygon consulted / name
     evMeasured, evWithin15         EV charging sites within 15 km
     dcWithin40                     data centers within 40 km
     fiberMeasured, fiberKm         nearest mapped fiber route
     fiberScreen {routes, facilities, radiusKm}   last /api/fiber-screen
     floodMeasured, inFlood, floodZone            FEMA NFHL at the pin
     waterMeasured, waterKm         nearest mapped surface water
     gasMeasured, gasKm             nearest gas transmission line
     ixpColoMeasured, ixp60, colo60 peering context within 60 km
     subCount40, plantMW40          interconnect options / generation nearby
     targetMw                       the facility load being screened for
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── status helpers ───────────────────────────────────────────────────── */
  function pass(value, note)        { return { status: 'pass',        value: value || '', note: note || '' }; }
  function conditional(value, note) { return { status: 'conditional', value: value || '', note: note || '' }; }
  function risk(value, note)        { return { status: 'risk',        value: value || '', note: note || '' }; }
  function unknown(note)            { return { status: 'unknown',     value: '—', note: note || 'Not measured — enable the layer. Never looked is not a reading.' }; }
  function open(evidence)           { return { status: 'open',        value: '☐', note: 'Evidence needed: ' + evidence }; }

  function measured(v) { return v !== null && v !== undefined; }
  function kmTxt(km) { return km < 1 ? Math.round(km * 1000) + ' m' : (Math.round(km * 10) / 10) + ' km'; }

  /* ── shared auto checks ───────────────────────────────────────────────── */
  function ckSubstation(ev, passKm, condKm) {
    if (!measured(ev.subKm)) {
      return unknown(ev.subMeasured
        ? 'No substation in the loaded view — widen the map; distance not measured.'
        : 'Enable Substations to measure interconnection distance.');
    }
    var v = kmTxt(ev.subKm) + (ev.subName ? ' · ' + ev.subName : '') + (ev.subKv ? ' · ' + ev.subKv + ' kV' : '');
    if (ev.subKm <= passKm) return pass(v, 'Substation inside the screening distance. Proximity only — headroom is the utility’s answer.');
    if (ev.subKm <= condKm) return conditional(v, 'Workable distance; line extension or feeder length is a cost driver.');
    return risk(v, 'Distance to the grid is a primary cost driver at this point.');
  }
  function ckCapacityBand(ev, needMw) {
    if (!measured(ev.mwLow) || !ev.mwBand || ev.mwBand === 'unknown') {
      return unknown('No voltage read nearby — enable Transmission + Substations, or widen the view.');
    }
    var v = ev.mwBand + ' (screening band)';
    if (ev.mwLow >= needMw) return pass(v, 'Nearby voltage class plausibly carries ~' + needMw + ' MW. NOT confirmed capacity — the real number is the utility’s hosting-capacity map or a study.');
    return conditional(v, 'Mapped voltage class is light for ~' + needMw + ' MW; expect a feeder upgrade conversation. Confirm with the serving utility.');
  }
  function ckUtility(ev) {
    if (!ev.utilityMeasured) return unknown('Enable Utility Territory to resolve the serving utility.');
    if (ev.utility) return pass(ev.utility, 'Serving utility resolved — its hosting-capacity / interconnection portal is the authoritative next step (link in Available Power Estimate above).');
    return conditional('none at this point', 'No territory polygon here — likely a muni or co-op gap in the public dataset. Identify the utility by address.');
  }
  function ckIso(ev) {
    if (!ev.isoMeasured) return unknown('Enable ISO / RTO to read the market.');
    if (ev.iso) return pass(ev.iso, 'Organized market — wholesale programs (capacity, ancillary) are reachable where the interconnection allows.');
    return conditional('outside ISO (bilateral)', 'Bilateral market: revenue is the utility tariff and contracts, not an ISO stack.');
  }
  function ckFlood(ev) {
    if (!ev.floodMeasured) return unknown('Enable FEMA Flood to read the mapped zone.');
    if (ev.inFlood) return risk('FEMA zone ' + (ev.floodZone || 'A/V'), 'Mapped Special Flood Hazard Area. Elevation or relocation of pads and gear; a flood elevation certificate joins the package.');
    return pass(ev.floodZone ? 'zone ' + ev.floodZone : 'no SFHA mapped', 'Not in a mapped special flood hazard area at this point. A formal FEMA determination still goes in the package.');
  }
  function ckFiberRoute(ev) {
    if (!ev.fiberMeasured) return unknown('Enable a fiber layer or run the Fiber evidence check.');
    if (!measured(ev.fiberKm)) return conditional('no route in view', 'No mapped route in the loaded sources. Not evidence of absence — quote the carriers.');
    var v = kmTxt(ev.fiberKm) + ' to mapped route';
    if (ev.fiberKm <= 2) return pass(v, 'Mapped route within 2 km — serviceability and capacity unconfirmed until a carrier quotes the lateral.');
    if (ev.fiberKm <= 8) return conditional(v, 'Route nearby; lateral construction cost and timeline need a carrier quote.');
    return risk(v, 'Fiber build is a material cost driver at this distance.');
  }
  function ckFiberScreen(ev) {
    var fs = ev.fiberScreen;
    if (!fs) return open('run "Check map center" in the Fiber evidence panel — it screens the published inventory server-side at this point.');
    var v = fs.routes + ' route' + (fs.routes === 1 ? '' : 's') + ' · ' + fs.facilities + ' facilit' + (fs.facilities === 1 ? 'y' : 'ies') + ' ≤ ' + fs.radiusKm + ' km';
    if (fs.routes > 0) return conditional(v, 'Published evidence in radius. Serviceability, capacity and diversity stay UNCONFIRMED until carriers answer an RFI.');
    return conditional(v, 'No published route in radius — coverage is partial; absence of a record is not absence of fiber. Carrier RFI required.');
  }

  /* ── profile definitions ──────────────────────────────────────────────────
     Each item: { id, label, auto: function(ev) } or { id, label, evidence }.
     An item with `evidence` is OPEN until a human attaches that evidence —
     the compute list quotes the Francis checklist's own evidence column.   */

  var PROFILES = {};

  /* ════ TESLA SUPERCHARGER / DC FAST CHARGING ═══════════════════════════ */
  PROFILES.supercharger = {
    key: 'supercharger',
    title: 'Tesla Supercharger site',
    defaultMw: 3, /* 12–16 stall V4 site ≈ 2–3 MW peak demand */
    note: 'Screened for a 12–16 stall DC fast-charging site (~2–3 MW peak, dedicated 480 V three-phase service).',
    sections: [
      { key: 'power', name: 'Power & utility service', items: [
        { id: 'sc-sub',  label: 'Distribution service proximity', auto: function (ev) { return ckSubstation(ev, 5, 15); } },
        { id: 'sc-cap',  label: 'Capacity band vs ~3 MW site demand', auto: function (ev) { return ckCapacityBand(ev, measured(ev.targetMw) ? ev.targetMw : 3); } },
        { id: 'sc-util', label: 'Serving utility identified', auto: ckUtility },
        { id: 'sc-ws',   label: 'Utility will-serve / new service application', evidence: 'written will-serve or service application acknowledgment from the serving utility for the site’s kW' },
        { id: 'sc-xfmr', label: 'Dedicated transformer & switchgear pad', evidence: 'pad space and clearances for a dedicated ~2,000–3,000 kVA 480 V three-phase transformer, metering and switchboard' }
      ]},
      { key: 'site', name: 'Site & host', items: [
        { id: 'sc-host', label: 'Host site agreement / site control', evidence: 'executed lease, license or easement with the property owner covering stalls, equipment pad and trench routes for the operating term' },
        { id: 'sc-lay',  label: 'Stall layout & circulation', evidence: 'layout for 12–16 stalls with ADA-compliant stalls, drive-in/out clearance, lighting and trench run to the equipment pad' },
        { id: 'sc-zone', label: 'Zoning / local permits', evidence: 'confirmation EV charging is a permitted or accessory use; electrical and building permit path with the AHJ' },
        { id: 'sc-amen', label: '24/7 amenities & access', evidence: 'restrooms, food and lighting within a short walk; site accessible 24/7 without gates' }
      ]},
      { key: 'demand', name: 'Demand & competition', items: [
        { id: 'sc-ev',   label: 'Existing charging within 15 km', auto: function (ev) {
            if (!ev.evMeasured) return unknown('Enable EV Charging (OSM) to read nearby sites.');
            var n = ev.evWithin15 || 0;
            if (n === 0) return conditional('0 sites', 'Unserved area: first-mover corridor or thin demand — traffic data decides which.');
            if (n <= 12) return pass(n + ' sites', 'Charging demand is validated nearby without obvious saturation.');
            return conditional(n + ' sites', 'Dense charging market — differentiate on stall count, speed and amenities.');
          } },
        { id: 'sc-aadt', label: 'Traffic & corridor fit', evidence: 'AADT for the fronting road / highway and distance to the interchange; corridor gap analysis (NEVI corridor status if public funding is in scope)' }
      ]},
      { key: 'env', name: 'Site risk', items: [
        { id: 'sc-flood', label: 'FEMA flood zone', auto: ckFlood },
        { id: 'sc-trench', label: 'Utility easements & trench route', evidence: 'recorded easements along the service and trench route; one-call locate for existing underground utilities' }
      ]}
    ]
  };

  /* ════ BESS ════════════════════════════════════════════════════════════ */
  PROFILES.bess = {
    key: 'bess',
    title: 'BESS site',
    defaultMw: 10,
    note: 'Screened for a distribution- or subtransmission-connected battery. Mapped proximity is never headroom.',
    sections: [
      { key: 'power', name: 'Interconnection', items: [
        { id: 'bs-sub',  label: 'Substation proximity', auto: function (ev) { return ckSubstation(ev, 3, 10); } },
        { id: 'bs-tx',   label: 'Transmission proximity & class', auto: function (ev) {
            if (!measured(ev.txKm)) {
              return unknown(ev.txMeasured
                ? 'No line in the loaded view — widen the map; distance not measured.'
                : 'Enable Transmission to measure line distance.');
            }
            var v = kmTxt(ev.txKm) + (ev.txKv ? ' · ' + ev.txKv + ' kV' : '');
            if (ev.txKm <= 2) return pass(v, 'Line adjacency supports a gen-tie conversation; thermal headroom is a study answer.');
            if (ev.txKm <= 8) return conditional(v, 'Line within reach; gen-tie length and crossings are the cost question.');
            return risk(v, 'Long gen-tie — distribution interconnection is likelier the real path here.');
          } },
        { id: 'bs-cap',  label: 'Capacity band vs project MW', auto: function (ev) { return ckCapacityBand(ev, measured(ev.targetMw) ? ev.targetMw : 10); } },
        { id: 'bs-host', label: 'Hosting capacity / feeder headroom', evidence: 'read the serving utility’s hosting-capacity map at the feeder (portal link above) and save the screenshot with date — mapped voltage is not capacity' },
        { id: 'bs-queue', label: 'Interconnection application & queue', evidence: 'application filed with the utility or ISO; queue position, study phase and cluster timing on record' }
      ]},
      { key: 'market', name: 'Market & revenue', items: [
        { id: 'bs-util', label: 'Serving utility identified', auto: ckUtility },
        { id: 'bs-iso',  label: 'ISO / RTO market', auto: ckIso },
        { id: 'bs-prog', label: 'Tariff & program confirmation', evidence: 'the specific tariff, demand-response and wholesale programs this battery would bill under, with current rates (the platform’s VPP simulator and Value Stack carry the published figures)' }
      ]},
      { key: 'site', name: 'Site & safety', items: [
        { id: 'bs-flood', label: 'FEMA flood zone', auto: ckFlood },
        { id: 'bs-ctl',  label: 'Site control', evidence: 'ownership, lease or option covering the BESS pad, access and the interconnection route for the operating term' },
        { id: 'bs-ahj',  label: 'Zoning & AHJ pre-application', evidence: 'zoning allowance for energy storage; AHJ pre-app covering NFPA 855 setbacks, UL 9540A documentation and the fire-safety narrative' },
        { id: 'bs-noise', label: 'Noise at the property line', evidence: 'inverter/HVAC noise estimate against the local ordinance; a noise study where residential is adjacent' },
        { id: 'bs-fire', label: 'Fire access & water', evidence: 'apparatus access route and water supply or accepted alternative agreed with the fire authority' }
      ]},
      { key: 'env', name: 'Environmental', items: [
        { id: 'bs-ph1', label: 'Phase I ESA', evidence: 'Phase I Environmental Site Assessment on the parcel' },
        { id: 'bs-wet', label: 'Wetlands & species screen', evidence: 'NWI wetlands, endangered-species and cultural-resources desktop screen; field delineation where mapped features touch the pad' }
      ]}
    ]
  };

  /* ════ MODULAR AI COMPUTE — the Francis Energy checklist, section for
     section. Items a map can answer are auto; everything else carries the
     checklist's own evidence wording as an OPEN item. ═══════════════════ */
  PROFILES.compute = {
    key: 'compute',
    title: 'Modular AI compute site',
    defaultMw: 1.25,
    loadOptions: [
      { itKw: 75,   label: '75 kW IT'   },
      { itKw: 350,  label: '350 kW IT'  },
      { itKw: 1000, label: '1 MW IT'    },
      { itKw: 1770, label: '1.77 MW IT' }
    ],
    facilityFactor: 1.25, /* compute + liquid cooling + networking + losses + headroom */
    note: 'The Site Readiness Checklist for a modular liquid-cooled AI compute deployment (containerized, ~5 racks/container). Facility power ≈ IT load × 1.25.',
    sections: [
      { key: 'control', name: '1 · Site Control & Legal', items: [
        { id: 'cp-own',   label: 'Site control for the operating term', evidence: 'ownership, long-term lease, option or other site control sufficient for the operating term' },
        { id: 'cp-title', label: 'Title & survey', evidence: 'current title report or commitment with ALTA/NSPS survey' },
        { id: 'cp-ease',  label: 'Easements & encumbrances', evidence: 'identification of all easements, encumbrances, covenants or restrictions affecting the site' },
        { id: 'cp-auth',  label: 'Authority to develop & operate', evidence: 'confirmation of authority to develop and operate a modular compute container' },
        { id: 'cp-cons',  label: 'Third-party consents', evidence: 'required consents from landowners, lenders or other stakeholders' }
      ]},
      { key: 'zoning', name: '2 · Zoning & Land Use', items: [
        { id: 'cp-zone',  label: 'Zoning designation & permitted use', evidence: 'current zoning designation and confirmation modular data center / industrial / compute use is allowed by right or via special permit' },
        { id: 'cp-var',   label: 'Variances / conditional use', evidence: 'status of any required variances, conditional use permits or rezoning' },
        { id: 'cp-set',   label: 'Setbacks & coverage', evidence: 'setback, height, lot coverage and impervious-surface compliance for the container and support equipment' },
        { id: 'cp-ovl',   label: 'Overlay districts', evidence: 'overlay districts or special regulations (floodplain, historic) — the FEMA reading in §7 feeds this but does not replace the local determination' }
      ]},
      { key: 'permits', name: '3 · Permitting', items: [
        { id: 'cp-bld',   label: 'Building / structural (pad)', evidence: 'building or structural permits for the container foundation or pad' },
        { id: 'cp-elec',  label: 'Electrical permits', evidence: 'electrical permits for the facility-scale power distribution' },
        { id: 'cp-mech',  label: 'Mechanical / plumbing (liquid cooling)', evidence: 'mechanical and plumbing permits related to the liquid cooling system' },
        { id: 'cp-envp',  label: 'Environmental permits', evidence: 'air, water, stormwater and noise permits as applicable' },
        { id: 'cp-tl',    label: 'Permit summary & timeline', evidence: 'local, county, state and federal permit status summary with the timeline to obtain what remains' }
      ]},
      { key: 'power', name: '4 · Power, Generation & Interconnection', items: [
        { id: 'cp-cap',  label: 'Utility capacity vs facility load', auto: function (ev) { return ckCapacityBand(ev, measured(ev.targetMw) ? ev.targetMw : 1.25); } },
        { id: 'cp-sub',  label: 'Substation proximity', auto: function (ev) { return ckSubstation(ev, 5, 15); } },
        { id: 'cp-util', label: 'Serving utility identified', auto: ckUtility },
        { id: 'cp-gas',  label: 'Gas supply for on-site / bridge generation', auto: function (ev) {
            if (!ev.gasMeasured) return unknown('Enable Gas Pipelines to read supply options.');
            if (!measured(ev.gasKm)) return conditional('none in view', 'No mapped gas transmission nearby — on-site generation would be LPG/diesel or none.');
            return pass(kmTxt(ev.gasKm) + ' to gas line', 'Mapped gas supply supports a bridge or hybrid power strategy if the utility timeline is long.');
          } },
        { id: 'cp-ix',   label: 'Interconnection application & queue', evidence: 'interconnection application filed; status of studies, queue position and estimated timelines' },
        { id: 'cp-net',  label: 'Continuous net capacity', evidence: 'confirmation of continuous net capacity accounting for derating, site conditions and auxiliary loads' },
        { id: 'cp-olin', label: 'One-line & protection concept', evidence: 'electrical one-line concept for distribution to the container with redundancy; metering, switchgear and protection requirements identified' },
        { id: 'cp-src',  label: 'Power source strategy', evidence: 'grid, on-site generation or hybrid, with redundancy appropriate to the offtake, and evidence of generation or utility capacity for diligence' }
      ]},
      { key: 'physical', name: '5 · Physical Site (modular container)', items: [
        { id: 'cp-pad',  label: 'Level area for container + support', evidence: 'adequate level area for a 20–40 ft liquid-cooled container plus support equipment, with limited-expansion space noted' },
        { id: 'cp-geo',  label: 'Geotech for pad design', evidence: 'geotechnical report supporting the foundation / pad design for container loads' },
        { id: 'cp-acc',  label: 'Delivery access', evidence: 'road widths, turning radii and crane staging suitable for delivering a large container' },
        { id: 'cp-h2o',  label: 'Liquid cooling water plan', auto: function (ev) {
            if (!ev.waterMeasured) return unknown('Enable the Water layer for surface-water context.');
            var ctx = measured(ev.waterKm) ? kmTxt(ev.waterKm) + ' to mapped surface water' : 'no mapped surface water in view';
            return conditional(ctx, 'Closed-loop liquid cooling is the default plan; water supply, discharge or treatment needs documenting either way.');
          } },
        { id: 'cp-drn',  label: 'Drainage & stormwater', evidence: 'drainage and stormwater plan accommodating the container pad and equipment' },
        { id: 'cp-sec',  label: 'Security & fire separation', evidence: 'security perimeter, fencing, lighting and access control; separation distances and fire protection for the container and any generators' }
      ]},
      { key: 'fiber', name: '6 · Connectivity', items: [
        { id: 'cp-fr',   label: 'Mapped fiber route proximity', auto: ckFiberRoute },
        { id: 'cp-fs',   label: 'Published route evidence (server screen)', auto: ckFiberScreen },
        { id: 'cp-px',   label: 'Peering / colo context', auto: function (ev) {
            if (!ev.ixpColoMeasured) return unknown('Enable IXP + Colo layers for market context.');
            return pass((ev.ixp60 || 0) + ' IXP · ' + (ev.colo60 || 0) + ' colo within 60 km', 'Interconnection market context only — not a substitute for the carrier quote.');
          } },
        { id: 'cp-quote', label: 'Dedicated symmetrical fiber quote', evidence: 'carrier confirmation of dedicated symmetrical service at the offtake bandwidth (preferred 10 Gbps, 5 Gbps minimum), with providers, route options and build cost allocation' },
        { id: 'cp-div',  label: 'Route diversity & latency', evidence: 'route diversity or redundancy options if the offtake requires them; estimated latency and special routing requirements' }
      ]},
      { key: 'env', name: '7 · Environmental & Other Diligence', items: [
        { id: 'cp-flood', label: 'FEMA flood determination', auto: ckFlood },
        { id: 'cp-ph1',  label: 'Phase I ESA', evidence: 'Phase I Environmental Site Assessment completed' },
        { id: 'cp-wet',  label: 'Wetlands, species & cultural screen', evidence: 'wetlands, endangered species and cultural resources screening' },
        { id: 'cp-air',  label: 'Air permits for generators', evidence: 'air-quality permitting needs for any on-site generators' },
        { id: 'cp-noise', label: 'Noise assessment', evidence: 'noise study or assessment if required by local ordinance' },
        { id: 'cp-oth',  label: 'Other site-specific risks', evidence: 'contamination, seismic, wildfire or other site-specific risks' }
      ]},
      { key: 'package', name: '8 · Readiness Package', items: [
        { id: 'cp-pkg',  label: 'Compiled diligence package', evidence: 'compiled evidence for site control, zoning, permitting, capacity, interconnection and readiness, with a summary of open items and mitigation plans' },
        { id: 'cp-align', label: 'Alignment with the power budget', auto: function (ev) {
            var need = measured(ev.targetMw) ? ev.targetMw : 1.25;
            var cap = ckCapacityBand(ev, need);
            if (cap.status === 'unknown') return unknown('Power alignment follows the §4 capacity reading — not measured yet.');
            var v = '~' + need + ' MW facility target';
            if (cap.status === 'pass') return conditional(v, 'Screening band covers the budget; alignment is confirmed by the utility’s number, not this one.');
            return conditional(v, 'Screening band is light for the budget — resolve §4 before the package is credible.');
          } },
        { id: 'cp-liq',  label: 'Liquid-cooled container support confirmed', evidence: 'confirmation the site supports liquid-cooled containerized systems per the specification' }
      ]}
    ]
  };

  /* ── runner ───────────────────────────────────────────────────────────── */
  function run(profileKey, ev) {
    var p = PROFILES[profileKey];
    if (!p) return null;
    ev = ev || {};
    var sections = [], tally = { pass: 0, conditional: 0, risk: 0, open: 0, unknown: 0 };
    for (var s = 0; s < p.sections.length; s++) {
      var sec = p.sections[s], items = [];
      for (var i = 0; i < sec.items.length; i++) {
        var it = sec.items[i], r;
        if (it.auto) { r = it.auto(ev); }
        else { r = open(it.evidence); }
        r.id = it.id; r.label = it.label; r.kind = it.auto ? 'auto' : 'manual';
        tally[r.status] = (tally[r.status] || 0) + 1;
        items.push(r);
      }
      sections.push({ key: sec.key, name: sec.name, items: items });
    }
    /* readiness over MEASURED auto items only: pass 1, conditional 0.5,
       risk 0. Open and unknown items are named, never averaged in. */
    var span = tally.pass + tally.conditional + tally.risk;
    var readiness = span ? Math.round(100 * (tally.pass + tally.conditional * 0.5) / span) : null;
    var verdict;
    if (readiness === null) verdict = 'Nothing measured yet — turn the profile’s layers on and drop a pin.';
    else if (tally.unknown > 0) verdict = 'Partial screen — ' + tally.unknown + ' reading' + (tally.unknown === 1 ? '' : 's') + ' never measured. The measured part reads ' + readiness + '/100.';
    else if (tally.risk > 0) verdict = 'Screen found ' + tally.risk + ' risk item' + (tally.risk === 1 ? '' : 's') + ' — price them before the ' + tally.open + ' open evidence items.';
    else verdict = 'Mapped screen reads ' + readiness + '/100 — ' + tally.open + ' evidence item' + (tally.open === 1 ? '' : 's') + ' remain for the diligence package.';
    return {
      profile: p.key, title: p.title, note: p.note,
      sections: sections, tally: tally,
      readiness: readiness, verdict: verdict,
      disclaimer: 'Screening read from public map data. It ranks and routes diligence; it clears nothing. Capacity, serviceability and every legal item are confirmed by their owner: the utility, the carrier, the county, counsel.'
    };
  }

  var API = { PROFILES: PROFILES, run: run };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.GridAtlasDD = API;
})(typeof window !== 'undefined' ? window : null);
