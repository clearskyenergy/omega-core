/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./_lib/admin'),X=require('./_lib/logic-access'),P=require('./_lib/logic-policy'),L=require('./_lib/order-lifecycle'),C=require('./_lib/custody');
module.exports=A.handler(async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(['GET','POST'].indexOf(req.method)<0)throw A.httpError(405,'GET or POST only');
  var c=await A.authenticate(req),b=req.body||{},org=A.safeOrg(req.method==='GET'?req.query.org:b.org);
  var ctx=await X.authorize(c,org,true),db=A.db();
  if(!X.subscribed(ctx))throw A.httpError(403,'Omega Logic subscription required');
  if(req.method==='GET'){
    var q=db.collection('orders').where('orgId','==',org).orderBy('createdAt','desc').limit(100),rows=await q.get();
    // Unconverted PO intake (including declined) has no destination plan and is not an order yet; api/po-intake.js applies the same rule.
    return {brand:require('./_lib/logic-brand')(ctx.org),orders:rows.docs.filter(function(s){var d=s.data();return !d.poIntake||d.poIntake.convertedAt;}).map(function(s){return L.buyerOrder(s.data(),s.id);}),limited:rows.size===100,
      notice:'Manual shipment evidence ledger. Carrier booking, live tracking and commissioning approval are not connected.'};
  }
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
      if(leg)throw A.httpError(409,'Shipment leg identifier already exists');
      if(legs.length>=100)throw A.httpError(409,'Order has reached its shipment-leg limit; contact support');
      var dest=d.destinations.find(function(x){return x.id===b.destinationId;});
      if(!dest)throw A.httpError(400,'Choose an order destination');
      var list=L.serials(b.serials),units=[];
      for(var serial of list){var us=await tx.get(db.doc('plant_units/'+org+'__'+serial));if(!us.exists)throw A.httpError(400,'Serial is not registered');units.push(us);}
      var counts=Object.create(null);
      // Prior allocation is distinct by serial, including already delivered loads.
      var assigned=Object.create(null);
      legs.forEach(function(x){x.serials.forEach(function(sn){assigned[sn]=true;});});
      units.forEach(function(us){var u=us.data();if(u.orgId!==org||u.orderId!==ref.id||!u.shipUnit||assigned[u.serial]||u.logisticsLegId)throw A.httpError(409,'Serial must be an unassigned shipping unit on this order');counts[u.sku]=(counts[u.sku]||0)+1;});
      var allowance=P.quantities(dest.items),prior=Object.create(null);
      legs.filter(function(x){return x.destinationId===dest.id;}).forEach(function(x){(x.items||[]).forEach(function(i){prior[i.sku]=(prior[i.sku]||0)+i.qty;});});
      Object.keys(counts).forEach(function(sku){if(!allowance[sku]||counts[sku]+(prior[sku]||0)>allowance[sku])throw A.httpError(409,'Shipment exceeds destination allocation');});
      leg={id:legId,destinationId:dest.id,serials:list,items:Object.keys(counts).map(function(sku){return {sku:sku,qty:counts[sku]};}),
        carrier:L.text(b.carrier,120,true),tracking:L.text(b.tracking,160,true),status:'planned',createdAt:now};
      ev={action:'plan',at:now,by:c.email,evidence:L.evidence(b.evidence),source:'manual'};
      units.forEach(function(us){tx.update(us.ref,{logisticsLegId:legId,logisticsOrderId:ref.id});});
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
