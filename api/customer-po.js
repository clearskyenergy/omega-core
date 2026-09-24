/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./_lib/admin'),B=require('./_lib/buyer-accounts'),P=require('./_lib/logic-policy'),L=require('./_lib/order-lifecycle');
module.exports=A.handler(async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(['GET','POST'].indexOf(req.method)<0)throw A.httpError(405,'GET or POST only');
  try{
    var c=await A.authenticate(req),b=req.body||{},org=A.safeOrg(req.method==='GET'?req.query.org:b.org);
    if(!org)throw A.httpError(400,'Valid supplier required');
    if(!c.claims||c.claims.email_verified!==true)throw A.httpError(403,'Verify your customer email first');
    var ctx=await B.context(org),db=A.db(),email=B.email(c.email),acct=B.active(await B.lookup(db,org,email));
    if(req.method==='GET'){
      // The ACCOUNT's orders, not the caller's: every person on the company sees them.
      var rows=await B.accountOrders(db,org,email,acct,{limit:50});
      var catalog=await db.doc('omega_orgs/'+org+'/storefront/config').get();
      return {brand:require('./_lib/logic-brand')(ctx.org),products:(catalog.exists?catalog.data().products||[]:[]).filter(function(p){return p.active!==false&&!p.placeholder&&p.sku!=='GENERIC-BESS';}).map(function(p){return {sku:p.sku,name:p.name,kind:p.kind||'product'};}),
        orders:rows.docs.map(function(s){return L.buyerOrder(s.data(),s.id);}),limited:rows.truncated,terms:P.terms(ctx.config.terms,acct.data.terms)};
    }
    if(b.action!=='submit')throw A.httpError(400,'Unsupported action');
    return db.runTransaction(async function(tx){
      // Re-read account and catalog inside the transaction; suspension/catalog edits race safely.
      var fresh=B.active(await B.lookup(db,org,email,tx));
      var catalog=await tx.get(db.doc('omega_orgs/'+org+'/storefront/config'));
      var input=L.po(b,catalog.exists?catalog.data().products||[]:[]);
      var id='po_'+P.key(org+':'+fresh.id+':'+input.poNumber.toLowerCase()),ref=db.collection('orders').doc(id),old=await tx.get(ref);
      var fingerprint=P.key(JSON.stringify(input));
      if(old.exists){
        if((old.data().purchaseOrder||{}).fingerprint!==fingerprint)throw A.httpError(409,'This PO number already exists with different details; contact the office for an amendment');
        return {ok:true,duplicate:true,orderId:id,orderNo:old.data().orderNo};
      }
      var now=new Date().toISOString(),accountRef=db.doc('omega_orgs/'+org+'/customers/'+fresh.id);
      var day=now.slice(0,10),usage=fresh.data.poUsage||{};
      if(usage.day===day&&usage.count>=30)throw A.httpError(429,'Daily PO submission limit reached; contact the office');
      var orderNo='PO-'+now.slice(0,10).replace(/-/g,'')+'-'+id.slice(-8).toUpperCase();
      tx.create(ref,{orgId:org,orgName:ctx.org.name||org,orderNo:orderNo,customerId:fresh.id,status:'new',fulfilledBy:'clearsky',
        customer:{email:email,name:fresh.user.name||email,company:fresh.data.name||'',phone:fresh.user.phone||'',address:input.destinations[0].address,notes:input.notes},
        items:input.items,system:{},purchaseOrder:{number:input.poNumber,fingerprint:fingerprint,submittedBy:c.uid,submittedAt:now},
        delivery:{version:1,revision:0,destinations:input.destinations,legs:[]},requestedTerms:P.terms(ctx.config.terms,fresh.data.terms),
        createdAt:A.FieldValue().serverTimestamp(),updatedAt:A.FieldValue().serverTimestamp(),source:'customer-po'});
      tx.update(accountRef,{hasOrders:true,poUsage:{day:day,count:usage.day===day?(usage.count||0)+1:1}});
      tx.create(ref.collection('events').doc(),{at:now,by:email,what:'Customer submitted PO '+input.poNumber+'; commercial acceptance and verified payment remain required'});
      return {ok:true,orderId:id,orderNo:orderNo,note:'PO received for commercial review. No payment was taken and no shipment was booked.'};
    });
  }catch(e){if(e.status&&e.status<500)throw e;console.error('[customer-po]',e);throw A.httpError(500,'Could not process this purchase order. Please retry.');}
});
