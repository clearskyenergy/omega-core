/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), P = require('./_lib/logic-policy');
var R = require('./_lib/plant-release'), Plant = require('./_lib/plant'), S = require('./_lib/plant-station');
var Flow=require('./_lib/plant-flow'),W=require('./_lib/plant-work'),Stats=require('./_lib/plant-stats'),Board=require('./_lib/plant-board'),Ops=require('./_lib/plant-ops'),Attention=require('./_lib/plant-attention');
var UNIT_FIELDS=['woId','serial','sku','unitType','shipUnit','at','done','arrivedAt','hold','holdAt','holdBy','holdReleasedAt','holdReleasedBy','holdDisposition','ncr','test'];
/* The CMMS-style board: newest 100 works orders with progress derived from
   their units. Units are read in works-order chunks with a field projection;
   the numbers are computed by plant-board.js, never in the browser, so the
   percentage the office quotes has one source. */
async function boardRows(db,org,now){
  var snap=await db.collection('plant_works_orders').where('orgId','==',org).orderBy('createdAt','desc').limit(100).get();
  var works=snap.docs.map(function(d){return Object.assign({id:d.id},d.data());}),ids=works.map(function(w){return w.id;}),unitsByWo={},unitsLimited=false;
  for(var i=0;i<ids.length;i+=10){
    var q=db.collection('plant_units').where('orgId','==',org).where('woId','in',ids.slice(i,i+10));q=q.select.apply(q,UNIT_FIELDS);
    var chunk=await q.limit(Board.UNIT_CAP).get();
    if(chunk.size===Board.UNIT_CAP)unitsLimited=true;
    chunk.docs.forEach(function(d){var u=d.data();(unitsByWo[u.woId]=unitsByWo[u.woId]||[]).push(u);});
  }
  return {rows:works.map(function(w){return Board.row(w,unitsByWo[w.id]||[],now);}),limited:snap.size===100,unitsLimited:unitsLimited};
}
function plantLinks(org){var q='?org='+encodeURIComponent(org);return {office:'/omega-logic'+q,factory:'/plant/'+q,manager:'/plant/manager'+q,board:'/plant/work-orders'+q,logistics:'/logic-logistics'+q};}
/* May this person place and release holds, record a test result by hand and
   correct a serial? The rule every Omega Logic write runs (logic-access
   authorize(write)): an active owner or admin of the workspace, or
   ClearSky's owner. Pages show those controls only when this says so and
   otherwise name who can; the endpoints decide for themselves. */
function correctable(u){return R.correctable(u).ok;}
async function controls(db,caller,org,ctx){
  if(X.owner(caller))return true;
  if(caller.staff||!caller.uid)return false;
  /* authorize() may already carry the caller's membership (ctx.member) */
  var d=ctx&&ctx.member?ctx.member:null;
  if(!d){var m=await db.collection('omega_orgs').doc(org).collection('members').doc(String(caller.uid)).get();d=m.exists?m.data()||{}:{};}
  return d.status!=='disabled'&&['owner','admin'].indexOf(d.role)>=0;
}
/* Finished units by product, from the inventoryStatus index rather than
   the first page of documents: every shipping unit is building, allocated
   (on an order, shipped or not) or available (built for stock and on the
   shelf). Each state is read to STOCK_CAP, SHIPPING UNITS ONLY (F2): a
   component is registered 'allocated' or 'building' and never leaves it, so
   an unfiltered read filled the cap with modules and undercounted the
   cabinets without saying so. A state read to the cap is `limited`, and the
   page then says "at least" for every count in that state. */
var STOCK_CAP=1000,STOCK_FIELDS=['serial','sku','unitType','shipUnit','at','hold','orderId','orderNo','inventoryStatus','test','createdAt'];
async function stockPage(db,org){
  var states=['available','allocated','building'],snaps=await Promise.all(states.map(function(k){var q=db.collection('plant_units').where('orgId','==',org).where('inventoryStatus','==',k).where('shipUnit','==',true);q=q.select.apply(q,STOCK_FIELDS);return q.limit(STOCK_CAP).get();}));
  var units=[],limited={};snaps.forEach(function(sn,i){limited[states[i]]=sn.size===STOCK_CAP;sn.docs.forEach(function(d){units.push(d.data());});});
  var fin=Ops.finished(units);
  return {skus:fin.skus,available:fin.available,totals:fin.totals,limited:limited,cap:STOCK_CAP};
}
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  var caller = await A.authenticate(req), b = req.body || {}, org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
  var ctx = await X.authorize(caller, org, req.method !== 'GET'), db = A.db();
  var flow=Flow.current(ctx.config), configRef=db.collection('omega_orgs').doc(org).collection('fulfillment').doc('config');
  if (req.method === 'GET') {
    if(req.query.map){
      /* The plant as a map (api/_lib/plant-stats.js): the newest units,
         the routing, and the steps each station carries off the product
         list. Numbers are what the benches reported; nothing is invented. */
      var mapRows=await Promise.all([
        db.collection('plant_units').where('orgId','==',org).orderBy('createdAt','desc').limit(Stats.MAX_UNITS).get(),
        db.collection('omega_orgs').doc(org).collection('storefront').doc('config').get()]);
      var mapUnits=mapRows[0].docs.map(function(d){return d.data();}),products=mapRows[1].exists?(mapRows[1].data().products||[]):[];
      var map=Stats.stationMap(flow.routing,mapUnits,Date.now(),{shipUnitsOnly:true});
      map.steps=Stats.stepsByStation(flow.routing,products,W.stepsFor);
      map.lines=flow.lines;map.sampledLimit=mapRows[0].size===Stats.MAX_UNITS;
      return {name:ctx.org.name||org,owner:X.owner(caller),brand:require('./_lib/logic-brand')(ctx.org),map:map};
    }
    if(req.query.page==='attention'){
      /* What needs a person now (plant-attention.js): the newest 500 units
         and every station, judged against thresholds the caller may set. */
      var attRows=await Promise.all([
        db.collection('plant_units').where('orgId','==',org).orderBy('createdAt','desc').select('serial','sku','unitType','shipUnit','woId','orderNo','at','arrivedAt','startedAt','hold','holdAt','holdBy','ncr','test','testFailedAt','updatedAt','inventoryStatus').limit(500).get(),
        db.collection('plant_stations').where('orgId','==',org).orderBy('__name__').limit(100).get()]);
      var attUnits=attRows[0].docs.map(function(d){return d.data();}),attStations=attRows[1].docs.map(function(d){return Flow.stationView(d.data(),d.id);});
      var att=Attention.attention(attUnits,attStations,flow.routing,new Date().toISOString(),{stuckHours:Number(req.query.stuckHours)||undefined,silentHours:Number(req.query.silentHours)||undefined});
      return Object.assign(att,{name:ctx.org.name||org,owner:X.owner(caller),brand:require('./_lib/logic-brand')(ctx.org),sampled:attUnits.length,sampledLimit:attRows[0].size===500,links:plantLinks(org)});
    }
    if(req.query.page==='board'||req.query.page==='ops'){
      var now=new Date().toISOString(),board=await boardRows(db,org,now),common={name:ctx.org.name||org,owner:X.owner(caller),canControl:await controls(db,caller,org,ctx),flow:flow,brand:require('./_lib/logic-brand')(ctx.org),asOf:now,
        rows:board.rows,limited:board.limited,unitsLimited:board.unitsLimited,links:plantLinks(org)};
      if(req.query.page==='board')return common;
      /* Operations: finished stock and the last 1,000 ledger events, rolled up
         by plant-ops.js into throughput, queues, build demand and completion. */
      var stockSnap=await db.collection('plant_units').where('orgId','==',org).where('inventoryStatus','==','available').select('serial','sku','at','hold','shipUnit').limit(1000).get();
      var scanSnap=await db.collection('plant_scans').where('orgId','==',org).orderBy('createdAt','desc').select('at','ok','verdict','stationId','station','machine','test','control','createdAt').limit(1000).get();
      var scans=scanSnap.docs.map(function(d){return d.data();}),stockUnits=stockSnap.docs.map(function(d){return d.data();});
      return Object.assign(common,{floor:Ops.floor(scans,now,14),queues:Ops.queues(board.rows),demand:Ops.demand(board.rows),stock:Ops.stock(stockUnits),completed:Ops.completed(board.rows),
        scansLimited:scanSnap.size===1000,stockLimited:stockSnap.size===1000});
    }
    if(req.query.page==='stock'){
      /* the Plant app's Stock and the office app's "assign to an order":
         counted by state, not from the first 100 documents by id */
      return Object.assign({name:ctx.org.name||org,brand:require('./_lib/logic-brand')(ctx.org),asOf:new Date().toISOString()},await stockPage(db,org));
    }
    if(req.query.page){
      var collections={works:'plant_works_orders',units:'plant_units',stations:'plant_stations'},collection=collections[req.query.page];
      if(!collection)throw A.httpError(400,'Unknown plant page');
      var query=db.collection(collection).where('orgId','==',org).orderBy('__name__');
      if(req.query.after){var cursor=await db.collection(collection).doc(P.id(req.query.after)).get();if(!cursor.exists||cursor.data().orgId!==org)throw A.httpError(400,'Invalid page cursor');query=query.startAfter(cursor);}
      var page=await query.limit(100).get();
      return {rows:page.docs.map(function(d){return req.query.page==='stations'?Flow.stationView(d.data(),d.id):Object.assign({id:d.id},d.data());}),next:page.size===100?page.docs[99].id:null};
    }
    if(req.query.workOrder){
      var wr=db.collection('plant_works_orders').doc(P.id(req.query.workOrder)),ws=await wr.get();
      if(!ws.exists||ws.data().orgId!==org)throw A.httpError(404,'Work order not found');
      var members=await db.collection('plant_units').where('orgId','==',org).where('woId','==',ws.id).limit(401).get();
      /* Where each unit is AND how far through that bench it is: the steps
         come off the product's bill (plant-work.js), so one catalog read. */
      var cat=await db.collection('omega_orgs').doc(org).collection('storefront').doc('config').get(),by={};
      (cat.exists?cat.data().products||[]:[]).forEach(function(p){if(p&&p.sku&&['__proto__','constructor','prototype'].indexOf(String(p.sku))<0)by[p.sku]=p;});
      var wo=ws.data();
      var detailUnits=members.docs.slice(0,400).map(function(d){var u=d.data();if(u.at){var st=(wo.routing||[]).filter(function(s){return s&&s.key===u.at;})[0];var steps=W.stepsFor(by[u.sku]||null,u.at,by,st&&st.checks);if(steps.length){var w=W.statusOf(u,u.at,steps);u.progress={station:u.at,done:w.steps.length-w.open.length,total:w.steps.length,open:w.open.slice(0,6),complete:w.complete};}}return u;});
      var detailWo=Object.assign({id:ws.id},wo);
      return {workOrder:detailWo,units:detailUnits,limited:members.size>400,board:Board.row(detailWo,detailUnits),activity:Board.activity(detailUnits,detailWo,60),canControl:await controls(db,caller,org,ctx),lines:flow.lines};
    }
    if (req.query.serial) {
      var serial = Plant.serialFrom(req.query.serial);
      if (!serial) throw A.httpError(400, 'Invalid serial');
      var row = await db.collection('plant_units').doc(org + '__' + serial).get();
      if (!row.exists) throw A.httpError(404, 'Serial not found');
      var u = row.data(), family = await db.collection('plant_units').where('orgId', '==', org).where('rootSerial', '==', u.rootSerial || u.serial).limit(401).get();
      var events = await db.collection('plant_scans').where('orgId', '==', org).where('serial', '==', serial).orderBy('createdAt', 'desc').limit(100).get();
      /* the routing this unit is judged on, so a page can offer a hand-recorded
         result only at a test station and name the benches in words */
      var unitWo=u.woId?await db.collection('plant_works_orders').doc(String(u.woId)).get():null,unitRouting=Plant.routingOf(unitWo&&unitWo.exists&&unitWo.data().orgId===org?unitWo.data():null);
      return { unit: u, genealogy: family.docs.map(function (d) { return d.data(); }).filter(function (g) { return g.inventoryStatus !== 'void' || g.serial === serial; }), events: events.docs.map(function (d) { return d.data(); }), eventsLimited: events.size === 100, genealogyLimited: family.size > 400,
        routing: unitRouting.map(function (s) { return { key: s.key, label: s.label, machine: Plant.MACHINE_STATIONS.indexOf(s.key) >= 0 }; }),
        canControl: await controls(db, caller, org, ctx), correctable: correctable(u) };
    }
    var rows = await Promise.all([
      db.collection('plant_works_orders').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(100).get(),
      db.collection('plant_units').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(100).get()
    ]);
    return { name: ctx.org.name || org, owner:X.owner(caller),canControl:await controls(db,caller,org,ctx),flow:flow,brand: require('./_lib/logic-brand')(ctx.org), worksOrders: rows[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }),
      units: rows[1].docs.map(function (d) { return d.data(); }), limited: rows.some(function (s) { return s.size === 100; }) };
  }
  if (req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  if(b.action==='services-complete'){
    var serviceRef=db.collection('plant_works_orders').doc(P.id(b.workOrderId)),evidence=Flow.clean(b.evidence,3000);if(evidence.length<10)throw A.httpError(400,'Describe the service completion evidence (at least 10 characters)');
    return db.runTransaction(async function(tx){var snap=await tx.get(serviceRef),w=snap.exists?snap.data():null;if(!w||w.orgId!==org)throw A.httpError(404,'Work order not found');if(!(w.serviceRequirements||[]).length)throw A.httpError(409,'No services on this work order');if(w.serviceCompletion)return {ok:true,duplicate:true};var order=await tx.get(db.collection('orders').doc(w.orderId));if(!order.exists||order.data().cancelRequested||(order.data().logic||{}).paymentException)throw A.httpError(409,'Order is on hold');var completion={by:caller.email,at:new Date().toISOString(),evidence:evidence};tx.update(serviceRef,{serviceCompletion:completion});tx.create(db.collection('omega_audit').doc(),{orgId:org,action:'plant-service-completion',workOrderId:snap.id,after:completion,by:caller.email,at:completion.at});return {ok:true};});
  }
  if(b.action==='flow'){
    X.requireOwner(caller);var proposed=Flow.normalize(b.flow);
    return db.runTransaction(async function(tx){var old=await tx.get(configRef),prior=Flow.current(old.exists?old.data():{});
      if(b.version!==prior.version)throw A.httpError(409,'Flow changed. Reload before publishing.');
      proposed.version=prior.version+1;proposed.updatedBy=caller.email;proposed.updatedAt=new Date().toISOString();
      tx.set(configRef,{production:proposed},{merge:true});
      tx.create(db.collection('omega_audit').doc(),{orgId:org,action:'plant-flow',before:prior,after:proposed,by:caller.email,at:proposed.updatedAt});
      return {ok:true,flow:proposed};});
  }
  if(b.action==='work-order'){
    var editRef=db.collection('plant_works_orders').doc(P.id(b.workOrderId));
    if(!flow.lines.some(function(l){return l.id===b.lineId;}))throw A.httpError(400,'Choose a configured line');
    if(['normal','urgent','low'].indexOf(b.priority)<0)throw A.httpError(400,'Invalid priority');
    var date=String(b.dueDate||'');if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw A.httpError(400,'Use a valid YYYY-MM-DD date');
    return db.runTransaction(async function(tx){var old=await tx.get(editRef);if(!old.exists||old.data().orgId!==org)throw A.httpError(404,'Work order not found');var w=old.data();
      if((w.managerRevision||0)!==b.revision)throw A.httpError(409,'Work order changed. Reload first.');
      var changes={lineId:b.lineId,priority:b.priority,dueDate:date,assignee:Flow.clean(b.assignee,120),managerNotes:Flow.clean(b.notes,3000),managerRevision:(w.managerRevision||0)+1,updatedBy:caller.email,updatedAt:A.FieldValue().serverTimestamp()};
      tx.update(editRef,changes);tx.create(db.collection('omega_audit').doc(),{orgId:org,action:'plant-work-order',workOrderId:old.id,by:caller.email,before:{lineId:w.lineId||'',priority:w.priority||'normal',dueDate:w.dueDate||'',assignee:w.assignee||'',notes:w.managerNotes||''},after:changes,at:new Date().toISOString()});return {ok:true};});
  }
  if(b.action==='station-edit'){
    var stationRef=db.collection('plant_stations').doc(P.id(b.stationId));
    if(!flow.lines.some(function(l){return l.id===b.lineId;}))throw A.httpError(400,'Choose a configured line');
    return db.runTransaction(async function(tx){var old=await tx.get(stationRef);if(!old.exists||old.data().orgId!==org)throw A.httpError(404,'Station not found');var st=old.data();
      if((st.revision||0)!==b.revision)throw A.httpError(409,'Station changed. Reload first.');
      var patch={label:Flow.clean(b.label,100)||st.station,lineId:b.lineId,location:Flow.clean(b.location,160),instructions:Flow.clean(b.instructions,2000),active:b.active===true,revision:(st.revision||0)+1};
      tx.update(stationRef,patch);tx.create(db.collection('omega_audit').doc(),{orgId:org,action:'plant-station',stationId:old.id,by:caller.email,before:Flow.stationView(st,old.id),after:patch,at:new Date().toISOString()});return {ok:true};});
  }
  if (b.action === 'station') {
    /* '*' pairs a ROAMING device — the operator's phone, which goes to the
       bench with them and names the bench on each scan (api/mes-scan.js).
       Two people building cabinets do not have a tablet bolted to every
       bench; they have a phone in a pocket. The routing rules are the same
       and every scan records both the phone and the bench it claimed. */
    var roaming = b.station === '*';
    if (!roaming && Plant.indexOf(flow.routing, b.station) < 0) throw A.httpError(400, 'Unknown station');
    var lineId=b.lineId||flow.lines[0].id;if(!flow.lines.some(function(l){return l.id===lineId;}))throw A.httpError(400,'Unknown line');
    var crypto = require('crypto'), token = crypto.randomBytes(32).toString('hex'), ref = db.collection('plant_stations').doc();
    await ref.create({ orgId: org, station: roaming ? '*' : b.station, roaming: roaming, label: String(b.label || (roaming ? 'Roaming phone' : b.station)).slice(0, 100),
      lineId:lineId,location:Flow.clean(b.location,160),instructions:Flow.clean(b.instructions,2000),revision:0,
      tokenHash: S.sha(token), machine: !roaming && Plant.MACHINE_STATIONS.indexOf(b.station) >= 0, active: true,
      createdBy: caller.email, createdAt: A.FieldValue().serverTimestamp() });
    return { stationId: ref.id, token: token, machine: Plant.MACHINE_STATIONS.indexOf(b.station) >= 0 };
  }
  if(b.action==='allocate'){
    /* A finished unit on the shelf, assigned by a person to an order that
       is short of it. logic-workflow.js release() does the same
       automatically at deposit time from whatever it can see; this is the
       office choosing a specific serial afterwards — a unit came off the
       line for stock, or a rush order arrived. The whole assembly moves
       (every serial under the same root), the works order builds one
       fewer, and both records say who did it. */
    var serial=Plant.serialFrom(b.serial);if(!serial)throw A.httpError(400,'Invalid serial');
    var orderRef=db.collection('orders').doc(P.id(b.orderId)),unitRef=db.collection('plant_units').doc(org+'__'+serial);
    return db.runTransaction(async function(tx){
      var us=await tx.get(unitRef),os=await tx.get(orderRef);
      if(!us.exists||us.data().orgId!==org)throw A.httpError(404,'Unit not found');
      var u=us.data();
      if(!u.shipUnit)throw A.httpError(400,'Only a shipping unit can be assigned; its components travel with it');
      if(u.orderId)throw A.httpError(409,'This unit is already assigned to '+(u.orderNo||'an order'));
      if(u.at!=='ready'||u.hold)throw A.httpError(409,'Only a finished unit with no hold can be assigned');
      if(u.inventoryStatus!=='available')throw A.httpError(409,'This unit is not on the shelf as available stock');
      if(!os.exists||os.data().orgId!==org)throw A.httpError(404,'Order not found');
      var o=os.data();
      if(o.cancelRequested||(o.logic||{}).paymentException)throw A.httpError(409,'Order is on hold');
      if(!o.worksOrderId||o.status!=='in_fulfilment')throw A.httpError(409,'The order must be accepted, paid and released to the plant before a unit is assigned');
      var woRef=db.collection('plant_works_orders').doc(o.worksOrderId),ws=await tx.get(woRef);
      if(!ws.exists||ws.data().orgId!==org)throw A.httpError(404,'Works order not found');
      var w=ws.data(),req=(w.requirements||[]).map(function(r){return {sku:String(r.sku),qty:Number(r.qty)||0};}),line=req.filter(function(r){return r.sku===u.sku;})[0];
      var started=Number((w.registeredCounts||{})[u.sku])||0;
      if(!line||line.qty-started<=0)throw A.httpError(409,'This order does not need another '+u.sku+(line?' — the plant has already started the rest':''));
      var famAll=await tx.get(db.collection('plant_units').where('orgId','==',org).where('rootSerial','==',u.rootSerial||u.serial).limit(201));
      if(famAll.size>200)throw A.httpError(409,'This assembly has too many components to assign in one step');
      /* a voided serial (a typo the plant corrected) is never part of what moves */
      var fam={docs:famAll.docs.filter(function(d){return d.data().inventoryStatus!=='void';})};fam.size=fam.docs.length;
      fam.docs.forEach(function(d){var c=d.data();if(c.orderId&&c.serial!==serial)throw A.httpError(409,'Component '+c.serial+' of this unit is already assigned to '+(c.orderNo||'an order'));});
      var now=new Date().toISOString(),patch={orderId:orderRef.id,orderNo:o.orderNo||null,woId:woRef.id,inventoryStatus:'allocated',sourceWoId:u.woId||null,allocatedAt:now,allocatedBy:caller.email,updatedAt:A.FieldValue().serverTimestamp()};
      var seen={};fam.docs.forEach(function(d){seen[d.id]=true;tx.update(d.ref,patch);});if(!seen[unitRef.id])tx.update(unitRef,patch);
      line.qty-=1;
      var status=w.status;if(status==='awaiting_serials'&&!req.some(function(r){return r.qty>0;}))status=(w.serviceRequirements||[]).length&&!w.serviceCompletion?'awaiting_services':'ready';
      var allocated=(w.allocatedSerials||[]).concat([serial]);
      tx.update(woRef,{requirements:req,allocatedSerials:allocated,status:status,shippingUnitCount:(w.shippingUnitCount||0)+1,releasedUnits:(w.releasedUnits||0)+Math.max(1,fam.size),updatedAt:A.FieldValue().serverTimestamp()});
      tx.update(orderRef,{'logic.allocatedSerials':((o.logic||{}).allocatedSerials||[]).concat([serial]),'logic.requirements':req,updatedAt:A.FieldValue().serverTimestamp()});
      tx.create(orderRef.collection('events').doc(),{at:now,by:caller.email,what:'Finished unit '+serial+' assigned from stock by the office'});
      tx.create(db.collection('omega_audit').doc(),{orgId:org,action:'plant-allocate',serial:serial,orderId:orderRef.id,workOrderId:woRef.id,by:caller.email,at:now,after:{requirements:req,status:status}});
      return {ok:true,serial:serial,orderNo:o.orderNo||null,stillToBuild:Math.max(0,line.qty-started),workOrderStatus:status};
    });
  }
  if(b.action==='correct-serial'){
    /* PLANT-12: a serial typed wrong at registration frees its slot (void) or
       hands it to the right serial (correct), before anything on the floor
       has seen it (plant-release.js correctable). The mistyped record stays,
       marked void, so the audit trail can show it; nothing is deleted. */
    var bad=Plant.serialFrom(b.serial);if(!bad)throw A.httpError(400,'Invalid serial');
    var fix=b.replacement?Plant.serialFrom(b.replacement):'';
    if(b.replacement&&!fix)throw A.httpError(400,'The corrected serial is unreadable');
    if(fix===bad)throw A.httpError(400,'The corrected serial is the same as the one being voided');
    var why=Flow.clean(b.reason,500);if(why.length<5)throw A.httpError(400,'Say why (at least 5 characters), e.g. "two labels scanned into one"');
    var cid=P.id(b.requestId),badRef=db.collection('plant_units').doc(org+'__'+bad),fixRef=fix?db.collection('plant_units').doc(org+'__'+fix):null,evRef=db.collection('plant_scans').doc(org+'__correct_'+cid);
    return db.runTransaction(async function(tx){
      var ev=await tx.get(evRef);
      if(ev.exists){var e0=ev.data()||{};if(e0.serial!==bad||((e0.correction||{}).replacement||'')!==fix)throw A.httpError(409,'Request ID already used for a different correction');return {ok:true,duplicate:true,serial:bad,replacement:fix||null};}
      var us=await tx.get(badRef);if(!us.exists||us.data().orgId!==org)throw A.httpError(404,'Serial not found');
      var u=us.data(),can=R.correctable(u);if(!can.ok)throw A.httpError(409,can.why);
      var kids=await tx.get(db.collection('plant_units').where('orgId','==',org).where('parentSerial','==',bad).limit(201));
      if(kids.size>200)throw A.httpError(409,'This assembly has too many components to correct in one step');
      if(!fix&&kids.size)throw A.httpError(409,kids.size+' component'+(kids.size===1?' is':'s are')+' registered under '+bad+'. Correct it to the right serial (they move with it), or void them first.');
      var fam=fix&&!u.parentSerial?await tx.get(db.collection('plant_units').where('orgId','==',org).where('rootSerial','==',bad).limit(401)):null;
      if(fam&&fam.size>400)throw A.httpError(409,'This assembly has too many components to correct in one step');
      var taken=fixRef?await tx.get(fixRef):null;if(taken&&taken.exists)throw A.httpError(409,'Serial '+fix+' is already registered; nothing was changed');
      var woRef=u.woId?db.collection('plant_works_orders').doc(String(u.woId)):null,ws=woRef?await tx.get(woRef):null,wo=ws&&ws.exists&&ws.data().orgId===org?ws.data():null;
      var now=new Date().toISOString(),by=String(caller.email||'').toLowerCase(),FV=A.FieldValue();
      if(fixRef){
        /* the right serial takes the slot: same product, same place in the
           assembly, same trace; it has done nothing yet either */
        tx.create(fixRef,{orgId:org,woId:u.woId||null,orderId:u.orderId||null,orderNo:u.orderNo||null,serial:fix,sku:u.sku||null,unitType:u.unitType||null,
          parentSerial:u.parentSerial||null,shipUnit:u.shipUnit===true,trace:u.trace||null,rootSerial:u.parentSerial?(u.rootSerial||null):fix,
          inventoryStatus:u.inventoryStatus||'building',at:'',done:{},hold:null,ncr:null,test:null,correctedFrom:bad,
          createdAt:u.createdAt||FV.serverTimestamp(),updatedAt:FV.serverTimestamp()});
        var moved={};
        kids.docs.forEach(function(d){moved[d.id]=true;tx.update(d.ref,{parentSerial:fix,rootSerial:u.parentSerial?(d.data().rootSerial||null):fix,updatedAt:FV.serverTimestamp()});});
        if(fam)fam.docs.forEach(function(d){if(moved[d.id]||d.id===badRef.id)return;tx.update(d.ref,{rootSerial:fix,updatedAt:FV.serverTimestamp()});});
      }
      /* F1: the voided record leaves its assembly. Every family reader asks
         for rootSerial == the cabinet's serial, so a void component that
         kept its rootSerial would stay in the family: pickup refused for
         ever (it is not Ready), stock allocation skipping the cabinet, and
         `allocate` stamping the order onto it. It becomes its own root with
         no parent; where it sat is kept under voided{} for the audit. */
      tx.update(badRef,{voided:{at:now,by:by,reason:why,replacedBy:fix||null,woId:u.woId||null,rootSerial:u.rootSerial||null,parentSerial:u.parentSerial||null},inventoryStatus:'void',rootSerial:bad,parentSerial:null,woId:null,orderId:null,orderNo:null,updatedAt:FV.serverTimestamp()});
      var woAfter=null;
      if(wo&&!fix){
        /* voided, not replaced: the slot is free for the right serial */
        var counts=Object.assign({},wo.registeredCounts||{});
        if(u.shipUnit&&u.sku)counts[u.sku]=Math.max(0,(Number(counts[u.sku])||0)-1);
        woAfter={registeredCounts:counts,releasedUnits:Math.max(0,(Number(wo.releasedUnits)||0)-1),shippingUnitCount:Math.max(0,(Number(wo.shippingUnitCount)||0)-(u.shipUnit?1:0)),updatedAt:FV.serverTimestamp()};
        tx.update(woRef,woAfter);
      }
      var say=fix?'Serial '+bad+' corrected to '+fix:'Serial '+bad+' voided; its slot is free';
      tx.set(evRef,{orgId:org,scanId:'correct_'+cid,serial:bad,woId:u.woId||null,correction:{action:fix?'correct':'void',replacement:fix||null,reason:why,by:by,at:now},
        verdict:{ok:true,action:fix?'correct':'void',say:say},ok:true,at:now,createdAt:FV.serverTimestamp()});
      tx.create(db.collection('omega_audit').doc(),{orgId:org,action:'plant-serial-'+(fix?'correct':'void'),serial:bad,replacement:fix||null,workOrderId:u.woId||null,reason:why,by:by,at:now,
        before:{serial:bad,sku:u.sku||null,unitType:u.unitType||null,parentSerial:u.parentSerial||null,shipUnit:u.shipUnit===true,inventoryStatus:u.inventoryStatus||null,registeredCounts:wo?wo.registeredCounts||{}:null},
        after:{components:kids.size,registeredCounts:woAfter?woAfter.registeredCounts:(wo?wo.registeredCounts||{}:null)}});
      return {ok:true,serial:bad,replacement:fix||null,components:kids.size,say:say};
    });
  }
  if (b.action !== 'register' && b.action !== 'stock') throw A.httpError(400, 'Unknown action');
  var requestId = P.id(b.requestId), woId = b.action === 'stock' ? 'stock_' + P.key(org + ':' + requestId) : P.id(b.workOrderId);
  var woRef = db.collection('plant_works_orders').doc(woId), receiptRef = woRef.collection('registrations').doc(requestId);
  return db.runTransaction(async function (tx) {
    var old = await tx.get(woRef), receipt = await tx.get(receiptRef);
    var liveConfig=await tx.get(configRef),releaseFlow=Flow.current(liveConfig.exists?liveConfig.data():{});
    var digest = P.key(JSON.stringify(b.units));
    if (receipt.exists) {
      if (receipt.data().digest !== digest) throw A.httpError(409, 'Registration ID was already used for different units');
      return { ok: true, duplicate: true, workOrderId: woId };
    }
    var wo = old.exists ? old.data() : null;
    if (b.action === 'register' && (!wo || wo.orgId !== org)) throw A.httpError(404, 'Works order not found');
    if (wo && wo.orgId !== org) throw A.httpError(403, 'Wrong plant');
    if (wo && wo.orderId) {
      var order = await tx.get(db.collection('orders').doc(wo.orderId));
      if (!order.exists || order.data().cancelRequested || (order.data().logic || {}).paymentException) throw A.httpError(409, 'Order is on hold');
    }
    var requested = b.action === 'stock' ? (b.units || []).filter(function (u) { return u.shipUnit === true; }).map(function (u) { return { sku: u.sku, qty: 1 }; }) : wo.requirements;
    var counts = Object.assign({}, wo && wo.registeredCounts || {}), remaining = P.quantities(requested);
    Object.keys(counts).forEach(function (sku) { remaining[sku] = Math.max(0, (remaining[sku] || 0) - counts[sku]); });
    var units = R.normalizeUnits(b.units, { items: Object.keys(remaining).map(function (sku) { return { sku: sku, qty: remaining[sku] }; }) });
    units.forEach(function (u) { if (!u.parentSerial && !u.shipUnit) throw A.httpError(400, 'Each component must belong to a shipping assembly'); });
    var refs = units.map(function (u) { return db.collection('plant_units').doc(org + '__' + u.serial); });
    var previous = await Promise.all(refs.map(function (r) { return tx.get(r); }));
    if (previous.some(function (s) { return s.exists; })) throw A.httpError(409, 'A serial is already registered; no units were changed');
    units.forEach(function (u, i) {
      if (u.shipUnit) counts[u.sku] = (counts[u.sku] || 0) + 1;
      tx.create(refs[i], Object.assign({}, u, { orgId: org, woId: woId, orderId: wo && wo.orderId || null,
        orderNo: wo && wo.orderNo || null, rootSerial: P.rootSerial(u, units), inventoryStatus: wo && wo.orderId ? 'allocated' : 'building',
        at: '', done: {}, hold: null, ncr: null, test: null, createdAt: A.FieldValue().serverTimestamp(), updatedAt: A.FieldValue().serverTimestamp() }));
    });
    var patch = { registeredCounts: counts, status: 'released', releasedUnits: (wo && wo.releasedUnits || 0) + units.length,
      shippingUnitCount: (wo && wo.shippingUnitCount || 0) + units.filter(function (u) { return u.shipUnit; }).length };
    if (!old.exists) tx.create(woRef, Object.assign(patch, { orgId: org, orderId: null, orderNo: 'STOCK', requirements: requested,
      inventory: true, routing: releaseFlow.routing,flowVersion:releaseFlow.version,lineId:releaseFlow.lines[0].id, createdAt: A.FieldValue().serverTimestamp(), createdBy: caller.email }));
    else tx.update(woRef, patch);
    tx.create(receiptRef, { digest: digest, by: caller.email, count: units.length, at: new Date().toISOString() });
    return { ok: true, workOrderId: woId, registered: units.length };
  });
});
