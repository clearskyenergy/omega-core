/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The design report. Every number is one the engine just computed.
 * The text is what the Site Plan shows and what a PDF can print later.
 */
'use strict';

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function n(v, d) {
  if (v == null || !isFinite(+v)) return '—';
  return (+v).toFixed(d == null ? 0 : d);
}

function lines(rep) {
  var s = rep.summary || {};
  var out = [];
  out.push('Solar design report');
  out.push(s.name || 'Untitled site');
  out.push('');
  out.push('System');
  out.push(s.mountLabel + ' · ' + n(s.kwDc, 1) + ' kW-DC · ' + n(s.kwAc, 1) + ' kW-AC · DC/AC ' + n(s.dcAc, 2));
  out.push(s.modules + ' modules · ' + s.moduleName + ' · ' + s.inverters + ' × ' + s.inverterName);
  out.push('Tilt ' + n(s.tilt, 0) + '° · azimuth ' + n(s.azimuth, 0) + '° · GCR ' + n(s.gcr, 3) + ' · row pitch ' + n(s.pitchFt, 1) + ' ft');
  out.push('Setback ' + n(s.setbackFt, 1) + ' ft' + (s.firePathFt ? (' · fire path ' + n(s.firePathFt, 0) + ' ft') : ''));
  out.push('');
  out.push('Energy');
  out.push('Year-1 AC ' + n(s.acKwh, 0) + ' kWh · ' + n(s.specificYield, 0) + ' kWh/kW-DC');
  out.push('P50 ' + n(s.p50, 0) + ' kWh · P90 ' + n(s.p90, 0) + ' kWh · P95 ' + n(s.p95, 0) + ' · P99 ' + n(s.p99, 0));
  out.push(s.weather || '');
  out.push('');
  out.push('Loss tree');
  var i, step, row;
  for (i = 0; i < (rep.lossTree || []).length; i++) {
    step = rep.lossTree[i];
    out.push(step.name + '  ' + n(step.kwh, 0) + ' kWh' + (step.removedKwh ? ('  (removed ' + n(step.removedKwh, 0) + ')') : ''));
  }
  out.push('');
  out.push('Monthly AC, kWh');
  for (i = 0; i < (rep.monthly || []).length; i++) {
    row = rep.monthly[i];
    out.push(MONTHS[row.month - 1] + '  ' + n(row.acKwh, 0));
  }
  out.push('');
  out.push('Shading');
  out.push('Array beam shade ' + n(rep.shading && rep.shading.annualPct, 1) + '%');
  out.push((rep.shading && rep.shading.near) || '');
  out.push((rep.shading && rep.shading.horizon) || '');
  var shown = (rep.shading && rep.shading.rows) || [];
  for (i = 0; i < shown.length && i < 12; i++) {
    out.push('Row ' + (shown[i].index + 1) + '  ' + n(shown[i].shadePct, 1) + '%');
  }
  if (shown.length > 12) out.push('… ' + shown.length + ' rows');
  out.push('');
  out.push('Bill of materials');
  for (i = 0; i < (rep.bom || []).length; i++) {
    out.push(rep.bom[i].qty + '  ' + rep.bom[i].item + (rep.bom[i].note ? ('  ' + rep.bom[i].note) : ''));
  }
  out.push('');
  out.push('Wiring');
  out.push((rep.wiring && rep.wiring.oneLine) || '');
  if (rep.wiring && rep.wiring.limits) {
    out.push('Cold Voc ' + n(rep.wiring.limits.vocCold, 2) + ' V at ' + n(rep.wiring.limits.tMin, 1) + '°C · string length ' +
      rep.wiring.limits.nMin + '–' + rep.wiring.limits.nMax + ' · used ' + rep.wiring.modulesPerString);
  }
  if (rep.wiring && rep.wiring.string) {
    out.push('String ' + rep.wiring.string.conductor.awg + ' Cu, ' + n(rep.wiring.string.conductor.dropPct, 2) + '% drop over ' + rep.wiring.string.ft + ' ft');
  }
  if (rep.wiring && rep.wiring.homeRun) {
    out.push('Home run ' + rep.wiring.homeRun.conductor.awg + ' Cu, ' + n(rep.wiring.homeRun.conductor.dropPct, 2) + '% drop over ' + rep.wiring.homeRun.ft + ' ft');
  }
  out.push('');
  out.push('Price');
  out.push(rep.pricing ? (rep.pricing.summary || '') : '');
  out.push('');
  out.push('Assumptions');
  for (i = 0; i < (rep.assumptions || []).length; i++) out.push('• ' + rep.assumptions[i]);
  return out;
}

function text(rep) {
  return lines(rep).join('\n');
}

module.exports = { lines: lines, text: text, MONTHS: MONTHS, VERSION: 'solar-report/1' };
