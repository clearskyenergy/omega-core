/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-run.js — Run, from the drawing, on the server.
 *
 * Run reads what is drawn and asks the platform's own engines for the
 * numbers, through the doors Site Map's Run uses:
 *   the cost        POST /api/cost-rollup   (api/_lib/editor-cost.js)
 *   the value stack POST /api/value-stack   (streams, IRR, NPV, payback)
 *   the solar year  POST /api/solar-design  (when an array is drawn)
 * This file collects quantities and keeps the answers. It prices nothing,
 * dispatches nothing and judges nothing (CLAUDE.md: the math is in /api/).
 *
 * Each answer is kept on the document with the drawing it was run on
 * (sig), so Analyze can say when the drawing has changed since.
 */
(function (root) {
  'use strict';

  /* Site Plan's rack presets → the cost engine's mounts (editor-cost.js
     SOLAR_MOUNTS). A tracker is a ground array there; a carport is a canopy. */
  var MOUNT = { 'fixed-ground': 'ground', 'tracker-1ax': 'ground', rooftop: 'roof', carport: 'canopy' };
  var MISSING_MAX = 6;

  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function round(v) { return v == null || !isFinite(+v) ? null : Math.round(+v); }
  function D() { return root.OmegaEditorV2Doc; }

  /* What the drawing carries, in the quantities the cost engine reads. */
  function quantities(doc) {
    var s = D().summary(doc);
    var byMount = {}, placedSolar = 0, items = [], counts = { meter: 0, bollard: 0, hasXfmr: false };
    var list = (doc && doc.entities) || [], i, e, lay, m, kw;
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type === 'array') {
        lay = D().arrayLayout(doc, e);
        if (lay && lay.ok && lay.kw > 0) {
          m = MOUNT[e.mount || 'fixed-ground'] || 'ground';
          byMount[m] = (byMount[m] || 0) + lay.kw;
          placedSolar += lay.kw;
        }
      } else if (e.type === 'equip' && e.key === 'charger') {
        kw = num(e.kw);
        items.push({ kind: (e.level === 'dcfc' || kw >= 50) ? 'evdc' : 'evl2', kw: kw, qty: 1, key: e.model || e.label || 'charger' });
      } else if (e.type === 'equip' && e.key === 'meter') counts.meter++;
      else if (e.type === 'equip' && e.key === 'bollard') counts.bollard++;
      else if (e.type === 'equip' && e.key === 'transformer') counts.hasXfmr = true;
    }
    /* a solar block placed as equipment is ground solar in the takeoff */
    if (s.solarKwDc > placedSolar + 0.05) byMount.ground = (byMount.ground || 0) + (s.solarKwDc - placedSolar);
    for (m in byMount) if (byMount.hasOwnProperty(m)) byMount[m] = Math.round(byMount[m] * 10) / 10;
    var cost = {
      solarKwDc: s.solarKwDc || 0,
      solar: { byMount: byMount },
      ev: { items: items },
      counts: counts
    };
    if (s.bessKw > 0 || s.bessKwh > 0) {
      cost.fleetRating = { kw: s.bessKw, kwh: s.bessKwh };
      cost.configuredKw = s.bessKw;
      cost.configuredKwh = s.bessKwh;
      cost.firstBessKw = firstBessKw(list);
    }
    return { summary: s, cost: cost };
  }
  function firstBessKw(list) {
    for (var i = 0; i < list.length; i++) if (list[i].type === 'equip' && list[i].key === 'bess' && +list[i].kw > 0) return +list[i].kw;
    return 0;
  }

  /* The drawing a run answers for. A changed size, mix or site is a new
     question; moving a pad is not. */
  function signature(doc, summary) {
    var s = summary || D().summary(doc), a = (doc && doc.anchor) || {};
    return [s.bessKw, s.bessKwh, s.solarKwDc, s.chargerCount, s.chargerKw, s.derKw,
      String((doc && doc.address) || '').trim().toLowerCase(),
      a.lat != null ? (+a.lat).toFixed(4) : '', a.lng != null ? (+a.lng).toFixed(4) : ''].join('|');
  }
  function isStale(doc, rec) {
    return !!(rec && rec.sig && rec.sig !== signature(doc));
  }

  function siteOf(doc) {
    var a = (doc && doc.anchor) || {}, site = {};
    if (doc && doc.zip) site.zip = String(doc.zip);
    if (doc && doc.address && !/^sample parcel$/i.test(doc.address)) site.address = String(doc.address);
    if (isFinite(+a.lat) && isFinite(+a.lng)) { site.lat = +a.lat; site.lng = +a.lng; }
    return site;
  }

  /* The cost engine's answer → what the project keeps. */
  function costRecord(body, sig, at) {
    var t = (body && body.totals) || {};
    var parts = [['bess', 'Battery storage'], ['solar', 'Solar'], ['ev', 'EV charging'], ['siteEq', 'Site equipment'],
      ['xfmr', 'Transformer'], ['indirect', 'Engineering, permits, commissioning'], ['cont', 'Contingency']];
    var lines = [], i;
    for (i = 0; i < parts.length; i++) if (num(t[parts[i][0]]) > 0) lines.push({ id: parts[i][0], label: parts[i][1], usd: round(t[parts[i][0]]) });
    return {
      total: round(t.total), low: round(t.low), high: round(t.high), contPct: t.contPctRound != null ? t.contPctRound : null,
      benchmark: !!(body && body.lines && body.lines.bess && body.lines.bess.isBenchmark),
      lines: lines, engine: 'editor-cost', sig: sig, at: at
    };
  }

  /* The value stack's answer → what the project keeps (compact: it rides in
     the saved document). Words are the server's; nothing is recomputed. */
  function valueRecord(body, sig) {
    body = (body && body.result) || body || {};
    var lc = body.lifecycle || {}, bank = (body.bankability && body.bankability.lifecycle) || {};
    var t = body.totals || {}, tariff = body.tariff || {}, where = body.resolved || {};
    var streams = (body.streams || []).map(function (st) {
      return { name: st.name || st.id || 'Stream', usd: round(st.usd), tier: st.tier || null, counted: st.counted !== false };
    });
    return {
      version: body.version || null, at: body.at || null, sig: sig,
      streams: streams,
      gross: round(t.gross), owner: round(t.owner), billSavings: round(t.billSavings), gridEarnings: round(t.gridEarnings),
      irr: lc.irr != null && isFinite(lc.irr) ? lc.irr : null,
      irrBankable: bank.irr != null && isFinite(bank.irr) ? bank.irr : null,
      npv: round(lc.npv), paybackYears: lc.paybackYears != null && isFinite(lc.paybackYears) ? Math.round(lc.paybackYears * 10) / 10 : null,
      years: lc.years || null, irrNote: lc.irrNote || null,
      capexUsd: round(body.cost && body.cost.capexUsd), capexSource: (body.cost && body.cost.source) || null,
      incentiveUsd: round(body.incentives && body.incentives.total), netCostUsd: round(body.netCostUsd),
      tariff: tariff.label || null, tariffSource: tariff.source || null,
      confidence: body.confidence || null,
      where: where.zip ? (where.zip + (where.label ? ' (' + where.label + ')' : '')) : null,
      missing: (body.missing || []).slice(0, MISSING_MAX),
      source: 'the value stack (' + (body.version || 'server') + ')'
    };
  }

  function token() {
    var Auth = root.OmegaEditorV2Auth;
    if (Auth && typeof Auth.idToken === 'function') return Auth.idToken();
    try {
      var u = root.firebase && root.firebase.auth && root.firebase.auth().currentUser;
      if (u) return u.getIdToken();
    } catch (e) {}
    return Promise.resolve('');
  }

  /* One POST. Resolves { ok, status, body, error } and never rejects. */
  function post(url, body, tok) {
    return root.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json()['catch'](function () { return {}; }).then(function (j) {
        var err = null;
        if (!res.ok || (j && j.ok === false)) {
          err = (j && (j.error || (j.errors && j.errors[0] && j.errors[0].message) || j.reason)) || ('The server answered ' + res.status + '.');
          if (res.status === 401) err = 'Sign in to run the numbers.';
        }
        return { ok: !err, status: res.status, body: j, error: err };
      });
    }, function () {
      return { ok: false, status: 0, body: null, error: 'The server did not answer. Check the connection and run again.' };
    });
  }

  /* Run. Resolves { fields, notes, signedOut } — `fields` is what the
     editor writes onto the document (D.setMeta), `notes` one sentence per
     part that did not run, and why. */
  function run(doc) {
    var q = quantities(doc), s = q.summary, sig = signature(doc, s), at = new Date().toISOString();
    var fields = {}, notes = {};
    var hasBattery = s.bessKw > 0 && s.bessKwh > 0;
    var hasAnything = hasBattery || s.solarKwDc > 0 || s.chargerCount > 0;
    if (!hasAnything) {
      notes.all = 'Nothing on the drawing to run yet. Place a guided build, a battery, an array or a charger first.';
      return Promise.resolve({ fields: fields, notes: notes, signedOut: false });
    }
    return token().then(function (tok) {
      if (!tok) {
        notes.all = 'Sign in to run the numbers. The drawing stays as it is.';
        return { fields: fields, notes: notes, signedOut: true };
      }
      return post('/api/cost-rollup', q.cost, tok).then(function (r) {
        if (r.ok && r.body && r.body.totals) {
          var cost = costRecord(r.body, sig, at);
          fields.costRun = cost;
          fields.costTotal = cost.total;
          fields.costLines = cost.lines;
        } else notes.cost = r.error || 'The cost did not run.';
        if (!hasBattery) {
          notes.value = 'The value stack reads the battery on the drawing. Place a battery to run it.';
          return null;
        }
        var body = { action: 'estimate', site: siteOf(doc), battery: { kw: s.bessKw, kwh: s.bessKwh }, solarKw: s.solarKwDc || 0 };
        if (fields.costTotal > 0) body.cost = { capexUsd: fields.costTotal };
        return post('/api/value-stack', body, tok).then(function (r2) {
          if (r2.ok && r2.body) {
            var vs = valueRecord(r2.body, sig);
            fields.valueStack = vs;
            fields.revenueYear1 = vs.owner;
            fields.netCost = vs.netCostUsd;
          } else notes.value = r2.error || 'The value stack did not run.';
        });
      }).then(function () {
        var Solar = root.OmegaEditorV2Solar;
        if (!(s.arrayCount > 0) || !Solar || !Solar.design) return null;
        return Solar.design(doc).then(function (r3) {
          if (r3 && r3.ok) fields.solarDesign = r3.meta;
          else notes.solar = (r3 && r3.error) || 'The solar design did not run.';
        });
      }).then(function () {
        fields.lastRun = { at: at, sig: sig, notes: notes };
        return { fields: fields, notes: notes, signedOut: false };
      });
    });
  }

  var api = {
    run: run,
    quantities: quantities,
    signature: signature,
    isStale: isStale,
    siteOf: siteOf,
    costRecord: costRecord,
    valueRecord: valueRecord,
    MOUNT: MOUNT,
    VERSION: 'editor-v2-run/1'
  };
  root.OmegaEditorV2Run = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
