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
 /* the read-only takeoff and build sequence: the editor's own answers, no drawing ids out of the page */
 const t=harness();
 t.c.OmegaTakeoff={refresh:async force=>{t.c.__force=force;return {total:1234.5,contracted:false,sources:[{kind:'book',cents:123450,amount:1234.5,pct:100}],notes:[],
   trades:[{key:'concrete',label:'Concrete',div:'03',cents:123450,amount:1234.5,pct:100,qty:{qty:2,unit:'EA',text:'2 EA pads'},
     lines:[{key:'site.pad',label:'Equipment pads',qty:{qty:2,unit:'EA',text:'2 EA'},cents:123450,amount:1234.5,contingency:true,parts:['pad'],source:{kind:'book',basis:'The cost sheet\u2019s unit price'},
       rows:[{label:'Pad A',qty:{text:'1 EA'},cents:61725,amount:617.25,parts:['pad'],source:{kind:'book',basis:'x'}}]}],
     info:[{key:'trench',label:'Trench',qty:{text:'40 LF'},note:'Not priced in the Run.',parts:['trench']}]}]};},_state:()=>({err:''})};
 const tk=await t.command({op:'takeoff'});
 assert.equal(t.c.__force,true,'it asks for a fresh takeoff of the drawing as it stands');
 assert.equal(tk.total,1234.5);assert.equal(tk.trades[0].trade,'Concrete');assert.equal(tk.trades[0].lines[0].quantity,'2 EA');
 assert.equal(tk.trades[0].lines[0].source.kind,'book');assert.equal(tk.trades[0].lines[0].rows[0].amount,617.25);assert.equal(tk.trades[0].alsoOnTheDrawing[0].quantity,'40 LF');
 assert.equal(tk.sources[0].kind,'book');assert(!/parts|"pad"/.test(JSON.stringify(tk)),'no drawing ids leave the page');
 t.c.OmegaTakeoff.refresh=async()=>null;t.c.OmegaTakeoff._state=()=>({err:'This module is not in your package \u2014 the takeoff by trade is part of Omega Estimate, with the Cost tab.'});
 await assert.rejects(()=>t.command({op:'takeoff'}),/Omega Estimate/);
 delete t.c.OmegaTakeoff;await assert.rejects(()=>t.command({op:'takeoff'}),/unavailable/);
 t.c.OmegaBuildSequence={fetch:async()=>({total:500,cents:50000,schedule:{workingDays:12,open:['design','utility'],plus:'plus the utility\u2019s interconnection time, which is not on file'},notes:[],
   phases:[{key:'survey',label:'Survey & site prep',days:2,start:0,finish:2,crews:1,cents:0,amount:0,inPlace:0,lines:[],basis:['Mobilise, survey and stake out: 2 crew-days'],notes:[],reveal:['road']},
     {key:'energize',label:'Energize',days:0,start:12,finish:12,cents:50000,amount:500,inPlace:500,lines:[{key:'x',label:'Equipment pads',cents:50000,amount:500}],basis:[],notes:[],reveal:[]}]})};
 const bs=await t.command({op:'build-sequence'});
 assert.equal(bs.steps.length,2);assert.equal(bs.steps[0].workingDays,2);assert.equal(bs.steps[1].inPlace,500);assert.equal(bs.total,500);
 assert(/not on file/.test(bs.schedule.plus)&&!/reveal/.test(JSON.stringify(bs)),'the schedule says what is not on file; the model\u2019s archetypes stay in the page');
 assert.equal(t.S.elements.length+t.S.shapes.length+t.S.conduits.length,0,'reading writes nothing');
 /* Read Plans through its own dialog: what a read returns is the review's words and figures, never the sheet images or boxes */
 const p=harness();let opened=0,restarted=0,reads=0,reviews=0;
 const R={summary:{sheets:2,items:3,placeable:2,selected:1,facts:1,warnings:1},sheets:[{page:1,number:'E-001'},{page:2,number:'E-101'}],
  items:[{kindLabel:'Battery storage',tag:'ESS-1',description:'Battery energy storage',model:'XS-1290',kw:300,kwh:1290,quantity:1,pages:[2],confidence:'high',reads:[{quote:'ESS-1 300 kW / 1,290 kWh',box:{x:.1,y:.1,w:.1,h:.1}}],place:{via:'eq',id:'bess'},selected:true,conflicts:[]},
   {kindLabel:'Junction box',quantity:1,pages:[2],confidence:'low',reads:[{quote:'JB',box:{x:0,y:0,w:.1,h:.1}}],place:{via:'eq',id:'jbox'},selected:false,conflicts:[]},
   {kindLabel:'Solar array',tag:'PV',kw:315,quantity:1,pages:[1],confidence:'high',reads:[{quote:'PV ARRAY 315 kW-DC'}],place:null,selected:false,conflicts:[],note:'Draw the array (Draw \u203a Solar) to price it.'}],
  facts:[{label:'Battery energy',unit:'kWh',number:1200,quote:'1,200 kWh',page:1,confidence:'high',agree:false,values:[{number:1200,pages:[1]},{number:1290,pages:[2]}]}],
  issues:[{level:'warn',text:'Battery energy differs between sheets: 1,200 kWh on E-001; 1,290 kWh on E-101.'}]};
 const pst={fileName:'set.pdf',cut:0,today:{used:2,of:80},result:R,pages:[{page:1,status:'done',selected:true,cached:true,image:'data:image/jpeg;base64,AAAA',thumb:{},result:{sheet:{number:'E-001',title:'Cover'},items:[],facts:[{}]}},
  {page:2,status:'done',selected:true,image:'data:image/jpeg;base64,BBBB',result:{sheet:{number:'E-101',title:'Electrical site plan'},items:[{},{},{}],facts:[]}}]};
 p.c.document={getElementById:id=>id==='pr-file'?{}:id==='rb-plan-read'?{id}:null,querySelector:()=>null};
 p.c.OmegaPlanRead={_state:()=>pst,open:()=>opened++,restart:()=>restarted++,read:()=>reads++,review:()=>reviews++,
  place:()=>{const n=R.items.filter(i=>i.selected&&i.place).length;pst.placedId='prX';p.S.planRead={id:'prX',configured:1,items:[{tag:'ESS-1',kind:'bess',placed:1,quantity:1},{tag:null,kind:'junction_box',placed:0,quantity:1}]};return n;},
  changes:async()=>({read:{fileName:'set.pdf',readAt:'2026-10-16T10:00:00Z',sheets:['E-001','E-101']},differ:1,summary:{changed:1},notes:[],basis:'Not an engineering judgement.',
   rows:[{section:'placed',sectionLabel:'Placed from the plans',label:'ESS-1',sheet:'E-101',plans:'1 \u00d7 XS-1290 \u00b7 300 kW / 1,290 kWh',drawing:'1 \u00d7 XS-1290 \u00b7 300 kW / 1,500 kWh',status:'changed',statusLabel:'Changed',note:'The kWh on 1 unit differs from the plans.'}]})};
 assert.deepEqual(await p.command({op:'plans-open'}),{status:'open'});assert.equal(opened+restarted,2,'the dialog is opened fresh');
 p.c.OmegaCaps={allowedElement:()=>false};await assert.rejects(()=>p.command({op:'plans-open'}),/Omega Design/);delete p.c.OmegaCaps;
 pst.pages[1].status='reading';await assert.rejects(()=>p.command({op:'plans-open'}),/still being read/);pst.pages[1].status='done';
 assert.deepEqual(await p.command({op:'plans-read'}),{status:'reading',sheets:0});assert.equal(reads,1);
 const rv=await p.command({op:'plans-state'});
 assert.equal(rv.file,'set.pdf');assert.deepEqual(rv.sheets.map(s=>[s.number,s.status,s.items]),[['E-001','done',0],['E-101','done',3]]);
 assert.deepEqual(rv.review.items[0],{index:0,tag:'ESS-1',kind:'Battery storage',description:'Battery energy storage',manufacturer:null,model:'XS-1290',rating:{kw:300,kwh:1290},quantity:1,sheets:['E-101'],confidence:'high',words:'ESS-1 300 kW / 1,290 kWh',placeable:true,ticked:true,readDifferently:null,note:null});
 assert.deepEqual([rv.review.items[1].ticked,rv.review.items[2].placeable],[false,false],'the low-confidence box starts unticked; solar is listed, not placed');
 assert.deepEqual(rv.review.facts[0].alsoReadAs,[{value:1290,sheets:['E-101']}],'a figure the sheets disagree on carries every sheet\u2019s value');
 assert(/differs between sheets/.test(rv.review.toCheck[0].text)&&!/data:image|"box"|thumb/.test(JSON.stringify(rv)),'what to check is named; the sheet images and boxes stay in the page');
 await assert.rejects(()=>p.command({op:'plans-place',items:[2]}),/Not items that can be placed: 2/);
 await assert.rejects(()=>p.command({op:'plans-place',items:[9]}),/Not items that can be placed: 9/);
 await assert.rejects(()=>p.command({op:'plans-place',items:[]}),/Nothing is ticked/);
 const pl=await p.command({op:'plans-place',items:[0,1]});
 assert.deepEqual([pl.status,pl.placed,R.items.map(i=>i.selected)],['placed_unsaved',2,[true,true,false]],'exactly the items the person approved are ticked and placed');
 assert.deepEqual(pl.items,[{tag:'ESS-1',kind:'bess',placed:1,ofPrinted:1}]);
 await assert.rejects(()=>p.command({op:'plans-place'}),/already on the drawing/,'a read is placed once');
 const ch=await p.command({op:'plans-changed'});
 assert.deepEqual(ch.rows[0],{section:'Placed from the plans',item:'ESS-1',sheet:'E-101',plans:'1 \u00d7 XS-1290 \u00b7 300 kW / 1,290 kWh',drawing:'1 \u00d7 XS-1290 \u00b7 300 kW / 1,500 kWh',status:'Changed',note:'The kWh on 1 unit differs from the plans.'});
 assert(ch.differ===1&&/not an engineering judgement/i.test(ch.basis),'what changed is the server\u2019s comparison, with its basis');
 delete p.c.OmegaPlanRead;await assert.rejects(()=>p.command({op:'plans-state'}),/Read Plans is unavailable/);
 console.log('PASS: browser bridge placement schema, dimensions, conduit bonds, dirty state, stale plan rejection and failure rollback; the read-only takeoff and build sequence; Read Plans read, place and what changed (editor doubles).');
})().catch(e=>{console.error(e);process.exitCode=1;});
