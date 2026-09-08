var PV_AZ_WINDOW_DEG=20;
function _pvSunDev(a) {
    var d = a % Math.PI; if (d < 0) d += Math.PI;
    return Math.min(d, Math.PI - d);
  }
function _pvPreferSun(angles, opts) {
    if (opts && opts.freeAngle === true) return angles;
    var win = (opts && isFinite(opts.azWindowDeg) ? +opts.azWindowDeg : PV_AZ_WINDOW_DEG)
              * Math.PI / 180;
    var keep = angles.filter(function (a) { return _pvSunDev(a) <= win + 1e-9; });
    var hasZero = keep.some(function (a) { return _pvSunDev(a) < 1e-9; });
    if (!hasZero) keep.unshift(0);
    keep.sort(function (p, q) { return _pvSunDev(p) - _pvSunDev(q); });
    return keep;
  }
function candidateAngles(bnd) {
    var edges = [];
    for (var i = 0, j = bnd.length - 1; i < bnd.length; j = i++) {
      var dx = bnd[i].x - bnd[j].x, dy = bnd[i].y - bnd[j].y;
      var len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      var a = Math.atan2(dy, dx);
      while (a < 0) a += Math.PI;
      while (a >= Math.PI) a -= Math.PI;
      edges.push({ a: a, len: len });
    }
    edges.sort(function (p, q) { return q.len - p.len; });
    var list = [], seen = {};
    function push(a) {
      var k = Math.round(a * 180 / Math.PI) % 180;
      if (seen[k]) return;
      seen[k] = 1; list.push(a);
    }
    edges.slice(0, 6).forEach(function (e) { push(e.a); push((e.a + Math.PI / 2) % Math.PI); });
    for (var d = 0; d < 180; d += 15) push(d * Math.PI / 180);
    return list;
  }
module.exports={_pvSunDev,_pvPreferSun,candidateAngles};
