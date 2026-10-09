/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./_lib/admin'), I=require('./_lib/brain-inventory');
var cached=null, pending=null, TTL=300000;
module.exports=A.handler(async function(req,res){
  if(req.method!=='GET')throw A.httpError(405,'GET only');
  var caller=await A.authenticate(req);
  // This includes Thomas's private twin metadata. Staff membership alone is insufficient.
  if(!caller.claims || caller.claims.email_verified!==true || String(caller.email).toLowerCase()!=='tom@clearsky-usa.com')throw A.httpError(403,'Brain inventory is private to Thomas.');
  res.setHeader('Cache-Control','private, no-store');
  if(cached && Date.now()-cached.time<TTL)return cached.data;
  if(!pending)pending=I.collect(A.db()).then(function(data){cached={time:Date.now(),data:data};return data;}).finally(function(){pending=null;});
  return pending;
});
