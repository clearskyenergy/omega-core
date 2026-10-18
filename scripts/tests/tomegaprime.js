#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Omega Prime sets up the real project (2026-10-16, Tommy: "it does the set
 * up and system like the artifact sandbox"). Holds:
 *   - omega-prime-project.js: the unit list (the tenant's own products first,
 *     the shipped XXL after), the battery entry, the ZIP and peaks readers,
 *     and the project record in the shapes editor.html's _loadProject reads;
 *   - the record touches no drawing key beyond the empty arrays a new project
 *     is created with, and Prime's updates touch none (drawingWriteAllowed);
 *   - omega-prime.html holds no verdict rule, asks through the one client
 *     (omega-grid-verdict.js), reads the tenant's list, the utility's rates,
 *     homes the project by the orgId claim then the email domain, and opens
 *     Site Map with from=prime;
 *   - omega-prime-handoff.js, run in a VM: fills the entry from the editor's
 *     own catalog, opens the BESS Guided Build once, drops the parameter,
 *     and does nothing without it. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
var PP = require(path.join(ROOT, 'omega-prime-project.js'));

/* ── the unit list ──────────────────────────────────────────────────── */
var CC = ['CLEANCELL-CC290-125-REV-H', 'CLEANCELL-LGJP2-1000-REV-H', 'CLEANCELL-SM-1000-REV-H'];
var none = PP.units(null);
assert.deepEqual(none.map(function (u) { return u.key; }), CC.concat(['FENECON-IND-XXL']), 'the shipped reference units: CleanCell Rev H, the XXL after'); count++;
assert.equal(none[none.length - 1].kw, 2508); count++;
/* the CleanCell specs are read from omega-cleancell-catalog.js, never copied */
var REF = require(path.join(ROOT, 'omega-cleancell-catalog.js')).entries();
CC.forEach(function (k, i) {
  assert.equal(none[i].kw, REF[k].kw); assert.equal(none[i].kwh, REF[k].kwh); count += 2;
  assert.equal(none[i].lFt, null, 'a footprint the brochure has not released is never drawn: ' + k); count++;
  assert.equal(none[i].ref, true); assert.ok(!none[i].tenant); count += 2;
  ['price', 'eqcost', 'cost', 'listPrice'].forEach(function (f) { assert.ok(!(f in none[i]), 'no price on a reference unit: ' + f); count++; });
});
assert.match(none[0].name, /^CleanCell /); count++;
assert.ok(!/omega-cleancell-catalog/.test(read('omega-prime-project.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/require\('\.\/omega-cleancell-catalog\.js'\)/, '')), 'one require, no second copy of the specs'); count++;
var tenant = { keys: ['CLEANCELL-CC-2000', 'CLEANCELL-MOD-1', 'CLEANCELL-NOFOOT'], entries: {
  'CLEANCELL-CC-2000': { mfr: 'Clean Cell', model: 'CC-2000', kw: 1000, kwh: 2000, usable: 1900, dur: 2, widthFt: 8, depthFt: 20, xfmr: '1500 kVA' },
  'CLEANCELL-MOD-1': { mfr: 'Clean Cell', model: 'Module', kwh: 5 },                       /* no kW: not placeable */
  'CLEANCELL-NOFOOT': { mfr: 'Clean Cell', model: 'R60', kw: 60, kwh: 61.44 } } };
var us = PP.units(tenant);
assert.deepEqual(us.map(function (u) { return u.key; }), ['CLEANCELL-CC-2000', 'CLEANCELL-NOFOOT'].concat(CC, ['FENECON-IND-XXL']), 'the tenant\'s own products lead, the reference units after, the XXL last'); count++;
assert.equal(us[0].name, 'Clean Cell CC-2000'); assert.equal(us[0].lFt, 20); assert.equal(us[0].wFt, 8); assert.equal(us[0].tenant, true); count += 4;
assert.equal(us[1].lFt, null, 'a footprint not on file stays unknown, never assumed'); assert.equal(us[1].hours, 1.02); count += 2;
var own = PP.units({ ownOnly: true, keys: tenant.keys, entries: tenant.entries });
assert.deepEqual(own.map(function (u) { return u.key; }), ['CLEANCELL-CC-2000', 'CLEANCELL-NOFOOT'], 'an own-only manufacturer is offered its own batteries only'); count++;
assert.deepEqual(PP.units({ ownOnly: true, keys: ['FEN-OWN'], entries: { 'FEN-OWN': { mfr: 'FENECON', model: 'Industrial M', kw: 100, kwh: 200 } } }).map(function (u) { return u.key; }), ['FEN-OWN'], 'a maker\'s own platform is never offered another maker\'s reference unit'); count++;
assert.equal(PP.units({ ownOnly: true, keys: ['CLEANCELL-MOD-1'], entries: tenant.entries })[0].key, 'FENECON-IND-XXL', 'own-only with nothing placeable of its own still gets a unit'); count++;
assert.deepEqual(PP.units({ keys: ['FEN-XXL'], entries: { 'FEN-XXL': { mfr: 'FENECON', model: 'Industrial XXL', kw: 2508, kwh: 5015 } } }).map(function (u) { return u.key; }), ['FEN-XXL'].concat(CC), 'no second XXL when the list carries it'); count++;
assert.equal(PP.units({ keys: [CC[0]], entries: (function () { var o = {}; o[CC[0]] = { mfr: 'CleanCell US', model: 'CC290/125', kw: 125, kwh: 289.3 }; return o; })() })
  .filter(function (u) { return u.key === CC[0]; }).length, 1, 'a reference unit the tenant already lists is never offered twice'); count++;
['price', 'eqcost', 'cost'].forEach(function (k) { assert.ok(!(k in PP.XXL) && !(k in us[0]), 'no price on a unit: ' + k); count++; });

/* ── readers ────────────────────────────────────────────────────────── */
assert.equal(PP.zipOf('3400 S Federal St, Chicago, IL, 60616'), '60616'); assert.equal(PP.zipOf('12 Main St, Joliet IL 60435-1234'), '60435'); assert.equal(PP.zipOf('no zip here'), ''); count += 3;
assert.deepEqual(PP.peaks('1,420  1,388\n1402, 1510 kW'), [1420, 1388, 1402, 1510]); assert.equal(PP.peaks('1 2 3 4 5 6 7 8 9 10 11 12 13 14').length, 12); assert.deepEqual(PP.peaks(''), []); count += 3;

/* ── the project record ─────────────────────────────────────────────── */
var grid = { lat: 41.81522, lng: -87.62261, substation: { name: 'Crawford' }, circuit: { id: 'Z13733', netKw: 240 }, verdict: { key: 'study' }, source: 'omega-prime' };
var st = { addr: '3400 S Federal St, Chicago, IL 60616', lat: 41.81522, lng: -87.62261, geoSrc: 'U.S. Census geocoder', unit: PP.XXL, grid: grid,
  load: { utility: 'ComEd', demandRate: 19.85, peaksKw: [1420], peakKw: 1420 },
  area: { s: 41.8151, w: -87.6227, n: 41.8153, e: -87.6225, wFt: 60.4, hFt: 40.2, sqft: 2428.1 }, unitAt: { lat: 41.81521, lng: -87.62262 }, poi: null, conduitFt: null };
var who = { uid: 'u1', email: 'Rep@ClearSky-USA.com', name: 'Rep', orgId: 'clearsky-usa.com' };
var d = PP.projectDoc(st, who, 'TS');
assert.equal(d.orgId, 'clearsky-usa.com'); assert.equal(d.uid, 'u1'); assert.equal(d.ownerEmail, 'rep@clearsky-usa.com'); count += 3;
assert.equal(d.type, 'bess'); assert.deepEqual(d.siteScopes, ['bess']); assert.equal(d.stage, 'candidate'); assert.equal(d.name, st.addr); assert.equal(d.address, st.addr); count += 5;
assert.deepEqual(d.mapState, { lat: 41.81522, lng: -87.62261, zoom: 19 }); count++;
assert.equal(d.bessList.length, 1); assert.equal(d.bessList[0].catalogKey, 'FENECON-IND-XXL'); assert.equal(d.bessList[0].kw, '2508'); assert.equal(d.bessList[0]._fromPrime, true); count += 4;
assert.equal(d.grid, grid); assert.equal(d.load.demandRate, 19.85); assert.equal(d.createdAt, 'TS'); count += 3;
assert.deepEqual(d.elements, []); assert.deepEqual(d.conduits, []); assert.deepEqual(d.annotations, []); assert.ok(!('shapes' in d) && !('geoElements' in d), 'no drawing is forged'); count += 4;
assert.deepEqual(d.prime.layout.area, { s: 41.8151, w: -87.6227, n: 41.8153, e: -87.6225, wFt: 60, hFt: 40, sqft: 2428 }); assert.deepEqual(d.prime.layout.unit, { lat: 41.81521, lng: -87.62262 }); assert.equal(d.prime.layout.poi, null); count += 3;
assert.ok(!('grid' in PP.projectDoc({ addr: 'x', lat: 1, lng: 2, unit: PP.XXL }, who)), 'no grid answer, no grid field'); count++;

/* ── project types, from the editor's catalogs ─────────────────────── */
assert.equal(PP.primeType('evl2'), 'ev'); assert.equal(PP.primeType('datacenter'), 'compute'); assert.equal(PP.primeType('microgrid'), 'microgrid'); assert.equal(PP.primeType('solar+bess'), 'microgrid'); assert.equal(PP.primeType(''), ''); count += 5;
assert.equal(PP.linkQuery({ addr: '3400 S Federal St, Chicago, IL 60616', lat: 41.8, lng: -87.6, projectId: 'p1', type: 'evl2', step: 'logic' }),
  'addr=' + encodeURIComponent('3400 S Federal St, Chicago, IL 60616') + '&lat=41.8&lng=-87.6&project=p1&type=ev&step=logic'); count++;
assert.equal(PP.linkQuery({ step: 'quote' }), 'step=quote'); count++;
assert.equal(PP.linkQuery({ org: 'ClearSky-USA.com', projectId: 'p' }), 'project=p&org=clearsky-usa.com'); count++;
assert.equal(PP.linkQuery({ org: 'fenecon.de' }), 'org=fenecon.com'); count++;
assert.equal(PP.orgId('not an org'), ''); assert.equal(PP.linkQuery({ org: '../omega_orgs' }), ''); count += 2;
var CAT = require(path.join(ROOT, 'omega-site-catalogs.js'));
var edSrc = read('editor.html');
function sliceObj(name) {
  var token = 'var ' + name + ' = {', start = edSrc.indexOf(token), i = edSrc.indexOf('{', start), depth = 0, inStr = false, q = '', esc = false;
  if (start < 0) throw new Error(name);
  for (; i < edSrc.length; i++) {
    var c = edSrc[i];
    if (inStr) { if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; } if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === '/' && edSrc[i + 1] === '/') { while (i < edSrc.length && edSrc[i] !== '\n') i++; continue; }
    if (c === '/' && edSrc[i + 1] === '*') { i += 2; while (i < edSrc.length && !(edSrc[i] === '*' && edSrc[i + 1] === '/')) i++; i++; continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) return edSrc.slice(start, i + 1); }
  }
  throw new Error('unclosed ' + name);
}
var catSrc = [sliceObj('EVC_POST'), sliceObj('EVC_UNIT'), sliceObj('EVC_L2'), sliceObj('EVC_CAB'), sliceObj('DC_CATALOG'), sliceObj('DER_PV_MODULES'), sliceObj('DERC_ALT')].join(';\n')
  + ';\nthis.EVC_POST=EVC_POST;this.EVC_UNIT=EVC_UNIT;this.EVC_L2=EVC_L2;this.EVC_CAB=EVC_CAB;this.DC=DC_CATALOG;this.MOD=DER_PV_MODULES;this.ALT=DERC_ALT;';
var live = {};
vm.runInNewContext(catSrc.replace(/img:EVIMG_[A-Z0-9_]+,?/g, ''), live);
function sameNums(got, src, fields, label) {
  fields.forEach(function (f) {
    var a = got[f] == null ? null : got[f], b = src[f] == null ? null : src[f];
    assert.equal(a, b, label + ' ' + f);
    count++;
  });
}
var ev = PP.forType('ev', null, CAT);
assert.ok(ev.some(function (u) { return u.key === 'tesla_v4_post'; }) && ev.some(function (u) { return u.key === 'autel_dh480'; }) && ev.some(function (u) { return u.key === 'autel_ac_pro'; }), 'EV chargers from the editor catalog'); count++;
ev.forEach(function (u) {
  var src = live.EVC_POST[u.key] || live.EVC_UNIT[u.key] || live.EVC_L2[u.key] || live.EVC_CAB[u.key];
  assert.ok(src, 'ev unit is in the editor catalog: ' + u.key); count++;
  sameNums(u, src, ['kw'], u.key);
  assert.equal(u.lFt, src.lf || null); assert.equal(u.wFt, src.wf || null); count += 2;
  ['price', 'eqcost', 'cost', 'listPrice'].forEach(function (f) { assert.ok(!(f in u), 'no price on ' + u.key); count++; });
});
var comp = PP.forType('compute', null, CAT);
Object.keys(live.DC).forEach(function (k) {
  var u = comp.filter(function (x) { return x.key === k; })[0];
  assert.ok(u, 'compute catalog unit ' + k); count++;
  assert.equal(u.kw, live.DC[k].kw); assert.equal(u.lFt, live.DC[k].lf); assert.equal(u.wFt, live.DC[k].wf); count += 3;
});
var sol = PP.forType('solar', null, CAT);
assert.equal(sol.filter(function (u) { return u.key === 'nextnrg-eagle-g7b'; })[0].watts, live.MOD['nextnrg-eagle-g7b'].watts); count++;
assert.equal(sol.filter(function (u) { return u.key === 'generic-550'; })[0].watts, live.MOD['generic-550'].watts); count++;
assert.ok(sol.some(function (u) { return u.key === 'array:rooftop'; }) && sol.some(function (u) { return u.key === 'array:fixed-ground'; }), 'array layouts from DER_SOLAR_PRESETS'); count++;
assert.ok(sol.every(function (u) { return u.kw == null; }), 'a module wattage is not invented into a system kW'); count++;
var mg = PP.forType('microgrid', null, CAT).map(function (u) { return u.key; });
CC.concat(['FENECON-IND-XXL', 'nextnrg-eagle-g7b', 'array:rooftop', 'fuelcell', 'gen_diesel', 'gen_ng', 'microturbine']).forEach(function (k) {
  assert.ok(mg.indexOf(k) >= 0, 'microgrid includes ' + k); count++;
});
assert.equal(PP.forType('microgrid', null, CAT).filter(function (u) { return u.key === 'fuelcell'; })[0].kw, live.ALT.fuelcell.kw); count++;
var evDoc = PP.projectDoc({ addr: st.addr, lat: st.lat, lng: st.lng, unit: ev[0], type: 'ev' }, who);
assert.equal(evDoc.type, 'ev'); assert.deepEqual(evDoc.bessList, []); assert.equal(evDoc.prime.type, 'ev'); count += 3;
assert.equal(PP.projectDoc({ addr: 'x', lat: 1, lng: 2, unit: PP.XXL, type: 'microgrid' }, who).type, 'microgrid'); count++;
var pgSrc = read('omega-prime.html');
assert.ok(pgSrc.indexOf('data-t="microgrid"') > 0 && pgSrc.indexOf('<small>next</small>') < 0 && !/data-t="ev"[^>]*disabled/.test(pgSrc), 'EV, Solar, Compute and Microgrid are selectable'); count++;
assert.match(pgSrc, /qparam\('lat'\)/); assert.match(pgSrc, /PP\.primeType\(qparam\('type'\)\)/); assert.match(pgSrc, /Sized in Site Map/); count += 3;

/* Site Map's push builds the same query */
var factsFn = edSrc.slice(edSrc.indexOf('function omegaAddrOk'), edSrc.indexOf('function omegaPushLogic'));
var fx = { document: { getElementById: function (id) { return id === 'addr-in' ? { value: '' } : (id === 'omega-addr-in' ? { value: '' } : null); } },
  _lastAddr: '3400 S Federal St, Chicago, IL 60616', _lastCenter: { lat: 41.81522, lng: -87.62261 }, _projectId: 'proj-9',
  OmegaProjectTypes: { current: function () { return 'datacenter'; } }, OmegaPrimeProject: PP, opened: '' };
fx.window = fx; fx.window.open = function (url) { fx.opened = url; };
vm.createContext(fx); vm.runInContext(factsFn + '\nomegaPushPrime();', fx);
assert.equal(fx.opened, '/omega-prime?' + PP.linkQuery({ addr: '3400 S Federal St, Chicago, IL 60616', lat: 41.81522, lng: -87.62261, projectId: 'proj-9', type: 'datacenter' })); count++;
vm.runInContext('omegaPushPrime("logic");', fx);
assert.ok(/step=logic$/.test(fx.opened), fx.opened); count++;
assert.match(edSrc, /<script src="\/omega-prime-project\.js"><\/script>/); assert.match(edSrc, /window\._lastAddr=addr/); assert.match(factsFn, /OmegaProjectTypes\.get/); count += 3;
fx.OmegaProjectTypes = { get: function () { return 'ev'; }, current: function () { return 'bess'; } };
fx._projectOrgId = 'nextnrg.com';
fx._projOrgId = function () { return 'clearsky-usa.com'; };
vm.runInContext('omegaPushPrime();', fx);
assert.ok(/type=ev(?:&|$)/.test(fx.opened) && /(?:^|&)org=nextnrg\.com(?:&|$)/.test(fx.opened.split('?')[1] || ''), fx.opened); count++;
fx._projectOrgId = '';
vm.runInContext('omegaPushPrime();', fx);
assert.ok(/(?:^|&)org=clearsky-usa\.com(?:&|$)/.test(fx.opened.split('?')[1] || ''), fx.opened); count++;

/* Site Map reads every field the record is made with */
var ed = read('editor.html');
assert.match(ed, /if\(d\.bessList\)S\.bessList=d\.bessList;/); assert.match(ed, /const ms = d\.mapState \|\| \{\};/); assert.match(ed, /S\.grid\s+= \(d\.grid\s+&& typeof d\.grid==='object'\)/);
assert.match(ed, /const savedAddr = d\.address/); assert.match(ed, /OmegaWorkspaces\.setProject\(d\.type, d\.siteScopes, true\)/); count += 5;
/* and none of what Prime writes or updates is a drawing key */
var rules = read('firestore.rules'), keys = JSON.parse(rules.match(/function drawingKeys\(\) \{\s*return (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
['grid', 'load', 'prime', 'bessList', 'mapState', 'updatedAt', 'name', 'address', 'type', 'siteScopes'].forEach(function (k) { assert.ok(keys.indexOf(k) < 0, 'Prime writes a drawing key: ' + k); count++; });

/* ── the page ───────────────────────────────────────────────────────── */
var pg = read('omega-prime.html');
['net >= UNIT.kw', 'else if (net > 0)', 'SMALLEST_OFFER_KW', "'<b>Fits.</b>"].forEach(function (t) { assert.ok(pg.indexOf(t) < 0, 'a verdict rule is in Omega Prime: ' + t); count++; });
assert.match(pg, /GV\.ask\(body\)/); assert.match(pg, /GV\.circuitBody\(S\.probe, 0, S\.circuitUtility\)/); assert.match(pg, /GV\.fields\(S\.verdict, S\.probe, 0\)/); count += 3;
var order = ['/omega-comed-layers.js', '/omega-bess-products.js', '/omega-cleancell-catalog.js?v=20261010-revh2', '/omega-site-catalogs.js', '/omega-grid-verdict.js', '/omega-prime-project.js'].map(function (f) { return pg.indexOf('<script src="' + f + '"></script>'); });
assert.ok(order.every(function (i, k) { return i > 0 && (k === 0 || i > order[k - 1]); }), 'the shared modules load in order'); count++;
assert.match(pg, /B\.load\(\)\.then\(function \(t\) \{ tenantList = t; showType\(S\.type, true\);/); count++;
assert.match(pg, /type: S\.type/); assert.match(pg, /S\.projectId = pid/); assert.match(pg, /function paintLogic/); assert.match(pg, /PP\.orgId\(qparam\('org'\)\)/); count += 4;
assert.match(pg, /var id = PP\.orgId\(w\.orgId\)/); assert.ok(pg.indexOf('PP.orgId(w.orgId) || w.orgId') < 0, 'a link org is the safe id, never the raw claim'); count += 2;
assert.match(pg, /action: 'design'/); assert.match(pg, /function quoteLines/); assert.ok(pg.indexOf('base: d.base') < 0 && pg.indexOf('total: r.total') < 0, 'the Logic handoff does not send the cost-model dollars'); count += 3;
assert.match(pg, /fetch\('\/api\/utility-rates\?zip=' \+ encodeURIComponent\(zip\)/); count++;
assert.match(pg, /var claim = r && r\.claims && r\.claims\.orgId;/); assert.match(pg, /orgId: claim \? String\(claim\) : \(B && B\.orgOf \? B\.orgOf\(u\.email\) : ''\)/, 'homed as userOrg() is: the claim, then the email domain'); count += 2;
assert.match(pg, /db\.collection\('projects'\)\.add\(PP\.projectDoc\(docState\(\), w, FV\.serverTimestamp\(\)\)\)/); count++;
assert.match(pg, /'\/editor\.html\?id=' \+ encodeURIComponent\(S\.projectId\) \+ '&from=prime'/); count++;
assert.ok(!/FENECON\\'s quote|send FENECON|routed to FENECON/.test(pg), 'the routing names the chosen unit\'s maker, not one brand'); count++;
assert.match(ed, /<script src="\/omega-grid-panel\.js"><\/script>[\s\S]{0,400}<script src="\/omega-prime-handoff\.js"><\/script>/); count++;

/* ── the hand-off, in a VM ──────────────────────────────────────────── */
function handoff(search, catalogEntry) {
  var opened = 0, url = null, S = { bessList: [PP.bessEntry(PP.XXL)] };
  var ctx = { S: S, console: { info: function () {}, warn: function () {} }, setTimeout: function (f) { f(); }, URL: URL,
    BESS_CATALOG: catalogEntry ? { 'FENECON-IND-XXL': catalogEntry } : {},
    location: { search: search, href: 'https://x.test/editor.html' + search + '#v' },
    history: { state: null, replaceState: function (s, t, u) { url = u; } },
    document: { readyState: 'complete', getElementById: function (id) { return id === 'addr-in' ? {} : (id === 'bm-catalog' ? { value: '' } : null); } },
    openBessGuidedBuild: function () { opened++; }, __omegaPrimeHandoffNoAuto: true };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('omega-prime-handoff.js'), ctx);
  var ran = ctx.OmegaPrimeHandoff.run({ wait: 1, max: 30 });
  return { ran: ran, opened: opened, url: url, b: S.bessList[0] };
}
var h = handoff('?id=p1&from=prime', { mfr: 'FENECON', model: 'FENECON Industrial XXL — 2.508 MW', kw: 2508, kwh: 5015, inv: 'Central Inverter, 2.5 MW class', ikva: 2508, controller: 'FEMS', gridConnectV: '480V 3-phase AC', _incPCS: true });
assert.equal(h.ran, true); assert.equal(h.opened, 1, 'the Guided Build opens once'); assert.equal(h.url, '/editor.html?id=p1#v', 'from=prime is dropped'); count += 3;
assert.equal(h.b.inv, 'Central Inverter, 2.5 MW class'); assert.equal(h.b.ikva, '2508'); assert.equal(h.b._controller, 'FEMS'); assert.equal(h.b._gridConnectV, '480V 3-phase AC'); assert.equal(h.b._incPCS, true); count += 5;
var n = handoff('?id=p1', {}); assert.equal(n.ran, false); assert.equal(n.opened, 0, 'inert without the parameter'); count += 2;
var late = handoff('?id=p1&from=prime', null); assert.equal(late.opened, 1, 'a catalog entry that never lands still opens the build with what Prime wrote'); count++;

console.log('tomegaprime: ' + count + ' assertions passed');
