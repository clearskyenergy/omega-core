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
    var stored = {};
    function decoded(v) { if(v.mapValue)return unpack(v.mapValue.fields);if(v.arrayValue)return(v.arrayValue.values||[]).map(decoded);if('nullValue'in v)return null;return v.stringValue!==undefined?v.stringValue:v.doubleValue!==undefined?v.doubleValue:v.booleanValue; }
    function unpack(v) {var o={};Object.keys(v).forEach(function(k){o[k]=decoded(v[k]);});return o;}
    await page.route('**/*', function(route) {
      var url = route.request().url();
      if(url.includes('/__workspace-fixture')) {
        var q=new URL(url).searchParams, id=q.get('id');
        return route.fulfill({json:id?(stored['projects/'+id]||null):stored});
      }
      if(url.includes('firestore.googleapis.com')) {
        var w=route.request().postDataJSON().writes[0], key=w.update.name.split('/documents/')[1];
        if(stored[key])return route.fulfill({status:409,json:{error:'exists'}});
        stored[key]=unpack(w.update.fields);return route.fulfill({json:{writeResults:[{}]}});
      }
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
    await page.evaluate(function(){
      var u={uid:'review-user',email:'review@example.com',getIdToken:function(){return Promise.resolve('test-token');},getIdTokenResult:function(){return Promise.resolve({claims:{orgId:'example.com'}});}};
      var db={collection:function(){return {doc:function(id){return {get:function(){return fetch('/__workspace-fixture?id='+encodeURIComponent(id)).then(function(r){return r.json();}).then(function(d){return {exists:!!d,id:id,data:function(){return d;}};});}};},where:function(){return {get:function(){return fetch('/__workspace-fixture').then(function(r){return r.json();}).then(function(all){return {forEach:function(fn){Object.keys(all).forEach(function(k){fn({id:k.split('/')[1],data:function(){return all[k];}});});}};});}};}};}};
      window.firebase={auth:function(){return {currentUser:u};},firestore:function(){return db;}};
      OmegaEditorV2Auth.whenReady=function(){return Promise.resolve(u);};
    });
    await page.click('#btn-save');
    await page.waitForFunction(function(){return document.getElementById('save-state').textContent==='Saved to workspace';});
    var ids=Object.keys(stored);assert.strictEqual(ids.length,1);assert.strictEqual(stored[ids[0]].editor,'v2');
    await page.click('#btn-open');
    await page.getByRole('button',{name:'Open from workspace',exact:true}).click();
    await page.locator('#open-list button').filter({hasText:'Sample industrial site'}).first().click();
    await page.waitForFunction(function(){return !document.getElementById('dlg-open').open;});
    await page.click('#btn-outputs');await page.click('#btn-permit');
    await page.waitForFunction(function(){return document.getElementById('dlg-outputs').open;});
    await page.screenshot({path:path.join(out,'outputs.png')});
    await page.evaluate(function(){OmegaEditorV2Outputs.close();});
    assert.deepStrictEqual(errors,[]);
    console.log(JSON.stringify({passed:true,mode:first.mode,triangles:first.triangles,shots:out,externalServices:'offline: fallback verified'}));
  } finally {if(browser) await browser.close(); server.close();}
})().catch(function(e){console.error(e);process.exitCode=1;});
