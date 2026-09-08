/* The service entrance is its own compound, and the yard stops stretching. */
global.window = global;
const P_FT = 6;
global.S_ = () => S;
global.P  = () => P_FT;
global.CFG = { clusterFt: 120, standoffFt: 20 };
const sw = require('./sweep.js');
global._frameTo=sw._frameTo; global._frameFrom=sw._frameFrom;
global._framePoly=sw._framePoly; global._framePlace=sw._framePlace;
global.S = { pxPerFt:P_FT, shapes:[], conduits:[], elements:[] };
global.GROUPS = [
  { key:'yard', label:'INTERCONNECTION YARD',
    is: sh => (!!sh.omegaYard || sh.kind==='utility') && !global.isPoi(sh) },
  { key:'poi',  label:'UTILITY SERVICE', is: sh => global.isPoi(sh) }
];
const f = require('./fence.js');
Object.assign(global, f);

function chk(l, ok, x=''){ console.log(`  ${ok?'PASS':'FAIL'}  ${l}${x?'  '+x:''}`); return ok; }
let all = true;

// classification
all &= chk('user transformer is a POI',   f.isPoi({kind:'utility', utype:'xfmr'}));
all &= chk('substation is a POI',          f.isPoi({kind:'substation'}));
all &= chk('POI marker is a POI',          f.isPoi({kind:'utility', utype:'mpoi'}));
all &= chk('a gas meter set is NOT a POI', !f.isPoi({kind:'utility', utype:'gasmeter'}));
all &= chk('yard switchgear is NOT a POI', !f.isPoi({kind:'panel', omegaYard:true}));

// the stretched fence: on-site yard gear, and a transformer 900 ft away
const yardGear = [
  {id:'y1', kind:'panel', omegaYard:true, lf:20, wf:10, rot:0, pts:[{x:2000,y:1000}]},
  {id:'y2', kind:'panel', omegaYard:true, lf:20, wf:10, rot:0, pts:[{x:2000,y:1040}]}
];
const xfmr = {id:'t1', kind:'utility', utype:'xfmr', lf:6, wf:5, rot:0,
              cx: 2000 - 900*P_FT, cy: 1020};
S.shapes = yardGear.concat([xfmr]);

const comps = f.compounds();
const byKey = k => comps.filter(c => c.key === k);
all &= chk('yard and POI are separate compounds',
  byKey('yard').length===1 && byKey('poi').length===1,
  `yard=${byKey('yard').length} poi=${byKey('poi').length}`);

const yr = byKey('yard')[0].r, pr = byKey('poi')[0].r;
const yardW = (yr.x2-yr.x1)/P_FT, poiW = (pr.x2-pr.x1)/P_FT;
all &= chk('yard fence is no longer stretched to the transformer',
  yardW < 200, `${yardW.toFixed(0)} ft wide`);
all &= chk('POI fence is sized to the transformer',
  poiW < 100, `${poiW.toFixed(0)} ft wide`);
all &= chk('POI fence actually contains the transformer',
  xfmr.cx > pr.x1 && xfmr.cx < pr.x2 && xfmr.cy > pr.y1 && xfmr.cy < pr.y2);

// before the change both would have merged into one hull ~900 ft across
const merged = Math.abs(xfmr.cx - 2000) / P_FT;
console.log(`\n  (the old single hull spanned ~${merged.toFixed(0)} ft of mostly empty ground)`);

console.log(all ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(all?0:1);
