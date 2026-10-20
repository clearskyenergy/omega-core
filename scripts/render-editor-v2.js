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
    var runServer = require('./_lib/editor-v2-server.js').create({zip:'85042'}), parcelPosts = 0;
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
      /* Run: the real cost engine and the real value-stack handler */
      if(url.includes('/api/cost-rollup')||url.includes('/api/value-stack')) return runServer.answer(url,route.request().postDataJSON()).then(function(r){return route.fulfill({status:r.status,json:r.json});});
      /* Parcel lines: no Regrid on this server; the parcel under a point is a
         100 ft lot around it, in /api/parcel's own shape */
      if(url.includes('/api/parcel-tiles')) return route.fulfill({json:{ok:false,reason:'not-configured'}});
      if(url.includes('/api/parcel')) { parcelPosts++; var q=route.request().postDataJSON(), dl=100/364000/2, dg=dl/Math.cos(q.lat*Math.PI/180);
        return route.fulfill({json:{ok:true,ring:[[q.lat-dl,q.lng-dg],[q.lat-dl,q.lng+dg],[q.lat+dl,q.lng+dg],[q.lat+dl,q.lng-dg]],apn:'TEST-1',owner:'Not shown',acres:0.23,county:'Maricopa County, AZ',source:'maricopa'}}); }
      return route.abort();
    });
    await page.goto(base+'/editor-v2.html');
    await page.waitForFunction(function() { return !!window.OmegaEditorV2View3D; });
    fs.mkdirSync(out,{recursive:true});
    await page.screenshot({path:path.join(out,'plan.png')});
    /* Handoff A1: the drawing stays through every section and a cancelled
       build. Inked canvas pixels, before and after. */
    var inked=function(){var c=document.getElementById('cv'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,n=0;for(var i=3;i<d.length;i+=16)if(d[i]>0)n++;return n;};
    var ink0=await page.evaluate(inked);assert(ink0>500,'the sample site is drawn: '+ink0);
    /* Read straight after each step, with no wait for a frame: the drawing
       must never be blank in between. */
    var still=async function(step){var n=await page.evaluate(inked);assert(n>=ink0*0.9,'the drawing is still on the canvas after '+step+': '+ink0+' → '+n);};
    for (var st of ['site','analyze','outputs','funding','design']) {
      await page.click('#stages [data-stage="'+st+'"]');
      assert.strictEqual(await page.evaluate(function(){return document.getElementById('app').getAttribute('data-section');}),st,'the '+st+' tab opens');
      if (st==='outputs') assert(await page.evaluate(function(){return !document.getElementById('side-outputs').hidden&&!!document.getElementById('btn-permit');}),'the Outputs tab opens its panel');
      await still('the '+st+' tab');
    }
    await page.click('[data-build="bess"]');await page.waitForFunction(function(){return document.getElementById('dlg-build').open;});await still('opening a build');
    await page.click('#build-cancel');await page.waitForFunction(function(){return !document.getElementById('dlg-build').open;});await still('Cancel on a build');
    await page.click('[data-build="bess"]');await page.waitForFunction(function(){return document.getElementById('dlg-build').open;});
    await page.keyboard.press('Escape');await page.waitForFunction(function(){return !document.getElementById('dlg-build').open;});await still('Escape on a build');
    await page.click('#btn-outputs');await still('the Outputs button');await page.click('#outputs-close');await still('closing Outputs');
    await page.evaluate(function(){OmegaEditorV2Auth.idToken=function(){return Promise.resolve('offline-test-token');};});
    /* Run prices the drawing and runs the value stack on the server, and
       Analyze shows what came back, labelled as screening. */
    await page.click('#btn-run');
    await page.waitForFunction(function(){var h=document.getElementById('run-head');return h&&/^Run on /.test(h.textContent);},null,{timeout:30000});
    var analyzed=await page.evaluate(function(){return {body:document.getElementById('analyze-body').innerText,status:document.getElementById('status').textContent,doc:{cost:OmegaEditorV2Analyze.factsFrom?null:null}};});
    assert(/Cost estimate/.test(analyzed.body)&&/\$[\d,]{5,}/.test(analyzed.body),'Analyze shows the installed estimate from the cost engine');
    assert(/Demand charges avoided/.test(analyzed.body)&&/computed|planning/.test(analyzed.body),'Analyze shows the value-stack streams with their tier');
    assert(/\d+\.\d%/.test(analyzed.body)&&/Bankable case/.test(analyzed.body)||/No IRR[\s\S]*no IRR is shown/.test(analyzed.body),'Analyze shows the IRR with the bankable case, or says why there is none');
    assert(/screening estimate, not a quote/i.test(analyzed.body)&&/Screening, not a quote/.test(analyzed.status),'every figure is labelled screening');
    assert(/solar design did not answer/i.test(analyzed.body),'the solar run that could not answer says so');
    assert.deepStrictEqual(runServer.calls.map(function(c){return c.path;}),['/api/cost-rollup','/api/value-stack'],'Run asks the cost engine and the value stack once each');
    await page.screenshot({path:path.join(out,'run.png')});
    await page.click('#stages [data-stage="design"]');
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
    await page.evaluate(function(){OmegaEditorV2Outputs.close();OmegaEditorV2App.applyGuidedBuild(OmegaEditorV2Guided.examples.bess());OmegaEditorV2App.openOutputs();});
    await page.getByText('Electrical and sheet details',{exact:true}).click();
    await page.getByLabel('Utility',{exact:true}).fill('Customer trial test utility');
    await page.getByRole('button',{name:'Apply details',exact:true}).click();
    await page.getByText('Electrical and sheet details',{exact:true}).click();
    assert.strictEqual(await page.getByLabel('Utility',{exact:true}).inputValue(),'Customer trial test utility');
    var downloaded=page.waitForEvent('download');
    await page.click('#out-permit-pdf');
    var pdf=await downloaded; var pdfPath=await pdf.path();
    assert(fs.readFileSync(pdfPath).subarray(0,4).toString()==='%PDF','permit output is a real PDF');
    await page.evaluate(function(){OmegaEditorV2Outputs.close();});
    /* A typed address is found on the FIRST click of Find address (the blur
       that saves the field used to rebuild the panel under the click), and
       on Enter. Coordinates need no network. */
    await page.click('#stages [data-stage="design"]');
    await page.fill('#site-address','33.41541, -111.83264');
    await page.click('#site-find');
    await page.waitForFunction(function(){return /Anchor set/.test(document.getElementById('status').textContent);},null,{timeout:5000});
    assert(await page.evaluate(function(){var e=document.getElementById('site-address');return !!e;}),'the address field is still there after Find address');
    await page.fill('#site-address','33.30600, -112.07400');
    await page.press('#site-address','Enter');
    await page.waitForFunction(function(){return document.getElementById('site-address').value==='33.30600, -112.07400'&&/Anchor set/.test(document.getElementById('status').textContent);},null,{timeout:5000});
    assert.strictEqual(await page.evaluate(function(){return document.title;}),'Omega Maximus','the page is Omega Maximus');
    /* Parcel lines: the layer comes on over the photo, the parcel under the
       site point is looked up once, and Use as site boundary makes it the
       drawing's lot line. */
    await page.click('#layer-parcels-toggle');
    await page.waitForFunction(function(){var c=document.getElementById('parcel-detail');return c&&!c.hidden&&/APN TEST-1/.test(c.innerText);},null,{timeout:10000}).catch(async function(e){
      var d=await page.evaluate(function(){var c=document.getElementById('parcel-detail');return {hidden:c&&c.hidden,text:c&&c.innerText,status:document.getElementById('status').textContent,on:OmegaEditorV2Parcels.enabled(),last:OmegaEditorV2Parcels.status()};});
      throw new Error('parcel card: '+JSON.stringify(d)+' posts='+parcelPosts);
    });
    var parcelText=await page.locator('#parcel-detail').innerText();
    assert(/Maricopa County, AZ/.test(parcelText)&&/tax map, not a survey/.test(parcelText)&&parcelText.indexOf('Not shown')<0,'the card names the county layer, says reference only, and never the owner');
    assert(await page.evaluate(function(){return getComputedStyle(document.getElementById('map-parcels')).display==='block'&&document.querySelectorAll('#map-parcels .pt').length>0;}),'the county lines are laid over the photo');
    await page.click('#parcel-use');
    await page.waitForFunction(function(){return /lot line now \(APN TEST-1\)/.test(document.getElementById('status').textContent)&&document.getElementById('parcel-use').hidden;},null,{timeout:5000});
    assert.strictEqual(parcelPosts,1,'the parcel under the site point is looked up once');
    await page.screenshot({path:path.join(out,'parcels.png')});
    await page.click('#layer-parcels-toggle');
    assert(await page.evaluate(function(){return document.getElementById('parcel-detail').hidden&&getComputedStyle(document.getElementById('map-parcels')).display==='none';}),'off, the lines and the card go');
    assert.deepStrictEqual(errors,[]);
    console.log(JSON.stringify({passed:true,mode:first.mode,triangles:first.triangles,shots:out,externalServices:'offline: fallback verified'}));
  } finally {if(browser) await browser.close(); server.close();}
})().catch(function(e){console.error(e);process.exitCode=1;});
