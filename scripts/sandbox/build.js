/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Bundles the SANDBOX around the REAL engines. Nothing in api/_lib is edited
   or re-implemented — the three files are read from the repo verbatim and
   exposed as globals, so what the page decides is what production decides:
   the scan verdict, what a buyer may see, and what the plant must buy. */
var fs = require('fs');
var R = require('path').resolve(__dirname, '..', '..');
var D = __dirname;

function engine(path, globalName, names) {
  var src = fs.readFileSync(require('path').join(R, path), 'utf8');
  /* CommonJS -> a browser global. The only edit, and it touches no logic. */
  src = src.replace(/module\.exports\s*=\s*\{[\s\S]*?\};?\s*$/m,
    'window.' + globalName + ' = { ' + names.map(function (n) { return n + ': ' + n; }).join(', ') + ' };');
  if (src.indexOf('window.' + globalName) < 0) throw new Error('export rewrite failed for ' + path);
  return '/* ===== ' + path + ' — verbatim from the repo ===== */\n' + src;
}

var plant  = engine('api/_lib/plant.js',  'OmegaPlant',
  ['DEFAULT_ROUTING','MACHINE_STATIONS','routingOf','indexOf','labelOf','serialFrom','judgeScan','applyScan']);
var portal = engine('api/_lib/portal.js', 'OmegaPortal',
  ['LADDER','when','CANCELLED','BY_STATUS','BY_STATION','ladderIndex','stationMilestone','milestoneOf','publicOrder']);
var materials = engine('api/_lib/materials.js', 'OmegaMaterials',
  ['bomLines','validateCatalog','lowLevelCodes','demandsFrom','plan','purchaseList','shortfallsByWorksOrder','UNITS','MAX_LINES','MAX_DEPTH']);

var out = [
  fs.readFileSync(D + '/shell.html', 'utf8'),
  '<script>', plant, '<\/script>',
  '<script>', portal, '<\/script>',
  '<script>', materials, '<\/script>',
  '<script>', fs.readFileSync(D + '/app.js', 'utf8'), '<\/script>'
].join('\n');

if (/<(!doctype|html|head|body)[\s>]/i.test(out)) throw new Error('page wrapper tag leaked in');
fs.writeFileSync(D + '/index.html', out);
console.log('index.html  ' + Math.round(out.length / 1024) + ' KB');
