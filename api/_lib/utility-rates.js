/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The utility rate book: which utility serves a ZIP, and the planning-grade
   demand and energy rates, demand share, ratchet and TOU flag the editor's
   screens read. It lived in editor.html as three object literals (the
   detailed IL/CT/MA/IN tables, every state's primary utility, the ZIP3 to
   state ranges), readable by any signed-in user of any tenant, and a
   customer's engineer proposing to build their own tool is exactly who
   would copy it (2026-10-12). It is the curated part, so it moved here
   first. Pure, ES5, no I/O. lookup() answers ONE record, never the table,
   and never the ZIP prefixes a record covers.

   2026-10-17 (DESIGN C6 / r12 A7): the serving utility is now identified at
   the POINT by the territory and hosting layers (api/hosting-capacity.js),
   so byEia() answers for that utility's EIA id and the ZIP prefix is the
   fallback. The ZIP book itself was shadowed in four places — Rhode Island
   ZIPs (028, 029) listed under National Grid MA, UI's New Haven and
   Bridgeport ZIPs (065, 066) under Eversource CT, MidAmerican's Quad Cities
   (612) and Ameren's downstate ZIPs (614, 620, 622-624) under ComEd — and is
   now ONE ZIP3 index: a prefix belongs to one record, and a second claim
   fails the test (_overlaps). */
'use strict';
var IL_UTILITY_RATES = {
  // ComEd (Northern IL) -- zip prefixes 600-611, 613 (Rockford, Chicago, Kankakee, the Illinois Valley)
  comed: {
    name: 'ComEd (Northern Illinois)',
    demandRate: 19.85,
    energyRate: 0.0681,
    demandPct: 0.38,
    tou: true,
    peakWindow: '2PM-7PM weekdays (Jun-Sep), 6AM-10PM (Oct-May)',
    ratchet: 0.70,
    zips: ['600','601','602','603','604','605','606','607','608','609','610','611','613']
  },
  // Ameren Illinois (Central/Southern IL) -- incl. Galesburg/Macomb (614), Alton/Belleville/East St Louis (620, 622), Quincy (623), Effingham (624)
  ameren: {
    name: 'Ameren Illinois',
    demandRate: 14.22,
    energyRate: 0.0594,
    demandPct: 0.33,
    tou: true,
    peakWindow: '2PM-8PM weekdays (Jun-Aug)',
    ratchet: 0.65,
    zips: ['614','615','616','617','618','619','620','621','622','623','624','625','626','627','628','629']
  },
  // MidAmerican Energy (Rock Island/Moline/East Moline, the Illinois Quad Cities)
  midamerican: {
    name: 'MidAmerican Energy',
    demandRate: 12.50,
    energyRate: 0.0512,
    demandPct: 0.30,
    tou: false,
    peakWindow: 'Seasonal on-peak (Jun-Sep)',
    ratchet: 0.60,
    zips: ['612']
  },
  // Eversource CT -- zip prefixes 060-064, 067-069 (065 New Haven and 066 Bridgeport are UI's; 064 is mixed and stays here)
  eversource_ct: {
    name: 'Eversource Energy (Connecticut)',
    demandRate: 25.49,        // Transmission $11.27 + Local Delivery $14.22/kW blended
    energyRate: 0.10999,
    demandPct: 0.35,
    tou: false,
    peakWindow: 'On-peak: 8AM-8PM weekdays (Rate 30/35)',
    ratchet: 0.0,             // CT does not have a standard demand ratchet
    zips: ['060','061','062','063','064','067','068','069']
  },
  // Eversource MA -- zip prefixes 010-027 except Worcester (016, National Grid)
  eversource_ma: {
    name: 'Eversource Energy (Massachusetts)',
    demandRate: 18.74,
    energyRate: 0.0921,
    demandPct: 0.32,
    tou: true,
    peakWindow: 'On-peak: 8AM-8PM weekdays Jun-Sep',
    ratchet: 0.0,
    zips: ['010','011','012','013','014','015','017','018','019','020','021','022','023','024','025','026','027']
  },
  // National Grid MA -- Worcester (016). 028 and 029 are Rhode Island ZIPs (Rhode Island Energy, the state record)
  ngrid_ma: {
    name: 'National Grid (Massachusetts)',
    demandRate: 17.20,
    energyRate: 0.0875,
    demandPct: 0.31,
    tou: true,
    peakWindow: 'On-peak: 8AM-8PM weekdays',
    ratchet: 0.0,
    zips: ['016']
  },
  // AEP Indiana Michigan Power (I&M) -- Northern IN incl. South Bend; settles in PJM AEP zone
  aep_in: {
    name: 'AEP Indiana Michigan Power (I&M) -- PJM/AEP zone',
    demandRate: 14.90,
    energyRate: 0.0690,
    demandPct: 0.34,
    tou: true,
    peakWindow: 'On-peak: weekday afternoons (summer)',
    ratchet: 0.60,
    zips: ['460','461','462','463','464','465','466','467','468','469','470','471','472','473','474','475','476','477','478','479']
  },
  // UI (United Illuminating) CT -- New Haven (065), Bridgeport (066)
  ui_ct: {
    name: 'United Illuminating (Connecticut)',
    demandRate: 22.15,
    energyRate: 0.1050,
    demandPct: 0.34,
    tou: false,
    peakWindow: 'On-peak: 8AM-8PM weekdays',
    ratchet: 0.0,
    zips: ['065','066']
  },
};

var STATE_PRIMARY_UTILITY = {
  AL:{name:'Alabama Power',demandRate:16.5,energyRate:0.070,demandPct:0.34,tou:false,ratchet:0.60},
  AK:{name:'Chugach Electric',demandRate:15.0,energyRate:0.150,demandPct:0.30,tou:false,ratchet:0.0},
  AZ:{name:'Arizona Public Service (APS)',demandRate:17.8,energyRate:0.075,demandPct:0.36,tou:true,ratchet:0.50},
  AR:{name:'Entergy Arkansas',demandRate:13.9,energyRate:0.062,demandPct:0.32,tou:false,ratchet:0.60},
  CA:{name:'Pacific Gas & Electric (PG&E)',demandRate:24.0,energyRate:0.180,demandPct:0.35,tou:true,ratchet:0.50},
  CO:{name:'Xcel Energy (Public Service Co. of Colorado)',demandRate:16.2,energyRate:0.078,demandPct:0.34,tou:true,ratchet:0.60},
  CT:{name:'Eversource Energy (Connecticut)',demandRate:25.49,energyRate:0.110,demandPct:0.35,tou:false,ratchet:0.0},
  DE:{name:'Delmarva Power (Exelon)',demandRate:14.5,energyRate:0.085,demandPct:0.33,tou:true,ratchet:0.60},
  DC:{name:'Pepco (Exelon)',demandRate:15.8,energyRate:0.090,demandPct:0.34,tou:true,ratchet:0.60},
  FL:{name:'Florida Power & Light (FPL)',demandRate:12.8,energyRate:0.078,demandPct:0.32,tou:false,ratchet:0.60},
  GA:{name:'Georgia Power',demandRate:15.9,energyRate:0.070,demandPct:0.34,tou:true,ratchet:0.60},
  HI:{name:'Hawaiian Electric (HECO)',demandRate:20.0,energyRate:0.330,demandPct:0.32,tou:true,ratchet:0.0},
  IA:{name:'MidAmerican Energy',demandRate:12.50,energyRate:0.051,demandPct:0.30,tou:false,ratchet:0.60},
  ID:{name:'Idaho Power',demandRate:11.5,energyRate:0.062,demandPct:0.32,tou:true,ratchet:0.50},
  IL:{name:'ComEd (Northern Illinois)',demandRate:19.85,energyRate:0.0681,demandPct:0.38,tou:true,ratchet:0.70},
  IN:{name:'Duke Energy Indiana',demandRate:14.9,energyRate:0.069,demandPct:0.34,tou:true,ratchet:0.60},
  KS:{name:'Evergy (Kansas)',demandRate:14.2,energyRate:0.070,demandPct:0.33,tou:true,ratchet:0.60},
  KY:{name:'LG&E / KU',demandRate:13.5,energyRate:0.065,demandPct:0.33,tou:false,ratchet:0.60},
  LA:{name:'Entergy Louisiana',demandRate:13.2,energyRate:0.058,demandPct:0.32,tou:false,ratchet:0.60},
  ME:{name:'Central Maine Power (CMP)',demandRate:16.0,energyRate:0.100,demandPct:0.33,tou:false,ratchet:0.0},
  MD:{name:'Baltimore Gas & Electric (BGE)',demandRate:15.5,energyRate:0.088,demandPct:0.34,tou:true,ratchet:0.60},
  MA:{name:'Eversource Energy (Massachusetts)',demandRate:18.74,energyRate:0.0921,demandPct:0.32,tou:true,ratchet:0.0},
  MI:{name:'DTE Energy',demandRate:15.6,energyRate:0.082,demandPct:0.34,tou:true,ratchet:0.60},
  MN:{name:'Xcel Energy (Northern States Power)',demandRate:15.0,energyRate:0.075,demandPct:0.34,tou:true,ratchet:0.60},
  MS:{name:'Entergy Mississippi',demandRate:13.4,energyRate:0.060,demandPct:0.32,tou:false,ratchet:0.60},
  MO:{name:'Ameren Missouri',demandRate:13.8,energyRate:0.065,demandPct:0.33,tou:true,ratchet:0.60},
  MT:{name:'NorthWestern Energy',demandRate:12.8,energyRate:0.070,demandPct:0.32,tou:false,ratchet:0.50},
  NE:{name:'Nebraska Public Power District (NPPD)',demandRate:11.9,energyRate:0.058,demandPct:0.31,tou:false,ratchet:0.60},
  NV:{name:'NV Energy',demandRate:14.5,energyRate:0.078,demandPct:0.34,tou:true,ratchet:0.50},
  NH:{name:'Eversource Energy (New Hampshire)',demandRate:17.5,energyRate:0.105,demandPct:0.33,tou:false,ratchet:0.0},
  NJ:{name:'PSE&G',demandRate:15.2,energyRate:0.095,demandPct:0.34,tou:true,ratchet:0.60},
  NM:{name:'PNM (Public Service Co. of New Mexico)',demandRate:13.6,energyRate:0.068,demandPct:0.33,tou:true,ratchet:0.50},
  NY:{name:'Consolidated Edison (Con Edison)',demandRate:22.0,energyRate:0.130,demandPct:0.35,tou:true,ratchet:0.60},
  NC:{name:'Duke Energy Carolinas',demandRate:14.6,energyRate:0.068,demandPct:0.34,tou:true,ratchet:0.60},
  ND:{name:'Xcel Energy (Northern States Power)',demandRate:12.2,energyRate:0.060,demandPct:0.31,tou:false,ratchet:0.60},
  OH:{name:'AEP Ohio',demandRate:14.8,energyRate:0.072,demandPct:0.34,tou:true,ratchet:0.60},
  OK:{name:'Oklahoma Gas & Electric (OG&E)',demandRate:13.5,energyRate:0.062,demandPct:0.33,tou:true,ratchet:0.60},
  OR:{name:'Portland General Electric (PGE)',demandRate:12.9,energyRate:0.078,demandPct:0.33,tou:true,ratchet:0.50},
  PA:{name:'PECO (Exelon)',demandRate:14.9,energyRate:0.085,demandPct:0.34,tou:true,ratchet:0.60},
  RI:{name:'Rhode Island Energy',demandRate:17.8,energyRate:0.105,demandPct:0.33,tou:false,ratchet:0.0},
  SC:{name:'Dominion Energy South Carolina',demandRate:14.2,energyRate:0.066,demandPct:0.34,tou:true,ratchet:0.60},
  SD:{name:'MidAmerican Energy',demandRate:12.2,energyRate:0.055,demandPct:0.31,tou:false,ratchet:0.60},
  TN:{name:'Tennessee Valley Authority (TVA) LPC',demandRate:13.0,energyRate:0.062,demandPct:0.33,tou:false,ratchet:0.60},
  TX:{name:'Oncor (delivery) / retail choice',demandRate:11.5,energyRate:0.085,demandPct:0.35,tou:true,ratchet:0.60},
  UT:{name:'Rocky Mountain Power (PacifiCorp)',demandRate:12.6,energyRate:0.068,demandPct:0.33,tou:true,ratchet:0.50},
  VT:{name:'Green Mountain Power',demandRate:16.5,energyRate:0.100,demandPct:0.33,tou:false,ratchet:0.0},
  VA:{name:'Dominion Energy Virginia',demandRate:14.6,energyRate:0.075,demandPct:0.34,tou:true,ratchet:0.60},
  WA:{name:'Puget Sound Energy',demandRate:12.4,energyRate:0.075,demandPct:0.33,tou:true,ratchet:0.50},
  WV:{name:'Appalachian Power (AEP)',demandRate:13.8,energyRate:0.070,demandPct:0.33,tou:false,ratchet:0.60},
  WI:{name:'We Energies (WEC)',demandRate:15.4,energyRate:0.080,demandPct:0.34,tou:true,ratchet:0.60},
  WY:{name:'Rocky Mountain Power (PacifiCorp)',demandRate:11.8,energyRate:0.062,demandPct:0.32,tou:false,ratchet:0.50}
};

var ZIP3_STATE = [
  [995,999,'AK'],[350,369,'AL'],[716,729,'AR'],[850,865,'AZ'],[900,961,'CA'],
  [800,816,'CO'],[60,69,'CT'],[200,205,'DC'],[197,199,'DE'],[320,349,'FL'],
  [300,319,'GA'],[967,968,'HI'],[500,528,'IA'],[832,838,'ID'],[600,629,'IL'],
  [460,479,'IN'],[660,679,'KS'],[400,427,'KY'],[700,714,'LA'],[10,27,'MA'],
  [206,219,'MD'],[39,49,'ME'],[480,499,'MI'],[550,567,'MN'],[630,658,'MO'],
  [386,397,'MS'],[590,599,'MT'],[270,289,'NC'],[580,588,'ND'],[680,693,'NE'],
  [30,38,'NH'],[70,89,'NJ'],[870,884,'NM'],[889,898,'NV'],[100,149,'NY'],
  [430,459,'OH'],[730,749,'OK'],[970,979,'OR'],[150,196,'PA'],[28,29,'RI'],
  [290,299,'SC'],[570,577,'SD'],[370,385,'TN'],[750,799,'TX'],[840,847,'UT'],
  [220,246,'VA'],[50,59,'VT'],[980,994,'WA'],[530,549,'WI'],[247,268,'WV'],
  [820,831,'WY']
];

function stateForZip(zip) {
  var p = parseInt(String(zip || '').replace(/\D/g, '').slice(0, 3), 10);
  if (!isFinite(p)) return null;
  for (var i = 0; i < ZIP3_STATE.length; i++) {
    if (p >= ZIP3_STATE[i][0] && p <= ZIP3_STATE[i][1]) return ZIP3_STATE[i][2];
  }
  return null;
}
/* One record, the shape the editor's screens read; `zips` never leaves. */
function record(key, r, extra) {
  var out = { key: key, name: r.name, demandRate: r.demandRate, energyRate: r.energyRate,
    demandPct: r.demandPct, tou: !!r.tou,
    peakWindow: r.peakWindow || (r.tou ? 'Seasonal on-peak (afternoons)' : 'Non-TOU / flat demand'),
    ratchet: (r.ratchet != null ? r.ratchet : 0.60) };
  var k; for (k in r) { if (r.hasOwnProperty(k) && !(k in out) && k !== 'zips') out[k] = r[k]; }
  for (k in (extra || {})) { if (extra.hasOwnProperty(k)) out[k] = extra[k]; }
  return out;
}
function fromState(state) {
  var st = String(state || '').toUpperCase(), u = STATE_PRIMARY_UTILITY[st];
  if (!u) return null;
  return record('state:' + st, u, { _state: st, _stateResolved: true });
}
/* ONE ZIP3 index over the detailed books; a prefix claimed twice is kept
   by its first claim and reported by _overlaps() (the test fails on it). */
var ZIP3 = {}, OVERLAPS = [];
(function () {
  var k, i;
  for (k in IL_UTILITY_RATES) {
    if (!IL_UTILITY_RATES.hasOwnProperty(k)) continue;
    for (i = 0; i < IL_UTILITY_RATES[k].zips.length; i++) {
      var z3 = IL_UTILITY_RATES[k].zips[i];
      if (ZIP3[z3]) OVERLAPS.push(z3 + ': ' + ZIP3[z3] + ' and ' + k); else ZIP3[z3] = k;
    }
  }
})();
function lookup(zip) {
  var z = String(zip || '').replace(/\D/g, '');
  if (z.length < 3) return record('comed', IL_UTILITY_RATES.comed, { _default: true });
  var k = ZIP3[z.slice(0, 3)];
  if (k) return record(k, IL_UTILITY_RATES[k]);
  var st = stateForZip(z), byState = st ? fromState(st) : null;
  if (byState) return byState;
  return record('comed', IL_UTILITY_RATES.comed, { _fallback: true, _fallbackNote: 'No utility on file for ZIP ' + z + ' -- showing ComEd defaults' });
}

/* By the serving utility's EIA id, the way the territory and hosting
   layers name it (api/_lib/hosting-sources.js holds the ids). A utility
   with a detailed book answers from it; one that IS its state's primary
   answers from the state record; any other known utility answers with ITS
   name and the state's planning rates, said so (_rateNote) — never another
   utility's name over its rates. opts: { display, state, zip }. Returns
   null when the id is not one the caller can name (then the ZIP decides). */
var EIA_BOOK = { '4110': 'comed', '56697': 'ameren', '12341': 'midamerican', '4176': 'eversource_ct', '54913': 'eversource_ma',
  '11804': 'ngrid_ma', '13206': 'ngrid_ma', '19497': 'ui_ct', '9324': 'aep_in' };
var EIA_STATE_PRIMARY = { '13214': 'RI', '803': 'AZ', '14328': 'CA', '6452': 'FL', '7801': 'FL', '7140': 'GA', '15477': 'NJ' };
function byEia(eia, opts) {
  opts = opts || {};
  var id = String(eia == null ? '' : eia).replace(/\D/g, '').slice(0, 8);
  if (!id) return null;
  if (EIA_BOOK[id]) return record(EIA_BOOK[id], IL_UTILITY_RATES[EIA_BOOK[id]], { eiaId: id, _source: 'eia' });
  if (EIA_STATE_PRIMARY[id]) {
    var p = EIA_STATE_PRIMARY[id];
    return record('state:' + p, STATE_PRIMARY_UTILITY[p], { eiaId: id, _source: 'eia', _state: p });
  }
  var st = String(opts.state || '').toUpperCase().slice(0, 2);
  if (!STATE_PRIMARY_UTILITY[st] && opts.zip) st = stateForZip(opts.zip) || '';
  var base = STATE_PRIMARY_UTILITY[st], display = String(opts.display || '').trim().slice(0, 80);
  if (!base || !display) return null;
  return record('eia:' + id, base, { name: display, eiaId: id, _source: 'state', _state: st, _stateResolved: true, ratesFrom: base.name,
    _rateNote: 'No rate book for ' + display + ' yet; these are ' + st + ' planning rates (' + base.name + ').' });
}
module.exports = { lookup: lookup, byEia: byEia, fromState: fromState, stateForZip: stateForZip,
  _overlaps: function () { return OVERLAPS.slice(); },
  _count: { detailed: Object.keys(IL_UTILITY_RATES).length, states: Object.keys(STATE_PRIMARY_UTILITY).length } };
