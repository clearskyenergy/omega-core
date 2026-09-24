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
        db.collection('plant_units').where('orgId','==',org).orderBy('createdAt','desc').select('serial','sku','unitType','shipUnit','woId','orderNo','at','arrivedAt','startedAt','hold','holdAt','holdBy','ncr','test','testFailedAt','updatedAt').limit(500).get(),
        db.collection('plant_stations').where('orgId','==',org).orderBy('__name__').limit(100).get()]);
      var attUnits=attRows[0].docs.map(function(d){return d.data();}),attStations=attRows[1].docs.map(function(d){return Flow.stationView(d.data(),d.id);});
      var att=Attention.attention(attUnits,attStations,flow.routing,new Date().toISOString(),{stuckHours:Number(req.query.stuckHours)||undefined,silentHours:Number(req.query.silentHours)||undefined});
      return Object.assign(att,{name:ctx.org.name||org,owner:X.owner(caller),brand:require('./_lib/logic-brand')(ctx.org),sampled:attUnits.length,sampledLimit:attRows[0].size===500,links:plantLinks(org)});
    }
    if(req.query.page==='board'||req.query.page==='ops'){
      var now=new Date().toISOString(),board=await boardRows(db,org,now),common={name:ctx.org.name||org,owner:X.owner(caller),flow:flow,brand:require('./_lib/logic-brand')(ctx.org),asOf:now,
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
      return {workOrder:detailWo,units:detailUnits,limited:members.size>400,board:Board.row(detailWo,detailUnits),activity:Board.activity(detailUnits,detailWo,60)};
    }
    if (req.query.serial) {
      var serial = Plant.serialFrom(req.query.serial);
      if (!serial) throw A.httpError(400, 'Invalid serial');
      var row = await db.collection('plant_units').doc(org + '__' + serial).get();
      if (!row.exists) throw A.httpError(404, 'Serial not found');
      var u = row.data(), family = await db.collection('plant_units').where('orgId', '==', org).where('rootSerial', '==', u.rootSerial || u.serial).limit(401).get();
      var events = await db.collection('plant_scans').where('orgId', '==', org).where('serial', '==', serial).orderBy('createdAt', 'desc').limit(100).get();
      return { unit: u, genealogy: family.docs.map(function (d) { return d.data(); }), events: events.docs.map(function (d) { return d.data(); }), eventsLimited: events.size === 100, genealogyLimited: family.size > 400 };
    }
    var rows = await Promise.all([
      db.collection('plant_works_orders').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(100).get(),
      db.collection('plant_units').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(100).get()
    ]);
    return { name: ctx.org.name || org, owner:X.owner(caller),flow:flow,brand: require('./_lib/logic-brand')(ctx.org), worksOrders: rows[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }),
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
      var fam=await tx.get(db.collection('plant_units').where('orgId','==',org).where('rootSerial','==',u.rootSerial||u.serial).limit(201));
      if(fam.size>200)throw A.httpError(409,'This assembly has too many components to assign in one step');
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
