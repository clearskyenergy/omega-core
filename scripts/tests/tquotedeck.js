/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The customer proposal deck (omega-quote-deck.js), rendered in Node from a
   fixture customer view: every string escaped, no amount it was not given,
   the site plan drawn from the Prime layout (area, unit, transformer,
   disconnect, POI, conduit with its length, north, scale) ON the Esri World
   Imagery export for its frame — the URL built from the frame's bbox, the
   image and the drawing proved to line up on known coordinates, the
   credit on it, imagery off giving the clean plan, print waiting for the
   image (bounded) — the letterhead's
   fallbacks, the attribution footer, and each acceptance state. Then the
   public page (quote.html) run in a stub DOM: its states, that Approve
   sends the snapshot the customer saw, and that a valid-until DATE is the
   day the customer was given, lasting to the end of that UTC day. Run in a
   US time zone on purpose: a date-only value read as an instant is a day
   early west of UTC, which a UTC machine never shows.
   node scripts/tests/tquotedeck.js */
'use strict';
process.env.TZ = 'America/Chicago';
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const D = require('../../omega-quote-deck.js');
let count = 0;
function ok(c, m) { assert.ok(c, m); count++; }
function eq(a, b, m) { assert.equal(a, b, m); count++; }

/* markup balance, SVG included (the Quote Desk test's parser, with self-closing tags) */
const VOID = { input: 1, br: 1, img: 1, hr: 1, meta: 1, link: 1 };
function balanced(html) {
  const stack = [], re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m, consumed = 0;
  while ((m = re.exec(html))) {
    if (/</.test(html.slice(consumed, m.index))) return 'unparsed "<" at ' + consumed;
    consumed = re.lastIndex;
    const tag = m[2].toLowerCase();
    if (VOID[tag]) continue;
    if (m[1]) { const top = stack.pop(); if (top !== tag) return 'mismatched </' + tag + '> (open ' + top + ')'; }
    else if (!/\/$/.test(m[3])) stack.push(tag);
  }
  if (/</.test(html.slice(consumed))) return 'trailing unparsed "<"';
  return stack.length ? 'unclosed <' + stack.join('>, <') + '>' : '';
}

/* ── a C2 layout at a real place: area, unit, transformer and disconnect in a
   row to the east, the POI north-east, an L-shaped conduit ──────────────── */
const LAT = 42.0354, LNG = -88.2826, R = 6378137, FT = 3.280839895;
function off(dxFt, dyFt) { return { lat: +(LAT + dyFt / FT / R * 180 / Math.PI).toFixed(7), lng: +(LNG + dxFt / FT / (R * Math.cos(LAT * Math.PI / 180)) * 180 / Math.PI).toFixed(7) }; }
const SW = off(-20, -15), NE = off(40, 15);
const LAYOUT = {
  v: 2, unitKey: 'CLEANCELL-CC290-125-REV-H', hash: '1a2b3c4d',
  area: { s: SW.lat, w: SW.lng, n: NE.lat, e: NE.lng, wFt: 60, hFt: 30, sqft: 1800 },
  unit: { c: off(0, 0), lFt: 20, wFt: 8, rotDeg: 0, footprint: 'catalog' },
  xfmr: { c: off(19, 0), lFt: 8, wFt: 8, rotDeg: 0 },
  disco: { c: off(30.5, 0), lFt: 3, wFt: 4, rotDeg: 0 },
  poi: off(110, 70),
  conduit: { pts: [off(30.5, 0), { lat: off(30.5, 0).lat, lng: off(110, 70).lng }, off(110, 70)], ft: 149.5, type: 'PVC-UG' },
  conduitFt: 149.5
};
function view(extra) {
  const v = {
    id: 'qt-0123456789abcdef', quoteNo: 'NORTHWIND-Q-20261017-4F2A1', rev: 2, status: 'sent',
    issuedAt: Date.UTC(2026, 9, 17, 15), validUntil: Date.UTC(2026, 10, 16, 15), snapshot: 'snap-9f8e7d',
    seller: { name: 'Northwind Solar', logoUrl: '', accent: '#0E7C66', tagline: 'Storage that pays its way',
      company: { legalName: 'Northwind Solar LLC', address: { line1: '200 W Monroe St', line2: 'Suite 1400', city: 'Chicago', state: 'IL', postalCode: '60606' },
        phone: '(312) 555-0142', email: 'sales@northwind.example', website: 'https://northwind.example/' },
      rep: { name: 'Dana Reyes', email: 'dana@northwind.example' }, attribution: 'Powered by Clean Cell Power Platform' },
    customer: { name: 'Pat Kim', company: 'Elgin Cold Storage', email: 'pat@elgincold.example', phone: '847-555-0100', address: { line1: '1200 W Industrial Dr', city: 'Elgin', state: 'IL', zip: '60123' } },
    site: { address: '1200 W Industrial Dr, Elgin, IL 60123', utility: 'ComEd', circuit: 'Feeder 12345 · Elgin TSS 91' },
    system: { unit: { mfr: 'Clean Cell', model: 'CC290-125', short: 'CC290/125', kw: 125, kwh: 290, kwhApprox: false, usable: 261, hours: 2.32, chem: 'LFP', footprint: 'catalog', caveat: 'Reference specification (Rev H); confirm against the released submittal.' },
      layout: LAYOUT, conduitFt: 149.5, areaSqft: 1800 },
    scope: [{ name: 'Battery energy storage system, delivered to site', amount: null }, { name: 'Pad, conduit and installation', amount: null }, { name: 'Commissioning and utility witness test', amount: null }],
    price: { total: '$412,500', note: 'The battery line is quoted by Clean Cell.' },
    terms: { validDays: 30, paymentTerms: '30% at signing\n60% on delivery\n10% at commissioning', notes: 'Utility interconnection fees are billed at cost.', exclusions: ['Utility upgrades beyond the point of interconnection', 'Permit fees'] },
    decision: { approvedAt: null, approvedBy: null, declinedAt: null, declineReason: null }
  };
  return Object.assign(v, extra || {});
}

/* 1 · the source: ES5, our notice, exported for Node and the browser */
const SRC = fs.readFileSync(path.join(ROOT, 'omega-quote-deck.js'), 'utf8');
ok(/© 2025–2026 ClearSky Energy Solutions LLC\. Proprietary and Confidential\./.test(SRC.split('\n')[0]), 'the notice is on line one');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
ok(!/=>|\blet\s|\bconst\s|`|\basync\b|\bclass\s/.test(CODE), 'ES5: no arrows, let/const, template literals, async or classes');
ok(['body', 'document', 'print', 'plan', 'css'].every(function (k) { return typeof D[k] === 'function'; }), 'body, document, print, plan and css are exported');

/* 2 · the proposal: every block, balanced */
const V = view(), H = D.body(V);
eq(balanced(H), '', 'the deck markup balances, SVG included');
ok(/class="oqd-word">Northwind Solar</.test(H), 'no logo: the seller name is the wordmark');
ok(/<b>Northwind Solar LLC<\/b>/.test(H) && /200 W Monroe St<br>Suite 1400<br>Chicago, IL 60606/.test(H), 'the letterhead carries the legal name and the address');
ok(/\(312\) 555-0142 · sales@northwind\.example · northwind\.example</.test(H), 'and phone · email · website (the scheme dropped)');
ok(/Storage that pays its way/.test(H), 'and the tagline');
ok(/Quote no\.<\/th><td>NORTHWIND-Q-20261017-4F2A1/.test(H) && /Revision<\/th><td>2</.test(H), 'the quote number and revision');
ok(/Date<\/th><td>October 17, 2026/.test(H) && /Valid until<\/th><td>November 16, 2026/.test(H), 'issued and valid-until dates');
ok(/Prepared by<\/th><td>Dana Reyes<span>dana@northwind\.example<\/span>/.test(H), 'prepared by the rep, with the address');
ok(/125 kW \/ 290 kWh battery energy storage system/.test(H), 'the heading names the system');
ok(/Prepared for<\/h3><b>Pat Kim<\/b><br>Elgin Cold Storage<br>1200 W Industrial Dr<br>Elgin, IL 60123<br>pat@elgincold\.example · 847-555-0100/.test(H), 'the prepared-for block');
ok(/Utility: ComEd/.test(H) && /Circuit: Feeder 12345 · Elgin TSS 91/.test(H), 'the site: utility and circuit');
ok(/Equipment<\/th><td>Clean Cell CC290-125/.test(H) && /Usable energy<\/th><td>261 kWh/.test(H) && /2\.3 hours at rated power/.test(H) && /Chemistry<\/th><td>LFP/.test(H), 'the unit specs');
ok(/Footprint<\/th><td>20 ft × 8 ft <span>\(manufacturer’s catalogue\)/.test(H), 'the footprint as drawn, on the catalogue\'s word');
ok(/Reference specification \(Rev H\); confirm against the released submittal\./.test(H), 'and the catalogue caveat');
ok(/Battery area<\/th><td>1,800 sq ft <span>\(60 × 30 ft\)/.test(H) && /Service conduit<\/th><td>150 ft/.test(H), 'the area and the conduit run');
ok(/Scope of work/.test(H) && /1\.<\/td><td>Battery energy storage system, delivered to site/.test(H), 'the scope list');
ok(/class="v">\$412,500</.test(H) && /The battery line is quoted by Clean Cell\./.test(H), 'the price as the server formatted it, with its note');
ok(/30% at signing<br>60% on delivery<br>10% at commissioning/.test(H), 'payment terms keep their lines');
ok(/This proposal is open for 30 days, until November 16, 2026\./.test(H), 'validity');
ok(/Not included/.test(H) && /<li>Permit fees<\/li>/.test(H), 'the exclusions');
ok(/class="oqd-sign"/.test(H) && /Name and title: Dana Reyes/.test(H) && /<b>Elgin Cold Storage<\/b><div class="line">/.test(H), 'an undecided quote carries signature lines for both parties');
ok(/or approve it online from the link you received/.test(H), 'and says it can be approved online');
ok(/<footer class="oqd-foot"><span>Northwind Solar LLC · Quote NORTHWIND-Q-20261017-4F2A1 rev 2<\/span><span>Powered by Clean Cell Power Platform<\/span><\/footer>/.test(H), 'the footer carries the attribution line it was given');
ok(/style="--oqd-accent:#0E7C66"/.test(H), 'the seller\'s accent paints the deck');

/* 3 · no amount it was not given */
const dollars = H.match(/\$[0-9]/g) || [];
eq(dollars.length, 1, 'exactly one dollar figure: the total the server sent');
const noTotal = D.body(view({ price: { total: null, note: '' } }));
ok(!/\$[0-9]/.test(noTotal) && /To be confirmed/.test(noTotal), 'no total: the deck says so and prints no figure');
const groups = D.body(view({ scope: [{ name: 'Equipment', amount: '$300,000' }, { name: 'Installation', amount: '$112,500' }, { name: 'Utility witness test', amount: null }] }));
ok(/Equipment<\/td><td class="n">\$300,000</.test(groups) && /Installation<\/td><td class="n">\$112,500</.test(groups) && /Utility witness test<\/td><td><\/td>/.test(groups), 'group amounts print only where the server sent one');
eq((groups.match(/\$[0-9]/g) || []).length, 3, 'and nothing is summed: the two groups and the total');
ok(!/[0-9],?[0-9]{3}\.[0-9]{2}/.test(H.replace(/<svg[\s\S]*<\/svg>/, '')), 'no cents anywhere it was not given');

/* 4 · the tenant view renders the same document and nothing internal */
const TENANT = view({
  internal: { cost: { total: '$355,000', lo: '$301,000', hi: '$426,000', divisions: [{ name: 'Electrical SECRETDIV', amount: '$88,000' }], estimateClassPlain: 'Class 4 SECRETCLASS' }, markupPct: 16.2, margin: '$57,500', marginPct: '13.9%' },
  acceptance: { sentAt: 1, sentTo: 'pat@elgincold.example', viewedAt: 2, lastViewedAt: 3, viewCount: 4 }, mailState: 'sent',
  handoff: { error: 'SECRETHANDOFF manufacturer not on Omega Logic' }, events: [{ at: 1, what: 'SECRETEVENT' }]
});
const TH = D.body(TENANT);
ok(TH === H, 'the tenant view prints exactly the customer\'s document');
['355,000', '301,000', '426,000', 'SECRETDIV', 'SECRETCLASS', '16.2', '57,500', '13.9%', 'SECRETHANDOFF', 'SECRETEVENT'].forEach(function (p) { ok(TH.indexOf(p) < 0, 'nothing internal is printed: ' + p); });

/* 5 · the site plan, from the C2 geometry */
const SVG = D.plan(LAYOUT, { accent: '#0E7C66' });
eq(balanced(SVG), '', 'the plan SVG balances');
ok(/^<svg [^>]*viewBox="0 0 720 420"/.test(SVG) && /role="img" aria-label="Site plan on satellite imagery"/.test(SVG), 'an accessible SVG at a fixed viewBox');
['area', 'unit', 'xfmr', 'disco', 'poi', 'conduit', 'north', 'scale'].forEach(function (r) { ok(SVG.indexOf('data-role="' + r + '"') >= 0, 'the plan draws ' + r); });
ok(/stroke-dasharray="7 5"/.test(SVG.split('data-role="area"')[1].split('</g>')[0]), 'the battery area is dashed');
ok(/>BESS area · 60 × 30 ft</.test(SVG), 'and labelled with its size');
ok(/>Conduit · 150 ft</.test(SVG), 'the conduit carries its length');
ok(/<polyline points="([0-9.]+,[0-9.]+ ){2}[0-9.]+,[0-9.]+"/.test(SVG), 'the conduit is the L-shaped three-point path');
ok(/>N<\/text>/.test(SVG) && /[0-9]+ ft<\/text><\/g><\/svg>$/.test(SVG), 'a north arrow and a scale bar in feet');
ok(/data-role="scale"><rect [^>]*fill="#fff"/.test(SVG) && /data-role="north"><rect [^>]*fill="#fff"/.test(SVG), 'on imagery the scale bar and the north arrow sit on a white card');
function rectOf(role) { const g = SVG.split('data-role="' + role + '"')[1].split('</g>')[0], m = /<rect x="([-0-9.]+)" y="([-0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/.exec(g); return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null; }
const ru = rectOf('unit'), rx = rectOf('xfmr'), rd = rectOf('disco'), ra = rectOf('area');
ok(ru && rx && rd && ra, 'the bodies are rectangles at their footprints');
ok(Math.abs(ru.w / ru.h - 20 / 8) < 0.02 && Math.abs(rx.w / rx.h - 1) < 0.02 && Math.abs(rd.w / rd.h - 3 / 4) < 0.02, 'true proportions: 20 × 8, 8 × 8, 3 × 4 ft (long axis east–west)');
ok(Math.abs(ru.w / ra.w - 20 / 60) < 0.02, 'one scale for every body: the unit is a third of the area\'s width');
ok(rx.x > ru.x + ru.w && rd.x > rx.x + rx.w, 'the gear sits in a row east of the unit');
const pm = /data-role="poi"><circle cx="([0-9.]+)" cy="([0-9.]+)"/.exec(SVG);
ok(pm && +pm[1] > rd.x && +pm[2] < rd.y, 'north is up: the POI to the north-east draws up and to the right');
ok(/>BESS · 20 × 8 ft</.test(SVG) && />XFMR</.test(SVG) && />DISC</.test(SVG) && />Service \/ POI</.test(SVG), 'every body is labelled; the unit with its footprint');
ok(/>CC290\/125 · 20 × 8 ft</.test(D.plan(LAYOUT, { unitName: 'CC290/125' })), 'and with its short name when it has one');
const pending = D.plan({ unit: { c: off(0, 0), lFt: null, wFt: null, footprint: 'none' }, poi: off(40, 40) });
ok(/data-role="unit" data-footprint="none"><circle/.test(pending) && /BESS \(footprint pending\)/.test(pending), 'a unit with no released footprint is a marked point, never a guessed box');
ok(!/data-role="xfmr"/.test(pending) && !/data-role="area"/.test(pending), 'and nothing is drawn that the layout does not hold');
const noFp = D.body(view({ system: { unit: { mfr: 'Clean Cell', model: 'LGJP2-1000', kw: 500, kwh: 1000, kwhApprox: true, footprint: 'none' }, layout: { unit: { c: off(0, 0), footprint: 'none' } } } }));
ok(/Not yet released by the manufacturer; placed on the plan as a marked point/.test(noFp) && /≈ 1,000 kWh <span>\(approximate\)/.test(noFp), 'the spec says the footprint is pending and the energy is approximate');
eq(D.plan(null), '', 'no layout, no plan');
eq(D.plan({ v: 2, area: null, unit: null, poi: null }), '', 'an empty layout, no plan');
ok(!/Site plan<\/h2>/.test(D.body(view({ system: { unit: { kw: 60 }, layout: null } }))), 'and no Site plan section without one');
const rotated = D.plan({ unit: { c: off(0, 0), lFt: 20, wFt: 8, rotDeg: 30 } });
ok(/data-role="unit" transform="rotate\(30 /.test(rotated), 'rotDeg turns a body about its centre');
const fallbackLen = D.plan({ unit: { c: off(0, 0), lFt: 20, wFt: 8 }, conduit: { pts: [off(0, 0), { lat: off(0, 0).lat, lng: off(100, 0).lng }, off(100, 50)] } });
ok(/Conduit · 150 ft/.test(fallbackLen), 'a conduit with no stored length is measured on the ground (100 + 50 ft)');

/* ── 5b · the imagery under the drawing ──────────────────────────────── */
const IMAGE_RE = /<image data-role="imagery" data-px="([0-9]+)x([0-9]+)" x="([-0-9.]+)" y="([-0-9.]+)" width="([0-9.]+)" height="([0-9.]+)" preserveAspectRatio="none" href="([^"]+)" xlink:href="([^"]+)"\/>/g;
function imagesOf(svg) {
  const out = []; let m; IMAGE_RE.lastIndex = 0;
  while ((m = IMAGE_RE.exec(svg))) {
    const url = m[7].replace(/&amp;/g, '&'), q = {};
    url.split('?')[1].split('&').forEach(function (kv) { const i = kv.indexOf('='); q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    const b = q.bbox.split(',').map(Number), sz = q.size.split(',').map(Number);
    out.push({ dataPx: [+m[1], +m[2]], x: +m[3], y: +m[4], w: +m[5], h: +m[6], url: url, q: q, bbox: { w: b[0], s: b[1], e: b[2], n: b[3] }, px: sz, href2: m[8].replace(/&amp;/g, '&'), at: m.index });
  }
  return out;
}
function imageOf(svg) { const all = imagesOf(svg); return all[all.length - 1] || null; }   /* the finest, on top */
const ims = imagesOf(SVG), im = imageOf(SVG);
ok(ims.length >= 2, 'imagery is on by default: ' + ims.length + ' <image> layers inside the SVG');
ok(ims.every(function (i) { return i.url.indexOf('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?') === 0 && i.href2 === i.url; }), 'each the Esri World Imagery export, as href and xlink:href');
ok(ims.every(function (i) { return i.q.bboxSR === '4326' && i.q.imageSR === '3857' && i.q.format === 'jpg' && i.q.f === 'image' && /^-?\d+\.\d{9}$/.test(i.q.bbox.split(',')[0]) && i.dataPx.join() === i.px.join(); }), 'the bbox in degrees (9 decimals), drawn in Web Mercator, a JPEG of the size it says');
ok(ims.every(function (i) { return i.x === 0 && i.w === 720 && i.y <= 0 && i.y + i.h >= 420 - 1e-9 && Math.abs(i.y + i.h / 2 - 210) < 0.002; }), 'each layer covers the whole plan, centred (the SVG clips the rest)');
ok(ims.every(function (i, k) { return !k || i.px[0] > ims[k - 1].px[0]; }) && ims.every(function (i) { return i.px[0] <= 1440 && i.px[1] <= 4096; }), 'coarse to fine, the finest on top, never more than twice the plan’s pixels');
const mercW = function (i) { return (i.bbox.e - i.bbox.w) * Math.PI / 180 * R; };
ok(Math.abs(mercW(ims[0]) / ims[0].px[0] - 0.6) < 0.01 && Math.abs(mercW(ims[1]) / ims[1].px[0] - 0.3) < 0.01, 'the layers ask for 0.6 and 0.3 m a pixel, which the export serves where finer is refused');
ok(ims.every(function (i) { return i.at < SVG.indexOf('data-role="area"') && i.at < SVG.indexOf('data-role="unit"'); }), 'under the drawing');
const wide = imagesOf(D.plan(Object.assign({}, LAYOUT, { poi: off(1400, 900), conduit: null })));
ok(wide.length === 1 && wide[0].px[0] === 1440 && mercW(wide[0]) / 1440 >= 0.6, 'a wide site needs one layer, at twice the plan’s size, coarse enough (' + (mercW(wide[0]) / 1440).toFixed(2) + ' m a pixel) to be served anywhere');
const mid = imagesOf(D.plan(Object.assign({}, LAYOUT, { poi: off(500, 300), conduit: null })));
ok(mid.length >= 2 && mid[mid.length - 1].px[0] === 1440 && mercW(mid[mid.length - 1]) / 1440 >= 0.15, 'a mid-sized site: the top layer at twice the plan’s size, never finer than 0.15 m a pixel');
ok(/data-role="attribution">[\s\S]*>Imagery © Esri<\/text>/.test(SVG), 'credited on the plan: Imagery © Esri');
ok(!/data-role="imagery"[\s\S]*data-role="attribution"[\s\S]*data-role="imagery"/.test(SVG), 'one image, one credit');
/* the server keeps a requested extent only when the size has the extent's
   own Web Mercator aspect (it widens one side otherwise): check that, with
   Mercator written out here independently of the deck */
const MX = function (lng) { return R * lng * Math.PI / 180; };
const MY = function (lat) { return R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); };
function aspectOk(i) { const a = (MX(i.bbox.e) - MX(i.bbox.w)) / (MY(i.bbox.n) - MY(i.bbox.s)), b = i.px[0] / i.px[1]; return Math.abs(a / b - 1) < 1e-6; }
ok(aspectOk(im), 'the size has the bbox’s Web Mercator aspect, so Esri draws exactly that extent');
/* where Esri puts a coordinate in the image, and where the deck drew it */
function onImage(i, p) { return { x: i.x + (MX(p.lng) - MX(i.bbox.w)) / (MX(i.bbox.e) - MX(i.bbox.w)) * i.w, y: i.y + (MY(i.bbox.n) - MY(p.lat)) / (MY(i.bbox.n) - MY(i.bbox.s)) * i.h }; }
function near(a, b, tol) { return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol; }
function drawn(svg) {
  const g = function (role) { return svg.split('data-role="' + role + '"')[1].split('</g>')[0]; };
  const rect = function (role) { const m = /<rect x="([-0-9.]+)" y="([-0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/.exec(g(role)); return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] }; };
  const poi = /<circle cx="([0-9.]+)" cy="([0-9.]+)"/.exec(g('poi'));
  const line = /<polyline points="([^"]+)"/.exec(g('conduit'))[1].split(' ').map(function (xy) { const v = xy.split(','); return { x: +v[0], y: +v[1] }; });
  return { area: rect('area'), unit: rect('unit'), xfmr: rect('xfmr'), poi: { x: +poi[1], y: +poi[2] }, line: line };
}
function aligned(layout, label) {
  /* the SVG prints to 0.1 px: a point is within 0.05 px of where Esri puts
     it, a far corner (x + width, both rounded) within 0.1 px */
  const svg = D.plan(layout), d = drawn(svg), T = 0.051, T2 = 0.101;
  imagesOf(svg).forEach(function (i) {
    const at = label + ' (' + i.px.join('×') + ' layer)';
    ok(aspectOk(i), at + ': the extent is kept as sent');
    ok(near(onImage(i, layout.poi), d.poi, T), at + ': the POI is drawn on the very pixel of the imagery its coordinates name');
    ok(near(onImage(i, { lat: layout.area.n, lng: layout.area.w }), { x: d.area.x, y: d.area.y }, T) && near(onImage(i, { lat: layout.area.s, lng: layout.area.e }), { x: d.area.x + d.area.w, y: d.area.y + d.area.h }, T2), at + ': the area’s north-west and south-east corners too');
    ok(near(onImage(i, layout.unit.c), { x: d.unit.x + d.unit.w / 2, y: d.unit.y + d.unit.h / 2 }, T2) && near(onImage(i, layout.xfmr.c), { x: d.xfmr.x + d.xfmr.w / 2, y: d.xfmr.y + d.xfmr.h / 2 }, T2), at + ': the unit and the transformer at their centres');
    ok(layout.conduit.pts.every(function (p, k) { return near(onImage(i, p), d.line[k], T); }), at + ': every vertex of the conduit');
  });
  /* the unit's drawn width is its footprint at the scale bar's scale */
  const sb = /data-role="scale">[\s\S]*?<path d="M([0-9.]+) [0-9.]+V[0-9.]+H([0-9.]+)V/.exec(svg), barFt = +/>([0-9,]+) ft<\/text><\/g><\/svg>$/.exec(svg)[1].replace(/,/g, '');
  const pxPerFt = (+sb[2] - +sb[1]) / barFt;
  ok(Math.abs(d.unit.w / pxPerFt - layout.unit.lFt) < 0.05, label + ': the unit measures ' + layout.unit.lFt + ' ft on the scale bar (' + (d.unit.w / pxPerFt).toFixed(3) + ')');
  /* framed: the area, the gear and the POI inside the image, with a margin */
  const pts = [d.poi, { x: d.area.x, y: d.area.y }, { x: d.area.x + d.area.w, y: d.area.y + d.area.h }, { x: d.unit.x, y: d.unit.y }];
  ok(pts.every(function (p) { return p.x >= 14 + 15 * pxPerFt - 0.5 && p.x <= 720 - 14 - 15 * pxPerFt + 0.5 && p.y >= 14 + 15 * pxPerFt - 0.5 && p.y <= 420 - 30 - 15 * pxPerFt + 0.5; }), label + ': framed with at least 15 ft of margin round the area, gear and POI');
  return svg;
}
aligned(LAYOUT, 'Elgin IL');
/* a second place, further south, with the POI far off: Mesa, AZ */
const MLAT = 33.4152, MLNG = -111.8315;
function moff(dx, dy) { return { lat: +(MLAT + dy / FT / R * 180 / Math.PI).toFixed(7), lng: +(MLNG + dx / FT / (R * Math.cos(MLAT * Math.PI / 180)) * 180 / Math.PI).toFixed(7) }; }
const MESA = { v: 2, area: { s: moff(-25, -12).lat, w: moff(-25, -12).lng, n: moff(45, 12).lat, e: moff(45, 12).lng, wFt: 70, hFt: 24, sqft: 1680 },
  unit: { c: moff(0, 0), lFt: 40, wFt: 10, rotDeg: 0, footprint: 'rep' }, xfmr: { c: moff(29, 0), lFt: 8, wFt: 8, rotDeg: 0 }, poi: moff(-180, 260),
  conduit: { pts: [moff(29, 0), { lat: moff(29, 0).lat, lng: moff(-180, 260).lng }, moff(-180, 260)], ft: 469, type: 'PVC-UG' }, conduitFt: 469 };
aligned(MESA, 'Mesa AZ');
/* labels never sit on one another */
function labelBoxes(svg) {
  const out = [], re = /<g data-role="label-([a-z]+)"><text x="([-0-9.]+)" y="([-0-9.]+)" font-size="([0-9.]+)"([^>]*)>([^<]*)<\/text><\/g>/g;
  let m;
  while ((m = re.exec(svg))) {
    const an = /text-anchor="([a-z]+)"/.exec(m[5]);
    const size = +m[4], w = m[6].replace(/&[a-z#0-9]+;/g, 'x').length * size * 0.57, x = +m[2], a = an ? an[1] : 'start';
    const x0 = a === 'middle' ? x - w / 2 : a === 'end' ? x - w : x;
    out.push({ role: m[1], x0: x0, x1: x0 + w, y0: +m[3] - size * 0.8, y1: +m[3] + size * 0.2 });
  }
  return out;
}
/* the regression from the first render (29 W Main St, Mesa): the POI to the
   north-west, so the service run leaves the disconnect westward UNDER the
   unit — the conduit's label must not land on the unit or its label */
const WEST = Object.assign({}, MESA, { poi: moff(-70, 95), disco: { c: moff(38.5, 0), lFt: 3, wFt: 4, rotDeg: 0 },
  conduit: { pts: [moff(38.5, 0), { lat: moff(38.5, 0).lat, lng: moff(-70, 95).lng }, moff(-70, 95)], ft: 205, type: 'PVC-UG' }, conduitFt: 205 });
[SVG, D.plan(MESA, { unitName: 'Smart Module' }), D.plan(WEST, { unitName: 'Smart Module' })].forEach(function (svg, k) {
  const bx = labelBoxes(svg), bodies = [];
  eq(bx.map(function (b) { return b.role; }).join(','), k === 1 ? 'unit,xfmr,poi,conduit,area' : 'unit,xfmr,disco,poi,conduit,area', 'case ' + k + ': the unit, the gear, the POI, the conduit and the area are each labelled once');
  let clash = '';
  bx.forEach(function (a, i) { bx.slice(i + 1).forEach(function (b) { if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) clash = a.role + '/' + b.role; }); });
  eq(clash, '', 'case ' + k + ': no two labels overlap');
  ['unit', 'xfmr', 'disco'].forEach(function (r) { const g = svg.split('data-role="' + r + '"')[1]; if (!g) return; const m = /<rect x="([-0-9.]+)" y="([-0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/.exec(g.split('</g>')[0]); bodies.push({ role: r, x0: +m[1], y0: +m[2], x1: +m[1] + +m[3], y1: +m[2] + +m[4] }); });
  let covers = '';
  bx.forEach(function (a) { bodies.forEach(function (b) { if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) covers = a.role + ' on ' + b.role; }); });
  eq(covers, '', 'case ' + k + ': no label sits on the equipment');
});
/* high contrast: a white halo under every line */
const cg = SVG.split('data-role="conduit"')[1].split('</g>')[0];
ok(/^><polyline [^>]*stroke="#fff"[^>]*stroke-width="7"/.test(cg) && cg.indexOf('stroke="' + '#C26A00' + '"') > cg.indexOf('stroke="#fff"'), 'the conduit: a white halo under the coloured line');
ok(/data-role="area"><rect [^>]*stroke="#fff" stroke-opacity="\.95" stroke-width="4\.5"/.test(SVG), 'the area: a white halo under the dashed edge');
ok(/data-role="unit"><rect [^>]*stroke="#0B1220"[^>]*\/><rect [^>]*stroke="#fff"/.test(SVG), 'the bodies: a dark rim and a white edge');
ok(/stroke="#fff" stroke-width="3\.6"/.test(SVG.split('data-role="label-unit"')[1]), 'the labels: a white halo');
/* imagery off: the clean plan */
const CLEAN = D.plan(LAYOUT, { imagery: false });
ok(!/<image/.test(CLEAN) && !/Esri/.test(CLEAN) && /aria-label="Site plan"/.test(CLEAN) && /stroke="#EDF1F6"/.test(CLEAN), 'imagery:false gives the clean plan: no image, no credit, the light grid');
['area', 'unit', 'xfmr', 'disco', 'poi', 'conduit', 'north', 'scale'].forEach(function (r) { ok(CLEAN.indexOf('data-role="' + r + '"') >= 0, 'the clean plan draws ' + r); });
ok(/<image data-role="imagery"/.test(D.body(V)) && /drawn on satellite imagery \(Imagery © Esri\)/.test(D.body(V)), 'the proposal shows the plan on imagery, and says whose');
ok(!/<image/.test(D.body(V, { imagery: false })) && /Schematic drawn from the site design/.test(D.body(V, { imagery: false })), 'and the clean plan when asked');
ok(/<g data-role="label-unit"><text [^>]*>CC290\/125 · 20 × 8 ft</.test(D.body(V)), 'the proposal labels the unit with its short name and footprint');
const big = imagesOf(D.plan(Object.assign({}, LAYOUT, { poi: off(3000, 1500), conduit: null }), { width: 3000, height: 1000 }));
ok(big.every(function (i) { return i.px[0] <= 4096 && i.px[1] <= 4096; }) && big[big.length - 1].px[0] === 4096, 'a large plan asks for no more than Esri’s 4,096 px');

/* 6 · escaping: nothing the record holds becomes markup */
const EVIL = '<script>alert(1)</script>', IMG = '<img src=x onerror=alert(2)>';
const bad = D.body(view({
  quoteNo: 'Q"><b>1', seller: { name: EVIL, logoUrl: 'javascript:alert(3)', accent: 'red;}</style><script>', tagline: IMG, company: { legalName: '"Acme" & <Sons>', address: { line1: IMG }, phone: '<i>1</i>', email: 'a@b.c', website: 'javascript:alert(4)' }, rep: { name: EVIL, email: '<x@y>' }, attribution: EVIL },
  customer: { name: EVIL, company: '"Elgin" & <Co>', email: IMG, address: { line1: EVIL } },
  site: { address: EVIL, utility: IMG, circuit: { name: EVIL } },
  system: { unit: { mfr: EVIL, model: IMG, kw: 125, kwh: 290, chem: EVIL, caveat: EVIL }, layout: LAYOUT },
  scope: [{ name: IMG, amount: '<b>$1</b>' }], price: { total: '$1<script>', note: EVIL },
  terms: { paymentTerms: EVIL, notes: IMG, exclusions: [EVIL] }, decision: {}
}));
eq(balanced(bad), '', 'hostile input still balances');
ok(!/<script/i.test(bad) && !/<img src=x/i.test(bad) && !/<i>1<\/i>/.test(bad) && !/<b>\$1<\/b>/.test(bad) && !/<Sons>/.test(bad) && !/<x@y>/.test(bad), 'no record string becomes a tag');
ok(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(bad) && /&quot;Acme&quot; &amp; &lt;Sons&gt;/.test(bad), 'it is printed as text');
ok(!/javascript:/i.test(bad), 'a javascript: logo or website never reaches the page');
ok(/style="--oqd-accent:#2B5FA8"/.test(bad), 'an accent that is not a colour is dropped for the default');
ok(!/Q"><b>1/.test(bad) && /Q&quot;&gt;&lt;b&gt;1/.test(bad), 'the quote number is escaped too');
ok(!/<script/i.test(D.document(view({ quoteNo: EVIL }))), 'and the document title');

/* 7 · letterhead fallbacks */
const logo = D.body(view({ seller: Object.assign({}, V.seller, { logoUrl: 'https://cdn.northwind.example/logo.png' }) }));
ok(/<div class="oqd-mark"><img src="https:\/\/cdn\.northwind\.example\/logo\.png" alt="Northwind Solar"><\/div>/.test(logo) && !/oqd-word/.test(logo), 'a logo replaces the wordmark');
ok(/<div class="oqd-co"><b>Northwind Solar LLC<\/b>/.test(logo), 'and the company line still names the company');
ok(/<img src="data:image\/png;base64,iVBORw0KGgo=" /.test(D.body(view({ seller: { name: 'X', logoUrl: 'data:image/png;base64,iVBORw0KGgo=' } }))), 'an uploaded raster logo (data: PNG) prints');
ok(!/<img/.test(D.body(view({ seller: { name: 'X', logoUrl: 'data:image/svg+xml;base64,PHN2Zz4=' } }))), 'an SVG data URI does not');
ok(/<img src="\/tenants\/northwind\/logo\.png"/.test(D.body(view({ seller: { name: 'X', logoUrl: '/tenants/northwind/logo.png' } }))), 'a same-origin path prints');
const bare = D.body(view({ seller: { name: 'Solo Electric' } }));
ok(/class="oqd-word">Solo Electric</.test(bare) && !/class="oqd-co"/.test(bare) && !/Prepared by/.test(bare) && !/oqd-tag/.test(bare), 'a seller with only a name: the wordmark, no empty address block, no prepared-by');
ok(/<footer class="oqd-foot"><span>Solo Electric · Quote NORTHWIND-Q-20261017-4F2A1 rev 2<\/span><\/footer>/.test(bare), 'and no attribution line when none was sent');
ok(!/ClearSky|OMEGA|Omega/.test(bare), 'white-label safe: no platform name of ours anywhere in the document');
const legalOnly = D.body(view({ seller: { company: { legalName: 'Only Legal Inc.' } } }));
ok(/class="oqd-word">Only Legal Inc\.</.test(legalOnly) && !/class="oqd-co"><b>Only Legal Inc\.<\/b>/.test(legalOnly), 'the legal name stands in for a missing brand name, once');
ok(/Prepared by<\/th><td>rep@x\.example</.test(D.body(view({ seller: { name: 'X', rep: { email: 'rep@x.example' } } }))), 'a rep with only an email is named by it');
const noName = D.body(view({ seller: {} }));
ok(/<div class="oqd-mark"><\/div>/.test(noName) && !/qt-0123456789abcdef/.test(noName), 'no name at all: an empty mark, never the record id');

/* 8 · acceptance states */
const approved = D.body(view({ status: 'approved', decision: { approvedAt: Date.UTC(2026, 9, 20, 18), approvedBy: { name: 'Pat Kim', title: 'Facilities Director' } } }));
ok(/oqd-flag ok">Approved by Pat Kim, Facilities Director on October 20, 2026\./.test(approved), 'approved: a banner with who and when');
ok(/Approved by <b>Pat Kim<\/b>, Facilities Director, for Elgin Cold Storage, on October 20, 2026\./.test(approved) && !/oqd-sign/.test(approved), 'and the acceptance block records it instead of signature lines');
ok(/Approved online against quote NORTHWIND-Q-20261017-4F2A1 revision 2, as shown/.test(approved), 'naming the revision approved');
const declined = D.body(view({ status: 'declined', decision: { declinedAt: Date.UTC(2026, 9, 21), declineReason: 'Went with a <b>larger</b> system' } }));
ok(/oqd-flag bad">Declined on October 21, 2026\./.test(declined) && /Reason given: Went with a &lt;b&gt;larger&lt;\/b&gt; system/.test(declined) && !/oqd-sign/.test(declined), 'declined: the date and the reason, escaped, no signature lines');
const expired = D.body(view({ status: 'expired' }));
ok(/This proposal expired on November 16, 2026\. Ask Dana Reyes for a current one\./.test(expired) && !/oqd-sign/.test(expired), 'expired: says so, names who to ask, offers no signature');
const withdrawn = D.body(view({ status: 'withdrawn' }));
ok(/This proposal was withdrawn by Northwind Solar\./.test(withdrawn) && !/oqd-sign/.test(withdrawn), 'withdrawn: says so, offers no signature');
ok(/Draft: not yet sent to the customer\./.test(D.body(view({ status: 'draft' }))), 'a draft is marked as one');
ok(!/oqd-flag/.test(H), 'a sent quote carries no banner');
ok(!/oqd-sign/.test(D.body(V, { signLines: false })), 'signLines:false leaves the lines off (a page with its own approve form)');
ok(/<h1 class="oqd-h1">Storage for Elgin<\/h1>/.test(D.body(V, { title: 'Storage for Elgin' })), 'the heading can be set by the page');

/* 9 · the printable document */
const DOC = D.document(V);
ok(/^<!DOCTYPE html><html lang="en">/.test(DOC) && /@page\{size:letter;margin:\.55in \.6in\}/.test(DOC), 'a whole US-Letter document');
ok(/print-color-adjust:exact/.test(DOC) && /-webkit-print-color-adjust:exact/.test(DOC), 'that prints its colours');
ok(/<meta name="referrer" content="no-referrer">/.test(DOC), 'and never sends the page address (the key) to a logo host');
ok(/<title>Proposal NORTHWIND-Q-20261017-4F2A1 · Elgin Cold Storage · Northwind Solar<\/title>/.test(DOC), 'titled by quote, customer and seller');
ok(DOC.indexOf(H) > 0, 'its body is the same deck');
eq(D.print(V), false, 'print() in Node does nothing and says so');
ok(/\.oqd-keep\{break-inside:avoid;page-break-inside:avoid\}/.test(D.css()) && /@media screen and \(max-width:640px\)/.test(D.css()), 'blocks keep together on paper and reflow on a phone');
eq(D.body(null).indexOf('There is no proposal to show') > 0, true, 'no view: a sentence, not a throw');

/* ── 9b · against the real producers: Prime's layout v2 (omega-prime-project.js
   PP.layout) and the server's own projections (api/_lib/customer-quote.js) ── */
const PP = require('../../omega-prime-project.js'), Q = require('../../api/_lib/customer-quote.js');
const UNIT = { key: 'TEST-UNIT', mfr: 'Clean Cell', model: 'CC290-125', kw: 125, kwh: 290, lFt: 20, wFt: 8, footprint: 'catalog', incXfmr: false, incDisco: false };
const PL = PP.layout({ unit: UNIT, unitAt: { lat: LAT, lng: LNG }, area: { s: SW.lat, w: SW.lng, n: NE.lat, e: NE.lng }, poi: off(110, 70), conduit: true });
ok(PL.v === 2 && PL.unit && PL.xfmr && PL.disco && PL.conduit, 'Prime\'s own layout v2 carries the unit, the gear and the conduit');
const PSVG = D.plan(PL);
['area', 'unit', 'xfmr', 'disco', 'poi', 'conduit'].forEach(function (r) { ok(PSVG.indexOf('data-role="' + r + '"') >= 0, 'Prime\'s layout draws ' + r); });
ok(PSVG.indexOf('Conduit · ' + D.num(PL.conduit.ft) + ' ft') >= 0, 'the conduit reads the length Prime measured');
ok(aspectOk(imageOf(PSVG)) && near(onImage(imageOf(PSVG), PL.poi), drawn(PSVG).poi, 0.051), 'Prime’s own layout lines up with its imagery');
const NOW = Date.UTC(2026, 9, 17, 15);
const REC = Q.compose({ id: 'qt-0123456789abcdef', orgId: 'northwind.example', projectId: 'p1', quoteNo: 'NORTHWIND-Q-20261017-89ABC', rev: 1, status: 'sent',
  customer: { name: 'Pat Kim', company: 'Elgin Cold Storage', email: 'pat@elgincold.example', address: { line1: '1200 W Industrial Dr', city: 'Elgin', state: 'IL', zip: '60123' } },
  pricing: { mode: 'markup', markupPct: 16 }, terms: { paymentTerms: 'Net 30' }, unit: UNIT, layout: PL,
  site: { address: '1200 W Industrial Dr, Elgin, IL 60123', utility: 'ComEd', circuit: 'Feeder 12345' },
  cost: Q.costOf({ total: { lo: 300000, base: 355000, hi: 426000 }, divisions: [{ id: 'elec', name: 'Electrical COSTDIV', base: 88000 }], estimateClassPlain: 'COSTCLASS' }, { kw: 125 }),
  seller: { name: 'Northwind Solar', accent: '#0e7c66', company: null, rep: { name: 'Dana Reyes', email: 'dana@northwind.example' }, attribution: '' } }, NOW);
REC.acceptance = { sentAt: NOW, validUntil: NOW + 30 * 86400000 }; REC.snapshot = Q.snapshotOf(REC);
const CV = Q.customerView(REC), RH = D.body(CV);
eq(balanced(RH), '', 'the server\'s customer view renders a balanced deck');
ok(RH === D.body(Q.tenantView(REC, { events: [{ at: NOW, what: 'COSTEVENT' }] })), 'its tenant view renders the same document');
['355,000', '300,000', '426,000', 'COSTDIV', 'COSTCLASS', 'COSTEVENT'].forEach(function (p) { ok(RH.indexOf(p) < 0, 'the server\'s internals never reach the deck: ' + p); });
ok(RH.indexOf('class="v">' + CV.price.total + '<') >= 0 && /Quoted by Clean Cell/.test(RH), 'the server\'s total and its "quoted by" battery line print as sent');
ok(/Valid until<\/th><td>November 16, 2026/.test(RH) && /Date<\/th><td>October 17, 2026/.test(RH), 'its date-only valid-until and ISO issue date read as dates');
ok(/data-role="xfmr"/.test(RH) && /data-role="conduit"/.test(RH), 'and its layout draws the plan');

/* ── 10 · quote.html, the public page, in a stub DOM ───────────────────── */
const PAGE = fs.readFileSync(path.join(ROOT, 'quote.html'), 'utf8');
ok(/^<!doctype html>\n<!-- © 2025–2026 ClearSky Energy Solutions LLC\. Proprietary and Confidential\. -->/i.test(PAGE), 'quote.html carries the notice on line two');
ok(PAGE.indexOf('omega-tenant') < 0 && !/firebase/i.test(PAGE) && PAGE.indexOf('omega-splash') < 0, 'it loads no tenant runtime, no Firebase and no loading mark of ours');
ok(/<meta name="referrer" content="no-referrer">/.test(PAGE), 'the key in its address never leaves in a Referer');
ok(/<script src="\/omega-quote-deck\.js"><\/script>/.test(PAGE), 'it draws the one deck');
const visible = PAGE.replace(/<!--[\s\S]*?-->/g, '').replace(/<script>[\s\S]*?<\/script>/g, function (s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); });
ok(!/ClearSky|OMEGA/.test(visible), 'white-label safe: no name of ours outside the source notice');
const inline = /<script>\n([\s\S]*?)<\/script>/.exec(PAGE)[1];
ok(!/=>|\blet\s|\bconst\s|`/.test(inline.replace(/\/\*[\s\S]*?\*\//g, '')), 'its script is ES5');

function stubEl(id) {
  return { id: id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, disabled: false, className: '', style: {}, children: [],
    _h: {}, addEventListener(k, f) { this._h[k] = f; }, setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
    querySelector() { return null; }, focus() {}, scrollIntoView() {}, appendChild(c) { this.children.push(c); return c; },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; if (on) this._s.add(c); else this._s.delete(c); return on; }, contains(c) { return this._s.has(c); } } };
}
/* the page's clock, fixed (the fixtures' own days, so nothing here lapses
   with the calendar): Date.now() and new Date() read `now`; every other
   Date call is the real one */
const PAGE_NOW = Date.UTC(2026, 9, 20, 12);
function clock(now) {
  function At() { return arguments.length ? new (Function.prototype.bind.apply(Date, [null].concat([].slice.call(arguments))))() : new Date(now); }
  At.now = function () { return now; }; At.UTC = Date.UTC; At.parse = Date.parse; At.prototype = Date.prototype;
  return At;
}
function runPage(search, responses, now) {
  const store = {}, calls = [];
  const els = new Proxy(store, { get: function (t, k) { return typeof k === 'string' ? (t[k] || (t[k] = stubEl(k))) : undefined; } });
  const doc = { getElementById(id) { return els[id]; }, createElement(t) { return stubEl(t); }, head: stubEl('head'), body: stubEl('body'), title: '' };
  const sb = { console, document: doc, location: { search: search, href: 'https://northwind.example/quote?' + search.slice(1), pathname: '/quote' }, setTimeout: function (f) { f(); }, clearTimeout() {},
    confirm: function () { return true; }, OmegaQuoteDeck: D, JSON, Promise, encodeURIComponent, decodeURIComponent, Date: clock(now || PAGE_NOW), Math, String, Number, RegExp, Array, Object, isFinite };
  sb.fetch = function (url, opts) {
    calls.push({ url: url, opts: opts || {} });
    const r = responses.shift() || { status: 500, body: { error: 'no answer in the test' } };
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: function () { return Promise.resolve(r.body); }, text: function () { return Promise.resolve(JSON.stringify(r.body)); } });
  };
  sb.window = sb; sb.addEventListener = function () {}; sb.print = function () { sb._printed = true; };
  vm.createContext(sb);
  vm.runInContext(inline, sb);
  return { els, calls, sb, settle: function () { return new Promise(function (res) { setImmediate(res); }).then(function () { return new Promise(function (res) { setImmediate(res); }); }); } };
}

const pageChecks = [];
pageChecks.push(function () {
  const p = runPage('', []);
  return p.settle().then(function () {
    ok(!p.calls.length && /incomplete/i.test(p.els.deck.innerHTML), 'no id or key: the page says the link is incomplete and asks for nothing');
  });
});
pageChecks.push(function () {
  const p = runPage('?id=qt-0123456789abcdef&key=' + 'a'.repeat(48), [{ status: 404, body: { error: 'Quote not found' } }]);
  return p.settle().then(function () {
    ok(p.calls[0].url === '/api/customer-quote?id=qt-0123456789abcdef&key=' + 'a'.repeat(48) && p.calls[0].opts.cache === 'no-store', 'it reads the one public door, uncached');
    ok(/not available/i.test(p.els.deck.innerHTML) && p.els.act.hidden === true, 'not found: a plain sentence and no actions');
  });
});
pageChecks.push(function () {
  const p = runPage('?id=qt-0123456789abcdef&key=' + 'b'.repeat(48), [{ status: 200, body: { quote: view({ status: 'viewed' }) } }, { status: 200, body: { ok: true, quote: view({ status: 'approved', decision: { approvedAt: Date.UTC(2026, 9, 20), approvedBy: { name: 'Pat Kim', title: 'Director' } } }) } }]);
  return p.settle().then(function () {
    ok(/oqd-doc/.test(p.els.deck.innerHTML) && p.els.act.hidden === false, 'an open quote draws the deck and offers the decision');
    ok(/Proposal NORTHWIND-Q-20261017-4F2A1/.test(p.sb.document.title), 'the tab is titled by the proposal');
    ok(/\$412,500/.test(p.els.summary.innerHTML) && /November 16, 2026/.test(p.els.summary.innerHTML), 'the summary repeats the total and the valid-until date');
    /* approve without agreeing is refused in the page */
    p.els['ap-name'].value = 'Pat Kim'; p.els['ap-agree'].checked = false;
    p.sb.OmegaQuotePage.approve();
    ok(p.calls.length === 1 && /agree/i.test(p.els.msg.textContent), 'Approve needs the box ticked');
    p.els['ap-agree'].checked = true; p.els['ap-name'].value = ''; p.sb.OmegaQuotePage.approve();
    ok(p.calls.length === 1 && /name/i.test(p.els.msg.textContent), 'and a name');
    p.els['ap-name'].value = '  Pat Kim '; p.els['ap-title'].value = 'Director'; p.els['ap-email'].value = 'pat@elgincold.example';
    p.sb.OmegaQuotePage.approve();
    return p.settle().then(function () {
      const c = p.calls[1], b = JSON.parse(c.opts.body);
      ok(c.url === '/api/customer-quote' && c.opts.method === 'POST', 'Approve posts to the same door');
      ok(b.action === 'approve' && b.id === 'qt-0123456789abcdef' && b.key === 'b'.repeat(48) && b.agree === true && b.name === 'Pat Kim' && b.title === 'Director' && b.email === 'pat@elgincold.example', 'with the id, the key, the name, title, email and the agreement');
      eq(b.snapshot, 'snap-9f8e7d', 'and the snapshot of exactly what the customer saw');
      ok(Object.keys(b).every(function (k) { return ['action', 'id', 'key', 'name', 'title', 'email', 'agree', 'snapshot'].indexOf(k) >= 0; }), 'and only the fields the door accepts');
      ok(/Approved by Pat Kim/.test(p.els.deck.innerHTML) && p.els.act.hidden === true, 'approved: the deck redraws with the record and the actions close');
    });
  });
});
pageChecks.push(function () {
  const p = runPage('?id=qt-0123456789abcdef&key=' + 'c'.repeat(48), [{ status: 200, body: { quote: view() } }, { status: 200, body: { ok: true, quote: view({ status: 'declined', decision: { declinedAt: Date.UTC(2026, 9, 21) } }) } }]);
  return p.settle().then(function () {
    p.els['dc-reason'].value = '';
    p.sb.OmegaQuotePage.decline();
    return p.settle().then(function () {
      const b = JSON.parse(p.calls[1].opts.body);
      ok(b.action === 'decline' && b.reason === '' && b.key === 'c'.repeat(48), 'a decline needs no reason');
      ok(/Declined on October 21, 2026/.test(p.els.deck.innerHTML) && p.els.act.hidden === true, 'and closes the decision');
    });
  });
});
pageChecks.push(function () {
  const p = runPage('?id=qt-0123456789abcdef&key=' + 'd'.repeat(48), [{ status: 200, body: { quote: view() } }, { status: 200, body: { ok: true } }]);
  return p.settle().then(function () {
    p.els['qn-text'].value = ''; p.sb.OmegaQuotePage.ask();
    ok(p.calls.length === 1 && /question/i.test(p.els.msg.textContent), 'an empty question is not sent');
    p.els['qn-text'].value = 'Can delivery be in March?'; p.els['qn-email'].value = 'not-an-email'; p.sb.OmegaQuotePage.ask();
    ok(p.calls.length === 1 && /email/i.test(p.els.msg.textContent), 'a malformed reply address is caught before sending');
    p.els['qn-email'].value = 'pat@elgincold.example'; p.sb.OmegaQuotePage.ask();
    return p.settle().then(function () {
      const b = JSON.parse(p.calls[1].opts.body);
      ok(b.action === 'question' && b.message === 'Can delivery be in March?' && b.email === 'pat@elgincold.example', 'a question goes to the door with the address to answer');
      ok(Object.keys(b).every(function (k) { return ['action', 'id', 'key', 'message', 'email'].indexOf(k) >= 0; }), 'and only the fields the door accepts');
      ok(/Dana Reyes/.test(p.els.msg.textContent), 'and the page says who will answer');
    });
  });
});
pageChecks.push(function () {
  const p = runPage('?id=qt-0123456789abcdef&key=' + 'e'.repeat(48), [{ status: 200, body: { quote: view({ status: 'expired' }) } }]);
  return p.settle().then(function () {
    ok(/expired/i.test(p.els.notice.innerHTML) && p.els['tab-approve'].hidden === true && p.els['tab-decline'].hidden === true, 'expired: a notice that says so, and no Approve or Decline');
    ok(p.els.act.hidden === false && p.els['pane-question'].hidden === false && /no longer be approved online/.test(p.els['qn-text-help'].textContent), 'but a question is still welcome, as the door takes one');
    ok(p.els.summary.hidden === true, 'and no price call to action');
    ok(/oqd-doc/.test(p.els.deck.innerHTML), 'the deck stays readable');
  });
});
pageChecks.push(function () {
  const p = runPage('?id=qt-0123456789abcdef&key=' + 'f'.repeat(48), [{ status: 200, body: { quote: view({ status: 'withdrawn' }) } }]);
  return p.settle().then(function () {
    ok(p.els.act.hidden === true && /withdrawn/i.test(p.els.notice.innerHTML) && !/oqd-doc/.test(p.els.deck.innerHTML), 'withdrawn: a notice, no actions, and the old terms are not shown');
  });
});
pageChecks.push(function () {
  const p = runPage('?id=qt-0123456789abcdef&key=' + 'a1'.repeat(24), [{ status: 200, body: { quote: view() } }, { status: 409, body: { error: 'This proposal changed after it was opened.' } }]);
  return p.settle().then(function () {
    p.els['ap-name'].value = 'Pat'; p.els['ap-agree'].checked = true; p.sb.OmegaQuotePage.approve();
    return p.settle().then(function () {
      ok(/changed/i.test(p.els.msg.textContent) && /bad/.test(p.els.msg.className), 'a refused approval says why, in the server\'s words');
      ok(p.els['ap-go'].disabled === false, 'and the button comes back');
    });
  });
});
pageChecks.push(function () {
  const p = runPage('?id=qt-0123456789abcdef&key=' + 'b2'.repeat(24), [{ status: 200, body: { quote: view() } }]);
  return p.settle().then(function () {
    let printed = null; p.sb.OmegaQuoteDeck = Object.assign({}, D, { print: function (v) { printed = v; return true; } });
    p.sb.OmegaQuotePage.print();
    ok(printed && printed.quoteNo === 'NORTHWIND-Q-20261017-4F2A1', 'Print / Save as PDF prints the deck it shows');
  });
});

/* a valid-until DATE (the customer view sends YYYY-MM-DD): the day the
   customer was given, open to the end of that UTC day as the server holds
   it — in Chicago, the evening of that same day */
pageChecks.push(function () {
  const p = runPage('?id=qt-0123456789abcdef&key=' + 'c3'.repeat(24), [{ status: 200, body: { quote: view({ status: 'viewed', validUntil: '2026-11-16' }) } }], Date.UTC(2026, 10, 16, 23, 30));
  return p.settle().then(function () {
    ok(p.els.act.hidden === false && p.els['tab-approve'].hidden === false, 'valid until the 16th: still open at 23:30 UTC on the 16th');
    ok(/Valid until November 16, 2026/.test(p.els.summary.innerHTML), 'and the summary says the 16th, never the 15th');
  });
});
pageChecks.push(function () {
  const p = runPage('?id=qt-0123456789abcdef&key=' + 'c4'.repeat(24), [{ status: 200, body: { quote: view({ status: 'viewed', validUntil: '2026-11-16' }) } }], Date.UTC(2026, 10, 17, 0, 30));
  return p.settle().then(function () {
    ok(p.els['tab-approve'].hidden === true && p.els['tab-decline'].hidden === true && /expired on November 16, 2026/.test(p.els.notice.innerHTML), 'at 00:30 UTC on the 17th it has expired, on the 16th');
  });
});

/* ── 11 · print waits for the imagery, never for long ───────────────────
   The satellite image is an SVG <image>: not in document.images, so the
   deck probes it; a stand-in window shows when the print would fire. */
function fakeWin(hrefs, loadAfter) {
  const doc = { readyState: 'complete', images: [], fonts: null, body: { getBoundingClientRect: function () {} },
    querySelectorAll: function (sel) { return sel === 'image' ? hrefs.map(function (h) { return { getAttribute: function (k) { return k === 'href' ? h : null; } }; }) : []; } };
  function Img() { this.complete = false; }
  Object.defineProperty(Img.prototype, 'src', { set: function (v) { const me = this; me._src = v; if (loadAfter != null) setTimeout(function () { me.complete = true; if (me.onload) me.onload(); }, loadAfter); } });
  return { document: doc, Image: Img };
}
function timed(win, cap) { const t0 = Date.now(); return new Promise(function (res) { D._whenReady(win, function () { res(Date.now() - t0); }, cap); }); }
pageChecks.push(function () {
  return Promise.all([timed(fakeWin(['https://server.arcgisonline.com/x?f=image'], 300), 3000), timed(fakeWin(['https://server.arcgisonline.com/y?f=image'], null), 700), timed(fakeWin([], null), 3000)]).then(function (t) {
    ok(t[0] >= 300 && t[0] < 2500, 'print waits for the satellite image to load (' + t[0] + ' ms)');
    ok(t[1] >= 700 && t[1] < 2000, 'and prints anyway when it never comes, at the cap (' + t[1] + ' ms)');
    ok(t[2] < 1000, 'a plan with no imagery is not held up (' + t[2] + ' ms)');
  });
});

pageChecks.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () {
  console.log('tquotedeck: ' + count + ' assertions passed');
}, function (e) { console.error(e); process.exit(1); });
