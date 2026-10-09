/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./_lib/admin'),E=require('./_lib/brain-evidence');var cached,pending;
module.exports=A.handler(async function(req,res){
 if(req.method!=='GET')throw A.httpError(405,'GET only');var c=await A.authenticate(req);
 if(!c.claims||c.claims.email_verified!==true||String(c.email).toLowerCase()!=='tom@clearsky-usa.com')throw A.httpError(403,'Private to Thomas.');
 res.setHeader('Cache-Control','private, no-store');if(cached&&Date.now()-cached.time<300000)return cached.data;
 if(!pending){var db=A.db();pending=E.collect(async function(name,fields,limit){var q=db.collection(name);var x=await Promise.all([q.select(...fields).limit(limit).get(),q.count().get()]);return {rows:x[0].docs.map(d=>Object.assign({id:d.id},d.data())),total:x[1].data().count};}).then(data=>{cached={time:Date.now(),data};return data;}).finally(()=>{pending=null;});}return pending;
});
