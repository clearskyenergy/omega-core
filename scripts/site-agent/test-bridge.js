/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert'),vm=require('vm'),crypto=require('crypto'),command=require('./browser-bridge');
const planner=require('../../api/_lib/site-agent-planner'),site=require('./example-site.json'),plan=planner.plan(site);
function harness(){
 const S={elements:[],shapes:[],conduits:[],_trenches:[],history:[],pxPerFt:2};let count=0,fail=false;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const c={S,crypto:crypto.webcrypto,TextEncoder,Uint8Array,console,Number,Math,_projectId:'test',_activeDocTab:0,
  firebase:{auth:()=>({currentUser:{uid:'test'}})},_g3map:()=>({getTilt:()=>0,getHeading:()=>0}),
  _serializeCanvas:()=>clone({elements:S.elements,shapes:S.shapes,conduits:S.conduits,trenches:S._trenches,pxPerFt:S.pxPerFt}),
  _restoreCanvas:s=>{S.elements=s.elements;S.shapes=s.shapes;S.conduits=s.conduits;S._trenches=s.trenches;},
  _liveMapState:()=>({lat:40,lng:-88}),_getCanvasSize:()=>({w:1000,h:1000}),
  _latLngToPx:(lat,lng)=>({x:(lng+88)*6378137*Math.cos(40*Math.PI/180)*Math.PI/180/.3048*2,y:-(lat-40)*6378137*Math.PI/180/.3048*2}),
  _evAdd:(kind,x,y,label)=>{const e={id:'e'+(++count),type:'evgear',evKind:kind,x,y,label};S.elements.push(e);return e;},
  renderEl:()=>{},renderShape:()=>{},renderConduit:()=>{if(fail)throw Error('renderer failed');},_geoStampAll:()=>{},_dcfcRenderTrenches:()=>{},
  uid:()=> 'u'+(++count),pushHist:()=>S.history.push({}),_setSaved:()=>{}};
 c.window=c;
 return {S,c,fail:()=>{fail=true;},command:vm.runInNewContext('('+command.toString()+')',c)};
}
(async()=>{
 const h=harness(),context=await h.command({op:'context'});
 const result=await h.command({op:'apply',revision:context.revision,plan,id:'run-1'});
 assert.equal(result.status,'applied_unsaved');assert.equal(h.S.elements.length,2);assert.equal(h.S.shapes.length,2);
 assert.equal(h.S.conduits[0].fromId,h.S.elements[0].id);assert.equal(h.S.conduits[0].toId,h.S.elements[1].id);
 assert.equal(h.S._trenches[0].in,site.surface);assert.equal(h.S.elements[1].mounting,site.switchgear.mounting);
 assert.equal(h.S.elements[0]._geoWFt,plan.layout.battery.rect.w);assert.equal(h.c._workDirty,true);
 await assert.rejects(()=>h.command({op:'apply',revision:context.revision,plan,id:'duplicate'}),/Canvas changed/);
 assert.equal(h.S.elements.length,2);
 const f=harness(),before=await f.command({op:'context'});f.fail();
 await assert.rejects(()=>f.command({op:'apply',revision:before.revision,plan,id:'failed'}),/rolled back/);
 assert.equal(f.S.elements.length,0);assert.equal(f.S.shapes.length,0);assert.equal(f.S._trenches.length,0);assert.equal(f.S.conduits.length,0);
 console.log('PASS: browser bridge placement schema, dimensions, conduit bonds, dirty state, stale plan rejection and failure rollback (editor doubles).');
})().catch(e=>{console.error(e);process.exitCode=1;});
