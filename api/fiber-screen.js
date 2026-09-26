/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var auth=require('./_lib/verify-token'); // Existing Omega helper, deliberately not replaced.
var evidence=require('./_lib/fiber-evidence');
module.exports=function(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET') return res.status(405).json({error:'GET required'});
  return auth.authenticateWithTier(req).then(function (ctx) { return require('./_lib/package-access').withToken(req, ctx, ["gridatlas", "siteintel", "compute"]); }).then(function(a) {
    if(!a.caller.staff && !a.packageAccess && (a.billing.toolOverrides||{}).gridatlas===false)
      throw auth.httpError(403,'Grid Atlas access required.');
    // Grid Atlas is TIER.ALL in this Omega snapshot; still verify member and org status.
    if(a.caller.staff || a.packageAccess) return a;
    var token=String(req.headers.authorization||'').replace(/^Bearer /,'');
    return Promise.all([
      auth.readAsCaller(token,'omega_orgs/'+encodeURIComponent(a.caller.orgId)),
      auth.readAsCaller(token,'omega_orgs/'+encodeURIComponent(a.caller.orgId)+'/members/'+encodeURIComponent(a.caller.uid))
    ]).then(function(items) {
      var org=items[0],member=items[1];
      if(!org || ['active','pending'].indexOf(org.status)<0) throw auth.httpError(403,'An active Omega organisation is required.');
      if(!member || (member.status && member.status!=='active')) throw auth.httpError(403,'An active organisation membership is required.');
      if(Array.isArray(member.toolAccess) && member.toolAccess.indexOf('gridatlas')<0) throw auth.httpError(403,'Grid Atlas access required.');
      return a;
    });
  }).then(function() {
    var q;
    try { q=evidence.parseRequest(req.query); }
    catch(e) { throw auth.httpError(400,e.message); }
    // Omit absent capacity rather than passing null through the strict input validator.
    if(q.requested_capacity_gbps===null) delete q.requested_capacity_gbps;
    return res.status(200).json(evidence.screen(q));
  }).catch(function(e) {
    return res.status(e.status||503).json({error:e.status?e.message:'Fiber evidence data is unavailable.'});
  });
};
