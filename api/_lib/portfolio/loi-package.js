/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/loi-package.js — ONE letter-of-intent package for the
   offtake partner, for every site the workspace has earmarked
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE and ES5. The diligence's "Send LOI package" (2026-10-25, the offtake
   partner's order: sites, then the LOI): the earmarked sites (stage
   pursue) go to the partner the workspace's config names
   (portfolioDiligence.offtake.partner, a key of api/_lib/partners.js that
   carries loiPackage) in ONE package — the sites, their power, the compute
   each carries (units, chip mix, kW), the control route and its term —
   and each site then moves to LOI sent through the diligence's own rules
   (diligence.js change(): the LOI recorded as sent, then the stage).

   What the package never carries: the workspace's IRR, capex, cost basis or
   price. Those are the workspace's own figures, not the offtaker's to read.
   A figure a site does not have is "not on file", never a default.

   The door (api/site-crm.js) sends it: the partner's address from the
   environment or the deal room's list (partners.recipients), none → 409 and
   nothing mailed; one claimed package id per set and day (packageId), so a
   second press is the same package; the sender in copy; partners.<key> on
   each site, the partner_requests record and an omega_audit row per site.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var D = require('./diligence');

var MAX_SITES = 100, DAILY_CAP = 5;

function fail(status, message) { var e = new Error(message); e.status = status; return e; }
function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
function num(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
function round(n, dp) { if (n == null || !isFinite(n)) return null; var f = Math.pow(10, dp || 0); return Math.round(n * f) / f; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
/* FNV-1a over the sorted site ids and the day: the same set the same day is
   the same package (a second press never mails twice) */
function hash(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
function siteIdOf(s) { return s.siteId || s.id || null; }
function addressOf(s) {
  var a = s.address && typeof s.address === 'object' ? s.address : { street: typeof s.address === 'string' ? s.address : null, city: s.city, state: s.state, zip: s.zip };
  return { street: a.street || a.line1 || null, city: a.city || s.city || null, state: a.state || s.state || null, zip: a.zip || s.zip || null };
}

/* The compute a site carries, from the record that sized it: the contract
   case, else the chips the diligence chose, else the compute model's skids,
   else the Site Map design. kW is the case's or the design's, else units ×
   the unit's kW when the door names it (ctx.kwPerUnit, the product record's
   own figure); never guessed. */
function computeOf(s, v, kase, ctx) {
  var chips = (v.gates.chips && v.gates.chips.value) || {}, lm = s.latestModel || null, dsn = s.latestDesign && s.latestDesign.compute || null;
  var out = { units: null, unitsLabel: null, chipset: chips.chipset || null, gpus: num(chips.gpus), computeKw: null, basis: null };
  var sz = kase && kase.output && kase.output.sizing;
  if (sz && num(sz.units) != null) {
    out.units = num(sz.units); out.gpus = num(sz.gpus); out.unitsLabel = 'units'; out.basis = 'the contract case';
    if (kase.input && kase.input.chipset) out.chipset = String(kase.input.chipset);
    if (num(sz.itKw) != null) out.computeKw = num(sz.itKw);
  } else if (num(chips.units) != null) { out.units = num(chips.units); out.unitsLabel = 'units'; out.basis = 'the chips chosen in diligence'; }
  else if (lm && lm.skid && num(lm.skid.units) != null) { out.units = num(lm.skid.units); out.unitsLabel = 'Omega-Core skids'; out.chipset = out.chipset || lm.skid.chipsetName || lm.skid.chipset || null; out.gpus = out.gpus != null ? out.gpus : num(lm.skid.gpus); out.basis = 'the compute model'; }
  else if (dsn && num(dsn.units) > 0) { out.units = num(dsn.units); out.unitsLabel = dsn.omegaCoreUnits > 0 ? 'Omega-Core skids' : 'compute units'; out.basis = 'the Site Map design'; }
  if (out.computeKw == null && dsn && num(dsn.kwIt) > 0) out.computeKw = num(dsn.kwIt);
  if (out.computeKw == null && out.units != null && num(ctx.kwPerUnit) > 0) out.computeKw = out.units * num(ctx.kwPerUnit);
  return out;
}

/* Which sites go: the earmarked (stage pursue, the call pursue, no
   exclusion standing). ids narrows it; a chosen site that is not earmarked
   is named, never sent. */
function select(sites, ctx, ids) {
  ctx = ctx || {};
  var want = Array.isArray(ids) && ids.length ? ids.map(String) : null, included = [], skipped = [], seen = {};
  (sites || []).forEach(function (s) {
    var id = siteIdOf(s); if (!id || seen[id]) return; seen[id] = true;
    if (want && want.indexOf(id) < 0) return;
    if (s.archived === true || s.lifecycleStatus === 'archived') { if (want) skipped.push({ siteId: id, name: s.name || '', why: 'archived' }); return; }
    var v = D.view(s, { config: ctx.config, now: ctx.now });
    if (v.stage === 'pursue') { included.push(s); return; }
    if (want || D.STAGES.indexOf(v.stage) > D.STAGES.indexOf('pursue')) skipped.push({ siteId: id, name: s.name || '', why: v.stage === D.PASSED ? 'passed' : D.STAGES.indexOf(v.stage) > D.STAGES.indexOf('pursue') ? 'already past the LOI (' + v.stageLabel + ')' : 'not earmarked (' + v.stageLabel + ')' });
  });
  if (want) want.forEach(function (id) { if (!seen[id]) skipped.push({ siteId: id, name: '', why: 'not in this workspace' }); });
  return { included: included, skipped: skipped };
}

/* The package. ctx: { config, workspaceName, partner {key,name}, now, by,
   host, kases {siteId: contract case}, kwPerUnit } */
function build(sites, ctx) {
  ctx = ctx || {};
  if (!sites || !sites.length) throw fail(409, 'No earmarked sites to send: earmark the sites first');
  if (sites.length > MAX_SITES) throw fail(400, 'At most ' + MAX_SITES + ' sites in one LOI package');
  var cfg = ctx.config || D.normalizeConfig(null), day = String(ctx.now || '').slice(0, 10), base = ctx.host ? 'https://' + ctx.host : '';
  if (!ctx.partner || !ctx.partner.key) throw fail(409, 'No offtake partner is set for this workspace');
  var rows = sites.map(function (s) {
    var id = siteIdOf(s), kase = ctx.kases && own(ctx.kases, id) ? ctx.kases[id] : null, v = D.view(s, { config: cfg, now: ctx.now, kase: kase });
    var fib = v.gates.fiber.value || {}, scr = v.screen || (s.diligence && s.diligence.screen) || null, comp = computeOf(s, v, kase, ctx), t = v.control.term;
    return {
      siteId: id, name: s.name || 'Site', location: addressOf(s),
      power: { availableKw: v.power.availableKw, basis: v.power.availableBasis, path: v.power.path, serviceKw: v.power.serviceKw, peakKw: v.power.peakKw, peakSource: v.power.peakSource, state: v.gates.power.state,
        substation: scr && scr.power ? scr.power.substation || null : null, substationKv: scr && scr.power ? num(scr.power.kv) : null, substationMi: scr && scr.power ? num(scr.power.distanceMi) : null },
      interconnection: { utility: (v.gates.interconnection.value || {}).utility || (scr && scr.utility && scr.utility.name) || null, state: v.gates.interconnection.state },
      compute: comp,
      fiber: { carriers: fib.carriers && fib.carriers.length ? fib.carriers : (scr && scr.fiber && scr.fiber.carriers) || [], symmetric1g: fib.symmetric1g != null ? fib.symmetric1g : scr && scr.fiber ? scr.fiber.symmetric1g : null,
        lateralMi: fib.lateralMi != null ? fib.lateralMi : scr && scr.fiber ? num(scr.fiber.lateralMi) : null, state: v.gates.fiber.state },
      control: { route: v.control.route || null, routeLabel: t.routeLabel || null, end: t.end, endBasis: t.endBasis, perpetual: t.perpetual === true, ok: t.ok, shortMonths: t.shortMonths || 0, state: v.gates.control.state },
      offtake: { termYears: v.offtake.termYears, termFromDefault: v.offtake.defaulted.indexOf('termYears') >= 0 },
      link: base ? base + '/site-crm.html?site=' + encodeURIComponent(id) + '#diligence' : null
    };
  });
  var tot = { sites: rows.length, availableKw: 0, availableKnown: 0, computeKw: 0, computeKnown: 0, units: 0, unitsKnown: 0, chipMix: [] };
  rows.forEach(function (r) {
    if (r.power.availableKw != null) { tot.availableKw += r.power.availableKw; tot.availableKnown++; }
    if (r.compute.computeKw != null) { tot.computeKw += r.compute.computeKw; tot.computeKnown++; }
    if (r.compute.units != null) { tot.units += r.compute.units; tot.unitsKnown++; }
    var chip = r.compute.chipset || null, row = tot.chipMix.filter(function (x) { return x.chipset === chip; })[0];
    if (!row) { row = { chipset: chip, sites: 0, units: 0, gpus: 0, gpusKnown: 0 }; tot.chipMix.push(row); }
    row.sites++; if (r.compute.units != null) row.units += r.compute.units; if (r.compute.gpus != null) { row.gpus += r.compute.gpus; row.gpusKnown++; }
  });
  tot.availableMw = round(tot.availableKw / 1000, 3); tot.computeMw = round(tot.computeKw / 1000, 3);
  var ids = rows.map(function (r) { return r.siteId; }).sort(), off = D.offtakeOf({}, cfg);
  return {
    packageId: 'loi_' + day.replace(/-/g, '') + '_' + hash(ids.join(',')), day: day, partner: { key: ctx.partner.key, name: ctx.partner.name },
    workspace: ctx.workspaceName || null, by: ctx.by || null, preparedAt: ctx.now || null,
    termYears: off.termYears, terms: { termYears: off.termYears, note: off.termYears != null ? 'The term asked is the workspace default unless a site names its own' : 'No offtake term is set' },
    totals: tot, sites: rows, siteIds: ids
  };
}

function kw(v) { return v == null ? 'not on file' : Number(v).toLocaleString('en-US') + ' kW'; }
function mw(v) { return v == null ? 'not on file' : v + ' MW'; }
/* The mail: one table, a row a site. The subject names the workspace and the count. */
function mail(pkg, ctx) {
  ctx = ctx || {};
  var who = pkg.workspace || 'A workspace', tot = pkg.totals, rows = pkg.sites;
  var chips = tot.chipMix.map(function (c) { return (c.chipset || 'chips not chosen') + ' ×' + c.sites + (c.units ? ' (' + c.units + ' units' + (c.gpusKnown ? ', ' + c.gpus + ' GPUs' : '') + ')' : ''); }).join('; ');
  var h = '<p>' + esc(who) + ' is sending ' + esc(pkg.partner.name) + ' <b>' + tot.sites + ' site' + (tot.sites === 1 ? '' : 's') + '</b> for compute offtake, to a letter of intent' +
    (pkg.termYears != null ? ' on a ' + esc(pkg.termYears) + '-year term' : '') + '.' + (ctx.note ? '</p><p>' + esc(ctx.note).replace(/\n/g, '<br>') : '') + '</p>';
  h += '<table style="border-collapse:collapse"><tr><td style="padding:4px 12px 4px 0;color:#6B7C8C">Power for compute</td><td><b>' + esc(mw(tot.availableMw)) + '</b>' + (tot.availableKnown < tot.sites ? ' (' + tot.availableKnown + ' of ' + tot.sites + ' sites)' : '') + '</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#6B7C8C">Compute</td><td><b>' + esc(mw(tot.computeMw)) + '</b>' + (tot.computeKnown < tot.sites ? ' (' + tot.computeKnown + ' of ' + tot.sites + ' sites)' : '') + ' · ' + tot.units + ' units' + (tot.unitsKnown < tot.sites ? ' (' + tot.unitsKnown + ' of ' + tot.sites + ' sites sized)' : '') + '</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#6B7C8C">Chip mix</td><td>' + esc(chips || 'not chosen') + '</td></tr></table>';
  h += '<h3 style="margin:16px 0 6px">The sites</h3><table style="border-collapse:collapse;font-size:13px"><tr style="color:#6B7C8C;text-align:left"><th style="padding:4px 10px 4px 0">Site</th><th style="padding:4px 10px">Power</th><th style="padding:4px 10px">Compute</th><th style="padding:4px 10px">Fiber</th><th style="padding:4px 10px">Control and term</th></tr>';
  rows.forEach(function (r) {
    var loc = [r.location.city, r.location.state].filter(Boolean).join(', ');
    var term = r.control.route ? r.control.routeLabel + (r.control.perpetual ? ' (held)' : r.control.end ? ', to ' + r.control.end + (r.control.ok === false ? ' (' + r.control.shortMonths + ' months short of the term)' : '') : ', end not on file') : 'route not chosen';
    h += '<tr style="border-top:1px solid #e5e7eb;vertical-align:top"><td style="padding:6px 10px 6px 0"><b>' + esc(r.name) + '</b>' + (loc ? '<br>' + esc(loc) : '') + (r.link ? '<br><a href="' + esc(r.link) + '">record</a>' : '') + '</td>' +
      '<td style="padding:6px 10px">' + esc(kw(r.power.availableKw)) + (r.power.basis ? '<br><span style="color:#6B7C8C">' + esc(r.power.basis) + '</span>' : '') + (r.power.substation ? '<br><span style="color:#6B7C8C">' + esc(r.power.substation) + (r.power.substationKv ? ' ' + r.power.substationKv + ' kV' : '') + (r.power.substationMi != null ? ', ' + r.power.substationMi + ' mi' : '') + '</span>' : '') + '</td>' +
      '<td style="padding:6px 10px">' + (r.compute.units != null ? esc(r.compute.units + ' ' + r.compute.unitsLabel) : 'not sized') + (r.compute.chipset ? '<br>' + esc(r.compute.chipset) + (r.compute.gpus != null ? ' · ' + r.compute.gpus + ' GPUs' : '') : '') + (r.compute.computeKw != null ? '<br>' + esc(kw(r.compute.computeKw)) : '') + '</td>' +
      '<td style="padding:6px 10px">' + (r.fiber.carriers.length ? esc(r.fiber.carriers.join(', ')) : 'carriers not on file') + (r.fiber.symmetric1g === true ? '<br>1 Gbps symmetric' : r.fiber.symmetric1g === false ? '<br>no 1 Gbps symmetric' : '') + '</td>' +
      '<td style="padding:6px 10px">' + esc(term) + '</td></tr>';
  });
  h += '</table><p style="color:#6B7C8C;font-size:12px">' + esc(pkg.partner.name) + ' finds the buyer of the compute. Figures marked not on file are not on the record; nothing here is invented. Screened figures are from public data and are confirmed on documents later. Reply to ' + esc(ctx.by || pkg.by || '') + '.</p>';
  return { subject: '[' + who + '] LOI package for ' + pkg.partner.name + ': ' + tot.sites + ' site' + (tot.sites === 1 ? '' : 's') + ' · ' + mw(tot.computeMw) + ' of compute', html: h };
}

/* After the mail went: each site's diligence takes the LOI as sent and moves
   to LOI sent, by the diligence's own rules; the partner record it keeps. */
function sent(stored, pkg, ctx) {
  var a = D.change(stored, 'offtake', { loiStatus: 'sent' }, ctx), b = D.change(a.diligence, 'stage', { stage: 'loi-sent' }, ctx);
  return { diligence: b.diligence, events: [a.event, b.event].filter(Boolean),
    partnerRecord: { sentAt: ctx.now, by: ctx.by || null, to: ctx.to || [], status: 'sent', packageId: pkg.packageId, sites: pkg.totals.sites, kind: 'loi-package' } };
}

module.exports = { MAX_SITES: MAX_SITES, DAILY_CAP: DAILY_CAP, select: select, build: build, mail: mail, sent: sent, computeOf: computeOf };
