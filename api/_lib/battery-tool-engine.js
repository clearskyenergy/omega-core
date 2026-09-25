/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var CAP = require('./bess-capacity');
var TARIFF = require('./bess-tariff');
module.exports=function(input){
 var cfg=input.settings||{}, MONTHS=input.data, RESULT=null;
 /* Was a hardcoded 0.0635 - a Massachusetts utility tax applied to every
    site in the country, including the ones in California. It is an input
    now, defaulting to zero: a tax nobody stated should not appear on a
    Nevada project's savings. */
 var ES_TAX = nv0('utilTax', 0)/100;
 function nv0(k,d){var n=Number((input.settings||{})[k]);return (input.settings||{})[k]==null||(input.settings||{})[k]===''||!isFinite(n)?d:n;}

 /* An optional structured tariff, OpenEI URDB shaped. Without one the
    engine prices every shaved kW at a single $/kW-mo, which is what it
    always did and is wrong on any seasonal or time-of-use schedule: the
    same battery is worth -73% to +54% of the flat answer depending on
    which month's bill the rate was read off. With one, each month's shave
    is priced at THAT month's determinants. */
 var TAR = null;
 try { if(input.tariff) TAR = TARIFF.normalize(input.tariff); } catch(e){ TAR = null; }
 var MONNAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 function nv(k,d){var n=Number(cfg[k]);return cfg[k]==null||cfg[k]===''||!isFinite(n)?d:n;}
function clampPct(v){ return v<1?1:(v>100?100:v); }
 function $(k){return {value:cfg[k],checked:!!cfg[k],style:{},textContent:''};}
 function durations(){return input.durations;}
function ldcFromBill(b, baseFrac){
  var tou   = !!(b.pay && b.pay.onKwh);
  var hrs   = tou ? nv('pkHrs',8) : 24;
  var days  = tou ? (b.pay.wd || Math.max(1, Math.round(b.days*5/7))) : b.days;
  if(!(days > 0)) days = 1;
  var dayKwh = (b.kwh/days) * (1 + nv('dayUp',15)/100);
  var mean   = dayKwh/hrs;
  var lf     = mean/b.peak;
  if(lf > 0.98) lf = 0.98;
  if(!(lf > 0))  lf = 0.5;
  var f = baseFrac;
  if(f >= lf) f = lf*0.9;
  if(f < 0.02) f = 0.02;
  var k = (1-f)/(lf-f) - 1;
  if(!isFinite(k) || k < 0.05) k = 0.05;
  if(k > 60) k = 60;
  return { pmin:f*b.peak, ppk:b.peak, k:k, hours:hrs, lf:lf, days:days,
           dayKwh:dayKwh, perDay:true, tou:tou };
}
/* Energy above a threshold under the modelled load duration curve.

   The curve is p(x) = pmin + (ppk-pmin)(1-x)^k over x in [0,1], so the area
   above T has a closed form and does not need integrating:

     u   = (T - pmin) / (ppk - pmin)        the curve's height at T, 0..1
     x_T = 1 - u^(1/k)                      the share of the window above T
     A   = (pmin - T)*x_T + (ppk - pmin)*(1 - u^((k+1)/k)) / (k+1)

   This replaced a 1,200-slice midpoint sum. Checked against a four-million
   slice integration across k from 0.05 to 60 and every threshold from base
   to peak, the closed form agrees to 3e-7% - the sum was carrying up to
   0.06% of quadrature error at shallow shaves, where the curve is steepest
   and a demand charge is most sensitive. It is also about 4,700 times
   faster, which is what makes it affordable to re-solve the shave at every
   year's state of health rather than assuming savings fade linearly. */
function energyAbove(c, T){
  if(T >= c.ppk) return 0;
  if(T <= c.pmin) T = c.pmin;
  var span = c.ppk - c.pmin;
  if(!(span > 0)) return 0;
  var u = (T - c.pmin)/span;
  if(u < 0) u = 0; else if(u > 1) u = 1;
  var xT = 1 - Math.pow(u, 1/c.k);
  var area = (c.pmin - T)*xT + span*(1 - Math.pow(u, (c.k+1)/c.k))/(c.k+1);
  return (area > 0 ? area : 0) * c.hours;
}
function energyAboveWorst(c, T){
  if(T >= c.ppk) return 0;
  var mean = c.dayKwh/c.hours;
  var frac = mean/c.ppk;
  if(frac > 1) frac = 1;
  return frac * c.hours * (c.ppk - T);
}
function shaveMonth(c, peak, kW, Emax, worst){
  var fn = worst ? energyAboveWorst : energyAbove;
  var lo = Math.max(c.pmin, peak - kW), hi = peak, i;
  if(worst) lo = peak - kW;
  for(i=0;i<26;i++){
    var mid = (lo+hi)/2;
    if(fn(c, mid) <= Emax && (peak-mid) <= kW) hi = mid; else lo = mid;
  }
  return { target:hi, shave:peak-hi, kwhDay:fn(c, hi) };
}
/* What the pack a candidate actually forces you to buy can actually
   deliver.

   The sweep asks for kW x duration of USABLE energy. The C-rate floor can
   make the pack bigger than that energy needs - a 0.5C battery cannot put
   out 409 kW from a pack sized for 409 kWh, so the smallest buildable pack
   is 818 kWh nameplate. That pack delivers about 691 kWh to the meter, not
   409. Dispatching with the requested figure while pricing the floor-sized
   pack charges for 69% more battery than it credits, and every
   short-duration candidate comes back looking worse than it is.

   So: size the pack from the request, then dispatch with what THAT pack
   delivers. Energy-limited candidates are unaffected - the chain and its
   inverse round-trip, so the figure comes back as the requested one. */
function deliverableKwh(kW, dur){
  var requested = kW*dur;
  var opts = { dodPct: nv('dod',90), rtePct: nv('rte',88),
               otherEffPct: nv('otherEff',100), cRate: nv('cRate',0.5) };
  var name = CAP.chainKwh(requested, kW, opts).nameplateKwh;
  var can  = CAP.usableFromNameplateKwh(name, opts);
  return can > requested ? can : requested;
}
function billRate(m){ return isFinite(m.useRate) ? m.useRate : m.rate; }
function subMode(){ var e = $('rateStruct'); return !!(e && e.value === 'sub'); }
function demandCost(kw, m){
  if(subMode()){
    var blk = nv('subBlock',50), price = nv('subPrice',95.56), floor = nv('subMin',100);
    var need = Math.max(kw, floor);
    var blocks = Math.ceil(need/blk);
    return blocks*price;
  }
  var billable = Math.max(0, kw - ((m && m.adj) || 0));

  /* With a structured tariff, this month's demand is priced at THIS
     month's determinants. A summer-only on-peak charge earns nothing in
     January, and a flat annual rate cannot express that.

     Only the facility (non-coincident) determinant can be priced from a
     monthly bill, because that is the only demand figure a bill states
     without a load shape. A coincident on-peak charge needs the peak
     DURING its window, which monthly totals do not carry - so it is
     priced only when the caller supplies it as m.onPeakKw, and otherwise
     its absence is reported rather than guessed at. */
  if(TAR && m){
    var mi = (m.month != null) ? m.month : 0;
    var rates = TARIFF.marginalDemandRates(mi, TAR);
    var cost = billable * (rates.facility || 0);
    if(m.onPeakKw != null && isFinite(m.onPeakKw)){
      var onKw = Math.max(0, Math.min(m.onPeakKw, billable));
      var p;
      for(p in rates.byPeriod){
        if(!Object.prototype.hasOwnProperty.call(rates.byPeriod,p)) continue;
        cost += onKw * rates.byPeriod[p];
      }
    }
    return cost;
  }
  return billable * billRate(m);
}
function runBills(bills){
  var durs = durations(), i, j;
  var baseFrac = nv('baseFrac',60)/100;
  var rte = nv('rte',88)/100;
  var ratchet = nv('ratchet',0);
  var useCur = !!($('curRate') && $('curRate').checked);

  /* Price forward, not backward. The all-in demand rate on this meter moved
     three times in the packet; a trailing average under-prices every kW the
     battery will actually remove. */
  var curRate = bills[bills.length-1].rate;
  for(i=0;i<bills.length;i++){
    bills[i].rateAsBilled = bills[i].rate;
    bills[i].useRate = useCur ? curRate : bills[i].rate;
    if(!isFinite(bills[i].adj)) bills[i].adj = (bills[i].pay && bills[i].pay.adj) || 0;
  }

  var maxPeak = 0;
  for(i=0;i<bills.length;i++) if(bills[i].peak>maxPeak) maxPeak = bills[i].peak;

  var curves = [];
  for(i=0;i<bills.length;i++) curves.push(ldcFromBill(bills[i], baseFrac));

  var basePeaks = [];
  for(i=0;i<bills.length;i++) basePeaks.push(bills[i].peak);
  var baseBilled = applyRatchet(basePeaks, ratchet);
  var baseCost = 0;
  for(i=0;i<bills.length;i++) baseCost += demandCost(baseBilled[i], bills[i]);

  var cands = [], STEPS = 44;
  for(i=1;i<=STEPS;i++) cands.push(maxPeak*(0.015 + (0.70-0.015)*(i-1)/(STEPS-1)));

  var sweep = [], di, ci;
  for(di=0;di<durs.length;di++){
    for(ci=0;ci<cands.length;ci++){
      var kW = cands[ci], dur = durs[di], Emax = deliverableKwh(kW, dur);
      var peaks = [], p90peaks = [], disTot = 0, maxDay = 0, arb = 0, loss = 0;
      for(j=0;j<bills.length;j++){
        var c = curves[j], m = bills[j];
        var r  = shaveMonth(c, m.peak, kW, Emax, false);
        var rw = shaveMonth(c, m.peak, kW, Emax, true);
        peaks.push(r.target);
        p90peaks.push(rw.target);
        var monKwh = r.kwhDay * c.days;
        disTot += monKwh;
        if(r.kwhDay > maxDay) maxDay = r.kwhDay;
        var pay = m.pay;
        if(pay && pay.eDelta != null && isFinite(pay.eDelta)){
          arb  += monKwh * pay.eDelta * (1+ES_TAX);
          loss += monKwh * (1/rte-1) * ((pay.supply||0) + (pay.eOff||0)) * (1+ES_TAX);
        } else {
          loss += monKwh * (1/rte-1) * nv('eRate',0.075);
        }
      }
      var billed = applyRatchet(peaks, ratchet);
      var billed90 = applyRatchet(p90peaks, ratchet);
      var cost = 0, cost90 = 0;
      for(j=0;j<bills.length;j++){
        cost   += demandCost(billed[j],   bills[j]);
        cost90 += demandCost(billed90[j], bills[j]);
      }
      var scale = 12/bills.length;
      var e = econ(kW, Emax, (baseCost-cost)*scale, (loss-arb)*scale);
      e.dur = dur; e.effDur = kW>0 ? Math.round(Emax/kW*100)/100 : dur;
      /* Once the floor has been applied the pack IS energy-consistent, so
         econ's own `binding` reads "energy" and the reason the pack is that
         size disappears. This is the flag that keeps it: the duration the
         buyer gets is longer than the one they asked for, and they are
         paying for the difference whether they wanted it or not. */
      e.cRateForced = e.effDur > dur + 1e-6;
      e.peaks = peaks; e.billed = billed; e.billed90 = billed90;
      e.periodSav = baseCost-cost;
      e.p90Ann = (baseCost-cost90)*scale;
      e.maxEvt = maxDay;                       /* worst-day kWh, P50 shape */
      e.disAnn = disTot*scale;
      e.arbAnn = arb*scale; e.lossAnn = loss*scale;
      sweep.push(e);
    }
  }
  var best = pickBest(sweep);

  /* What this size saves with a given amount of usable energy. Same
     arithmetic as the sweep above, over the same locals, so the fade curve
     cannot drift from the sizing it describes. */
  function savingsWith(kW, Emax){
    var pk = [], jj;
    for(jj=0;jj<bills.length;jj++){
      pk.push(shaveMonth(curves[jj], bills[jj].peak, kW, Emax, false).target);
    }
    var bl = applyRatchet(pk, ratchet), cst = 0;
    for(jj=0;jj<bills.length;jj++) cst += demandCost(bl[jj], bills[jj]);
    return (baseCost - cst) * (12/bills.length);
  }

  RESULT = {
    mode:'bill', sweep:sweep, best:best, baseBilled:baseBilled, baseCost:baseCost,
    maxPeak:maxPeak, months:bills, curves:curves, dRate:curRate, nMon:bills.length,
    curRate:curRate, useCur:useCur, savingsWith:savingsWith
  };
  return RESULT;
}
function simMonth(load, dt, T, Pmax, Emax, rte, initialSoc){
  var soc = initialSoc == null ? 0 : Math.max(0,Math.min(Emax,initialSoc)), peak = 0, dis = 0, chargeKwh = 0, evt = 0, maxEvt = 0, i, n = load.length;
  for(i=0;i<n;i++){
    var p = load[i], net;
    if(p > T){
      var need = p - T;
      var out = need;
      if(out > Pmax) out = Pmax;
      var avail = soc/dt;
      if(out > avail) out = avail;
      net = p - out;
      soc -= out*dt; dis += out*dt; evt += out*dt;
    } else {
      if(evt > maxEvt) maxEvt = evt;
      evt = 0;
      var chg = T - p;
      if(chg > Pmax) chg = Pmax;
      var room = (Emax - soc)/(dt*rte);
      if(chg > room) chg = room;
      if(chg < 0) chg = 0;
      net = p + chg;
      soc += chg*dt*rte; chargeKwh += chg*dt;
    }
    if(net > peak) peak = net;
  }
  if(evt > maxEvt) maxEvt = evt;
  return { peak:peak, dis:dis, maxEvt:maxEvt, finalSoc:soc, chargeKwh:chargeKwh };
}
function solveMonth(m, Pmax, Emax, rte, initialSoc){
  var lo = m.min, hi = m.peak, best = m.peak, bestR = null, i;
  for(i=0;i<16;i++){
    var mid = (lo+hi)/2;
    var r = simMonth(m.load, m.dt, mid, Pmax, Emax, rte, initialSoc);
    if(r.peak <= mid*1.0008){ hi = mid; best = mid; bestR = r; }
    else lo = mid;
  }
  if(!bestR) bestR = simMonth(m.load, m.dt, m.peak, Pmax, Emax, rte, initialSoc);
  return { peak: Math.min(bestR.peak, m.peak), dis:bestR.dis, maxEvt:bestR.maxEvt, finalSoc:bestR.finalSoc, chargeKwh:bestR.chargeKwh };
}
function applyRatchet(peaks, pct){
  if(!pct) return peaks.slice();
  var out = [], i, j, n = peaks.length;
  for(i=0;i<n;i++){
    var hi = 0;
    for(j=Math.max(0,i-11); j<i; j++) if(peaks[j]>hi) hi = peaks[j];
    var floor = hi*pct/100;
    out.push(Math.max(peaks[i], floor));
  }
  return out;
}
function irr(cf){
  /* cf[0] is negative; bisection is plenty for a 10-25 year strip */
  var lo = -0.9, hi = 3, i, k, mid, v;
  function npvAt(r){ var s = 0, t; for(t=0;t<cf.length;t++) s += cf[t]/Math.pow(1+r,t); return s; }
  if(npvAt(lo) < 0 || npvAt(hi) > 0) return null;
  for(i=0;i<200;i++){ mid = (lo+hi)/2; v = npvAt(mid); if(v > 0) lo = mid; else hi = mid; }
  return (lo+hi)/2;
}
/* `curve` is the fraction of year-one demand savings the system still earns
   in each year, indexed from year 1.

   Without one, econ falls back to (1-fade)^(y-1) applied to SAVINGS, which
   is what this did before and is wrong in a way worth spelling out.
   Capacity fades, and savings come from shave DEPTH, not from capacity.
   The load duration curve is concave, so a pack that has lost 15% of its
   energy loses far less than 15% of the depth it can hold - measured on a
   real twelve-bill profile, scaling savings linearly understated year-eight
   savings by 13% and end-of-life savings by 29%.
   The caller computes the real curve by re-solving the shave at each year's
   state of health and passes it here. */
/* Savings, as a fraction of year one, at a given state of health.
   Linear between samples; the curve is smooth and the samples are 2.5%
   apart, so interpolation error is far below the fade rate's own
   uncertainty. Falls back to scaling by state of health when no curve was
   measured, which is the old behaviour and the conservative one. */
function savingsRatio(curve, soh){
  if(!curve || !curve.length) return soh;
  if(soh >= curve[0].soh) return curve[0].ratio;
  var i;
  for(i=1;i<curve.length;i++){
    if(soh >= curve[i].soh){
      var a = curve[i], b = curve[i-1];
      var span = b.soh - a.soh;
      if(!(span > 0)) return a.ratio;
      return a.ratio + (b.ratio - a.ratio)*(soh - a.soh)/span;
    }
  }
  return curve[curve.length-1].ratio;
}

function econ(kW, kWhUsable, annSav, lossCost, curve){
  var dod = nv('dod',90)/100;
  /* Nameplate is not usable energy divided by depth of discharge. That
     skips the DISCHARGE half of the round trip, which is sqrt(RTE), and it
     under-sizes the pack by about 6.6% at 88% - small enough to read as
     rounding, large enough to under-price every project the tool prices.
     The C-rate floor comes with it: a 0.5C battery cannot deliver its kW
     out of a pack sized only for its kWh, so a short-duration candidate
     has to grow whether the energy needs it or not.
     Both live in bess-capacity.js, shared with the design engine, so the
     sizer and the equipment schedule cannot disagree about nameplate. */
  var cap = CAP.chainKwh(kWhUsable, kW, {
    dodPct: nv('dod',90), rtePct: nv('rte',88),
    otherEffPct: nv('otherEff',100), cRate: nv('cRate',0.5)
  });
  var name = cap.nameplateKwh;
  var capex = name*nv('cKwh',450) + kW*nv('cKw',0);
  var itc = nv('itc',30)/100;
  /* A contingent incentive is not equity until it is awarded. The haircut is
     what an underwriter applies to a reservation that has not closed. */
  var incGross = nv('incent',0);
  var incNet = incGross*(1 - nv('incHair',0)/100);
  var net = capex*(1-itc) - incNet;
  if(net < 0) net = 0;
  var om = kW*nv('om',10);
  var term = Math.round(nv('term',10));
  var disc = nv('disc',8)/100;
  var fade = nv('fade',2)/100;
  var esc = nv('escal',3)/100;

  /* A pack that falls below its minimum usable state of health has to be
     replaced, and a twenty-year analysis that never books one is telling a
     funder the cells are free after year ten. At 2%/yr a pack crosses 70%
     in year eighteen; at 3%/yr it crosses in year twelve, well inside a
     common term. The replacement resets the fade clock, which is why the
     measured curve is keyed on state of health rather than on year. */
  var minSoh = clampPct(nv('minSoh',70))/100;
  var replPerKwh = nv('replKwh', nv('cKwh',450));
  /* Replacing cells is not rebuilding the plant: the converters, the pad,
     the switchgear and the interconnection all stay. Only the energy side
     is bought again, and the tax credit is not assumed to be available a
     second time. */
  var replCost = name*replPerKwh;

  /* The year-by-year strip behind the NPV, returned as it is computed so a
     caller that prices this system elsewhere (the pro forma's BESS revenue)
     books the same savings, fade and replacements the size was chosen on,
     instead of re-deriving them and drifting. */
  var cf = [-net], i, npv = -net, cum = -net, payback = Infinity, yr1 = 0, schedule = [];
  var age = 1, replacements = 0, firstRepl = null, replTotal = 0;
  for(i=1;i<=term;i++){
    var e = Math.pow(1+esc, i-1);
    var soh = Math.pow(1-fade, age-1);
    var replThisYear = 0;
    if(soh < minSoh && replPerKwh > 0){
      replThisYear = replCost;
      replacements++; replTotal += replCost;
      if(firstRepl === null) firstRepl = i;
      age = 1; soh = 1;
    }
    var ratio = savingsRatio(curve, soh);
    var sav = annSav*ratio*e;
    var c = sav - lossCost*e - om*e - replThisYear;
    schedule.push({ year:i, soh:soh, ratio:ratio, savings:sav, loss:lossCost*e, om:om*e,
                    replacement:replThisYear });
    if(i === 1) yr1 = c;
    cf.push(c);
    npv += c/Math.pow(1+disc, i);
    if(cum < 0 && cum + c >= 0) payback = i - 1 + (-cum)/c;
    cum += c;
    age++;
  }
  var r = irr(cf);
  return {
    kW:kW, kWh:kWhUsable, nameplate:name, capex:capex, net:net, om:om,
    degradation: curve ? 'measured' : 'linear',
    replacements: replacements, firstReplacementYear: firstRepl,
    replacementCost: replTotal, minSohPct: minSoh*100,
    cRateBound:cap.cRateBound, binding:cap.binding,
    effectiveCRate: name>0 ? Math.round(kW/name*10000)/10000 : 0,
    cRateFloorKwh: cap.cRateFloorKwh,
    incGross:incGross, incNet:incNet,
    annSav:annSav, lossCost:lossCost, yr1:yr1,
    payback: payback, npv:npv, irr:r,
    roi: net>0 ? (yr1/net*100) : 0,
    schedule: schedule
  };
}
function runInterval(){
  var durs = durations();
  var rte = nv('rte',88)/100;
  var dRate = nv('dRate',18.5);
  var ratchet = nv('ratchet',0);

  var maxPeak = 0, i;
  for(i=0;i<MONTHS.length;i++) if(MONTHS[i].peak>maxPeak) maxPeak = MONTHS[i].peak;

  /* candidate power ratings - coarse pass, refined around the optimum below */
  var cands = [], STEPS = 16, LOF = 0.02, HIF = 0.70;
  var coarseStep = maxPeak*(HIF-LOF)/(STEPS-1);
  for(i=1;i<=STEPS;i++) cands.push(maxPeak * (LOF + (HIF-LOF)*(i-1)/(STEPS-1)));

  var basePeaks = [];
  for(i=0;i<MONTHS.length;i++) basePeaks.push(MONTHS[i].peak);
  var baseBilled = applyRatchet(basePeaks, ratchet);
  var baseCost = 0;
  for(i=0;i<MONTHS.length;i++) baseCost += baseBilled[i]*dRate;

  var jobs = [], di, ci;
  for(di=0;di<durs.length;di++) for(ci=0;ci<cands.length;ci++) jobs.push({dur:durs[di], kW:cands[ci]});

  var sweep = [], idx = 0, refined = false;
  $('prog').style.display = 'block';
  $('out').style.display = 'none';

  function step(){
    var t0 = new Date().getTime();
    while(idx < jobs.length){
      var j = jobs[idx++];
      var Emax = deliverableKwh(j.kW, j.dur);
      var peaks = [], dis = 0, charge=0, maxEvt = 0, k, soc=0;
      for(k=0;k<MONTHS.length;k++){
        var r = solveMonth(MONTHS[k], j.kW, Emax, rte, soc);
        soc=r.finalSoc;charge+=r.chargeKwh;
        peaks.push(r.peak); dis += r.dis;
        if(r.maxEvt > maxEvt) maxEvt = r.maxEvt;
      }
      var billed = applyRatchet(peaks, ratchet);
      var cost = 0;
      for(k=0;k<MONTHS.length;k++) cost += billed[k]*dRate;
      var sav = baseCost - cost;
      var ann = sav * (12/MONTHS.length);
      var lossKwh = Math.max(0,charge-dis) * (12/MONTHS.length);
      var e = econ(j.kW, Emax, ann, lossKwh*nv('eRate',0.075));
      e.dur = j.dur; e.effDur = j.kW>0 ? Math.round(Emax/j.kW*100)/100 : j.dur;
      e.cRateForced = e.effDur > j.dur + 1e-6;
      e.peaks = peaks; e.billed = billed;
      e.periodSav = sav; e.maxEvt = maxEvt; e.disAnn = dis*(12/MONTHS.length);
      sweep.push(e);
    }
    var pct = Math.round(idx/jobs.length*100);
    $('progFill').style.width = pct+'%';
    $('progTxt').textContent = 'Simulating dispatch \u00b7 ' + idx + ' of ' + jobs.length + ' configurations';
    if(idx < jobs.length){ step(); return; }

    /* second pass: walk a finer grid around the coarse optimum */
    if(!refined){
      refined = true;
      var b0 = pickBest(sweep), q, dd;
      var lo2 = Math.max(maxPeak*0.005, b0.kW - coarseStep);
      var hi2 = Math.min(maxPeak*0.95,  b0.kW + coarseStep);
      for(dd=0;dd<durs.length;dd++){
        for(q=1;q<=7;q++){
          var kwq = lo2 + (hi2-lo2)*(q-1)/6;
          jobs.push({dur:durs[dd], kW:kwq});
        }
      }
      $('progTxt').textContent = 'Refining around the optimum';
      step(); return;
    }
    finishInterval(sweep, baseBilled, baseCost, maxPeak);
  }
  step();
}
function pickBest(sweep){
  var obj = $('obj').value, best = null, i;
  for(i=0;i<sweep.length;i++){
    var s = sweep[i];
    if(s.annSav <= 0) continue;
    if(!best){ best = s; continue; }
    if(obj==='npv' && s.npv > best.npv) best = s;
    else if(obj==='pay' && s.payback < best.payback) best = s;
    else if(obj==='sav' && s.annSav > best.annSav) best = s;
  }
  if(!best){
    best = sweep[0];
    for(i=0;i<sweep.length;i++) if(sweep[i].npv > best.npv) best = sweep[i];
    return best;
  }

  /* NOTHING PENCILS IS NOT THE SAME AS "BUILD A TINY ONE".
     On a flat demand tariff the return per dollar is CONSTANT across most
     of the sweep - the battery shaves proportionally until the load
     duration curve flattens - so when that constant return sits below the
     hurdle, every size is equally unviable and NPV just approaches zero
     from below as the battery approaches nothing. Ranking by NPV then
     returns 17 kW, and ranking by payback returns much the same. Neither
     is an answer; both are artefacts of ranking a set with no winner.
     When no size clears the hurdle, show the DEEPEST size that still holds
     the best available return per dollar. That says something true and
     useful next to the banner reporting that none of them pay back: this
     is the most the site can do, and this is how far short it falls. */
  var anyViable = false;
  for(i=0;i<sweep.length;i++) if(sweep[i].npv > 0){ anyViable = true; break; }
  if(!anyViable){
    var bestRatio = 0;
    for(i=0;i<sweep.length;i++){
      var c0 = sweep[i];
      if(!(c0.net > 0) || c0.annSav <= 0) continue;
      var r0 = c0.annSav / c0.net;
      if(r0 > bestRatio) bestRatio = r0;
    }
    if(bestRatio > 0){
      var deepest = null;
      for(i=0;i<sweep.length;i++){
        var c1 = sweep[i];
        if(!(c1.net > 0) || c1.annSav <= 0) continue;
        /* Within half a percent of the best return counts as the same
           return; among those, take the most capable system. */
        if(c1.annSav / c1.net >= bestRatio * 0.995){
          if(!deepest || c1.kW > deepest.kW) deepest = c1;
        }
      }
      if(deepest) best = deepest;
    }
  }
  return best;
}
function finishInterval(sweep, baseBilled, baseCost, maxPeak){
  $('prog').style.display = 'none';
  $('out').style.display = '';
  var best = pickBest(sweep);

  /* Same probe as the bill path, against the measured series. It re-runs
     the dispatch, so it is the real answer and not a scaling of one. */
  function savingsWith(kW, Emax){
    var rte = nv('rte',88)/100, dRate = nv('dRate',18.5), ratchet = nv('ratchet',0);
    var pk = [], soc = 0, k;
    for(k=0;k<MONTHS.length;k++){
      var r = solveMonth(MONTHS[k], kW, Emax, rte, soc);
      soc = r.finalSoc; pk.push(r.peak);
    }
    var bl = applyRatchet(pk, ratchet), cost = 0;
    for(k=0;k<MONTHS.length;k++) cost += bl[k]*dRate;
    return (baseCost - cost) * (12/MONTHS.length);
  }

  RESULT = {
    mode:'interval', sweep:sweep, best:best, baseBilled:baseBilled, baseCost:baseCost,
    maxPeak:maxPeak, months:MONTHS, dRate:nv('dRate',18.5), nMon:MONTHS.length,
    savingsWith:savingsWith
  };
  return RESULT;
}
function breakEven(R, b, REC, curve){
  var term = Math.round(nv('term',10)), disc = nv('disc',8)/100, fade = nv('fade',2)/100;
  var A = 0, B = 0, y;
  for(y=1;y<=term;y++){
    var degr = (curve && curve[y-1] != null) ? curve[y-1] : Math.pow(1-fade,y-1);
    A += degr*Math.pow(1+nv('escal',3)/100,y-1)/Math.pow(1+disc,y);
    B += Math.pow(1+nv('escal',3)/100,y-1)/Math.pow(1+disc,y);
  }
  var needSav = (REC.net + (b.lossCost + REC.om)*B) / A;
  var mult = b.annSav > 0 ? needSav/b.annSav : Infinity;
  /* cost side: net = nameplate * $/kWh * (1-itc). Read the nameplate the
     economics were actually priced against rather than deriving a second,
     lower one here - that is how the break-even cost came out optimistic. */
  var nameplate = REC.nameplate;
  var affordNet = b.annSav*A - (b.lossCost + REC.om)*B;
  var retention=1-nv('itc',30)/100;
  var costBe=nameplate>0&&retention>0 ? (affordNet+REC.incNet-REC.kW*nv('cKw',0)*retention)/(nameplate*retention) : null;
  return { needSav:needSav, mult:mult, rateBe: nv('dRate',18.5)*mult, costBe:costBe };
}
function probeDurations(){
  if(RESULT.mode !== 'interval' || !MONTHS || !MONTHS.length) return;
  var checked = durations(), all = [1,2,4,6], missing = [], i;
  for(i=0;i<all.length;i++) if(checked.indexOf(all[i]) < 0) missing.push(all[i]);
  if(!missing.length) return;

  var rte = nv('rte',88)/100, dRate = nv('dRate',18.5), ratchet = nv('ratchet',0);
  var maxPeak = RESULT.maxPeak, best = null, k, d, ci;
  var sizes = [RESULT.best.kW, maxPeak*0.05, maxPeak*0.12];

  for(d=0; d<missing.length; d++){
    for(ci=0; ci<sizes.length; ci++){
      var kW = sizes[ci], Emax = deliverableKwh(kW, missing[d]);
      var peaks = [], dis = 0, charge=0, soc=0;
      for(k=0;k<MONTHS.length;k++){
        var r = solveMonth(MONTHS[k], kW, Emax, rte, soc);
        soc=r.finalSoc;charge+=r.chargeKwh;
        peaks.push(r.peak); dis += r.dis;
      }
      var billed = applyRatchet(peaks, ratchet), cost = 0;
      for(k=0;k<MONTHS.length;k++) cost += billed[k]*dRate;
      var ann = (RESULT.baseCost - cost)*(12/MONTHS.length);
      var loss = Math.max(0,charge-dis)*(12/MONTHS.length)*nv('eRate',0.075);
      var head = nv('headroom',10)/100;
      var e = econ(kW*(1+head), Emax*(1+head), ann, loss, RESULT.fadeCurve);
      e.dur = missing[d];
      if(!best || e.npv > best.npv) best = e;
    }
  }
  return best;
}
function underwriting(R, b, REC){
  if(R.mode !== 'bill') return '';
  var i, h = '';
  var term = Math.round(nv('term',10)), disc = nv('disc',8)/100;
  var pay = REC.net > 0 && disc > 0
        ? REC.net * disc/(1-Math.pow(1+disc,-term))
        : REC.net/term;
  var head = nv('headroom',10)/100;
  var p90 = b.p90Ann*(1) - b.lossCost - REC.om;          /* worst credible shape */
  var yr1 = REC.yr1;
  var dscr = pay > 0 ? yr1/pay : 0;
  var dscr90 = pay > 0 ? p90/pay : 0;
  var perKw = REC.kW > 0 ? yr1/REC.kW : 0;

  h += '<div style="height:16px"></div>';
  h += '<div class="card-h" style="border-top:1px solid var(--border2);margin:0 -14px;padding-left:14px">Underwriting</div>';
  h += '<div class="kpis" style="border:1px solid var(--border);border-radius:4px;overflow:hidden;margin-top:12px">'
    +  kpi('Yr-1 net savings', money(yr1), '', money(perKw,0)+'/kW-yr', true)
    +  kpi('Level payment', money(pay), '/yr', term+' yr at '+fmt(disc*100,1)+'%')
    +  kpi('Coverage (P50)', fmt(dscr,2)+'x', '', 'savings over payment', dscr>=1.25)
    +  kpi('Coverage (downside)', fmt(dscr90,2)+'x', '', 'flat-top load shape', false)
    +  '</div>';

  /* --- what the two shapes cost --- */
  h += '<div class="scrollx" style="margin:12px -14px 0"><table class="t"><thead><tr>'
    +  '<th>Case</th><th class="num">Shape</th><th class="num">Worst-day kWh</th>'
    +  '<th class="num">Annual demand saving</th><th class="num">Coverage</th></tr></thead><tbody>';
  h += '<tr><td class="tx">Base</td><td class="num">'+fmt(nv('baseFrac',60))+'% base load</td>'
    +  '<td class="num">'+fmt(b.maxEvt)+'</td><td class="num">'+money(b.annSav)+'</td>'
    +  '<td class="num">'+fmt(dscr,2)+'x</td></tr>';
  h += '<tr><td class="tx">Downside</td><td class="num">flat-top</td>'
    +  '<td class="num">'+fmt(b.kWh)+'+</td><td class="num">'+money(b.p90Ann)+'</td>'
    +  '<td class="num">'+fmt(dscr90,2)+'x</td></tr>';
  h += '</tbody></table></div>';

  /* --- the assumptions that are not readings --- */
  var flags = [], months = {}, miss = [];
  for(i=0;i<R.months.length;i++) months[R.months[i].label] = 1;
  var last = R.months[R.months.length-1].label.split(' ');
  var li = 0, k;
  for(k=0;k<12;k++) if(MONNAMES[k] === last[0]) li = k;
  var ly = +last[1];
  for(i=11;i>=0;i--){
    var mi = ((li-i)%12+12)%12, yy = ly + (li-i < 0 ? -1 : 0);
    if(!months[MONNAMES[mi]+' '+yy]) miss.push(MONNAMES[mi]+' '+yy);
  }
  if(miss.length) flags.push('<b>'+miss.length+' of the last 12 months are missing</b> ('+esc(miss.join(', '))
    + '). Annual savings are scaled from the months present, so a missing winter month understates both the saving and the kW rating.');
  flags.push('<b>No interval data.</b> Bills give totals, not shape. The two rows above are the same meter under the '
    + 'flattest and the peakiest reading of the same numbers, and they differ by '
    + (b.annSav>0 ? fmt((1-b.p90Ann/b.annSav)*100,0)+'%' : 'a wide margin')
    + ' of the savings. Fifteen-minute data from Eversource closes that gap and is what turns this from an estimate into a model.');
  if(R.useCur) flags.push('Every month is priced at the newest all-in rate on the packet, '
    + money(R.curRate,2)+'/kW-month. That is the forward-looking number; historical bills on this meter were charged less.');
  var tou = 0;
  for(i=0;i<R.months.length;i++) if(R.months[i].pay) tou++;
  if(tou) flags.push('Determinant is the <b>max on-peak</b> demand, not the higher off-peak figure printed beside it. '
    + 'A battery that shaves the off-peak peak on this tariff saves nothing.');

  h += '<div class="note" style="margin-top:12px"><b>Before this goes to a funder</b><ul style="margin:8px 0 0 18px;padding:0">';
  for(i=0;i<flags.length;i++) h += '<li style="margin-bottom:6px">'+flags[i]+'</li>';
  h += '</ul></div>';
  return h;
}
function shortPeriodCallout(R, b){
  var i, h = '';
  var head = Math.round(nv('headroom',10));
  var billedAfter = applyRatchet(b.peaks, nv('ratchet',0));

  if(R.nMon === 1){
    var m = R.months[0];
    var rate = (R.mode==='bill') ? m.rate : R.dRate;
    var cost = R.baseBilled[0]*rate;
    var newCost = billedAfter[0]*rate;
    h += '<div style="height:14px"></div>';
    h += '<div class="card-h" style="border-top:1px solid var(--border2);margin:0 -14px;padding-left:14px" data-help="rOne">What '+m.label+' alone would have taken</div>';
    h += '<div class="note ok" style="margin-top:12px"><b>'+m.label+':</b> billed demand of '+fmt(m.peak)+' kW at '+money(rate,2)+'/kW cost '
      +  money(cost)+'. A '+fmt(b.kW*(1+head/100))+' kW / '+fmt(b.kWh*(1+head/100))+' kWh battery would have held the meter to '
      +  fmt(billedAfter[0])+' kW &mdash; a bill of '+money(newCost)+', saving <b>'+money(cost-newCost)+'</b> that month.</div>';

    /* shave-depth ladder */
    h += '<div class="scrollx" style="margin:0 -14px"><table class="t"><thead><tr>'
      +  '<th data-help="rLadder">Shave</th><th class="num">Target kW</th><th class="num">Battery kW</th><th class="num">Usable kWh</th>'
      +  '<th class="num">Duration</th><th class="num">Saved this month</th><th class="num">If every month</th></tr></thead><tbody>';
    var impractical = 0;
    var depths = [0.05,0.10,0.15,0.20,0.25,0.30,0.40];
    for(i=0;i<depths.length;i++){
      var kW = m.peak*depths[i];
      var T = m.peak - kW;
      var kWh, ach;
      if(R.mode==='interval'){
        /* find the kWh that actually holds T, then confirm by simulation */
        var need = energyNeeded(m, T);
        kWh = need*1.15;
        var r = simMonth(m.load, m.dt, T, kW, kWh, nv('rte',88)/100);
        ach = Math.max(r.peak, T);
      } else {
        var c = R.curves[0];
        var perEvt = energyAbove(c, T);   /* already the worst DAY, not the month */
        kWh = perEvt*1.15;
        ach = Math.max(T, c.pmin);
      }
      var rate2 = (R.mode==='bill') ? m.rate : R.dRate;
      var sv = (m.peak - ach)*rate2;
      var dur = kW>0 ? kWh/kW : 0;
      var bad = dur > 8;
      if(bad) impractical++;
      h += '<tr'+(bad?' style="opacity:.55"':'')+'><td class="tx">'+fmt(depths[i]*100)+'%</td><td class="num">'+fmt(T)+'</td>'
        +  '<td class="num">'+fmt(kW)+'</td><td class="num">'+fmt(kWh)+'</td>'
        +  '<td class="num">'+fmt(dur,1)+'h'+(bad?' <span class="pill r">long</span>':'')+'</td>'
        +  '<td class="num">'+money(sv)+'</td><td class="num" style="color:var(--sub)">'+money(sv*12)+'</td></tr>';
    }
    h += '</tbody></table></div>';
    if(impractical) h += '<div class="hint" style="padding:0 0 4px">Rows marked <span class="pill r">long</span> need more than 8 hours of duration to hold the target. That is a flat load profile, not a peak-shaving opportunity &mdash; the energy cost of those rows will not pencil against demand charges alone.</div>';
    h += '<div class="note bad"><b>Do not size a system on this.</b> One month sets a floor, not a rating. If '+m.label
      +  ' is not your highest-demand month, the annual peak is higher and this battery will be short on power exactly when it matters. '
      +  'The "if every month" column assumes an identical peak all twelve months, which no site does. Get 12 months of bills, or better, a year of interval data, before this number goes in a proposal.</div>';
  } else {
    h += '<div class="note" data-help="rShort"><b>'+R.nMon+' months of data.</b> Annual figures scale the observed savings by '+fmt(12/R.nMon,2)
      +  '\u00d7. Demand charges are driven by the single worst interval in each period, so if these months exclude the seasonal peak, '
      +  'both the savings and the required power rating are understated.</div>';
  }
  return h;
}
function fmt(n,d){
  if(n==null || !isFinite(n)) return '--';
  d = (d===undefined)?0:d;
  var s = Math.abs(n).toFixed(d), p = s.split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return (n<0?'-':'') + p.join('.');
}
function money(n,d){ return '$'+fmt(n,(d===undefined)?0:d); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function kpi(k,v,u,s,hl,hk){
  return '<div class="kpi'+(hl?' hl':'')+'"><div class="k"'+(hk?' data-help="'+hk+'"':'')+'>'+k+'</div><div class="v">'+v+(u?'<span class="u">'+u+'</span>':'')+'</div><div class="s">'+s+'</div></div>';
}
function bRow(k,v){ return '<tr><td class="tx" style="color:var(--sub)">'+k+'</td><td class="num" style="text-align:left;padding-left:20px">'+v+'</td></tr>'; }
function energyNeeded(m, T){
  var i, evt=0, mx=0;
  for(i=0;i<m.load.length;i++){
    if(m.load[i] > T) evt += (m.load[i]-T)*m.dt;
    else { if(evt>mx) mx=evt; evt=0; }
  }
  if(evt>mx) mx=evt;
  return mx;
}
 if(input.mode==='tool-interval') runInterval(); else runBills(input.data);
 if(!RESULT||!RESULT.best)throw new Error('No sizing candidates.');

 /* ---- degradation, measured rather than assumed ---------------------
    A faded pack holds less energy, and the shave it can still hold is
    found by re-solving against the load, not by scaling last year's
    savings. The difference is large and one-sided: on a twelve-bill
    profile, scaling linearly understated year-eight savings by 13% and
    end-of-life savings by 29%, because the load duration curve is concave
    and the first kWh lost costs far less depth than the last.

    The samples are keyed on STATE OF HEALTH, not on year, so that a
    replacement can reset the clock and the same measurements still apply
    to the new pack. A year-indexed curve cannot express that.

    The curve is measured on ONE candidate and applied to the whole sweep.
    Measuring it per candidate is the exact answer and is not affordable -
    on a twelve-bill run that is 21,000 shave solves - so instead the pick
    is re-made with the curve and, if it moved, the curve is re-measured on
    the size that won. Two or three passes and it stops moving; a size with
    more energy headroom than its duty fades more gently, and that is the
    difference the loop is chasing. */
 var termYears = Math.round(nv('term',10));
 var fadeRate  = nv('fade',2)/100;
 RESULT.fadeCurve = null;
 RESULT.fadePasses = 0;
 if(typeof RESULT.savingsWith === 'function' && RESULT.best.annSav > 0 && termYears > 0){
  try{
   var probe = RESULT.savingsWith;
   var pass, prevKw = null, prevDur = null;
   for(pass=0; pass<3; pass++){
    var b0 = RESULT.best;
    if(b0.kW === prevKw && b0.dur === prevDur) break;   /* converged */
    prevKw = b0.kW; prevDur = b0.dur;
    var full = probe(b0.kW, b0.kWh);
    if(!(full > 0)) break;
    /* Sampled from a new pack down to well past any sane replacement
       threshold, at 2.5% intervals. econ interpolates between samples. */
    var curve = [], ss, sv;
    for(ss=100; ss>=50; ss-=2.5){
     sv = probe(b0.kW, b0.kWh*(ss/100));
     /* A faded pack cannot out-earn a new one; clamp rather than trust a
        solver artefact at the edge of the search. */
     curve.push({ soh: ss/100, ratio: Math.max(0, Math.min(1, sv/full)) });
    }
    RESULT.fadeCurve = curve;
    RESULT.fadePasses = pass + 1;
    var i2;
    for(i2=0;i2<RESULT.sweep.length;i2++){
     var c2 = RESULT.sweep[i2];
     var e2 = econ(c2.kW, c2.kWh, c2.annSav, c2.lossCost, curve);
     var k2; for(k2 in e2) if(Object.prototype.hasOwnProperty.call(e2,k2)) c2[k2] = e2[k2];
    }
    RESULT.best = pickBest(RESULT.sweep);
   }
  }catch(e){ RESULT.fadeCurve = null; }
 }

 var b=RESULT.best, head=1+Math.round(nv('headroom',10))/100;
 /* The recommendation's pricing, for any sweep row: a caller that lists
    other sizes beside the pick (the pro forma's alternatives) prices them
    on the same headroom and fade curve, not at their un-grossed optimum.
    A function, like savingsWith, so it never reaches a JSON response. */
 RESULT.priceWithHeadroom=function(s){return econ(s.kW*head,s.kWh*head,s.annSav,s.lossCost,RESULT.fadeCurve);};
 RESULT.rec=RESULT.priceWithHeadroom(b);
 RESULT.breakEven=breakEven(RESULT,b,RESULT.rec,RESULT.fadeCurve);
 RESULT.underwriting=underwriting(RESULT,b,RESULT.rec);
 RESULT.shortPeriod=RESULT.nMon<12?shortPeriodCallout(RESULT,b):'';
 RESULT.durationProbe=probeDurations()||null;
 /* The year-by-year strip is for a caller that prices this system
    elsewhere and says so (input.keepSchedule, the pro forma's bridge), and
    only the recommendation's. Everything else drops it, so a Battery Sizer
    response is byte for byte what it was before the strip existed. */
 RESULT.sweep.forEach(function(s){ delete s.schedule; });
 if(RESULT.durationProbe) delete RESULT.durationProbe.schedule;
 if(input.keepSchedule!==true) delete RESULT.rec.schedule;
 RESULT.costRows=RESULT.months.map(function(m,i){return {before:RESULT.mode==='interval'?RESULT.baseBilled[i]*nv('dRate',18.5):demandCost(RESULT.baseBilled[i],m),after:RESULT.mode==='interval'?b.billed[i]*nv('dRate',18.5):demandCost(b.billed[i],m)};});

 if(RESULT.mode==='interval'){
  var soc=0, rte=nv('rte',88)/100;
  RESULT.netProfiles=RESULT.months.map(function(m,k){
   var target=b.peaks[k];
   return m.load.map(function(load){
    var net=load;
    if(load>target){var out=Math.min(load-target,b.kW,soc/m.dt);soc-=out*m.dt;net-=out;}
    else {var charge=Math.max(0,Math.min(target-load,b.kW,(b.kWh-soc)/(m.dt*rte)));soc+=charge*m.dt*rte;net+=charge;}
    return net;
   });
  });
  RESULT.dispatchBasis='Starts empty and carries state of charge across all modeled months.';
 }
 return RESULT;
};
/* The request contract ships with the engine it protects: every door that
   hands this function a request (api/bess-size.js, the pro forma's
   proforma-sizing.js) refuses bad input with the same rules. */
module.exports.validate = require('./bess-size-validate');
