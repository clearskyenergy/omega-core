/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Offline contracts + transactional workflow tests. No credentials or network. */
'use strict';
var assert = require('node:assert/strict'), P = require('../api/_lib/logic-policy');
var Plant = require('../api/_lib/plant'), portal = require('../api/_lib/portal'), rollup = require('../api/_lib/logic');
var count = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(function () { count++; console.log('PASS ' + name); }); }
function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function get(o, key) { return key.split('.').reduce(function (v, k) { return v == null ? undefined : v[k]; }, o); }
function patch(o, values) {
  Object.keys(values).forEach(function (key) { var parts = key.split('.'), last = parts.pop(), target = o;
    parts.forEach(function (p) { target = target[p] || (target[p] = {}); });
    var v = values[key]; target[last] = v && v.union ? Array.from(new Set((target[last] || []).concat(v.union))) : clone(v);
  }); return o;
}
class DB {
  constructor() { this.data = new Map(); this.queue = Promise.resolve(); this.seq = 0; }
  collection(path) { return new Query(this, path); }
  doc(path) { return new Ref(this, path); }
  seed(path, value) { this.data.set(path, clone(value)); }
  batch() { var writes = [], db = this; return { set: function (r,v,opt) { writes.push(function(){return r.set(v,opt);}); }, commit: async function(){for(var w of writes)await w();} }; }
  runTransaction(fn) { var db=this; var run=this.queue.then(async function(){var writes=[],writing=false;
    var tx={get:async function(r){assert.equal(writing,false,'Firestore forbids reads after writes');return r.get();},
      create:function(r,v){writing=true;writes.push(function(){assert(!db.data.has(r.path),'create must not overwrite');db.seed(r.path,v);});},
      set:function(r,v,opt){writing=true;writes.push(function(){db.seed(r.path,opt&&opt.merge?Object.assign({},db.data.get(r.path),v):v);});},
      update:function(r,v){writing=true;writes.push(function(){assert(db.data.has(r.path),'update requires document');db.data.set(r.path,patch(clone(db.data.get(r.path)),v));});}};
    var result=await fn(tx);writes.forEach(function(w){w();});return result;
  }); this.queue=run.catch(function(){});return run; }
}
class Ref {
  constructor(db,path){this.db=db;this.path=path;this.id=path.split('/').pop();}
  collection(name){return new Query(this.db,this.path+'/'+name);}
  async get(){var v=this.db.data.get(this.path),ref=this;return {id:this.id,ref:ref,exists:v!==undefined,data:function(){return clone(v);}};}
  async set(v,opt){this.db.seed(this.path,opt&&opt.merge?patch(clone(this.db.data.get(this.path)||{}),v):v);}
  async update(v){assert(this.db.data.has(this.path));this.db.data.set(this.path,patch(clone(this.db.data.get(this.path)),v));}
  async create(v){assert(!this.db.data.has(this.path));this.db.seed(this.path,v);}
}
class Query {
  constructor(db,path,filters,sort,cap,cursor){this.db=db;this.path=path;this.filters=filters||[];this.sort=sort;this.cap=cap||Infinity;this.cursor=cursor;}
  doc(id){return new Ref(this.db,this.path+'/'+(id||'auto'+(++this.db.seq)));}
  where(k,op,v){return new Query(this.db,this.path,this.filters.concat([[k,op,v]]),this.sort,this.cap);}
  orderBy(k,dir){return new Query(this.db,this.path,this.filters,[k,dir],this.cap);}
  limit(n){return new Query(this.db,this.path,this.filters,this.sort,n,this.cursor);}
  select(){return this;}
  startAfter(s){return new Query(this.db,this.path,this.filters,this.sort,this.cap,typeof s==='string'?s:s.id);}
  async get(){var self=this,docs=[];for(var entry of this.db.data.entries()){var path=entry[0],d=entry[1];
    if(path.split('/').length!==this.path.split('/').length+1||!path.startsWith(this.path+'/'))continue;
    if(!this.filters.every(function(f){return f[1]==='=='?get(d,f[0])===f[2]:f[1]==='in'?f[2].indexOf(get(d,f[0]))>=0:get(d,f[0])<=f[2];}))continue;
    docs.push(await new Ref(this.db,path).get());}
    if(this.sort)docs.sort(function(a,b){var av=self.sort[0]==='__name__'?a.id:get(a.data(),self.sort[0]),bv=self.sort[0]==='__name__'?b.id:get(b.data(),self.sort[0]);return (av<bv?-1:av>bv?1:0)*(self.sort[1]==='desc'?-1:1);});
    if(this.cursor)docs=docs.filter(function(d){return d.id>self.cursor;});
    docs=docs.slice(0,this.cap);return {docs:docs,size:docs.length,empty:!docs.length,forEach:function(f){docs.forEach(f);}};
  }
}
var db, payments={}, invoices={}, crash=false, invoiceWrites=0;
var A={db:function(){return db;},safeOrg:function(v){return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v||'')?v:'';},
  httpError:function(status,msg){var e=new Error(msg);e.status=status;return e;},
  authenticate:async function(req){return req.caller;}, handler:function(fn){return fn;},
  canActInOrg:async function(c,org){return c.orgId===org||c.staff;},
  isTenantAdmin:async function(c,org){return c.staff||(c.orgId===org&&c.uid==='plant');},
  FieldValue:function(){return {serverTimestamp:function(){return Date.now();},arrayUnion:function(){return {union:Array.from(arguments)};}};}};
var sales={invoice:async function(o,stage){var p=o.logic.invoices[stage];if(!invoices[p.requestId]){invoices[p.requestId]='inv_'+Object.keys(invoices).length;invoiceWrites++;}if(crash){crash=false;throw new Error('timeout after provider committed');}return {id:invoices[p.requestId],customerRef:'buyer'};},
  reconcile:async function(o,stage){var p=o.logic.invoices[stage],amount=payments[stage]===true?p.amountCents:(payments[stage]||0);return {paidCents:amount,satisfied:amount>=p.amountCents,paymentIds:amount?['payment_'+stage]:[],payUrl:'https://connect.intuit.com/portal/test',balanceCents:p.amountCents-amount};}};
function mock(path,exports){require.cache[require.resolve(path)]={id:require.resolve(path),filename:require.resolve(path),loaded:true,exports:exports};}
mock('../api/_lib/admin',A);mock('../api/_lib/qbo-sales',sales);mock('../api/_lib/qbo',{load:async function(){return {realmId:'123'};}});
var W=require('../api/_lib/logic-workflow'),X=require('../api/_lib/logic-access'),office=require('../api/logic-office'),factory=require('../api/logic-plant');
var owner={email:'tom@clearsky-usa.com',uid:'tom',orgId:'clearsky-usa.com',staff:true,claims:{email_verified:true}};
var admin={email:'factory@cleancell.us',uid:'plant',orgId:'cleancell.us',staff:false,claims:{email_verified:true}};
function setup(){db=new DB();payments={};invoices={};invoiceWrites=0;crash=false;
  db.seed('omega_orgs/cleancell.us',{name:'Clean Cell',status:'active',vertical:'oem'});
  db.seed('omega_orgs/cleancell.us/billing/current',{addons:['omega-logic']});
  db.seed('omega_orgs/cleancell.us/fulfillment/config',{enabled:true,realmId:'123',itemRef:'5',accountingApproved:true,terms:{depositPct:30,dueDays:0},fee:{percent:0.25,fixed:0}});
  db.seed('omega_orgs/cleancell.us/members/plant',{role:'admin',status:'active'});
  newOrder('one');}
function newOrder(id){db.seed('orders/'+id,{orgId:'cleancell.us',orderNo:'CC-'+id,status:'new',items:[{sku:'CAB',qty:1}],customer:{name:'Buyer',email:'buyer@example.com'},createdAt:1});}
function unit(serial,extra){return Object.assign({orgId:'cleancell.us',woId:'stock_1',serial:serial,sku:'CAB',unitType:'cabinet',parentSerial:null,shipUnit:true,rootSerial:serial,orderId:null,inventoryStatus:'available',at:'ready',test:{result:'pass'},hold:null,ncr:null,trace:{lot:'L001'},createdAt:1},extra);}
function post(api,b,c){return api({method:'POST',body:Object.assign({org:'cleancell.us'},b),caller:c||owner},{setHeader:function(){}});}
async function main(){
await check('tenant colors persist through the existing branding boundary and drive shared theme tokens',async function(){
  setup();var branding=require('../api/tenant-branding'),brand=require('../api/_lib/logic-brand');
  await db.doc('omega_orgs/cleancell.us').update({domains:['design.cleancell.us'],logoUrl:'/tenants/cleancell/logo.png',whiteLabel:{platformName:'CleanCell Studio'}});
  var colors={primary:'#234567',accent:'#AABBCC',ink:'#102030'};
  var stranger={email:'buyer@elsewhere.com',uid:'buyer',orgId:'elsewhere.com',staff:false,claims:{email_verified:true}};
  await assert.rejects(post(branding,{orgId:'cleancell.us',colors:colors},stranger),/tenant admin/);
  await post(branding,{orgId:'cleancell.us',colors:colors},owner);
  var org=(await db.doc('omega_orgs/cleancell.us').get()).data();assert.deepEqual(org.colors,colors);assert.equal(org.logoUrl,'/tenants/cleancell/logo.png');assert.equal(org.whiteLabel.platformName,'CleanCell Studio');
  assert.deepEqual((await db.doc('tenant_public/design.cleancell.us').get()).data().colors,colors);
  assert.deepEqual(brand(org),{name:'CleanCell Studio',logoUrl:'/tenants/cleancell/logo.png',primary:colors.primary,accent:colors.accent,ink:colors.ink});
  assert.equal(brand({colors:{primary:'red;display:none'}}).primary,'#3FAFC6');
  var styles={},sandbox={window:{},document:{documentElement:{style:{setProperty:function(k,v){styles[k]=v;}}},body:{classList:{add:function(){}}},querySelectorAll:function(){return [];}}};
  require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'../omega-logic-theme.js'),'utf8'),sandbox);
  sandbox.window.OmegaLogicTheme.apply(brand(org));assert.equal(styles['--brand'],colors.primary);assert.equal(styles['--accent'],colors.accent);assert.equal(styles['--ink'],colors.ink);assert.equal(styles['--brand-soft'],'rgba(35,69,103,0.13)');
  assert.deepEqual((await db.doc('omega_orgs/cleancell.us/billing/current').get()).data(),{addons:['omega-logic']});
});
await check('URL Generator omits staff links and Grid Atlas enforces entitlement before calling its engine',async function(){
  setup();var urls=require('../api/logic-urls'),res={setHeader:function(){}},out=await urls({method:'GET',query:{org:'cleancell.us'},caller:admin},res);assert.equal(out.rows.length,5);assert(!out.rows.some(function(r){return /plant|omega-logic|token=/.test(r.url||'');}));assert.equal(out.rows.filter(function(r){return r.name==='Battery sizer';})[0].url,null);assert(out.rows.some(function(r){return /po-inbox/.test(r.url||'');}));
  var calls=0,gridPath=require.resolve('../api/grid-atlas'),previous=require.cache[gridPath];mock('../api/grid-atlas',async function(req,res){calls++;assert.equal(req.body.radiusKm,25);res.status(200).json({summary:'fixture',substations:[]});});
  try{var atlas=require('../api/lite-atlas');await assert.rejects(post(atlas,{lat:41,lng:-87,sizeMw:1},admin),/Editor Lite/);assert.equal(calls,0);await db.doc('omega_orgs/cleancell.us/billing/current').update({editorLite:{enabled:true,modules:['bess']}});await assert.rejects(post(atlas,{lat:100,lng:-87,sizeMw:1},admin),/location/);assert.equal(calls,0);assert.equal((await post(atlas,{lat:41,lng:-87,sizeMw:1},admin)).summary,'fixture');assert.equal(calls,1);}finally{if(previous)require.cache[gridPath]=previous;else delete require.cache[gridPath];}
});
await check('services release as tasks, never serial demand, and final billing requires recorded evidence',async function(){
  setup();await db.doc('orders/one').update({items:[{sku:'INSTALL',name:'Installation',kind:'service',qty:1}]});await W.price('one',1000,owner,true);payments.deposit=true;await W.processOrder('one');var order=db.data.get('orders/one'),wo=db.data.get('plant_works_orders/'+order.worksOrderId);assert.deepEqual(wo.requirements,[]);assert.equal(wo.serviceRequirements.length,1);assert.equal(order.logic.invoices.balance,undefined);
  await assert.rejects(post(factory,{action:'services-complete',workOrderId:order.worksOrderId,evidence:'done'},admin),/evidence/);
  await post(factory,{action:'services-complete',workOrderId:order.worksOrderId,evidence:'Installation inspected; acceptance fixture ABC-123'},admin);
  await W.processOrder('one');assert(db.data.get('orders/one').logic.invoices.balance);assert.equal(db.data.get('plant_works_orders/'+order.worksOrderId).serviceCompletion.by,admin.email);payments.balance=true;await W.processOrder('one');assert.equal(db.data.get('orders/one').status,'complete');assert.equal(db.data.get('orders/one').shipment,undefined);
});
await check('catalog is tenant-scoped, versioned, preserves private fields and requires ClearSky price approval',async function(){
  setup();var catalog=require('../api/logic-catalog'),C=require('../api/_lib/logic-catalog'),res={setHeader:function(){}};
  var p={sku:'CAB-1',name:'Catalog cabinet',kind:'product',category:'bess',kw:100,kwh:200,widthFt:4,depthFt:5,designEnabled:true,priceMode:'quote',cost:100};
  await post(catalog,{action:'save',revision:0,product:p},admin);
  await assert.rejects(post(catalog,{action:'save',revision:0,product:p},admin),/changed/);
  var view=await catalog({method:'GET',query:{org:'cleancell.us'},caller:admin},res);assert.equal(view.products.length,1);assert.equal(view.products[0].cost,undefined);assert.equal(view.designProducts[0].sku,'CAB-1');
  var c=db.data.get('omega_orgs/cleancell.us/storefront/config');c.products[0].privateEngineering='preserve';db.seed('omega_orgs/cleancell.us/storefront/config',c);
  await post(catalog,{action:'save',revision:1,product:Object.assign({},p,{name:'Updated'})},admin);assert.equal(db.data.get('omega_orgs/cleancell.us/storefront/config').products[0].privateEngineering,'preserve');
  await assert.rejects(post(catalog,{action:'save',revision:2,product:Object.assign({},p,{priceMode:'list',listPrice:2000})},admin),/ClearSky/);
  await post(catalog,{action:'save',revision:2,product:{sku:'INSTALL',name:'Installation',kind:'service',category:'bess'}},admin);
  view=await catalog({method:'GET',query:{org:'cleancell.us'},caller:admin},res);assert.equal(view.products.length,2);assert.equal(view.designProducts.length,1);
  assert.throws(function(){C.product(Object.assign({},p,{widthFt:0}));},/dimensions|width/);
  assert.equal(C.select(c,'CAB-1',{kw:250,kwh:500}).qty,3);assert.throws(function(){C.select(c,'RIVAL-SKU',{kw:100,kwh:200});},/supplier/);
  assert.equal(C.designs({})[0].placeholder,true);assert.deepEqual(C.designs({genericDesign:false}),[]);
  await assert.rejects(catalog({method:'GET',query:{org:'cleancell.us'},caller:Object.assign({},admin,{uid:'outsider',orgId:'other.us'})},res),/workspace/);
});
await check('production templates preserve quality gates, require owner and pin future work orders',async function(){
  setup();var F=require('../api/_lib/plant-flow'),flow=F.current({});flow.routing[0].instructions='Check label';flow.routing[0].parameters='Record lot';flow.lines=[{id:'north',name:'North line',location:'Building A'}];
  await assert.rejects(post(factory,{action:'flow',version:0,flow:flow},admin),/owner/);
  await post(factory,{action:'flow',version:0,flow:flow});await assert.rejects(post(factory,{action:'flow',version:0,flow:flow}),/changed/);
  assert.throws(function(){F.normalize({routing:flow.routing.filter(function(s){return s.key!=='eol';})});},/EOL/);
  await W.price('one',1000,owner,true);payments.deposit=true;await W.processOrder('one');var id=db.data.get('orders/one').worksOrderId,wo=db.data.get('plant_works_orders/'+id);assert.equal(wo.flowVersion,1);assert.equal(wo.lineId,'north');assert.equal(wo.routing[0].parameters,'Record lot');
  flow.routing[0].instructions='New instructions';await post(factory,{action:'flow',version:1,flow:flow});assert.equal(db.data.get('plant_works_orders/'+id).routing[0].instructions,'Check label');
  await post(factory,{action:'work-order',workOrderId:id,revision:0,lineId:'north',priority:'urgent',dueDate:'2026-10-01',notes:'Expedite',routing:[],status:'ready'},admin);
  wo=db.data.get('plant_works_orders/'+id);assert.equal(wo.priority,'urgent');assert.equal(wo.flowVersion,1);assert.notEqual(wo.status,'ready');
  await assert.rejects(post(factory,{action:'work-order',workOrderId:id,revision:0,lineId:'north',priority:'urgent'},admin),/changed/);
  await assert.rejects(post(factory,{action:'work-order',workOrderId:id,revision:1,lineId:'north',priority:'normal',dueDate:'2026-02-31'},admin),/valid/);
});
await check('work-order board derives progress server-side and assignee edits are audited',async function(){
  setup();var res={setHeader:function(){}};await W.price('one',1000,owner,true);payments.deposit=true;await W.processOrder('one');var id=db.data.get('orders/one').worksOrderId,line=db.data.get('plant_works_orders/'+id).lineId;
  db.seed('plant_units/cleancell.us__B-1',unit('B-1',{woId:id,orderId:'one',at:'rack',done:{kit:'2026-09-21T08:00:00Z',module:'2026-09-21T09:00:00Z'},arrivedAt:'2026-09-21T10:00:00Z',test:null}));
  db.seed('plant_units/cleancell.us__B-2',unit('B-2',{woId:id,orderId:'one',at:'',test:null}));db.seed('plant_units/cleancell.us__OTHER',unit('OTHER',{woId:'stock_9'}));
  var board=await factory({method:'GET',query:{org:'cleancell.us',page:'board'},caller:admin},res),row=board.rows.filter(function(r){return r.id===id;})[0];
  assert(row);assert.equal(row.progress.units,2);assert.equal(row.progress.done,3);assert.equal(row.stage,'in_progress');assert.equal(row.progress.nextUp.key,'rack');assert.equal(board.rows.length,1);
  var detail=await factory({method:'GET',query:{org:'cleancell.us',workOrder:id},caller:admin},res);assert.equal(detail.board.progress.percent,row.progress.percent);assert.equal(detail.activity[0].say,'Arrived at Rack assembly');assert.equal(detail.activity.length,3);
  await post(factory,{action:'work-order',workOrderId:id,revision:0,lineId:line,priority:'normal',dueDate:'',assignee:'  Dana Ortiz ',notes:''},admin);
  var wo=db.data.get('plant_works_orders/'+id);assert.equal(wo.assignee,'Dana Ortiz');var audit=Array.from(db.data.entries()).filter(function(e){return e[0].indexOf('omega_audit/')===0&&e[1].action==='plant-work-order';}).pop()[1];assert.equal(audit.after.assignee,'Dana Ortiz');assert.equal(audit.before.assignee,'');
  assert.equal((await factory({method:'GET',query:{org:'cleancell.us',page:'board'},caller:admin},res)).rows[0].assignee,'Dana Ortiz');
  await assert.rejects(factory({method:'GET',query:{org:'cleancell.us',page:'board'},caller:Object.assign({},admin,{uid:'outsider',orgId:'other.us'})},res),/workspace/);
});
await check('office lists real orders with stage and finance, counts unconverted company POs, and the ops page rolls up the floor',async function(){
  setup();var res={setHeader:function(){}};await W.price('one',1000,owner,true);payments.deposit=true;await W.processOrder('one');var id=db.data.get('orders/one').worksOrderId;
  db.seed('orders/po_x',{orgId:'cleancell.us',orderNo:'PO-IN-X',status:'po_review',source:'po-intake',items:[],poIntake:{number:'X'},createdAt:5});db.seed('orders/po_y',{orgId:'cleancell.us',orderNo:'PO-IN-Y',status:'po_declined',source:'po-intake',items:[],poIntake:{number:'Y'},createdAt:6});
  var o=await office({method:'GET',query:{org:'cleancell.us'},caller:admin},res);
  assert.deepEqual(o.orders.map(function(x){return x.id;}),['one']);assert.equal(o.intake.review,1);assert.equal(o.intake.declined,1);assert.equal(o.orders[0].stage.key,'production');assert.equal(o.totals.byStage.production,1);assert.equal(o.finance.recordedCents,o.orders[0].logic.invoices.deposit.paidCents);assert.equal(o.finance.wire,null);assert.equal(o.links.board,'/plant/work-orders.html?org=cleancell.us');
  assert((await office({method:'GET',query:{org:'cleancell.us'},caller:owner},res)).finance.wire);
  db.seed('plant_units/cleancell.us__C-1',unit('C-1',{woId:id,orderId:'one',inventoryStatus:'allocated',at:'ready',test:null}));db.seed('plant_units/cleancell.us__STK',unit('STK',{woId:'stock_1',inventoryStatus:'available',at:'ready'}));
  db.seed('plant_scans/cleancell.us__s1',{orgId:'cleancell.us',at:new Date().toISOString(),ok:true,verdict:{action:'advance',to:'ready'},stationId:'st1',createdAt:Date.now()});
  var ops=await factory({method:'GET',query:{org:'cleancell.us',page:'ops'},caller:admin},res);
  assert.equal(ops.floor.totals.advances,1);assert.equal(ops.floor.totals.ready,1);assert.equal(ops.floor.days.length,14);assert.equal(ops.stock.available,1);assert.equal(ops.completed.readyOnOrders,1);assert(ops.demand.skus.length>=1);assert.equal(ops.queues.filter(function(q){return q.key==='ready';})[0].count,1);assert.equal(ops.rows.length,1);
});
await check('station scans capture routing context, reject wrong line and preserve idempotency',async function(){
  setup();var scan=require('../api/mes-scan'),S=require('../api/_lib/plant-station'),route=clone(Plant.DEFAULT_ROUTING);route[0].instructions='Inspect label';route[0].parameters='Match lot';
  db.seed('plant_works_orders/stock_1',{orgId:'cleancell.us',lineId:'north',flowVersion:3,routing:route});db.seed('plant_units/cleancell.us__SCAN-1',unit('SCAN-1',{at:'',test:null}));
  db.seed('plant_stations/scan-test',{orgId:'cleancell.us',station:route[0].key,lineId:'south',location:'Bay 2',revision:4,tokenHash:S.sha('fixture-token'),active:true});
  var body={stationId:'scan-test',token:'fixture-token',scanId:'arrival-one',serial:'SCAN-1'};var rejected=await post(scan,body);assert.equal(rejected.reason,'wrong_line');assert.equal(db.data.get('plant_units/cleancell.us__SCAN-1').at,'');
  await db.doc('plant_stations/scan-test').update({lineId:'north'});var accepted=await post(scan,Object.assign({},body,{scanId:'arrival-two'}));assert.equal(accepted.ok,true);assert.equal(accepted.instructions,'Inspect label');
  var event=db.data.get('plant_scans/cleancell.us__arrival-two');assert.equal(event.context.flowVersion,3);assert.equal(event.context.stationRevision,4);assert.equal(event.context.parameters,'Match lot');
  assert.equal((await post(scan,Object.assign({},body,{scanId:'arrival-two'}))).replayed,true);
  await assert.rejects(post(scan,Object.assign({},body,{scanId:'arrival-two',serial:'OTHER'})),/another event/);
});
await check('plant manager pages are scoped and station projections never contain credentials',async function(){
  setup();for(var i=0;i<101;i++)db.seed('plant_stations/station-'+String(i).padStart(3,'0'),{orgId:'cleancell.us',station:'kit',tokenHash:'SECRET',active:true});db.seed('plant_stations/other',{orgId:'other.us',tokenHash:'PRIVATE'});
  var res={setHeader:function(){}},first=await factory({method:'GET',query:{org:'cleancell.us',page:'stations'},caller:admin},res);assert.equal(first.rows.length,100);assert(!JSON.stringify(first).includes('SECRET'));var last=await factory({method:'GET',query:{org:'cleancell.us',page:'stations',after:first.next},caller:admin},res);assert.equal(last.rows.length,1);assert.equal(last.next,null);
  await assert.rejects(factory({method:'GET',query:{org:'cleancell.us',page:'stations',after:'other'},caller:admin},res),/cursor/);
  await post(factory,{action:'station-edit',stationId:'station-000',revision:0,lineId:'main',label:'Bench A',location:'Bay',instructions:'Scan arrival',active:true,tokenHash:'forged',station:'ready'},admin);
  var saved=db.data.get('plant_stations/station-000');assert.equal(saved.station,'kit');assert.equal(saved.tokenHash,'SECRET');assert.equal(saved.revision,1);
});
await check('scanner pairing validates its credential without producing a fake scan',async function(){
  setup();var S=require('../api/_lib/plant-station'),scan=require('../api/mes-scan');
  db.seed('plant_stations/pair-fixture',{orgId:'cleancell.us',station:'kit',label:'Bay 1',tokenHash:S.sha('fixture-only-token'),active:true});
  var before=db.data.size,result=await post(scan,{action:'describe',stationId:'pair-fixture',token:'fixture-only-token'});
  assert.equal(result.ok,true);assert.equal(result.station,'kit');assert.equal(result.brand.name,'Clean Cell');assert.equal(db.data.size,before);
  await assert.rejects(post(scan,{action:'describe',stationId:'pair-fixture',token:'wrong'}),/not paired/);
  await db.doc('plant_stations/pair-fixture').update({active:false});await assert.rejects(post(scan,{action:'describe',stationId:'pair-fixture',token:'fixture-only-token'}),/deactivated/);
});
await check('customer website entry publishes only a usable public storefront key',async function(){
  setup();var handler=require('../api/customer-portal'),req={method:'GET',query:{org:'cleancell.us'}},res={setHeader:function(){}};
  db.seed('embed_keys/omega_pk_live_wrongorigin',{orgId:'cleancell.us',scopes:['storefront'],origins:['other.us']});
  db.seed('embed_keys/omega_pk_live_disabled',{orgId:'cleancell.us',scopes:['storefront'],active:false,origins:[]});
  db.seed('embed_keys/private_admin_secret',{orgId:'cleancell.us',scopes:['storefront'],origins:[]});
  assert.equal((await handler(req,res)).links.storefront,null);
  db.seed('embed_keys/omega_pk_live_correctkey',{orgId:'cleancell.us',scopes:['storefront'],origins:['silmarillion.clearskyomega.com']});
  var result=await handler(req,res);assert(result.links.start.endsWith('/customer-start.html?org=cleancell.us'));assert(result.links.storefront.endsWith('omega_pk_live_correctkey'));assert(!JSON.stringify(result).includes('private_admin_secret'));
});
await check('office customer profile updates are scoped and audited without changing terms or paid access',async function(){
  setup();var buyers=require('../api/buyers'),B=require('../api/_lib/buyer-accounts');
  var created=await post(buyers,{action:'create',email:'buyer@example.com',name:'Buyer',company:'Example'},admin);
  await post(buyers,{action:'profile',email:'buyer@example.com',name:'New name',company:'New company',phone:'555',status:'suspended',address:{city:'Example city'},plan:'designer',terms:{depositPct:0}},admin);
  var c=await B.lookup(db,'cleancell.us','buyer@example.com');assert.equal(c.id,created.customerId);assert.equal(c.user.name,'New name');assert.equal(c.data.status,'suspended');assert.equal(c.data.plan,'free');assert.deepEqual(c.data.terms,{});
  assert(Array.from(db.data.values()).some(function(d){return d.action==='buyer-profile'&&d.by===admin.email;}));
});
await check('verified ClearSky owner can use customer designs without granting subscriptions or crossing account boundaries',async function(){
  setup();var buyers=require('../api/buyers'),design=require('../api/customer-design'),B=require('../api/_lib/buyer-accounts'),D=require('../api/_lib/buyer-design'),res={setHeader:function(){}};
  var other={email:'other@clearsky-usa.com',uid:'other',staff:true,claims:{email_verified:true}};
  await post(buyers,{action:'create',email:owner.email,name:'Tom',company:'ClearSky owner'},admin);
  await post(buyers,{action:'create',email:other.email,name:'Other',company:'Other customer'},admin);
  await db.doc('omega_orgs/cleancell.us/billing/current').update({editorLite:{enabled:true,modules:['bess']}});
  function list(c){return design({method:'GET',query:{org:'cleancell.us'},caller:c},res);}
  var out=await list(owner);assert.equal(out.access.active,true);assert.equal(out.access.status,'owner-access');assert.equal(out.access.expiresAt,null);assert.deepEqual(out.access.modules,['bess']);
  assert.equal((await list(other)).access.active,false);
  assert.equal(D.entitlement({billing:{editorLite:{enabled:true}}},{},null).active,false);
  var save={action:'save',projectId:'owner-site',revision:0,name:'Owner site',module:'bess',kw:1000,hours:2,canvas:{elements:[]},owner:true,email:owner.email,customerId:'forged'};
  await assert.rejects(post(design,save,other),/subscription or approved trial/);
  assert.equal((await post(design,save,owner)).revision,1);
  assert.equal((await post(design,{action:'size',module:'bess',sku:'GENERIC-BESS',kw:1000,hours:2},owner)).kwh,2000);
  var opened=await design({method:'GET',query:{org:'cleancell.us',project:'owner-site'},caller:owner},res);assert.equal(opened.project.customerId,out.customerId);assert.equal(opened.project.createdBy,owner.uid);
  await post(buyers,{action:'editor-trial',email:other.email,days:7});
  await assert.rejects(design({method:'GET',query:{org:'cleancell.us',project:'owner-site'},caller:other},res),/not found/);
  assert.equal((await list(other)).projects.length,0);
  db.seed('omega_orgs/cleancell.us/storefront/config',{products:[{sku:'CAB',name:'Fixture cabinet'}]});
  var quote=await post(design,{action:'quote',projectId:'owner-site',revision:1,sku:'CAB',qty:1},owner);assert.equal(db.data.get('orders/'+quote.orderId).customer.email,owner.email);
  var acct=await B.lookup(db,'cleancell.us',owner.email);assert.equal(acct.data.editorLite,undefined);assert.equal(acct.data.plan,'free');
  await assert.rejects(post(design,Object.assign({},save,{revision:1,module:'compute'}),owner),/not enabled/);
  await assert.rejects(list(Object.assign({},owner,{claims:{email_verified:false}})),/Verify/);
  await db.doc('omega_orgs/cleancell.us/billing/current').update({editorLite:{enabled:false,modules:['bess']}});
  await assert.rejects(post(design,Object.assign({},save,{revision:1}),owner),/subscription or approved trial/);
  await db.doc('omega_orgs/cleancell.us/billing/current').update({editorLite:{enabled:true,modules:['bess']}});
  await db.doc('omega_orgs/cleancell.us/customers/'+acct.id).update({status:'suspended'});await assert.rejects(list(owner),/disabled/);
  await db.doc('omega_orgs/cleancell.us/customers/'+acct.id).update({status:'active'});
  await db.doc('omega_orgs/cleancell.us').update({status:'suspended'});await assert.rejects(list(owner),/not active/);
});
await check('buyer design isolation, expiring trials, version conflicts and body privilege injection',async function(){
  setup();var buyers=require('../api/buyers'),design=require('../api/customer-design'),B=require('../api/_lib/buyer-accounts');
  var buyer={email:'buyer@example.com',uid:'buyer',orgId:'example.com',claims:{email_verified:true}},other={email:'other@example.com',uid:'other',orgId:'example.com',claims:{email_verified:true}},res={setHeader:function(){}};
  await post(buyers,{action:'create',email:buyer.email,name:'Buyer',company:'Example'},admin);await post(buyers,{action:'create',email:other.email,name:'Other',company:'Other'},admin);
  await db.doc('omega_orgs/cleancell.us/billing/current').update({editorLite:{enabled:true,modules:['bess']}});
  var save={action:'save',projectId:'project-one',revision:0,name:'My site',module:'bess',kw:1000,hours:2,canvas:{elements:[],shapes:[{points:[[10,20],[30,40]]}]},customerId:'forged',plan:'designer'};
  await assert.rejects(post(design,save,buyer),/subscription or approved trial/);
  await assert.rejects(post(buyers,{action:'editor-trial',email:buyer.email,days:7},admin),/owner/);
  await post(buyers,{action:'editor-trial',email:buyer.email,days:7});await post(buyers,{action:'editor-trial',email:other.email,days:7});
  assert.equal((await post(design,save,buyer)).revision,1);
  var open=await design({method:'GET',query:{org:'cleancell.us',project:'project-one'},caller:buyer},res);assert.notEqual(open.project.customerId,'forged');assert.equal(open.project.createdBy,'buyer');
  await assert.rejects(design({method:'GET',query:{org:'cleancell.us',project:'project-one'},caller:other},res),/not found/);
  await assert.rejects(post(design,save,buyer),/another window/);
  await assert.rejects(post(design,Object.assign({},save,{revision:1,module:'compute'}),buyer),/not enabled/);
  await assert.rejects(post(design,Object.assign({},save,{revision:1,canvas:{elements:[],large:'x'.repeat(750001)}}),buyer),/save limit/);
  await assert.rejects(post(design,save,Object.assign({},buyer,{claims:{email_verified:false}})),/Verify/);
  var quote={action:'quote',projectId:'project-one',revision:1,sku:'CATALOG-CAB',qty:2,customer:{email:'spoof@example.com'},total:1};
  await assert.rejects(post(design,quote,buyer),/published catalog/);
  db.seed('omega_orgs/cleancell.us/storefront/config',{products:[{sku:'CATALOG-CAB',name:'Published fixture cabinet'}]});
  var quoted=await post(design,quote,buyer),duplicate=await post(design,quote,buyer);
  assert.equal(quoted.orderId,duplicate.orderId);assert.equal(duplicate.duplicate,true);
  var order=db.data.get('orders/'+quoted.orderId);assert.equal(order.customer.email,buyer.email);assert.equal(order.status,'new');assert.equal(order.logic,undefined);assert.equal(order.pricing,null);assert.equal(order.items[0].name,'Published fixture cabinet');
  assert.deepEqual(JSON.parse(db.data.get('orders/'+quoted.orderId+'/design/submitted').canvasJson),save.canvas);
  assert.deepEqual(open.project.canvas,save.canvas);assert.equal(open.project.canvasJson,undefined);
  await assert.rejects(post(design,Object.assign({},quote,{qty:3}),buyer),/different quote request/);
  await assert.rejects(post(design,quote,other),/design changed/);
  await db.doc('omega_orgs/cleancell.us/billing/current').update({editorLite:{enabled:true,modules:['solar']}});
  await assert.rejects(design({method:'GET',query:{org:'cleancell.us',project:'project-one'},caller:buyer},res),/no longer enabled/);
  await db.doc('omega_orgs/cleancell.us/billing/current').update({editorLite:{enabled:true,modules:['bess']}});
  await post(buyers,{action:'editor-trial',email:buyer.email,days:0});
  await assert.rejects(post(design,Object.assign({},save,{revision:1}),buyer),/subscription or approved trial/);
  var retained=await design({method:'GET',query:{org:'cleancell.us'},caller:buyer},res);assert.equal(retained.access.active,false);assert.equal(retained.projects.length,1);
  assert(!Array.from(db.data.keys()).some(function(k){return /^projects\//.test(k);}));assert(!db.data.has('omega_orgs/example.com'));
});
await check('office creation and buyer signup converge atomically without platform membership',async function(){
  setup();var B=require('../api/_lib/buyer-accounts'),buyers=require('../api/buyers');
  var buyer={email:'buyer@example.com',uid:'buyer-uid',orgId:'example.com',claims:{email_verified:true},staff:false};
  var initial=await post(buyers,{action:'create',email:buyer.email,name:'Contact',company:'Customer Company',terms:{depositPct:45,dueDays:7}},admin);
  var copies=await Promise.all([B.ensure(db,'cleancell.us',buyer.email,{},buyer),B.ensure(db,'cleancell.us',buyer.email,{},buyer)]);
  assert(copies.every(function(a){return a.id===initial.customerId;}));assert.equal(copies[0].data.terms.depositPct,45);
  assert.equal(Array.from(db.data.keys()).filter(function(k){return /^omega_orgs\/cleancell.us\/customers\/[^/]+$/.test(k);}).length,1);
  assert.equal(db.data.has('omega_orgs/cleancell.us/members/buyer-uid'),false);assert.equal(db.data.has('omega_orgs/example.com'),false);
  await assert.rejects(post(buyers,{action:'create',email:'new@example.com',name:'N',company:'C'},buyer),/workspace/);
  await assert.rejects(post(buyers,{action:'terms',email:buyer.email,terms:{depositPct:101}},admin),/Deposit/);
  await post(buyers,{action:'terms',email:buyer.email,terms:{depositPct:20,dueDays:14}},admin);
  assert.equal((await B.lookup(db,'cleancell.us',buyer.email)).data.terms.depositPct,20);
  var me=require('../api/my-account');var r=await me({method:'GET',query:{org:'cleancell.us'},caller:buyer},{setHeader:function(){}});
  assert.equal(r.customerId,initial.customerId);assert.equal(r.terms.depositPct,20);
  await post(me,{company:'Updated Company',terms:{depositPct:0},plan:'editor-lite',role:'admin'},buyer);
  var saved=(await B.lookup(db,'cleancell.us',buyer.email)).data;assert.equal(saved.plan,'free');assert.equal(saved.terms.depositPct,20);
  await db.doc('omega_orgs/cleancell.us/customers/'+initial.customerId).update({status:'suspended'});
  await assert.rejects(me({method:'GET',query:{org:'cleancell.us'},caller:buyer},{setHeader:function(){}}),/disabled/);
  await assert.rejects(require('../api/my-orders')({method:'GET',query:{org:'cleancell.us'},caller:buyer},{setHeader:function(){}}),/disabled/);
});
await check('customer creation cannot escape tenant scope, recurse on a dangling pointer or enroll under a missing OEM',async function(){
  setup();var B=require('../api/_lib/buyer-accounts');
  await assert.rejects(B.context('absent.us'),/not provisioned/);
  await assert.rejects(B.ensure(db,'cleancell.us','bad/path@example.com',{},null),/valid customer email/);
  db.seed('omega_orgs/cleancell.us/customer_index/buyer@example.com',{customerId:'missing'});
  await assert.rejects(B.ensure(db,'cleancell.us','buyer@example.com',{},null),/office review/);
  await db.doc('omega_orgs/cleancell.us/billing/current').update({status:'suspended'});
  await assert.rejects(B.context('cleancell.us'),/not active/);
});
await check('buyer endpoints require verified identity; office read and invitation are not available to buyers',async function(){
  setup();var buyers=require('../api/buyers'),me=require('../api/my-account'),orders=require('../api/my-orders');
  var unverified=Object.assign({},owner,{claims:{email_verified:false}}),res={setHeader:function(){}};
  await assert.rejects(me({method:'GET',query:{org:'cleancell.us'},caller:unverified},res),/confirm your email/);
  await assert.rejects(orders({method:'GET',query:{org:'cleancell.us'},caller:unverified},res),/confirm your email/);
  var buyer={uid:'buyer',email:'buyer@example.com',orgId:'example.com',claims:{email_verified:true}};
  await assert.rejects(buyers({method:'GET',query:{org:'cleancell.us'},caller:buyer},res),/workspace/);
  await assert.rejects(post(buyers,{action:'invite',email:'buyer@example.com'},buyer),/workspace/);
  await post(buyers,{action:'create',email:'buyer@example.com',name:'Buyer',company:'Example'},admin);
  var sent=0;mock('../api/_lib/mail',{configured:function(){return true;},esc:String,button:function(){return '';},wlLayout:function(){return '';},send:async function(){sent++;return {skipped:true};}});
  await assert.rejects(post(buyers,{action:'invite',email:'buyer@example.com'},admin),/not configured/);assert.equal(sent,0);
  await db.doc('omega_orgs/cleancell.us').update({whiteLabel:{embed:{mailFrom:'sales@example.invalid'}}});
  db.seed('omega_orgs/cleancell.us/storefront/config',{emailCustomer:true});
  await assert.rejects(post(buyers,{action:'invite',email:'buyer@example.com'},admin),/not sent/);assert.equal(sent,1);
  var c=await require('../api/_lib/buyer-accounts').lookup(db,'cleancell.us','buyer@example.com');assert.equal(c.data.lastInvitedAt,undefined);
});
await check('customer Editor Lite offer defaults to $799, is owner-configurable and grants no subscription',async function(){
  setup();var portalConfig=require('../api/customer-portal'),req={method:'GET',query:{org:'cleancell.us'}},res={setHeader:function(){}};
  var before=await portalConfig(req,res);assert.equal(before.editorLite.monthlyPriceCents,79900);assert.equal(before.editorLite.checkoutAvailable,false);assert.equal(before.account.free,true);
  await post(require('../api/logic-onboard'),{action:'customer-editor-price',monthlyPriceCents:89900});
  assert.equal((await portalConfig(req,res)).editorLite.monthlyPriceCents,89900);
  await assert.rejects(post(require('../api/logic-onboard'),{action:'customer-editor-price',monthlyPriceCents:0}),/Monthly price/);
  await assert.rejects(post(require('../api/logic-onboard'),{action:'customer-editor-price',monthlyPriceCents:89900},admin),/owner/);
  assert(!JSON.stringify(before).includes('realmId'));assert(!JSON.stringify(before).includes('itemRef'));
});
await check('explicit support mailbox attestation is owner-only and does not trust disabled members',async function(){
  setup();var verified=0,u={uid:'support',email:'admin@cleancell.us',emailVerified:false};
  A.init=function(){return {auth:function(){return {getUserByEmail:async function(){return u;},updateUser:async function(){verified++;return Object.assign({},u,{emailVerified:true});}};}};};
  var onboard=require('../api/logic-onboard'),body={action:'administrator',email:u.email,name:'Support',supportAccount:true};
  db.seed('omega_orgs/cleancell.us/members/support',{role:'admin',status:'disabled'});
  await assert.rejects(post(onboard,body),/disabled/);assert.equal(verified,0);
  await db.doc('omega_orgs/cleancell.us/members/support').update({status:'active'});
  assert.equal((await post(onboard,body)).emailVerified,true);assert.equal(verified,1);
  await assert.rejects(post(onboard,Object.assign({},body,{email:'someone@cleancell.us'})),/admin@/);
});
await check('Editor Lite fails closed on module and subscription grants, including owner preview',async function(){
  setup();var lite=require('../api/editor-lite');
  await assert.rejects(post(lite,{module:'bess',kw:1000,hours:2}),/not enabled/);
  await db.doc('omega_orgs/cleancell.us/billing/current').update({editorLite:{enabled:true,modules:['bess']}});
  assert.equal((await post(lite,{module:'bess',kw:1000,hours:2,sku:'GENERIC-BESS'},admin)).kwh,2000);
  await assert.rejects(post(lite,{module:'bess',kw:1000,hours:2,sku:'OTHER-TENANT'},admin),/supplier/);
  await assert.rejects(post(lite,{module:'compute',kw:1000,hours:2}),/not included/);
  await assert.rejects(post(lite,{module:'bess',kw:-1,hours:2}),/Target/);
  await assert.rejects(post(lite,{module:'bess',kw:1000,hours:99}),/duration/);
  await assert.rejects(post(lite,{module:'bess',kw:1000,hours:2},Object.assign({},admin,{claims:{email_verified:false}})),/Verify/);
  var response=await lite({method:'GET',query:{org:'cleancell.us'},caller:owner},{setHeader:function(){}});
  assert.equal(response.preview,true);assert.equal(response.projectOrg,'clearsky-usa.com');assert.deepEqual(response.modules,['bess']);
  await db.doc('omega_orgs/cleancell.us/billing/current').update({status:'suspended'});
  await assert.rejects(post(lite,{module:'bess',kw:1000,hours:2}),/not enabled/);
});
await check('portal subscription is independent of payment activation but payments remain blocked',async function(){setup();await db.doc('omega_orgs/cleancell.us/fulfillment/config').update({enabled:false});assert.equal(X.enabled(await X.authorize(admin,'cleancell.us',true)),false);await assert.rejects(W.price('one',1000,owner,true),/configuration/);await db.doc('omega_orgs/cleancell.us/billing/current').update({status:'past_due'});await assert.rejects(X.authorize(admin,'cleancell.us',false),/subscription/);});
await check('enrollment preserves other addons and financial setup, records modules and disables safely',async function(){setup();var onboard=require('../api/logic-onboard');await db.doc('omega_orgs/cleancell.us/billing/current').update({addons:['compute']});await post(onboard,{action:'bundle',enabled:true,modules:['bess','solar']});var b=db.data.get('omega_orgs/cleancell.us/billing/current');assert.deepEqual(b.addons,['compute','omega-logic','whitelabel']);assert.deepEqual(b.editorLite.modules,['bess','solar']);assert.equal(db.data.get('omega_orgs/cleancell.us/fulfillment/config').itemRef,'5');await post(onboard,{action:'bundle',enabled:false,modules:[]});assert.equal(X.subscribed(await X.context('cleancell.us')),false);assert(db.data.get('omega_orgs/cleancell.us/billing/current').addons.includes('compute'));await assert.rejects(post(onboard,{action:'bundle',enabled:true,modules:['root']}),/modules/);await assert.rejects(post(onboard,{action:'bundle',enabled:true,modules:['bess']},admin),/owner/);});
await check('administrator enrollment is tenant-scoped, unverified and retry-safe without password resets',async function(){
  setup();var onboard=require('../api/logic-onboard'),users={},created=0;
  A.init=function(){return {auth:function(){return {
    getUserByEmail:async function(email){if(users[email])return users[email];throw Object.assign(new Error('absent'),{code:'auth/user-not-found'});},
    createUser:async function(u){created++;assert.equal(u.emailVerified,false);assert.equal(u.customClaims,undefined);return users[u.email]={uid:'robert',email:u.email,emailVerified:false};}
  };}};};
  var body={action:'administrator',email:'admin@cleancell.us',name:'Robert Bucher',password:'fixture-only-password'};
  assert.equal((await post(onboard,body)).created,true);assert.equal((await post(onboard,body)).created,false);assert.equal(created,1);
  assert.equal(db.data.get('omega_orgs/cleancell.us/members/robert').role,'admin');assert(!JSON.stringify(Array.from(db.data.values())).includes(body.password));
  await assert.rejects(post(onboard,Object.assign({},body,{email:'admin@other.us'})),/domain/);await assert.rejects(post(onboard,body,admin),/owner/);
});
await check('directory hides explicitly excluded prospects without deleting accounts or hiding other OEMs',async function(){setup();db.seed('omega_orgs/iqgen.energy',{name:'iQGen Technologies',vertical:'oem',status:'active',logicDirectoryHidden:true});db.seed('omega_orgs/fenecon.com',{name:'FENECON',vertical:'oem',status:'active'});db.seed('omega_orgs/joulesai.com',{name:'Joules AI',vertical:'oem',status:'active'});db.seed('omega_orgs/legacy.us',{vertical:'oem',supersededBy:'cleancell.us'});var result=await office({method:'GET',query:{},caller:owner},{setHeader:function(){}});assert.deepEqual(result.tenants.map(function(t){return t.orgId;}).sort(),['cleancell.us','fenecon.com','joulesai.com']);assert.equal(db.data.get('omega_orgs/iqgen.energy').status,'active');assert.equal((await X.context('iqgen.energy')).org.name,'iQGen Technologies');});
await check('30% due on receipt; customer terms override defaults including zero',function(){assert.deepEqual(P.terms(),{depositPct:30,dueDays:0});assert.deepEqual(P.terms({depositPct:30},{depositPct:0,dueDays:15}),{depositPct:0,dueDays:15});assert.throws(function(){P.terms(null,{depositPct:101});});});
await check('fee is added, never deducted; cents sum exactly',function(){var s=P.snapshot(1000);assert.equal(s.baseCents,100000);assert.equal(s.feeCents,250);assert.equal(s.depositCents,30075);assert.equal(s.depositCents+s.balanceCents,s.totalCents);for(var n=1;n<1000;n++){var v=P.snapshot(n/100);assert.equal(v.depositCents+v.balanceCents,v.totalCents);}});
await check('only exact Intuit HTTPS payment links pass',function(){assert(P.paymentLink('https://connect.intuit.com/pay/one'));['javascript:alert(1)','https://intuit.com.evil.test/','https://evilintuit.com','https://user@intuit.com/','http://intuit.com/'].forEach(function(url){assert.equal(P.paymentLink(url),null);});});
await check('credit/balance zero is not proof of payment; linked allocation is required',function(){var inv={Id:'1',TotalAmt:100,Balance:0,CustomerRef:{value:'C'}};assert.equal(P.receipt(inv,[],10000,'C').satisfied,false);var pay={Id:'P',TotalAmt:100,CustomerRef:{value:'C'},Line:[{Amount:100,LinkedTxn:[{TxnId:'1',TxnType:'Invoice'}]}]};assert.equal(P.receipt(inv,[pay,pay],10000,'C').paidCents,10000);assert.throws(function(){P.receipt(Object.assign({},inv,{TotalAmt:99}),[pay],10000,'C');});});
await check('failed EOL retest cannot be bypassed by human scan',function(){var u={at:'eol',test:{result:'fail'}};assert.equal(Plant.judgeScan(u,'qa').ok,false);var verdict=Plant.judgeMachineResult(u,'eol',null,{pass:true});assert.equal(Plant.applyMachineResult(u,verdict,'now',{result:'pass'}).test.result,'pass');});
await check('private owner gate rejects other staff, unverified account and cross-tenant',async function(){setup();assert.equal(X.owner(owner),true);assert.equal(X.owner(Object.assign({},owner,{claims:{email_verified:false}})),false);await assert.rejects(X.authorize(Object.assign({},owner,{email:'other@clearsky-usa.com'}),'cleancell.us',true));await assert.rejects(X.authorize(Object.assign({},admin,{orgId:'other.us'}),'cleancell.us',true));});
await check('unpaid accepted order does not release; generic deposit flag does nothing',async function(){setup();await W.price('one',1000,owner,true);await db.doc('orders/one').update({deposit:true});await W.processOrder('one');assert.equal(db.data.get('orders/one').worksOrderId,undefined);assert.equal(invoiceWrites,1);});
await check('timeout after invoice creation retries with stable key; one provider invoice',async function(){setup();await W.price('one',1000,owner,true);crash=true;assert.equal((await W.processOrder('one')).ok,false);assert.equal(invoiceWrites,1);assert.equal((await W.processOrder('one')).ok,true);assert.equal(invoiceWrites,1);assert(db.data.get('orders/one').logic.invoices.deposit.id);});
await check('account terms snapshot is applied before invoice and remains immutable',async function(){setup();db.seed('omega_orgs/cleancell.us/customer_index/buyer@example.com',{customerId:'buyer'});db.seed('omega_orgs/cleancell.us/customers/buyer',{terms:{depositPct:50,dueDays:10}});await W.price('one',1000,owner);assert.equal(db.data.get('orders/one').logic.commercial.depositCents,50125);await assert.rejects(W.price('one',2000,owner));});
await check('cash without acceptance waits; acceptance releases shortage exactly once',async function(){setup();await W.price('one',1000,owner);payments.deposit=true;await W.processOrder('one');assert.equal(db.data.get('orders/one').worksOrderId,undefined);await W.price('one',1000,owner,true);await Promise.all([W.processOrder('one'),W.processOrder('one')]);assert.deepEqual(db.data.get('plant_works_orders/wo_one').requirements,[{sku:'CAB',qty:1}]);assert.equal(Array.from(db.data.keys()).filter(function(k){return k.startsWith('plant_works_orders/');}).length,1);});
await check('one finished assembly cannot be double allocated; genealogy follows the order',async function(){setup();db.seed('plant_units/cleancell.us__ROOT',unit('ROOT'));db.seed('plant_units/cleancell.us__CELL',unit('CELL',{unitType:'cell',shipUnit:false,parentSerial:'ROOT',rootSerial:'ROOT',sku:'CELL'}));newOrder('two');await W.price('one',1000,owner,true);await W.price('two',1000,owner,true);payments.deposit=true;await Promise.all([W.processOrder('one'),W.processOrder('two')]);var a=db.data.get('plant_units/cleancell.us__ROOT');assert.equal(a.orderId,'one');assert.equal(db.data.get('plant_units/cleancell.us__CELL').orderId,'one');assert.equal(a.trace.lot,'L001');assert.equal(a.sourceWoId,'stock_1');assert.equal(db.data.get('plant_works_orders/wo_one').requirements.length,0);assert.equal(db.data.get('plant_works_orders/wo_two').requirements[0].qty,1);assert(db.data.get('orders/one').logic.invoices.balance);});
await check('held child makes whole finished assembly unavailable',async function(){setup();db.seed('plant_units/cleancell.us__ROOT',unit('ROOT'));db.seed('plant_units/cleancell.us__CELL',unit('CELL',{shipUnit:false,parentSerial:'ROOT',rootSerial:'ROOT',hold:'quality hold'}));await W.price('one',1000,owner,true);payments.deposit=true;await W.processOrder('one');assert.equal(db.data.get('plant_units/cleancell.us__ROOT').orderId,null);assert.equal(db.data.get('plant_works_orders/wo_one').requirements[0].qty,1);});
await check('payment reversal blocks final release and shipment',async function(){setup();await W.price('one',1000,owner,true);payments.deposit=true;await W.processOrder('one');payments.deposit=0;await W.processOrder('one');assert(db.data.get('orders/one').logic.paymentException);await assert.rejects(W.finish('one',owner,{carrier:'X',tracking:'123'}));});
await check('serial registration is atomic, replay-safe, and cannot exceed demand',async function(){setup();await W.price('one',1000,owner,true);payments.deposit=true;await W.processOrder('one');var b={action:'register',workOrderId:'wo_one',requestId:'reg_1',units:[{serial:'ACTUAL001',sku:'CAB',unitType:'cabinet',shipUnit:true,trace:{lot:'L'}}]};await post(factory,b,admin);assert.equal((await post(factory,b,admin)).duplicate,true);assert.equal(db.data.get('plant_units/cleancell.us__ACTUAL001').test,null);assert.equal(db.data.get('plant_units/cleancell.us__ACTUAL001').rootSerial,'ACTUAL001');await assert.rejects(post(factory,Object.assign({},b,{requestId:'reg_2',units:[{serial:'ACTUAL002',sku:'CAB',unitType:'cabinet',shipUnit:true}]}),admin));});
await check('wire ledger cannot spend unrecorded or uncleared money; confirmations are cumulative',async function(){setup();await W.price('one',1000,owner,true);await assert.rejects(post(office,{action:'cleared',orderId:'one',amount:300.75,bankReference:'bank-1'}));payments.deposit=true;await W.processOrder('one');await post(office,{action:'cleared',orderId:'one',amount:300.75,bankReference:'bank-1'});var payout=db.data.get('orders/one').logic.payout;assert.equal(payout.pendingCents,30000);await assert.rejects(post(office,{action:'wire_sent',orderId:'one',amount:301,bankReference:'wire-1'}));await post(office,{action:'wire_sent',orderId:'one',amount:300,bankReference:'wire-1'});await post(office,{action:'wire_sent',orderId:'one',amount:300,bankReference:'wire-1'});assert.equal(db.data.get('orders/one').logic.payout.sentCents,30000);});
await check('buyer checkout exposes neither realm, wire record, fee policy nor internal costs',async function(){var o=db.data.get('orders/one');o.cost=12345;o.logic.payout.secret='wire-private';var pub=portal.publicOrder(o),txt=JSON.stringify(pub);assert.equal(pub.checkout.processingFee,2.5);assert(!txt.includes('realmId'));assert(!txt.includes('wire-private'));assert(!txt.includes('feePolicy'));assert(!txt.includes('12345'));assert.equal(rollup.rollup([o],[{units:[],known:true}]).totals.collected,300.75);});
await check('subscription suspension blocks new prices and worker writes',async function(){setup();await W.price('one',1000,owner,true);db.seed('omega_orgs/cleancell.us/billing/current',{addons:['omega-logic'],status:'suspended'});newOrder('two');await assert.rejects(W.price('two',1000,owner,true));assert.equal((await W.processOrder('one')).ok,false);assert.equal(invoiceWrites,0);});
await check('unpriced cancellation does not create a malformed accounting workflow',async function(){setup();await post(office,{action:'cancel',orderId:'one'},admin);assert.equal(db.data.get('orders/one').logic,undefined);await assert.rejects(W.price('one',1000,owner));});
await check('ready allocated stock cannot hide an unbuilt remainder in the buyer milestone',function(){assert.equal(portal.milestoneOf({status:'in_fulfilment',logic:{enabled:true}},[{at:'ready'}]).key,'production');});
await check('accounting failure prevents shipment against stale payment evidence',async function(){setup();await W.price('one',1000,owner,true);payments.deposit=true;await W.processOrder('one');await db.doc('orders/one').update({'logic.lastError':'Invoice changed'});await assert.rejects(W.finish('one',owner,{carrier:'Carrier',tracking:'123'}),/reconcile accounting/);});
await check('quality disposition closes active NCR but retains audit and cannot waive a failed test',async function(){setup();db.seed('plant_units/cleancell.us__ROOT',unit('ROOT',{at:'eol',hold:'Test failure',ncr:'NCR-001',test:{result:'fail'}}));var control=require('../api/plant-control');await post(control,{action:'release',actionId:'release_0001',orgId:'cleancell.us',serial:'ROOT',reason:'Repair completed; retest required'},admin);var u=db.data.get('plant_units/cleancell.us__ROOT');assert.equal(u.ncr,null);assert.equal(u.lastNcr,'NCR-001');assert.equal(u.test.result,'fail');assert.equal(Plant.judgeScan(u,'qa').ok,false);assert.equal(db.data.get('plant_scans/cleancell.us__control_release_0001').control.ncr,'NCR-001');});
await check('ready queues final invoice once and shipment waits for verified balance',async function(){setup();db.seed('plant_units/cleancell.us__ROOT',unit('ROOT'));await W.price('one',1000,owner,true);payments.deposit=true;await W.processOrder('one');assert(db.data.get('orders/one').logic.invoices.balance);await assert.rejects(W.finish('one',owner,{carrier:'Example',tracking:'BOL-123'}),/Final payment/);await W.processOrder('one');assert.equal(invoiceWrites,2);payments.balance=true;await W.processOrder('one');await W.finish('one',owner,{carrier:'Example',tracking:'BOL-123'});assert.equal(db.data.get('orders/one').status,'shipped');assert.equal(invoiceWrites,2);});
await check('webhook signature, deduplication and company boundary are enforced',async function(){setup();db.seed('integrations/quickbooks',{realmId:'123'});var hook=require('../api/logic-webhook'),Readable=require('stream').Readable,crypto=require('crypto'),oldSecret=process.env.QBO_WEBHOOK_VERIFIER_TOKEN;process.env.QBO_WEBHOOK_VERIFIER_TOKEN='fixture-verifier';
  function req(realm,tamper){var raw=Buffer.from(JSON.stringify({eventNotifications:[{realmId:realm,dataChangeEvent:{entities:[{name:'Payment',id:'p1'}]}}]}));var sig=crypto.createHmac('sha256','fixture-verifier').update(raw).digest('base64');var r=Readable.from([tamper?Buffer.from('{}'):raw]);r.method='POST';r.headers={'intuit-signature':sig};return r;}
  try{await hook(req('123'));await hook(req('123'));assert.equal(Array.from(db.data.keys()).filter(function(k){return k.startsWith('integrations/quickbooks/events/');}).length,1);assert.equal((await hook(req('other'))).ignored,true);await assert.rejects(hook(req('123',true)),/Invalid Intuit signature/);}finally{if(oldSecret===undefined)delete process.env.QBO_WEBHOOK_VERIFIER_TOKEN;else process.env.QBO_WEBHOOK_VERIFIER_TOKEN=oldSecret;}
});
await check('QuickBooks write contract pins realm, sends request IDs and separates added fee exactly',async function(){setup();await W.price('one',1000,owner,true);var o=db.data.get('orders/one'),q=require('../api/_lib/qbo'),savedFetch=global.fetch,captured=[];q.API_BASE='https://fixture.invalid';q.accessToken=async function(){return {token:'fixture',realmId:'123'};};delete require.cache[require.resolve('../api/_lib/qbo-sales')];var real=require('../api/_lib/qbo-sales');
  global.fetch=async function(url,options){assert(url.startsWith('https://fixture.invalid/'));captured.push({url:url,body:options.body&&JSON.parse(options.body)});return {ok:true,status:200,json:async function(){return url.includes('/query')?{QueryResponse:{Customer:[{Id:'C'}]}}:{Invoice:{Id:'I'}};}};};
  try{await real.invoice(o,'deposit');var call=captured.find(function(c){return c.body&&c.body.Line;});assert(call.url.includes('requestid='));assert.equal(call.body.Line.length,2);assert.equal(P.cents(call.body.Line[0].Amount)+P.cents(call.body.Line[1].Amount),o.logic.commercial.depositCents);assert(call.body.Line[1].Description.includes('processing fee'));await assert.rejects(real.request('invoice/1',null,null,'wrong'),/company does not match/);}finally{global.fetch=savedFetch;}
});
console.log('\n'+count+' Omega Logic workflow tests passed. No network calls.');
}
main().catch(function(e){console.error(e);process.exitCode=1;});
