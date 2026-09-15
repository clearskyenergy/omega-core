/* Extracts the autopilot's geometry helpers from editor.html and exercises
   them against the case that shipped the bug: a pad on a building. */
const fs = require('fs');
const src = fs.readFileSync('editor.html', 'utf8');
const i = src.indexOf('/* ── KEEPING EQUIPMENT OUT OF BUILDINGS');
const j = src.indexOf('function layout() {', i);
const body = src.slice(i, j);
const mod = new Function('ST', 'toPx', `${body}
  return {_inPoly,_rectHitsPoly,_padRect,_clear,_findClear,_bldPx,_hostBuilding,_behind,
          _centroid,_areaOf,BLD_CLEAR_FT,SEARCH_MAX_FT,OUTDOOR_ONLY,INDOOR_OK,
          TYPE_PLAN,planFor};`);

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log('ok   ' + name)) : (fail++, console.log('FAIL ' + name)); };

/* toPx: 1 unit lat/lng -> 1 px, for a readable test */
const toPx = (lat, lng) => ({ x: lng, y: lat });
const G = mod({ buildings: [] }, toPx);
const ppf = 1, v = { x: 0, y: 1 };
const sq = (x, y, s) => [{x,y},{x:x+s,y},{x:x+s,y:y+s},{x,y:y+s}];

ok('point inside a square', G._inPoly({x:5,y:5}, sq(0,0,10)));
ok('point outside a square', !G._inPoly({x:50,y:5}, sq(0,0,10)));

/* the shipped bug: the pad centre sits on a building */
const bld = sq(0,0,100);
ok('pad on a building collides', !G._clear({x:50,y:50}, 20, 8, v, ppf, [bld]));
ok('pad far away is clear',      G._clear({x:500,y:500}, 20, 8, v, ppf, [bld]));

/* the corners-only trap: a building small enough to sit inside the pad */
const tiny = sq(498,498,4);
ok('building entirely inside the pad still collides',
   !G._clear({x:500,y:500}, 40, 40, v, ppf, [tiny]));

/* edge crossing with no corner containment either way */
const bar = [{x:400,y:499},{x:600,y:499},{x:600,y:501},{x:400,y:501}];
ok('a bar crossing the pad collides', !G._clear({x:500,y:500}, 20, 8, v, ppf, [bar]));

/* clearance is honoured: just outside the footprint but inside the clearance */
ok('inside the clearance band collides',
   !G._clear({x:500,y:500}, 10, 10, v, ppf, [sq(506,495,2)]));

/* the search finds somewhere, and it is genuinely clear */
const found = G._findClear({x:50,y:50}, 20, 8, v, ppf, [bld], null);
ok('search finds a clear spot on a built-over centre', !!found);
ok('what the search returns is clear', found && G._clear(found, 20, 8, v, ppf, [bld]));
ok('search stays near the centre', found && Math.hypot(found.x-50, found.y-50) <= G.SEARCH_MAX_FT);

/* a boundary the search must stay inside */
const ring = sq(0,0,200);
const f2 = G._findClear({x:50,y:50}, 20, 8, v, ppf, [bld], ring);
ok('search respects the parcel boundary', f2 && G._inPoly(f2, ring));

/* nowhere to go: buildings over everything the search can reach */
const wall = sq(-1000,-1000,3000);
ok('a fully built-over site returns null', G._findClear({x:50,y:50}, 20, 8, v, ppf, [wall], null) === null);

/* an unprojectable ring is dropped, not guessed */
const G2 = mod({ buildings: [[[1,1],[2,2],[3,3]]] }, () => null);
ok('rings that will not project are dropped', G2._bldPx().length === 0);


/* ── the 1395 case: a building on the lot, the road to the south ─────────
   v points at the road-facing front, so "behind" is away from it. The bug
   Thomas reported was the battery landing at the FRONT and inside. */
const shop = sq(400, 400, 200);            /* building: x,y 400..600 */
const centre = { x: 500, y: 500 };         /* the centroid IS the building */
const south = { x: 0, y: 1 };              /* road-facing = +y */

ok('host building found when the centre is inside one',
   G._hostBuilding(centre, [shop], ppf) === shop);
ok('no host on a bare lot', G._hostBuilding(centre, [], ppf) === null);
ok('centroid of the shop is its middle',
   Math.round(G._centroid(shop).x) === 500 && Math.round(G._centroid(shop).y) === 500);

const bess = G._behind(shop, south, 20, 8, ppf, [shop], null);
ok('battery placed behind the building', !!bess);
ok('behind means AWAY from the road', bess && bess.y < 400);
ok('not inside the building', bess && !G._inPoly(bess, shop));
ok('battery pad clears the building', bess && G._clear(bess, 20, 8, south, ppf, [shop]));

/* the front is where the meter and the utility go — not the battery */
ok('the battery is not at the front', bess && bess.y < centre.y);

/* per-kind doctrine */
ok('battery is outdoor-only', !!G.OUTDOOR_ONLY.bess);
ok('transformer is outdoor-only', !!G.OUTDOOR_ONLY.xfmr);
ok('disconnect is outdoor-only', !!G.OUTDOOR_ONLY.disco);
ok('switchgear may be indoors', !G.OUTDOOR_ONLY.panel && !!G.INDOOR_OK.panel);
ok('revenue meter may be on the building', !G.OUTDOOR_ONLY.meter && !!G.INDOOR_OK.meter);

/* a boundary tight behind the building forces the fallback, not a failure */
const tight = [{x:380,y:380},{x:620,y:380},{x:620,y:640},{x:380,y:640}];
const b2 = G._behind(shop, south, 20, 8, ppf, [shop], tight);
ok('a tight lot still finds somewhere or says no', b2 === null || !G._inPoly(b2, shop));


/* ── the type plan: every project type has one, and says honestly what it
   does with it ─────────────────────────────────────────────────────────── */
['bess','solarbess','solar','ev','evl2','der','datacenter'].forEach(function (k) {
  ok('plan exists for ' + k, !!G.TYPE_PLAN[k] && Array.isArray(G.TYPE_PLAN[k].steps));
});
ok('an unknown type falls back to the battery chain', G.planFor('nonsense') === G.TYPE_PLAN.bess);
ok('bess walks the chain', G.TYPE_PLAN.bess.steps.join() === 'chain');
ok('solar lays an array and no chain', G.TYPE_PLAN.solar.steps.join() === 'array');
ok('solar+bess does both, array first',
   G.TYPE_PLAN.solarbess.steps.join() === 'array,chain');
ok('solar+bess arms the SOLAR_BESS guided build',
   G.TYPE_PLAN.solarbess.mode === 'SOLAR_BESS');
['ev','evl2','der','datacenter'].forEach(function (k) {
  ok(k + ' hands off rather than guessing', G.TYPE_PLAN[k].steps.join() === 'hand');
  ok(k + ' says what the human step is', typeof G.TYPE_PLAN[k].hand === 'string'
     && G.TYPE_PLAN[k].hand.length > 20);
});
ok('charging asks for the stencils, per Thomas',
   /stencil/i.test(G.TYPE_PLAN.ev.hand) && /stencil/i.test(G.TYPE_PLAN.evl2.hand));


/* ── the case Thomas hit: a BIG building, and one that runs to the lot line.
   The first cut stepped from the centroid, never escaped the footprint, and
   dropped the pad on the parcel perimeter. ─────────────────────────────── */
const big = sq(0, 0, 400);                       /* 400 x 400 warehouse */
const lot = sq(-60, -60, 520);                   /* a lot with only 60 ft of yard */
const b3 = G._behind(big, south, 20, 8, ppf, [big], lot);
ok('big building: something is found', !!b3);
ok('big building: not inside the footprint', b3 && !G._inPoly(b3, big));
ok('big building: the pad actually clears', b3 && G._clear(b3, 20, 8, south, ppf, [big]));
ok('big building: it is BEHIND, not in front', b3 && b3.y < 0);
ok('big building: it stays on the lot', b3 && G._inPoly(b3, lot));
/* and it hugs the building rather than fleeing to the boundary */
ok('big building: within 60 ft of the wall', b3 && (0 - b3.y) < 60);

/* a building flush against the rear lot line: the back is unavailable, so it
   must hug a side wall — never the far perimeter, never inside */
const flush = sq(0, 0, 300);
const tightLot = [{x:-80,y:0},{x:380,y:0},{x:380,y:420},{x:-80,y:420}];
const b4 = G._behind(flush, south, 20, 8, ppf, [flush], tightLot);
ok('flush building: found a side', !!b4);
ok('flush building: not inside', b4 && !G._inPoly(b4, flush));
ok('flush building: clears', b4 && G._clear(b4, 20, 8, south, ppf, [flush]));
ok('flush building: on the lot', b4 && G._inPoly(b4, tightLot));
ok('flush building: hugs the wall, not the boundary',
   b4 && Math.min(Math.abs(b4.x - 0), Math.abs(b4.x - 300), Math.abs(b4.y - 300)) < 70);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
