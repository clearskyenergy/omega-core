#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The editor's chrome theme: ONE token set in omega-ui-theme with a dark
 * (default) and a light value for every token, the light values applied
 * under prefers-color-scheme: light and under html[data-omega-theme="light"],
 * OmegaUI.theme() persisting the choice the way the accent does; the chrome
 * regions read tokens instead of the recurring dark literals; and no element
 * id was lost against main (colours only). Static: node, no browser. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), cp = require('child_process');
var ROOT = path.join(__dirname, '../..');
var src = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
var count = 0;
function ok(v, label) { assert.ok(v, label); count++; }
function block(startMarker, endMarker, from) {
  var a = src.indexOf(startMarker, from || 0); assert.ok(a >= 0, startMarker);
  var b = src.indexOf(endMarker, a); assert.ok(b > a, endMarker); return src.slice(a, b);
}

/* 1. the token set, once, both schemes */
var theme = block('<style id="omega-ui-theme">', '</style>');
var TOKENS = ['--navy', '--blue', '--bg', '--panel', '--surface', '--border', '--text', '--sub', '--icon', '--accent',
  '--hl-dim', '--scrim', '--hover', '--hover-strong', '--inset', '--hairline', '--shadow', '--grid-dot', '--ok', '--warn', '--bad', '--on-status', '--ink'];
var dark = theme.slice(theme.indexOf(':root{'), theme.indexOf('}', theme.indexOf(':root{')));
var mediaLight = theme.slice(theme.indexOf('@media (prefers-color-scheme: light){'), theme.indexOf('html[data-omega-theme="light"]{'));
var forcedLight = theme.slice(theme.indexOf('html[data-omega-theme="light"]{'), theme.indexOf('}', theme.indexOf('html[data-omega-theme="light"]{')));
ok(/html:not\(\[data-omega-theme="dark"\]\)\{/.test(mediaLight), 'the OS light scheme applies unless the theme is pinned dark');
TOKENS.forEach(function (t) {
  ok(new RegExp('(^|[\\s;{])' + t + '\\s*:').test(dark), t + ' has a dark value');
  ok(new RegExp('(^|[\\s;{])' + t + '\\s*:').test(mediaLight), t + ' has a light value under the OS scheme');
  ok(new RegExp('(^|[\\s;{])' + t + '\\s*:').test(forcedLight), t + ' has a light value under data-omega-theme="light"');
});
/* the two light blocks are identical on purpose */
function decls(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^{]*\{/, '').replace(/\}[\s\S]*$/, '').split(';').map(function (d) { return d.trim(); }).filter(Boolean).sort().join(';'); }
assert.equal(decls(mediaLight.slice(mediaLight.indexOf('html:not'))), decls(forcedLight), 'OS-light and pinned-light carry the same declarations'); count++;
ok(src.split('<style id="omega-ui-theme">').length === 2, 'one omega-ui-theme block');
ok(src.split('@media (prefers-color-scheme: light)').length === 2, 'one light media query in the token set');
ok(!/@media\(prefers-color-scheme:light\)\{\s*#tb,#ribbon\{--text/.test(src), 'the ribbon no longer carries its own light palette');
ok(/#tb,#ribbon\{background:var\(--navy\)/.test(src), 'the ribbon paints its ground from the token');
/* the accent variants come AFTER the light blocks, so a chosen accent wins in either scheme */
ok(theme.indexOf('html[data-omega-accent="green"]') > theme.indexOf('html[data-omega-theme="light"]{'), 'accent variants follow the light blocks');
/* light --gb-blue-deep stays a filled accent: the wizard's action label is --on-accent */
ok(/--gb-blue-deep:#2B5FA8/.test(forcedLight), 'the wizard action button keeps a filled ground in light');

/* 2. the switch: persisted exactly as the accent is */
ok(/function setTheme\(name\)/.test(src), 'setTheme exists');
ok(/localStorage\.setItem\('omega\.ui\.theme', name\)/.test(src), 'the theme is remembered');
ok(/localStorage\.getItem\('omega\.ui\.theme'\)/.test(src), 'the theme is restored');
ok(/setAttribute\('data-omega-theme', name\)/.test(src) && /removeAttribute\('data-omega-theme'\)/.test(src), 'auto removes the attribute, light|dark set it');
ok(/window\.OmegaUI\.theme = setTheme/.test(src), 'OmegaUI.theme is the public door');
['Theme: Auto', 'Theme: Light', 'Theme: Dark'].forEach(function (n) { ok(src.indexOf("name: '" + n) >= 0, n + ' is in the command palette'); });

/* 3. no recurring dark literal remains in the chrome regions */
var LITERALS = /rgba\(255,255,255,\.0[3468]\)|rgba\(0,0,0,\.2[04]?\)|(?:#16202B|#0F1D30|#0B1626|#1E3A5F|#26364d|#E2EEF9)(?![0-9a-fA-F])|rgba\(4,10,20,\.\d+\)|rgba\(13,27,42,\.97\)|rgba\(10,22,40,\.9\d\)|#1C3350|#132844|#7D95B4|#E8F0FA|#00D4FF/gi;
function css(selector) {
  var re = new RegExp('(^|[\\n}])\\s*' + selector.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g'), m, out = [];
  while ((m = re.exec(src))) out.push(m[2]);
  assert.ok(out.length, 'a rule for ' + selector); return out.join('\n');
}
['#app-menu', '.rtm-item', '#lp', '#rp', '#scorep', '#lgd', '.op-panel', '#tl-key', '#o2-coords', '#zc button', '#ruler', '#cw-grid', '.nd-lbl', '.nd-spec',
  '#portal-nav', '.pn-back', '#banner.shape', '.modal-bg', '.e3-modal', '#d4-scrim', '#cal-modal', '#omega-compass', '#oc-bar', '#omega-diag', '#od-bar', '#od-act button',
  '#omega-addr-go', '#omega-site', '#omega-meters', '#sos-modal .sos-card', '#arr-modal .arr-card', '.opi-shell', '.opi-head', '.opi-card', '#wiz-action-btn', '#wiz-back-btn,#wiz-skip-btn'].forEach(function (sel) {
  var body = css(sel), hits = body.match(LITERALS) || [];
  assert.deepEqual(hits, [], sel + ' still carries ' + hits.join(', ')); count++;
});
/* the inline markup of the panels and modals */
function markup(id) {
  var a = src.indexOf('id="' + id + '"'); assert.ok(a >= 0, id); a = src.lastIndexOf('<', a);
  var tags = /<div\b[^>]*>|<\/div>/g, depth = 0, m; tags.lastIndex = a;
  while ((m = tags.exec(src))) { depth += /^<\/div/.test(m[0]) ? -1 : 1; if (!depth) return src.slice(a, tags.lastIndex); }
  throw new Error('unclosed ' + id);
}
['lp', 'rp', 'bess-modal', 'export-modal', 'report-overlay', 'proj-modal', 'ctx-menu'].forEach(function (id) {
  /* a gradient button is data, and the dark ink on it belongs to the gradient, not the chrome */
  var text = markup(id).replace(/linear-gradient\([^)]*\);color:#16202B/gi, '').replace(/linear-gradient\([^)]*\)/gi, '');
  var hits = text.match(LITERALS) || [];
  assert.deepEqual(hits, [], '#' + id + ' inline styles still carry ' + hits.join(', ')); count++;
});
/* every full-screen scrim set from JS is the one token (the recurring rgba(4,10,20,…) family is gone) */
ok(!/background(?:-color)?:\s*rgba\(4,10,20,\.\d+\)/.test(src.replace(/--scrim:rgba\(4,10,20,\.72\)/, '')), 'no rgba(4,10,20) scrim remains outside the token (an SVG halo stroke is data)');
/* a token never swallowed an alpha suffix */
ok(!/var\(--[a-z-]+\)[0-9a-fA-F]{1,2}(?![\w(])/.test(src), 'no token followed by hex digits');
/* what stays as data */
ok(/#sld-sheet\{[^}]*background:#F5F7FA/.test(src), 'the SLD paper sheet is still white');
ok(/setDrawColor\('#E53935'\)[^>]*background:#E53935/.test(src), 'the draw swatches keep their colours');

/* 4. colours only: the id set is main's */
function ids(text) { var set = {}, re = /\sid="([^"]+)"/g, m; while ((m = re.exec(text))) set[m[1]] = true; return Object.keys(set).sort(); }
var base = null;
/* origin/main where it is known (a local main can lag the merge base), else main */
['origin/main', 'main'].some(function (ref) {
  try { base = cp.execSync('git show ' + ref + ':editor.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); return true; } catch (e) { return false; }
});
/* ids removed on purpose, each with its reason; any other missing id was lost */
var RETIRED = {
  'proj-tab-all': 'Projects list: the BTM/FOM tabs are gone, every project is listed with its kind (2026-09-27)',
  'proj-tab-btm': 'Projects list: the BTM/FOM tabs are gone, every project is listed with its kind (2026-09-27)',
  'proj-tab-fom': 'Projects list: the BTM/FOM tabs are gone, every project is listed with its kind (2026-09-27)',
  'np-market': 'New Project: no BTM/FOM market field; the BESS wizard asks when it runs (2026-09-27)',
  'ovs-mode': 'Value Stack: the panel is server-priced; the simulation is behind-the-meter by design and says what FOM would need (2026-10-06)',
  'ovs-partner': 'Value Stack: the browser aggregator table moved to /api/value-stack; the owner share is the editable assumption (2026-10-06)'
};
if (base) {
  var before = ids(base), after = ids(src), lost = before.filter(function (i) { return after.indexOf(i) < 0 && !RETIRED[i]; });
  assert.deepEqual(lost, [], 'ids lost against main: ' + lost.join(', ')); count++;
} else {
  console.log('  (main not available here; the id comparison was skipped)');
}
/* the package menu follows the switch too */
var opm = fs.readFileSync(path.join(ROOT, 'omega-package-menu.js'), 'utf8');
ok(/html:not\(\[data-omega-theme="light"\]\) \.opm-backdrop/.test(opm) && /html\[data-omega-theme="dark"\] \.opm-backdrop/.test(opm), 'the package menu honours data-omega-theme');

console.log('editor theme: ' + count + ' checks passed.');
