/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The guided-build questions a person answers. Defaults and labels only.
 * The layout is api/_lib/guided-build.js, which reads these defaults when
 * a field is left blank. This file is safe to ship: it does not size,
 * space, or connect anything.
 */
(function (root) {
  'use strict';

  var BUILDERS = [
    { id: 'der', label: 'DER build', blurb: 'Solar, wind, or gas blocks and a collector.' },
    { id: 'autolayout', label: 'Auto-layout', blurb: 'Fill the parcel with solar tables.' },
    { id: 'bess', label: 'BESS build', blurb: 'Behind the meter, in front of the meter, or with solar.' },
    { id: 'topology', label: 'Full topology', blurb: 'From the point of connection out to the utility.' },
    { id: 'l2', label: 'Level 2', blurb: 'A row of Level 2 stalls and the panel that feeds them.' },
    { id: 'dcfc', label: 'DCFC build', blurb: 'Fast chargers, a transformer, and the service.' },
    { id: 'compute', label: 'Compute build', blurb: 'A data-center power chain. Radial unless you change it.' },
    { id: 'engineering', label: 'Engineering build', blurb: 'Interconnection, gear, battery, and the EMS.' }
  ];

  var FIELDS = {
    der: [
      { key: 'source', label: 'Source', type: 'select', value: 'pv', options: [['pv', 'Solar PV'], ['wind', 'Wind'], ['gas', 'Gas / genset']] },
      { key: 'mw', label: 'Nameplate (MW)', type: 'number', value: 5, min: 0.5, max: 20, step: 0.5 },
      { key: 'cols', label: 'Columns', type: 'number', value: 4, min: 1, max: 12, step: 1, advanced: true },
      { key: 'xfmr', label: 'A transformer on each block', type: 'check', value: true, advanced: true }
    ],
    autolayout: [
      { key: 'mount', label: 'Mount', type: 'select', value: 'fixed-ground', options: [['fixed-ground', 'Ground'], ['rooftop', 'Roof'], ['carport', 'Carport'], ['tracker-1ax', 'Single-axis tracker']] },
      { key: 'setbackFt', label: 'Setback (ft)', type: 'number', value: '', min: 0, max: 100, step: 1, advanced: true },
      { key: 'maxKwDc', label: 'Stop at kW-DC', type: 'number', value: '', min: 0, max: 100000, step: 10, advanced: true }
    ],
    bess: [
      { key: 'mode', label: 'Arrangement', type: 'select', value: 'btm', options: [['btm', 'Behind the meter'], ['fom', 'Front of the meter'], ['solar', 'Solar + storage']] },
      { key: 'kw', label: 'Battery kW', type: 'number', value: 1000, min: 50, max: 20000, step: 50 },
      { key: 'hours', label: 'Hours', type: 'number', value: 2, min: 0.5, max: 8, step: 0.5 },
      { key: 'solarKw', label: 'Solar kW-AC at the inverter', type: 'number', value: '', min: 0, max: 20000, step: 10, advanced: true }
    ],
    topology: [
      { key: 'kw', label: 'Battery kW', type: 'number', value: 1000, min: 50, max: 20000, step: 50 },
      { key: 'hours', label: 'Hours', type: 'number', value: 2, min: 0.5, max: 8, step: 0.5 }
    ],
    l2: [
      { key: 'stalls', label: 'Stalls', type: 'number', value: 8, min: 1, max: 40, step: 1 },
      { key: 'amps', label: 'Nameplate (A)', type: 'number', value: 32, min: 16, max: 80, step: 1 },
      { key: 'volts', label: 'Volts', type: 'select', value: '240', options: [['240', '240 V'], ['208', '208 V']] },
      { key: 'service', label: 'Service', type: 'select', value: 'existing', options: [['existing', 'Existing panel'], ['new', 'New service']], advanced: true }
    ],
    dcfc: [
      { key: 'count', label: 'Chargers', type: 'number', value: 4, min: 1, max: 40, step: 1 },
      { key: 'kw', label: 'kW each', type: 'number', value: 150, min: 50, max: 400, step: 10 },
      { key: 'ports', label: 'Ports each', type: 'number', value: 2, min: 1, max: 4, step: 1, advanced: true }
    ],
    compute: [
      { key: 'topo', label: 'Topology', type: 'select', value: 'RADIAL', options: [['RADIAL', 'Radial'], ['N1', 'N+1'], ['ISO', 'Isolated redundant'], ['DIST', 'Distributed redundant'], ['TWON', '2N'], ['DC800', '800 VDC']] },
      { key: 'computeMw', label: 'Compute (MW)', type: 'number', value: 5, min: 0.5, max: 100, step: 0.5 },
      { key: 'incBess', label: 'Include the battery', type: 'check', value: true, advanced: true },
      { key: 'incCool', label: 'Include cooling', type: 'check', value: true, advanced: true },
      { key: 'bessKw', label: 'Battery kW', type: 'number', value: '', min: 0, max: 50000, step: 50, advanced: true },
      { key: 'bessHours', label: 'Battery hours', type: 'number', value: '', min: 0, max: 8, step: 0.5, advanced: true }
    ],
    engineering: [
      { key: 'kw', label: 'Battery kW', type: 'number', value: 1000, min: 50, max: 20000, step: 50 },
      { key: 'hours', label: 'Hours', type: 'number', value: 2, min: 0.5, max: 8, step: 0.5 },
      { key: 'unitKwh', label: 'kWh per container', type: 'number', value: '', min: 50, max: 10000, step: 10, advanced: true }
    ]
  };

  function builders() {
    var out = [], i;
    for (i = 0; i < BUILDERS.length; i++) out.push({ id: BUILDERS[i].id, label: BUILDERS[i].label, blurb: BUILDERS[i].blurb });
    return out;
  }
  function fields(id) {
    var list = FIELDS[id], out = [], i;
    if (!list) return [];
    for (i = 0; i < list.length; i++) {
      var f = list[i], o = [], j;
      var copy = { key: f.key, label: f.label, type: f.type, value: f.value };
      if (f.min != null) copy.min = f.min;
      if (f.max != null) copy.max = f.max;
      if (f.step != null) copy.step = f.step;
      if (f.advanced) copy.advanced = true;
      if (f.options) {
        for (j = 0; j < f.options.length; j++) o.push(f.options[j].slice());
        copy.options = o;
      }
      out.push(copy);
    }
    return out;
  }
  function defaults(id) {
    var list = fields(id), out = {}, i;
    for (i = 0; i < list.length; i++) out[list[i].key] = list[i].value;
    return out;
  }
  function ids() {
    var out = [], i;
    for (i = 0; i < BUILDERS.length; i++) out.push(BUILDERS[i].id);
    return out;
  }

  var api = { builders: builders, fields: fields, defaults: defaults, ids: ids, VERSION: 'guided-build-form/1' };
  root.OmegaGuidedBuildForm = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
