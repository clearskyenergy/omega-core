/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var auth=require('./verify-token');
module.exports=function(req){return auth.authenticateWithTier(req).then(function(a){
 if(!a.caller.staff&&(a.billing.toolOverrides||{}).gridatlas===false)throw auth.httpError(403,'Grid Atlas access required.');
 if(a.caller.staff)return a;
 var token=String(req.headers.authorization||'').replace(/^Bearer /,'');
 return Promise.all([auth.readAsCaller(token,'omega_orgs/'+encodeURIComponent(a.caller.orgId)),auth.readAsCaller(token,'omega_orgs/'+encodeURIComponent(a.caller.orgId)+'/members/'+encodeURIComponent(a.caller.uid))]).then(function(items){
  var org=items[0],member=items[1];
  if(!org||['active','pending'].indexOf(org.status)<0)throw auth.httpError(403,'An active Omega organisation is required.');
  if(!member||(member.status&&member.status!=='active'))throw auth.httpError(403,'An active organisation membership is required.');
  if(Array.isArray(member.toolAccess)&&member.toolAccess.indexOf('gridatlas')<0)throw auth.httpError(403,'Grid Atlas access required.');return a;
 });
});};
