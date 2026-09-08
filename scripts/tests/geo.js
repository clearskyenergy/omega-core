var root={};
function _hullOf(pts) {
    if (!pts || pts.length < 3) return (pts || []).slice();
    var p = pts.slice().sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
    function cross(o, a, b) { return (a.x-o.x)*(b.y-o.y) - (a.y-o.y)*(b.x-o.x); }
    var lo = [], hi = [], i;
    for (i = 0; i < p.length; i++) {
      while (lo.length >= 2 && cross(lo[lo.length-2], lo[lo.length-1], p[i]) <= 0) lo.pop();
      lo.push(p[i]);
    }
    for (i = p.length - 1; i >= 0; i--) {
      while (hi.length >= 2 && cross(hi[hi.length-2], hi[hi.length-1], p[i]) <= 0) hi.pop();
      hi.push(p[i]);
    }
    lo.pop(); hi.pop();
    var h = lo.concat(hi);
    return h.length >= 3 ? h : p;
  }
function _ptSegD(px, py, ax, ay, bx, by) {
    var dx = bx-ax, dy = by-ay, l2 = dx*dx + dy*dy;
    var t = l2 ? Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / l2)) : 0;
    var qx = ax + t*dx, qy = ay + t*dy;
    return Math.hypot(px-qx, py-qy);
  }
function _segCross(a, b, c, d) {
    function o(p, q, r) { var v = (q.y-p.y)*(r.x-q.x) - (q.x-p.x)*(r.y-q.y); return v > 1e-9 ? 1 : (v < -1e-9 ? -1 : 0); }
    return o(a,b,c) !== o(a,b,d) && o(c,d,a) !== o(c,d,b);
  }
function _polyDist(A, B) {
    if (!A || !B || A.length < 2 || B.length < 2) return Infinity;
    var i, j, best = Infinity;
    for (i = 0; i < A.length; i++) {
      var a1 = A[i], a2 = A[(i+1) % A.length];
      for (j = 0; j < B.length; j++) {
        var b1 = B[j], b2 = B[(j+1) % B.length];
        if (_segCross(a1, a2, b1, b2)) return 0;
        best = Math.min(best,
          _ptSegD(a1.x,a1.y,b1.x,b1.y,b2.x,b2.y), _ptSegD(a2.x,a2.y,b1.x,b1.y,b2.x,b2.y),
          _ptSegD(b1.x,b1.y,a1.x,a1.y,a2.x,a2.y), _ptSegD(b2.x,b2.y,a1.x,a1.y,a2.x,a2.y));
      }
    }
    /* One entirely inside the other shares no edge crossing but is not apart. */
    try {
      if (root._ptInPoly && (root._ptInPoly(A[0].x, A[0].y, B) || root._ptInPoly(B[0].x, B[0].y, A))) return 0;
    } catch (e) {}
    return best;
  }
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
root._ptInPoly=_ptInPoly;
module.exports={_hullOf,_ptSegD,_segCross,_polyDist,_ptInPoly};
