/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/design-read.js — what a site's Site Map project SAYS,
   read off the project record the editor saves (pure, no Firestore)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Tommy, 2026-10-13: "when the details are made on the site map editor they
   reflect into this system so that the IRR is accurate". The editor keeps
   everything on projects/{id}: the drawing (shapes[], elements[]), the
   battery fleet, and the Run's rollup (capex, incentive, annualRevenue,
   bessKw, bessKwh, capexAt, capexSource — omegaRunRollup in editor.html)
   beside Output › Omega-Core's headline (omegaCore). This reads them the way
   the editor's own totals do (evChargerTotals, derTotals, omegaBessFleet):

     designOf(project, projectId) → null when the project has no drawing and
       no run, else
       { projectId, at, featureCount, hash,
         address, zip,                    the project's address and its ZIP
         capex, netCost, incentive, annualRevenue, capexAt, capexSource,
         contracted,                      the Run's rollup, as saved
         capexLines,                      the Run's lines (solar, bess,
                                          nextnrgSystem, ev, controller,
                                          compute, dc, gen, envelope, site,
                                          indirect, contingency) or null
         compute: { units, kwIt, omegaCoreUnits, omegaCoreKw,
                    omegaCoreBessKw, omegaCoreBessKwh },
         chargers: { dcfcKw, dcfcUnits, l2Kw, l2Units, ports, installedKw,
                     futureUnits, futureKw },
         bess: { kw, kwh, basis },        the Run's fleet, else the pads drawn
         solar: { kwDc, units }, wind: { kw, units },
         omegaCore: { verdict, units, at } | null }

   Rules: read, never invent — a project nobody ran has capex null, not 0;
   a future-flagged charger (the editor's isFuture: evFuture, futureProof,
   or "future" in its label) is counted apart from connected load, as the
   editor does; an Omega-Core skid is compute on its own meter, counted as
   itself and never as the host's battery. The hash is what a sync compares,
   so an unchanged design is never rewritten.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
var BR = require('./site-bridge');

function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function pos(v) { var n = num(v); return n != null && n > 0 ? n : null; }
function r0(v) { return v == null ? null : Math.round(v); }
function isFuture(o) {
  if (!o) return false;
  if (o.evFuture === true || o.futureProof === true) return true;
  var t = String(o.label || o.text || o.note || '');
  return /\bfuture\b|\bfuture[- ]?proof/i.test(t);
}
function iso(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return new Date(v).toISOString();
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v && typeof v._seconds === 'number') return new Date(v._seconds * 1000).toISOString();
  return null;
}

function designOf(p, projectId) {
  p = p || {};
  var shapes = Array.isArray(p.shapes) ? p.shapes : [], elements = Array.isArray(p.elements) ? p.elements : [];
  var ch = { dcfcKw: 0, dcfcUnits: 0, l2Kw: 0, l2Units: 0, ports: 0, futureUnits: 0, futureKw: 0, installedKw: 0 };
  var cp = { units: 0, kwIt: 0, omegaCoreUnits: 0, omegaCoreKw: 0, omegaCoreBessKw: 0, omegaCoreBessKwh: 0 };
  var so = { kwDc: 0, units: 0 }, wd = { kw: 0, units: 0 }, pads = { kw: 0, kwh: 0, units: 0 };
  shapes.forEach(function (s) {
    if (!s || typeof s !== 'object') return;
    var k = s.kind, kw = num(s.kw) || 0;
    if (k === 'evpost' || k === 'evunit' || k === 'evl2') {
      if (isFuture(s)) { ch.futureUnits++; ch.futureKw += kw; return; }
      if (k === 'evl2') { ch.l2Kw += kw; ch.l2Units++; } else { ch.dcfcKw += kw; ch.dcfcUnits++; }
      ch.ports += num(s.ports) || 1;
    } else if (k === 'derdc') {
      if (s.omegaCore) { cp.omegaCoreUnits++; cp.omegaCoreKw += kw; cp.omegaCoreBessKw += num(s.bessKw) || 0; cp.omegaCoreBessKwh += num(s.bessKwh) || 0; }
      cp.units++; cp.kwIt += kw;
    } else if (k === 'dersolar' || k === 'solar') { so.kwDc += kw; so.units++; }
    else if (k === 'derwind') { wd.kw += kw; wd.units++; }
    else if (k === 'bespad' && !s.omegaController) { pads.kw += kw; pads.kwh += num(s.kwh) || 0; pads.units++; }
  });
  elements.forEach(function (e) {
    if (!e || e.type !== 'evgear' || e.evKind !== 'charger') return;
    var n = num(e.units) > 1 ? num(e.units) : 1, kw = num(e.kw) || 0;
    if (isFuture(e)) { ch.futureUnits += n; ch.futureKw += kw * n; return; }
    if (e.evLevel === 'L2') { ch.l2Kw += kw * n; ch.l2Units += n; ch.ports += num(e.ports) || 1; }
    else { ch.dcfcKw += kw; ch.dcfcUnits++; ch.ports += num(e.ports) || 2; }
  });
  ch.installedKw = ch.dcfcKw + ch.l2Kw;
  var capex = pos(p.capex), ran = capex != null;
  /* the run's lines, numbers only, as the editor's omegaRunRollup wrote them (2026-10-14) */
  var LINE_KEYS = ['solar', 'bess', 'nextnrgSystem', 'ev', 'controller', 'compute', 'dc', 'gen', 'envelope', 'site', 'indirect', 'contingency'], lines = null;
  if (ran && p.capexLines && typeof p.capexLines === 'object') {
    lines = {};
    LINE_KEYS.forEach(function (k) { var v = num(p.capexLines[k]); lines[k] = v != null && v > 0 ? Math.round(v) : 0; });
  }
  var bess = pos(p.bessKwh) != null || pos(p.bessKw) != null
    ? { kw: r0(num(p.bessKw) || 0), kwh: r0(num(p.bessKwh) || 0), basis: 'run rollup' }
    : pads.kwh > 0 || pads.kw > 0 ? { kw: r0(pads.kw), kwh: r0(pads.kwh), basis: 'pads drawn' } : { kw: 0, kwh: 0, basis: null };
  var featureCount = shapes.length + elements.length + (Array.isArray(p.conduits) ? p.conduits.length : 0) + (Array.isArray(p.bessList) ? p.bessList.length : 0);
  var oc = p.omegaCore && typeof p.omegaCore === 'object' ? { verdict: p.omegaCore.verdict || null, units: num(p.omegaCore.units), at: iso(p.omegaCore.at) } : null;
  if (!featureCount && !ran && !oc) return null;
  /* the address the editor holds (geocoded, or typed), and the ZIP in it:
     the compute model reads the tariff book and the climate from the ZIP,
     and the site record may carry none (2026-10-13) */
  var addr = typeof p.siteAddr === 'string' && p.siteAddr.trim() ? p.siteAddr.trim() : typeof p.address === 'string' ? p.address.trim() : '';
  var out = {
    projectId: projectId || null, at: iso(p.capexAt) || iso(p.updatedAt) || null, featureCount: featureCount,
    address: addr.slice(0, 200) || null, zip: BR.zipFromAddress(p.zip != null && p.zip !== '' ? { zip: p.zip, street: addr } : addr),
    capex: ran ? r0(capex) : null, netCost: ran ? r0(num(p.netCost)) : null, incentive: ran ? r0(num(p.incentive) || 0) : null,
    annualRevenue: ran ? r0(num(p.annualRevenue)) : null, capexAt: iso(p.capexAt), capexSource: ran ? (p.capexSource || null) : null,
    contracted: p.contracted === true, capexLines: lines,
    compute: { units: cp.units, kwIt: r0(cp.kwIt), omegaCoreUnits: cp.omegaCoreUnits, omegaCoreKw: r0(cp.omegaCoreKw), omegaCoreBessKw: r0(cp.omegaCoreBessKw), omegaCoreBessKwh: r0(cp.omegaCoreBessKwh) },
    chargers: { dcfcKw: r0(ch.dcfcKw), dcfcUnits: ch.dcfcUnits, l2Kw: r0(ch.l2Kw), l2Units: ch.l2Units, ports: ch.ports, installedKw: r0(ch.installedKw), futureUnits: ch.futureUnits, futureKw: r0(ch.futureKw) },
    bess: bess, solar: { kwDc: r0(so.kwDc), units: so.units }, wind: { kw: r0(wd.kw), units: wd.units },
    omegaCore: oc
  };
  out.hash = crypto.createHash('sha256').update(JSON.stringify([out.capex, out.incentive, out.annualRevenue, out.capexAt, out.capexLines, out.compute, out.chargers, out.bess, out.solar, out.wind, out.omegaCore, featureCount, out.zip])).digest('hex').slice(0, 16);
  return out;
}

/* one line, for a note or a basis */
function line(d) {
  if (!d) return '';
  var parts = [];
  if (d.compute.omegaCoreUnits && d.compute.omegaCoreUnits === d.compute.units) parts.push(d.compute.units + ' Omega-Core skid' + (d.compute.units === 1 ? '' : 's') + (d.compute.kwIt ? ' (' + d.compute.kwIt + ' kW of compute)' : ''));
  else if (d.compute.units) parts.push(d.compute.units + ' compute unit' + (d.compute.units === 1 ? '' : 's') + (d.compute.kwIt ? ' (' + d.compute.kwIt + ' kW IT)' : '') + (d.compute.omegaCoreUnits ? ', ' + d.compute.omegaCoreUnits + ' of them Omega-Core skids' : ''));
  if (d.chargers.installedKw) parts.push(d.chargers.installedKw + ' kW of chargers');
  if (d.bess.kwh) parts.push(d.bess.kw + ' kW / ' + d.bess.kwh + ' kWh battery');
  if (d.solar.kwDc) parts.push(d.solar.kwDc + ' kW-dc solar');
  if (d.capex != null) parts.push('cost run $' + d.capex.toLocaleString('en-US') + (d.capexAt ? ' on ' + String(d.capexAt).slice(0, 10) : ''));
  return parts.join(' · ') || 'a drawing with no equipment yet';
}

module.exports = { designOf: designOf, line: line, isFuture: isFuture };
