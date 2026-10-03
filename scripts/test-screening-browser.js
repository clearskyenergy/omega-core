/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
/* Local-only browser tests. Authentication/providers are mocked in the test
   browser, never in production files. The ranking API runs the real engine. */
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
let playwright;
try{playwright=require('playwright');}catch(e){playwright=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));}
const root=path.resolve(__dirname,'..'),engine=require('../api/_lib/portfolio-screening');
const output=process.env.SCREENING_TEST_OUTPUT||path.join(root,'test-output');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/api/portfolio-screening'||pathname==='/api/portfolio-enrich'){
  let text='';req.on('data',c=>text+=c);req.on('end',()=>{try{
   const b=JSON.parse(text);res.setHeader('Content-Type','application/json');
   if(pathname.endsWith('enrich'))res.end(JSON.stringify({checkedAt:new Date().toISOString(),fields:{},notes:['Verify: synthetic provider fixture has no coverage.'],features:[]}));
   else res.end(JSON.stringify(engine.screen(b.mode,b.sites)));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}});return;
 }
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;return res.end('Not found');}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
const firebaseStub=`window.firebase={apps:[],initializeApp:function(){this.apps.push({});},auth:function(){return {onAuthStateChanged:function(cb){setTimeout(function(){cb({email:'review@example.invalid',getIdToken:function(){return Promise.resolve('local-test-only');}});},0);return function(){};}};}};`;
let browser,page,checks=0,errors=[];
function pass(msg){checks++;console.log('PASS '+msg);}
async function waitReport(){await page.locator('#results').waitFor({state:'visible'});await page.locator('#run:not([disabled])').waitFor();}
async function noOverflow(){const d=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.offsetWidth).slice(0,12).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))}));assert(d.scroll<=d.width+1,JSON.stringify(d));}
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 browser=await playwright.chromium.launch({executablePath:process.env.SCREENING_BROWSER_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process']});
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('https://**/*',route=>route.fulfill({contentType:'application/javascript',body:route.request().url().includes('firebase-app-compat')?firebaseStub:''}));
 await page.route('**/omega-tenant.js',route=>route.fulfill({contentType:'application/javascript',body:'window.OmegaTenant={refused:null};'}));
 await page.goto(url+'/screening.html');await page.getByRole('heading',{name:'Find the sites worth pursuing.'}).waitFor();
 assert.equal(await page.locator('.tool-card').count(),2);await noOverflow();await page.screenshot({path:path.join(output,'screening-hub.png'),fullPage:true});pass('hub renders both screening tools without errors');
 await page.getByRole('link',{name:/Open BESS Portfolio Screening/}).click();await page.locator('#file').waitFor();
 const csk=process.env.CSK_XLSX;
 if(csk){
  await page.locator('#file').setInputFiles(csk);await page.getByText(/Imported 11 sites/).waitFor();assert.equal(await page.locator('#intakeCount').innerText(),'11 sites ready for review');
  await page.locator('#enrich').uncheck();await page.locator('#run').click();await waitReport();assert.equal(await page.locator('.result').count(),11);
  const sizeText=await page.locator('.result .metric:nth-child(5) b').allTextContents();assert(sizeText.every(t=>t==='Verify'));
  pass('actual CSK workbook imports all 11 sites, flags conflicts and avoids unverified recommended sizes');
  const parity=await page.evaluate(async()=>{
   const f=document.querySelector('#file');return document.querySelectorAll('.result').length;
  });assert.equal(parity,11);
  await page.locator('#results').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'bess-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await noOverflow();await page.locator('#results').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'bess-mobile.png'),fullPage:true});
  await page.locator('.result button').first().click();await page.getByRole('heading',{name:'Verify before advancing'}).waitFor();await noOverflow();assert.equal(await page.locator('.score-table tbody tr').count(),4);await page.screenshot({path:path.join(output,'bess-mobile-detail.png'),fullPage:true});
  await page.locator('#editFields summary').click();await page.locator('input[name=parkingSpaces]').fill('4');await page.locator('#editForm button[type=submit]').click();await waitReport();pass('mobile site review edits inputs and reranks the full portfolio');
  const dl=page.waitForEvent('download');await page.locator('#export').click();const download=await dl;const file=path.join(output,'test-results.csv');await download.saveAs(file);const csv=fs.readFileSync(file,'utf8');assert(csv.includes('Verify'));assert(csv.includes('Model version'));pass('CSV export includes decisions, evidence, missing data and model version');
  await page.emulateMedia({media:'print'});await page.pdf({path:path.join(output,'bess-print-check.pdf'),format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
 }
 await page.goto(url+'/screening.html?tool=bess');
 const rows=['Site address,Property area (sf),Building footprint (sf),Parking spaces,Number of parcels,Zoning,Flood zone'];
 for(let i=0;i<50;i++)rows.push('"'+(100+i)+' Example Street, Example, IL 60601",8062.5,3917,0,1,RM-5,X');
 await page.locator('#file').setInputFiles({name:'fifty-sites.csv',mimeType:'text/csv',buffer:Buffer.from(rows.join('\r\n'))});
 await page.locator('#confirmImport').click();assert.equal(await page.locator('#intakeCount').innerText(),'50 sites ready for review');await page.locator('#enrich').uncheck();await page.locator('#run').click();await waitReport();assert.equal(await page.locator('.result').count(),50);pass('50-site upload maps columns, retains every row and ranks with real engine');
 await page.locator('#search').fill('149 Example');assert.equal(await page.locator('.result').count(),1);await page.locator('#search').fill('');
 for(const width of [320,375,390,430,768,1440]){await page.setViewportSize({width,height:900});await noOverflow();}pass('320, 375, 390, 430, 768 and 1440 px layouts have no page overflow');
 await page.setViewportSize({width:390,height:844});await page.locator('#file').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('Site address\n"unterminated')});await page.getByRole('status').filter({hasText:'unclosed'}).waitFor();assert.equal(await page.locator('.result').count(),50);pass('malformed import reports an error without deleting existing results');
 await page.goto(url+'/screening.html?tool=bess');await page.locator('#addresses').fill('123 Unknown Lane, Example, IL 60601');await page.locator('#addAddresses').click();await page.locator('#run').click();await waitReport();assert((await page.locator('.result').innerText()).includes('Verify'));assert(!(await page.locator('.result').innerText()).includes('Priority Go'));pass('an address with no source coverage remains Verify');
 await page.goto(url+'/screening.html?tool=parcel');
 const kml='<?xml version="1.0"?><kml><Document><Placemark><name>Parcel boundary</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-88,42 -87.99,42 -87.99,42.01 -88,42.01 -88,42</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark><Placemark><name>138 kV transmission</name><LineString><coordinates>-88,42 -88,42.01</coordinates></LineString></Placemark></Document></kml>';
 await page.locator('#file').setInputFiles([{name:'parcel-a.kml',mimeType:'application/xml',buffer:Buffer.from(kml)},{name:'parcel-b.kml',mimeType:'application/xml',buffer:Buffer.from(kml)}]);await page.getByText('2 sites ready for review').waitFor();await page.locator('#enrich').uncheck();await page.locator('#run').click();await waitReport();assert.equal(await page.locator('.result').count(),2);assert((await page.locator('.result').first().innerText()).includes('138 kV'));pass('parcel tool screens multiple KML files through the editor engine');
 await page.goto(url+'/screening.html?tool=parcel');
 let networkCalls=0,networkFailed=false;
 await page.route('**/api/portfolio-enrich',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({fields:{latitude:40.67519,longitude:-89.61120,propertyAreaSf:43560*400},features:[],notes:[],gridEvidence:{lines:[{voltageKv:345,distanceKm:.1,circuits:2}],substations:[{voltageKv:345,distanceKm:.1}]}})}));
 await page.route('**/api/network-proximity',route=>{networkCalls++;const b=route.request().postDataJSON();assert.equal(b.lat,40.67519);return route.fulfill({status:networkFailed?502:200,contentType:'application/json',body:JSON.stringify(networkFailed?{error:'Fixture outage'}:{fiber:{verdict:'likely',reasons:['Fiber provider fixture']},capacity:{class:'regional',routeDiversity:'diverse'},datacenter:{verdict:'strong',score:80},build:'test-network-engine'})});});
 await page.locator('#addresses').fill('107 Cass Street, Peoria, IL 61602');await page.locator('#addAddresses').click();await page.locator('#run').click();await waitReport();
 assert.equal(networkCalls,1);assert((await page.locator('.compute-context').innerText()).includes('strong'));assert((await page.locator('.compute-context').innerText()).includes('diverse'));await noOverflow();
 const dl=page.waitForEvent('download');await page.locator('#export').click();const download=await dl,file=path.join(output,'compute-results.csv');await download.saveAs(file);const csv=fs.readFileSync(file,'utf8');assert(csv.includes('DC connectivity score'));assert(csv.includes('strong'));assert(csv.includes('Planning MW (not approved)'));
 await page.screenshot({path:path.join(output,'compute-mobile.png'),fullPage:true});
 networkFailed=true;await page.locator('#run').click();await waitReport();assert.equal(networkCalls,2);assert(!(await page.locator('.compute-context').innerText()).includes('strong'));assert((await page.locator('.badge').innerText()).includes('Verify'));
 pass('compute calls the existing network engine, renders/exports separate connectivity and clears stale results on provider failure');
 assert.deepEqual(errors,[]);pass('no uncaught browser errors');console.log('\n'+checks+' browser checks passed.');
}
main().catch(async e=>{console.error(e);if(page){console.log(await page.evaluate(()=>({workspace:document.querySelector('#workspace').textContent,authNotice:document.querySelector('#authNotice').hidden,firebase:typeof firebase,apps:window.firebase&&firebase.apps.length,status:document.querySelector('#status').textContent})));await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});}console.log(errors);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
