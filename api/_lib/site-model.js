/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/site-model.js — a portfolio SITE as the Compute Site Pro Forma's
   input, and the figures the register keeps of its answer
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The register holds what a workspace knows about a site: its service,
   its chargers, its usage, its power price, the pods it screened for. The
   Compute Site Pro Forma (api/_lib/compute-site.js on the ONE finance
   engine) wants the same facts in its own shape. This is the ONE mapping
   between them, pure, so the site page, the register's bulk run and the
   test read one rule:

     inputFor(site, over, ctx)  → { ok, input }  or  { ok:false, missing[] }
     summaryOf(result, input)   → latestModel, the figures a row shows
     askOf(site)                → the capital request's total project cost

   Read, never invent (the portfolio's rule): a site without a service
   figure, a ZIP or a pod count is NOT modelled on a default — the answer
   names what to enter. The model's own defaults (GPU class, tariff book,
   charging pattern) stand where the site says nothing, and the input the
   run used is stored beside its result so the figure can always be traced.

   THE OMEGA-CORE SKID (2026-10-13, Tommy: "all the data based on the site
   zipcode, the map that we made, those details should auto input into the
   compute site pro forma and that should produce an accurate IRR … it's
   the Omega Core skid"). A design whose compute is Omega-Core skids is
   modelled as the skid IS: on its OWN 480 V meter (the product's planning
   peak a skid, compute plus the battery recharging), with no building load
   behind it, its own CleanCell R60 as the battery, 48 H100 GPUs (whole
   nodes inside 75 kW at 5% reserve, the skid's own capacity rule) sold at
   the public spot market reference the skid's cash flow runs on, its
   operating figures (85% sold, 98% up, −8%/yr pricing, 8% of revenue
   variable, $5,000 a month fixed), the skid priced as ClearSky recorded it
   ($639,000) plus the NextNRG Microgrid Controller built into it ($125,000)
   — the R60 is inside that price, so it costs nothing twice — and the
   rent to the host from the record, else the Omega-Core market reference
   (never an offer). The ZIP is read off the address when the record
   carries none, so a site designed in Site Map runs without anyone typing.

   THE WHOLE PROJECT (2026-10-14, Tommy: "the compute IRR reflects the
   total ask of the project … the build of the system existing and the cost
   of that system now with the cost of the compute system and the payback
   on that"). The host's own system beside the skid — the solar and the
   storage Site Map drew and the Run costed (the NextNRG system at $6.00 a
   watt installed, labor in) — is IN the case as money: hostOf() puts the
   Run's lines on their asset classes (`input.host`), the PPA on record
   prices the solar (`ppaRatePerKwh`, `ppaEscalatorPct`, `ppaTermYears` on
   the site; Topanga: $0.225/kWh, 2.5%, 28 years), else the Run's own
   year-one revenue, else the model says so. The skid still runs on its own
   meter; the host's system is never dispatched against it. The capital
   request is the whole: the skid and the host's system.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var CS = require('./compute-site');
var BR = require('./portfolio/site-bridge');
/* The Omega-Core skid: the product record (its price, its meter, its R60),
   its own cash-flow model (api/_lib/omega-compute-model.js: the chipset
   library at the public spot market reference, the skid's operating
   figures) and the lease market reference. One module, read here and in
   api/_lib/omega-core.js; never a second copy of a price. */
var OC = require('./omega-core'), CM = OC.COMPUTE;

/* the model's own lists, never a copy */
var GPU_CLASSES = Object.keys(CS.GPU);
var STRUCTURES = Object.keys(CS.STRUCTURES);
var HOST_TYPES = ['multifamily', 'commercial', 'retail', 'industrial'];
/* the charging pattern a host type implies (compute-site.js EV_PATTERNS) */
var PATTERN = { multifamily: 'overnight', commercial: 'workplace', retail: 'retail', industrial: 'fleet' };

function num(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) ? null : n; }
function pos(v) { var n = num(v); return n != null && n > 0 ? n : null; }
function str(v, max) { return v == null ? '' : String(v).trim().slice(0, max || 160); }
function tags(site) { return (Array.isArray(site.tags) ? site.tags : []).map(function (t) { return String(t).toLowerCase(); }); }

/* The pods a site is sized for: what the run asks, else the stored pod
   pro forma, else the screening proxy. */
function podsOf(site, over) {
  var o = pos(over && over.pods); if (o) return { pods: Math.floor(o), basis: 'entered' };
  var lp = site.latestProforma; if (lp && pos(lp.pods)) return { pods: Math.floor(lp.pods), basis: 'pod pro forma' };
  var sc = site.screening; if (sc && pos(sc.pods)) return { pods: Math.floor(sc.pods), basis: 'screening proxy' };
  return null;
}
/* The service the model balances on: the capacity on record (derated by
   the model's continuous limit), else the available power the record
   carries plus the existing peak it was netted against (already the
   usable figure, so no derating). */
function serviceOf(site) {
  var svc = pos(site.serviceCapacityKw);
  if (svc) return { kw: svc, loadingPct: null, basis: 'service capacity on record' };
  var mw = pos(site.availablePowerMw), peak = num(site.existingPeakKw);
  if (mw && peak != null) return { kw: mw * 1000 + peak, loadingPct: 100, basis: 'available power plus existing peak, as entered' };
  return null;
}
/* The ZIP: the run's, else the record's, else the one the address carries
   (the record's, then the design's). Nothing else is ever a ZIP. */
function zipOf(site, over, d) {
  var z = str(over && over.zip, 10);
  if (/^\d{5}(-\d{4})?$/.test(z)) return { zip: z.slice(0, 5), basis: 'entered' };
  z = str(site.zip, 10);
  if (/^\d{5}(-\d{4})?$/.test(z)) return { zip: z.slice(0, 5), basis: 'on record' };
  z = BR.zipFromAddress(site.address);
  if (z) return { zip: z, basis: 'read from the site\u2019s address' };
  z = d && d.zip ? String(d.zip) : null;
  if (z && /^\d{5}$/.test(z)) return { zip: z, basis: 'read from the Site Map project\u2019s address' };
  return null;
}
function annualKwhOf(site) {
  var a = pos(site.annualUsageKwh); if (a) return a;
  var m = Array.isArray(site.monthlyUsageKwh) ? site.monthlyUsageKwh : null;
  if (!m || m.some(function (x) { return x == null; })) return null;
  var s = 0; m.forEach(function (x) { s += Number(x) || 0; }); return s > 0 ? s : null;
}
/* ports from the chargers' nameplate: DC fast charging by tag or a large
   nameplate, Level 2 otherwise */
function evOf(site, hostType) {
  var kw = pos(site.installedKw), t = tags(site), dc = t.indexOf('dcfc') >= 0 || (kw != null && kw >= 150 && t.indexOf('l2') < 0);
  var per = dc ? 150 : 11.5, ports = kw ? Math.max(1, Math.round(kw / per)) : 0;
  return { ports: ports, kwPerPort: per, existing: true, pattern: PATTERN[hostType] || 'overnight', basis: kw ? (dc ? 'DC fast chargers' : 'Level 2 chargers') + ' from ' + kw + ' kW nameplate' : 'no chargers on record' };
}

/* inputFor(site, over, ctx): the model's input, or what is missing.
   over = { pods, gpuClass, structure, zip, hostType, label } from the run;
   ctx = { orgName } */
function inputFor(site, over, ctx) {
  site = site || {}; over = over || {}; ctx = ctx || {};
  var missing = [];
  /* THE DESIGN (2026-10-13): what Site Map drew and ran, synced onto the
     record as latestDesign (api/_lib/portfolio/design-read.js). Where it
     speaks it wins — the pods placed, the chargers drawn, the battery and
     solar on the plan, the Run's cost — so the IRR is the design's. A run
     may set over.useDesign === false to model the record's facts alone. */
  var d = over.useDesign === false ? null : (site.latestDesign && typeof site.latestDesign === 'object' ? site.latestDesign : null);
  /* the design's compute is Omega-Core skids and nothing else: the skid's
     own case. A design that mixes skids with the host's own pods runs the
     HOST'S case on the host's service (its pods, chargers, battery, solar
     and cost run), with the skids named as on their own meter. */
  var skids = d && d.compute ? (pos(d.compute.omegaCoreUnits) || 0) : 0, plainPods = d && d.compute ? Math.max(0, (num(d.compute.units) || 0) - skids) : 0;
  if (skids && !plainPods) return skidInput(site, over, ctx, d);
  var z = zipOf(site, over, d), zip = z ? z.zip : '';
  if (!z) missing.push('the site’s five-digit ZIP code (the tariff book and the climate are read from it)');
  var svc = serviceOf(site);
  if (!svc) missing.push('the service capacity (kW), or the available power (MW) together with the existing peak (kW)');
  var pods = pos(over && over.pods) ? podsOf(site, over) : (plainPods > 0 ? { pods: Math.floor(plainPods), basis: 'Site Map design' + (skids ? ' (its ' + skids + ' Omega-Core skid' + (skids === 1 ? '' : 's') + ' on its own meter, not counted here)' : '') } : podsOf(site, over));
  if (!pods) missing.push('a pod count: run the pod pro forma, or enter the pods to model');
  var hostType = HOST_TYPES.indexOf(over.hostType) >= 0 ? over.hostType : HOST_TYPES.indexOf(site.hostType) >= 0 ? site.hostType : 'multifamily';
  var gpu = GPU_CLASSES.indexOf(over.gpuClass) >= 0 ? over.gpuClass : 'h200';
  var structure = STRUCTURES.indexOf(over.structure) >= 0 ? over.structure : 'own';
  if (missing.length) return { ok: false, missing: missing };
  var annual = annualKwhOf(site), price = pos(site.powerPricePerKwh), ev = evOf(site, hostType), cm = site.commercial || {};
  if (d && d.chargers && pos(d.chargers.installedKw) && pos(d.chargers.ports)) {
    var dc = (d.chargers.dcfcKw || 0) >= (d.chargers.l2Kw || 0);
    ev = { ports: d.chargers.ports, kwPerPort: Math.max(1, Math.round(d.chargers.installedKw / d.chargers.ports * 10) / 10), existing: true, pattern: PATTERN[hostType] || 'overnight',
      basis: (dc ? 'DC fast chargers' : 'Level 2 chargers') + ' as drawn in Site Map: ' + d.chargers.ports + ' ports, ' + d.chargers.installedKw + ' kW' };
  }
  var input = {
    site: { name: str(site.name, 120) || 'Site', host: str(site.name, 160), hostType: hostType, city: str(site.city, 80), zip: zip.slice(0, 5),
            street: str(typeof site.address === 'string' ? site.address : (site.address && site.address.street) || '', 160), sponsor: str(ctx.orgName, 120) },
    service: { kw: svc.kw },
    load: annual ? { annualKwh: annual } : {},
    ev: { ports: ev.ports, kwPerPort: ev.kwPerPort, existing: true, pattern: ev.pattern },
    compute: { pods: pods.pods, gpuClass: gpu },
    battery: d && d.bess && pos(d.bess.kwh) ? { kw: d.bess.kw || 0, kwh: d.bess.kwh } : { kw: 0, kwh: 0 },
    deal: { structure: structure }
  };
  if (d && d.solar && pos(d.solar.kwDc)) input.solar = { kwdc: d.solar.kwDc };
  if (d && pos(d.capex) && d.capexSource === 'site-map') input.capex = { total: d.capex, basis: 'Site Map cost run' + (d.capexAt ? ' of ' + String(d.capexAt).slice(0, 10) : '') };
  if (svc.loadingPct != null) input.service.loadingPct = svc.loadingPct;
  if (price) input.tariff = { onPeakRate: price, offPeakRate: price };
  if (pos(cm.rentMonthly)) input.deal.rentPerYear = pos(cm.rentMonthly) * 12;
  var basis = { service: svc.basis, pods: pods.basis, chargers: ev.basis, load: annual ? 'annual usage on record' : 'a typical ' + hostType + ' load (none on record)',
                zip: zip + ' (' + z.basis + ')',
                tariff: price ? 'the site’s power price as a flat rate' : 'the planning rate book for the ZIP', gpuClass: gpu, structure: structure,
                battery: input.battery.kwh > 0 ? 'the battery on the Site Map plan' : 'none', solar: input.solar ? 'the solar on the Site Map plan' : 'none',
                capex: input.capex ? input.capex.basis : 'the model\u2019s catalog', design: d ? (d.at ? 'Site Map design of ' + String(d.at).slice(0, 10) : 'Site Map design') : null,
                skids: skids ? skids + ' Omega-Core skid' + (skids === 1 ? '' : 's') + ' on the design ' + (skids === 1 ? 'is' : 'are') + ' on its own meter and not in this case; a design with only skids runs the skid\u2019s own case' : null };
  return { ok: true, input: input, basis: basis };
}

/* The PPA on the site record, if one is: the rate, the escalator and the
   term NextNRG's executed PPA carries (Topanga: $0.2250/kWh in year one,
   2.5% a year, 28 years). Nothing is invented: no rate, no PPA. */
function ppaOf(site) {
  var rate = pos(site.ppaRatePerKwh); if (!rate) return null;
  var esc = num(site.ppaEscalatorPct), term = pos(site.ppaTermYears);
  return { ratePerKwh: rate, escPct: esc == null ? 2.5 : esc, termYears: term ? Math.floor(term) : 0 };
}
/* The host's system beside the skid, as the compute model's `host` block:
   the design's solar and storage with the Run's lines on their asset
   classes (the NextNRG system is blended energy property; chargers and the
   controller their own classes; pods, the electrical package, generation
   and a shell never energy property; what the lines do not name — site
   equipment, indirects, contingency — rides with the energy property when
   there is any), the PPA on record, else the Run's revenue. Null when the
   design carries no host system. */
function hostOf(site, d) {
  if (!d) return null;
  var solarKw = d.solar && pos(d.solar.kwDc) ? d.solar.kwDc : 0, bess = d.bess && pos(d.bess.kwh) ? d.bess : null;
  var capex = pos(d.capex) && d.capexSource === 'site-map' ? d.capex : 0;
  if (!solarKw && !bess && !capex) return null;
  var energy = solarKw > 0 || !!bess, L = d.capexLines && typeof d.capexLines === 'object' ? d.capexLines : null, lines = [], named = 0;
  /* The Run total carries the Omega-Core skids at the recorded price since
     2026-10-14 (its `omegaCore` line). The skid is the compute case's own
     capex (skidInput prices it), never the host's: take it out of the
     host's total here so the whole project counts it once. */
  var skidLine = L ? Math.round(num(L.omegaCore) || 0) : 0;
  if (capex > 0 && skidLine > 0) capex = Math.max(0, capex - skidLine);
  if (!solarKw && !bess && !capex) return null;
  function add(id, label, amount, asset) { amount = Math.round(num(amount) || 0); if (!(amount > 0)) return; lines.push({ id: id, label: label, amount: amount, asset: asset }); named += amount; }
  if (capex > 0 && L) {
    add('nextnrg', 'NextNRG solar + storage system, installed (labor included)', L.nextnrgSystem, 'blended');
    add('solar', 'Solar PV' + (solarKw ? ', ' + fmtNum(solarKw) + ' kW-dc' : ''), L.solar, 'solar');
    add('bess', 'Battery' + (bess ? ', ' + fmtNum(bess.kw) + ' kW / ' + fmtNum(bess.kwh) + ' kWh' : ''), L.bess, 'storage');
    add('ev', 'EV chargers, installed', L.ev, 'ev');
    add('controller', 'NextNRG Microgrid Controller', L.controller, 'controller');
    add('noncredit', 'Compute pods, electrical package, generation and envelope', (num(L.compute) || 0) + (num(L.dc) || 0) + (num(L.gen) || 0) + (num(L.envelope) || 0), 'other');
    var rest = Math.round(capex) - named;
    if (rest > 0) add('balance', 'Site equipment, engineering, permitting and contingency', rest, energy ? 'blended' : 'other');
    else if (rest < 0 && lines.length) { lines[lines.length - 1].amount += rest; }
  } else if (capex > 0) {
    add('run', 'The host\u2019s system, as the Site Map cost run priced it', capex, energy ? 'blended' : 'other');
  }
  var ppa = ppaOf(site), rev = !ppa && pos(d.annualRevenue) ? d.annualRevenue : 0;
  return {
    solarKwDc: solarKw, bessKw: bess ? bess.kw || 0 : 0, bessKwh: bess ? bess.kwh : 0,
    capexLines: lines, basis: capex > 0 ? 'Site Map cost run' + (d.capexAt ? ' of ' + String(d.capexAt).slice(0, 10) : '') : 'no cost run yet',
    ppa: ppa && solarKw > 0 ? ppa : null,
    revenuePerYear: rev, revenueBasis: rev ? 'the Site Map run\u2019s year-one revenue' : '',
    words: (solarKw ? fmtNum(solarKw) + ' kW-dc solar' : '') + (solarKw && bess ? ' and a ' : bess ? 'a ' : '') + (bess ? fmtNum(bess.kw) + ' kW / ' + fmtNum(bess.kwh) + ' kWh battery' : '') +
           (capex > 0 ? ' costed at ' + fmtUsd(capex) + ' by the Site Map run' + (d.capexAt ? ' of ' + String(d.capexAt).slice(0, 10) : '') : ' with no cost run yet') +
           (ppa && solarKw > 0 ? ', sold under the PPA on record ($' + ppa.ratePerKwh + '/kWh, ' + ppa.escPct + '% a year' + (ppa.termYears ? ', ' + ppa.termYears + ' years' : '') + ')' :
            rev ? ', earning the run\u2019s ' + fmtUsd(rev) + ' a year' : ', with NO revenue on record (enter the PPA on the site)')
  };
}
function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }

/* The Omega-Core skid's chipsets, as a page may offer them: the skid's own
   library, each with its public $/GPU-hour on the basis the skid's cash
   flow runs on (spot, else on-demand), or none. */
function skidChipsets() {
  return CM.CHIPSETS.map(function (c) {
    var basis = c.spotNode != null ? 'spot' : c.onDemandNode != null ? 'on-demand' : null;
    var price = basis ? CM.gpuPrice(c, basis) : null;
    return { key: c.key, name: c.name, gpusPerNode: c.gpusPerNode, nodeKw: c.nodeKw, basis: basis, pricePerGpuHour: price == null ? null : Math.round(price * 100000) / 100000 };
  });
}
/* What the skid is, for a page: the recorded price and what it is made of,
   the meter it is served on, the battery inside it. Facts off the product
   record, never typed into a page. */
function skidFacts() {
  var P = OC.PRODUCT;
  return { name: P.name, skidPriceUsd: P.skidPriceUsd, systemCostUsd: P.systemCostUsd, breakdown: P.systemCostBreakdown.map(function (b) { return { key: b.key, label: b.label, usd: b.usd }; }),
           computeKw: P.compute.kw, meter: { firmKw: P.meter.firmKw, peakKw: P.meter.peakKw, volts: P.meter.volts, phases: P.meter.phases },
           battery: { model: P.battery.model, kw: P.battery.kw, kwh: P.battery.kwh }, chipsets: skidChipsets(),
           lease: { monthlyPerSkid: OC.RATE_CARD.monthlyPerSkid.base, escalatorPct: OC.RATE_CARD.escalatorPct.base, basis: 'market reference, not an offer' },
           pricingAsOf: CM.SOURCES.pricing.asOf };
}
function fmtUsd(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function r2(v) { return Math.round(v * 100) / 100; }
/* skidInput(site, over, ctx, d): the Omega-Core skids on the design as the
   model's input — the skid's own case, see the header. over.pods is the
   number of skids to model (the design's count unless typed); over.gpuClass
   a chipset from the skid's own library (H100 unless chosen). */
function skidInput(site, over, ctx, d) {
  var missing = [], P = OC.PRODUCT, cm = site.commercial || {};
  var z = zipOf(site, over, d), zip = z ? z.zip : '';
  if (!z) missing.push('the site’s five-digit ZIP code (the tariff book and the climate are read from it)');
  var units = pos(over.pods) ? Math.floor(pos(over.pods)) : Math.floor(d.compute.omegaCoreUnits);
  var unitsBasis = pos(over.pods) ? 'entered' : d.compute.omegaCoreUnits + ' Omega-Core skid' + (d.compute.omegaCoreUnits === 1 ? '' : 's') + ' on the Site Map design';
  var c = CM.chipset(String(over.gpuClass || '')) || CM.chipset(CM.DEFAULTS.chipset);
  var priceBasis = CM.gpuPrice(c, 'spot') != null ? 'spot' : CM.gpuPrice(c, 'on-demand') != null ? 'on-demand' : null;
  if (!priceBasis) missing.push('a chipset with a public GPU-hour price (' + c.name + ' has none; choose another)');
  var hostType = HOST_TYPES.indexOf(over.hostType) >= 0 ? over.hostType : HOST_TYPES.indexOf(site.hostType) >= 0 ? site.hostType : 'commercial';
  var structure = STRUCTURES.indexOf(over.structure) >= 0 ? over.structure : 'own';
  if (missing.length) return { ok: false, missing: missing };
  var I = CM.readInputs({ chipset: c.key }), cap = CM.capacity(c, I), price = r2(CM.gpuPrice(c, priceBasis));
  var ramp1 = 0; for (var m = 0; m < 12; m++) ramp1 += I.ramp[Math.min(m, I.ramp.length - 1)]; ramp1 = ramp1 / 12;
  var bessKw = pos(d.compute.omegaCoreBessKw) || P.battery.kw * units, bessKwh = pos(d.compute.omegaCoreBessKwh) || P.battery.kwh * units;
  var rentOnRecord = pos(cm.rentMonthly);
  var rent = rentOnRecord
    ? { perYear: rentOnRecord * 12, escPct: OC.RATE_CARD.escalatorPct.base, basis: 'the rent on record, ' + fmtUsd(rentOnRecord) + ' a month' }
    : { perYear: OC.RATE_CARD.monthlyPerSkid.base * 12 * units, escPct: OC.RATE_CARD.escalatorPct.base,
        basis: 'the Omega-Core market reference, ' + fmtUsd(OC.RATE_CARD.monthlyPerSkid.base) + ' a skid a month escalating ' + OC.RATE_CARD.escalatorPct.base + '% a year: not an offer; enter Rent / month on the site to replace it' };
  var sitePrice = pos(site.powerPricePerKwh), shortName = c.name.replace(/^NVIDIA\s+(HGX\s+)?/, '');
  var input = {
    site: { name: str(site.name, 120) || 'Site', host: str(site.name, 160), hostType: hostType, city: str(site.city, 80), zip: zip,
            street: str(typeof site.address === 'string' ? site.address : (site.address && site.address.street) || '', 160), sponsor: str(ctx.orgName, 120) },
    service: { kw: P.meter.peakKw * units, volts: P.meter.volts, phases: P.meter.phases, loadingPct: 100, own: true },
    load: { none: true },
    ev: { ports: 0 },
    compute: { pods: units, gpuClass: 'custom', gpuName: P.name + ' skid \u00b7 ' + c.name, gpuShort: P.name + ' ' + shortName,
               gpusPerPod: cap.gpus, kwPerGpu: Math.round(c.nodeKw / c.gpusPerNode * 10000) / 10000, overheadPct: 0, pue: I.pue,
               availabilityPct: Math.round(I.uptime * 1000) / 10, priceDeclinePct: Math.round(-I.priceChangePct * 1000) / 10, rampPct: Math.round(ramp1 * 100),
               tiers: { offtake: { sharePct: 0, price: price }, edge: { sharePct: 0, price: price }, spot: { sharePct: 100, price: price, utilPct: Math.round(I.utilization * 1000) / 10 } },
               spotMode: 'always',
               capexPerGpu: Math.round(P.skidPriceUsd / cap.gpus * 100) / 100, podInfraPerPod: P.systemCostUsd - P.skidPriceUsd,
               platformFeePct: Math.round((I.networkStoragePct + I.otherVariablePct) * 1000) / 10, podOmPerYear: I.fixedOpexMonthly * 12 },
    battery: { kw: bessKw, kwh: bessKwh, capexPerKwh: 0 },
    deal: { structure: structure, rentPerYear: rent.perYear, rentEscPct: rent.escPct },
    skid: { units: units, chipset: c.key, chipsetName: c.name, pricePerGpuHour: price, priceBasis: priceBasis, skidPriceUsd: P.skidPriceUsd, systemCostUsd: P.systemCostUsd, gpus: cap.gpus }
  };
  if (sitePrice) input.tariff = { onPeakRate: sitePrice, offPeakRate: sitePrice };
  /* the host's system beside the skid, in the case as money (the whole
     project's ask, IRR and payback); a design with no host system runs the
     skid alone */
  var hostBlock = over.hostSystem === false ? null : hostOf(site, d);
  if (hostBlock) input.host = { solarKwDc: hostBlock.solarKwDc, bessKw: hostBlock.bessKw, bessKwh: hostBlock.bessKwh, capexLines: hostBlock.capexLines, basis: hostBlock.basis,
                                ppa: hostBlock.ppa || undefined, revenuePerYear: hostBlock.revenuePerYear || undefined, revenueBasis: hostBlock.revenueBasis || undefined };
  var host = [];
  if (d.bess && pos(d.bess.kwh)) host.push(d.bess.kw + ' kW / ' + d.bess.kwh + ' kWh battery');
  if (d.solar && pos(d.solar.kwDc)) host.push(d.solar.kwDc + ' kW-dc solar');
  if (d.chargers && pos(d.chargers.installedKw)) host.push(d.chargers.installedKw + ' kW of chargers');
  if (pos(d.capex)) host.push('Site Map cost run ' + fmtUsd(d.capex) + (d.capexAt ? ' of ' + String(d.capexAt).slice(0, 10) : ''));
  var plain = pos(d.compute.units) && d.compute.units > d.compute.omegaCoreUnits ? d.compute.units - d.compute.omegaCoreUnits : 0;
  var basis = {
    skid: true,
    service: 'the Omega-Core skid\u2019s own ' + P.meter.volts + ' V service: ' + P.meter.peakKw + ' kW planning peak a skid (' + P.meter.firmKw + ' kW of compute plus the battery recharging), ' + units + ' skid' + (units === 1 ? '' : 's') + ', 100% loading',
    pods: unitsBasis,
    zip: zip + ' (' + z.basis + ')',
    chargers: 'none on the skid\u2019s meter' + (d.chargers && pos(d.chargers.installedKw) ? '; the host\u2019s ' + d.chargers.installedKw + ' kW of chargers are on the host\u2019s meter' : ''),
    load: 'no building load: the skid is on its own meter',
    tariff: sitePrice ? 'the site\u2019s power price as a flat rate' : 'the planning rate book for the ZIP',
    gpuClass: cap.gpus + ' \u00d7 ' + c.name + ' (' + cap.nodes + ' nodes in ' + I.itLoadKw + ' kW at ' + Math.round(I.reservedOverhead * 100) + '% reserve) sold at the public ' + priceBasis + ' market reference, $' + price.toFixed(2) + ' a GPU-hour (CoreWeave North America, ' + CM.SOURCES.pricing.asOf + '), ' + Math.round(I.utilization * 100) + '% sold, ' + Math.round(I.uptime * 100) + '% up, pricing falling ' + Math.round(-I.priceChangePct * 100) + '% a year; ' + Math.round((I.networkStoragePct + I.otherVariablePct) * 100) + '% of revenue variable and ' + fmtUsd(I.fixedOpexMonthly) + ' a month fixed, the skid\u2019s own operating figures',
    structure: structure,
    battery: 'the skid\u2019s own ' + P.battery.model + ' (' + P.battery.kw + ' kW / ' + P.battery.kwh + ' kWh a skid), inside the skid\u2019s price',
    solar: 'none on the skid\u2019s meter' + (d.solar && pos(d.solar.kwDc) ? '; the host\u2019s ' + d.solar.kwDc + ' kW-dc solar is the host\u2019s own project' : ''),
    capex: 'the Omega-Core skid as recorded, ' + fmtUsd(P.skidPriceUsd) + ' a skid, plus the ' + P.controller.model + ' built into it, ' + fmtUsd(P.systemCostUsd - P.skidPriceUsd) + ', with the model\u2019s own site make-ready, fiber and soft costs beside them',
    rent: rent.basis,
    host: hostBlock ? 'the host\u2019s own system beside the skid, on the host\u2019s meter, IN this case as money (its cost on its own asset classes, its revenue, its O&M), never dispatched against the skid: ' + hostBlock.words + (host.length ? ' (' + host.join(' \u00b7 ') + ')' : '')
        : host.length ? 'the host\u2019s own project beside the skid, on the host\u2019s meter and not in this case: ' + host.join(' \u00b7 ') : null,
    hostRevenue: hostBlock ? (hostBlock.ppa ? 'the PPA on record' : hostBlock.revenuePerYear ? hostBlock.revenueBasis : 'none on record') : null,
    plainPods: plain ? plain + ' compute unit' + (plain === 1 ? '' : 's') + ' on the design that are not Omega-Core skids are not in this case' : null,
    design: d.at ? 'Site Map design of ' + String(d.at).slice(0, 10) : 'Site Map design'
  };
  return { ok: true, input: input, basis: basis };
}

/* summaryOf(result, input, meta): what the site keeps of a run. Every
   figure is the engine's own; a lease with no capital has no IRR and says
   so by null. */
function summaryOf(result, input, meta) {
  meta = meta || {};
  var pf = result && result.proforma || null, m = pf && pf.metrics || {}, su = pf && pf.sourcesUses || {}, who = result && result.structure || {};
  var deals = {};
  Object.keys(result && result.deals || {}).forEach(function (k) {
    var d = result.deals[k];
    deals[k] = { label: d.label, capital: d.capital, equity: d.equity, irr: d.irr, npv: d.npv, payback: d.payback, year1: d.year1 };
  });
  var v = result && result.verdict || {};
  return {
    modelId: meta.modelId || null, at: meta.at || null, by: meta.by || null, label: meta.label || '',
    version: result && result.version || null, financeVersion: pf && pf.version || null,
    structure: who.key || null, structureLabel: who.label || null,
    pods: result && result.compute ? result.compute.pods : null, gpuClass: result && result.compute ? result.compute.gpuClass : null,
    gpuName: result && result.compute ? result.compute.gpuName : null, gpus: result && result.compute ? result.compute.gpus : null,
    serviceKw: result && result.service ? result.service.kw : null, limitKw: result && result.service ? result.service.limitKw : null,
    irr: m.afterTaxIrr == null ? null : m.afterTaxIrr, preTaxIrr: m.preTaxIrr == null ? null : m.preTaxIrr,
    npv: m.npv == null ? null : m.npv, paybackYears: m.paybackYears == null ? null : m.paybackYears,
    totalReturns: m.totalReturns == null ? null : m.totalReturns, moic: m.moic == null ? null : m.moic,
    levered: !!m.levered, dscrMin: m.dscrMin == null ? null : m.dscrMin,
    totalProjectCost: su.totalUses == null ? null : su.totalUses, capex: pf && pf.capex ? pf.capex.total : null,
    equity: su.equity == null ? null : su.equity, debt: su.debt == null ? null : su.debt,
    year1: deals[who.key] ? deals[who.key].year1 : null, termYears: pf && pf.inputs ? pf.inputs.years : null,
    verdict: { label: v.label || null, act: v.act || null, tone: v.tone || null, gate: v.gate || null },
    confidence: result && result.confidence || null,
    deals: deals, title: result && result.story ? result.story.title : null,
    zip: input && input.site ? input.site.zip : null, hostType: input && input.site ? input.site.hostType : null,
    /* the Omega-Core skids this run modelled, and the design it ran on */
    skid: input && input.skid ? { units: input.skid.units, chipset: input.skid.chipset, chipsetName: input.skid.chipsetName, pricePerGpuHour: input.skid.pricePerGpuHour, priceBasis: input.skid.priceBasis, systemCostUsd: input.skid.systemCostUsd, gpus: input.skid.gpus } : null,
    /* the host's system in the case beside the compute: what it cost, what it earns; and the compute's own capital apart */
    host: result && result.host ? { solarKwDc: result.host.solarKwDc, bessKw: result.host.bessKw, bessKwh: result.host.bessKwh, capex: result.host.capex, basis: result.host.basis || null,
                                    ppa: result.host.ppa || null, revenuePerYear: result.host.revenuePerYear || null, revenueBasis: result.host.revenueBasis || null, noRevenue: !result.host.ppa && !(result.host.revenuePerYear > 0) } : null,
    computeCapex: result && result.computeCapex != null ? result.computeCapex : null,
    designHash: meta.designHash || null, auto: meta.auto === true
  };
}

/* The capital request: total project cost from the compute model when one
   has run, else the pod pro forma's investor capital. Says where it came
   from; null when neither is on file. */
function askOf(site) {
  site = site || {};
  var lm = site.latestModel, lp = site.latestProforma;
  if (lm && pos(lm.totalProjectCost)) return { amount: lm.totalProjectCost, source: 'compute-model', equity: lm.equity, debt: lm.debt, irr: lm.irr, structure: lm.structure, structureLabel: lm.structureLabel, termYears: lm.termYears, pods: lm.pods, modelId: lm.modelId, at: lm.at };
  if (lp && pos(lp.investorCapital)) return { amount: lp.investorCapital, source: 'pod-proforma', equity: lp.investorCapital, debt: 0, irr: lp.investorIrrDefined ? lp.investorIrrAnnual : null, structure: null, structureLabel: 'Investor capital, pods (60-month case)', termYears: 5, pods: lp.pods, scenarioId: lp.scenarioId, at: lp.at };
  return null;
}

module.exports = { inputFor: inputFor, summaryOf: summaryOf, askOf: askOf, podsOf: podsOf, serviceOf: serviceOf, evOf: evOf, zipOf: zipOf,
  skidInput: skidInput, skidFacts: skidFacts, skidChipsets: skidChipsets, hostOf: hostOf, ppaOf: ppaOf,
  GPU_CLASSES: GPU_CLASSES, STRUCTURES: STRUCTURES, HOST_TYPES: HOST_TYPES };
