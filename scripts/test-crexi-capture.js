/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The capture bookmarklet, end to end against a stand-in for crexi.com:
   one click on a listing page saves it; "Capture a list" walks a pasted
   queue in a second window, saves each page, downloads the file. Same
   Playwright arrangement as test-sitefinder-ui.js. */
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || './site-agent/node_modules/playwright');
const launchOpts = { headless: true }; if (process.env.SITEFINDER_BROWSER !== 'bundled') launchOpts.channel = 'chrome';
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'clearsky-sitefinder.html'), 'utf8');
const src = html.match(/function crexiCaptureBookmarklet\(\) \{[\s\S]*?\n  \}\n/)[0];
assert.ok(src.length > 1000 && !/\/\/ /.test(src), 'the bookmarklet function is found and carries no line comments');
function listingPage(id) {
  return '<!doctype html><title>Listing ' + id + '</title><body><nav>Sale Lease</nav><h1>' + id + ' Test St, Chicago, IL 60601 For Sale</h1>' +
    '<div>$1,' + id + '00,000 | 3 days on market | Updated 1 day ago</div><div>Warehouse ' + id + '</div><h2>Details</h2>' +
    '<table><tr><td>Square Footage</td><td>52,000</td><td>Year Built</td><td>1978</td></tr></table>' +
    '<div>Jane Broker PRO</div><div>IL IL: #475.1</div><div>View phone number</div><div>Acme</div><p>Listed by Acme - Chicago.</p></body>';
}
(async function () {
  const browser = await chromium.launch(launchOpts);
  try {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'www.crexi.com') {
        const m = url.pathname.match(/^\/properties\/(\d+)\//);
        await route.fulfill({ contentType: 'text/html', body: m ? listingPage(m[1]) : '<!doctype html><title>Search</title><body><h1>Search results</h1></body>' }); return;
      }
      await route.fulfill({ status: 404, body: '' });
    });
    await page.goto('https://www.crexi.com/properties/501/one');
    await page.evaluate('(function(){' + src + ';crexiCaptureBookmarklet();})()');
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('omegaCrexiCaptures')));
    assert.equal(saved.length, 1); assert.equal(saved[0].listingId, '501'); assert.match(saved[0].text, /Square Footage\s+52,000/);
    assert.match(await page.locator('#omegaMsg').innerText(), /Saved this listing\. 1 captured/);
    /* the list: 502 and 503 are new, 501 is already here */
    await page.goto('https://www.crexi.com/search');
    const queue = JSON.stringify({ kind: 'crexi-capture-queue', orgId: 'example.com', urls: ['https://www.crexi.com/properties/501/one', 'https://www.crexi.com/properties/502/two', 'https://www.crexi.com/properties/503/three'] });
    await page.evaluate('(function(){' + src + ';crexiCaptureBookmarklet();})()');
    assert.match(await page.locator('#omegaMsg').innerText(), /Not a listing page\. 1 captured/);
    page.on('dialog', d => d.type() === 'prompt' ? d.accept(queue) : d.accept());
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('#omegaList').click()]);
    assert.match(download.suggestedFilename(), /^crexi-listing-details-\d{4}-\d\d-\d\d-3\.json$/);
    const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(file.kind, 'crexi-detail-capture'); assert.deepEqual(file.captures.map(c => c.listingId).sort(), ['501', '502', '503']);
    assert.match(file.captures.find(c => c.listingId === '503').text, /Listed by Acme/);
    assert.match(await page.locator('#omegaMsg').innerText(), /Captured 2 of 2\. 3 on this browser/);
    assert.equal((await ctx.pages()).length, 1, 'the capture window is closed when the list is done');
    assert.deepEqual(errors, []);
    console.log('Crexi capture bookmarklet: single-page save, list walk of 2 new pages, file download.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
