/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The build sequence: the Run's money step by step, and how long each step
   takes (Blueprint to Build, Phase 2; docs/BLUEPRINT-TO-BUILD.md; 2026-10-16,
   Tommy: "And then do phase 2", after a Perplexity ad whose model assembles
   while "In place $441,944" counts up).

   Pure, ES5, no I/O. api/build-sequence.js is the ONE door: it runs the
   Run's own roll-up (api/_lib/editor-cost.js rollup) on the drawing's
   quantities and hands the answer to sequence() below. The browser only
   shows and hides the 3D model step by step (omega-build-sequence.js); every
   figure it prints comes from here.

   THE MONEY IS THE RUN'S, NOT A SECOND ESTIMATE.
     - Every line the roll-up puts in its total goes to exactly ONE step
       (lines() below). It refuses (throws) when they do not add back up to
       the roll-up's subtotal, so a line added to editor-cost.js one day
       fails the tests here instead of quietly leaving money out.
     - The Run's contingency rides on the lines it applies to, at the Run's
       rate; NextNRG's installed prices and the Omega-Core skid carry none,
       exactly as the Run says.
     - A contracted cost (the cost sheet's Contracted cost) replaces the estimate:
       it is spread over the steps by the estimate's shares, and said so.
     - Cents are apportioned by largest remainder, so the steps add up to
       the Run total to the cent and "in place" after the last step IS the
       Run total.
     - Conduit is a BOM estimate the Run keeps out of its total; it is
       named on the trenching step, never added.

   THE DAYS ARE PLANNING RATES, AND SAY SO.
     A Run knows what is placed, not who builds it, so how long each step
     takes is worked out from ClearSky's planning rates (RATES: crew-days a
     unit, one crew a step, crews added on big jobs), every figure shown
     with its working. What the drawing cannot know is never guessed: the
     permits and the engineering run on the jurisdiction's clock, the
     interconnection on the utility's, and both read "not on file" with no
     number, never a typical one. Working days, not calendar dates. */
'use strict';

var VERSION = 'build-seq-1';

/* The steps, in the order a site is built. */
var PHASES = [
  { key: 'design',     label: 'Design & permits' },
  { key: 'survey',     label: 'Survey & site prep' },
  { key: 'trench',     label: 'Trenching & underground' },
  { key: 'pads',       label: 'Pads & foundations' },
  { key: 'equipment',  label: 'Equipment set' },
  { key: 'solar',      label: 'Solar racking & modules' },
  { key: 'ev',         label: 'EV chargers' },
  { key: 'envelope',   label: 'Building upgrades' },
  { key: 'wiring',     label: 'Terminations & wiring' },
  { key: 'finish',     label: 'Fence, bollards & site hardware' },
  { key: 'utility',    label: 'Utility interconnect' },
  { key: 'commission', label: 'Commissioning' },
  { key: 'energize',   label: 'Energize' }
];
var PHASE_KEYS = PHASES.map(function (p) { return p.key; });
var ALWAYS = ['design', 'survey', 'utility', 'commission', 'energize'];

/* Which step puts each piece of the 3D model in place, by the 3D Site
   Visualizer's own archetypes (editor.html ARCH). 'existing' is what stands
   before the job starts and is shown from the first frame. The visualizer's
   conduit runs are laid in CONDUIT_PHASE. scripts/tests/tbuildseq.js holds
   this to every archetype the visualizer can draw. */
var REVEAL = {
  building: 'existing', tree: 'existing', parking: 'existing', hydrant: 'existing', pole: 'existing', substation: 'existing',
  road: 'survey', compound: 'survey',
  pad: 'pads',
  'bess-container': 'equipment', 'bess-assembly': 'equipment', 'bess-cabinet': 'equipment', pcs: 'equipment', ems: 'equipment',
  'compute-pod': 'equipment', xfmr: 'equipment', switchgear: 'equipment', meter: 'equipment', panel: 'equipment',
  disco: 'equipment', jbox: 'equipment', genset: 'equipment', ups: 'equipment',
  'solar-ground': 'solar', 'solar-tracker': 'solar', 'solar-roof': 'solar', 'solar-carport': 'solar',
  charger: 'ev',
  fence: 'finish', bollard: 'finish', camera: 'finish'
};
var CONDUIT_PHASE = 'trench';

/* ClearSky's planning rates: crew-days a unit of work, one crew a step.
   Not a contractor's schedule; the working is printed beside every figure
   so a contractor can put their own in its place. */
var RATES = {
  survey:   { days: 2, text: 'Mobilise, survey and stake out' },
  grade:    { days: 3, text: 'Grade the access road and compound' },
  stake:    { perMw: 1, text: 'Stake the ground array' },
  trench:   { ftPerDay: 250, text: 'dig, lay conduit and backfill' },
  pad:      { each: 0.5, cure: 7, text: 'form, reinforce and pour', cureText: 'then cure before equipment is set on it' },
  equip:    { big: 1, cabinet: 0.5, small: 0.25 },
  solar:    { ground: 100, roof: 60, canopy: 25, smallKw: 25, smallDays: 2 },   /* kW-DC a crew-day; a home-sized array is two days */
  ev:       { l2: 0.5, dc: 3 },
  wiring:   { perItem: 0.5, ftPerDay: 500 },
  finish:   { fence: 2, bollardsPerDay: 6, camera: 0.25 },
  commission: { days: 2, perMwh: 1, perMwDc: 1, perCharger: 0.25, perPod: 1 },
  crews:    { targetDays: 20, max: 6 }
};
/* How long setting one piece of equipment takes, by archetype. */
var EQUIP_CLASS = {
  'bess-container': 'big', 'bess-assembly': 'big', 'compute-pod': 'big', xfmr: 'big', switchgear: 'big', genset: 'big', pcs: 'big',
  'bess-cabinet': 'cabinet', ems: 'cabinet', ups: 'cabinet',
  meter: 'small', panel: 'small', disco: 'small', jbox: 'small'
};
var EQUIP_WORDS = {
  'bess-container': ['BESS container', 'BESS containers'], 'bess-assembly': ['BESS assembly', 'BESS assemblies'], 'compute-pod': ['compute pod or skid', 'compute pods and skids'],
  xfmr: ['transformer', 'transformers'], switchgear: ['switchgear lineup', 'switchgear lineups'], genset: ['generator', 'generators'], pcs: ['PCS / inverter skid', 'PCS / inverter skids'],
  'bess-cabinet': ['BESS cabinet', 'BESS cabinets'], ems: ['EMS cabinet', 'EMS cabinets'], ups: ['UPS cabinet', 'UPS cabinets'],
  meter: ['meter', 'meters'], panel: ['panelboard', 'panelboards'], disco: ['disconnect', 'disconnects'], jbox: ['junction box', 'junction boxes']
};
var CLASS_TEXT = { big: 'crane set and anchor', cabinet: 'set and anchor', small: 'mount' };

/* Steps that never take a figure here: their clock is someone else's. */
var NOT_ON_FILE = {
  design: 'Engineering and permits run on the jurisdiction’s clock; no timeline is on file.',
  utility: 'The interconnection runs on the utility’s clock; no lead time is on file.',
  envelope: 'The building measures’ own schedule is not on file.'
};

/* What must finish before a step starts, and the days it then waits. */
var AFTER = {
  survey: [], trench: [['survey', 0]], pads: [['survey', 0], ['trench', 0]],
  equipment: [['survey', 0], ['trench', 0], ['pads', 'cure']],
  solar: [['survey', 0], ['trench', 0]], ev: [['survey', 0], ['trench', 0]], envelope: [['survey', 0]],
  wiring: [['equipment', 0], ['solar', 0], ['ev', 0]], finish: [['survey', 0], ['equipment', 0]],
  utility: [['wiring', 0]], commission: [['wiring', 0]], energize: [['commission', 0], ['utility', 0]]
};

function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
function cnt(v) { var x = Math.floor(num(v)); return x > 0 ? x : 0; }
function plural(n, one, many) { return fmt(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
function fmt(x) { var r = Math.round(x * 10) / 10; return String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function part(x) { return x === 0.5 ? '½' : x === 0.25 ? '¼' : fmt(x); }
function days(x) { return part(x) + (x > 1 ? ' crew-days' : ' crew-day'); }

/* ── the money ────────────────────────────────────────────────────── */

/* Every line the roll-up adds into its subtotal, each with its step and
   whether the Run's contingency applies to it. */
function lines(out) {
  out = out || {};
  var L = out.lines || {}, T = out.totals || {}, site = L.site || {}, ind = L.indirect || {}, c = site.counts || {};
  var bess = L.bess || {}, nnAlone = num(bess.nextnrgAlone), list = [];
  function add(key, label, phase, raw, contingent) { raw = num(raw); if (raw !== 0) list.push({ key: key, label: label, phase: phase, raw: raw, contingent: contingent }); }
  var ctl = L.controller || {}, oc = L.omegaCore || {}, comp = L.compute || {}, ev = L.ev || {}, sol = L.solar || {};
  add('indirect.eng', 'Engineering & design', 'design', ind.eng, true);
  add('indirect.perm', 'Permitting & AHJ', 'design', ind.perm, true);
  add('site.pad', c.pad > 0 ? plural(c.pad, 'concrete pad') : 'Concrete pads', 'pads', site.pad, true);
  add('bess', 'Battery storage', 'equipment', num(bess.total) - nnAlone, true);
  add('nextnrg.storage', 'NextNRG storage, installed', 'equipment', nnAlone, false);
  add('site.xfmr', 'Transformer', 'equipment', site.xfmr, true);
  add('site.panel', c.panel > 0 ? plural(c.panel, 'panelboard') : 'Panelboards', 'equipment', site.panel, true);
  add('site.disco', c.disco > 0 ? plural(c.disco, 'disconnect') : 'Disconnects', 'equipment', site.disco, true);
  add('site.meter', c.meter > 0 ? plural(c.meter, 'meter') : 'Meters', 'equipment', site.meter, true);
  add('site.jbox', c.jbox > 0 ? plural(c.jbox, 'junction box', 'junction boxes') : 'Junction boxes', 'equipment', site.jbox, true);
  add('controller', 'NextNRG Microgrid Controller' + (ctl.qty > 1 ? ' × ' + ctl.qty : ''), 'equipment', ctl.total, true);
  add('omegaCore', oc.skids > 1 ? oc.skids + ' Omega-Core skids' : 'Omega-Core skid', 'equipment', oc.total, false);
  add('compute', comp.pods > 0 ? plural(comp.pods, 'compute pod') : 'Compute', 'equipment', T.compute, true);
  add('dc', 'Data-centre electrical package', 'equipment', T.dc, true);
  add('gen', 'On-site generation', 'equipment', T.gen, true);
  add('bnz', 'Building envelope', 'envelope', T.bnz, true);
  add('solar', 'Solar PV' + (sol.kwDc > 0 ? ', ' + fmt(sol.kwDc) + ' kW-DC' : ''), 'solar', T.solar, true);
  add('nextnrg.solar', 'NextNRG solar, installed', 'solar', T.nextnrg, false);
  add('ev', ev.units > 0 ? plural(ev.units, 'EV charger') : 'EV chargers', 'ev', T.ev, true);
  add('site.bollards', c.bollard > 0 ? plural(c.bollard, 'bollard') : 'Bollards', 'finish', site.bollards, true);
  add('site.misc', 'Misc site hardware', 'finish', site.misc, true);
  add('indirect.comm', 'Commissioning', 'commission', ind.comm, true);
  add('indirect.emsSetup', 'EMS setup', 'commission', ind.emsSetup, true);
  if (T.inScope) {
    var sum = list.reduce(function (s, l) { return s + l.raw; }, 0);
    if (Math.abs(sum - num(T.sub)) > 0.01) throw new Error('build-sequence: the lines (' + sum + ') do not add up to the Run’s subtotal (' + T.sub + ')');
  }
  return list;
}

/* Whole cents that add up to `target` exactly, nearest to `values`. */
function apportion(values, target) {
  var n = values.length, out = values.map(function (v) { return Math.floor(v); });
  if (!n) return out;
  var rem = target - out.reduce(function (s, v) { return s + v; }, 0);
  var order = values.map(function (v, i) { return { i: i, f: v - Math.floor(v) }; }).sort(function (a, b) { return (b.f - a.f) || (a.i - b.i); });
  for (var k = 0; k < Math.abs(rem); k++) out[order[rem > 0 ? k % n : n - 1 - (k % n)].i] += rem > 0 ? 1 : -1;
  return out;
}

/* The Run's total split over the lines, to the cent. */
function money(out) {
  var T = (out && out.totals) || {}, contPct = num(T.contPct), total = num(T.total);
  var cents = Math.round(total * 100), notes = [], list = lines(out), est = 0, spread = 'estimate', scale = 1;
  if (!T.inScope) list = [];                     /* the Run counts nothing until something priceable is placed */
  list.forEach(function (l) { l.amount = l.contingent ? l.raw * (1 + contPct) : l.raw; est += l.amount; });
  if (T.contracted) {
    if (est > 0) { spread = 'contracted'; scale = total / est; notes.push('The contracted cost is spread over the steps by the estimate’s shares.'); }
    else {
      spread = 'contracted-whole';
      list = [{ key: 'contracted', label: 'Contracted cost', phase: 'energize', raw: total, contingent: false, amount: total }];
      notes.push('The contracted cost is not split: nothing on the drawing is priced to split it by.');
    }
  } else if (Math.abs(est - total) > 0.01) {
    throw new Error('build-sequence: the steps (' + est + ') do not add up to the Run total (' + total + ')');
  }
  if (!list.length && !cents) notes.push('Nothing priceable is placed yet, so nothing is in place.');
  var c = apportion(list.map(function (l) { return l.amount * scale * 100; }), cents);
  list.forEach(function (l, i) { l.cents = c[i]; });
  return { cents: cents, total: cents / 100, contPct: contPct, contracted: !!T.contracted, spread: spread, lines: list, notes: notes };
}

/* ── the days ─────────────────────────────────────────────────────── */

/* What the browser may add to the quantities: feet of trench dug, how many
   of each archetype the 3D model draws, and whether it draws conduit.
   Never money. */
function clean(b) {
  b = b && typeof b === 'object' ? b : {};
  var items = {}, src = b.items && typeof b.items === 'object' ? b.items : {};
  Object.keys(REVEAL).forEach(function (a) { var n = cnt(src[a]); if (n) items[a] = Math.min(n, 100000); });
  var ft = num(b.trenchFt);
  return { trenchFt: ft > 0 ? Math.min(ft, 1000000) : 0, items: items, conduit: b.conduit === true };
}

function crewsFor(crewDays) {
  return Math.max(1, Math.min(RATES.crews.max, Math.ceil(crewDays / RATES.crews.targetDays - 1e-9)));
}

/* Crew-days for each step from what is placed, with the working. */
function work(q, b) {
  q = q || {}; b = b && b.items ? b : clean(b);
  var it = b.items, w = {}, solar = q.solar || {}, mount = solar.byMount || {}, ft = q.conduitFt || {};
  function put(key, d, text) { var s = (w[key] = w[key] || { crewDays: 0, basis: [] }); s.crewDays += d; s.basis.push(text); }

  var kwDc = Math.max(0, num(q.solarKwDc)), roofKw = Math.max(0, num(mount.roof)), canopyKw = Math.max(0, num(mount.canopy));
  var groundKw = Math.min(Math.max(0, num(mount.ground)), kwDc), restKw = Math.max(0, kwDc - groundKw - roofKw - canopyKw);

  put('survey', RATES.survey.days, RATES.survey.text + ': ' + days(RATES.survey.days));
  if (it.road || it.compound) put('survey', RATES.grade.days, RATES.grade.text + ': ' + days(RATES.grade.days));
  if (groundKw + restKw >= 1000) put('survey', (groundKw + restKw) / 1000 * RATES.stake.perMw, RATES.stake.text + ': ' + fmt((groundKw + restKw) / 1000) + ' MW-DC × ' + days(RATES.stake.perMw) + ' a MW');

  var trenchFt = b.trenchFt > 0 ? b.trenchFt : Math.max(0, num(ft['PVC-UG']));
  if (trenchFt > 0) put('trench', trenchFt / RATES.trench.ftPerDay, fmt(trenchFt) + ' ft of ' + (b.trenchFt > 0 ? 'trench' : 'underground conduit') + ' at ' + RATES.trench.ftPerDay + ' ft a crew-day (' + RATES.trench.text + ')');

  var pads = Math.max(cnt(q.counts && q.counts.pad), cnt(it.pad));
  if (pads) put('pads', pads * RATES.pad.each, plural(pads, 'pad') + ' × ' + days(RATES.pad.each) + ' (' + RATES.pad.text + '), ' + RATES.pad.cureText + ': ' + RATES.pad.cure + ' days');

  var nEquip = 0;
  Object.keys(EQUIP_CLASS).forEach(function (a) {
    var n = cnt(it[a]); if (!n) return;
    var cls = EQUIP_CLASS[a], per = RATES.equip[cls], word = EQUIP_WORDS[a];
    nEquip += n;
    put('equipment', n * per, fmt(n) + ' ' + (n === 1 ? word[0] : word[1]) + ' × ' + days(per) + ' (' + CLASS_TEXT[cls] + ')');
  });

  if (kwDc > 0) {
    if (kwDc < RATES.solar.smallKw) put('solar', RATES.solar.smallDays, fmt(kwDc) + ' kW-DC, a home-sized array: ' + days(RATES.solar.smallDays));
    else {
      if (groundKw > 0) put('solar', groundKw / RATES.solar.ground, fmt(groundKw) + ' kW-DC on the ground at ' + RATES.solar.ground + ' kW a crew-day');
      if (roofKw > 0) put('solar', roofKw / RATES.solar.roof, fmt(roofKw) + ' kW-DC on a roof at ' + RATES.solar.roof + ' kW a crew-day');
      if (canopyKw > 0) put('solar', canopyKw / RATES.solar.canopy, fmt(canopyKw) + ' kW-DC of canopy at ' + RATES.solar.canopy + ' kW a crew-day (the steel goes up first)');
      if (restKw > 0) put('solar', restKw / RATES.solar.ground, fmt(restKw) + ' kW-DC with no mount on record, timed as ground at ' + RATES.solar.ground + ' kW a crew-day');
    }
  }

  var l2 = 0, dc = 0, other = 0;
  ((q.ev && q.ev.items) || []).forEach(function (e) {
    e = e || {}; var n = cnt(e.qty) || 1, kw = num(e.kw);
    if (e.kind === 'evl2' || (kw > 0 && kw <= 22.5)) l2 += n; else dc += n;
  });
  if (!l2 && !dc) other = cnt(it.charger);
  if (l2) put('ev', l2 * RATES.ev.l2, plural(l2, 'Level 2 charger') + ' × ' + days(RATES.ev.l2) + ' (mount, wire and terminate)');
  if (dc) put('ev', dc * RATES.ev.dc, plural(dc, 'DC fast charger') + ' × ' + days(RATES.ev.dc) + ' (set, terminate and test)');
  if (other) put('ev', other * RATES.ev.l2, plural(other, 'charger') + ' of no recorded kind × ' + days(RATES.ev.l2));

  var ends = nEquip + dc + (kwDc > 0 ? 1 : 0), condFt = 0;
  Object.keys(ft).forEach(function (k) { condFt += Math.max(0, num(ft[k])); });
  if (ends) put('wiring', ends * RATES.wiring.perItem, plural(ends, 'connection') + ' × ' + days(RATES.wiring.perItem) + ' to terminate');
  if (condFt > 0) put('wiring', condFt / RATES.wiring.ftPerDay, fmt(condFt) + ' ft of conduit at ' + RATES.wiring.ftPerDay + ' ft a crew-day to pull wire');

  var fence = cnt(it.fence), boll = Math.max(cnt(q.counts && q.counts.bollard), cnt(it.bollard)), cam = cnt(it.camera);
  if (fence) put('finish', fence * RATES.finish.fence, plural(fence, 'fence line') + ' × ' + days(RATES.finish.fence));
  if (boll) put('finish', boll / RATES.finish.bollardsPerDay, plural(boll, 'bollard') + ' at ' + RATES.finish.bollardsPerDay + ' a crew-day');
  if (cam) put('finish', cam * RATES.finish.camera, plural(cam, 'camera') + ' × ' + days(RATES.finish.camera));

  var mwh = Math.max(num(q.fleetRating && q.fleetRating.kwh), num(q.configuredKwh)) / 1000;
  var chargers = l2 + dc + other, pods = cnt(q.compute && q.compute.podsN) + cnt(q.omegaCore && q.omegaCore.skids);
  put('commission', RATES.commission.days, 'Test and hand over: ' + days(RATES.commission.days));
  if (mwh > 0) put('commission', mwh * RATES.commission.perMwh, fmt(mwh) + ' MWh of storage × ' + days(RATES.commission.perMwh) + ' a MWh');
  if (kwDc >= 1000) put('commission', kwDc / 1000 * RATES.commission.perMwDc, fmt(kwDc / 1000) + ' MW-DC of solar × ' + days(RATES.commission.perMwDc) + ' a MW');
  if (chargers) put('commission', chargers * RATES.commission.perCharger, plural(chargers, 'charger') + ' × ' + days(RATES.commission.perCharger));
  if (pods) put('commission', pods * RATES.commission.perPod, plural(pods, 'compute pod or skid', 'compute pods and skids') + ' × ' + days(RATES.commission.perPod));
  return { steps: w, pads: pads, trenchFt: trenchFt };
}

/* ── the sequence ─────────────────────────────────────────────────── */

/* The steps a drawing needs: the ones that always happen, and the rest
   when a line of money or something on the drawing is theirs. */
function present(key, money, wk, b, out) {
  if (ALWAYS.indexOf(key) >= 0 || money[key]) return true;
  if (key === 'trench') return wk.trenchFt > 0 || b.conduit || num(out && out.lines && out.lines.conduit && out.lines.conduit.total) > 0;
  if (wk.steps[key] && wk.steps[key].crewDays > 0) return true;
  for (var a in b.items) if (b.items.hasOwnProperty(a) && REVEAL[a] === key) return true;
  return false;
}

/* sequence(out, q, build): `out` is editor-cost rollup(q), `q` the
   quantities it ran on, `build` the browser's extras (cleaned here). */
function sequence(out, q, build) {
  out = out || {};
  var b = clean(build), mo = money(out), wk = work(q, b), byPhase = {};
  mo.lines.forEach(function (l) { (byPhase[l.phase] = byPhase[l.phase] || []).push(l); });

  var phases = [], at = {}, cum = 0, open = [];
  PHASES.forEach(function (p) {
    if (!present(p.key, byPhase, wk, b, out)) return;
    var ls = byPhase[p.key] || [], cents = ls.reduce(function (s, l) { return s + l.cents; }, 0);
    cum += cents;
    var ph = { key: p.key, label: p.label, cents: cents, amount: cents / 100, inPlaceCents: cum, inPlace: cum / 100,
      lines: ls.map(function (l) { return { key: l.key, label: l.label, cents: l.cents, amount: l.cents / 100, contingency: l.contingent && mo.contPct > 0 }; }),
      reveal: Object.keys(REVEAL).filter(function (a) { return REVEAL[a] === p.key; }).concat(p.key === CONDUIT_PHASE ? ['conduit'] : []),
      notes: [], basis: [] };
    if (NOT_ON_FILE[p.key]) { ph.days = null; ph.known = false; ph.basis.push(NOT_ON_FILE[p.key]); open.push(p.key); }
    else if (p.key === 'energize') { ph.days = 0; ph.known = true; ph.basis.push('Permission to operate: a milestone, not a crew step.'); }
    else {
      var s = wk.steps[p.key] || { crewDays: 0, basis: [] }, crewDays = Math.max(s.crewDays, 1), crews = crewsFor(crewDays);
      ph.basis = s.basis.slice();
      if (!(s.crewDays > 0)) ph.basis.push('Nothing on the drawing to time it by: one crew-day held.');
      ph.crewDays = Math.round(crewDays * 100) / 100; ph.crews = crews; ph.days = Math.ceil(crewDays / crews - 1e-9); ph.known = true;
      if (crews > 1) ph.basis.push(crews + ' crews (crews are added to hold a step near ' + RATES.crews.targetDays + ' working days, up to ' + RATES.crews.max + ')');
      if (p.key === 'pads' && wk.pads) ph.cure = RATES.pad.cure;
    }
    if (p.key === 'design' && !cents && mo.cents > 0) ph.notes.push('Engineering & Design and Permitting & AHJ are blank on the cost sheet, so this step carries no money.');
    if (p.key === CONDUIT_PHASE) {
      var cond = (out.lines && out.lines.conduit) || {};
      if (num(cond.total) > 0) { ph.conduitBom = Math.round(num(cond.total) * 100) / 100; ph.notes.push('The conduit is on the BOM, not in the Run total, so it adds nothing to what is in place.'); }
    }
    if (p.key === 'wiring') ph.notes.push('No line of its own: the Run prices the equipment installed and the conduit on the BOM.');
    if (p.key === 'utility' || p.key === 'energize') ph.notes.push(p.key === 'utility' ? 'The utility’s own charges are not in the Run.' : 'In place now: the Run total.');
    ph.index = phases.length; phases.push(ph); at[p.key] = ph;
  });

  /* the clock: each step starts when everything it follows has finished;
     design is before day 0, and a step waiting on an unknown says so */
  phases.forEach(function (ph) {
    if (ph.key === 'design') { ph.start = null; ph.finish = null; return; }
    var start = 0, waitOn = [];
    (AFTER[ph.key] || []).forEach(function (d) {
      var pre = at[d[0]]; if (!pre) return;
      if (pre.finish == null) { waitOn.push(pre.key); return; }
      start = Math.max(start, pre.finish + (d[1] === 'cure' ? (pre.cure || 0) : d[1]));
    });
    ph.start = start; ph.finish = ph.known ? start + ph.days : null;
    if (waitOn.length) ph.waitsOn = waitOn;
  });
  var end = 0;
  phases.forEach(function (ph) { if (ph.finish != null) end = Math.max(end, ph.finish); });
  var schedule = { workingDays: end, open: open, basis: 'ClearSky planning rates, one crew a step: not a contractor’s schedule. Working days from mobilisation.' };
  if (open.indexOf('utility') >= 0) schedule.plus = 'plus the utility’s interconnection time, which is not on file';

  return { ok: true, version: VERSION, total: mo.total, cents: mo.cents, contPct: mo.contPct, contracted: mo.contracted, spread: mo.spread,
    notes: mo.notes, phases: phases, schedule: schedule, reveal: REVEAL, conduitPhase: CONDUIT_PHASE };
}

module.exports = { VERSION: VERSION, PHASES: PHASES, PHASE_KEYS: PHASE_KEYS, REVEAL: REVEAL, CONDUIT_PHASE: CONDUIT_PHASE, RATES: RATES,
  lines: lines, money: money, clean: clean, work: work, sequence: sequence, apportion: apportion };
