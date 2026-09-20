/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var auth = require('./_lib/verify-token');
var toolEngine = require('./_lib/battery-tool-engine');
var adapter = require('./_lib/bess-size-adapter');
var UNITS = require('./_lib/bess-units');
module.exports = function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST') return res.status(405).json({error:'POST required'});
  return auth.authenticateWithTier(req).then(function(a){
    var addons=a.billing.addons||[];
    var overrides=a.billing.toolOverrides||{};
    if(!a.caller.staff && (overrides.batterysizer===false || (['standard','deluxe','enterprise','partner','internal'].indexOf(a.tier)<0 && overrides.batterysizer!==true && addons.indexOf('engineering')<0))) throw auth.httpError(403,'Battery sizing requires Battery Sizer access.');
    var b=req.body||{};

    /* UNITS ARE A BOUNDARY CONCERN. A 300 kW store and a 40 MW campus are
       the same arithmetic at a thousand times the scale, so the caller may
       state site data in either - but the engine sees kW and kWh and
       nothing else. Scale once, here, and echo the unit back so the page
       can render in what the user asked for.
       RATES ARE NOT SCALED. Demand charges, $/kWh and installed $/kWh are
       quoted per kW and per kWh whatever the size of the site; scaling
       them alongside the load is how a tariff silently becomes 1000x. */
    var unit = UNITS.resolve(b.unit, 'kw');
    var uf = unit.toKw;
    function scaleKw(v){ var n=Number(v); return isFinite(n) ? n*uf : v; }
    if (b.mode==='tool-interval' || b.mode==='tool-monthly') {
      if(!Array.isArray(b.data)||!b.data.length||b.data.length>24||!Array.isArray(b.durations)||!b.durations.length||b.durations.length>6||b.durations.some(function(v){return [1,2,3,4,6,8].indexOf(v)<0;}))throw auth.httpError(400,'Invalid months or battery durations.');
      var cfg=b.settings||{}, numberKeys=['rte','dod','cRate','otherEff','dRate','ratchet','eRate','cKwh','cKw','itc','incent','incHair','om','term','disc','fade','escal','headroom','baseFrac','pkHrs','dayUp','subBlock','subPrice','subMin'];
      numberKeys.forEach(function(k){if(cfg[k]!=null&&cfg[k]!==''&&(!isFinite(Number(cfg[k]))||Number(cfg[k])<0))throw auth.httpError(400,'Invalid '+k);});
      ['rte','dod','otherEff'].forEach(function(k){if(cfg[k]!=null&&(!(Number(cfg[k])>0)||Number(cfg[k])>100))throw auth.httpError(400,k+' must be greater than zero and at most 100');});
      if(cfg.cRate!=null&&cfg.cRate!==''&&(!(Number(cfg.cRate)>0)||Number(cfg.cRate)>10))throw auth.httpError(400,'C-rate must be greater than zero and at most 10.');
      ['ratchet','itc','incHair','fade'].forEach(function(k){if(Number(cfg[k])>100)throw auth.httpError(400,k+' exceeds 100%');});
      if(cfg.term!=null&&(!(Number(cfg.term)>=1)||Number(cfg.term)>50))throw auth.httpError(400,'Analysis term must be 1 to 50 years.');
      if(cfg.subBlock!=null&&!(Number(cfg.subBlock)>0))throw auth.httpError(400,'Subscription block must be positive.');
      var count=0;
      if(uf!==1) b.data.forEach(function(m){
        if(!m||typeof m!=='object')return;
        if(Array.isArray(m.load)) m.load=m.load.map(scaleKw);
        ['peak','min','kwh'].forEach(function(k){ if(m[k]!=null&&m[k]!=='') m[k]=scaleKw(m[k]); });
      });
      b.data.forEach(function(m){
        if(b.mode==='tool-interval'){
          if(!Array.isArray(m.load)||!m.load.length||[1/12,1/6,0.25,0.5,1].indexOf(m.dt)<0)throw auth.httpError(400,'Invalid interval data.');
          count+=m.load.length;
          if(m.load.some(function(v){return typeof v!=='number'||!isFinite(v)||v<0;}))throw auth.httpError(400,'Load readings must be finite nonnegative kW.');
          m.peak=Math.max.apply(null,m.load);m.min=Math.min.apply(null,m.load);
        }else if(!(m.peak>0)||!isFinite(m.peak)||!(m.days>0)||m.days>366||!(m.kwh>=0)||!isFinite(m.kwh)||!(m.rate>=0)||!isFinite(m.rate))throw auth.httpError(400,'Invalid monthly bill.');
      });
      if(count>105408)throw auth.httpError(400,'Too many interval readings.');
      var toolOut=toolEngine(b);
      toolOut.units={input:unit.key,power:unit.label,energy:unit.energyLabel};
      return res.status(200).json(toolOut);
    }
    /* The site-map editor's two modes. They used to fork into bess-engine.js,
       a second sizing model that disagreed with the standalone tool by 24%
       on bills and 52% on interval data. Both now run the SAME engine; the
       adapter translates in and out so the editor's UI is unchanged. */
    if(['interval','monthly'].indexOf(b.mode)<0 || !Array.isArray(b.data) || !b.data.length || b.data.length>(b.mode==='interval'?105408:12)) throw auth.httpError(400,'Invalid sizing request or too many readings.');
    var o=b.opts||{}, tariff=o.tariff||{};
    ['demandChargePerKw','energyRate','capexPerKwh','capexPerKw','maxC','targetPaybackYr','ratchetPct','touSpread','dodPct','rtePct','otherEffPct','itcPct','omPerKwYr','termYr','discountPct','fadePctYr','escalPctYr'].forEach(function(k){
      if(tariff[k]==null||tariff[k]==='')return;
      var v=Number(tariff[k]);
      if(!isFinite(v)||v<0)throw auth.httpError(400,'Tariff value '+k+' must be a finite nonnegative number.');
    });
    if(tariff.maxC!=null&&tariff.maxC!==''&&(!(Number(tariff.maxC)>0)||Number(tariff.maxC)>10))throw auth.httpError(400,'Max C-rate must be greater than zero and at most 10.');
    if(tariff.ratchetPct!=null&&Number(tariff.ratchetPct)>1)throw auth.httpError(400,'Ratchet is a fraction between 0 and 1.');
    ['dodPct','rtePct','otherEffPct','itcPct'].forEach(function(k){if(tariff[k]!=null&&tariff[k]!==''&&Number(tariff[k])>100)throw auth.httpError(400,k+' cannot exceed 100.');});

    /* A request the engine accepts but cannot turn into a size is
       unprocessable, not a server fault: surface it as 422 with the
       engine's own reason rather than a generic 500. A MALFORMED request
       (no readings at all, a negative kW) is refused as 400 above, before
       the engine is asked. */
    function size(mode, data, opts2, basis){
      var raw;
      try{
        raw = toolEngine({mode:mode, data:data, durations:adapter.DURATIONS,
                          settings:adapter.toSettings(tariff)});
      }catch(err){
        throw auth.httpError(422, err && err.message
          ? 'Could not size from this data: ' + err.message
          : 'Could not size from this data.');
      }
      if(!raw || !raw.best) throw auth.httpError(422,'Could not size from this data.');
      return adapter.adapt(raw, opts2, basis);
    }

    var legacy;
    if(b.mode==='interval'){
      if(b.data.some(function(v){return typeof v!=='number'||!isFinite(v)||v<0;}))throw auth.httpError(400,'Load readings must be finite nonnegative '+unit.label+'.');
      if(uf!==1) b.data=b.data.map(scaleKw);
      var iv=Number(o.intervalMin);
      if(o.intervalMin!=null&&[5,10,15,20,30,60].indexOf(iv)<0)throw auth.httpError(400,'Interval length must be 5, 10, 15, 20, 30 or 60 minutes.');
      var series=adapter.intervalToMonths(b.data,o.intervalMin,o.startMonth);
      if(!series.length)throw auth.httpError(400,'Not enough interval data to cover a billing month.');
      legacy=size('tool-interval',series,o,'interval');
    }else{
      if(b.data.some(function(r){return !r||!(Number(r.demandKw)>0)||!isFinite(Number(r.demandKw))||!(Number(r.kwh)>=0)||!isFinite(Number(r.kwh));}))throw auth.httpError(400,'Each month needs a billed demand above zero and a nonnegative usage figure.');
      if(uf!==1) b.data=b.data.map(function(r){
        var c={},k; for(k in r) if(Object.prototype.hasOwnProperty.call(r,k)) c[k]=r[k];
        if(c.demandKw!=null&&c.demandKw!=='') c.demandKw=scaleKw(c.demandKw);
        if(c.kwh!=null&&c.kwh!=='') c.kwh=scaleKw(c.kwh);
        return c;
      });
      var bills=adapter.monthlyToBills(b.data,tariff);
      legacy=size('tool-monthly',bills,o,'monthly');
    }
    legacy.units={input:unit.key,power:unit.label,energy:unit.energyLabel};
    return res.status(200).json(legacy);
  }).catch(function(e){res.status(e.status||500).json({error:e.status?e.message:'Sizing failed; check the inputs and retry.'});});
};
