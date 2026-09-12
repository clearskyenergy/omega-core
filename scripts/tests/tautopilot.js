/* The autopilot is one inline module in editor.html that calls forty-odd
   globals defined in other blocks of a 170k-line file. Nothing in the
   browser says when one of those names is renamed out from under it: the
   step simply reports "blocked" at run time, on a site, in front of someone.
   So the names it depends on are checked here, statically, against the file
   as it is — along with the three small edits that shipped with it. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const s = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
function count(hay, needle) { let n = 0; for (let k = hay.indexOf(needle); k >= 0; k = hay.indexOf(needle, k + 1)) n++; return n; }

/* The block itself: from its banner comment to the closing script tag. */
console.log('the module');
const START = '<!-- ================= OMEGA AUTOPILOT =================';
ok(count(s, START) === 1, 'the OmegaAutopilot script exists exactly once');
const i0 = s.indexOf(START), i1 = s.indexOf('</script>', i0);
const block = i0 >= 0 ? s.slice(i0, i1) : '';
ok(/root\.OmegaAutopilot\s*=\s*\{/.test(block), 'it exports window.OmegaAutopilot');
ok(/root\.__omegaAutopilot\s*=\s*ST/.test(block), 'and window.__omegaAutopilot for the console');
ok(/q\.get\('address'\)/.test(block) && /q\.get\('auto'\)/.test(block), 'it reads ?address= and ?auto=');
ok(/if \(!address \|\| !auto\) return null;/.test(block) && /if \(!P\) return;/.test(block),
   'and does nothing at all when either is absent');
ok(/q\.get\('project'\) \|\| q\.get\('id'\)/.test(block), '?id= / ?project= is read so the project wins over the address');
ok(/kind === 'service'\) break;/.test(block), 'placement stops before the service node — the POI stays a click');
ok(!/S\.bessList/.test(block), 'it never writes S.bessList (no catalogue unit is auto-picked)');
ok(/BGB\.cfg = root\._bgbGenericCfg\(/.test(block), 'the seeded config is the generic placeholder');
ok(/postMessage\(msg, root\.location\.origin\)/.test(block), 'the report goes to the opener on the same origin only');
ok(/type = 'OMEGA_AUTOPILOT'/.test(block), 'and is typed OMEGA_AUTOPILOT');

/* ES5: the file's rule for inline tool code. Strip comments and strings
   roughly before looking, so a word in a comment cannot fail the check. */
const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
                  .replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
ok(!/=>/.test(code), 'no arrow functions');
ok(!/\b(const|let)\s/.test(code), 'no const/let');
ok(!/`/.test(code), 'no template literals');
ok(!/\basync\b|\bawait\b/.test(code), 'no async/await');
{
  const js = block.slice(block.indexOf('<script>') + 8);
  let parses = true; try { new Function(js); } catch (e) { parses = false; console.log('         ' + e.message); }
  ok(parses, 'the block parses');
}

/* Every global the module calls must be defined somewhere in the file. */
console.log('the names it calls');
/* The design that specified this module named the save function
   `_saveProject`; the file has `saveProject` (async, wrapped twice on
   window). This list caught that before a browser did. */
const NAMES = ['fetchMap', '_latLngToPx', '_liveMapState', '_getCanvasSize', '_geoStampAll', 'renderShape',
  'uid', 'updShapeCount', 'OmegaSite', 'OmegaGIS', 'openBessGuidedBuild', '_bgbStartPlacing', 'placeBgbAt',
  '_bgbFinishRun', '_bgbCurKind', '_bgbCancel', '_bgbSync', '_bgbGenericCfg', '_bessFootprint', '_plotUnproject',
  'showBanner', 'OmegaGridPrescreen', 'openScorePanel', 'computeInterconnectScore', 'saveProject',
  '_renderLayerData', 'SHAPE_STROKE', '_bgbState', '_CFG', 'S'];
ok(!/_saveProject/.test(block), 'it does not call the _saveProject that does not exist');
function defined(name) {
  const re = new RegExp('(^|[\\s;{}])(async\\s+)?function\\s+' + name + '\\s*\\(|(window|root)\\.' + name + '\\s*=[^=]|'
    + '(^|[\\s;{}])(var|let|const)\\s+' + name + '\\b', 'm');
  return re.test(s);
}
NAMES.forEach(n => {
  ok(new RegExp('\\b' + n + '\\b').test(block), n + ' is actually used by the module');
  ok(defined(n), n + ' is defined in editor.html');
});
['saveToProject', 'feedSiteScore', 'run'].forEach(fn => {
  ok(new RegExp('\\b' + fn + '\\b').test(s.slice(s.indexOf('root.OmegaGridPrescreen = {'), s.indexOf('root.OmegaGridPrescreen = {') + 400)),
     'OmegaGridPrescreen exports ' + fn);
});
ok(/importText:\s*importText|importText,/.test(s.slice(s.indexOf('window.OmegaGIS = {'), s.indexOf('window.OmegaGIS = {') + 200)),
   'OmegaGIS exports importText');
ok(/setBoundary:function\(id\)/.test(s), 'OmegaSite.setBoundary takes an id');
/* The guided-build block is wrapped: `var BGB` is not a global, and the first
   browser run reported "guided build is not on this page". An accessor is the
   fix - not window.BGB, which would switch on fourteen dead `typeof BGB`
   guards elsewhere - and this is what keeps it. */
ok(/window\._bgbState=function\(\)\{ return BGB; \};/.test(s) && /window\._bgbCurKind=_bgbCurKind;/.test(s),
   '_bgbState() and _bgbCurKind are exported on window');
ok(!/window\.BGB\s*=/.test(s), 'and BGB itself is still not a global');
ok(!/typeof BGB\b/.test(block), 'the module reads the state through the accessor, never a bare BGB');

/* The three small edits. */
console.log('the edits beside it');
ok(count(s, 'function _siteScoreRefresh(') === 1, '_siteScoreRefresh is defined exactly once');
ok(count(s, '_siteScoreRefresh') >= 3, 'and its two typeof-guarded callers are still there');
{
  const t0 = s.indexOf('function toggleDataLayer('), t1 = s.indexOf('function _renderLayerData(');
  const body = s.slice(t0, t1);
  ok(t0 > 0 && t1 > t0, 'toggleDataLayer found');
  ok(!/Sample Holdings/.test(body), 'no Sample Holdings left in toggleDataLayer');
  ok(!/parcelAcres\s*=\s*2\.4/.test(body), 'and no 2.4-acre sample');
  ok(/OmegaAutopilot\.parcel\(/.test(body), 'the Parcels layer asks OmegaAutopilot.parcel');
}
ok(!/Sample Holdings/.test(s), 'Sample Holdings appears nowhere in editor.html');
ok(/autopilot: \(typeof S!=='undefined' && S\.autopilot\) \? S\.autopilot : null,/.test(s), 'saveProject carries S.autopilot');

console.log('\nsmoke: serve the repo and open');
console.log('  /editor.html?address=4200%20W%20Roosevelt%20Rd%2C%20Chicago%2C%20IL&auto=bess&mw=2&mwh=8&from=jarvis');
console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
