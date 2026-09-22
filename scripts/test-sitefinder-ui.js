/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Browser smoke test with explicit fixtures. No production calls or writes.
   Run with the optional Playwright installation in scripts/site-agent. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
/* The optional install in scripts/site-agent, or any playwright(-core) named
   by PLAYWRIGHT_MODULE; SITEFINDER_BROWSER=bundled runs Playwright's own
   Chromium instead of the Chrome channel. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || './site-agent/node_modules/playwright');
const launchOpts = { headless: true };
if (process.env.SITEFINDER_BROWSER !== 'bundled') launchOpts.channel = 'chrome';
const root = path.resolve(__dirname, '..');
const rows = [
  { id: 'fixture-a', addr: '100 Test Warehouse', city: 'Test city', state: 'IL', zip: '00000', lat: 41.85, lon: -87.71, type: 'Warehouse', sqft: 80000, lotAcres: 5, annualKwh: { value: 2000000, src: 'metered' }, feederId: 'TEST-A', nameplate: 1500, queue: 100, owner: { name: 'Test Owner LLC' }, photos: [], src: 'test' },
  { id: 'fixture-b', addr: '200 Test Factory', city: 'Test city', state: 'IL', zip: '00000', lat: 41.851, lon: -87.711, type: 'Industrial', sqft: 60000, lotAcres: 3, annualKwh: { value: 1000000, src: 'modelled' }, feederId: 'TEST-B', nameplate: 600, queue: 100, owner: { name: 'Test Owner Two LLC' }, photos: [], src: 'test' },
  { id: 'fixture-c', addr: '300 Unknown Site', city: 'Test city', state: 'IL', zip: '00000', lat: 41.852, lon: -87.712, type: 'Industrial', sqft: null, lotAcres: 2, annualKwh: null, feederId: '', nameplate: null, owner: { name: '' }, photos: [], src: 'test' }
];
(async function () {
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.stack || e.message); });
    await page.addInitScript(() => {
      window._currentUser = { uid: 'test-only', email: 'test@example.com', getIdToken: () => Promise.resolve('fixture-token') };
      window.firebase = { auth: () => ({ currentUser: window._currentUser }) };
      localStorage.setItem('cs.repName', 'Test Rep');
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdnjs.cloudflare.com' && url.pathname.includes('/leaflet/')) {
        /* LEAFLET_DIR serves a local copy where the sandbox has no CDN access. */
        const local = process.env.LEAFLET_DIR && path.join(process.env.LEAFLET_DIR, path.basename(url.pathname));
        if (local && fs.existsSync(local)) { await route.fulfill({ body: fs.readFileSync(local), contentType: local.endsWith('.css') ? 'text/css' : 'application/javascript' }); return; }
        await route.continue(); return;
      }
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
        await route.fulfill({json:{total:4,hasMore:false,manifest:{count:4,located:3,approximate:1,unmatched:1,detailed:1},rows:[
          {id:'crexi:123',addr:'1 Listed Warehouse',city:'Chicago',state:'IL',zip:'60601',type:'Industrial',sqft:50000,lat:41.8,lon:-87.7,src:'crexi-import',listed:{forSale:true,url:'https://www.crexi.com/properties/123/test',askPrice:100000},geocode:{status:'matched',accuracy:'street-interpolated'},photos:[]},
          {id:'crexi:126',addr:'5730 W Dempster St',city:'Morton Grove',state:'IL',zip:'60053',type:'Industrial',subtype:'Retail | Pharmacy/Drug',sqft:44000,lat:42.04,lon:-87.78,src:'crexi-import',listed:{forSale:true,url:'https://www.crexi.com/properties/126/test',askPrice:null},geocode:{status:'matched',accuracy:'street-interpolated'},photos:[],
            detail:{unpriced:true,daysOnMarket:1,updated:'Updated 1 day ago',headline:'Walgreens - Morton Grove, IL',noi:375435,occupancy:100,leaseType:'NN',leaseExpiration:'07/31/2028',yearBuilt:2001,listedBy:'JLL',brokers:[{name:'Alex Geanakos',firm:'JLL'},{name:'Mohsin Mirza',firm:'JLL',phone:'(312) 555-0142'}],capturedAt:'2026-09-22T12:00:00Z',src:'crexi-page'}},
          {id:'crexi:124',addr:'2 Unplaced Listing',city:'Chicago',state:'IL',zip:'60601',type:'Office',sqft:null,lat:null,lon:null,src:'crexi-import',listed:{forSale:true,url:'https://www.crexi.com/properties/124/test'},photos:[]},
          {id:'crexi:125',addr:'Lot 3 Area Centre Listing',city:'Chicago',state:'IL',zip:'60601',type:'Vacant Land',sqft:null,lotAcres:2,lat:41.81,lon:-87.71,src:'crexi-import',listed:{forSale:true,url:'https://www.crexi.com/properties/125/test',askPrice:250000},geocode:{status:'approximate',source:'derived',accuracy:'area centre of 12 matched listings in ZIP 60601; not the parcel',area:'ZIP 60601'},photos:[]}
        ]}});return;
      }
      if (url.pathname === '/api/site-lease') {
        const b=route.request().postDataJSON();
        assert.equal(b.site.id,'fixture-a','the lease is priced for the open site');
        assert.ok(b.kw>0&&b.kwh>0,'the lease is priced against the sized battery');
        const offer=require('../api/_lib/site-lease').offer({kw:b.kw,kwh:b.kwh,acres:b.acres,termYears:b.termYears});
        delete offer.components;
        await route.fulfill({json:{build:'site-lease/1',offer,site:b.site,brand:{name:'Example Energy'},disclaimer:'Indicative host lease, not a binding offer.'}});return;
      }
      if (url.pathname === '/api/price-site' && process.env.SITEFINDER_WALKTHROUGH) {
        const result=require('../api/price-site')._helpers.finish({staff:false},'example.com',route.request().postDataJSON(),{rates:null,installer:null,supplier:null,note:'Illustrative walkthrough using generic model rates, not a supplier quote.'});
        fs.writeFileSync(path.join(process.env.SITEFINDER_WALKTHROUGH,'example-estimate.json'),JSON.stringify(result,null,2));
        await route.fulfill({json:result});return;
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
    if (process.env.SITEFINDER_WALKTHROUGH) {
      const out=process.env.SITEFINDER_WALKTHROUGH;
      await page.evaluate(()=>{const r=window.__siteTest.ST.rows.find(r=>r.id==='fixture-a');r.addr='Illustrative warehouse';window.__siteTest.render();});
      await page.locator('#fHost').fill('1000');
      await page.locator('#top').screenshot({path:path.join(out,'navigation.png')});
      await page.locator('#filters').screenshot({path:path.join(out,'filters.png')});
      await page.locator('.card[data-id="fixture-a"]').screenshot({path:path.join(out,'site-card.png')});
      await page.locator('.card[data-id="fixture-a"] .energyLead').click();
      await page.locator('#szKwN').fill('250');await page.locator('#szKwN').press('Tab');
      await page.locator('#siteBattery').screenshot({path:path.join(out,'battery.png')});
      await page.locator('#costSite').scrollIntoViewIfNeeded();
      const priceButtons=page.getByRole('button',{name:'Price this site',exact:true});
      console.log('Pricing buttons',await priceButtons.allTextContents());
      await priceButtons.first().click();
      await page.waitForFunction(()=>/Estimated installed cost/i.test(document.getElementById('costBack').innerText));
      await page.locator('#costBack').screenshot({path:path.join(out,'cost.png')});
      await page.locator('.card[data-id="fixture-a"]').screenshot({path:path.join(out,'priced-card.png')});
      console.log('Walkthrough screenshots complete');return;
    }
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
    for (const width of [1920,1440,1024,768,390]) {
      await page.setViewportSize({width,height:900});
      for (const expanded of [false,true]) {
        const toggle=page.locator('#moreFilters');
        if ((await toggle.getAttribute('aria-expanded')) !== String(expanded)) await toggle.click();
        await page.waitForFunction(() => Math.abs(document.getElementById('stage').getBoundingClientRect().top-document.getElementById('filters').getBoundingClientRect().bottom)<2);
        const fit=await page.evaluate(() => ['top','filters'].map(id=>{const e=document.getElementById(id);return {id,overflow:e.scrollWidth>e.clientWidth+1};}));
        assert.ok(fit.every(x=>!x.overflow),'controls fit without horizontal scrolling at '+width);
        assert.equal(await page.locator('#fScore').isVisible(),true);
        assert.equal(await page.locator('#fKw').isVisible(),expanded);
      }
    }
    await page.locator('#fKw').fill('125');
    await page.locator('#moreFilters').click();
    assert.match(await page.locator('#moreFilters').innerText(),/active/);
    await page.locator('#moreFilters').click();
    assert.equal(await page.locator('#fKw').inputValue(),'125','collapsing preserves filter values');
    await page.locator('#clearFilters').click();
    await page.locator('#moreFilters').click();
    await page.screenshot({path:'/tmp/sitefinder-controls-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:'/tmp/sitefinder-controls-desktop.png',fullPage:true});
    await page.evaluate(() => { window.__siteTest.ST.rows = []; window.__siteTest.ST.current = null; });
    await page.locator('[data-view="saved"]').click();
    assert.equal(await page.locator('.card').count(), 1, 'saved view works before any fresh search');
    await page.locator('[data-view="catalog"]').click();
    await page.locator('.card[data-id="crexi:124"]').waitFor();
    assert.equal(await page.locator('.card').count(),4,'located, detailed, unplaced and area-centre listings all render');
    const walgreens=await page.locator('.card[data-id="crexi:126"] .facts').innerText();
    assert.match(walgreens,/Unpriced · call for offers/); assert.match(walgreens,/Days on market\s+1 · updated 1 day ago/); assert.match(walgreens,/NOI\s+\$375,435\/yr/);
    assert.match(walgreens,/Walgreens - Morton Grove, IL · 100% occupied · NN lease · expires 07\/31\/2028/); assert.match(walgreens,/Built\s+2001/);
    assert.match(walgreens,/Alex Geanakos, JLL\nMohsin Mirza, JLL · \(312\) 555-0142/,'brokers from the captured page are the contact');
    assert.equal((walgreens.match(/pending API integration/g)||[]).length,3,'value, last sale and owner still say why they are missing');
    assert.match(await page.locator('#catalogStatus').innerText(),/2 of 4 have Census street positions, 1 sit at the centre of their ZIP, 1 still need a location/);
    await page.evaluate(()=>{const d=document.getElementById('catalogDetails');d.hidden=false;d.open=true;});
    assert.match(await page.locator('#captureBookmarklet').getAttribute('href'),/^javascript:\(function crexiCaptureBookmarklet\(\)/,'the bookmarklet is built from the page\'s own function');
    assert.doesNotMatch(await page.locator('#captureBookmarklet').getAttribute('href'),/\/\/ /,'no line comments inside a javascript: URL');
    await page.locator('#catalogLinks').click();
    const queue=JSON.parse(await page.locator('#catalogLinksOut').inputValue());
    assert.equal(queue.kind,'crexi-capture-queue');
    assert.deepEqual(queue.urls,['https://www.crexi.com/properties/123/test','https://www.crexi.com/properties/124/test','https://www.crexi.com/properties/125/test'],'the list is every listing on the page without captured details');
    assert.match(await page.locator('#catalogStatus').innerText(),/1 carry listing page details/);
    assert.equal(await page.locator('a[href="https://www.crexi.com/properties/123/test"]').count(),1);
    const facts=await page.locator('.card[data-id="crexi:123"] .facts').innerText();
    assert.match(facts,/Asking\s+\$100,000/,'the snapshot\'s asking price is on the card');
    assert.equal((facts.match(/pending API integration/g)||[]).length,5,'value, last sale, days on market, owner and contact say why they are missing');
    assert.match(await page.locator('.card[data-id="crexi:125"]').innerText(),/centre of ZIP 60601, not the parcel/,'an area-centre pin says so on the card');
    assert.equal(await page.evaluate(()=>{const r=window.__siteTest.ST.byId['crexi:125'];return r.approx&&r.approxKind;}),'area centre','an approximate listing carries the approximate-pin flags');
    await page.locator('.card[data-id="crexi:124"] .energyLead').click();
    assert.equal(await page.locator('#rSave').count(),0,'unplaced listings cannot hold capacity');
    assert.match(await page.locator('#dVerify').innerText(),/Location not verified/i);
    await page.locator('#dClose').click();
    /* The host lease offer, from the sized fixture: priced server-side, opened as a document. */
    await page.locator('[data-view="saved"]').click();
    await page.locator('.card[data-id="fixture-a"] [data-lease-id]').waitFor();
    await page.locator('.card[data-id="fixture-a"] .energyLead').click();
    await page.locator('#siteLease').waitFor();
    assert.equal(await page.locator('#leaseTerm').inputValue(),'15');
    await page.locator('#leaseTerm').fill('20');
    await page.locator('#leaseQuote').click();
    await page.locator('#leaseOpen').waitFor();
    const leaseText=await page.locator('#siteLease').innerText();
    assert.match(leaseText,/per month, year one/); assert.match(leaseText,/over 20 years/,'the term the rep typed is the term priced');
    const [popup]=await Promise.all([page.waitForEvent('popup'),page.locator('#leaseOpen').click()]);
    await popup.waitForLoadState();
    const doc=await popup.content();
    assert.match(doc,/Your land\.<br>Our battery\./); assert.match(doc,/Test Owner LLC/,'the owner on the card is the host on the proposal');
    assert.match(doc,/Example Energy/,'the workspace brand is on the proposal'); assert.match(doc,/receive rent for 20 years/);
    await popup.close();
    await page.locator('#szKwN').fill('200'); await page.locator('#szKwN').press('Tab');
    assert.match(await page.locator('#siteLease').innerText(),/changed since this offer was priced/,'a resize marks the offer stale');
    await page.locator('#dClose').click();
    assert.deepEqual(errors, []);
    console.log('Site Finder browser workflow passed: score/hosting filters, saved visibility, sizing/hold consistency, unknown feeder, mobile layout, catalogue coverage and area-centre pins, property facts, host lease proposal.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
