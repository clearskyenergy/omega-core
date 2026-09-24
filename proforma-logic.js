/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   proforma-logic.js — the BESS Pro Forma's investor deck, as HTML

   Takes what POST /api/proforma 'model' returns (the finance engine's result,
   api/_lib/proforma-engine.js) and the tenant's brand, and lays out the deck
   an investor is sent: cover, overview, the numbers, optional appendices
   (sizing basis, annual cash flow, disclosures) and a close.

     OmegaProformaReport.render(result, brand, opts)        the slides, for a preview
     OmegaProformaReport.css()                              the stylesheet they need
     OmegaProformaReport.documentHtml(result, brand, opts)  a complete printable document
     OmegaProformaReport.print(result, brand, opts)         prints it (Save as PDF)
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

  /* ── SHARED PIECES ──────────────────────────────────────────────────────── */
  function section(m, kind, inner) {
    return '<section class="pf-slide pf-' + kind + '" data-page="' + kind + '" style="' + paletteVars(m.pal) + '">' + inner + '</section>';
  }
  function logoImg(m) { return '<img src="' + esc(m.b.logoUrl) + '" alt="">'; }
  /* The kicker arrives as HTML (it may carry a separator); the title is text. */
  function head(m, kickerHtml, title) {
    var size = fitPt(title, TITLE_PT, TITLE_ROOM, 0.45, 14);
    return '<div class="pf-kicker">' + kickerHtml + '</div>' +
      '<h1 class="pf-title"' + (size < TITLE_PT ? ' style="font-size:' + size + 'pt"' : '') + '>' + esc(title) + '</h1>' +
      '<div class="pf-mark">' + (m.b.logoUrl ? logoImg(m) : m.b.name ? '<span class="pf-mark-name">' + esc(m.b.name) + '</span>' : '') + '</div>';
  }
  function foot(m) {
    m.page += 1;
    return '<div class="pf-foot"><span class="pf-foot-l">' + (m.b.name ? esc(m.b.name) + ' ' + DASH + ' ' : '') + esc(m.project) +
      '<span class="pf-bar">|</span>' + esc(m.footerTitle) + '</span><span class="pf-foot-r">' +
      (m.b.attribution ? '<span class="pf-foot-attr">' + esc(m.b.attribution) + '</span>' : '') + m.page + '</span></div>';
  }
  function row(label, value, cls) {
    return '<div class="pf-row' + (cls ? ' ' + cls : '') + '"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }
  function dotJoin(parts) {
    var out = [];
    for (var i = 0; i < parts.length; i++) if (parts[i]) out.push(esc(parts[i]));
    return out.join('<span class="pf-dot">' + DOT + '</span>');
  }
  /* A banner is one line in the reference, and its text is sized to stay one.
     Bold Calibri at the banner's tracking averages 0.41 em a character. */
  var PILL_EM = 0.43;
  function pill(parts, cls) {
    var shown = [];
    for (var i = 0; i < parts.length; i++) if (parts[i]) shown.push(parts[i]);
    var size = fitPt(shown.join('  ' + DOT + '  '), 9.38, PILL_ROOM, PILL_EM, 7.2);
    return '<div class="pf-pill ' + cls + '"' + (size < 9.38 ? ' style="font-size:' + size + 'pt"' : '') + '>' + dotJoin(shown) + '</div>';
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
     warehouse. */
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

  /* ── 1 · COVER ──────────────────────────────────────────────────────────── */
  /* The tagline's **words** are set bold in the accent, as the reference sets
     its last word. Escaped first, so the markup cannot become anything else. */
  function tagline(m) {
    return m.b.tagline ? esc(smart(m.b.tagline)).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*\*/g, '') : '';
  }
  function taglineSize(m, pt, widthPt) {
    var size = fitPt(m.b.tagline.replace(/\*\*/g, ''), pt, widthPt, 0.54, 12);
    return size < pt ? ' style="font-size:' + size + 'pt"' : '';
  }
  /* No logo: the brand's name is the mark. No name either: the project is,
     and the line under the rule is only the quarter, not the name again. */
  function cover(m) {
    var q = clean(m.o.quarterLabel) || fmt.quarter(m.prepared), tag = tagline(m), bare = !m.b.logoUrl && !m.b.name;
    return section(m, 'cover', '<div class="pf-cv">' +
      (m.b.logoUrl ? '<div class="pf-cv-logo">' + logoImg(m) + '</div>' : '<div class="pf-cv-name">' + esc(m.b.name || m.project) + '</div>') +
      (tag ? '<div class="pf-tag pf-cv-tag"' + taglineSize(m, 21.8, 600) + '>' + tag + '</div>' : '') +
      '<div class="pf-rule-s"></div><div class="pf-cv-sub">' + dotJoin(bare ? [q] : [m.project, q]) + '</div></div>');
  }

  /* ── 2 · OVERVIEW ───────────────────────────────────────────────────────── */
  function kpis(m) {
    var met = m.met, su = m.r.sourcesUses || {}, d = m.debt || {}, t = term(m), cards, html = '', i;
    var over = 'over the ' + (t ? t + '-year ' : '') + 'term', paid = num(met.paybackYears) !== null;
    var payback = paid ? fmt.years(met.paybackYears) : DASH, unpaid = 'not reached within the ' + (t ? t + '-year ' : '') + 'term';
    if (m.levered) {
      cards = [
        [fmt.moneyCompact(su.equity), 'equity sought, alongside', fmt.money(d.amount) + ' debt' +
          (num(d.ratePct) !== null ? ' at ' + fmt.percent(d.ratePct) : '') + (pos(d.tenorYears) ? ', ' + trimmed(d.tenorYears, 0) + ' yr' : '')],
        [fmt.pct(met.afterTaxIrr, 1), 'after-tax equity IRR', 'levered, ' + over],
        [fmt.money(met.totalReturns), 'total investor returns', 'over life of project'],
        [payback, 'after-tax equity payback', paid ? '' : unpaid]
      ];
    } else {
      cards = [
        [fmt.moneyCompact(su.equity != null ? su.equity : su.totalUses), 'total investment sought', '100% equity, unlevered'],
        [fmt.pct(met.afterTaxIrr, 1), 'after-tax unlevered IRR', over],
        [fmt.money(met.totalReturns), 'total investor returns', 'over life of project'],
        [payback, 'after-tax payback', paid ? 'cash + depreciation' + (m.itcFace ? ' + ITC' : '') : unpaid]
      ];
    }
    for (i = 0; i < cards.length; i++) {
      html += '<div class="pf-kpi"><div class="pf-kpi-v">' + esc(cards[i][0]) + '</div><div class="pf-kpi-c">' +
        esc(cards[i][1]) + (cards[i][2] ? '<br>' + esc(cards[i][2]) : '') + '</div></div>';
    }
    return '<div class="pf-kpis">' + html + '</div>';
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
  function flow(m) {
    var items = flowItems(m), n = items.length, small = n >= 6, colW = (CONTENT_W + 17.76) / n, twoLine = false, html = '', i;
    for (i = 0; i < n; i++) if (linesOf(items[i][1], small ? 7.94 : 9.38, colW - 8, 0.5) > 1) twoLine = true;
    for (i = 0; i < n; i++) {
      html += '<div class="pf-fi">' + icon(items[i][0]) + '<div class="pf-fl">' + esc(items[i][1]) + '</div>' +
        '<div class="pf-fc">' + esc(items[i][2]) + '</div>' + (i < n - 1 ? ARROW : '') + '</div>';
    }
    return '<div class="pf-flow' + (small ? ' pf-flow-sm' : '') + (twoLine ? ' pf-flow-2l' : '') +
      '" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + html + '</div>';
  }
  /* The deal in one line: the PPA, or how the battery is paid for. */
  function termsPill(m) {
    var t = term(m), b = at(m.inp, 'revenue.bess') || {}, host = m.host;
    if (m.ppa) {
      return pill([(t ? t + '-year ' : '') + 'PPA', fmt.rate(m.ppa.rate1) + ' in year one',
        pos(m.ppa.escalatorPct) ? fmt.percent(m.ppa.escalatorPct) + ' annual escalator' : '', host ? 'Off-taker: ' + host : ''], 'pf-pill-ov');
    }
    if (m.bess && m.bessMode === 'shared-savings') {
      return pill([(t ? t + '-year ' : '') + 'shared-savings agreement',
        pos(b.sharePct) ? fmt.percent(b.sharePct) + ' of bill savings to the project' : '', host ? 'Host: ' + host : ''], 'pf-pill-ov');
    }
    if (m.bess && m.bessMode === 'fixed') {
      return pill([(t ? t + '-year ' : '') + 'energy services agreement', pos(b.fixedPerKwMonth) ? fmt.money(b.fixedPerKwMonth) + '/kW-month' : '',
        pos(b.escalatorPct) ? fmt.percent(b.escalatorPct) + ' annual escalator' : '', host ? 'Host: ' + host : ''], 'pf-pill-ov');
    }
    var saved = pos(at(m.r, 'revenue.hostSavingsY1'));
    return pill([m.bessMode === 'host-owned' ? 'Host-owned battery' : '', t ? t + '-year analysis' : '',
      saved ? fmt.money(saved) + ' year-one bill savings' : '', host ? 'Host: ' + host : ''], 'pf-pill-ov');
  }
  function overview(m) {
    var kicker = esc(m.footerTitle.toUpperCase()) + '<span class="pf-dot">' + DOT + '</span>PREPARED ' + esc(fmt.date(m.prepared));
    return section(m, 'overview', head(m, kicker, titleText(m)) +
      '<div class="pf-ov"><p class="pf-narr">' + esc(noWidow(narrative(m))) + '</p><i class="pf-g pf-g1"></i>' + kpis(m) +
      '<i class="pf-g pf-g2"></i><div class="pf-label">How the system works</div><i class="pf-g pf-g3"></i>' + flow(m) +
      '<i class="pf-g pf-g4"></i>' + termsPill(m) + '<i class="pf-g pf-gx"></i></div>' + foot(m));
  }

  /* ── 3 · THE NUMBERS ────────────────────────────────────────────────────── */
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
  function returnsColumn(m) {
    var met = m.met, t = term(m), yr = t ? t + '-yr' : 'term', build = buildPts(m), dist = '', html;
    html = '<div class="pf-sec"><div class="pf-label">Returns</div><div class="pf-big">' + esc(fmt.money(met.totalReturns)) + '</div>' +
      '<div class="pf-cap">total returns over the life of the project</div><div class="pf-rows">';
    if (m.levered) {
      var cash = num(at(m.r, 'tax.itc.cash')), sold = at(m.r, 'tax.itc.monetization') === 'transfer' && cash;
      var during = met.distributionsDuringDebt, after = met.distributionsAfterDebt, tenor = pos(m.debt && m.debt.tenorYears);
      html += row('After-tax equity IRR, levered ' + yr, fmt.pct(met.afterTaxIrr, 2)) +
        row('Payback period, after-tax equity', fmt.years(met.paybackYears)) + '</div></div>';
      if (num(met.year1Distribution) !== null) {
        dist += row('Year 1' + (sold ? ', incl. ' + fmt.money(cash) + ' ITC transfer' : ''), fmt.money(met.year1Distribution));
      }
      if (during && num(during.min) !== null && num(during.max) !== null) {
        dist += row('Through the ' + (tenor ? trimmed(tenor, 0) + '-year ' : '') + 'debt term', fmt.band(during.min, during.max));
      }
      if (after && num(after.min) !== null && num(after.max) !== null) dist += row('Once debt is repaid', fmt.band(after.min, after.max));
      if (dist) html += '<div class="pf-sec"><div class="pf-label">Investor distributions</div><div class="pf-rows">' + dist + '</div></div>';
    } else {
      var note = [], trend = distributionTrend(m), ups = upsides(m);
      if (num(met.year1Distribution) !== null) html += row('Investor cash distributions, Year 1', fmt.money(met.year1Distribution));
      html += row('After-tax unlevered IRR, ' + yr, fmt.pct(met.afterTaxIrr, 2)) +
        row('Payback period, after-tax', fmt.years(met.paybackYears)) + '</div>';
      if (trend) note.push('Distributions ' + trend + ' over the full ' + (t ? t + '-year ' : '') + 'term.');
      if (ups.length && num(met.afterTaxIrr) !== null) note.push('The IRR shown excludes ' + list(ups.slice(0, 2)) + '.');
      if (num(met.paybackYears) !== null) note.push('Payback reflects cash + depreciation' + (m.itcFace ? ' + ITC.' : '.'));
      html += (note.length ? '<p class="pf-note pf-note-sec">' + esc(noWidow(note.join(' '))) + '</p>' : '') + '</div>';
    }
    if (build) {
      var dep = build.depreciation;
      html += '<div class="pf-sec"><div class="pf-label">IRR build (' + (t ? t + '-year, ' : '') + 'after tax)</div>' +
        '<div class="pf-rows pf-rows-sm">' +
        row('Cash only (pre-tax operating cash flow)', '~' + build.cashOnly.toFixed(1) + '%') +
        row('Incremental depreciation effect', '~' + fmt.pts(dep) + ' pts') +
        row('Incremental ITC effect', '~' + fmt.pts(build.itc) + ' pts', 'pf-row-rule') +
        row('Total after-tax IRR', build.total.toFixed(1) + '%', 'pf-row-total') + '</div>';
      /* a levered column spends this space on the distributions */
      if (!m.levered && dep !== 0) {
        html += '<p class="pf-note">' + esc(dep > 0 ? 'Depreciation adds to the cash-only return after tax.'
          : dep >= -1.5 ? 'Net depreciation timing effect is slightly negative on top of cash-only.'
            : 'Net of income tax, the depreciation effect is negative on top of cash-only.') + '</p>';
      }
      html += '</div>';
    }
    return '<div class="pf-col pf-c1">' + html + '</div>';
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
  function taxColumn(m) {
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
    var budget = COL_H - BULLET_TOP - 3.4 - (note ? 8 + linesOf(note, 7.2, COL_W) * BULLET_LINE : 0);
    return '<div class="pf-col pf-c2"><div class="pf-label">Tax</div>' + bullets(fit(items, budget)) +
      (note ? '<p class="pf-note pf-fn">' + esc(noWidow(note)) + '</p>' : '') + '</div>';
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
  function revenueColumn(m) {
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
    var su = sourcesUses(m);
    return '<div class="pf-col pf-c3"><div class="pf-label">Revenue &amp; opex</div>' + bullets(fit(items, su.budget)) + su.html + '</div>';
  }

  /* The sources & uses table sits at the foot of the third column; what it
     takes is what the bullets above it cannot have. */
  function sourcesUses(m) {
    var su = m.r.sourcesUses || {}, uses = arr(su.uses), shown = [], total = num(su.totalUses), rows = '', note, i;
    for (i = 0; i < uses.length; i++) {
      /* a use of nothing (no reserve, no fee) is not a line */
      if (uses[i] && clean(uses[i].label) && num(uses[i].amount) !== null && Math.round(num(uses[i].amount)) !== 0) shown.push(uses[i]);
    }
    if (!shown.length && total === null) return { html: '', budget: COL_H - BULLET_TOP - 7.1 };
    for (i = 0; i < shown.length; i++) rows += row(clean(shown[i].label), fmt.money(shown[i].amount), i === shown.length - 1 ? 'pf-row-rule' : '');
    rows += row('Total uses', fmt.money(total), 'pf-row-total');
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
    return {
      html: '<div class="pf-su"><div class="pf-label">Sources &amp; uses</div><div class="pf-rows">' + rows + '</div>' +
        '<p class="pf-note pf-su-note">' + esc(noWidow(note)) + '</p></div>',
      budget: COL_H - BULLET_TOP - 7.1 - height
    };
  }

  /* The banner under the columns. With every upside named it can run long,
     so the reference's wording gives way to a shorter one before the type
     gets smaller. */
  function floorPill(m) {
    var ups = upsides(m), text;
    if (!ups.length) return pill(['Modeled returns are after tax on the base case shown, with no upside revenue assumed.'], 'pf-pill-n');
    text = 'Modeled returns shown are a floor ' + DASH + ' actual returns may be higher with ' + list(ups) + '.';
    if (fitPt(text, 9.38, PILL_ROOM, PILL_EM, 7.2) < 9.38) text = 'Modeled returns shown are a floor ' + DASH + ' upside from ' + list(ups) + '.';
    return pill([text], 'pf-pill-n');
  }
  function numbers(m) {
    var title = m.levered ? 'Returns, capital structure and operating economics' : 'Returns, tax basis and operating economics';
    return section(m, 'numbers', head(m, 'THE NUMBERS', title) +
      '<div class="pf-cols"><i class="pf-vr pf-vr1"></i><i class="pf-vr pf-vr2"></i>' +
      returnsColumn(m) + taxColumn(m) + revenueColumn(m) + '</div>' + floorPill(m) + foot(m));
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
  function f2(n) { return n.toFixed(2); }
  /* Monthly peaks before and with the battery, drawn in points on a 433 ×
     152 viewBox so type and bars scale with the slide. */
  function peakChart(months) {
    var W = 433.44, H = 152, L = 30, T = 16, B = 16, pw = W - L - 4, ph = H - T - B, n = months.length, max = 0, svg = '', i, v;
    for (i = 0; i < n; i++) max = Math.max(max, num(at(months[i], 'peakKw')) || 0, num(at(months[i], 'afterKw')) || 0);
    if (!(max > 0)) return '';
    var step = niceStep(max, 4), top = Math.ceil(max / step) * step, slot = pw / n, bw = Math.min(11, slot * 0.34), every = n > 12 ? 2 : 1;
    for (v = 0; v <= top + step / 2; v += step) {
      var y = T + ph - v / top * ph;
      svg += '<line class="gl" x1="' + L + '" x2="' + (W - 4) + '" y1="' + f2(y) + '" y2="' + f2(y) + '"/>' +
        '<text class="ax" x="' + (L - 4) + '" y="' + f2(y + 2.2) + '" text-anchor="end">' + esc(trimmed(v, 0)) + '</text>';
    }
    for (i = 0; i < n; i++) {
      var mo = months[i] || {}, x = L + slot * i + slot / 2, before = num(mo.peakKw) || 0, after = num(mo.afterKw), hb = before / top * ph;
      svg += '<rect class="bb" x="' + f2(x - bw - 0.6) + '" y="' + f2(T + ph - hb) + '" width="' + f2(bw) + '" height="' + f2(hb) + '"/>';
      if (after !== null) {
        var ha = after / top * ph;
        svg += '<rect class="ba" x="' + f2(x + 0.6) + '" y="' + f2(T + ph - ha) + '" width="' + f2(bw) + '" height="' + f2(ha) + '"/>';
      }
      if (i % every === 0) {
        svg += '<text class="ax" x="' + f2(x) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(clean(mo.label).slice(0, 3)) + '</text>';
      }
    }
    svg += '<text class="lg" x="' + L + '" y="8.4">kW</text>' +
      '<rect class="bb" x="' + (W - 150) + '" y="2" width="7" height="7"/><text class="lg" x="' + (W - 140) + '" y="8.4">Before</text>' +
      '<rect class="ba" x="' + (W - 96) + '" y="2" width="7" height="7"/><text class="lg" x="' + (W - 86) + '" y="8.4">With battery</text>';
    return '<svg class="pf-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="Monthly peak demand before and with the battery">' + svg + '</svg>';
  }
  /* What the sizing engine chose and why, from the size result the model
     carried (inputs.bess.sizing). A manual size has none and gets no page;
     the NO_SIZING warning says so in the disclosures. */
  function sizingPages(m) {
    var s = m.bess && m.bess.sizing;
    if (!s || !s.system || !pos(s.system.kw)) return [];
    var sys = s.system, sav = s.savings || {}, load = s.load || {}, alts = arr(s.alternatives);
    var months = pos(load.months) ? ', ' + trimmed(load.months, 0) + ' months' : '', rows = '', saving = '', altRows = '', i;
    var basis = s.basis === 'interval' ? (pos(load.intervalMin) ? trimmed(load.intervalMin, 0) + '-minute interval data' : 'Interval data') + months
      : 'Monthly bills' + months;
    var delivered = pos(sys.effectiveDurationH) && Math.abs(sys.effectiveDurationH - sys.durationH) > 0.05
      ? ' (' + trimmed(sys.effectiveDurationH, 2) + ' h delivered)' : '';
    rows += row('Load basis', basis) + row('Power', kwWords(sys.kw));
    if (pos(sys.usableKwh)) rows += row('Usable energy', kwhWords(sys.usableKwh));
    if (pos(sys.nameplateKwh)) rows += row('Nameplate energy', kwhWords(sys.nameplateKwh));
    if (pos(sys.durationH)) rows += row('Duration', trimmed(sys.durationH, 1) + ' h' + delivered);
    if (pos(s.annualPeakKw)) rows += row('Annual peak demand', kwWords(s.annualPeakKw));
    if (pos(s.throughputKwhYr)) rows += row('Discharge per year', kwhWords(s.throughputKwhYr));
    if (pos(s.cyclesYr)) rows += row('Full cycles per year', trimmed(s.cyclesYr, 0));
    rows += row('Degradation', s.degradation === 'measured' ? 'Measured on this load' : 'Scaled by state of health');
    if (pos(s.minSohPct)) rows += row('Replace below', trimmed(s.minSohPct, 0) + '% state of health');
    rows += row('Replacement', replacementWords(s.replacements) || 'None within the term');
    if (num(sav.demandY1) !== null) saving += row('Demand charge savings', fmt.money(sav.demandY1));
    if (num(sav.lossY1) !== null) saving += row('Charging losses', fmt.money(-Math.abs(sav.lossY1)));
    if (num(sav.netY1) !== null) saving += row('Net bill savings', fmt.money(sav.netY1), 'pf-row-total');
    if (num(sav.p90Y1) !== null) saving += row('Downside (P90) net savings', fmt.money(sav.p90Y1));
    for (i = 0; i < alts.length; i++) {
      var a = alts[i] || {};
      if (!pos(a.durationH) || !pos(a.kw)) continue;
      altRows += '<tr' + (a.chosen ? ' class="pf-on"' : '') + '><td>' + esc(trimmed(a.durationH, 1)) + ' h</td><td>' + esc(kwWords(a.kw)) +
        '</td><td>' + esc(pos(a.usableKwh) ? kwhWords(a.usableKwh) : DASH) + '</td><td>' + esc(fmt.money(a.netY1)) +
        '</td><td>' + esc(fmt.money(a.npv)) + '</td></tr>';
    }
    var chart = peakChart(arr(s.months));
    var line = 'Sized with the ' + m.b.platformName + ' battery engine on ' + lowerFirst(basis) + ': ' + fmt.kw(sys.kw) +
      (pos(sys.usableKwh) ? ' / ' + fmt.kwh(sys.usableKwh) + ' usable' : '') +
      (num(sav.netY1) !== null ? ', ' + fmt.money(sav.netY1) + ' net bill savings in year one.' : '.');
    return [section(m, 'sizing', head(m, 'APPENDIX ' + DOT + ' SIZING BASIS', 'How the battery was sized') +
      '<div class="pf-cols pf-cols-sz"><i class="pf-vr pf-vr1"></i>' +
      '<div class="pf-col pf-c1"><div class="pf-label">System</div><div class="pf-rows pf-rows-sm">' + rows + '</div></div>' +
      '<div class="pf-col pf-c23">' + (chart ? '<div class="pf-label">Monthly peak demand</div>' + chart : '') +
      '<div class="pf-sz-low"><div><div class="pf-label">Year-1 savings</div><div class="pf-rows pf-rows-sm">' + saving + '</div></div>' +
      (altRows ? '<div><div class="pf-label">Alternatives by duration</div><table class="pf-tab"><thead><tr><th>Duration</th><th>Power</th>' +
        '<th>Usable</th><th>Net year 1</th><th>Screening NPV</th></tr></thead><tbody>' + altRows + '</tbody></table></div>' : '') +
      '</div></div></div>' + pill([line], 'pf-pill-n') + foot(m))];
  }

  /* ── APPENDIX · ANNUAL CASH FLOW ────────────────────────────────────────── */
  /* Costs arrive as positive amounts (opex, debt service, tax paid) and are
     shown the way a cash-flow statement shows them, in brackets; a zero is a
     dash, so the eye finds the years that carry something. */
  function cashCell(v, costLike) {
    var n = num(v);
    if (n === null) return '<td></td>';
    var r = Math.round(costLike ? -n : n);
    return '<td>' + (r === 0 ? NDASH : r < 0 ? '(' + grouped(r, 0) + ')' : grouped(r, 0)) + '</td>';
  }
  function cashflowPages(m) {
    var rows = arr(m.r.rows), cols = [['Year', null]], ths = '', body = [], eq = num(at(m.r, 'year0.equity')), pages = [], i, c;
    if (!rows.length) return [];
    if (m.solar) cols.push(['Solar kWh', 'solarKwh']);
    cols.push(['Revenue', 'revenue'], ['Opex', 'opex', true], ['EBITDA', 'ebitda']);
    if (m.levered) cols.push(['Debt service', 'debtService', true]);
    cols.push(['Pre-tax cash', 'preTaxCash'], ['Tax depreciation', 'depreciationFed'],
      ['State tax', 'stateTax', true], ['Federal tax', 'fedTax', true]);
    if (m.itcFace) cols.push(['ITC', 'itc']);
    cols.push(['After-tax cash', 'afterTaxCash'], ['Cumulative', 'cumulativeAfterTax']);
    for (c = 0; c < cols.length; c++) ths += '<th>' + esc(cols[c][0]) + '</th>';
    /* year 0 is the equity going in: the cash columns and nothing else */
    if (eq !== null) {
      var zero = '';
      for (c = 0; c < cols.length; c++) {
        zero += !cols[c][1] ? '<td>0</td>'
          : /^(preTaxCash|afterTaxCash|cumulativeAfterTax)$/.test(cols[c][1]) ? cashCell(-Math.abs(eq)) : '<td></td>';
      }
      body.push('<tr class="pf-y0">' + zero + '</tr>');
    }
    for (i = 0; i < rows.length; i++) {
      var r = rows[i] || {}, tr = '';
      for (c = 0; c < cols.length; c++) {
        tr += cols[c][1] ? cashCell(r[cols[c][1]], cols[c][2]) : '<td>' + esc(num(r.year) !== null ? trimmed(r.year, 0) : String(i + 1)) + '</td>';
      }
      body.push('<tr>' + tr + '</tr>');
    }
    /* year 0 and a 30-year term fit one page; a longer term splits evenly */
    var chunks = Math.ceil(body.length / 31), per = Math.ceil(body.length / chunks);
    var title = (term(m) ? term(m) + '-year ' : '') + 'after-tax cash flow to the investor';
    for (var p = 0; p < chunks; p++) {
      var kicker = 'APPENDIX ' + DOT + ' ANNUAL CASH FLOW' + (chunks > 1 ? ' ' + DOT + ' ' + (p + 1) + ' OF ' + chunks : '');
      pages.push(section(m, 'cashflow', head(m, kicker, title) + '<div class="pf-cf"><table class="pf-tab pf-tab-cf"><thead><tr>' + ths +
        '</tr></thead><tbody>' + body.slice(p * per, (p + 1) * per).join('') + '</tbody></table><p class="pf-note">Nominal dollars. ' +
        'Year 0 is the equity investment. Costs and taxes paid are in brackets; a tax benefit is cash in.</p></div>' + foot(m)));
    }
    return pages;
  }

  /* ── APPENDIX · DISCLOSURES ─────────────────────────────────────────────── */
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
      blocks.push({ li: '<li class="pf-w-' + lvl + '"><b>' + word + ':</b> ' + esc(clean(warns[i].text)) + '</li>',
        text: word + ': ' + clean(warns[i].text) });
    }
    if (assumptions.length) blocks.push({ h: 'Assumptions' });
    for (i = 0; i < assumptions.length; i++) blocks.push({ li: '<li>' + esc(clean(assumptions[i])) + '</li>', text: clean(assumptions[i]) });
    var method = 'Single-owner after-tax cash flow, SAM-consistent: equity at year 0, operations from year 1, the investment tax ' +
      'credit in year 1, depreciation on a basis reduced by half the credit, and the reserves, taxes and debt set out in the ' +
      'assumptions. Modeled by the ' + m.b.platformName + ' pro forma engine';
    var legal = 'For discussion only. This is not an offer to sell or a solicitation of an offer to buy any security. Projections ' +
      'are estimates on the assumptions listed and are not guarantees of future results; tax treatment depends on the facts and ' +
      'the law when a return is filed ' + DASH + ' confirm with tax counsel.';
    blocks.push({ h: 'Method' });
    /* the version is one unbreakable token: 'pf-' at a line end reads as a typo */
    blocks.push({ p: '<p>' + esc(method) + (version ? ', version <span class="pf-nb">' + esc(version) + '</span>' : '') + '.</p>',
      text: method + ', version ' + version + '.' });
    blocks.push({ p: '<p class="pf-legal">' + esc(legal) + '</p>', text: legal });

    /* The browser balances the three columns; what is decided here is only
       where a page ends, from estimated heights, so a long list of
       assumptions carries onto a second page instead of running off the
       first. The estimate is pessimistic and a page is filled to 85%. */
    for (i = 0; i < blocks.length; i++) {
      var bk = blocks[i], h = bk.h ? 19.5 : linesOf(bk.text, 6.8, bk.li ? COL_W - 9 : COL_W) * 8.2 + 4.2, pg = pages[pages.length - 1];
      if (used + h > 3 * DIS_H * 0.85 && pg.length) {
        var carry = pg[pg.length - 1].h ? [pg.pop()] : [];   // a heading never ends a page
        pages.push(carry);
        used = carry.length ? 19.5 : 0;
      }
      pages[pages.length - 1].push(bk);
      used += h;
    }
    for (var p = 0; p < pages.length; p++) {
      var html = '', open = false;
      for (var j = 0; j < pages[p].length; j++) {
        var b = pages[p][j];
        if (b.li) {
          html += (open ? '' : '<ul class="pf-dl">') + b.li;
          open = true;
        } else {
          html += (open ? '</ul>' : '') + (b.h ? '<div class="pf-label">' + esc(b.h) + '</div>' : b.p);
          open = false;
        }
      }
      var kicker = 'APPENDIX ' + DOT + ' DISCLOSURES' + (pages.length > 1 ? ' ' + DOT + ' ' + (p + 1) + ' OF ' + pages.length : '');
      out.push(section(m, 'disclosures', head(m, kicker, 'Assumptions, method and warnings') +
        '<div class="pf-dx">' + html + (open ? '</ul>' : '') + '</div>' + foot(m)));
    }
    return out;
  }

  /* ── LAST · CLOSE ───────────────────────────────────────────────────────── */
  /* The reference's close: the tagline large, the rule, then the logo left of
     centre and the contact lines right of it. Without a logo the lines sit
     centred under the rule, led by the name when the tagline took the large
     line; the name is never printed twice. */
  function closing(m) {
    var given = arr(at(m.o, 'contact.lines')), lines = [], tag = tagline(m), i;
    for (i = 0; i < given.length && lines.length < 6; i++) if (clean(given[i])) lines.push(esc(clean(given[i])));
    if (!lines.length) lines.push('Thank you');
    var below = m.b.logoUrl
      ? '<div class="pf-cl-row"><div class="pf-cl-logo">' + logoImg(m) + '</div><div class="pf-cl-lines">' + lines.join('<br>') + '</div></div>'
      : '<div class="pf-cl-solo">' + (tag && m.b.name ? '<b>' + esc(m.b.name) + '</b><br>' : '') + lines.join('<br>') + '</div>';
    return section(m, 'close', '<div class="pf-tag pf-cl-tag"' + (tag ? taglineSize(m, 36.9, 672) : '') + '>' +
      (tag || esc(m.b.name || m.project)) + '</div><div class="pf-rule-s pf-cl-rule"></div>' + below);
  }

  /* ── THE DECK ───────────────────────────────────────────────────────────── */
  function slides(result, brand, opts) {
    if (!result || typeof result !== 'object' || result.ok === false || !result.inputs) return [];
    var m = context(result, brand, opts), out = [cover(m), overview(m), numbers(m)];
    if (m.inc.sizing) out = out.concat(sizingPages(m));
    if (m.inc.cashflow) out = out.concat(cashflowPages(m));
    if (m.inc.disclosures) out = out.concat(disclosurePages(m));
    out.push(closing(m));
    return out;
  }

  /* The preview: each slide in a frame that takes the scaled size. An empty
     string for a result that did not run. */
  function render(result, brand, opts) {
    var pages = slides(result, brand, opts), html = '';
    for (var i = 0; i < pages.length; i++) html += '<div class="pf-frame">' + pages[i] + '</div>';
    return html ? '<div class="pf-deck">' + html + '</div>' : '';
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
      /* 1 · cover, and the close: the reference's radial vignette, measured */
      '.pf-cover,.pf-close{background:#DEDEDE radial-gradient(circle at 50% 50%,#FFFFFF 0,#FFFFFF 133pt,#FDFDFD 153pt,#FAFAFA 173pt,',
      '#F5F5F5 193pt,#EFEFEF 213pt,#E9E9E9 233pt,#E3E3E3 253pt,#E0E0E0 273pt,#DFDFDF 290pt,#DEDEDE 302pt)}',
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

  var API = {
    render: render,
    css: css,
    documentHtml: documentHtml,
    print: print,
    brandFrom: brandFrom,
    palette: palette,
    fmt: fmt,
    esc: esc,
    VERSION: VERSION
  };
  root.OmegaProformaReport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
