/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ══════════════════════════════════════════════════════════════════════════
   The sandbox's own state and wiring. The two DECISION engines above this in
   the bundle — OmegaPlant (api/_lib/plant.js) and OmegaPortal
   (api/_lib/portal.js) — are the REAL committed files, unmodified. Nothing
   below re-implements a rule they already own: it holds records, routes
   clicks, and asks them.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var P = window.OmegaPlant, Q = window.OmegaPortal;
  var KEY = 'omega.eco.v1';
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

  /* ── the catalogue (Clean Cell's published products) ──────────────────── */
  var CATALOG = [
    { sku: 'CC-215', name: '215 kWh outdoor cabinet',  kw: 100,  kwh: 215,  price: 61000,  ft: '4.5 × 3.5 ft' },
    { sku: 'CC-418', name: '418 kWh outdoor cabinet',  kw: 200,  kwh: 418,  price: 112000, ft: '7.5 × 4.5 ft' },
    { sku: 'CC-1250', name: '1.25 MWh skid',           kw: 500,  kwh: 1250, price: 310000, ft: '20 × 8 ft' },
    { sku: 'CC-5000', name: '5 MWh 20 ft container',   kw: 2500, kwh: 5000, price: 1180000, ft: '19.88 × 8 ft' }
  ];
  function skuOf(s) { for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].sku === s) return CATALOG[i]; return null; }

  /* ── state ────────────────────────────────────────────────────────────── */
  function seed() {
    return {
      role: 'customer',
      seq: 4418,
      orders: [],
      units: {},            /* serial -> { serial, orderNo, at, done, hold, ncr } */
      customer: {
        name: 'Dana Ruiz', company: 'Riverside Cold Chain',
        email: 'ops@riverside.example', phone: '312 555 0110',
        address: { line1: '1 Industrial Dr', city: 'Chicago', state: 'IL', zip: '60616' },
        plan: 'free', terms: { netDays: null, discountPct: null, poRequired: false }
      },
      bench: 'kit',
      log: [],
      sized: null
    };
  }
  var S;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S || !S.orders) S = seed();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  function note(who, what) {
    S.log.unshift({ at: Date.now(), who: who, what: what });
    S.log = S.log.slice(0, 60);
  }

  /* ── the order lifecycle, using the REAL status vocabulary ────────────── */
  function orderNo() {
    S.seq += 1;
    return 'CLEANCELL-20260920-' + S.seq;
  }
  function unitsOf(no) {
    var out = [];
    for (var k in S.units) if (S.units[k].orderNo === no) out.push(S.units[k]);
    return out;
  }
  /* Ask the REAL projection engine what this customer may see. */
  function projected(o) {
    return Q.publicOrder(o, { units: unitsOf(o.orderNo), showPrice: true });
  }

  function placeOrder(sku, qty) {
    var c = skuOf(sku); if (!c) return null;
    var no = orderNo();
    var o = {
      orderNo: no, orgId: 'cleancell.us', orgName: 'Clean Cell',
      /* The fields a real order carries that a customer must NEVER see. The
         projection is what keeps them out — try the Leak test. */
      fulfilledBy: 'clearsky', source: 'embed', placedBy: null,
      pricing: null, cost: Math.round(c.price * 0.61 * qty), margin: 0.22,
      provenance: { via: 'api/embed-order create', embedKeyId: 'a91f22c8' },
      history: [{ at: nowISO(), by: 'storefront', what: 'created' }],
      status: 'new', createdAt: nowISO(),
      customer: {
        name: S.customer.name, company: S.customer.company, email: S.customer.email,
        phone: S.customer.phone, address: S.customer.address,
        notes: ''
      },
      items: [{ sku: c.sku, name: c.name, qty: qty, kw: c.kw, kwh: c.kwh }],
      system: { kw: c.kw * qty, kwh: c.kwh * qty, durationH: Math.round((c.kwh / c.kw) * 10) / 10 },
      tenantPricing: { total: c.price * qty, currency: 'USD', publishedToCustomer: false },
      documents: [], promisedShipAt: null, cancelRequested: false, deposit: false
    };
    S.orders.unshift(o);
    note('customer', 'Placed ' + no + ' — ' + qty + ' × ' + c.name);
    save(); return o;
  }
  function find(no) { for (var i = 0; i < S.orders.length; i++) if (S.orders[i].orderNo === no) return S.orders[i]; return null; }

  function release(o) {
    /* One message in: works order raised, serials allocated from the block. */
    var n = o.items[0].qty;
    for (var i = 0; i < n; i++) {
      var serial = 'CC' + o.items[0].sku.split('-')[1] + '-26-' + (S.seq * 10 + i);
      S.units[serial] = { serial: serial, orderNo: o.orderNo, at: '', done: {}, hold: null, ncr: null };
    }
    o.status = 'in_fulfilment';
    o.promisedShipAt = new Date(Date.now() + 55 * 864e5).toISOString();
    o.history.push({ at: nowISO(), by: 'system', what: 'released to the floor' });
    note('system', 'Released ' + o.orderNo + ' — ' + plural(n, 'serial') + ' allocated');
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
      var o = find(u.orderNo);
      if (o && v.last) {
        var all = unitsOf(u.orderNo);
        var done = true;
        for (var i = 0; i < all.length; i++) if (all[i].at !== 'ready') done = false;
        if (done) { o.status = 'shipped';
          o.documents.push({ kind: 'packing', name: 'Packing list ' + o.orderNo, url: '#', at: nowISO(), audience: 'customer' });
          note('system', o.orderNo + ' complete — all units staged'); }
      }
    }
    note('bench', P.labelOf(routing, S.bench) + ' · ' + (s || serial) + ' · ' + (v.say || v.reason));
    save();
    return v;
  }

  /* ══ RENDER ═══════════════════════════════════════════════════════════ */
  var ROLES = [
    { key: 'customer', who: 'Dana at Riverside Cold Chain', brand: 'cc', label: 'Buyer' },
    { key: 'tenant',   who: 'Rob at Clean Cell',            brand: 'cc', label: 'Clean Cell' },
    { key: 'bench',    who: 'Bench tablet',                 brand: 'cc', label: 'Plant floor' },
    { key: 'staff',    who: 'You, ClearSky',                brand: 'cs', label: 'ClearSky' }
  ];
  function roleDef(k) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].key === k) return ROLES[i]; return ROLES[0]; }

  function paintChrome() {
    var r = roleDef(S.role);
    document.documentElement.setAttribute('data-brand', r.brand);
    $('brand').textContent = r.brand === 'cc' ? 'Clean Cell Power Platform' : 'ClearSky OMEGA';
    $('who').textContent = r.who;
    var t = $('tabs').children;
    for (var i = 0; i < t.length; i++) t[i].setAttribute('aria-current', t[i].dataset.role === S.role);
  }

  /* ── 1 · BUYER ────────────────────────────────────────────────────────── */
  function viewCustomer() {
    var h = '';
    /* Size it */
    var sized = S.sized;
    h += '<section><h2>Size a system</h2>'
      + '<p class="lede">What a visitor does on cleancell.us. No account, no sales call.</p>'
      + '<div class="row"><label>Peak demand kW<input id="i-kw" type="number" value="' + (sized ? sized.kw : 800) + '"></label>'
      + '<label>Hours of backup<input id="i-h" type="number" step="0.5" value="' + (sized ? sized.h : 2) + '"></label>'
      + '<button class="btn p" id="do-size">Size it</button></div>';
    if (sized) {
      h += '<div class="rec"><div><div class="k">Recommended</div><div class="v">' + esc(sized.qty) + ' × ' + esc(sized.name) + '</div></div>'
        + '<div><div class="k">System</div><div class="v">' + esc(sized.tkw) + ' kW · ' + esc(sized.tkwh) + ' kWh</div></div>'
        + '<div><div class="k">Footprint each</div><div class="v">' + esc(sized.ft) + '</div></div>'
        + '<div><div class="k">Indicative</div><div class="v">' + money(sized.price) + '</div></div></div>'
        + '<button class="btn p" id="do-order">Request this system →</button>'
        + '<p class="fine">Indicative only. Peak duration is estimated from what you typed, not from interval data.</p>';
    }
    h += '</section>';

    /* Their orders — through the REAL projection */
    h += '<section><h2>Your orders</h2>';
    var mine = S.orders;
    if (!mine.length) h += '<p class="empty">Nothing yet. Size a system above and request it.</p>';
    mine.forEach(function (o) {
      var p = projected(o);
      var ms = p.milestone || {};
      var track = '';
      if (ms.index !== null && ms.index !== undefined) {
        for (var i = 0; i < ms.of; i++) track += '<i class="' + (i < ms.index ? 'done' : i === ms.index ? 'on' : '') + '"></i>';
      }
      h += '<div class="ord"><div class="hd"><span class="no">' + esc(p.orderNo) + '</span>'
        + '<span class="sp"></span><span class="pill ' + (ms.key === 'shipped' ? 'go' : ms.key === 'cancelled' ? 'stop' : 'wait') + '">'
        + esc(ms.label) + '</span></div>'
        + '<p class="say">' + esc(ms.say) + '</p>'
        + (track ? '<div class="track">' + track + '</div>' : '')
        + '<div class="lines">' + p.items.map(function (it) {
            return '<div><b>' + esc(it.qty) + '×</b> ' + esc(it.name) + ' <span class="mut">' + esc(it.kwh) + ' kWh</span></div>';
          }).join('') + '</div>'
        + '<div class="meta">'
        + (p.price ? '<span>' + money(p.price.total) + '</span>' : '<span class="mut">Price pending</span>')
        + (p.promisedShipAt ? '<span>Ships by ' + esc(String(p.promisedShipAt).slice(0, 10)) + '</span>' : '')
        + '<span>Sold by ' + esc(p.soldBy) + '</span></div>'
        + (p.documents.length ? '<div class="docs">' + p.documents.map(function (d) {
            return '<a href="#" onclick="return false">' + esc(d.name) + '</a>'; }).join('') + '</div>' : '')
        + '</div>';
    });
    h += '</section>';

    /* Terms the tenant set */
    var t = S.customer.terms;
    if (t.netDays || t.discountPct || t.poRequired) {
      h += '<section><h2>Your terms</h2><div class="kv">'
        + (t.netDays ? '<div><div class="k">Payment</div><div class="v">Net ' + esc(t.netDays) + '</div></div>' : '')
        + (t.discountPct ? '<div><div class="k">Discount</div><div class="v">' + esc(t.discountPct) + '%</div></div>' : '')
        + (t.poRequired ? '<div><div class="k">Purchase order</div><div class="v">Required</div></div>' : '')
        + '</div><p class="fine">Set by Clean Cell. You can see them; only they can change them.</p></section>';
    }
    return h;
  }

  /* ── 2 · CLEAN CELL ───────────────────────────────────────────────────── */
  function viewTenant() {
    var h = '<section><h2>Order desk</h2><p class="lede">One queue — Clean Cell and ClearSky work the same rows.</p>';
    if (!S.orders.length) h += '<p class="empty">No orders yet. Switch to Buyer and place one.</p>';
    S.orders.forEach(function (o) {
      var units = unitsOf(o.orderNo);
      h += '<div class="ord"><div class="hd"><span class="no">' + esc(o.orderNo) + '</span>'
        + '<span class="mut">' + esc(o.customer.company) + '</span><span class="sp"></span>'
        + '<span class="pill ' + (o.status === 'shipped' ? 'go' : 'wait') + '">' + esc(o.status) + '</span></div>'
        + '<div class="meta"><span>' + esc(o.items[0].qty) + ' × ' + esc(o.items[0].name) + '</span>'
        + '<span>' + esc(o.system.kwh) + ' kWh</span>'
        + '<span>Your price ' + money(o.tenantPricing.total) + '</span>'
        + (o.pricing ? '<span class="mut">ClearSky to you ' + money(o.pricing.total) + '</span>' : '<span class="mut">awaiting ClearSky price</span>')
        + (units.length ? '<span>' + plural(units.length, 'unit') + ' on the floor</span>' : '') + '</div>'
        + '<div class="acts">'
        + (o.status === 'new' ? '<button class="btn" data-act="confirm" data-no="' + o.orderNo + '">Confirm</button>' : '')
        + (o.pricing && !o.tenantPricing.publishedToCustomer ? '<button class="btn" data-act="publish" data-no="' + o.orderNo + '">Publish my price to the customer</button>' : '')
        + (o.pricing && !o.deposit ? '<button class="btn" data-act="deposit" data-no="' + o.orderNo + '">Mark deposit received</button>' : '')
        + (o.deposit && !units.length ? '<button class="btn p" data-act="release" data-no="' + o.orderNo + '">Release to the floor →</button>' : '')
        + '</div></div>';
    });
    h += '</section>';

    h += '<section><h2>Customer account</h2><p class="lede">Terms are an overlay — the buyer made this account themselves by signing in.</p>'
      + '<div class="row"><label>Company<input id="c-co" value="' + esc(S.customer.company) + '"></label>'
      + '<label>Plan<select id="c-plan"><option value="free"' + (S.customer.plan === 'free' ? ' selected' : '') + '>free</option>'
      + '<option value="designer"' + (S.customer.plan === 'designer' ? ' selected' : '') + '>designer</option></select></label></div>'
      + '<div class="row"><label>Net days<input id="c-net" type="number" value="' + (S.customer.terms.netDays || '') + '"></label>'
      + '<label>Discount %<input id="c-disc" type="number" value="' + (S.customer.terms.discountPct || '') + '"></label>'
      + '<label class="chk"><input type="checkbox" id="c-po"' + (S.customer.terms.poRequired ? ' checked' : '') + '> PO required</label>'
      + '<button class="btn p" id="c-save">Save terms</button></div>'
      + '<p class="fine">Set these, then switch to Buyer — they appear on their account, and a discount is theirs to see.</p></section>';
    return h;
  }

  /* ── 3 · THE BENCH ────────────────────────────────────────────────────── */
  function viewBench() {
    var routing = P.DEFAULT_ROUTING;
    var h = '<section><h2>Bench scanner</h2>'
      + '<p class="lede">The station comes off the paired record, never the scan. Pick a bench, then pull a trigger.</p>'
      + '<div class="row"><label>This bench is<select id="b-station">'
      + routing.map(function (s) { return '<option value="' + s.key + '"' + (S.bench === s.key ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('')
      + '</select></label><span class="fine" id="b-hint"></span></div>';

    h += '<div id="verdict" class="vd"><span class="mark">·</span><b id="v-serial"></b><span id="v-say">Scan a unit.</span><span id="v-why" class="mut"></span></div>';

    var all = [];
    for (var k in S.units) all.push(S.units[k]);
    if (!all.length) {
      h += '<p class="empty">No units on the floor. Place an order as the Buyer, price it as ClearSky, then release it as Clean Cell.</p>';
    } else {
      h += '<div class="guns">' + all.map(function (u) {
        return '<button class="g' + (u.hold ? ' hold' : '') + '" data-serial="' + esc(u.serial) + '">'
          + esc(u.serial) + '<small>' + (u.hold ? 'ON HOLD · ' + esc(u.ncr) : (u.at ? esc(P.labelOf(routing, u.at)) : 'not started')) + '</small></button>';
      }).join('') + '</div>'
      + '<div class="row"><button class="btn" id="b-hold">Put a unit on hold (QA fails one)</button>'
      + '<button class="btn" id="b-release-hold">Release the hold</button></div>';

      /* the floor board */
      h += '<h2 style="margin-top:22px">The board</h2><div class="board">'
        + routing.map(function (s) {
            var here = all.filter(function (u) { return u.at === s.key; });
            return '<div class="col"><div class="ch">' + esc(s.label) + '</div>'
              + here.map(function (u) { return '<div class="u' + (u.hold ? ' hold' : '') + '">' + esc(u.serial.slice(-6)) + '</div>'; }).join('')
              + '</div>';
          }).join('') + '</div>';
    }
    h += '</section>';
    return h;
  }

  /* ── 4 · CLEARSKY ─────────────────────────────────────────────────────── */
  function viewStaff() {
    var h = '<section><h2>Pricing — ClearSky only</h2>'
      + '<p class="lede">The tenant may never set this. Their margin sits on top of our number.</p>';
    var need = S.orders.filter(function (o) { return !o.pricing; });
    if (!need.length) h += '<p class="empty">Nothing waiting to be priced.</p>';
    need.forEach(function (o) {
      h += '<div class="ord"><div class="hd"><span class="no">' + esc(o.orderNo) + '</span><span class="sp"></span>'
        + '<span class="mut">our cost ' + money(o.cost) + '</span></div>'
        + '<div class="meta"><span>' + esc(o.items[0].qty) + ' × ' + esc(o.items[0].name) + '</span>'
        + '<span>Clean Cell sells at ' + money(o.tenantPricing.total) + '</span></div>'
        + '<div class="acts"><button class="btn p" data-act="price" data-no="' + o.orderNo + '">Price it to Clean Cell</button></div></div>';
    });
    h += '</section>';

    /* the estate */
    var units = 0, held = 0;
    for (var k in S.units) { units++; if (S.units[k].hold) held++; }
    var newN = S.orders.filter(function (o) { return o.status === 'new'; }).length;
    function sf(label, state, say) {
      return '<div class="sf s-' + state + '"><span class="dot"></span><div><b>' + esc(label)
        + ' <i class="st">' + esc(state) + '</i></b><div class="mut">' + esc(say) + '</div></div></div>';
    }
    h += '<section><h2>The estate — cleancell.us</h2>'
      + '<p class="lede">What a Systems panel reports. Rendered here; served as JSON too, so an agent reads the same sentences.</p>'
      + sf('Storefront embed', 'ok', plural(S.orders.length, 'order') + ' today of a 60 cap.')
      + sf('Order desk', newN ? 'warn' : 'ok', newN ? plural(newN, 'new order') + ' waiting to be confirmed.' : 'Nothing waiting.')
      + sf('Plant floor', held ? 'warn' : (units ? 'ok' : 'off'), held ? plural(held, 'unit') + ' on hold.' : (units ? plural(units, 'unit') + ' moving across 10 benches.' : 'No units released yet.'))
      + sf('Buyer portal', 'ok', '1 customer account, 1 user.')
      + sf('Designer', S.customer.plan === 'designer' ? 'ok' : 'off', S.customer.plan === 'designer' ? '1 account on the designer, running the BESS designer.' : 'Nobody is subscribed to the designer yet.')
      + '</section>';

    /* the leak test */
    h += '<section><h2>The leak test</h2>'
      + '<p class="lede">Every order here carries our cost, our margin, the string <code>clearsky</code> and a staff audit trail. '
      + 'This is byte-for-byte what <code>api/_lib/portal.js</code> hands the buyer.</p>'
      + '<div class="row"><button class="btn p" id="do-leak">Run it</button></div>'
      + '<pre id="leak-out" class="pre">Press Run.</pre></section>';
    return h;
  }

  function render() {
    paintChrome();
    var v = S.role === 'customer' ? viewCustomer()
          : S.role === 'tenant'   ? viewTenant()
          : S.role === 'bench'    ? viewBench()
          :                         viewStaff();
    $('view').innerHTML = v;
    $('logbody').innerHTML = S.log.length
      ? S.log.map(function (l) {
          return '<div class="lg"><span class="t">' + hhmm(l.at) + '</span><span class="w">' + esc(l.who) + '</span>' + esc(l.what) + '</div>';
        }).join('')
      : '<div class="lg mut">Nothing has happened yet.</div>';
    wire();
  }
  window.__ecoRender = render;

  /* ── wiring ───────────────────────────────────────────────────────────── */
  function on(id, ev, fn) { var e = $(id); if (e) e.addEventListener(ev, fn); }

  function wire() {
    on('do-size', 'click', function () {
      var kw = Number($('i-kw').value) || 0, hrs = Number($('i-h').value) || 1;
      var kwh = kw * hrs;
      /* TIGHTEST FIT, not the biggest box. Walking the catalogue from the
         largest down took the first product where one unit covered the need,
         so a 1,200 kWh site was quoted a single 5 MWh container — four times
         what they asked for. Pick the option that overshoots least, with a
         sane unit count. */
      var best = null, qty = 1, waste = Infinity;
      for (var i = 0; i < CATALOG.length; i++) {
        var n = Math.max(1, Math.ceil(kwh / CATALOG[i].kwh));
        if (n > 8) continue;                       /* too many boxes to site */
        var over = (n * CATALOG[i].kwh) - kwh;
        if (over < waste) { waste = over; best = CATALOG[i]; qty = n; }
      }
      if (!best) { best = CATALOG[CATALOG.length - 1]; qty = Math.ceil(kwh / best.kwh); }
      S.sized = { sku: best.sku, name: best.name, qty: qty, ft: best.ft,
                  tkw: best.kw * qty, tkwh: best.kwh * qty, price: best.price * qty, kw: kw, h: hrs };
      note('customer', 'Sized ' + kw + ' kW × ' + hrs + ' h → ' + qty + ' × ' + best.name);
      save(); render();
    });
    on('do-order', 'click', function () {
      placeOrder(S.sized.sku, S.sized.qty); S.sized = null; save(); render();
    });

    var acts = document.querySelectorAll('[data-act]');
    for (var i = 0; i < acts.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          var o = find(b.dataset.no); if (!o) return;
          var a = b.dataset.act;
          if (a === 'confirm') { o.status = 'confirmed'; note('cleancell', 'Confirmed ' + o.orderNo); }
          if (a === 'price') {
            o.pricing = { total: Math.round(o.cost * 1.18), currency: 'USD', pricedBy: 'thomas@csebuilders.com', pricedAt: nowISO() };
            o.status = 'quoted';
            note('clearsky', 'Priced ' + o.orderNo + ' to Clean Cell');
          }
          if (a === 'publish') { o.tenantPricing.publishedToCustomer = true; note('cleancell', 'Published their price on ' + o.orderNo); }
          if (a === 'deposit') {
            o.deposit = true; o.status = 'accepted';
            o.documents.push({ kind: 'invoice', name: 'Deposit invoice ' + o.orderNo, url: '#', at: nowISO(), audience: 'customer' });
            o.documents.push({ kind: 'internal', name: 'Margin sheet (internal)', url: '#', at: nowISO(), audience: 'internal' });
            note('system', 'Deposit cleared on ' + o.orderNo);
          }
          if (a === 'release') release(o);
          save(); render();
        });
      })(acts[i]);
    }

    on('c-save', 'click', function () {
      S.customer.company = $('c-co').value;
      S.customer.plan = $('c-plan').value;
      S.customer.terms = {
        netDays: Number($('c-net').value) || null,
        discountPct: Number($('c-disc').value) || null,
        poRequired: $('c-po').checked
      };
      note('cleancell', 'Updated terms for ' + S.customer.company);
      save(); render();
    });

    on('b-station', 'change', function () { S.bench = this.value; save(); render(); });
    var guns = document.querySelectorAll('.g');
    for (var j = 0; j < guns.length; j++) {
      (function (g) {
        g.addEventListener('click', function () {
          /* Exactly what a wedge scanner types: the label URL. */
          var v = scan('https://plant.cleancell.us/u/' + g.dataset.serial);
          var el = $('verdict');
          el.className = 'vd ' + (v.ok ? (v.action === 'duplicate' ? 'dup' : 'ok') : 'bad');
          el.querySelector('.mark').textContent = v.ok ? (v.action === 'duplicate' ? '=' : '✓') : '✕';
          $('v-serial').textContent = P.serialFrom(g.dataset.serial);
          $('v-say').textContent = v.say || '';
          $('v-why').textContent = v.reason ? '(' + v.reason + ')' : (v.action || '');
          setTimeout(render, 900);
        });
      })(guns[j]);
    }
    on('b-hold', 'click', function () {
      for (var k in S.units) if (!S.units[k].hold && S.units[k].at) {
        S.units[k].hold = 'Capacity below limit at EOL'; S.units[k].ncr = 'NCR-26-89';
        note('quality', 'Held ' + S.units[k].serial + ' — NCR-26-89'); break;
      }
      save(); render();
    });
    on('b-release-hold', 'click', function () {
      for (var k in S.units) if (S.units[k].hold) {
        S.units[k].hold = null; S.units[k].ncr = null;
        note('quality', 'Released the hold on ' + S.units[k].serial); break;
      }
      save(); render();
    });

    on('do-leak', 'click', function () {
      var o = S.orders[0];
      if (!o) { $('leak-out').textContent = 'Place an order first.'; return; }
      var proj = JSON.stringify(projected(o), null, 1);
      var needles = ['clearsky', String(o.cost), 'margin', 'provenance', 'history',
                     'csebuilders.com', o.pricing ? String(o.pricing.total) : '\u0000none\u0000', 'placedBy'];
      var lines = needles.map(function (n) {
        var present = proj.indexOf(n) >= 0;
        return (present ? '  LEAKED  ' : '  absent  ') + n;
      }).join('\n');
      $('leak-out').textContent =
        'What the order actually holds:\n  cost ' + money(o.cost) + ' · margin ' + o.margin
        + ' · fulfilledBy "' + o.fulfilledBy + '"\n  ' + o.history.length + ' audit entries'
        + (o.pricing ? ' · ClearSky price ' + money(o.pricing.total) : '')
        + '\n\nSearched the buyer’s projection for each:\n' + lines
        + '\n\nWhat the buyer receives:\n' + proj;
    });
  }

  /* role tabs + reset */
  var tabs = $('tabs').children;
  for (var i = 0; i < tabs.length; i++) {
    (function (b) {
      b.addEventListener('click', function () { S.role = b.dataset.role; save(); render(); });
    })(tabs[i]);
  }
  $('reset').addEventListener('click', function () {
    if (!window.confirm('Clear every order, unit and term and start again?')) return;
    S = seed(); save(); render();
  });

  render();
})();
