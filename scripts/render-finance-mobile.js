#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Finance phone layouts and navigation against local calculation endpoints.
 * No live credentials, customer records, or external services.
 * PLAYWRIGHT and CHROME may select installed browser dependencies.
 * --shots DIR saves screenshots and detailed measurements. */
const fs = require('fs'), path = require('path'), http = require('http');
const assert = require('assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT || 'playwright');
const root = path.join(__dirname, '..');
const shotIndex = process.argv.indexOf('--shots');
const out = shotIndex >= 0 ? process.argv[shotIndex + 1] : null;
if (out) fs.mkdirSync(out, {recursive:true});
const caller = {uid:'finance-qa', email:'qa@finance.example', orgId:'finance.example', staff:false, emailVerified:true, claims:{email_verified:true}};
const records = {
  'omega_orgs/finance.example': {status:'active', name:'Finance QA'},
  'omega_orgs/finance.example/billing/current': {tier:'deluxe'},
  'omega_orgs/finance.example/members/finance-qa': {role:'owner', status:'active'}
};
const vtPath = require.resolve(path.join(root, 'api/_lib/verify-token'));
require.cache[vtPath] = {id:vtPath, filename:vtPath, loaded:true, exports:{
  httpError:(status,message)=>Object.assign(new Error(message),{status}),
  verifyIdToken:()=>Promise.resolve(caller),
  readAsCaller:(token,p)=>Promise.resolve(records[p] || null)
}};
const handlers = Object.fromEntries(['proforma','compute-proforma','vpp-estimate'].map(x=>['/api/'+x,require(path.join(root,'api',x))]));
const server = http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if (handlers[pathname]) {
    let data=''; req.on('data', c=>data+=c); req.on('end',()=>{
      const response={setHeader:(k,v)=>res.setHeader(k,v), status:code=>{res.statusCode=code;return response;}, json:value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}};
      Promise.resolve(handlers[pathname]({method:req.method,headers:req.headers,body:data?JSON.parse(data):null},response)).catch(e=>{res.statusCode=500;res.end(JSON.stringify({error:e.message}));});
    });return;
  }
  if (['/omega-brand.js','/omega-tenant.js','/omega-whitelabel.js','/config.js'].includes(pathname)) {res.setHeader('Content-Type','text/javascript');res.end('');return;}
  const p=path.join(root,pathname);
  if (!p.startsWith(root)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));
});
function fixture() {
  localStorage.clear();
  const user={uid:'finance-qa',email:'qa@finance.example',getIdToken:()=>Promise.resolve('local-test-fixture')};
  const auth={currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return ()=>{};},signOut:()=>Promise.resolve()};
  const docs=window.__toolData={};
  function doc(p){return {collection:c=>coll(p+'/'+c),get:()=>Promise.resolve({exists:!!docs[p],data:()=>docs[p]}),set:v=>{docs[p]=JSON.parse(JSON.stringify(v));return Promise.resolve();},delete:()=>{delete docs[p];return Promise.resolve();}};}
  function coll(p){return {doc:id=>doc(p+'/'+id)};}
  function firestore(){return {collection:coll};}firestore.FieldValue={serverTimestamp:()=> 'fixture-timestamp',delete:()=>null};
  window.firebase={apps:[1],initializeApp:()=>{},auth:()=>auth,firestore};
}
async function measure(page,name){
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const r=await page.evaluate(()=>{
    const width=document.documentElement.clientWidth;
    function contained(e){for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(['auto','scroll','hidden'].includes(getComputedStyle(p).overflowX)&&p.clientWidth<=width)return true;}return false;}
    const overflow=[...document.querySelectorAll('body *')].filter(e=>{
      if(['SCRIPT','STYLE'].includes(e.tagName)||e.matches('.sr,.skip'))return false;
      const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.right>width+2||r.left< -2)&&!contained(e);
    }).slice(0,8).map(e=>({id:e.id,tag:e.tagName,cls:typeof e.className==='string'?e.className:'',rect:{x:Math.round(e.getBoundingClientRect().x),w:Math.round(e.getBoundingClientRect().width)}}));
    const smallInputs=[...document.querySelectorAll('input,select,textarea')].filter(e=>!['hidden','checkbox','radio','range','color'].includes(e.type)&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.id||e.name||e.tagName);
    return {width,scrollWidth:document.documentElement.scrollWidth,overflow,smallInputs};
  });
  return {name,...r};
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROME || undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const results=[],errors=[];
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
    await page.addInitScript(fixture);
    page.on('pageerror',e=>errors.push(e.message));
    for(const file of ['proforma.html','compute-proforma.html','vpp-earnings.html']){
      for(const width of [320,390,430,768,1440]){
        await page.setViewportSize({width,height:1000});
        await page.goto(base+'/'+file);
        if(file==='proforma.html')await page.waitForFunction(()=>!document.body.classList.contains('booting')&&!document.body.classList.contains('refused')&&document.querySelectorAll('#steps button').length===7);
        else await page.waitForFunction(id=>document.querySelectorAll('#'+id+' option').length>5,file==='vpp-earnings.html'?'mkt':'i-mkt');
        await page.locator('#omega-splash').waitFor({state:'detached',timeout:6000});
        results.push(await measure(page,file+' initial at '+width));
        if(out&&width===390)await page.screenshot({path:path.join(out,file.replace('.html','-mobile.png'))});
        if(file!=='vpp-earnings.html'){
          for(let i=2;i<=7;i++){
            if(width<=768) await page.locator('nav.mobnav [data-act="next"]').click();
            else await page.locator('#stepper [data-step="'+i+'"],#stepper [data-n="'+i+'"]').click();
            const selected = page.locator('#stepper button[aria-current="step"]');
            assert.equal(await selected.getAttribute(file==='proforma.html'?'data-n':'data-step'),String(i),'Next opens the expected step');
            results.push(await measure(page,file+' step '+i+' at '+width));
          }
        } else {
          await page.fill('#zip','60601');await page.locator('#run').click();
          await page.waitForSelector('#out .kpis');
          results.push(await measure(page,'VPP results at '+width));
          await page.locator('[data-mode="bills"]').click();
          await page.locator('[data-act="fill-12"]').click();
          results.push(await measure(page,'VPP bill entry at '+width));
          await page.locator('[data-mode="interval"]').click();
          results.push(await measure(page,'VPP interval at '+width));
        }
      }
    }
    const issues=results.filter(r=>r.scrollWidth>r.width||r.overflow.length||r.smallInputs.length);
    console.log(JSON.stringify({checks:results.length,errors,issues},null,2));
    assert.deepEqual(errors,[],'No browser runtime errors');
    assert.deepEqual(issues,[],'Phone/tablet/touch layouts fit and inputs remain readable');
  } finally {if(out)fs.writeFileSync(path.join(out,'modern-layout-results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
