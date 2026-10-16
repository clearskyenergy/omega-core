/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/site-agreement.js — the Site SPV term sheet, one per site, DRAFT
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A portfolio site is financed one SPV at a time: the investor funds the
   pods at that site, the SPV's cash pays the investor back first, and the
   host is paid its rent or share. This composes the term sheet for that
   SPV from what the workspace has RECORDED — the site facts, the host's
   commercial terms and the latest pro forma scenario — and renders it as a
   PDF with pdf-lib (self-hosted under vendor/, the same copy the Helios
   intake fills).

   Rules, as the pro forma's and the Helios intake's:
   - Read, never invent. A fact the workspace does not hold prints
     "Not provided"; capital and returns come only from a stored scenario,
     and a site with no scenario says so in the term sheet instead of
     naming a number.
   - It is a DRAFT for review, never an offer: every page says so, the
     assumption set that produced the figures is named, and the flags the
     site carries (meter unknown, term missing, peak unresolved) are printed
     as conditions, not hidden.
   - Pure: compose() takes records and returns the sheet as data (what the
     test asserts); render() turns that into bytes. No Firestore here.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var H = require('./helios-intake');

var NOT_PROVIDED = 'Not provided';
var MONTHS = 60;

function has(v) { return v !== undefined && v !== null && v !== ''; }
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
function money(v) { var n = num(v); return n == null ? NOT_PROVIDED : (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }
function pct(v, d) { var n = num(v); return n == null ? NOT_PROVIDED : (n * 100).toFixed(d == null ? 2 : d) + '%'; }
function kw(v) { var n = num(v); return n == null ? NOT_PROVIDED : n.toLocaleString('en-US') + ' kW'; }
function text(v) { return has(v) ? String(v) : NOT_PROVIDED; }
function dateOf(iso) { var d = iso ? new Date(iso) : null; return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ''; }
function irr(r) { return r && r.defined ? pct(r.annual) : r ? 'Not defined (no IRR root)' : NOT_PROVIDED; }
function fileSafe(s) { return String(s || 'site').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'site'; }

/* Available power for new load, as the pro forma derives it (entered MW,
   else service minus existing peak), with the basis named. */
function availability(site) {
  var mw = num(site.availablePowerMw);
  if (mw != null && mw > 0) return { kw: mw * 1000, basis: 'as entered' };
  var svc = num(site.serviceCapacityKw), peak = num(site.existingPeakKw);
  if (svc != null && peak != null) return { kw: Math.max(0, svc - peak), basis: 'service capacity minus existing peak, derived' };
  return { kw: null, basis: null };
}

/* compose({ site, scenario, org, workspaceName, by, now }) → the sheet
   as data: title, fileName, meta, sections [{ heading, rows [[label,
   value]] | paras [text] }], conditions [], ready (a scenario is on file). */
function compose(input) {
  input = input || {};
  var site = input.site || {}, sc = input.scenario || null, r = sc && sc.results || null, a = sc && sc.inputs || {};
  var org = input.workspaceName || input.org || 'the workspace';
  var now = input.now || new Date().toISOString(), today = dateOf(now);
  var loc = [site.city, site.state].filter(Boolean).join(', ');
  var avail = availability(site), cm = site.commercial || {}, flags = site.flags || {};
  var conditions = [
    'Utility confirmation of the service capacity available to the SPV at the point of interconnection.',
    'Fiber service to the site confirmed by the carrier (the compute use depends on it).',
    'Site control for the full term of the SPV: lease or license in place for at least ' + (MONTHS / 12) + ' years.',
    'Zoning and permitting for the equipment as drawn.'
  ];
  if (site.meterOwned == null) conditions.push('Meter ownership at the site is unknown on the record and must be verified before close.');
  if (site.meterOwned === false) conditions.push('The host does not own the meter: a separate meter or a utility agreement is required.');
  if (!has(site.termYearsRemaining)) conditions.push('The remaining term of the host agreement is not on the record and must be provided.');
  else if (num(site.termYearsRemaining) < MONTHS / 12) conditions.push('The remaining term on the record (' + site.termYearsRemaining + ' years) is shorter than the SPV term; an extension is required.');
  if (site.peakUnresolved || flags.peakExceedsInstalled) conditions.push('The reported peak kW is an unresolved workbook statistic and is not relied on; the utility figure governs.');
  if (!sc) conditions.push('No pro forma scenario is on file for this site: the capital, term and returns above are blank until one is run and reviewed.');

  var sections = [];
  sections.push({ heading: '1. Parties', rows: [
    ['Sponsor', org],
    ['Site SPV', (site.name || 'Site') + ' SPV (to be formed; name, state and form to be confirmed by counsel)'],
    ['Investor', '______________________________ (to be named)'],
    ['Host / site owner', text(input.hostName)]
  ] });
  sections.push({ heading: '2. The site', rows: [
    ['Site', text(site.name)],
    ['Location', has(loc) ? loc : NOT_PROVIDED],
    ['Address', text(typeof site.address === 'string' ? site.address : (site.address && site.address.street) || null)],
    ['Installed chargers', has(site.installedKw) ? kw(site.installedKw) + ' nameplate (not approved capacity)' : NOT_PROVIDED],
    ['Reported peak', has(site.reportedPeakKw) ? kw(site.reportedPeakKw) + (site.peakUnresolved ? ' (unresolved workbook statistic)' : '') : NOT_PROVIDED],
    ['Meter', site.meterOwned === true ? 'Owned by the host' : site.meterOwned === false ? 'Not owned by the host' : 'Unknown (needs verification)'],
    ['Remaining host term', has(site.termYearsRemaining) ? site.termYearsRemaining + ' years (snapshot)' : NOT_PROVIDED],
    ['Service capacity', has(site.serviceCapacityKw) ? kw(site.serviceCapacityKw) : NOT_PROVIDED],
    ['Existing peak', has(site.existingPeakKw) ? kw(site.existingPeakKw) : NOT_PROVIDED],
    ['Available for new load', avail.kw == null ? NOT_PROVIDED : kw(avail.kw) + ' (' + avail.basis + ')'],
    ['Power price', has(site.powerPricePerKwh) ? '$' + site.powerPricePerKwh + '/kWh' : NOT_PROVIDED],
    ['Annual usage', has(site.annualUsageKwh) ? Number(site.annualUsageKwh).toLocaleString('en-US') + ' kWh' : NOT_PROVIDED]
  ] });
  var proj = sc ? [
    ['Scenario', (a.label || sc.scenarioId || '') + (sc.createdAt ? ' · ' + dateOf(sc.createdAt) : '')],
    ['Assumption set', text(sc.assumptionVersion)],
    ['Pods', r.pods != null ? String(r.pods) : NOT_PROVIDED],
    ['IT load', kw(r.itKw)],
    ['Facility power', kw(r.facilityKw)],
    ['Investor capital', money(r.investorCapital)],
    ['Investor IRR (annualised)', irr(r.investorIrr)],
    ['Project IRR (annualised)', irr(r.projectIrr)],
    ['NPV to the investor', money(r.npv) + (r.discountRateAnnual != null ? ' at ' + pct(r.discountRateAnnual, 0) : '')],
    ['Capital recovered', r.paybackMonth != null ? 'month ' + r.paybackMonth : 'Not within the term'],
    ['Year 1 revenue', money(r.year1Revenue)],
    ['Revenue over the term', money(r.totalRevenue) + ' over ' + (r.months || MONTHS) + ' months']
  ] : [
    ['Scenario', 'None on file'],
    ['Investor capital', NOT_PROVIDED], ['Investor IRR (annualised)', NOT_PROVIDED], ['Project IRR (annualised)', NOT_PROVIDED]
  ];
  sections.push({ heading: '3. The project (from the pro forma on file)', rows: proj,
    paras: [sc ? 'Screening results under the named assumption set, pre-tax, with no exit value. Not a return promise.' : 'Run a pro forma on the site\'s Pro forma tab; the term sheet then carries its capital and returns.'] });
  sections.push({ heading: '4. Capital and distributions', paras: [
    'The investor contributes the investor capital at close (month 0), funding the pods, the battery and the opening liquidity of the SPV.',
    'Distributable cash of the SPV is paid 100% to the investor until the investor capital is recovered.',
    'After recovery, distributable cash is shared ' + (sc && has(a.overrides && a.overrides.investorResidualShare) ? pct(a.overrides.investorResidualShare, 0) : '80%') + ' to the investor and the balance to the sponsor, for the remainder of the ' + (r && r.months || MONTHS) + '-month term.',
    'The sponsor\'s power spread (the margin between the SPV\'s power price and its utility cost) is the sponsor\'s and is never mixed into investor distributions.'
  ] });
  /* THE HOST LEASE AND THE COMPUTE TERMS (2026-10-16, Tommy: "a contract
     term agreement that they can print out agreeing to that lease payment
     and those terms for the compute"). Read off the site record and the
     compute model on file, never invented: the rent is kW of compute ×
     $/kW-month × 12 (the record's rate or monthly rent; the rate card's
     floor is named as the floor, never written as an agreed figure), the
     escalator and the revenue share as recorded, the term the model ran,
     the compute price basis the model priced, the PPA the host's solar is
     sold under, and the skid's own end-of-term terms. */
  var lm = site.latestModel || null, OC = require('./omega-core'), RC = OC.RATE_CARD, TM = OC.TERMS;
  var skids = lm && lm.skid ? lm.skid.units : (site.latestDesign && site.latestDesign.compute ? num(site.latestDesign.compute.omegaCoreUnits) : null);
  var computeKw = skids ? skids * RC.computeKwPerSkid : null;
  var rate = num(cm.rentPerKwMonth), rentMo = num(cm.rentMonthly), esc = has(cm.rentEscalatorPct) ? num(cm.rentEscalatorPct) : null, share = num(cm.revenueShare);
  var termYears = lm && lm.termYears ? lm.termYears : 10;
  var rentRow, rentBasis;
  if (rentMo != null && rentMo > 0) { rentRow = money(rentMo) + ' per month (' + money(rentMo * 12) + ' a year)' + (computeKw ? ', ' + money(rentMo / computeKw) + ' per kW of compute a month on ' + computeKw + ' kW' : ''); rentBasis = 'as recorded for the site'; }
  else if (rate != null && rate > 0 && computeKw) { rentRow = money(rate) + ' per kW of compute per month x ' + computeKw + ' kW x 12 = ' + money(rate * computeKw * 12) + ' a year (' + money(rate * computeKw) + ' a month)'; rentBasis = 'the rate recorded for the site'; }
  else if (rate != null && rate > 0) { rentRow = money(rate) + ' per kW of compute per month (kW to be set by the design)'; rentBasis = 'the rate recorded for the site'; }
  else { rentRow = 'To be agreed: ClearSky quotes ' + money(RC.perKwMonth.low) + '-' + money(RC.perKwMonth.high) + ' per kW of compute per month' + (computeKw ? ' (' + money(RC.perKwMonth.low * computeKw * 12) + '-' + money(RC.perKwMonth.high * computeKw * 12) + ' a year on ' + computeKw + ' kW)' : ''); rentBasis = 'no rent on the record; the model opens at the floor and nothing here is agreed'; }
  var ppaRows = [];
  if (has(site.ppaRatePerKwh) || (Array.isArray(site.ppaPriceSchedule) && site.ppaPriceSchedule.length)) {
    var S = Array.isArray(site.ppaPriceSchedule) ? site.ppaPriceSchedule : [];
    ppaRows.push(['Microgrid PPA (host\'s solar + storage)', S.length ? 'The executed PPA\'s own price table: $' + S[0] + '/kWh in year 1 to $' + S[S.length - 1] + '/kWh in year ' + S.length : '$' + site.ppaRatePerKwh + '/kWh in year 1' + (has(site.ppaEscalatorPct) ? ', escalating ' + site.ppaEscalatorPct + '% a year' : ', escalator not on record')]);
    ppaRows.push(['Microgrid PPA term', has(site.ppaTermYears) ? site.ppaTermYears + ' years from commercial operation' : (S.length ? S.length + ' years (the table)' : NOT_PROVIDED)]);
    if (has(site.ppaYear1Kwh)) ppaRows.push(['Expected first-year production', Number(site.ppaYear1Kwh).toLocaleString('en-US') + ' kWh (the contract)']);
  } else ppaRows.push(['Microgrid PPA (host\'s solar + storage)', 'None on the record']);
  var computeRows = [
    ['Compute installed', computeKw ? skids + ' Omega-Core skid' + (skids === 1 ? '' : 's') + ', ' + computeKw + ' kW of compute (' + RC.computeKwPerSkid + ' kW a skid), on its own utility service and meter' : NOT_PROVIDED],
    ['Term', termYears + ' years from the skid\'s commercial operation (minimum ' + TM.minTermYears + ', maximum ' + TM.maxTermYears + ')'],
    ['Rent to the host', rentRow],
    ['Rent basis', rentBasis],
    ['Rent escalator', esc != null ? esc + '% a year, compounding' : (rentMo != null || rate != null ? RC.escalatorPct.base + '% a year, compounding (the standard; none recorded)' : 'To be agreed')],
    ['Revenue share to the host', share != null && share > 0 ? pct(share <= 1 ? share : share / 100, 1) + ' of gross compute revenue, paid with the rent' : 'None'],
    ['Compute price basis', lm && lm.skid ? '$' + Number(lm.skid.pricePerGpuHour).toFixed(2) + ' per GPU-hour' + (lm.skid.priceBasis === 'contracted' ? ', the contracted rate on the record' : ' (public ' + lm.skid.priceBasis + ' reference; a contracted rate replaces it)') + ', for ' + lm.skid.gpus + ' x ' + (lm.skid.chipsetName || lm.skid.chipset) + ' a skid, as the model on file priced it' : NOT_PROVIDED],
    ['Whole project on file', lm && lm.totalProjectCost != null ? money(lm.totalProjectCost) + ' total project cost, after-tax IRR ' + (lm.irr == null ? 'n/a' : pct(lm.irr)) + ' over ' + termYears + ' years' + (lm.irrExTerminal != null ? ' (' + pct(lm.irrExTerminal) + ' on the ' + termYears + ' years alone)' : '') : 'No compute model on file']
  ].concat(ppaRows);
  sections.push({ heading: '5. Host lease and compute terms', rows: computeRows, paras: [
    TM.ownership + ' ' + TM.meter,
    'Rent is paid monthly in advance from the skid\'s commercial operation date, escalating on each anniversary as stated. The host grants the pad, the utility service route and the fiber path for the term and keeps the premises accessible for operation and maintenance.',
    TM.remove + ' ' + TM.buyout + ' ' + TM.renewal,
    'The host\'s solar and storage are sold under the microgrid PPA as recorded above; nothing in this sheet changes that agreement.',
    'A term marked "To be agreed" is open; a figure quoted as a band is ClearSky\'s quoted range and is not an offer until written in.'
  ] });
  sections.push({ heading: '6. Conditions precedent', list: conditions });
  sections.push({ heading: '7. Status', paras: [
    'DRAFT for review. This term sheet is prepared from the workspace\'s records on ' + today + ' and is not an offer, a commitment to invest, or legal advice. Definitive agreements prepared by counsel govern; figures are screening results that change with the assumption set and the site\'s verified facts.'
  ], signatures: ['Sponsor', 'Investor', 'Host'] });
  return {
    title: 'Site SPV and Host Lease Term Sheet — ' + (site.name || 'Site'),
    subtitle: 'DRAFT for review · ' + org + ' · ' + today,
    fileName: 'SPV-term-sheet-' + fileSafe(site.name) + '-' + today + '.pdf',
    meta: { siteId: site.id || null, scenarioId: sc ? sc.scenarioId : null, assumptionVersion: sc ? sc.assumptionVersion : null, at: now, by: input.by || null, org: input.org || null },
    ready: !!sc,
    conditions: conditions,
    sections: sections
  };
}

/* render(sheet) → Promise<Uint8Array>: US Letter, Helvetica, the draft
   mark on every page. Text is transliterated to what the font prints. */
function render(sheet) {
  var PDF = H.pdfLib();
  var W = 612, Hh = 792, M = 54, lineH = 13, body = 9.5, small = 8;
  return PDF.PDFDocument.create().then(function (doc) {
    doc.setTitle(sheet.title); doc.setSubject('Site SPV term sheet, draft');
    return Promise.all([doc.embedFont(PDF.StandardFonts.Helvetica), doc.embedFont(PDF.StandardFonts.HelveticaBold)]).then(function (fonts) {
      var helv = fonts[0], bold = fonts[1], measure = H.measurer(helv), page = null, y = 0, n = 0;
      var ink = PDF.rgb(0.08, 0.09, 0.1), dim = PDF.rgb(0.36, 0.4, 0.45), rule = PDF.rgb(0.86, 0.87, 0.89);
      function t(s) { return H.toWinAnsi(s); }
      function foot() {
        page.drawText(t('DRAFT - not an offer - ' + sheet.subtitle), { x: M, y: 30, size: small, font: helv, color: dim });
        page.drawText(t('Page ' + n), { x: W - M - 40, y: 30, size: small, font: helv, color: dim });
      }
      function newPage() {
        page = doc.addPage([W, Hh]); n++; y = Hh - M; foot();
        page.drawText(t('DRAFT'), { x: W - M - 60, y: Hh - 36, size: 11, font: bold, color: PDF.rgb(0.78, 0.2, 0.15) });
      }
      function need(h) { if (!page || y - h < M + 20) newPage(); }
      function line(s, opts) {
        opts = opts || {}; var f = opts.bold ? bold : helv, size = opts.size || body;
        var lines = H.wrap(t(s), opts.bold ? H.measurer(bold) : measure, size, (W - 2 * M) - (opts.x || 0));
        if (!lines.length) lines = [''];
        lines.forEach(function (l) { need(lineH); page.drawText(l, { x: M + (opts.x || 0), y: y - size, size: size, font: f, color: opts.color || ink }); y -= opts.lh || lineH; });
      }
      function row(label, value) {
        var lw = 150, size = body, vals = H.wrap(t(value), measure, size, W - 2 * M - lw - 8);
        if (!vals.length) vals = [''];
        need(lineH * vals.length + 2);
        page.drawText(t(label), { x: M, y: y - size, size: size, font: helv, color: dim });
        vals.forEach(function (v) { page.drawText(v, { x: M + lw + 8, y: y - size, size: size, font: helv, color: ink }); y -= lineH; });
        y -= 2;
      }
      newPage();
      line(sheet.title, { bold: true, size: 16, lh: 22 });
      line(sheet.subtitle, { color: dim, size: 10, lh: 16 });
      if (sheet.meta.siteId) line('Site record ' + sheet.meta.siteId + (sheet.meta.scenarioId ? ' · scenario ' + sheet.meta.scenarioId : ''), { color: dim, size: small, lh: 14 });
      y -= 6;
      sheet.sections.forEach(function (s) {
        need(lineH * 3);
        y -= 4; page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 0.6, color: rule }); y -= 10;
        line(s.heading, { bold: true, size: 11, lh: 17 });
        (s.rows || []).forEach(function (rw) { row(rw[0], rw[1]); });
        (s.list || []).forEach(function (item, i) { line((i + 1) + '. ' + item, { x: 8 }); });
        (s.paras || []).forEach(function (p) { y -= 2; line(p); });
        if (s.signatures) {
          y -= 10;
          s.signatures.forEach(function (who) {
            need(lineH * 3);
            page.drawLine({ start: { x: M, y: y - 14 }, end: { x: M + 220, y: y - 14 }, thickness: 0.6, color: ink });
            page.drawText(t(who + ' - name, title, date'), { x: M, y: y - 26, size: small, font: helv, color: dim });
            y -= 40;
          });
        }
        y -= 4;
      });
      return doc.save();
    });
  });
}

module.exports = { compose: compose, render: render, availability: availability, NOT_PROVIDED: NOT_PROVIDED, MONTHS: MONTHS, fileSafe: fileSafe };
