/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Browser smoke test with explicit fixtures. No production calls or writes.
   Run with the optional Playwright installation in scripts/site-agent. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('./site-agent/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const rows = [
  { id: 'fixture-a', addr: '100 Test Warehouse', city: 'Test city', state: 'IL', zip: '00000', lat: 41.85, lon: -87.71, type: 'Warehouse', sqft: 80000, lotAcres: 5, annualKwh: { value: 2000000, src: 'metered' }, feederId: 'TEST-A', nameplate: 1500, queue: 100, owner: { name: 'Test Owner LLC' }, photos: [], src: 'test' },
  { id: 'fixture-b', addr: '200 Test Factory', city: 'Test city', state: 'IL', zip: '00000', lat: 41.851, lon: -87.711, type: 'Industrial', sqft: 60000, lotAcres: 3, annualKwh: { value: 1000000, src: 'modelled' }, feederId: 'TEST-B', nameplate: 600, queue: 100, owner: { name: 'Test Owner Two LLC' }, photos: [], src: 'test' },
  { id: 'fixture-c', addr: '300 Unknown Site', city: 'Test city', state: 'IL', zip: '00000', lat: 41.852, lon: -87.712, type: 'Industrial', sqft: null, lotAcres: 2, annualKwh: null, feederId: '', nameplate: null, owner: { name: '' }, photos: [], src: 'test' }
];
(async function () {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.message); });
    await page.addInitScript(() => {
      window._currentUser = { uid: 'test-only', email: 'test@example.com', getIdToken: () => Promise.resolve('fixture-token') };
      window.firebase = { auth: () => ({ currentUser: window._currentUser }) };
      localStorage.setItem('cs.repName', 'Test Rep');
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdnjs.cloudflare.com' && url.pathname.includes('/leaflet/')) { await route.continue(); return; }
      if (url.hostname !== 'sitefinder.test') { await route.fulfill({ status: 200, body: '', contentType: 'application/javascript' }); return; }
      if (url.pathname === '/api/site-score') {
        const body = route.request().postDataJSON();
        const scored = (body.rows || []).map(r => {
          const capacity = body.circuits[r.id];
          const kw = r.id === 'fixture-a' ? 300 : r.id === 'fixture-b' ? 200 : null;
          return { id: r.id, score: r.id === 'fixture-a' ? 85 : r.id === 'fixture-b' ? 55 : 10,
            loadScore: 50, kw, kwh: kw == null ? null : kw * 4, hours: 4, peakKw: 2000,
            loadCeiling: kw, circuitCeiling: capacity && capacity.known ? capacity.sellable : null,
            circuitLimited: false, binds: 'load', basis: { loadFactor: 0.5 } };
        });
        await route.fulfill({ json: { scored, weightsSource: 'test fixture', asOf: '2026-09-21' } }); return;
      }
      if (url.pathname === '/api/site-catalog') {
        await route.fulfill({json:{total:2,hasMore:false,manifest:{count:2,located:1},rows:[
          {id:'crexi:123',addr:'1 Listed Warehouse',city:'Chicago',state:'IL',zip:'60601',type:'Industrial',sqft:50000,lat:41.8,lon:-87.7,src:'crexi-import',listed:{forSale:true,url:'https://www.crexi.com/properties/123/test',askPrice:100000},geocode:{accuracy:'street-interpolated'},photos:[]},
          {id:'crexi:124',addr:'2 Unplaced Listing',city:'Chicago',state:'IL',zip:'60601',type:'Office',sqft:null,lat:null,lon:null,src:'crexi-import',listed:{forSale:true,url:'https://www.crexi.com/properties/124/test'},photos:[]}
        ]}});return;
      }
      if (url.pathname.startsWith('/api/')) { await route.fulfill({ status: 503, json: { error: 'Deliberate test service failure' } }); return; }
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        await route.fulfill({ status: 404, body: '' }); return;
      }
      let body = fs.readFileSync(file);
      if (url.pathname === '/clearsky-sitefinder.html') {
        body = body.toString().replace('  connect();', '').replace('  setTimeout(function () { run(true); }, 200);', '')
          .replace(/\}\)\(\);\s*<\/script>\s*<script src="\/omega-grid-atlas-client.js">/,
            'window.__siteTest={ST:ST,ingest:ingest,render:render,showViability:showViability,syncSavedView:syncSavedView};})();\n</script>\n<script src="/omega-grid-atlas-client.js">');
      }
      await route.fulfill({ body, contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    });
    await page.goto('http://sitefinder.test/clearsky-sitefinder.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__siteTest);
    await page.evaluate(rows => {
      window.OmegaListings.parcelAt = (lat, lon, cb) => cb(null, null);
      window.OmegaComEdLayers.probePoint = (lat, lon, cb) => cb(null, { rows: [], serviceFailed: true });
      window.OmegaSiteSaves.init('example.com', window._currentUser, function () {});
      window.OmegaSiteSaves.onChange(window.__siteTest.syncSavedView);
      window.__siteTest.ingest(rows); window.__siteTest.render();
    }, rows);
    await page.waitForFunction(() => window.__siteTest.ST.rows.every(r => r.scoreState === 'ready'));
    assert.equal(await page.locator('.card').count(), 3);
    await page.locator('#fHost').fill('1000');
    assert.equal(await page.locator('.card').count(), 1);
    await page.locator('#clearFilters').click();
    await page.locator('#fScore').fill('80');
    assert.equal(await page.locator('.card').count(), 1);
    await page.locator('.card[data-id="fixture-a"] .energyLead').click();
    await page.locator('#siteBattery').waitFor();
    assert.equal(await page.locator('#szKwN').inputValue(), '300');
    await page.locator('#szKwN').fill('250'); await page.locator('#szKwN').press('Tab');
    assert.equal(await page.locator('#rKw').inputValue(), '250');
    await page.locator('#dSaveRow').click();
    assert.ok(await page.locator('#dSaveRow').innerText());
    await page.locator('#dClose').click();
    await page.locator('#fHost').fill('2000');
    assert.equal(await page.locator('.card').count(), 1, 'saved site stays visible under energy filters');
    await page.locator('#clearFilters').click();
    await page.locator('.card[data-id="fixture-c"] .energyLead').click();
    assert.equal(await page.locator('#rSave').count(), 0, 'unknown feeder cannot be held');
    assert.equal(await page.locator('#siteMarket').count(), 1, 'contacts remain available without feeder');
    assert.equal(await page.locator('#costSite').count(), 1, 'estimator remains available without feeder');
    await page.evaluate(() => { document.getElementById('filters').scrollLeft = 0; document.getElementById('dBody').scrollTop = 0; });
    await page.screenshot({ path: '/tmp/sitefinder-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/sitefinder-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#dClose').click();
    await page.evaluate(() => { window.__siteTest.ST.rows = []; window.__siteTest.ST.current = null; });
    await page.locator('[data-view="saved"]').click();
    assert.equal(await page.locator('.card').count(), 1, 'saved view works before any fresh search');
    await page.locator('[data-view="catalog"]').click();
    await page.locator('.card[data-id="crexi:124"]').waitFor();
    assert.equal(await page.locator('.card').count(),2,'located and unplaced listings both render');
    assert.equal(await page.locator('a[href="https://www.crexi.com/properties/123/test"]').count(),1);
    await page.locator('.card[data-id="crexi:124"] .energyLead').click();
    assert.equal(await page.locator('#rSave').count(),0,'unplaced listings cannot hold capacity');
    assert.match(await page.locator('#dVerify').innerText(),/Location not verified/i);
    assert.deepEqual(errors, []);
    console.log('Site Finder browser workflow passed: score/hosting filters, saved visibility, sizing/hold consistency, unknown feeder, mobile layout.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
