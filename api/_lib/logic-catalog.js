/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./admin'),M=require('./materials');
function clean(v,n){return String(v==null?'':v).trim().slice(0,n);}
/* Three kinds. A `component` is what a product is MADE OF — a cell, a BMS, a
   module — and is never sold, published, drawn or priced: api/embed-config.js,
   omega-bess-products.js and designs() below each drop it on sight. It lives
   in the same list as the products because bills of materials reference it
   by SKU and two lists drift. See api/_lib/materials.js. */
var KINDS=['product','service','component'];
function product(p){
  p=p||{};var sku=clean(p.sku,64),category=p.category||'bess',kind=p.kind||'product';
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sku)||sku==='GENERIC-BESS')throw A.httpError(400,'Use a unique product SKU (letters, numbers, dot, dash, underscore)');
  if(['bess','compute','ev','solar','other'].indexOf(category)<0||KINDS.indexOf(kind)<0)throw A.httpError(400,'Select a product category and type');
  var out={sku:sku,name:clean(p.name,120),blurb:clean(p.blurb,400),kind:kind,category:category,active:p.active!==false,priceMode:kind==='component'?'quote':(p.priceMode==='list'?'list':'quote'),designEnabled:kind==='product'&&category==='bess'&&p.designEnabled===true};
  if(!out.name)throw A.httpError(400,'Product name required');
  ['kw','kwh','widthFt','depthFt','listPrice','warrantyYears','leadTimeDays','moq','safetyStock'].forEach(function(k){var v=p[k];if(v==null||v===''){out[k]=null;return;}var n=Number(v);if(!isFinite(n)||n<0||n>100000000)throw A.httpError(400,'Invalid '+k);out[k]=n;});
  if(out.priceMode==='list'&&!(out.listPrice>0))throw A.httpError(400,'A published list price must be greater than zero');
  if(out.priceMode==='quote')out.listPrice=null;
  if(out.designEnabled&&!['kw','kwh','widthFt','depthFt'].every(function(k){return out[k]>0;}))throw A.httpError(400,'BESS design products require positive kW, kWh, width and depth');
  out.chemistry=clean(p.chemistry,40);out.imageUrl=clean(p.imageUrl,400);
  if(out.imageUrl&&!/^https:\/\//.test(out.imageUrl)&&!/^\/(?!\/)/.test(out.imageUrl))throw A.httpError(400,'Use an HTTPS image or a local image path');
  var g=p.integrates||{};out.integrates={pcs:g.pcs===true,xfmr:g.xfmr===true,disco:g.disco===true};
  /* Sourcing fields belong to a component. A product's bill of materials is
     what the materials plan explodes; a service has none. */
  out.unit=kind==='component'?(clean(p.unit,8)||'ea'):null;
  if(out.unit&&M.UNITS.indexOf(out.unit)<0)throw A.httpError(400,'Unit must be one of '+M.UNITS.join(', '));
  out.supplier=kind==='component'?clean(p.supplier,160):'';out.supplierSku=kind==='component'?clean(p.supplierSku,80):'';
  if(kind!=='component'){out.moq=null;out.safetyStock=null;}
  out.bom=kind==='service'?[]:M.bomLines(p.bom);
  /* Coverage templates (api/_lib/custody.js): what a unit of this product
     carries once it is bound to a site. warrantyYears stays the default
     template when the list is empty. Ids unique per product. */
  var C=require('./custody'),ids={};out.coverage=(Array.isArray(p.coverage)?p.coverage:[]).slice(0,10).map(function(t){var v=C.template(t);if(ids[v.id])throw A.httpError(400,'Coverage id "'+v.id+'" is used twice');ids[v.id]=true;return v;});
  return out;
}
function designs(config){
  var rows=(config.products||[]).filter(function(p){return p.active!==false&&(p.kind||'product')==='product'&&(p.category||'bess')==='bess'&&p.designEnabled!==false&&Number(p.kw)>0&&Number(p.kwh)>0&&Number(p.widthFt)>0&&Number(p.depthFt)>0;});
  // The same canonical generic capacity concept used by the full editor.
  // Never published to the storefront or accepted as an orderable SKU.
  if(!rows.length)return config.genericDesign===false?[]:[{sku:'GENERIC-BESS',name:'Generic BESS · make/model TBD',placeholder:true}];
  return rows.map(function(p){return {sku:p.sku,name:p.name,kw:Number(p.kw),kwh:Number(p.kwh),widthFt:Number(p.widthFt),depthFt:Number(p.depthFt),chemistry:clean(p.chemistry,40),integrates:{pcs:!!(p.integrates||{}).pcs,xfmr:!!(p.integrates||{}).xfmr,disco:!!(p.integrates||{}).disco},placeholder:false};});
}
function select(config,sku,target){
  var p=designs(config).filter(function(r){return r.sku===sku;})[0];
  if(!p)throw A.httpError(409,'Choose BESS from this supplier’s current design catalog');
  var qty=p.placeholder?1:Math.ceil(Math.max(target.kw/p.kw,target.kwh/p.kwh));
  if(qty>9999)throw A.httpError(400,'This target requires more than 9999 units');
  return Object.assign({},target,{product:p,qty:qty,selectedKw:p.placeholder?target.kw:qty*p.kw,selectedKwh:p.placeholder?target.kwh:qty*p.kwh});
}
/* The OFFICE projection — the tenant's own catalog page. Sourcing fields and
   the bill of materials are theirs to see; the public projection in
   api/embed-config.js never names them. */
function view(p){var out={};['sku','name','blurb','kind','category','active','priceMode','designEnabled','kw','kwh','widthFt','depthFt','listPrice','warrantyYears','leadTimeDays','chemistry','imageUrl','unit','supplier','supplierSku','moq','safetyStock'].forEach(function(k){if(p[k]!=null&&p[k]!=='')out[k]=p[k];});if(Array.isArray(p.coverage)&&p.coverage.length)out.coverage=p.coverage;var g=p.integrates||{};out.integrates={pcs:g.pcs===true,xfmr:g.xfmr===true,disco:g.disco===true};out.bom=(p.bom||[]).map(function(l){var o={sku:String(l.sku),qty:Number(l.qty),unit:String(l.unit||'ea'),yieldPct:Number(l.yieldPct)>0?Number(l.yieldPct):100};if(l.station)o.station=String(l.station);if(l.step)o.step=String(l.step);return o;});return out;}
module.exports={product:product,designs:designs,select:select,view:view,KINDS:KINDS};
