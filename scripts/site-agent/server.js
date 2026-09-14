/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const readline=require('readline'),crypto=require('crypto');
const planner=require('../../api/_lib/site-agent-planner');
const bridge=require('./browser-bridge');
const plans=new Map();let browser;
const tools=[
 ['omega_context','Read the signed-in editor map, geometry, parcel evidence and revision.',{}],
 ['omega_view','Capture the current editor canvas for visual review.',{}],
 ['omega_address','Load an address on an empty canvas and verify its geocoded position. Returns parcel coordinates when available.',{address:{type:'string',minLength:5,maxLength:500}}],
 ['omega_bill','Extract facts from utility-bill text using the editor parser. No sizing or hosting capacity is inferred.',{text:{type:'string',maxLength:100000}}],
 ['omega_plan','Generate a constrained concept. Site uses local feet (+x east/+y north). Read example-site.json for schema. All physical constraints and service location require supplied evidence.',{site:{type:'object'}}],
 ['omega_apply','Apply a stored concept to its unchanged canvas using editor equipment, conduit and trench renderers. Remains unsaved.',{planId:{type:'string'}}],
 ['omega_verify','Read back equipment and routes for the applied plan.',{planId:{type:'string'}}],
 ['omega_save','Save a successfully verified, unchanged concept using the editor Save Project tool.',{planId:{type:'string'}}]
].map(([name,description,properties])=>({name,description,inputSchema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}));
async function page(){
 const target=process.env.OMEGA_EDITOR_URL;if(!target)throw Error('Set OMEGA_EDITOR_URL to the exact trusted editor URL.');
 const u=new URL(target);if(!['/editor.html','/editor'].includes(u.pathname)||!['https:','http:'].includes(u.protocol))throw Error('Editor URL must point to /editor or /editor.html.');
 const endpoint=new URL(process.env.OMEGA_CDP_URL||'http://127.0.0.1:9222');
 if(!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw Error('The browser debugging endpoint must be local.');
 if(!browser){const {chromium}=require('playwright');browser=await chromium.connectOverCDP(endpoint.href,{timeout:10000});}
 const pages=browser.contexts().flatMap(c=>c.pages()).filter(p=>p.url()===u.href);
 if(pages.length!==1)throw Error('Open exactly one browser tab at OMEGA_EDITOR_URL.');
 return pages[0];
}
async function call(name,args){
 const tab=await page(),invoke=(op,data)=>tab.evaluate(bridge,Object.assign({op},data));
 if(name==='omega_context')return invoke('context');
 if(name==='omega_view'){await invoke('context');const canvas=tab.locator('#sc');return {image:(await canvas.screenshot({type:'png',timeout:10000})).toString('base64')};}
 if(name==='omega_bill')return invoke('bill',{text:args.text});
 if(name==='omega_address'){
  if(typeof args.address!=='string'||args.address.length<5||args.address.length>500)throw Error('Provide an address.');
  await invoke('address',{address:args.address});
  await tab.waitForFunction(()=>typeof google!=='undefined'&&google.maps&&google.maps.Geocoder,{},{timeout:60000});
  const g=await invoke('geocode',{address:args.address});if(g.partial)throw Error('Geocoder returned a partial match. Confirm the exact site.');
  await tab.waitForFunction(g=>{var m=window._gmap,c=m&&m.getCenter();return c&&Math.abs(c.lat()-g.lat)<0.0001&&Math.abs(c.lng()-g.lng)<0.0001&&typeof S!=='undefined'&&S.pxPerFt>0;},g,{timeout:60000});
  let parcel=null,parcelError=null;try{parcel=await invoke('parcel',g);}catch(e){parcelError=e.message;}
  let siteContext=null,contextError=null;try{siteContext=await invoke('site-context',g);}catch(e){contextError=e.message;}
  return {geocode:g,parcel,parcelError,siteContext,contextError,context:await invoke('context'),next:'Confirm survey geometry, service wall, equipment and installation clearances. A map/bill alone is insufficient.'};
 }
 if(name==='omega_plan'){
  const context=await invoke('context'),site=args.site;
  if(context.objects.elements.length||context.objects.shapes.length||context.objects.conduits.length||(context.objects.trenches||[]).length)throw Error('This first version requires an empty canvas. Supply reviewed existing objects as site obstacles.');
  const result=planner.plan(site);if(result.status!=='concept_ready')return result;
  if(!['soil','concrete'].includes(site.surface))throw Error('Confirm one route surface: soil or concrete. Mixed surfaces need a segmented design.');
  if(!context.map||Math.abs(context.map.lat-site.origin.lat)>0.0001||Math.abs(context.map.lng-site.origin.lng)>0.0001)throw Error('Plan origin does not match the loaded site map.');
  const id=crypto.randomUUID();while(plans.size>=5)plans.delete(plans.keys().next().value);
  plans.set(id,{result,revision:context.revision,url:tab.url(),created:Date.now()});return {planId:id,...result};
 }
 const p=plans.get(args.planId);if(!p||Date.now()-p.created>30*60000)throw Error('Plan expired or missing. Replan.');
 if(tab.url()!==p.url)throw Error('Editor tab changed.');
 if(name==='omega_apply'){
  if(p.applied)throw Error('This plan has already been applied.');
  p.applied=await invoke('apply',{plan:p.result,revision:p.revision,id:args.planId});return p.applied;
 }
 if(name==='omega_verify'){
  if(!p.applied)throw Error('Apply the plan first.');const c=await invoke('context');
  const elements=c.objects.elements.filter(e=>e.agentRun===args.planId),conduits=c.objects.conduits.filter(e=>e.agentRun===args.planId),trenches=c.objects.trenches.filter(e=>e.agentRun===args.planId);
  const ok=c.revision===p.applied.revision&&elements.length===2&&conduits.length===1&&trenches.length===1&&conduits[0].fromId===p.applied.batteryId&&conduits[0].toId===p.applied.switchgearId&&trenches[0].pts.length>=2;
  if(!ok)throw Error('Read-back differs from the applied plan. Inspect the drawing; saving is blocked.');
  p.verified=c.revision;return {status:'concept_readback_verified',elements,conduits,trenches,unverified:p.result.unverified};
 }
 if(name==='omega_save'){
  if(!p.verified)throw Error('Verify the applied concept first.');return invoke('save',{revision:p.verified});
 }
 throw Error('Unknown tool.');
}
async function respond(message){
 if(message.id===undefined)return null;
 let result;
 if(message.method==='initialize')result={protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'omega',version:'0.1.0'}};
 else if(message.method==='ping')result={};
 else if(message.method==='tools/list')result={tools};
 else if(message.method==='tools/call'){
  const p=message.params||{};
  try{if(!tools.some(t=>t.name===p.name))throw Error('Unknown tool.');const value=await call(p.name,p.arguments||{});result={content:p.name==='omega_view'?[{type:'image',data:value.image,mimeType:'image/png'}]:[{type:'text',text:JSON.stringify(value)}]};}
  catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}
 }else return {jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}};
 return {jsonrpc:'2.0',id:message.id,result};
}
if(require.main===module){
 let chain=Promise.resolve();
 readline.createInterface({input:process.stdin}).on('line',line=>{
  chain=chain.then(async()=>{let request;try{if(line.length>2000000)throw Error();request=JSON.parse(line);}catch(e){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON request'}})+'\n');return;}
   try{const reply=await respond(request);if(reply)process.stdout.write(JSON.stringify(reply)+'\n');}catch(e){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32603,message:'Agent error'}})+'\n');}
  });
 }).on('close',()=>chain.then(()=>process.exit(0)));
}
module.exports={respond,tools};
