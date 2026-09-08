function _ptInPoly(x, y, pts){
  if (!pts || pts.length < 3) return false;
  var inside = false;
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++){
    var xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
function _shapeCentroid(o){
  if (o.pts && o.pts.length){
    var sx=0, sy=0; o.pts.forEach(function(p){ sx+=p.x; sy+=p.y; });
    return { x:sx/o.pts.length, y:sy/o.pts.length };
  }
  if (typeof o.cx === 'number') return { x:o.cx, y:o.cy };
  if (typeof o.x === 'number'){
    var w=+o.w||0, h=+o.h||(w*0.35);
    return { x:o.x + w/2, y:o.y + h/2 };
  }
  return null;
}
function _alShapePts(sh){
  if(sh.kind==='rect' && sh.pts && sh.pts.length>=1){
    var x=sh.pts[0].x,y=sh.pts[0].y,w=sh.wPx||(sh.pts[1]?sh.pts[1].x-x:0),hh=sh.hPx||(sh.pts[1]?sh.pts[1].y-y:0);
    return [{x:x,y:y},{x:x+w,y:y},{x:x+w,y:y+hh},{x:x,y:y+hh}];
  }
  if(sh.pts && sh.pts.length>=3) return sh.pts.slice();
  return null;
}
function _shapeWorldPts(sh){
  if (!sh) return null;
  var p = (typeof _alShapePts==='function') ? _alShapePts(sh) : (sh.pts||null);
  if (!p || p.length < 3) return null;
  var rot=+sh.rot||0, tx=+sh.tx||0, ty=+sh.ty||0, sc=+sh.scale||1;
  if (!rot && !tx && !ty && sc===1) return p;
  var c=null;
  try { c = (typeof _shapeCenter==='function') ? _shapeCenter(sh) : null; } catch(e){}
  if (!c) return p;
  var r=rot*Math.PI/180, cos=Math.cos(r), sin=Math.sin(r);
  return p.map(function(q){
    var dx=(q.x-c.x)*sc, dy=(q.y-c.y)*sc;
    return { x:c.x+dx*cos-dy*sin+tx, y:c.y+dx*sin+dy*cos+ty };
  });
}
function _shedGeo(o){
  ['_geoPts','_geoC','_geoBoundary','_geoExcl','_geoBR','_geoRot','_geoTables',
   '_geoLat','_geoLng'].forEach(function(k){
     if(o[k]!==undefined){ try{ delete o[k]; }catch(e){} } });
}
function _omegaFrame(poly){
  var deg = null, v = null;
  try { v = (typeof S !== 'undefined') ? S.siteAzimuth : null; } catch(e){}
  if (typeof v === 'number' && isFinite(v)) {
    deg = v;                                   /* explicit compass override */
  } else if (poly && poly.length >= 3) {
    deg = _longestEdgeBearing({ pts: poly, closed: true });
  } else {
    try { deg = _omegaLayoutAzimuth(); } catch(e){}
  }
  if (deg == null || !isFinite(deg)) return null;
  var d = deg % 180; if (d < 0) d += 180;
  /* A parcel already square to the grid gains nothing and risks everything. */
  if (d < 0.5 || d > 179.5) return null;

  var pw = (poly && poly.length >= 3) ? poly : null;
  if (!pw) {
    var sb = null;
    try { sb = _siteBoundaryShape(); } catch(e){}
    pw = sb ? _shapeWorldPts(sb) : null;
  }
  if (!pw || pw.length < 3) return null;
  var cx = 0, cy = 0;
  pw.forEach(function(q){ cx += q.x; cy += q.y; });
  return { deg:d, cx:cx/pw.length, cy:cy/pw.length };
}
function _frameTo(fr, x, y){          /* world -> frame */
  var r = -fr.deg*Math.PI/180, c = Math.cos(r), sn = Math.sin(r);
  var dx = x-fr.cx, dy = y-fr.cy;
  return { x: fr.cx+dx*c-dy*sn, y: fr.cy+dx*sn+dy*c };
}
function _frameFrom(fr, x, y){        /* frame -> world */
  var r = fr.deg*Math.PI/180, c = Math.cos(r), sn = Math.sin(r);
  var dx = x-fr.cx, dy = y-fr.cy;
  return { x: fr.cx+dx*c-dy*sn, y: fr.cy+dx*sn+dy*c };
}
function _framePoly(fr, poly, back){
  var f = back ? _frameFrom : _frameTo;
  return (poly||[]).map(function(q){
    var r = f(fr, q.x, q.y);
    for (var k in q) if (k!=='x' && k!=='y') r[k] = q[k];
    return r;
  });
}
function _framePlace(fr, shape){
  if (!fr || !shape || !shape.pts || !shape.pts.length) return shape;
  var P = 0;
  try { P = (typeof S!=='undefined' && S.pxPerFt>0) ? S.pxPerFt : 0; } catch(e){}
  var pts = shape.pts, cx, cy, hw, hh;
  if (pts.length === 1 && P > 0 && (shape.lf != null || shape.wf != null)) {
    hw = ((+shape.lf||0)*P)/2; hh = ((+shape.wf||0)*P)/2;
    cx = pts[0].x + hw; cy = pts[0].y + hh;
  } else if (pts.length === 2 && shape.kind === 'rect') {
    /* Only a RECT is two opposite corners. A two-point polyline is a line,
       and rebuilding it from a bounding box would flip any line running
       bottom-left to top-right. Lines fall through to the polygon path. */
    hw = Math.abs(pts[1].x-pts[0].x)/2; hh = Math.abs(pts[1].y-pts[0].y)/2;
    cx = Math.min(pts[0].x,pts[1].x)+hw; cy = Math.min(pts[0].y,pts[1].y)+hh;
  } else {
    shape.pts = _framePoly(fr, pts, true);
    return shape;
  }
  var c = _frameFrom(fr, cx, cy);
  shape.pts = (pts.length === 1)
    ? [{ x:c.x-hw, y:c.y-hh }]
    : [{ x:c.x-hw, y:c.y-hh }, { x:c.x+hw, y:c.y+hh }];
  var a = ((+shape.rot||0) + fr.deg) % 360; if (a > 180) a -= 360;
  shape.rot = Math.round(a*10)/10;
  return shape;
}
function _sweepFrameToWorld(fr, seenS, seenC, seenE){
  if (!fr) return 0;
  var n = 0;
  (S.shapes||[]).forEach(function(sh){
    if (!sh || !sh.id || seenS[sh.id]) return;
    if (sh.omegaSolarZone || sh.isSiteBoundary) return;
    _framePlace(fr, sh);
    if (sh.tables) sh.tables = sh.tables.map(function(t){
      var c = JSON.parse(JSON.stringify(t)), q = _frameFrom(fr, t.x, t.y);
      c.x = q.x; c.y = q.y;
      var a = ((+t.rot||0) + fr.deg) % 360; if (a > 180) a -= 360;
      c.rot = Math.round(a*10)/10;
      return c;
    });
    _shedGeo(sh); n++;
    try { if (typeof renderShape==='function') renderShape(sh); } catch(e){}
    try { if (typeof _geoRestampOne==='function') _geoRestampOne(sh); } catch(e){}
  });
  (S.conduits||[]).forEach(function(c){
    if (!c || !c.id || seenC[c.id] || !c.pts) return;
    c.pts = _framePoly(fr, c.pts, true);
    _shedGeo(c); n++;
    try { if (typeof renderConduit==='function') renderConduit(c); } catch(e){}
    try { if (typeof _geoRestampOne==='function') _geoRestampOne(c); } catch(e){}
  });
  (S.elements||[]).forEach(function(el){
    if (!el || !el.id || seenE[el.id]) return;
    var w = +el.w||0, h = +el.h||(w*0.35);
    var q = _frameFrom(fr, (+el.x||0)+w/2, (+el.y||0)+h/2);
    el.x = q.x-w/2; el.y = q.y-h/2;
    var a = ((+el.rot||0) + fr.deg) % 360; if (a > 180) a -= 360;
    el.rot = Math.round(a*10)/10;
    _shedGeo(el); n++;
    try { if (typeof _reRenderEl==='function') _reRenderEl(el.id); } catch(e){}
    try { if (typeof _geoRestampOne==='function') _geoRestampOne(el); } catch(e){}
  });
  return n;
}
function _longestEdgeBearing(sh){
  if (!sh || !sh.pts || sh.pts.length < 2) return null;
  var pts = sh.pts, n = pts.length, best = -1, deg = null;
  var last = sh.closed === false ? n - 1 : n;
  for (var i = 0; i < last; i++){
    var a = pts[i], b = pts[(i + 1) % n];
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = dx*dx + dy*dy;
    if (len <= best) continue;
    best = len;
    var d = Math.atan2(dy, dx) * 180 / Math.PI;
    d %= 180; if (d < 0) d += 180;
    deg = d;
  }
  return deg;
}
function _omegaLayoutAzimuth(){
  var v = null;
  try { v = (typeof S!=='undefined') ? S.siteAzimuth : null; } catch(e){ return null; }
  if (typeof v === 'number' && isFinite(v)) return v;
  if (v != null && v !== 'parcel') return null;
  var sb = null;
  try { sb = (typeof _siteBoundaryShape==='function') ? _siteBoundaryShape() : null; } catch(e){}
  if (!sb) return null;
  var pw = (typeof _shapeWorldPts==='function') ? _shapeWorldPts(sb) : null;
  return _longestEdgeBearing(pw ? { pts:pw, closed:sb.closed } : sb);
}
module.exports={_ptInPoly,_shapeCentroid,_alShapePts,_shapeWorldPts,_shedGeo,_omegaFrame,_frameTo,_frameFrom,_framePoly,_framePlace,_sweepFrameToWorld,_longestEdgeBearing,_omegaLayoutAzimuth};
