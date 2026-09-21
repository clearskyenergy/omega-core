/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Buyer projects are nested under the supplier's CUSTOMER, never a platform org.
   All access is through this API; browser Firestore access stays denied. */
'use strict';
var A = require('./_lib/admin'), B = require('./_lib/buyer-accounts'), D = require('./_lib/buyer-design'), P = require('./_lib/logic-policy');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req), b = req.body || {}, org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
  var scope = await D.access(caller, org);
  var storefront = await A.db().collection('omega_orgs').doc(org).collection('storefront').doc('config').get();
  var products = storefront.exists && Array.isArray(storefront.data().products) ? storefront.data().products : [];
  if (req.method === 'GET') {
    if (req.query.project) {
      D.requireEditor(scope);
      var row = await scope.projects.doc(P.id(req.query.project)).get();
      if (!row.exists) throw A.httpError(404, 'Project not found in your customer account');
      var project = row.data();
      if (scope.grant.modules.indexOf(project.module) < 0) throw A.httpError(403, 'This design module is no longer enabled');
      project.canvas = project.canvasJson ? JSON.parse(project.canvasJson) : project.canvas;
      delete project.canvasJson;
      return { id: row.id, project: project };
    }
    var rows = await scope.projects.orderBy('updatedAt', 'desc').limit(100).get();
    return { org: org, customerId: scope.account.id, brand: require('./_lib/logic-brand')(scope.ctx.org),
      access: scope.grant, designProducts:require('./_lib/logic-catalog').designs(storefront.exists?storefront.data():{}),products: products.filter(function(p){return p && p.sku && p.active !== false;}).map(function(p){return {sku:B.clean(p.sku,64),name:B.clean(p.name||p.sku,120)};}),
      projects: rows.docs.map(function (r) { var d = r.data(); return { id: r.id, name: d.name, module: d.module, updatedAt: d.updatedAt, revision: d.revision }; }), limited: rows.size === 100 };
  }
  if (b.action === 'size') {var sizing=D.sizing(scope,b);return b.module==='bess'?require('./_lib/logic-catalog').select(storefront.exists?storefront.data():{},b.sku,sizing):sizing;}
  if (b.action === 'quote') {
    D.requireEditor(scope);
    var projectId = P.id(b.projectId), qty = Number(b.qty), sku = B.clean(b.sku,64);
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) throw A.httpError(400, 'Choose 1–9999 units');
    if (!Number.isSafeInteger(b.revision) || b.revision < 1) throw A.httpError(400, 'Save your project before requesting a quote');
    var orderId = 'design_' + P.key(org + ':' + scope.account.id + ':' + projectId + ':' + b.revision);
    var orderRef = A.db().collection('orders').doc(orderId), root = A.db().collection('omega_orgs').doc(org);
    return A.db().runTransaction(async function(tx){
      var acct = B.active(await B.lookup(A.db(),org,B.email(caller.email),tx));
      if(acct.id!==scope.account.id)throw A.httpError(409,'Customer account changed. Reload first.');
      var tenant=await tx.get(root),bill=await tx.get(root.collection('billing').doc('current'));
      var fresh={org:tenant.exists?tenant.data():{},billing:bill.exists?bill.data():{}};
      if(!require('./_lib/logic-access').subscribed(fresh))throw A.httpError(403,'Customer design is not active');
      D.requireEditor({grant:D.entitlement(fresh,acct.data,caller)});
      var draft=await tx.get(scope.projects.doc(projectId)),catalog=await tx.get(root.collection('storefront').doc('config')),prior=await tx.get(orderRef);
      if(!draft.exists||draft.data().revision!==b.revision)throw A.httpError(409,'Your design changed. Save and review it before requesting a quote.');
      var p=draft.data();
      if(D.entitlement(fresh,acct.data,caller).modules.indexOf(p.module)<0)throw A.httpError(403,'This design module is no longer enabled');
      var product=catalog.exists&&(catalog.data().products||[]).filter(function(x){return x.sku===sku&&x.active!==false;})[0];
      if(!product)throw A.httpError(409,'Select equipment from the supplier’s current published catalog');
      if(prior.exists){var old=prior.data();if(old.items[0].sku!==sku||old.items[0].qty!==qty)throw A.httpError(409,'This saved revision already has a different quote request. Save a new revision for a new request.');return {ok:true,duplicate:true,orderId:orderId,orderNo:old.orderNo};}
      var now=new Date().toISOString(),no='REQ-'+now.slice(0,10).replace(/-/g,'')+'-'+orderId.slice(-8).toUpperCase();
      tx.create(orderRef,{orgId:org,orgName:scope.ctx.org.name||org,orderNo:no,status:'new',interest:'product',source:'customer-design',
        customerId:acct.id,sourceCustomerProjectId:projectId,sourceCustomerProjectRevision:p.revision,
        customer:{name:acct.user.name||acct.data.name,email:B.email(caller.email),company:acct.data.name,phone:acct.user.phone||'',address:acct.data.address||null},
        system:{kw:p.target.kw,kwh:p.target.kwh,module:p.module},items:[{sku:sku,name:B.clean(product.name||sku,120),kind:product.kind==='service'?'service':'product',qty:qty}],pricing:null,
        createdAt:A.FieldValue().serverTimestamp(),updatedAt:A.FieldValue().serverTimestamp(),
        history:[{at:now,by:caller.email,what:'Customer requested a quote for saved site design; no price accepted or payment taken.'}]});
      tx.create(orderRef.collection('events').doc(),{at:now,by:caller.email,what:'Quote requested from customer design revision '+p.revision});
      tx.create(orderRef.collection('design').doc('submitted'),{projectId:projectId,revision:p.revision,name:p.name,target:p.target,canvasJson:p.canvasJson||JSON.stringify(p.canvas),submittedAt:now});
      return {ok:true,orderId:orderId,orderNo:no};
    });
  }
  if (b.action !== 'save') throw A.httpError(400, 'Unknown design action');
  var target = D.sizing(scope, b), id = P.id(b.projectId), name = B.clean(b.name, 160);
  if (!name) throw A.httpError(400, 'Name your project');
  if (!Number.isSafeInteger(b.revision) || b.revision < 0) throw A.httpError(400, 'Project revision is required');
  if (!b.canvas || typeof b.canvas !== 'object' || Array.isArray(b.canvas) || !Array.isArray(b.canvas.elements)) throw A.httpError(400, 'A canvas snapshot is required');
  var serialized = JSON.stringify(b.canvas);
  if (Buffer.byteLength(serialized, 'utf8') > 750000) throw A.httpError(413, 'This design exceeds the save limit. Reduce the background image size and retry; nothing was overwritten.');
  var ref = scope.projects.doc(id);
  return A.db().runTransaction(async function (tx) {
    // Recheck suspension and entitlement in the same transaction as the write.
    var acct = await B.lookup(A.db(), org, B.email(caller.email), tx), root = A.db().collection('omega_orgs').doc(org);
    if (!acct || acct.id !== scope.account.id) throw A.httpError(409, 'Your customer account changed. Reload before saving.');
    var tenant = await tx.get(root), billing = await tx.get(root.collection('billing').doc('current'));
    var fresh = { org: tenant.exists ? tenant.data() : {}, billing: billing.exists ? billing.data() : {} };
    if (!require('./_lib/logic-access').subscribed(fresh)) throw A.httpError(403, 'Customer design is not active');
    B.active(acct); D.requireEditor({ grant: D.entitlement(fresh, acct.data, caller) });
    if (D.entitlement(fresh, acct.data, caller).modules.indexOf(target.module) < 0) throw A.httpError(403, 'This design module is no longer enabled');
    var old = await tx.get(ref), previous = old.exists ? old.data() : null;
    if(target.module==='bess'&&b.sku){var designCatalog=await tx.get(root.collection('storefront').doc('config'));target=require('./_lib/logic-catalog').select(designCatalog.exists?designCatalog.data():{},b.sku,target);}
    if ((previous ? previous.revision : 0) !== b.revision) throw A.httpError(409, 'This project changed in another window. Reopen it before saving; your current canvas has not been overwritten.');
    var now = new Date().toISOString(), revision = b.revision + 1;
    var data = { name: name, orgId: org, customerId: scope.account.id, module: target.module,siteAddress:B.clean(b.siteAddress,400),
      // Geometry may contain nested coordinate arrays, which Firestore cannot
      // store as native arrays. Persist the bounded JSON snapshot losslessly.
      target: target, canvasJson: serialized, revision: revision, updatedAt: now, updatedBy: caller.uid,
      createdAt: previous ? previous.createdAt : now, createdBy: previous ? previous.createdBy : caller.uid };
    if (previous) tx.set(ref, data); else tx.create(ref, data);
    return { ok: true, id: id, revision: revision, updatedAt: now };
  });
});
