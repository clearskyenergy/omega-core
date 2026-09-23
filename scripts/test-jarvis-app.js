/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The Jarvis phone app, end to end on fixtures: the sign-in gate, the thread
   from the twin, a typed question and its priced answer, a factory question
   routed to the control plane, tap-to-talk through a stubbed recogniser with
   the reply sent to /speak, the account page (notifications, install, what
   Jarvis does and spends, a toggle that posts), sign out. Same Playwright
   arrangement as test-sitefinder-app.js; no production calls.

     PLAYWRIGHT_MODULE=/path/to/playwright SITEFINDER_BROWSER=bundled node scripts/test-jarvis-app.js */
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || './site-agent/node_modules/playwright');
const launchOpts = { headless: true }; if (process.env.SITEFINDER_BROWSER !== 'bundled') launchOpts.channel = 'chrome';
const root = path.resolve(__dirname, '..');
const TWIN = 'https://us-central1-clearsky-portal.cloudfunctions.net/twinChat';
const HISTORY = [
  { role: 'you', text: 'how is the pipeline doing', at: '2026-09-23T12:00:00Z' },
  { role: 'jarvis', text: 'Three deals moved. <b>Fenecon</b> is waiting on you.', at: '2026-09-23T12:00:20Z', costUsd: 0.031 }
];
const SETTINGS = { observedDays: 5, totals: { perDay: 1.2, perMonth: 36, measuredToDate: 12.5 }, features: [
  { id: 'ingest', label: 'Read the mail', detail: 'Every ten minutes.', enabled: true, hasHistory: true, perDay: 0.4, measuredSpend: 4, runs: 300, schedule: 'every 10 min' },
  { id: 'act', label: 'Act on it', detail: 'Drafts and sends.', enabled: false, hasHistory: false, perDay: 0.8 },
  { id: 'sms', label: 'Text messages', detail: 'Twilio.', enabled: false, blocked: 'no number', perDay: 0 }
] };
async function tab(page, name) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100); await page.locator('.tabs a[data-tab=' + name + ']').click(); }
async function until(page, fn, label) { const t = Date.now(); while (Date.now() - t < 30000) { if (await page.evaluate(fn)) return; await page.waitForTimeout(150); } throw new Error('Timed out waiting for ' + label); }
(async function () {
  const browser = await chromium.launch(launchOpts);
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.stack || e.message); });
    await page.addInitScript(() => {
      window.CLEARSKY_CONFIG = { firebase: { apiKey: 'x', projectId: 'test' } };
      const user = { uid: 'test-only', email: 'tommy@clearsky-usa.com', displayName: 'Tommy', getIdToken: () => Promise.resolve('fixture-token') };
      let cb = null, current = null;
      window.__auth = { signIn: () => { current = user; if (cb) cb(current); }, signOut: () => { current = null; if (cb) cb(null); } };
      window.firebase = { apps: [{}], initializeApp: () => {},
        auth: () => ({ get currentUser() { return current; }, onAuthStateChanged: f => { cb = f; setTimeout(() => f(current), 0); }, signOut: () => { window.__auth.signOut(); return Promise.resolve(); },
          signInWithEmailAndPassword: () => { window.__auth.signIn(); return Promise.resolve(); } }) };
      window.firebase.auth.GoogleAuthProvider = function () {};
      /* A recogniser that hears one sentence the moment it starts. */
      window.__heard = 'Jarvis, what is in the backlog';
      window.SpeechRecognition = function () {
        const self = this; self.started = 0;
        self.start = function () { self.started++; setTimeout(() => { const r = [[{ transcript: window.__heard }]]; r[0].isFinal = true; self.onresult && self.onresult({ resultIndex: 0, results: r }); }, 20); };
        self.stop = function () { setTimeout(() => self.onend && self.onend(), 5); };
      };
      window.webkitSpeechRecognition = window.SpeechRecognition;
      /* jsdom-free: there is no speechSynthesis in headless Chromium's mobile emulation; the app must cope. */
      window.__posts = [];
      window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    });
    const posted = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), method = route.request().method();
      if (url.href.startsWith(TWIN)) {
        const rest = url.href.slice(TWIN.length).replace(/\?.*$/, '');
        assert.equal(route.request().headers().authorization, 'Bearer fixture-token', 'the twin is called with the ID token');
        if (rest === '' && method === 'GET') { await route.fulfill({ json: { messages: HISTORY } }); return; }
        if (rest === '' && method === 'POST') { const b = route.request().postDataJSON(); posted.push({ to: 'twin', body: b }); await route.fulfill({ json: { reply: 'You asked: ' + b.message, costUsd: 0.02 } }); return; }
        if (rest === '/settings' && method === 'GET') { await route.fulfill({ json: SETTINGS }); return; }
        if (rest === '/settings' && method === 'POST') { const b = route.request().postDataJSON(); posted.push({ to: 'settings', body: b }); const s = JSON.parse(JSON.stringify(SETTINGS)); s.features.forEach(f => { if (b.enabled && f.id in b.enabled) f.enabled = b.enabled[f.id]; }); await route.fulfill({ json: s }); return; }
        if (rest === '/speak') { posted.push({ to: 'speak', body: route.request().postDataJSON() }); await route.fulfill({ status: 503, body: 'quota' }); return; }
        if (rest === '/meeting') { const b = route.request().postDataJSON(); posted.push({ to: 'meeting', body: b }); await route.fulfill({ json: { title: b.title || 'Call', chars: b.transcript.length } }); return; }
        await route.fulfill({ status: 404, json: { error: 'no route ' + rest } }); return;
      }
      if (url.hostname !== 'app.test') { await route.fulfill({ status: 200, body: '', contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript' }); return; }
      if (url.pathname === '/api/jarvis-operations') { const b = route.request().postDataJSON(); posted.push({ to: 'ops', body: b }); await route.fulfill({ json: { reply: 'Plant: 4 units on the floor for ' + (b.org || 'your org') + '.' } }); return; }
      if (url.pathname === '/api/push-key') { await route.fulfill({ status: 503, json: { error: 'push is not configured on this deployment' } }); return; }
      if (url.pathname.startsWith('/api/')) { await route.fulfill({ status: 503, json: { error: 'off' } }); return; }
      if (url.pathname === '/config.js') { await route.fulfill({ body: '', contentType: 'application/javascript' }); return; }
      if (url.pathname === '/jarvis-app/sw.js') { await route.fulfill({ status: 404, body: '' }); return; }
      let file = path.join(root, decodeURIComponent(url.pathname).replace(/^\/jarvis-app/, '/portals/jarvis-app'));
      if (url.pathname === '/jarvis-app') file = path.join(root, 'portals/jarvis-app/index.html');
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { await route.fulfill({ status: 404, body: '' }); return; }
      await route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/octet-stream' });
    });
    await page.goto('http://app.test/jarvis-app?org=cleancell.us', { waitUntil: 'domcontentloaded' });
    await until(page, () => !!window.__jarvisApp, 'the app');
    /* signed out: the gate, no tabs, no composer */
    await page.locator('#viewSignin').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.tabs').isVisible(), false, 'no tabs before sign-in');
    assert.equal(await page.locator('#composer').isVisible(), false, 'no composer before sign-in');
    await page.screenshot({ path: '/tmp/jarvis-app-signin.png', fullPage: true });
    await page.locator('#signinEmail').fill('tommy@clearsky-usa.com'); await page.locator('#signinPass').fill('x'); await page.locator('#signinForm button[type=submit]').click();
    await page.locator('#viewChat').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#topSub').innerText(), 'cleancell.us operations', 'the pinned tenant is shown');
    /* the thread arrives from the twin, rendered as words not markup */
    await until(page, () => document.querySelectorAll('#thread .msg').length === 2, 'the history');
    assert.equal(await page.locator('#thread .msg.jarvis .bubble').innerText(), 'Three deals moved. <b>Fenecon</b> is waiting on you.', 'partner text renders as text');
    assert.ok((await page.locator('#thread .msg.jarvis .stamp').innerText()).indexOf('$0.03') >= 0, 'the cost sits next to the answer');
    assert.equal(await page.locator('#empty').isVisible(), false, 'no empty state with a thread');
    /* a typed question goes to the twin and its answer is priced */
    await page.locator('#input').fill('what is on my plate'); await page.locator('#send').click();
    await until(page, () => document.querySelectorAll('#thread .msg').length === 4 && !document.querySelector('#thread .dots'), 'the answer');
    assert.deepEqual(posted[posted.length - 1], { to: 'twin', body: { message: 'what is on my plate' } });
    assert.equal(await page.locator('#thread .msg:last-child .bubble').innerText(), 'You asked: what is on my plate');
    assert.ok((await page.locator('#thread .msg:last-child .stamp').innerText()).indexOf('$0.02') >= 0);
    /* a factory question goes to the control plane with the pinned org */
    await page.locator('#input').fill('what is ready to ship'); await page.locator('#send').click();
    await until(page, () => document.querySelectorAll('#thread .msg').length === 6 && !document.querySelector('#thread .dots'), 'the plant answer');
    assert.deepEqual(posted[posted.length - 1], { to: 'ops', body: { message: 'what is ready to ship', org: 'cleancell.us' } });
    assert.equal(await page.locator('#thread .msg:last-child .bubble').innerText(), 'Plant: 4 units on the floor for cleancell.us.');
    await page.screenshot({ path: '/tmp/jarvis-app-chat.png', fullPage: true });
    /* tap to talk: the stubbed recogniser hears a sentence, the wake word is stripped, the reply goes to /speak and the 503 does not break the flow */
    await tab(page, 'voice');
    await page.locator('#viewVoice').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#composer').isVisible(), false, 'no composer on the voice tab');
    await page.locator('#talkBtn').click();
    await until(page, () => document.querySelectorAll('#thread .msg').length === 8 && !document.querySelector('#thread .dots'), 'the spoken answer');
    assert.deepEqual(posted[posted.length - 2], { to: 'twin', body: { message: 'what is in the backlog' } }, 'the wake word is not sent');
    assert.deepEqual(posted[posted.length - 1], { to: 'speak', body: { text: 'You asked: what is in the backlog' } }, 'the reply is spoken');
    await until(page, () => !window.__jarvisApp.ST.speaking && !window.__jarvisApp.ST.listening, 'voice to settle');
    assert.equal(await page.locator('#capText').innerText(), 'You asked: what is in the backlog', 'the caption shows the answer');
    assert.equal(await page.locator('#talkBtn').innerText(), 'Tap to talk');
    await page.screenshot({ path: '/tmp/jarvis-app-voice.png', fullPage: true });
    /* record a call: continuous transcription, filed on stop */
    await page.evaluate(() => { window.__heard = 'we agreed to send the revised proposal by Friday and Alex will confirm the interconnection queue position with ComEd'; window.prompt = () => 'ComEd call'; });
    await page.locator('#meetBtn').click();
    await until(page, () => window.__jarvisApp.ST.meeting, 'recording');
    assert.equal(await page.locator('#meetBtn').innerText(), 'End call');
    await page.waitForTimeout(80);
    await page.locator('#meetBtn').click();
    await until(page, () => document.querySelectorAll('#thread .msg').length === 10 && !document.querySelector('#thread .dots'), 'the filing reply');
    const filed = await page.evaluate(() => document.querySelector('#thread .msg:last-child .bubble').textContent);
    assert.ok(/Filed “ComEd call”/.test(filed), 'the meeting is filed: ' + filed);
    /* account: who, notifications honest about this build, install, what Jarvis does, a toggle that posts */
    await tab(page, 'account');
    await page.locator('#viewAccount').waitFor({ state: 'visible' });
    await until(page, () => document.querySelectorAll('#settingsBody .feat').length === 3, 'the settings');
    const acct = await page.locator('#viewAccount').innerText();
    assert.ok(acct.indexOf('tommy@clearsky-usa.com') >= 0, 'the account is named');
    assert.ok(acct.indexOf('cleancell.us') >= 0, 'the operations tenant is named');
    assert.ok(/Notifications/.test(acct) && /Install/.test(acct) && /What Jarvis does/.test(acct), 'the cards are there');
    assert.ok(acct.indexOf('$12.50') >= 0 && acct.indexOf('spent so far') >= 0, 'totals are what he spent');
    assert.equal(await page.locator('#settingsBody .feat input').nth(2).isDisabled(), true, 'a blocked feature cannot be switched');
    assert.equal(await page.locator('#settingsBody .pauseAll').innerText(), 'Pause everything');
    await page.locator('#settingsBody .feat').nth(1).locator('.sw').click();
    await until(page, () => document.querySelectorAll('#settingsBody .feat')[1] && document.querySelectorAll('#settingsBody .feat')[1].querySelector('input').checked && !document.querySelectorAll('#settingsBody .feat')[1].querySelector('input').disabled, 're-render from the server');
    assert.deepEqual(posted[posted.length - 1], { to: 'settings', body: { enabled: { act: true } } }, 'the toggle posted one switch');
    await page.screenshot({ path: '/tmp/jarvis-app-account.png', fullPage: true });
    /* sign out returns to the gate and empties the thread */
    await page.locator('#signOut').click();
    await page.locator('#viewSignin').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.querySelectorAll('#thread .msg').length), 0, 'the thread is cleared on sign-out');
    assert.deepEqual(errors, [], 'no browser errors');
    console.log('jarvis-app: OK (' + posted.length + ' calls: ' + posted.map(p => p.to).join(', ') + ')');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
