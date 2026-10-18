/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-prime-v2.js — Omega Prime v2, the part with no page.
 *
 * The path is the live one: Site, Grid Atlas, Circuit, Load, Site Map,
 * Quote, Omega Logic. The project record is still omega-prime-project.js.
 * The customer on that record is omega-editor-v2-assign.js (the project-ref
 * model). The party link is omega-crm-foundation.js. This file calls them.
 * It does not score a circuit, price a pad, or size a battery.
 *
 * Release switch. PR #338 is adding a shared helper, OmegaExperience, for
 * the omega-experience launch. It is not on main yet. experienceRoute()
 * calls OmegaExperience.route('prime') when that function exists and
 * returns only the two paths this release owns. Until the helper is
 * published, the answer is null and launchers keep sending people to
 * /omega-prime. This route does not replace the live page.
 *
 * ES5. No build step.
 */
(function (root) {
  'use strict';

  var STEPS = [
    { id: 'site', label: 'Site' },
    { id: 'atlas', label: 'Grid Atlas' },
    { id: 'circuit', label: 'Circuit' },
    { id: 'load', label: 'Load' },
    { id: 'map', label: 'Site Map' },
    { id: 'quote', label: 'Quote' },
    { id: 'logic', label: 'Omega Logic' }
  ];

  var EXPERIENCE = {
    key: 'prime',
    helper: 'OmegaExperience.route',
    on: '/omega-prime-v2',
    off: '/omega-prime',
    note: 'Shared release switch omega-experience. Absent until the helper lands.'
  };

  /* Evidence, not a prize. Each row is a sourced figure the rep can stand
     on. Weights sum to 100. A study verdict still counts: it is an answer. */
  var READINESS = [
    { id: 'address', label: 'Address resolved', weight: 15 },
    { id: 'customer', label: 'Customer named', weight: 10 },
    { id: 'substation', label: 'Nearest substation', weight: 15 },
    { id: 'circuit', label: 'Circuit verdict', weight: 20 },
    { id: 'load', label: 'Bill peaks', weight: 10 },
    { id: 'design', label: 'Unit placed', weight: 15 },
    { id: 'price', label: 'Install price', weight: 15 }
  ];

  function fail(message) { var e = new Error(message); e.status = 400; return e; }

  function assignApi() {
    var A = root.OmegaEditorV2Assign;
    if (!A) throw fail('The project assignment model did not load.');
    return A;
  }
  function crmApi() {
    var C = root.OmegaCrmFoundation;
    if (!C) throw fail('The CRM model did not load.');
    return C;
  }
  function primeApi() {
    var P = root.OmegaPrimeProject;
    if (!P) throw fail('The Prime project model did not load.');
    return P;
  }

  function experienceRoute(host) {
    var X = host && host.OmegaExperience;
    var path;
    if (!X || typeof X.route !== 'function') return null;
    try { path = X.route(EXPERIENCE.key); }
    catch (e) { return null; }
    if (path !== EXPERIENCE.on && path !== EXPERIENCE.off) return null;
    return path;
  }

  function empty() {
    return {
      step: 'site',
      seen: {},
      addr: '', lat: null, lng: null, geoSrc: '', geoLabel: '', geoAt: '',
      state: '',
      assignment: null,
      customerIdSource: '',
      sub: null, subAt: '', txCount: 0,
      probe: null, verdict: null, grid: null, circuitUtility: '',
      hosting: null,
      rates: null, ratesAt: '', zip: '', load: null,
      placed: false, conduitFt: null, run: null, runAt: '',
      projectId: ''
    };
  }

  function on(state, id) {
    if (id === 'address') return !!(state && state.lat != null && state.geoSrc && state.geoAt);
    if (id === 'customer') return !!(state && state.assignment && state.assignment.customerName);
    if (id === 'substation') return !!(state && state.sub && state.sub.name && state.subAt);
    if (id === 'circuit') return !!(state && state.verdict && state.verdict.verdict && state.grid && state.grid.verdict && state.grid.verdict.at);
    if (id === 'load') return !!(state && state.load && state.load.months > 0 && state.load.at);
    if (id === 'design') return !!(state && state.placed);
    if (id === 'price') return !!(state && state.run && state.run.total && state.runAt);
    return false;
  }

  function readiness(state) {
    var items = [], score = 0, i, row, hit;
    for (i = 0; i < READINESS.length; i++) {
      row = READINESS[i];
      hit = on(state, row.id);
      if (hit) score += row.weight;
      items.push({ id: row.id, label: row.label, weight: row.weight, on: hit, points: hit ? row.weight : 0 });
    }
    return { score: score, of: 100, items: items, label: score + ' of 100' };
  }

  function stepIndex(id) {
    var i;
    for (i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return i;
    return -1;
  }

  function canOpen(state, id) {
    var i = stepIndex(id), prev;
    if (i < 0) return false;
    if (i === 0) return true;
    prev = STEPS[i - 1].id;
    return !!(state && state.seen && state.seen[prev]);
  }

  function miles(a, b) {
    var R = 3958.8, p = Math.PI / 180;
    var dLat = (b[0] - a[0]) * p, dLng = (b[1] - a[1]) * p;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * p) * Math.cos(b[0] * p) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function stateOf(text) {
    var m = String(text || '').toUpperCase().match(/\b([A-Z]{2})\s*,?\s*\d{5}\b/);
    return m ? m[1] : '';
  }

  function localCustomerId(name) {
    var s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
    if (!s) throw fail('The customer needs a name.');
    return 'c_' + s;
  }

  function projectId() {
    var n = Date.now().toString(36);
    var r = Math.floor(Math.random() * 1e9).toString(36);
    return ('p_' + n + r).slice(0, 40);
  }

  /* Name is required. An id the CRM already minted is kept. Otherwise the
     id is local (c_<slug>) and marked prime-v2-local. The customers
     collection is not written here. */
  function attachCustomer(current, input) {
    var A = assignApi();
    input = input || {};
    var name = String(input.customerName || '').replace(/\s+/g, ' ').trim();
    if (!name) throw fail('Name the customer before this project is saved.');
    var id = input.customerId ? String(input.customerId).trim() : localCustomerId(name);
    var next = A.assignCustomer(current && current.assignment, { customerId: id, customerName: name });
    var source = input.customerId ? 'crm' : 'prime-v2-local';
    if (input.contactName || input.contactEmail) {
      next = A.setStakeholders(next, [{
        role: 'contact',
        name: input.contactName || '',
        email: input.contactEmail || '',
        company: name
      }]);
    }
    return { assignment: next, customerIdSource: source };
  }

  function cite(value, source, asOf) {
    if (value == null || value === '') return null;
    if (!source) throw fail('A figure needs its source.');
    if (!asOf) throw fail('A figure needs its date.');
    return { value: value, source: String(source), asOf: String(asOf) };
  }

  function nearest(subs, lat, lng) {
    var best = null, i, mi;
    for (i = 0; i < (subs || []).length; i++) {
      mi = miles([lat, lng], [subs[i].lat, subs[i].lng]);
      subs[i].mi = mi;
      if (!best || mi < best.mi) best = subs[i];
    }
    return best;
  }

  function circuitSourceLine(verdict, probe) {
    var row = probe && probe.rows ? probe.rows[0] : null;
    var a = verdict || {};
    var v = a.verdict || {};
    var line = 'Source: ComEd hosting-capacity service, resolved at the point';
    if (probe && probe.layerId != null) line += ' (layer ' + probe.layerId + ')';
    line += '; the battery figure is ComEd\'s BESS_HC and the queue its Feeder_Q, which ComEd does not subtract';
    if (row && row.refreshed) line += '. Queue refreshed ' + row.refreshed;
    line += '. Verdict: OMEGA grid verdict (' + (a.version || '') + ')';
    if (v.at) line += '. Asked ' + v.at;
    return line + '.';
  }

  function hostingSourceLine(screen, verdict) {
    var s = screen || {};
    var kind = s.publishedKind === 'generation' ? 'generation capacity' : (s.publishedKind === 'pv' ? 'PV hosting capacity, which is not a battery figure' : 'no published kilowatts');
    var when = s.asOf ? 'as of ' + s.asOf : 'the layer did not stamp a date';
    var asked = verdict && verdict.verdict && verdict.verdict.at ? ' Asked ' + verdict.verdict.at + '.' : '';
    return 'Source: ' + (s.utility || 'Utility') + ' (' + (s.sourceId || '') + ', ' + (s.grain || 'feeder') + '), ' + kind + ', ' + when
      + '. Registry verified ' + (s.verified || 'not recorded') + '. Not resolved at the parcel.'
      + ' Verdict: OMEGA grid verdict (' + ((verdict && verdict.version) || '') + ').' + asked;
  }

  function gridRecord(lat, lng, fields) {
    if (!fields) return null;
    return {
      lat: lat, lng: lng,
      substation: fields.substation, circuit: fields.circuit, verdict: fields.verdict,
      source: 'omega-prime-v2'
    };
  }

  function loadRecord(rates, zip, peaks, at) {
    var r = rates || {};
    var pk = peaks || [];
    var peak = null, sum = 0, i;
    for (i = 0; i < pk.length; i++) sum += pk[i];
    if (pk.length) peak = Math.max.apply(null, pk);
    return {
      utility: r.name || '', utilityKey: r.key || '', zip: zip || '',
      demandRate: r.demandRate == null ? null : +r.demandRate,
      energyRate: r.energyRate == null ? null : +r.energyRate,
      ratchet: r.ratchet == null ? null : +r.ratchet,
      tou: !!r.tou, peakWindow: r.peakWindow || '',
      peaksKw: pk, months: pk.length, peakKw: peak,
      demandChargeUsd: pk.length && r.demandRate != null ? Math.round(sum * r.demandRate) : null,
      source: 'OMEGA rate book, planning grade, not a tariff quote. The bill decides.',
      at: at,
      asOf: at,
      publisherAsOf: null
    };
  }

  /* Every number the page is allowed to show. A present figure without a
     source or a date throws, so a card cannot invent one. */
  function figures(state) {
    var s = state || {};
    var out = [];
    var sub = s.sub, c, net, rate;
    if (s.lat != null) out.push(cite(s.lat + ', ' + s.lng, s.geoSrc || '', s.geoAt || ''));
    if (sub && sub.mi != null) {
      out.push(cite(Math.round(sub.mi * 100) / 100 + ' mi', sub.source || '', s.subAt || ''));
    }
    if (sub && sub.kv != null) out.push(cite(sub.kv + ' kV', sub.source || '', s.subAt || ''));
    c = s.verdict && s.verdict.circuit;
    if (c && c.netKw != null) {
      net = s.circuitUtility === 'hosting' ? hostingSourceLine(s.hosting, s.verdict) : circuitSourceLine(s.verdict, s.probe);
      out.push(cite(c.netKw + ' kW net', net, (s.grid && s.grid.verdict && s.grid.verdict.at) || ''));
    }
    if (s.load && s.load.demandRate != null) out.push(cite('$' + s.load.demandRate + '/kW-month', s.load.source, s.load.at));
    if (s.load && s.load.peakKw != null) out.push(cite(s.load.peakKw + ' kW peak', 'Bill peaks the rep entered', s.load.at));
    if (s.conduitFt != null) out.push(cite(Math.round(s.conduitFt) + ' ft conduit', 'Measured on the satellite image', s.runAt || s.geoAt || ''));
    if (s.run && s.run.total && s.run.total.base != null) out.push(cite(s.run.total.base, s.run.pricedBy || 'api/price-site', s.runAt || ''));
    return out;
  }

  function projectDoc(st, who, stamp) {
    var P = primeApi();
    var A = assignApi();
    var C = crmApi();
    var attached, fields, id, link, applied, d;
    st = st || {};
    who = who || {};
    if (!who.orgId) throw fail('Sign in to save this site as a project.');
    if (!st.assignment || !st.assignment.customerName) throw fail('Name the customer before this project is saved.');
    attached = A.normalize(st.assignment);
    if (!attached.customerId) throw fail('A customer id is required on the project.');
    id = st.projectId || projectId();
    d = P.projectDoc(st, who, stamp);
    fields = A.toProjectFields(attached);
    d.assignment = fields.assignment;
    d.client = fields.client;
    d.projectRef = A.linkProject({
      projectId: id,
      remoteProjectId: id,
      orgId: who.orgId,
      customerId: attached.customerId
    });
    link = C.linkInput({
      kind: 'project',
      objectId: id,
      accountId: attached.customerId,
      role: 'customer',
      title: String(st.addr || attached.customerName).slice(0, 120)
    });
    applied = C.applyLink([], link);
    d.crm = { schema: 'omega.crm-links/1', links: applied.links };
    d.prime.v = 2;
    d.prime.route = '/omega-prime-v2';
    d.prime.customerIdSource = st.customerIdSource || '';
    d.prime.experience = experienceRoute(root) || 'preview';
    return d;
  }

  function nextAction(step, state) {
    var named = !!(state && state.assignment && state.assignment.customerName);
    if (step === 'site') return { go: 'atlas', label: 'Look at the grid' };
    if (step === 'atlas') return { go: 'circuit', label: 'Check the circuit' };
    if (step === 'circuit') return { go: 'load', label: 'Read the load' };
    if (step === 'load') return { go: 'map', label: named ? 'Design it' : 'Name the customer, then design', needsCustomer: !named };
    if (step === 'map') return { go: 'quote', label: 'Build the quote' };
    if (step === 'quote') return { go: 'logic', label: 'When the client says yes' };
    return { go: 'logic', label: 'Open Omega Logic' };
  }

  var api = {
    STEPS: STEPS,
    EXPERIENCE: EXPERIENCE,
    READINESS: READINESS,
    experienceRoute: experienceRoute,
    empty: empty,
    readiness: readiness,
    canOpen: canOpen,
    stepIndex: stepIndex,
    miles: miles,
    stateOf: stateOf,
    localCustomerId: localCustomerId,
    projectId: projectId,
    attachCustomer: attachCustomer,
    cite: cite,
    nearest: nearest,
    circuitSourceLine: circuitSourceLine,
    hostingSourceLine: hostingSourceLine,
    gridRecord: gridRecord,
    loadRecord: loadRecord,
    figures: figures,
    projectDoc: projectDoc,
    nextAction: nextAction,
    VERSION: 'omega-prime-v2/1'
  };
  root.OmegaPrimeV2 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
