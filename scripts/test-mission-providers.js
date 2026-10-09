/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Browser -> real Jarvis HTTP fixture -> persisted settings -> routed fake
   inference. Run the fixture in jarvis/tests/provider_http_fixture.py first.
   No paid model calls, mail, trades, or production data. */
'use strict';
const fs=require('fs'), path=require('path'), http=require('http'), assert=require('assert');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||'',process.cwd()]}));
const root=path.join(__dirname,'..');
const server=http.createServer((req,res)=>{
  const p=path.resolve(root,'.'+new URL(req.url,'http://x').pathname);
  if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);return res.end();}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
  res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);
});
const APP='export function initializeApp(c){return {name:"[DEFAULT]",options:c};} export function getApps(){return [];} export function getApp(){return {name:"[DEFAULT]"};}';
const AUTH='const user={uid:"tom",email:"tom@clearsky-usa.com",emailVerified:true,displayName:"Tom",getIdToken:async()=>"fixture"};const auth={currentUser:user};export function getAuth(){return auth;}export function onAuthStateChanged(a,cb){setTimeout(()=>cb(user),0);return ()=>{};}export function signInWithPopup(){return Promise.resolve({user});}export function signOut(){return Promise.resolve();}export class GoogleAuthProvider{}';
const TWIN={counts:{},spend:{},schedule:[],todos:[],draftList:[],people:[],routines:[],features:[],runs:[],feed:[]};
(async()=>{
 await new Promise(r=>server.listen(8088,'127.0.0.1',r));
 let fixtureReady=false;
 for(let n=0;n<50&&!fixtureReady;n++){
  try{fixtureReady=(await (await fetch('http://127.0.0.1:8795/providers')).json()).ok;}catch(_){}
  if(!fixtureReady)await new Promise(r=>setTimeout(r,100));
 }
 assert(fixtureReady,'start the local Jarvis HTTP fixture before this test');
 const pack=process.env.CHROMIUM_PACKAGE?require(process.env.CHROMIUM_PACKAGE):null;
 const packaged=pack&&(pack.default||pack);
 const browser=await chromium.launch(packaged?{headless:true,executablePath:await packaged.executablePath(),args:packaged.args.filter(a=>!['--single-process','--disable-web-security'].includes(a))}:{headless:true});
 try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let bridge='ready';
  await page.route('**/*',async route=>{
   const u=route.request().url();
   if(u.startsWith('http://127.0.0.1:8795')){
    if(u.endsWith('/providers') && bridge==='old')return route.fulfill({status:404,contentType:'application/json',body:'{"ok":false}'});
    if(bridge==='offline')return route.abort();
    if(!/^\/(providers|ask|health)$/.test(new URL(u).pathname))return route.fulfill({contentType:'application/json',body:'{}'});
    // A localhost test fixture is used, no calls to the user's Mac.
    return route.continue();
   }
   if(u.startsWith('http://127.0.0.1:8088')){
    if(u.includes('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    return route.continue();
   }
   if(/firebase-app\.js/.test(u))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/javascript',body:APP});
   if(/firebase-auth\.js/.test(u))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/javascript',body:AUTH});
   if(/cloudfunctions\.net\/twinChat/.test(u))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(TWIN)});
   return route.abort();
  });
  await page.goto('http://127.0.0.1:8088/mission.html?view=system');
  await page.waitForFunction(()=>!document.getElementById('aiProviderMode').disabled).catch(async e=>{
   console.error({errors,status:await page.locator('#aiProviderStatus').textContent()});throw e;
  });
  for(const mode of ['chatgpt','claude','auto']){
   await page.selectOption('#aiProviderMode',mode);await page.click('#aiProviderSave');
   await page.waitForFunction(()=>/^Saved:/.test(document.getElementById('aiProviderStatus').textContent));
   const saved=await (await fetch('http://127.0.0.1:8795/providers')).json();assert.equal(saved.settings.mode,mode);
  }
  await page.reload();await page.waitForFunction(()=>!document.getElementById('aiProviderMode').disabled);
  assert.equal(await page.inputValue('#aiProviderMode'),'auto');
  const result=await page.evaluate(async()=>{const r=await fetch('http://127.0.0.1:8795/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'simulate limit'})});return r.json();});
  assert.equal(result.provider,'chatgpt');assert.equal(result.fallback,true);
  await page.click('#aiProviderRefresh');await page.waitForFunction(()=>document.getElementById('aiProviderActive').textContent==='CHATGPT');
  const box=await page.locator('[data-widget="ai-provider"]').boundingBox();assert(box.width>100);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
  if(process.env.PROVIDER_SHOTS){fs.mkdirSync(process.env.PROVIDER_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.PROVIDER_SHOTS,'providers-'+viewport.width+'.png'),fullPage:true});}
  bridge='old';await page.click('#aiProviderRefresh');await page.waitForFunction(()=>/Update and restart/.test(document.getElementById('aiProviderStatus').textContent));assert(await page.isDisabled('#aiProviderSave'));
  bridge='offline';await page.click('#aiProviderRefresh');await page.waitForFunction(()=>/Cannot reach/.test(document.getElementById('aiProviderStatus').textContent));assert(await page.isDisabled('#aiProviderSave'));
  assert.deepEqual(errors,[]);console.log('PASS provider settings '+viewport.width+'px: save, reload, fallback, old/offline bridge, no overflow or JS errors');
  await page.close();
 }
 const invalid=await fetch('http://127.0.0.1:8795/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'wrong'})});assert.equal(invalid.status,400);
 const foreign=await fetch('http://127.0.0.1:8795/providers',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{"mode":"chatgpt"}'});assert.equal(foreign.status,403);
 console.log('PASS invalid values and foreign-origin writes refused');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
