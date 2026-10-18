/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
var root = path.resolve(__dirname, '..'), chromium = require('playwright').chromium;
var out = process.env.EDITOR_V2_SHOTS || '/tmp/codex-editor-v2-review';
var server = http.createServer(function(req,res) {
  var file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
(async function() {
  var browser;
  try {
    await new Promise(function(resolve) { server.listen(0,'127.0.0.1',resolve); });
    var base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    var page = await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.on('pageerror', function(e) { errors.push(e.message); });
    await page.route('**/*', function(route) {
      var url = route.request().url();
      if(url.startsWith(base) && !url.includes('/api/')) return route.continue();
      if(url.includes('/api/editor-v2-component-cost')) return route.fulfill({json:require('../api/_lib/editor-v2-component-cost')(route.request().postDataJSON())});
      if(url.includes('/api/editor-v2-3d-config')) return route.fulfill({json:{photorealistic:false}});
      return route.abort();
    });
    await page.goto(base+'/editor-v2.html');
    await page.waitForFunction(function() { return !!window.OmegaEditorV2View3D; });
    fs.mkdirSync(out,{recursive:true});
    await page.screenshot({path:path.join(out,'plan.png')});
    await page.evaluate(function(){OmegaEditorV2Auth.idToken=function(){return Promise.resolve('offline-test-token');};});
    await page.click('#btn-3d');
    await page.waitForFunction(function(){return OmegaEditorV2View3D.isOpen();});
    await page.waitForFunction(function(){return OmegaEditorV2View3D.debug().triangles > 0;});
    var first = await page.evaluate(function(){return OmegaEditorV2View3D.debug();});
    assert(first.triangles > 0);
    await page.getByText('BESS',{exact:true}).last().click();
    await page.waitForFunction(function(){return document.body.innerText.indexOf('Screening cost: $430,500')>=0;});
    await page.screenshot({path:path.join(out,'3d.png')});
    await page.evaluate(function(){OmegaEditorV2View3D.close();});
    assert(await page.evaluate(function(){return !OmegaEditorV2View3D.isOpen();}));
    await page.click('#btn-3d');
    await page.waitForFunction(function(){return OmegaEditorV2View3D.isOpen();});
    await page.evaluate(function(){OmegaEditorV2View3D.close();});
    assert.deepStrictEqual(errors,[]);
    console.log(JSON.stringify({passed:true,mode:first.mode,triangles:first.triangles,shots:out,externalServices:'offline: fallback verified'}));
  } finally {if(browser) await browser.close(); server.close();}
})().catch(function(e){console.error(e);process.exitCode=1;});
