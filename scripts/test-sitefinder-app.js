/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The phone app, end to end on fixtures: sign-in gate, listings near me with
   circuits and scores, the site screen (facts, fit, lease offer, call sheet,
   save), the saved list, the account page. Same Playwright arrangement as
   test-sitefinder-ui.js; no production calls. */
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || './site-agent/node_modules/playwright');
const launchOpts = { headless: true }; if (process.env.SITEFINDER_BROWSER !== 'bundled') launchOpts.channel = 'chrome';
const root = path.resolve(__dirname, '..');
const L = require('../api/_lib/site-lease');
const ROWS = [
  { id: 'crexi:126', addr: '5730 W Dempster St', city: 'Morton Grove', state: 'IL', zip: '60053', type: 'Industrial', subtype: 'Retail | Pharmacy/Drug', sqft: 44000, lat: 42.04, lon: -87.78, src: 'crexi-import', listed: { forSale: true, url: 'https://www.crexi.com/properties/126/test', askPrice: null }, geocode: { status: 'matched', accuracy: 'street-interpolated' }, photos: [],
    detail: { unpriced: true, daysOnMarket: 1, headline: 'Walgreens - Morton Grove, IL', noi: 375435, occupancy: 100, leaseType: 'NN', leaseExpiration: '07/31/2028', yearBuilt: 2001, listedBy: 'JLL', brokers: [{ name: 'Alex Geanakos', firm: 'JLL' }, { name: 'Mohsin Mirza', firm: 'JLL', phone: '(312) 555-0142' }], capturedAt: '2026-09-22T12:00:00Z', src: 'crexi-page' } },
  { id: 'crexi:123', addr: '1 Listed Warehouse', city: 'Chicago', state: 'IL', zip: '60601', type: 'Industrial', sqft: 50000, lat: 42.03, lon: -87.79, src: 'crexi-import', listed: { forSale: true, url: 'https://www.crexi.com/properties/123/test', askPrice: 100000 }, geocode: { status: 'matched', accuracy: 'street-interpolated' }, photos: [] },
  { id: 'crexi:125', addr: 'Lot 3 Area Centre Listing', city: 'Chicago', state: 'IL', zip: '60601', type: 'Vacant Land', lotAcres: 2, lat: 42.02, lon: -87.77, src: 'crexi-import', listed: { forSale: true, url: 'https://www.crexi.com/properties/125/test', askPrice: 250000 }, geocode: { status: 'approximate', source: 'derived', accuracy: 'area centre of 12 matched listings in ZIP 60601; not the parcel', area: 'ZIP 60601' }, photos: [] }
];
/* page.waitForFunction stalls in a mobile-emulated context here; a plain poll does not. */
async function until(page, fn, label) { const t = Date.now(); while (Date.now() - t < 30000) { if (await page.evaluate(fn)) return; await page.waitForTimeout(150); } throw new Error('Timed out waiting for ' + label); }
(async function () {
  const browser = await chromium.launch(launchOpts);
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: 42.03, longitude: -87.78 }, permissions: ['geolocation'] });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.stack || e.message); });
    let signedIn = null, authCb = null;
    await page.addInitScript(() => {
      window.CLEARSKY_CONFIG = { firebase: { apiKey: 'x', projectId: 'test' } };
      const user = { uid: 'test-only', email: 'rep@chileasing.com', displayName: 'Test Rep', getIdToken: () => Promise.resolve('fixture-token') };
      let cb = null, current = null;
      window.__auth = { signIn: () => { current = user; if (cb) cb(current); }, signOut: () => { current = null; if (cb) cb(null); } };
      window.firebase = { apps: [{}], initializeApp: () => {}, firestore: () => null,
        auth: () => ({ get currentUser() { return current; }, onAuthStateChanged: f => { cb = f; setTimeout(() => f(current), 0); }, signOut: () => { window.__auth.signOut(); return Promise.resolve(); },
          signInWithEmailAndPassword: (e, p) => { window.__auth.signIn(); return Promise.resolve(); } }) };
      window.firebase.auth.GoogleAuthProvider = function () {};
      Object.defineProperty(window, '_currentUser', { get: () => current });
      /* http://app.test is not a secure context, so Chromium refuses real geolocation there. */
      navigator.geolocation.getCurrentPosition = ok => setTimeout(() => ok({ coords: { latitude: 42.03, longitude: -87.78 } }), 0);
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdnjs.cloudflare.com' && url.pathname.includes('/leaflet/')) {
        const local = process.env.LEAFLET_DIR && path.join(process.env.LEAFLET_DIR, path.basename(url.pathname));
        if (local && fs.existsSync(local)) { await route.fulfill({ body: fs.readFileSync(local), contentType: local.endsWith('.css') ? 'text/css' : 'application/javascript' }); return; }
        await route.continue(); return;
      }
      if (url.hostname !== 'app.test') { await route.fulfill({ status: 200, body: '', contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript' }); return; }
      if (url.pathname === '/api/site-catalog') {
        const b = route.request().postDataJSON(); assert.equal(b.orgId, 'chileasing.com', 'the workspace is the email domain');
        await route.fulfill({ json: { total: 3, hasMore: false, manifest: { count: 3, located: 3 }, rows: b.q ? ROWS.filter(r => r.addr.indexOf(b.q) >= 0) : ROWS } }); return;
      }
      if (url.pathname === '/api/site-score') {
        const body = route.request().postDataJSON();
        const scored = (body.rows || []).map(r => { const c = body.circuits[r.id]; const kw = c && c.known ? Math.min(c.sellable, 750) : null; return { id: r.id, score: c && c.known ? 82 : 40, loadScore: 50, kw, kwh: kw == null ? null : kw * 4, hours: 4, peakKw: 2000, loadCeiling: 750, circuitCeiling: c && c.known ? c.sellable : null, circuitLimited: false, binds: 'load', basis: { loadFactor: 0.5 } }; });
        await route.fulfill({ json: { scored, weightsSource: 'fixture', asOf: '2026-09-22' } }); return;
      }
      if (url.pathname === '/api/site-lease') {
        const b = route.request().postDataJSON(); const offer = L.offer(b); delete offer.components;
        await route.fulfill({ json: { build: 'site-lease/1', offer, site: b.site, brand: { name: 'Chileasing' }, disclaimer: 'Indicative, not a binding offer.' } }); return;
      }
      if (url.pathname.startsWith('/api/')) { await route.fulfill({ status: 503, json: { error: 'off' } }); return; }
      if (url.pathname === '/config.js') { await route.fulfill({ body: '', contentType: 'application/javascript' }); return; }
      if (url.pathname === '/sitefinder-app/sw.js') { await route.fulfill({ status: 404, body: '' }); return; }
      let file = path.join(root, decodeURIComponent(url.pathname).replace(/^\/sitefinder-app/, '/portals/sitefinder-app'));
      if (url.pathname === '/sitefinder-app') file = path.join(root, 'portals/sitefinder-app/index.html');
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { await route.fulfill({ status: 404, body: '' }); return; }
      await route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/octet-stream' });
    });
    await page.goto('http://app.test/sitefinder-app', { waitUntil: 'domcontentloaded' });
    await until(page, () => !!window.__siteApp, 'the app');
    /* signed out: the gate */
    await page.locator('#viewSignin').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.tabs').isVisible(), false, 'no tabs before sign-in');
    await page.locator('#signinEmail').fill('rep@chileasing.com'); await page.locator('#signinPass').fill('x'); await page.locator('#signinForm button[type=submit]').click();
    await page.locator('#viewFind').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#topOrg').innerText(), 'chileasing.com');
    /* circuits: stub the ComEd layer the way the desktop test does */
    await page.evaluate(() => {
      window.OmegaComEdLayers.attribIn = (b, cb) => cb(null, []);
      window.OmegaComEdLayers.feederNear = (lat, lon) => lat > 42.035 ? { row: { feeder: 'Z1234', sub: 'Skokie', bess: 1500, queue: 100 }, contains: true, beyond: false, distance: 0 } : null;
      window.OmegaComEdLayers.capacityOf = row => ({ nameplate: row.bess, queue: row.queue, feederId: row.feeder, sub: row.sub });
    });
    await page.locator('#nearMe').click();
    await until(page, () => /Sorted by available capacity/.test(document.getElementById('findStatus').textContent), 'listings near me');
    await page.screenshot({ path: '/tmp/sitefinder-app-find.png', fullPage: true });
    const cards = page.locator('#findList .site');
    assert.equal(await cards.count(), 3);
    assert.match(await cards.first().innerText(), /5730 W Dempster St[\s\S]*1,400 kW free[\s\S]*Energy score\s+82[\s\S]*Battery\s+750 kW[\s\S]*Asking\s+Unpriced/, 'the site with capacity leads, scored and sized');
    assert.match(await page.locator('#findList .site[href="#/site/crexi%3A125"]').innerText(), /Area pin/, 'an area-centre listing gets no circuit');
    await page.locator('#minKw').fill('1000'); await page.locator('#minKw').dispatchEvent('change');
    assert.equal(await cards.count(), 1, 'the minimum kW filter holds');
    await page.locator('#minKw').fill('0'); await page.locator('#minKw').dispatchEvent('change');
    /* the site screen */
    await cards.first().click();
    await page.locator('#viewSite').waitFor({ state: 'visible' });
    const site = await page.locator('#viewSite').innerText();
    assert.match(site, /1,400 kW available on Z1234/); assert.match(site, /NOI\s+\$375,435\/yr/); assert.match(site, /Walgreens - Morton Grove, IL · 100% occupied · NN lease · expires 07\/31\/2028/);
    assert.match(site, /Alex Geanakos, JLL\nMohsin Mirza, JLL · \(312\) 555-0142/); assert.equal((site.match(/pending API integration/g) || []).length, 4, 'value, last sale, owner (facts and call) say why they are missing');
    assert.match(site, /1 × ESD1267-05P3421 — recommended[\s\S]*3,421 kWh at 750 kW/, 'one product, the closest fit');
    assert.match(site, /Listing broker\s+Alex Geanakos, JLL number masked/);
    assert.match(await page.locator('#script').inputValue(), /Hi Alex, this is Test Rep with chileasing\.com[\s\S]*I know the property is listed/);
    await page.screenshot({ path: '/tmp/sitefinder-app-site.png', fullPage: true });
    await page.locator('#leaseTerm').fill('20'); await page.locator('#leaseQuote').click();
    await page.locator('#leaseOpen').waitFor();
    assert.match(await page.locator('#viewSite').innerText(), /per month[\s\S]*over 20 years/);
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#leaseOpen').click()]);
    await popup.waitForLoadState(); assert.match(await popup.content(), /Your land\.<br>Our battery\./); await popup.close();
    await page.locator('#szHrs').selectOption('2');
    assert.match(await page.locator('#viewSite').innerText(), /1,500 kWh · circuit allows 1,400 kW[\s\S]*inputs changed/, 'a resize re-fits and marks the offer stale');
    /* call the owner: saves the site, logs on its notes */
    await page.locator('#ownerPhone').fill('(312) 555-0199'); await page.locator('#ownerSave').click();
    await page.locator('#viewSite a[href="tel:3125550199"]').waitFor();
    await page.locator('#callOutcome').selectOption('Spoke — interested'); await page.locator('#callWho').fill('Alex Geanakos'); await page.locator('#callNote').fill('Walk Tuesday'); await page.locator('#callLog').click();
    await page.locator('.log li').waitFor();
    assert.match(await page.locator('.log li').first().innerText(), /Call · Spoke — interested · Alex Geanakos · Walk Tuesday/);
    assert.equal(await page.locator('#starBtn').innerText(), '★', 'logging a call saved the site');
    /* saved list, account */
    await page.locator('.tabs a[data-tab=saved]').click();
    await page.locator('#savedList .site').waitFor();
    assert.match(await page.locator('#savedList').innerText(), /5730 W Dempster St[\s\S]*Call · Spoke — interested/);
    await page.locator('.tabs a[data-tab=account]').click();
    await until(page, () => /Sign out/.test(document.getElementById('viewAccount').innerText), 'the account page');
    assert.match(await page.locator('#viewAccount').innerText(), /Test Rep[\s\S]*chileasing\.com[\s\S]*Install on your phone[\s\S]*Sign out/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal scroll on a phone');
    await page.screenshot({ path: '/tmp/sitefinder-app-account.png', fullPage: true });
    await page.locator('#signOut').click();
    await page.locator('#viewSignin').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    console.log('Site Finder app passed: sign-in gate, near-me listings with circuits and scores, site screen with facts, fit, lease offer, proposal, call sheet and save, saved list, account, sign-out.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
