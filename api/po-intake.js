/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./_lib/admin'),B=require('./_lib/buyer-accounts'),P=require('./_lib/logic-policy'),L=require('./_lib/order-lifecycle'),I=require('./_lib/po-intake'),X=require('./_lib/logic-access');
module.exports=A.handler(async function(req,res){
  try {
  res.setHeader('Cache-Control','no-store');if(['GET','POST'].indexOf(req.method)<0)throw A.httpError(405,'GET or POST only');
  var b=req.method==='GET'?req.query:req.body||{},org=A.safeOrg(b.org);if(!org)throw A.httpError(400,'Valid supplier required');
  var c=await A.authenticate(req),scope=await I.scope(c,org,b.office===true||b.office==='1'),db=A.db(),root=I.root(org);
  if(req.method==='POST'&&b.action==='rep'){
    if(!scope.office)throw A.httpError(403,'Office access required');await X.authorize(c,org,true);
    var repDoc=I.repInput(b),repId=b.id?P.id(b.id):'rep_'+P.key((repDoc.email||repDoc.name).toLowerCase()),rref=root.collection('reps').doc(repId);
    return db.runTransaction(async function(tx){var s=await tx.get(rref),now=new Date().toISOString(),doc=Object.assign({orgId:org},repDoc,{updatedBy:c.email,updatedAt:now});
      if(s.exists)tx.update(rref,doc);else tx.create(rref,Object.assign({},doc,{createdBy:c.email,createdAt:now}));
      tx.create(db.collection('omega_audit').doc(),{action:'rep-'+(s.exists?'updated':'created'),orgId:org,repId:repId,before:s.exists?s.data():null,after:doc,by:c.email,at:now});return {ok:true,repId:repId,note:'Rep saved.'};});
  }
  if(req.method==='POST'&&b.action==='company'){
    await X.authorize(c,org,true);var name=L.text(b.name,160,true),domain=b.domain?A.safeOrg(b.domain):'';if(b.domain&&!domain)throw A.httpError(400,'Invalid company domain');
    var cid='company_'+P.key(name.toLowerCase()),cref=root.collection('customers').doc(cid),companyRep=b.repId?await I.rep(org,b.repId):null;
    return db.runTransaction(async function(tx){var s=await tx.get(cref);if(s.exists)return {ok:true,customerId:cid,duplicate:true};
      tx.create(cref,{orgId:org,name:name,domain:domain,accountType:'company',status:'active',plan:'free',terms:{},source:'office',rep:companyRep,createdAt:new Date().toISOString()});
      tx.create(db.collection('omega_audit').doc(),{action:'buyer-company-created',orgId:org,customerId:cid,by:c.email,at:new Date().toISOString()});return {ok:true,customerId:cid};});
  }
  var customerId=scope.office?(b.customerId?P.id(b.customerId):null):scope.account.id;
  if(req.method==='GET'&&!customerId&&scope.office){var companies=await root.collection('customers').orderBy('__name__').limit(200).get();return {office:true,brand:require('./_lib/logic-brand')(scope.ctx.org),companies:companies.docs.map(function(s){return {id:s.id,name:s.data().name,status:s.data().status,rep:s.data().rep||null};}),reps:await I.reps(org),limited:companies.size===200};}
  if(!customerId)throw A.httpError(400,'Select a company');var acct=await I.company(org,customerId);acct.user=scope.account&&scope.account.user;
  if(req.method==='POST'&&b.action==='contact'){
    if(!scope.office)throw A.httpError(403,'Office administrator required');await X.authorize(c,org,true);
    var email=B.email(b.email),role=b.role==='owner'?'owner':'user',name=L.text(b.name||email,120,true);
    return db.runTransaction(async function(tx){var ptr=root.collection('customer_index').doc(email),old=await tx.get(ptr),u=acct.ref.collection('users').doc(email),us=await tx.get(u);
      if(old.exists&&old.data().customerId!==acct.id)throw A.httpError(409,'This email already belongs to another customer account; contact ClearSky for a reviewed account merge');
      if(us.exists)throw A.httpError(409,'Contact already exists; existing access was preserved');
      if(!old.exists)tx.create(ptr,{customerId:acct.id,email:email,createdAt:new Date().toISOString()});
      tx.create(u,{email:email,name:name,role:role,status:'active',source:'office',createdAt:new Date().toISOString()});
      tx.create(db.collection('omega_audit').doc(),{action:'buyer-company-contact',orgId:org,customerId:acct.id,email:email,role:role,by:c.email,at:new Date().toISOString()});return {ok:true,note:'Contact assigned. They must sign in with their own verified email; no invitation has been sent.'};});
  }
  if(req.method==='POST'&&b.action==='account'){
    if(!scope.office)throw A.httpError(403,'Office administrator required');await X.authorize(c,org,true);
    var nextRep=b.repId&&b.repId!=='none'?await I.rep(org,b.repId):null;
    return db.runTransaction(async function(tx){var s=await tx.get(acct.ref),now=new Date().toISOString();tx.update(acct.ref,{rep:nextRep,repUpdatedBy:c.email,repUpdatedAt:now});
      tx.create(db.collection('omega_audit').doc(),{action:'buyer-company-rep',orgId:org,customerId:acct.id,before:s.data().rep||null,after:nextRep,by:c.email,at:now});return {ok:true,note:nextRep?'Account rep set to '+nextRep.name+'.':'Account rep cleared.'};});
  }
  if(req.method==='POST'&&b.action==='submit')return await I.submit(org,acct,c,b,scope.office?'office':'customer');
  if(req.method==='GET'&&!b.id){
    var rows=await db.collection('orders').where('customerId','==',acct.id).limit(200).get();
    var list=rows.docs.filter(function(s){return s.data().orgId===org;});
    var catalog=await root.collection('storefront').doc('config').get(),contacts=scope.office?await acct.ref.collection('users').limit(100).get():null;
    return {office:scope.office,brand:require('./_lib/logic-brand')(scope.ctx.org),company:{id:acct.id,name:acct.data.name,rep:acct.data.rep||null},reps:scope.office?await I.reps(org):[],
      terms:P.terms(scope.ctx.config.terms,acct.data.terms),products:(catalog.exists?catalog.data().products||[]:[]).filter(function(p){return p.active!==false&&!p.placeholder&&p.sku!=='GENERIC-BESS';}).map(function(p){return {sku:p.sku,name:p.name,kind:p.kind||'product'};}),
      contacts:contacts?contacts.docs.filter(function(s){return ['disabled','suspended'].indexOf(s.data().status)<0;}).map(function(s){return {email:s.id,name:s.data().name,role:s.data().role};}):[],
      intake:list.filter(function(s){return !!s.data().poIntake;}).map(I.project).sort(function(a,b){return b.createdAt.localeCompare(a.createdAt);}),
      orders:list.filter(function(s){return !s.data().poIntake||s.data().poIntake.convertedAt;}).map(function(s){return L.buyerOrder(s.data(),s.id);}),limited:rows.size===200};
  }
  var ref=db.collection('orders').doc(P.id(b.id)),row=await ref.get();if(!row.exists||row.data().orgId!==org||row.data().customerId!==acct.id||!row.data().poIntake)throw A.httpError(404,'PO not found');
  if(req.method==='GET'&&b.file){var f=row.data().poIntake.files.filter(function(f){return f.id===b.file;})[0];if(!f)throw A.httpError(404,'Document not found');
    var contents=await I.bucket().file(f.path).download();res.setHeader('Content-Type','application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition','attachment; filename="'+f.name.replace(/["\\]/g,'_')+'"');res.end(contents[0]);return;}
  if(req.method==='POST'&&b.action==='review'){
    if(!scope.office)throw A.httpError(403,'Office access required');var note=L.text(b.note,2000,true,true),status=b.status;if(['po_review','po_needs_information','po_declined'].indexOf(status)<0)throw A.httpError(400,'Invalid review disposition');
    return db.runTransaction(async function(tx){var s=await tx.get(ref);if(s.data().poIntake.convertedAt||s.data().logic)throw A.httpError(409,'PO already converted to an order');tx.update(ref,{status:status,'poIntake.reviewNote':note});tx.create(ref.collection('events').doc(),{at:new Date().toISOString(),by:c.email,what:status+': '+note});return {ok:true};});
  }
  if(req.method==='POST'&&b.action==='convert'){
    if(!scope.office)throw A.httpError(403,'Office access required');
    return db.runTransaction(async function(tx){var s=await tx.get(ref),o=s.data(),catalog=await tx.get(root.collection('storefront').doc('config')),contact=B.active(await B.lookup(db,org,B.email(b.email),tx));
      if(contact.id!==acct.id)throw A.httpError(400,'Billing contact must belong to this company');
      if(o.poIntake.convertedAt)return {ok:true,id:ref.id,duplicate:true};
      if(o.poIntake.uploadState==='pending')throw A.httpError(409,'Retry the incomplete document upload first');
      if(o.status==='po_declined')throw A.httpError(409,'Reopen the PO for review before conversion');
      var input=L.po(b,catalog.exists?catalog.data().products||[]:[]);if(o.poIntake.number&&input.poNumber!==o.poIntake.number)throw A.httpError(400,'Keep the original PO number');
      var now=new Date().toISOString();tx.update(ref,{status:'new',items:input.items,customer:{email:B.email(b.email),name:contact.user.name||b.email,company:acct.data.name,phone:contact.user.phone||'',address:input.destinations[0].address,notes:input.notes},
        purchaseOrder:{number:input.poNumber,submittedBy:o.poIntake.submittedBy,submittedAt:o.poIntake.createdAt},rep:o.poIntake.rep||null,delivery:{version:1,revision:0,destinations:input.destinations,legs:[]},requestedTerms:P.terms(scope.ctx.config.terms,contact.data.terms),'poIntake.convertedAt':now});
      tx.create(ref.collection('events').doc(),{at:now,by:c.email,what:'Reviewed PO mapped to catalog and submitted for commercial pricing. No acceptance or charge.'});return {ok:true,id:ref.id};});
  }
  throw A.httpError(400,'Unsupported PO action');
  } catch(e) { if(e.status&&e.status<500)throw e;console.error('[po-intake]',e);throw A.httpError(500,'Could not process this PO request. Please retry or contact your supplier.'); }
});
