/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var auth=require('./_lib/verify-token'); // Existing Omega helper, deliberately not replaced.
var evidence=require('./_lib/fiber-evidence');
var access=require('./_lib/grid-atlas-access');
var parcel=require('./_lib/fiber-parcel');
module.exports=function(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'&&req.method!=='POST') return res.status(405).json({error:'GET or POST required'});
  return access(req).then(function() {
    if(req.method==='POST') {
      var body=req.body;
      try { if(typeof body==='string')body=JSON.parse(body);parcel.parse(body); }
      catch(e) { throw auth.httpError(400,e.message); }
      return res.status(200).json(parcel.inspect(body));
    }
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
