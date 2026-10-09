#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/render-mission-sales.js — JARVIS's Sales view, rendered and checked
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Boots the REAL mission.html in Chromium, signed in as a ClearSky staff
   address, with the modular Firebase SDK stubbed, the twin's endpoints
   answered with an empty status, and /api/sales served by the REAL
   api/sales.js on the in-memory Firestore double (scripts/_lib/firestore-
   double.js) seeded with a small book: a signup waiting two days, a trial
   ending, an unanswered demo request that came from a LinkedIn post, a
   draft, a post with its numbers, prospects at several stages and a
   harvested name to research. On a desktop and a 390px phone. Nothing
   leaves the machine.

     node scripts/render-mission-sales.js              # a JSON line per viewport
     node scripts/render-mission-sales.js --shots DIR  # plus screenshots
     npm run check:sales

   It fails on an uncaught page error, sideways scroll on the phone, and on
   each product assertion: the eight tiles, Today leading with the signup to
   approve and linking to its console page, the demo request waiting with its
   source, the cold-email line in What to change, the funnel, the LinkedIn
   post with its numbers, the Command Center's Sales panel and its door, the
   signup and the request in Needs you, logging a reply (the double holds
   it), and the settings refusing a gmail.com sender and saving a
   clearsky-usa.com one. Then the OFFICE view on the same book: the floor's
   seven rooms back to front, Sales lit off a run minutes old, Billing amber
   off one three days old, the rest dark; the overview's runs and needs
   (the plan waiting, the cold-email block, the overdue desk); clicking the
   Sales room opens Nora's drawer with the week's proposed plan, Approve
   writes the PLAN line to the double, a note to the desk writes the NOTE
   line, the numbers read 1 of 5 runs, and ◀ Office returns the overview.
   Not on the npm test chain: needs Chromium.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-mission-sales: Playwright not found (' + PW + '); skipped'); process.exit(0); }
var shotsAt = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? (process.argv[i + 1] || os.tmpdir()) : null; })();
if (shotsAt && !fs.existsSync(shotsAt)) fs.mkdirSync(shotsAt, { recursive: true });

/* ── the server side: the real endpoint on the double ── */
var FD = require('./_lib/firestore-double');
var db = new FD.DB();
var STAFF = { uid: 'tom', email: 'tom@clearsky-usa.com', staff: true };
FD.mock('../api/_lib/admin', {
  db: function () { return db; },
  handler: function (fn) {
    return function (req, res) {
      Promise.resolve().then(function () { return fn(req, res); })
        .then(function (out) { res.status(200).json(out); })
        .catch(function (e) { res.status(e.status || 500).json({ error: e.message }); });
    };
  },
  authenticate: async function (req) {
    if (req.headers.authorization !== 'Bearer staff-token') { var e = new Error('invalid token'); e.status = 401; throw e; }
    return STAFF;
  },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  safeOrg: function (v) { v = String(v || '').toLowerCase(); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : ''; },
  FieldValue: function () { return {}; }
});
var sales = require('../api/sales');

var DAY = 86400000, NOW = Date.now();
/* the ISO week the plans are keyed by, computed as the page computes it */
function isoWeek(d) { var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); var y = t.getUTCFullYear(); var w = Math.ceil((((t - Date.UTC(y, 0, 1)) / 864e5) + 1) / 7); return y + '-W' + String(w).padStart(2, '0'); }
var WEEK = isoWeek(new Date());
function ago(d) { return new Date(NOW - d * DAY).toISOString(); }
function ahead(d) { return new Date(NOW + d * DAY).toISOString(); }
var SEED = {
  'omega_orgs/pendingco.example': { name: 'Pendingco Solar', status: 'pending', createdAt: ago(2.3), signup: { email: 'sam@pendingco.example' } },
  'omega_orgs/pendingco.example/billing/current': { tier: 'trial', trialEndsAt: ahead(14) },
  'omega_orgs/trialco.example': { name: 'Trialco EPC', status: 'active', createdAt: ago(13), approvedAt: new Date(NOW - 13 * DAY + 5 * 3600000).toISOString(), signup: { email: 'tia@trialco.example' } },
  'omega_orgs/trialco.example/billing/current': { tier: 'trial', trialEndsAt: ahead(1.5) },
  'omega_orgs/trialco.example/members/u1': { email: 'tia@trialco.example', role: 'owner', status: 'active' },
  'team_members/trialco.example__tia@trialco.example': { orgId: 'trialco.example', email: 'tia@trialco.example', lastSeen: ago(0.3) },
  'projects/p1': { orgId: 'trialco.example', createdAt: ago(3) },
  'sales_config/current': { enabled: true, linkedinChannel: 'gmail-drafts', dailyDraftCap: 20 },
  'sales_activity/d1': { kind: 'demo-request', at: ago(4), by: 'website', prospectId: 'acme.example', name: 'Jane Doe', email: 'jane@acme.example', company: 'Acme Solar',
    interest: 'OMEGA Platform', message: 'Two sites in Joliet', source: { utm_source: 'linkedin', utm_campaign: '2026-w39-grid' }, summary: 'Jane Doe (Acme Solar) asked for a demo' },
  'sales_activity/x1': { kind: 'email-drafted', at: ago(0.2), by: 'agent:sales agent', prospectId: 'trialco.example', orgId: 'trialco.example', to: 'tia@trialco.example', ref: 'g-1', summary: 'Trial ends Tuesday: what you built' },
  'sales_activity/l1': { kind: 'linkedin-drafted', at: ago(6), by: 'agent:sales agent', ref: '2026-w39-grid', campaign: '2026-w39-grid', summary: 'Grid headroom, parcel by parcel' },
  'sales_activity/l2': { kind: 'linkedin-published', at: ago(5), by: 'tom@clearsky-usa.com', ref: '2026-w39-grid', url: 'https://www.linkedin.com/feed/update/1' },
  'sales_activity/l3': { kind: 'linkedin-stats', at: ago(1), by: 'tom@clearsky-usa.com', ref: '2026-w39-grid', stats: { impressions: 912, reactions: 14, comments: 3, clicks: 22 } },
  'sales_prospects/acme.example': { id: 'acme.example', company: 'Acme Solar', stage: 'contacted', inbound: true, score: 65, contacts: [{ name: 'Jane Doe', email: 'jane@acme.example' }], updatedAt: ago(4), createdAt: ago(4) },
  'sales_prospects/bright.example': { id: 'bright.example', company: 'Bright Installers', stage: 'target', score: 35, state: 'IL', next: { action: 'Intro email about plan sets', due: ago(1).slice(0, 10) }, updatedAt: ago(3), createdAt: ago(3) },
  'sales_prospects/volt.example': { id: 'volt.example', company: 'Volt EPC', stage: 'demo', score: 55, updatedAt: ago(4), createdAt: ago(9) },
  /* the office: two desks have logged a run, the rest never have */
  'sales_activity/r1': { kind: 'agent-run', at: ago(0.002), by: 'agent:sales', summary: 'SALES: answered 1 demo request with three slots; 0 signups waiting; 4 names researched' },
  'sales_activity/pl1': { kind: 'note', at: ago(1), by: 'agent:ada', summary: 'PLAN ' + WEEK + ' SALES: proposed — 3 demos booked; 10 prospects researched; every request answered the same day' },
  'sales_activity/r2': { kind: 'agent-run', at: ago(3), by: 'agent:billing', summary: 'BILLING: 2 invoices past due, 1 reminder drafted' },
  /* the protocol: one approval waiting on Thomas (a second was answered), one handoff between desks */
  'sales_activity/ap1': { kind: 'note', at: ago(0.5), by: 'agent:billing', summary: 'BILLING: APPROVAL #BILLING-20261006-1 requested — credit of one month for Acme Solar, invoice 1042' },
  'sales_activity/ap2': { kind: 'note', at: ago(2), by: 'agent:sales', summary: 'SALES: APPROVAL #SALES-20261004-1 requested — cold email to a public mailbox' },
  'sales_activity/ap3': { kind: 'note', at: ago(1.5), by: 'agent:sales', summary: 'SALES: APPROVAL #SALES-20261004-1 declined' },
  'sales_activity/h1': { kind: 'note', at: ago(0.3), by: 'agent:support', summary: 'SUPPORT: HANDOFF #SUPPORT-20261006-1 → Theo: Grid Atlas map blank on Safari' },
  'sales_candidates/nine-dot-energy': { key: 'nine-dot-energy', company: 'Nine Dot Energy LLC', status: 'new', projects: 77, states: ['NY'] }
};
function reset() { db.data.clear(); Object.keys(SEED).forEach(function (k) { db.seed(k, SEED[k]); }); }
reset();

var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
var server = http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/sales') {
    var body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      var q = {}; u.searchParams.forEach(function (v, k) { q[k] = v; });
      var r = { method: req.method, query: q, headers: req.headers, body: body ? JSON.parse(body) : {} };
      var out = { statusCode: 200, status: function (s) { this.statusCode = s; return this; }, json: function (j) { res.writeHead(this.statusCode, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); }, setHeader: function () {} };
      sales(r, out);
    });
    return;
  }
  var file = path.join(ROOT, decodeURIComponent(u.pathname));
  if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/* ── the browser side: Firebase and the twin, stubbed ── */
var STUB_APP = 'export function initializeApp(c){return {name:"[DEFAULT]",options:c};} export function getApps(){return [];} export function getApp(){return {name:"[DEFAULT]"};}';
var STUB_AUTH = 'const user={uid:"tom",email:"tom@clearsky-usa.com",emailVerified:true,displayName:"Tom",getIdToken:async()=>"staff-token"};'
  + 'const auth={currentUser:user}; export function getAuth(){return auth;} export function onAuthStateChanged(a,cb){setTimeout(()=>cb(user),0);return ()=>{};}'
  + 'export function signInWithPopup(){return Promise.resolve({user});} export function signOut(){return Promise.resolve();} export class GoogleAuthProvider{}';
var STUB_FS = 'export function getFirestore(){return {};} export function doc(){return {};} export async function getDoc(){return {exists:()=>false,data:()=>({})};} export async function setDoc(){}';

/* an idle twin: nothing on the plate, nothing waiting */
var TWIN = JSON.stringify({ counts: { backlog: 0, drafts: 0, meetings: 0, queued: 0, people: 0 }, spend: { perDay: 0, perMonth: 0, measuredToDate: 0 }, schedule: [], todos: [], draftList: [], people: [], routines: [], features: [], runs: [], feed: [] });
function fail(msg, detail) { console.error('FAIL ' + msg + (detail ? ' — ' + JSON.stringify(detail).slice(0, 600) : '')); process.exitCode = 1; }
function ok(cond, msg, detail) { if (cond) console.log('  ok  ' + msg); else fail(msg, detail); }

(async function () {
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var port = server.address().port, base = 'http://127.0.0.1:' + port;
  var browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {});
  for (var vp of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'phone', width: 390, height: 844 }]) {
    reset();   /* each viewport starts from the same book */
    var page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    var errors = [];
    page.on('pageerror', function (e) { errors.push(e.message); });
    await page.route('**/*', function (route) {
      var u = route.request().url();
      if (u.indexOf(base) === 0) return route.continue();
      if (/gstatic\.com\/firebasejs\/.*firebase-app\.js/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB_APP });
      if (/gstatic\.com\/firebasejs\/.*firebase-auth\.js/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB_AUTH });
      if (/gstatic\.com\/firebasejs\/.*firebase-firestore\.js/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB_FS });
      if (/cloudfunctions\.net\/twinChat/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: TWIN });
      return route.abort();
    });
    console.log('\n' + vp.name);
    await page.goto(base + '/mission.html?view=sales', { waitUntil: 'load' });
    await page.waitForSelector('#salesTiles .lTile', { timeout: 15000 }).catch(function () {});
    await page.waitForTimeout(400);
    var reading = await page.evaluate(function(){ return {mode:document.documentElement.dataset.reading,overlay:getComputedStyle(document.body,'::before').display,font:getComputedStyle(document.querySelector('.navItem')).fontSize}; });
    ok(reading.mode==='calm'&&reading.overlay==='none'&&parseFloat(reading.font)>=15,'Comfort defaults to readable text with no scanlines',reading);
    await page.click('#readingToggle');
    await page.reload({waitUntil:'load'});
    await page.waitForSelector('#salesTiles .lTile');
    ok(await page.evaluate(function(){return document.documentElement.dataset.reading==='cinematic';}),'reading choice survives reload');
    await page.click('#readingToggle');
    var v = await page.evaluate(function () {
      function t(sel) { var e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }
      var first = document.querySelector('#salesToday .sItem');
      return {
        tiles: [].map.call(document.querySelectorAll('#salesTiles .lTile .t'), function (e) { return e.textContent; }),
        alarm: [].map.call(document.querySelectorAll('#salesTiles .lTile.alarm .t'), function (e) { return e.textContent; }),
        today: t('#salesToday'), firstToday: first ? first.textContent : '', firstLink: first && first.querySelector('a') ? first.querySelector('a').getAttribute('href') : null,
        sug: t('#salesSug'), funnel: t('#salesFunnel'), sources: t('#salesSources'), linkedin: t('#salesLinkedin'), activity: t('#salesActivity'), top: t('#salesTop'),
        note: t('#salesNote'), pill: t('#nSales'), cfgOn: (document.getElementById('scOn') || {}).value,
        sw: document.documentElement.scrollWidth, vw: window.innerWidth
      };
    });
    ok(v.tiles.length === 8, 'eight tiles', v.tiles);
    ok(v.alarm.indexOf('Signups waiting') >= 0 && v.alarm.indexOf('Demo requests') >= 0, 'a signup two days old and a request a business day old are alarms', v.alarm);
    ok(/Approve Pendingco Solar/.test(v.firstToday) && v.firstLink === '/admin/tenant?org=pendingco.example', 'Today leads with the signup to approve, linked to its console page', [v.firstToday, v.firstLink]);
    ok(/Answer Jane Doe \(Acme Solar\)/.test(v.today) && /from linkedin/.test(v.today), 'the demo request waits, with where it came from', v.today.slice(0, 400));
    ok(/Send Trialco EPC the proposal/.test(v.today) && /Intro email about plan sets/.test(v.today), 'the trial ending and the prospect due are on Today', v.today.slice(0, 600));
    ok(/Cold email is blocked/.test(v.sug) && /1 signup waiting for approval/.test(v.sug), 'What to change names the approval wait and the cold-email block', v.sug);
    ok(/Waiting\s*1/.test(v.funnel) && /Contacted\s*1/.test(v.funnel) && /Demo\s*1/.test(v.funnel), 'the funnel counts both halves', v.funnel);
    ok(/linkedin/.test(v.sources) && /2026-w39-grid/.test(v.sources) && /waiting: Jane Doe/.test(v.sources), 'sources: LinkedIn and the campaign, and who waits', v.sources);
    ok(/912 views/.test(v.linkedin) && /22 clicks/.test(v.linkedin), 'the LinkedIn post carries its numbers', v.linkedin);
    ok(/demo request/.test(v.activity) && /draft/.test(v.activity), 'the activity log', v.activity.slice(0, 300));
    ok(/Acme Solar/.test(v.top), 'top prospects', v.top);
    ok(/Sender: not set/.test(v.note) && /Postal address: not set/.test(v.note), 'the note says what cold email waits on', v.note);
    ok(v.pill === '2', 'the rail pill counts what waits on him', v.pill);
    ok(v.cfgOn === 'on', 'the settings show the switch on record', v.cfgOn);
    if (vp.name === 'phone') ok(v.sw <= v.vw + 1, 'no sideways scroll on a phone', [v.sw, v.vw]);
    if (shotsAt) await page.screenshot({ path: path.join(shotsAt, 'mission-sales-' + vp.name + '.png'), fullPage: vp.name === 'phone' });

    /* the office: readable cards and the optional map, from the same book */
    await page.click(vp.name === 'phone' ? '#moreTab' : '.navItem[data-view="office"]');
    if (vp.name === 'phone') await page.click('#moreList .navItem[data-view="office"]');
    await page.waitForSelector('#officeWorkspace .officeCard', { timeout: 15000 }).catch(function () {});
    await page.waitForTimeout(400);
    var o = await page.evaluate(function () {
      function t(sel) { var e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }
      return {
        view: (document.querySelector('.view.on') || {}).dataset.view,
        rooms: [].map.call(document.querySelectorAll('#officeFloor g.room'), function (g) { return g.dataset.desk + ':' + g.getAttribute('class').replace('room ', ''); }),
        papers: document.querySelectorAll('#officeFloor g.room[data-desk="sales"] .paper').length,
        side: t('#officeSide'), note: t('#officeNote'), pill: t('#nOffice'),
        sw: document.documentElement.scrollWidth, vw: window.innerWidth
      };
    });
    ok(o.view === 'office', 'the Office view opens' + (vp.name === 'phone' ? ' from More' : ''), o.view);
    ok(o.rooms.join(',') === 'sales:ran,marketing:never,support:never,software:never,legal:never,admin:never,billing:late', 'seven rooms back to front: Sales lit, Billing amber, the rest dark', o.rooms);
    ok(o.papers === 1, 'one paper on the Sales desk for today\'s entry', o.papers);
    ok(/Sales: answered 1 demo request/.test(o.side) && /2 LATEST/.test(o.side) && /Cold email is blocked/.test(o.side) && /1 desk is overdue/.test(o.side) && !/No desk has logged/.test(o.side) && /1 desk has a plan for/.test(o.side), 'the overview: the runs, the needs, the plan waiting', o.side.slice(0, 700));
    ok(new RegExp('1 of 7 desks have a recent recorded run; 1 plan for ' + WEEK + ' waiting').test(o.note), 'the note counts the desks and the plan', o.note);
    ok(/1 approval is waiting on you: #BILLING-20261006-1 \(billing: credit of one month/.test(o.side) && !/SALES-20261004-1/.test(o.side) && /1 handoff between desks this week: support → theo #SUPPORT-20261006-1/.test(o.side), 'the protocol: the open approval named (the declined one not), the handoff counted', o.side.slice(0, 1200));
    ok(o.pill === '2', 'the pill counts the two actions: the plan to approve and the approval waiting', o.pill);
    if (vp.name === 'phone') ok(o.sw <= o.vw + 1, 'no sideways scroll on a phone (office)', [o.sw, o.vw]);
    if (shotsAt) await page.screenshot({ path: path.join(shotsAt, 'mission-office-' + vp.name + '.png'), fullPage: vp.name === 'phone' });
    /* click the Sales room: Nora's drawer */
    await page.getByRole('button', {name:'Office map',exact:true}).click();
    await page.click('#officeFloor g.room[data-desk="sales"]');
    await page.waitForSelector('#officeBack', { timeout: 8000 }).catch(function () {});
    var dr = await page.evaluate(function () { var e = document.getElementById('officeSide'); return { text: e ? e.textContent.replace(/\s+/g, ' ').trim() : '', sel: !!document.querySelector('#officeFloor g.room.sel[data-desk="sales"]') }; });
    ok(dr.sel && /Nora Hale · Sales/.test(dr.text) && /sales@clearsky-usa.com/.test(dr.text), 'the Sales room opens Nora Hale\'s drawer and stays lit as selected', dr.text.slice(0, 200));
    ok(/proposed/.test(dr.text) && /3 demos booked/.test(dr.text), 'the week\'s proposed plan is shown', dr.text.slice(0, 600));
    ok(/Runs · 7d1 of 5/.test(dr.text) && /Runs · 30d1 of 2[0-3]/.test(dr.text), 'the numbers: one run of the five a week expected', dr.text.slice(0, 900));
    ok(/Switch the agent off/.test(dr.text) && /Mailbox/.test(dr.text) && /Job note/.test(dr.text), 'the decisions: the switch and the doors', dr.text.slice(-500));
    if (shotsAt) await page.screenshot({ path: path.join(shotsAt, 'mission-office-drawer-' + vp.name + '.png'), fullPage: vp.name === 'phone' });
    if (vp.name === 'desktop') {
      await page.click('#planApprove');
      await page.waitForFunction(function () { return /Approved\. The desk follows it|Not recorded/.test((document.getElementById('officeSide') || {}).textContent || ''); }, null, { timeout: 8000 }).catch(function () {});
      var planRow = Array.from(db.data.entries()).filter(function (e) { return /^sales_activity\//.test(e[0]) && e[1].kind === 'note' && e[1].summary === 'PLAN ' + WEEK + ' SALES: approved'; });
      ok(planRow.length === 1 && planRow[0][1].by === 'tom@clearsky-usa.com', 'Approve writes the PLAN line the desk reads, by the person', planRow.map(function (e) { return e[1]; }));
      ok(/Approved\. The desk follows it/.test(await page.textContent('#officeSide')), 'the drawer re-reads: approved');
      await page.fill('#deskNote', 'Focus on Joliet this week');
      await page.click('#deskNoteGo');
      await page.waitForFunction(function () { return /Recorded\.|Not recorded/.test((document.getElementById('officeSide') || {}).textContent || ''); }, null, { timeout: 8000 }).catch(function () {});
      var noteRow = Array.from(db.data.entries()).filter(function (e) { return /^sales_activity\//.test(e[0]) && e[1].kind === 'note' && e[1].summary === 'NOTE SALES: Focus on Joliet this week'; });
      ok(noteRow.length === 1, 'a note to the desk writes the NOTE line', noteRow.map(function (e) { return e[1]; }));
      ok(/Focus on Joliet this week/.test(await page.textContent('#deskNotes')), 'the note is listed under Tell Nora');
      await page.click('#officeBack');
      await page.waitForTimeout(200);
      ok(/2 LATEST/.test(await page.textContent('#officeSide')) && !(await page.$('#officeBack')), '◀ Office returns the overview');
    }

    await page.click('#officeFloor g.room[data-desk="legal"]');
    var legalText=await page.textContent('#officeSide');
    ok(/Scott Henry · General Counsel/.test(legalText) && /Only after your approval/.test(legalText), 'Legal identifies human counsel separately from the AI assistant');
    ok(!/to:legal@/.test(await page.innerHTML('#officeSide')), 'Legal never links an invented mailbox');
    await page.click('#officeFloor g.room[data-desk="admin"]');
    ok(/Chief of Staff/.test(await page.textContent('#officeSide')) && await page.isVisible('#chiefCapture'), 'Ada opens a private Chief of Staff brief');
    var adaRequest;
    await page.route('**/ada/ask',function(route){adaRequest=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,text:'I can help you reconcile verified bills.',provider:'chatgpt',fallback:true})});});
    var beforeAda=db.data.size;
    await page.fill('#adaMessage','Help me plan my week');
    await page.getByRole('button',{name:'Send to Ada',exact:true}).click();
    await page.waitForFunction(function(){return /reconcile verified bills/.test(document.getElementById('adaConversation').textContent);});
    ok(adaRequest.text==='Help me plan my week'&&db.data.size===beforeAda,'Ada chat uses its private endpoint and does not log personal content to CRM');
    ok(await page.getAttribute('#adaTerminal','href')==='http://127.0.0.1:7682','Ada has her authenticated terminal entry point');
    var captureRequest;
    await page.route('**/twinChat/task',function(route){captureRequest=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});});
    var sharedCount=db.data.size;
    await page.fill('#chiefCapture','Review household bill dates tomorrow');
    await page.getByRole('button',{name:'Add to my private tasks',exact:true}).click();
    await page.waitForFunction(function(){return /Added to your private task queue/.test(document.getElementById('chiefOfStaff').textContent);});
    ok(captureRequest.title==='Ada: Review household bill dates tomorrow' && db.data.size===sharedCount, 'Personal capture uses the private twin and never the shared CRM');
    if(shotsAt) await page.screenshot({path:path.join(shotsAt,'chief-of-staff-'+vp.name+'.png'),fullPage:vp.name==='phone'});
    await page.click('#officeBack');

    /* The new BDM workflow writes to the real API on the Firestore double. */
    await page.getByRole('button',{name:'Team',exact:true}).click();
    await page.getByRole('button',{name:'+ Add agent',exact:true}).click();
    await page.getByLabel('Agent name',{exact:true}).fill('Alex · Business development');
    await page.getByLabel('Responsibilities and working instructions').fill('Research target accounts, prepare introductions and keep the next step current.');
    await page.getByRole('button',{name:'Save agent',exact:true}).click();
    await page.waitForSelector('.officeCard.custom');
    var profile=Array.from(db.data.values()).find(function(x){return x.officeType==='agent';});
    ok(profile && profile.cc.join(',')==='mike@clearsky-usa.com,tom@clearsky-usa.com','new agent saves default CCs in the existing database');
    await page.getByRole('button',{name:'+ Assign activity',exact:true}).click();
    await page.locator('dialog select').nth(1).selectOption('acme.example');
    await page.locator('dialog select').nth(2).selectOption('call');
    await page.getByLabel('Objective',{exact:true}).fill('Call Acme about Joliet');
    await page.getByRole('button',{name:'Assign activity',exact:true}).click();
    await page.waitForSelector('.officeWorkRow');
    ok(/Calling service is not connected/.test(await page.textContent('#officeWorkspace')),'call is blocked honestly instead of pretending to dial');
    await page.getByRole('button',{name:'Record outcome',exact:true}).click();
    await page.getByLabel('What happened? Include the result and next step.').fill('Thomas called Jane; send a proposal Monday.');
    await page.getByRole('button',{name:'Record completed activity',exact:true}).click();
    await page.waitForSelector('dialog',{state:'detached'});
    ok(Array.from(db.data.values()).some(function(x){return x.officeType==='task'&&x.status==='completed';}),'manual call outcome persists');
    ok(Array.from(db.data.values()).some(function(x){return x.kind==='call'&&x.prospectId==='acme.example'&&/Thomas called Jane/.test(x.summary);}), 'outcome appears on the CRM account');
    await page.getByRole('button',{name:'Team',exact:true}).click();
    if(shotsAt) await page.screenshot({path:path.join(shotsAt,'office-team-'+vp.name+'.png'),fullPage:vp.name==='phone'});

    if (vp.name === 'desktop') {
      /* the Command Center: the Sales panel and its door, and Needs you */
      await page.click('.navItem[data-view="command"]');
      await page.waitForTimeout(300);
      var cc = await page.evaluate(function () { return { panel: document.getElementById('ccSales').textContent.replace(/\s+/g, ' '), needs: document.getElementById('needs').textContent.replace(/\s+/g, ' ') }; });
      ok(/SIGNUPS WAITING\s*1 · oldest 2d/.test(cc.panel) && /PROSPECTS OPEN/.test(cc.panel), 'the Command Center carries the Sales panel', cc.panel);
      ok(/Approve Pendingco Solar/.test(cc.needs) && /Answer Jane Doe/.test(cc.needs), 'Needs you carries the signup and the request', cc.needs);
      await page.click('#ccSales .row');
      ok(await page.evaluate(function () { return document.querySelector('.view.on').dataset.view; }) === 'sales', 'a Sales row opens the Sales view');
      /* log a reply; the double has it; the board re-reads, and the request is answered */
      await page.selectOption('#slKind', 'reply');
      await page.fill('#slWho', 'jane@acme.example');
      await page.fill('#slSum', 'Jane replied: Tuesday works');
      await page.click('#slGo');
      await page.waitForFunction(function () { return /Logged|Not logged/.test((document.getElementById('slNote') || {}).textContent || ''); }, null, { timeout: 8000 }).catch(function () {});
      var logged = await page.textContent('#slNote');
      var stored = Array.from(db.data.entries()).filter(function (e) { return /^sales_activity\//.test(e[0]) && e[1].kind === 'reply'; });
      ok(/Logged/.test(logged) && stored.length === 1 && stored[0][1].by === 'tom@clearsky-usa.com' && stored[0][1].prospectId === 'acme.example', 'a reply is logged by the person, on the prospect', [logged, stored.map(function (e) { return e[1]; })]);
      await page.waitForTimeout(300);
      ok(!/Answer Jane Doe/.test(await page.textContent('#salesToday')), 'a reply answers the request: it leaves Today');
      /* LinkedIn fields follow the kind */
      await page.selectOption('#slKind', 'linkedin-stats');
      var shown = await page.evaluate(function () { return ['slWhoL', 'slRefL', 'slImpL'].map(function (id) { return !document.getElementById(id).hidden; }); });
      ok(shown[0] === false && shown[1] && shown[2], 'the numbers fields show for a post and the who field hides', shown);
      /* settings: a gmail sender is refused by the server; a clearsky-usa.com one saves */
      await page.click('#salesSet summary');
      await page.fill('#scSender', 'tommy@gmail.com');
      await page.click('#scGo');
      await page.waitForFunction(function () { return /Saved|Not saved/.test((document.getElementById('scNote') || {}).textContent || ''); }, null, { timeout: 8000 }).catch(function () {});
      ok(/Not saved: the sender must be a clearsky-usa.com mailbox/.test(await page.textContent('#scNote')), 'a gmail.com sender is refused');
      await page.fill('#scSender', 'dev@clearsky-usa.com');
      await page.fill('#scAddr', '1 Example St, Clinton, IA 52732');
      await page.click('#scGo');
      await page.waitForFunction(function () { return /^Saved/.test((document.getElementById('scNote') || {}).textContent || ''); }, null, { timeout: 8000 }).catch(function () {});
      var cfg = db.data.get('sales_config/current') || {};
      ok(cfg.sender === 'dev@clearsky-usa.com' && cfg.postalAddress === '1 Example St, Clinton, IA 52732', 'the settings are saved to sales_config', cfg);
      await page.waitForTimeout(300);
      ok(/Sender: dev@clearsky-usa.com/.test(await page.textContent('#salesNote')), 'the board re-reads after saving');
      if (shotsAt) await page.screenshot({ path: path.join(shotsAt, 'mission-sales-desktop-after.png') });
    }
    ok(!errors.length, 'no uncaught page error', errors);
    console.log(JSON.stringify({ viewport: vp.name, tiles: v.tiles.length, today: (v.today.match(/TODAY|SOON/gi) || []).length, errors: errors.length }));
    await page.close();
  }
  await browser.close();
  server.close();
  if (process.exitCode) console.error('\nrender-mission-sales: FAILED'); else console.log('\nrender-mission-sales: all checks passed');
})().catch(function (e) { console.error(e); process.exit(1); });
