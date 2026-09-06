#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   check-fleet.js — validate omega-fleet.js without a browser or a
   Firestore connection.

     node check-fleet.js

   Exits 0 clean, 1 on any failure. It loads /config.js and /omega-fleet.js
   into a real DOM, runs the sample fleet through analyse(), and asserts the
   things that are easy to get quietly wrong — which is, almost entirely,
   the four rules in the module header:

     1. sold is not live        contracted capacity stays out of the
                                managed figure
     2. power is not energy     kW and kWh are never summed
     3. observed is not         solar and facility load stay out of
        controlled              dispatchable power
     4. modelled is not         two savings totals, never one
        metered

   Plus the boring-but-fatal ones: that the rules' status list still matches
   STATUS[], that every status carries a group, and that the collection is
   not `projects`.

   Run it after any config edit.
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  \x1b[32mPASS\x1b[0m  ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m  ' + name + (detail ? '   ' + detail : '')); }
}

const dom = new JSDOM(
  '<!doctype html><html><head></head><body><div id="dev-fixed"></div></body></html>',
  { url: 'https://joulesai.example.com/' });
const w = dom.window;
global.window = w; global.document = w.document; global.location = w.location;

w.eval(fs.readFileSync('config.js', 'utf8'));
w.eval(fs.readFileSync('omega-fleet.js', 'utf8'));

const F = w.OmegaFleet;
const C = F.cfg();

console.log('\nCONFIG');
chk('fleet block enabled', C.enabled === true);
chk('collection is NOT projects', C.collection !== 'projects', '(' + C.collection + ')');
chk('collection is NOT intake_projects', C.collection !== 'intake_projects');
chk('facility types defined', C.segments.length >= 3, C.segments.length + ' types');
chk('every facility type has a unique key',
  new Set(C.segments.map(s => s.key)).size === C.segments.length);
chk('add + register pages are distinct routes',
  C.addHref !== C.registerHref, C.addHref + ' / ' + C.registerHref);
chk('unit label is set', !!C.unitLabel, '"' + C.unitLabel + '"');

console.log('\nTRIAL');
const t = w.CLEARSKY_CONFIG.tenant.trial;
chk('trial block present', !!t && !!t.startsAt);
const start = new Date(t.startsAt + 'T00:00:00');
const end = new Date(start); end.setDate(end.getDate() + t.days);
const lastDay = new Date(end.getTime() - 86400000);
chk('trial length is a positive whole number of days',
  Number.isInteger(t.days) && t.days > 0, t.days + ' days');
chk('start date parses', !isNaN(start.getTime()),
  start.toDateString() + ' \u2192 last full day ' + lastDay.toDateString());
chk('tierLevel is below TIER.ALL so no tool unlocks on tier alone',
  w.CLEARSKY_CONFIG.tenant.tierLevel < 0, 'tierLevel ' + w.CLEARSKY_CONFIG.tenant.tierLevel);
// Deleting a key from unlockedTools locks the tool even if it is still pinned.
const req = w.CLEARSKY_CONFIG.tenant.requiredTools || [];
const unl = w.CLEARSKY_CONFIG.tenant.unlockedTools || [];
chk('every pinned tool is also unlocked',
  req.every(k => unl.includes(k)),
  'pinned [' + req.join(',') + ']');

console.log('\nMODEL');
const statusKeys = F.STATUS.map(s => s.key);
const rulesSrc = fs.readFileSync('firestore-fleet.rules', 'utf8');
const ruleList = (rulesSrc.match(/s in \[([^\]]+)\]/) || [])[1] || '';
const ruleKeys = ruleList.split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
chk('rules status list matches STATUS[] in the module',
  statusKeys.length === ruleKeys.length && statusKeys.every(k => ruleKeys.includes(k)),
  statusKeys.length + ' keys');
// A status with no group falls out of every rollup while still rendering.
chk('every status carries a group',
  F.STATUS.every(s => ['pre', 'pipeline', 'live', 'dispatch', 'ended'].includes(s.group)));
chk('exactly one group counts as dispatching',
  F.STATUS.filter(s => s.group === 'dispatch').length === 1);
chk('rules constrain savingsBasis to the two the module knows',
  /savingsBasis in \['metered', 'modeled'\]/.test(rulesSrc));
chk('unknown facility type is reported, not silently mapped',
  F.segmentOf('does-not-exist').unknown === true);
chk('markets are flagged organized or not',
  F.marketOf('pjm').organized === true && F.marketOf('nonom').organized === false);

console.log('\nNORMALIZE');
// MW from a spreadsheet and kW from the form must land on the same number.
const mw = F.normalize('a', { siteName: 'S', bessMw: 2, bessMwh: 10 });
const kwDoc = F.normalize('b', { siteName: 'S', bessKw: 2000, bessKwh: 10000 });
chk('MW input is converted to canonical kW',
  mw.bessKw === kwDoc.bessKw && mw.bessKwh === kwDoc.bessKwh,
  mw.bessKw + ' kW / ' + mw.bessKwh + ' kWh');
chk('missing capacity reads null, not 0',
  F.normalize('c', { siteName: 'S' }).bessKw === null);
chk('an unlabelled savings figure is treated as modelled, never metered',
  F.normalize('d', { siteName: 'S', annualSavings: 1000 }).savingsBasis === 'modeled');
chk('a bogus basis falls back to modelled',
  F.normalize('e', { siteName: 'S', savingsBasis: 'actual' }).savingsBasis === 'modeled');

console.log('\nRULE 3 \u2014 OBSERVED IS NOT CONTROLLED');
const big = F.normalize('f', {
  siteName: 'S', bessKw: 1000, genKw: 500, flexKw: 200,
  solarKwAc: 2000, peakLoadKw: 9000
});
chk('dispatchable power excludes solar and facility load',
  F.dispatchKw(big) === 1700, F.dispatchKw(big) + ' kW');
chk('observed power includes them and is a different number',
  F.observedKw(big) === 12700 && F.observedKw(big) !== F.dispatchKw(big),
  F.observedKw(big) + ' kW');

console.log('\nSAMPLE FLEET');
const rows = F.sampleRows();
const a = F.analyse(rows);
const k = a.kpi;
chk('sample fleet loads', rows.length >= 8, rows.length + ' sites');

console.log('\nRULE 1 \u2014 SOLD IS NOT LIVE');
const dispatchKwSum = a.dispatching.reduce((n, r) => n + F.dispatchKw(r), 0);
chk('managed power equals the dispatching sites only',
  k.managedKw === dispatchKwSum, F.kw(k.managedKw));
chk('contracted capacity is reported separately and is non-zero in the sample',
  k.contractedKw > 0 && k.contractedKw !== k.managedKw,
  F.kw(k.contractedKw) + ' contracted');
const pipelineKw = a.pipeline.reduce((n, r) => n + F.dispatchKw(r), 0);
chk('no pipeline capacity leaked into the managed figure',
  k.managedKw + pipelineKw !== k.managedKw || pipelineKw === 0);
chk('a paused site drops out of managed capacity',
  !a.dispatching.some(r => r.status === 'paused') &&
  a.connected.some(r => r.status === 'paused'));
chk('units sold exceeds units live while a backlog exists',
  k.unitsSold > k.unitsLive && k.unitsPending === k.unitsSold - k.unitsLive,
  k.unitsSold + ' sold / ' + k.unitsLive + ' live / ' + k.unitsPending + ' pending');
chk('a pilot contributes no capacity and no units',
  a.pre.length > 0 && a.pre.every(r => !F.isDispatching(r)));

console.log('\nRULE 2 \u2014 POWER IS NOT ENERGY');
chk('managed power and managed storage are separate figures',
  k.managedKw > 0 && k.managedKwh > 0 && k.managedKw !== k.managedKwh,
  F.kw(k.managedKw) + ' / ' + F.kwh(k.managedKwh));
chk('kw() and kwh() print their units',
  /MW$/.test(F.kw(2000)) && /MWh$/.test(F.kwh(2000)),
  F.kw(2000) + ' vs ' + F.kwh(2000));

console.log('\nRULE 4 \u2014 MODELLED IS NOT METERED');
chk('two savings totals, both populated in the sample',
  k.savingsMetered > 0 && k.savingsModeled > 0,
  F.money(k.savingsMetered) + ' metered / ' + F.money(k.savingsModeled) + ' modelled');
const allSavings = rows.reduce((n, r) => n + (r.annualSavings || 0), 0);
chk('neither total silently equals the combined figure',
  k.savingsMetered !== allSavings && k.savingsModeled !== allSavings);
// A dispatching site with no settled bill yet must not drag the realised total to zero,
// and must not inflate the metered site count either. It gets its own figure.
// Compare like with like: `meteredSites` spans dispatching AND connected sites, so the
// test counts dispatching sites carrying a figure rather than the whole metered set.
const dispatchWithFigure = a.dispatching.filter(r => r.savingsBasis === 'metered' && r.annualSavings);
chk('a live site with no metered saving is excluded, not counted as zero',
  rows.some(r => F.isDispatching(r) && r.savingsBasis === 'metered' && !r.annualSavings) &&
  dispatchWithFigure.length < a.dispatching.length,
  dispatchWithFigure.length + ' of ' + a.dispatching.length + ' dispatching sites billed');
chk('and is counted separately rather than silently dropped',
  k.awaitingMeter > 0, k.awaitingMeter + ' live, not yet billed');
chk('metered total is the sum of dispatching sites that carry a figure',
  k.savingsMetered === dispatchWithFigure.reduce((n, r) => n + r.annualSavings, 0));
// The invariant: managed capacity and realised savings describe the SAME sites.
// A paused site drops out of both, not one.
chk('realised savings and managed capacity share one population',
  a.dispatching.length === k.meteredSites + k.awaitingMeter +
    a.dispatching.filter(r => r.savingsBasis !== 'metered').length);
chk('a paused site contributes to neither managed capacity nor realised savings',
  !a.dispatching.some(r => r.status === 'paused') &&
  k.savingsMetered === dispatchWithFigure.reduce((n, r) => n + r.annualSavings, 0));

console.log('\nGEOGRAPHY');
chk('sites roll up by state', a.byPlace.length >= 3, a.byPlace.length + ' states');
chk('states with no live site still appear',
  a.byPlace.some(p => p.sites > 0 && p.live === 0));
chk('markets are split organized vs not',
  a.byMarket.some(m => m.organized) && a.byMarket.some(m => !m.organized));
chk('organized share is a fraction of managed power, not of everything',
  k.organizedPct >= 0 && k.organizedPct <= 1,
  Math.round(k.organizedPct * 100) + '% organized');
chk('an off-list facility type is flagged rather than folded into Other',
  a.offSegment.length > 0,
  a.offSegment.map(r => r.segment).join(','));

console.log('\nRENDER');
w.document.body.insertAdjacentHTML('beforeend', '<div id="mf-block"></div>');
F.render(a, true);
const html = w.document.getElementById('mf-block').innerHTML;
chk('block renders', html.length > 2000, html.length + ' chars');
chk('sample ribbon is painted in sample mode', html.indexOf('Sample') >= 0);
chk('headline figure carries a unit', /Power under management/.test(html) && /MW/.test(html));
chk('no NaN or undefined reached the output',
  html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0);

/* ── Boot loader ──────────────────────────────────────────────────────────
   omega-boot.js is cosmetic, which is exactly why it needs asserting: a
   cosmetic overlay that fails closed turns a cosmetic problem into a blank
   unusable page. These check the safeguards are all still wired, and that
   it has not drifted away from the inline loader in index.html that it was
   extracted from. */
console.log('\nBOOT LOADER');
const bootSrc = fs.readFileSync('omega-boot.js', 'utf8');
const idxSrc  = fs.readFileSync('index.html', 'utf8');

chk('index.html keeps its own inline loader and does NOT load this file',
  idxSrc.indexOf('omega-boot.js') < 0 && /id="omega-boot"/.test(idxSrc));
chk('module stands down if a page already defines _omegaReady',
  /typeof global\._omegaReady === 'function'\) return/.test(bootSrc));
chk('it exposes the same dismiss API index.html uses',
  /global\._omegaReady = ready/.test(bootSrc) && /window\._omegaReady = function/.test(idxSrc));
chk('it reuses index.html\u2019s .hide class rather than inventing one',
  /' hide'/.test(bootSrc) && /#omega-boot\.hide/.test(idxSrc));

// Fail-open: four independent lifts, and the CSS one must survive dead JS.
chk('pure-CSS failsafe present, as in index.html',
  /ob-failsafe/.test(bootSrc) && /ob-failsafe/.test(idxSrc));
chk('JS ceiling sits INSIDE the CSS failsafe', (function () {
  const js  = Number((bootSrc.match(/HOLD_MAX_MS\s*=\s*(\d+)/) || [])[1]);
  const css = Number((bootSrc.match(/FAILSAFE_S\s*=\s*(\d+)/) || [])[1]) * 1000;
  return js > 0 && css > 0 && js < css;
})(), 'JS 6000ms < CSS 8000ms');
chk('bfcache restore lifts it', /persisted/.test(bootSrc));
chk('an uncaught throw lifts it', /unhandledrejection/.test(bootSrc));

// The bug that tore the overlay off ~100ms into every load.
chk('throw handler is NOT capture-phase (resource 404s must not lift it)',
  !/addEventListener\('error'[\s\S]{0,200}?\}, true\)/.test(bootSrc) &&
  /e\.target !== global\) return/.test(bootSrc));

// The bug that revealed the empty shell on any slow auth.
chk('load-based net only applies to pages without data-wait="auth"',
  /if \(!WAIT_FOR_READY\) \{[\s\S]{0,220}addEventListener\('load'/.test(bootSrc));

// It never hides <body>: an interrupted removal must not leave a blank page.
chk('overlay never sets visibility on <body>',
  !/body\{visibility/.test(bootSrc) && !/classList\.add\('ob-on'\)/.test(bootSrc));

// Every page that ships the loader must declare its intent, or the net above
// pulls the overlay a second in.
['fleet.html', 'commission.html'].forEach(function (f) {
  const s = fs.readFileSync(f, 'utf8');
  chk(f + ' loads the boot loader and declares data-wait="auth"',
    /<script src="\/omega-boot\.js" data-wait="auth"><\/script>/.test(s));

  /* The signed-OUT branch is the one that gets forgotten: it returns early,
     so a dismissal placed only after it never runs and a signed-out visitor
     stares at the overlay until the failsafe. Pull the `if (!user) { … }`
     block out and require a dismissal inside it. Matched loosely on purpose
     — a page may call OmegaBoot.ready() directly or route both branches
     through a local helper, and both are fine. */
  const branch = (s.match(/if \(!user\) \{[\s\S]*?return;/) || [''])[0];
  chk(f + ' dismisses on the signed-out path (the early return)',
    /ready\(\)|done\(\)/.test(branch));
  chk(f + ' dismisses on the signed-in path too',
    /OmegaBoot\.ready\(\)/.test(s.replace(branch, '')) ||
    /load\(\)\.then\(done, done\)/.test(s));
});

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') +
  pass + ' passed, ' + fail + ' failed\x1b[0m\n');
process.exit(fail ? 1 : 0);
