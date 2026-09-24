/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./admin'),B=require('./buyer-accounts'),P=require('./logic-policy'),X=require('./logic-access'),L=require('./order-lifecycle'),crypto=require('crypto');
function root(org){return A.db().collection('omega_orgs').doc(org);}
async function scope(c,org,office){
  if(!c.claims||c.claims.email_verified!==true)throw A.httpError(403,'Verify your email first');
  if(office){var ctx=await X.authorize(c,org,false);if(!X.subscribed(ctx))throw A.httpError(403,'Subscription inactive');
    if(!X.owner(c)){var s=await root(org).collection('members').doc(c.uid).get();if(!s.exists||['owner','admin','member'].indexOf(s.data().role)<0)throw A.httpError(403,'Office access required');}
    return {office:true,ctx:ctx};}
  return {office:false,ctx:await B.context(org),account:B.active(await B.lookup(A.db(),org,B.email(c.email)))};
}
/* ── Reps and reseller / referral agreements ────────────────────────────
   A rep is whoever brought the opportunity: an employee, a reseller entity or
   a referral partner. The agreement (contract reference, commission, dates)
   lives on the rep record under omega_orgs/{org}/reps — Admin SDK only, so
   commission terms never sit on a document the customer can read. A company
   account and a PO carry only a snapshot {id, name, email}. */
var REP_KINDS=['employee','reseller','referral'],AGREEMENTS=['none','reseller','referral'];
function str(v,max,required,multiline){return L.text(v==null?'':String(v),max,required,multiline);}
function dateOrNull(v){v=str(v,10);if(!v)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!isFinite(Date.parse(v)))throw A.httpError(400,'Use YYYY-MM-DD dates');return v;}
function repInput(b){
  var name=str(b.name,120,true),email=b.email?B.email(b.email):'',entity=str(b.entity,160),kind=REP_KINDS.indexOf(b.kind)>=0?b.kind:'employee',ag=b.agreement||{};
  var type=AGREEMENTS.indexOf(ag.type)>=0?ag.type:'none',pct=ag.commissionPct===''||ag.commissionPct==null?null:Number(ag.commissionPct),reference=str(ag.reference,120);
  if(pct!=null&&(!isFinite(pct)||pct<0||pct>100))throw A.httpError(400,'Commission must be between 0 and 100 percent');
  if(type!=='none'&&!reference)throw A.httpError(400,'An agreement needs a contract or document reference');
  var starts=dateOrNull(ag.startsAt),ends=dateOrNull(ag.endsAt);if(starts&&ends&&ends<starts)throw A.httpError(400,'Agreement end date is before its start');
  return {name:name,email:email,entity:entity,kind:kind,status:b.status==='inactive'?'inactive':'active',
    agreement:{type:type,reference:type==='none'?'':reference,commissionPct:type==='none'?null:pct,startsAt:type==='none'?null:starts,endsAt:type==='none'?null:ends,notes:str(ag.notes,1000,false,true)}};
}
function repSnapshot(s){var d=s.data();return {id:s.id,name:d.name,email:d.email||''};}
function repView(s){var d=s.data();return {id:s.id,name:d.name,email:d.email||'',entity:d.entity||'',kind:d.kind,status:d.status,agreement:d.agreement||{type:'none'}};}
async function rep(org,id,tx){var ref=root(org).collection('reps').doc(P.id(id)),s=tx?await tx.get(ref):await ref.get();if(!s.exists||s.data().status!=='active')throw A.httpError(400,'Choose an active rep');return repSnapshot(s);}
async function reps(org){var q=await root(org).collection('reps').orderBy('__name__').limit(200).get();return q.docs.map(repView);}
async function company(org,id){var r=root(org).collection('customers').doc(P.id(id)),s=await r.get();if(!s.exists||s.data().status!=='active')throw A.httpError(404,'Active company account not found');return {id:s.id,data:s.data(),ref:r};}
function file(input){
  if(!input||typeof input.base64!=='string'||input.base64.length>2800000||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))throw A.httpError(400,'File must be PDF, PNG or JPEG up to 2 MB');
  var bytes=Buffer.from(input.base64,'base64'),type='';
  if(bytes.length<8||bytes.length>2*1024*1024)throw A.httpError(400,'File must be between 8 bytes and 2 MB');
  if(bytes.subarray(0,5).toString()==='%PDF-')type='application/pdf';
  else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))type='image/png';
  else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg';
  if(!type)throw A.httpError(400,'Only PDF, PNG and JPEG documents are accepted');
  var name=L.text(input.name,160,true).replace(/[^A-Za-z0-9._ -]/g,'_').replace(/\.[^.]*$/,'')+(type==='application/pdf'?'.pdf':type==='image/png'?'.png':'.jpg');
  return {bytes:bytes,type:type,name:name,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
function bucket(){return A.init().storage().bucket(process.env.FIREBASE_STORAGE_BUCKET||'clearsky-portal.firebasestorage.app');}
function project(s){var o=s.data(),d=o.poIntake||{};return {id:s.id,orderNo:o.orderNo,customerId:o.customerId,company:(o.customer||{}).company,poNumber:d.number||'',status:o.status,source:d.source,notes:d.notes||'',createdAt:d.createdAt,reviewNote:d.reviewNote||'',convertedAt:d.convertedAt||null,rep:d.rep||null,files:(d.files||[]).map(function(f){return {id:f.id,name:f.name,type:f.type,size:f.size};})};}
async function submit(org,acct,c,body,source){
  var number=L.text(body.poNumber||'',80,true),notes=L.text(body.notes||'',4000,false,true),upload=body.file?file(body.file):null;
  if(!upload&&!notes)throw A.httpError(400,'Upload a PO or enter the purchase order details');
  var key=P.key(org+':'+acct.id+':'+number.toLowerCase());
  var id='po_'+key,ref=A.db().collection('orders').doc(id),fingerprint=P.key(JSON.stringify([number.toLowerCase(),notes,upload&&upload.sha256]));
  // Reserve before uploading. A failed upload stays visibly incomplete and can be retried.
  var result=await A.db().runTransaction(async function(tx){
    var fresh=await tx.get(acct.ref),old=await tx.get(ref);
    if(!fresh.exists||fresh.data().status!=='active')throw A.httpError(403,'Company access inactive');
    if(source==='customer'){var contact=await tx.get(acct.ref.collection('users').doc(B.email(c.email)));if(!contact.exists||['disabled','suspended'].indexOf(contact.data().status)>=0)throw A.httpError(403,'Customer access inactive');}
    if(old.exists){if((old.data().poIntake||{}).fingerprint!==fingerprint)throw A.httpError(409,'This PO number already exists with different details. Review the existing PO rather than creating a duplicate.');return {duplicate:true,uploadState:old.data().poIntake.uploadState};}
    /* Who brought this opportunity: the office may name a rep or say "none";
       otherwise the account's rep. A customer submission never sets it. */
    var repChoice=source==='office'?body.repId:undefined,attributed=repChoice==='none'?null:repChoice?await rep(org,repChoice,tx):(fresh.data().rep||null);
    var now=new Date().toISOString(),usage=fresh.data().poIntakeUsage||{},day=now.slice(0,10);
    if(usage.day===day&&usage.count>=50)throw A.httpError(429,'Daily company intake limit reached');
    tx.create(ref,{orgId:org,customerId:acct.id,orderNo:'PO-IN-'+key.slice(0,10).toUpperCase(),status:'po_review',source:'po-intake',items:[],system:{},fulfilledBy:'clearsky',
      customer:{company:fresh.data().name||'',email:source==='customer'?B.email(c.email):'',name:source==='customer'?(acct.user||{}).name||c.email:'Office-entered PO'},
      poIntake:{number:number,notes:notes,source:source,createdAt:now,submittedBy:c.email||'email-adapter',fingerprint:fingerprint,uploadState:upload?'pending':'none',files:[],rep:attributed},
      createdAt:A.FieldValue().serverTimestamp(),updatedAt:A.FieldValue().serverTimestamp()});
    tx.update(acct.ref,{poIntakeUsage:{day:day,count:usage.day===day?(usage.count||0)+1:1},hasOrders:true});
    tx.create(ref.collection('events').doc(),{at:now,by:c.email,what:'PO received for review via '+source+'. No commercial acceptance, payment or production release.'});
    return {duplicate:false,uploadState:upload?'pending':'none'};
  });
  if(upload&&result.uploadState==='pending'){
    var path='logic-po/'+org+'/'+acct.id+'/'+id+'/'+upload.sha256;
    await bucket().file(path).save(upload.bytes,{resumable:false,contentType:'application/octet-stream',metadata:{cacheControl:'private, no-store',contentDisposition:'attachment'}});
    await A.db().runTransaction(async function(tx){var s=await tx.get(ref);if(s.data().poIntake.uploadState!=='pending')return;tx.update(ref,{'poIntake.uploadState':'stored','poIntake.files':[{id:upload.sha256,name:upload.name,type:upload.type,size:upload.bytes.length,path:path,sha256:upload.sha256,untrusted:true}]});});
  }
  return {ok:true,id:id,duplicate:result.duplicate,note:'PO saved for office review. No charge or production release.'};
}
module.exports={scope:scope,company:company,file:file,bucket:bucket,project:project,submit:submit,root:root,repInput:repInput,rep:rep,reps:reps,repSnapshot:repSnapshot,repView:repView,REP_KINDS:REP_KINDS,AGREEMENTS:AGREEMENTS};
