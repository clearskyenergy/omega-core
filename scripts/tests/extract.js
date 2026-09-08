/* Pull named functions out of editor.html so node can reach them.
   No build step in this repo, so extraction is the only route in. */
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '..', 'editor.html');
const s = fs.readFileSync(SRC, 'utf8');

function grab(name) {
  const i = s.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('not found in editor.html: ' + name);
  let k = s.indexOf('{', i), d = 0;
  for (;; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}') { d--; if (!d) break; }
  }
  return s.slice(i, k + 1);
}
function write(file, names, extra, after) {
  const body = names.map(grab).join('\n');
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
write('pv.js',    ['_pvSunDev','_pvPreferSun','candidateAngles'],
                  'var PV_AZ_WINDOW_DEG=20;\n');

/* FenceTie's own frame. equipFrame + boxOf are what decide whether a fence
   follows the equipment or the screen. */
write('fence.js', ['equipFrame','boxOf','_boxOfRaw'],
                  'var FR=null, FRAME_AGREE=0.6;\nvar root=global;\n',
                  'module.exports.setFR=function(f){FR=f;};\n'+
                  'module.exports.getFR=function(){return FR;};\n');
