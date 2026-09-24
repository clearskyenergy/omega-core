/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./_lib/admin'),X=require('./_lib/logic-access'),C=require('./_lib/logic-catalog');
module.exports=A.handler(async function(req,res){
  res.setHeader('Cache-Control','no-store');if(['GET','POST'].indexOf(req.method)<0)throw A.httpError(405,'GET or POST only');
  var b=req.body||{},caller=await A.authenticate(req),org=A.safeOrg(req.method==='GET'?req.query.org:b.org),ctx=await X.authorize(caller,org,req.method==='POST');
  var ref=A.db().doc('omega_orgs/'+org+'/storefront/config');
  if(req.method==='GET'){var snap=await ref.get(),d=snap.exists?snap.data():{};var routing=require('./_lib/plant-flow').current(ctx.config).routing.map(function(s){return {key:s.key,label:s.label};});
    return {org:org,brand:require('./_lib/logic-brand')(ctx.org),owner:X.owner(caller),revision:d.catalogRevision||0,products:(d.products||[]).map(C.view),designProducts:C.designs(d),routing:routing};}
  if(b.action!=='save')throw A.httpError(400,'Unknown catalog action');
  var product=C.product(b.product);
  return A.db().runTransaction(async function(tx){
    var snap=await tx.get(ref),d=snap.exists?snap.data():{},rows=d.products||[],old=rows.filter(function(p){return p.sku===product.sku;})[0];
    if(b.revision!==(d.catalogRevision||0))throw A.httpError(409,'The catalog changed. Reload before saving');
    // OEM admins may maintain specifications and quote-only products. Only
    // ClearSky can approve/change a public price that ClearSky collects.
    if(!X.owner(caller)&&((old&&old.priceMode==='list')||product.priceMode==='list'))throw A.httpError(403,'ClearSky must approve changes to list-priced products');
    if(!old&&rows.length>=200)throw A.httpError(400,'Catalog limit is 200 products/services');
    // Retain pre-existing private engineering fields; the form never edits
    // them and the public endpoints still construct an explicit projection.
    var saved=Object.assign({},old||{},product);
    rows=rows.map(function(p){return p.sku===product.sku?saved:p;});if(!old)rows.push(saved);
    // A bill of materials is checked against the LIST, not the row: every
    // component it names must exist, none may be a service, and the whole
    // catalog must stay loop-free — a cycle hangs the materials plan.
    require('./_lib/materials').validateCatalog(rows);
    if(old&&old.kind!==product.kind&&rows.some(function(p){return p.sku!==product.sku&&(p.bom||[]).some(function(l){return l.sku===product.sku;});})&&product.kind==='service')throw A.httpError(409,product.sku+' is used in a bill of materials and cannot become a service');
    var revision=(d.catalogRevision||0)+1,at=new Date().toISOString();
    tx.set(ref,{products:rows,catalogRevision:revision,catalogUpdatedAt:at,catalogUpdatedBy:caller.email},{merge:true});
    tx.create(A.db().collection('omega_audit').doc(),{action:'logic-catalog',orgId:org,sku:product.sku,before:old||null,after:product,by:caller.email,at:at});return {ok:true,revision:revision};
  });
});
