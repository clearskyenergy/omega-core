/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-quote-deck.js — the customer proposal a seller sends from Omega
   Prime: one to three US-Letter pages drawn from the CUSTOMER VIEW that
   api/customer-quote.js builds key by key. The seller's letterhead, the
   quote's number and dates, who it is for, the site, the system, a site
   plan drawn from the Prime layout, the scope, the price, the terms, the
   exclusions, the acceptance block and the seller's attribution line.

     OmegaQuoteDeck.body(view, opts)      → the proposal as an HTML string
                                             (no <html>; pages inject css())
     OmegaQuoteDeck.document(view, opts)  → a whole US-Letter document
     OmegaQuoteDeck.print(view, opts)     → prints it through a hidden iframe
                                             (a window if the frame fails)
     OmegaQuoteDeck.plan(layout, opts)    → the SVG site plan (layout v2)
     OmegaQuoteDeck.css()                 → the deck's stylesheet
     OmegaQuoteDeck.PARTS                 → the three parts a rep sends

   THREE PARTS, one record (Tommy, 2026-10-17: "they should be able to send a
   site map and a proposal"): opts.part is 'proposal' (the default: all of
   it), 'quote' (the priced summary: who, what, the scope, the price, the
   terms and the acceptance, without the plan) or 'sitemap' (the drawn site
   map on its own page, larger, with its equipment schedule). The customer's
   one link opens all three; each prints on its own.

   ONE renderer serves Prime's Quote screen, the Quote Desk's Print and the
   customer's page (quote.html), so what the rep previews, prints and sends
   is the same document.

   RULES THIS FILE KEEPS
   - No arithmetic on money. Every amount arrives as a formatted string from
     the server (price.total, scope[].amount); a missing one is said in words,
     never computed, summed or guessed. Lengths and areas are geometry.
   - It reads the customer view's keys only. The tenant view (the customer
     view plus internal cost, markup and margin) renders the same document:
     nothing under `internal`, `acceptance`, `events` or `handoff` is read.
   - Every string is escaped; a logo is https, a same-origin path or an
     inline raster image, and an accent is a #rrggbb colour, or neither is
     used.
   - White-label safe: no platform name or mark of ours appears. The only
     line about who powers it is seller.attribution, when the server sent one.

   opts: { signLines: bool (default true: a signature block when the quote
   is undecided), title: string (the heading), planWidth, planHeight,
   imagery: bool (default true: the plan on satellite imagery; false gives
   the clean schematic) }.

   The site plan is the map the rep drew (Tommy, 2026-10-17: "print out a
   proposal / quote for the customer on this site that shows the map I
   made"): Web Mercator — the projection of Prime's map and of Esri's World
   Imagery — scaled to ground feet at the drawing's centre, north up, over
   the Esri World Imagery export for exactly the plan's frame ("Imagery ©
   Esri" on it). Image and drawing are both linear in Mercator metres, so
   they line up at every point; scripts/tests/tquotedeck.js proves it on
   known coordinates. Drawn in high-contrast strokes so it reads on imagery
   (a white halo under every line): the BESS area dashed with its size, the
   unit at its true footprint labelled with its short name and footprint,
   XFMR, DISC, the Service / POI, the conduit with its length, a north arrow
   and a scale bar. A unit with no released footprint is a marked point.
   Labels take the first clear spot round what they name. On a phone the
   plan keeps a legible width and scrolls inside its own box. print() waits
   for the imagery (and the logo and fonts), never for more than a few
   seconds, then prints.

   ES5, no dependencies; DOM only inside print(). Exported for Node so
   scripts/tests/tquotedeck.js renders it from a fixture. */
(function (root) {
  'use strict';
  var VERSION = 'quote-deck-v3';
  var ACCENT = '#2B5FA8', INK = '#14171A', GRAY = '#5B6672', RULE = '#D9DEE5', PAPER = '#F6F8FB';
  var XFMR = '#3A4654', DISCO = '#7A8794', POI = '#D9482B', CONDUIT = '#C26A00';
  var FRAME_ID = 'omega-quote-deck-print';
  var EARTH = 6378137, RAD = Math.PI / 180, FT = 3.280839895;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* ── small readers ─────────────────────────────────────────────────────── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* text with its line breaks kept */
  function escLines(s) { return esc(s).replace(/\r?\n/g, '<br>'); }
  function obj(v) { return v && typeof v === 'object' ? v : {}; }
  /* a field that may be a string or a named object ({display|name|label|id}) */
  function text(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    if (typeof v === 'object') return text(v.display || v.name || v.label || v.id || '');
    return '';
  }
  function hex(c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null; }
  function safeUrl(u) {
    if (typeof u !== 'string') return '';
    if (/^https:\/\/[^\s"'<>\\]+$/i.test(u)) return u;
    if (/^\/(?!\/)[^\s"'<>\\]*$/.test(u)) return u;
    if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+\/]+=*$/i.test(u) && u.length <= 250000) return u;
    return '';
  }
  function fin(v) { var n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && isFinite(n) ? n : null; }
  /* 1234.5 → "1,234.5"; dp is the most decimals kept (trailing zeros dropped) */
  function num(v, dp) {
    var n = fin(v); if (n == null) return '';
    var p = Math.pow(10, dp == null ? 0 : dp), r = Math.round(n * p) / p, neg = r < 0, s = String(Math.abs(r)), parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts.join('.');
  }
  function ms(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string') { var t = Date.parse(v); return isNaN(t) ? null : t; }
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v.seconds != null) return v.seconds * 1000;
    if (v._seconds != null) return v._seconds * 1000;
    return null;
  }
  /* "October 17, 2026", in UTC so the same record prints the same date anywhere */
  function date(v) { var t = ms(v); if (t == null) return ''; var d = new Date(t); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear(); }
  /* an address as lines: a string, or {line1, line2, city, state, postalCode|zip} */
  function addrLines(a) {
    if (!a) return [];
    if (typeof a === 'string') return a.trim() ? [a.trim()] : [];
    var out = [], l1 = text(a.line1), l2 = text(a.line2), city = text(a.city), st = text(a.state), zip = text(a.postalCode || a.zip);
    if (l1) out.push(l1);
    if (l2) out.push(l2);
    var tail = [city, [st, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (tail) out.push(tail);
    return out;
  }
  /* a website as the letterhead prints it: a host (and path), never another scheme */
  function website(u) {
    var s = text(u).replace(/^https?:\/\//i, '').replace(/\/$/, '');
    return /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(\/[^\s<>"']*)?$/.test(s) ? s : '';
  }

  /* ── the parts ─────────────────────────────────────────────────────────── */
  var PARTS = [{ key: 'proposal', label: 'Proposal' }, { key: 'quote', label: 'Quote' }, { key: 'sitemap', label: 'Site map' }];
  var PART_LABEL = { proposal: 'Proposal', quote: 'Quote', sitemap: 'Site map' };
  function partOf(opts) { var k = text(obj(opts).part); return k === 'quote' || k === 'sitemap' ? k : 'proposal'; }

  /* ── the model a page is drawn from (the customer view's keys only) ───── */
  function model(view, opts) {
    var v = obj(view), s = obj(v.seller), co = obj(s.company), rep = obj(s.rep), sys = obj(v.system), u = obj(sys.unit), lay = obj(sys.layout);
    var name = text(s.name) || text(co.legalName);
    var part = partOf(opts);
    return {
      v: v, opts: opts || {}, part: part, kicker: PART_LABEL[part],
      accent: hex(s.accent) || ACCENT,
      seller: { name: name, legalName: text(co.legalName), logo: safeUrl(s.logoUrl), tagline: text(s.tagline), address: addrLines(co.address),
        contact: [text(co.phone), text(co.email), website(co.website)].filter(Boolean), rep: { name: text(rep.name), email: text(rep.email) }, attribution: text(s.attribution) },
      customer: obj(v.customer), site: obj(v.site), unit: u, layout: lay, sys: sys,
      status: text(v.status) || 'draft', quoteNo: text(v.quoteNo), rev: fin(v.rev),
      issued: date(v.issuedAt), validUntil: date(v.validUntil),
      scope: Array.isArray(v.scope) ? v.scope : [], price: obj(v.price), terms: obj(v.terms), decision: obj(v.decision)
    };
  }

  /* ── the stylesheet ────────────────────────────────────────────────────── */
  function css() {
    return [
      '.oqd{--oqd-accent:' + ACCENT + ';--oqd-ink:' + INK + ';color:var(--oqd-ink);font:10pt/1.45 Inter,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
      '-webkit-print-color-adjust:exact;print-color-adjust:exact;text-align:left}',
      '.oqd *{box-sizing:border-box}.oqd h1,.oqd h2,.oqd h3,.oqd p,.oqd ul,.oqd table{margin:0;padding:0}.oqd ul{list-style:none}',
      '.oqd-doc{background:#fff;max-width:8.5in;margin:0 auto;padding:.6in .65in .5in;box-shadow:0 1px 2px rgba(16,24,40,.08),0 8px 24px rgba(16,24,40,.08)}',
      '.oqd-head{display:flex;justify-content:space-between;gap:18pt;align-items:flex-start;padding-bottom:12pt;border-bottom:2.5pt solid var(--oqd-accent)}',
      '.oqd-mark img{display:block;max-height:.62in;max-width:2.4in;width:auto;height:auto}',
      '.oqd-word{font-size:18pt;line-height:1.1;font-weight:800;letter-spacing:-.01em;color:var(--oqd-accent)}',
      '.oqd-tag{font-size:8.5pt;color:' + GRAY + ';font-style:italic;margin-top:3pt}',
      '.oqd-co{margin-top:6pt;font-size:8.5pt;color:' + GRAY + ';line-height:1.45}.oqd-co b{color:var(--oqd-ink);font-size:9pt}',
      '.oqd-meta{text-align:right;min-width:2.3in}',
      '.oqd-kicker{font-size:8pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--oqd-accent)}',
      '.oqd-kv{margin:5pt 0 0 auto;border-collapse:collapse;font-size:8.5pt}.oqd-kv th{text-align:right;font-weight:400;color:' + GRAY + ';padding:1pt 8pt 1pt 0;white-space:nowrap}',
      '.oqd-kv td{text-align:right;font-weight:600;padding:1pt 0}.oqd-kv td span{display:block;font-weight:400;color:' + GRAY + '}',
      '.oqd-title{margin-top:16pt}.oqd-h1{font-size:19pt;line-height:1.2;font-weight:700}.oqd-lead{font-size:10.5pt;color:' + GRAY + ';margin-top:4pt}',
      '.oqd-flag{margin-top:10pt;padding:7pt 10pt;border-radius:5pt;font-size:9pt;font-weight:600;background:#FFF4E5;color:#8A5300;border:.6pt solid #F3D9B1}',
      '.oqd-flag.ok{background:#E8F6EE;color:#1F6B3F;border-color:#BFE3CD}.oqd-flag.bad{background:#FDECEC;color:#A32020;border-color:#F3C9C9}',
      '.oqd-flag.none{background:' + PAPER + ';color:' + GRAY + ';border-color:' + RULE + '}',
      '.oqd-cols{display:grid;grid-template-columns:1fr 1fr;gap:12pt;margin-top:14pt}',
      '.oqd-box{border:.6pt solid ' + RULE + ';border-radius:6pt;padding:9pt 11pt;background:' + PAPER + ';font-size:9.5pt}',
      '.oqd-h3{font-size:7.5pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--oqd-accent);margin-bottom:4pt}',
      '.oqd-sec{margin-top:16pt}.oqd-h2{font-size:11.5pt;font-weight:700;margin-bottom:6pt;padding-bottom:3pt;border-bottom:.6pt solid ' + RULE + '}',
      '.oqd-spec{width:100%;border-collapse:collapse;font-size:9.5pt}',
      '.oqd-spec th{text-align:left;font-weight:400;color:' + GRAY + ';width:1.7in;padding:3.5pt 8pt 3.5pt 0;border-bottom:.5pt solid ' + RULE + ';vertical-align:top}',
      '.oqd-spec td{padding:3.5pt 0;border-bottom:.5pt solid ' + RULE + ';font-weight:600;vertical-align:top}.oqd-spec td span{font-weight:400;color:' + GRAY + '}',
      '.oqd-note{font-size:8pt;color:' + GRAY + ';margin-top:5pt}',
      '.oqd-planbox{overflow-x:auto;-webkit-overflow-scrolling:touch}.oqd-plan svg{display:block;width:100%;height:auto;border:.6pt solid ' + RULE + ';border-radius:6pt;background:#FBFCFE}',
      '.oqd-legend{display:flex;flex-wrap:wrap;gap:4pt 14pt;margin-top:6pt;font-size:8pt;color:' + GRAY + '}',
      '.oqd-legend i{display:inline-block;width:12pt;height:8pt;margin-right:4pt;vertical-align:-1pt;border-radius:1.5pt}',
      '.oqd-table{width:100%;border-collapse:collapse;font-size:9.5pt}.oqd-table td{padding:4pt 0;border-bottom:.5pt solid ' + RULE + ';vertical-align:top}',
      '.oqd-table td.i{width:18pt;color:' + GRAY + '}.oqd-table td.n{text-align:right;white-space:nowrap;padding-left:12pt;font-variant-numeric:tabular-nums}',
      '.oqd-total{display:flex;justify-content:space-between;align-items:baseline;gap:12pt;padding:12pt 14pt;border-radius:6pt;background:' + PAPER + ';border-left:4pt solid var(--oqd-accent)}',
      '.oqd-total .k{font-size:10.5pt;font-weight:700}.oqd-total .k span{display:block;font-size:8.5pt;font-weight:400;color:' + GRAY + ';margin-top:2pt}',
      '.oqd-total .v{font-size:20pt;font-weight:800;color:var(--oqd-accent);white-space:nowrap;font-variant-numeric:tabular-nums}.oqd-total .v.tbc{font-size:12pt}',
      '.oqd-terms li{display:flex;gap:10pt;padding:4pt 0;border-bottom:.5pt solid ' + RULE + ';font-size:9.5pt}.oqd-terms b{flex:0 0 1.3in;color:var(--oqd-accent)}',
      '.oqd-list li{position:relative;padding:2pt 0 2pt 12pt;font-size:9pt}',
      '.oqd-list li:before{content:"";position:absolute;left:0;top:7pt;width:4.5pt;height:4.5pt;border-radius:50%;background:var(--oqd-accent)}',
      '.oqd-sign{display:grid;grid-template-columns:1fr 1fr;gap:26pt;margin-top:12pt}.oqd-sign b{font-size:9pt}',
      '.oqd-sign .line{border-bottom:.8pt solid var(--oqd-ink);height:22pt}.oqd-sign .lbl{font-size:7.5pt;color:' + GRAY + ';margin:2pt 0 6pt}',
      '.oqd-done{font-size:10pt}.oqd-done b{color:var(--oqd-ink)}',
      '.oqd-foot{display:flex;justify-content:space-between;gap:12pt;margin-top:20pt;padding-top:6pt;border-top:.6pt solid ' + RULE + ';font-size:7.5pt;color:' + GRAY + '}',
      '.oqd-keep{break-inside:avoid;page-break-inside:avoid}',
      '.oqd-sched{width:100%;border-collapse:collapse;font-size:9pt;margin-top:8pt}.oqd-sched th{text-align:left;font-size:7.5pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + GRAY + ';padding:4pt 8pt 4pt 0;border-bottom:.6pt solid ' + RULE + '}',
      '.oqd-sched td{padding:4pt 8pt 4pt 0;border-bottom:.5pt solid ' + RULE + ';vertical-align:top}.oqd-sched td.k{font-weight:600}.oqd-sched td span{color:' + GRAY + '}',
      '@media screen and (max-width:640px){.oqd-doc{padding:20px 16px}.oqd-head{flex-direction:column}.oqd-meta{text-align:left;min-width:0}',
      '.oqd-kv{margin-left:0}.oqd-kv th,.oqd-kv td{text-align:left}.oqd-cols,.oqd-sign{grid-template-columns:1fr}.oqd-terms li{display:block}.oqd-terms b{display:block}',
      '.oqd-total{flex-direction:column;align-items:flex-start}.oqd-h1{font-size:17pt}.oqd-foot{flex-direction:column}',
      '.oqd-plan svg{min-width:560px}}',
      '@media print{.oqd-doc{max-width:none;margin:0;padding:0;box-shadow:none}}'
    ].join('');
  }

  /* ── the letterhead ────────────────────────────────────────────────────── */
  function letterhead(m) {
    var s = m.seller, mark = '';
    if (s.logo) mark = '<img src="' + esc(s.logo) + '" alt="' + esc(s.name || 'Logo') + '">';
    else if (s.name) mark = '<div class="oqd-word">' + esc(s.name) + '</div>';
    /* the company line under the mark: the legal name when the mark does not already say it */
    var coName = s.legalName && (s.logo || s.legalName !== s.name) ? s.legalName : (s.logo ? s.name : '');
    var co = (coName ? '<b>' + esc(coName) + '</b><br>' : '') + s.address.map(esc).join('<br>') + (s.contact.length ? (s.address.length ? '<br>' : '') + s.contact.map(esc).join(' · ') : '');
    var kv = [];
    if (m.quoteNo) kv.push(['Quote no.', esc(m.quoteNo)]);
    if (m.rev != null) kv.push(['Revision', esc(num(m.rev))]);
    if (m.issued) kv.push(['Date', esc(m.issued)]);
    if (m.validUntil) kv.push(['Valid until', esc(m.validUntil)]);
    if (s.rep.name || s.rep.email) kv.push(['Prepared by', esc(s.rep.name || s.rep.email) + (s.rep.name && s.rep.email ? '<span>' + esc(s.rep.email) + '</span>' : '')]);
    return '<header class="oqd-head"><div class="oqd-brand"><div class="oqd-mark">' + mark + '</div>'
      + (s.tagline ? '<div class="oqd-tag">' + esc(s.tagline) + '</div>' : '')
      + (co ? '<div class="oqd-co">' + co + '</div>' : '') + '</div>'
      + '<div class="oqd-meta"><div class="oqd-kicker">' + esc(m.kicker || 'Proposal') + '</div>'
      + (kv.length ? '<table class="oqd-kv"><tbody>' + kv.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') + '</tbody></table>' : '')
      + '</div></header>';
  }

  /* ── where the quote stands, said once at the top ──────────────────────── */
  function standing(m) {
    var d = m.decision, st = m.status;
    if (st === 'approved') {
      var by = obj(d.approvedBy);
      return '<div class="oqd-flag ok">Approved' + (text(by.name) ? ' by ' + esc(text(by.name)) + (text(by.title) ? ', ' + esc(text(by.title)) : '') : '') + (date(d.approvedAt) ? ' on ' + esc(date(d.approvedAt)) : '') + '.</div>';
    }
    if (st === 'declined') return '<div class="oqd-flag bad">Declined' + (date(d.declinedAt) ? ' on ' + esc(date(d.declinedAt)) : '') + '.</div>';
    if (st === 'expired') return '<div class="oqd-flag none">This proposal expired' + (m.validUntil ? ' on ' + esc(m.validUntil) : '') + '. Ask ' + esc(m.seller.rep.name || m.seller.name || 'the seller') + ' for a current one.</div>';
    if (st === 'withdrawn') return '<div class="oqd-flag none">This proposal was withdrawn by ' + esc(m.seller.name || 'the seller') + '.</div>';
    if (st === 'draft') return '<div class="oqd-flag">Draft: not yet sent to the customer.</div>';
    return '';
  }

  function title(m) {
    var u = m.unit, kw = num(u.kw, 1), kwh = num(u.kwh, 1);
    var h = text(m.opts.title) || (kw && kwh ? kw + ' kW / ' + (u.kwhApprox ? '≈ ' : '') + kwh + ' kWh battery energy storage system' : kw ? kw + ' kW battery energy storage system' : 'Battery energy storage proposal');
    var c = m.customer, who = text(c.company) || text(c.name), where = text(m.site.address);
    var lead = [who ? 'Prepared for ' + who : '', where].filter(Boolean).join(' · ');
    return '<section class="oqd-title"><h1 class="oqd-h1">' + esc(h) + '</h1>' + (lead ? '<p class="oqd-lead">' + esc(lead) + '</p>' : '') + standing(m) + '</section>';
  }

  /* ── who it is for, and where ──────────────────────────────────────────── */
  function parties(m) {
    var c = m.customer, lines = [];
    if (text(c.name)) lines.push('<b>' + esc(text(c.name)) + '</b>');
    if (text(c.company) && text(c.company) !== text(c.name)) lines.push(c.name ? esc(text(c.company)) : '<b>' + esc(text(c.company)) + '</b>');
    addrLines(c.address).forEach(function (l) { lines.push(esc(l)); });
    var reach = [text(c.email), text(c.phone)].filter(Boolean);
    if (reach.length) lines.push(reach.map(esc).join(' · '));
    var s = m.site, site = [];
    if (text(s.address)) site.push('<b>' + esc(text(s.address)) + '</b>');
    if (text(s.utility)) site.push('Utility: ' + esc(text(s.utility)));
    if (text(s.circuit)) site.push('Circuit: ' + esc(text(s.circuit)));
    if (!lines.length && !site.length) return '';
    return '<section class="oqd-cols oqd-keep">'
      + '<div class="oqd-box"><h3 class="oqd-h3">Prepared for</h3>' + (lines.join('<br>') || '<span>Not named</span>') + '</div>'
      + '<div class="oqd-box"><h3 class="oqd-h3">Site</h3>' + (site.join('<br>') || '<span>Not recorded</span>') + '</div></section>';
  }

  /* the footprint a unit was drawn at, and on whose word */
  function footprint(m) {
    var u = m.unit, lu = obj(m.layout.unit), f = u.footprint, basis = typeof f === 'string' ? f : text(obj(f).basis) || '';
    var l = fin(lu.lFt) || fin(u.lFt) || fin(obj(f).lFt), w = fin(lu.wFt) || fin(u.wFt) || fin(obj(f).wFt);
    if (basis === 'none' || !(l && w)) return { dims: '', words: 'Not yet released by the manufacturer; placed on the plan as a marked point' };
    return { dims: num(l, 1) + ' ft × ' + num(w, 1) + ' ft', words: basis === 'rep' ? 'from the manufacturer’s submittal' : basis === 'catalog' ? 'manufacturer’s catalogue'
      : basis === 'reference' ? 'manufacturer’s reference size, to be confirmed on the submittal' : '' };
  }
  function areaSqft(m) { return fin(m.sys.areaSqft) || fin(obj(m.layout.area).sqft); }
  function conduitFt(m) { var c = obj(m.layout.conduit); return fin(m.sys.conduitFt) || fin(m.layout.conduitFt) || fin(c.ft); }

  function system(m) {
    var u = m.unit, rows = [], equip = [text(u.mfr), text(u.model)].filter(Boolean).join(' ') || text(u.name);
    if (equip) rows.push(['Equipment', esc(equip)]);
    if (num(u.kw, 1)) rows.push(['Power', esc(num(u.kw, 1)) + ' kW']);
    if (num(u.kwh, 1)) rows.push(['Energy', (u.kwhApprox ? '≈ ' : '') + esc(num(u.kwh, 1)) + ' kWh' + (u.kwhApprox ? ' <span>(approximate)</span>' : '')]);
    if (num(u.usable, 1)) rows.push(['Usable energy', esc(num(u.usable, 1)) + ' kWh']);
    if (num(u.hours, 1)) rows.push(['Duration', esc(num(u.hours, 1)) + ' hours at rated power']);
    if (text(u.chem)) rows.push(['Chemistry', esc(text(u.chem))]);
    var fp = footprint(m);
    if (rows.length || pt(obj(m.layout.unit).c)) rows.push(['Footprint', fp.dims ? esc(fp.dims) + (fp.words ? ' <span>(' + esc(fp.words) + ')</span>' : '') : '<span>' + esc(fp.words) + '</span>']);
    var a = areaSqft(m), ar = obj(m.layout.area);
    if (a) rows.push(['Battery area', esc(num(a)) + ' sq ft' + (fin(ar.wFt) && fin(ar.hFt) ? ' <span>(' + esc(num(ar.wFt)) + ' × ' + esc(num(ar.hFt)) + ' ft)</span>' : '')]);
    var c = conduitFt(m);
    if (c) rows.push(['Service conduit', esc(num(c)) + ' ft <span>underground, to the point of interconnection</span>']);
    if (!rows.length) return '';
    return '<section class="oqd-sec oqd-keep"><h2 class="oqd-h2">The system</h2><table class="oqd-spec"><tbody>'
      + rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') + '</tbody></table>'
      + (text(u.caveat) ? '<p class="oqd-note">' + esc(text(u.caveat)) + '</p>' : '') + '</section>';
  }

  /* ── the site plan ─────────────────────────────────────────────────────── */
  function pt(p) { return p && fin(p.lat) != null && fin(p.lng) != null ? { lat: +p.lat, lng: +p.lng } : null; }
  function body3(b) { b = obj(b); var c = pt(b.c) || pt(b); return c ? { c: c, l: fin(b.lFt), w: fin(b.wFt), rot: fin(b.rotDeg) || 0, footprint: text(b.footprint) } : null; }
  function haversineFt(pts) {
    var d = 0;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
      var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      d += 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
    }
    return d * FT;
  }
  function geometry(layout) {
    var L = obj(layout), a = obj(L.area), area = null;
    if (fin(a.s) != null && fin(a.n) != null && fin(a.w) != null && fin(a.e) != null) area = { s: +a.s, n: +a.n, w: +a.w, e: +a.e, wFt: fin(a.wFt), hFt: fin(a.hFt), sqft: fin(a.sqft) };
    var c = obj(L.conduit), pts = Array.isArray(c.pts) ? c.pts.map(pt).filter(Boolean) : [];
    return { area: area, unit: body3(L.unit), xfmr: body3(L.xfmr), disco: body3(L.disco), poi: pt(L.poi),
      conduit: pts.length >= 2 ? { pts: pts, ft: fin(c.ft) || fin(L.conduitFt) || haversineFt(pts), type: text(c.type) } : null };
  }
  function nice(target) {
    var steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000], best = steps[0];
    for (var i = 0; i < steps.length; i++) if (steps[i] <= target) best = steps[i];
    return best;
  }
  function f1(n) { return String(Math.round(n * 10) / 10); }
  function f3(n) { return String(Math.round(n * 1000) / 1000); }
  /* ── the projection: Web Mercator, the projection of the map the rep drew
     on (Omega Prime's Leaflet map, and Esri's World Imagery itself), scaled
     to ground feet at the plan's centre. A site plan spans a few hundred
     feet, so one scale (cos φ0) is good to a few parts in 100,000 across it.
     Both the drawing and the satellite image are LINEAR in Mercator metres,
     so one affine map lines them up at every point, not only the centre. */
  function mercX(lng) { return EARTH * lng * RAD; }
  function mercY(lat) { return EARTH * Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2)); }
  function unMercX(x) { return x / EARTH / RAD; }
  function unMercY(y) { return (2 * Math.atan(Math.exp(y / EARTH)) - Math.PI / 2) / RAD; }
  function fix9(v) { return (Math.round(v * 1e9) / 1e9).toFixed(9); }
  /* Esri World Imagery, exported for the plan's frame. The bbox is sent in
     degrees (bboxSR 4326) and drawn in Web Mercator (imageSR 3857): the
     server projects the box's corners (a Mercator box is a lat/lng box) and,
     because the requested size has the box's own Mercator aspect exactly,
     keeps that extent as it is (it widens one side when the aspect differs).
     The export answers 500 when asked for finer detail than the imagery
     holds at that spot (2026-10-17: Chicago and Mesa refuse 0.15 m a pixel,
     New York and Los Angeles serve it), so the plan stacks LAYERS, coarse
     to fine (0.6, 0.3, 0.15 m a pixel, never more pixels than twice the
     plan): the finest the place has shows on top, and a refused layer only
     leaves the one under it showing, never a blank plan. */
  var IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';
  var IMAGERY_CREDIT = 'Imagery © Esri';
  var IMAGERY_RES = [0.6, 0.3, 0.15];   /* Web Mercator metres a pixel, coarse first */
  function imageryUrl(b, pw, ph) {
    return IMAGERY + '?bbox=' + [fix9(b.w), fix9(b.s), fix9(b.e), fix9(b.n)].join(',') + '&bboxSR=4326&imageSR=3857&size=' + pw + ',' + ph + '&format=jpg&transparent=false&dpi=96&f=image';
  }
  /* the label words, a few px of halo; boxes are estimated (no DOM here) */
  function label(x, y, words, opts) {
    opts = opts || {};
    return '<text x="' + f1(x) + '" y="' + f1(y) + '" font-size="' + (opts.size || 11) + '" font-weight="' + (opts.weight || 600) + '" fill="' + (opts.fill || INK) + '"'
      + (opts.anchor ? ' text-anchor="' + opts.anchor + '"' : '') + (opts.halo === false ? '' : ' stroke="#fff" stroke-width="' + (opts.haloW || 3) + '" stroke-opacity=".92" paint-order="stroke" stroke-linejoin="round"') + '>' + esc(words) + '</text>';
  }
  function textW(words, size) { return String(words).length * size * 0.57 + 2; }
  /* layout: C2 layout v2 (or its geometry).
     opts: { width, height, accent, areaSqft, conduitFt, unitName, imagery (default true), imageScale } */
  function plan(layout, opts) {
    opts = opts || {};
    var G = geometry(layout), W = Math.round(fin(opts.width) || 720), H = Math.round(fin(opts.height) || 420), accent = hex(opts.accent) || ACCENT;
    var sat = opts.imagery !== false, unitName = text(opts.unitName) || 'BESS';
    var xs = [], ys = [];
    function take(p) { if (p) { xs.push(mercX(p.lng)); ys.push(mercY(p.lat)); } }
    if (G.area) { take({ lat: G.area.s, lng: G.area.w }); take({ lat: G.area.n, lng: G.area.e }); }
    ['unit', 'xfmr', 'disco'].forEach(function (k) { if (G[k]) take(G[k].c); });
    take(G.poi);
    if (G.conduit) G.conduit.pts.forEach(take);
    if (!xs.length) return '';
    var mx0 = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, my0 = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
    var kf = Math.cos(unMercY(my0) * RAD) * FT;   /* ground feet per Mercator metre here */
    function P(p) { return { x: (mercX(p.lng) - mx0) * kf, y: (mercY(p.lat) - my0) * kf }; }
    /* the extent in feet, bodies at their footprints (rotation-safe radius) */
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    function grow(x, y, r) { r = r || 0; minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r); minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r); }
    if (G.area) { var sw = P({ lat: G.area.s, lng: G.area.w }), ne = P({ lat: G.area.n, lng: G.area.e }); grow(sw.x, sw.y); grow(ne.x, ne.y); }
    ['unit', 'xfmr', 'disco'].forEach(function (k) { var b = G[k]; if (!b) return; var p = P(b.c), r = b.l && b.w ? Math.sqrt(b.l * b.l + b.w * b.w) / 2 : 3; grow(p.x, p.y, r); });
    if (G.poi) { var pp = P(G.poi); grow(pp.x, pp.y, 3); }
    if (G.conduit) G.conduit.pts.forEach(function (q) { var p = P(q); grow(p.x, p.y); });
    /* the frame: the area, the gear and the POI with a margin round them
       (a tenth of the larger span, at least 15 ft), never under 60 ft wide */
    var MIN = 60, margin = Math.max(15, 0.1 * Math.max(maxX - minX, maxY - minY));
    minX -= margin; maxX += margin; minY -= margin; maxY += margin;
    var spanX = maxX - minX, spanY = maxY - minY;
    if (spanX < MIN) { minX -= (MIN - spanX) / 2; maxX += (MIN - spanX) / 2; spanX = MIN; }
    if (spanY < MIN * H / W) { var want = MIN * H / W; minY -= (want - spanY) / 2; maxY += (want - spanY) / 2; spanY = want; }
    var padL = 14, padR = 14, padT = 14, padB = 30, plotW = W - padL - padR, plotH = H - padT - padB;
    var s = Math.min(plotW / spanX, plotH / spanY);
    var ox = padL + (plotW - spanX * s) / 2, oy = padT + (plotH - spanY * s) / 2;
    function X(x) { return ox + (x - minX) * s; }
    function Y(y) { return oy + (maxY - y) * s; }
    /* svg px → Mercator metres (the image covers the whole viewBox) */
    function MX(u) { return mx0 + (minX + (u - ox) / s) / kf; }
    function MY(v) { return my0 + (maxY - (v - oy) / s) / kf; }
    var out = ['<svg class="oqd-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Site plan' + (sat ? ' on satellite imagery' : '') + '" font-family="Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'];
    out.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + (sat ? '#DCE2E8' : '#FBFCFE') + '"/>');
    if (sat) {
      /* each layer spans the plan's full width; its height is the whole
         pixels that width allows (at least the plan's), centred, so the
         requested size has the box's aspect exactly and the image is placed
         on the very box it shows (the SVG clips what falls outside) */
      var q = Math.min(fin(opts.imageScale) || 2, 4096 / W, 4096 / H), maxPw = Math.floor(W * q), mercW = MX(W) - MX(0), seen = {};
      IMAGERY_RES.forEach(function (res) {
        var pw = Math.max(16, Math.min(maxPw, Math.round(mercW / res)));
        if (seen[pw]) return; seen[pw] = true;
        var ph = Math.ceil(pw * H / W - 1e-9), ih = W * ph / pw, iy = (H - ih) / 2;
        var bb = { w: unMercX(MX(0)), e: unMercX(MX(W)), n: unMercY(MY(iy)), s: unMercY(MY(iy + ih)) }, url = esc(imageryUrl(bb, pw, ph));
        out.push('<image data-role="imagery" data-px="' + pw + 'x' + ph + '" x="0" y="' + f3(iy) + '" width="' + W + '" height="' + f3(ih) + '" preserveAspectRatio="none" href="' + url + '" xlink:href="' + url + '"/>');
      });
    }
    /* a light grid at the scale bar's step on the clean plan; imagery is its own grid */
    var bar = nice((W * 0.2) / s), step = bar * s;
    if (!sat && step >= 18) {
      var grid = [];
      for (var gx = ox - Math.floor((ox) / step) * step; gx < W; gx += step) grid.push('M' + f1(gx) + ' 0V' + H);
      for (var gy = oy - Math.floor((oy) / step) * step; gy < H; gy += step) grid.push('M0 ' + f1(gy) + 'H' + W);
      out.push('<path d="' + grid.join('') + '" stroke="#EDF1F6" stroke-width="1" fill="none"/>');
    }
    /* what a label may not cover: every body, the POI, the north arrow, the
       scale bar and the credit; labels are placed last, each at the first
       of its spots that is clear and inside the frame */
    var taken = [];
    function block(x0, y0, x1, y1) { taken.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }); }
    /* how much of a label box is covered (0 = clear); off the frame counts as covered */
    function cover(b) {
      var c = 0, i, t;
      c += Math.max(0, 2 - b.x0) * 50 + Math.max(0, 2 - b.y0) * 50 + Math.max(0, b.x1 - W + 2) * 50 + Math.max(0, b.y1 - H + 2) * 50;
      for (i = 0; i < taken.length; i++) { t = taken[i]; c += Math.max(0, Math.min(b.x1, t.x1) - Math.max(b.x0, t.x0)) * Math.max(0, Math.min(b.y1, t.y1) - Math.max(b.y0, t.y0)); }
      return c;
    }
    var labels = [];
    function place(role, spots, words, o) {
      o = o || {}; var size = o.size || 10.5, w = textW(words, size), pick = null, least = null, i, sp, b, c;
      for (i = 0; i < spots.length && !pick; i++) {
        sp = spots[i];
        var x0 = sp.anchor === 'middle' ? sp.x - w / 2 : sp.anchor === 'end' ? sp.x - w : sp.x;
        /* the box with its halo: a little past the glyphs on every side */
        b = { x0: x0 - 3, y0: sp.y - size * 0.95, x1: x0 + w + 3, y1: sp.y + size * 0.35 };
        c = cover(b);
        if (!c) pick = { sp: sp, b: b };
        else if (!least || c < least.c) least = { sp: sp, b: b, c: c };
      }
      /* nowhere clear: the spot it covers least */
      if (!pick) pick = least;
      taken.push(pick.b);
      labels.push('<g data-role="label-' + role + '">' + label(pick.sp.x, pick.sp.y, words, { size: size, fill: o.fill, anchor: pick.sp.anchor, weight: o.weight || 700, haloW: sat ? 3.6 : 3 }) + '</g>');
    }
    var area = null;
    if (G.area) {
      var a1 = P({ lat: G.area.n, lng: G.area.w }), a2 = P({ lat: G.area.s, lng: G.area.e });
      area = { x: X(a1.x), y: Y(a1.y), w: X(a2.x) - X(a1.x), h: Y(a2.y) - Y(a1.y) };
      out.push('<g data-role="area"><rect x="' + f1(area.x) + '" y="' + f1(area.y) + '" width="' + f1(area.w) + '" height="' + f1(area.h) + '" fill="' + accent + '" fill-opacity="' + (sat ? '.18' : '.07') + '" stroke="#fff" stroke-opacity="' + (sat ? '.95' : '0') + '" stroke-width="4.5"/>'
        + '<rect x="' + f1(area.x) + '" y="' + f1(area.y) + '" width="' + f1(area.w) + '" height="' + f1(area.h) + '" fill="none" stroke="' + accent + '" stroke-width="' + (sat ? '2.2' : '1.6') + '" stroke-dasharray="7 5"/></g>');
    }
    var cpts = null;
    if (G.conduit) {
      cpts = G.conduit.pts.map(function (q2) { var p = P(q2); return { x: X(p.x), y: Y(p.y) }; });
      var line = cpts.map(function (q2) { return f1(q2.x) + ',' + f1(q2.y); }).join(' ');
      out.push('<g data-role="conduit"><polyline points="' + line + '" fill="none" stroke="#fff" stroke-opacity=".95" stroke-width="' + (sat ? '7' : '5') + '" stroke-linejoin="round" stroke-linecap="round"/>'
        + '<polyline points="' + line + '" fill="none" stroke="' + CONDUIT + '" stroke-width="' + (sat ? '3.2' : '2.6') + '" stroke-linejoin="round" stroke-linecap="round"/></g>');
    }
    function drawBody(b, role, fill) {
      var p = P(b.c), cx = X(p.x), cy = Y(p.y);
      if (!(b.l && b.w) || b.footprint === 'none') {
        block(cx - 9, cy - 9, cx + 9, cy + 9);
        out.push('<g data-role="' + role + '" data-footprint="none"><circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="7.5" fill="#fff" stroke="' + fill + '" stroke-width="2.4"/>'
          + '<path d="M' + f1(cx - 4.5) + ' ' + f1(cy) + 'H' + f1(cx + 4.5) + 'M' + f1(cx) + ' ' + f1(cy - 4.5) + 'V' + f1(cy + 4.5) + '" stroke="' + fill + '" stroke-width="1.8"/></g>');
        return { cx: cx, cy: cy, top: cy - 9, bottom: cy + 9, left: cx - 9, right: cx + 9, none: true };
      }
      var w = b.l * s, h = b.w * s, x = cx - w / 2, y = cy - h / 2, r = b.rot ? Math.sqrt(w * w + h * h) / 2 : 0;
      if (r) block(cx - r, cy - r, cx + r, cy + r); else block(x - 1, y - 1, x + w + 1, y + h + 1);
      out.push('<g data-role="' + role + '"' + (b.rot ? ' transform="rotate(' + f1(b.rot) + ' ' + f1(cx) + ' ' + f1(cy) + ')"' : '') + '><rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h) + '" rx="1.5" fill="' + fill + '" stroke="#0B1220" stroke-opacity=".55" stroke-width="3.4"/>'
        + '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h) + '" rx="1.5" fill="none" stroke="#fff" stroke-width="1.5"/></g>');
      return { cx: cx, cy: cy, top: (r ? cy - r : y), bottom: (r ? cy + r : y + h), left: (r ? cx - r : x), right: (r ? cx + r : x + w) };
    }
    function dims(b) { return b && b.l && b.w && b.footprint !== 'none' ? num(b.l, 1) + ' × ' + num(b.w, 1) + ' ft' : ''; }
    var bodies = {};
    if (G.unit) bodies.unit = drawBody(G.unit, 'unit', accent);
    if (G.xfmr) bodies.xfmr = drawBody(G.xfmr, 'xfmr', XFMR);
    if (G.disco) bodies.disco = drawBody(G.disco, 'disco', DISCO);
    var poi = null;
    if (G.poi) {
      var qp = P(G.poi); poi = { x: X(qp.x), y: Y(qp.y) };
      block(poi.x - 9, poi.y - 9, poi.x + 9, poi.y + 9);
      out.push('<g data-role="poi"><circle cx="' + f1(poi.x) + '" cy="' + f1(poi.y) + '" r="6.5" fill="' + POI + '" stroke="#fff" stroke-width="2.5"/>'
        + '<circle cx="' + f1(poi.x) + '" cy="' + f1(poi.y) + '" r="8.6" fill="none" stroke="#0B1220" stroke-opacity=".5" stroke-width="1"/></g>');
    }
    /* north arrow, top right; scale bar, bottom left; the imagery credit, bottom right */
    var nx = W - 24, ny = 12;
    block(nx - 13, ny - 4, nx + 13, ny + 38);
    out.push('<g data-role="north">' + (sat ? '<rect x="' + (nx - 12) + '" y="' + (ny - 4) + '" width="24" height="42" rx="5" fill="#fff" fill-opacity=".88"/>' : '')
      + '<path d="M' + nx + ' ' + ny + 'l7 18l-7-5l-7 5z" fill="' + INK + '"/>' + label(nx, ny + 31, 'N', { size: 11, anchor: 'middle', weight: 700 }) + '</g>');
    var bx = 18, by = H - 16, bw = bar * s, barWords = num(bar) + ' ft';
    block(bx - 8, by - 14, bx + bw + textW(barWords, 9.5) / 2 + 8, H - 1);
    var credit = '';
    if (sat) {
      var cw = textW(IMAGERY_CREDIT, 8.5);
      block(W - cw - 12, H - 17, W - 2, H - 2);
      credit = '<g data-role="attribution"><rect x="' + f1(W - cw - 10) + '" y="' + (H - 16) + '" width="' + f1(cw + 6) + '" height="13" rx="3" fill="#fff" fill-opacity=".85"/>'
        + label(W - 7, H - 6.5, IMAGERY_CREDIT, { size: 8.5, weight: 500, anchor: 'end', fill: '#3A4654', halo: false }) + '</g>';
    }
    /* the labels: the unit (its short name and footprint), the gear, the
       service point, the conduit run, then the area */
    /* the spots round a thing, nearest first, then a line further out */
    function around(bd, gap) {
      gap = gap || 5;
      var out2 = [], k, d;
      for (k = 0; k < 3; k++) {
        d = k * 13;
        out2.push({ x: bd.cx, y: bd.top - gap - d, anchor: 'middle' }, { x: bd.cx, y: bd.bottom + gap + 9 + d, anchor: 'middle' });
        if (!k) out2.push({ x: bd.right + gap + 1, y: bd.cy + 4, anchor: 'start' }, { x: bd.left - gap - 1, y: bd.cy + 4, anchor: 'end' });
        out2.push({ x: bd.left, y: bd.top - gap - d, anchor: 'start' }, { x: bd.right, y: bd.top - gap - d, anchor: 'end' },
          { x: bd.left, y: bd.bottom + gap + 9 + d, anchor: 'start' }, { x: bd.right, y: bd.bottom + gap + 9 + d, anchor: 'end' });
      }
      return out2;
    }
    if (bodies.unit) place('unit', around(bodies.unit), bodies.unit.none ? unitName + ' (footprint pending)' : unitName + (dims(G.unit) ? ' · ' + dims(G.unit) : ''), { size: 11 });
    if (bodies.xfmr) place('xfmr', around(bodies.xfmr), 'XFMR', { size: 10 });
    if (bodies.disco) place('disco', around(bodies.disco), 'DISC', { size: 10 });
    if (poi) place('poi', around({ cx: poi.x, cy: poi.y, top: poi.y - 9, bottom: poi.y + 9, left: poi.x - 9, right: poi.x + 9 }, 3), 'Service / POI', { size: 10.5, fill: POI });
    if (cpts) {
      /* along the run: the longest leg's middle first, then further along
         it and along the other legs, beside the line on either side */
      var ft = fin(opts.conduitFt) || G.conduit.ft, legs = [], cs = [];
      for (var i = 1; i < cpts.length; i++) legs.push({ a: cpts[i - 1], b: cpts[i], len: Math.abs(cpts[i].x - cpts[i - 1].x) + Math.abs(cpts[i].y - cpts[i - 1].y) });
      legs.sort(function (p1, p2) { return p2.len - p1.len; });
      legs.forEach(function (lg) {
        var horiz = Math.abs(lg.b.x - lg.a.x) >= Math.abs(lg.b.y - lg.a.y);
        [0.5, 0.3, 0.7, 0.15, 0.85].forEach(function (t) {
          var x = lg.a.x + (lg.b.x - lg.a.x) * t, y = lg.a.y + (lg.b.y - lg.a.y) * t;
          if (horiz) cs.push({ x: x, y: y - 8, anchor: 'middle' }, { x: x, y: y + 16, anchor: 'middle' });
          else cs.push({ x: x + 9, y: y + 4, anchor: 'start' }, { x: x - 9, y: y + 4, anchor: 'end' });
        });
      });
      if (ft) place('conduit', cs, 'Conduit · ' + num(ft) + ' ft', { size: 10.5, fill: CONDUIT });
    }
    if (area) place('area', [{ x: area.x + 3, y: area.y - 7, anchor: 'start' }, { x: area.x + 3, y: area.y + area.h + 15, anchor: 'start' }, { x: area.x + 6, y: area.y + 15, anchor: 'start' },
      { x: area.x + area.w, y: area.y - 7, anchor: 'end' }, { x: area.x + area.w, y: area.y + area.h + 15, anchor: 'end' },
      { x: area.x + 3, y: area.y - 20, anchor: 'start' }, { x: area.x + 3, y: area.y + area.h + 28, anchor: 'start' },
      { x: area.x - 6, y: area.y + 10, anchor: 'end' }, { x: area.x + area.w + 6, y: area.y + 10, anchor: 'start' },
      { x: area.x + area.w, y: area.y - 20, anchor: 'end' }, { x: area.x + area.w, y: area.y + area.h + 28, anchor: 'end' }],
      'BESS area' + (G.area.wFt && G.area.hFt ? ' · ' + num(G.area.wFt) + ' × ' + num(G.area.hFt) + ' ft' : ''), { size: 10.5, fill: sat ? INK : accent });
    out.push(labels.join(''));
    out.push(credit);
    out.push('<g data-role="scale">' + (sat ? '<rect x="' + (bx - 8) + '" y="' + (by - 13) + '" width="' + f1(bw + 16 + textW(barWords, 9.5) / 2) + '" height="' + 28 + '" rx="5" fill="#fff" fill-opacity=".88"/>' : '')
      + '<path d="M' + bx + ' ' + (by - 5) + 'V' + by + 'H' + f1(bx + bw) + 'V' + (by - 5) + 'M' + f1(bx + bw / 2) + ' ' + (by - 3) + 'V' + by + '" fill="none" stroke="' + INK + '" stroke-width="1.4"/>'
      + label(bx, by + 11, '0', { size: 9.5, weight: 500 }) + label(bx + bw, by + 11, barWords, { size: 9.5, weight: 500, anchor: 'middle' }) + '</g>');
    out.push('</svg>');
    return out.join('');
  }
  function legend(G, accent) {
    var items = [];
    function dims(b) { return b && b.l && b.w && b.footprint !== 'none' ? ' ' + num(b.l, 1) + ' × ' + num(b.w, 1) + ' ft' : ''; }
    if (G.area) items.push('<span><i style="border:1.4pt dashed ' + accent + ';background:transparent"></i>Battery area</span>');
    if (G.unit) items.push('<span><i style="background:' + accent + '"></i>Battery unit' + dims(G.unit) + '</span>');
    if (G.xfmr) items.push('<span><i style="background:' + XFMR + '"></i>Transformer' + dims(G.xfmr) + '</span>');
    if (G.disco) items.push('<span><i style="background:' + DISCO + '"></i>Disconnect' + dims(G.disco) + '</span>');
    if (G.poi) items.push('<span><i style="background:' + POI + ';border-radius:50%;width:8pt"></i>Service / point of interconnection</span>');
    if (G.conduit) items.push('<span><i style="background:' + CONDUIT + ';height:3pt;vertical-align:2pt"></i>Service conduit, underground</span>');
    return items.length ? '<div class="oqd-legend">' + items.join('') + '</div>' : '';
  }
  function planSection(m) {
    var sat = m.opts.imagery !== false;
    var svg = plan(m.layout, { accent: m.accent, width: m.opts.planWidth, height: m.opts.planHeight, areaSqft: areaSqft(m), conduitFt: conduitFt(m),
      unitName: text(m.unit.short) || 'BESS', imagery: sat });
    if (!svg) return '';
    return '<section class="oqd-sec oqd-plan oqd-keep"><h2 class="oqd-h2">Site plan</h2><div class="oqd-planbox">' + svg + '</div>' + legend(geometry(m.layout), m.accent)
      + '<p class="oqd-note">' + (sat ? 'The site design drawn on satellite imagery (' + esc(IMAGERY_CREDIT) + '). ' : 'Schematic drawn from the site design. ')
      + 'Not a survey or a construction drawing; final placement follows the engineered drawings and the utility’s requirements.</p></section>';
  }

  /* ── scope, price, terms ───────────────────────────────────────────────── */
  function scope(m) {
    var rows = m.scope.filter(function (x) { return x && text(x.name); });
    if (!rows.length) return '';
    return '<section class="oqd-sec"><h2 class="oqd-h2">Scope of work</h2><table class="oqd-table"><tbody>'
      + rows.map(function (x, i) { var amt = typeof x.amount === 'string' ? x.amount.trim() : ''; return '<tr><td class="i">' + (i + 1) + '.</td><td>' + esc(text(x.name)) + '</td>' + (amt ? '<td class="n">' + esc(amt) + '</td>' : '<td></td>') + '</tr>'; }).join('')
      + '</tbody></table></section>';
  }
  function price(m) {
    var total = typeof m.price.total === 'string' ? m.price.total.trim() : '', note = text(m.price.note);
    return '<section class="oqd-sec oqd-keep"><h2 class="oqd-h2">Price</h2><div class="oqd-total"><div class="k">Total price<span>For the scope above' + (m.validUntil ? ', valid until ' + esc(m.validUntil) : '') + '</span></div>'
      + (total ? '<div class="v">' + esc(total) + '</div>' : '<div class="v tbc">To be confirmed</div>') + '</div>'
      + (note ? '<p class="oqd-note">' + escLines(note) + '</p>' : '') + '</section>';
  }
  function terms(m) {
    var t = m.terms, items = [], days = fin(t.validDays);
    if (days || m.validUntil) items.push(['Validity', 'This proposal is open' + (days ? ' for ' + num(days) + ' days' : '') + (m.validUntil ? ', until ' + esc(m.validUntil) : '') + '.']);
    if (text(t.paymentTerms)) items.push(['Payment', escLines(text(t.paymentTerms))]);
    if (text(t.notes)) items.push(['Notes', escLines(text(t.notes))]);
    var ex = (Array.isArray(t.exclusions) ? t.exclusions : []).map(text).filter(Boolean);
    if (!items.length && !ex.length) return '';
    return '<section class="oqd-sec"><h2 class="oqd-h2">Terms</h2>'
      + (items.length ? '<ul class="oqd-terms">' + items.map(function (r) { return '<li><b>' + r[0] + '</b><span>' + r[1] + '</span></li>'; }).join('') + '</ul>' : '')
      + (ex.length ? '<h3 class="oqd-h3" style="margin-top:10pt">Not included</h3><ul class="oqd-list">' + ex.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '')
      + '</section>';
  }

  /* ── acceptance ────────────────────────────────────────────────────────── */
  function approval(m) {
    var d = m.decision, st = m.status, by = obj(d.approvedBy), s = m.seller;
    if (st === 'approved') {
      return '<section class="oqd-sec oqd-keep"><h2 class="oqd-h2">Acceptance</h2><p class="oqd-done">Approved by <b>' + esc(text(by.name) || 'the customer') + '</b>' + (text(by.title) ? ', ' + esc(text(by.title)) : '')
        + (text(m.customer.company) ? ', for ' + esc(text(m.customer.company)) : '') + (date(d.approvedAt) ? ', on ' + esc(date(d.approvedAt)) : '') + '.</p>'
        + '<p class="oqd-note">Approved online against ' + (m.quoteNo ? 'quote ' + esc(m.quoteNo) : 'this quote') + (m.rev != null ? ' revision ' + esc(num(m.rev)) : '') + ', as shown in this document.</p></section>';
    }
    if (st === 'declined') {
      return '<section class="oqd-sec oqd-keep"><h2 class="oqd-h2">Acceptance</h2><p class="oqd-done">Declined' + (date(d.declinedAt) ? ' on ' + esc(date(d.declinedAt)) : '') + '.</p>'
        + (text(d.declineReason) ? '<p class="oqd-note">Reason given: ' + escLines(text(d.declineReason)) + '</p>' : '') + '</section>';
    }
    if (m.opts.signLines === false || st === 'expired' || st === 'withdrawn') return '';
    function block(party, who) { return '<div><b>' + esc(party) + '</b><div class="line"></div><div class="lbl">Signature</div><div class="line"></div><div class="lbl">Name and title' + (who ? ': ' + esc(who) : '') + '</div><div class="line"></div><div class="lbl">Date</div></div>'; }
    return '<section class="oqd-sec oqd-keep"><h2 class="oqd-h2">Acceptance</h2><p>To accept, sign below and return this proposal to ' + esc(s.rep.name || s.name || 'the seller') + (s.rep.email ? ' (' + esc(s.rep.email) + ')' : '') + ', or approve it online from the link you received.</p>'
      + '<div class="oqd-sign">' + block(text(m.customer.company) || 'Customer', '') + block(s.legalName || s.name || 'Seller', s.rep.name) + '</div></section>';
  }
  function foot(m) {
    var left = [m.seller.legalName || m.seller.name, m.quoteNo ? 'Quote ' + m.quoteNo + (m.rev != null ? ' rev ' + num(m.rev) : '') : ''].filter(Boolean).map(esc).join(' · ');
    return '<footer class="oqd-foot"><span>' + left + '</span>' + (m.seller.attribution ? '<span>' + esc(m.seller.attribution) + '</span>' : '') + '</footer>';
  }

  /* ── the site map, its own page: the plan larger, and what is on it ───── */
  function schedule(m) {
    var G = geometry(m.layout), rows = [], u = m.unit;
    function dims(b) { return b && b.l && b.w && b.footprint !== 'none' ? num(b.l, 1) + ' × ' + num(b.w, 1) + ' ft' : ''; }
    function at(p) { return p ? num(p.lat, 5) + ', ' + num(p.lng, 5) : ''; }
    if (G.area) rows.push(['Battery area', [G.area.wFt && G.area.hFt ? num(G.area.wFt) + ' × ' + num(G.area.hFt) + ' ft' : '', areaSqft(m) ? num(areaSqft(m)) + ' sq ft' : ''].filter(Boolean).join(' · '), 'The ground the battery and its gear may use']);
    if (G.unit) {
      var equip = [text(u.mfr), text(u.short) || text(u.model)].filter(Boolean).join(' ') || 'Battery';
      rows.push(['Battery unit', dims(G.unit) || 'Footprint not yet released; placed as a marked point', equip + (num(u.kw, 1) ? ' · ' + num(u.kw, 1) + ' kW' : '') + (num(u.kwh, 1) ? ' / ' + (u.kwhApprox ? '≈ ' : '') + num(u.kwh, 1) + ' kWh' : '') + (at(G.unit.c) ? ' · at ' + at(G.unit.c) : '')]);
    }
    if (G.xfmr) rows.push(['Transformer', dims(G.xfmr), 'Pad-mount; drawn at a planning size and sized on the engineered design']);
    if (G.disco) rows.push(['Disconnect', dims(G.disco), 'AC disconnect; drawn at a planning size']);
    if (G.poi) rows.push(['Service / point of interconnection', at(G.poi), 'Where the site meets the utility\'s service']);
    if (G.conduit) rows.push(['Service conduit', num(G.conduit.ft) + ' ft', 'Underground, from the ' + (G.disco ? 'disconnect' : G.xfmr ? 'transformer' : 'unit') + ' to the point of interconnection']);
    if (!rows.length) return '';
    return '<table class="oqd-sched"><thead><tr><th>On the plan</th><th>Size or place</th><th>What it is</th></tr></thead><tbody>'
      + rows.map(function (r) { return '<tr><td class="k">' + esc(r[0]) + '</td><td>' + esc(r[1] || '—') + '</td><td><span>' + esc(r[2]) + '</span></td></tr>'; }).join('') + '</tbody></table>';
  }
  function siteMapBody(m) {
    var sat = m.opts.imagery !== false;
    var svg = plan(m.layout, { accent: m.accent, width: m.opts.planWidth || 720, height: m.opts.planHeight || 560, areaSqft: areaSqft(m), conduitFt: conduitFt(m),
      unitName: text(m.unit.short) || 'BESS', imagery: sat });
    var c = m.customer, who = text(c.company) || text(c.name), s = m.site;
    var lead = [who ? 'Prepared for ' + who : '', text(s.address)].filter(Boolean).join(' · ');
    var where = [text(s.utility) ? 'Utility: ' + text(s.utility) : '', text(s.circuit) ? 'Circuit: ' + text(s.circuit) : ''].filter(Boolean).join(' · ');
    return letterhead(m)
      + '<section class="oqd-title"><h1 class="oqd-h1">' + esc(text(m.opts.title) || 'Site map') + '</h1>' + (lead ? '<p class="oqd-lead">' + esc(lead) + '</p>' : '')
      + (where ? '<p class="oqd-note">' + esc(where) + '</p>' : '') + standing(m) + '</section>'
      + (svg ? '<section class="oqd-sec oqd-plan oqd-keep"><div class="oqd-planbox">' + svg + '</div>' + legend(geometry(m.layout), m.accent) + '</section>'
          + '<section class="oqd-sec oqd-keep"><h2 class="oqd-h2">What is on the site map</h2>' + schedule(m)
          + '<p class="oqd-note">' + (sat ? 'Drawn on satellite imagery (' + esc(IMAGERY_CREDIT) + '). ' : 'Schematic drawn from the site design. ')
          + 'Not a survey or a construction drawing; final placement follows the engineered drawings and the utility’s requirements.</p></section>'
        : '<section class="oqd-sec"><p>No site map has been drawn for this proposal yet.</p></section>')
      + foot(m);
  }

  /* ── the document ──────────────────────────────────────────────────────── */
  function body(view, opts) {
    if (!view || typeof view !== 'object') return '<div class="oqd"><div class="oqd-doc"><p>There is no proposal to show.</p></div></div>';
    var m = model(view, opts), inner;
    if (m.part === 'sitemap') inner = siteMapBody(m);
    else if (m.part === 'quote') inner = letterhead(m) + title(m) + parties(m) + system(m) + scope(m) + price(m) + terms(m) + approval(m) + foot(m);
    else inner = letterhead(m) + title(m) + parties(m) + system(m) + planSection(m) + scope(m) + price(m) + terms(m) + approval(m) + foot(m);
    return '<div class="oqd oqd-part-' + m.part + '" style="--oqd-accent:' + m.accent + '"><article class="oqd-doc">' + inner + '</article></div>';
  }
  function titleOf(view, opts) {
    var v = obj(view), s = obj(v.seller), who = text(obj(v.customer).company) || text(obj(v.customer).name);
    return [PART_LABEL[partOf(opts)] + (text(v.quoteNo) ? ' ' + text(v.quoteNo) : ''), who, text(s.name)].filter(Boolean).join(' · ');
  }
  function documentHtml(view, opts) {
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<meta name="referrer" content="no-referrer"><title>' + esc(titleOf(view, opts)) + '</title><style>' + css()
      + '@page{size:letter;margin:.55in .6in}html,body{margin:0;padding:0;background:#fff}'
      + '@media screen{body{background:#E5E7EB;padding:24px 0}}</style></head><body>' + body(view, opts) + '</body></html>';
  }

  /* ── printing: a hidden iframe first, a window if the frame cannot be
     written (proforma-logic.js has the same two paths). It waits for the
     page, the logo and the fonts, but never for more than a few seconds. ── */
  function imagesDone(d) { var imgs = d.images || []; for (var i = 0; i < imgs.length; i++) if (!imgs[i].complete) return false; return true; }
  /* An SVG <image> (the satellite imagery) is not in document.images and
     has no .complete: each is fetched once more through an Image probe, which
     the browser answers from the same cache, and the page waits for every
     probe to load or fail. */
  function svgImagesDone(win, d, probes) {
    if (!probes.made) {
      probes.made = true; probes.list = [];
      var els = d.querySelectorAll ? d.querySelectorAll('image') : [], Img = win.Image || (typeof Image !== 'undefined' ? Image : null);
      for (var i = 0; i < els.length; i++) {
        var href = els[i].getAttribute('href') || els[i].getAttribute('xlink:href');
        if (!href || !Img) continue;
        (function (p) {
          var im = new Img();
          im.onload = im.onerror = function () { p.done = true; };
          im.src = href;
          if (im.complete) p.done = true;
          probes.list.push(p);
        })({ done: false });
      }
    }
    for (var k = 0; k < probes.list.length; k++) if (!probes.list[k].done) return false;
    return true;
  }
  function whenReady(win, go, capMs) {
    var start = new Date().getTime(), fired = false, cap = capMs || 7000, probes = {};
    function fire() { if (!fired) { fired = true; go(); } }
    function poll() {
      var d = null;
      try { d = win.document; } catch (e) { d = null; }
      if (!d || new Date().getTime() - start > cap) { fire(); return; }
      if (d.readyState !== 'complete' || !imagesDone(d) || !svgImagesDone(win, d, probes)) { setTimeout(poll, 80); return; }
      if (d.body) d.body.getBoundingClientRect();
      var fonts = d.fonts;
      if (fonts && fonts.ready && typeof fonts.ready.then === 'function') {
        var t = setTimeout(fire, 3000);
        /* a moment more after imagery, for the decoded image to be painted */
        var settle = probes.list && probes.list.length ? 250 : 80;
        fonts.ready.then(function () { clearTimeout(t); setTimeout(fire, settle); }, function () { clearTimeout(t); fire(); });
      } else setTimeout(fire, 400);
    }
    poll();
  }
  function inWindow(html) {
    var w = null;
    try { w = root.open('', '_blank'); } catch (e) { w = null; }
    if (!w) return false;
    try { w.document.open(); w.document.write(html); w.document.close(); } catch (e) { return false; }
    whenReady(w, function () { try { w.focus(); w.print(); } catch (e) { /* the window is there to print by hand */ } });
    return true;
  }
  function print(view, opts) {
    if (typeof document === 'undefined' || !document.body) return false;
    var html = documentHtml(view, opts), old = document.getElementById(FRAME_ID), frame = document.createElement('iframe'), win;
    function drop() { if (frame.parentNode) frame.parentNode.removeChild(frame); }
    if (old && old.parentNode) old.parentNode.removeChild(old);
    frame.id = FRAME_ID;
    frame.setAttribute('title', PART_LABEL[partOf(opts)]);
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.style.cssText = 'position:fixed;left:-12in;top:0;width:8.5in;height:11in;border:0';
    try {
      document.body.appendChild(frame);
      win = frame.contentWindow;
      win.document.open(); win.document.write(html); win.document.close();
    } catch (e) { drop(); return inWindow(html); }
    whenReady(win, function () {
      try { win.onafterprint = function () { setTimeout(drop, 500); }; win.focus(); win.print(); } catch (e) { drop(); inWindow(html); }
    });
    return true;
  }

  var API = { body: body, document: documentHtml, documentHtml: documentHtml, print: print, plan: plan, css: css, titleOf: titleOf, PARTS: PARTS,
    esc: esc, date: date, num: num, safeUrl: safeUrl, VERSION: VERSION, IMAGERY: IMAGERY, IMAGERY_CREDIT: IMAGERY_CREDIT,
    /* for the test: the print wait, on a stand-in window */
    _whenReady: whenReady };
  if (root) root.OmegaQuoteDeck = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : null);
