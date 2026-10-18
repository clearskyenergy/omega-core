#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   One example order across real local API handlers and Chromium pages.
   Firebase authentication, Firestore and payment providers are test doubles.
   No production credentials or network services are used. */
'use strict';
var fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
var ROOT=path.resolve(__dirname,'..'),H=require('./test-logic-workflow'),chromium=require('playwright').chromium;
var args=process.argv,at=args.indexOf('--shots'),OUT=at>=0?path.resolve(args[at+1]):null;
var readAt=args.indexOf('--root'),FILES=readAt>=0?path.resolve(args[readAt+1]):ROOT,baseline=args.indexOf('--baseline')>=0;
var APIs={'/api/logic-office':H.office,'/api/logic-plant':H.factory,'/api/logic-logistics':require('../api/logic-logistics'),'/api/logic-accounting':require('../api/logic-accounting')};
var caller=H.admin,server,browser,counts={},errors=[];
async function main(){
  H.setup();var db=H.db();db.data.clear();
  db.seed('omega_orgs/cleancell.us',{name:'Example equipment company',status:'active',vertical:'oem'});
  db.seed('omega_orgs/cleancell.us/billing/current',{addons:['omega-logic']});
  db.seed('omega_orgs/cleancell.us/members/plant',{role:'admin',status:'active'});
  db.seed('omega_orgs/cleancell.us/fulfillment/config',{enabled:true,accounting:'tenant',terms:{depositPct:30,dueDays:0},fee:{percent:0,fixed:0}});
  db.seed('omega_orgs/cleancell.us/storefront/config',{products:[{sku:'EXAMPLE-UNIT',name:'Example equipment',kind:'product',active:true}]});
  var project={id:'journey-example',name:'Example project',address:'1 Example St, Chicago, IL 60601'};
  db.seed('projects/'+project.id,Object.assign({orgId:caller.orgId},project));
  var draft=await require('../api/_lib/design-place').place({db:db,FieldValue:H.fieldValue(),caller:caller,designer:{orgId:caller.orgId},project:project,lines:[{sku:'EXAMPLE-UNIT',description:'Example equipment',qty:1}],estimateCents:100000});
  var id=draft.orders[0].id;
  await H.post(H.office,{action:'price',orderId:id,total:1000,accept:true},caller);
  await H.post(H.office,{action:'invoice-issued',orderId:id,stage:'deposit',number:'EXAMPLE-DEPOSIT',date:'2026-10-17'},caller);
  await H.post(H.office,{action:'payment-received',orderId:id,stage:'deposit',amount:300,date:'2026-10-17',bankReference:'EXAMPLE-RECEIPT-001'},caller);
  var wo=db.data.get('orders/'+id).worksOrderId;
  server=http.createServer(async function(req,res){
    var u=new URL(req.url,'http://localhost'),name=u.pathname;
    function json(o,status){res.writeHead(status||200,{'Content-Type':'application/json'});res.end(JSON.stringify(o));}
    try{
      if(APIs[name]){var raw='';for await(var chunk of req)raw+=chunk;
        return json(await APIs[name]({method:req.method,query:Object.fromEntries(u.searchParams),body:raw?JSON.parse(raw):{},caller:caller},{setHeader:function(){}}));}
      if(name==='/api/logic-workspaces')return json({workspaces:[{orgId:caller.orgId,name:'Example equipment company'}]});
      if(name==='/api/logic-materials')return json({hasBom:false,short:[]});
      if(name==='/api/crm')return json({customers:[],follow:[]});
      if(name==='/api/logic-custody')return json({sites:[],units:[],totals:{}});
      if(name.indexOf('/api/')===0)return json({error:'Unexpected endpoint '+name},404);
      if(name==='/config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end('window.CLEARSKY_CONFIG={firebase:{}};');}
      var f=path.resolve(FILES,'.'+name);if(!f.startsWith(FILES+path.sep))return json({error:'Not found'},404);
      if(!path.extname(f))f+='.html';
      if(!fs.existsSync(f))return json({error:'Not found'},404);
      res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));
    }catch(e){json({error:e.message},e.status||500);}
  });
  await new Promise(function(resolve){server.listen(0,'127.0.0.1',resolve);});
  var base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();var ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  await ctx.route('**/*',function(route){if(route.request().url().startsWith(base))return route.continue();return route.fulfill({status:200,body:'',contentType:'text/javascript'});});
  await ctx.addInitScript(function(){window.firebase={apps:[1],auth:function(){return {currentUser:{email:'factory@cleancell.us',getIdToken:function(){return Promise.resolve('example-token');}},onAuthStateChanged:function(fn){setTimeout(function(){fn({uid:'plant',email:'factory@cleancell.us'});},0);}};}};});
  var page=await ctx.newPage();page.on('pageerror',function(e){errors.push(e.message);});
  async function shot(name){await page.waitForFunction(function(){var e=document.getElementById('omega-splash');return !e||getComputedStyle(e).display==='none'||e.hidden;});if(OUT){fs.mkdirSync(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:true});}}
  async function click(selector,step){await page.locator(selector).first().click();counts[step]=(counts[step]||0)+1;}
  var q='?org=cleancell.us';
  await page.goto(base+'/omega-logic'+q+'&order='+id+'#orders');
  await page.waitForSelector('#detail .lg-path');await shot('order');
  if(!baseline)assert((await page.locator('#detail').innerText()).includes(project.address));
  if(baseline)await page.goto(base+'/plant/work-orders.html'+q+'&wo='+wo);
  else await click('#detail .lg-order-links a[href*="work-orders"]','order-to-plant');
  await page.waitForSelector(baseline?'#detail h2':'#detail #journey');await shot('plant');
  if(!baseline)assert((await page.locator('#detail').innerText()).includes('1 Example St'));
  if(!baseline){assert.equal(await page.locator('#detail .lg-path').count(),1);await click('#detail .lg-order-links a[href*="omega-logic"]','plant-to-order');await page.waitForSelector('#detail .lg-path');await click('#detail .lg-order-links a[href*="logic-logistics"]','order-to-shipping');}
  else await page.goto(base+'/logic-logistics.html'+q+'&order='+id);
  await page.waitForSelector(baseline?'#order option':'#order-head',{state:'attached'});await shot('shipping');
  if(!baseline)assert((await page.locator('body').innerText()).includes('1 Example St'));
  if(!baseline)await click('#order-head .lg-order-links a[href*="logic-accounting"]','shipping-to-invoices');
  else {await page.goto(base+'/logic-accounting.html'+q);await page.locator('[data-open]').first().click();}
  await page.waitForSelector('#drawer:not([hidden])');await shot('accounting');
  if(!baseline){assert.equal(await page.locator('#drawer .lg-path').count(),1);assert.equal(await page.locator('#ledger tr[data-row]').count(),1);await click('#drawer .lg-order-links a[href*="omega-logic"]','invoices-to-order');await page.waitForSelector('#detail .lg-path');}
  for(var name of ['plant','shipping','accounting']){
    var url=name==='plant'?'/plant/work-orders.html'+q+'&wo='+wo:name==='shipping'?'/logic-logistics.html'+q+'&order='+id:'/logic-accounting.html'+q+'&order='+id;
    await page.setViewportSize({width:390,height:844});await page.goto(base+url);await page.waitForTimeout(500);
    assert.equal(await page.evaluate(function(){return document.documentElement.scrollWidth>innerWidth+2;}),false,name+' fits mobile');
  }
  caller=Object.assign({},H.admin,{orgId:'unrelated.example',uid:'outside'});
  for(var api of Object.keys(APIs)){var status=await page.evaluate(async function(url){return (await fetch(url)).status;},api+q);assert.equal(status,403,'tenant boundary '+api);}
  assert.deepEqual(errors,[]);
  var report={fixture:'Example data only; real API handlers, mocked auth/database/providers',clicks:counts,tenantIsolation:'four APIs reject unrelated tenant',result:'passed'};
  if(OUT)fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(function(e){console.error(e);process.exitCode=1;}).finally(async function(){if(browser)await browser.close();if(server)server.close();});
