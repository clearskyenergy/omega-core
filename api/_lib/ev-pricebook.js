/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The EV Cost Workbook's price books and its rate switch, moved out of
   ev-cost-workbook.html (2026-10-13): the Eversource rate card calibrated
   on filed submissions, the Level 2 baseline from four closed jobs, the
   standard items, the National Grid price book with its confirmed
   per-plug prices and band, the DCFC baseline and its labour curves. Pure,
   ES5, no I/O. The page sends what it knows about the job and draws the
   lines and rates that come back; a signed-in rep may still override a
   rate in Rate settings, and those overrides ride on the request. */
'use strict';
function num(v){ if(v==null||v==='') return 0; var n=parseFloat(String(v).replace(/[^0-9.\-]/g,'')); return isFinite(n)?n:0; }
function r2(n){ return Math.round((n||0)*100)/100; }
function money(n){ return '$'+r2(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function ngRound(x){ x=+x||0; return Math.round(Number((x*100).toFixed(6)))/100; }
function ngStationsFor(ports){ ports=num(ports); return ports>0 ? Math.max(1, Math.ceil(ports/2)) : 0; }
var PERMIT_PCT = 0.03;
var DCFC_BASELINE = {
  source:'Master formula template — 50 Fitch St, New Haven CT, 2 x 320kW',
  taxRate:6.35,
  rebateCap:250000,
  evseEligibleShare:0.5,          /* =SUM(I39:I41,I43)/2 in their sheet */

  perSite:{ design:{lab:11200}, permit:{lab:7500}, survey:{lab:8934},
            panel1200A:{mat:39050, lab:14000},
            xfmrVault:{mat:11000, lab:0} },
  perUnit:{ charger320:{mat:120000, lab:0},
            shipping:{mat:5000, lab:0},
            install:{mat:0, lab:15000},
            powerPack:{mat:2500, lab:0},
            concretePad:{mat:4500, lab:6750},
            bollard:{mat:450, lab:0},
            activation:{mat:4000, lab:0} },
  perFoot:{ trenchPaved:{mat:60, labPerFt:80},        /* =E19*80, flat */
            trenchTurf:{mat:40, stepped:'trench'},
            conduitUG:{mat:32, stepped:'trench'},
            conduitAG:{mat:22, stepped:'trench'},
            restoration:{mat:17.5, stepped:'trench'},
            fpPrimary:{mat:35, stepped:'fp'} },
  agStandardFt:30,                /* their sheet standardises AG run at 30 */
  fpSlackFt:7                     /* stub slack into in-ground junction */
};
var STANDARD_ITEMS = {
  l2:{ networking:{mat:480, lab:0, per:'port', label:'EVSE networking / software'},
       freight:{mat:0, lab:162.50, per:'port', label:'EVSE freight / shipping'},
       wallMount:{mat:225, lab:500, per:'port', label:'Wall-mount kits'},
       pedestal:{mat:1250, lab:500, per:'pedestal', label:'Pedestals & mounting'},
       /* ── THE PEDESTAL THE HARDWARE ACTUALLY SITS ON ──────────────────
          A floor-standing L2 charger needs a pedestal, one per UNIT — a
          single-port AC Pro gets its own, a dual-port AC Ultra shares one
          between its two ports. At about $450 each.

          Separate from the `pedestal` allowance above, which is the
          $1,250 + $500 "pedestal & mounting" figure carried on the filed
          Eversource sheets and is left alone. This is the accessory line
          that was missing entirely: on a 10 x Autel AC Pro job the
          utility form's "Other (cable management, mounting kits)" row
          came out at zero, because STANDARD had no pedestal entry and
          standardRate had no case for one. */
       pedestalUnit:{mat:450, lab:0, per:'unit', label:'Charger pedestals'},
       bollard:{mat:250, lab:300, per:'pedestal', label:'Protective bollards'},
       metering:{mat:210, lab:2000, per:'site', label:'Metering equipment'},
       /* ── A SERVICE PEDESTAL DRAWN ON THE SITE MAP ─────────────────────
          A freestanding meter socket + main breaker on its own base, fed
          by an underground lateral: a NEW utility service out by the
          stalls ("2 new pedestal services", 431-437 Sunderland St,
          2026-09-28). The editor counts them (counts.servicePedestal) and
          the Utility metering row is priced per pedestal: the filed
          metering rate for the socket and its labour, plus this pedestal
          hardware. The hardware figure is an ALLOWANCE, not a filed rate;
          the row says so and the rep confirms it against the utility spec. */
       servicePedestal:{mat:1450, lab:0, per:'pedestal', label:'Service pedestal (meter socket + main, freestanding)'},
       housePanel:{mat:0, lab:1250, per:'site', label:'House panel upgrade'},
       xfmrPad:{mat:1200, lab:1300, per:'site', label:'Utility transformer pad'} },
  dcfc:{ activation:{mat:4000, lab:0, per:'unit', label:'Activation fee'},
         powerPack:{mat:2500, lab:0, per:'unit', label:'Power packs / commissioning'},
         shipping:{mat:5000, lab:0, per:'unit', label:'Shipping & handling / freight'},
         bollard:{mat:450, lab:0, per:'unit', label:'Protective bollards'},
         survey:{mat:0, lab:8934, per:'site', label:'A2 survey & other'} }
};
var L2_BASELINE = {
  /* Calibrated against four closed Lionheart / Three Phase jobs rather than
     one, so the rates hold across site sizes instead of fitting a single bid:

       1040 Barnum Ave   UI CT      2 ports     $46,350
       27 Oak Street     ES CT      4 ports     $58,327
       17 Calhoun St     ES MA      4 ports     $56,949
       75 Avon Place     ES MA     10 ports    $176,555

     Design & engineering lands on $1,000/port in ALL FOUR — $2,000 at two
     ports, $4,000 at four (twice), $10,000 at ten. That is a rate, not a
     coincidence, and it is the strongest scaling signal in the data.
     Bollards ($250 + $300), pedestals ($1,250), EVSE install ($1,250/port)
     and networking ($480/port) are identical across all four as well.

     Where the jobs disagree it is by STATE, not by chance: CT trench
     material runs $15/lf, MA $25/lf. So state-dependent rates are split
     rather than averaged into a number that is wrong everywhere. */
  source:'4 closed jobs, 2–10 ports, CT + MA, 2026',
  taxRate:6.35,

  perPort:  { charger:{mat:2495.00, lab:0},        /* CT; MA runs 2200      */
              chargerMA:{mat:2200.00, lab:0},
              install:{mat:0, lab:1250.00},        /* identical all 4 jobs  */
              design:{mat:0, lab:1000.00},         /* $1,000/port, all 4    */
              networking:{mat:480.00, lab:0} },    /* public L2 / MUD only  */
  perUnit:  { pedestal:{mat:1250.00, lab:500.00},  /* one per 2 ports       */
              bollard:{mat:250.00, lab:300.00},
              concreteBase:{mat:800.00, lab:400.00},
              xfmrPad:{mat:1200.00, lab:1300.00} },/* NOT default — see below */
  perSite:  { permit:{mat:0, lab:1032.00},
              panel:{mat:2747.00, lab:4000.00},
              housePanel:{mat:1500.00, lab:2500.00},
              metering:{mat:1050.00, lab:2000.00} },
  perFoot:  { trenchCT:{mat:15.00, lab:80.00},
              trenchMA:{mat:25.00, lab:120.00},
              trenchTurf:{mat:10.00, lab:55.00},
              /* Conduit and cable priced together, per foot of RUN, from a
                 submitted Eversource sheet that cleared review:

                   underground   1,168 LF  ->  $2,277.60 mat / $2,920.00 lab
                   above ground    240 LF  ->  $1,203.00 mat / $1,230.00 lab

                 = $1.95 + $2.50 per foot underground, $5.01 + $5.13 above.
                 The old split rates summed to $5.25 material and $17.34
                 LABOR per foot — seven times the real figure, which on that
                 1,168 LF run bills $20,253 against an actual $2,920. The
                 National Grid jobs corroborate the labor at $2.50-$3.04.

                 Above ground costs more per foot and nothing to dig: RMC,
                 straps and standoffs, and on a new service the lateral
                 structure rides in this row. */
              conduitCableUG:{mat:1.95, lab:2.50},
              conduitCableAG:{mat:5.0125, lab:5.125},
              conduitUG:{mat:2.75, lab:13.87},   /* legacy split, unused    */
              conduitAG:{mat:4.25, lab:21.26},
              cableUG:{mat:2.50, lab:3.47},
              cableAG:{mat:2.50, lab:21.00},
              restoration:{mat:43.00, lab:20.00} },
  futureProof:{ trench:{mat:0, lab:27.83}, conduit:{mat:4.73, lab:6.79} },

  /* A utility transformer pad appeared on two of the four jobs and was left
     blank on the other two — 27 Oak and 1040 Barnum both tap an existing
     service and need no pad at all. At $2,500 installed it moves a small
     job several percent, so it is opt-in. Defaulting it on quietly inflates
     every estimate for a site that does not need one. */
  optional:{ transformerPad:false, metering:false, housePanel:false,
             networking:false, concreteBase:true }
};
var NG_MA_RATES = {
  source:'3 closed National Grid MA submissions, 4-6 ports, 2026',
  bollard:{ mat:250,  lab:300  },        /* each  — all three jobs */
  charger:{ mat:2200, lab:0    },        /* port  — all three jobs */
  mount:{   mat:1250, lab:0    },        /* each  — all three jobs */
  network:{ mat:480,  lab:0    },        /* port  — all three + NG chart */
  trenchPaved:{ mat:25, lab:120 },       /* LF    — Oxford + East St */
  trenchTurf:{  mat:15, lab:100 }        /* LF    — East St */
};
var NG_PRICE = {
  version:'v2 (2026-09-28)',
  designPerPort:1423,                            /* row 10: labour x P     */
  trenchPaved:{ mat:30, lab:110 },                /* row 12: per LF ($100 labour before 2026-09-28) */
  trenchUnpaved:null,                            /* row 13: NO RATE -- ask  */
  conduit:{ matPerFt:1.90, labBase:1100, labPerFt:2.50 },   /* row 14   */
  bollard:{ mat:250, lab:300 },                  /* row 15: x S (was two a station) */
  handhole:null,                                 /* row 16: NO RATE -- ask  */
  pad:{ mat:500, lab:1000 },                     /* row 17: x S            */
  panel:{                                        /* row 18                 */
    standard:{ key:'standard', mat:1451.22, lab:621,   qty:2, label:'Standard panel package (no new service)' },
    single:  { key:'single',   mat:6600,    lab:12550, qty:1, label:'New 200A single-phase service' },
    three:   { key:'three',    mat:8910,    lab:12550, qty:1, label:'New 200A three-phase service' }  /* 6,600 x 1.35 */
  },
  other:{ mat:1200, labPerPort:2360 },           /* row 19: materials flat, install labour x P */
  /* row 27: x P. Both CONFIRMED (Tommy, 2026-09-29: "50 amp $2k/plug,
     80 amp $3,050/plug. use that pricing"): the AC Elite 50A at $2,000 a
     plug ($4,000 a dual-port station) and the AC Pro 80A at $3,050 a plug
     ($6,100 a station), the figure Concord's filed sheets carried. For the
     record, Autel's April 2026 list (LHE_Autel Charger Product Price,
     Drive) has the AC Pro at $1,599 MSRP / $1,119.30 Lionheart and the
     Elite at $1,066 / $799.50, so the 80 A sells at 2.7x its Lionheart cost
     against the 50 A's 2.5x. A per-job figure under Program details
     overrides the 80 A; null puts the ask back. */
  hardware:{ a50:2000, a80:3050 },
  kw80:15,                                       /* kW at or above this is an 80 A (19.2 kW) unit */
  pedestal:1150,                                 /* row 28: x S            */
  freightPerPort:50,                             /* row 29: x P            */
  networkPerPort:480,                            /* row 32 (MUD, Public) or 45: x P */
  signage:{ mat:400, lab:190 },                  /* row 34: lump sum, P + 1 labels */
  taxRate:0.0625,
  band:{ lo:10500, hi:13500, target:12000 }
};
var RATE_CARD = {
  source:'5 Eversource MA submissions, 4-10 ports, 2026',

  /* per foot of run ─────────────────────────────────────────────────── */
  trenchPaved:   { mat:15.00, lab:80.00, n:5, note:'continuously paved (asphalt/concrete)' },
  trenchTurf:    { mat:10.00, lab:60.00, n:1, note:'non-continuously paved (grass/ground cover)' },
  conduitCableUG:{ mat:1.95,  lab:2.50,  n:5, note:'conduit + conductors, underground' },
  /* Above ground is NOT a per-foot labor rate. It looked like one and the
     three filed jobs disagreed wildly ($3.25, $3.85, $5.13 per foot) — but
     solving a + b*ft gives $1,170 + $0.25/LF, which is EXACT on all three:
     240 LF -> $1,230.00 | 325 LF -> $1,251.25 | 390 LF -> $1,267.50.
     It is a setup cost (risers, standoffs, terminations at both ends) with a
     small per-foot component, so a mid per-foot rate was wrong at every
     length. Material is a clean $1.95/LF on all three. */
  conduitCableAG:{ mat:1.95, labBase:1170, labPerFt:0.25, n:3,
                   note:'above ground/indoor; labor is setup + $0.25/LF' },
  /* 17 Calhoun carries $735 more material than $1.95/LF, and its own note
     says why: "includes new-service structure (underground lateral - no
     riser) per Price Guide". That is a scope item, not a rate, so it is
     added only when the job actually has a new service — never silently. */
  newServiceStructure:{ mat:735, lab:0, n:1 },

  /* each ────────────────────────────────────────────────────────────── */
  bollard:       { mat:250,  lab:300,  n:5 },
  concreteBase:  { mat:800,  lab:400,  n:4, note:'one per dual-port pedestal' },
  xfmrPad:       { mat:1200, lab:1300, n:3, note:"3'x5' utility transformer pad" },
  mountKit:      { mat:1250, lab:500,  n:4, note:'pedestal / mounting kit per unit' },

  /* per port ────────────────────────────────────────────────────────── */
  charger:       { mat:2200, lab:0,    n:5 },
  install:       { mat:0,    lab:1250, n:5, note:'EVSE installation labor' },
  network:       { mat:480,  lab:0,    n:5, note:'matches the National Grid MUD chart too' },

  /* per site ────────────────────────────────────────────────────────── */
  housePanel:    { mat:0,    lab:1250, n:2, note:'house/owner panel upgrade' },
  metering:      { mat:210,  lab:2000, n:3, note:'meter socket; 788 on a CT-cabinet service' },

  /* formulas, not prices ────────────────────────────────────────────── */
  pedestalsFor:  function(ports){ return Math.max(1, Math.ceil(num(ports)/2)); },
  breakersFor:   function(ports){ return num(ports)+3; },
  /* Both halves are overridable in Rate settings. */
  freightFor:    function(ports){
                   var b=num(RATE_CARD._freightBase), p=num(RATE_CARD._freightPort);
                   return (b||250) + (p||100)*num(ports);
                 },

  /* ── FUTURE PROOFING ────────────────────────────────────────────────
     A position built out now but not energised: spare conduit and cable
     pulled to the pad while the trench is open, plus a panel position held
     for it. No EVSE, no networking, no install labour — there is no port
     yet, which is why every programme books it as INELIGIBLE rather than
     make-ready. What it saves is the second mobilisation and a second
     trench, not the materials. */
  fpPanelPosition:{ mat:500, lab:1000, n:1, note:'per position, from the 50 Fitch St FP block' },
  /* Future proofing extends the DITCH by a stall or two, not by the length
     of the job. The 112 Willow baseline is explicit: 156 LF of live trench
     and 10 LF on the future-proofing row — one parking space. Carrying the
     whole run into future proofing put thousands of ineligible excavation
     on a sheet for a ditch already dug and already claimed.

     The spare CONDUIT is different: the pipe is pulled the whole route
     alongside the live run, which is why that same sheet shows 156 LF of
     future-proofing conduit against 10 LF of future-proofing trench. */
  fpStallWidthFt: 10,                 /* one parking space of extra ditch */
  fpMaxStalls: 2,                     /* "one or two spaces", not the job  */
  fpConduit: { mat:1.95, lab:2.50 }   /* same pipe, same ditch, dug once */
};
function scopeNote(row, qty, ports){
  var q=r2(qty)||0, n=Math.round(q);
  switch(row){
    case 'trench':
      return n+' LF \u2014 Trenching & backfill through continuously-paved area '
        +'(asphalt/concrete). Scope includes: saw-cutting pavement, excavation to required depth, '
        +'spoils haul-off/disposal, gravel and sand bedding & backfill, mechanical compaction in '
        +'lifts, base-course millings, hot-mix asphalt patch, and rolling to restore the driving '
        +'surface to compacted grade. Per NEC 300.5 (24-in min cover, warning tape).';
    case 'trenchTurf':
      return n+' LF \u2014 Trenching & backfill through non-continuously-paved area (grass/ground '
        +'cover). Scope includes: sod/topsoil strip and set aside, excavation to required depth, '
        +'sand bedding, backfill and compaction in lifts, topsoil replacement, seed or sod '
        +'restoration. Per NEC 300.5 (24-in min cover, warning tape).';
    case 'conduit':
      return n+' LF \u2014 Underground conduit & cable (make-ready). Scope includes: furnish & '
        +'install Sch 40 PVC conduit in parallel runs, pull conductors (3 wires/run + EGC), '
        +'couplings/sweeps/fittings, mule tape, and terminations from the service to each charging '
        +'station. Footage includes elevation/slack per run. Code-compliant trench per NEC 300.5.';
    case 'wire':
      return n+' LF \u2014 Above-ground/indoor conduit & cable. Scope includes: furnish & install '
        +'RMC (exposed/riser) or PVC where permitted, straps/standoffs, fittings, conductor pull '
        +'and terminations from the house/owner panel to the outdoor distribution panel.';
    case 'restore':
      return n+' LF \u2014 Surface restoration and/or remediation over the trench route. Scope '
        +'includes: base-course millings, hot-mix asphalt patch or concrete replacement to match '
        +'existing, rolling to compacted grade, and landscape reinstatement where disturbed.';
    case 'concrete':
      return n+' EA \u2014 Concrete EVSE equipment bases (one per dual-port pedestal, serving '
        +(num(ports)||n*2)+' ports). Scope includes: form & pour reinforced concrete pad or '
        +'sonotube, anchor bolts/template, conduit stub-ups, finish & cure to charger mounting spec.';
    case 'bollard':
      return n+' EA \u2014 Protective bollards. Scope includes: furnish & install concrete-filled '
        +'steel pipe bollards, core/excavate footing, set in concrete, prime & paint safety-yellow.';
    case 'xfmrpad':
      return n+" EA \u2014 Utility transformer/service pad (3'x5'). Scope includes: excavate & form, "
        +'pour reinforced concrete pad, set conduit stub-ups and grounding, finish & cure for the '
        +'new pad-mount service.';
    default: return n+'';
  }
}
function designRate(form, ports, card){
  card=card||{};
  var flat = (form && form.designFlat) ? (num(card._designFlat) || num(form.designFlat)) : 0;
  if(flat) return { qty:1, unit:'LS', mat:0, lab:r2(flat),
                    note:'flat per site \u2014 '+(form.short||form.utility||'this program') };
  ports=num(ports);
  return ports>0 ? { qty:ports, unit:'EA', mat:0,
                     lab:(num(card._designPerPort)||1000)*ports,
                     note:ports+' ports \u00d7 design & engineering' } : null;
}
function dcfcSteppedLabor(ft, kind){
  ft=num(ft); if(ft<=0) return 0;
  var base=(kind==='fp')?1000:2000;
  if(ft<=50)  return base;
  if(ft<=100) return base+(ft-50)*8;
  return 2400+(ft-100)*6;
}
function dcfcRestorationLabor(ft){
  ft=num(ft); if(ft<=0) return 0;
  if(ft<=25) return ft*35*1.3;
  return 25*35*1.3 + (ft-25)*1.25;
}
function dcfcRebate(makeReady, evseEligible, ineligible){
  var half=r2(num(evseEligible)*DCFC_BASELINE.evseEligibleShare);
  return { evseHalf:half,
           rebate:Math.min(r2(num(makeReady)+half), DCFC_BASELINE.rebateCap),
           capped:(num(makeReady)+half)>DCFC_BASELINE.rebateCap,
           invoice:r2(num(makeReady)+half*2+num(ineligible)) };
}
function standardRateIn(C, row, bucket){
  /* The future-proofing block reuses the SAME row keys as make-ready
     ('conduit', 'panel'), so the bucket is what distinguishes a spare run
     from a live one. Without this, a future-proofing row would be priced at
     the live rate off the live footage and the ineligible total would carry
     the whole job's conduit. */
  if(bucket==='fp'){
    if(row==='conduit' || row==='wire')       return standardRateIn(C,'_fpConduit','fp');
    if(row==='panel'   || row==='boards')     return standardRateIn(C,'_fpPanel','fp');
    if(row==='trench'  || row==='trenchTurf') return standardRateIn(C,'_fpTrench','fp');
  }
  var B=L2_BASELINE, ST=STANDARD_ITEMS.l2, RATE_CARD=C.card, DATA=C.data;
  var ports=Math.max(1, num(C.ports)||1);
  var peds =Math.max(1, Math.ceil(ports/2));       /* dual-port pedestals */
  var ftT  =num(DATA.ftTrench), ftC=num(DATA.ftConduit), ftW=num(DATA.ftCable);
  var ftUG =num(DATA.ftConduitUG) || ftC, ftAG=num(DATA.ftConduitAG);
  var _ts={ paved:num(C.paved), turf:num(C.turf) }, ftTurf=_ts.turf;
  /* A new service is a fact about the site, not a price. Explicit flag first;
     otherwise a site being given new panel/service gear implies one. */
  /* the $735 lateral structure and the utility pad belong to a NEW service,
     not to an upgrade that reuses the existing one */
  var newSvc = !!C.newService;
  /* Paved footage when it is measured; only derive it as the balance when
     nobody has said. Subtracting from an already-explicit paved figure left
     11 Marble with 0.24 LF of trench against a filed 44.12. */
  ftT=_ts.paved;
  var MA   =!!C.ma;

  switch(row){
    /* $1,000/port in all four reference jobs; flat where the form says so. */
    case 'design':     return designRate(C.form, ports, RATE_CARD);
    /* Permitting runs ~3% of project cost; exact on 75 Avon. */
    case 'permit':     return { qty:1, unit:'LS', mat:0, lab:r2(num(C.subtotalExPermit)*(C.permitPct!=null?num(C.permitPct):PERMIT_PCT)),
                                note:'3% of project cost' };
    case 'activation': return { qty:ports, unit:'EA', mat:395*ports, lab:0, note:'$395/port' };
    /* ── ONE PEDESTAL PER CHARGER UNIT ────────────────────────────────
       Counted per UNIT, not per port: a single-port AC Pro stands on its
       own pedestal, a dual-port AC Ultra shares one between its ports.
       Ten AC Pro therefore bill ten pedestals, not five.

       The unit count comes from the editor fleet when the drawing handed
       one over, because that is the only place that knows how many
       ENCLOSURES were placed rather than how many plugs they carry. With
       no fleet, fall back to the port count — nearly every L2 model is
       single-port, so port-per-unit is the safer guess, and it errs
       toward including a pedestal rather than dropping one from a
       submission.

       Material only. The labour to set it is already in the EVSE
       installation line, and inventing a second labour figure would
       inflate the eligible total on a form somebody has to justify. */
    case 'pedestal':   /* Level 2 only. A DCFC dispenser is bolted to a
                          concrete foundation that the civil lines already
                          carry, not stood on a $450 pole, and billing one
                          would put an item on a utility form that is not
                          on the job. */
                       if(C.chargerClass==='dcfc') return null;
                       /* The drawing wins when it placed pedestals: a dual
                          pedestal carries two chargers on ONE pedestal, so
                          "one per charger" would bill twice. */
                       var _pu=num(DATA.nPedestal)||0, _puHow='';
                       if(_pu){ _puHow=' (from the drawing: one per pedestal placed)'; }
                       else {
                         try{
                           _pu = num(C.fleetUnits)||0;
                         }catch(e){}
                         if(!_pu) _pu = ports;
                         _puHow=' (one per charger)';
                       }
                       return _pu>0 ? { qty:_pu, unit:'EA',
                                mat:ST.pedestalUnit.mat*_pu, lab:0,
                                note:_pu+' \u00d7 $'+ST.pedestalUnit.mat+' pedestal'+_puHow } : null;
    /* Both per port, identical on all five submitted jobs. They were the
       only cost lines with no rate at all \u2014 they arrived from the estimate
       or not at all, so a hand-built job silently lost them. */
    case 'charger':    return ports>0 ? { qty:ports, unit:'EA',
                                mat:RATE_CARD.charger.mat*ports, lab:0,
                                note:ports+' ports \u00d7 $'+RATE_CARD.charger.mat+'/port' } : null;
    case 'install':    return ports>0 ? { qty:ports, unit:'EA', mat:0,
                                lab:RATE_CARD.install.lab*ports,
                                note:'EVSE installation \u2014 '+ports+' ports \u00d7 $'+RATE_CARD.install.lab } : null;
    /* $250 + $100/port, exact on every submitted job (4p $650, 6p $850,
       10p $1,250) \u2014 it was a flat per-port figure before. */
    case 'shipping':   return ports>0 ? { qty:ports, unit:'EA', mat:0,
                                lab:RATE_CARD.freightFor(ports),
                                note:ports+' port freight \u2014 $250 mobilisation + $100/port' } : null;
    case 'network':    return { qty:ports, unit:'EA', mat:ST.networking.mat*ports, lab:0,
                                note:'$480/port \u2014 public L2 / MUD only' };
    case 'warranty':   return { qty:ports, unit:'EA', mat:0, lab:0,
                                note:'quote from the OEM \u2014 not carried on the reference jobs' };
    case 'striping':   return { qty:ports, unit:'EA', mat:0, lab:0, note:'' };
    /* One bollard per Level 2 PORT is the standing rule, so every port
       carries protection whether or not it was drawn. The drawing still
       wins when it shows MORE than the rule requires — extra bollards get
       drawn for a reason.

       Worth knowing: all five filed Eversource sheets carry one per
       PEDESTAL, not per port (4 ports/2 bollards, 10 ports/5). This rule
       roughly doubles that line, so the sheet now says plainly how the
       count was reached. */
    case 'bollard':    var drawn=num(DATA.nBollard)||0;
                       var perPort=(C.chargerClass!=='dcfc') ? ports : 0;
                       var nb=Math.max(drawn, perPort);
                       if(!nb) return null;
                       return { qty:nb, unit:'EA',
                                mat:RATE_CARD.bollard.mat*nb, lab:RATE_CARD.bollard.lab*nb,
                                note:scopeNote('bollard', nb)
                                     + (drawn && drawn<perPort
                                        ? ' Count is one per Level 2 port ('+perPort+'); the drawing shows '
                                          + drawn + '.'
                                        : drawn>perPort
                                        ? ' Count taken from the drawing ('+drawn+'), above the one-per-port minimum.'
                                        : ' One per Level 2 port.') };
    case 'pedestal':   return { qty:peds, unit:'EA', mat:ST.pedestal.mat*peds, lab:ST.pedestal.lab*peds,
                                note:peds+' dual-port pedestals' };
    case 'meter':      return { qty:1, unit:'LS', mat:ST.metering.mat, lab:ST.metering.lab, note:'' };
    /* Mounting hardware is per PORT, not per pedestal, and it was the single
       biggest thing missing when this was reconciled against 11 Marble:
       4 wall-mount kits at $225 + $500 labor is $2,900 on a $56k job. */
    case 'mount':      return { qty:ports, unit:'EA', mat:ST.wallMount.mat*ports,
                                lab:ST.wallMount.lab*ports, note:ports+' \u00d7 wall-mount kits' };
    case 'housePanel': return { qty:1, unit:'LS', mat:0, lab:ST.housePanel.lab, note:'' };
    /* service pedestals counted off the drawing: the metering socket and its
       labour per pedestal, plus the pedestal hardware allowance */
    case 'svcPedestal': var _nsp=num(DATA.nServicePedestal)||0;
                       if(!(_nsp>0)) return null;
                       return { qty:_nsp, unit:'EA',
                                mat:(ST.metering.mat+ST.servicePedestal.mat)*_nsp,
                                lab:ST.metering.lab*_nsp,
                                note:_nsp+' service pedestal'+(_nsp===1?'':'s')+' on the site map \u2014 meter socket + main on a freestanding pedestal, a new utility service; pedestal hardware is an allowance, confirm against the utility spec' };
    case 'xfmrpad':    return newSvc ? { qty:1, unit:'EA',
                                mat:RATE_CARD.xfmrPad.mat, lab:RATE_CARD.xfmrPad.lab,
                                note:scopeNote('xfmrpad', 1) } : null;
    case 'restore':    return ftT>0 ? { qty:ftT, unit:'LF', mat:B.perFoot.restoration.mat*ftT,
                                        lab:B.perFoot.restoration.lab*ftT, note:scopeNote('restore', ftT) } : null;
    /* The rate card has carried per-foot conduit, cable and trench rates all
       along, but nothing ever applied them: a drawing with 746 LF of conduit
       still exported a Conduit & Cable row reading $0 next to a priced
       trench, because these rows were only filled when the estimate happened
       to carry a matching line. Underground and above ground price
       separately — an indoor run costs more per foot and less to dig. */
    /* ── FUTURE-PROOFING ROWS ─────────────────────────────────────
       Driven by the FP positions drawn on the map. They live in the 'fp'
       bucket, which every programme form books as ineligible, so they
       never inflate the rebate base. */
    /* Spare conduit runs the live route — same trench, pulled at the same
       time — so it defaults to the measured underground run, not a
       per-position guess. */
    case '_fpConduit': var nfp=num(DATA.nFpPositions)||0;
                       if(!nfp) return null;
                       var fpLf=num(DATA.ftConduitFP) || num(DATA.ftConduitUG) || 0;
                       if(!fpLf) return null;
                       return { qty:fpLf, unit:'LF',
                                mat:RATE_CARD.fpConduit.mat*fpLf,
                                lab:RATE_CARD.fpConduit.lab*fpLf,
                                note:Math.round(fpLf)+' LF \u2014 spare conduit & conductors to '
                                     +nfp+' future position'+(nfp===1?'':'s')
                                     +', pulled while the trench is open. Not energised.' };
    /* The only NEW excavation future proofing needs: the ditch extended past
       the last live stall to reach the future one. One space per position,
       two at most — beyond that the run is being rebuilt, not extended. */
    case '_fpTrench':  var nft=num(DATA.nFpPositions)||0;
                       if(!nft) return null;
                       var stalls=Math.min(nft, RATE_CARD.fpMaxStalls);
                       var fpTrenchLf=num(DATA.ftTrenchFP) || (stalls*RATE_CARD.fpStallWidthFt);
                       var _tr=C.trenchSurfacePaved!==false?RATE_CARD.trenchPaved:RATE_CARD.trenchTurf;
                       return { qty:fpTrenchLf, unit:'LF',
                                mat:_tr.mat*fpTrenchLf, lab:_tr.lab*fpTrenchLf,
                                note:fpTrenchLf+' LF \u2014 ditch extended '+stalls+' parking space'
                                     +(stalls===1?'':'s')+' to reach '+nft+' future position'
                                     +(nft===1?'':'s')+'. The live run is already dug and claimed.' };
    case '_fpPanel':   var np2=num(DATA.nFpPositions)||0;
                       if(!np2) return null;
                       return { qty:np2, unit:'EA',
                                mat:RATE_CARD.fpPanelPosition.mat*np2,
                                lab:RATE_CARD.fpPanelPosition.lab*np2,
                                note:np2+' panel position'+(np2===1?'':'s')
                                     +' held for future EVSE \u2014 breaker space, bus and '
                                     +'terminations. No charger, no networking.' };
    case 'conduit':    return ftUG>0 ? { qty:ftUG, unit:'LF',
                                        mat:RATE_CARD.conduitCableUG.mat*ftUG,
                                        lab:RATE_CARD.conduitCableUG.lab*ftUG,
                                        note:scopeNote('conduit', ftUG) } : null;
    /* The new-service structure rides on this row: $735 of material on three
       of the five filed jobs, two of which have ZERO above-ground footage —
       so the row has to appear for the adder alone, and the adder must not
       scale with feet. Driven by the site being a new service, never added
       silently on an existing-service job. */
    /* Above-ground footage belongs on the form's ABOVE-GROUND row. On the
       Eversource matrix 'wire' is "Cable - Underground" and the above-ground
       row is keyed conduitAG — so 15 LF of interior EMT was being priced
       onto an underground line. Price conduitAG where the form has it, and
       fall back to 'wire' only on forms that use it as the AG row. */
    case 'conduitAG':  return ftAG>0 ? { qty:ftAG, unit:'LF',
                                mat:RATE_CARD.conduitCableAG.mat*ftAG
                                    + (newSvc?RATE_CARD.newServiceStructure.mat:0),
                                lab:RATE_CARD.conduitCableAG.labBase
                                    + RATE_CARD.conduitCableAG.labPerFt*ftAG,
                                note:scopeNote('wire', ftAG) } : null;
    case 'wire':       if(C.hasConduitAG && C.hasConduitAG[bucket]) return null;   /* AG lives there */
                       if(!(ftAG>0) && newSvc)
                         return { qty:0, unit:'LF', mat:RATE_CARD.newServiceStructure.mat, lab:0,
                                  note:'New-service structure (underground lateral, no riser) per Price Guide' };
                       return ftAG>0 ? { qty:ftAG, unit:'LF',
                                        mat:RATE_CARD.conduitCableAG.mat*ftAG
                                            + (newSvc?RATE_CARD.newServiceStructure.mat:0),
                                        lab:RATE_CARD.conduitCableAG.labBase
                                            + RATE_CARD.conduitCableAG.labPerFt*ftAG,
                                        note:scopeNote('wire', ftAG) } : null;
    case 'trench':     return ftT>0 ? { qty:ftT, unit:'LF',
                                        mat:RATE_CARD.trenchPaved.mat*ftT,
                                        lab:RATE_CARD.trenchPaved.lab*ftT,
                                        note:scopeNote('trench', ftT) } : null;
    case 'trenchTurf': return ftTurf>0 ? { qty:ftTurf, unit:'LF',
                                        mat:RATE_CARD.trenchTurf.mat*ftTurf,
                                        lab:RATE_CARD.trenchTurf.lab*ftTurf,
                                        note:scopeNote('trenchTurf', ftTurf) } : null;
    case 'concrete':   var np=num(DATA.nPad)||0;
                       return np ? { qty:np, unit:'EA',
                                mat:RATE_CARD.concreteBase.mat*np,
                                lab:RATE_CARD.concreteBase.lab*np,
                                note:scopeNote('concrete', np, ports) } : null;
    default: return null;
  }
}
function baseline(I){
  I=I||{}; var DATA=I.data||{}, EDITOR_FLEET=I.fleet||[], d=function(k){ return DATA[k]==null?'':String(DATA[k]); };
  var B=L2_BASELINE, OPT=Object.assign({}, B.optional, I.opt||{});
  var ports=Math.max(1, num(DATA.plugs)||1);
  var state=String(DATA.state||DATA.city||'CT').toUpperCase().indexOf('MA')>=0 ? 'MA' : 'CT';
  var ft={ trench:num(DATA.ftTrench), conduit:num(DATA.ftConduit), cable:num(DATA.ftCable) };
  var turf=String(DATA.trenchSurface||'paved').toLowerCase().indexOf('turf')>=0;
  var add=[];
  function L(cat,desc,qty,unit,mat,lab,bucket,row){
    if(!mat && !lab) return;
    add.push({ cat:cat, desc:desc, qty:qty, unit:unit, size:'',
               mat:r2(mat), lab:r2(lab), bucket:bucket, row:row, fp:0, baseline:true });
  }
  var chg = (state==='MA') ? B.perPort.chargerMA : B.perPort.charger;
  var trn = turf ? B.perFoot.trenchTurf : (state==='MA' ? B.perFoot.trenchMA : B.perFoot.trenchCT);
  var peds = Math.max(1, Math.ceil(ports/2));   /* dual-port pedestals */

  /* ── EVSE hardware ────────────────────────────────────────────────
     When the editor handed over a real fleet, price each model at its
     price-book figure and name the part number, instead of collapsing
     everything into one generic $/port line. The rate card stays as the
     fallback for a workbook opened without a handoff. */
  if(EDITOR_FLEET && EDITOR_FLEET.length){
    for(var _q=0; _q<EDITOR_FLEET.length; _q++){
      var _u = EDITOR_FLEET[_q];
      var _lbl = 'EVSE hardware \u2014 ' + (_u.mfr ? _u.mfr+' ' : '') + (_u.model||'charger')
               + (_u.kw ? ' ('+_u.kw+' kW)' : '')
               + (_u.pn ? ' \u00b7 PN '+_u.pn : '');
      L('EVSE', _lbl, _u.qty, 'EA', (_u.unitCost||0)*_u.qty, 0, 'evse','charger');
      if(_u.unitInstall)
        L('EVSE','EVSE installation \u2014 '+(_u.model||'charger'), _u.qty,'EA',
          0, (_u.unitInstall||0)*_u.qty, 'mr','other');
    }
  } else {
    L('EVSE','EVSE hardware \u2014 '+(DATA.evModel||'Level 2'), ports,'EA',
      chg.mat*ports, 0, 'evse','charger');
  }
  L('EVSE','Pedestals & mounting', peds,'EA',
    B.perUnit.pedestal.mat*peds, B.perUnit.pedestal.lab*peds, 'evse','pedestal');
  if(!(EDITOR_FLEET && EDITOR_FLEET.length))
    L('EVSE','EVSE installation', ports,'EA', 0, B.perPort.install.lab*ports, 'mr','other');
  L('Soft cost','Design & engineering', ports,'EA', 0, B.perPort.design.lab*ports, 'mr','design');
  L('Soft cost','Permitting & inspections', 1,'LS', 0, B.perSite.permit.lab, 'mr','permit');
  /* No panel line by default. Most make-ready jobs land on existing gear,
     and a baseline that always billed a new distribution panel put several
     thousand dollars of equipment nobody had specified onto the sheet —
     which the utility then asks to see an invoice for. Turn on
     "New panel / service equipment" in Site & program if the site needs it. */
  if(d('needPanel')==='Yes')
    L('Electrical','Distribution equipment / panel', 1,'LS',
      B.perSite.panel.mat, B.perSite.panel.lab, 'mr','panel');
  L('Civil','Trenching & backfill \u2014 '+(turf?'non-continuously paved':'continuously paved'),
    ft.trench,'LF', trn.mat*ft.trench, trn.lab*ft.trench, 'mr','trench');
  L('Civil','Restoration and/or remediation', ft.trench,'LF',
    B.perFoot.restoration.mat*ft.trench, B.perFoot.restoration.lab*ft.trench, 'mr','restore');
  L('Conduit','Conduit & cable \u2014 underground', ft.conduit,'LF',
    (B.perFoot.conduitUG.mat+B.perFoot.cableUG.mat)*ft.conduit,
    (B.perFoot.conduitUG.lab+B.perFoot.cableUG.lab)*ft.conduit, 'mr','conduit');
  L('Wire','Conduit & cable \u2014 above ground / indoor', ft.cable,'LF',
    (B.perFoot.conduitAG.mat+B.perFoot.cableAG.mat)*ft.cable,
    (B.perFoot.conduitAG.lab+B.perFoot.cableAG.lab)*ft.cable, 'mr','wire');
  L('Site','Protective bollards', ports,'EA',
    B.perUnit.bollard.mat*ports, B.perUnit.bollard.lab*ports, 'ne','bollard');
  if(OPT.concreteBase)
    L('Civil','Concrete EVSE bases', peds,'EA',
      B.perUnit.concreteBase.mat*peds, B.perUnit.concreteBase.lab*peds, 'mr','concrete');

  /* Opt-in only. Two of the four reference jobs had no transformer pad,
     no separate metering and no house-panel upgrade; adding them by
     default overstates a simple existing-service tap by thousands. */
  if(OPT.transformerPad)
    L('Utility','Utility transformer pad', 1,'EA',
      B.perUnit.xfmrPad.mat, B.perUnit.xfmrPad.lab, 'mr','xfmrpad');
  if(OPT.metering)
    L('Utility','Metering equipment', 1,'LS',
      B.perSite.metering.mat, B.perSite.metering.lab, 'mr','meter');
  if(OPT.housePanel)
    L('Electrical','House panel upgrade', 1,'LS',
      B.perSite.housePanel.mat, B.perSite.housePanel.lab, 'mr','boards');
  if(OPT.networking)
    L('EVSE','EVSE networking / software', ports,'EA',
      B.perPort.networking.mat*ports, 0, 'ne','network');

  return add;
}
function ng(Q){
  var B=NG_PRICE, P=num(Q.ports), S=ngStationsFor(P), lines=[], flags=[];
  function add(bucket,row,desc,qty,unit,mat,lab,note){
    var o={ desc:desc, bucket:bucket, row:row, qty:qty, unit:unit||'', size:'', cat:'',
            mat:ngRound(mat), lab:ngRound(lab), fp:0, src:'ngbook', note:note||'' };
    lines.push(o); return o;
  }
  function ask(t){ flags.push({ ask:true, text:t }); }
  function note(t){ flags.push({ ask:false, text:t }); }
  function $(n){ return money(n); }
  if(!(P>0)){
    ask('Number of Ports is not set — every quantity in the price book is P or P ÷ 2.');
    return { lines:lines, flags:flags, changes:[], P:P, S:S };
  }
  if(P%2) note(P+' ports is not an even number. Every station is dual-port, so S is rounded up to '+S+'.');

  /* row 10 */
  add('mr','design','Design/Engineering/Permitting', P, 'ports', 0, B.designPerPort*P,
      P+' ports × $'+B.designPerPort);
  /* row 12 */
  var paved=num(Q.paved), unpaved=num(Q.unpaved), cond=num(Q.conduit), hh=num(Q.handholes);
  if(paved>0)
    add('mr','trench','Trenching & Backfill — paved (asphalt/concrete)', paved, 'ft',
        B.trenchPaved.mat*paved, B.trenchPaved.lab*paved,
        paved+' LF × $'+B.trenchPaved.mat+' / $'+B.trenchPaved.lab);
  /* row 13: no rate */
  if(unpaved>0){
    var ut=Q.unpavedTyped||null;
    add('mr','trenchTurf','Trenching & Backfill — unpaved (grass)', unpaved, 'ft',
        ut?ut.mat:0, ut?ut.lab:0, ut?'typed — no price-book rate':'NO RATE — ask');
    ask(unpaved+' LF of unpaved trench (row 13) has no price-book rate. '
        +(ut ? 'Priced at the typed '+$(ut.mat)+' material / '+$(ut.lab)+' labour — confirm it, and the split (it moves the sales tax).'
             : 'It is on the sheet at $0 until a rate is confirmed: type the material and labour over the line.'));
  }
  /* row 14 */
  if(cond>0)
    add('mr','conduit','Conduit & Cable — underground/above ground/indoor', cond, 'ft',
        B.conduit.matPerFt*cond, B.conduit.labBase+B.conduit.labPerFt*cond,
        cond+' LF × $'+B.conduit.matPerFt+'; labour $'+B.conduit.labBase+' + $'+B.conduit.labPerFt+'/LF');
  else note('No conduit footage — row 14 is blank. Measure the runs, or type Total Feet of Conduit under Program details.');
  /* row 15 */
  add('mr','bollard','Protective Bollards', S, 'ea', B.bollard.mat*S, B.bollard.lab*S, S+' — one per station');
  /* row 16: no rate */
  if(hh>0){
    var ht=Q.handholeTyped||null;
    add('mr','handhole','Handholes/Manholes', hh, 'ea', ht?ht.mat:0, ht?ht.lab:0,
        ht?'typed — no price-book rate':'NO RATE — ask');
    ask(hh+' handhole'+(hh>1?'s':'')+' (row 16): no price-book rate. '
        +(ht ? 'Priced at the typed '+$(ht.mat)+' / '+$(ht.lab)+' — confirm it.'
             : 'On the sheet at $0 until a rate is confirmed: type the material and labour over the line.'));
  }
  /* row 17 */
  add('mr','concrete','Concrete Work/Bases/Pads', S, 'ea', B.pad.mat*S, B.pad.lab*S, S+' pads — one per station');
  /* row 18 */
  var svc=B.panel[Q.service]||null, opt=B.panel, nsp=num(Q.servicePedestals);
  if(!svc){
    svc=opt.standard;
    ask((nsp ? 'The drawing has '+nsp+' service pedestal'+(nsp>1?'s':'')+' — a new utility service — but the phase is not confirmed. '
             : '')
        +'Service scope (row 18) is not confirmed — priced as the standard panel package ('
        +$(opt.standard.mat+opt.standard.lab)+'). Choose under Program details: standard '
        +$(opt.standard.mat+opt.standard.lab)+' · new 200A single-phase '+$(opt.single.mat+opt.single.lab)
        +' · new 200A three-phase '+$(opt.three.mat+opt.three.lab)+'. "A new meter is being added" still needs the phase.');
  }
  if(svc.key==='standard' && nsp)
    note('Row 18 is the standard package, but the drawing has '+nsp+' service pedestal'+(nsp>1?'s':'')
        +' (a new utility service). Confirm the service scope.');
  add('mr','panel',
      svc.key==='standard' ? 'Utility service point and utility service meter equipment'
                           : svc.label+' — utility service point and new utility service meter',
      svc.qty, svc.qty===2?'ea':'lump', svc.mat, svc.lab, svc.label);
  /* row 19 */
  add('mr','install','Installation and commissioning of all ports (site grounding, fire-stop and seal-off)',
      P, 'ports', B.other.mat, B.other.labPerPort*P,
      'materials $'+B.other.mat+' flat; install labour '+P+' × $'+B.other.labPerPort);
  /* row 27 */
  var p80=Math.min(P, Math.round(num(Q.ports80))), p50=P-p80, hw80=num(Q.hw80PerPort)||num(B.hardware.a80);
  add('evse','charger',
      p80 ? 'Level 2 charging hardware — '+p50+' × 50 A and '+p80+' × 80 A ports'
          : 'Level 2 charging hardware — Autel AC Elite 50A dual-port (12 kW)',
      P, 'ports', B.hardware.a50*p50 + (hw80 ? hw80*p80 : 0), 0,
      p50+' × $'+B.hardware.a50+(p80 ? ' + '+p80+' × '+(hw80 ? '$'+hw80 : 'no rate') : ''));
  if(p80 && !hw80)
    ask(p80+' port'+(p80>1?'s are':' is')+' on an 80 A (19.2 kW) unit and the book has no rate for it. '
        +'Those ports are on the sheet at $0 until a price per port is entered under Program details.');
  /* row 28 */
  add('evse','pedestal','Pedestals and mounting hardware', S, 'ea', B.pedestal*S, 0, S+' × $'+B.pedestal);
  /* row 29 */
  add('evse','shipping','EVSE Freight/Shipping', P, 'ports', B.freightPerPort*P, 0, P+' × $'+B.freightPerPort);
  /* row 32 */
  add('evse','network','Network service (Green Joulez)', P, 'ports', B.networkPerPort*P, 0, P+' × $'+B.networkPerPort);
  if(/workplace|fleet|dcfc/i.test(String(Q.segment||'')))
    note('A '+Q.segment+' site: networking belongs on row 45 (ineligible), not row 32. Left on row 32 pending the decision '
        +'— moving it shifts '+$(B.networkPerPort*P)+' from Eligible to Ineligible without changing the total.');
  /* row 34 */
  add('ne','striping','Fire/arc-flash warning and equipment labels', P+1, 'ea', B.signage.mat, B.signage.lab,
      (P+1)+' labels — lump sum');

  /* what the book has no row for passes through, and says so */
  var i, l, util=0, utilNames=[], nobook=[], ex=Q.extras||[];
  for(i=0;i<ex.length;i++){
    l=ex[i]; lines.push(l);
    if(l.util){ util+=num(l.mat)+num(l.lab); utilNames.push(l.desc); }
    else if(l.bucket!=='fp' && (num(l.mat)||num(l.lab))) nobook.push(l.desc+' '+$(num(l.mat)+num(l.lab)));
  }
  if(util>0)
    note('Utility-side rows 21–25 carry '+$(util)+' ('+utilNames.join(', ')+'): kept on the sheet in H54, out of H53 '
        +'and out of the proposal. Ask whether to remove them or include them in the client proposal.');
  if(nobook.length) note('Not in the price book, carried as submitted: '+nobook.join('; ')+'.');
  /* the counts the sheet asks for */
  if(num(Q.stationsTyped) && num(Q.stationsTyped)!==S)
    note('Number of Stations was '+num(Q.stationsTyped)+'; C7 is written as S = '+S+' (P ÷ 2, dual-port pedestals). '
        +'Open question whether National Grid expects C7 to count ports.');
  if(num(Q.pedestalsDrawn) && num(Q.pedestalsDrawn)!==S)
    note('The drawing placed '+num(Q.pedestalsDrawn)+' pedestals; the book prices S = '+S+' (one dual-port pedestal per two ports).');
  if(num(Q.padsDrawn) && num(Q.padsDrawn)!==S)
    note('The drawing placed '+num(Q.padsDrawn)+' pads; the book prices S = '+S+', one per station.');
  if(num(Q.markupPct))
    note('The '+num(Q.markupPct)+'% markup is not applied on National Grid: the book’s unit prices are never scaled.');
  return { lines:lines, flags:flags, P:P, S:S, version:NG_PRICE.version, band:NG_PRICE.band, panelSingleTotal:NG_PRICE.panel.single.mat+NG_PRICE.panel.single.lab, taxRate:NG_PRICE.taxRate, kw80:NG_PRICE.kw80 };
}
/* The rate card with a rep's overrides applied (the Rate settings keys). */
function cardWith(overrides){
  var c=JSON.parse(JSON.stringify(RATE_CARD, function(k,v){ return typeof v==='function'?undefined:v; }));
  c.pedestalsFor=RATE_CARD.pedestalsFor; c.breakersFor=RATE_CARD.breakersFor;
  c.freightFor=function(ports){ var b=num(c._freightBase), p=num(c._freightPort); return (b||250)+(p||100)*num(ports); };
  var o=overrides||{}, k, w, permitPct=null;
  for(k in o){ if(!o.hasOwnProperty(k)||!o[k]||typeof o[k]!=='object') continue;
    for(w in o[k]){ if(!o[k].hasOwnProperty(w)) continue; var v=num(o[k][w]);
      switch(k){
        case '_agBase': c.conduitCableAG.labBase=v; break;
        case '_agPerFt': c.conduitCableAG.labPerFt=v; break;
        case '_fpStall': c.fpStallWidthFt=v; break;
        case '_design': c._designPerPort=v; break;
        case '_designFlat': c._designFlat=v; break;
        case '_freightBase': c._freightBase=v; break;
        case '_freightPort': c._freightPort=v; break;
        case '_permitPct': permitPct=v/100; break;
        default: if(c[k] && typeof c[k]==='object') c[k][w]=v;
      } } }
  return { card:c, permitPct:permitPct };
}
/* What the Rate settings panel shows as the defaults, by its keys. */
function cardDisplay(){
  var o=RATE_CARD, out={}, keys=['trenchPaved','trenchTurf','conduitCableUG','conduitCableAG','bollard','concreteBase','xfmrPad','charger','install','network','fpPanelPosition'];
  keys.forEach(function(k){ out[k]={ mat:num(o[k].mat), lab:num(o[k].lab) }; });
  out._agBase={ mat:0, lab:o.conduitCableAG.labBase }; out._agPerFt={ mat:0, lab:o.conduitCableAG.labPerFt };
  out._fpStall={ mat:o.fpStallWidthFt, lab:o.fpStallWidthFt }; out._design={ mat:0, lab:1000 }; out._designFlat={ mat:0, lab:2000 };
  out._freightBase={ mat:0, lab:250 }; out._freightPort={ mat:0, lab:100 }; out._permitPct={ mat:PERMIT_PCT*100, lab:PERMIT_PCT*100 };
  return out;
}
var ROWS=['permit','design','activation','shipping','network','warranty','signage','striping','conduit','conduitAG','wire','trench','trenchTurf','restore','bollard','pedestal','meter','mount','housePanel','svcPedestal','xfmrpad','concrete','charger','install','_fpConduit','_fpTrench','_fpPanel'];
var BUCKETS=['mr','evse','ne','fp'];
/* Every standard rate for the job, by "bucket|row", plus the card the panel shows. */
function rates(ctx){
  ctx=ctx||{};
  var cw=cardWith(ctx.overrides), C={ card:cw.card, data:ctx.data||{}, ports:ctx.ports, paved:ctx.paved, turf:ctx.turf, newService:!!ctx.newService, ma:!!ctx.ma,
    form:ctx.form||null, subtotalExPermit:num(ctx.subtotalExPermit), permitPct:(cw.permitPct!=null?cw.permitPct:(ctx.permitPct!=null?num(ctx.permitPct):null)),
    chargerClass:ctx.chargerClass==='dcfc'?'dcfc':'l2', fleetUnits:num(ctx.fleetUnits), trenchSurfacePaved:ctx.trenchSurfacePaved!==false, hasConduitAG:ctx.hasConduitAG||{} };
  var out={}, i, j;
  for(i=0;i<BUCKETS.length;i++) for(j=0;j<ROWS.length;j++){ var r=null; try{ r=standardRateIn(C, ROWS[j], BUCKETS[i]); }catch(e){ r=null; } out[BUCKETS[i]+'|'+ROWS[j]]=r||null; }
  return { rates:out, card:cardDisplay(), source:RATE_CARD.source, permitPct:(cw.permitPct!=null?cw.permitPct:PERMIT_PCT) };
}
module.exports = { rates:rates, baseline:baseline, ng:ng, designRate:designRate, scopeNote:scopeNote, dcfcSteppedLabor:dcfcSteppedLabor, dcfcRestorationLabor:dcfcRestorationLabor, dcfcRebate:dcfcRebate,
  cardWith:cardWith, standardRateIn:standardRateIn, PERMIT_PCT:PERMIT_PCT, _tables:{ RATE_CARD:RATE_CARD, NG_PRICE:NG_PRICE, L2_BASELINE:L2_BASELINE, STANDARD_ITEMS:STANDARD_ITEMS, DCFC_BASELINE:DCFC_BASELINE, NG_MA_RATES:NG_MA_RATES } };
