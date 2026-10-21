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
    var runServer = require('./_lib/editor-v2-server.js').create({zip:'85042'}), parcelPosts = 0, buildPosts = [];
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
      /* the eight guided builds: the REAL planner (api/_lib/guided-build.js) */
      if(url.includes('/api/guided-build')) { var gq=route.request().postDataJSON()||{}; buildPosts.push(gq.builder); return route.fulfill({json:require('../api/_lib/guided-build').plan(String(gq.builder||''),gq.input||{})}); }
      if(url.includes('/api/parcel-tiles')) return route.fulfill({json:{ok:false,reason:'not-configured'}});
      if(url.includes('/api/parcel')) { parcelPosts++; var q=route.request().postDataJSON(), dl=100/364000/2, dg=dl/Math.cos(q.lat*Math.PI/180);
        return route.fulfill({json:{ok:true,ring:[[q.lat-dl,q.lng-dg],[q.lat-dl,q.lng+dg],[q.lat+dl,q.lng+dg],[q.lat+dl,q.lng-dg]],apn:'TEST-1',owner:'Not shown',acres:0.23,county:'Maricopa County, AZ',source:'maricopa'}}); }
      return route.abort();
    });
    await page.goto(base+'/editor-v2.html');
    await page.waitForFunction(function() { return !!window.OmegaEditorV2View3D; });
    /* the OMEGA mark holds the page until it is known (at most 4 s); nothing
       is clickable under it, so wait for it rather than for a slow screenshot */
    await page.waitForFunction(function(){return !document.documentElement.classList.contains('omega-loading');},null,{timeout:20000});
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
    /* the address is the first thing on the Site tab, Enter or one click */
    await page.click('#stages [data-stage="site"]');
    await page.fill('#site-address-go','33.41541, -111.83264');
    await page.click('#site-address-find');
    await page.waitForFunction(function(){return /Anchor set/.test(document.getElementById('status').textContent)&&document.getElementById('site-address').value==='33.41541, -111.83264';},null,{timeout:5000});
    await page.fill('#site-address-go','33.30600, -112.07400');
    await page.press('#site-address-go','Enter');
    await page.waitForFunction(function(){return document.getElementById('site-address').value==='33.30600, -112.07400';},null,{timeout:5000});
    await page.click('#stages [data-stage="design"]');
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
    /* The eight guided builds, end to end (Tommy, 2026-10-20: "make sure the
       guided builds work"): each opens its dialog, asks the real planner,
       lands on clear ground, and the view goes to it, selected. */
    var builds=['der','autolayout','bess','topology','l2','dcfc','compute','engineering'];
    buildPosts.length=0;
    for (var bi=0; bi<builds.length; bi++) {
      var bid=builds[bi];
      await page.click('#stages [data-stage="design"]');
      await page.click('[data-build="'+bid+'"]');
      await page.waitForFunction(function(){return document.getElementById('dlg-build').open;},null,{timeout:5000});
      await page.click('#build-place');
      await page.waitForFunction(function(){return !document.getElementById('dlg-build').open||!!document.getElementById('build-error').textContent;},null,{timeout:10000});
      var placedState=await page.evaluate(function(){return {open:document.getElementById('dlg-build').open,err:document.getElementById('build-error').textContent,status:document.getElementById('status').textContent};});
      assert(!placedState.open&&!placedState.err,bid+' places: '+JSON.stringify(placedState));
      assert(/It is selected: drag to move it\./.test(placedState.status),bid+' says where it is: '+placedState.status);
      if (bid==='bess') await page.screenshot({path:path.join(out,'build-bess.png')});
    }
    assert.deepStrictEqual(buildPosts,builds,'each build asked the planner once: '+buildPosts.join());
    /* Send to funding asks on the page (a browser popup is answered "no",
       unseen, by an embedded browser); Cancel submits nothing. */
    var dialogs=[]; page.on('dialog',function(d){dialogs.push(d.message());d.dismiss();});
    await page.click('#stages [data-stage="funding"]');
    await page.click('#btn-funding-send');
    await page.waitForFunction(function(){return document.getElementById('dlg-market').open;},null,{timeout:5000});
    await page.click('#dlg-market button[value="cancel"]');
    await page.waitForFunction(function(){return !document.getElementById('dlg-market').open;});
    assert(!/Submitting|Submitted/.test(await page.evaluate(function(){return document.getElementById('status').textContent;})),'Cancel submits nothing');
    assert.deepStrictEqual(dialogs,[],'no browser popup is raised');
    /* View › Icons: each piece drawn as what it is, the switch remembered;
       off again, the plain boxes come back */
    var canvasSum=function(){var c=document.getElementById('cv'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,h=0;for(var i=0;i<d.length;i+=7)h=(h*31+d[i])>>>0;return h;};
    await page.click('#stages [data-stage="site"]');
    var plainSum=await page.evaluate(canvasSum);
    await page.click('[data-act="icons"]');
    await page.waitForTimeout(150);
    var iconState=await page.evaluate(function(){return {on:OmegaEditorV2App.debug().icons,pressed:document.querySelector('[data-act="icons"]').getAttribute('aria-pressed'),kept:localStorage.getItem('omegaMaximusIcons')};});
    assert.deepStrictEqual(iconState,{on:true,pressed:'true',kept:'1'},'Icons turns on and this browser keeps it: '+JSON.stringify(iconState));
    assert.notStrictEqual(await page.evaluate(canvasSum),plainSum,'with Icons on the equipment is drawn differently');
    await page.click('[data-act="icons"]');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(canvasSum),plainSum,'off again, the drawing is exactly as it was');
    /* A new project: Find on the map opens on the block around the point
       (it opened on one roof, 280 ft across), the photo is laid at that
       scale (past 24 tiles it used to go blank), the Site tab's own switch
       shows the parcel lines, and Use as site boundary zooms to the lot. */
    await page.click('#btn-new');
    await page.waitForFunction(function(){return document.getElementById('dlg-confirm').open||document.getElementById('app').getAttribute('data-section')==='site';});
    if (await page.evaluate(function(){return document.getElementById('dlg-confirm').open;})) await page.click('#dlg-confirm button[value="discard"]');
    await page.waitForFunction(function(){return document.getElementById('app').getAttribute('data-section')==='site'&&document.activeElement&&document.activeElement.id==='site-address-go';});
    await page.fill('#site-address-go','33.45000, -112.07000');
    await page.click('#site-address-find');
    await page.waitForFunction(function(){return /Anchor set/.test(document.getElementById('status').textContent);},null,{timeout:5000});
    var framed=await page.evaluate(function(){return OmegaEditorV2App.debug();});
    var across=framed.view.w/framed.view.pxPerFt;
    assert(across>=600&&across<=800&&Math.abs(framed.view.cx)<1&&Math.abs(framed.view.cy)<1,'Find opens about 700 ft across, centred on the point: '+JSON.stringify(framed.view));
    assert(framed.map&&framed.map.tiles>24&&framed.map.z>=12&&framed.map.z<=19,'the photo is laid at that scale, past the old 24-tile cap: '+JSON.stringify(framed.map));
    /* Google's satellite cannot load on this offline server: the editor says
       why and keeps Esri's tiles, with no error */
    var sat=await page.evaluate(function(){return {state:OmegaEditorV2Satellite.state(),reason:OmegaEditorV2Satellite.reason(),source:OmegaEditorV2App.debug().map.source,shown:getComputedStyle(document.getElementById('gsat')).display};});
    assert(sat.state==='failed'&&/Esri/.test(sat.reason)&&sat.source==='esri'&&sat.shown==='none','offline, Google steps aside and the photo is Esri\'s: '+JSON.stringify(sat));
    assert.strictEqual(await page.evaluate(function(){return getComputedStyle(document.getElementById('map')).display;}),'block','the photo layer is shown');
    assert.strictEqual(await page.innerText('#site-parcels'),'Show parcel lines','the Site tab offers the parcel lines');
    await page.click('#site-parcels');
    await page.waitForFunction(function(){var c=document.getElementById('parcel-detail');return c&&!c.hidden&&/APN TEST-1/.test(c.innerText)&&!document.getElementById('parcel-use').hidden;},null,{timeout:10000});
    assert.strictEqual(await page.innerText('#site-parcels'),'Hide parcel lines','the switch says what it will do next');
    await page.click('#parcel-use');
    await page.waitForFunction(function(){return /lot line now/.test(document.getElementById('status').textContent);},null,{timeout:5000});
    var lot=await page.evaluate(function(){var d=OmegaEditorV2App.debug();return {view:d.view};});
    var lotAcross=lot.view.w/lot.view.pxPerFt;
    assert(lotAcross<400&&Math.abs(lot.view.cx)<20&&Math.abs(lot.view.cy)<20,'Use as site boundary zooms to the 100 ft lot: '+JSON.stringify(lot.view));
    await page.click('#site-parcels');
    assert.strictEqual(await page.innerText('#site-parcels'),'Show parcel lines','and the switch turns them off again');
    assert.deepStrictEqual(errors,[]);
    /* Omega Maximus is a module: a signed-in workspace that has not bought it
       sees the price and Opt in; one that has sees the editor. The sign-in
       is stood in for before the page's scripts run. */
    async function lockPage(answer){
      var p2=await browser.newPage({viewport:{width:1280,height:800}}), errs=[];
      p2.on('pageerror',function(e){errs.push(e.message);});
      await p2.addInitScript(function(){var held;Object.defineProperty(window,'OmegaEditorV2Auth',{configurable:true,get:function(){return held;},set:function(v){if(v)v.idToken=function(){return Promise.resolve('lock-test-token');};held=v;}});});
      await p2.route('**/*',function(route){var url=route.request().url();
        if(url.includes('/api/maximus-access')) return route.fulfill({json:answer});
        if(url.startsWith(base)&&!url.includes('/api/')) return route.continue();
        return route.abort();});
      await p2.goto(base+'/editor-v2.html');
      await p2.waitForFunction(function(){return !!window.OmegaEditorV2App;});
      /* the splash holds the page until it is known (at most 4 s) */
      await p2.waitForFunction(function(){return !document.documentElement.classList.contains('omega-loading');},null,{timeout:8000});
      await p2.waitForTimeout(200);
      return {page:p2,errs:errs};
    }
    var locked=await lockPage({held:false,reason:"Omega Maximus is not on this workspace's plan. Opt in on the Modules page.",price:'$1,299/month',optIn:'/workspace#module-maximus'});
    await locked.page.waitForFunction(function(){return !document.getElementById('maximus-lock').hidden;},null,{timeout:5000});
    var lockText=await locked.page.locator('#maximus-lock').innerText();
    assert(/Omega Maximus is \$1,299\/month\./.test(lockText)&&/not on this workspace's plan/.test(lockText),'a workspace without it sees the price and why: '+lockText);
    assert.strictEqual(await locked.page.getAttribute('#maximus-lock-optin','href'),'/workspace#module-maximus','Opt in goes to the module on the Modules page');
    await locked.page.screenshot({path:path.join(out,'lock.png')});
    assert.deepStrictEqual(locked.errs,[]); await locked.page.close();
    var open=await lockPage({held:true});
    assert(await open.page.evaluate(function(){return document.getElementById('maximus-lock').hidden;}),'a workspace that holds it sees the editor');
    assert.deepStrictEqual(open.errs,[]); await open.page.close();
    console.log(JSON.stringify({passed:true,mode:first.mode,triangles:first.triangles,shots:out,externalServices:'offline: fallback verified'}));
  } finally {if(browser) await browser.close(); server.close();}
})().catch(function(e){console.error(e);process.exitCode=1;});
