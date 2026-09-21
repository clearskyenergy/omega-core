/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname,'../..'), responseFixture = require('./pricing-response');
const html = fs.readFileSync(path.join(ROOT,'clearsky-cost-estimator.html'),'utf8');
const body = html.match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n');
const elements = {}, listeners = {}, timers = new Map(), requests = [], messages = [];
let timerId = 0, pending = false, deny = false;
const vendor = {key:'catl',name:'CATL',dcPerKwh:113,basis:'quote',ref:'fixture-Q',
  date:new Date().toISOString().slice(0,10),expires:'2099-01-01',incoterm:'EXW fixture'};
const packet = {schemaVersion:'clearsky.site-packet/1',site:{id:'site:fixture',address:'Fixture site'},
  sizing:{batteryKw:1000,assumedHours:4},gaps:[]};
const storage = {'packet-fixture':JSON.stringify(packet)};
function el(){return {style:{},innerHTML:'',textContent:'',value:'',disabled:false,children:[],
  classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},getAttribute(){return null;},
  querySelectorAll(){return [];},querySelector(){return null;},appendChild(){},removeChild(){},click(){}};}
const user={uid:'fixture-user',email:'rep@tenant.example',getIdToken:()=>Promise.resolve('fixture-token')};
const auth={currentUser:user,onAuthStateChanged(fn){Promise.resolve().then(()=>fn(user));}};
const ctx={console,module:{exports:{}},URLSearchParams,Date,Promise,Blob,URL,
  document:{readyState:'complete',body:el(),getElementById(id){return elements[id] || (elements[id]=el());},
    createElement:el,addEventListener(name,fn){listeners[name]=fn;},querySelectorAll(){return [];},querySelector(){return null;}},
  navigator:{userAgent:'test'},location:{search:'?packet=packet-fixture',origin:'https://tenant.example'},
  localStorage:{getItem:k=>storage[k] || null,removeItem:k=>delete storage[k],setItem:(k,v)=>storage[k]=v},
  sessionStorage:{getItem:()=>null,removeItem(){}},
  firebase:{apps:[{}],auth:()=>auth,firestore:()=>({})},
  OMEGATools:{orgFromUrl:()=> 'tenant.example',
    loadToolData:()=>Promise.resolve({data:{sel:'catl',vendors:{catl:vendor},installers:{}}}),
    saveToolData:()=>Promise.resolve()},
  setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),
  opener:{closed:false,postMessage(message,origin){messages.push({message,origin});}},
  print(){},alert(message){throw new Error(message);},confirm:()=>true,
  fetch(url,opts){
    assert.strictEqual(url,'/api/price-site');
    assert.strictEqual(opts.headers.Authorization,'Bearer fixture-token');
    const input=JSON.parse(opts.body), request={input}; requests.push(request);
    const result = () => ({ok:!deny,json:()=>Promise.resolve(deny?{error:'Billing unavailable'}:responseFixture(input,vendor))});
    if(pending) return new Promise(resolve=>request.resolve=()=>resolve(result()));
    return Promise.resolve(result());
  }
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'omega-cost-model.js'),'utf8'),ctx);
vm.runInContext(body,ctx);
const EST=ctx.module.exports;
async function settle(){for(let i=0;i<20;i++) await Promise.resolve();}
async function price(){await settle();const jobs=[...timers];timers.clear();jobs.forEach(([,v])=>v.fn());await settle();}
(async function(){
  await price();
  assert.strictEqual(storage['packet-fixture'],undefined,'packet consumed on boot');
  assert.strictEqual(EST.S.kw,1000);
  assert.strictEqual(elements.body.style.display,'');
  assert(elements.body.innerHTML.includes('Project schedule'),'schedule rendered');
  assert(elements.body.innerHTML.includes('Where every number came from'),'source panel rendered');
  assert(!/NaN|undefined/.test(elements.body.innerHTML),'all price rendering fields present');
  assert.strictEqual(elements.bJson.disabled,false);
  const json=JSON.parse(EST.toJson());
  assert(json.cost.totalUsd.base>0 && json.schedule.tasks.length>0,'cost and schedule exported');
  assert.strictEqual(json.sourcePacket.siteId,'site:fixture');
  assert(EST.toCsv().includes('fixture-Q'),'CSV carries quote provenance');
  assert(messages.length && messages[messages.length-1].message.pricedBy==='api/price-site','handoff reports server result');
  assert.strictEqual(messages[messages.length-1].origin,'https://tenant.example');
  const before=requests.length;
  EST.renderOut(); await price();
  assert.strictEqual(requests.length,before,'presentation rerender uses same server response');
  pending=true;
  EST.S.kw=1500;EST.renderOut();await price();const older=requests[requests.length-1];
  assert.strictEqual(elements.bJson.disabled,true,'pending price disables exports');
  EST.S.kw=2000;EST.renderOut();await price();const newer=requests[requests.length-1];
  newer.resolve();await settle();
  assert.strictEqual(JSON.parse(EST.toJson()).inputs.batteryKw,2000);
  older.resolve();await settle();
  assert.strictEqual(JSON.parse(EST.toJson()).inputs.batteryKw,2000,'late price cannot overwrite current inputs');
  pending=false;deny=true;EST.S.kw=2500;EST.renderOut();await price();
  assert.strictEqual(elements.body.style.display,'none','failure hides stale totals');
  assert.strictEqual(elements.bJson.disabled,true,'failure leaves exports disabled');
  assert(elements.blank.innerHTML.includes('Billing unavailable'),'server denial is visible');
  assert.strictEqual(typeof elements.retryPrice.onclick,'function');
  deny=false;elements.retryPrice.onclick();await price();
  assert.strictEqual(elements.bJson.disabled,false,'retry recovers');
  EST.VENDORS.catl.dcPerKwh=99;EST.renderOut();await price();
  assert.strictEqual(elements.clsChip.textContent,'SAVE PRICING');
  assert.strictEqual(elements.bJson.disabled,true,'unsaved supplier edit cannot reuse saved-price estimate');
  elements.btnVendSave.onclick();await price();
  assert.strictEqual(elements.bJson.disabled,false,'save reprices');
  console.log('Estimator full boot, populated supplier metadata, handoff, rendering, exports, stale-response rejection, failure/retry and save gate passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
