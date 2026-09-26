/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var auth = require('./_lib/verify-token');
var toolEngine = require('./_lib/battery-tool-engine');
var adapter = require('./_lib/bess-size-adapter');
var UNITS = require('./_lib/bess-units');

/* Request validation is shared with the pro forma's sizing bridge
   (_lib/proforma-sizing.js) so the two doors into the engine refuse the
   same things. It is reached through the engine module, which carries its
   own request contract, so this endpoint's dependencies stay exactly the
   engine, the adapter, the units table and the auth gate. */
var check = toolEngine.validate;

module.exports = function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST') return res.status(405).json({error:'POST required'});
  return auth.authenticateWithTier(req).then(function (ctx) { return require('./_lib/package-access').withToken(req, ctx, "storage"); }).then(function(a){
    var addons=a.billing.addons||[];
    var overrides=a.billing.toolOverrides||{};
    if(!a.caller.staff && !a.packageAccess && (overrides.batterysizer===false || (['standard','deluxe','enterprise','partner','internal'].indexOf(a.tier)<0 && overrides.batterysizer!==true && addons.indexOf('engineering')<0))) throw auth.httpError(403,'The Battery Sizer is not included in the '+a.tier+' plan. '
      +'It is available on Standard and above, or with the Engineering add-on.');
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
      check.checkToolRequest(b,auth.httpError);
      check.checkToolSettings(b.settings||{},auth.httpError);
      if(uf!==1) b.data.forEach(function(m){
        if(!m||typeof m!=='object')return;
        if(Array.isArray(m.load)) m.load=m.load.map(scaleKw);
        ['peak','min','kwh'].forEach(function(k){ if(m[k]!=null&&m[k]!=='') m[k]=scaleKw(m[k]); });
      });
      check.checkToolMonths(b.mode,b.data,auth.httpError);
      b.tariff = check.checkTariff(b.tariff, auth.httpError);
      var toolOut=toolEngine(b);
      toolOut.units={input:unit.key,power:unit.label,energy:unit.energyLabel};
      return res.status(200).json(toolOut);
    }
    /* The site-map editor's two modes. They used to fork into bess-engine.js,
       a second sizing model that disagreed with the standalone tool by 24%
       on bills and 52% on interval data. Both now run the SAME engine; the
       adapter translates in and out so the editor's UI is unchanged. */
    check.checkEditorRequest(b,auth.httpError);
    var o=b.opts||{}, tariff=o.tariff||{};
    check.checkEditorTariff(tariff,auth.httpError);

    /* A request the engine accepts but cannot turn into a size is
       unprocessable, not a server fault: surface it as 422 with the
       engine's own reason rather than a generic 500. A MALFORMED request
       (no readings at all, a negative kW) is refused as 400 above, before
       the engine is asked. */
    function size(mode, data, opts2, basis){
      var raw;
      try{
        raw = toolEngine({mode:mode, data:data, durations:adapter.DURATIONS,
                          settings:adapter.toSettings(tariff),
                          tariff:structuredTariff});
      }catch(err){
        throw auth.httpError(422, err && err.message
          ? 'Could not size from this data: ' + err.message
          : 'Could not size from this data.');
      }
      if(!raw || !raw.best) throw auth.httpError(422,'Could not size from this data.');
      return adapter.adapt(raw, opts2, basis);
    }

    var structuredTariff = check.checkTariff(o.rateStructure || b.tariff, auth.httpError);

    var legacy;
    if(b.mode==='interval'){
      check.checkReadings(b.data,auth.httpError,unit.label);
      if(uf!==1) b.data=b.data.map(scaleKw);
      check.checkIntervalMin(o.intervalMin,auth.httpError);
      var series=adapter.intervalToMonths(b.data,o.intervalMin,o.startMonth);
      if(!series.length)throw auth.httpError(400,'Not enough interval data to cover a billing month.');
      legacy=size('tool-interval',series,o,'interval');
    }else{
      check.checkMonthlyRows(b.data,auth.httpError);
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
