/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   May 2025 OEWS mean hourly wages and employment, read from the BLS
   public API on 2026-10-18. SOC 47-2111 electricians, 47-2061
   construction laborers, 47-2073 operating engineers. The labor
   factor is the employment-weighted mean of those three wages
   divided by the same national composite. Davis-Bacon is not
   blended in. A national benefit load would cancel in the ratio. */
'use strict';

var SOC = ['47-2111', '47-2061', '47-2073'];
var PUBLISHED = '2025-05';
var READ = '2026-10-18';
var SOURCE = 'U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025. Mean hourly wage (datatype 03) and employment (datatype 01) for SOC 47-2111, 47-2061, and 47-2073. National, state, and the five metro areas below were read from the public API.';
var URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
var NATIONAL = { hourly: [34.37, 25.02, 31.87], employment: [757220, 1096780, 478090] };
var STATES = {
  AL: { hourly: [27.65, 18.23, 24.36], employment: [10900, 18400, 9640] },
  AK: { hourly: [43.29, 28.5, 39.75], employment: [1870, 3690, 3050] },
  AZ: { hourly: [30.88, 23.03, 29.58], employment: [21140, 37630, 13200] },
  AR: { hourly: [25.71, 18.87, 22.06], employment: [7500, 10650, 5800] },
  CA: { hourly: [41.28, 31.19, 45.19], employment: [73310, 88240, 36020] },
  CO: { hourly: [31.88, 23.96, 31.04], employment: [17010, 18680, 11700] },
  CT: { hourly: [37.21, 28.49, 40.09], employment: [7710, 7360, 2860] },
  DE: { hourly: [34.02, 23.09, 29.18], employment: [2260, 3240, 1230] },
  DC: { hourly: [42.72, 25.11, 36.77], employment: [2440, 2090, 620] },
  FL: { hourly: [27.72, 21.42, 25.28], employment: [49700, 87040, 27510] },
  GA: { hourly: [29.37, 19.96, 23.88], employment: [21650, 27800, 15700] },
  HI: { hourly: [44.65, 34.39, 49.05], employment: [3070, 4580, 2380] },
  ID: { hourly: [32.02, 23.38, 30.73], employment: [5690, 10850, 4270] },
  IL: { hourly: [44.34, 32.51, 43.51], employment: [23120, 35940, 12290] },
  IN: { hourly: [34.05, 25.99, 36.2], employment: [19020, 28600, 11520] },
  IA: { hourly: [30.38, 24.8, 30.66], employment: [10310, 13780, 5530] },
  KS: { hourly: [33.27, 21.91, 27.67], employment: [6350, 9990, 7070] },
  KY: { hourly: [29.52, 22.04, 28.52], employment: [11030, 13280, 7050] },
  LA: { hourly: [29.98, 20.31, 26.63], employment: [10550, 22100, 7860] },
  ME: { hourly: [37.14, 22.98, 27.99], employment: [3780, 3960, 2210] },
  MD: { hourly: [36.28, 23.24, 29.64], employment: [13690, 20920, 6610] },
  MA: { hourly: [39.21, 34.05, 40.74], employment: [17810, 16210, 9680] },
  MI: { hourly: [35.5, 25.54, 32.17], employment: [23530, 28490, 9500] },
  MN: { hourly: [38.86, 31.12, 38.01], employment: [14350, 28530, 8590] },
  MS: { hourly: [27.88, 19.38, 24.04], employment: [6610, 8800, 4170] },
  MO: { hourly: [34.77, 29.26, 32.67], employment: [12780, 17050, 10470] },
  MT: { hourly: [34.58, 24.8, 30.46], employment: [2750, 4590, 3750] },
  NE: { hourly: [30.75, 23.25, 28.0], employment: [6440, 8530, 3180] },
  NV: { hourly: [36.4, 25.98, 36.56], employment: [8350, 11890, 5410] },
  NH: { hourly: [31.63, 24.87, 32.34], employment: [3330, 4330, 1330] },
  NJ: { hourly: [41.68, 33.84, 44.84], employment: [13520, 23590, 5980] },
  NM: { hourly: [28.66, 19.93, 26.35], employment: [5020, 12470, 5520] },
  NY: { hourly: [40.8, 29.89, 43.6], employment: [40130, 52090, 14490] },
  NC: { hourly: [27.33, 21.76, 25.15], employment: [21640, 35620, 16580] },
  ND: { hourly: [33.87, 25.55, 33.0], employment: [3570, 5050, 4890] },
  OH: { hourly: [33.09, 28.03, 34.54], employment: [28950, 31910, 16920] },
  OK: { hourly: [30.49, 20.82, 24.09], employment: [8500, 13710, 7050] },
  OR: { hourly: [47.96, 26.79, 38.11], employment: [10590, 12620, 5630] },
  PA: { hourly: [36.43, 26.12, 31.69], employment: [22730, 35920, 22120] },
  RI: { hourly: [35.65, 29.7, 34.84], employment: [2420, 2110, 970] },
  SC: { hourly: [28.38, 21.86, 24.83], employment: [8010, 19620, 8160] },
  SD: { hourly: [29.8, 21.3, 28.53], employment: [2980, 1780, 2050] },
  TN: { hourly: [30.55, 22.1, 26.47], employment: [17070, 26250, 10660] },
  TX: { hourly: [28.5, 20.63, 25.84], employment: [76770, 123250, 55540] },
  UT: { hourly: [31.39, 23.27, 29.25], employment: [11450, 20950, 7880] },
  VT: { hourly: [35.27, 24.52, 29.0], employment: [1270, 1430, 1280] },
  VA: { hourly: [32.62, 21.0, 28.08], employment: [23630, 25830, 12100] },
  WA: { hourly: [45.42, 29.48, 42.45], employment: [19380, 25060, 10290] },
  WV: { hourly: [32.61, 21.9, 26.19], employment: [4290, 6620, 7830] },
  WI: { hourly: [35.49, 27.87, 37.39], employment: [14310, 20330, 8140] },
  WY: { hourly: [35.99, 21.84, 32.22], employment: [2960, 3350, 3800] },
};
var METROS = {
  '16980': { name: 'Chicago-Naperville-Elgin, IL-IN-WI', hourly: [45.41, 33.26, 46.33], employment: [17720, 26690, 7930], zip3: ['606'] },
  '41860': { name: 'San Francisco-Oakland-Fremont, CA', hourly: [49.85, 35.4, 53.03], employment: [9060, 11620, 4080], zip3: ['941'] },
  '26420': { name: 'Houston-The Woodlands-Sugar Land, TX', hourly: [29.55, 21.08, 26.64], employment: [19730, 34080, 14000], zip3: ['770'] },
  '31080': { name: 'Los Angeles-Long Beach-Anaheim, CA', hourly: [39.57, 30.39, 45.29], employment: [20610, 21730, 8780], zip3: ['900'] },
  '35620': { name: 'New York-Newark-Jersey City, NY-NJ', hourly: [42.63, 32.42, 48.42], employment: [36550, 50870, 11430], zip3: ['100'] },
};

function composite(hourly, employment) {
  var n = 0, d = 0, i;
  for (i = 0; i < hourly.length; i++) {
    n += hourly[i] * employment[i];
    d += employment[i];
  }
  return d ? n / d : null;
}

var NATIONAL_COMPOSITE = composite(NATIONAL.hourly, NATIONAL.employment);

function round4(x) {
  return Math.round(x * 10000) / 10000;
}

function pack(rec, geography, name, code) {
  var c = composite(rec.hourly, rec.employment);
  return {
    geography: geography,
    name: name,
    code: code,
    composite: round4(c),
    factor: round4(c / NATIONAL_COMPOSITE),
    electricianHourly: rec.hourly[0],
    electricianFactor: round4(rec.hourly[0] / NATIONAL.hourly[0]),
    hourly: rec.hourly,
    employment: rec.employment
  };
}

function zip3Of(zip) {
  var z = zip == null ? '' : String(zip).replace(/\D/g, '');
  return z.length >= 3 ? z.slice(0, 3) : null;
}

function metroForZip3(zip3) {
  var id, m;
  for (id in METROS) {
    if (!Object.prototype.hasOwnProperty.call(METROS, id)) continue;
    m = METROS[id];
    if (m.zip3.indexOf(zip3) >= 0) return { id: id, metro: m };
  }
  return null;
}

function lookup(state, zip) {
  var z3 = zip3Of(zip);
  var st = state ? String(state).toUpperCase() : null;
  var hit, packed;
  if (z3) {
    hit = metroForZip3(z3);
    if (hit) {
      packed = pack(hit.metro, 'metro', hit.metro.name, hit.id);
      packed.zip3 = z3;
      packed.state = st;
      return packed;
    }
  }
  if (st && STATES[st]) {
    packed = pack(STATES[st], 'state', st, st);
    packed.zip3 = z3;
    packed.state = st;
    return packed;
  }
  return {
    geography: st || z3 ? 'unmapped' : 'national',
    name: st || z3 ? null : 'United States',
    code: st || null,
    zip3: z3,
    state: st,
    composite: st || z3 ? null : round4(NATIONAL_COMPOSITE),
    factor: st || z3 ? null : 1,
    electricianHourly: NATIONAL.hourly[0],
    electricianFactor: st || z3 ? null : 1,
    hourly: NATIONAL.hourly,
    employment: NATIONAL.employment
  };
}

module.exports = {
  SOC: SOC,
  PUBLISHED: PUBLISHED,
  READ: READ,
  SOURCE: SOURCE,
  URL: URL,
  NATIONAL: NATIONAL,
  NATIONAL_COMPOSITE: NATIONAL_COMPOSITE,
  STATES: STATES,
  METROS: METROS,
  composite: composite,
  lookup: lookup,
  zip3Of: zip3Of
};

