/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT || 'playwright');
const root=path.join(__dirname,'..'), I=require('../api/_lib/brain-inventory');
const source=fs.readFileSync(path.join(__dirname,'render-mission-sales.js'),'utf8');
const stubCode=source.slice(source.indexOf('var STUB_APP ='),source.indexOf('function fail('));
const stubs=new Function(stubCode+';return {STUB_APP,STUB_AUTH,STUB_FS,TWIN};')();
const fixture=process.env.BRAIN_SNAPSHOT ? JSON.parse(fs.readFileSync(process.env.BRAIN_SNAPSHOT,'utf8')) : I.summarize([{id:'projects',count:288,status:'measured'},{id:'twin_sources',count:768,status:'measured'},{id:'twin_runs',count:15140,status:'measured'}],new Date().toISOString());
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{for(const size of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport:size});let failInventory=false;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());
   if(u.pathname==='/api/brain-inventory')return route.fulfill({status:failInventory?503:200,contentType:'application/json',body:JSON.stringify(failInventory?{error:'unavailable'}:fixture)});
   if(/firebase-app\.js$/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:stubs.STUB_APP});
   if(/firebase-auth\.js$/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:stubs.STUB_AUTH});
   if(/firebase-firestore\.js$/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:stubs.STUB_FS});
   if(u.hostname.endsWith('cloudfunctions.net'))return route.fulfill({contentType:'application/json',body:stubs.TWIN});
   if(u.hostname==='brain.test'){
    const f=path.join(root,u.pathname==='/mission'?'mission.html':u.pathname);
    if(f.startsWith(root+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile())return route.fulfill({contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'application/json',body:fs.readFileSync(f)});
   }
   return route.abort();
  });
  await page.goto('https://brain.test/mission?view=brain');
  await page.waitForFunction(total=>document.querySelector('#brainInventoryStatus').textContent.includes(total),fixture.total.toLocaleString());
  assert.equal(await page.locator('.brainAsset').count(),7);
  assert(await page.locator('#brainInventoryBody').innerText().then(t=>t.includes('$48,000')&&t.includes('not a sale price')));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
  assert(await page.locator('.brainOverview').isVisible());
  const top=await page.locator('.brainOverview').boundingBox();const graph=await page.locator('.brainStage').boundingBox();assert(top.y<graph.y,'summary leads graph');
  await page.screenshot({path:path.join(root,'work','brain-'+size.width+'.png'),fullPage:false});
  failInventory=true;await page.locator('#brainInventoryRefresh').click();
  await page.waitForFunction(()=>document.querySelector('#brainInventoryStatus').textContent.includes('HTTP 503'));
  assert(!(await page.locator('#brainInventoryBody').innerText()).includes(fixture.total.toLocaleString()),'failed refresh must not show old count as current');
  assert.deepEqual(errors,[]);console.log('PASS '+size.width+'px: summary, scenarios, no overflow, independent cloud load, honest failure state.');await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
