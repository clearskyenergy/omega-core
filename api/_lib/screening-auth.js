/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var auth=require('./verify-token');
module.exports=async function(req,mode){
  var m=/^Bearer (.+)$/.exec((req.headers||{}).authorization||'');
  if(!m)throw auth.httpError(401,'Sign in to your OMEGA workspace.');
  var token=m[1],caller=await auth.verifyIdToken(token),key=mode==='parcel'?'parcelscreening':'bessscreening';
  if(!caller.orgId||caller.emailVerified!==true)throw auth.httpError(403,'A verified workspace account is required.');
  var base='omega_orgs/'+encodeURIComponent(caller.orgId);
  var records=await Promise.all([auth.readAsCaller(token,base),auth.readAsCaller(token,base+'/billing/current'),auth.readAsCaller(token,base+'/members/'+encodeURIComponent(caller.uid))]);
  var org=records[0],billing=records[1],member=records[2];
  if(!caller.staff){
    if(!org||org.status!=='active'||!billing)throw auth.httpError(403,'An active workspace and billing record are required.');
    if(!member||(member.status&&member.status!=='active'))throw auth.httpError(403,'Active workspace membership is required.');
    if(billing.packaged===true){
      var packages=require('./package-access');
      var view=packages.project(caller,billing,org,member,Date.now());
      packages.requireModule(view,mode==='parcel'?'siteintel':'storage',{tools:[key]});
      return {caller:caller,billing:billing,token:token,packageAccess:view};
    }
    var ov=billing.toolOverrides||{},addons=billing.addons||[];
    var tiers=mode==='bess'?['standard','deluxe','enterprise','partner','internal']:['deluxe','enterprise','partner','internal'];
    if(ov[key]===false || (tiers.indexOf(billing.tier)<0&&ov[key]!==true&&addons.indexOf('screening')<0))throw auth.httpError(403,'Screening access is required for this workspace.');
    if(Array.isArray(member.toolAccess)&&member.toolAccess.indexOf(key)<0)throw auth.httpError(403,'This member does not have access to this screening tool.');
    if(Array.isArray(billing.toolAccess)&&billing.toolAccess.indexOf(key)<0)throw auth.httpError(403,'This workspace does not include this screening tool.');
  }
  return {caller:caller,billing:billing||{},token:token};
};
