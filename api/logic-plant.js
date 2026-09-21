/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), P = require('./_lib/logic-policy');
var R = require('./_lib/plant-release'), Plant = require('./_lib/plant'), S = require('./_lib/plant-station');
var Flow=require('./_lib/plant-flow');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  var caller = await A.authenticate(req), b = req.body || {}, org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
  var ctx = await X.authorize(caller, org, req.method !== 'GET'), db = A.db();
  var flow=Flow.current(ctx.config), configRef=db.collection('omega_orgs').doc(org).collection('fulfillment').doc('config');
  if (req.method === 'GET') {
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
      return {workOrder:Object.assign({id:ws.id},ws.data()),units:members.docs.slice(0,400).map(function(d){return d.data();}),limited:members.size>400};
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
      var changes={lineId:b.lineId,priority:b.priority,dueDate:date,managerNotes:Flow.clean(b.notes,3000),managerRevision:(w.managerRevision||0)+1,updatedBy:caller.email,updatedAt:A.FieldValue().serverTimestamp()};
      tx.update(editRef,changes);tx.create(db.collection('omega_audit').doc(),{orgId:org,action:'plant-work-order',workOrderId:old.id,by:caller.email,before:{lineId:w.lineId||'',priority:w.priority||'normal',dueDate:w.dueDate||'',notes:w.managerNotes||''},after:changes,at:new Date().toISOString()});return {ok:true};});
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
    if (Plant.indexOf(flow.routing, b.station) < 0) throw A.httpError(400, 'Unknown station');
    var lineId=b.lineId||flow.lines[0].id;if(!flow.lines.some(function(l){return l.id===lineId;}))throw A.httpError(400,'Unknown line');
    var crypto = require('crypto'), token = crypto.randomBytes(32).toString('hex'), ref = db.collection('plant_stations').doc();
    await ref.create({ orgId: org, station: b.station, label: String(b.label || b.station).slice(0, 100),
      lineId:lineId,location:Flow.clean(b.location,160),instructions:Flow.clean(b.instructions,2000),revision:0,
      tokenHash: S.sha(token), machine: Plant.MACHINE_STATIONS.indexOf(b.station) >= 0, active: true,
      createdBy: caller.email, createdAt: A.FieldValue().serverTimestamp() });
    return { stationId: ref.id, token: token, machine: Plant.MACHINE_STATIONS.indexOf(b.station) >= 0 };
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
