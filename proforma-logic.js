/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   proforma-logic.js — the BESS Pro Forma's investor deck, as HTML and as
   PowerPoint

   Takes what POST /api/proforma 'model' returns (the finance engine's result,
   api/_lib/proforma-engine.js) and the tenant's brand, and lays out the deck
   an investor is sent: cover, overview, the numbers, optional appendices
   (sizing basis, annual cash flow, disclosures) and a close.

     OmegaProformaReport.render(result, brand, opts)        the slides, for a preview
     OmegaProformaReport.css()                              the stylesheet they need
     OmegaProformaReport.documentHtml(result, brand, opts)  a complete printable document
     OmegaProformaReport.print(result, brand, opts)         prints it (Save as PDF)
     OmegaProformaReport.pptx(result, brand, opts)          the same deck as a .pptx:
                                                            downloads it; resolves { fileName }
     OmegaProformaReport.pptx.fileName(result, brand, opts) '<Tenant> - <Project> -
                                                            Investor One-Pager - <Q# YYYY>.pptx'
     OmegaProformaReport.brandFrom(contextBrand, overrides)  name, logo, tagline, accent
     OmegaProformaReport.brandFrom.logoAccent(url, cb)      an accent read off the logo
     OmegaProformaReport.palette(accentHex)                 the deck's colours
     OmegaProformaReport.fmt                                the number formats it uses

   opts = { include: { sizing, cashflow, disclosures },  appendices; all off
            narrative: '',       replaces the generated overview paragraph
            contact: { lines },  the close page's lines ('Email: …'), six at most
            quarterLabel: '',    the cover's 'Q3 2026'; default from the prepared date
            footerTitle: '' }    default 'Investor One-Pager'

   render() wraps each slide in a .pf-frame sized to var(--pf-scale), so a
   page sets --pf-scale on any ancestor and the deck lays out at that size
   without measuring. print() and documentHtml() print the bare slides.

   Both come from ONE model of the pages (deck(): what each page says and
   where its blocks break), drawn twice — as HTML by the *Html functions and
   as native PowerPoint objects by the ppt* ones — so the PDF and the .pptx
   cannot say different things. pptx() also takes, for node and tests,
     opts.PptxGenJS  the PptxGenJS 4.0.1 constructor, instead of loading it
     opts.JSZip      the JSZip the finishing pass reopens the file with
     opts.write      'nodebuffer' | 'base64' | … — resolve with the file
                     rather than downloading it (see POWERPOINT below).

   ── NOTHING IS COMPUTED HERE ─────────────────────────────────────────────
   Browser code is public (CLAUDE.md, IP protection), and a deck that re-derived
   a figure would be a second opinion stapled to the first — and the version
   that gets emailed is the one that disagrees. Every number is read off the
   result and formatted. The only arithmetic is presentation: a line's unit
   cost ($/W, $/kWh), a share of cost, a gross-minus-net kWh. Anything else a
   page needs belongs in the engine's result.

   ── WHY IT LOOKS LIKE THIS ───────────────────────────────────────────────
   The acceptance test is the one-pager a developer already sends: a
   PowerPoint export, 720 × 405 pt, set in Calibri. The slides are laid out in
   points on that grid with the reference's sizes, spacing and baselines, so a
   printed page is indistinguishable from the deck it replaces. Carlito is
   metric-compatible with Calibri and keeps the line breaks on a machine
   without Office. PowerPoint sets small type a little wider than a browser
   does (it rounds advances to whole pixels), so the small sizes carry the
   tracking that measured the difference away. Colour comes from ONE accent,
   see palette().

   The tenant's name, logo and tagline are data (brandFrom); nothing here names
   a tenant. The attribution line is the platform's white-label rule
   (api/_lib/whitelabel.js) and is printed as given — no deck setting removes
   it. Every string is escaped, and a figure that is missing becomes an
   omitted line or an em dash: NaN, undefined, null and Infinity never reach
   the page.

   ES5 on purpose: this loads in the tool page and in any embedded browser.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var VERSION = 'proforma-report/1.0';
  var DASH = '\u2014', NDASH = '\u2013', MINUS = '\u2212', DOT = '\u00b7', TIMES = '\u00d7', NBSP = '\u00a0';
  var INK = '#1A1D23', GRAY = '#6B7280', RULE = '#E2E5EB', WHITE = '#FFFFFF';
  var DEFAULT_ACCENT = '#2563EB';
  var FONT_URL = 'https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700' +
                 '&family=Inter:wght@300;400;700&display=swap';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                'September', 'October', 'November', 'December'];
  var FRAME_ID = 'omega-proforma-print';

  /* The reference's grid, in points. */
  var PAGE_W = 720, MARGIN = 30.24, CONTENT_W = PAGE_W - 2 * MARGIN;
  var TITLE_PT = 20.93, TITLE_ROOM = CONTENT_W - 96;                  // the title stops short of the logo
  var PILL_ROOM = CONTENT_W - 44;                                     // a banner's text width inside its padding
  var COL_W = 206.64, COL_H = 268.08;                                 // a numbers-page column
  var BULLET_W = COL_W - 13.23, BULLET_TOP = 11 + 6.79, BULLET_LINE = 8.67;
  var BULLET_GAP = 6.4, BULLET_GAP_MIN = 4.5;                         // the reference's usual gap, and its tightest
  var DIS_H = 296;                                                    // the disclosures' column height

  /* ── STRINGS ────────────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* User text arrives from form fields: collapse what a paste leaves behind.
     A number is text too (a project called 2027), unless it is not a number. */
  function clean(v) {
    if (v == null || typeof v === 'object' || (typeof v === 'number' && !isFinite(v))) return '';
    return String(v).replace(/\s+/g, ' ').replace(/^ | $/g, '');
  }
  /* A list the result should carry; anything else is an empty one. */
  function arr(v) { return Object.prototype.toString.call(v) === '[object Array]' ? v : []; }
  function at(o, path) {
    var parts = path.split('.'), cur = o;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function list(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }
  function lowerFirst(s) { return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function upperFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  /* 'a' or 'an' before a spoken number: an 8, an 11-year, an 18,000, an $800,000. */
  function an(numeral) {
    var s = String(numeral).replace(/^\$/, ''), lead = s.split(/[,.]/)[0];
    return /^8/.test(s) || lead === '11' || lead === '18' ? 'an' : 'a';
  }
  /* Curly apostrophes for display type: the tagline is set in Inter. */
  function smart(s) { return s.replace(/(\w)'(\w)/g, '$1\u2019$2'); }
  /* A last line of one short word reads as a mistake on a slide; the last two
     words travel together. */
  function noWidow(s) { return s.replace(/ (\S{1,14})$/, NBSP + '$1'); }
  /* How many lines a string takes in a box, for text that must not overflow
     one. Calibri with the deck's tracking averages about 0.42 em a character;
     0.44 and two characters lost to each wrap err towards "too long". */
  function linesOf(s, pt, widthPt, em) {
    var perLine = Math.max(8, Math.floor(widthPt / (pt * (em || 0.44))) - 2);
    return Math.max(1, Math.ceil(String(s).length / perLine));
  }
  /* The largest size, up to pt, at which a one-line string fits widthPt. */
  function fitPt(s, pt, widthPt, em, minPt) {
    var want = String(s).length * (em || 0.47) * pt;
    return want <= widthPt ? pt : Math.max(minPt, Math.floor(pt * widthPt / want * 10) / 10);
  }

  /* ── NUMBERS ────────────────────────────────────────────────────────────── */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string' && /\d/.test(v)) { var n = Number(v); return isFinite(n) ? n : null; }
    return null;
  }
  function pos(v) { var n = num(v); return n !== null && n > 0 ? n : null; }
  function grouped(n, dp) {
    var s = Math.abs(n).toFixed(dp || 0), i = s.indexOf('.');
    return (i < 0 ? s : s.slice(0, i)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (i < 0 ? '' : s.slice(i));
  }
  function trimmed(n, dp) {
    var s = grouped(n, dp);
    return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
  }
  /* A minus only when the digits shown are not all zero: never '−0'. */
  function sign(n, body) { return (n < 0 && /[1-9]/.test(body) ? MINUS : '') + body; }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function ymdOf(s) {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(typeof s === 'string' ? s : '');
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 0;
    return mo < 1 || mo > 12 || d > 31 ? null : { y: y, m: mo, d: d };
  }
  function today() {
    var t = new Date();
    return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
  }

  var fmt = {
    dash: DASH,
    /* $1,757,498 */
    money: function (v) {
      var n = num(v);
      if (n === null) return DASH;
      var r = Math.round(n);
      return sign(r, '$' + grouped(r, 0));
    },
    /* $1.79M from a million up, else whole dollars: the overview's ask. */
    moneyCompact: function (v) {
      var n = num(v);
      if (n === null) return DASH;
      var a = Math.abs(n);
      if (a >= 1e9) return sign(n, '$' + trimmed(a / 1e9, 2) + 'B');
      if (a >= 1e6) return sign(n, '$' + trimmed(a / 1e6, 2) + 'M');
      return fmt.money(n);
    },
    /* $1.786 million, the way the overview paragraph states an ask. */
    millions: function (v) {
      var n = num(v);
      if (n === null) return DASH;
      return Math.abs(n) >= 1e6 ? sign(n, '$' + trimmed(Math.abs(n) / 1e6, 3) + ' million') : fmt.money(n);
    },
    /* ~$53–59k/yr, a band of annual distributions. */
    band: function (lo, hi) {
      var a = num(lo), b = num(hi);
      if (a === null || b === null) return DASH;
      var big = Math.max(Math.abs(a), Math.abs(b)) >= 1e6, div = big ? 1e6 : 1e3, dp = big ? 1 : 0;
      var x = trimmed(a / div, dp), y = trimmed(b / div, dp);
      return '~' + sign(a, '$' + x) + (x === y && a >= 0 ? '' : NDASH + sign(b, y)) + (big ? 'M' : 'k') + '/yr';
    },
    int: function (v) {
      var n = num(v);
      if (n === null) return DASH;
      var r = Math.round(n);
      return sign(r, grouped(r, 0));
    },
    num: function (v, dp) {
      var n = num(v);
      return n === null ? DASH : sign(n, trimmed(n, dp == null ? 2 : dp));
    },
    /* An IRR or any fraction, as a percent: 0.0814 → 8.14% */
    pct: function (frac, dp) {
      var n = num(frac);
      return n === null ? DASH : sign(n, Math.abs(n * 100).toFixed(dp == null ? 1 : dp)) + '%';
    },
    /* An input already in percent: 2.5 → 2.5%, 8.84 → 8.84%, 30 → 30% */
    percent: function (p, dp) {
      var n = num(p);
      return n === null ? DASH : sign(n, trimmed(n, dp == null ? 2 : dp)) + '%';
    },
    /* An IRR-build step in points: (0.9) or +4.2 */
    pts: function (p) {
      var n = num(p);
      if (n === null) return DASH;
      var s = Math.abs(n).toFixed(1);
      return n < 0 && s !== '0.0' ? '(' + s + ')' : '+' + s;
    },
    cents: function (c) { var n = num(c); return n === null ? DASH : n.toFixed(2) + '\u00a2/kWh'; },
    /* $0.225/kWh, never fewer than two decimals */
    rate: function (r) {
      var n = num(r);
      if (n === null) return DASH;
      var s = n.toFixed(4).replace(/0+$/, '');
      return '$' + (s.split('.')[1].length < 2 ? n.toFixed(2) : s) + '/kWh';
    },
    years: function (y) { var n = num(y); return n === null ? DASH : '~' + n.toFixed(1) + ' yrs'; },
    /* 315 kW, 1.25 MW */
    kw: function (v) {
      var n = num(v);
      if (n === null) return DASH;
      return Math.abs(n) >= 1000 ? trimmed(n / 1000, 2) + ' MW' : trimmed(n, 1) + ' kW';
    },
    /* 500 kWh, 1.8 MWh */
    kwh: function (v) {
      var n = num(v);
      if (n === null) return DASH;
      return Math.abs(n) >= 1000 ? trimmed(n / 1000, 2) + ' MWh' : trimmed(n, 0) + ' kWh';
    },
    /* '2026-08-19' → 08 / 19 / 2026 */
    date: function (ymd) {
      var d = ymdOf(ymd);
      return d ? pad2(d.m) + ' / ' + pad2(d.d || 1) + ' / ' + d.y : DASH;
    },
    /* '2027-02' → February 2027 */
    month: function (ym) { var d = ymdOf(ym); return d ? MONTHS[d.m - 1] + ' ' + d.y : DASH; },
    /* '2026-08-19' → Q3 2026 */
    quarter: function (ymd) { var d = ymdOf(ymd); return d ? 'Q' + Math.ceil(d.m / 3) + ' ' + d.y : DASH; }
  };
  /* The sizes the prose uses: whole kW and kWh, never MW. */
  function kwWords(v) { return trimmed(v, 1) + ' kW'; }
  function kwhWords(v) { return trimmed(v, 0) + ' kWh'; }

  /* ── COLOUR ─────────────────────────────────────────────────────────────── */
  /* '#RGB' or '#RRGGBB' only, as the server validates them; anything else is
     not a colour, however hex it looks ('bad', 'cafe'). */
  function hexColor(c) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(typeof c === 'string' ? c.replace(/^\s+|\s+$/g, '') : '');
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return '#' + h.toUpperCase();
  }
  function rgbOf(hex) {
    return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)];
  }
  function hexOf(c) {
    var s = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.max(0, Math.min(255, Math.round(c[i])));
      s += (v < 16 ? '0' : '') + v.toString(16);
    }
    return s.toUpperCase();
  }
  function hslOf(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min, h = 0, s = 0;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = 60 * (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
    }
    return [h, s, l];
  }
  function rgbOfHsl(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    var seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.min(5, Math.floor(h / 60))];
    return [(seg[0] + m) * 255, (seg[1] + m) * 255, (seg[2] + m) * 255];
  }
  function luminance(c) {
    var v = [];
    for (var i = 0; i < 3; i++) {
      var x = c[i] / 255;
      v.push(x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    }
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  /* One accent in, the deck's colours out.
     accentDark is PowerPoint's "Darker 25%" (lightness × 0.756) with a touch
     more saturation so the shade does not go muddy; on the reference green it
     lands exactly on the reference's label green, 4.3:1 on white. A light
     accent — a yellow — is still light after that, so the shade keeps
     darkening until labels read at 4:1. tint is the accent at 12% on white,
     the card and icon-disc fill. An accent too light to sit on white as text
     or under white text (below 2:1) hands text and glyphs to the dark shade
     and the banner's lettering to ink; one that is all but white is no accent
     at all, and the platform blue stands in. */
  function palette(accentHex) {
    var white = [255, 255, 255], accent = hexColor(accentHex);
    if (!accent || contrast(rgbOf(accent), white) < 1.25) accent = DEFAULT_ACCENT;
    var c = rgbOf(accent), h = hslOf(c), sat = Math.min(1, h[1] * 1.045), l = h[2] * 0.756;
    var dark = rgbOfHsl(h[0], sat, l);
    while (contrast(dark, white) < 4 && l > 0.05) {
      l *= 0.92;
      dark = rgbOfHsl(h[0], sat, l);
    }
    var light = contrast(c, white) < 2;
    return {
      accent: accent,
      accentDark: hexOf(dark),
      tint: hexOf([c[0] + (255 - c[0]) * 0.88, c[1] + (255 - c[1]) * 0.88, c[2] + (255 - c[2]) * 0.88]),
      ink: INK, gray: GRAY, rule: RULE,
      onAccent: light ? INK : WHITE,
      accentText: light ? hexOf(dark) : accent
    };
  }
  function paletteVars(p) {
    return '--pf-accent:' + p.accent + ';--pf-accent-dark:' + p.accentDark + ';--pf-accent-text:' + p.accentText +
      ';--pf-tint:' + p.tint + ';--pf-on-accent:' + p.onAccent + ';--pf-ink:' + p.ink + ';--pf-gray:' + p.gray +
      ';--pf-rule:' + p.rule;
  }

  /* ── BRAND ──────────────────────────────────────────────────────────────── */
  /* The context endpoint already sanitises the logo URL; this is the same rule
     again because an override can carry one too. https, root-relative, or an
     image data URI — nothing that can run or reach a file. */
  function safeUrl(u) {
    var s = clean(u);
    if (/^https:\/\/[^\s"'<>\\]+$/i.test(s)) return s;
    if (/^\/(?!\/)[^\s"'<>\\]*$/.test(s)) return s;
    if (/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[a-z0-9+\/=]+$/i.test(s)) return s;
    return '';
  }

  /* brandFrom(context.brand, overrides) → the brand a deck is drawn with.
     The accent is the first of these that is a colour: overrides.accent,
     colors.primary, colors.accent, the logo's own colour (overrides.logoAccent,
     what brandFrom.logoAccent found), then the platform blue; accentSource
     says which, so a page knows whether reading the logo is worth it.
     name, logoUrl and tagline may be overridden (an empty tagline clears it);
     attribution and platformName may not — whether the platform's name
     appears is a white-label contract line (CLAUDE.md), not a deck setting. */
  function brandFrom(brand, overrides) {
    var b = brand && typeof brand === 'object' ? brand : {};
    var o = overrides && typeof overrides === 'object' ? overrides : {};
    var colors = b.colors && typeof b.colors === 'object' ? b.colors : null;
    var primary = colors ? hexColor(colors.primary) : null, second = colors ? hexColor(colors.accent) : null;
    var chain = [[o.accent, 'override'], [primary, 'primary'], [second, 'accent'], [o.logoAccent, 'logo'], [b.logoAccent, 'logo']];
    var accent = DEFAULT_ACCENT, source = 'default';
    for (var i = 0; i < chain.length; i++) {
      var hx = hexColor(chain[i][0]);
      if (hx) { accent = hx; source = chain[i][1]; break; }
    }
    return {
      resolved: true,
      name: clean(o.name) || clean(b.name),
      logoUrl: safeUrl(clean(o.logoUrl) ? o.logoUrl : b.logoUrl),
      tagline: clean(o.tagline != null ? o.tagline : b.tagline),
      attribution: clean(b.attribution),
      platformName: clean(b.platformName) || 'ClearSky-OMEGA',
      colors: colors ? { primary: primary, accent: second, ink: hexColor(colors.ink) } : null,
      logoAccent: source === 'logo' ? accent : null,
      accent: accent,
      accentSource: source,
      palette: palette(accent)
    };
  }

  /* The logo's dominant saturated colour, for a tenant that has set none.
     Transparent, grey, near-black and near-white pixels are ignored; hues are
     binned in 15° steps weighted by saturation, and the winning bin's average
     is the answer. A cross-origin logo without CORS fails to load or taints
     the canvas, and an all-black logo has no colour to give: each answers
     null and the caller keeps the default. cb is called once, always later. */
  function logoAccent(url, cb) {
    var done = false, src = safeUrl(url);
    function finish(v) {
      if (done) return;
      done = true;
      if (typeof cb === 'function') {
        try { cb(v || null); } catch (e) { /* the caller's own error; nothing to undo here */ }
      }
    }
    if (!src || typeof document === 'undefined' || typeof root.Image !== 'function') {
      setTimeout(function () { finish(null); }, 0);
      return;
    }
    var img = new root.Image(), timer = setTimeout(function () { finish(null); }, 6000);
    if (/^https:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = function () { clearTimeout(timer); finish(dominantColour(img)); };
    img.onerror = function () { clearTimeout(timer); finish(null); };
    img.src = src;
  }
  function dominantColour(img) {
    try {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) return null;
      var k = Math.min(1, 96 / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      var canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      var g = canvas.getContext('2d');
      g.drawImage(img, 0, 0, cw, ch);
      var d = g.getImageData(0, 0, cw, ch).data, bins = {}, best = null;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 160) continue;
        var px = [d[i], d[i + 1], d[i + 2]], hsl = hslOf(px);
        if (hsl[1] < 0.35 || hsl[2] < 0.18 || hsl[2] > 0.85) continue;
        var key = Math.floor(hsl[0] / 15) % 24, bin = bins[key] || (bins[key] = { w: 0, r: 0, g: 0, b: 0 });
        bin.w += hsl[1];
        bin.r += px[0] * hsl[1];
        bin.g += px[1] * hsl[1];
        bin.b += px[2] * hsl[1];
        if (!best || bin.w > best.w) best = bin;
      }
      return best && best.w >= 6 ? hexOf([best.r / best.w, best.g / best.w, best.b / best.w]) : null;
    } catch (e) {
      return null;   // a tainted canvas: the logo is on another origin without CORS
    }
  }
  brandFrom.logoAccent = logoAccent;

  /* A brand the page already resolved keeps its accent, and goes through the
     same sanitising again: render() cannot tell one built by brandFrom from
     one built by hand. */
  function resolveBrand(brand) {
    return brand && typeof brand === 'object' && brand.resolved === true ? brandFrom(brand, { accent: brand.accent }) : brandFrom(brand);
  }

  /* ── THE RESULT, READ ONCE ──────────────────────────────────────────────── */
  function context(result, brand, opts) {
    var r = result, o = opts && typeof opts === 'object' ? opts : {}, inp = r.inputs || {}, p = inp.project || {};
    var b = resolveBrand(brand), met = r.metrics || {}, inc = o.include || {};
    var bess = inp.bess && pos(inp.bess.kw) && pos(inp.bess.kwh) ? inp.bess : null;
    var solar = inp.solar && pos(inp.solar.kwDc) ? inp.solar : null, ppa = at(inp, 'revenue.ppa');
    var debt = r.debt && pos(r.debt.amount) ? r.debt : null;
    var city = clean(p.city), state = clean(p.state).toUpperCase(), lines = arr(at(r, 'capex.lines')), roof = 0;
    for (var i = 0; i < lines.length; i++) if (lines[i] && lines[i].asset === 'roof') roof += num(lines[i].amount) || 0;
    return {
      r: r, inp: inp, b: b, pal: b.palette, o: o, met: met,
      inc: { sizing: !!inc.sizing, cashflow: !!inc.cashflow, disclosures: !!inc.disclosures },
      page: 1,
      years: pos(inp.years),
      project: clean(p.name) || 'Pro forma',
      sponsor: clean(p.sponsor) || b.name,
      host: clean(p.host),
      hostDesc: clean(p.hostDescription),
      place: city && state ? city + ', ' + state : city || state,
      city: city,
      utility: clean(p.utility),
      acres: pos(p.acres),
      prepared: ymdOf(p.preparedDate) ? p.preparedDate : today(),
      solar: solar,
      bess: bess,
      ev: inp.ev && pos(inp.ev.kw) ? inp.ev : null,
      controller: !!inp.controller,
      ppa: solar && ppa && pos(ppa.rate1) ? ppa : null,
      bessMode: bess ? clean(at(inp, 'revenue.bess.mode')) || 'bundled' : '',
      debt: debt,
      levered: met.levered === true || !!debt,
      roof: roof > 0 ? roof : 0,
      itcFace: pos(at(r, 'tax.itc.face')) || 0,
      footerTitle: clean(o.footerTitle) || 'Investor One-Pager'
    };
  }
  function term(m) { return m.years ? trimmed(m.years, 0) : ''; }

  /* ── WHAT THE BASE CASE LEAVES OUT ──────────────────────────────────────── */
  /* The reference decks close on "returns shown are a floor" and name the
     upside. Here the upside is only what the inputs say is NOT in the base
     case — demand response configured but excluded, grid services a battery
     could earn and nobody has priced, a step-up nobody has booked, an ITC
     taken below the full PWA rate — so the claim is never invented. */
  function upsides(m) {
    var out = [], dr = at(m.inp, 'revenue.dr') || {}, drSet = pos(dr.perYear) || pos(dr.perKwYear);
    if (drSet && dr.inBase !== true) out.push('additional demand response revenue');
    if (m.bess && !drSet) out.push('grid market participation revenue');
    if (!pos(at(m.inp, 'tax.itc.stepUpPct'))) out.push('step-up capital');
    if (belowFullItc(m)) out.push('the full 30% PWA-compliant ITC rate');
    return out;
  }
  /* A solar rate cut to nothing by the construction deadline is a lost
     credit, not upside; the warnings carry it. */
  function belowFullItc(m) {
    var by = at(m.r, 'tax.itc.byAsset') || {}, cliff = hasWarning(m, 'SOLAR_CLIFF', 'critical'), k;
    for (k in by) {
      if (!own(by, k) || !by[k] || (k === 'solar' && cliff)) continue;
      var rate = num(by[k].ratePct);
      if (pos(by[k].basis) && rate !== null && rate < 30) return true;
    }
    return false;
  }
  function hasWarning(m, code, level) {
    var w = arr(m.r.warnings);
    for (var i = 0; i < w.length; i++) if (w[i] && w[i].code === code && (!level || w[i].level === level)) return true;
    return false;
  }

  /* ── THE WORDS ──────────────────────────────────────────────────────────── */
  /* EV joins the title only while the title stays one line at full size. */
  function titleText(m) {
    var parts = [], where = m.place ? ' in ' + m.place : '';
    if (m.solar) parts.push(fmt.kw(m.solar.kwDc) + ' DC solar');
    if (m.bess) parts.push(m.solar ? fmt.kwh(m.bess.kwh) + ' storage' : fmt.kw(m.bess.kw) + ' / ' + fmt.kwh(m.bess.kwh) + ' battery storage');
    if (!parts.length) return m.project;
    var withEv = m.ev ? parts.concat([fmt.kw(m.ev.kw) + ' EV charging']).join(' + ') + where : '';
    return withEv && withEv.length <= 58 ? withEv : parts.join(' + ') + where;
  }

  function share(part, whole) {
    var f = part / whole, named = [[0.5, 'roughly half'], [1 / 3, 'roughly a third'], [0.25, 'roughly a quarter'], [2 / 3, 'roughly two-thirds']];
    for (var i = 0; i < named.length; i++) if (Math.abs(f - named[i][0]) < 0.035) return named[i][1];
    return 'about ' + Math.round(f * 100) + '%';
  }

  /* The overview paragraph, in the reference's order: the ask, what the
     project is and where, what it sells and on what terms, and why. */
  function narrative(m) {
    var given = clean(m.o.narrative), terms;
    if (given) return given;
    terms = termsSentence(m);
    return askSentence(m) + (terms ? ' ' + terms : '') + ' ' + whySentence(m);
  }
  function askSentence(m) {
    var su = m.r.sourcesUses || {}, equity = num(su.equity), capex = num(at(m.r, 'capex.total')), ask = 'investment';
    var extras = [], solar = '', bess = '', sys = '', site = '';
    if (m.levered && equity !== null) {
      ask = an(grouped(equity, 0)) + ' ' + fmt.money(equity) + ' equity investment, alongside ' + fmt.money(m.debt ? m.debt.amount : su.debt) +
        ' of project debt' + (capex !== null ? ' for total CAPEX of ' + fmt.money(capex) : '') + ',';
    } else if (equity !== null) {
      ask = an(fmt.millions(equity)) + ' ' + fmt.millions(equity) + ' investment';
    }
    if (m.ev) extras.push(kwWords(m.ev.kw) + ' of EV charging infrastructure');
    if (m.controller) extras.push('a microgrid controller');
    if (m.solar) {
      solar = an(trimmed(m.solar.kwDc, 1)) + ' ' + kwWords(m.solar.kwDc) + ' DC ' + (m.roof ? 'rooftop ' : '') + 'solar photovoltaic array';
    }
    if (m.bess) {
      bess = an(trimmed(m.bess.kw, 1)) + ' ' + kwWords(m.bess.kw) + ' / ' + kwhWords(m.bess.kwh) + ' battery energy storage system (BESS)';
    }
    if (solar && bess) sys = ' which pairs ' + solar + ' with ' + list([bess].concat(extras));
    else if (solar || bess) sys = ' which installs ' + (solar || bess) + (extras.length ? ' with ' + list(extras) : '');
    else if (extras.length) sys = ' which installs ' + list(extras);
    if (m.acres) site = ' on ' + an(trimmed(m.acres, 2)) + ' ' + trimmed(m.acres, 2) + '-acre site' + (m.place ? ' in ' + m.place : '');
    else if (m.host) site = ' at ' + m.host + (m.hostDesc ? ', ' + m.hostDesc : '') + (m.place ? ' in ' + m.place : '');
    else if (m.place) site = ' in ' + m.place;
    return (m.sponsor || 'The sponsor') + ' is seeking ' + ask + ' in a project' + sys + site + '.';
  }
  function termsSentence(m) {
    var t = term(m), host = m.host || 'the host', hosts = m.host ? m.host + '\u2019s' : 'the host\u2019s';
    var lasting = t ? an(t) + ' ' + t + '-year ' : '';
    var b = at(m.inp, 'revenue.bess') || {}, part = pos(b.sharePct), fee = pos(b.fixedPerKwMonth), rise;
    if (m.ppa) {
      rise = num(m.ppa.escalatorPct);
      return 'The system will sell power to ' + host + ' under ' + (lasting || 'a ') + 'power purchase agreement priced at ' +
        fmt.rate(m.ppa.rate1) + ' in year one' + (rise ? ', escalating ' + fmt.percent(rise) + ' annually' : '') + '.' +
        (m.bessMode === 'shared-savings' && part ? ' Bill savings from the battery are shared, ' + fmt.percent(part) + ' to the project.' : '') +
        (m.bessMode === 'fixed' && fee ? ' The battery earns a fixed storage services fee of ' + fmt.money(fee) + '/kW-month.' : '');
    }
    if (!m.bess) return '';
    if (m.bessMode === 'shared-savings') {
      return 'The battery will lower ' + hosts + ' demand charges under ' + (lasting || 'a ') + 'shared-savings agreement' +
        (part ? ' that pays the project ' + fmt.percent(part) + ' of the bill savings' : '') + '.';
    }
    if (m.bessMode === 'fixed') {
      rise = num(b.escalatorPct);
      return 'The battery will lower ' + hosts + ' demand charges under ' + (lasting || 'an ') + 'energy services agreement' +
        (fee ? ' priced at ' + fmt.money(fee) + '/kW-month' : '') + (rise ? ', escalating ' + fmt.percent(rise) + ' annually' : '') + '.';
    }
    if (m.bessMode === 'host-owned') {
      var saved = pos(at(m.r, 'revenue.hostSavingsY1'));
      return upperFirst(host) + ' will own the battery and keep its bill savings' + (saved ? ', ' + fmt.money(saved) + ' in year one' : '') + '.';
    }
    return '';
  }
  function whySentence(m) {
    var capex = num(at(m.r, 'capex.total'));
    var drivers = [m.solar && m.bess ? 'Combined solar-plus-storage dispatch'
      : m.solar ? 'Solar generation' : m.bess ? 'Battery dispatch' : 'The project'];
    if (pos(at(m.r, 'revenue.year1.ev'))) drivers.push('EV charging revenue');
    if (m.roof && capex) drivers.push('a roof replacement (' + fmt.money(m.roof) + ', ' + share(m.roof, capex) + ' of project cost)');
    return list(drivers) + (drivers.length > 1 ? ' are' : ' is') + ' designed to lower the host\'s energy costs' +
      (m.bess && drivers.length === 1 ? ' and improve on-site resiliency' : '') +
      ', while the underlying ownership entity captures the project\'s ' +
      (m.itcFace ? 'investment tax credit and depreciation benefits.' : 'depreciation benefits.');
  }

  /* ── THE PAGES, AS DATA ─────────────────────────────────────────────────── */
  /* Every page is decided once, here: its words and figures, which bullets
     make the cut, which wording of a banner fits and the size a line is set
     at. It is then drawn twice — as HTML for the preview and the PDF, and as
     native PowerPoint objects (pptx()) — and neither renderer adds a word of
     its own, so the PDF and the PowerPoint cannot say different things. */

  /* A page head: the kicker's parts (a spaced dot between them), the title,
     and the size the title fits the room left of the logo at. */
  function heading(kicker, title) {
    return { kicker: kicker, title: title, pt: fitPt(title, TITLE_PT, TITLE_ROOM, 0.45, 14) };
  }
  /* A banner is one line in the reference, and its text is sized to stay one.
     Bold Calibri at the banner's tracking averages 0.41 em a character. */
  var PILL_EM = 0.43;
  function banner(parts) {
    var shown = [];
    for (var i = 0; i < parts.length; i++) if (parts[i]) shown.push(parts[i]);
    return { parts: shown, pt: fitPt(shown.join('  ' + DOT + '  '), 9.38, PILL_ROOM, PILL_EM, 7.2) };
  }
  /* The tagline as runs: the **starred** words bold in the accent, as the
     reference sets its last word, and any stray asterisks dropped. */
  function taglineRuns(m) {
    var s = smart(m.b.tagline), re = /\*\*([^*]+)\*\*/g, out = [], last = 0, hit;
    function plain(t) {
      t = t.replace(/\*\*/g, '');
      if (t) out.push({ t: t, b: false });
    }
    while ((hit = re.exec(s))) {
      plain(s.slice(last, hit.index));
      out.push({ t: hit[1], b: true });
      last = re.lastIndex;
    }
    plain(s.slice(last));
    return out;
  }
  function taglinePt(m, pt, widthPt) {
    return m.b.tagline ? fitPt(m.b.tagline.replace(/\*\*/g, ''), pt, widthPt, 0.54, 12) : pt;
  }

  /* ── 1 · COVER ──────────────────────────────────────────────────────────── */
  /* No logo: the brand's name is the mark. No name either: the project is,
     and the line under the rule is only the quarter, not the name again. */
  function coverPage(m) {
    var q = clean(m.o.quarterLabel) || fmt.quarter(m.prepared), bare = !m.b.logoUrl && !m.b.name;
    return { kind: 'cover', logo: !!m.b.logoUrl, name: m.b.name || m.project, tag: taglineRuns(m), tagPt: taglinePt(m, 21.8, 600),
      sub: bare ? [q] : [m.project, q] };
  }

  /* ── 2 · OVERVIEW ───────────────────────────────────────────────────────── */
  function overviewPage(m) {
    return { kind: 'overview', head: heading([m.footerTitle.toUpperCase(), 'PREPARED ' + fmt.date(m.prepared)], titleText(m)),
      narrative: noWidow(narrative(m)), kpis: kpiCards(m), flowLabel: 'How the system works', flow: flowModel(m), terms: banner(termsParts(m)) };
  }
  /* Four cards: [figure, caption, second caption line]. */
  function kpiCards(m) {
    var met = m.met, su = m.r.sourcesUses || {}, d = m.debt || {}, t = term(m);
    var over = 'over the ' + (t ? t + '-year ' : '') + 'term', paid = num(met.paybackYears) !== null;
    var payback = paid ? fmt.years(met.paybackYears) : DASH, unpaid = 'not reached within the ' + (t ? t + '-year ' : '') + 'term';
    if (m.levered) {
      return [
        [fmt.moneyCompact(su.equity), 'equity sought, alongside', fmt.money(d.amount) + ' debt' +
          (num(d.ratePct) !== null ? ' at ' + fmt.percent(d.ratePct) : '') + (pos(d.tenorYears) ? ', ' + trimmed(d.tenorYears, 0) + ' yr' : '')],
        [fmt.pct(met.afterTaxIrr, 1), 'after-tax equity IRR', 'levered, ' + over],
        [fmt.money(met.totalReturns), 'total investor returns', 'over life of project'],
        [payback, 'after-tax equity payback', paid ? '' : unpaid]
      ];
    }
    return [
      [fmt.moneyCompact(su.equity != null ? su.equity : su.totalUses), 'total investment sought', '100% equity, unlevered'],
      [fmt.pct(met.afterTaxIrr, 1), 'after-tax unlevered IRR', over],
      [fmt.money(met.totalReturns), 'total investor returns', 'over life of project'],
      [payback, 'after-tax payback', paid ? 'cash + depreciation' + (m.itcFace ? ' + ITC' : '') : unpaid]
    ];
  }
  /* What is on the site, left to right as power flows: [icon, label, caption]. */
  function flowItems(m) {
    var items = [];
    if (m.solar) {
      items.push(['solar', fmt.kw(m.solar.kwDc) + ' DC Solar', (m.roof ? 'Rooftop photovoltaic array' : 'Photovoltaic array') + ' on the host site']);
    }
    if (m.bess) {
      items.push(['bess', fmt.kw(m.bess.kw) + ' / ' + fmt.kwh(m.bess.kwh) + ' BESS',
        m.solar ? 'Stores energy for backup and load shifting' : 'Shaves peak demand and shifts load']);
    }
    if (m.controller) items.push(['controller', 'Microgrid Controller', 'Optimizes dispatch across the site']);
    if (m.ev) items.push(['ev', fmt.kw(m.ev.kw) + ' EV Charging', 'On-site charging infrastructure']);
    items.push(['host', m.host || 'Site Host',
      (m.hostDesc ? upperFirst(m.hostDesc.replace(/^(a|an|the)\s+/i, '')) : 'Host and off-taker') + (m.city ? ', ' + m.city : '')]);
    items.push(['grid', 'Utility Grid',
      m.utility ? 'Interconnected with ' + m.utility + ' for grid support' : 'Interconnected for grid support and resilience']);
    return items;
  }
  /* Six items set their labels a size down, as the reference does. A label
     too long for its column takes two lines, and then every label gets the
     same two-line row so the captions stay level. */
  function flowModel(m) {
    var items = flowItems(m), n = items.length, small = n >= 6, colW = (CONTENT_W + 17.76) / n, twoLine = false;
    for (var i = 0; i < n; i++) if (linesOf(items[i][1], small ? 7.94 : 9.38, colW - 8, 0.5) > 1) twoLine = true;
    return { items: items, small: small, twoLine: twoLine };
  }
  /* The deal in one line: the PPA, or how the battery is paid for. */
  function termsParts(m) {
    var t = term(m), b = at(m.inp, 'revenue.bess') || {}, host = m.host;
    if (m.ppa) {
      return [(t ? t + '-year ' : '') + 'PPA', fmt.rate(m.ppa.rate1) + ' in year one',
        pos(m.ppa.escalatorPct) ? fmt.percent(m.ppa.escalatorPct) + ' annual escalator' : '', host ? 'Off-taker: ' + host : ''];
    }
    if (m.bess && m.bessMode === 'shared-savings') {
      return [(t ? t + '-year ' : '') + 'shared-savings agreement',
        pos(b.sharePct) ? fmt.percent(b.sharePct) + ' of bill savings to the project' : '', host ? 'Host: ' + host : ''];
    }
    if (m.bess && m.bessMode === 'fixed') {
      return [(t ? t + '-year ' : '') + 'energy services agreement', pos(b.fixedPerKwMonth) ? fmt.money(b.fixedPerKwMonth) + '/kW-month' : '',
        pos(b.escalatorPct) ? fmt.percent(b.escalatorPct) + ' annual escalator' : '', host ? 'Host: ' + host : ''];
    }
    var saved = pos(at(m.r, 'revenue.hostSavingsY1'));
    return [m.bessMode === 'host-owned' ? 'Host-owned battery' : '', t ? t + '-year analysis' : '',
      saved ? fmt.money(saved) + ' year-one bill savings' : '', host ? 'Host: ' + host : ''];
  }

  /* ── 3 · THE NUMBERS ────────────────────────────────────────────────────── */
  function numbersPage(m) {
    var title = m.levered ? 'Returns, capital structure and operating economics' : 'Returns, tax basis and operating economics';
    return { kind: 'numbers', head: heading(['THE NUMBERS'], title), returns: returnsModel(m), tax: taxModel(m), revenue: revenueModel(m),
      floor: banner([floorText(m)]) };
  }
  /* The contract rounds each step to 0.1 of a point, so the build arrives in
     points (4.8). A build in fractions (0.048) is recognised by its total
     agreeing with the IRR and scaled — never re-derived. */
  function buildPts(m) {
    var b = m.met.irrBuild, irr = num(m.met.afterTaxIrr), total = b ? num(b.total) : null;
    if (total === null) return null;
    var k = irr !== null && Math.abs(total - irr) <= 0.0011 && Math.abs(total - irr * 100) > 0.11 ? 100 : 1;
    var out = { cashOnly: num(b.cashOnly), depreciation: num(b.depreciation), itc: num(b.itc), total: total * k };
    if (out.cashOnly === null || out.depreciation === null || out.itc === null) return null;
    out.cashOnly *= k;
    out.depreciation *= k;
    out.itc *= k;
    return out;
  }
  /* Wording only: do distributions rise or fall across the operating years?
     Year 1 (ITC proceeds) and the last year (reserve releases) are skipped. */
  function distributionTrend(m) {
    var rows = arr(m.r.rows);
    if (rows.length < 4) return '';
    var a = num(rows[1] && rows[1].distribution), z = num(rows[rows.length - 2] && rows[rows.length - 2].distribution);
    if (a === null || z === null || a <= 0) return '';
    return z > a * 1.05 ? 'escalate' : z < a * 0.95 ? 'decline' : 'hold roughly level';
  }
  /* The first column. Rows are [label, figure, class]; a levered deal spends
     the note's room on its distributions. */
  function returnsModel(m) {
    var met = m.met, t = term(m), yr = t ? t + '-yr' : 'term', build = buildPts(m);
    var out = { label: 'Returns', big: fmt.money(met.totalReturns), cap: 'total returns over the life of the project', rows: [], note: '',
      distLabel: 'Investor distributions', dist: [], build: null };
    if (m.levered) {
      var cash = num(at(m.r, 'tax.itc.cash')), sold = at(m.r, 'tax.itc.monetization') === 'transfer' && cash;
      var during = met.distributionsDuringDebt, after = met.distributionsAfterDebt, tenor = pos(m.debt && m.debt.tenorYears);
      out.rows.push(['After-tax equity IRR, levered ' + yr, fmt.pct(met.afterTaxIrr, 2)], ['Payback period, after-tax equity', fmt.years(met.paybackYears)]);
      if (num(met.year1Distribution) !== null) {
        out.dist.push(['Year 1' + (sold ? ', incl. ' + fmt.money(cash) + ' ITC transfer' : ''), fmt.money(met.year1Distribution)]);
      }
      if (during && num(during.min) !== null && num(during.max) !== null) {
        out.dist.push(['Through the ' + (tenor ? trimmed(tenor, 0) + '-year ' : '') + 'debt term', fmt.band(during.min, during.max)]);
      }
      if (after && num(after.min) !== null && num(after.max) !== null) out.dist.push(['Once debt is repaid', fmt.band(after.min, after.max)]);
    } else {
      var note = [], trend = distributionTrend(m), ups = upsides(m);
      if (num(met.year1Distribution) !== null) out.rows.push(['Investor cash distributions, Year 1', fmt.money(met.year1Distribution)]);
      out.rows.push(['After-tax unlevered IRR, ' + yr, fmt.pct(met.afterTaxIrr, 2)], ['Payback period, after-tax', fmt.years(met.paybackYears)]);
      if (trend) note.push('Distributions ' + trend + ' over the full ' + (t ? t + '-year ' : '') + 'term.');
      if (ups.length && num(met.afterTaxIrr) !== null) note.push('The IRR shown excludes ' + list(ups.slice(0, 2)) + '.');
      if (num(met.paybackYears) !== null) note.push('Payback reflects cash + depreciation' + (m.itcFace ? ' + ITC.' : '.'));
      out.note = noWidow(note.join(' '));
    }
    if (build) {
      var dep = build.depreciation;
      out.build = { label: 'IRR build (' + (t ? t + '-year, ' : '') + 'after tax)', note: '', rows: [
        ['Cash only (pre-tax operating cash flow)', '~' + build.cashOnly.toFixed(1) + '%'],
        ['Incremental depreciation effect', '~' + fmt.pts(dep) + ' pts'],
        ['Incremental ITC effect', '~' + fmt.pts(build.itc) + ' pts', 'pf-row-rule'],
        ['Total after-tax IRR', build.total.toFixed(1) + '%', 'pf-row-total']] };
      /* a levered column spends this space on the distributions */
      if (!m.levered && dep !== 0) {
        out.build.note = dep > 0 ? 'Depreciation adds to the cash-only return after tax.'
          : dep >= -1.5 ? 'Net depreciation timing effect is slightly negative on top of cash-only.'
            : 'Net of income tax, the depreciation effect is negative on top of cash-only.';
      }
    }
    return out;
  }

  function itcBuildWords(entry) {
    var build = arr(entry && entry.build), words = '';
    for (var i = 0; i < build.length; i++) {
      var p = num(build[i] && build[i].pts), label = clean(build[i] && build[i].label);
      if (p === null || !label) continue;
      words += (words ? (p < 0 ? ' ' + MINUS + ' ' : ' + ') : '') + trimmed(Math.abs(p), 2) + '% ' + lowerFirst(label);
    }
    return words;
  }
  /* Says what the engine's depreciation classes are and never more: all 5-yr
     MACRS says so plainly; a split (SAM's allocation puts a few percent in
     15- and 20-year property) gives the MACRS share and the other lives. */
  var CLASS_YEARS = { macrs5: 5, macrs7: 7, macrs15: 15, sl15: 15, sl20: 20, sl39: 39 };
  function depreciationWords(classes) {
    var total = 0, five = 0, lo = 0, hi = 0, k;
    for (k in classes || {}) {
      var v = own(classes, k) && CLASS_YEARS[k] ? pos(classes[k]) : null;
      if (!v) continue;
      total += v;
      if (k === 'macrs5') { five += v; continue; }
      lo = lo ? Math.min(lo, CLASS_YEARS[k]) : CLASS_YEARS[k];
      hi = Math.max(hi, CLASS_YEARS[k]);
    }
    if (!total) return '';
    if (five / total > 0.995) return '5-yr MACRS, fully depreciated by Year 6';
    var rest = 'over ' + (lo === hi ? lo : lo + NDASH + hi) + ' years';
    return five ? trimmed(five / total * 100, 0) + '% 5-yr MACRS, the rest ' + rest : 'depreciated ' + rest;
  }
  /* Three or more cost lines are named, with a unit cost where one reads —
     the one solar line in $/W, the one storage line in $/kWh; with two of
     either, neither can claim the whole system's size. Fewer lines give the
     all-in unit cost the reference quotes. */
  function costItem(m) {
    var capex = m.r.capex || {}, total = num(capex.total), lines = arr(capex.lines), parts = [], count = {}, unit = '', i;
    if (total === null) return null;
    if (lines.length >= 3) {
      for (i = 0; i < lines.length; i++) if (lines[i]) count[lines[i].asset] = (count[lines[i].asset] || 0) + 1;
      for (i = 0; i < lines.length && parts.length < 7; i++) {
        var L = lines[i] || {}, amt = num(L.amount), per = '';
        if (amt === null || !clean(L.label)) continue;
        if (L.asset === 'solar' && m.solar && count.solar === 1) per = ' ($' + (amt / (m.solar.kwDc * 1000)).toFixed(2) + '/W)';
        if (L.asset === 'storage' && m.bess && count.storage === 1) per = ' ($' + trimmed(amt / m.bess.kwh, 0) + '/kWh)';
        parts.push(lowerFirst(clean(L.label)) + ' ' + fmt.money(amt) + per);
      }
      return { k: 'Total installed cost', v: fmt.money(total) + (parts.length ? ' ' + DASH + ' ' + parts.join(', ') : ''), p: 1 };
    }
    if (m.solar && pos(capex.perWdc)) unit = '$' + num(capex.perWdc).toFixed(2) + '/W DC, ' + kwWords(m.solar.kwDc) + ' DC nameplate';
    else if (m.bess) unit = '$' + trimmed(total / m.bess.kwh, 0) + '/kWh, ' + kwhWords(m.bess.kwh) + ' nameplate';
    return { k: 'Total installed cost', v: fmt.money(total) + (unit ? ' (' + unit + ')' : ''), p: 1 };
  }
  /* The ITC rate as the engine built it, per asset, and the one rate when
     every asset with basis shares it. A 'blended' line (one installed cost
     for solar and storage) carries the rate but no build of its own: it
     borrows the build of the asset it was priced from. An entered rate has
     no build to show — the override IS the rate, and the engine has
     already flagged it. Rates compare to a hundredth of a point: a blended
     rate is an average and arrives as 26.600000000000005. */
  function sameRate(a, b) { return Math.abs(a - b) < 0.005; }
  function rateItem(m) {
    var by = at(m.r, 'tax.itc.byAsset') || {}, all = [], seen = [], same = true, entered = false, single, k, i, j, text;
    for (k in by) {
      if (!own(by, k) || !by[k] || num(by[k].ratePct) === null) continue;
      all.push({ asset: k, rate: num(by[k].ratePct), words: itcBuildWords(by[k]), statutory: by[k].statutory,
                 active: !!(pos(by[k].basis) || pos(by[k].amount)) });
    }
    for (i = 0; i < all.length; i++) {
      var e = all[i];
      if (!e.active) continue;
      for (j = 0; j < all.length && e.statutory == null; j++) {
        if (all[j].statutory != null && sameRate(all[j].rate, e.rate)) { e.statutory = all[j].statutory; if (!e.words) e.words = all[j].words; }
      }
      if (e.statutory === false) { e.words = ''; entered = true; }
      seen.push(e);
    }
    if (!seen.length) return { item: null, single: null };
    single = seen[0].rate;
    for (i = 0; i < seen.length; i++) {
      if (!sameRate(seen[i].rate, single)) single = null;
      if (single === null || seen[i].words !== seen[0].words || seen[i].statutory !== seen[0].statutory) same = false;
    }
    if (same) {
      text = fmt.percent(seen[0].rate) + ' federal ITC' + (seen[0].words ? ' ' + DASH + ' ' + seen[0].words : '') +
        (entered ? ', entered rather than built from the statute' : '') + ' (no state ITC)';
    } else {
      var bits = [];
      for (i = 0; i < seen.length; i++) {
        bits.push((seen[i].asset === 'blended' ? 'Solar + storage' : upperFirst(seen[i].asset)) + ' ' + fmt.percent(seen[i].rate) +
          (seen[i].statutory === false ? ' (entered)' : seen[i].words ? ' (' + seen[i].words + ')' : ''));
      }
      text = bits.join('; ') + '; no state ITC';
    }
    return { item: { k: 'ITC rate build', v: text, p: 5 }, single: single };
  }
  /* The second column: its bullets, already fitted to the column (see fit),
     and the footnote that sits at its foot. */
  function taxModel(m) {
    var t = m.r.tax || {}, itc = t.itc || {}, items = [], cost = costItem(m), rate = rateItem(m);
    var qb = pos(itc.qualifyingBasis), qp = num(itc.qualifyingPctOfCost), step = pos(at(m.inp, 'tax.itc.stepUpPct'));
    var db = pos(t.depreciableBasis), dp = num(t.depreciablePctOfCost), after = pos(t.depreciableAfterHaircut);
    var boc = t.boc || at(m.inp, 'project.bocMonth'), pis = t.pis || at(m.inp, 'project.pisMonth');
    if (cost) items.push(cost);
    if (qb) {
      items.push({ k: 'ITC-eligible (qualifying) basis', v: fmt.money(qb) +
        (qp !== null ? ' ' + DASH + ' ' + fmt.percent(qp, 1) + ' of installed cost' : '') +
        (step ? ', including a ' + fmt.percent(step, 1) + ' fair-market-value step-up' : ''), p: 3 });
    }
    if (db) {
      var rest = dp !== null && dp < 99.95 ? '; ' + fmt.percent(100 - dp, 1) + ' treated as non-depreciable' +
        (pos(at(m.inp, 'allocation.none')) ? ' (e.g. sales tax)' : '') : '';
      items.push({ k: 'Total depreciable basis',
        v: fmt.money(db) + (dp !== null ? ' ' + DASH + ' ' + fmt.percent(dp, 1) + ' of installed cost' + rest : ''), p: 8 });
    }
    if (rate.item) items.push(rate.item);
    if (m.itcFace) {
      var cash = num(itc.cash), how = '';
      if (rate.single !== null && qb) how = ' (' + fmt.percent(rate.single) + ' ' + TIMES + ' ' + fmt.money(qb) + ' eligible basis)';
      if (itc.monetization === 'transfer' && cash !== null) {
        how += ', transferred' + (pos(itc.transferPrice) ? ' at $' + num(itc.transferPrice).toFixed(2) + '/$1' : '') +
          ' for ' + fmt.money(cash) + ' net cash, received in Year 1';
      } else {
        how += t.appetite === 'nol' ? ', used against federal tax as it can be absorbed' : ', claimed against federal tax in Year 1';
      }
      items.push({ k: 'ITC amount', v: fmt.money(m.itcFace) + how, p: 2 });
    }
    if (after) {
      var method = depreciationWords(t.classes), bonus = pos(t.bonusPct);
      items.push({ k: 'Depreciable basis after ITC haircut', v: fmt.money(after) + (m.itcFace ? ' (reduced by 50% of the ITC)' : '') +
        (method ? '; ' + method + (t.convention === 'mid-quarter' ? ', mid-quarter convention' : '') : '') +
        (bonus ? '; ' + fmt.percent(bonus, 1) + ' bonus depreciation in Year 1' : ''), p: 4 });
    }
    if (num(t.statePct) !== null) {
      items.push({ k: 'State tax rate', v: fmt.percent(t.statePct) +
        (num(t.combinedPct) !== null ? ' (' + fmt.percent(t.combinedPct) + ' combined with federal)' : ''), p: 10 });
    }
    if (ymdOf(boc)) items.push({ k: 'Beginning of construction', v: fmt.month(boc), p: 7 });
    if (ymdOf(pis)) items.push({ k: 'Placed-in-service target', v: fmt.month(pis), p: 6 });
    /* recapture only matters where there is a credit to recapture */
    if (m.itcFace) {
      items.push({ k: 'Recapture period end', p: 9, v: ymdOf(t.recaptureEnd)
        ? fmt.month(t.recaptureEnd) + ' (5 years from placed in service)' : '5 years from placed-in-service date' });
    }

    var note = m.levered || step ? ''
      : '* Opportunity to optimize tax benefits and levered returns ' + DASH + ' e.g. step-up capital in tax syndication.';
    var budget = COL_H - BULLET_TOP - 3.4 - (note ? 8 + linesOf(note, 7.2, COL_W) * BULLET_LINE : 0), set = fit(items, budget);
    return { label: 'Tax', items: set.items, gap: set.gap, note: note ? noWidow(note) : '' };
  }

  /* What the battery earns, by how the deal pays for it (contract §1
     revenue.bess.mode). A bundled battery earns nothing separately: its
     value is the host's, and the line says so. */
  function storageItem(m) {
    var rev = m.r.revenue || {}, b = at(m.inp, 'revenue.bess') || {}, host = pos(rev.hostSavingsY1), y1 = num(at(rev, 'year1.bess'));
    if (m.bessMode === 'shared-savings' && y1 !== null) {
      return { k: 'Storage revenue', v: fmt.money(y1) + ' in Year 1' +
        (pos(b.sharePct) && host ? ' ' + DASH + ' ' + fmt.percent(b.sharePct) + ' of ' + fmt.money(host) + ' host bill savings' : ''), p: 2 };
    }
    if (m.bessMode === 'fixed' && y1 !== null) {
      return { k: 'Storage services fee', v: fmt.money(y1) + ' in Year 1' +
        (pos(b.fixedPerKwMonth) ? ' (' + fmt.money(b.fixedPerKwMonth) + '/kW-month on ' + kwWords(m.bess.kw) + ')' : ''), p: 2 };
    }
    if (m.bessMode === 'host-owned' && (y1 !== null || host)) {
      return { k: 'Host bill savings', v: fmt.money(y1 !== null ? y1 : host) + ' in Year 1, kept by the host-owner', p: 2 };
    }
    if (host) {
      return { k: 'Host bill savings from storage', v: fmt.money(host) + ' in Year 1, delivered under the ' + (m.ppa ? 'PPA' : 'agreement') +
        ' (not separate revenue)', p: 8 };
    }
    return null;
  }
  /* The third column: its bullets, fitted above the sources & uses table
     that sits at its foot. */
  function revenueModel(m) {
    var rev = m.r.revenue || {}, y1 = rev.year1 || {}, inp = m.inp, t = term(m), items = [], i;
    var b = at(inp, 'revenue.bess') || {}, storage = m.bess ? storageItem(m) : null;
    var replaced = replacementWords(at(inp, 'bess.sizing.replacements')), repMode = at(inp, 'bessReplacement.mode');
    var dr = at(inp, 'revenue.dr') || {}, dr1 = pos(y1.dr), ev = at(inp, 'revenue.ev') || {}, ev1 = pos(y1.ev);
    var other = arr(at(inp, 'revenue.other')), other1 = pos(y1.other), names = [], opex = m.r.opex || {};
    if (m.solar) {
      var gross = pos(rev.solarKwh1) || pos(m.solar.kwh1), net = pos(rev.solarNetKwh1) || pos(m.solar.netKwh1);
      if (gross) {
        items.push({ k: 'Year 1 production', v: trimmed(gross, 0) + ' kWh AC' +
          (net && net < gross - 0.5 ? ' to grid gross (' + trimmed(net, 0) + ' kWh net of ~' + trimmed(gross - net, 0) + ' kWh grid draw)' : '') +
          (pos(m.solar.availabilityLossPct) ? ', less a ' + fmt.percent(m.solar.availabilityLossPct) + ' availability allowance' : ''), p: 1 });
      }
    }
    if (m.ppa) {
      items.push({ k: 'PPA rate, Year 1', v: fmt.rate(m.ppa.rate1) + ' (' + trimmed(m.ppa.rate1 * 100, 2) + '\u00a2/kWh)', p: 2 });
      if (num(m.ppa.escalatorPct) !== null) items.push({ k: 'Escalator', v: fmt.percent(m.ppa.escalatorPct) + ' per year', p: 4 });
    } else if (storage) {
      /* without a PPA the battery's revenue leads, and its escalator is the utility's */
      items.push(storage);
      storage = null;
      if (pos(b.escalatorPct)) items.push({ k: 'Escalator', v: fmt.percent(b.escalatorPct) + ' per year (utility rates)', p: 5 });
    }
    if (t) items.push({ k: 'Term', v: t + ' years modeled', p: 6 });
    if (m.ppa && num(y1.ppa) !== null) items.push({ k: 'Year 1 PPA revenue', v: fmt.money(y1.ppa), p: 3 });
    if (storage) items.push(storage);
    if (m.bess && replaced && repMode !== 'none') {
      items.push({ k: 'Battery replacement', v: replaced + (repMode === 'expense' ? ', paid from operating cash' : ', funded from a reserve'), p: 9 });
    }
    if (m.ppa && num(m.met.lppaCents) !== null) items.push({ k: 'Levelized PPA price (nominal)', v: fmt.cents(m.met.lppaCents), p: 7 });
    if (m.solar && num(m.met.lcoeCents) !== null) items.push({ k: 'LCOE (nominal)', v: fmt.cents(m.met.lcoeCents), p: 7 });
    if (m.bess && !m.solar && num(m.met.lcosCents) !== null) items.push({ k: 'LCOS (nominal)', v: fmt.cents(m.met.lcosCents) + ' discharged', p: 7 });
    if (pos(dr.perYear) || pos(dr.perKwYear)) {
      var amount = dr1 ? fmt.money(dr1) : pos(dr.perYear) ? fmt.money(dr.perYear) : fmt.money(dr.perKwYear) + '/kW-yr';
      items.push({ k: 'Demand response revenue', v: dr.inBase === true ? amount + ' in Year 1, included in the base case'
        : 'up to ' + amount + (dr1 || pos(dr.perYear) ? '/yr' : '') + ', not in the base case', p: 5 });
    } else if (m.bess) {
      items.push({ k: 'Grid market participation revenue',
        v: '$0 modeled ' + DASH + ' frequency regulation and capacity market upside not yet quantified', p: 10 });
    }
    if (m.ev && ev1) {
      items.push({ k: 'EV charging revenue', v: fmt.money(ev1) + ' in Year 1' +
        (pos(ev.perKwYear) ? ' (' + fmt.money(ev.perKwYear) + '/kW-yr on ' + kwWords(m.ev.kw) + ')' : '') + ', included in the base case', p: 4 });
    }
    if (other1) {
      for (i = 0; i < other.length; i++) if (other[i] && clean(other[i].label)) names.push(clean(other[i].label));
      items.push({ k: names.length === 1 ? names[0] : 'Other revenue',
        v: fmt.money(other1) + ' in Year 1' + (names.length > 1 ? ' (' + list(names) + ')' : ''), p: 6 });
    }
    if (num(opex.year1Total) !== null) {
      items.push({ k: 'Total Year 1 Opex', v: fmt.money(opex.year1Total) +
        (pos(opex.escalatorPct) ? ', escalating at ' + fmt.percent(opex.escalatorPct) + '/yr' : ''), p: 3 });
    }
    var su = sourcesUses(m), set = fit(items, su.budget);
    return { label: 'Revenue & opex', items: set.items, gap: set.gap, su: su };
  }

  /* The sources & uses table sits at the foot of the third column; what it
     takes is what the bullets above it cannot have. Rows are [label, figure,
     class]; the last is the total. */
  function sourcesUses(m) {
    var su = m.r.sourcesUses || {}, uses = arr(su.uses), shown = [], total = num(su.totalUses), rows = [], note, i;
    for (i = 0; i < uses.length; i++) {
      /* a use of nothing (no reserve, no fee) is not a line */
      if (uses[i] && clean(uses[i].label) && num(uses[i].amount) !== null && Math.round(num(uses[i].amount)) !== 0) shown.push(uses[i]);
    }
    if (!shown.length && total === null) return { rows: null, note: '', budget: COL_H - BULLET_TOP - 7.1 };
    for (i = 0; i < shown.length; i++) rows.push([clean(shown[i].label), fmt.money(shown[i].amount), i === shown.length - 1 ? 'pf-row-rule' : '']);
    rows.push(['Total uses', fmt.money(total), 'pf-row-total']);
    if (m.levered && m.debt) {
      var capex = pos(at(m.r, 'capex.total')), dscr = num(m.debt.dscrMin), covenant = num(at(m.inp, 'debt.dscrMin')), bits = [];
      if (capex) bits.push(trimmed(m.debt.amount / capex * 100, 0) + '% of CAPEX');
      if (dscr !== null) {
        bits.push('min DSCR ' + dscr.toFixed(2) + TIMES + (covenant !== null ? ' vs ' + covenant.toFixed(2) + TIMES + ' covenant' : ''));
      }
      note = 'Sources: debt ' + fmt.money(m.debt.amount) + (bits.length ? ' (' + bits.join('; ') + ')' : '') +
        ' plus equity ' + fmt.money(su.equity) + ' = ' + fmt.money(total) + '.';
    } else {
      note = 'Sources: 100% equity ' + fmt.money(su.equity != null ? su.equity : total) + '  ' + DOT + '  Debt $0 (unlevered).';
    }
    var height = 12 + 11 + 4.19 + shown.length * 13.37 + 15.53 + 7.06 + linesOf(note, 7.22, COL_W) * 8.4;
    return { label: 'Sources & uses', rows: rows, note: noWidow(note), budget: COL_H - BULLET_TOP - 7.1 - height };
  }

  /* The banner under the columns. With every upside named it can run long,
     so the reference's wording gives way to a shorter one before the type
     gets smaller. */
  function floorText(m) {
    var ups = upsides(m), text;
    if (!ups.length) return 'Modeled returns are after tax on the base case shown, with no upside revenue assumed.';
    text = 'Modeled returns shown are a floor ' + DASH + ' actual returns may be higher with ' + list(ups) + '.';
    if (fitPt(text, 9.38, PILL_ROOM, PILL_EM, 7.2) < 9.38) text = 'Modeled returns shown are a floor ' + DASH + ' upside from ' + list(ups) + '.';
    return text;
  }

  /* The first battery replacement the sizing engine scheduled, as words. */
  function replacementWords(reps) {
    var first = arr(reps)[0] || {};
    return pos(first.year) ? 'Year ' + trimmed(first.year, 0) + (pos(first.cost) ? ', ' + fmt.money(first.cost) : '') : '';
  }

  /* ── APPENDIX · SIZING BASIS ────────────────────────────────────────────── */
  function niceStep(max, ticks) {
    var raw = max / ticks, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  /* Monthly peaks before and with the battery, and the axis they share: a
     step of about a quarter of the tallest bar, rounded to a readable one. */
  function peakSeries(months) {
    var n = months.length, max = 0, out = { unit: 'kW', series: ['Before', 'With battery'], labels: [], before: [], after: [] }, i;
    for (i = 0; i < n; i++) max = Math.max(max, num(at(months[i], 'peakKw')) || 0, num(at(months[i], 'afterKw')) || 0);
    if (!(max > 0)) return null;
    out.step = niceStep(max, 4);
    out.top = Math.ceil(max / out.step) * out.step;
    out.every = n > 12 ? 2 : 1;
    for (i = 0; i < n; i++) {
      var mo = months[i] || {};
      out.labels.push(clean(mo.label).slice(0, 3));
      out.before.push(num(mo.peakKw) || 0);
      out.after.push(num(mo.afterKw));
    }
    return out;
  }
  /* What the sizing engine chose and why, from the size result the model
     carried (inputs.bess.sizing). A manual size has none and gets no page;
     the NO_SIZING warning says so in the disclosures. */
  function sizingPage(m) {
    var s = m.bess && m.bess.sizing;
    if (!s || !s.system || !pos(s.system.kw)) return null;
    var sys = s.system, sav = s.savings || {}, load = s.load || {}, alts = arr(s.alternatives), rows = [], saving = [], altRows = [], i;
    var months = pos(load.months) ? ', ' + trimmed(load.months, 0) + ' months' : '';
    var basis = s.basis === 'interval' ? (pos(load.intervalMin) ? trimmed(load.intervalMin, 0) + '-minute interval data' : 'Interval data') + months
      : 'Monthly bills' + months;
    var delivered = pos(sys.effectiveDurationH) && Math.abs(sys.effectiveDurationH - sys.durationH) > 0.05
      ? ' (' + trimmed(sys.effectiveDurationH, 2) + ' h delivered)' : '';
    rows.push(['Load basis', basis], ['Power', kwWords(sys.kw)]);
    if (pos(sys.usableKwh)) rows.push(['Usable energy', kwhWords(sys.usableKwh)]);
    if (pos(sys.nameplateKwh)) rows.push(['Nameplate energy', kwhWords(sys.nameplateKwh)]);
    if (pos(sys.durationH)) rows.push(['Duration', trimmed(sys.durationH, 1) + ' h' + delivered]);
    if (pos(s.annualPeakKw)) rows.push(['Annual peak demand', kwWords(s.annualPeakKw)]);
    if (pos(s.throughputKwhYr)) rows.push(['Discharge per year', kwhWords(s.throughputKwhYr)]);
    if (pos(s.cyclesYr)) rows.push(['Full cycles per year', trimmed(s.cyclesYr, 0)]);
    rows.push(['Degradation', s.degradation === 'measured' ? 'Measured on this load' : 'Scaled by state of health']);
    if (pos(s.minSohPct)) rows.push(['Replace below', trimmed(s.minSohPct, 0) + '% state of health']);
    rows.push(['Replacement', replacementWords(s.replacements) || 'None within the term']);
    if (num(sav.demandY1) !== null) saving.push(['Demand charge savings', fmt.money(sav.demandY1)]);
    if (num(sav.lossY1) !== null) saving.push(['Charging losses', fmt.money(-Math.abs(sav.lossY1))]);
    if (num(sav.netY1) !== null) saving.push(['Net bill savings', fmt.money(sav.netY1), 'pf-row-total']);
    if (num(sav.p90Y1) !== null) saving.push(['Downside (P90) net savings', fmt.money(sav.p90Y1)]);
    for (i = 0; i < alts.length; i++) {
      var a = alts[i] || {};
      if (!pos(a.durationH) || !pos(a.kw)) continue;
      altRows.push({ on: !!a.chosen, cells: [trimmed(a.durationH, 1) + ' h', kwWords(a.kw), pos(a.usableKwh) ? kwhWords(a.usableKwh) : DASH,
        fmt.money(a.netY1), fmt.money(a.npv)] });
    }
    var line = 'Sized with the ' + m.b.platformName + ' battery engine on ' + lowerFirst(basis) + ': ' + fmt.kw(sys.kw) +
      (pos(sys.usableKwh) ? ' / ' + fmt.kwh(sys.usableKwh) + ' usable' : '') +
      (num(sav.netY1) !== null ? ', ' + fmt.money(sav.netY1) + ' net bill savings in year one.' : '.');
    return { kind: 'sizing', head: heading(['APPENDIX ' + DOT + ' SIZING BASIS'], 'How the battery was sized'),
      labels: { system: 'System', chart: 'Monthly peak demand', savings: 'Year-1 savings', alternatives: 'Alternatives by duration' },
      system: rows, chart: peakSeries(arr(s.months)), savings: saving, alternatives: altRows,
      altHead: ['Duration', 'Power', 'Usable', 'Net year 1', 'Screening NPV'], line: banner([line]) };
  }

  /* ── APPENDIX · ANNUAL CASH FLOW ────────────────────────────────────────── */
  /* Costs arrive as positive amounts (opex, debt service, tax paid) and are
     shown the way a cash-flow statement shows them, in brackets; a zero is a
     dash, so the eye finds the years that carry something. null is an empty
     cell. */
  function cashText(v, costLike) {
    var n = num(v);
    if (n === null) return null;
    var r = Math.round(costLike ? -n : n);
    return r === 0 ? NDASH : r < 0 ? '(' + grouped(r, 0) + ')' : grouped(r, 0);
  }
  function cashflowPages(m) {
    var rows = arr(m.r.rows), cols = [['Year', null]], heads = [], body = [], eq = num(at(m.r, 'year0.equity')), pages = [], i, c;
    if (!rows.length) return [];
    if (m.solar) cols.push(['Solar kWh', 'solarKwh']);
    cols.push(['Revenue', 'revenue'], ['Opex', 'opex', true], ['EBITDA', 'ebitda']);
    if (m.levered) cols.push(['Debt service', 'debtService', true]);
    cols.push(['Pre-tax cash', 'preTaxCash'], ['Tax depreciation', 'depreciationFed'],
      ['State tax', 'stateTax', true], ['Federal tax', 'fedTax', true]);
    if (m.itcFace) cols.push(['ITC', 'itc']);
    cols.push(['After-tax cash', 'afterTaxCash'], ['Cumulative', 'cumulativeAfterTax']);
    for (c = 0; c < cols.length; c++) heads.push(cols[c][0]);
    /* year 0 is the equity going in: the cash columns and nothing else */
    if (eq !== null) {
      var zero = [];
      for (c = 0; c < cols.length; c++) {
        zero.push(!cols[c][1] ? '0' : /^(preTaxCash|afterTaxCash|cumulativeAfterTax)$/.test(cols[c][1]) ? cashText(-Math.abs(eq)) : null);
      }
      body.push({ y0: true, cells: zero });
    }
    for (i = 0; i < rows.length; i++) {
      var r = rows[i] || {}, cells = [];
      for (c = 0; c < cols.length; c++) {
        cells.push(cols[c][1] ? cashText(r[cols[c][1]], cols[c][2]) : num(r.year) !== null ? trimmed(r.year, 0) : String(i + 1));
      }
      body.push({ y0: false, cells: cells });
    }
    /* year 0 and a 30-year term fit one page; a longer term splits evenly */
    var chunks = Math.ceil(body.length / 31), per = Math.ceil(body.length / chunks);
    var title = (term(m) ? term(m) + '-year ' : '') + 'after-tax cash flow to the investor';
    for (var p = 0; p < chunks; p++) {
      pages.push({ kind: 'cashflow', head: heading(['APPENDIX ' + DOT + ' ANNUAL CASH FLOW' + (chunks > 1 ? ' ' + DOT + ' ' + (p + 1) + ' OF ' + chunks : '')], title),
        cols: heads, rows: body.slice(p * per, (p + 1) * per),
        note: 'Nominal dollars. Year 0 is the equity investment. Costs and taxes paid are in brackets; a tax benefit is cash in.' });
    }
    return pages;
  }

  /* ── APPENDIX · DISCLOSURES ─────────────────────────────────────────────── */
  /* Blocks are a heading ({h}), a bullet ({li}, with the warning's level and
     word when it is a warning) or a paragraph ({p}; the method carries the
     engine version, the legal line is set apart). */
  var LEVELS = { critical: 0, warn: 1, info: 2 };
  function rank(w) { return LEVELS[w.level] == null ? 3 : LEVELS[w.level]; }
  function disclosurePages(m) {
    var warns = arr(m.r.warnings).filter(function (w) { return w && clean(w.text); });
    var assumptions = arr(m.r.assumptions).filter(function (a) { return clean(a); });
    var version = clean(m.r.version), blocks = [], pages = [[]], used = 0, out = [], i;
    warns.sort(function (a, b) { return rank(a) - rank(b); });
    if (warns.length) blocks.push({ h: 'Warnings' });
    for (i = 0; i < warns.length; i++) {
      var lvl = LEVELS[warns[i].level] != null ? warns[i].level : 'info', word = lvl === 'warn' ? 'Warning' : upperFirst(lvl);
      blocks.push({ li: clean(warns[i].text), lvl: lvl, word: word, text: word + ': ' + clean(warns[i].text) });
    }
    if (assumptions.length) blocks.push({ h: 'Assumptions' });
    for (i = 0; i < assumptions.length; i++) blocks.push({ li: clean(assumptions[i]), text: clean(assumptions[i]) });
    var method = 'Single-owner after-tax cash flow, SAM-consistent: equity at year 0, operations from year 1, the investment tax ' +
      'credit in year 1, depreciation on a basis reduced by half the credit, and the reserves, taxes and debt set out in the ' +
      'assumptions. Modeled by the ' + m.b.platformName + ' pro forma engine';
    var legal = 'For discussion only. This is not an offer to sell or a solicitation of an offer to buy any security. Projections ' +
      'are estimates on the assumptions listed and are not guarantees of future results; tax treatment depends on the facts and ' +
      'the law when a return is filed ' + DASH + ' confirm with tax counsel.';
    blocks.push({ h: 'Method' });
    blocks.push({ p: method, version: version, text: method + ', version ' + version + '.' });
    blocks.push({ p: legal, legal: true, text: legal });

    /* The browser balances the three columns; what is decided here is only
       where a page ends, from estimated heights, so a long list of
       assumptions carries onto a second page instead of running off the
       first. The estimate is pessimistic and a page is filled to 85%. */
    for (i = 0; i < blocks.length; i++) {
      var bk = blocks[i], h = bk.h ? 19.5 : linesOf(bk.text, 6.8, bk.li != null ? COL_W - 9 : COL_W) * 8.2 + 4.2, pg = pages[pages.length - 1];
      if (used + h > 3 * DIS_H * 0.85 && pg.length) {
        var carry = pg[pg.length - 1].h ? [pg.pop()] : [];   // a heading never ends a page
        pages.push(carry);
        used = carry.length ? 19.5 : 0;
      }
      pages[pages.length - 1].push(bk);
      used += h;
    }
    for (var p = 0; p < pages.length; p++) {
      out.push({ kind: 'disclosures', blocks: pages[p],
        head: heading(['APPENDIX ' + DOT + ' DISCLOSURES' + (pages.length > 1 ? ' ' + DOT + ' ' + (p + 1) + ' OF ' + pages.length : '')],
          'Assumptions, method and warnings') });
    }
    return out;
  }

  /* ── LAST · CLOSE ───────────────────────────────────────────────────────── */
  /* The reference's close: the tagline large, the rule, then the logo left of
     centre and the contact lines right of it. Without a logo the lines sit
     centred under the rule, led by the name when the tagline took the large
     line; the name is never printed twice. */
  function closingPage(m) {
    var given = arr(at(m.o, 'contact.lines')), lines = [], i;
    for (i = 0; i < given.length && lines.length < 6; i++) if (clean(given[i])) lines.push(clean(given[i]));
    if (!lines.length) lines.push('Thank you');
    return { kind: 'close', logo: !!m.b.logoUrl, tag: taglineRuns(m), tagPt: taglinePt(m, 36.9, 672), name: m.b.name,
      big: m.b.name || m.project, lines: lines };
  }

  /* ── THE DECK ───────────────────────────────────────────────────────────── */
  /* The pages in order, numbered as printed; null for a result that did not
     run. */
  function deck(result, brand, opts) {
    if (!result || typeof result !== 'object' || result.ok === false || !result.inputs) return null;
    var m = context(result, brand, opts), pages = [coverPage(m), overviewPage(m), numbersPage(m)], sz;
    if (m.inc.sizing && (sz = sizingPage(m))) pages.push(sz);
    if (m.inc.cashflow) pages = pages.concat(cashflowPages(m));
    if (m.inc.disclosures) pages = pages.concat(disclosurePages(m));
    pages.push(closingPage(m));
    for (var i = 0; i < pages.length; i++) pages[i].n = i + 1;
    return { m: m, pages: pages };
  }

  /* ── HTML ───────────────────────────────────────────────────────────────── */
  function section(m, kind, inner) {
    return '<section class="pf-slide pf-' + kind + '" data-page="' + kind + '" style="' + paletteVars(m.pal) + '">' + inner + '</section>';
  }
  function logoImg(m) { return '<img src="' + esc(m.b.logoUrl) + '" alt="">'; }
  function sized(pt, full) { return pt < full ? ' style="font-size:' + pt + 'pt"' : ''; }
  function head(m, h) {
    return '<div class="pf-kicker">' + dotJoin(h.kicker) + '</div>' +
      '<h1 class="pf-title"' + sized(h.pt, TITLE_PT) + '>' + esc(h.title) + '</h1>' +
      '<div class="pf-mark">' + (m.b.logoUrl ? logoImg(m) : m.b.name ? '<span class="pf-mark-name">' + esc(m.b.name) + '</span>' : '') + '</div>';
  }
  function foot(m, n) {
    return '<div class="pf-foot"><span class="pf-foot-l">' + (m.b.name ? esc(m.b.name) + ' ' + DASH + ' ' : '') + esc(m.project) +
      '<span class="pf-bar">|</span>' + esc(m.footerTitle) + '</span><span class="pf-foot-r">' +
      (m.b.attribution ? '<span class="pf-foot-attr">' + esc(m.b.attribution) + '</span>' : '') + n + '</span></div>';
  }
  function row(r) {
    return '<div class="pf-row' + (r[2] ? ' ' + r[2] : '') + '"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>';
  }
  function rows(list) {
    var out = '';
    for (var i = 0; i < list.length; i++) out += row(list[i]);
    return out;
  }
  function dotJoin(parts) {
    var out = [];
    for (var i = 0; i < parts.length; i++) if (parts[i]) out.push(esc(parts[i]));
    return out.join('<span class="pf-dot">' + DOT + '</span>');
  }
  function pill(b, cls) {
    return '<div class="pf-pill ' + cls + '"' + sized(b.pt, 9.38) + '>' + dotJoin(b.parts) + '</div>';
  }
  function runsHtml(runs) {
    var out = '';
    for (var i = 0; i < runs.length; i++) out += runs[i].b ? '<b>' + esc(runs[i].t) + '</b>' : esc(runs[i].t);
    return out;
  }

  /* Bullets are { k: label, v: text, p: priority — the highest drops first }. */
  function bullets(set) {
    var out = [], items = set.items;
    for (var i = 0; i < items.length; i++) out.push('<li><b>' + esc(items[i].k) + ':</b> ' + esc(noWidow(items[i].v)) + '</li>');
    return '<ul class="pf-bul"' + (set.gap < BULLET_GAP ? ' style="--pf-gap:' + set.gap.toFixed(2) + 'pt"' : '') + '>' + out.join('') + '</ul>';
  }
  /* Fits a column's bullets into budgetPt: first by closing the gaps down to
     the reference's tightest, then by dropping the least important bullet.
     The line estimate is pessimistic on purpose: a column with air at the
     bottom reads fine, one that runs into the banner does not. */
  function fit(items, budgetPt) {
    var keep = items.slice(), i;
    for (;;) {
      var text = 0;
      for (i = 0; i < keep.length; i++) text += linesOf(keep[i].k + ': ' + keep[i].v, 7.22, BULLET_W) * BULLET_LINE;
      var gap = keep.length > 1 ? (budgetPt - text) / (keep.length - 1) : BULLET_GAP;
      if (gap >= BULLET_GAP_MIN || keep.length < 2) return { items: keep, gap: Math.max(BULLET_GAP_MIN, Math.min(BULLET_GAP, gap)) };
      var worst = 0;
      for (i = 1; i < keep.length; i++) if (keep[i].p > keep[worst].p) worst = i;
      keep.splice(worst, 1);
    }
  }

  /* ── ICONS ──────────────────────────────────────────────────────────────── */
  /* Traced from the reference slides: accent glyphs with white detail on a
     tint disc 36 pt across, in the disc's own coordinates. The host is a
     plain building; the reference's hospital cross would mislabel a
     warehouse. The PowerPoint draws the same glyphs (glyphSvg). */
  var GLYPH = {
    solar: '<rect class="a" x="7.92" y="9.38" width="20.16" height="13.69"/>' +
      '<rect class="w" x="14.28" y="9.38" width="1.08" height="13.69"/><rect class="w" x="20.64" y="9.38" width="1.08" height="13.69"/>' +
      '<rect class="w" x="7.92" y="15.68" width="20.16" height="1.08"/><rect class="a" x="17.28" y="24.51" width="1.44" height="3.6"/>',
    bess: '<rect class="a" x="10.8" y="10.09" width="14.4" height="18.74" rx="2.3"/>' +
      '<rect class="a" x="14.4" y="6.84" width="6.48" height="3.6" rx="1.08"/>' +
      '<path class="w" d="M16.94 12.26L18.26 15.5 17.72 15.88 19.37 18.67 18.83 19.13 20.88 23.79 17.4 20.22 18.07 19.72 15.91 17.44' +
      ' 16.68 16.73 14.4 14.33Z"/>',
    controller: '<rect class="a" x="7.2" y="7.93" width="21.6" height="15.14" rx="1.51"/>' +
      '<rect class="w" x="10.26" y="18.02" width="1.8" height="4.32"/><rect class="w" x="14.22" y="15.13" width="1.8" height="7.21"/>' +
      '<rect class="w" x="18.18" y="16.57" width="1.8" height="5.77"/><rect class="w" x="22.14" y="13.69" width="1.8" height="8.65"/>' +
      '<rect class="a" x="16.56" y="23.07" width="2.88" height="3.6"/><rect class="a" x="12.24" y="25.95" width="10.8" height="1.44"/>',
    ev: '<rect class="a" x="9.36" y="7.93" width="10.8" height="18.02" rx="1.73"/><rect class="w" x="10.8" y="10.1" width="7.2" height="2.16"/>' +
      '<path class="w" d="M13.93 14.42L14.81 16.85 14.45 17.14 15.56 19.22 15.19 19.57 16.56 23.07 14.24 20.39 14.68 20.02 13.24 18.3' +
      ' 13.76 17.77 12.24 15.98Z"/>' +
      '<path class="a" d="M18.28 10.57L19.24 9.93 22.13 14.23 21.18 14.87Z"/><path class="a" d="M24.15 13.26L25.18 13.77 23.04 18.17 22 17.66Z"/>' +
      '<rect class="a" x="23.04" y="18.02" width="3.6" height="2.88" rx="0.81"/>',
    host: '<rect class="a" x="16.56" y="7.93" width="10.8" height="18.74"/><rect class="a" x="7.92" y="14.42" width="8.64" height="12.25"/>' +
      '<path class="w" d="M19.44 11.54h1.8v2.16h-1.8zM23.04 11.54h1.8v2.16h-1.8zM19.44 15.5h1.8v2.16h-1.8zM23.04 15.5h1.8v2.16h-1.8z' +
      'M19.44 19.46h1.8v2.16h-1.8zM23.04 19.46h1.8v2.16h-1.8zM19.44 23.07h1.8v2.16h-1.8zM23.04 23.07h1.8v2.16h-1.8z' +
      'M9.72 19.46h1.8v2.16h-1.8zM12.96 19.46h1.8v2.16h-1.8zM9.72 23.07h1.8v2.16h-1.8zM12.96 23.07h1.8v2.16h-1.8z"/>',
    grid: '<path class="a" d="M15.84 10.09L18 7.21 20.16 10.09Z"/><rect class="a" x="9.36" y="10.1" width="17.28" height="1.44"/>' +
      '<rect class="a" x="11.52" y="15.86" width="12.24" height="1.44"/>' +
      '<path class="a" d="M15.32 11.16L16.67 11.35 14.32 28.12 12.97 27.93Z"/><path class="a" d="M19.09 11.35L20.44 11.16 22.79 27.93 21.44 28.12Z"/>'
  };
  function icon(kind) {
    return '<svg class="pf-ico" viewBox="0 0 36 36" aria-hidden="true"><circle class="t" cx="18" cy="18" r="18"/>' + GLYPH[kind] + '</svg>';
  }
  var ARROW = '<svg class="pf-arw" viewBox="0 0 12.24 6.48" aria-hidden="true"><path class="a" d="M0 1.62H9V0L12.24 3.24 9 6.48V4.86H0Z"/></svg>';

  function coverHtml(m, pg) {
    return section(m, 'cover', '<div class="pf-cv">' +
      (pg.logo ? '<div class="pf-cv-logo">' + logoImg(m) + '</div>' : '<div class="pf-cv-name">' + esc(pg.name) + '</div>') +
      (pg.tag.length ? '<div class="pf-tag pf-cv-tag"' + sized(pg.tagPt, 21.8) + '>' + runsHtml(pg.tag) + '</div>' : '') +
      '<div class="pf-rule-s"></div><div class="pf-cv-sub">' + dotJoin(pg.sub) + '</div></div>');
  }
  function overviewHtml(m, pg) {
    var f = pg.flow, n = f.items.length, cards = '', flowHtml = '', i;
    for (i = 0; i < pg.kpis.length; i++) {
      var c = pg.kpis[i];
      cards += '<div class="pf-kpi"><div class="pf-kpi-v">' + esc(c[0]) + '</div><div class="pf-kpi-c">' +
        esc(c[1]) + (c[2] ? '<br>' + esc(c[2]) : '') + '</div></div>';
    }
    for (i = 0; i < n; i++) {
      flowHtml += '<div class="pf-fi">' + icon(f.items[i][0]) + '<div class="pf-fl">' + esc(f.items[i][1]) + '</div>' +
        '<div class="pf-fc">' + esc(f.items[i][2]) + '</div>' + (i < n - 1 ? ARROW : '') + '</div>';
    }
    return section(m, 'overview', head(m, pg.head) +
      '<div class="pf-ov"><p class="pf-narr">' + esc(pg.narrative) + '</p><i class="pf-g pf-g1"></i><div class="pf-kpis">' + cards + '</div>' +
      '<i class="pf-g pf-g2"></i><div class="pf-label">' + esc(pg.flowLabel) + '</div><i class="pf-g pf-g3"></i>' +
      '<div class="pf-flow' + (f.small ? ' pf-flow-sm' : '') + (f.twoLine ? ' pf-flow-2l' : '') +
      '" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + flowHtml + '</div>' +
      '<i class="pf-g pf-g4"></i>' + pill(pg.terms, 'pf-pill-ov') + '<i class="pf-g pf-gx"></i></div>' + foot(m, pg.n));
  }
  function numbersHtml(m, pg) {
    var R = pg.returns, T = pg.tax, V = pg.revenue, html;
    html = '<div class="pf-sec"><div class="pf-label">' + esc(R.label) + '</div><div class="pf-big">' + esc(R.big) + '</div>' +
      '<div class="pf-cap">' + esc(R.cap) + '</div><div class="pf-rows">' + rows(R.rows);
    if (m.levered) {
      html += '</div></div>';
      if (R.dist.length) html += '<div class="pf-sec"><div class="pf-label">' + esc(R.distLabel) + '</div><div class="pf-rows">' + rows(R.dist) + '</div></div>';
    } else {
      html += '</div>' + (R.note ? '<p class="pf-note pf-note-sec">' + esc(R.note) + '</p>' : '') + '</div>';
    }
    if (R.build) {
      html += '<div class="pf-sec"><div class="pf-label">' + esc(R.build.label) + '</div><div class="pf-rows pf-rows-sm">' + rows(R.build.rows) + '</div>' +
        (R.build.note ? '<p class="pf-note">' + esc(R.build.note) + '</p>' : '') + '</div>';
    }
    return section(m, 'numbers', head(m, pg.head) +
      '<div class="pf-cols"><i class="pf-vr pf-vr1"></i><i class="pf-vr pf-vr2"></i>' +
      '<div class="pf-col pf-c1">' + html + '</div>' +
      '<div class="pf-col pf-c2"><div class="pf-label">' + esc(T.label) + '</div>' + bullets(T) + (T.note ? '<p class="pf-note pf-fn">' + esc(T.note) + '</p>' : '') + '</div>' +
      '<div class="pf-col pf-c3"><div class="pf-label">' + esc(V.label) + '</div>' + bullets(V) +
      (V.su.rows ? '<div class="pf-su"><div class="pf-label">' + esc(V.su.label) + '</div><div class="pf-rows">' + rows(V.su.rows) + '</div>' +
        '<p class="pf-note pf-su-note">' + esc(V.su.note) + '</p></div>' : '') + '</div>' +
      '</div>' + pill(pg.floor, 'pf-pill-n') + foot(m, pg.n));
  }
  function f2(n) { return n.toFixed(2); }
  /* Monthly peaks before and with the battery, drawn in points on a 433 ×
     152 viewBox so type and bars scale with the slide. */
  function peakChart(c) {
    var W = 433.44, H = 152, L = 30, T = 16, B = 16, pw = W - L - 4, ph = H - T - B, n = c.labels.length, svg = '', i, v;
    var step = c.step, top = c.top, slot = pw / n, bw = Math.min(11, slot * 0.34);
    for (v = 0; v <= top + step / 2; v += step) {
      var y = T + ph - v / top * ph;
      svg += '<line class="gl" x1="' + L + '" x2="' + (W - 4) + '" y1="' + f2(y) + '" y2="' + f2(y) + '"/>' +
        '<text class="ax" x="' + (L - 4) + '" y="' + f2(y + 2.2) + '" text-anchor="end">' + esc(trimmed(v, 0)) + '</text>';
    }
    for (i = 0; i < n; i++) {
      var x = L + slot * i + slot / 2, before = c.before[i], after = c.after[i], hb = before / top * ph;
      svg += '<rect class="bb" x="' + f2(x - bw - 0.6) + '" y="' + f2(T + ph - hb) + '" width="' + f2(bw) + '" height="' + f2(hb) + '"/>';
      if (after !== null) {
        var ha = after / top * ph;
        svg += '<rect class="ba" x="' + f2(x + 0.6) + '" y="' + f2(T + ph - ha) + '" width="' + f2(bw) + '" height="' + f2(ha) + '"/>';
      }
      if (i % c.every === 0) {
        svg += '<text class="ax" x="' + f2(x) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(c.labels[i]) + '</text>';
      }
    }
    svg += '<text class="lg" x="' + L + '" y="8.4">' + esc(c.unit) + '</text>' +
      '<rect class="bb" x="' + (W - 150) + '" y="2" width="7" height="7"/><text class="lg" x="' + (W - 140) + '" y="8.4">' + esc(c.series[0]) + '</text>' +
      '<rect class="ba" x="' + (W - 96) + '" y="2" width="7" height="7"/><text class="lg" x="' + (W - 86) + '" y="8.4">' + esc(c.series[1]) + '</text>';
    return '<svg class="pf-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="Monthly peak demand before and with the battery">' + svg + '</svg>';
  }
  function sizingHtml(m, pg) {
    var chart = pg.chart ? peakChart(pg.chart) : '', alts = '', i, j;
    for (i = 0; i < pg.alternatives.length; i++) {
      var a = pg.alternatives[i];
      alts += '<tr' + (a.on ? ' class="pf-on"' : '') + '>';
      for (j = 0; j < a.cells.length; j++) alts += '<td>' + esc(a.cells[j]) + '</td>';
      alts += '</tr>';
    }
    var ths = '';
    for (j = 0; j < pg.altHead.length; j++) ths += '<th>' + esc(pg.altHead[j]) + '</th>';
    return section(m, 'sizing', head(m, pg.head) +
      '<div class="pf-cols pf-cols-sz"><i class="pf-vr pf-vr1"></i>' +
      '<div class="pf-col pf-c1"><div class="pf-label">' + esc(pg.labels.system) + '</div><div class="pf-rows pf-rows-sm">' + rows(pg.system) + '</div></div>' +
      '<div class="pf-col pf-c23">' + (chart ? '<div class="pf-label">' + esc(pg.labels.chart) + '</div>' + chart : '') +
      '<div class="pf-sz-low"><div><div class="pf-label">' + esc(pg.labels.savings) + '</div><div class="pf-rows pf-rows-sm">' + rows(pg.savings) + '</div></div>' +
      (alts ? '<div><div class="pf-label">' + esc(pg.labels.alternatives) + '</div><table class="pf-tab"><thead><tr>' + ths +
        '</tr></thead><tbody>' + alts + '</tbody></table></div>' : '') +
      '</div></div></div>' + pill(pg.line, 'pf-pill-n') + foot(m, pg.n));
  }
  function cashflowHtml(m, pg) {
    var ths = '', body = '', i, c;
    for (c = 0; c < pg.cols.length; c++) ths += '<th>' + esc(pg.cols[c]) + '</th>';
    for (i = 0; i < pg.rows.length; i++) {
      var tr = '';
      for (c = 0; c < pg.rows[i].cells.length; c++) tr += pg.rows[i].cells[c] === null ? '<td></td>' : '<td>' + esc(pg.rows[i].cells[c]) + '</td>';
      body += (pg.rows[i].y0 ? '<tr class="pf-y0">' : '<tr>') + tr + '</tr>';
    }
    return section(m, 'cashflow', head(m, pg.head) + '<div class="pf-cf"><table class="pf-tab pf-tab-cf"><thead><tr>' + ths +
      '</tr></thead><tbody>' + body + '</tbody></table><p class="pf-note">' + esc(pg.note) + '</p></div>' + foot(m, pg.n));
  }
  function disclosuresHtml(m, pg) {
    var html = '', open = false;
    for (var j = 0; j < pg.blocks.length; j++) {
      var b = pg.blocks[j];
      if (b.li != null) {
        html += (open ? '' : '<ul class="pf-dl">') + (b.lvl ? '<li class="pf-w-' + b.lvl + '"><b>' + b.word + ':</b> ' : '<li>') + esc(b.li) + '</li>';
        open = true;
      } else {
        html += (open ? '</ul>' : '') + (b.h ? '<div class="pf-label">' + esc(b.h) + '</div>'
          : b.legal ? '<p class="pf-legal">' + esc(b.p) + '</p>'
            : '<p>' + esc(b.p) + (b.version ? ', version <span class="pf-nb">' + esc(b.version) + '</span>' : '') + '.</p>');
        open = false;
      }
    }
    return section(m, 'disclosures', head(m, pg.head) + '<div class="pf-dx">' + html + (open ? '</ul>' : '') + '</div>' + foot(m, pg.n));
  }
  function closeHtml(m, pg) {
    var lines = [], i;
    for (i = 0; i < pg.lines.length; i++) lines.push(esc(pg.lines[i]));
    var tag = pg.tag.length ? runsHtml(pg.tag) : '';
    var below = pg.logo
      ? '<div class="pf-cl-row"><div class="pf-cl-logo">' + logoImg(m) + '</div><div class="pf-cl-lines">' + lines.join('<br>') + '</div></div>'
      : '<div class="pf-cl-solo">' + (tag && pg.name ? '<b>' + esc(pg.name) + '</b><br>' : '') + lines.join('<br>') + '</div>';
    return section(m, 'close', '<div class="pf-tag pf-cl-tag"' + (tag ? sized(pg.tagPt, 36.9) : '') + '>' +
      (tag || esc(pg.big)) + '</div><div class="pf-rule-s pf-cl-rule"></div>' + below);
  }
  var HTML = { cover: coverHtml, overview: overviewHtml, numbers: numbersHtml, sizing: sizingHtml, cashflow: cashflowHtml,
    disclosures: disclosuresHtml, close: closeHtml };

  function slides(result, brand, opts) {
    var d = deck(result, brand, opts), out = [];
    for (var i = 0; d && i < d.pages.length; i++) out.push(HTML[d.pages[i].kind](d.m, d.pages[i]));
    return out;
  }

  /* The preview: each slide in a frame that takes the scaled size. An empty
     string for a result that did not run. */
  function render(result, brand, opts) {
    var pages = slides(result, brand, opts), html = '';
    for (var i = 0; i < pages.length; i++) html += '<div class="pf-frame">' + pages[i] + '</div>';
    return html ? '<div class="pf-deck">' + html + '</div>' : '';
  }

  /* The cover's and the close's radial vignette, measured off the reference:
     [radius in pt from the slide's centre, grey]. The stylesheet and the
     PowerPoint backdrop (vignettePng) both draw it from this. */
  var VIGNETTE = [[0, '#FFFFFF'], [133, '#FFFFFF'], [153, '#FDFDFD'], [173, '#FAFAFA'], [193, '#F5F5F5'], [213, '#EFEFEF'],
    [233, '#E9E9E9'], [253, '#E3E3E3'], [273, '#E0E0E0'], [290, '#DFDFDF'], [302, '#DEDEDE']];
  function vignetteCss() {
    var stops = [];
    for (var i = 0; i < VIGNETTE.length; i++) stops.push(VIGNETTE[i][1] + ' ' + (VIGNETTE[i][0] ? VIGNETTE[i][0] + 'pt' : '0'));
    return 'radial-gradient(circle at 50% 50%,' + stops.join(',') + ')';
  }

  /* Every rule is scoped to the deck's own classes, so the stylesheet can sit
     in the tool page beside the page's own. The @import must stay first. */
  function css() {
    var CALIBRI = "font-family:Calibri,Carlito,'Segoe UI','Helvetica Neue',Arial,sans-serif;";
    var INTER = "font-family:Inter,'Helvetica Neue',Arial,sans-serif;";
    return [
      "@import url('" + FONT_URL + "');",
      /* the preview frame */
      '.pf-frame{position:relative;width:calc(10in * var(--pf-scale, 1));height:calc(5.625in * var(--pf-scale, 1));overflow:hidden;',
      'margin:0 auto 16px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.08),0 6px 20px rgba(16,24,40,.08)}',
      '.pf-frame>.pf-slide{transform:scale(var(--pf-scale, 1));transform-origin:0 0}',
      /* the slide: 10 × 5.625 in, the reference's 720 × 405 pt */
      '.pf-slide{' + paletteVars(palette(DEFAULT_ACCENT)) + ';position:relative;display:block;width:10in;height:5.625in;overflow:hidden;',
      'background:#fff;color:var(--pf-ink);' + CALIBRI + 'font-size:7.22pt;line-height:1.2;font-weight:400;font-style:normal;text-align:left;',
      'letter-spacing:0;word-spacing:0;text-transform:none;font-variant-ligatures:none;-webkit-font-smoothing:antialiased;',
      '-webkit-print-color-adjust:exact;print-color-adjust:exact;',
      'break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid}',
      '.pf-slide *,.pf-slide *::before,.pf-slide *::after{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      '.pf-slide h1,.pf-slide p,.pf-slide ul,.pf-slide li,.pf-slide table{margin:0;padding:0}',
      '.pf-slide ul{list-style:none}.pf-slide b{font-weight:700}.pf-slide i{font-style:normal}',
      '.pf-slide img{border:0;display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}',
      '.pf-dot{padding:0 .45em}.pf-bar{padding:0 .5em}.pf-nb{white-space:nowrap}',
      /* the page head: kicker, title, logo */
      '.pf-kicker{position:absolute;left:30.24pt;top:20pt;right:130pt;font-size:7.94pt;line-height:9.5pt;font-weight:700;',
      'letter-spacing:.007em;color:var(--pf-accent-text);white-space:nowrap;overflow:hidden}',
      'h1.pf-title{position:absolute;left:30.24pt;top:36pt;right:126pt;font-size:20.93pt;line-height:25pt;font-weight:400;',
      'color:var(--pf-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pf-mark{position:absolute;right:30.24pt;top:11.53pt;width:84pt;height:37.47pt;display:flex;align-items:center;',
      'justify-content:flex-end;overflow:hidden}',
      '.pf-mark-name{font-size:9.38pt;line-height:11pt;font-weight:700;text-align:right;color:var(--pf-ink);max-height:33pt;overflow:hidden}',
      /* the foot */
      '.pf-foot{position:absolute;left:30.24pt;right:30.24pt;top:390.59pt;border-top:.72pt solid var(--pf-rule);padding-top:4.2pt;',
      'display:flex;justify-content:space-between;align-items:baseline;font-size:7.22pt;line-height:9pt;letter-spacing:.02em;',
      'color:var(--pf-gray);white-space:nowrap}',
      '.pf-foot-l{overflow:hidden;text-overflow:ellipsis;min-width:0}.pf-foot-r{flex:0 0 auto;padding-left:12pt}.pf-foot-attr{margin-right:14pt}',
      /* shared type */
      '.pf-label{font-size:9.38pt;line-height:11pt;font-weight:700;letter-spacing:.012em;color:var(--pf-accent-dark);text-transform:uppercase}',
      '.pf-note{font-size:7.22pt;line-height:8.4pt;letter-spacing:-.007em;font-style:italic;color:var(--pf-gray)}',
      '.pf-pill{background:var(--pf-accent);color:var(--pf-on-accent);font-size:9.38pt;line-height:11pt;font-weight:700;',
      'letter-spacing:-.014em;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
      'padding:7.46pt 22pt 6.05pt;min-height:24.51pt;border-radius:12.26pt}',
      '.pf-row{display:flex;justify-content:space-between;align-items:baseline;height:13.37pt;line-height:13.37pt;font-size:7.94pt;',
      'letter-spacing:.0065em;white-space:nowrap}',
      '.pf-row>span{color:var(--pf-gray);overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '.pf-row>b{color:var(--pf-ink);padding-left:8pt;flex:0 0 auto}',
      '.pf-rows-sm .pf-row{font-size:7.22pt;letter-spacing:.02em}',
      '.pf-row-rule{border-bottom:.72pt solid var(--pf-rule)}',
      '.pf-row-total{height:14.83pt;padding-top:1.46pt}.pf-row-total>span{color:var(--pf-ink);font-weight:700}',
      '.pf-row-total>b{color:var(--pf-accent-dark)}',
      /* 1 · cover, and the close: the reference's radial vignette */
      '.pf-cover,.pf-close{background:#DEDEDE ' + vignetteCss() + '}',
      '.pf-tag{' + INTER + 'font-weight:300;color:#000;white-space:nowrap;letter-spacing:-.005em}',
      '.pf-tag b{font-weight:700;color:var(--pf-accent-text)}',
      '.pf-rule-s{width:18.33pt;height:1.6pt;background:#000}',
      '.pf-cv{position:absolute;left:0;right:0;top:0;bottom:0;padding:20.8pt 60pt 0;display:flex;flex-direction:column;',
      'align-items:center;justify-content:center;text-align:center}',
      '.pf-cv-logo{height:152.33pt;width:300pt;display:flex;align-items:center;justify-content:center}',
      '.pf-cv-name{font-size:30pt;line-height:36pt;font-weight:700;color:var(--pf-ink);max-width:560pt}',
      '.pf-cv-tag{margin-top:17.3pt;font-size:21.8pt;line-height:26pt;max-width:600pt;overflow:hidden}',
      '.pf-cv .pf-rule-s{margin-top:8.4pt}',
      '.pf-cv-sub{margin-top:18pt;font-size:9.38pt;line-height:11pt;letter-spacing:-.012em;color:var(--pf-ink);max-width:600pt;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pf-cl-tag{position:absolute;left:24pt;right:24pt;top:159.5pt;text-align:center;font-size:36.9pt;line-height:44pt;overflow:hidden}',
      '.pf-cl-rule{position:absolute;left:350.84pt;top:221.33pt;height:1.4pt}',
      '.pf-cl-row{position:absolute;left:0;right:0;top:223pt;display:flex;justify-content:center}',
      '.pf-cl-logo{width:331pt;height:77pt;padding-right:14.6pt;display:flex;justify-content:flex-end;align-items:flex-start}',
      '.pf-cl-lines,.pf-cl-solo{' + INTER + 'font-weight:300;font-size:7.2pt;line-height:12.5pt;color:#111;overflow:hidden}',
      '.pf-cl-lines{width:331pt;padding-left:13.7pt;padding-top:22pt;white-space:nowrap}',
      '.pf-cl-solo{position:absolute;left:60pt;right:60pt;top:236pt;text-align:center}.pf-cl-solo b{font-weight:700;font-size:9pt}',
      /* 2 · overview: a column whose gaps give way before anything overflows */
      '.pf-ov{position:absolute;left:30.24pt;right:30.24pt;top:80.62pt;height:303.5pt;display:flex;flex-direction:column}',
      'p.pf-narr{flex:0 0 auto;font-size:9.38pt;line-height:11.55pt;letter-spacing:.007em;color:var(--pf-gray);max-height:80.85pt;',
      'overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:7}',
      '.pf-g{display:block;min-height:2pt}.pf-g1{flex:0 1 31.5pt}.pf-g2{flex:0 1 12pt}.pf-g3{flex:0 1 7.2pt}.pf-g4{flex:0 1 12.8pt}',
      '.pf-gx{flex:1 1 0}',
      '.pf-kpis{flex:0 0 auto;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:14.4pt}',
      '.pf-kpi{height:63.42pt;padding:7pt 11.57pt 0;background:var(--pf-tint);border-radius:2.86pt;overflow:hidden}',
      '.pf-kpi-v{font-size:16.61pt;line-height:20pt;color:var(--pf-ink);white-space:nowrap}',
      '.pf-kpi-c{margin-top:5.28pt;font-size:7.94pt;line-height:10.1pt;letter-spacing:.0065em;color:var(--pf-gray)}',
      '.pf-ov .pf-label,.pf-pill-ov{flex:0 0 auto}',
      '.pf-flow{flex:0 0 auto;display:grid;margin:0 -8.88pt}',
      '.pf-fi{position:relative;text-align:center;padding:0 4pt}',
      'svg.pf-ico{display:block;width:36pt;height:36pt;margin:0 auto;overflow:visible}',
      '.pf-ico .t{fill:var(--pf-tint)}.pf-ico .a,.pf-arw .a{fill:var(--pf-accent-text)}.pf-ico .w{fill:#fff}',
      '.pf-arw{position:absolute;right:-6.12pt;top:14.76pt;width:12.24pt;height:6.48pt}',
      '.pf-fl{margin-top:6.58pt;font-size:9.38pt;line-height:11pt;height:11pt;font-weight:700;letter-spacing:-.02em;',
      'color:var(--pf-accent-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pf-flow-2l .pf-fl{height:22pt;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}',
      '.pf-flow-sm .pf-fl{margin-top:5.2pt;font-size:7.94pt}',
      '.pf-fc{margin:5.36pt auto 0;max-width:84%;font-size:7.2pt;line-height:8.67pt;letter-spacing:.018em;max-height:17.34pt;',
      'overflow:hidden;color:var(--pf-gray);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}',
      '.pf-flow-sm .pf-fc{margin-top:6.34pt;max-width:88%}',
      /* 3 · the numbers: three 206.64 pt columns, hairlines in the gutters */
      '.pf-cols{position:absolute;left:30.24pt;top:82.15pt;width:660.24pt;height:268.08pt;display:grid;',
      'grid-template-columns:206.64pt 206.64pt 206.64pt;column-gap:20.16pt}',
      '.pf-vr{position:absolute;top:0;bottom:0;width:.72pt;background:var(--pf-rule)}.pf-vr1{left:216pt}.pf-vr2{left:442.8pt}',
      '.pf-col{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}',
      '.pf-col>.pf-label,.pf-sec>.pf-label:first-child{margin-top:.19pt}',
      '.pf-sec+.pf-sec{margin-top:11.2pt}',
      '.pf-big{margin-top:4.88pt;font-size:18.05pt;line-height:21pt;color:var(--pf-ink);white-space:nowrap}',
      '.pf-cap{margin-top:3.89pt;font-size:7.2pt;line-height:9pt;letter-spacing:.018em;color:var(--pf-gray)}',
      '.pf-rows{margin-top:4.44pt}.pf-cap+.pf-rows{margin-top:7.33pt}',
      '.pf-rows+.pf-note{margin-top:6.8pt}p.pf-note-sec{margin-bottom:11pt}',
      '.pf-c2{padding-bottom:3.4pt}.pf-c3{padding-bottom:7.1pt}',
      'ul.pf-bul{margin-top:6.79pt}',
      '.pf-bul li{position:relative;padding-left:13.23pt;font-size:7.22pt;line-height:8.67pt;letter-spacing:.02em;color:var(--pf-ink)}',
      '.pf-bul li+li{margin-top:var(--pf-gap, 6.4pt)}',
      ".pf-bul li::before{content:'';position:absolute;left:0;top:2.92pt;width:5.76pt;height:5.76pt;border-radius:50%;",
      'background:var(--pf-accent-text)}',
      'p.pf-fn{margin-top:auto;padding-top:8pt;font-size:7.2pt;line-height:8.67pt}',
      '.pf-su{margin-top:auto;padding-top:12pt}.pf-su .pf-rows{margin-top:4.19pt}.pf-su .pf-row-total{padding-top:2.16pt;height:15.53pt}',
      'p.pf-su-note{margin-top:7.06pt}',
      '.pf-pill-n{position:absolute;left:30.24pt;right:30.24pt;top:356pt;min-height:21.62pt;padding:6.35pt 22pt 4.27pt;border-radius:10.81pt}',
      /* appendices */
      '.pf-cols-sz{grid-template-columns:206.64pt 433.44pt}',
      '.pf-c23{display:flex;flex-direction:column}',
      '.pf-chart{display:block;width:433.44pt;height:152pt;margin-top:4pt}',
      '.pf-chart .gl{stroke:var(--pf-rule);stroke-width:.6}.pf-chart .ax{fill:var(--pf-gray);font-size:6.2px}',
      '.pf-chart .lg{fill:var(--pf-gray);font-size:6.6px}.pf-chart .bb{fill:#C9CED6}.pf-chart .ba{fill:var(--pf-accent)}',
      '.pf-sz-low{display:grid;grid-template-columns:180pt 1fr;column-gap:20pt;margin-top:8pt}',
      'table.pf-tab{border-collapse:collapse;width:100%;margin-top:4.44pt;font-size:6.8pt;line-height:8.6pt}',
      '.pf-tab th{font-weight:700;color:var(--pf-accent-dark);text-align:right;padding:0 0 2.2pt 4pt;',
      'border-bottom:.72pt solid var(--pf-rule);white-space:nowrap}',
      '.pf-tab td{text-align:right;padding:1.5pt 0 1.5pt 4pt;border-bottom:.72pt solid var(--pf-rule);color:var(--pf-ink);white-space:nowrap}',
      '.pf-tab th:first-child,.pf-tab td:first-child{text-align:left;padding-left:0}',
      '.pf-tab tr.pf-on td{font-weight:700;color:var(--pf-accent-dark)}',
      '.pf-cf{position:absolute;left:30.24pt;right:30.24pt;top:80pt;bottom:22pt}',
      'table.pf-tab-cf{margin-top:0;font-size:6.2pt;line-height:7.4pt}',
      '.pf-tab-cf th{font-size:5.9pt;text-transform:uppercase;vertical-align:bottom;white-space:normal;line-height:6.8pt}',
      '.pf-tab-cf td{padding:.6pt 0 .6pt 4pt}.pf-tab-cf tr.pf-y0 td{color:var(--pf-gray)}',
      '.pf-cf .pf-note{margin-top:5pt}',
      '.pf-dx{position:absolute;left:30.24pt;right:30.24pt;top:82.15pt;height:296pt;column-count:3;column-gap:20.16pt;',
      'column-rule:.72pt solid var(--pf-rule);column-fill:balance}',
      '.pf-dx .pf-label{font-size:7.94pt;line-height:9.5pt;margin:0 0 3.5pt;break-after:avoid;page-break-after:avoid}',
      '.pf-dx ul+.pf-label,.pf-dx p+.pf-label{margin-top:7pt}',
      '.pf-dl li,.pf-dx p{font-size:6.8pt;line-height:8.2pt;margin-bottom:4.2pt;letter-spacing:.012em;color:var(--pf-ink);',
      'break-inside:avoid;page-break-inside:avoid}',
      '.pf-dl li{position:relative;padding-left:9pt}',
      ".pf-dl li::before{content:'';position:absolute;left:0;top:2.3pt;width:3.6pt;height:3.6pt;border-radius:50%;background:var(--pf-accent)}",
      '.pf-dl li.pf-w-critical::before{background:#DC2626}.pf-dl li.pf-w-warn::before{background:#D97706}',
      '.pf-dl li.pf-w-info::before{background:#9CA3AF}',
      '.pf-dx p.pf-legal{color:var(--pf-gray);font-style:italic;letter-spacing:0}'
    ].join('');
  }

  /* A complete document: what print() sends to the printer and what the
     window fallback shows. One slide per 10 × 5.625 in page and no margins,
     the way the reference PDFs are cut. */
  function documentHtml(result, brand, opts) {
    var pages = slides(result, brand, opts), o = opts && typeof opts === 'object' ? opts : {};
    var title = (clean(at(result, 'inputs.project.name')) || 'Pro forma') + ' ' + DASH + ' ' + (clean(o.footerTitle) || 'Investor One-Pager');
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
      '<style>' + css() + '@page{size:10in 5.625in;margin:0}html,body{margin:0;padding:0;background:#fff}' +
      '.pf-slide:last-child{break-after:auto;page-break-after:auto}' +
      '@media screen{body{background:#E5E7EB;padding:24px 0}' +
      '.pf-slide{margin:0 auto 24px;box-shadow:0 1px 2px rgba(16,24,40,.08),0 6px 20px rgba(16,24,40,.08)}}</style></head><body>' +
      (pages.length ? pages.join('')
        : '<p style="font:14px/1.5 Arial,sans-serif;padding:24px">The pro forma has not run, so there is no deck to show.</p>') +
      '</body></html>';
  }

  /* ── PRINTING ───────────────────────────────────────────────────────────── */
  /* A hidden iframe first: no new window for a popup blocker to eat, and the
     print dialog shows only the deck. Hidden means off-screen at full slide
     size, not display:none, which some browsers refuse to print. It waits for
     the page, the logo and the web fonts (a deck printed in the fallback font
     reflows) — but not forever: after a few seconds it prints what it has.
     If the frame cannot be written, the deck opens in a window instead
     (omega-compute-lease.js has the same two paths, in the other order). */
  function whenReady(win, go) {
    var start = new Date().getTime(), fired = false;
    function fire() { if (!fired) { fired = true; go(); } }
    function poll() {
      var d = null;
      try { d = win.document; } catch (e) { /* closed or cross-origin: print what there is */ }
      if (!d || new Date().getTime() - start > 7000) { fire(); return; }
      if (d.readyState !== 'complete' || !imagesDone(d)) { setTimeout(poll, 80); return; }
      if (d.body) d.body.getBoundingClientRect();   // lay out, so the fonts the deck uses are requested
      var fonts = d.fonts;
      if (fonts && fonts.ready && typeof fonts.ready.then === 'function') {
        var t = setTimeout(fire, 3000);
        fonts.ready.then(function () { clearTimeout(t); setTimeout(fire, 80); }, function () { clearTimeout(t); fire(); });
      } else {
        setTimeout(fire, 500);
      }
    }
    poll();
  }
  function imagesDone(d) {
    var imgs = d.images || [];
    for (var i = 0; i < imgs.length; i++) if (!imgs[i].complete) return false;
    return true;
  }
  function inWindow(html) {
    var w = null;
    try { w = root.open('', '_blank'); } catch (e) { /* blocked */ }
    if (!w) return false;
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      return false;
    }
    whenReady(w, function () {
      try { w.focus(); w.print(); } catch (e) { /* the window is still there to print by hand */ }
    });
    return true;
  }
  function print(result, brand, opts) {
    if (typeof document === 'undefined' || !document.body) return false;
    var html = documentHtml(result, brand, opts), old = document.getElementById(FRAME_ID), frame = document.createElement('iframe'), win;
    function drop() { if (frame.parentNode) frame.parentNode.removeChild(frame); }
    if (old && old.parentNode) old.parentNode.removeChild(old);
    frame.id = FRAME_ID;
    frame.setAttribute('title', 'Investor deck');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.style.cssText = 'position:fixed;left:-12in;top:0;width:10in;height:5.625in;border:0';
    try {
      document.body.appendChild(frame);
      win = frame.contentWindow;
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (e) {
      drop();
      return inWindow(html);
    }
    whenReady(win, function () {
      try {
        win.onafterprint = function () { setTimeout(drop, 500); };
        win.focus();
        win.print();
      } catch (e) {
        drop();
        inWindow(html);
      }
    });
    return true;
  }

  /* ── POWERPOINT ─────────────────────────────────────────────────────────── */
  /* pptx(result, brand, opts) → Promise<{ fileName }>: the deck again, page
     for page, as native PowerPoint objects a financing team can edit — text
     boxes in Calibri, rounded-rectangle cards, pill banners, the icon discs,
     hairlines, tables for every block of figures and a native chart for the
     sizing basis. It draws the same page data the PDF is drawn from
     (deck()), so the two cannot say different things; like everything in
     this file it computes no finance.

     No browser lays these slides out, so the layout is computed: the
     stylesheet's geometry in points, and lines broken with Calibri's own
     advance widths (Carlito's, which match them glyph for glyph), the
     kerning both fonts apply and the tracking the stylesheet carries to
     match PowerPoint's setting — the same breaks the PDF makes. A text
     box is placed so PowerPoint's baseline lands on the browser's (boxTop)
     and is given a couple of points more than the line it was broken for,
     so PowerPoint never needs a line the PDF did not.

     PptxGenJS 4.0.1 comes from jsdelivr on first use only, pinned by its SRI
     hash and loaded once: the tool page does not pay for it until someone
     exports. opts.PptxGenJS supplies the constructor instead (under node,
     for tests) and opts.write ('nodebuffer', 'base64', …) returns the file
     rather than saving it. Pictures that need a canvas — the icon glyphs,
     the cover's vignette — are left out where there is none, and a logo is
     then embedded only when it is a data URI. */
  var PPTX_URL = 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js';
  var PPTX_SRI = 'sha384-qb0Xhi7LLYpvW1HCK6oMrmDLSY9sy7vwm6ZlV6KjtrlL9yg30+YN4neTwnmX+Kp8';
  var PAGE_H = 405, CAL = 'Calibri', CAL_LIGHT = 'Calibri Light', ELL = '\u2026', SLACK = 2;
  /* Calibri's line: 1950 units above the baseline and 550 below, of 2048. */
  var CAL_ASC = 1950 / 2048, CAL_DSC = 550 / 2048, CAL_EM = CAL_ASC + CAL_DSC;
  /* The PDF sets the tagline in Inter, which is no Office font. Calibri
     Light is the nearest face on every machine that has PowerPoint; set 15%
     larger it covers Inter's width and cap height, and it sits on Inter's
     baseline. */
  var INTER_ASC = 1984 / 2048, INTER_DSC = 494 / 2048, TAG_K = 1.15;

  /* Calibri's advance widths in 2048ths of an em, two base-64 digits each:
     U+0020–007E, U+00A0–00FF, then CAL_EXTRA — for regular, bold and italic. */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var CAL_EXTRA = [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2212, 0x20AC, 0x2122, 0x2009, 0x2002, 0x200B];
  var CAL_PACKED = {
    r: 'HPKbM1P8QOW4V1HEJtJtP8P8H/JzIFMXQOQOQOQOQOQOQOQOQOQOIkIkP8P8P8O1cnShRaRETsPoOtUMT8IEKNQoNdbXUqVMQiViRYOt' +
      'PmUiSKceQnPmO/J0MXJ0P8P8JUPVQ0NiQ0P7JxPEQ0HWHqOjHWZkQ0Q4Q0Q0LKMhKuQ0OdW4N3OfMpKEOvKEP8HPKbP8QOP8QOP8P8Mk' +
      'atM4QZP8AAQOMnK2P8KwKtJWRmSwIFJ1H4NhQZUXVfVnO1ShShShShShShYbREPoPoPoPoIEIEIEIET/UqVMVMVMVMVMP8VPUiUiUiUi' +
      'PmQiQ4PVPVPVPVPVPVYvNiP7P7P7P7HWHWHWHWQ0Q0Q4Q4Q4Q4Q4P8Q8Q0Q0Q0Q0OfQ0OfP8c+H/H/NZNZP8WGP8QOWkGZQAAA',
    b: 'HPKbOCP8QOXVWjHeJ+J+P8P8IQJzIjNwQOQOQOQOQOQOQOQOQOQOI1I1P8P8P8O1cwTZR8Q8ULPnOsUZUMIiKmRgNib+VFVpRCV9SBPI' +
      'P2U5S7dARoQoPTKZNwKZP8P8JnPzRLNZRLQHKIPLRLH3ILPXH3aCRLRNRLRLLYMxLGRLPJX2OtPKMuLAPNLAP8HPKbP8QOP8QOP8P8NR' +
      'atNURPP8AAQOMfK9P8K0KwJoSCTIIkJtIFN7RPVDWHWdO1TZTZTZTZTZTZY0Q8PnPnPnPnIiIiIiIiUdVFVpVpVpVpVpP8VyU5U5U5U5' +
      'QoRCRwPzPzPzPzPzPzYzNZQHQHQHQHH3H3H3H3RLRLRNRNRNRNRNP8RaRLRLRLRLPKRLPKP8c+IQIQN7N7P8WxP8QOXDGZQAAA',
    i: 'HPKbM1P8QOW4V1HEJtJtP8P8H/JzIFMaQOQOQOQOQOQOQOQOQOQOIkIkP8P8P8O1cnShRaQuTsPoOtUMT8IEKNQoNdbXUoU8QiVQRYOe' +
      'PmUiSKcfQnPmO/J0MTJ0P8P8JUQdQdNUQdPSJxQdQdHWHqOjHWZUQdQbQdQdK+MdKuQdORW4N3OUMpKEOvKEP8HPKbP8QOP8QOP8P8Mk' +
      'atNyQZP8AAQOMnK2P8KwKtJWROSwIFJ1H4NhQZUXVfVnO1ShShShShShShYbQuPoPoPoPoIEIEIEIET/UoU8U8U8U8U8P8VDUiUiUiUi' +
      'PmQiQ4QdQdQdQdQdQdYJNUPSPSPSPSHWHWHWHWQ0QdQbQbQbQbQbP8Q8QdQdQdQdOUQdOUP8c+H/H/NZNZP8WFP8QOWkGZQAAA'
  };
  var CAL_W = {};
  function calWidths(face) {
    if (CAL_W[face]) return CAL_W[face];
    var s = CAL_PACKED[face], out = [];
    for (var i = 0; i < s.length; i += 2) out.push(B64.indexOf(s.charAt(i)) * 64 + B64.indexOf(s.charAt(i + 1)));
    CAL_W[face] = out;
    return out;
  }
  /* One character's advance in ems. A character Calibri lacks is set in a
     fallback font PowerPoint picks: a CJK one takes a full em, anything else
     is counted wide rather than narrow. */
  function adv(code, face) {
    var k = code >= 32 && code <= 126 ? code - 32 : code >= 160 && code <= 255 ? code - 65 : -1;
    if (k < 0) k = CAL_EXTRA.indexOf(code) < 0 ? -1 : 191 + CAL_EXTRA.indexOf(code);
    if (k < 0) return code < 32 ? 0 : code >= 0x2E80 ? 1 : 0.6;
    return calWidths(face)[k] / 2048;
  }
  /* The pairs Calibri and Carlito both kern, as a browser applies them, in
     2048ths of an em: rows of a left character, an entry count (one base-64
     digit), then entries of the right character and the value + 512 in two
     base-64 digits — for regular, bold and italic. The PDF is kerned, and
     the stylesheet's tracking was measured against PowerPoint with kerning
     on (against the reference decks' own lines a kerned width is within
     0.12 pt on average, an unkerned one runs 0.8 pt long), so a line broken
     without it wraps where neither the PDF nor PowerPoint does. Only ASCII
     pairs: a typographic quote left out costs a paragraph a few hundredths
     of a point. */
  var KERN_PACKED = {
    r: '(CgIKjI/+B+IP,IAIRJIWTF7VF1WFqXIKYFttHV-FYGbfHuvHuxHayHs.T-GPAIMCHaGHaJITOHqQHqTFnUHuVFpWFwYFEfH' +
      'YgIWtHUvGzwG8yGzzIK/IAG5JHbaHbcHbeHbgHdoHdsHZAR,IP-Hx.IM?G8CHxGHxJIXOHpQHpTFgUHgVGnWGwYFqtHMvHay' +
      'HXBN,HkAHsTHQVHnWHoXHUYHHZHsfHstHsvHsxHxyHsCG,H3GHuJIMOHuQHuTIKDK,HJ.HQAHiJHqTHpVHoWHyXHhYHZZHqE' +
      'T-HlAHqCHoGHoOHgQHgSHsZH2aHecHkdHieHbfHAoHbqHitHovHQwHeyHQFT,E0.E//G/AGNCHuGHuJGTOHuQHuSHjXHqZH1' +
      'aHJcHkdHseHioHkqHssHdGITH2VH2WH3YHivHjwHqxHyyHiJE,Hl.HuAHdXHsKZ-HeCGyGGwOGfQGfSHuUHjWHeaHecHYdHf' +
      'eHbfHnmHgnHgoHbpHgqHfrHgsHutHauHgvGbwGhyGrLQ,IRCHqGHRJIZOHTQHTTFqUHUVFtWGKYFZfHptHavGywG4yGxOM,H' +
      'Q.HiAHpJHlTHJVHnWHqXHAYHJZHaxH0zH2PV,EC-HD.D7/GUAFpJF0TH3VH2XHdYH1ZHjaHUcHVdHeeHXfIMoHXqHesHgtIM' +
      'yIMQP)Ie,Jp/KI;I8JIpTHRVHnWH0XIMYHS]IggI7jJPxIf}IeRP.IKCHuGHtOHsQHsSHlTHsVHkWHuYHieHcoHWvHmwHfyH' +
      'fSL-H3AHxJH3THyVHyWHxXHzYHsvHpwHvyHnTg,Eu-Fg.E1/GV:F6;GOAFgCHWGHFJG/OHGQHGSH2TIcaFgcFPdFteFKgFpm' +
      'GBnGBoFKpGBqFtrGBsFnuGBvGkwGqxGmyGjzFyUE,Hk.HcAHTJHYVd,Fa-Gb.Ez/GW:G3;GUAGgCHuGHnJGwOHlQHlSH0VIJ' +
      'aGOcGZdGpeGagGcmHOnHOoGqpHOqGprHOsGmuHOyHdzGuWb,Eo-Go.Ey;FkAGjCHqGHqJGoOHqQHqSH2XHzaG5cGydG4eG1g' +
      'HKmHEnHEoGqpHEqG4rHEsG3uHEvHeyHLXQ-GvCHHGG/OHHQHHSHsdHUeHZgH3oHaqHUtHhuHavHJwHPyHVYk,EE-GL.ET/GD' +
      ':Fm;F2AFoCG9GG9JGQOG+QG+SHvZH2aF6cFhdF9eFtfHCgFyiHgjHPmGinGioFnpGiqF9rGisGNtHUuGivG7wHCxG6yG/zGc' +
      'ZR-HTAH1CHnGHoOHoQHoWH5YH5aH2cH0dHueHhoHjqHuvHTwHayHbaGfH0tHtvHewHyxHtyHabIfHvsH2tH3vH2wH2xHXyH2' +
      'zHkcCaHvoHveHfHutH1vH2wH2xHhyHzzHsfQ)Ie,GC-HJ.F4aHYcHTdHLeHNgHEoHVqHLsHlvINwIGyIKzHsgK,IX/JJaHac' +
      'H0dHteHvgIToHyqHttHhhGfH0tHtvHewHyxHtyHakK-GzaHdcHQdHIeG+oG7qHIsHttH2uHmmGfH0tHtvHewHyxHtyHanGfH' +
      '0tHtvHewHyxHtyHaoG,HbvH3wH4xHYyH1zHlpIfHvsH2tH3vH2wH2xHXyH2zHkqBgIKrO,FQ-HE.EyaHWcHidHkeHlgHkoHf' +
      'qHksHdvITwILyIKsHfHttHpvHhwH2xHqyHbzHutH-HBaHncHndHpeHqoHsqHpvR,Fh-HR.FYaHicHndHseHsfILgHkoHtqHs' +
      'sH3tIKvIMwIMyIMzHmwR,FQ-HV.F9aHpcHsdHueHufIGgHuoHtqHusHutIEvIMwIIyIMzHvxK-HCaHbcHSdHUeHKoHJqHUsH' +
      '0tIGuHsyR,Fu-HT.F5aHhcHmdHoeHnfIKgHmoHoqHosHttIKvIMwIIyIKzHvzNaHecHTdHSeHSfH2gHvoHTqHSsHquH2vHuw' +
      'HqyHu',
    b: '(CgIKjIy+B+IZ,IAIeJItTGbVGbWGgXISYGEtHi-FYGrfHxvHxxHdyHs.T-GvAIPCHdGHdJIjOHnQHnTF0UHxVF5WGgYFHfH' +
      'YgIZtHOvG6wG/yG6zIK/IAGmJHOaHOcHOeHOgHToHTsHJAR,IZ-Hn.IP?GsCHoGHnJIcOHkQHkTFgUHdVGXWGwYFZtHBvHOy' +
      'HDBN,HnAHsTHTVHdWHiXHOYG6ZHsfHstHsvHsxHnyHsCG,H5GHxJIPOHxQHxTIKDK,HT.HTAHQJHoTHjVHiWHsXHNYHJZHnE' +
      'T-HYAHnCHiGHiOHdQHdSHsZH2aHlcHndHieHefHJoHeqHitHivHLwHYyHLFT,FR.Ff/HJAGMCHxGHxJGUOHxQHxSHlXHnZHy' +
      'aHIcHndHseHioHnqHssHnGITH2VH2WH4YHivHlwHqxHsyHiJE,Hs.HxAHTXHsKZ-HYCG1GGwOGmQGmSHxUHmWHpaHmcHXdHb' +
      'eHbfHdmHqnHqoHfpHqqHbrHqsHxtHNuHqvGnwGryGuLQ,IeCHnGHYJIhOHcQHcTFqUHOVFgWGOYFMfHktHZvGywG5yGtOM,H' +
      'T.HiAHkJHsTHTVHdWHnXG6YG/ZHfxHyzH2PV,Ef-HT.Ee/GrAF1JGFTH6VH2XHTYHzZHkaHYcHadHneHffIPoHfqHnsHqtIP' +
      'yIPQP)Ie,Jf/Ju;I8JIhTHYVHdWHxXIEYHF]IjgI4jJPxIX}IeRP.IKCHxGHwOHsQHsSHsTHsVHnWHxYHaeHioHcvHuwHqyH' +
      'qSL-H4AHnJH4THsVHrWHxXHtYHZvHpwHtyHjTg,FC-F0.FV/GI:Gq;GrAFfCHTGHIJG3OHJQHJSH2TIZaFlcFOdFseFPgFtm' +
      'GXnGXoFPpGXqFsrGXsF4uGXvHAwHExG1yHAzGVUE,Hn.HmAHJJHgVd,Fi-Gr.E9/Gg:HE;GrAGTCHfGHdJGwOHYQHYSHwVIJ' +
      'aGPcGTdGkeGXgGcmHGnHGoGhpHGqGkrHGsGquHGyHjzGyWb,FT-G/.FQ;GRAGgCHmGHnJGrOHnQHnSH2XHxaG2cGydG8eG3g' +
      'HHmHInHIoGwpHIqG8rHIsG8uHIvHnyHcXQ-G/CG6GG1OG6QG6SHsdHSeHZgH5oHZqHStHSuHdvG3wG/yG/Yk,ES-GS.Ea/F5' +
      ':Fz;F5AFRCGwGGwJGNOGzQGzSHiZH2aF0cFSdFveFcfG/gFniHhjHSmGcnGcoFbpGcqFvrGcsGBtHOuGcvG7wHAxGqyG1zGQ' +
      'ZR-HdAHyCHeGHiOHiQHiWH0YHzaH2cHxdHxeHhoHmqHxvHVwHZyHdaGfH1tHtvHjwHwxHtyHbbIfH1sH2tH4vH2wH2xHbyH1' +
      'zHncCaH0oH2eHfHxtHyvH2wH2xHgyHtzHsfQ)Ie,Gc-HT.GSaHfcHddHbeHcgHYoHhqHbsHsvIUwIHyIKzHsgK,Ie/I8aHdc' +
      'HxdHpeHqgIRoHsqHptHxhGfH1tHtvHjwHwxHtyHbkK-G6aHncHTdHSeHIoHGqHSsHvtH2uHnmGfH1tHtvHjwHwxHtyHbnGfH' +
      '1tHtvHjwHwxHtyHboG,HivH6wH8xHXyH0zHrpIfH1sH2tH4vH2wH2xHbyH1zHnqBgIJrO,Fq-HY.FMaHTcHjdHneHpgHooHn' +
      'qHnsHnvISwIMyIJsHfHvtHpvHkwH2xHqyHhzHxtH-HOaHscHldHpeHnoHsqHpvR,GH-HX.FvaHicHndHseHtfIOgHpoHtqHs' +
      'sH6tIKvIPwIPyIPzHuwR,Fq-Hi.GJaHqcHtdHxeHwfIHgHwoHvqHxsHztIGvIPwIMyIPzH0xJ-G/aHgcHRdHZeHPoHRqHZsH' +
      'xuHsyR,GE-Hd.GDaHhcHmdHpeHpfIKgHsoHqqHpsHztIKvIPwIMyIKzH0zNaHmcHbdHaeHafH2gH1oHdqHasHuuH2vHxwHvy' +
      'Hx',
    i: '(BjI/+B+IP,IAIQJIWTFxVFuWFhXIJYFotHQ-EYGavHuxHZyHs.R-GPAIMCHZGHZJITOHqQHqTFzUHuVF5WGJYFWtHUvG0wG' +
      '8yG8zIK/GAG6JHacHaeHaoHcsHhAR,IP-HH.IM?GLCHQGHQJIXOHGQHGTFYUHFVFuWGHYFQtHHvG5yG1BN,HjAHqTHNVHYWH' +
      'gXHPYHEZHqfHktHkvHqxHlyHkCG,H3GHuJINOHsQHsTIKDK,HB.HIAHgJHmTHYVHmWHuXHTYHYZHvEZ-HpAHqCHgGHmOHfQH' +
      'fSHsZH2aHbcHhdHbeHafHDgHbmHvnHvoHapHvqHbrHvtHluHvvHRwHTyHRFZ,E6.FE/G2AGUCHuGHuJGXOHuQHuSHkXHqZH1' +
      'aHkcHjdHkeHhgHkmHlnHloHhpHlqHkrHlsHcuHlGITH2VH1WH3YHhvHlwHrxH0yHkJE,Hl.HuAHcXHsKa-HeCGyGGwOGfQGf' +
      'SHuUHgWHdaHTcHXdHTeHVfHrgHTmHvnHvoHYpHvqHTrHvsHutHauHvvGcwGhyGqLP,IRCG/GG9JIZOG9QG9TFhUGnVFuWGAY' +
      'FbtHZvGpwGwyGwOM,HS.HhAHpJHlTHKVHmWHqXHDYHLZHbxH2zH2PV,EZ-HX.EG/GLAF+JF3TH5VH2XHeYH1ZHjaHbcHXdHb' +
      'eHXfINgHboHXqHbtINyINQO)If,Jp/KI;I7JIvTHSVHfWHsXIGYHJ]IfjJRxIb}IdRP.IKCHuGHuOHuQHuSHlTHOVHOWHlYH' +
      'WeHcoHWvHmwHfyHfSKAH1JIFTHyVHhWHtXH0YHlvHmwHwyHnTf,E1-Fg.E2/GV:F6;GOAFpCHbGHMJHHOHMQHMTIdaFScFZd' +
      'FSeFTgFSmGenGeoFTpGeqFSrGesFquGevGpwGlxGsyGmzF0UE,Hb.HdAHSJHsVd,Fa-GS.E2/GV:G3;GUAGoCHuGHnJGwOHl' +
      'QHlSH0VIIaGccGXdGceGagGcmHDnHDoGppHDqGcrHDsGouHDyHlzGvWb,Fl-Go.Ez;HLAGkCHrGHsJGyOHsQHsSH3XH2aGvc' +
      'GtdGveGugGvmHJnHJoGrpHJqGvrHJsHKuHJvHeyHMXR-GTCHCGHBOHDQHDSHsaHVdHVeHZgHVoHZqHVtHhuHfvHJwHQyHVYk' +
      ',E+-GL.E1/GC:GG;GGAFrCHHGHIJGjOHLQHLSHxZH2aF1cF0dF1eFwfHLgF1iHojHfmGdnGdoFxpGdqF1rGdsGNtHUuGdvG6' +
      'wHCxG3yHBzGiZS-HUAH1CHoGHqOHnQHnWH7YH6aHtcHsdHteHpgHtoHjqHtvHUwHZyHabIfH/sH2tH3vH2wH2xHXyH2zHjcH' +
      'aHzcHudHzeHzgHzoHvqHzeHfH+tH1vHzwH0xHWyHzzHpfQ)If,Gf-Hm.GYaHncHfdHneHggHnoHnqHnsH4vIMwIHyIMzHvhF' +
      'tHsvHcwHsxHnyHbkL-G0aG+cHBdG+eG8gG+oG6qG+sHttH2uHTmFtHsvHcwHsxHnyHbnFtHsvHcwHsxHnyHboG,HbvH3wH2x' +
      'HWyH0zHlpIfH/sH2tH3vH2wH2xHXyH2zHjrG,Fm-HX.FYvITwIKyILsGtHpvHqwH0xHpyHbzHutJ-HBaHkcHpdHkeHqgHkoH' +
      'nqHkxH9vK,GC.F9fIMoH3sH3tIKvIMwIMyIMzHmwH,GI.GifICtICvIDwIDyIDxL-HNaHRcHRdHReHWgHRoHXqHRsH1tIGuH' +
      'syH,GJ.GdfIMtIKvIDwIDyICzJaHbcHidHbeHjgHboHhqHbsHruHu'
  };
  var KERN = {};
  function kernTable(face) {
    if (KERN[face]) return KERN[face];
    var s = KERN_PACKED[face], t = {}, i = 0, k, n, left;
    while (i < s.length) {
      left = s.charAt(i);
      n = B64.indexOf(s.charAt(i + 1));
      i += 2;
      for (k = 0; k < n; k++, i += 3) t[left + s.charAt(i)] = (B64.indexOf(s.charAt(i + 1)) * 64 + B64.indexOf(s.charAt(i + 2)) - 512) / 2048;
    }
    KERN[face] = t;
    return t;
  }
  /* The kerning between two neighbours of one face, in ems; a face change is
     a new run and a browser kerns nothing across it. */
  function kernPair(a, b, face) {
    var t = kernTable(face), k = a + b;
    return own(t, k) ? t[k] : 0;
  }
  /* A string's width in points; track is the stylesheet's letter-spacing. */
  function textW(s, pt, face, track) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += adv(s.charCodeAt(i), face) + (track || 0) + (i ? kernPair(s.charAt(i - 1), s.charAt(i), face) : 0);
    return w * pt;
  }
  /* Where a paragraph breaks at widthPt, as the browser and PowerPoint break
     it: after a space, which hangs past the edge, or after a hyphen between
     letters; a word wider than the line breaks where it overflows, as
     PowerPoint breaks it. runs are [{ t, f }] with f the face (r, b, i).
     Returns the text and each line's [start, end) with trailing spaces off. */
  function breakLines(runs, widthPt, pt, track) {
    var s = '', faces = [], lines = [], i, j;
    for (i = 0; i < runs.length; i++) {
      for (j = 0; j < runs[i].t.length; j++) faces.push(runs[i].f || 'r');
      s += runs[i].t;
    }
    var start = 0, x = 0, brk = -1, atBrk = 0;
    for (i = 0; i < s.length; i++) {
      var ch = s.charAt(i), w = adv(s.charCodeAt(i), faces[i]) + (track || 0);
      if (i > start && faces[i - 1] === faces[i]) w += kernPair(s.charAt(i - 1), ch, faces[i]);
      w *= pt;
      if (ch === ' ') { x += w; brk = i; atBrk = x; continue; }
      if (x + w > widthPt + 0.01 && i > start) {
        if (brk >= start) { lines.push([start, brk]); start = brk + 1; x -= atBrk; }
        else { lines.push([start, i]); start = i; x = 0; }
        brk = -1;
      }
      x += w;
      if (ch === '-' && i > start && /[A-Za-z0-9]/.test(s.charAt(i - 1)) && /[A-Za-z]/.test(s.charAt(i + 1))) { brk = i; atBrk = x; }
    }
    lines.push([start, s.length]);
    for (i = 0; i < lines.length; i++) while (lines[i][1] > lines[i][0] && s.charAt(lines[i][1] - 1) === ' ') lines[i][1]--;
    return { text: s, lines: lines };
  }
  function lineCount(t, face, widthPt, pt, track) { return breakLines([{ t: t, f: face }], widthPt, pt, track).lines.length; }
  /* s cut to widthPt and ended with mark — an ellipsis where the stylesheet
     truncates with one, '' where it simply clips. */
  function cutTo(s, pt, face, track, widthPt, mark) {
    var cut = s;
    while (cut && textW(cut + mark, pt, face, track) > widthPt) cut = cut.slice(0, -1);
    return cut.replace(/\s+$/, '') + mark;
  }
  function clip(s, pt, face, track, widthPt, mark) {
    return textW(s, pt, face, track) <= widthPt + 0.01 ? s : cutTo(s, pt, face, track, widthPt, mark);
  }
  /* A paragraph held to max lines, its last line ending in mark, the way
     -webkit-line-clamp shows it. { t: the text shown, n: its lines }. */
  function clampText(s, face, widthPt, pt, track, max, mark) {
    var b = breakLines([{ t: s, f: face }], widthPt, pt, track);
    if (b.lines.length <= max) return { t: s, n: b.lines.length };
    var last = b.lines[max - 1], tail = s.slice(last[0], last[1]);
    tail = mark && textW(tail + mark, pt, face, track) <= widthPt ? tail + mark : cutTo(tail, pt, face, track, widthPt, mark);
    return { t: s.slice(0, last[0]) + tail, n: max };
  }

  function inch(pt) { return pt / 72; }
  function hx(c) { return String(c || INK).replace('#', '').toUpperCase(); }
  function mix(a, b) {
    var o = {}, k;
    for (k in a) if (own(a, k)) o[k] = a[k];
    for (k in b) if (own(b, k)) o[k] = b[k];
    return o;
  }
  /* The top of a text box whose first line lands where the browser set a
     line of the same height and size: the browser centres the font's height
     (1.22 em) in the line, PowerPoint sets it at the bottom of an exactly
     spaced line. */
  function boxTop(lineTop, lead, pt) { return lineTop - lead / 2 + CAL_EM / 2 * pt; }
  /* The size a picture is shown at in the PDF: its own size (a CSS pixel is
     three quarters of a point), shrunk to fit and never enlarged. */
  function fitIn(img, maxW, maxH) {
    var w = img.w * 0.75, h = img.h * 0.75, k = Math.min(1, maxW / w, maxH / h);
    return { w: w * k, h: h * k };
  }

  /* ── drawing ── c = { s: the slide, m: the deck's reading of the result,
     pal: its colours, A: its pictures } */

  /* A text box of paragraphs [{ r: [{ t, b, i, color, font, pt }], lead,
     before }]. o is the box's type — pt, lead (exact line spacing), color,
     font, align, wrap, italic, name — or, with o.fill, the text of a shape
     (o.shape, o.radius, o.inset: [left, right, bottom, top] in points).
     Every run repeats its paragraph's settings: PptxGenJS writes them once
     per run, and each app must read the same thing whichever it honours. */
  function textBox(c, x, y, w, h, paras, o) {
    var items = [], i, j;
    for (i = 0; i < paras.length; i++) {
      var p = paras[i], rs = [];
      for (j = 0; j < p.r.length; j++) if (p.r[j].t) rs.push(p.r[j]);
      for (j = 0; j < rs.length; j++) {
        items.push({ text: rs[j].t, options: { bold: !!rs[j].b, italic: !!(rs[j].i || o.italic), color: hx(rs[j].color || o.color),
          fontFace: rs[j].font || o.font || CAL, fontSize: rs[j].pt || o.pt, lineSpacing: p.lead || o.lead, paraSpaceBefore: p.before || 0,
          align: o.align || 'left', breakLine: j === rs.length - 1 && i < paras.length - 1 } });
      }
    }
    if (!items.length) return;
    var opt = { x: inch(x), y: inch(y), w: inch(w), h: inch(h), margin: 0, valign: 'top', wrap: o.wrap !== false, fontFace: o.font || CAL,
      fontSize: o.pt, color: hx(o.color), align: o.align || 'left', lineSpacing: o.lead };
    if (o.name) opt.objectName = o.name;
    if (o.fill) {
      opt.shape = o.shape || 'rect';
      opt.fill = { color: hx(o.fill) };
      opt.line = { type: 'none' };
      if (o.radius) opt.rectRadius = inch(o.radius);
      opt.margin = o.inset;
    } else {
      opt.isTextBox = true;
    }
    c.s.addText(items, opt);
  }
  function para(t, o) { var r = mix({ t: t }, o || {}); return { r: [r] }; }
  function shape(c, kind, x, y, w, h, fill, name, radius) {
    var opt = { x: inch(x), y: inch(y), w: inch(w), h: inch(h), fill: { color: hx(fill) }, line: { type: 'none' }, objectName: name };
    if (radius) opt.rectRadius = inch(radius);
    c.s.addShape(kind, opt);
  }
  /* A 0.72 pt hairline, across (h 0) or down (w 0). */
  function hairline(c, x, y, w, h, color, name) {
    c.s.addShape('line', { x: inch(x), y: inch(y), w: inch(w), h: inch(h), line: { color: hx(color), width: 0.72 }, objectName: name });
  }
  function picture(c, img, x, y, w, h, alt, name) {
    c.s.addImage({ data: img.data, x: inch(x), y: inch(y), w: inch(w), h: inch(h), altText: alt || '', objectName: name });
  }
  /* A section label: bold capitals in the dark accent (.pf-label). */
  function label(c, t, x, lineTop, w) {
    textBox(c, x, boxTop(lineTop, 11, 9.38), w, 11, [para(t.toUpperCase(), { b: true })],
      { pt: 9.38, lead: 11, color: c.pal.accentDark, wrap: false, name: t });
  }
  /* An italic grey note (.pf-note); returns its height. */
  function note(c, t, x, lineTop, w, pt, lead, name) {
    var n = lineCount(t, 'i', w, pt, -0.007);
    textBox(c, x, boxTop(lineTop, lead, pt), w + SLACK, n * lead, [para(t)], { pt: pt, lead: lead, color: c.pal.gray, italic: true, name: name });
    return n * lead;
  }
  /* A banner: one bold line centred in an accent pill; the line top is where
     the stylesheet's padding puts it. */
  function pillBox(c, x, y, w, h, b, padTop, name) {
    var t = clip(b.parts.join('  ' + DOT + '  '), b.pt, 'b', -0.014, w - 44, ELL);
    textBox(c, x, y, w, h, [para(t, { b: true })], { pt: b.pt, lead: 11, color: c.pal.onAccent, align: 'center', wrap: false,
      fill: c.pal.accent, shape: 'roundRect', radius: h / 2, inset: [22, 22, 0, boxTop(y + padTop, 11, b.pt) - y], name: name });
  }
  /* Rows of [label, figure, class], the PDF's flex rows, as a table with no
     grid: labels grey on the left, figures bold on the right, a hairline
     under a 'pf-row-rule' and the total bold with its figure in the accent.
     A label is cut with an ellipsis where the PDF cuts it, so no row grows.
     Returns the table's height. */
  function rowsTable(c, x, y, w, list, o) {
    var pal = c.pal, none = { type: 'none' }, line = { type: 'solid', pt: 0.72, color: hx(pal.rule) }, fw = 0, data = [], hs = [], total = 0, i;
    for (i = 0; i < list.length; i++) fw = Math.max(fw, textW(list[i][1], o.pt, 'b', o.track));
    var vw = Math.min(w - 24, fw + 8 + SLACK), lw = w - vw;
    for (i = 0; i < list.length; i++) {
      var cls = list[i][2] || '', sum = cls === 'pf-row-total', h = sum ? o.totalH || 14.83 : 13.37;
      var cell = { valign: 'middle', margin: [inch(sum ? o.totalPad || 1.46 : 0), 0, 0, 0], border: [none, none, cls === 'pf-row-rule' ? line : none, none] };
      data.push([
        { text: clip(list[i][0], o.pt, sum ? 'b' : 'r', o.track, lw - SLACK, ELL), options: mix(cell, { color: hx(sum ? pal.ink : pal.gray), bold: sum, align: 'left' }) },
        { text: list[i][1], options: mix(cell, { color: hx(sum ? pal.accentDark : pal.ink), bold: true, align: 'right' }) }
      ]);
      hs.push(inch(h));
      total += h;
    }
    c.s.addTable(data, { x: inch(x), y: inch(y), w: inch(w), colW: [inch(lw), inch(vw)], rowH: hs, h: inch(total), fontFace: CAL,
      fontSize: o.pt, margin: 0, autoPage: false, objectName: o.name });
    return total;
  }
  /* A table of figures with a header row: the sizing alternatives and the
     annual cash flow. Columns take the widths a browser gives an auto
     table as wide as the page: each column's widest cell and its padding,
     scaled together to the table's width (Chrome's columns agree with this
     to a hundredth of a point) — and the rows the heights the stylesheet
     gives them. */
  function figureTable(c, x, y, w, head, rows, o) {
    var pal = c.pal, none = { type: 'none' }, line = { type: 'solid', pt: 0.72, color: hx(pal.rule) }, widths = [], sum = 0, data = [], hs = [], k, i;
    for (k = 0; k < head.length; k++) {
      var mw = textW(head[k], o.headPt, 'b', 0);
      for (i = 0; i < rows.length; i++) mw = Math.max(mw, textW(rows[i].cells[k] || '', o.pt, rows[i].on ? 'b' : 'r', 0));
      widths.push(mw + (k ? 4 : 0));
      sum += widths[k];
    }
    for (k = 0; k < widths.length; k++) widths[k] = inch(widths[k] * w / sum);
    /* The header's line sits on its padding and on half the rule under it
       (the borders collapse, so the first row holds the other half); the
       browser centres the glyphs in a headLead-high line where PowerPoint
       rests a bottom-anchored line's descent on the margin. PowerPoint
       grows a row to fit its text, so the line is set no taller than the
       browser's (exactly headLead when Calibri's own line is taller, as in
       the cash flow): the baseline stays a descent above the margin either
       way, and the margin and line then fit the row. */
    var th = [], headMarB = o.headPad + 0.36 - (CAL_EM * o.headPt - o.headLead) / 2;
    for (k = 0; k < head.length; k++) {
      th.push({ text: head[k], options: { bold: true, color: hx(pal.accentDark), fontSize: o.headPt, align: k ? 'right' : 'left', valign: o.headAlign,
        lineSpacing: Math.min(CAL_EM * o.headPt, o.headLead), margin: [0, 0, inch(headMarB), 0], border: [none, none, line, none] } });
    }
    data.push(th);
    hs.push(inch(o.headH));
    for (i = 0; i < rows.length; i++) {
      var tr = [], r = rows[i];
      for (k = 0; k < head.length; k++) {
        tr.push({ text: r.cells[k] || '', options: { bold: !!r.on, color: hx(r.on ? pal.accentDark : r.y0 ? pal.gray : pal.ink), fontSize: o.pt,
          align: k ? 'right' : 'left', valign: 'middle', margin: 0, border: [none, none, line, none] } });
      }
      data.push(tr);
      hs.push(inch(o.rowH));
    }
    c.s.addTable(data, { x: inch(x), y: inch(y), w: inch(w), colW: widths, rowH: hs, h: inch(o.headH + rows.length * o.rowH), fontFace: CAL,
      fontSize: o.pt, margin: 0, autoPage: false, objectName: o.name });
    return o.headH + rows.length * o.rowH;
  }
  /* Bullets { k, v } down a column, each an accent dot and its own text box
     at the top the PDF gives it; returns where the last one ends. */
  function bulletList(c, items, gap, x, top, w, name) {
    var y = top, pal = c.pal, i;
    for (i = 0; i < items.length; i++) {
      var k = items[i].k + ':', v = ' ' + noWidow(items[i].v);
      var n = breakLines([{ t: k, f: 'b' }, { t: v, f: 'r' }], w - 13.23, 7.22, 0.02).lines.length;
      shape(c, 'ellipse', x, y + 2.92, 5.76, 5.76, pal.accentText, name + ' bullet ' + (i + 1));
      textBox(c, x + 13.23, boxTop(y, 8.67, 7.22), w - 13.23 + SLACK, n * 8.67, [{ r: [{ t: k, b: true }, { t: v }] }],
        { pt: 7.22, lead: 8.67, color: pal.ink, name: name + ' ' + (i + 1) });
      y += n * 8.67 + (i < items.length - 1 ? gap : 0);
    }
    return y;
  }
  /* The tagline, as the PDF sets it — light, its **words** bold in the
     accent — on the baseline Inter gives it there. */
  function tagLine(c, runs, pt, x, w, lineTop, lead, name) {
    var size = Math.round(pt * TAG_K * 100) / 100, base = lineTop + lead / 2 + (INTER_ASC - INTER_DSC) / 2 * pt, rs = [], i;
    for (i = 0; i < runs.length; i++) {
      rs.push({ t: runs[i].t, b: runs[i].b, font: runs[i].b ? CAL : CAL_LIGHT, color: runs[i].b ? c.pal.accentText : '#000000' });
    }
    textBox(c, x, base - lead + CAL_DSC * size, w, lead, [{ r: rs }], { pt: size, lead: lead, color: '#000000', font: CAL_LIGHT,
      align: 'center', wrap: false, name: name });
  }
  function backdrop(c) { if (c.A.vignette) c.s.background = { data: c.A.vignette }; }
  function logoAlt(m) { return m.b.name ? m.b.name + ' logo' : 'Logo'; }

  /* The page head: kicker, title and the brand's mark, where .pf-kicker,
     .pf-title and .pf-mark put them. A logo that did not load leaves the
     name in its place, as a deck without a logo has. */
  function pptHead(c, h) {
    var pal = c.pal, b = c.m.b, logo = c.A.mark;
    textBox(c, MARGIN, boxTop(20, 9.5, 7.94), 559.76, 9.5, [para(clip(h.kicker.join('  ' + DOT + '  '), 7.94, 'b', 0.007, 559.76, ''), { b: true })],
      { pt: 7.94, lead: 9.5, color: pal.accentText, wrap: false, name: 'Kicker' });
    textBox(c, MARGIN, boxTop(36, 25, h.pt), 563.76, 25, [para(clip(h.title, h.pt, 'r', 0, 563.76, ELL))],
      { pt: h.pt, lead: 25, color: pal.ink, wrap: false, name: 'Title' });
    if (logo) {
      var f = fitIn(logo, 84, 37.47);
      picture(c, logo, PAGE_W - MARGIN - f.w, 11.53 + (37.47 - f.h) / 2, f.w, f.h, logoAlt(c.m), 'Logo');
    } else if (b.name) {
      var t = clampText(b.name, 'b', 84, 9.38, 0, 3, ''), hh = t.n * 11;
      textBox(c, PAGE_W - MARGIN - 84, boxTop(11.53 + (37.47 - hh) / 2, 11, 9.38), 84, hh, [para(t.t, { b: true })],
        { pt: 9.38, lead: 11, color: pal.ink, align: 'right', name: 'Brand' });
    }
  }
  /* The foot: the hairline, the deck's name on the left, the attribution
     and the page number on the right (.pf-foot). */
  function pptFoot(c, n) {
    var m = c.m, pal = c.pal, top = boxTop(390.59 + 0.72 + 4.2, 9, 7.22), num = String(n), right = textW(num, 7.22, 'r', 0.02);
    var o = { pt: 7.22, lead: 9, color: pal.gray, wrap: false };
    hairline(c, MARGIN, 390.95, CONTENT_W, 0, pal.rule, 'Footer rule');
    textBox(c, PAGE_W - MARGIN - 40, top, 40, 9, [para(num)], mix(o, { align: 'right', name: 'Page number' }));
    if (m.b.attribution) {
      var aw = textW(m.b.attribution, 7.22, 'r', 0.02) + SLACK;
      textBox(c, PAGE_W - MARGIN - right - 14 - aw, top, aw, 9, [para(m.b.attribution)], mix(o, { align: 'right', name: 'Attribution' }));
      right += 14 + aw;
    }
    var room = CONTENT_W - right - 12, left = (m.b.name ? m.b.name + ' ' + DASH + ' ' : '') + m.project + '  |  ' + m.footerTitle;
    textBox(c, MARGIN, top, room, 9, [para(clip(left, 7.22, 'r', 0.02, room - SLACK, ELL))], mix(o, { name: 'Footer' }));
  }

  /* 1 · the cover: the stylesheet centres logo (or name), tagline, rule and
     project line as one column in the slide below 20.8 pt. */
  function pptCover(c, pg) {
    /* without a logo the name is the mark: three lines at most, so a name
       that will not break cannot push the project line off the slide */
    var m = c.m, pal = c.pal, logo = pg.logo ? c.A.logo : null, name = logo ? null : clampText(pg.name, 'b', 560, 30, 0, 3, ELL);
    var mainH = logo ? 152.33 : name.n * 36, tagH = pg.tag.length ? 17.3 + 26 : 0;
    var top = 20.8 + (PAGE_H - 20.8 - (mainH + tagH + 10 + 29)) / 2, y = top + mainH;
    backdrop(c);
    if (logo) {
      var f = fitIn(logo, 300, 152.33);
      picture(c, logo, PAGE_W / 2 - f.w / 2, top + (152.33 - f.h) / 2, f.w, f.h, logoAlt(m), 'Logo');
    } else {
      textBox(c, 80 - SLACK / 2, boxTop(top, 36, 30), 560 + SLACK, mainH, [para(name.t, { b: true })],
        { pt: 30, lead: 36, color: pal.ink, align: 'center', name: 'Name' });
    }
    if (tagH) {
      tagLine(c, pg.tag, pg.tagPt, 60, 600, y + 17.3, 26, 'Tagline');
      y += tagH;
    }
    shape(c, 'rect', PAGE_W / 2 - 18.33 / 2, y + 8.4, 18.33, 1.6, '#000000', 'Rule');
    y += 8.4 + 1.6 + 18;
    /* a logo that did not load and no name: the project is the big line, so
       the line under the rule is the quarter alone, as on a bare deck */
    var sub = logo || m.b.name ? pg.sub : pg.sub.slice(-1);
    textBox(c, 60, boxTop(y, 11, 9.38), 600, 11, [para(clip(sub.join('  ' + DOT + '  '), 9.38, 'r', -0.012, 600, ELL))],
      { pt: 9.38, lead: 11, color: pal.ink, align: 'center', wrap: false, name: 'Project' });
  }

  /* 2 · the overview: narrative, cards, the flow and the terms banner stack
     down a 303.5 pt column from 80.62 pt; the gaps between them give way,
     never below 2 pt, when the column is full (the stylesheet's flex). */
  function shrinkGaps(room, bases) {
    var out = bases.slice(), frozen = [], i;
    for (;;) {
      var sum = 0, pool = room, clamped = false;
      for (i = 0; i < out.length; i++) {
        if (frozen[i]) pool -= out[i];
        else sum += bases[i];
      }
      if (!sum || sum <= pool) return out;
      for (i = 0; i < out.length; i++) {
        if (frozen[i]) continue;
        out[i] = bases[i] - (sum - pool) * bases[i] / sum;
        if (out[i] < 2) { out[i] = 2; frozen[i] = true; clamped = true; }
      }
      if (!clamped) return out;
    }
  }
  function kpiCard(c, card, x, y, k) {
    var pal = c.pal, inset = boxTop(y + 7, 20, 16.61) - y, before = boxTop(y + 32.28, 10.1, 7.94) - (y + inset + 20), left = 3, i;
    var paras = [{ r: [{ t: clip(card[0], 16.61, 'r', 0, 130.94, '') }], lead: 20 }];
    for (i = 1; i < 3 && left > 0; i++) {
      if (!card[i]) continue;
      var t = clampText(card[i], 'r', 130.94, 7.94, 0.0065, left, ELL);
      paras.push({ r: [{ t: t.t, pt: 7.94, color: pal.gray }], lead: 10.1, before: paras.length === 1 ? before : 0 });
      left -= t.n;
    }
    textBox(c, x, y, 154.08, 63.42, paras, { pt: 16.61, lead: 20, color: pal.ink, fill: pal.tint, shape: 'roundRect', radius: 2.86,
      inset: [11.57, 11.57 - SLACK, 0, inset], name: 'KPI ' + k });
  }
  function pptOverview(c, pg) {
    var pal = c.pal, f = pg.flow, n = f.items.length, i;
    var narr = clampText(pg.narrative, 'r', CONTENT_W, 9.38, 0.007, 7, ELL), narrH = narr.n * 11.55;
    var colW = (CONTENT_W + 17.76) / n, flPt = f.small ? 7.94 : 9.38, flM = f.small ? 5.2 : 6.58, flH = f.twoLine ? 22 : 11;
    var fcM = f.small ? 6.34 : 5.36, capW = (colW - 8) * (f.small ? 0.88 : 0.84), labels = [], caps = [], capN = 1;
    for (i = 0; i < n; i++) {
      labels.push(f.twoLine ? clampText(f.items[i][1], 'b', colW - 8, flPt, -0.02, 2, ELL).t : clip(f.items[i][1], flPt, 'b', -0.02, colW - 8, ELL));
      var cap = clampText(f.items[i][2], 'r', capW, 7.2, 0.018, 2, ELL);
      caps.push(cap.t);
      capN = Math.max(capN, cap.n);
    }
    var flowH = 36 + flM + flH + fcM + capN * 8.67;
    var gaps = shrinkGaps(303.5 - 2 - (narrH + 63.42 + 11 + flowH + 24.51), [31.5, 12, 7.2, 12.8]), y = 80.62;
    pptHead(c, pg.head);
    textBox(c, MARGIN, boxTop(y, 11.55, 9.38), CONTENT_W + SLACK, narrH, [para(narr.t)], { pt: 9.38, lead: 11.55, color: pal.gray, name: 'Overview' });
    y += narrH + gaps[0];
    for (i = 0; i < pg.kpis.length; i++) kpiCard(c, pg.kpis[i], MARGIN + i * (154.08 + 14.4), y, i + 1);
    y += 63.42 + gaps[1];
    label(c, pg.flowLabel, MARGIN, y, CONTENT_W);
    y += 11 + gaps[2];
    for (i = 0; i < n; i++) {
      var x0 = MARGIN - 8.88 + i * colW, mid = x0 + colW / 2, kind = f.items[i][0], glyph = c.A.icons[kind];
      shape(c, 'ellipse', mid - 18, y, 36, 36, pal.tint, 'Icon ' + (i + 1));
      if (glyph) picture(c, glyph, mid - 18, y, 36, 36, f.items[i][1], 'Icon ' + (i + 1) + ' glyph');
      if (i < n - 1) shape(c, 'rightArrow', x0 + colW - 6.12, y + 14.76, 12.24, 6.48, pal.accentText, 'Arrow ' + (i + 1));
      textBox(c, x0 + 4 - SLACK / 2, boxTop(y + 36 + flM, 11, flPt), colW - 8 + SLACK, flH, [para(labels[i], { b: true })],
        { pt: flPt, lead: 11, color: pal.accentDark, align: 'center', wrap: f.twoLine, name: 'Flow ' + (i + 1) });
      textBox(c, mid - capW / 2 - SLACK / 2, boxTop(y + 36 + flM + flH + fcM, 8.67, 7.2), capW + SLACK, capN * 8.67, [para(caps[i])],
        { pt: 7.2, lead: 8.67, color: pal.gray, align: 'center', name: 'Flow ' + (i + 1) + ' caption' });
    }
    y += flowH + gaps[3];
    pillBox(c, MARGIN, y, CONTENT_W, 24.51, pg.terms, 7.46, 'Terms');
    pptFoot(c, pg.n);
  }

  /* 3 · the numbers: three 206.64 pt columns from 82.15 pt, 268.08 pt tall,
     hairlines in the gutters; the tax footnote and the sources & uses sit at
     the foot of their columns. */
  var NUM_TOP = 82.15;
  function colX(k) { return MARGIN + k * (COL_W + 20.16); }
  function pptReturns(c, R, x) {
    var pal = c.pal, y = NUM_TOP + 0.19, n = lineCount(R.cap, 'r', COL_W, 7.2, 0.018);
    label(c, R.label, x, y, COL_W);
    y += 11 + 4.88;
    textBox(c, x, boxTop(y, 21, 18.05), COL_W, 21, [para(clip(R.big, 18.05, 'r', 0, COL_W, ''))], { pt: 18.05, lead: 21, color: pal.ink, wrap: false, name: 'Total returns' });
    y += 21 + 3.89;
    textBox(c, x, boxTop(y, 9, 7.2), COL_W + SLACK, n * 9, [para(R.cap)], { pt: 7.2, lead: 9, color: pal.gray, name: 'Total returns caption' });
    y += n * 9 + 7.33;
    y += rowsTable(c, x, y, COL_W, R.rows, { pt: 7.94, track: 0.0065, name: 'Returns' });
    if (c.m.levered) {
      if (R.dist.length) {
        y += 11.2 + 0.19;
        label(c, R.distLabel, x, y, COL_W);
        y += 11 + 4.44;
        y += rowsTable(c, x, y, COL_W, R.dist, { pt: 7.94, track: 0.0065, name: R.distLabel });
      }
    } else if (R.note) {
      y += 6.8;
      y += note(c, R.note, x, y, COL_W, 7.22, 8.4, 'Returns note') + 11;
    }
    if (R.build) {
      y += 11.2 + 0.19;
      label(c, R.build.label, x, y, COL_W);
      y += 11 + 4.44;
      y += rowsTable(c, x, y, COL_W, R.build.rows, { pt: 7.22, track: 0.02, totalH: 14.83, totalPad: 1.46, name: 'IRR build' });
      if (R.build.note) note(c, R.build.note, x, y + 6.8, COL_W, 7.22, 8.4, 'IRR build note');
    }
  }
  /* The note sits 6.8 pt under the rows, not the 7.06 pt p.pf-su-note asks
     for: .pf-rows+.pf-note (0,2,0) outranks it (0,1,1), and the PDF is what
     the cascade prints. */
  var SU_NOTE_GAP = 6.8;
  function pptSources(c, su, x, bottom) {
    var n = lineCount(su.note, 'i', COL_W, 7.22, -0.007), rowsH = 0, i;
    for (i = 0; i < su.rows.length; i++) rowsH += su.rows[i][2] === 'pf-row-total' ? 15.53 : 13.37;
    var y = bottom - (12 + 11 + 4.19 + rowsH + SU_NOTE_GAP + n * 8.4) + 12;
    label(c, su.label, x, y, COL_W);
    y += 11 + 4.19;
    y += rowsTable(c, x, y, COL_W, su.rows, { pt: 7.94, track: 0.0065, totalH: 15.53, totalPad: 2.16, name: su.label });
    note(c, su.note, x, y + SU_NOTE_GAP, COL_W, 7.22, 8.4, 'Sources note');
  }
  function pptNumbers(c, pg) {
    var pal = c.pal, T = pg.tax, V = pg.revenue, bottom = NUM_TOP + COL_H, top = NUM_TOP + 0.19 + 11 + 6.79;
    pptHead(c, pg.head);
    hairline(c, colX(1) - 10.44, NUM_TOP, 0, COL_H, pal.rule, 'Column rule');
    hairline(c, colX(2) - 10.44, NUM_TOP, 0, COL_H, pal.rule, 'Column rule');
    pptReturns(c, pg.returns, colX(0));
    label(c, T.label, colX(1), NUM_TOP + 0.19, COL_W);
    bulletList(c, T.items, T.gap, colX(1), top, COL_W, T.label);
    if (T.note) {
      var n = lineCount(T.note, 'i', COL_W, 7.2, -0.007);
      textBox(c, colX(1), boxTop(bottom - 3.4 - n * 8.67, 8.67, 7.2), COL_W + SLACK, n * 8.67, [para(T.note)],
        { pt: 7.2, lead: 8.67, color: pal.gray, italic: true, name: 'Tax footnote' });
    }
    label(c, V.label, colX(2), NUM_TOP + 0.19, COL_W);
    bulletList(c, V.items, V.gap, colX(2), top, COL_W, V.label);
    if (V.su.rows) pptSources(c, V.su, colX(2), bottom - 7.1);
    pillBox(c, MARGIN, 356, CONTENT_W, 21.62, pg.floor, 6.35, 'Returns floor');
    pptFoot(c, pg.n);
  }

  /* Appendix · sizing basis: the system rows, a native column chart of the
     monthly peaks, the year-1 savings and the alternatives. */
  function pptChart(c, ch, x, y, w, h) {
    var pal = c.pal, n = ch.labels.length, pw = w - 34, slot = pw / n, bw = Math.min(11, slot * 0.34), after = [], i;
    for (i = 0; i < n; i++) after.push(ch.after[i] === null ? 0 : ch.after[i]);
    c.s.addChart('bar', [{ name: ch.series[0], labels: ch.labels, values: ch.before }, { name: ch.series[1], labels: ch.labels, values: after }], {
      x: inch(x), y: inch(y), w: inch(w), h: inch(h), barDir: 'col', barGrouping: 'clustered',
      barGapWidthPct: Math.max(0, Math.round((slot - 2 * bw - 1.2) / bw * 100)), barOverlapPct: -Math.round(1.2 / bw * 100),
      chartColors: [hx('#C9CED6'), hx(pal.accent)], layout: { x: 30 / w, y: 16 / h, w: pw / w, h: (h - 32) / h },
      valAxisMinVal: 0, valAxisMaxVal: ch.top, valAxisMajorUnit: ch.step, valAxisLabelFormatCode: '#,##0',
      valAxisLabelFontFace: CAL, valAxisLabelFontSize: 6.2, valAxisLabelColor: hx(pal.gray), valAxisLineShow: false, valAxisMajorTickMark: 'none',
      catAxisLabelFontFace: CAL, catAxisLabelFontSize: 6.2, catAxisLabelColor: hx(pal.gray), catAxisLineShow: false, catAxisMajorTickMark: 'none',
      catAxisLabelFrequency: ch.every, valGridLine: { color: hx(pal.rule), size: 0.6 }, catGridLine: { style: 'none' },
      showLegend: false, showTitle: false, chartArea: { fill: { color: 'FFFFFF' }, roundedCorners: false }, objectName: 'Monthly peak demand'
    });
    /* the unit and the legend, where the PDF's chart draws them */
    var o = { pt: 6.6, lead: 8, color: pal.gray, wrap: false }, top = y + 8.4 - 8 + CAL_DSC * 6.6;
    textBox(c, x + 30, top, 40, 8, [para(ch.unit)], mix(o, { name: 'Chart unit' }));
    shape(c, 'rect', x + w - 150, y + 2, 7, 7, '#C9CED6', 'Legend key');
    textBox(c, x + w - 140, top, 44, 8, [para(ch.series[0])], mix(o, { name: 'Legend' }));
    shape(c, 'rect', x + w - 96, y + 2, 7, 7, pal.accent, 'Legend key');
    textBox(c, x + w - 86, top, 86, 8, [para(ch.series[1])], mix(o, { name: 'Legend' }));
  }
  function pptSizing(c, pg) {
    var pal = c.pal, x2 = colX(1), y = NUM_TOP, L = pg.labels;
    pptHead(c, pg.head);
    hairline(c, x2 - 10.44, NUM_TOP, 0, COL_H, pal.rule, 'Column rule');
    label(c, L.system, MARGIN, NUM_TOP + 0.19, COL_W);
    rowsTable(c, MARGIN, NUM_TOP + 0.19 + 11 + 4.44, COL_W, pg.system, { pt: 7.22, track: 0.02, totalH: 14.83, totalPad: 1.46, name: L.system });
    if (pg.chart) {
      label(c, L.chart, x2, NUM_TOP + 0.19, 433.44);
      pptChart(c, pg.chart, x2, NUM_TOP + 0.19 + 11 + 4, 433.44, 152);
      y = NUM_TOP + 0.19 + 11 + 4 + 152;
    }
    y += 8;
    label(c, L.savings, x2, y, 180);
    rowsTable(c, x2, y + 11 + 4.44, 180, pg.savings, { pt: 7.22, track: 0.02, totalH: 14.83, totalPad: 1.46, name: L.savings });
    if (pg.alternatives.length) {
      label(c, L.alternatives, x2 + 200, y, 233.44);
      figureTable(c, x2 + 200, y + 11 + 4.44, 233.44, pg.altHead, pg.alternatives,
        { pt: 6.8, headPt: 6.8, headLead: 8.6, headH: 11.17, headPad: 2.2, headAlign: 'bottom', rowH: 12.35, name: L.alternatives });
    }
    pillBox(c, MARGIN, 356, CONTENT_W, 21.62, pg.line, 6.35, 'Sizing summary');
    pptFoot(c, pg.n);
  }

  /* Appendix · annual cash flow: one table from 80 pt, the note under it. */
  function pptCashflow(c, pg) {
    var head = [], k;
    for (k = 0; k < pg.cols.length; k++) head.push(pg.cols[k].toUpperCase());
    pptHead(c, pg.head);
    var h = figureTable(c, MARGIN, 80, CONTENT_W, head, pg.rows,
      { pt: 6.2, headPt: 5.9, headLead: 6.8, headH: 9.37, headPad: 2.2, headAlign: 'bottom', rowH: 9.34, name: 'Annual cash flow' });
    note(c, pg.note, MARGIN, 80 + h + 0.36 + 5, CONTENT_W, 7.22, 8.4, 'Cash flow note');
    pptFoot(c, pg.n);
  }

  /* Appendix · disclosures: headings, bullets and paragraphs in three
     206.4 pt columns, balanced the way the browser balances them — the
     shortest column height that holds everything in three, a heading kept
     with what follows it, margins between blocks collapsing and dropped at
     a column's top. What cannot fit runs off the page, as it does in the
     PDF; the page split (disclosurePages) sees that it does not. */
  var DX_W = (CONTENT_W - 2 * 20.16) / 3, DX_H = 296;
  function dxBlocks(pg) {
    var out = [], prev = null, i;
    for (i = 0; i < pg.blocks.length; i++) {
      var b = pg.blocks[i], x = { b: b };
      if (b.h) {
        x.h = 9.5; x.mt = prev && !prev.b.h ? 7 : 0; x.mb = 3.5; x.keep = true;
      } else if (b.li != null) {
        x.runs = b.lvl ? [{ t: b.word + ':', f: 'b' }, { t: ' ' + b.li, f: 'r' }] : [{ t: b.li, f: 'r' }];
        x.h = breakLines(x.runs, DX_W - 9, 6.8, 0.012).lines.length * 8.2; x.mt = 0; x.mb = 4.2;
      } else {
        x.runs = [{ t: b.legal ? b.p : b.p + (b.version ? ', version ' + b.version : '') + '.', f: b.legal ? 'i' : 'r' }];
        x.h = breakLines(x.runs, DX_W, 6.8, b.legal ? 0 : 0.012).lines.length * 8.2; x.mt = 0; x.mb = 4.2;
      }
      out.push(x);
      prev = x;
    }
    return out;
  }
  /* fits is false when some unit the browser may not break (an item, a
     paragraph, a heading with what follows it) is taller than H: it sits
     alone at a column's top and still runs out of it. */
  function fillColumns(blocks, H) {
    var cols = [[]], y = 0, prev = null, fits = true, i;
    for (i = 0; i < blocks.length; i++) {
      var b = blocks[i], gap = prev ? Math.max(prev.mb, b.mt) : 0, need = b.h, next = blocks[i + 1];
      if (b.keep && next) need += Math.max(b.mb, next.mt) + next.h;
      if (cols[cols.length - 1].length && y + gap + need > H + 0.01) {
        cols.push([]);
        y = 0;
        gap = 0;
      }
      if (y + gap + need > H + 0.01) fits = false;
      cols[cols.length - 1].push({ x: b, y: y + gap });
      y += gap + b.h;
      prev = b;
    }
    return { cols: cols, fits: fits };
  }
  /* The browser never balances to a height below its tallest unbreakable
     unit: a sparse page (the method and the legal line alone) keeps the
     METHOD heading on its paragraph and leaves the third column empty,
     where three columns at any height would strand the heading. */
  function balance(blocks) {
    var best = fillColumns(blocks, DX_H), lo = 0, hi = DX_H, k;
    if (best.cols.length > 3) return best.cols;
    for (k = 0; k < 30; k++) {
      var mid = (lo + hi) / 2, f = fillColumns(blocks, mid);
      if (f.cols.length <= 3 && f.fits) { hi = mid; best = f; } else lo = mid;
    }
    return best.cols;
  }
  var DOT_OF = { critical: '#DC2626', warn: '#D97706', info: '#9CA3AF' };
  function pptDisclosures(c, pg) {
    var pal = c.pal, cols = balance(dxBlocks(pg)), k, i;
    pptHead(c, pg.head);
    for (k = 0; k < cols.length && k < 3; k++) {
      var x = MARGIN + k * (DX_W + 20.16);
      if (k) hairline(c, x - 10.08, NUM_TOP, 0, DX_H, pal.rule, 'Column rule');
      for (i = 0; i < cols[k].length; i++) {
        var e = cols[k][i], b = e.x.b, y = NUM_TOP + e.y;
        if (b.h) {
          textBox(c, x, boxTop(y, 9.5, 7.94), DX_W, 9.5, [para(b.h.toUpperCase(), { b: true })], { pt: 7.94, lead: 9.5, color: pal.accentDark, wrap: false, name: b.h });
        } else if (b.li != null) {
          shape(c, 'ellipse', x, y + 2.3, 3.6, 3.6, b.lvl ? DOT_OF[b.lvl] : pal.accent, 'Bullet');
          var rs = [];
          for (var j = 0; j < e.x.runs.length; j++) rs.push({ t: e.x.runs[j].t, b: e.x.runs[j].f === 'b' });
          textBox(c, x + 9, boxTop(y, 8.2, 6.8), DX_W - 9 + SLACK, e.x.h, [{ r: rs }], { pt: 6.8, lead: 8.2, color: pal.ink, name: b.lvl ? b.word : 'Assumption' });
        } else {
          textBox(c, x, boxTop(y, 8.2, 6.8), DX_W + SLACK, e.x.h, [para(e.x.runs[0].t)],
            { pt: 6.8, lead: 8.2, color: b.legal ? pal.gray : pal.ink, italic: !!b.legal, name: b.legal ? 'Legal' : 'Method' });
        }
      }
    }
    pptFoot(c, pg.n);
  }

  /* Last · the close: the tagline large, the rule, then the logo left of
     centre with the contact lines beside it, or the lines centred. */
  function pptClose(c, pg) {
    var pal = c.pal, logo = pg.logo ? c.A.logo : null, size = Math.round(7.2 * TAG_K * 100) / 100, paras = [], i;
    backdrop(c);
    if (pg.tag.length) tagLine(c, pg.tag, pg.tagPt, 24, 672, 159.5, 44, 'Tagline');
    else tagLine(c, [{ t: clip(pg.big, 36.9 * TAG_K, 'r', 0, 672, ''), b: false }], 36.9, 24, 672, 159.5, 44, 'Name');
    shape(c, 'rect', 350.84, 221.33, 18.33, 1.4, '#000000', 'Rule');
    var o = { pt: size, lead: 12.5, color: '#111111', font: CAL_LIGHT, wrap: false }, base;
    if (logo) {
      var f = fitIn(logo, 316.4, 77);
      picture(c, logo, 345.4 - f.w, 223, f.w, f.h, logoAlt(c.m), 'Logo');
      for (i = 0; i < pg.lines.length; i++) paras.push(para(clip(pg.lines[i], size, 'r', 0, 317.3, '')));
      base = 245 + 6.25 + (INTER_ASC - INTER_DSC) / 2 * 7.2;
      textBox(c, 373.7, base - 12.5 + CAL_DSC * size, 317.3, pg.lines.length * 12.5, paras, mix(o, { name: 'Contact' }));
    } else {
      if (pg.tag.length && pg.name) paras.push(para(pg.name, { b: true, font: CAL, pt: Math.round(9 * TAG_K * 100) / 100 }));
      for (i = 0; i < pg.lines.length; i++) paras.push(para(clip(pg.lines[i], size, 'r', 0, 600, '')));
      base = 236 + 6.25 + (INTER_ASC - INTER_DSC) / 2 * 7.2;
      textBox(c, 60, base - 12.5 + CAL_DSC * size, 600, paras.length * 12.5, paras, mix(o, { align: 'center', name: 'Contact' }));
    }
  }
  var PPT = { cover: pptCover, overview: pptOverview, numbers: pptNumbers, sizing: pptSizing, cashflow: pptCashflow,
    disclosures: pptDisclosures, close: pptClose };

  /* ── pictures ── */
  function hasCanvas() { return typeof document !== 'undefined' && !!document.createElement && typeof root.Image === 'function'; }
  /* A test's vm has no timers, and nothing there waits on one. */
  function later(fn, ms) { return typeof setTimeout === 'function' ? setTimeout(fn, ms) : null; }
  function stop(t) { if (t !== null && typeof clearTimeout === 'function') clearTimeout(t); }
  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new root.Image(), done = false, t = later(function () { finish(null); }, 8000);
      function finish(v) { if (!done) { done = true; stop(t); resolve(v); } }
      img.onload = function () { finish(img); };
      img.onerror = function () { finish(null); };
      img.src = src;
    });
  }
  /* An image drawn on a w × h canvas and read back as a PNG; null when the
     canvas refuses it (a picture from another origin without CORS). */
  function drawPng(img, w, h) {
    try {
      var cv = document.createElement('canvas'), g;
      cv.width = w;
      cv.height = h;
      g = cv.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      return cv.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }
  /* A PNG, GIF or JPEG data URI's pixel size, read from its header — the way
     a logo is measured where there is no browser to decode it. */
  function imageSize(uri) {
    var s = uri.slice(uri.indexOf(',') + 1), b = [], buf = 0, bits = 0, i, v;
    for (i = 0; i < s.length && b.length < 65536; i++) {
      v = B64.indexOf(s.charAt(i));
      if (v < 0) continue;
      buf = (buf << 6) | v;
      bits += 6;
      if (bits >= 8) { bits -= 8; b.push((buf >> bits) & 255); buf &= (1 << bits) - 1; }
    }
    if (b[0] === 137 && b[1] === 80 && b.length > 24) return { w: b[16] * 16777216 + (b[17] << 16) + (b[18] << 8) + b[19], h: b[20] * 16777216 + (b[21] << 16) + (b[22] << 8) + b[23] };
    if (b[0] === 71 && b[1] === 73 && b.length > 10) return { w: b[6] + (b[7] << 8), h: b[8] + (b[9] << 8) };
    if (b[0] === 255 && b[1] === 216) {
      for (i = 2; i + 8 < b.length;) {
        if (b[i] !== 255) return null;
        var mk = b[i + 1];
        if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) return { w: (b[i + 7] << 8) + b[i + 8], h: (b[i + 5] << 8) + b[i + 6] };
        i += 2 + (b[i + 2] << 8) + b[i + 3];
      }
    }
    return null;
  }
  function fetchData(src) {
    if (typeof root.fetch !== 'function' || typeof root.FileReader !== 'function') return Promise.resolve(null);
    return new Promise(function (resolve) {
      var t = later(function () { resolve(null); }, 8000);
      function done(v) { stop(t); resolve(v); }
      root.fetch(src, { credentials: 'same-origin' }).then(function (res) { return res.ok ? res.blob() : null; }).then(function (blob) {
        if (!blob) { done(null); return; }
        var fr = new root.FileReader();
        fr.onload = function () { done(typeof fr.result === 'string' ? fr.result : null); };
        fr.onerror = function () { done(null); };
        fr.readAsDataURL(blob);
      }, function () { done(null); });
    });
  }
  /* The logo as a picture PowerPoint can hold: fetched and embedded as it is
     when it is a PNG, JPEG or GIF; anything else (SVG, WebP) drawn onto a
     canvas and embedded as a PNG. It keeps the size the browser gives it,
     so it sits in the slide as it sits in the PDF. Any failure leaves the
     deck without the logo, never without the deck. */
  var RASTER = /^data:image\/(png|jpe?g|gif);base64,/i;
  function logoData(url) {
    var src = safeUrl(url), size;
    if (!src) return Promise.resolve(null);
    if (!hasCanvas()) {
      size = RASTER.test(src) ? imageSize(src) : null;
      return Promise.resolve(size ? { data: src, w: size.w, h: size.h } : null);
    }
    return (/^data:/i.test(src) ? Promise.resolve(src) : fetchData(src)).then(function (data) {
      if (!data) return null;
      return loadImage(data).then(function (img) {
        if (!img) return null;
        var w = img.naturalWidth || 300, h = img.naturalHeight || 150, k = Math.min(4, 2000 / Math.max(w, h)), png;
        if (RASTER.test(data)) return { data: data, w: w, h: h, img: img };
        png = drawPng(img, Math.round(w * k), Math.round(h * k));
        return png ? { data: png, w: w, h: h, img: img } : null;
      });
    }, function () { return null; });
  }
  /* The logo resampled for where it is shown, at four pixels a point (about
     290 dpi, print quality): PptxGenJS stores a picture once per slide, and
     a tenant's original can run to hundreds of kilobytes. It keeps the
     original's size, which is what the layout reads. */
  function resample(logo, boxW, boxH) {
    var f = fitIn(logo, boxW, boxH), w = Math.ceil(f.w * 4), h = Math.ceil(f.h * 4), png;
    if (!logo.img || w >= logo.w || h >= logo.h) return logo;
    png = drawPng(logo.img, w, h);
    return png ? { data: png, w: logo.w, h: logo.h } : logo;
  }
  /* An icon's glyph, from the same SVG the PDF draws (GLYPH), rendered at
     four times its 36 pt on a transparent ground; the disc under it is a
     native circle. */
  function glyphPng(kind, color) {
    if (!hasCanvas() || !GLYPH[kind]) return Promise.resolve(null);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 36 36">' +
      GLYPH[kind].replace(/class="a"/g, 'fill="' + color + '"').replace(/class="w"/g, 'fill="#FFFFFF"') + '</svg>';
    return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)).then(function (img) {
      var png = img ? drawPng(img, 192, 192) : null;
      return png ? { data: png, w: 192, h: 192 } : null;
    });
  }
  /* The cover's and the close's vignette as a slide background: PowerPoint
     has no radial fill a deck can be sure of, so it is a picture. */
  function vignettePng() {
    if (!hasCanvas()) return null;
    try {
      var cv = document.createElement('canvas'), k = 640 / PAGE_W, g, grad, i;
      cv.width = 640;
      cv.height = 360;
      g = cv.getContext('2d');
      grad = g.createRadialGradient(320, 180, 0, 320, 180, 302 * k);
      for (i = 0; i < VIGNETTE.length; i++) grad.addColorStop(VIGNETTE[i][0] / 302, VIGNETTE[i][1]);
      g.fillStyle = grad;
      g.fillRect(0, 0, 640, 360);
      return cv.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }
  function glyphJob(out, kind, color) {
    return glyphPng(kind, color).then(function (v) { if (v) out.icons[kind] = v; });
  }
  function pptAssets(d) {
    var out = { logo: null, mark: null, icons: {}, vignette: vignettePng() }, jobs = [], seen = {}, i, j;
    /* one copy sized for the cover and the close, one for the page heads */
    jobs.push(logoData(d.m.b.logoUrl).then(function (v) {
      out.logo = v ? resample(v, 316.4, 152.33) : null;
      out.mark = v ? resample(v, 84, 37.47) : null;
    }));
    for (i = 0; i < d.pages.length; i++) {
      if (d.pages[i].kind !== 'overview') continue;
      for (j = 0; j < d.pages[i].flow.items.length; j++) {
        var kind = d.pages[i].flow.items[j][0];
        if (!seen[kind]) { seen[kind] = true; jobs.push(glyphJob(out, kind, d.m.pal.accentText)); }
      }
    }
    return Promise.all(jobs).then(function () { return out; });
  }

  /* ── the library, and the file ── */
  /* PptxGenJS, fetched once and only when a deck is first exported. A load
     that fails (offline, a blocker, the page's policy) says so and lets the
     next attempt try again. */
  var pptxLoading = null;
  function pptxLibrary(o) {
    if (typeof o.PptxGenJS === 'function') return Promise.resolve(o.PptxGenJS);
    if (typeof root.PptxGenJS === 'function') return Promise.resolve(root.PptxGenJS);
    if (pptxLoading) return pptxLoading;
    if (typeof document === 'undefined' || !document.createElement) {
      return Promise.reject(new Error('The PowerPoint export runs in a browser (or with opts.PptxGenJS).'));
    }
    pptxLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script'), done = false, t;
      function fail() {
        if (done) return;
        done = true;
        stop(t);
        pptxLoading = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error('The PowerPoint library could not be loaded from cdn.jsdelivr.net. Check the connection (or a content blocker) and try again.'));
      }
      s.onload = function () {
        if (done) return;
        if (typeof root.PptxGenJS !== 'function') { fail(); return; }
        done = true;
        stop(t);
        resolve(root.PptxGenJS);
      };
      s.onerror = fail;
      t = later(fail, 20000);
      s.crossOrigin = 'anonymous';
      s.integrity = PPTX_SRI;
      s.async = true;
      s.src = PPTX_URL;
      (document.head || document.body || document.documentElement).appendChild(s);
    });
    return pptxLoading;
  }
  /* The finished file, put right where PptxGenJS 4.0.1 writes what other
     readers take badly — Keynote and Quick Look (Apple's importer), Excel,
     and anything that checks the schema:
     - a table cell's insets are written on its tcPr, where PowerPoint reads
       them; Apple reads the cell's bodyPr, and without them pads every cell
       and grows every row. Each cell's bodyPr gets the same insets.
     - a paragraph of several runs gets a pPr before every run; the schema
       allows one. The runs repeat the same settings (textBox), so the first
       is kept.
     - "no outline" is written as an empty ln, which an app may fill from
       its defaults; it becomes an explicit noFill.
     - the workbook behind a chart carries an Excel table with a malformed
       range: Apple drops the chart and Excel "repairs" the workbook when
       someone picks Edit Data. The table goes; the data stays in the sheet.
     It needs JSZip, which the PptxGenJS bundle brings; without it (a test
     that injects only PptxGenJS) the file is left as PptxGenJS wrote it. */
  var PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  function cellInsets(xml) {
    return xml.replace(/<a:tc>([\s\S]*?)<\/a:tc>/g, function (all, inner) {
      var m = /<a:tcPr marL="(\d+)" marR="(\d+)" marT="(\d+)" marB="(\d+)"( anchor="\w+")?/.exec(inner);
      return m ? '<a:tc>' + inner.replace('<a:bodyPr/>', '<a:bodyPr lIns="' + m[1] + '" tIns="' + m[3] + '" rIns="' + m[2] +
        '" bIns="' + m[4] + '"' + (m[5] || '') + '/>') + '</a:tc>' : all;
    });
  }
  function onePPr(xml) {
    return xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, function (all, inner) {
      var seen = false;
      return '<a:p>' + inner.replace(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g, function (p) {
        if (seen) return '';
        seen = true;
        return p;
      }) + '</a:p>';
    });
  }
  function fixWorkbook(Zip, bytes) {
    return Zip.loadAsync(bytes).then(function (x) {
      x.remove('xl/tables');
      x.remove('xl/worksheets/_rels/sheet1.xml.rels');
      return x.file('[Content_Types].xml').async('string').then(function (s) {
        x.file('[Content_Types].xml', s.replace(/<Override PartName="\/xl\/tables\/table1\.xml"[^>]*\/>/, ''));
        return x.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      });
    });
  }
  function finish(Zip, buf) {
    return Zip.loadAsync(buf).then(function (zip) {
      var jobs = [];
      zip.forEach(function (path, file) {
        if (file.dir) return;
        if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
          jobs.push(file.async('string').then(function (s) {
            zip.file(path, onePPr(cellInsets(s)).replace(/<a:ln><\/a:ln>/g, '<a:ln><a:noFill/></a:ln>'));
          }));
        } else if (/^ppt\/embeddings\/[^\/]+\.xlsx$/.test(path)) {
          jobs.push(file.async('uint8array').then(function (b) { return fixWorkbook(Zip, b); }).then(function (b) { zip.file(path, b); }));
        }
      });
      return Promise.all(jobs).then(function () { return zip; });
    });
  }
  /* The deck out: returned as opts.write asks, or downloaded the way
     PptxGenJS downloads (writeFileToBrowser). */
  function output(pres, o, fileName) {
    var Zip = o.JSZip || root.JSZip;
    if (typeof Zip !== 'function' || typeof Zip.loadAsync !== 'function' || (!o.write && typeof pres.writeFileToBrowser !== 'function')) {
      if (o.write) return pres.write({ outputType: o.write, compression: true });
      return pres.writeFile({ fileName: fileName, compression: true }).then(function () { return { fileName: fileName }; });
    }
    return pres.write({ outputType: 'arraybuffer' }).then(function (buf) { return finish(Zip, buf); }).then(function (zip) {
      return zip.generateAsync({ type: o.write || 'blob', compression: 'DEFLATE', mimeType: PPTX_MIME });
    }).then(function (data) {
      if (o.write) return data;
      return pres.writeFileToBrowser(fileName, data).then(function () { return { fileName: fileName }; });
    });
  }
  /* "<Tenant> - <Project> - Investor One-Pager - Q3 2026.pptx", with every
     character a file system refuses taken out. */
  function deckFileName(m) {
    var q = clean(m.o.quarterLabel) || fmt.quarter(m.prepared), parts = [m.b.name, m.project, m.footerTitle, q === DASH ? '' : q], out = [], i;
    for (i = 0; i < parts.length; i++) {
      var s = clean(String(parts[i] || '').replace(/[\\\/:]+/g, '-').replace(/[*?"<>|\u0000-\u001f\u007f]+/g, ' '))
        .replace(/^[.\s-]+|[.\s]+$/g, '').slice(0, 80).replace(/\s+$/, '');
      if (s) out.push(s);
    }
    return (out.join(' - ') || 'Investor deck') + '.pptx';
  }
  function pptx(result, brand, opts) {
    var o = opts && typeof opts === 'object' ? opts : {}, d;
    try {
      d = deck(result, brand, o);
    } catch (e) {
      return Promise.reject(e);
    }
    if (!d) return Promise.reject(new Error('The pro forma has not run, so there is no deck to export.'));
    var m = d.m, fileName = deckFileName(m);
    return pptxLibrary(o).then(function (Lib) {
      return pptAssets(d).then(function (A) {
        var pres = new Lib(), i;
        pres.layout = 'LAYOUT_16x9';
        pres.theme = { headFontFace: CAL_LIGHT, bodyFontFace: CAL };
        pres.title = m.project + ' ' + DASH + ' ' + m.footerTitle;
        pres.subject = m.footerTitle;
        if (m.b.name) {
          pres.author = m.b.name;
          /* PptxGenJS escapes the title, subject and author but writes the
             company into docProps/app.xml as it is: a name with an & or a <
             would make the file unreadable. */
          pres.company = esc(m.b.name);
        }
        for (i = 0; i < d.pages.length; i++) PPT[d.pages[i].kind]({ s: pres.addSlide(), m: m, pal: m.pal, A: A }, d.pages[i]);
        return output(pres, o, fileName);
      });
    });
  }
  /* The file name an export would take, for a page that wants to say it. */
  pptx.fileName = function (result, brand, opts) {
    var d = deck(result, brand, opts);
    return d ? deckFileName(d.m) : '';
  };

  var API = {
    render: render,
    css: css,
    documentHtml: documentHtml,
    print: print,
    pptx: pptx,
    brandFrom: brandFrom,
    palette: palette,
    fmt: fmt,
    esc: esc,
    VERSION: VERSION
  };
  root.OmegaProformaReport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
