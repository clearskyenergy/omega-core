/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The shipping ledger (orders/{id}.delivery), office only: an OEM owner or
   admin, or the ClearSky owner (logic-access.authorize write).
     GET  ?org=                        the orders with their destinations and loads
     GET  ?org=&freight=<orderId>      the order's FREIGHT PLAN (api/_lib/freight.js):
                                       master list, lanes, stops, quotes, and the
                                       two sheets as exports.{master,quote}.{filename,csv}
     POST plan · pickup · location · delivered · inspect   one load (leg)
     POST freight-origin   { origin }                       the ship-from, on
                           fulfillment/config.freight (merge of that key only)
          freight-quote    { orderId, laneKey, carrier, amount, currency?,
                             transitDays?, validUntil?, reference?, note?,
                             planKey, supersedes? }         a carrier's price
          freight-withdraw { orderId, quoteId, reason }
          freight-accept   { orderId, quoteId, revision, loadId?, bookingRef? }
                           plans one leg per stop through L.planLeg — the
                           same code the plan action runs — in one transaction
   Quotes live in omega_orgs/{org}/freight_quotes (Admin SDK only), never on
   the order a tenant member's browser may read; they are append-only: the
   commercial fields never change, only status moves (recorded → accepted,
   superseded or withdrawn) and every move is on trail[] and in omega_audit.
   A leg carries the carrier and booking reference (customers already see
   those) and freight{ quoteId, laneKey, loadId, stop, stops }, never an
   amount. */
'use strict';
var A=require('./_lib/admin'),X=require('./_lib/logic-access'),P=require('./_lib/logic-policy'),L=require('./_lib/order-lifecycle'),C=require('./_lib/custody');
var F=require('./_lib/freight'),SG=require('./_lib/site-geo');

/* ── the freight plan ─────────────────────────────────────────────────── */
var FREIGHT_ACTIONS=['freight-origin','freight-quote','freight-withdraw','freight-accept'];
var MAX_FREIGHT_UNITS=2000,MAX_FREIGHT_SITES=200,MAX_QUOTES=500,SITE_ID=/^[A-Za-z0-9_-]{1,120}$/;
function orgRoot(db,org){return db.collection('omega_orgs').doc(org);}
function quotesOf(db,org){return orgRoot(db,org).collection('freight_quotes');}
/* many documents in one transaction: one getAll where the SDK has it */
function readAll(tx,refs){if(!refs.length)return Promise.resolve([]);return typeof tx.getAll==='function'?tx.getAll.apply(tx,refs):Promise.all(refs.map(function(r){return tx.get(r);}));}
function audit(tx,db,org,by,now,row){tx.create(db.collection('omega_audit').doc(),Object.assign({orgId:org,by:by,at:now},row));}
async function freightOrder(db,org,orderId){
  if(!orderId)throw A.httpError(400,'Choose the order');
  var ref=db.collection('orders').doc(P.id(orderId)),s=await ref.get();
  if(!s.exists||s.data().orgId!==org)throw A.httpError(404,'Order not found');
  return {ref:ref,order:Object.assign({},s.data(),{id:s.id})};
}
/* everything F.plan reads, for one order: its shipping units, the sites
   they are going to (≤ 200), the catalog, the quotes, the plant's date */
async function freightInputs(db,org,ctx,o,now){
  var us=await db.collection('plant_units').where('orgId','==',org).where('orderId','==',o.id).limit(MAX_FREIGHT_UNITS+1).get();
  var all=us.docs.slice(0,MAX_FREIGHT_UNITS).map(function(d){return d.data();}),units=all.filter(function(u){return u&&u.shipUnit;});
  /* the serialized components on this order: pickup checks each with its unit (P.ready over the rootSerial family), so the plan does too */
  var components=all.filter(function(u){return u&&!u.shipUnit&&u.rootSerial;});
  var ids={};units.forEach(function(u){var s=F.siteOfUnit(u);if(s&&SITE_ID.test(s.siteId))ids[s.siteId]=true;});
  var siteIds=Object.keys(ids),read=siteIds.slice(0,MAX_FREIGHT_SITES),sites={};
  (await Promise.all(read.map(function(id){return orgRoot(db,org).collection('sites').doc(id).get();}))).forEach(function(s){if(s.exists)sites[s.id]=Object.assign({},s.data(),{id:s.id});});
  var cfg=await orgRoot(db,org).collection('storefront').doc('config').get(),products=cfg.exists?(cfg.data().products||[]):[];
  var qs=await quotesOf(db,org).where('orderId','==',o.id).limit(MAX_QUOTES).get();
  var quotes=qs.docs.map(function(d){return Object.assign({},d.data(),{id:d.id});}).filter(function(q){return q.orgId===org;});
  var promised=o.promisedShipAt||null;
  if(o.worksOrderId&&SITE_ID.test(String(o.worksOrderId))){var w=await db.collection('plant_works_orders').doc(String(o.worksOrderId)).get();if(w.exists&&w.data().orgId===org)promised=w.data().dueDate||w.data().promisedShipAt||promised;}
  return {order:o,units:units,components:components,sites:sites,products:products,origin:((ctx.config||{}).freight||{}).origin||null,quotes:quotes,promised:promised,now:now,
    limited:us.size>MAX_FREIGHT_UNITS,sitesLimited:siteIds.length>MAX_FREIGHT_SITES};
}
async function freightGet(db,org,ctx,c,orderId){
  var fo=await freightOrder(db,org,orderId),now=new Date().toISOString(),inp=await freightInputs(db,org,ctx,fo.order,now),pl=F.plan(inp);
  return Object.assign({brand:require('./_lib/logic-brand')(ctx.org),owner:X.owner(c),limited:inp.limited,sitesLimited:inp.sitesLimited},pl,{exports:F.exportsOf(pl,now)});
}
function reasonOf(v){
  var s=typeof v==='string'?v.trim():'';
  if(s.length<3||s.length>300||/[\u0000-\u001f\u007f]/.test(s))throw A.httpError(400,'Give a reason for withdrawing it (3–300 characters)');
  return s;
}
async function freightPost(db,org,ctx,c,b){
  var now=new Date().toISOString(),today=F.quoteDay(now),by=c.email;
  if(b.action==='freight-origin'){
    var existing=((ctx.config||{}).freight||{}).origin||null,origin=F.origin(b.origin,existing),geoLimited=false;
    /* one Census lookup when there is no pin, inside the office's daily
       allowance (api/_lib/site-geo.js); a miss or a spent allowance leaves
       the pin empty and is never a refusal */
    if(!F.hasPin(origin)){
      var rows=[{status:'new',address:origin.address}];
      try{var g=await SG.locate(db,org,rows,'office',null,now);geoLimited=!!g.geoLimited;if(rows[0].geo){origin.lat=rows[0].geo.lat;origin.lng=rows[0].geo.lng;}}catch(e){geoLimited=true;}
    }
    var cfgRef=orgRoot(db,org).collection('fulfillment').doc('config');
    return db.runTransaction(async function(tx){
      var s=await tx.get(cfgRef),before=s.exists?(((s.data()||{}).freight)||{}).origin||null:null;
      tx.set(cfgRef,{freight:{origin:origin,updatedAt:now,updatedBy:by}},{merge:true});
      audit(tx,db,org,by,now,{action:'freight-origin',before:before,after:origin});
      return {ok:true,origin:origin,geoLimited:geoLimited};
    });
  }
  var fo=await freightOrder(db,org,b.orderId),oid=fo.order.id;
  if(b.action==='freight-quote'){
    var inp=await freightInputs(db,org,ctx,fo.order,now),pl=F.plan(inp),key=F.laneKeyOf(b.laneKey),lane=pl.lanes.filter(function(l){return l.key===key;})[0];
    if(!lane)throw A.httpError(409,'That lane is not on this order any more. Reload the freight plan.');
    var doc=F.quoteInput(b,lane,{id:oid,orgId:org,orderNo:fo.order.orderNo},by,now),qref=quotesOf(db,org).doc();
    doc.orgId=org;
    return db.runTransaction(async function(tx){
      var os=await tx.get(fo.ref);if(!os.exists||os.data().orgId!==org)throw A.httpError(404,'Order not found');
      var old=null,od=null;
      if(doc.supersedes){
        old=await tx.get(quotesOf(db,org).doc(doc.supersedes));od=old.exists?old.data():null;
        if(!od||od.orgId!==org||od.orderId!==oid||od.laneKey!==key)throw A.httpError(404,'The quote this replaces is not on this lane');
        if(od.status!=='recorded')throw A.httpError(409,'Only a recorded quote can be replaced; that one is '+od.status);
      }
      tx.create(qref,doc);
      if(old)tx.update(old.ref,{status:'superseded',supersededBy:qref.id,trail:(od.trail||[]).concat([{at:now,by:by,status:'superseded',note:'Replaced by '+qref.id}])});
      audit(tx,db,org,by,now,{action:'freight-quote',orderId:oid,quoteId:qref.id,laneKey:key,carrier:doc.carrier,amountCents:doc.amountCents,units:doc.units,supersedes:doc.supersedes});
      return {ok:true,quote:F.quoteView(Object.assign({},doc,{id:qref.id}),lane,today)};
    });
  }
  if(b.action==='freight-withdraw'){
    var wid=P.id(b.quoteId),reason=reasonOf(b.reason),wref=quotesOf(db,org).doc(wid);
    return db.runTransaction(async function(tx){
      var s=await tx.get(wref),d=s.exists?s.data():null;
      if(!d||d.orgId!==org||d.orderId!==oid)throw A.httpError(404,'Quote not found');
      if(d.status==='accepted')throw A.httpError(409,'An accepted quote planned loads; change those on the ledger');
      if(d.status!=='recorded')throw A.httpError(409,'This quote is already '+d.status);
      var patch={status:'withdrawn',withdrawnAt:now,withdrawnBy:by,reason:reason,trail:(d.trail||[]).concat([{at:now,by:by,status:'withdrawn',note:reason}])};
      tx.update(wref,patch);
      audit(tx,db,org,by,now,{action:'freight-withdraw',orderId:oid,quoteId:wid,laneKey:d.laneKey||'',reason:reason});
      return {ok:true,quote:F.quoteView(Object.assign({},d,patch,{id:wid}),null,today)};
    });
  }
  /* freight-accept: every stop of the quote planned as one leg, or none */
  var qid=P.id(b.quoteId);
  if(!Number.isInteger(b.revision)||b.revision<0)throw A.httpError(400,'Revision required');
  var loadIdIn=b.loadId==null||b.loadId===''?'':String(b.loadId).trim();
  if(loadIdIn&&!F.LOAD_ID.test(loadIdIn))throw A.httpError(400,'Load id: letters, numbers, dash and underscore, at most 100');
  var bookingRef=L.text(b.bookingRef==null?'':String(b.bookingRef),160,false);
  /* read before the transaction, only to name the lane's units the quote
     does not cover (reported, never planned) */
  var pre=F.plan(await freightInputs(db,org,ctx,fo.order,now));
  return db.runTransaction(async function(tx){
    var s=await tx.get(fo.ref);
    if(!s.exists||s.data().orgId!==org)throw A.httpError(404,'Order not found');
    var o=Object.assign({},s.data(),{id:oid}),d=o.delivery;
    if(!d||!Array.isArray(d.destinations))throw A.httpError(409,F.LEGACY_SAY);
    if(d.revision!==b.revision)throw A.httpError(409,'Order changed; reload before recording another event');
    if(o.cancelRequested||o.status==='cancelled')throw A.httpError(409,'Resolve the cancelled order before recording a movement');
    var qs=await tx.get(quotesOf(db,org).doc(qid)),qd=qs.exists?qs.data():null;
    if(!qd||qd.orgId!==org||qd.orderId!==oid)throw A.httpError(404,'Quote not found');
    var q=Object.assign({},qd,{id:qid});
    var others=(await tx.get(quotesOf(db,org).where('orderId','==',oid).limit(MAX_QUOTES))).docs.filter(function(x){var v=x.data();return x.id!==qid&&v.orgId===org&&v.laneKey===q.laneKey&&v.status==='recorded';});
    var siteIds={},serials=[];(q.stops||[]).forEach(function(st){if(SITE_ID.test(String(st.siteId||'')))siteIds[st.siteId]=true;(st.serials||[]).forEach(function(sn){serials.push(sn);});});
    if(serials.length>F.MAX_QUOTE_UNITS)throw A.httpError(409,'This quote covers '+serials.length+' units; accept at most '+F.MAX_QUOTE_UNITS+' at a time');
    var sitesById={},siteSnaps=await readAll(tx,Object.keys(siteIds).map(function(sid){return orgRoot(db,org).collection('sites').doc(sid);}));
    siteSnaps.forEach(function(ss){if(ss.exists)sitesById[ss.id]=Object.assign({},ss.data(),{id:ss.id});});
    var unitsBySerial={},unitRefs={},okSerials=serials.filter(function(sn){return /^[A-Za-z0-9._-]{1,100}$/.test(String(sn));});
    (await readAll(tx,okSerials.map(function(sn){return db.doc('plant_units/'+org+'__'+sn);}))).forEach(function(us,i){var sn=okSerials[i];unitRefs[sn]=us.ref;if(us.exists&&us.data().orgId===org)unitsBySerial[sn]=us.data();});
    var preLane=pre.lanes.filter(function(l){return l.key===q.laneKey;})[0],laneOpen=[];
    if(preLane)preLane.stops.forEach(function(st){laneOpen=laneOpen.concat(st.openSerials);});
    var chk=F.acceptCheck({quote:q,unitsBySerial:unitsBySerial,sitesById:sitesById,order:o,now:now,laneOpen:laneOpen});
    if(chk.problems.length)throw A.httpError(409,chk.problems[0]);
    if(chk.ineligible.length)throw A.httpError(409,F.ineligibleSay(chk.ineligible));
    var tracking=bookingRef||String(q.reference||'').trim();
    if(!tracking)throw A.httpError(400,'Enter the carrier’s booking or quote reference');
    /* blank: the ONE naming rule (F.nextLoadId), on the legs this revision has — the lane's nextLoadId the page previewed */
    var legs=d.legs||[],loadId=loadIdIn||F.nextLoadId(o,q.laneKey,legs);
    var added=[],events=[],patches=[],total=chk.stops.length;
    chk.stops.forEach(function(st,i){
      var r;
      try{
        r=L.planLeg({org:org,orderId:oid,delivery:d,legs:legs,legId:loadId+'-S'+st.seq,destinationId:st.destinationId,serials:st.serials,units:st.serials.map(function(x){return unitsBySerial[x]||null;}),
          carrier:q.carrier,tracking:tracking,evidence:'Freight quote '+q.id+' accepted ('+q.carrier+', ref '+(q.reference||tracking)+') · stop '+(i+1)+' of '+total,by:by,now:now,source:'freight-quote',
          extra:{siteId:st.siteId,siteName:st.siteName,freight:{quoteId:q.id,laneKey:q.laneKey,loadId:loadId,stop:st.seq,stops:total}}});
      }catch(e){throw A.httpError(e.status||400,'Stop '+st.seq+' · '+st.siteName+': '+e.message);}
      legs=legs.concat([r.leg]);added.push(r.leg);events.push(r.event);patches=patches.concat(r.unitPatches);
    });
    var legIds=added.map(function(l){return l.id;});
    patches.forEach(function(p){tx.update(unitRefs[p.serial],p.patch);});
    tx.update(fo.ref,{'delivery.legs':legs,'delivery.revision':d.revision+1,updatedAt:A.FieldValue().serverTimestamp()});
    added.forEach(function(leg,i){tx.create(fo.ref.collection('events').doc(),{at:now,by:by,what:'Logistics plan · '+leg.id,logistics:Object.assign({legId:leg.id},events[i])});});
    tx.create(fo.ref.collection('events').doc(),{at:now,by:by,what:'Freight quote accepted · '+(q.laneLabel||q.laneKey)+' · '+q.carrier,freight:{quoteId:q.id,laneKey:q.laneKey,loadId:loadId,legIds:legIds,units:patches.length}});
    var acc={status:'accepted',acceptedAt:now,acceptedBy:by,legIds:legIds,trail:(q.trail||[]).concat([{at:now,by:by,status:'accepted',note:'Planned '+legIds.length+' load'+(legIds.length===1?'':'s')+' as '+loadId}])};
    tx.update(qs.ref,acc);
    others.forEach(function(x){tx.update(x.ref,{status:'superseded',supersededBy:q.id,trail:(x.data().trail||[]).concat([{at:now,by:by,status:'superseded',note:'Quote '+q.id+' accepted for this lane'}])});});
    audit(tx,db,org,by,now,{action:'freight-accept',orderId:oid,quoteId:q.id,laneKey:q.laneKey,loadId:loadId,legIds:legIds,units:patches.length,superseded:others.map(function(x){return x.id;})});
    return {ok:true,revision:d.revision+1,loadId:loadId,legs:added,quote:F.quoteView(Object.assign({},q,acc),preLane||null,today),notOnQuote:chk.notOnQuote,superseded:others.map(function(x){return x.id;})};
  });
}

module.exports=A.handler(async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(['GET','POST'].indexOf(req.method)<0)throw A.httpError(405,'GET or POST only');
  var c=await A.authenticate(req),b=req.body||{},org=A.safeOrg(req.method==='GET'?req.query.org:b.org);
  var ctx=await X.authorize(c,org,true),db=A.db();
  if(!X.subscribed(ctx))throw A.httpError(403,'Omega Logic subscription required');
  if(req.method==='GET'&&req.query.freight)return freightGet(db,org,ctx,c,req.query.freight);
  if(req.method==='GET'){
    var q=db.collection('orders').where('orgId','==',org).orderBy('createdAt','desc').limit(100),rows=await q.get();
    // Unconverted PO intake (including declined) has no destination plan and is not an order yet; api/po-intake.js applies the same rule.
    return {brand:require('./_lib/logic-brand')(ctx.org),orders:rows.docs.filter(function(s){var d=s.data();return !d.poIntake||d.poIntake.convertedAt;}).map(function(s){return L.buyerOrder(s.data(),s.id);}),limited:rows.size===100,
      notice:'Manual shipment evidence ledger. Carrier booking, live tracking and commissioning approval are not connected.'};
  }
  if(FREIGHT_ACTIONS.indexOf(b.action)>=0)return freightPost(db,org,ctx,c,b);
  if(['plan','pickup','location','delivered','inspect'].indexOf(b.action)<0)throw A.httpError(400,'Unsupported action');
  var ref=db.collection('orders').doc(P.id(b.orderId)),legId=P.id(b.legId);
  if(!Number.isInteger(b.revision)||b.revision<0)throw A.httpError(400,'Revision required');
  if(b.action==='pickup'){
    var before=await ref.get();
    if(!before.exists||before.data().orgId!==org)throw A.httpError(404,'Order not found');
    var reconciliation=await require('./_lib/logic-workflow').processOrder(ref.id);
    if(!reconciliation.ok)throw A.httpError(409,'Reconcile QuickBooks successfully before recording pickup');
  }
  return db.runTransaction(async function(tx){
    var s=await tx.get(ref);
    if(!s.exists||s.data().orgId!==org)throw A.httpError(404,'Order not found');
    var o=s.data(),d=o.delivery;
    if(!d||!Array.isArray(d.destinations))throw A.httpError(409,'This order needs a reviewed destination plan; legacy orders are not changed automatically');
    if(d.revision!==b.revision)throw A.httpError(409,'Order changed; reload before recording another event');
    if((o.cancelRequested||o.status==='cancelled')&&['plan','pickup'].indexOf(b.action)>=0)throw A.httpError(409,'Resolve the cancelled order before recording a movement');
    var legs=d.legs||[],index=legs.findIndex(function(l){return l.id===legId;}),leg=index>=0?legs[index]:null,now=new Date().toISOString(),ev;
    if(b.action==='plan'){
      /* the checks live in L.planLeg, the one planner the freight plan's
         accept shares; the units are read here (all reads first), an
         invalid list reads nothing and planLeg refuses it in order */
      var readList=[];try{readList=L.serials(b.serials);}catch(e){readList=[];}
      var unitSnaps=[];for(var serial of readList)unitSnaps.push(await tx.get(db.doc('plant_units/'+org+'__'+serial)));
      var planned=L.planLeg({org:org,orderId:ref.id,delivery:d,legs:legs,legId:legId,destinationId:b.destinationId,serials:b.serials,units:unitSnaps.map(function(us){return us.exists?us.data():null;}),
        carrier:b.carrier,tracking:b.tracking,evidence:b.evidence,by:c.email,now:now,source:'manual'});
      leg=planned.leg;ev=planned.event;
      planned.unitPatches.forEach(function(up,i){tx.update(unitSnaps[i].ref,up.patch);});
      legs=legs.concat([leg]);
    }else{
      if(!leg)throw A.httpError(404,'Shipment leg not found');
      if(b.action==='pickup'){
        var l=o.logic||{},invoices=l.invoices||{};
        if(!X.enabled(ctx)||!l.releasedAt||l.lastError||l.paymentException||!l.acceptedAt||
          !invoices.deposit||(invoices.deposit.amountCents&&!invoices.deposit.satisfied)||!invoices.balance||(invoices.balance.amountCents&&!invoices.balance.satisfied))throw A.httpError(409,'Verified payments and accounting release are required before pickup');
        for(var rootSerial of leg.serials){
          var family=await tx.get(db.collection('plant_units').where('orgId','==',org).where('rootSerial','==',rootSerial).limit(401));
          if(family.empty||family.size>400||!family.docs.some(function(x){return x.data().serial===rootSerial&&x.data().shipUnit;})||family.docs.some(function(x){var u=x.data();return u.orderId!==ref.id||!P.ready(u);}))throw A.httpError(409,'Every serialized component must pass testing and reach Ready without a hold');
        }
      }
      /* Custody follows the load (api/_lib/custody.js): pickup puts every
         shipping unit in transit, delivery delivers it, the inspection
         receives it into the customer's hands — accepted, damaged or lost.
         Read the units before the writes below; a unit whose custody
         refuses the move (never happens on a planned load) is skipped and
         named rather than blocking the carrier evidence. */
      var custodyUnits=[];if(['pickup','delivered','inspect'].indexOf(b.action)>=0){for(var cs of leg.serials){var cu=await tx.get(db.doc('plant_units/'+org+'__'+cs));if(cu.exists)custodyUnits.push(cu);}}
      /* whose units these are: the order's customer ACCOUNT (its stamp, or the account of the person it is billed to) */
      var loadAcct=custodyUnits.length?await require('./_lib/buyer-accounts').accountOfOrder(db,org,o):null;
      var change=L.transition(leg,b.action,b,c.email,now);leg=change.leg;ev=change.event;legs=legs.slice();legs[index]=leg;
      var skippedCustody=[];custodyUnits.forEach(function(cu){var u=cu.data(),move=b.action==='pickup'?'ship':b.action==='delivered'?'deliver':'receive',body={at:now,legId:legId,note:'Load '+legId};
        if(move==='receive'){var rc=(leg.receipts||[]).filter(function(r){return r.serial===u.serial;})[0];if(rc&&rc.condition==='missing'){var st=C.state(u,'lost',{note:'Missing on receipt of load '+legId},c.email,now,'logistics');tx.update(cu.ref,st.patch);tx.create(cu.ref.collection('custody_events').doc(),Object.assign({orgId:org,serial:u.serial,legId:legId,orderId:ref.id},st.event));return;}body.condition=rc&&rc.condition==='damaged'?'damaged':'accepted';}
        var v=C.judge(u,move,body);if(!v.ok){skippedCustody.push(u.serial+': '+v.say);return;}
        var ap=C.apply(u,move,body,c.email,now,'logistics');if(loadAcct&&!C.custodyOf(u).customerId)ap.patch['custody.customerId']=loadAcct;ap.event.legId=legId;ap.event.orderId=ref.id;
        tx.update(cu.ref,ap.patch);tx.create(cu.ref.collection('custody_events').doc(),Object.assign({orgId:org,serial:u.serial},ap.event));});
      if(skippedCustody.length)ev.custodySkipped=skippedCustody;
    }
    tx.update(ref,{'delivery.legs':legs,'delivery.revision':d.revision+1,updatedAt:A.FieldValue().serverTimestamp()});
    tx.create(ref.collection('events').doc(),{at:now,by:c.email,what:'Logistics '+b.action+' · '+legId,logistics:Object.assign({legId:legId},ev)});
    return {ok:true,revision:d.revision+1,leg:L.buyerOrder({delivery:{legs:[leg]}},ref.id).legs[0]};
  });
});
