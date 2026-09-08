/* Pull named functions out of editor.html so node can reach them.
   No build step in this repo, so extraction is the only route in. */
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '..', 'editor.html');
const s = fs.readFileSync(SRC, 'utf8');

/* Several names appear more than once in editor.html — `cluster` and
   `compounds` each exist in two different modules. Suffix the name with #N to
   take the Nth occurrence; without it, a duplicate is an error rather than a
   silent grab of the wrong one, which is exactly the trap this hit. */
function grab(spec) {
  const m = /^(.*?)(?:#(\d+))?$/.exec(spec);
  const name = m[1], want = m[2] ? +m[2] : null;
  const needle = 'function ' + name + '(';
  const hits = [];
  for (let k = s.indexOf(needle); k >= 0; k = s.indexOf(needle, k + 1)) hits.push(k);
  if (!hits.length) throw new Error('not found in editor.html: ' + name);
  if (hits.length > 1 && want == null) {
    throw new Error(name + ' appears ' + hits.length + ' times — say ' + name + '#1..#' + hits.length);
  }
  const i = want == null ? hits[0] : hits[want - 1];
  if (i == null) throw new Error(name + ' has no occurrence #' + want);
  let k = s.indexOf('{', i), d = 0;
  for (;; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}') { d--; if (!d) break; }
  }
  return s.slice(i, k + 1);
}
function write(file, names, extra, after) {
  const body = names.map(grab).join('\n');
  names = names.map(n => n.split('#')[0]);
  fs.writeFileSync(path.join(__dirname, file),
    (extra || '') + body + '\nmodule.exports={' + names.join(',') + '};\n' + (after || ''));
  console.log(file, '<-', names.length, 'functions');
}

write('sweep.js', ['_ptInPoly','_shapeCentroid','_alShapePts','_shapeWorldPts','_shedGeo',
                   '_omegaFrame','_frameTo','_frameFrom','_framePoly','_framePlace',
                   '_sweepFrameToWorld','_longestEdgeBearing','_omegaLayoutAzimuth']);
/* _polyDist consults root._ptInPoly for the one-inside-the-other case, so the
   harness has to hand it back after the functions are defined. */
write('geo.js',   ['_hullOf','_ptSegD','_segCross','_polyDist','_ptInPoly'],
                  'var root={};\n', 'root._ptInPoly=_ptInPoly;\n');
/* The renderer for anything that knows its own footprint — the yard
   equipment that was silently drawing nothing. */
write('render.js', ['_renderFootprint'],
                   'var S={pxPerFt:6};\nfunction _shapeInk(){return "#8FA6BF";}\n' +
                   'function _mkNS(t){return {tag:t,attrs:{},kids:[],\n' +
                   '  setAttribute:function(k,v){this.attrs[k]=String(v);},\n' +
                   '  appendChild:function(c){this.kids.push(c);},\n' +
                   '  set textContent(v){this._text=v;}, get textContent(){return this._text;}};}\n',
                   'module.exports.mk=_mkNS;\nmodule.exports.S=S;\n');

write('pv.js',    ['_pvSunDev','_pvPreferSun','candidateAngles'],
                  'var PV_AZ_WINDOW_DEG=20;\n');

/* FenceTie's own frame. equipFrame + boxOf are what decide whether a fence
   follows the equipment or the screen. */
write('fence.js', ['equipFrame','boxOf','_boxOfRaw','isPoi','cluster#2','cornersOf','hullOf','minAreaBox','compounds#2'],
                  'var FR=null, FRAME_AGREE=0.6;\nvar root=global;\n',
                  'module.exports.setFR=function(f){FR=f;};\n'+
                  'module.exports.getFR=function(){return FR;};\n');
