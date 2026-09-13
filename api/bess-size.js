/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var auth = require('./_lib/verify-token');
var engine = require('./_lib/bess-engine');
var toolEngine = require('./_lib/battery-tool-engine');
module.exports = function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST') return res.status(405).json({error:'POST required'});
  return auth.authenticateWithTier(req).then(function(a){
    var addons=a.billing.addons||[];
    var overrides=a.billing.toolOverrides||{};
    if(!a.caller.staff && (overrides.batterysizer===false || (['standard','deluxe','enterprise','partner','internal'].indexOf(a.tier)<0 && overrides.batterysizer!==true && addons.indexOf('engineering')<0))) throw auth.httpError(403,'Battery sizing requires Battery Sizer access.');
    var b=req.body||{};
    if (b.mode==='tool-interval' || b.mode==='tool-monthly') {
      if(!Array.isArray(b.data)||!b.data.length||b.data.length>24||!Array.isArray(b.durations)||!b.durations.length||b.durations.length>6||b.durations.some(function(v){return [1,2,3,4,6,8].indexOf(v)<0;}))throw auth.httpError(400,'Invalid months or battery durations.');
      var cfg=b.settings||{}, numberKeys=['rte','dod','dRate','ratchet','eRate','cKwh','cKw','itc','incent','incHair','om','term','disc','fade','escal','headroom','baseFrac','pkHrs','dayUp','subBlock','subPrice','subMin'];
      numberKeys.forEach(function(k){if(cfg[k]!=null&&cfg[k]!==''&&(!isFinite(Number(cfg[k]))||Number(cfg[k])<0))throw auth.httpError(400,'Invalid '+k);});
      ['rte','dod'].forEach(function(k){if(cfg[k]!=null&&(!(Number(cfg[k])>0)||Number(cfg[k])>100))throw auth.httpError(400,k+' must be greater than zero and at most 100');});
      ['ratchet','itc','incHair','fade'].forEach(function(k){if(Number(cfg[k])>100)throw auth.httpError(400,k+' exceeds 100%');});
      if(cfg.term!=null&&(!(Number(cfg.term)>=1)||Number(cfg.term)>50))throw auth.httpError(400,'Analysis term must be 1 to 50 years.');
      if(cfg.subBlock!=null&&!(Number(cfg.subBlock)>0))throw auth.httpError(400,'Subscription block must be positive.');
      var count=0;
      b.data.forEach(function(m){
        if(b.mode==='tool-interval'){
          if(!Array.isArray(m.load)||!m.load.length||[1/12,1/6,0.25,0.5,1].indexOf(m.dt)<0)throw auth.httpError(400,'Invalid interval data.');
          count+=m.load.length;
          if(m.load.some(function(v){return typeof v!=='number'||!isFinite(v)||v<0;}))throw auth.httpError(400,'Load readings must be finite nonnegative kW.');
          m.peak=Math.max.apply(null,m.load);m.min=Math.min.apply(null,m.load);
        }else if(!(m.peak>0)||!isFinite(m.peak)||!(m.days>0)||m.days>366||!(m.kwh>=0)||!isFinite(m.kwh)||!(m.rate>=0)||!isFinite(m.rate))throw auth.httpError(400,'Invalid monthly bill.');
      });
      if(count>105408)throw auth.httpError(400,'Too many interval readings.');
      return res.status(200).json(toolEngine(b));
    }
    if(['interval','monthly'].indexOf(b.mode)<0 || !Array.isArray(b.data) || b.data.length>(b.mode==='interval'?105408:12)) throw auth.httpError(400,'Invalid sizing request or too many readings.');
    var result=b.mode==='interval'?engine.sizeFromInterval(b.data,b.opts):engine.sizeFromMonthly(b.data,b.opts);
    return res.status(result.ok?200:422).json(result);
  }).catch(function(e){res.status(e.status||500).json({error:e.status?e.message:'Sizing failed; check the inputs and retry.'});});
};
