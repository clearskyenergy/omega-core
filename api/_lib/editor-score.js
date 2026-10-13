/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Site Map's two screening scorers, moved out of editor.html (2026-10-13;
   editor IP audit, items 3 and 4): the site pre-qualification score (open
   area against the system's footprint tiers, parking, title, zoning and
   flood, the hosting-capacity flag, the Priority Go / Conditional Go
   thresholds, the size recommendation) and the interconnection-ease score
   (ISO friendliness, the headroom, substation-distance and size curves,
   permitting, queue and parcel fit, the factor weights, the evidence
   share). Pure, ES5, no I/O. The page sends the facts it has and draws the
   result; the weights, curves and thresholds never leave this side. */
'use strict';
var U = require('./utility-rates');

/* ── pre-qualification ──────────────────────────────────────────────── */
var PQ_BENCH = {
  full: { label: 'Benchmark: 1 MW / 3.5 MWh', kw: 1000, kwh: 3500, areaTiers: [[4000, 60], [3000, 45], [1500, 25], [0, 5]] },
  half: { label: 'Benchmark: 0.5 MW / 1.75 MWh', kw: 500, kwh: 1750, areaTiers: [[2000, 60], [1500, 45], [750, 25], [0, 5]] }
};
/* The system actually configured, else the benchmark pair. Footprint is
   proportional to energy for screening; the tiers scale with the pad. */
function pqSystems(sys) {
  var kw = +(sys && sys.kw) || 0, kwh = +(sys && sys.kwh) || 0, footprint = +(sys && sys.footprintFt2) || 0;
  if (!(kw > 0 && kwh > 0)) return { full: PQ_BENCH.full, half: PQ_BENCH.half, configured: false };
  var req = Math.max(1200, Math.round((footprint || kwh / 4) * 1.65));
  function tiers(a) { return [[a, 60], [a * 0.75, 45], [a * 0.38, 25], [0, 5]].map(function (x) { return [Math.round(x[0]), x[1]]; }); }
  return { full: { label: 'Configured System', kw: Math.round(kw), kwh: Math.round(kwh), areaTiers: tiers(req) },
           half: { label: '50% Alternative', kw: Math.round(kw / 2), kwh: Math.round(kwh / 2), areaTiers: tiers(Math.round(req / 2)) }, configured: true };
}
function areaScore(availSf, sys) { var t = sys.areaTiers; for (var i = 0; i < t.length; i++) if (availSf >= t[i][0]) return t[i][1]; return 0; }
function parkScore(spaces) { spaces = +spaces || 0; return spaces === 0 ? 20 : (spaces <= 3 ? 12 : 6); }
function titleScore(pins) { return (+pins || 1) <= 1 ? 10 : 5; }
function zoningScore(z, f) { return (z && f) ? 10 : (z || f ? 5 : 0); }
function tier(score) { return score >= 85 ? 'Priority Go' : (score >= 65 ? 'Conditional Go' : 'Hold / Needs Review'); }
function capacityFlag(capKw, fullKw, halfKw) {
  if (capKw == null || capKw === '' || !isFinite(+capKw)) return { text: 'Pending — enter hosting capacity', level: 'pending' };
  capKw = +capKw;
  if (capKw >= fullKw) return { text: 'Ample capacity for either system size', level: 'good' };
  if (capKw >= halfKw) return { text: 'Half system likely fits; verify full system with the utility', level: 'ok' };
  return { text: 'Below half-system size; likely needs a capacity upgrade', level: 'risk' };
}
function prequal(inp) {
  inp = inp || {};
  var sys = pqSystems(inp.system);
  var propArea = +inp.propertyAreaSf || 0, bldg = +inp.buildingFootprintSf || 0, avail = Math.max(0, propArea - bldg);
  var spaces = +inp.parkingSpaces || 0, pins = +inp.pins || 1, zoningOk = inp.zoningOk === true, floodOk = inp.floodOk === true;
  function scoreFor(s) { return areaScore(avail, s) + parkScore(spaces) + titleScore(pins) + zoningScore(zoningOk, floodOk); }
  var full = scoreFor(sys.full), half = scoreFor(sys.half), best = Math.max(full, half), rec;
  if (full >= 85) rec = { size: 'full', why: 'Full system already scores Priority Go — no reason to downsize.' };
  else if (half > full && half >= 65) rec = { size: 'half', why: 'Half system reaches a better tier — downsizing recommended.' };
  else if (half > full) rec = { size: 'half', why: 'Half system scores higher, though still below Conditional Go.' };
  else rec = { size: 'full', why: 'Full system is the better or equal option.' };
  var cap = capacityFlag(inp.hostingCapacityKw, sys.full.kw, sys.half.kw), inputComplete = propArea > 0;
  var decision = !inputComplete ? 'Incomplete — property area required'
    : (cap.level === 'risk' ? 'Hold — Grid Constraint' : (cap.level === 'pending' && best >= 65 ? 'Conditional — Capacity Pending' : tier(best)));
  return { availableSf: avail, fullScore: full, halfScore: half, bestScore: best, tier: decision, recommend: rec, capacity: cap, inputComplete: inputComplete,
    breakdown: { area: { full: areaScore(avail, sys.full), half: areaScore(avail, sys.half) }, parking: parkScore(spaces), title: titleScore(pins), zoning: zoningScore(zoningOk, floodOk) },
    /* the systems as the page prints them: label and rating, never the tiers */
    system: { full: { label: sys.full.label, kw: sys.full.kw, kwh: sys.full.kwh }, half: { label: sys.half.label, kw: sys.half.kw, kwh: sys.half.kwh }, configured: sys.configured } };
}

/* ── interconnection ease ───────────────────────────────────────────── */
var ISO_OF = { PJM: ['IL', 'PA', 'NJ', 'MD', 'DE', 'VA', 'WV', 'OH', 'KY', 'DC', 'IN', 'NC', 'MI'], NYISO: ['NY'], ISONE: ['CT', 'MA', 'RI', 'NH', 'ME', 'VT'],
  ERCOT: ['TX'], CAISO: ['CA'], MISO: ['IA', 'MN', 'WI', 'MO', 'AR', 'LA', 'MS', 'ND', 'SD', 'MT'], SPP: ['KS', 'OK', 'NE'] };
var ISO_SCORE = { PJM: 62, NYISO: 55, ISONE: 60, ERCOT: 88, CAISO: 52, MISO: 70, SPP: 75, OTHER: 60 };
function isoForState(state) { var k; for (k in ISO_OF) if (ISO_OF[k].indexOf(state) >= 0) return k; return 'OTHER'; }
function isoScore(state) { var iso = isoForState(state); return { iso: iso, score: ISO_SCORE[iso] != null ? ISO_SCORE[iso] : 60 }; }
function interconnect(inp) {
  inp = inp || {};
  var zip = String(inp.zip || ''), state = String(inp.state || '').toUpperCase(), D = inp.facts || {}, sysKW = +inp.sysKW || 0, footprintFt2 = +inp.footprintFt2 || 0;
  /* the serving utility from the rate book: a ZIP is evidence, a state is an estimate */
  var util = null;
  if (zip.length >= 3) util = U.lookup(zip); else if (state) util = U.fromState(state);
  var factors = [], isoInfo = isoScore(state), utilScore = isoInfo.score;
  var utilReal = !!(zip && util && !util._fallback && !util._stateResolved), utilEst = !!(util && (util._fallback || util._stateResolved));
  if (util && util.demandRate) utilScore = Math.min(100, utilScore + Math.min(15, (util.demandRate - 12)));
  var utilNote = !util ? (inp.lookingUp ? ' — looking up the serving utility' : ' — add the site ZIP to identify it')
    : util._fallback ? ' — no utility on file for this ZIP, defaults shown'
    : util._stateResolved ? ' — ' + state + ' state default, confirm the serving utility' : '';
  factors.push({ key: 'utility', label: 'Utility / ISO', score: Math.round(utilScore), detail: (util ? util.name : 'Utility not identified') + utilNote + ' · ' + isoInfo.iso, real: utilReal, source: utilReal ? 'data' : 'estimate', weight: 0.28 });

  var capScore, capDetail, capReal = false, capSource = 'estimate';
  if (D.hostingCapacityKW != null && sysKW > 0) {
    var ratio = D.hostingCapacityKW / sysKW;
    capScore = ratio >= 2 ? 95 : ratio >= 1.2 ? 78 : ratio >= 1 ? 60 : ratio >= 0.6 ? 38 : 18;
    capDetail = Math.round(D.hostingCapacityKW).toLocaleString() + ' kW feeder headroom vs ' + Math.round(sysKW).toLocaleString() + ' kW system';
    capReal = true; capSource = 'data';
  } else if (D.gridAtlas && D.gridAtlas.nearestSubstationKm != null) {
    var km = +D.gridAtlas.nearestSubstationKm, kv = D.gridAtlas.nearestSubstationKv;
    capScore = km <= 0.8 ? 92 : km <= 2 ? 80 : km <= 5 ? 62 : km <= 10 ? 44 : km <= 20 ? 30 : 20;
    capDetail = 'Nearest substation ' + km.toFixed(1) + ' km' + (kv ? ' at ' + kv + ' kV' : '') + (D.gridAtlas.nearestSubstationName ? ' (' + D.gridAtlas.nearestSubstationName + ')' : '') + ' — Grid Atlas. Proximity, not available headroom.';
    capReal = true; capSource = 'proxy';
  } else {
    capScore = sysKW <= 0 ? 55 : sysKW < 250 ? 82 : sysKW < 1000 ? 68 : sysKW < 5000 ? 50 : 34;
    capDetail = sysKW > 0 ? ('~' + Math.round(sysKW).toLocaleString() + ' kW · fast-track likelihood (est.)') : 'Configure BESS for capacity read';
  }
  factors.push({ key: 'capacity', label: 'Grid Capacity', score: Math.round(capScore), detail: capDetail, real: capReal, source: capSource, weight: 0.24 });

  var permScore, permDetail, permReal = false;
  if (D.ahjPermitDays != null) { permScore = D.ahjPermitDays <= 30 ? 92 : D.ahjPermitDays <= 60 ? 74 : D.ahjPermitDays <= 120 ? 50 : 28; permDetail = (D.ahjName || 'AHJ') + ' · ~' + D.ahjPermitDays + ' day permit turnaround'; permReal = true; }
  else { permScore = 60; permDetail = (D.ahjName ? D.ahjName + ' · ' : '') + 'Permit timeline not yet on file (est. neutral)'; }
  factors.push({ key: 'permit', label: 'Permitting (AHJ)', score: Math.round(permScore), detail: permDetail, real: permReal, source: permReal ? 'data' : 'estimate', weight: 0.20 });

  var qScore, qDetail, qReal = false;
  if (D.iqQueueMonths != null) { qScore = D.iqQueueMonths <= 6 ? 90 : D.iqQueueMonths <= 12 ? 70 : D.iqQueueMonths <= 24 ? 45 : 25; qDetail = '~' + D.iqQueueMonths + ' mo study queue · ' + isoInfo.iso; qReal = true; }
  else { qScore = isoInfo.score; qDetail = isoInfo.iso + ' interconnection process (ISO-level est.)'; }
  factors.push({ key: 'queue', label: 'IX Queue / Tariff', score: Math.round(qScore), detail: qDetail, real: qReal, source: qReal ? 'data' : 'estimate', weight: 0.16 });

  var landScore, landDetail, landReal = false;
  if (D.parcelAcres != null) {
    var parcelFt2 = D.parcelAcres * 43560, fit = footprintFt2 > 0 ? parcelFt2 / footprintFt2 : 99;
    landScore = fit >= 8 ? 92 : fit >= 4 ? 76 : fit >= 2 ? 58 : fit >= 1 ? 36 : 16;
    landDetail = D.parcelAcres + ' ac parcel' + (D.parcelZoning ? (' · ' + D.parcelZoning) : '') + ' vs ~' + Math.round(footprintFt2).toLocaleString() + ' ft² footprint';
    landReal = true;
  } else { landScore = 65; landDetail = footprintFt2 > 0 ? ('~' + Math.round(footprintFt2).toLocaleString() + ' ft² equipment footprint (parcel data pending)') : 'Parcel data pending'; }
  factors.push({ key: 'land', label: 'Land / Parcel Fit', score: Math.round(landScore), detail: landDetail, real: landReal, source: landReal ? 'data' : 'estimate', weight: 0.12 });

  var total = 0, wsum = 0; factors.forEach(function (f) { total += f.score * f.weight; wsum += f.weight; });
  var pct = wsum > 0 ? total / wsum : 0, stars = Math.round((pct / 100 * 5) * 10) / 10, anyReal = factors.some(function (f) { return f.real; });
  var dataWeight = 0, proxyWeight = 0; factors.forEach(function (f) { if (f.source === 'data') dataWeight += f.weight; else if (f.source === 'proxy') proxyWeight += f.weight; });
  var evidencePct = Math.round((dataWeight + proxyWeight * 0.45) * 100);
  /* the factors as the panel prints them: score, label, detail and provenance; never the weight */
  var out = factors.map(function (f) { return { key: f.key, label: f.label, score: f.score, detail: f.detail, real: f.real, source: f.source }; });
  return { score: stars, pct: Math.round(pct), factors: out, zip: zip, state: state, iso: isoInfo.iso, utility: util ? util.name : '', utilityEstimated: utilEst,
    anyReal: anyReal, sysKW: sysKW, evidencePct: evidencePct, dataWeight: Math.round(dataWeight * 100) / 100, proxyWeight: Math.round(proxyWeight * 100) / 100 };
}

/* ── the Viability Workflow's judgment ─────────────────────────────── */
var MUST = ['ck_address', 'ck_utility', 'ck_site_control', 'ck_zoning_cert', 'ck_title', 'ck_bills', 'ck_clearance', 'ck_fire_access', 'ck_comed_moratorium'];
var SHOULD = ['ck_rate_class', 'ck_oneline', 'ck_site_photos', 'ck_gas_clear', 'ck_julie', 'ck_floodplain', 'ck_comed_filed', 'ck_ul9540', 'ck_ul9540a', 'ck_suppression', 'ck_dpd_inquiry'];
var TARGET_UTILS = ['comed', 'ameren', 'pge', 'sce', 'sdge', 'ladwp', 'other'];
var KILLERS = ['ord_zoning_notlisted', 'ord_aldermanic', 'ord_moratorium'];
var BLOCKERS = ['ord_fire_code_interim', 'ord_accessory_use', 'ord_chicago_elec', 'ord_express_permit_cap', 'ord_gas_meter', 'ord_deed_title', 'ord_comed_ic'];
var REV_FIELDS = ['p6_demand', 'p6_vpp', 'p6_capacity', 'p6_freq_reg', 'p6_arbitrage', 'p6_ev_demand', 'p6_host_lease', 'p6_solar', 'p6_resiliency'];
function irr(flows) {
  var npvAt = function (rr) { var t = 0; for (var i = 0; i < flows.length; i++) t += flows[i] / Math.pow(1 + rr, i); return t; };
  var lo = -0.95, hi = 10, fl = npvAt(lo), fh = npvAt(hi);
  /* a bracketed root only: a series with no sign change (or no money at
     all) has no IRR, and reads undefined rather than the bracket's edge */
  if (!flows.some(function (f) { return f !== 0; }) || !(fl * fh < 0)) return null;
  for (var i2 = 0; i2 < 200; i2++) { var mid = (lo + hi) / 2, fm = npvAt(mid); if (fl * fm < 0) hi = mid; else { lo = mid; fl = fm; } }
  return (lo + hi) / 2;
}
function viability(body) {
  body = body || {};
  var d = body.data || {}, ftm = !!body.ftm, txTsps = Array.isArray(body.txTsps) ? body.txTsps : [], scores = body.scores || {};
  var gv = function (k) { return d[k] == null ? '' : String(d[k]); }, g = function (k) { var x = parseFloat(gv(k)); return isFinite(x) ? x : 0; };
  /* Phase 1: the site score */
  var mustDone = MUST.filter(function (k) { return gv(k) === '1' || gv(k) === 'na'; }).length, shouldDone = SHOULD.filter(function (k) { return gv(k) === '1' || gv(k) === 'na'; }).length;
  var mustPct = Math.round(mustDone / MUST.length * 100), shouldPct = Math.round(shouldDone / SHOULD.length * 100);
  var SPACE = g('p0_avail_area'), PEAK = g('p0_peak_kw'), BILL = g('p0_avg_bill'), CLR = g('p0_bldg_clearance'), CTRL = gv('p0_site_control'), UTIL = gv('p0_utility'), FLOOD = gv('p0_flood') === '1';
  var POIMW = g('p4_export_mw'), GTIE = g('p4_gentie_mi');
  var loadFactors = ftm ? [
    { cat: 'Grid', l: 'POI export capacity', pts: POIMW >= 100 ? 25 : POIMW >= 20 ? 18 : POIMW > 0 ? 10 : 0, max: 25, ok: POIMW >= 20, detail: POIMW ? POIMW + ' MW export limit' : 'Not entered' },
    { cat: 'Grid', l: 'Gen-tie distance', pts: (GTIE > 0 && GTIE <= 1) ? 15 : (GTIE > 1 && GTIE <= 3) ? 11 : (GTIE > 3 && GTIE <= 8) ? 6 : GTIE > 8 ? 2 : 0, max: 15, ok: (GTIE > 0 && GTIE <= 3), detail: GTIE ? GTIE + ' mi to POI' : 'Not entered' }
  ] : [
    { cat: 'Load', l: 'Peak demand', pts: PEAK >= 200 ? 25 : PEAK >= 100 ? 18 : PEAK >= 50 ? 10 : 0, max: 25, ok: PEAK >= 100, detail: PEAK ? PEAK + ' kW' : 'Not entered' },
    { cat: 'Fin', l: 'Monthly bill size', pts: BILL >= 10000 ? 15 : BILL >= 5000 ? 10 : BILL > 0 ? 5 : 0, max: 15, ok: BILL >= 5000, detail: BILL ? '$' + BILL + '/mo' : 'Not entered' }
  ];
  var factors = [{ cat: 'Site', l: 'Available space', pts: SPACE >= 500 ? 25 : SPACE >= 300 ? 18 : SPACE >= 100 ? 10 : 0, max: 25, ok: SPACE >= 300, detail: SPACE ? SPACE + ' sq ft' : 'Not entered' }]
    .concat(loadFactors).concat([
      { cat: 'Site', l: 'Building clearance', pts: CLR >= 15 ? 15 : CLR >= 10 ? 12 : CLR > 0 ? 5 : 0, max: 15, ok: CLR >= 10, detail: CLR ? CLR + ' ft' : 'Not entered' },
      { cat: 'Legal', l: 'Site control', pts: CTRL === 'owned' || CTRL === 'long_lease' ? 20 : CTRL === 'loi' ? 10 : 0, max: 20, ok: CTRL === 'owned' || CTRL === 'long_lease', detail: CTRL ? CTRL.replace('_', ' ') : 'Not entered' }
    ]);
  var DQ = [];
  if (ftm) { if (!gv('p4_tsp')) DQ.push('Transmission/distribution service provider (TSP) not identified'); if (!gv('p4_poi')) DQ.push('Point of interconnection not identified'); }
  else if (!UTIL) DQ.push('Utility territory not confirmed');
  if (UTIL && TARGET_UTILS.concat(txTsps).indexOf(UTIL) < 0) DQ.push('Utility territory not in target market');
  if (FLOOD) DQ.push('FEMA floodplain risk flagged');
  if (SPACE > 0 && SPACE < 100) DQ.push('Available area <100 sq ft (too small)');
  if (CLR > 0 && CLR < 10) DQ.push('Building clearance <10 ft (NFPA minimum)');
  if (gv('ck_comed_moratorium') === '1' && gv('ord_moratorium') === '1') DQ.push('ComEd feeder moratorium confirmed');
  var ordKills = KILLERS.filter(function (k) { return gv(k) === '1'; }).length, ordBlocks = BLOCKERS.filter(function (k) { return gv(k) === '1'; }).length;
  var ordPenalty = Math.min(60, ordKills * 30) + Math.min(30, ordBlocks * 10);
  var rawScore = factors.reduce(function (t, f) { return t + f.pts; }, 0), finalScore = Math.max(0, rawScore - ordPenalty), hasKiller = DQ.length > 0 || ordKills > 0;
  var verdict, desc;
  if (hasKiller) { verdict = 'FAIL'; desc = 'Hard disqualifier present. Do not commit engineering resources.'; }
  else if (finalScore >= 75 && mustPct >= 80) { verdict = 'PASS'; desc = 'Site is a viable BESS candidate. Proceed to engineering feasibility.'; }
  else if (finalScore >= 50 && mustPct >= 50) { verdict = 'CONDITIONAL'; desc = 'Viable with conditions. Address gaps below before committing capital.'; }
  else { verdict = 'FAIL'; desc = 'Score too low or intake incomplete. Fill in site data to reassess.'; }
  var p1 = { factors: factors, dq: DQ, ordKills: ordKills, ordBlocks: ordBlocks, ordPenalty: ordPenalty, rawScore: rawScore, finalScore: finalScore,
    mustDone: mustDone, mustN: MUST.length, shouldDone: shouldDone, shouldN: SHOULD.length, mustPct: mustPct, shouldPct: shouldPct, verdict: verdict, desc: desc };
  /* Phase 2: the two paths */
  var btm = 0; if (PEAK >= 100) btm += 30; if (gv('p2_offset_load') === 'Yes') btm += 20; if (gv('p0_ev') === '1') btm += 15; if (gv('p2_rebate') === 'Yes') btm += 15; if (gv('p2_resiliency') === 'Yes') btm += 10; if (gv('p2_host_owner') === 'Yes') btm += 10;
  var ftmS = 0; if (gv('p2_export') === 'Yes') ftmS += 30; if (gv('p2_new_meter') === 'Yes') ftmS += 20; if (gv('p2_wholesale') === 'Yes') ftmS += 25; if (SPACE >= 2000) ftmS += 15; if (gv('p2_vpp') === 'Yes') ftmS += 10;
  btm = Math.min(100, btm); ftmS = Math.min(100, ftmS);
  /* Phase 6 and 7: the revenue stack and the investment gate */
  var rev = REV_FIELDS.reduce(function (t, k) { return t + g(k); }, 0);
  var hw = g('p7_bess') + g('p7_pcs') + g('p7_xfmr') + g('p7_switchgear') + g('p7_meter') + g('p7_ems');
  var cv = g('p7_civil') + g('p7_pad') + g('p7_trench') + g('p7_conduit') + g('p7_bollards') + g('p7_fire');
  var sf = g('p7_eng') + g('p7_permit') + g('p7_ic_fee') + g('p7_util_upgrade') + g('p7_labor') + g('p7_commissioning') + g('p7_networking') + g('p7_dev_fee');
  var sub = hw + cv + sf, cont = sub * ((g('p7_contingency') || 10) / 100), gross = sub + cont;
  var rebate = g('p7_rebate'), itc = gross * ((g('p7_itc_pct') || 0) / 100), otherInc = g('p7_other_inc'), net = gross - rebate - itc - otherInc;
  var opex = g('p7_om') + g('p7_insurance') + g('p7_warranty'), netAnn = rev - opex, pb = netAnn > 0 ? net / netAnn : 999;
  var disc = (g('p7_discount') || 8) / 100, life = g('p7_life') || 20, npv = -net; for (var y = 1; y <= life; y++) npv += netAnn / Math.pow(1 + disc, y);
  var flows = [-net]; for (var y2 = 1; y2 <= life; y2++) flows.push(netAnn);
  var r = irr(flows), finDec = 'pending';
  if (net > 0 && rev > 0) { if (pb <= 7 && npv > 0) finDec = 'invest'; else if (pb <= 12 && npv > -net * 0.2) finDec = 'hold'; else if (pb <= 18) finDec = 'redesign'; else finDec = 'reject'; }
  var fin = { gross: gross, net: net, netAnn: netAnn, pb: pb, npv: npv, irr: r, rev: rev, opex: opex, itc: itc, rebate: rebate, disc: disc, life: life, decision: finDec, entered: net > 0 && rev > 0 };
  /* the overall decision from the gates and the investment verdict */
  var vals = Object.keys(scores).map(function (k) { return scores[k]; }), fails = vals.filter(function (v) { return v === 'fail' || v === 'reject'; }).length, pend = vals.filter(function (v) { return v === 'pending'; }).length;
  var dec = 'pending', sub2 = 'Complete all phases.';
  if (fails >= 2) { dec = 'reject'; sub2 = 'Multiple blocking issues.'; }
  else if (fails === 1) { dec = 'redesign'; sub2 = 'Address blocking constraint.'; }
  else if (finDec === 'invest' && pend === 0) { dec = 'invest'; sub2 = 'All gates passed. Execute.'; }
  else if (finDec === 'hold' || pend > 0) { dec = 'hold'; sub2 = 'Awaiting confirmations.'; }
  else if (finDec === 'redesign') { dec = 'redesign'; sub2 = 'Adjust economics or scope.'; }
  else if (finDec === 'reject') { dec = 'reject'; sub2 = 'Economics do not support.'; }
  return { p1: p1, btm: btm, ftm: ftmS, rev: rev, fin: fin, decision: { dec: dec, sub: sub2 } };
}

module.exports = { prequal: prequal, interconnect: interconnect, viability: viability, isoForState: isoForState, pqSystems: pqSystems, irr: irr,
  _tables: { PQ_BENCH: PQ_BENCH, ISO_SCORE: ISO_SCORE } };
