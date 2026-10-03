/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..'),engine=require('../api/_lib/site-discovery');
let pw;try{pw=require('playwright');}catch(e){pw=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));}
const server=http.createServer((req,res)=>{
 if(req.url==='/api/site-discovery'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{const b=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(Object.assign(engine.rank(b.sites,b.weights),{orgId:'example.com'})));}catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}});return;}
 const f=path.join(root,req.url.split('?')[0]);if(!f.startsWith(root+'/')||!fs.existsSync(f)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(f));
});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await pw.chromium.launch({headless:true,executablePath:process.env.SCREENING_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fb="window.firebase={apps:[{}],auth:function(){return {currentUser:{getIdToken:function(){return Promise.resolve('fixture');}}};},firestore:function(){return {};}};";
 await page.route('**/*',r=>{const u=r.request().url();if(u.includes('gstatic'))return r.fulfill({contentType:'application/javascript',body:fb});if(/\/(config|omega-brand|omega-tenant|omega-sso|omega-settings|omega-splash)\.js/.test(u))return r.fulfill({contentType:'application/javascript',body:''});return r.continue();});
 await page.goto('http://127.0.0.1:'+server.address().port+'/site-discovery.html');
 await page.locator('#csv').setInputFiles({name:'sites.csv',mimeType:'text/csv',buffer:Buffer.from('name,load_kw,grid_dist_mi,incentive_score,land_score,offtake_score,interconnect_score\n"Chicago, IL",750,0.4,60,80,70,75\n"<img src=x onerror=alert(1)>",750,,60,80,70,75')});
 await page.getByText('Imported 2 sites.',{exact:false}).waitFor();await page.locator('#runBtn').click();await page.locator('#results:not(.hidden)').waitFor();
 assert.equal(await page.locator('#rankTable tbody tr').count(),2);assert((await page.locator('#rankTable tbody').innerText()).includes('73.9'));assert((await page.locator('#rankTable tbody').innerText()).includes('Verify'));assert.equal(await page.locator('#rankTable img').count(),0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.getByLabel('Grid mi',{exact:true}).first().fill('');assert(await page.locator('#results').evaluate(e=>e.classList.contains('hidden')));
 await page.locator('#runBtn').click();await page.locator('#results:not(.hidden)').waitFor();assert.equal(await page.locator('#rankTable .score').allTextContents().then(a=>a.filter(x=>x==='Verify').length),2);
 for(const slider of await page.locator('input[type=range]').all())await slider.fill('0');
 await page.locator('#runBtn').click();await page.getByText('Choose at least one positive scoring weight.').waitFor();assert(await page.locator('#results').evaluate(e=>e.classList.contains('hidden')));
 assert.deepEqual(errors,[]);console.log('PASS Discovery browser: quoted CSV, literal HTML names, API ranking, unknowns, invalidation, zero weights and mobile width.');
}finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
