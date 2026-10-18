/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/bankability.js — one readiness score for a funding package
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. No I/O, no tariff lookup, no price, no credit calculation. The
   package either carries the evidence or it does not. Editor-v2, the
   portfolio hand-off and the marketplace v2 preview all ask this module
   (through POST /api/funding-v2). The browser draws the answer; it does
   not keep a second copy of the weights.

   The score is a completeness score of evidence, 0 to 100. It is not a
   credit rating and it is not a market hurdle. The line a package must
   clear before a financier can see it is a ClearSky product rule
   (DEFAULT_THRESHOLD). Each hard gate is a fact the package has to state;
   the citations for why that fact is on the list are in
   docs/FUNDING-MARKETPLACE-V2.md. This file does not invent a rate, a
   tariff, an IRR or a hosting-capacity number.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var DEFAULT_THRESHOLD = 80;

/* The live portal's own development stages (portals/finance/index.html
   DEV_STAGES). Held together by scripts/tests/tfundingv2.js. A financier's
   minimum stage uses this order. */
var DEV_STAGES = [
  'Opportunity introduced',
  'Qualifying — gathering utility data',
  'Proposal issued',
  'Contract executed',
  'Notice to proceed',
  'In construction',
  'Energized'
];

var TECHS = [
  { id: 'solar', label: 'Solar PV' },
  { id: 'storage', label: 'Storage / BESS' },
  { id: 'solar_bess', label: 'Solar + Storage' },
  { id: 'ev', label: 'EV Charging' },
  { id: 'datacenter', label: 'Data Centre / Microgrid' },
  { id: 'land', label: 'Powered Land / Site' },
  { id: 'efficiency', label: 'Building / Efficiency' }
];

var REQUIRED_SLOTS = ['site-control', 'interconnection', 'bom', 'one-line', 'plot', 'cost'];

var SLOT_LABEL = {
  'site-control': 'Site control instrument',
  interconnection: 'Interconnection evidence',
  bom: 'Bill of materials',
  'one-line': 'One-line diagram',
  plot: 'Plot plan',
  cost: 'Cost backup'
};

/* Points sum to 100. Hard means "missing this blocks the financier list
   even when the number is high." */
var CATEGORIES = [
  { id: 'siteControl', label: 'Site control', points: 8, hard: true,
    why: 'FERC Order No. 2023-A describes site control as the right to develop the site, such as a purchase or a lease. A letter of intent does not clear this gate.' },
  { id: 'interconnection', label: 'Interconnection', points: 12, hard: true,
    why: 'Order No. 2023 asks for evidence a project is ready to be studied. A screening or a hosting-capacity reading is evidence of a look, and it is labeled as that. It is not an agreement.' },
  { id: 'tariff', label: 'Utility and tariff', points: 8, hard: true,
    why: 'A rate used in the model has to name the utility, the schedule, the source and the date. This gate does not look up a tariff.' },
  { id: 'incentives', label: 'Incentive eligibility', points: 6, hard: true,
    why: 'The package has to say whether an incentive is claimed. A claim names the program and the source. This gate does not compute a credit.' },
  { id: 'design', label: 'Engineered design', points: 9, hard: true,
    why: 'The bill of materials, the one-line and the plot plan each have to be on the package. A sentence that says they exist does not stand in for them.' },
  { id: 'cost', label: 'Cost estimate', points: 10, hard: true,
    why: 'The estimate has to name where the figure came from. This gate does not price the project.' },
  { id: 'production', label: 'Energy and production', points: 8, hard: true,
    why: 'Production needs a method and a source. An assumption counts only when the package says it is an assumption.' },
  { id: 'valueStack', label: 'Value stack', points: 8, hard: true,
    why: 'Each stream needs the assumption and the source it was built on. This gate does not add a stream or a price.' },
  { id: 'returns', label: 'IRR, NPV and payback', points: 10, hard: true,
    why: 'IRR, NPV and payback are read off the package, with the term and the basis (for example after-tax). This gate does not calculate them. IRR is a decimal fraction, the way the pro forma states it.' },
  { id: 'offtake', label: 'Offtaker or customer', points: 6, hard: true,
    why: 'The buyer of the output has to be named, or the package has to say in so many words that offtake is merchant. Silence does not pass.' },
  { id: 'permitting', label: 'Permitting', points: 5, hard: true,
    why: 'The status has to be named, including not started. An application or an approval needs its date.' },
  { id: 'documents', label: 'Document index', points: 10, hard: true,
    why: 'The required instruments have to be in the document index: site control, interconnection, BOM, one-line, plot plan and cost backup.' }
];

function text(v) {
  var s = v == null ? '' : String(v).replace(/^\s+|\s+$/g, '');
  return s ? s : '';
}
function dateOk(v) {
  var s = text(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return d.getUTCFullYear() === +p[0] && d.getUTCMonth() === +p[1] - 1 && d.getUTCDate() === +p[2];
}
function finite(v) { return v != null && v !== '' && isFinite(+v); }
function item(cat, earned, pass, missing) {
  return {
    id: cat.id, label: cat.label, points: cat.points, hard: cat.hard, why: cat.why,
    earned: earned, pass: !!pass, missing: missing || ''
  };
}
function art(v) { return !!(v && (text(v.name) || text(v.id))); }

function siteItem(cat, s) {
  s = s || {};
  if (s.instrument === 'loi' || s.stated) {
    return item(cat, s.instrument === 'loi' ? 2 : 0, false,
      s.stated
        ? 'Site control is only a sentence on the form. Add a lease, an option, or ownership, with its date.'
        : 'A letter of intent is not site control for this gate. Add a lease, an option, or ownership, with its date.');
  }
  var okInst = { lease: 1, option: 1, ownership: 1, 'purchase-agreement': 1 };
  if (!okInst[s.instrument]) return item(cat, 0, false, 'Name the site-control instrument: lease, option, ownership, or purchase agreement.');
  if (!dateOk(s.date)) return item(cat, 4, false, 'Site control needs the date of the ' + s.instrument + '.');
  if (!text(s.party) && !text(s.documentId)) return item(cat, 4, false, 'Name the other party, or attach the instrument.');
  var full = !!text(s.documentId);
  return item(cat, full ? 8 : 6, true, full ? '' : 'Attach the site-control instrument in the document index.');
}

function ixItem(cat, g) {
  g = g || {};
  if (g.kind === 'declined') return item(cat, 0, false, 'Interconnection was declined. Financiers cannot see this until that is no longer the record.');
  var pts = { screening: 8, application: 10, agreement: 12, 'will-serve': 12 };
  if (!pts[g.kind] || !text(g.utility) || !text(g.source) || !dateOk(g.asOf)) {
    return item(cat, 0, false, 'Interconnection needs a kind (screening, application, agreement, or will-serve), the utility, a source, and a date. A sentence on the form is not enough.');
  }
  var note = g.kind === 'screening' ? 'Interconnection evidence is a screening, not an agreement.'
    : (g.kind === 'application' ? 'An interconnection application is on file. An agreement raises the score.' : '');
  return item(cat, pts[g.kind], true, note);
}

function tariffItem(cat, t) {
  t = t || {};
  var gaps = [];
  if (!text(t.utility)) gaps.push('the utility');
  if (!text(t.schedule)) gaps.push('the rate schedule');
  if (!text(t.source)) gaps.push('the source');
  if (!dateOk(t.asOf)) gaps.push('the as-of date');
  if (gaps.length) return item(cat, 0, false, 'The tariff is missing ' + gaps.join(', ') + '.');
  return item(cat, 8, true, '');
}

function incentiveItem(cat, inc) {
  inc = inc || {};
  if (inc.claimed !== true && inc.claimed !== false) {
    return item(cat, 0, false, 'Say whether an incentive is claimed. Either answer is allowed; silence is not.');
  }
  if (inc.claimed === false) {
    return item(cat, 3, true, 'No incentive is claimed.');
  }
  var programs = Array.isArray(inc.programs) ? inc.programs : [];
  var ok = programs.length && programs.every(function (p) { return p && text(p.name) && text(p.source); });
  if (!ok) return item(cat, 0, false, 'Each claimed incentive needs its program name and a source. This gate does not compute a credit.');
  return item(cat, 6, true, '');
}

function designItem(cat, d) {
  d = d || {};
  var parts = [['bom', 'bill of materials'], ['oneLine', 'one-line diagram'], ['plot', 'plot plan']];
  var have = 0, miss = [];
  parts.forEach(function (p) { if (art(d[p[0]])) have++; else miss.push(p[1]); });
  if (miss.length) return item(cat, have * 3, false, 'The design is missing the ' + miss.join(' and the ') + '.');
  return item(cat, 9, true, '');
}

function sourceCounts(src) {
  /* The editor's contracted/benchmark flag names a class, not a document. */
  return text(src) && !/^(benchmark|contracted)$/i.test(text(src));
}
function costItem(cat, c) {
  c = c || {};
  var lines = (Array.isArray(c.lines) ? c.lines : []).filter(function (l) {
    return l && finite(l.amount) && +l.amount > 0 && sourceCounts(l.source);
  });
  if (!lines.length || !finite(c.amount) || +c.amount <= 0) {
    return item(cat, 0, false, 'The cost estimate needs an amount and at least one line that names its source. A benchmark or contracted flag, with no document behind it, does not pass.');
  }
  var rich = lines.length >= 2 || lines.some(function (l) {
    var src = String(l.source);
    return /quote|invoice|datasheet|price book/i.test(src) || (/contract/i.test(src) && src.length > 16);
  });
  return item(cat, rich ? 10 : 6, true, rich ? '' : 'The cost names a source. A quote, a contract, an invoice, a datasheet, a price book, or a second sourced line raises the score.');
}

function productionItem(cat, p) {
  p = p || {};
  var qty = (finite(p.annualKwh) && +p.annualKwh > 0) || (finite(p.annualMwh) && +p.annualMwh > 0) || +p.hours === 8760;
  if (!text(p.method) || !text(p.source) || !qty) {
    return item(cat, 0, false, 'Production needs a method, a source, and a quantity (annual kWh, annual MWh, or an 8,760-hour basis).');
  }
  if (p.assumed === true) return item(cat, 5, true, 'Production is a stated assumption, not the site\'s own measured basis.');
  if (!dateOk(p.asOf)) return item(cat, 5, true, 'Production has a method and a source, and no as-of date.');
  return item(cat, 8, true, '');
}

function stackItem(cat, v) {
  var streams = (v && Array.isArray(v.streams)) ? v.streams : [];
  var n = streams.filter(function (s) { return s && text(s.name) && text(s.assumption) && text(s.source); }).length;
  if (!n) return item(cat, 0, false, 'The value stack needs at least one stream with its name, its assumption, and its source.');
  if (n === 1) return item(cat, 4, true, 'One value-stack stream is on file. A second stream, with its assumption and source, raises the score.');
  return item(cat, 8, true, '');
}

function returnsItem(cat, r) {
  r = r || {};
  var gaps = [];
  var irrOk = finite(r.irr) && Math.abs(+r.irr) <= 1.5;
  if (!finite(r.irr)) gaps.push('IRR');
  else if (Math.abs(+r.irr) > 1.5) gaps.push('IRR as a decimal fraction (0.12 for 12%, the way the pro forma states it)');
  if (!finite(r.npv)) gaps.push('NPV');
  if (!finite(r.paybackYears) || +r.paybackYears < 0) gaps.push('payback');
  if (!text(r.basis)) gaps.push('the basis (for example after-tax)');
  if (!(finite(r.termYears) && +r.termYears > 0)) gaps.push('the term in years');
  if (gaps.length) return item(cat, 0, false, 'The returns are missing ' + gaps.join(', ') + '. This gate does not calculate them.');
  if (!irrOk) return item(cat, 0, false, 'IRR must be a decimal fraction (0.12 for 12%).');
  return item(cat, 10, true, +r.irr < 0 ? 'IRR is negative on the stated basis.' : '');
}

function offtakeItem(cat, o) {
  o = o || {};
  if (o.position === 'merchant') return item(cat, 2, true, 'Offtake is merchant. There is no contracted customer.');
  if (o.position === 'named' && text(o.party)) return item(cat, 4, true, 'An offtaker is named. A signed contract raises the score.');
  if (o.position === 'signed' && text(o.party) && text(o.source)) return item(cat, 6, true, '');
  return item(cat, 0, false, 'Name the offtaker, or say that offtake is merchant. Silence does not pass.');
}

function permitItem(cat, p) {
  p = p || {};
  if (p.status === 'not-started') return item(cat, 1, true, 'Permits have not been started.');
  if (p.status === 'applied' || p.status === 'approved') {
    if (!dateOk(p.asOf)) return item(cat, 0, false, 'Permitting is marked ' + p.status + ' without a date.');
    return item(cat, p.status === 'approved' ? 5 : 3, true, p.status === 'applied' ? 'Permits are applied, not approved.' : '');
  }
  return item(cat, 0, false, 'Name the permitting status: not started, applied, or approved.');
}

function slotPresent(documents, slot) {
  return (documents || []).some(function (d) { return d && d.slot === slot && (text(d.name) || text(d.id)); });
}
function documentsItem(cat, documents) {
  var miss = REQUIRED_SLOTS.filter(function (s) { return !slotPresent(documents, s); });
  var n = REQUIRED_SLOTS.length - miss.length;
  if (miss.length) {
    return item(cat, Math.floor(10 * n / REQUIRED_SLOTS.length), false,
      'The document index is missing ' + miss.map(function (s) { return SLOT_LABEL[s]; }).join(', ') + '.');
  }
  return item(cat, 10, true, '');
}

var GRADERS = {
  siteControl: siteItem, interconnection: ixItem, tariff: tariffItem, incentives: incentiveItem,
  design: designItem, cost: costItem, production: productionItem, valueStack: stackItem,
  returns: returnsItem, offtake: offtakeItem, permitting: permitItem
};

function score(pkg, opts) {
  pkg = pkg || {};
  opts = opts || {};
  var threshold = finite(opts.threshold) ? +opts.threshold : DEFAULT_THRESHOLD;
  if (threshold < 0) threshold = 0;
  if (threshold > 100) threshold = 100;
  var items = CATEGORIES.map(function (cat) {
    if (cat.id === 'documents') return documentsItem(cat, pkg.documents);
    var grader = GRADERS[cat.id];
    return grader(cat, pkg[cat.id]);
  });
  var total = 0, hardFail = [];
  items.forEach(function (it) {
    total += it.earned;
    if (it.hard && !it.pass) hardFail.push(it.id);
  });
  if (total > 100) total = 100;
  var visible = hardFail.length === 0 && total >= threshold;
  var checklist = [];
  if (!visible) checklist.push('Financiers cannot see this yet.');
  if (hardFail.length === 0 && total < threshold) {
    checklist.push('The score is ' + total + '. The line to be listed is ' + threshold + '.');
  }
  items.forEach(function (it) { if (it.missing) checklist.push(it.missing); });
  var risks = items.filter(function (it) { return it.pass && it.missing; }).map(function (it) { return it.missing; });
  return {
    score: total, threshold: threshold, visible: visible, hardFail: hardFail,
    items: items, checklist: checklist, risks: risks,
    gatesPassed: items.filter(function (it) { return it.pass; }).length,
    gates: items.length
  };
}

function group(n) {
  var s = String(Math.round(Math.abs(+n)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function money(n) {
  if (!finite(n)) return null;
  return (+n < 0 ? '-$' : '$') + group(n);
}
function irrText(v) {
  if (!finite(v) || Math.abs(+v) > 1.5) return null;
  var pct = Math.round(+v * 1000) / 10;
  return (pct % 1 === 0 ? String(pct) : pct.toFixed(1)) + '%';
}
function techLabel(id) {
  var hit = TECHS.filter(function (t) { return t.id === id; })[0];
  return hit ? hit.label : (text(id) || null);
}

function summary(pkg, result) {
  pkg = pkg || {};
  result = result || score(pkg);
  var r = pkg.returns || {}, cost = pkg.cost || {}, off = pkg.offtake || {};
  var streams = ((pkg.valueStack && pkg.valueStack.streams) || []).filter(function (s) {
    return s && text(s.name);
  }).map(function (s) {
    return { name: text(s.name), assumption: text(s.assumption) || null, source: text(s.source) || null };
  });
  return {
    id: text(pkg.id) || null,
    name: text(pkg.name) || 'Untitled package',
    illustrative: pkg.illustrative === true,
    place: [text(pkg.city), text(pkg.state)].filter(Boolean).join(', ') || null,
    state: text(pkg.state) || null,
    tech: text(pkg.tech) || null,
    techLabel: techLabel(pkg.tech),
    mw: finite(pkg.mw) ? +pkg.mw : null,
    mwh: finite(pkg.mwh) ? +pkg.mwh : null,
    devStage: text(pkg.devStage) || null,
    ask: finite(cost.amount) ? +cost.amount : (finite(pkg.ask) ? +pkg.ask : null),
    askText: money(finite(cost.amount) ? cost.amount : pkg.ask),
    irr: finite(r.irr) ? +r.irr : null,
    irrText: irrText(r.irr),
    npvText: money(r.npv),
    paybackText: finite(r.paybackYears) ? (+r.paybackYears + ' years') : null,
    termYears: finite(r.termYears) ? +r.termYears : null,
    basis: text(r.basis) || null,
    offtake: off.position === 'merchant' ? 'Merchant' : (text(off.party) || null),
    offtakePosition: text(off.position) || null,
    streams: streams,
    score: result.score, threshold: result.threshold, visible: result.visible,
    risks: result.risks, checklist: result.checklist, gatesPassed: result.gatesPassed, gates: result.gates
  };
}

function criteria(raw) {
  raw = raw || {};
  var out = { minMw: null, maxMw: null, minMwh: null, minIrr: null, technologies: [], states: [], minStage: null, minScore: null };
  ['minMw', 'maxMw', 'minMwh', 'minIrr', 'minScore'].forEach(function (k) {
    if (raw[k] == null || raw[k] === '') return;
    if (!finite(raw[k]) || +raw[k] < 0) { var e = new Error(k + ' must be a number that is zero or more.'); e.status = 400; throw e; }
    out[k] = +raw[k];
  });
  if (out.minIrr != null && out.minIrr > 100) { var e1 = new Error('Minimum IRR is a percent from 0 to 100.'); e1.status = 400; throw e1; }
  if (out.minScore != null && out.minScore > 100) { var e2 = new Error('Minimum score is from 0 to 100.'); e2.status = 400; throw e2; }
  var techs = Array.isArray(raw.technologies) ? raw.technologies : (raw.technology ? [raw.technology] : []);
  techs.forEach(function (id) {
    id = text(id);
    if (!id) return;
    if (!TECHS.some(function (t) { return t.id === id; })) { var e3 = new Error('Unknown technology: ' + id); e3.status = 400; throw e3; }
    if (out.technologies.indexOf(id) < 0) out.technologies.push(id);
  });
  var states = Array.isArray(raw.states) ? raw.states : (raw.state ? [raw.state] : []);
  states.forEach(function (st) {
    st = text(st).toUpperCase();
    if (!st) return;
    if (!/^[A-Z]{2}$/.test(st)) { var e4 = new Error('State must be a two-letter code.'); e4.status = 400; throw e4; }
    if (out.states.indexOf(st) < 0) out.states.push(st);
  });
  if (text(raw.minStage)) {
    if (DEV_STAGES.indexOf(text(raw.minStage)) < 0) { var e5 = new Error('Unknown stage.'); e5.status = 400; throw e5; }
    out.minStage = text(raw.minStage);
  }
  return out;
}

function irrPct(v) {
  if (!finite(v) || Math.abs(+v) > 1.5) return null;
  return +v * 100;
}
function matches(pkg, result, crit) {
  crit = crit || {};
  if (!result || !result.visible) return false;
  if (crit.minScore != null && result.score < crit.minScore) return false;
  if (crit.minMw != null && !(finite(pkg.mw) && +pkg.mw >= crit.minMw)) return false;
  if (crit.maxMw != null && !(finite(pkg.mw) && +pkg.mw <= crit.maxMw)) return false;
  if (crit.minMwh != null && !(finite(pkg.mwh) && +pkg.mwh >= crit.minMwh)) return false;
  if (crit.minIrr != null) {
    var pct = irrPct(pkg.returns && pkg.returns.irr);
    if (pct == null || pct < crit.minIrr) return false;
  }
  if (crit.technologies && crit.technologies.length && crit.technologies.indexOf(pkg.tech) < 0) return false;
  if (crit.states && crit.states.length && crit.states.indexOf(text(pkg.state).toUpperCase()) < 0) return false;
  if (crit.minStage) {
    var a = DEV_STAGES.indexOf(text(pkg.devStage)), b = DEV_STAGES.indexOf(crit.minStage);
    if (a < 0 || a < b) return false;
  }
  return true;
}

function compare(rows) {
  rows = rows || [];
  if (rows.length < 2 || rows.length > 3) {
    var e = new Error('Compare two or three packages that financiers can see.');
    e.status = 400; throw e;
  }
  var cards = rows.map(function (row) {
    var result = row.result || score(row.package || row);
    if (!result.visible) { var err = new Error('A package financiers cannot see is not on the comparison.'); err.status = 400; throw err; }
    return summary(row.package || row, result);
  });
  var fields = [
    ['askText', 'ROM'], ['irrText', 'IRR'], ['npvText', 'NPV'], ['paybackText', 'Payback'],
    ['score', 'Readiness'], ['mw', 'MW'], ['mwh', 'MWh'], ['techLabel', 'Technology'],
    ['place', 'Place'], ['devStage', 'Stage'], ['offtake', 'Offtake'], ['basis', 'Return basis']
  ];
  return {
    ids: cards.map(function (c) { return c.id; }),
    names: cards.map(function (c) { return c.name; }),
    rows: fields.map(function (f) {
      return { key: f[0], label: f[1], cells: cards.map(function (c) { return c[f[0]] == null ? '—' : c[f[0]]; }) };
    }),
    risks: cards.map(function (c) { return { id: c.id, name: c.name, risks: c.risks }; })
  };
}

function blankPackage() {
  return {
    documents: [],
    siteControl: null, interconnection: null, tariff: null, incentives: null,
    design: null, cost: null, production: null, valueStack: null, returns: null,
    offtake: null, permitting: null
  };
}

/* The editor's push today sends free text. Free text is recorded and does
   not clear a gate. A grid verdict clears interconnection only when the
   caller passes utility, source and date — this function never looks them up. */
function fromDrawing(input) {
  input = input || {};
  var pkg = blankPackage();
  pkg.id = text(input.id) || null;
  pkg.name = text(input.name) || '';
  pkg.state = text(input.state).toUpperCase();
  pkg.city = text(input.city);
  pkg.tech = text(input.tech);
  pkg.mw = finite(input.mw) ? +input.mw : null;
  pkg.mwh = finite(input.mwh) ? +input.mwh : null;
  pkg.ask = finite(input.ask) ? +input.ask : null;
  pkg.devStage = text(input.devStage);
  if (input.siteControl && typeof input.siteControl === 'object') pkg.siteControl = input.siteControl;
  else if (text(input.siteControl)) pkg.siteControl = { stated: text(input.siteControl) };
  if (input.interconnection && typeof input.interconnection === 'object') pkg.interconnection = input.interconnection;
  else if (input.grid && text(input.grid.utility) && text(input.grid.source) && dateOk(input.grid.asOf)) {
    pkg.interconnection = {
      kind: text(input.grid.kind) || 'screening', utility: text(input.grid.utility),
      source: text(input.grid.source), asOf: text(input.grid.asOf), queueId: text(input.grid.queueId) || null
    };
  } else if (text(input.interconnect)) pkg.interconnection = { stated: text(input.interconnect) };
  if (input.tariff && typeof input.tariff === 'object') pkg.tariff = input.tariff;
  if (input.incentives && typeof input.incentives === 'object') pkg.incentives = input.incentives;
  if (input.design && typeof input.design === 'object') pkg.design = input.design;
  if (input.cost && typeof input.cost === 'object') pkg.cost = input.cost;
  else if (finite(input.ask) && +input.ask > 0) {
    var flag = text(input.capexSource);
    pkg.cost = flag === 'contracted' || flag === 'benchmark'
      ? { amount: +input.ask, lines: [{ label: 'Editor cost total', amount: +input.ask, source: flag }] }
      : { amount: +input.ask, lines: [] };
  }
  if (input.production && typeof input.production === 'object') pkg.production = input.production;
  if (input.valueStack && typeof input.valueStack === 'object') pkg.valueStack = input.valueStack;
  if (input.returns && typeof input.returns === 'object') pkg.returns = input.returns;
  if (input.offtake && typeof input.offtake === 'object') pkg.offtake = input.offtake;
  else if (text(input.offtake)) pkg.offtake = /speculative|no signed|merchant/i.test(input.offtake)
    ? { position: 'merchant' } : { position: 'named', party: text(input.offtake) };
  if (input.permitting && typeof input.permitting === 'object') pkg.permitting = input.permitting;
  else if (text(input.permits)) pkg.permitting = { stated: text(input.permits) };
  pkg.documents = Array.isArray(input.documents) ? input.documents : [];
  return pkg;
}

/* Portfolio send-to-finance carries latestModel (summaryOf) and little else.
   Fields the model does not store stay empty on purpose. */
function fromPortfolio(site) {
  site = site || {};
  var lm = site.latestModel || {}, host = lm.host || {}, storage = host.storage || {};
  var pkg = blankPackage();
  pkg.id = text(site.finProjectId) || text(site.id) || null;
  pkg.name = text(site.name);
  pkg.state = text(site.state).toUpperCase();
  pkg.city = text(site.city);
  pkg.tech = 'datacenter';
  pkg.mw = finite(lm.serviceKw) ? Math.round(+lm.serviceKw / 10) / 100 : null;
  pkg.devStage = text(site.devStage);
  if (finite(lm.totalProjectCost) && +lm.totalProjectCost > 0) {
    pkg.ask = +lm.totalProjectCost;
    pkg.cost = { amount: +lm.totalProjectCost, lines: [{ label: 'Total project cost', amount: +lm.totalProjectCost, source: 'compute-model totalUses', asOf: text(lm.at).slice(0, 10) }] };
  }
  if (finite(lm.irr) || finite(lm.npv) || finite(lm.paybackYears)) {
    pkg.returns = {
      irr: finite(lm.irr) ? +lm.irr : null,
      npv: finite(lm.npv) ? +lm.npv : null,
      paybackYears: finite(lm.paybackYears) ? +lm.paybackYears : null,
      termYears: finite(lm.termYears) ? +lm.termYears : null,
      /* summaryOf stores after-tax IRR in `irr`. The basis is that field, not a guess. */
      basis: finite(lm.irr) ? 'after-tax' : ''
    };
  }
  var load = storage.load || null;
  if (load && (text(load.source) || text(load.label))) {
    pkg.production = {
      method: text(load.source) || text(load.label),
      source: text(load.label) || text(load.source),
      annualKwh: finite(load.annualKwh) ? +load.annualKwh : null,
      assumed: storage.loadAssumed === true || site.loadAssumed === true,
      asOf: text(lm.at).slice(0, 10)
    };
  } else if (host.ppa && finite(host.ppa.year1Kwh) && +host.ppa.year1Kwh > 0) {
    pkg.production = { method: 'Contract production', source: 'PPA year-1 kWh on the site model', annualKwh: +host.ppa.year1Kwh, assumed: false, asOf: text(lm.at).slice(0, 10) };
  }
  var streams = Array.isArray(storage.streams) ? storage.streams : [];
  if (streams.length) {
    pkg.valueStack = { streams: streams.map(function (s) {
      return { name: text(s.name), assumption: text(s.tier) ? ('Tier stored on the stream: ' + text(s.tier)) : '', source: text(s.source) || (text(s.tier) ? 'Site model host.storage.streams' : '') };
    }) };
  }
  if (host.ppa && (finite(host.ppa.ratePerKwh) || host.ppa.schedule)) {
    pkg.offtake = { position: 'signed', party: 'PPA counterparty on the site model', source: host.ppa.schedule ? 'PPA price schedule on the site model' : 'PPA rate on the site model' };
  }
  return pkg;
}

function eventOf(type, body, caller) {
  body = body || {};
  var id = text(body.packageId);
  if (!id) { var e = new Error('packageId is required.'); e.status = 400; throw e; }
  if (id.length > 80) { var e2 = new Error('packageId is too long.'); e2.status = 400; throw e2; }
  var note = text(body.note).slice(0, 2000);
  if (type === 'request-info' && note.length < 5) { var e3 = new Error('Say what you need, in a sentence.'); e3.status = 400; throw e3; }
  return {
    type: type, packageId: id, note: note || null,
    by: caller && caller.email ? String(caller.email).toLowerCase() : null,
    uid: caller && caller.uid || null,
    at: new Date().toISOString(),
    stored: false
  };
}

function modelCard() {
  var sum = 0;
  CATEGORIES.forEach(function (c) { sum += c.points; });
  return {
    threshold: DEFAULT_THRESHOLD, points: sum,
    categories: CATEGORIES.map(function (c) {
      return { id: c.id, label: c.label, points: c.points, hard: c.hard, why: c.why };
    }),
    requiredDocuments: REQUIRED_SLOTS.map(function (s) { return { slot: s, label: SLOT_LABEL[s] }; }),
    stages: DEV_STAGES.slice(),
    technologies: TECHS.map(function (t) { return { id: t.id, label: t.label }; }),
    preview: true
  };
}

module.exports = {
  DEFAULT_THRESHOLD: DEFAULT_THRESHOLD, DEV_STAGES: DEV_STAGES, TECHS: TECHS,
  REQUIRED_SLOTS: REQUIRED_SLOTS, CATEGORIES: CATEGORIES, score: score, summary: summary,
  criteria: criteria, matches: matches, compare: compare, fromDrawing: fromDrawing,
  fromPortfolio: fromPortfolio, eventOf: eventOf, modelCard: modelCard, irrPct: irrPct
};
