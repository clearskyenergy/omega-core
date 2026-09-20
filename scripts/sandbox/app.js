/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ══════════════════════════════════════════════════════════════════════════
   THE WALKTHROUGH. Three stories over one world:
     A · a customer buys from Clean Cell's own website, then buys the designer
     B · Clean Cell takes the works order and runs it across the floor
     C · ClearSky takes an order direct and pushes it to the plant

   The two DECISION engines above this in the bundle — OmegaPlant
   (api/_lib/plant.js) and OmegaPortal (api/_lib/portal.js) — are the REAL
   committed files, unmodified. Nothing below re-implements a rule they own:
   it holds records, routes clicks, and asks them.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var P = window.OmegaPlant, Q = window.OmegaPortal;
  var KEY = 'omega.eco.v2';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US'); }
  function plural(n, one, many) { return n + ' ' + (Number(n) === 1 ? one : (many || one + 's')); }
  function nowISO() { return new Date().toISOString(); }
  function hhmm(t) { var d = new Date(t || Date.now());
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function day(iso) { return String(iso || '').slice(0, 10); }

  /* ── Clean Cell's published product list ──────────────────────────────── */
  var CATALOG = [
    { sku: 'CC-215',  name: '215 kWh outdoor cabinet', kw: 100,  kwh: 215,  price: 61000,   w: 4.5,   d: 3.5 },
    { sku: 'CC-418',  name: '418 kWh outdoor cabinet', kw: 200,  kwh: 418,  price: 112000,  w: 7.5,   d: 4.5 },
    { sku: 'CC-1250', name: '1.25 MWh skid',           kw: 500,  kwh: 1250, price: 310000,  w: 20,    d: 8 },
    { sku: 'CC-5000', name: '5 MWh 20 ft container',   kw: 2500, kwh: 5000, price: 1180000, w: 19.88, d: 8 }
  ];
  function skuOf(s) { for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].sku === s) return CATALOG[i]; return null; }
  function ftOf(c) { return c.w + ' × ' + c.d + ' ft'; }

  /* TIGHTEST FIT, never the biggest box. Walking the catalogue largest-first
     took the first product where one unit covered the need, so a 1,200 kWh
     site was quoted a single 5 MWh container. Overshoot least, ≤ 8 units. */
  function fit(kw, hours) {
    var kwh = kw * hours, best = null, qty = 1, waste = Infinity;
    for (var i = 0; i < CATALOG.length; i++) {
      var n = Math.max(1, Math.ceil(kwh / CATALOG[i].kwh));
      if (n > 8) continue;
      var over = (n * CATALOG[i].kwh) - kwh;
      if (over < waste) { waste = over; best = CATALOG[i]; qty = n; }
    }
    if (!best) { best = CATALOG[CATALOG.length - 1]; qty = Math.ceil(kwh / best.kwh); }
    return { sku: best.sku, name: best.name, qty: qty, ft: ftOf(best), w: best.w, d: best.d,
             tkw: best.kw * qty, tkwh: best.kwh * qty, price: best.price * qty, kw: kw, h: hours };
  }

  /* ── state ────────────────────────────────────────────────────────────── */
  function seed() {
    return {
      act: 'a1', step: { a1: 0, a2: 0, a3: 0 },
      seq: 4418, orders: [], units: {},
      account: {
        created: false, name: '', company: '', email: '', phone: '',
        address: { line1: '4400 W Ferdinand St', city: 'Chicago', state: 'IL', zip: '60624' },
        plan: 'free', terms: { netDays: null, discountPct: null, poRequired: false }
      },
      sized: null, study: null, design: null, exportTab: 'plot',
      bench: 'kit', focusA2: null, focusA3: null,
      sawRefusal: false, sawHold: false, leak: '', log: []
    };
  }
  var S;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S || !S.orders || !S.step) S = seed();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function note(who, what) { S.log.unshift({ at: Date.now(), who: who, what: what }); S.log = S.log.slice(0, 80); }

  /* ── the order record ─────────────────────────────────────────────────── */
  function orderNo() { S.seq += 1; return 'CC-20260920-' + S.seq; }
  function unitsOf(no) { var out = []; for (var k in S.units) if (S.units[k].orderNo === no) out.push(S.units[k]); return out; }
  function find(no) { for (var i = 0; i < S.orders.length; i++) if (S.orders[i].orderNo === no) return S.orders[i]; return null; }
  /* Ask the REAL projection engine what this customer may see. */
  function projected(o) { return Q.publicOrder(o, { units: unitsOf(o.orderNo), showPrice: true }); }

  function makeOrder(opts) {
    var c = skuOf(opts.sku), qty = opts.qty, cust = opts.customer;
    var o = {
      orderNo: orderNo(), orgId: 'cleancell.us', orgName: 'Clean Cell',
      channel: opts.channel, originLabel: opts.originLabel,
      /* Fields a real order carries that a customer must NEVER see. The
         projection is what keeps them out — try the leak test in story C. */
      fulfilledBy: 'clearsky', source: opts.channel === 'clearsky' ? 'console' : 'embed',
      placedBy: opts.placedBy || null,
      pricing: null, cost: Math.round(c.price * 0.61 * qty), margin: 0.22,
      provenance: { via: opts.via, embedKeyId: 'a91f22c8' },
      history: [{ at: nowISO(), by: opts.by, what: 'created' }],
      status: 'new', createdAt: nowISO(),
      customer: { name: cust.name, company: cust.company, email: cust.email,
                  phone: cust.phone, address: cust.address, notes: '' },
      items: [{ sku: c.sku, name: c.name, qty: qty, kw: c.kw, kwh: c.kwh }],
      system: { kw: c.kw * qty, kwh: c.kwh * qty, durationH: Math.round((c.kwh / c.kw) * 10) / 10 },
      tenantPricing: { total: c.price * qty, currency: 'USD', publishedToCustomer: false },
      documents: [], promisedShipAt: null, cancelRequested: false,
      deposit: false, paid: false
    };
    S.orders.unshift(o);
    return o;
  }

  function release(o) {
    if (unitsOf(o.orderNo).length) return;
    var n = o.items[0].qty;
    for (var i = 0; i < n; i++) {
      var serial = 'CC' + o.items[0].sku.split('-')[1] + '-26-' + (S.seq * 10 + i);
      S.units[serial] = { serial: serial, orderNo: o.orderNo, at: '', done: {}, hold: null, ncr: null };
    }
    o.status = 'in_fulfilment';
    o.promisedShipAt = new Date(Date.now() + 55 * 864e5).toISOString();
    o.history.push({ at: nowISO(), by: 'system', what: 'released to the floor' });
    S.focusA2 = o.orderNo;   /* the hand-off: story B works what the floor holds */
    note('works order', 'Released ' + o.orderNo + ' — ' + plural(n, 'serial') + ' allocated');
    save();
  }

  function allReady(no) {
    var a = unitsOf(no);
    if (!a.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i].at !== 'ready' || a[i].hold) return false;
    return true;
  }
  function markComplete(o) {
    o.status = 'shipped';
    o.documents.push({ kind: 'packing', name: 'Packing list ' + o.orderNo, url: '#', at: nowISO(), audience: 'customer' });
    o.history.push({ at: nowISO(), by: 'plant', what: 'staged and shipped' });
    note('plant', o.orderNo + ' complete — all units staged, packing list issued');
    save();
  }

  /* ── THE SCAN. Straight into the real engine. ─────────────────────────── */
  function scan(serial) {
    var s = P.serialFrom(serial);
    var u = s ? S.units[s] : null;
    var routing = P.DEFAULT_ROUTING;
    var v = P.judgeScan(u || null, S.bench, routing);
    if (v.ok && v.action === 'advance') {
      var patch = P.applyScan(u, v, nowISO());
      u.at = patch.at; u.done = patch.done; u.hold = null;
    }
    if (!v.ok) S.sawRefusal = true;
    note('bench', P.labelOf(routing, S.bench) + ' · ' + (s || serial) + ' · ' + (v.say || v.reason));
    save();
    return v;
  }
  function advanceAll(no) {
    /* Walk every unit one bench forward, asking the REAL engine each time —
       including at the machine station, which the rig writes by passing
       `machine: true`. That flag is the engine's, not ours: a human scan
       there is still refused. */
    var routing = P.DEFAULT_ROUTING, a = unitsOf(no), moved = 0;
    for (var i = 0; i < a.length; i++) {
      var u = a[i];
      if (u.hold) continue;
      var next = u.at ? routing[P.indexOf(routing, u.at) + 1] : routing[0];
      if (!next) continue;
      var machine = P.MACHINE_STATIONS.indexOf(next.key) >= 0;
      var v = P.judgeScan(u, next.key, routing, machine ? { machine: true } : null);
      if (v.ok && v.action === 'advance') {
        var pt = P.applyScan(u, v, nowISO());
        u.at = pt.at; u.done = pt.done; u.hold = null; moved++;
      }
    }
    note(moved ? 'plant' : 'bench', 'Ran the bay — ' + plural(moved, 'unit') + ' advanced one station');
    save();
  }

  /* ── the designer's drawing ───────────────────────────────────────────── */
  function layout(d) {
    /* Feet → a 3 px grid. The lot is sized to the system rather than fixed,
       so five cabinets and one container both draw legibly; the setback and
       the 8 ft clearance between units are the constants that matter. */
    var SET = 22, GAP = 8, K = 3, BW = 72, BD = 42;
    var c = skuOf(d.sku);
    var cols = Math.min(d.qty, 5), rows = Math.ceil(d.qty / cols);
    var yardW = cols * c.w + (cols - 1) * GAP;
    var yardD = rows * c.d + (rows - 1) * (GAP + 4);
    /* The compound is the fenced envelope around the units: the clearance a
       fire marshal asks about, and the thing that makes the drawing read as
       a site plan rather than a rectangle with chips in it. */
    var padC = GAP;
    var LOT_W = Math.round(Math.max(BW + 68, yardW + 2 * padC + 46) + SET * 2);
    var LOT_D = Math.round(SET * 2 + BD + 16 + yardD + 2 * padC + 16);
    var x0 = SET + 16 + padC, y0 = SET + BD + 16 + padC, boxes = [];
    for (var i = 0; i < d.qty; i++) {
      var r = Math.floor(i / cols), k = i % cols;
      boxes.push({ x: x0 + k * (c.w + GAP), y: y0 + r * (c.d + GAP + 4), w: c.w, d: c.d, n: i + 1 });
    }
    var comp = { x: x0 - padC, y: y0 - padC, w: yardW + 2 * padC, d: yardD + 2 * padC };
    return { LOT_W: LOT_W, LOT_D: LOT_D, SET: SET, K: K, GAP: GAP, BW: BW, BD: BD,
             boxes: boxes, comp: comp, c: c };
  }
  function plotPlan(d) {
    var L = layout(d), K = L.K, W = L.LOT_W * K, H = L.LOT_D * K, PAD = 5;
    function R(x, y, w, h, f, st) {
      return '<rect x="' + (x * K) + '" y="' + (y * K) + '" width="' + (w * K) + '" height="' + (h * K)
        + '" fill="' + f + '"' + (st ? ' stroke="' + st + '" stroke-width="1.5"' : '') + ' rx="2"/>';
    }
    function T(x, y, t, size, fill, anchor, weight) {
      return '<text x="' + (x * K) + '" y="' + (y * K) + '" font-size="' + size + '" font-weight="'
        + (weight || 400) + '" fill="' + fill + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '')
        + '>' + esc(t) + '</text>';
    }
    /* The viewBox is padded so the boundary stroke is not half-clipped. */
    var s = '<svg viewBox="' + (-PAD) + ' ' + (-PAD) + ' ' + (W + PAD * 2) + ' ' + (H + PAD * 2)
      + '" role="img" aria-label="Plot plan: ' + d.qty + ' units placed to scale on the lot">';
    s += R(0, 0, L.LOT_W, L.LOT_D, 'var(--panel)', 'var(--ink2)');
    s += '<rect x="' + (L.SET * K) + '" y="' + (L.SET * K) + '" width="' + ((L.LOT_W - 2 * L.SET) * K)
       + '" height="' + ((L.LOT_D - 2 * L.SET) * K) + '" fill="none" stroke="var(--ink3)" '
       + 'stroke-dasharray="6 5" stroke-width="1"/>';
    s += R(L.SET + 4, L.SET + 4, L.BW, L.BD, 'var(--line2)', 'var(--ink3)');
    s += T(L.SET + 12, L.SET + 28, 'Existing building', 15, 'var(--ink2)', null, 600);
    s += '<rect x="' + (L.comp.x * K) + '" y="' + (L.comp.y * K) + '" width="' + (L.comp.w * K)
       + '" height="' + (L.comp.d * K) + '" fill="var(--accent-soft)" stroke="var(--accent)" '
       + 'stroke-width="1.5" stroke-dasharray="7 4" rx="3"/>';
    s += T(L.comp.x, L.comp.y - 4, 'BESS compound · fenced, ' + L.GAP + ' ft clear', 13, 'var(--accent)', null, 600);
    for (var i = 0; i < L.boxes.length; i++) {
      var b = L.boxes[i];
      s += R(b.x, b.y, b.w, b.d, 'var(--accent)', 'var(--accent)');
      s += T(b.x + b.w / 2, b.y + b.d / 2 + 1.6, String(b.n), 13, '#fff', 'middle', 700);
    }
    var rx = L.LOT_W - L.SET - 26;
    s += R(rx, L.SET + 6, 18, 14, 'var(--warn)', 'var(--warn)');
    s += T(rx + 9, L.SET + 28, 'XFMR', 13, 'var(--ink2)', 'middle', 600);
    s += R(rx, L.SET + 36, 18, 12, 'var(--ink3)', 'var(--ink3)');
    s += T(rx + 9, L.SET + 56, 'SWGR', 13, 'var(--ink2)', 'middle', 600);
    s += '<line x1="' + (L.SET * K) + '" y1="' + ((L.LOT_D - 9) * K) + '" x2="' + ((L.SET + 50) * K)
       + '" y2="' + ((L.LOT_D - 9) * K) + '" stroke="var(--ink2)" stroke-width="2"/>';
    s += T(L.SET, L.LOT_D - 4, '50 ft', 13, 'var(--ink2)');
    s += T(L.LOT_W - 8, L.LOT_D - 4, L.LOT_W + ' × ' + L.LOT_D + ' ft · ' + L.SET
       + ' ft setback · ' + L.GAP + ' ft between units', 13, 'var(--ink3)', 'end');
    return s + '</svg>';
  }
  function oneLine(d) {
    var c = skuOf(d.sku);
    var s = '<svg viewBox="0 0 780 260" role="img" aria-label="One-line diagram">';
    function box(x, y, w, h, t, sub, fill) {
      var g = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="5" fill="'
        + (fill || 'var(--panel)') + '" stroke="var(--ink3)" stroke-width="1.5"/>';
      g += '<text x="' + (x + w / 2) + '" y="' + (y + (sub ? h / 2 - 2 : h / 2 + 5))
        + '" font-size="14" font-weight="700" fill="var(--ink)" text-anchor="middle">' + esc(t) + '</text>';
      if (sub) g += '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 15)
        + '" font-size="12" fill="var(--ink3)" text-anchor="middle">' + esc(sub) + '</text>';
      return g;
    }
    function wire(x1, y1, x2, y2) {
      return '<path d="M' + x1 + ' ' + y1 + ' H' + ((x1 + x2) / 2) + ' V' + y2 + ' H' + x2
        + '" fill="none" stroke="var(--ink2)" stroke-width="2"/>';
    }
    var n = Math.min(d.qty, 4), top = 30, gap = 52;
    for (var i = 0; i < n; i++) {
      var y = top + i * gap;
      s += box(16, y, 150, 40, c.sku, c.kwh + ' kWh · ' + c.kw + ' kW', 'var(--accent-soft)');
      s += wire(166, y + 20, 250, 130);
    }
    if (d.qty > 4) s += '<text x="16" y="' + (top + 4 * gap + 16) + '" font-size="13" fill="var(--ink3)">+ '
      + (d.qty - 4) + ' more, identical</text>';
    s += box(250, 110, 130, 40, 'PCS', d.tkw + ' kW inverter');
    s += wire(380, 130, 430, 130);
    s += box(430, 110, 130, 40, 'XFMR', '480 V / 12.47 kV');
    s += wire(560, 130, 610, 130);
    s += box(610, 110, 150, 40, 'SWGR', 'Utility service');
    s += '<text x="610" y="176" font-size="12" fill="var(--ink3)">Point of common coupling</text>';
    return s + '</svg>';
  }
  function bomOf(d) {
    var c = skuOf(d.sku);
    return [
      { part: c.sku, desc: c.name, qty: d.qty, unit: c.price, cat: 'Storage' },
      { part: 'PCS-' + d.tkw, desc: d.tkw + ' kW bidirectional inverter', qty: 1, unit: Math.round(d.tkw * 92), cat: 'Power conversion' },
      { part: 'XFMR-' + Math.ceil(d.tkw / 250) * 250, desc: 'Pad-mount 480 V / 12.47 kV', qty: 1, unit: Math.round(d.tkw * 64), cat: 'Medium voltage' },
      { part: 'SWGR-15', desc: '15 kV switchgear and relay', qty: 1, unit: 78000, cat: 'Medium voltage' },
      { part: 'BOS-DC', desc: 'DC cable, conduit, terminations', qty: d.qty, unit: 4200, cat: 'Balance of system' },
      { part: 'CIV-PAD', desc: 'Concrete pad, bollards, grounding grid', qty: 1, unit: Math.round(d.qty * 7400), cat: 'Civil' }
    ];
  }

  /* ══ SCREENS ══════════════════════════════════════════════════════════ */

  function orderCard(o, opts) {
    opts = opts || {};
    var units = unitsOf(o.orderNo);
    return '<div class="ord' + (opts.lit ? ' lit' : '') + '"><div class="hd"><span class="no">' + esc(o.orderNo) + '</span>'
      + '<span class="mut">' + esc(o.customer.company) + '</span><span class="sp"></span>'
      + '<span class="pill ' + (o.status === 'shipped' ? 'go' : 'wait') + '">' + esc(o.status) + '</span></div>'
      + '<div class="meta"><span>' + esc(o.items[0].qty) + ' × ' + esc(o.items[0].name) + '</span>'
      + '<span>' + esc(o.system.kwh) + ' kWh</span>'
      + '<span class="mut">' + esc(o.originLabel) + '</span>'
      + (units.length ? '<span>' + plural(units.length, 'unit') + ' on the floor</span>' : '')
      + '</div>' + (opts.acts || '') + '</div>';
  }

  /* Whose orders these are is decided by the verified email address and
     nothing else — the same join api/my-orders.js makes. Listing S.orders
     here would have put another company's order on this customer's screen,
     which is the exact failure the projection exists to prevent. */
  function myOrders() {
    var e = String(S.account.email || '').toLowerCase();
    if (!e) return [];
    return S.orders.filter(function (o) { return String(o.customer.email || '').toLowerCase() === e; });
  }
  function buyerOrders(lede) {
    var h = '<section><h2>Your orders</h2>' + (lede ? '<p class="lede">' + lede + '</p>' : '');
    var mine = myOrders();
    if (!mine.length) { return h + '<p class="empty">Nothing yet.</p></section>'; }
    mine.forEach(function (o) {
      var p = projected(o), ms = p.milestone || {}, track = '';
      if (ms.index !== null && ms.index !== undefined) {
        for (var i = 0; i < ms.of; i++) track += '<i class="' + (i < ms.index ? 'done' : i === ms.index ? 'on' : '') + '"></i>';
      }
      h += '<div class="ord"><div class="hd"><span class="no">' + esc(p.orderNo) + '</span><span class="sp"></span>'
        + '<span class="pill ' + (ms.key === 'shipped' ? 'go' : ms.key === 'cancelled' ? 'stop' : 'wait') + '">'
        + esc(ms.label) + '</span></div>'
        + '<p class="say">' + esc(ms.say) + '</p>'
        + (track ? '<div class="track">' + track + '</div>' : '')
        + '<div class="lines">' + p.items.map(function (it) {
            return '<div><b>' + esc(it.qty) + '×</b> ' + esc(it.name) + ' <span class="mut">' + esc(it.kwh) + ' kWh</span></div>';
          }).join('') + '</div>'
        + '<div class="meta">'
        + (p.price ? '<span>' + money(p.price.total) + '</span>' : '<span class="mut">Price pending</span>')
        + (p.promisedShipAt ? '<span>Ships by ' + esc(day(p.promisedShipAt)) + '</span>' : '')
        + '<span>Sold by ' + esc(p.soldBy) + '</span></div>'
        + (p.documents.length ? '<div class="docs">' + p.documents.map(function (d) {
            return '<a href="#" onclick="return false">' + esc(d.name) + '</a>'; }).join('') + '</div>' : '')
        + '</div>';
    });
    return h + '</section>';
  }

  function termsCard() {
    var t = S.account.terms;
    if (!t.netDays && !t.discountPct && !t.poRequired) return '';
    return '<section><h2>Your terms</h2><div class="kv">'
      + (t.netDays ? '<div><div class="k">Payment</div><div class="v">Net ' + esc(t.netDays) + '</div></div>' : '')
      + (t.discountPct ? '<div><div class="k">Discount</div><div class="v">' + esc(t.discountPct) + '%</div></div>' : '')
      + (t.poRequired ? '<div><div class="k">Purchase order</div><div class="v">Required</div></div>' : '')
      + '</div><p class="fine">Set by Clean Cell after you opened the account. You can see them; only they can change them.</p></section>';
  }

  /* ── A1 · the storefront ──────────────────────────────────────────────── */
  function scSize() {
    var z = S.sized;
    var h = '<section><h3>Size a system</h3>'
      + '<p class="lede">This is the page Clean Cell pastes onto <code>cleancell.us</code>. No account, no sales call, '
      + 'no platform name anywhere on it. A visitor types what their utility bill says.</p>'
      + '<div class="row"><label>Peak demand kW<input id="i-kw" type="number" value="' + (z ? z.kw : 800) + '"></label>'
      + '<label>Hours of backup<input id="i-h" type="number" step="0.5" value="' + (z ? z.h : 2) + '"></label>'
      + '<button class="btn p" id="do-size">Size it</button></div>';
    if (z) {
      h += '<div class="rec"><div><div class="k">Recommended</div><div class="v">' + esc(z.qty) + ' × ' + esc(z.name) + '</div></div>'
        + '<div><div class="k">System</div><div class="v">' + esc(z.tkw) + ' kW · ' + esc(z.tkwh) + ' kWh</div></div>'
        + '<div><div class="k">Footprint each</div><div class="v">' + esc(z.ft) + '</div></div>'
        + '<div><div class="k">Indicative</div><div class="v">' + money(z.price) + '</div></div></div>'
        + '<p class="fine">Indicative only. Peak duration is estimated from what you typed, not from interval data.</p>';
    }
    return h + '</section>';
  }
  function scStudy() {
    var h = '<section><h3>See it on your own lot</h3>'
      + '<p class="lede">The one public call that costs money — it reaches a metered parcel service. '
      + 'So it is gated on a named lead, capped per day per tenant in a transaction, and a cache hit never spends the allowance. '
      + 'The parcel owner’s name and APN are never echoed back to this page.</p>'
      + '<div class="row"><label style="flex:1;min-width:230px">Site address<input id="i-addr" style="width:100%" value="'
      + esc(S.study ? S.study.address : S.account.address.line1 + ', ' + S.account.address.city + ' ' + S.account.address.state) + '"></label>'
      + '<button class="btn p" id="do-study">Draw it on my lot</button></div>';
    if (S.study) {
      h += '<div class="canvas">' + plotPlan(S.study) + '</div>'
        + '<div class="legend"><span><i style="background:var(--accent)"></i>' + esc(S.study.qty) + ' × ' + esc(skuOf(S.study.sku).name) + '</span>'
        + '<span><i style="background:var(--warn)"></i>Transformer pad</span>'
        + '<span><i style="background:var(--ink3)"></i>Switchgear</span>'
        + '<span><i style="background:var(--line2);border:1px solid var(--ink3)"></i>Setback</span></div>'
        + '<p class="fine">Drawn to scale from the product footprint in Clean Cell’s own list — the same list the storefront prices from '
        + 'and the designer builds from. One product list, three surfaces.</p>';
    }
    return h + '</section>';
  }
  function scAccount() {
    if (S.account.created) {
      return '<section><h3>You are signed in</h3>'
        + '<div class="rec"><div><div class="k">Name</div><div class="v">' + esc(S.account.name) + '</div></div>'
        + '<div><div class="k">Company</div><div class="v">' + esc(S.account.company) + '</div></div>'
        + '<div><div class="k">Email</div><div class="v" style="font:500 13px var(--m)">' + esc(S.account.email) + '</div></div>'
        + '<div><div class="k">Plan</div><div class="v">' + esc(S.account.plan === 'designer' ? 'Designer' : 'Free account') + '</div></div></div>'
        + '<p class="fine">The account was created from the verified sign-in token, not from this form — the form only supplies the '
        + 'company and phone. Past orders on this email address are claimed onto it automatically.</p></section>'
        + termsCard();
    }
    return '<section><h3>Create your account</h3>'
      + '<p class="lede">Clean Cell’s own login page, on Clean Cell’s own domain. The customer creates the account themselves and '
      + 'fills in their own details — Clean Cell goes in afterwards and sets terms. Nobody has to be pre-loaded before they can buy.</p>'
      + '<div class="signin">'
      + '<label>Your name<input id="a-name" value="Dana Ruiz"></label>'
      + '<label>Company<input id="a-co" value="Riverside Cold Chain"></label>'
      + '<label>Work email<input id="a-em" type="email" value="ops@riverside.example"></label>'
      + '<label>Phone<input id="a-ph" value="312 555 0110"></label>'
      + '<div class="row" style="margin:14px 0 0"><button class="btn p" id="do-signup">Create account</button>'
      + '<button class="btn" id="do-google">Continue with Google</button></div></div>'
      + '<p class="fine">Either route ends in the same place: a verified email address. That address is the whole security model for '
      + 'the buyer portal — it is what decides which orders are yours.</p></section>';
  }
  function scOrder() {
    var z = S.sized || (S.study ? S.study : null);
    var h = '';
    if (z && !myOrders().length) {
      h += '<section><h3>Place the order</h3>'
        + '<div class="rec"><div><div class="k">System</div><div class="v">' + esc(z.qty) + ' × ' + esc(z.name) + '</div></div>'
        + '<div><div class="k">Capacity</div><div class="v">' + esc(z.tkw) + ' kW · ' + esc(z.tkwh) + ' kWh</div></div>'
        + '<div><div class="k">Ship to</div><div class="v">' + esc(S.account.address.city) + ', ' + esc(S.account.address.state) + '</div></div>'
        + '<div><div class="k">Indicative</div><div class="v">' + money(z.price) + '</div></div></div>'
        + '<div class="row"><button class="btn p" id="do-order">Place this order</button></div>'
        + '<p class="fine">The order is written with its status pinned to <code>new</code> — the endpoint will not accept any other value '
        + 'from a browser. A human at Clean Cell confirms it. That is what makes a public order desk safe.</p></section>';
    }
    return h + buyerOrders('Your own account, on Clean Cell’s domain. Every number on this card was rebuilt field by field '
      + 'by the projection engine — nothing of Clean Cell’s or ours is passed through.');
  }
  function scUpgrade() {
    if (S.account.plan === 'designer') {
      return '<section><h3>You are on the designer</h3>'
        + '<div class="rec"><div><div class="k">Plan</div><div class="v">Designer</div></div>'
        + '<div><div class="k">Tools</div><div class="v">Site Map · Grid Atlas · Projects</div></div>'
        + '<div><div class="k">Billing</div><div class="v">$450 / month</div></div></div>'
        + '<p class="fine">This is <code>billing/current.toolAccess = [\'editor\',\'gridatlas\']</code> — an allowlist that beats the tier, '
        + 'the add-ons and every override. No new gating code: every endpoint already checks it on its own, so a tool that is not on '
        + 'the list refuses the call even if somebody finds the URL.</p></section>';
    }
    return '<section><h3>Design it yourself</h3>'
      + '<p class="lede">The storefront <em>pitches</em> the designer. It never links into it. Buying a battery and buying the '
      + 'platform are two different sales, and this is the second one.</p>'
      + '<div class="gate"><div class="lock">🔒</div><b>Site Map is part of the designer</b>'
      + '<div class="mut">Your account is on the free plan.</div></div>'
      + '<div class="plans">'
      + '<div class="plan on"><div class="pn">Free</div><div class="pp">included</div>'
      + '<ul><li>Order and track</li><li>Documents and terms</li><li>Reorder from history</li></ul></div>'
      + '<div class="plan"><div class="pn">Designer</div><div class="pp">$450 / month</div>'
      + '<ul><li>Site Map — draw the site</li><li>Grid Atlas — interconnection</li><li>Projects — keep them</li>'
      + '<li>Plot plan, one-line, proposal, blueprints</li></ul></div></div>'
      + '<div class="row" style="margin-top:14px"><button class="btn p" id="do-upgrade">Subscribe to the designer</button></div>'
      + '<p class="fine">The enquiry lands in the same order queue as a battery, marked <code>interest:\'platform\'</code>, '
      + 'so the platform pipeline is visible next to the hardware pipeline instead of living in somebody’s inbox.</p></section>';
  }
  function scDesign() {
    var d = S.design;
    var h = '<section><h3>Site Map — BESS</h3>'
      + '<p class="lede">The designer, painted as Clean Cell and cut down to storage. This is a <em>mode</em> of the one editor, '
      + 'not a second copy of it: compute and the data-centre and EV categories are hidden, solar stays, and every export travels with it.</p>'
      + '<div class="row"><label>Target kW<input id="d-kw" type="number" value="' + (d ? d.kw : 1000) + '"></label>'
      + '<label>Hours<input id="d-h" type="number" step="0.5" value="' + (d ? d.h : 2) + '"></label>'
      + '<button class="btn p" id="do-build">Guided build — place them</button></div>';
    if (!d) return h + '<p class="empty">Set a target and run the guided build.</p></section>';
    h += '<div class="rec"><div><div class="k">Placed</div><div class="v">' + esc(d.qty) + ' × ' + esc(skuOf(d.sku).name) + '</div></div>'
      + '<div><div class="k">System</div><div class="v">' + esc(d.tkw) + ' kW · ' + esc(d.tkwh) + ' kWh</div></div>'
      + '<div><div class="k">Duration</div><div class="v">' + esc(Math.round((d.tkwh / d.tkw) * 10) / 10) + ' h</div></div>'
      + '<div><div class="k">Yard used</div><div class="v">' + esc(Math.round(d.qty * skuOf(d.sku).w * skuOf(d.sku).d)) + ' sq ft</div></div></div>';

    var tabs = [['plot', 'Plot plan'], ['one', 'One-line'], ['bom', 'Estimate BOM'], ['prop', 'Proposal'], ['blue', 'Blueprints']];
    h += '<div class="tabsm">' + tabs.map(function (t) {
      return '<button type="button" data-xt="' + t[0] + '" aria-current="' + (S.exportTab === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    if (S.exportTab === 'plot') {
      h += '<div class="canvas">' + plotPlan(d) + '</div>'
        + '<div class="legend"><span><i style="background:var(--accent)"></i>Storage</span>'
        + '<span><i style="background:var(--warn)"></i>Transformer</span>'
        + '<span><i style="background:var(--ink3)"></i>Switchgear</span></div>';
    } else if (S.exportTab === 'one') {
      h += '<div class="canvas">' + oneLine(d) + '</div>';
    } else if (S.exportTab === 'bom') {
      var bom = bomOf(d), tot = 0;
      h += '<table><thead><tr><th>Part</th><th>Description</th><th class="n">Qty</th><th class="n">Extended</th></tr></thead><tbody>';
      bom.forEach(function (b) { var ext = b.qty * b.unit; tot += ext;
        h += '<tr><td><code>' + esc(b.part) + '</code></td><td>' + esc(b.desc) + '</td><td class="n">' + b.qty
          + '</td><td class="n">' + money(ext) + '</td></tr>'; });
      h += '<tr><td colspan="3"><b>Electrical estimate</b></td><td class="n"><b>' + money(tot) + '</b></td></tr></tbody></table>'
        + '<p class="fine">An estimate to plan against, not a quotation. What it is sold for is decided upstream of this page — '
        + 'the browser never holds a cost basis or a margin.</p>';
    } else if (S.exportTab === 'prop') {
      h += '<div class="sheet"><h4>' + esc(d.tkw) + ' kW / ' + esc(d.tkwh) + ' kWh battery energy storage system</h4>'
        + '<div class="sub">Prepared for ' + esc(S.account.company || 'the site') + ' · ' + esc(d.address || '') + ' · ' + esc(day(nowISO())) + '</div>'
        + '<table><tbody>'
        + '<tr><td>Storage</td><td>' + esc(d.qty) + ' × ' + esc(skuOf(d.sku).name) + '</td></tr>'
        + '<tr><td>Power conversion</td><td>' + esc(d.tkw) + ' kW bidirectional, 480 V</td></tr>'
        + '<tr><td>Interconnection</td><td>Pad-mount transformer to 12.47 kV, 15 kV switchgear</td></tr>'
        + '<tr><td>Scope</td><td>Supply, delivery, commissioning, 2-year workmanship</td></tr>'
        + '<tr><td>Excluded</td><td>Utility study fees, permits, site civil beyond the pad</td></tr>'
        + '</tbody></table><p class="fine">Issued under the Clean Cell name. Our name is not on it — that is a contract line item, '
        + 'not a preference, so it is staff-written and defaults to showing attribution.</p></div>';
    } else {
      h += '<div class="sheet"><h4>Drawing set</h4><div class="sub">Issued for review · ' + esc(day(nowISO())) + '</div>'
        + '<table><thead><tr><th>Sheet</th><th>Title</th></tr></thead><tbody>'
        + ['G-001|Cover and sheet index', 'C-101|Site plan and setbacks', 'C-201|Pad and grounding grid',
           'E-201|Single-line diagram', 'E-301|AC schedules and conduit', 'E-401|Protection and relay settings',
           'M-101|Clearances and access'].map(function (r) {
             var p = r.split('|'); return '<tr><td><code>' + p[0] + '</code></td><td>' + esc(p[1]) + '</td></tr>'; }).join('')
        + '</tbody></table></div>';
    }
    h += '<div class="acts"><button class="btn" id="do-push">Push to marketplace</button>'
      + '<button class="btn p" id="do-order2">Order this BOM from Clean Cell</button></div>';
    if (d.pushed) h += '<p class="fine">Pushed. Every line with a vendor behind it became an anonymised opportunity — '
      + 'the vendor sees the requirement, never who you are, until you accept their quote.</p>';
    return h + '</section>';
  }
  function scOrder2() {
    return buyerOrders('Two orders, one account: the first from the storefront, the second straight out of the designer. '
      + 'Same queue, same projection, same portal.');
  }

  /* ── A2 · the plant ───────────────────────────────────────────────────── */
  function pending() {
    return S.orders.filter(function (o) { return o.status !== 'shipped' && !unitsOf(o.orderNo).length; });
  }
  function a2Order() {
    var o = S.focusA2 ? find(S.focusA2) : null;
    if (o) return o;
    /* Whatever is actually on the floor comes first: an order with serials
       allocated is the one a bench is standing in front of. */
    var open = S.orders.filter(function (x) { return x.status !== 'shipped'; });
    for (var i = 0; i < open.length; i++) if (unitsOf(open[i].orderNo).length) return open[i];
    return open.length ? open[0] : null;
  }
  function scIntake() {
    var h = '<section><h3>Works queue</h3>'
      + '<p class="lede">Clean Cell’s side of the same desk. An order lands here whether it came off their own storefront '
      + 'or was sent over by ClearSky — one queue, not two inboxes.</p>';
    var q = S.orders.filter(function (o) { return o.status !== 'shipped'; });
    if (!q.length) {
      h += '<p class="empty">Nothing in the queue.</p>'
        + '<div class="row"><button class="btn p" id="do-seed">Receive an order from ClearSky</button></div>'
        + '<p class="fine">Or run story A first and the customer’s own order arrives here.</p>';
    } else {
      q.forEach(function (o) {
        var acts = '<div class="acts">'
          + (o.status === 'new' ? '<button class="btn p" data-act="confirm" data-no="' + o.orderNo + '">Accept into production</button>'
                                : '<button class="btn" data-act="focus" data-no="' + o.orderNo + '">Work this one</button>')
          + '</div>';
        h += orderCard(o, { acts: acts, lit: S.focusA2 === o.orderNo });
      });
    }
    return h + '</section>';
  }
  function scWorks() {
    var o = a2Order();
    if (!o) return '<section><h3>Works order</h3><p class="empty">Accept an order first.</p></section>';
    var units = unitsOf(o.orderNo);
    var h = '<section><h3>Raise the works order</h3>'
      + '<p class="lede">Serials are allocated here and nowhere else. Until the deposit clears there is no works order, '
      + 'so nothing can be scanned onto a bench that nobody has been paid for.</p>'
      + orderCard(o, { lit: true, acts: '<div class="acts">'
          + (!o.deposit ? '<button class="btn" data-act="deposit" data-no="' + o.orderNo + '">Mark deposit received</button>' : '')
          + (o.deposit && !units.length ? '<button class="btn p" data-act="release" data-no="' + o.orderNo + '">Release to the floor →</button>' : '')
          + '</div>' });
    if (units.length) {
      h += '<div class="rec"><div><div class="k">Serials</div><div class="v">' + plural(units.length, 'unit') + '</div></div>'
        + '<div><div class="k">Promised</div><div class="v">' + esc(day(o.promisedShipAt)) + '</div></div>'
        + '<div><div class="k">Route</div><div class="v">10 benches</div></div></div>'
        + '<p class="fine">Each serial is a paired record. The station a scan lands on comes off that record and the bench’s own '
        + 'pairing — never off the scan itself, which is only a string a stranger could type.</p>';
    }
    return h + '</section>';
  }
  function benchScreen(opts) {
    opts = opts || {};
    var routing = P.DEFAULT_ROUTING, o = a2Order();
    var all = o ? unitsOf(o.orderNo) : [];
    var h = '<section><h3>' + esc(opts.title || 'Bench tablet') + '</h3>'
      + '<p class="lede">' + (opts.lede || '') + '</p>'
      + '<div class="row"><label>This bench is<select id="b-station">'
      + routing.map(function (s) { return '<option value="' + s.key + '"' + (S.bench === s.key ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('')
      + '</select></label><span class="fine" id="b-hint"></span></div>'
      + '<div id="verdict" class="vd"><span class="mark">·</span><b id="v-serial"></b>'
      + '<span id="v-say">Pull a trigger on a unit.</span><span id="v-why" class="mut"></span></div>';
    if (!all.length) return h + '<p class="empty">No units on the floor yet.</p></section>';
    h += '<div class="guns">' + all.map(function (u) {
      return '<button class="g' + (u.hold ? ' hold' : '') + '" data-serial="' + esc(u.serial) + '">'
        + esc(u.serial) + '<small>' + (u.hold ? 'ON HOLD · ' + esc(u.ncr) : (u.at ? esc(P.labelOf(routing, u.at)) : 'not started')) + '</small></button>';
    }).join('') + '</div>';
    if (opts.extra) h += opts.extra;
    h += '<h2 style="margin-top:22px">The floor</h2><div class="board">'
      + routing.map(function (s) {
          var here = all.filter(function (u) { return u.at === s.key; });
          return '<div class="col2"><div class="ch">' + esc(s.label) + '</div>'
            + here.map(function (u) { return '<div class="u' + (u.hold ? ' hold' : '') + '">' + esc(u.serial.split('-').pop()) + '</div>'; }).join('')
            + '</div>';
        }).join('') + '</div>';
    return h + '</section>';
  }
  function scFirstScan() {
    return benchScreen({
      title: 'First scan — Kitting',
      lede: 'Set the bench to something other than Kitting and scan anyway. The refusal is the product: the easy build would set the '
          + 'unit to whatever bench scanned it, and then a unit that jumped two stations is recorded as having passed them.'
    });
  }
  function scRun() {
    var o = a2Order();
    return benchScreen({
      title: 'Run the bay',
      lede: 'Scan them through one at a time, or run the whole bay forward. A scan can only advance one station or be a duplicate — '
          + 'it can never skip, reverse, release a hold, close an NCR, or mark anything shipped.',
      extra: o ? '<div class="row"><button class="btn p" id="do-advance">Advance the whole bay one station</button></div>' : ''
    });
  }
  function scHold() {
    var o = a2Order();
    var h = benchScreen({
      title: 'QA holds one',
      lede: 'A cell block fails capacity at test. The unit goes on hold with a non-conformance against it — and that one unit '
          + 'decides what the customer is told about the whole order.',
      extra: '<div class="row"><button class="btn" id="b-hold">Fail one at QA</button>'
           + '<button class="btn" id="b-release-hold">Close the NCR</button></div>'
    });
    if (o) {
      var p = projected(o), ms = p.milestone || {};
      h += '<section><h2>What the customer is told, right now</h2>'
        + '<div class="ord"><div class="hd"><span class="no">' + esc(p.orderNo) + '</span><span class="sp"></span>'
        + '<span class="pill wait">' + esc(ms.label) + '</span></div><p class="say">' + esc(ms.say) + '</p></div>'
        + '<p class="fine">The <b>furthest-behind</b> unit decides. Five packed and one at Electrical still reads “In production”. '
        + 'A unit on hold does not count as progressing — otherwise a held unit would quietly report the order as nearly done.</p></section>';
    }
    return h;
  }
  function scFinish() {
    return benchScreen({
      title: 'Finish the bay',
      lede: 'Clear the hold, then walk them all the way to Ready to ship.',
      extra: '<div class="row"><button class="btn" id="b-release-hold">Close the NCR</button>'
           + '<button class="btn p" id="do-advance">Advance the whole bay one station</button></div>'
    });
  }
  function scShip() {
    var o = a2Order();
    if (!o) return '<section><h3>Mark complete</h3><p class="empty">Nothing on the floor.</p></section>';
    var ready = allReady(o.orderNo);
    var h = '<section><h3>Mark complete and ship</h3>'
      + '<p class="lede">The last thing a scan cannot do. Shipping is a decision, made once, by a person with the authority to '
      + 'make it — not a side effect of a trigger pull at the packing bench.</p>'
      + orderCard(o, { lit: true, acts: '<div class="acts">'
          + '<button class="btn p" data-act="ship" data-no="' + o.orderNo + '"' + (ready && o.status !== 'shipped' ? '' : ' disabled')
          + '>Mark complete and ship</button></div>' })
      + (ready ? '' : '<p class="fine">Every unit has to be at Ready to ship, and no hold open, before this button does anything.</p>');
    if (o.status === 'shipped') {
      var p = projected(o);
      h += '</section><section><h2>And on the customer’s screen</h2>'
        + '<div class="ord"><div class="hd"><span class="no">' + esc(p.orderNo) + '</span><span class="sp"></span>'
        + '<span class="pill go">' + esc(p.milestone.label) + '</span></div><p class="say">' + esc(p.milestone.say) + '</p>'
        + (p.documents.length ? '<div class="docs">' + p.documents.map(function (d) {
            return '<a href="#" onclick="return false">' + esc(d.name) + '</a>'; }).join('') + '</div>' : '') + '</div>'
        + '<p class="fine">Nobody typed a status. The customer’s screen moved because a technician pulled a trigger.</p>';
    }
    return h + '</section>';
  }

  /* ── A3 · ClearSky ────────────────────────────────────────────────────── */
  function a3Order() {
    if (S.focusA3) { var f = find(S.focusA3); if (f) return f; }
    for (var i = 0; i < S.orders.length; i++) if (S.orders[i].channel === 'clearsky') return S.orders[i];
    return null;
  }
  function scCsIntake() {
    var o = a3Order();
    var h = '<section><h3>Take the order</h3>'
      + '<p class="lede">A client comes to ClearSky directly — a developer, an EPC, a repeat account. Same record, same queue, '
      + 'different door. What changes is who is selling, not how it is fulfilled.</p>';
    if (!o) {
      h += '<div class="row"><label>Client<input id="x-co" value="Halsted Logistics"></label>'
        + '<label>Contact<input id="x-name" value="Priya Nair"></label></div>'
        + '<div class="row"><label>Peak kW<input id="x-kw" type="number" value="1500"></label>'
        + '<label>Hours<input id="x-h" type="number" step="0.5" value="2"></label>'
        + '<button class="btn p" id="do-intake">Create the order</button></div>';
    } else {
      h += orderCard(o, { lit: true });
      h += '<p class="fine">Written by the console, not a browser form on a public page — so this one carries a '
        + '<code>placedBy</code> and a staff audit entry that the storefront route does not.</p>';
    }
    return h + '</section>';
  }
  function scCsPrice() {
    var o = a3Order();
    if (!o) return '<section><h3>Price it</h3><p class="empty">Take an order first.</p></section>';
    var h = '<section><h3>Price it</h3>'
      + '<p class="lede">Only ClearSky may price. This runs server-side and always has — the browser is handed a result, '
      + 'never the inputs that produced it.</p>'
      + '<div class="rec"><div><div class="k">Our cost</div><div class="v">' + money(o.cost) + '</div></div>'
      + '<div><div class="k">Margin</div><div class="v">' + esc(Math.round(o.margin * 100)) + '%</div></div>'
      + '<div><div class="k">Sell at</div><div class="v">' + (o.pricing ? money(o.pricing.total) : '—') + '</div></div>'
      + '<div><div class="k">Client sees</div><div class="v">' + (o.tenantPricing.publishedToCustomer ? money(o.tenantPricing.total) : 'nothing yet') + '</div></div></div>'
      + '<div class="acts">'
      + (!o.pricing ? '<button class="btn p" data-act="price" data-no="' + o.orderNo + '">Price it</button>' : '')
      + (o.pricing && !o.tenantPricing.publishedToCustomer ? '<button class="btn p" data-act="publish" data-no="' + o.orderNo + '">Publish it to the client</button>' : '')
      + '</div>'
      + '<p class="fine">Priced is not published. Until somebody publishes it the client’s portal shows “Price pending” — '
      + 'reprice it as many times as you like and nothing crosses.</p></section>';
    return h;
  }
  function scCsPay() {
    var o = a3Order();
    if (!o) return '<section><h3>Take the deposit</h3><p class="empty">Take an order first.</p></section>';
    return '<section><h3>Take the deposit</h3>'
      + '<p class="lede">Money is what turns a quotation into a works order. Nothing reaches the floor before it clears.</p>'
      + '<div class="rec"><div><div class="k">Contract</div><div class="v">' + money(o.tenantPricing.total) + '</div></div>'
      + '<div><div class="k">Deposit 30%</div><div class="v">' + money(Math.round(o.tenantPricing.total * 0.3)) + '</div></div>'
      + '<div><div class="k">Deposit</div><div class="v">' + (o.deposit ? 'Cleared' : 'Outstanding') + '</div></div>'
      + '<div><div class="k">Balance</div><div class="v">' + (o.paid ? 'Paid' : 'On shipment') + '</div></div></div>'
      + '<div class="acts">' + (!o.deposit ? '<button class="btn p" data-act="deposit" data-no="' + o.orderNo + '">Deposit cleared</button>' : '')
      + '</div>'
      + '<p class="fine">This is the one join that is designed and not yet written: a payment webhook raising the works order. '
      + 'In the product today it is a person pressing this button, which is honest — and it is the piece to automate first.</p></section>';
  }
  function scCsPush() {
    var o = a3Order();
    if (!o) return '<section><h3>Push to the plant</h3><p class="empty">Take an order first.</p></section>';
    var units = unitsOf(o.orderNo);
    return '<section><h3>Push it to the plant</h3>'
      + '<p class="lede">One message: works order raised, serials allocated out of Clean Cell’s block. From here the order '
      + 'belongs to the floor, and the floor is the only thing that can move it.</p>'
      + orderCard(o, { lit: true, acts: '<div class="acts">'
        + (o.deposit && !units.length ? '<button class="btn p" data-act="release" data-no="' + o.orderNo + '">Push to Clean Cell →</button>'
          : !o.deposit ? '<span class="fine">Deposit first.</span>' : '') + '</div>' })
      + (units.length ? '<p class="fine">' + plural(units.length, 'serial') + ' now exist on Clean Cell’s floor. Switch to story B '
        + 'to walk them across the benches, then come back.</p>' : '')
      + '</section>';
  }
  function scCsWatch() {
    var o = a3Order();
    if (!o) return '<section><h3>Fulfilment</h3><p class="empty">Take an order first.</p></section>';
    var routing = P.DEFAULT_ROUTING, all = unitsOf(o.orderNo), p = projected(o);
    var h = '<section><h3>Fulfilment</h3>'
      + '<p class="lede">The same floor, seen from our side. We read it; we do not write it — a station is only ever set by a '
      + 'paired bench, which is why this view can be trusted.</p>';
    if (!all.length) h += '<p class="empty">Nothing on the floor for this order yet.</p>';
    else {
      h += '<div class="board">' + routing.map(function (s) {
        var here = all.filter(function (u) { return u.at === s.key; });
        return '<div class="col2"><div class="ch">' + esc(s.label) + '</div>'
          + here.map(function (u) { return '<div class="u' + (u.hold ? ' hold' : '') + '">' + esc(u.serial.split('-').pop()) + '</div>'; }).join('')
          + '</div>'; }).join('') + '</div>'
        + '<div class="row" style="margin-top:14px"><button class="btn" id="do-advance">Advance the bay (stand in for the floor)</button></div>';
    }
    h += '</section><section><h2>What the client sees</h2>'
      + '<div class="ord"><div class="hd"><span class="no">' + esc(p.orderNo) + '</span><span class="sp"></span>'
      + '<span class="pill ' + (p.milestone.key === 'shipped' ? 'go' : 'wait') + '">' + esc(p.milestone.label) + '</span></div>'
      + '<p class="say">' + esc(p.milestone.say) + '</p></div>'
      + '<p class="fine">Six public milestones, not the seventeen internal statuses. <code>quoted</code> means we have priced it to '
      + 'the seller — showing that word to a buyer would say something true about the wrong transaction.</p></section>';
    return h;
  }
  function scCsClose() {
    var o = a3Order();
    if (!o) return '<section><h3>Close it</h3><p class="empty">Take an order first.</p></section>';
    var ready = allReady(o.orderNo), h = '<section><h3>Ship, invoice, close</h3>'
      + '<p class="lede">The balance falls due on shipment. The order is finished when the plant says it is and the money has landed — '
      + 'two different systems agreeing, not one system asserting.</p>'
      + orderCard(o, { lit: true, acts: '<div class="acts">'
        + (ready && o.status !== 'shipped' ? '<button class="btn" data-act="ship" data-no="' + o.orderNo + '">Mark shipped</button>' : '')
        + (o.status === 'shipped' && !o.paid ? '<button class="btn p" data-act="paid" data-no="' + o.orderNo + '">Balance received</button>' : '')
        + '</div>' });
    if (!ready && o.status !== 'shipped') h += '<p class="fine">The floor has not finished. Story B walks them to Ready to ship.</p>';
    if (o.paid) h += '<div class="rec"><div><div class="k">Order</div><div class="v">Closed</div></div>'
      + '<div><div class="k">Invoiced</div><div class="v">' + money(o.tenantPricing.total) + '</div></div>'
      + '<div><div class="k">Our margin</div><div class="v">' + money(o.tenantPricing.total - o.cost) + '</div></div>'
      + '<div><div class="k">Cycle</div><div class="v">' + esc(day(o.createdAt)) + ' → today</div></div></div>';
    return h + '</section>';
  }
  function scProof() {
    var units = 0, held = 0;
    for (var k in S.units) { units++; if (S.units[k].hold) held++; }
    var newN = S.orders.filter(function (o) { return o.status === 'new'; }).length;
    function sf(label, state, say) {
      return '<div class="sf s-' + state + '"><span class="dot"></span><div><b>' + esc(label)
        + ' <i class="st">' + esc(state) + '</i></b><div class="mut">' + esc(say) + '</div></div></div>';
    }
    var h = '<section><h3>The estate — cleancell.us</h3>'
      + '<p class="lede">Every surface with a state <em>and a sentence</em>. Served as JSON as well as rendered, so an agent reports '
      + 'on the estate without scraping a page. <code>off</code> is deliberately not <code>down</code>.</p>'
      + sf('Storefront embed', 'ok', plural(S.orders.length, 'order') + ' today of a 60 cap.')
      + sf('Order desk', newN ? 'warn' : 'ok', newN ? plural(newN, 'new order') + ' waiting to be accepted.' : 'Nothing waiting.')
      + sf('Plant floor', held ? 'warn' : (units ? 'ok' : 'off'), held ? plural(held, 'unit') + ' on hold.'
          : (units ? plural(units, 'unit') + ' moving across 10 benches.' : 'No units released yet.'))
      + sf('Buyer portal', S.account.created ? 'ok' : 'off', S.account.created ? '1 customer account, 1 user.' : 'No accounts yet.')
      + sf('Designer', S.account.plan === 'designer' ? 'ok' : 'off',
          S.account.plan === 'designer' ? '1 account on the designer.' : 'Nobody is subscribed to the designer yet.')
      + sf('Payments', 'off', 'The milestone webhook is designed and not written. The deposit button stands in for it.')
      + '</section>';
    h += '<section><h3>The leak test</h3>'
      + '<p class="lede">Every order here carries our cost, our margin, the string <code>clearsky</code> and a staff audit trail. '
      + 'This searches what the buyer actually receives for each of them.</p>'
      + '<div class="row"><button class="btn p" id="do-leak">Run it</button></div>'
      + '<pre id="leak-out" class="pre">' + esc(S.leak || 'Press Run.') + '</pre></section>';
    return h;
  }

  /* ══ THE STORIES ══════════════════════════════════════════════════════ */
  var ACTS = [
    { key: 'a1', n: 'A', label: 'The customer buys', brand: 'cc', app: 'Clean Cell Power',
      steps: [
        { t: 'Their website', who: 'A visitor · cleancell.us', view: scSize, done: function () { return !!S.sized; },
          teach: ['This page is served to the public with no token at all. Its gate is a publishable key and an origin allowlist — accounting and hygiene, not a security boundary.',
                  'What holds instead: nothing confidential is reachable, the sizing runs server-side and returns a result rather than the inputs, and an order is a request a human confirms.'],
          real: 'Stand-in for embed/storefront.html. The product list and the fit are the real shape.' },
        { t: 'On their lot', who: 'A visitor · cleancell.us', view: scStudy, done: function () { return !!S.study; },
          teach: ['The site study is the one public call that spends money, so it is capped per org per day inside a transaction and a cache hit never spends the allowance.',
                  'It is drawn from the footprint on Clean Cell’s own product record. One product list feeds the storefront, this drawing and the designer.'],
          real: 'Drawing is a stand-in; the footprint, setback and clearance rules are the ones the real layout uses.' },
        { t: 'Create an account', who: 'Dana Ruiz · signing up', view: scAccount, done: function () { return S.account.created; },
          teach: ['The customer creates their own account and fills in their own details. Clean Cell goes in afterwards to set terms — nobody has to be pre-loaded before they are allowed to buy.',
                  'The record is created from the verified sign-in token, and past orders on that email address are claimed onto it. A verified email is the whole security model.'],
          real: 'Stand-in for portals/customer + api/my-account.js.' },
        { t: 'Place the order', who: 'Dana Ruiz · Riverside Cold Chain', view: scOrder,
          done: function () { return myOrders().some(function (o) { return o.channel === 'storefront'; }); },
          teach: ['The order is written with status pinned to new. A browser cannot set any other value, which is what makes a public order desk safe.',
                  'Everything on the customer’s card was rebuilt field by field by the projection. Firestore rules hide documents, not fields — and this document belongs to the seller, whose numbers are exactly what must not reach the buyer.'],
          real: 'api/_lib/portal.js — the real committed file, deciding this card.' },
        { t: 'Buy the designer', who: 'Dana Ruiz · Riverside Cold Chain', view: scUpgrade,
          done: function () { return S.account.plan === 'designer'; },
          teach: ['Buying a battery and buying the platform are two sales. The storefront pitches the designer and never links into it.',
                  'The subscription writes one field: toolAccess = [editor, gridatlas]. That allowlist beats the tier, the add-ons and every override, and every endpoint checks it independently.'],
          real: 'billing/current.toolAccess is real and enforced today.' },
        { t: 'Design the site', who: 'Dana Ruiz · Site Map', view: scDesign, done: function () { return !!S.design; },
          teach: ['This is a mode of the one editor, not a second editor. editor.html is 11 MB across 175,800 lines; a copy doubles the largest file in the repo and every fix has to be made twice.',
                  'bess-lite hides compute and the data-centre and EV categories and leaves solar in. It curates rather than deletes, so handlers travel with the nodes, and it fails open — an unknown mode gives you the full platform.'],
          real: 'Stand-in for editor.html. omega-editor-mode.js and its 39 tests are real and committed.' },
        { t: 'Order the BOM', who: 'Dana Ruiz · Site Map', view: scOrder2,
          done: function () { return myOrders().some(function (o) { return o.channel === 'designer'; }); },
          teach: ['Two orders, one account, one queue: one from the storefront before they had an account, one out of the designer afterwards.',
                  'The designer is the second sale and it feeds the first. That is the whole commercial argument for white-labelling the platform rather than only the products.'],
          real: 'api/_lib/portal.js projects both identically.' }
      ] },
    { key: 'a2', n: 'B', label: 'Clean Cell builds it', brand: 'cc', app: 'Clean Cell Plant',
      steps: [
        { t: 'Intake', who: 'Rob · Clean Cell order desk', view: scIntake,
          done: function () { return S.orders.some(function (o) { return o.status !== 'new'; }); },
          teach: ['One queue. An order arrives here whether it came off Clean Cell’s own storefront or was sent over by ClearSky.',
                  'Accepting is a human act. Nothing downstream — serials, benches, ship dates — exists until somebody here says yes.'],
          real: 'Stand-in for orders.html; the status vocabulary is the real one.' },
        { t: 'Works order', who: 'Rob · Clean Cell order desk', view: scWorks,
          done: function () { return Object.keys(S.units).length > 0; },
          teach: ['Serials are allocated here and nowhere else, and only after the deposit clears. Nothing can be scanned onto a bench that nobody has been paid for.',
                  'Each serial becomes a paired record. The station a scan lands on comes off that record and the bench’s pairing — never off the scan, which is only a string a stranger could type.'],
          real: 'plant_works_orders. The deposit→release webhook is the one piece designed and not written.' },
        { t: 'First scan', who: 'Marco · Bay 2 bench tablet', view: scFirstScan,
          done: function () { var a = []; for (var k in S.units) a.push(S.units[k]); return a.some(function (u) { return !!u.at; }); },
          teach: ['Set the bench to something other than Kitting and scan anyway. It refuses, with a sentence the operator can act on: “This is at Enclosure — Electrical is next.”',
                  'The easy build sets the unit to whatever bench scanned it. Then a unit that jumped Rack to Pack is “packed”, two stations it never visited are recorded as done, and its end-of-line report does not exist.'],
          real: 'api/_lib/plant.js — the real committed engine, judging every scan on this page.' },
        { t: 'Production', who: 'Marco · Bay 2 bench tablet', view: scRun,
          done: function () { var o = a2Order(); if (!o) return false;
            return unitsOf(o.orderNo).some(function (u) { return u.at && P.indexOf(P.DEFAULT_ROUTING, u.at) >= 4; }); },
          teach: ['A scan can only advance one station or be a duplicate. It can never skip, reverse, release a hold, close an NCR or mark anything shipped.',
                  'So the worst a stolen scanner achieves is marking units present at one bench, in order. Two stations are machine-written by the test rig and refuse a human scan outright.'],
          real: 'api/_lib/plant.js, asserted across every station and unit state by 35 tests.' },
        { t: 'QA hold', who: 'Alice · Quality', view: scHold, done: function () { return S.sawHold; },
          teach: ['One unit fails capacity at test and goes on hold against a non-conformance. Watch the customer’s card: it does not move.',
                  'The furthest-behind unit decides the milestone, and a unit on hold does not count as progressing — otherwise a held unit would quietly report the order as nearly done.'],
          real: 'api/_lib/portal.js decides the customer sentence from the unit states.' },
        { t: 'Finish the bay', who: 'Marco · Bay 2 bench tablet', view: scFinish,
          done: function () { var o = a2Order(); return o ? allReady(o.orderNo) : false; },
          teach: ['Closing the NCR is not something a scanner can do. It is a separate authority, because the whole point of a hold is that the floor cannot wave it through.',
                  'Scans are written to the tablet before the network is touched, so a bench by the roll-up door keeps working and drains in order. Each carries a client-minted id, so a retry cannot double-count.'],
          real: 'api/_lib/plant.js plus the offline queue in plant/station.html.' },
        { t: 'Mark complete', who: 'Rob · Clean Cell order desk', view: scShip,
          done: function () { var o = a2Order(); return o ? o.status === 'shipped' : false; },
          teach: ['Shipping is the one thing a trigger pull cannot cause. It is a decision, made once, by somebody with the authority to make it.',
                  'And then the customer’s screen moves on its own. Nobody typed a status into a portal; a technician pulled a trigger and a packing list appeared on a stranger’s account.'],
          real: 'api/_lib/portal.js — the customer sentence, straight from the unit states.' }
      ] },
    { key: 'a3', n: 'C', label: 'ClearSky sells direct', brand: 'cs', app: 'ClearSky OMEGA',
      steps: [
        { t: 'Take the order', who: 'Thomas · ClearSky', view: scCsIntake,
          done: function () { return S.orders.some(function (o) { return o.channel === 'clearsky'; }); },
          teach: ['A client comes to us directly — a developer, an EPC, a repeat account. Same record, same queue, different door.',
                  'What changes is who is selling, not how it is fulfilled. This route carries a placedBy and a staff audit entry that the public storefront route deliberately does not.'],
          real: 'Stand-in for the console; the order record is the real shape.' },
        { t: 'Price it', who: 'Thomas · ClearSky', view: scCsPrice,
          done: function () { var o = a3Order(); return o ? !!o.pricing : false; },
          teach: ['Only ClearSky may price. Pricing, scoring, eligibility and every financial model run in /api/ and never in a browser — the page is handed a result, not the inputs that produced it.',
                  'Priced is not published. Until somebody publishes it the client’s portal reads “Price pending”, so you can reprice as often as you like and nothing crosses.'],
          real: 'The published/unpublished split is enforced by api/_lib/portal.js.' },
        { t: 'Take the deposit', who: 'Thomas · ClearSky', view: scCsPay,
          done: function () { var o = a3Order(); return o ? !!o.deposit : false; },
          teach: ['Money is what turns a quotation into a works order. Nothing reaches the floor before it clears.',
                  'This is the one join that is designed and not yet written: a payment webhook raising the works order. Today a person presses the button. That is the first thing to automate, and it is honest to show it as a button.'],
          real: 'Not built. Designed in docs/CUSTOMER-PORTAL.md.' },
        { t: 'Push to the plant', who: 'Thomas · ClearSky', view: scCsPush,
          done: function () { var o = a3Order(); return o ? unitsOf(o.orderNo).length > 0 : false; },
          teach: ['One message: works order raised, serials allocated out of Clean Cell’s block. From here the order belongs to the floor.',
                  'Units and scans are written by the Admin SDK only — a browser cannot write them at all. If a browser could set a timestamp directly, every guarantee in the scan engine would evaporate.'],
          real: 'docs/firestore.rules.plant.addendum: allow write: if false.' },
        { t: 'Fulfilment', who: 'Thomas · ClearSky', view: scCsWatch,
          done: function () { var o = a3Order(); if (!o) return false;
            return unitsOf(o.orderNo).some(function (u) { return u.at && P.indexOf(P.DEFAULT_ROUTING, u.at) >= 4; }); },
          teach: ['The same floor, from our side. We read it; we do not write it. A station is only ever set by a paired bench, which is why this view can be trusted.',
                  'Six public milestones, not seventeen internal statuses. “quoted” means we have priced it to the seller — true, about the wrong transaction.'],
          real: 'api/_lib/portal.js maps unit states to the six milestones.' },
        { t: 'Ship and close', who: 'Thomas · ClearSky', view: scCsClose,
          done: function () { var o = a3Order(); return o ? !!o.paid : false; },
          teach: ['The balance falls due on shipment. The order is finished when the plant says it is and the money has landed — two systems agreeing, not one asserting.',
                  'Both sides of that sentence come from somewhere with its own authority: the floor cannot invoice and the finance desk cannot ship.'],
          real: 'Stand-in for the invoice run.' },
        { t: 'The proof', who: 'Thomas · ClearSky', view: scProof, done: function () { return !!S.leak; },
          teach: ['Every order here carries our cost, our margin, the string clearsky and a staff audit trail. The leak test searches what the buyer actually receives for each of them.',
                  'It is not an assertion about the code — it runs the committed projection over the real record and shows you the output. That is the difference between a demo and a claim.'],
          real: 'api/_lib/portal.js, exercised live.' }
      ] }
  ];
  function actDef(k) { for (var i = 0; i < ACTS.length; i++) if (ACTS[i].key === k) return ACTS[i]; return ACTS[0]; }
  function curAct() { return actDef(S.act); }
  function curStep() {
    var a = curAct(), i = Math.min(Math.max(S.step[a.key] || 0, 0), a.steps.length - 1);
    return a.steps[i];
  }

  /* ══ RENDER ═══════════════════════════════════════════════════════════ */
  function paintChrome() {
    var a = curAct(), st = curStep();
    document.documentElement.setAttribute('data-brand', a.brand);
    $('mark').textContent = a.brand === 'cc' ? 'CC' : 'CS';
    $('brand').textContent = a.app;
    $('who').textContent = st.who;
    $('actnav').innerHTML = ACTS.map(function (x) {
      return '<button type="button" data-act-key="' + x.key + '" aria-current="' + (x.key === S.act) + '">'
        + '<em>' + x.n + '</em>' + esc(x.label) + '</button>';
    }).join('');
    var idx = S.step[a.key] || 0;
    $('rail').innerHTML = a.steps.map(function (s, i) {
      var done = false; try { done = !!s.done(); } catch (e) { done = false; }
      return '<button type="button" data-step="' + i + '" aria-current="' + (i === idx) + '"'
        + (done ? ' class="done"' : '') + '><span class="n">' + (done && i !== idx ? '✓' : (i + 1)) + '</span>' + esc(s.t) + '</button>';
    }).join('');
  }
  function paintWorld() {
    var units = 0, held = 0, ready = 0;
    for (var k in S.units) { units++; if (S.units[k].hold) held++; if (S.units[k].at === 'ready') ready++; }
    var rows = [
      ['Orders', S.orders.length],
      ['Customer account', S.account.created ? (S.account.plan === 'designer' ? 'designer' : 'free') : '—'],
      ['Units on the floor', units || '—'],
      ['At ready to ship', units ? ready + ' / ' + units : '—'],
      ['On hold', held || '—'],
      ['Shipped', S.orders.filter(function (o) { return o.status === 'shipped'; }).length || '—']
    ];
    $('world').innerHTML = rows.map(function (r) {
      return '<div class="wr"><span class="wk">' + esc(r[0]) + '</span><span class="wv">' + esc(r[1]) + '</span></div>';
    }).join('');
  }
  function render() {
    paintChrome();
    var a = curAct(), i = S.step[a.key] || 0, st = a.steps[i];
    var done = false; try { done = !!st.done(); } catch (e) { done = false; }
    var body = st.view();
    body += '<section><div class="next">'
      + (i > 0 ? '<button class="btn" id="go-prev">← Back</button>' : '')
      + (i < a.steps.length - 1
          ? '<button class="btn' + (done ? ' p' : '') + '" id="go-next">Next · ' + esc(a.steps[i + 1].t) + ' →</button>'
          : '<button class="btn p" id="go-act">Next story →</button>')
      + (done ? '<span class="doneflag">Step done</span>' : '<span class="fine" style="margin:0">Do the thing on this screen, then carry on.</span>')
      + '</div></section>';
    $('view').innerHTML = body;
    $('teach').innerHTML = st.teach.map(function (p) { return '<p>' + p + '</p>'; }).join('')
      + '<p class="mut" style="font-size:12.5px;border-top:1px solid var(--line2);padding-top:9px">'
      + esc(st.real) + '</p>';
    paintWorld();
    $('logbody').innerHTML = S.log.length
      ? S.log.map(function (l) {
          return '<div class="lg"><span class="t">' + hhmm(l.at) + '</span><span class="w">' + esc(l.who) + '</span>' + esc(l.what) + '</div>';
        }).join('')
      : '<div class="lg mut">Nothing has happened yet.</div>';
    wire();
  }
  window.__ecoRender = render;

  /* ══ WIRING ═══════════════════════════════════════════════════════════ */
  function on(id, ev, fn) { var e = $(id); if (e) e.addEventListener(ev, fn); }
  function each(sel, fn) { var n = document.querySelectorAll(sel); for (var i = 0; i < n.length; i++) fn(n[i]); }
  function step(delta) {
    var a = curAct(), i = (S.step[a.key] || 0) + delta;
    S.step[a.key] = Math.min(Math.max(i, 0), a.steps.length - 1); save(); render();
  }

  function wire() {
    each('[data-act-key]', function (b) {
      b.addEventListener('click', function () { S.act = b.getAttribute('data-act-key'); save(); render(); });
    });
    each('[data-step]', function (b) {
      b.addEventListener('click', function () { S.step[S.act] = Number(b.getAttribute('data-step')); save(); render(); });
    });
    on('go-next', 'click', function () { step(1); });
    on('go-prev', 'click', function () { step(-1); });
    on('go-act', 'click', function () {
      var i = 0; for (var j = 0; j < ACTS.length; j++) if (ACTS[j].key === S.act) i = j;
      S.act = ACTS[(i + 1) % ACTS.length].key; save(); render();
    });

    /* A1 */
    on('do-size', 'click', function () {
      var kw = Number($('i-kw').value) || 0, hrs = Number($('i-h').value) || 1;
      S.sized = fit(kw, hrs);
      note('visitor', 'Sized ' + kw + ' kW × ' + hrs + ' h → ' + S.sized.qty + ' × ' + S.sized.name);
      save(); render();
    });
    on('do-study', 'click', function () {
      var z = S.sized || fit(800, 2);
      S.study = { address: $('i-addr').value, sku: z.sku, qty: z.qty, tkw: z.tkw, tkwh: z.tkwh, kw: z.kw, h: z.h };
      note('visitor', 'Site study drawn for ' + S.study.address);
      save(); render();
    });
    function signUp(via) {
      S.account.created = true;
      S.account.name = ($('a-name') || {}).value || 'Dana Ruiz';
      S.account.company = ($('a-co') || {}).value || 'Riverside Cold Chain';
      S.account.email = ($('a-em') || {}).value || 'ops@riverside.example';
      S.account.phone = ($('a-ph') || {}).value || '';
      note('customer', 'Created an account on cleancell.us (' + via + ') — ' + S.account.email);
      save(); render();
    }
    on('do-signup', 'click', function () { signUp('email link'); });
    on('do-google', 'click', function () { signUp('Google'); });
    on('do-order', 'click', function () {
      var z = S.sized || S.study; if (!z) return;
      var o = makeOrder({ sku: z.sku, qty: z.qty, channel: 'storefront', originLabel: 'from cleancell.us',
        via: 'api/embed-order create', by: 'storefront', customer: S.account });
      note('customer', 'Placed ' + o.orderNo + ' — ' + z.qty + ' × ' + z.name);
      save(); render();
    });
    on('do-upgrade', 'click', function () {
      S.account.plan = 'designer';
      note('customer', 'Subscribed to the designer — toolAccess [editor, gridatlas]');
      save(); render();
    });
    on('do-build', 'click', function () {
      var kw = Number($('d-kw').value) || 0, hrs = Number($('d-h').value) || 1, z = fit(kw, hrs);
      S.design = { sku: z.sku, qty: z.qty, kw: kw, h: hrs, tkw: z.tkw, tkwh: z.tkwh,
        address: S.study ? S.study.address : '', pushed: S.design ? S.design.pushed : false };
      note('designer', 'Guided build placed ' + z.qty + ' × ' + z.name + ' — ' + z.tkw + ' kW');
      save(); render();
    });
    each('[data-xt]', function (b) {
      b.addEventListener('click', function () { S.exportTab = b.getAttribute('data-xt'); save(); render(); });
    });
    on('do-push', 'click', function () {
      if (!S.design) return;
      S.design.pushed = true;
      note('designer', 'Pushed the BOM to the marketplace — vendors see the requirement, not the customer');
      save(); render();
    });
    on('do-order2', 'click', function () {
      if (!S.design) return;
      var o = makeOrder({ sku: S.design.sku, qty: S.design.qty, channel: 'designer', originLabel: 'from the designer',
        via: 'omega-storefront-handoff', by: 'designer', placedBy: S.account.email, customer: S.account });
      note('customer', 'Ordered the designed BOM — ' + o.orderNo);
      save(); render();
    });

    /* A2 */
    on('do-seed', 'click', function () {
      var z = fit(1500, 2);
      var o = makeOrder({ sku: z.sku, qty: z.qty, channel: 'clearsky', originLabel: 'sent over by ClearSky',
        via: 'console', by: 'thomas@csebuilders.com', placedBy: 'thomas@csebuilders.com',
        customer: { name: 'Priya Nair', company: 'Halsted Logistics', email: 'priya@halsted.example',
                    phone: '312 555 0180', address: { line1: '2100 S Ashland Ave', city: 'Chicago', state: 'IL', zip: '60608' } } });
      o.status = 'confirmed'; o.pricing = { total: Math.round(o.cost * 1.18), currency: 'USD',
        pricedBy: 'thomas@csebuilders.com', pricedAt: nowISO() };
      S.focusA2 = o.orderNo;
      note('clearsky', 'Sent ' + o.orderNo + ' to Clean Cell — ' + z.qty + ' × ' + z.name);
      save(); render();
    });
    on('do-advance', 'click', function () {
      var o = S.act === 'a3' ? a3Order() : a2Order(); if (!o) return;
      advanceAll(o.orderNo); render();
    });
    on('b-station', 'change', function () { S.bench = this.value; save(); render(); });
    each('.g', function (g) {
      g.addEventListener('click', function () {
        /* Exactly what a wedge scanner types: the label URL. */
        var v = scan('https://plant.cleancell.us/u/' + g.getAttribute('data-serial'));
        var el = $('verdict');
        el.className = 'vd ' + (v.ok ? (v.action === 'duplicate' ? 'dup' : 'ok') : 'bad');
        el.querySelector('.mark').textContent = v.ok ? (v.action === 'duplicate' ? '=' : '✓') : '✕';
        $('v-serial').textContent = P.serialFrom(g.getAttribute('data-serial'));
        $('v-say').textContent = v.say || '';
        $('v-why').textContent = v.reason ? '(' + v.reason + ')' : (v.action || '');
        setTimeout(render, 950);
      });
    });
    on('b-hold', 'click', function () {
      var o = a2Order(); if (!o) return;
      var a = unitsOf(o.orderNo);
      for (var i = 0; i < a.length; i++) if (!a[i].hold && a[i].at) {
        a[i].hold = 'Capacity below limit at end-of-line test'; a[i].ncr = 'NCR-26-89';
        S.sawHold = true;
        note('quality', 'Held ' + a[i].serial + ' — NCR-26-89'); break;
      }
      save(); render();
    });
    on('b-release-hold', 'click', function () {
      for (var k in S.units) if (S.units[k].hold) {
        S.units[k].hold = null; S.units[k].ncr = null;
        note('quality', 'Closed the NCR on ' + S.units[k].serial); break;
      }
      save(); render();
    });

    /* A3 */
    on('do-intake', 'click', function () {
      var kw = Number($('x-kw').value) || 1500, hrs = Number($('x-h').value) || 2, z = fit(kw, hrs);
      var o = makeOrder({ sku: z.sku, qty: z.qty, channel: 'clearsky', originLabel: 'ClearSky direct',
        via: 'console', by: 'thomas@csebuilders.com', placedBy: 'thomas@csebuilders.com',
        customer: { name: $('x-name').value, company: $('x-co').value,
                    email: 'ops@' + String($('x-co').value || 'client').toLowerCase().replace(/[^a-z]+/g, '') + '.example',
                    phone: '312 555 0180', address: { line1: '2100 S Ashland Ave', city: 'Chicago', state: 'IL', zip: '60608' } } });
      o.status = 'confirmed';
      S.focusA3 = o.orderNo;
      note('clearsky', 'Took ' + o.orderNo + ' from ' + o.customer.company);
      save(); render();
    });

    /* shared order actions */
    each('[data-act]', function (b) {
      b.addEventListener('click', function () {
        var o = find(b.getAttribute('data-no')); if (!o) return;
        var a = b.getAttribute('data-act');
        if (a === 'confirm') { o.status = 'confirmed'; S.focusA2 = o.orderNo; note('cleancell', 'Accepted ' + o.orderNo + ' into production'); }
        if (a === 'focus') { S.focusA2 = o.orderNo; note('cleancell', 'Working ' + o.orderNo); }
        if (a === 'price') {
          o.pricing = { total: Math.round(o.cost * 1.18), currency: 'USD', pricedBy: 'thomas@csebuilders.com', pricedAt: nowISO() };
          o.status = 'quoted';
          note('clearsky', 'Priced ' + o.orderNo);
        }
        if (a === 'publish') { o.tenantPricing.publishedToCustomer = true; note('clearsky', 'Published the price on ' + o.orderNo); }
        if (a === 'deposit') {
          o.deposit = true; o.status = 'accepted';
          o.documents.push({ kind: 'invoice', name: 'Deposit invoice ' + o.orderNo, url: '#', at: nowISO(), audience: 'customer' });
          o.documents.push({ kind: 'internal', name: 'Margin sheet (internal)', url: '#', at: nowISO(), audience: 'internal' });
          note('finance', 'Deposit cleared on ' + o.orderNo);
        }
        if (a === 'release') { release(o); }
        if (a === 'ship') { if (allReady(o.orderNo)) markComplete(o); }
        if (a === 'paid') { o.paid = true; note('finance', 'Balance received on ' + o.orderNo + ' — closed'); }
        save(); render();
      });
    });

    on('do-leak', 'click', function () {
      var o = a3Order() || S.orders[0];
      if (!o) { $('leak-out').textContent = 'Place an order first.'; return; }
      var proj = JSON.stringify(projected(o), null, 1);
      var needles = ['clearsky', String(o.cost), 'margin', 'provenance', 'history',
                     'csebuilders.com', o.pricing ? String(o.pricing.total) : '\u0000none\u0000', 'placedBy'];
      var lines = needles.map(function (n) {
        return (proj.indexOf(n) >= 0 ? '  LEAKED  ' : '  absent  ') + n;
      }).join('\n');
      S.leak = 'What the order actually holds:\n  cost ' + money(o.cost) + ' · margin ' + o.margin
        + ' · fulfilledBy "' + o.fulfilledBy + '"\n  ' + o.history.length + ' audit entries'
        + (o.pricing ? ' · ClearSky price ' + money(o.pricing.total) : '')
        + '\n\nSearched the buyer’s projection for each:\n' + lines
        + '\n\nWhat the buyer receives:\n' + proj;
      save();
      $('leak-out').textContent = S.leak;
    });
  }

  $('reset').addEventListener('click', function () {
    if (!window.confirm('Clear every order, unit, account and drawing and start again?')) return;
    S = seed(); save(); render();
  });

  render();
})();
