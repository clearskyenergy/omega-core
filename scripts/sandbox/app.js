/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ══════════════════════════════════════════════════════════════════════════
   A LIVE DEMO, not a diagram. Five real product surfaces inside a browser
   frame — Clean Cell's public site, their customer portal, their designer,
   their plant tablet, and the ClearSky console — sharing one world.

   The two DECISION engines above this in the bundle, OmegaPlant
   (api/_lib/plant.js) and OmegaPortal (api/_lib/portal.js), are the REAL
   committed files, unmodified. Nothing below re-implements a rule they own.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var P = window.OmegaPlant, Q = window.OmegaPortal;
  var KEY = 'omega.demo.v3';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US'); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function plural(n, one, many) { return n + ' ' + (Number(n) === 1 ? one : (many || one + 's')); }
  function nowISO() { return new Date().toISOString(); }
  function day(iso) { return String(iso || '').slice(0, 10); }
  function hhmm(t) { var d = new Date(t || Date.now());
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* ── Clean Cell's published product list ──────────────────────────────── */
  var CATALOG = [
    { sku: 'CC-215',  name: 'CellCube 215',   sub: '215 kWh outdoor cabinet', kw: 100,  kwh: 215,  price: 61000,   w: 4.5,  d: 3.5,
      blurb: 'Wall-adjacent cabinet for a single loading dock or a small plant.' },
    { sku: 'CC-418',  name: 'CellCube 418',   sub: '418 kWh outdoor cabinet', kw: 200,  kwh: 418,  price: 112000,  w: 7.5,  d: 4.5,
      blurb: 'The workhorse. Pairs to any size without a containerised yard.' },
    { sku: 'CC-1250', name: 'CellSkid 1250',  sub: '1.25 MWh skid',           kw: 500,  kwh: 1250, price: 310000,  w: 20,   d: 8,
      blurb: 'Skid-mounted, craned into place, one MV connection.' },
    { sku: 'CC-5000', name: 'CellBlock 5000', sub: '5 MWh 20 ft container',   kw: 2500, kwh: 5000, price: 1180000, w: 19.88, d: 8,
      blurb: 'Utility-scale block for peak shaving above two megawatts.' }
  ];
  function skuOf(s) { for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].sku === s) return CATALOG[i]; return null; }

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
    return { sku: best.sku, qty: qty, name: best.name, sub: best.sub,
             tkw: best.kw * qty, tkwh: best.kwh * qty, price: best.price * qty, kw: kw, h: hours };
  }

  /* ── state ────────────────────────────────────────────────────────────── */
  function seed() {
    return {
      who: 'buyer', route: 'home', hist: [], notes: false,
      seq: 4418, orders: [], units: {},
      account: {
        created: false, signedIn: false, name: '', company: '', email: '', phone: '',
        address: { line1: '4400 W Ferdinand St', city: 'Chicago', state: 'IL', zip: '60624' },
        plan: 'free', users: []
      },
      termsBy: {},
      sized: null, study: null, design: null, view: 'plan', tool: 'select',
      bench: 'kit', lastScan: null, focusA2: null, modal: null, flash: '',
      log: []
    };
  }
  var S;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S || !S.orders || !S.account) S = seed();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function note(who, what) { S.log.unshift({ at: Date.now(), who: who, what: what }); S.log = S.log.slice(0, 80); }

  /* ── orders ───────────────────────────────────────────────────────────── */
  function orderNo() { S.seq += 1; return 'CC-26-' + S.seq; }
  function unitsOf(no) { var o = []; for (var k in S.units) if (S.units[k].orderNo === no) o.push(S.units[k]); return o; }
  function find(no) { for (var i = 0; i < S.orders.length; i++) if (S.orders[i].orderNo === no) return S.orders[i]; return null; }
  function projected(o) { return Q.publicOrder(o, { units: unitsOf(o.orderNo), showPrice: true }); }
  /* Whose orders these are is the verified email address and nothing else —
     the join api/my-orders.js makes. */
  function myOrders() {
    var e = String(S.account.email || '').toLowerCase();
    if (!e || !S.account.signedIn) return [];
    return S.orders.filter(function (o) { return String(o.customer.email || '').toLowerCase() === e; });
  }

  function termsOf(email) {
    var t = (S.termsBy || {})[String(email || '').toLowerCase()];
    return t || { netDays: null, discountPct: null, poRequired: false };
  }
  function makeOrder(opts) {
    var c = skuOf(opts.sku), qty = opts.qty, cu = opts.customer;
    var o = {
      orderNo: orderNo(), orgId: 'cleancell.us', orgName: 'Clean Cell',
      channel: opts.channel, originLabel: opts.originLabel,
      /* Fields a real order carries that a customer must NEVER see. The
         projection is what keeps them out. */
      fulfilledBy: 'clearsky', source: opts.channel === 'clearsky' ? 'console' : 'embed',
      placedBy: opts.placedBy || null,
      pricing: null, cost: Math.round(c.price * 0.61 * qty), margin: 0.22,
      provenance: { via: opts.via, embedKeyId: 'a91f22c8' },
      history: [{ at: nowISO(), by: opts.by, what: 'created' }],
      status: 'new', createdAt: nowISO(),
      customer: { name: cu.name, company: cu.company, email: String(cu.email || '').toLowerCase(),
                  phone: cu.phone, address: cu.address, notes: '' },
      items: [{ sku: c.sku, name: c.name + ' · ' + c.sub, qty: qty, kw: c.kw, kwh: c.kwh }],
      system: { kw: c.kw * qty, kwh: c.kwh * qty, durationH: Math.round((c.kwh / c.kw) * 10) / 10 },
      tenantPricing: { total: c.price * qty, currency: 'USD', publishedToCustomer: false },
      documents: [], promisedShipAt: null, cancelRequested: false, deposit: false, paid: false
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
    S.focusA2 = o.orderNo;
    note('works order', 'Released ' + o.orderNo + ' — ' + plural(n, 'serial') + ' allocated');
    save();
  }
  function allReady(no) {
    var a = unitsOf(no); if (!a.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i].at !== 'ready' || a[i].hold) return false;
    return true;
  }
  function markComplete(o) {
    o.status = 'shipped';
    o.documents.push({ kind: 'packing', name: 'Packing list ' + o.orderNo, at: nowISO(), audience: 'customer' });
    o.history.push({ at: nowISO(), by: 'plant', what: 'staged and shipped' });
    note('plant', o.orderNo + ' complete — packing list issued');
    save();
  }
  function benchOrder() {
    var o = S.focusA2 ? find(S.focusA2) : null; if (o) return o;
    var open = S.orders.filter(function (x) { return x.status !== 'shipped'; });
    for (var i = 0; i < open.length; i++) if (unitsOf(open[i].orderNo).length) return open[i];
    return open.length ? open[0] : null;
  }

  /* ── THE SCAN. Straight into the real engine. ─────────────────────────── */
  function doScan(raw) {
    var s = P.serialFrom(raw);
    var u = s ? S.units[s] : null;
    var routing = P.DEFAULT_ROUTING;
    var v = P.judgeScan(u || null, S.bench, routing);
    if (v.ok && v.action === 'advance') {
      var patch = P.applyScan(u, v, nowISO());
      u.at = patch.at; u.done = patch.done; u.hold = null;
    }
    S.lastScan = { serial: s || raw, ok: !!v.ok, action: v.action || '', reason: v.reason || '', say: v.say || '' };
    note('bench', P.labelOf(routing, S.bench) + ' · ' + (s || raw) + ' · ' + (v.say || v.reason));
    save();
    return v;
  }
  function runBay(no) {
    /* Every unit one bench forward, asking the REAL engine each time —
       including at the machine station, which the rig writes by passing
       `machine: true`. That flag is the engine's: a human scan is still
       refused there. */
    var routing = P.DEFAULT_ROUTING, a = unitsOf(no), moved = 0;
    for (var i = 0; i < a.length; i++) {
      var u = a[i]; if (u.hold) continue;
      var next = u.at ? routing[P.indexOf(routing, u.at) + 1] : routing[0];
      if (!next) continue;
      var machine = P.MACHINE_STATIONS.indexOf(next.key) >= 0;
      var v = P.judgeScan(u, next.key, routing, machine ? { machine: true } : null);
      if (v.ok && v.action === 'advance') {
        var pt = P.applyScan(u, v, nowISO()); u.at = pt.at; u.done = pt.done; u.hold = null; moved++;
      }
    }
    note('plant', 'Ran the bay — ' + plural(moved, 'unit') + ' advanced one station');
    save();
  }

  /* ── the drawing ──────────────────────────────────────────────────────── */
  function layout(d) {
    /* Feet on a 3 px grid. The lot is sized to the system so five cabinets
       and one container both draw legibly; the setback and the 8 ft
       clearance between units are the constants that matter. */
    var SET = 22, GAP = 8, K = 3, BW = 72, BD = 42, padC = GAP;
    var c = skuOf(d.sku);
    var cols = Math.min(d.qty, 5), rows = Math.ceil(d.qty / cols);
    var yardW = cols * c.w + (cols - 1) * GAP;
    var yardD = rows * c.d + (rows - 1) * (GAP + 4);
    var LOT_W = Math.round(Math.max(BW + 68, yardW + 2 * padC + 46) + SET * 2);
    var LOT_D = Math.round(SET * 2 + BD + 16 + yardD + 2 * padC + 16);
    var x0 = SET + 16 + padC, y0 = SET + BD + 16 + padC, boxes = [];
    for (var i = 0; i < d.qty; i++) {
      var r = Math.floor(i / cols), k = i % cols;
      boxes.push({ x: x0 + k * (c.w + GAP), y: y0 + r * (c.d + GAP + 4), w: c.w, d: c.d, n: i + 1 });
    }
    return { LOT_W: LOT_W, LOT_D: LOT_D, SET: SET, K: K, GAP: GAP, BW: BW, BD: BD, boxes: boxes,
             comp: { x: x0 - padC, y: y0 - padC, w: yardW + 2 * padC, d: yardD + 2 * padC }, c: c };
  }
  function plotPlan(d) {
    var L = layout(d), K = L.K, W = L.LOT_W * K, H = L.LOT_D * K, PAD = 6;
    function R(x, y, w, h, f, st, dash) {
      return '<rect x="' + (x * K) + '" y="' + (y * K) + '" width="' + (w * K) + '" height="' + (h * K)
        + '" fill="' + f + '"' + (st ? ' stroke="' + st + '" stroke-width="1.5"' : '')
        + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' rx="2"/>';
    }
    function T(x, y, t, size, fill, anchor, weight) {
      return '<text x="' + (x * K) + '" y="' + (y * K) + '" font-size="' + size + '" font-weight="'
        + (weight || 400) + '" fill="' + fill + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '')
        + '>' + esc(t) + '</text>';
    }
    var s = '<svg viewBox="' + (-PAD) + ' ' + (-PAD) + ' ' + (W + PAD * 2) + ' ' + (H + PAD * 2)
      + '" role="img" aria-label="Site plan with ' + d.qty + ' units placed to scale">';
    s += R(0, 0, L.LOT_W, L.LOT_D, 'var(--paper)', 'var(--ink2)');
    s += R(L.SET, L.SET, L.LOT_W - 2 * L.SET, L.LOT_D - 2 * L.SET, 'none', 'var(--ink3)', '6 5');
    s += R(L.SET + 4, L.SET + 4, L.BW, L.BD, 'var(--line2)', 'var(--ink3)');
    s += T(L.SET + 12, L.SET + 28, 'Existing building', 15, 'var(--ink2)', null, 600);
    s += R(L.comp.x, L.comp.y, L.comp.w, L.comp.d, 'var(--brand-soft)', 'var(--brand)', '7 4');
    s += T(L.comp.x, L.comp.y - 4, 'BESS compound · fenced, ' + L.GAP + ' ft clear', 13, 'var(--brand)', null, 600);
    for (var i = 0; i < L.boxes.length; i++) {
      var b = L.boxes[i];
      s += R(b.x, b.y, b.w, b.d, 'var(--brand)', 'var(--brand)');
      s += T(b.x + b.w / 2, b.y + b.d / 2 + 1.6, String(b.n), 13, '#fff', 'middle', 700);
    }
    var rx = L.LOT_W - L.SET - 26;
    s += R(rx, L.SET + 6, 18, 14, 'var(--accent)', 'var(--accent)');
    s += T(rx + 9, L.SET + 28, 'XFMR', 13, 'var(--ink2)', 'middle', 600);
    s += R(rx, L.SET + 36, 18, 12, 'var(--ink2)', 'var(--ink2)');
    s += T(rx + 9, L.SET + 56, 'SWGR', 13, 'var(--ink2)', 'middle', 600);
    s += '<line x1="' + (L.SET * K) + '" y1="' + ((L.LOT_D - 9) * K) + '" x2="' + ((L.SET + 50) * K)
       + '" y2="' + ((L.LOT_D - 9) * K) + '" stroke="var(--ink2)" stroke-width="2"/>';
    s += T(L.SET, L.LOT_D - 4, '50 ft', 13, 'var(--ink2)');
    s += T(L.LOT_W - 8, L.LOT_D - 4, L.LOT_W + ' × ' + L.LOT_D + ' ft · ' + L.SET + ' ft setback', 13, 'var(--ink3)', 'end');
    return s + '</svg>';
  }
  function oneLine(d) {
    var c = skuOf(d.sku);
    function box(x, y, w, h, t, sub, fill) {
      var g = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="5" fill="'
        + (fill || 'var(--paper)') + '" stroke="var(--ink3)" stroke-width="1.5"/>';
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
    var s = '<svg viewBox="0 0 780 265" role="img" aria-label="Single-line diagram">';
    var n = Math.min(d.qty, 4), top = 26, gap = 52;
    for (var i = 0; i < n; i++) {
      var y = top + i * gap;
      s += box(16, y, 154, 40, c.sku, c.kwh + ' kWh · ' + c.kw + ' kW', 'var(--brand-soft)');
      s += wire(170, y + 20, 250, 132);
    }
    if (d.qty > 4) s += '<text x="16" y="' + (top + 4 * gap + 14) + '" font-size="13" fill="var(--ink3)">+ '
      + (d.qty - 4) + ' more, identical</text>';
    s += box(250, 112, 130, 40, 'PCS', d.tkw + ' kW inverter');
    s += wire(380, 132, 430, 132);
    s += box(430, 112, 130, 40, 'XFMR', '480 V / 12.47 kV');
    s += wire(560, 132, 610, 132);
    s += box(610, 112, 152, 40, 'SWGR', '15 kV, utility');
    s += '<text x="610" y="178" font-size="12" fill="var(--ink3)">Point of common coupling</text>';
    return s + '</svg>';
  }
  function bomOf(d) {
    var c = skuOf(d.sku);
    return [
      { part: c.sku, desc: c.name + ' — ' + c.sub, qty: d.qty, unit: c.price, cat: 'Storage' },
      { part: 'PCS-' + d.tkw, desc: d.tkw + ' kW bidirectional inverter', qty: 1, unit: Math.round(d.tkw * 92), cat: 'Power conversion' },
      { part: 'XFMR-' + Math.ceil(d.tkw / 250) * 250, desc: 'Pad-mount 480 V / 12.47 kV', qty: 1, unit: Math.round(d.tkw * 64), cat: 'Medium voltage' },
      { part: 'SWGR-15', desc: '15 kV switchgear and protective relay', qty: 1, unit: 78000, cat: 'Medium voltage' },
      { part: 'BOS-DC', desc: 'DC cable, conduit, terminations', qty: d.qty, unit: 4200, cat: 'Balance of system' },
      { part: 'CIV-PAD', desc: 'Concrete pad, bollards, grounding grid', qty: 1, unit: Math.round(d.qty * 7400), cat: 'Civil' }
    ];
  }

  /* ══ ROUTING ═══════════════════════════════════════════════════════════ */
  /* The switcher names the ROLE, not a person. The question it has to answer
     at a glance is "whose screen am I on" — a customer buying, Clean Cell in
     the office, Clean Cell on the floor, or us. */
  var WHO = [
    { key: 'buyer', label: 'Customer', short: 'Customer',
      sub: 'A customer buying on cleancell.us' },
    { key: 'cc',    label: 'Clean Cell · office', short: 'CC office',
      sub: 'Clean Cell — the order desk' },
    { key: 'bench', label: 'Clean Cell · plant', short: 'CC plant',
      sub: 'Clean Cell — the bench tablet on the floor' },
    { key: 'omega', label: 'ClearSky', short: 'ClearSky',
      sub: 'ClearSky — the staff console' }
  ];
  function whoDef(k) { for (var i = 0; i < WHO.length; i++) if (WHO[i].key === k) return WHO[i]; return WHO[0]; }
  function homeOf(w) {
    if (w === 'cc') return 'a/orders';
    if (w === 'bench') return 'b/scan';
    if (w === 'omega') return 'o/orders';
    return S.account.signedIn ? 'p/orders' : 'home';
  }
  function part(i) { return S.route.split('/')[i] || ''; }
  function go(r) {
    if (r !== S.route) { S.hist.push(S.route); S.hist = S.hist.slice(-40); }
    S.route = r; S.modal = null; S.navOpen = false; S.tour = null;
    /* A flash belongs to the page that raised it. Letting it survive a
       navigation put one order's confirmation on another order's screen. */
    if (!S.keepFlash) S.flash = '';
    S.keepFlash = false;
    save(); render();
  }
  function URLS(r) {
    var h = r.split('/'), a = h[0], b = h[1] || '', c = h.slice(1).join('/');
    if (a === 'home') return ['cleancell.us', '/'];
    if (a === 'products') return ['cleancell.us', '/energy-storage'];
    if (a === 'product') return ['cleancell.us', '/energy-storage/' + slug(b)];
    if (a === 'how') return ['cleancell.us', '/how-it-works'];
    if (a === 'size') return ['cleancell.us', '/size-my-system'];
    if (a === 'study') return ['cleancell.us', '/size-my-system/site'];
    if (a === 'checkout') return ['cleancell.us', '/request'];
    if (a === 'thanks') return ['cleancell.us', '/request/confirmed'];
    if (a === 'p') return ['portal.cleancell.us', '/' + (c || 'orders')];
    if (a === 'd') return ['design.cleancell.us', '/project/' + (S.design ? slug(S.account.company || 'site') + '-1' : 'new')];
    if (a === 'a') return ['admin.cleancell.us', '/' + (c || 'orders')];
    if (a === 'b') return ['plant.cleancell.us', '/bench/2'];
    if (a === 'o') return ['console.clearskyomega.com', '/' + (c || 'orders')];
    return ['cleancell.us', '/'];
  }
  function skinOf(r) {
    var a = r.split('/')[0];
    if (a === 'b') return 'bench';
    if (a === 'o') return 'omega';
    return 'cc';
  }

  /* ══ SMALL PARTS ═══════════════════════════════════════════════════════ */
  function tbl(cols, rows, empty) {
    if (!rows.length) return '<div class="empty">' + esc(empty || 'Nothing here yet.') + '</div>';
    return '<table><thead><tr>' + cols.map(function (c) {
        return '<th' + (c.n ? ' class="n"' : '') + '>' + esc(c.t) + '</th>'; }).join('')
      + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }
  function tag(text, kind) { return '<span class="tag2 ' + (kind || '') + '">' + esc(text) + '</span>'; }
  function msTag(ms) {
    return tag(ms.label, ms.key === 'shipped' ? 'ok' : ms.key === 'cancelled' ? 'bad' : 'br');
  }
  function statusTag(o) {
    var k = o.status === 'shipped' ? 'ok' : o.status === 'new' ? 'warn' : 'br';
    return tag(o.status.replace('_', ' '), k);
  }
  function tiles(list) {
    return '<div class="tiles">' + list.map(function (t) {
      return '<div class="tile"><div class="t">' + esc(t[0]) + '</div><div class="v'
        + (t[2] ? ' s' : '') + '">' + esc(t[1]) + '</div></div>'; }).join('') + '</div>';
  }
  function panel(title, body, actions) {
    return '<div class="panel">' + (title ? '<div class="hd"><h4>' + esc(title) + '</h4><span class="sp"></span>'
      + (actions || '') + '</div>' : '') + '<div class="bd' + (body.indexOf('<table') === 0 ? ' tight' : '')
      + '">' + body + '</div></div>';
  }
  function flash() {
    if (!S.flash) return '';
    var f = '<div class="panel" style="border-color:var(--ok)"><div class="bd" style="display:flex;gap:10px;align-items:center">'
      + '<span class="tag2 ok">Done</span><span>' + esc(S.flash) + '</span></div></div>';
    return f;
  }

  /* Their wordmark, drawn from the real one: Clean in cyan, ce in ink, then
     the double-l rendered as an upright bar beside a lightning bolt, and a
     small US on the baseline. Vector rather than their PNG — cleancell.us
     serves a bot-protection interstitial to any automated fetch, so the file
     itself could not be pulled; this scales and recolours instead. */
  function bolt(cls) {
    return '<svg class="' + (cls || 'bolt') + '" viewBox="0 0 28 46" aria-hidden="true">'
      + '<path d="M0 0h6.6v46H0z" fill="currentColor"/>'
      + '<path d="M25.5 0 9.5 25.5h7.8L13.6 46 28 18.8h-7.6z" fill="currentColor"/></svg>';
  }
  function wordmark(extra) {
    return '<span class="logo"' + (extra || '') + ' role="img" aria-label="Cleancell US">'
      + '<span class="c1">Clean</span>ce' + bolt() + '<span class="us">US</span></span>';
  }

  /* ══ PUBLIC SITE ═══════════════════════════════════════════════════════ */
  function siteNav() {
    var acct = S.account.signedIn
      ? '<button class="b sm" data-go="p/orders">My account</button>'
      : '<button class="b sm" data-modal="signin">Sign in</button>';
    return '<div class="nav' + (S.navOpen ? ' open' : '') + '"><div class="in">'
      + wordmark()
      + '<span class="sp"></span>'
      + '<button type="button" class="burger" id="burger" aria-label="Menu" aria-expanded="'
      + (!!S.navOpen) + '"><i></i><i></i><i></i></button>'
      + '<nav class="nlinks">'
      + '<button data-go="products">Energy storage</button>'
      + '<button data-go="how">How it works</button>'
      + '<button data-go="products">Company</button></nav>'
      + '<span class="brow"><button class="b sm p" data-go="size">Size my system</button>' + acct + '</span>'
      + '</div></div>';
  }
  function siteFoot() {
    return '<div class="foot"><div class="wrap" style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">'
      + wordmark(' style="font-size:19px;color:#fff"')
      + '<span class="sp"></span><span>1450 W Cermak Rd, Chicago IL · sales@cleancell.us · (312) 555 0142</span>'
      + '<span>© 2026 Clean Cell USA</span></div></div>';
  }
  function pgHome() {
    var z = S.sized;
    return siteNav()
      + '<div class="hero">'
      + '<div style="position:absolute;right:-4%;top:-16%;height:150%;color:rgba(63,175,198,.10);'
      + 'pointer-events:none">' + bolt('wm') + '</div>'
      + '<div class="wrap in hgrid"><div>'
      + '<h1>Storage that ships in twelve weeks.<span class="b2">Sized in about a minute.</span></h1>'
      + '<p class="say">We empower US-based energy and electrification companies by putting a new '
      + 'competitive class of products within reach — built here, delivered here, supported here.</p>'
      + '<p class="say2">Cut your demand charges, ride through outages, and keep the cold chain cold. '
      + 'Tell us what your utility bill says and we will size it while you read this.</p>'
      + '<div class="brow" style="margin-top:32px"><button class="b p lg" data-go="size">Size my system</button>'
      + '<button class="b lg" data-go="products">See the range</button></div>'
      + '<div class="stats"><div><b>412 MWh</b><span>shipped since 2021</span></div>'
      + '<div><b>12 weeks</b><span>typical lead time</span></div>'
      + '<div><b>10 year</b><span>capacity warranty</span></div></div>'
      + '</div><div class="card" style="gap:4px">'
      + '<div class="cap">Quick sizer</div><h3 style="margin-bottom:10px">What does your bill say?</h3>'
      + '<label class="fld"><span>Peak demand (kW)</span><input id="h-kw" type="number" value="' + (z ? z.kw : 900) + '"></label>'
      + '<label class="fld"><span>Hours of backup</span><input id="h-h" type="number" step="0.5" value="' + (z ? z.h : 2) + '"></label>'
      + '<button class="b p" id="h-size" style="margin-top:4px">Size it</button>'
      + '<p class="xs mut" style="margin-top:10px">No account needed. Nothing is sent to anyone until you ask.</p>'
      + '</div></div></div>'
      + '<div class="sec"><div class="wrap"><h2>The range</h2>'
      + '<p class="lead" style="margin-top:10px;max-width:58ch">One chemistry, four enclosures. Every one of them ships '
      + 'with the same BMS and the same warranty.</p>'
      + '<div class="cards">' + CATALOG.map(function (c) {
          return '<button class="card" data-go="product/' + c.sku + '">'
            + '<div class="cap">' + esc(c.sku) + '</div><h3>' + esc(c.name) + '</h3>'
            + '<div class="sm mut">' + esc(c.sub) + '</div>'
            + '<div class="spec"><span>' + num(c.kwh) + ' kWh</span><span>' + num(c.kw) + ' kW</span>'
            + '<span>' + c.w + ' × ' + c.d + ' ft</span></div>'
            + '<div class="price">from ' + money(c.price) + '</div></button>'; }).join('')
      + '</div></div></div>'
      + '<div class="band"><div class="wrap"><h2>How a Clean Cell project runs</h2>'
      + '<div class="cards">'
      + '<div class="card"><div class="cap">Step one</div><h3>Size it online</h3>'
      + '<p class="sm mut">Peak demand and hours in, a system out, drawn on your own lot to scale.</p></div>'
      + '<div class="card"><div class="cap">Step two</div><h3>We confirm and build</h3>'
      + '<p class="sm mut">Your order becomes a works order on our floor. Every cabinet is serialised and scanned through ten benches.</p></div>'
      + '<div class="card"><div class="cap">Step three</div><h3>You watch it happen</h3>'
      + '<p class="sm mut">Your account shows where your units actually are — not a status somebody typed in.</p></div>'
      + '</div></div></div>' + siteFoot();
  }
  function pgProducts() {
    return siteNav() + '<div class="sec"><div class="wrap"><h1 style="font-size:36px">Energy storage</h1>'
      + '<p class="lead" style="margin-top:12px;max-width:62ch">Outdoor-rated, UL 9540 listed, liquid cooled. '
      + 'Sized from 215 kWh to 5 MWh in a single lineup so you are never paying for an enclosure you do not need.</p>'
      + '<div class="cards">' + CATALOG.map(function (c) {
          return '<button class="card" data-go="product/' + c.sku + '">'
            + '<div class="cap">' + esc(c.sku) + '</div><h3>' + esc(c.name) + '</h3>'
            + '<div class="sm mut">' + esc(c.blurb) + '</div>'
            + '<div class="spec"><span>' + num(c.kwh) + ' kWh</span><span>' + num(c.kw) + ' kW</span></div>'
            + '<div class="price">from ' + money(c.price) + '</div></button>'; }).join('')
      + '</div></div></div>' + siteFoot();
  }
  function pgProduct() {
    var c = skuOf(part(1)); if (!c) return pgProducts();
    return siteNav() + '<div class="sec"><div class="wrap">'
      + '<button class="b g sm" data-go="products" style="padding-left:0">← All storage</button>'
      + '<div class="two" style="margin-top:14px"><div>'
      + '<div class="eyebrow" style="color:var(--brand-d);font:700 11.5px var(--f);letter-spacing:.16em;text-transform:uppercase">'
      + esc(c.sku) + '</div>'
      + '<h1 style="font-size:40px;margin-top:8px">' + esc(c.name) + '</h1>'
      + '<p class="lead" style="margin-top:12px">' + esc(c.blurb) + '</p>'
      + '<div class="panel" style="margin-top:22px"><div class="bd"><table><tbody>'
      + [['Usable energy', num(c.kwh) + ' kWh'], ['Continuous power', num(c.kw) + ' kW'],
         ['Duration at rated power', (Math.round((c.kwh / c.kw) * 10) / 10) + ' h'],
         ['Footprint', c.w + ' × ' + c.d + ' ft'], ['Chemistry', 'LFP, liquid cooled'],
         ['Listing', 'UL 9540 / UL 9540A tested'], ['Warranty', '10 years, 70% capacity']].map(function (r) {
           return '<tr><td class="mut">' + esc(r[0]) + '</td><td style="font-weight:600">' + esc(r[1]) + '</td></tr>'; }).join('')
      + '</tbody></table></div></div></div>'
      + '<div class="card"><div class="cap">Indicative</div>'
      + '<div style="font-size:30px;font-weight:800;letter-spacing:-.02em">' + money(c.price) + '</div>'
      + '<p class="sm mut">Per unit, delivered to the Midwest. Installation and interconnection are quoted separately.</p>'
      + '<button class="b p" data-size-sku="' + c.sku + '" style="margin-top:10px">Size a system around this</button>'
      + '<button class="b" data-go="size">Start from my bill instead</button></div>'
      + '</div></div></div>' + siteFoot();
  }
  function pgHow() {
    return siteNav() + '<div class="sec"><div class="wrap"><h1 style="font-size:36px">How it works</h1>'
      + '<div class="cards" style="margin-top:24px">'
      + [['01', 'You size it', 'Peak demand and hours of backup. We pick the tightest fit from our own range rather than the biggest box we sell.'],
         ['02', 'You see it on your lot', 'Your address, your parcel, the cabinets drawn to scale with the setback and the fire clearance.'],
         ['03', 'You place the request', 'No account needed. A person here confirms it before anything is committed.'],
         ['04', 'We build it', 'Every cabinet is serialised. Ten benches, one scan each, and the scan is refused if the unit is not where it should be.'],
         ['05', 'You watch it', 'Your account shows the furthest-behind unit in your order. Nobody types a status.'],
         ['06', 'It ships', 'Packing list, test reports and the as-built drawing set land in your documents.']].map(function (s) {
           return '<div class="card"><div class="cap">' + s[0] + '</div><h3>' + esc(s[1]) + '</h3>'
             + '<p class="sm mut">' + esc(s[2]) + '</p></div>'; }).join('')
      + '</div><div class="brow" style="margin-top:28px"><button class="b p lg" data-go="size">Size my system</button></div>'
      + '</div></div>' + siteFoot();
  }
  function pgSize() {
    var z = S.sized;
    var h = siteNav() + '<div class="sec"><div class="wrap" style="max-width:820px">'
      + '<h1 style="font-size:34px">Size my system</h1>'
      + '<p class="lead" style="margin-top:10px">Two numbers off your utility bill. No account, no sales call.</p>'
      + '<div class="panel" style="margin-top:22px"><div class="bd">'
      + '<div class="frow"><label class="fld"><span>Peak demand (kW)</span><input id="s-kw" type="number" value="' + (z ? z.kw : 900) + '"></label>'
      + '<label class="fld"><span>Hours of backup</span><input id="s-h" type="number" step="0.5" value="' + (z ? z.h : 2) + '"></label></div>'
      + '<button class="b p" id="s-go">Size it</button></div></div>';
    if (z) {
      h += '<div class="panel"><div class="hd"><h4>Recommended system</h4><span class="sp"></span>'
        + tag(z.qty + ' × ' + z.sku, 'br') + '</div><div class="bd">'
        + '<div class="dl"><div><div class="t">Product</div><div class="v">' + esc(z.name) + '</div></div>'
        + '<div><div class="t">System</div><div class="v">' + num(z.tkw) + ' kW · ' + num(z.tkwh) + ' kWh</div></div>'
        + '<div><div class="t">Duration</div><div class="v">' + (Math.round((z.tkwh / z.tkw) * 10) / 10) + ' h</div></div>'
        + '<div><div class="t">Indicative</div><div class="v">' + money(z.price) + '</div></div></div>'
        + '<div class="brow" style="margin-top:20px"><button class="b p" data-go="study">See it on my lot →</button>'
        + '<button class="b" data-go="checkout">Request this system</button></div>'
        + '<p class="xs mut" style="margin-top:12px">Indicative only. Duration is estimated from what you typed, not from interval data.</p>'
        + '</div></div>';
    }
    return h + '</div></div>' + siteFoot();
  }
  function pgStudy() {
    var z = S.sized || fit(900, 2);
    var addr = S.study ? S.study.address : S.account.address.line1 + ', ' + S.account.address.city + ' ' + S.account.address.state;
    var h = siteNav() + '<div class="sec"><div class="wrap" style="max-width:900px">'
      + '<h1 style="font-size:34px">See it on your lot</h1>'
      + '<p class="lead" style="margin-top:10px">We pull your parcel and draw the cabinets on it to scale, with the setback and the fire clearance.</p>'
      + '<div class="panel" style="margin-top:22px"><div class="bd">'
      + '<label class="fld"><span>Site address</span><input id="st-addr" value="' + esc(addr) + '"></label>'
      + '<button class="b p" id="st-go">Draw my site</button></div></div>';
    if (S.study) {
      h += '<div class="panel"><div class="hd"><h4>' + esc(S.study.address) + '</h4><span class="sp"></span>'
        + tag(S.study.qty + ' × ' + skuOf(S.study.sku).sku, 'br') + '</div><div class="bd">'
        + plotPlan(S.study)
        + '<div class="legend"><span><i style="background:var(--brand)"></i>Storage</span>'
        + '<span><i style="background:var(--accent)"></i>Transformer pad</span>'
        + '<span><i style="background:var(--ink3)"></i>Switchgear</span></div>'
        + '<div class="brow" style="margin-top:18px"><button class="b p" data-go="checkout">Request this system →</button></div>'
        + '</div></div>';
    }
    return h + '</div></div>' + siteFoot();
  }
  function pgCheckout() {
    var z = S.sized || (S.study ? S.study : fit(900, 2));
    var a = S.account;
    return siteNav() + '<div class="sec"><div class="wrap" style="max-width:900px">'
      + '<h1 style="font-size:34px">Request this system</h1>'
      + '<p class="lead" style="margin-top:10px">This is a request, not a purchase. Somebody at Clean Cell confirms it before anything is committed.</p>'
      + '<div class="two" style="margin-top:22px"><div class="panel"><div class="hd"><h4>Your details</h4></div><div class="bd">'
      + '<div class="frow"><label class="fld"><span>Your name</span><input id="c-name" value="' + esc(a.name || 'Dana Ruiz') + '"></label>'
      + '<label class="fld"><span>Company</span><input id="c-co" value="' + esc(a.company || 'Riverside Cold Chain') + '"></label></div>'
      + '<div class="frow"><label class="fld"><span>Work email</span><input id="c-em" type="email" value="' + esc(a.email || 'ops@riverside.example') + '"></label>'
      + '<label class="fld"><span>Phone</span><input id="c-ph" value="' + esc(a.phone || '312 555 0110') + '"></label></div>'
      + '<label class="fld"><span>Site address</span><input id="c-addr" value="' + esc(S.study ? S.study.address : a.address.line1 + ', ' + a.address.city) + '"></label>'
      + '<button class="b p lg" id="c-place" style="margin-top:6px">Place the request</button>'
      + '<p class="xs mut" style="margin-top:12px">We will email you a confirmation. You can create an account afterwards to track it.</p>'
      + '</div></div>'
      + '<div class="panel"><div class="hd"><h4>Summary</h4></div><div class="bd">'
      + '<div class="pr" style="border:0"><span>' + esc(z.qty) + ' × ' + esc(z.name) + '</span><b>' + money(z.price) + '</b></div>'
      + '<div class="pr"><span class="mut">System</span><b>' + num(z.tkw) + ' kW · ' + num(z.tkwh) + ' kWh</b></div>'
      + '<div class="pr"><span class="mut">Lead time</span><b>12 weeks</b></div>'
      + '<div class="pr"><span class="mut">Deposit on confirmation</span><b>30%</b></div>'
      + '</div></div></div></div></div>' + siteFoot();
  }
  function pgThanks() {
    var no = part(1), o = find(no);
    return siteNav() + '<div class="sec"><div class="wrap" style="max-width:700px;text-align:center">'
      + '<div style="font-size:44px">✓</div>'
      + '<h1 style="font-size:34px;margin-top:10px">Request received</h1>'
      + '<p class="lead" style="margin-top:12px">Thank you. Your reference is <code>' + esc(no) + '</code>. '
      + 'Rob at Clean Cell will confirm it, usually the same day.</p>'
      + (o ? '<div class="panel" style="margin-top:24px;text-align:left"><div class="bd">'
        + '<div class="dl"><div><div class="t">System</div><div class="v">' + esc(o.items[0].qty) + ' × ' + esc(o.items[0].name) + '</div></div>'
        + '<div><div class="t">Site</div><div class="v">' + esc(o.customer.address.line1 || '') + '</div></div>'
        + '<div><div class="t">Sent to</div><div class="v">' + esc(o.customer.email) + '</div></div></div></div></div>' : '')
      + '<div class="brow" style="margin-top:24px;justify-content:center">'
      + (S.account.signedIn
          ? '<button class="b p lg" data-go="p/orders">Track it in my account</button>'
          : '<button class="b p lg" data-modal="signup">Create an account to track it</button>')
      + '<button class="b lg" data-go="home">Back to the site</button></div>'
      + '<p class="xs mut" style="margin-top:14px">Your account finds this order by the email address you used. You do not have to quote the reference.</p>'
      + '</div></div>' + siteFoot();
  }

  /* ══ APP SHELL (portal · admin · console) ══════════════════════════════ */
  function shellWrap(o) {
    var nav = o.nav.map(function (n) {
      if (n.grp) return '<div class="grp">' + esc(n.grp) + '</div>';
      var on = S.route === n.r || (n.pre && S.route.indexOf(n.pre) === 0);
      return '<button type="button" data-go="' + n.r + '" aria-current="' + (!!on) + '">' + esc(n.t) + '</button>';
    }).join('');
    return '<div class="app"><div class="side">'
      + '<div class="brandrow">' + o.mark + '</div>'
      + '<nav class="snav">' + nav + '</nav>'
      + (o.foot ? '<div class="sidefoot xs mut">' + o.foot + '</div>' : '')
      + '</div><div class="main">' + o.body + '</div></div>';
  }
  function portalShell(body) {
    return shellWrap({
      mark: wordmark(' style="font-size:20px"'),
      nav: [{ r: 'p/orders', t: 'Orders', pre: 'p/order' }, { r: 'p/documents', t: 'Documents' },
            { r: 'p/terms', t: 'Terms & agreements' },
            { grp: 'Design' }, { r: 'p/design', t: 'Design studio' },
            { grp: 'You' }, { r: 'p/account', t: 'Account' }],
      foot: '<b>Customer account</b><br>' + esc(S.account.email)
        + '<br><button class="b sm" id="signout" style="margin-top:8px">Sign out</button>',
      body: body
    });
  }
  function adminShell(body) {
    return shellWrap({
      mark: wordmark(' style="font-size:19px"')
        + '<span class="xs mut" style="margin-left:2px">admin</span>',
      nav: [{ grp: 'Sales' }, { r: 'a/orders', t: 'Orders', pre: 'a/order' },
            { r: 'a/customers', t: 'Customers', pre: 'a/customer' },
            { grp: 'Production' }, { r: 'a/production', t: 'Works orders' }, { r: 'b/scan', t: 'Bench tablet' }],
      foot: '<b>Clean Cell · owner</b><br>rob@cleancell.us',
      body: body
    });
  }
  function omegaShell(body) {
    return shellWrap({
      mark: '<span style="font:700 18px var(--cs);letter-spacing:-.03em;white-space:nowrap">'
        + '<span style="color:var(--brand);font-size:21px">\u03A9</span> ClearSky '
        + '<span style="color:var(--brand)">OMEGA</span></span>',
      nav: [{ grp: 'Operations' }, { r: 'o/orders', t: 'Orders', pre: 'o/order' },
            { r: 'o/tenants', t: 'Tenants', pre: 'o/tenant' }, { r: 'o/systems', t: 'Systems' }],
      foot: '<b>ClearSky · staff admin</b><br>thomas@csebuilders.com'
        + '<div class="sheettag">SHEET G-002</div>',
      body: body
    });
  }

  /* ══ CUSTOMER PORTAL ═══════════════════════════════════════════════════ */
  function pgPOrders() {
    var mine = myOrders();
    var rows = mine.map(function (o) {
      var p = projected(o);
      return '<tr class="clk" data-go="p/order/' + o.orderNo + '">'
        + '<td class="mono">' + esc(o.orderNo) + '</td>'
        + '<td>' + esc(o.items[0].qty) + ' × ' + esc(o.items[0].name) + '</td>'
        + '<td class="n">' + num(o.system.kwh) + ' kWh</td>'
        + '<td>' + msTag(p.milestone) + '</td>'
        + '<td class="n">' + (p.price ? money(p.price.total) : '<span class="mut">pending</span>') + '</td>'
        + '<td class="mut">' + esc(p.promisedShipAt ? day(p.promisedShipAt) : '—') + '</td></tr>';
    });
    return portalShell(flash()
      + '<div class="ph"><div><h2>Orders</h2><div class="sub">Everything you have ordered from Clean Cell.</div></div>'
      + '<span class="sp"></span><button class="b sm" data-go="home">Visit cleancell.us</button></div>'
      + tiles([['Orders', mine.length], ['In production', mine.filter(function (o) {
          return projected(o).milestone.key === 'production'; }).length],
        ['Plan', S.account.plan === 'designer' ? 'Designer' : 'Free', true]])
      + panel('', tbl([{ t: 'Order' }, { t: 'System' }, { t: 'Capacity', n: true }, { t: 'Status' },
          { t: 'Price', n: true }, { t: 'Ships by' }], rows,
          'Nothing yet. Size a system on cleancell.us and place a request.')));
  }
  function pgPOrder() {
    var o = find(part(2)); if (!o) return pgPOrders();
    var p = projected(o), ms = p.milestone, idx = ms.index == null ? -1 : ms.index;
    var steps = Q.LADDER.map(function (l, i) {
      var cls = i < idx ? 'done' : i === idx ? 'now' : 'wait';
      return '<div class="s ' + cls + '"><div class="rail"><span class="dot"></span>'
        + (i < Q.LADDER.length - 1 ? '<span class="bar"></span>' : '') + '</div>'
        + '<div class="txt"><b>' + esc(l.label) + '</b>' + (i === idx ? '<div>' + esc(ms.say) + '</div>' : '') + '</div></div>';
    }).join('');
    return portalShell(flash()
      + '<div class="ph"><button class="b g sm" data-go="p/orders" style="padding-left:0">← Orders</button></div>'
      + '<div class="ph"><div><h2 class="mono" style="font-size:22px">' + esc(o.orderNo) + '</h2>'
      + '<div class="sub">Placed ' + esc(day(o.createdAt)) + ' · sold by ' + esc(p.soldBy) + '</div></div>'
      + '<span class="sp"></span>' + msTag(ms) + '</div>'
      + '<div class="two"><div>'
      + panel('Progress', '<div class="tl">' + steps + '</div>')
      + panel('What you ordered', '<table><tbody>' + p.items.map(function (it) {
          return '<tr><td><b>' + esc(it.qty) + ' ×</b> ' + esc(it.name) + '</td><td class="n mut">'
            + num(it.kwh) + ' kWh</td></tr>'; }).join('') + '</tbody></table>')
      + panel('Documents', p.documents.length
          ? '<table><tbody>' + p.documents.map(function (d) {
              return '<tr><td>' + esc(d.name) + '</td><td class="n mut">' + esc(day(d.at))
                + '</td><td class="n"><button class="b sm" data-doc="1">Download</button></td></tr>'; }).join('') + '</tbody></table>'
          : '<div class="empty">Documents appear here as your order passes each stage.</div>')
      + '</div><div>'
      + panel('Summary', '<div class="pr"><span class="mut">Price</span><b>'
          + (p.price ? money(p.price.total) : 'Pending') + '</b></div>'
        + '<div class="pr"><span class="mut">Ships by</span><b>' + esc(p.promisedShipAt ? day(p.promisedShipAt) : '—') + '</b></div>'
        + '<div class="pr"><span class="mut">Deliver to</span><b>' + esc((p.site && p.site.city) || o.customer.address.city) + '</b></div>'
        + '<div class="pr" style="border:0"><span class="mut">Contact</span><b>' + esc(o.customer.name) + '</b></div>')
      + panel('Need a change?', (o.cancelRequested
          ? '<p class="sm">Your cancellation request is with Clean Cell.</p>'
          : '<p class="sm mut">Ask Clean Cell to cancel or amend. They hold the production slot, so it is a request rather than an instant change.</p>'
            + '<button class="b sm" data-cancel="' + o.orderNo + '" style="margin-top:10px">Request cancellation</button>'))
      + '</div></div>');
  }
  function pgPDocs() {
    var rows = [];
    myOrders().forEach(function (o) {
      projected(o).documents.forEach(function (d) {
        rows.push('<tr><td>' + esc(d.name) + '</td><td class="mono">' + esc(o.orderNo) + '</td>'
          + '<td class="mut">' + esc(day(d.at)) + '</td><td class="n"><button class="b sm" data-doc="1">Download</button></td></tr>');
      });
    });
    return portalShell('<div class="ph"><div><h2>Documents</h2>'
      + '<div class="sub">Everything Clean Cell has issued to you.</div></div></div>'
      + panel('', tbl([{ t: 'Document' }, { t: 'Order' }, { t: 'Issued' }, { t: '', n: true }], rows,
          'Nothing issued yet. Invoices, test reports and packing lists land here.')));
  }
  function pgPTerms() {
    var t = termsOf(S.account.email), set = t.netDays || t.discountPct || t.poRequired;
    return portalShell('<div class="ph"><div><h2>Terms & agreements</h2>'
      + '<div class="sub">Set by Clean Cell for ' + esc(S.account.company) + '.</div></div></div>'
      + panel('Trading terms', set
        ? '<div class="dl">'
          + '<div><div class="t">Payment terms</div><div class="v">' + (t.netDays ? 'Net ' + t.netDays : 'Due on order') + '</div></div>'
          + '<div><div class="t">Account discount</div><div class="v">' + (t.discountPct ? t.discountPct + '%' : 'None') + '</div></div>'
          + '<div><div class="t">Purchase order</div><div class="v">' + (t.poRequired ? 'Required' : 'Not required') + '</div></div>'
          + '</div>'
        : '<div class="empty">Clean Cell has not set account terms yet. Your orders are quoted at list.</div>')
      + panel('Agreements', '<table><tbody>'
        + '<tr><td>Supply agreement 2026</td><td class="mut">Signed ' + esc(day(nowISO())) + '</td>'
        + '<td class="n">' + tag('Active', 'ok') + '</td></tr>'
        + '<tr><td>Warranty terms — 10 year</td><td class="mut">Accepted</td><td class="n">' + tag('Active', 'ok') + '</td></tr>'
        + '</tbody></table>'));
  }
  function pgPDesign() {
    if (S.account.plan === 'designer') {
      return portalShell('<div class="ph"><div><h2>Design studio</h2>'
        + '<div class="sub">Site Map and Grid Atlas, on your account.</div></div>'
        + '<span class="sp"></span>' + tag('Subscribed', 'ok') + '</div>'
        + panel('Your projects', '<table><tbody>'
          + '<tr class="clk" data-go="d/studio"><td><b>' + esc(S.account.company || 'Site') + ' — BESS</b>'
          + '<div class="xs mut">' + esc(S.design ? (S.design.tkw + ' kW · ' + S.design.tkwh + ' kWh') : 'Not started') + '</div></td>'
          + '<td class="n"><button class="b sm p" data-go="d/studio">Open</button></td></tr>'
          + '</tbody></table>')
        + panel('What is included', '<table><tbody>'
          + [['Site Map', 'Draw the site, place equipment, export the plan set'],
             ['Grid Atlas', 'Interconnection and hosting capacity'],
             ['Projects', 'Keep them, share them, reopen them']].map(function (r) {
               return '<tr><td><b>' + esc(r[0]) + '</b></td><td class="mut">' + esc(r[1]) + '</td>'
                 + '<td class="n">' + tag('Included', 'ok') + '</td></tr>'; }).join('')
          + '</tbody></table>'));
    }
    return portalShell('<div class="ph"><div><h2>Design studio</h2>'
      + '<div class="sub">Design your own sites, on your own account.</div></div></div>'
      + '<div class="panel"><div class="bd" style="text-align:center;padding:38px 20px">'
      + '<div style="font-size:30px">🔒</div>'
      + '<h3 style="margin-top:10px">Site Map is part of the Designer plan</h3>'
      + '<p class="lead sm mut" style="margin:8px auto 0;max-width:52ch">Lay out your own sites, run the guided build, and export the '
      + 'plot plan, one-line, proposal and drawing set — without waiting for us.</p>'
      + '<button class="b p lg" data-modal="upgrade" style="margin-top:20px">See the Designer plan</button>'
      + '</div></div>'
      + panel('What you get', '<table><tbody>'
        + [['Site Map', 'Place cabinets on your own parcel, to scale, with setbacks and clearances'],
           ['Guided build', 'Target kW and hours in, a compliant layout out'],
           ['Exports', 'Plot plan, single-line, proposal, drawing set, estimate BOM'],
           ['Grid Atlas', 'Interconnection and hosting capacity by feeder']].map(function (r) {
             return '<tr><td><b>' + esc(r[0]) + '</b></td><td class="mut">' + esc(r[1]) + '</td></tr>'; }).join('')
        + '</tbody></table>'));
  }
  function pgPAccount() {
    var a = S.account;
    return portalShell(flash() + '<div class="ph"><div><h2>Account</h2>'
      + '<div class="sub">' + esc(a.company) + '</div></div></div>'
      + panel('Profile', '<div class="frow">'
        + '<label class="fld"><span>Name</span><input id="ac-name" value="' + esc(a.name) + '"></label>'
        + '<label class="fld"><span>Company</span><input id="ac-co" value="' + esc(a.company) + '"></label></div>'
        + '<div class="frow"><label class="fld"><span>Email</span><input value="' + esc(a.email) + '" disabled></label>'
        + '<label class="fld"><span>Phone</span><input id="ac-ph" value="' + esc(a.phone) + '"></label></div>'
        + '<button class="b sm p" id="ac-save">Save changes</button>'
        + '<p class="xs mut" style="margin-top:10px">Your email address cannot be edited here — it is what your orders are matched on.</p>')
      + panel('Plan', '<div class="dl"><div><div class="t">Current plan</div><div class="v">'
        + (a.plan === 'designer' ? 'Designer — $450/mo' : 'Free account') + '</div></div>'
        + '<div><div class="t">Tools</div><div class="v">' + (a.plan === 'designer' ? 'Site Map · Grid Atlas · Projects' : 'Orders and documents') + '</div></div></div>'
        + (a.plan === 'designer' ? '' : '<button class="b sm p" data-modal="upgrade" style="margin-top:14px">Upgrade</button>'))
      + panel('Users on this account', '<table><tbody>'
        + '<tr><td><b>' + esc(a.name) + '</b><div class="xs mut">' + esc(a.email) + '</div></td>'
        + '<td class="n">' + tag('Owner', 'br') + '</td></tr>'
        + (a.users || []).map(function (u) {
            return '<tr><td><b>' + esc(u.name) + '</b><div class="xs mut">' + esc(u.email) + '</div></td>'
              + '<td class="n">' + tag(u.role, '') + '</td></tr>'; }).join('')
        + '</tbody></table>', '<button class="b sm" id="ac-invite">Invite a colleague</button>'));
  }

  /* ══ DESIGN STUDIO ═════════════════════════════════════════════════════ */
  function pgStudio() {
    var d = S.design, c = d ? skuOf(d.sku) : null;
    var TOOLS = [
      { k: 'select', t: 'Select', ic: '⌖' }, { k: 'pan', t: 'Pan', ic: '✥' },
      { k: 'battery', t: 'Place storage', ic: '▮' }, { k: 'xfmr', t: 'Place transformer', ic: '▣' },
      { k: 'measure', t: 'Measure', ic: '↔' }
    ];
    var VIEWS = [['plan', 'Plot plan'], ['one', 'Single-line'], ['bom', 'Estimate BOM'],
                 ['prop', 'Proposal'], ['set', 'Drawing set']];
    var canvas;
    if (!d) {
      canvas = '<div class="empty" style="padding:60px 20px">Nothing placed yet. Set a target on the right and run the guided build.</div>';
    } else if (S.view === 'plan') {
      canvas = plotPlan(d) + '<div class="legend"><span><i style="background:var(--brand)"></i>Storage</span>'
        + '<span><i style="background:var(--accent)"></i>Transformer</span>'
        + '<span><i style="background:var(--ink3)"></i>Switchgear</span></div>';
    } else if (S.view === 'one') {
      canvas = oneLine(d);
    } else if (S.view === 'bom') {
      var bom = bomOf(d), tot = 0;
      canvas = '<div class="sheetdoc"><table><thead><tr><th>Part</th><th>Description</th>'
        + '<th class="n">Qty</th><th class="n">Extended</th></tr></thead><tbody>'
        + bom.map(function (b) { var ext = b.qty * b.unit; tot += ext;
            return '<tr><td class="mono">' + esc(b.part) + '</td><td>' + esc(b.desc) + '</td>'
              + '<td class="n">' + b.qty + '</td><td class="n">' + money(ext) + '</td></tr>'; }).join('')
        + '<tr><td colspan="3"><b>Electrical estimate</b></td><td class="n"><b>' + money(tot) + '</b></td></tr>'
        + '</tbody></table><p class="xs mut" style="margin-top:12px">An estimate to plan against, not a quotation.</p></div>';
    } else if (S.view === 'prop') {
      canvas = '<div class="sheetdoc"><h3>' + num(d.tkw) + ' kW / ' + num(d.tkwh) + ' kWh battery energy storage system</h3>'
        + '<p class="sm mut" style="margin:4px 0 16px">Prepared for ' + esc(S.account.company || 'the site') + ' · '
        + esc(d.address || '') + ' · ' + esc(day(nowISO())) + '</p><table><tbody>'
        + [['Storage', d.qty + ' × ' + c.name + ' (' + c.sub + ')'],
           ['Power conversion', num(d.tkw) + ' kW bidirectional, 480 V'],
           ['Interconnection', 'Pad-mount transformer to 12.47 kV, 15 kV switchgear'],
           ['Scope', 'Supply, delivery, commissioning, 2-year workmanship'],
           ['Excluded', 'Utility study fees, permits, site civil beyond the pad'],
           ['Lead time', '12 weeks from confirmed order']].map(function (r) {
             return '<tr><td class="mut" style="width:34%">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('')
        + '</tbody></table></div>';
    } else {
      canvas = '<div class="sheetdoc"><h3>Drawing set</h3>'
        + '<p class="sm mut" style="margin:4px 0 16px">Issued for review · ' + esc(day(nowISO())) + '</p>'
        + '<table><thead><tr><th>Sheet</th><th>Title</th><th class="n">Rev</th></tr></thead><tbody>'
        + ['G-001|Cover and sheet index', 'C-101|Site plan and setbacks', 'C-201|Pad and grounding grid',
           'E-201|Single-line diagram', 'E-301|AC schedules and conduit', 'E-401|Protection and relay settings',
           'M-101|Clearances and access'].map(function (r) {
             var p2 = r.split('|'); return '<tr><td class="mono">' + p2[0] + '</td><td>' + esc(p2[1]) + '</td>'
               + '<td class="n mut">A</td></tr>'; }).join('')
        + '</tbody></table></div>';
    }
    return '<div style="padding:18px 22px 46px">'
      + '<div class="ph" style="margin-bottom:14px">' + wordmark(' style="font-size:19px"')
      + '<span class="mut sm">Site Map</span></div>'
      + '<div class="ph"><div><h2>' + esc(S.account.company || 'Site') + ' — BESS</h2>'
      + '<div class="sub">Site Map · design mode · autosaved ' + hhmm() + '</div></div>'
      + '<span class="sp"></span><button class="b sm" data-go="p/design">Close project</button></div>'
      + '<div class="studio"><div class="tools">'
      + '<div class="grp">Draw</div>'
      + TOOLS.map(function (t) {
          return '<button type="button" data-tool="' + t.k + '" aria-current="' + (S.tool === t.k) + '">'
            + '<span class="ic">' + t.ic + '</span>' + esc(t.t) + '</button>'; }).join('')
      + '<div class="grp">Views</div>'
      + VIEWS.map(function (v) {
          return '<button type="button" data-view="' + v[0] + '" aria-current="' + (S.view === v[0]) + '">'
            + '<span class="ic">▤</span>' + esc(v[1]) + '</button>'; }).join('')
      + '<div class="grp">Not in this plan</div>'
      + '<button type="button" class="off" disabled><span class="ic">▦</span>Compute &amp; data centre</button>'
      + '<button type="button" class="off" disabled><span class="ic">⚡</span>EV charging</button>'
      + '</div>'
      + '<div class="cvs">' + canvas + '</div>'
      + '<div class="props">'
      + '<div class="grp">Guided build</div>'
      + '<label class="fld"><span>Target kW</span><input id="d-kw" type="number" value="' + (d ? d.kw : 1000) + '"></label>'
      + '<label class="fld"><span>Hours</span><input id="d-h" type="number" step="0.5" value="' + (d ? d.h : 2) + '"></label>'
      + '<button class="b sm p" id="d-build" style="width:100%">Place them</button>'
      + (d ? '<div class="grp">System</div>'
        + '<div class="pr"><span class="mut">Units</span><b>' + d.qty + ' × ' + esc(c.sku) + '</b></div>'
        + '<div class="pr"><span class="mut">Power</span><b>' + num(d.tkw) + ' kW</b></div>'
        + '<div class="pr"><span class="mut">Energy</span><b>' + num(d.tkwh) + ' kWh</b></div>'
        + '<div class="pr"><span class="mut">Duration</span><b>' + (Math.round((d.tkwh / d.tkw) * 10) / 10) + ' h</b></div>'
        + '<div class="pr"><span class="mut">Yard</span><b>' + num(Math.round(d.qty * c.w * c.d)) + ' sq ft</b></div>'
        + '<div class="grp">Do something with it</div>'
        + '<button class="b sm" id="d-push" style="width:100%;margin-bottom:7px">Push BOM to marketplace</button>'
        + '<button class="b sm p" id="d-order" style="width:100%">Order this from Clean Cell</button>'
        + (d.pushed ? '<p class="xs mut" style="margin-top:9px">Pushed. Vendors see the requirement, never who you are, until you accept a quote.</p>' : '')
        : '')
      + '</div></div></div>';
  }

  /* ══ CLEAN CELL ADMIN ══════════════════════════════════════════════════ */
  function customers() {
    var by = {};
    S.orders.forEach(function (o) {
      var e = o.customer.email;
      if (!by[e]) by[e] = { email: e, name: o.customer.name, company: o.customer.company, orders: [] };
      by[e].orders.push(o);
    });
    if (S.account.created && !by[S.account.email]) {
      by[S.account.email] = { email: S.account.email, name: S.account.name, company: S.account.company, orders: [] };
    }
    var out = []; for (var k in by) out.push(by[k]);
    return out;
  }
  function pgAOrders() {
    var rows = S.orders.map(function (o) {
      return '<tr class="clk" data-go="a/order/' + o.orderNo + '">'
        + '<td class="mono">' + esc(o.orderNo) + '</td>'
        + '<td><b>' + esc(o.customer.company) + '</b><div class="xs mut">' + esc(o.originLabel) + '</div></td>'
        + '<td>' + esc(o.items[0].qty) + ' × ' + esc(o.items[0].name) + '</td>'
        + '<td class="n">' + money(o.tenantPricing.total) + '</td>'
        + '<td>' + statusTag(o) + '</td>'
        + '<td class="n">' + (o.status === 'new' ? '<button class="b sm p" data-act="confirm" data-no="' + o.orderNo + '">Accept</button>' : '') + '</td></tr>';
    });
    var nw = S.orders.filter(function (o) { return o.status === 'new'; }).length;
    return adminShell(flash()
      + '<div class="ph"><div><h2>Orders</h2><div class="sub">Your storefront and anything ClearSky sends over.</div></div></div>'
      + tiles([['Open orders', S.orders.filter(function (o) { return o.status !== 'shipped'; }).length],
               ['Awaiting acceptance', nw], ['On the floor', Object.keys(S.units).length],
               ['Shipped', S.orders.filter(function (o) { return o.status === 'shipped'; }).length]])
      + panel('', tbl([{ t: 'Order' }, { t: 'Customer' }, { t: 'System' }, { t: 'Value', n: true },
          { t: 'Status' }, { t: '', n: true }], rows, 'No orders yet.')));
  }
  function pgAOrder() {
    var o = find(part(2)); if (!o) return pgAOrders();
    var u = unitsOf(o.orderNo), ready = allReady(o.orderNo);
    var acts = '';
    if (o.status === 'new') acts += '<button class="b sm p" data-act="confirm" data-no="' + o.orderNo + '">Accept into production</button> ';
    if (!o.deposit && o.status !== 'new') acts += '<button class="b sm" data-act="deposit" data-no="' + o.orderNo + '">Record deposit</button> ';
    if (o.deposit && !u.length) acts += '<button class="b sm p" data-act="release" data-no="' + o.orderNo + '">Release to the floor</button> ';
    if (ready && o.status !== 'shipped') acts += '<button class="b sm p" data-act="ship" data-no="' + o.orderNo + '">Mark complete &amp; ship</button> ';
    return adminShell(flash()
      + '<div class="ph"><button class="b g sm" data-go="a/orders" style="padding-left:0">← Orders</button></div>'
      + '<div class="ph"><div><h2 class="mono" style="font-size:21px">' + esc(o.orderNo) + '</h2>'
      + '<div class="sub">' + esc(o.customer.company) + ' · ' + esc(o.originLabel) + ' · ' + esc(day(o.createdAt)) + '</div></div>'
      + '<span class="sp"></span>' + statusTag(o) + '</div>'
      + (acts ? '<div class="panel"><div class="bd"><div class="brow">' + acts + '</div></div></div>' : '')
      + '<div class="two"><div>'
      + panel('Line items', '<table><tbody><tr><td><b>' + esc(o.items[0].qty) + ' ×</b> ' + esc(o.items[0].name)
          + '</td><td class="n">' + num(o.system.kwh) + ' kWh</td><td class="n">' + money(o.tenantPricing.total) + '</td></tr></tbody></table>')
      + panel('Production', u.length
          ? '<table><thead><tr><th>Serial</th><th>Station</th><th class="n">Status</th></tr></thead><tbody>'
            + u.map(function (x) {
                return '<tr><td class="mono">' + esc(x.serial) + '</td><td>'
                  + esc(x.at ? P.labelOf(P.DEFAULT_ROUTING, x.at) : 'not started') + '</td><td class="n">'
                  + (x.hold ? tag(x.ncr, 'bad') : tag(x.at === 'ready' ? 'ready' : 'moving', x.at === 'ready' ? 'ok' : '')) + '</td></tr>'; }).join('')
            + '</tbody></table>'
          : '<div class="empty">No works order yet. Record the deposit, then release it to the floor.</div>',
          u.length ? '<button class="b sm" data-go="a/production">Open the floor</button>' : '')
      + panel('Customer said', o.customer.notes
          ? '<p class="sm">' + esc(o.customer.notes) + '</p>'
          : '<div class="empty" style="padding:18px">Nothing from the customer on this order.</div>')
      + '</div><div>'
      + panel('Customer', '<div class="pr"><span class="mut">Company</span><b>' + esc(o.customer.company) + '</b></div>'
        + '<div class="pr"><span class="mut">Contact</span><b>' + esc(o.customer.name) + '</b></div>'
        + '<div class="pr"><span class="mut">Email</span><b class="mono" style="font-size:12px">' + esc(o.customer.email) + '</b></div>'
        + '<div class="pr" style="border:0"><span class="mut">Site</span><b>' + esc(o.customer.address.city || '') + '</b></div>',
        '<button class="b sm" data-go="a/customer/' + encodeURIComponent(o.customer.email) + '">Open account</button>')
      + panel('Commercials', '<div class="pr"><span class="mut">Your price</span><b>' + money(o.tenantPricing.total) + '</b></div>'
        + '<div class="pr"><span class="mut">Published to customer</span><b>' + (o.tenantPricing.publishedToCustomer ? 'Yes' : 'No') + '</b></div>'
        + '<div class="pr"><span class="mut">ClearSky to you</span><b>' + (o.pricing ? money(o.pricing.total) : 'awaiting') + '</b></div>'
        + '<div class="pr" style="border:0"><span class="mut">Deposit</span><b>' + (o.deposit ? 'Cleared' : 'Outstanding') + '</b></div>')
      + panel('History', '<table><tbody>' + o.history.map(function (x) {
          return '<tr><td class="mut" style="width:38%">' + esc(day(x.at)) + '</td><td>' + esc(x.what)
            + '<div class="xs mut">' + esc(x.by) + '</div></td></tr>'; }).join('') + '</tbody></table>')
      + '</div></div>');
  }
  function pgACustomers() {
    var rows = customers().map(function (c) {
      var plan = (S.account.email === c.email && S.account.plan === 'designer') ? 'Designer' : 'Free';
      return '<tr class="clk" data-go="a/customer/' + encodeURIComponent(c.email) + '">'
        + '<td><b>' + esc(c.company) + '</b><div class="xs mut">' + esc(c.name) + '</div></td>'
        + '<td class="mono" style="font-size:12px">' + esc(c.email) + '</td>'
        + '<td class="n">' + c.orders.length + '</td>'
        + '<td class="n">' + money(c.orders.reduce(function (a, o) { return a + o.tenantPricing.total; }, 0)) + '</td>'
        + '<td>' + tag(plan, plan === 'Designer' ? 'ok' : '') + '</td></tr>';
    });
    return adminShell('<div class="ph"><div><h2>Customers</h2>'
      + '<div class="sub">Accounts your customers opened themselves. You set their terms afterwards.</div></div></div>'
      + panel('', tbl([{ t: 'Account' }, { t: 'Email' }, { t: 'Orders', n: true }, { t: 'Value', n: true },
          { t: 'Plan' }], rows, 'No customer accounts yet.')));
  }
  function pgACustomer() {
    var email = decodeURIComponent(S.route.split('/').slice(2).join('/'));
    var c = null, all = customers();
    for (var i = 0; i < all.length; i++) if (all[i].email === email) c = all[i];
    if (!c) return pgACustomers();
    var mine = S.account.email === email, t = termsOf(email);
    var rows = c.orders.map(function (o) {
      return '<tr class="clk" data-go="a/order/' + o.orderNo + '"><td class="mono">' + esc(o.orderNo) + '</td>'
        + '<td>' + esc(o.items[0].qty) + ' × ' + esc(o.items[0].name) + '</td>'
        + '<td class="n">' + money(o.tenantPricing.total) + '</td><td>' + statusTag(o) + '</td></tr>';
    });
    return adminShell(flash()
      + '<div class="ph"><button class="b g sm" data-go="a/customers" style="padding-left:0">← Customers</button></div>'
      + '<div class="ph"><div><h2>' + esc(c.company) + '</h2><div class="sub">' + esc(c.name) + ' · ' + esc(c.email) + '</div></div>'
      + '<span class="sp"></span>' + tag(mine && S.account.plan === 'designer' ? 'Designer plan' : 'Free account',
          mine && S.account.plan === 'designer' ? 'ok' : '') + '</div>'
      + tiles([['Orders', c.orders.length],
               ['Lifetime value', money(c.orders.reduce(function (a, o) { return a + o.tenantPricing.total; }, 0)), true],
               ['On the floor', c.orders.reduce(function (a, o) { return a + unitsOf(o.orderNo).length; }, 0)]])
      + '<div class="two"><div>'
      + panel('Order history', tbl([{ t: 'Order' }, { t: 'System' }, { t: 'Value', n: true }, { t: 'Status' }], rows, 'No orders.'))
      + panel('Users on this account', '<table><tbody>'
        + '<tr><td><b>' + esc(c.name) + '</b><div class="xs mut">' + esc(c.email) + '</div></td>'
        + '<td class="n">' + tag('Owner', 'br') + '</td></tr>'
        + (mine ? (S.account.users || []).map(function (u) {
            return '<tr><td><b>' + esc(u.name) + '</b><div class="xs mut">' + esc(u.email) + '</div></td>'
              + '<td class="n">' + tag(u.role, '') + '</td></tr>'; }).join('') : '')
        + '</tbody></table>')
      + '</div><div>'
      + panel('Trading terms', ('<div class="frow"><label class="fld"><span>Net days</span><input id="t-net" type="number" value="' + (t.netDays || '') + '"></label>'
            + '<label class="fld"><span>Discount %</span><input id="t-disc" type="number" value="' + (t.discountPct || '') + '"></label></div>'
            + '<label class="chk" style="margin-bottom:14px"><input type="checkbox" id="t-po"' + (t.poRequired ? ' checked' : '') + '> Purchase order required</label>'
            + (mine ? '<label class="fld"><span>Plan</span><select id="t-plan">'
                + '<option value="free"' + (S.account.plan === 'free' ? ' selected' : '') + '>Free account</option>'
                + '<option value="designer"' + (S.account.plan === 'designer' ? ' selected' : '') + '>Designer — $450/mo</option></select></label>' : '')
            + '<input type="hidden" id="t-email" value="' + esc(email) + '">'
            + '<button class="b sm p" id="t-save">Save</button>'
            + '<p class="xs mut" style="margin-top:10px">Terms are an overlay on an account the customer already made. Saving here shows on their portal immediately.</p>'))
      + panel('Agreements', '<table><tbody>'
        + '<tr><td>Supply agreement 2026</td><td class="n">' + tag('Signed', 'ok') + '</td></tr>'
        + '<tr><td>Warranty terms</td><td class="n">' + tag('Accepted', 'ok') + '</td></tr></tbody></table>')
      + '</div></div>');
  }
  function boardHtml(list) {
    var routing = P.DEFAULT_ROUTING;
    return '<div class="board">' + routing.map(function (s) {
      var here = list.filter(function (u) { return u.at === s.key; });
      return '<div class="bcol"><div class="ch">' + esc(s.label) + '</div>'
        + here.map(function (u) { return '<div class="chip' + (u.hold ? ' hold' : '') + '">'
            + esc(u.serial.split('-').pop()) + '</div>'; }).join('') + '</div>'; }).join('') + '</div>';
  }
  function pgAProduction() {
    var all = []; for (var k in S.units) all.push(S.units[k]);
    var held = all.filter(function (u) { return u.hold; });
    var wo = S.orders.filter(function (o) { return unitsOf(o.orderNo).length; });
    return adminShell('<div class="ph"><div><h2>Works orders</h2>'
      + '<div class="sub">Everything Clean Cell has on the floor right now.</div></div>'
      + '<span class="sp"></span><button class="b sm" data-go="b/scan">Open bench tablet</button></div>'
      + tiles([['Units', all.length], ['Ready to ship', all.filter(function (u) { return u.at === 'ready'; }).length],
               ['On hold', held.length], ['Works orders', wo.length]])
      + panel('The floor', all.length ? boardHtml(all) : '<div class="empty">Nothing released yet.</div>',
          all.length ? '<button class="b sm" id="a-run">Advance the bay</button>' : '')
      + (wo.length ? wo.map(function (o) {
          return panel(o.orderNo + ' · ' + o.customer.company,
            '<table><tbody>' + unitsOf(o.orderNo).map(function (u) {
              return '<tr><td class="mono">' + esc(u.serial) + '</td><td>'
                + esc(u.at ? P.labelOf(P.DEFAULT_ROUTING, u.at) : 'not started') + '</td>'
                + '<td class="n">' + (u.hold ? tag(u.ncr, 'bad') : '') + '</td></tr>'; }).join('')
            + '</tbody></table>',
            '<button class="b sm" data-go="a/order/' + o.orderNo + '">Open order</button>'); }).join('') : ''));
  }

  /* ══ BENCH TABLET ══════════════════════════════════════════════════════ */
  function pgBench() {
    var routing = P.DEFAULT_ROUTING, o = benchOrder();
    var all = o ? unitsOf(o.orderNo) : [];
    var v = S.lastScan;
    var vcls = !v ? '' : (v.ok ? (v.action === 'duplicate' ? 'dup' : 'ok') : 'bad');
    var mark = !v ? '·' : (v.ok ? (v.action === 'duplicate' ? '=' : '✓') : '✕');
    return '<div class="kiosk">'
      + '<div class="kh">' + wordmark(' style="font-size:19px"')
      + '<span class="bay">Bay 2 · bench tablet</span>'
      + tag(navigator.onLine === false ? 'Offline — queued' : 'Online', navigator.onLine === false ? 'warn' : 'ok')
      + '<span class="sp"></span><span class="mut sm">' + esc(o ? o.orderNo + ' · ' + o.customer.company : 'no works order') + '</span></div>'
      + '<div class="station"><b>This bench is</b>'
      + '<select id="b-station">' + routing.map(function (s) {
          return '<option value="' + s.key + '"' + (S.bench === s.key ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('')
      + '</select><span class="mut sm">Paired to this tablet. A scan cannot say which station it came from.</span></div>'
      + '<div class="scanbox"><input id="b-input" placeholder="Scan a unit label…" autocomplete="off">'
      + '<button class="b p" id="b-scan">Scan</button></div>'
      + '<div class="verdict ' + vcls + '"><span class="mk">' + mark + '</span><div>'
      + '<div class="msg">' + esc(v ? v.say : 'Ready. Pull the trigger on a unit.') + '</div>'
      + '<div class="sn">' + esc(v ? v.serial + (v.reason ? '  ·  ' + v.reason : '') : 'The station comes off the paired record, never the scan.') + '</div>'
      + '</div></div>'
      + (all.length
        ? '<div class="guns">' + all.map(function (u) {
            return '<button class="gun' + (u.hold ? ' hold' : '') + '" data-serial="' + esc(u.serial) + '">'
              + '<b>' + esc(u.serial) + '</b><small>' + (u.hold ? 'ON HOLD · ' + esc(u.ncr)
                : (u.at ? esc(P.labelOf(routing, u.at)) : 'not started')) + '</small></button>'; }).join('') + '</div>'
          + '<div class="brow" style="margin-bottom:18px"><button class="b sm" id="b-hold">Fail one at QA</button>'
          + '<button class="b sm" id="b-clear">Close the NCR</button>'
          + '<button class="b sm" id="b-run">Advance the bay</button></div>'
          + boardHtml(all)
        : '<div class="empty">No works order on this bench. Clean Cell releases one from the order desk.</div>')
      + '</div>';
  }

  /* ══ CLEARSKY CONSOLE ══════════════════════════════════════════════════ */
  function pgOOrders() {
    var rows = S.orders.map(function (o) {
      return '<tr class="clk" data-go="o/order/' + o.orderNo + '">'
        + '<td class="mono">' + esc(o.orderNo) + '</td>'
        + '<td>cleancell.us</td>'
        + '<td>' + esc(o.customer.company) + '</td>'
        + '<td class="n">' + money(o.cost) + '</td>'
        + '<td class="n">' + (o.pricing ? money(o.pricing.total) : '<span class="mut">unpriced</span>') + '</td>'
        + '<td>' + statusTag(o) + '</td></tr>';
    });
    return omegaShell(flash() + '<div class="ph"><div><h2>Orders</h2>'
      + '<div class="sub">Every tenant, one queue. Cost and margin are visible here and nowhere else.</div></div>'
      + '<span class="sp"></span><button class="b sm p" data-modal="newcs">Take an order</button></div>'
      + tiles([['Orders', S.orders.length],
               ['Unpriced', S.orders.filter(function (o) { return !o.pricing; }).length],
               ['Cost committed', money(S.orders.reduce(function (a, o) { return a + o.cost; }, 0)), true],
               ['Units on floors', Object.keys(S.units).length]])
      + panel('', tbl([{ t: 'Order' }, { t: 'Tenant' }, { t: 'End customer' }, { t: 'Our cost', n: true },
          { t: 'Priced at', n: true }, { t: 'Status' }], rows, 'No orders in the estate.')));
  }
  function pgOOrder() {
    var o = find(part(2)); if (!o) return pgOOrders();
    var u = unitsOf(o.orderNo), ready = allReady(o.orderNo);
    var acts = '';
    if (!o.pricing) acts += '<button class="b sm p" data-act="price" data-no="' + o.orderNo + '">Price it</button> ';
    if (o.pricing && !o.tenantPricing.publishedToCustomer) acts += '<button class="b sm p" data-act="publish" data-no="' + o.orderNo + '">Publish to the customer</button> ';
    if (o.pricing && !o.deposit) acts += '<button class="b sm" data-act="deposit" data-no="' + o.orderNo + '">Deposit cleared</button> ';
    if (o.deposit && !u.length) acts += '<button class="b sm p" data-act="release" data-no="' + o.orderNo + '">Push to the plant</button> ';
    if (ready && o.status !== 'shipped') acts += '<button class="b sm" data-act="ship" data-no="' + o.orderNo + '">Mark shipped</button> ';
    if (o.status === 'shipped' && !o.paid) acts += '<button class="b sm p" data-act="paid" data-no="' + o.orderNo + '">Balance received</button> ';
    var p = projected(o);
    return omegaShell(flash()
      + '<div class="ph"><button class="b g sm" data-go="o/orders" style="padding-left:0">← Orders</button></div>'
      + '<div class="ph"><div><h2 class="mono" style="font-size:21px">' + esc(o.orderNo) + '</h2>'
      + '<div class="sub">cleancell.us · ' + esc(o.customer.company) + ' · ' + esc(o.originLabel) + '</div></div>'
      + '<span class="sp"></span>' + statusTag(o) + (o.paid ? ' ' + tag('paid', 'ok') : '') + '</div>'
      + (acts ? '<div class="panel"><div class="bd"><div class="brow">' + acts + '</div></div></div>' : '')
      + '<div class="two"><div>'
      + panel('Pricing — ClearSky only', '<div class="pr"><span class="mut">Our cost</span><b>' + money(o.cost) + '</b></div>'
        + '<div class="pr"><span class="mut">Margin</span><b>' + Math.round(o.margin * 100) + '%</b></div>'
        + '<div class="pr"><span class="mut">Priced to Clean Cell</span><b>' + (o.pricing ? money(o.pricing.total) : '—') + '</b></div>'
        + '<div class="pr"><span class="mut">Clean Cell sells at</span><b>' + money(o.tenantPricing.total) + '</b></div>'
        + '<div class="pr" style="border:0"><span class="mut">Customer can see it</span><b>'
        + (o.tenantPricing.publishedToCustomer ? 'Yes' : 'No — priced is not published') + '</b></div>')
      + panel('On the floor', u.length ? boardHtml(u) : '<div class="empty">Not pushed to the plant yet.</div>',
          u.length ? '<button class="b sm" id="o-run">Advance the bay</button>' : '')
      + panel('Internal record', '<table><tbody>'
        + [['fulfilledBy', o.fulfilledBy], ['source', o.source], ['placedBy', o.placedBy || '—'],
           ['provenance.via', o.provenance.via], ['history entries', String(o.history.length)]].map(function (r) {
             return '<tr><td class="mut">' + esc(r[0]) + '</td><td class="mono" style="font-size:12px">'
               + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table>')
      + '</div><div>'
      + panel('What the customer sees', '<div id="cust-ms" style="text-align:center;padding:6px 0 10px">'
        + msTag(p.milestone) + '</div><p class="sm" style="text-align:center">' + esc(p.milestone.say) + '</p>'
        + '<div class="pr" style="margin-top:14px"><span class="mut">Price</span><b>'
        + (p.price ? money(p.price.total) : 'Pending') + '</b></div>'
        + '<div class="pr" style="border:0"><span class="mut">Sold by</span><b>' + esc(p.soldBy) + '</b></div>',
        '<button class="b sm" data-leak="' + o.orderNo + '">Run the leak test</button>')
      + (S.leakOut ? panel('Leak test', '<pre style="font:400 11.5px/1.5 var(--m);white-space:pre-wrap;'
          + 'word-break:break-word;margin:0;color:var(--ink2)">' + esc(S.leakOut) + '</pre>') : '')
      + '</div></div>');
  }
  function pgOTenants() {
    var rows = ['<tr class="clk" data-go="o/tenant/cleancell.us">'
      + '<td><b>Clean Cell USA</b><div class="xs mut">cleancell.us</div></td>'
      + '<td>OEM &amp; technology channel</td>'
      + '<td class="n">' + customers().length + '</td>'
      + '<td class="n">' + S.orders.length + '</td>'
      + '<td>' + tag('active', 'ok') + '</td></tr>'];
    return omegaShell('<div class="ph"><div><h2>Tenants</h2>'
      + '<div class="sub">Every white-label account on the platform.</div></div></div>'
      + panel('', tbl([{ t: 'Tenant' }, { t: 'Vertical' }, { t: 'Customers', n: true },
          { t: 'Orders', n: true }, { t: 'Status' }], rows)));
  }
  function systems() {
    var units = 0, held = 0;
    for (var k in S.units) { units++; if (S.units[k].hold) held++; }
    var nw = S.orders.filter(function (o) { return o.status === 'new'; }).length;
    return [
      ['Storefront embed', 'ok', plural(S.orders.length, 'order') + ' today of a 60 cap.', 'embed/storefront.html'],
      ['Order desk', nw ? 'warn' : 'ok', nw ? plural(nw, 'order') + ' waiting to be accepted.' : 'Nothing waiting.', 'api/orders.js'],
      ['Plant floor', held ? 'warn' : (units ? 'ok' : 'off'),
        held ? plural(held, 'unit') + ' on hold.' : (units ? plural(units, 'unit') + ' across 10 benches.' : 'No units released yet.'), 'api/mes-scan.js'],
      ['Buyer portal', S.account.created ? 'ok' : 'off',
        S.account.created ? plural(customers().length, 'customer account') + ', 1 signed-in user.' : 'No accounts yet.', 'api/my-orders.js'],
      ['Designer', S.account.plan === 'designer' ? 'ok' : 'off',
        S.account.plan === 'designer' ? '1 account on the designer.' : 'Nobody is subscribed yet.', 'omega-editor-mode.js'],
      ['Payments', 'off', 'QuickBooks is not connected here. In the product the deposit is an installment invoice and the works order is raised when it reconciles.', 'api/_lib/logic-workflow.js']
    ];
  }
  function sysRows() {
    return systems().map(function (s) {
      var k = s[1] === 'ok' ? 'ok' : s[1] === 'warn' ? 'warn' : '';
      return '<tr><td><b>' + esc(s[0]) + '</b><div class="xs mut">' + esc(s[3]) + '</div></td>'
        + '<td>' + tag(s[1], k) + '</td><td class="mut">' + esc(s[2]) + '</td></tr>';
    });
  }
  function pgOTenant() {
    var units = 0; for (var k in S.units) units++;
    return omegaShell('<div class="ph"><button class="b g sm" data-go="o/tenants" style="padding-left:0">← Tenants</button></div>'
      + '<div class="ph"><div><h2>Clean Cell USA</h2><div class="sub">cleancell.us · OEM &amp; technology channel</div></div>'
      + '<span class="sp"></span>' + tag('active', 'ok') + '</div>'
      + tiles([['Customers', customers().length], ['Orders', S.orders.length],
               ['Units on the floor', units],
               ['Storefront', 'live', true]])
      + '<div class="two"><div>'
      + panel('Systems', '<table><tbody>' + sysRows().join('') + '</tbody></table>')
      + panel('Customer accounts', '<table><tbody>' + customers().map(function (c) {
          return '<tr><td><b>' + esc(c.company) + '</b><div class="xs mut">' + esc(c.email) + '</div></td>'
            + '<td class="n">' + plural(c.orders.length, 'order') + '</td></tr>'; }).join('')
        + '</tbody></table>')
      + '</div><div>'
      + panel('White label', '<div class="pr"><span class="mut">Platform name</span><b>Clean Cell Power</b></div>'
        + '<div class="pr"><span class="mut">Attribution</span><b>removed by contract</b></div>'
        + '<div class="pr"><span class="mut">Domains</span><b>cleancell.us + 3</b></div>'
        + '<div class="pr" style="border:0"><span class="mut">Embed key</span><b class="mono" style="font-size:12px">omega_pk_a91f22c8</b></div>')
      + panel('Plan', '<div class="pr"><span class="mut">Tier</span><b>Channel</b></div>'
        + '<div class="pr"><span class="mut">Tool access</span><b>editor, gridatlas</b></div>'
        + '<div class="pr" style="border:0"><span class="mut">Editor mode</span><b>bess-lite</b></div>')
      + '</div></div>');
  }
  function pgOSystems() {
    return omegaShell('<div class="ph"><div><h2>Systems</h2>'
      + '<div class="sub">A state and a sentence for every surface. Served as JSON too, so an agent reads the same words.</div></div></div>'
      + panel('cleancell.us', '<table><tbody>' + sysRows().join('') + '</tbody></table>')
      + panel('Recent activity', '<table><tbody>' + (S.log.length ? S.log.slice(0, 14).map(function (l) {
          return '<tr><td class="mut mono" style="width:60px;font-size:12px">' + hhmm(l.at) + '</td>'
            + '<td style="width:96px"><b class="xs">' + esc(l.who) + '</b></td><td>' + esc(l.what) + '</td></tr>'; }).join('')
        : '<tr><td class="mut">Nothing yet.</td></tr>') + '</tbody></table>'));
  }

  /* ══ MODALS ════════════════════════════════════════════════════════════ */
  function modalHtml() {
    var m = S.modal; if (!m) return '';
    var body = '';
    if (m === 'signin') {
      body = '<h3>Sign in to Clean Cell</h3>'
        + '<p class="sm mut" style="margin-top:6px">We will email you a link. No password to forget.</p>'
        + '<label class="fld" style="margin-top:16px"><span>Work email</span>'
        + '<input id="m-em" type="email" value="' + esc(S.account.email || 'ops@riverside.example') + '"></label>'
        + '<button class="b p" id="m-signin" style="width:100%">Email me a sign-in link</button>'
        + '<div class="or">or</div>'
        + '<button class="b" id="m-google" style="width:100%">Continue with Google</button>'
        + '<p class="xs mut" style="margin-top:14px">No account? Signing in creates one and pulls in any order you have already placed with this address.</p>';
    } else if (m === 'signup') {
      body = '<h3>Create your account</h3>'
        + '<p class="sm mut" style="margin-top:6px">So you can watch this order and reorder without typing it all again.</p>'
        + '<div class="frow" style="margin-top:16px">'
        + '<label class="fld"><span>Your name</span><input id="m-name" value="' + esc(S.account.name || 'Dana Ruiz') + '"></label>'
        + '<label class="fld"><span>Company</span><input id="m-co" value="' + esc(S.account.company || 'Riverside Cold Chain') + '"></label></div>'
        + '<label class="fld"><span>Work email</span><input id="m-em" type="email" value="' + esc(S.account.email || 'ops@riverside.example') + '"></label>'
        + '<label class="fld"><span>Phone</span><input id="m-ph" value="' + esc(S.account.phone || '312 555 0110') + '"></label>'
        + '<button class="b p" id="m-signup" style="width:100%">Create account</button>'
        + '<p class="xs mut" style="margin-top:14px">Clean Cell can set your trading terms afterwards. You do not wait for them to set you up.</p>';
    } else if (m === 'upgrade') {
      body = '<h3>Choose a plan</h3>'
        + '<div class="plans">'
        + '<div class="plan' + (S.account.plan === 'free' ? ' on' : '') + '"><div class="pn">Free</div><div class="pp">$0</div>'
        + '<ul><li>Order and track</li><li>Documents and terms</li><li>Reorder from history</li></ul></div>'
        + '<div class="plan' + (S.account.plan === 'designer' ? ' on' : '') + '"><div class="pn">Designer</div><div class="pp">$450<span class="sm mut">/mo</span></div>'
        + '<ul><li>Site Map</li><li>Grid Atlas</li><li>Projects</li><li>All exports</li></ul></div>'
        + '</div>'
        + '<button class="b p" id="m-upgrade" style="width:100%">Subscribe to Designer</button>'
        + '<p class="xs mut" style="margin-top:12px">Billed to Clean Cell. Cancel any time; your projects stay.</p>';
    } else if (m === 'newcs') {
      body = '<h3>Take an order</h3>'
        + '<p class="sm mut" style="margin-top:6px">A client came to ClearSky directly. Same record, same queue, different door.</p>'
        + '<div class="frow" style="margin-top:16px">'
        + '<label class="fld"><span>Client</span><input id="m-co" value="Halsted Logistics"></label>'
        + '<label class="fld"><span>Contact</span><input id="m-name" value="Priya Nair"></label></div>'
        + '<div class="frow"><label class="fld"><span>Peak kW</span><input id="m-kw" type="number" value="1500"></label>'
        + '<label class="fld"><span>Hours</span><input id="m-h" type="number" step="0.5" value="2"></label></div>'
        + '<button class="b p" id="m-newcs" style="width:100%">Create the order</button>';
    }
    return '<div class="scrim" id="scrim"><div class="modal' + (m === 'upgrade' || m === 'newcs' ? ' wide' : '') + '" role="dialog" aria-modal="true">'
      + '<button class="x" id="m-close" aria-label="Close">✕</button>' + body + '</div></div>';
  }

  /* ══ HINT + NOTE ═══════════════════════════════════════════════════════ */
  function hintText() {
    var r = S.route, a = S.account, mine = myOrders();
    if (S.who === 'buyer') {
      if (r === 'home') return ['Start here.', 'Put your peak demand in the quick sizer, or hit <b>Size my system</b>.'];
      if (r === 'size' && !S.sized) return ['', 'Enter two numbers and press <b>Size it</b>.'];
      if (r === 'size') return ['', 'Now press <b>See it on my lot</b>.'];
      if (r === 'study' && !S.study) return ['', 'Press <b>Draw my site</b>.'];
      if (r === 'study') return ['', 'Press <b>Request this system</b>.'];
      if (r === 'checkout') return ['', 'Fill it in and press <b>Place the request</b>. No account needed yet.'];
      if (r.indexOf('thanks') === 0) return ['', a.signedIn ? 'Open <b>Track it in my account</b>.' : 'Now press <b>Create an account to track it</b>.'];
      if (r === 'p/orders' && mine.length) return ['', 'Click your order to see where it actually is.'];
      if (r === 'p/design' && a.plan !== 'designer') return ['', 'This is the second sale. Press <b>See the Designer plan</b>.'];
      if (r === 'p/design') return ['', 'Open the project to go into Site Map.'];
      if (r === 'd/studio' && !S.design) return ['', 'Set a target on the right and press <b>Place them</b>.'];
      if (r === 'd/studio') return ['', 'Try the views on the left, then <b>Order this from Clean Cell</b>.'];
      if (!a.signedIn) return ['', 'You are browsing cleancell.us as a stranger. Nothing here knows who you are.'];
      return ['', 'Your account: orders, documents, terms, and the designer.'];
    }
    if (S.who === 'cc') {
      var nw = S.orders.filter(function (o) { return o.status === 'new'; });
      if (!S.orders.length) return ['Nothing in the queue.', 'Switch to <b>Customer</b> and place an order, or to <b>ClearSky</b> and send one over.'];
      if (nw.length) return ['', 'Open the order marked <b>new</b> and accept it into production.'];
      var o = benchOrder();
      if (o && !o.deposit) return ['', 'Record the deposit on the open order.'];
      if (o && o.deposit && !unitsOf(o.orderNo).length) return ['', 'Press <b>Release to the floor</b> — that is what mints the serials.'];
      if (o && allReady(o.orderNo) && o.status !== 'shipped') return ['', 'Every unit is staged. <b>Mark complete &amp; ship</b>.'];
      return ['', 'Customers, terms and the plan are under <b>Customers</b>.'];
    }
    if (S.who === 'bench') {
      var bo = benchOrder();
      if (!bo || !unitsOf(bo.orderNo).length) return ['No works order.', 'Switch to <b>Clean Cell · office</b> and release an order to the floor.'];
      return ['', 'Try scanning at the <b>wrong</b> station first — then set the bench to Kitting and scan again.'];
    }
    var co = S.orders.filter(function (x) { return !x.pricing; })[0];
    if (!S.orders.length) return ['', 'Press <b>Take an order</b>, or let Dana place one on cleancell.us.'];
    if (co) return ['', 'Open ' + esc(co.orderNo) + ' and price it. Note the customer still sees nothing.'];
    return ['', 'Open an order and run the <b>leak test</b> on what the buyer receives.'];
  }
  var NOTES = {
    home: ['The public storefront', 'Served with no token at all. Its gate is a publishable key and an origin allowlist — accounting and hygiene, not a security boundary. What holds instead: nothing confidential is reachable, sizing runs server-side and returns a result rather than its inputs, and an order is a request a human confirms. <b>This page is a stand-in for <code>embed/storefront.html</code>; the fit it runs is the real shape.</b>'],
    size: ['Tightest fit, not the biggest box', 'Walking the catalogue largest-first took the first product where one unit covered the need, so a 1,200 kWh site got quoted a single 5 MWh container. This minimises overshoot at eight units or fewer.'],
    study: ['The one public call that costs money', 'It reaches a metered parcel service, so it is gated on a named lead, capped per tenant per day inside a transaction, and a cache hit never spends the allowance. The parcel owner’s name and APN are never echoed back. Footprints come from Clean Cell’s own product list — the same list the storefront prices from and the designer builds from.'],
    checkout: ['Status is pinned', 'The order is written with <code>status: \'new\'</code> and a browser cannot set any other value. That is what makes a public order desk safe.'],
    thanks: ['The email is the join', 'The account is created from a verified sign-in token, and orders already placed on that address are claimed onto it. <code>email_verified</code> is the whole security model for the portal.'],
    'p/orders': ['Rebuilt field by field', 'Firestore rules hide documents, not fields — and this document belongs to the <em>seller</em>, whose numbers are exactly what must not reach the buyer. So no read rule would work: <code>api/my-orders.js</code> projects key by key instead. <b>This list is the real <code>api/_lib/portal.js</code> deciding.</b>'],
    'p/order': ['The furthest-behind unit decides', 'Six public milestones, not seventeen internal statuses. An order of six where five are packed and one is at Electrical reads “In production”, and a unit on hold does not count as progressing. <code>quoted</code> is never shown: it means ClearSky priced it to the <em>seller</em>.'],
    'p/design': ['One field, no new gating code', 'Subscribing writes <code>billing/current.toolAccess = [\'editor\',\'gridatlas\']</code> — an allowlist that beats the tier, the add-ons and every override. Every endpoint checks it independently, so a tool that is not on the list refuses the call even if somebody finds the URL.'],
    'd/studio': ['A mode, not a second editor', '<code>editor.html</code> is 11 MB across 175,800 lines; a copy doubles the largest file in the repo and every fix has to be made twice. <code>editorMode: \'bess-lite\'</code> hides compute and the data-centre and EV categories and leaves solar in. It curates rather than deletes, so handlers travel with the nodes, and it fails open — an unknown mode gives you the full platform. <b>This screen is a stand-in for the editor; <code>omega-editor-mode.js</code> and its 39 tests are real.</b>'],
    'a/orders': ['One queue, two doors', 'An order lands here whether it came off Clean Cell’s own storefront or was sent over by ClearSky. Written only through <code>api/orders.js</code>: “only ClearSky may price, but the tenant may always cancel their own” is a commercial arrangement, not a rules file.'],
    'a/order': ['Serials exist only after money', 'Releasing to the floor is what allocates them, and it is gated on the deposit. Units and scans are <code>allow write: if false</code> — Admin SDK only — because if a browser could set a timestamp every guarantee in the scan engine evaporates.'],
    'a/customer': ['Terms are an overlay', 'The customer opened this account themselves and filled in their own details. Clean Cell sets net days, discount and the plan afterwards. Nobody has to be pre-loaded before they are allowed to buy.'],
    'b/scan': ['It refuses, and that is the product', 'A scan can only advance one station or be a duplicate. It can never skip, reverse, release a hold, close an NCR or mark anything shipped — so the worst a stolen scanner achieves is marking units present at one bench, in order. Two stations are machine-written by the test rig and refuse a human scan outright. <b>Every verdict on this screen is the real <code>api/_lib/plant.js</code>.</b>'],
    'o/order': ['Priced is not published', 'Pricing, scoring, eligibility and every financial model run in <code>/api/</code> and never in a browser. Until somebody publishes it the customer’s portal reads “Price pending”, so you can reprice as often as you like and nothing crosses. The leak test runs the committed projection over this record and shows you the output.'],
    'o/tenant': ['What the platform is called here', 'A <code>whiteLabel</code> block on the tenant record drives it, and it is staff-written: whether our name appears on a product we operate is a contract line item, not a tenant preference. Attribution defaults to showing, so removing it is always a decision somebody made.'],
    'o/systems': ['A state and a sentence', 'Served as JSON as well as rendered, so an agent can report on the estate without scraping a page. <code>off</code> is deliberately not <code>down</code>. Payments reads <code>off</code> because this demo has no QuickBooks company to reconcile against — in the product <code>api/_lib/logic-workflow.js</code> raises the works order the moment the deposit invoice reconciles. A status feed that invents a number is worse than one that admits a gap.']
  };
  var DEFAULT_NOTE = ['One world, five surfaces',
    'Everything on this screen shares one set of records with the other four. The two engines that decide anything '
    + '— <code>api/_lib/plant.js</code> for a scan and <code>api/_lib/portal.js</code> for what a buyer may see — are the '
    + 'committed files, read verbatim into this page. Only the database, sign-in, payments and two screens are stand-ins.'];
  function noteFor(r) {
    if (NOTES[r]) return NOTES[r];
    var two = r.split('/').slice(0, 2).join('/');
    return NOTES[two] || NOTES[r.split('/')[0]] || DEFAULT_NOTE;
  }


  /* ══ GUIDED TOUR ═══════════════════════════════════════════════════════
     One button that drives the whole system. Each step SETS the state it
     needs rather than depending on the step before it, so jumping back and
     forth cannot desynchronise the demo from its own narration. ══════════ */
  function tourOrder() {
    if (S.tourNo) { var f = find(S.tourNo); if (f) return f; }
    return S.orders.length ? S.orders[S.orders.length - 1] : null;
  }
  function sizeIt(kw, h) { S.sized = fit(kw, h); return S.sized; }

  var TOUR = [
    { who: 'buyer', lead: 'Their website',
      say: 'A customer lands on cleancell.us. Our name is on none of it \u2014 not the page, not the '
         + 'domain, not the email they will get.',
      run: function () { S = seed(); S.who = 'buyer'; S.route = 'home'; } },

    { who: 'buyer', lead: 'Two numbers',
      say: 'They type what their utility bill says. No account, no form, no sales call.',
      run: function () { sizeIt(900, 2); S.route = 'size'; } },

    { who: 'buyer', lead: 'The tightest fit',
      say: 'Five cabinets, not one oversized container \u2014 the sizer minimises overshoot against '
         + 'Clean Cell\u2019s own product list.',
      run: function () { sizeIt(900, 2); S.route = 'size'; } },

    { who: 'buyer', lead: 'On their own lot',
      say: 'Their parcel, drawn to scale, with the setback and the fire clearance. This is the one '
         + 'public call that costs money, so it is capped per day and a cache hit never spends it.',
      run: function () {
        var z = S.sized || sizeIt(900, 2);
        S.study = { address: '4400 W Ferdinand St, Chicago IL', sku: z.sku, qty: z.qty,
                    tkw: z.tkw, tkwh: z.tkwh, kw: z.kw, h: z.h };
        S.route = 'study';
      } },

    { who: 'buyer', lead: 'They order \u2014 with no account',
      say: 'A request, not a purchase. The order is written with its status pinned to new; a browser '
         + 'cannot set any other value.',
      run: function () { S.route = 'checkout'; } },

    { who: 'buyer', lead: 'Received',
      say: 'Placed as a stranger. Clean Cell will confirm it, and nobody has had to create an account '
         + 'to get this far.',
      run: function () {
        var o = tourOrder();
        if (!o) {
          var z = S.sized || sizeIt(900, 2);
          S.account.name = 'Dana Ruiz'; S.account.company = 'Riverside Cold Chain';
          S.account.email = 'ops@riverside.example'; S.account.phone = '312 555 0110';
          o = makeOrder({ sku: z.sku, qty: z.qty, channel: 'storefront',
            originLabel: 'from cleancell.us', via: 'api/embed-order create', by: 'storefront',
            customer: S.account });
          note('customer', 'Placed ' + o.orderNo);
          S.tourNo = o.orderNo;
        }
        S.route = 'thanks/' + o.orderNo;
      } },

    { who: 'buyer', lead: 'The account comes after',
      say: 'They sign in with the same work email \u2014 and the order they placed as a stranger is '
         + 'already in the account. A verified email is the whole join.',
      run: function () {
        S.account.created = true; S.account.signedIn = true;
        S.keepFlash = true; S.flash = '1 order already on this address was added to your account.';
        S.route = 'p/orders';
      } },

    { who: 'buyer', lead: 'What a buyer may see',
      say: 'Six public milestones, not the seventeen states the record actually carries. No price yet '
         + '\u2014 nobody has published one.',
      run: function () { var o = tourOrder(); S.route = o ? 'p/order/' + o.orderNo : 'p/orders'; } },

    { who: 'cc', lead: 'Clean Cell\u2019s desk',
      say: 'The same order, on their side. One queue \u2014 their own storefront and anything we send '
         + 'over land in the same place.',
      run: function () { S.route = 'a/orders'; } },

    { who: 'cc', lead: 'A person accepts it',
      say: 'Nothing downstream exists until somebody here says yes. No serials, no bench, no promised '
         + 'date.',
      run: function () {
        var o = tourOrder();
        if (o && o.status === 'new') {
          o.status = 'confirmed'; S.focusA2 = o.orderNo;
          o.history.push({ at: nowISO(), by: 'rob@cleancell.us', what: 'accepted into production' });
          note('cleancell', 'Accepted ' + o.orderNo);
        }
        S.route = o ? 'a/order/' + o.orderNo : 'a/orders';
      } },

    { who: 'omega', lead: 'Only we may price it',
      say: 'Our cost, our margin and our price to Clean Cell all live on the very record the customer '
         + 'can open. Keeping them off her screen is a projection, not a hidden page.',
      run: function () {
        var o = tourOrder();
        if (o && !o.pricing) {
          o.pricing = { total: Math.round(o.cost * 1.18), currency: 'USD',
            pricedBy: 'thomas@csebuilders.com', pricedAt: nowISO() };
          o.status = 'quoted'; note('clearsky', 'Priced ' + o.orderNo);
        }
        S.route = o ? 'o/order/' + o.orderNo : 'o/orders';
      } },

    { who: 'buyer', lead: 'Priced is not published',
      say: 'We have priced it. Her portal still reads \u201cPending\u201d. Reprice it as often as the '
         + 'deal needs \u2014 nothing crosses until somebody publishes.',
      run: function () { var o = tourOrder(); S.route = o ? 'p/order/' + o.orderNo : 'p/orders'; } },

    { who: 'omega', lead: 'Publish it',
      say: 'Clean Cell\u2019s price goes to their customer. Ours never does.',
      run: function () {
        var o = tourOrder();
        if (o) { o.tenantPricing.publishedToCustomer = true;
          note('clearsky', 'Published the price on ' + o.orderNo); }
        S.route = o ? 'o/order/' + o.orderNo : 'o/orders';
      } },

    { who: 'buyer', lead: 'Now there is a number',
      say: 'Her account, on their domain, showing their price. Two prices exist on one record; who is '
         + 'asking decides which one comes back.',
      run: function () { var o = tourOrder(); S.route = o ? 'p/order/' + o.orderNo : 'p/orders'; } },

    { who: 'cc', lead: 'Money, then serials',
      say: 'The deposit clears and the works order is raised. Serials are allocated here and nowhere '
         + 'else \u2014 nothing reaches a bench that nobody has been paid for.',
      run: function () {
        var o = tourOrder();
        if (o) {
          if (!o.deposit) {
            o.deposit = true; o.status = 'accepted';
            o.documents.push({ kind: 'invoice', name: 'Deposit invoice ' + o.orderNo,
              at: nowISO(), audience: 'customer' });
            o.documents.push({ kind: 'internal', name: 'Margin sheet (internal)',
              at: nowISO(), audience: 'internal' });
            note('finance', 'Deposit cleared on ' + o.orderNo);
          }
          release(o);
        }
        S.route = o ? 'a/order/' + o.orderNo : 'a/orders';
      } },

    { who: 'bench', lead: 'The floor',
      say: 'Five serialised cabinets, on a tablet paired to one bench. The station comes off that '
         + 'pairing, never off the scan.',
      run: function () { S.bench = 'kit'; S.lastScan = null; S.route = 'b/scan'; } },

    { who: 'bench', lead: 'It refuses',
      say: 'Scanned at Rack assembly before it has been kitted. The refusal is the product \u2014 the '
         + 'easy build would have recorded two stations this cabinet never visited.',
      run: function () {
        var o = tourOrder(), u = o ? unitsOf(o.orderNo) : [];
        S.bench = 'rack';
        if (u.length) doScan('https://plant.cleancell.us/u/' + u[0].serial);
        S.route = 'b/scan';
      } },

    { who: 'bench', lead: 'And then it accepts',
      say: 'Same cabinet, right bench. A scan can only advance one station or be a duplicate \u2014 it '
         + 'can never skip, reverse, or mark anything shipped.',
      run: function () {
        var o = tourOrder(), u = o ? unitsOf(o.orderNo) : [];
        S.bench = 'kit';
        if (u.length) doScan('https://plant.cleancell.us/u/' + u[0].serial);
        S.route = 'b/scan';
      } },

    { who: 'bench', lead: 'Down the line',
      say: 'The bay runs. Every one of these is the committed scan engine deciding, not a status '
         + 'somebody typed.',
      run: function () {
        var o = tourOrder();
        if (o) { for (var i = 0; i < 4; i++) runBay(o.orderNo); }
        S.bench = 'kit'; S.lastScan = null; S.route = 'b/scan';
      } },

    { who: 'bench', lead: 'One fails',
      say: 'Quality holds a cabinet against a non-conformance. Four carry on; one does not.',
      run: function () {
        var o = tourOrder(), a = o ? unitsOf(o.orderNo) : [];
        for (var i = 0; i < a.length; i++) if (!a[i].hold && a[i].at) {
          a[i].hold = 'Capacity below limit at end-of-line test'; a[i].ncr = 'NCR-26-89';
          note('quality', 'Held ' + a[i].serial + ' \u2014 NCR-26-89'); break;
        }
        S.route = 'b/scan';
      } },

    { who: 'buyer', lead: 'Her screen goes backwards',
      say: 'The furthest-behind unit decides, and a held one ranks below where it stands \u2014 so the '
         + 'order does not stall, it steps back a milestone. Nobody had to remember to tell her.',
      run: function () { var o = tourOrder(); S.route = o ? 'p/order/' + o.orderNo : 'p/orders'; } },

    { who: 'bench', lead: 'Cleared, and finished',
      say: 'Closing the non-conformance is a separate authority \u2014 a scanner cannot wave it '
         + 'through. Then the bay runs to Ready to ship.',
      run: function () {
        for (var k in S.units) if (S.units[k].hold) {
          S.units[k].hold = null; S.units[k].ncr = null;
          note('quality', 'Closed the NCR on ' + S.units[k].serial); break;
        }
        var o = tourOrder();
        if (o) { for (var i = 0; i < 12; i++) runBay(o.orderNo); }
        S.lastScan = null; S.route = 'b/scan';
      } },

    { who: 'cc', lead: 'A person ships it',
      say: 'The one thing a trigger pull cannot cause. Every cabinet has to be staged first, and then '
         + 'somebody with the authority decides.',
      run: function () {
        var o = tourOrder();
        if (o && allReady(o.orderNo) && o.status !== 'shipped') markComplete(o);
        S.route = o ? 'a/order/' + o.orderNo : 'a/orders';
      } },

    { who: 'buyer', lead: 'It already moved',
      say: 'Shipped, with the packing list on her account. Nobody typed a status into a portal \u2014 a '
         + 'technician pulled a trigger and a stranger\u2019s screen changed.',
      run: function () { var o = tourOrder(); S.route = o ? 'p/order/' + o.orderNo : 'p/orders'; } },

    { who: 'omega', lead: 'Prove it',
      say: 'The record holds our cost, our margin, our price and a staff audit trail. This searches '
         + 'what she actually received for every one of them.',
      run: function () {
        var o = tourOrder();
        if (o) leakTest(o);
        S.route = o ? 'o/order/' + o.orderNo : 'o/orders';
      } },

    { who: 'buyer', lead: 'The second sale',
      say: 'Selling a battery and selling the platform are two different sales. The storefront pitches '
         + 'the designer and never links into it.',
      run: function () { S.account.plan = 'free'; S.route = 'p/design'; } },

    { who: 'buyer', lead: 'One field unlocks it',
      say: 'Subscribing writes the list of tools this account may open \u2014 an allowlist that beats '
         + 'the plan, the add-ons and every override, checked independently by every endpoint.',
      run: function () {
        S.account.plan = 'designer';
        note('customer', 'Subscribed to the designer');
        S.route = 'p/design';
      } },

    { who: 'buyer', lead: 'A mode, not a second editor',
      say: 'Site Map in their colours, on their domain, cut down to storage. Compute and the '
         + 'data-centre tools are disabled rather than hidden, and solar stays.',
      run: function () {
        var z = fit(1000, 2);
        S.design = { sku: z.sku, qty: z.qty, kw: 1000, h: 2, tkw: z.tkw, tkwh: z.tkwh,
                     address: S.study ? S.study.address : '', pushed: false };
        S.view = 'plan'; S.route = 'd/studio';
      } },

    { who: 'buyer', lead: 'And it starts again',
      say: 'Plot plan, single-line, estimate BOM, proposal, drawing set \u2014 then the bill of '
         + 'materials is ordered straight out of the drawing, which re-enters this chain at step five.',
      run: function () { S.view = 'bom'; S.route = 'd/studio'; } },

    { who: 'omega', lead: 'One order, three companies',
      say: 'The customer saw one brand. The floor saw the same one. Every hand-off you just watched ran '
         + 'on one record, and nobody re-keyed anything into a second system.',
      run: function () { S.route = 'o/tenant/cleancell.us'; } }
  ];

  function tourGo(i) {
    var idx = Math.max(0, Math.min(i, TOUR.length - 1));
    var step = TOUR[idx];
    /* The first step calls seed(), which REPLACES S. Anything written to the
       old object before run() is thrown away with it, so the tour index and
       the persona are set afterwards, on whatever S the step left behind. */
    try { step.run(); } catch (e) {}
    S.tour = idx;
    S.who = step.who;
    save(); render();
  }
  function tourStop() { S.tour = null; save(); render(); }
  function paintTour() {
    var on = S.tour !== null && S.tour !== undefined;
    document.body.classList.toggle('tour', on);
    $('tourbar').hidden = !on;
    if (!on) return;
    var step = TOUR[S.tour];
    $('tb-n').textContent = (S.tour + 1) + ' / ' + TOUR.length;
    $('tb-who').textContent = step.lead;
    $('tb-say').textContent = step.say;
    $('tb-back').disabled = S.tour === 0;
    $('tb-next').textContent = S.tour === TOUR.length - 1 ? 'Finish' : 'Next \u2192';
    $('tb-rail').style.width = ((S.tour + 1) / TOUR.length * 100).toFixed(1) + '%';
  }

  /* ══ RENDER ════════════════════════════════════════════════════════════ */
  function page() {
    var r = S.route, a = r.split('/')[0];
    if (r === 'home') return pgHome();
    if (r === 'products') return pgProducts();
    if (a === 'product') return pgProduct();
    if (r === 'how') return pgHow();
    if (r === 'size') return pgSize();
    if (r === 'study') return pgStudy();
    if (r === 'checkout') return pgCheckout();
    if (a === 'thanks') return pgThanks();
    if (a === 'p') {
      if (!S.account.signedIn) { S.route = 'home'; return pgHome(); }
      var b = r.split('/')[1];
      if (b === 'order') return pgPOrder();
      if (b === 'documents') return pgPDocs();
      if (b === 'terms') return pgPTerms();
      if (b === 'design') return pgPDesign();
      if (b === 'account') return pgPAccount();
      return pgPOrders();
    }
    if (a === 'd') return pgStudio();
    if (a === 'a') {
      var c = r.split('/')[1];
      if (c === 'order') return pgAOrder();
      if (c === 'customers') return pgACustomers();
      if (c === 'customer') return pgACustomer();
      if (c === 'production') return pgAProduction();
      return pgAOrders();
    }
    if (a === 'b') return pgBench();
    if (a === 'o') {
      var d = r.split('/')[1];
      if (d === 'order') return pgOOrder();
      if (d === 'tenants') return pgOTenants();
      if (d === 'tenant') return pgOTenant();
      if (d === 'systems') return pgOSystems();
      return pgOOrders();
    }
    return pgHome();
  }
  function render() {
    document.documentElement.setAttribute('data-skin', skinOf(S.route));
    $('who').innerHTML = WHO.map(function (w) {
      return '<button type="button" data-who="' + w.key + '" aria-current="' + (w.key === S.who) + '" title="'
        + esc(w.sub) + '"><span class="lbl-long">' + esc(w.label) + '</span>'
        + '<span class="lbl-short">' + esc(w.short) + '</span></button>'; }).join('');
    $('rolenow').textContent = whoDef(S.who).sub;
    var u = URLS(S.route);
    $('urltext').innerHTML = '<span class="dom">' + esc(u[0]) + '</span>' + esc(u[1]);
    $('back').disabled = !S.hist.length;
    $('vp').innerHTML = page();
    $('overlay').innerHTML = modalHtml();
    var h = hintText();
    $('hint').innerHTML = (h[0] ? '<b>' + h[0] + '</b> ' : '') + h[1];
    var n = noteFor(S.route);
    $('note').hidden = !S.notes;
    if (n) $('note').innerHTML = '<span class="k">' + esc(n[0]) + '</span>' + n[1];
    $('tnote').setAttribute('aria-pressed', String(!!S.notes));
    paintTour();
    var f = $('b-input'); if (f) f.focus();
  }
  window.__demoRender = render;
  window.__demoState = function () { return S; };

  /* ══ WIRING — one delegated listener, so a re-render never loses it ════ */
  function val(id, dflt) { var e = $(id); return e ? e.value : (dflt || ''); }
  function placeOrder(from) {
    var z = S.sized || S.study || fit(900, 2);
    var cust = {
      name: val('c-name', S.account.name), company: val('c-co', S.account.company),
      email: String(val('c-em', S.account.email)).toLowerCase(), phone: val('c-ph', S.account.phone),
      address: { line1: val('c-addr', S.account.address.line1), city: S.account.address.city,
                 state: S.account.address.state, zip: S.account.address.zip }
    };
    /* Remember what they typed, so signing up afterwards lands on the same
       address — which is the join that claims this order. */
    S.account.name = cust.name; S.account.company = cust.company;
    S.account.email = cust.email; S.account.phone = cust.phone;
    var o = makeOrder({ sku: z.sku, qty: z.qty, channel: from, customer: cust,
      originLabel: from === 'designer' ? 'from the design studio' : 'from cleancell.us',
      via: from === 'designer' ? 'omega-storefront-handoff' : 'api/embed-order create',
      by: from === 'designer' ? 'designer' : 'storefront',
      placedBy: from === 'designer' ? cust.email : null });
    note('customer', 'Placed ' + o.orderNo + ' — ' + z.qty + ' × ' + z.name);
    save();
    return o;
  }
  function signUp(via) {
    var a = S.account;
    a.name = val('m-name', a.name) || 'Dana Ruiz';
    a.company = val('m-co', a.company) || 'Riverside Cold Chain';
    a.email = String(val('m-em', a.email) || 'ops@riverside.example').toLowerCase();
    a.phone = val('m-ph', a.phone);
    a.created = true; a.signedIn = true;
    var claimed = myOrders().length;
    note('customer', 'Signed in via ' + via + ' — ' + a.email + (claimed ? ' (' + plural(claimed, 'order') + ' claimed)' : ''));
    S.keepFlash = true; S.flash = claimed ? plural(claimed, 'order') + ' already on this address ' + (claimed === 1 ? 'was' : 'were') + ' added to your account.'
      : 'Account created.';
    S.modal = null; go('p/orders');
  }
  function leakTest(o) {
    var proj = JSON.stringify(projected(o), null, 1);
    var needles = ['clearsky', String(o.cost), 'margin', 'provenance', 'history',
                   'csebuilders.com', o.pricing ? String(o.pricing.total) : '\u0000none\u0000', 'placedBy'];
    var lines = needles.map(function (n) {
      return (proj.indexOf(n) >= 0 ? '  LEAKED  ' : '  absent  ') + n; }).join('\n');
    S.leakOut = 'The record holds: cost ' + money(o.cost) + ' · margin ' + o.margin
      + ' · fulfilledBy "' + o.fulfilledBy + '" · ' + o.history.length + ' audit entries'
      + (o.pricing ? ' · ClearSky price ' + money(o.pricing.total) : '')
      + '\n\nSearched what the buyer receives for each:\n' + lines
      + '\n\nWhat the buyer receives:\n' + proj;
    save();
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target, el = null;
    function up(attr) { var n = t; while (n && n !== document) { if (n.getAttribute && n.getAttribute(attr) != null) return n; n = n.parentNode; } return null; }
    /* A click can land on a label span inside a button, and then t.id is ''.
       Resolve to the nearest button that has an id before matching on it. */
    var host = t.closest ? t.closest('button[id]') : null;
    var bid = host ? host.id : t.id;

    if ((el = up('data-who'))) {
      S.who = el.getAttribute('data-who'); S.hist = []; S.modal = null; S.tour = null;
      S.route = homeOf(S.who); save(); render(); return;
    }
    if ((el = up('data-go'))) { go(el.getAttribute('data-go')); return; }
    if ((el = up('data-modal'))) { S.modal = el.getAttribute('data-modal'); save(); render(); return; }
    if (bid === 'scrim' || bid === 'm-close') { S.modal = null; save(); render(); return; }
    if (bid === 'burger') { S.navOpen = !S.navOpen; save(); render(); return; }
    if (bid === 'back') { if (S.hist.length) { S.route = S.hist.pop(); S.modal = null; save(); render(); } return; }
    if (bid === 'tnote') { S.notes = !S.notes; save(); render(); return; }
    if (bid === 'tour') { tourGo(0); return; }
    if (bid === 'tb-next') {
      if (S.tour >= TOUR.length - 1) { tourStop(); } else { tourGo(S.tour + 1); }
      return;
    }
    if (bid === 'tb-back') { tourGo(S.tour - 1); return; }
    if (bid === 'tb-exit') { tourStop(); return; }
    if (bid === 'reset') {
      if (!window.confirm('Clear every order, unit, account and drawing and start again?')) return;
      S = seed(); save(); render(); return;
    }

    /* ── public site ── */
    if (bid === 'h-size' || bid === 's-go') {
      var kw = Number(val(bid === 'h-size' ? 'h-kw' : 's-kw')) || 0;
      var hr = Number(val(bid === 'h-size' ? 'h-h' : 's-h')) || 1;
      S.sized = fit(kw, hr);
      note('visitor', 'Sized ' + kw + ' kW × ' + hr + ' h → ' + S.sized.qty + ' × ' + S.sized.name);
      save(); go('size'); return;
    }
    if ((el = up('data-size-sku'))) {
      var c = skuOf(el.getAttribute('data-size-sku'));
      S.sized = fit(c.kw * 4, Math.round((c.kwh / c.kw) * 10) / 10);
      save(); go('size'); return;
    }
    if (bid === 'st-go') {
      var z = S.sized || fit(900, 2);
      S.study = { address: val('st-addr'), sku: z.sku, qty: z.qty, tkw: z.tkw, tkwh: z.tkwh, kw: z.kw, h: z.h };
      note('visitor', 'Site study drawn for ' + S.study.address);
      save(); render(); return;
    }
    if (bid === 'c-place') { var o1 = placeOrder('storefront'); go('thanks/' + o1.orderNo); return; }

    /* ── account ── */
    if (bid === 'm-signin' || bid === 'm-google') { signUp(bid === 'm-google' ? 'Google' : 'email link'); return; }
    if (bid === 'm-signup') { signUp('email link'); return; }
    if (bid === 'signout') { S.account.signedIn = false; S.hist = []; go('home'); return; }
    if (bid === 'm-upgrade') {
      S.account.plan = 'designer';
      note('customer', 'Subscribed to the designer — toolAccess [editor, gridatlas]');
      S.keepFlash = true;
      S.flash = 'Designer plan active. Site Map and Grid Atlas are on your account.';
      S.modal = null; go('p/design'); return;
    }
    if (bid === 't-save') {
      var te = String(val('t-email')).toLowerCase();
      S.termsBy = S.termsBy || {};
      S.termsBy[te] = { netDays: Number(val('t-net')) || null,
                        discountPct: Number(val('t-disc')) || null,
                        poRequired: !!($('t-po') && $('t-po').checked) };
      if ($('t-plan')) S.account.plan = val('t-plan');
      note('cleancell', 'Updated terms for ' + te);
      S.flash = 'Terms saved. They are on the customer\u2019s portal now.';
      save(); render(); return;
    }
    if (bid === 'ac-save') {
      S.account.name = val('ac-name', S.account.name); S.account.company = val('ac-co', S.account.company);
      S.account.phone = val('ac-ph', S.account.phone); S.flash = 'Profile saved.'; save(); render(); return;
    }
    if (bid === 'ac-invite') {
      S.account.users = S.account.users || [];
      S.account.users.push({ name: 'Sam Okafor', email: 'sam@' + String(S.account.email).split('@')[1], role: 'member' });
      S.flash = 'Invitation sent.'; note('customer', 'Invited a colleague onto the account'); save(); render(); return;
    }
    if ((el = up('data-cancel'))) {
      var oc = find(el.getAttribute('data-cancel'));
      if (oc) { oc.cancelRequested = true; note('customer', 'Requested cancellation of ' + oc.orderNo);
        S.flash = 'Cancellation requested. Clean Cell holds the production slot, so they will confirm.'; }
      save(); render(); return;
    }
    if (up('data-doc')) { window.alert('In the product this downloads the PDF from Storage, gated on the same roster.'); return; }

    /* ── designer ── */
    if ((el = up('data-tool'))) { S.tool = el.getAttribute('data-tool'); save(); render(); return; }
    if ((el = up('data-view'))) { S.view = el.getAttribute('data-view'); save(); render(); return; }
    if (bid === 'd-build') {
      var dk = Number(val('d-kw')) || 0, dh = Number(val('d-h')) || 1, z2 = fit(dk, dh);
      S.design = { sku: z2.sku, qty: z2.qty, kw: dk, h: dh, tkw: z2.tkw, tkwh: z2.tkwh,
        address: S.study ? S.study.address : '', pushed: S.design ? S.design.pushed : false };
      S.view = 'plan';
      note('designer', 'Guided build placed ' + z2.qty + ' × ' + z2.name + ' — ' + z2.tkw + ' kW');
      save(); render(); return;
    }
    if (bid === 'd-push') {
      if (S.design) { S.design.pushed = true; note('designer', 'Pushed the BOM to the marketplace'); }
      save(); render(); return;
    }
    if (bid === 'd-order') {
      if (!S.design) return;
      var zz = S.design;
      var o2 = makeOrder({ sku: zz.sku, qty: zz.qty, channel: 'designer', originLabel: 'from the design studio',
        via: 'omega-storefront-handoff', by: 'designer', placedBy: S.account.email, customer: S.account });
      note('customer', 'Ordered the designed BOM — ' + o2.orderNo);
      S.keepFlash = true;
      S.flash = 'Order ' + o2.orderNo + ' placed from your design.';
      save(); go('p/order/' + o2.orderNo); return;
    }

    /* ── bench ── */
    if ((el = up('data-serial'))) {
      var inp = $('b-input');
      if (inp) inp.value = 'https://plant.cleancell.us/u/' + el.getAttribute('data-serial');
      doScan('https://plant.cleancell.us/u/' + el.getAttribute('data-serial'));
      render(); return;
    }
    if (bid === 'b-scan') { var iv = val('b-input'); if (iv) { doScan(iv); var i2 = $('b-input'); if (i2) i2.value = ''; render(); } return; }
    if (bid === 'b-hold') {
      var bo = benchOrder(); if (!bo) return;
      var list = unitsOf(bo.orderNo);
      for (var i = 0; i < list.length; i++) if (!list[i].hold && list[i].at) {
        list[i].hold = 'Capacity below limit at end-of-line test'; list[i].ncr = 'NCR-26-89';
        note('quality', 'Held ' + list[i].serial + ' — NCR-26-89'); break;
      }
      save(); render(); return;
    }
    if (bid === 'b-clear') {
      for (var k in S.units) if (S.units[k].hold) {
        S.units[k].hold = null; S.units[k].ncr = null;
        note('quality', 'Closed the NCR on ' + S.units[k].serial); break; }
      save(); render(); return;
    }
    if (bid === 'b-run' || bid === 'a-run' || bid === 'o-run') {
      var ro = benchOrder(); if (ro) runBay(ro.orderNo); render(); return;
    }

    /* ── ClearSky ── */
    if (bid === 'm-newcs') {
      var mk = Number(val('m-kw')) || 1500, mh = Number(val('m-h')) || 2, z3 = fit(mk, mh);
      var co = val('m-co') || 'Halsted Logistics';
      var o3 = makeOrder({ sku: z3.sku, qty: z3.qty, channel: 'clearsky', originLabel: 'ClearSky direct',
        via: 'console', by: 'thomas@csebuilders.com', placedBy: 'thomas@csebuilders.com',
        customer: { name: val('m-name') || 'Priya Nair', company: co,
          email: 'ops@' + slug(co).replace(/-/g, '') + '.example', phone: '312 555 0180',
          address: { line1: '2100 S Ashland Ave', city: 'Chicago', state: 'IL', zip: '60608' } } });
      o3.status = 'confirmed';
      note('clearsky', 'Took ' + o3.orderNo + ' from ' + co);
      S.modal = null; go('o/order/' + o3.orderNo); return;
    }
    if ((el = up('data-leak'))) { var ol = find(el.getAttribute('data-leak')); if (ol) leakTest(ol); render(); return; }

    /* ── shared order actions ── */
    if ((el = up('data-act'))) {
      ev.stopPropagation();
      var o = find(el.getAttribute('data-no')); if (!o) return;
      var act = el.getAttribute('data-act');
      if (act === 'confirm') { o.status = 'confirmed'; S.focusA2 = o.orderNo;
        o.history.push({ at: nowISO(), by: 'rob@cleancell.us', what: 'accepted into production' });
        note('cleancell', 'Accepted ' + o.orderNo); S.flash = o.orderNo + ' accepted.'; }
      if (act === 'price') {
        o.pricing = { total: Math.round(o.cost * 1.18), currency: 'USD', pricedBy: 'thomas@csebuilders.com', pricedAt: nowISO() };
        o.status = 'quoted'; note('clearsky', 'Priced ' + o.orderNo);
        S.flash = 'Priced. The customer still sees nothing until it is published.'; }
      if (act === 'publish') { o.tenantPricing.publishedToCustomer = true;
        note('clearsky', 'Published the price on ' + o.orderNo); S.flash = 'Published to the customer.'; }
      if (act === 'deposit') {
        o.deposit = true; if (o.status === 'new' || o.status === 'quoted') o.status = 'accepted';
        o.documents.push({ kind: 'invoice', name: 'Deposit invoice ' + o.orderNo, at: nowISO(), audience: 'customer' });
        o.documents.push({ kind: 'internal', name: 'Margin sheet (internal)', at: nowISO(), audience: 'internal' });
        note('finance', 'Deposit cleared on ' + o.orderNo); S.flash = 'Deposit recorded. You can release it now.'; }
      if (act === 'release') { release(o); S.flash = plural(unitsOf(o.orderNo).length, 'serial') + ' allocated on the floor.'; }
      if (act === 'ship') { if (allReady(o.orderNo)) { markComplete(o); S.flash = 'Shipped. The customer’s account has already moved.'; } }
      if (act === 'paid') { o.paid = true; note('finance', 'Balance received on ' + o.orderNo); S.flash = 'Order closed.'; }
      save(); render(); return;
    }
  });

  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'b-station') { S.bench = ev.target.value; S.lastScan = null; save(); render(); }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.id === 'b-input') {
      ev.preventDefault();
      var v = ev.target.value; if (v) { doScan(v); ev.target.value = ''; render(); }
    }
    if (ev.key === 'Escape' && S.modal) { S.modal = null; save(); render(); return; }
    if (S.tour === null || S.tour === undefined) return;
    if (ev.target && /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
    if (ev.key === 'ArrowRight' || ev.key === ' ') {
      ev.preventDefault();
      if (S.tour >= TOUR.length - 1) tourStop(); else tourGo(S.tour + 1);
    }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); tourGo(S.tour - 1); }
    if (ev.key === 'Escape') { tourStop(); }
  });

  render();
})();
