/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var E=require('./fiber-evidence');
function hit(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
function box(points){var b=[Infinity,Infinity,-Infinity,-Infinity];points.forEach(function(p){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);});return b;}
function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function touches(a,b,c,d){
 var x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
 if(x*y<0&&z*w<0)return true;
 function on(p,q,r,v){return Math.abs(v)<1e-12&&hit(box([p,q]),box([r]));}
 return on(a,b,c,x)||on(a,b,d,y)||on(c,d,a,z)||on(c,d,b,w);
}
function ringsTouch(a,b){for(var i=1;i<a.length;i++)for(var j=1;j<b.length;j++)if(touches(a[i-1],a[i],b[j-1],b[j]))return true;return false;}
function parse(input){
 input=input||{};var g=input.boundary;
 if(g&&g.type==='Feature')g=g.geometry;
 if(!g||['Polygon','MultiPolygon'].indexOf(g.type)<0)throw new Error('Boundary must be a GeoJSON Polygon or MultiPolygon in WGS84 [longitude, latitude].');
 var polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates,vertices=0,all=[];
 if(!Array.isArray(polygons)||!polygons.length||polygons.length>20)throw new Error('Use 1–20 polygon parts.');
 polygons=polygons.map(function(poly){
  if(!Array.isArray(poly)||!poly.length||poly.length>20)throw new Error('Invalid polygon rings.');
  var rings=poly.map(function(ring){
   if(!Array.isArray(ring)||ring.length<4)throw new Error('Every ring needs at least three vertices and a closing vertex.');
   vertices+=ring.length;if(vertices>1000)throw new Error('Boundary exceeds 1,000 vertices. Simplify the parcel boundary first.');
   var r=ring.map(function(p){if(!Array.isArray(p)||p.length<2||typeof p[0]!=='number'||typeof p[1]!=='number'||!isFinite(p[0])||!isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>85)throw new Error('Invalid WGS84 boundary coordinate.');return [p[0],p[1]];});
   if(r[0][0]!==r[r.length-1][0]||r[0][1]!==r[r.length-1][1])throw new Error('GeoJSON rings must be closed.');
   var area=0;for(var i=1;i<r.length;i++){
    if(r[i][0]===r[i-1][0]&&r[i][1]===r[i-1][1])throw new Error('Boundary contains a zero-length edge.');
    area+=(r[i-1][0]-r[0][0])*(r[i][1]-r[0][1])-(r[i][0]-r[0][0])*(r[i-1][1]-r[0][1]);
    for(var j=i+2;j<r.length;j++){if(i===1&&j===r.length-1)continue;if(touches(r[i-1],r[i],r[j-1],r[j]))throw new Error('Boundary self-intersects.');}
   }
   if(Math.abs(area)<1e-12)throw new Error('Boundary has no measurable area.');all=all.concat(r);return r;
  });
  for(var h=1;h<rings.length;h++){
   if(!E.pointInRing(rings[h][0],rings[0])||ringsTouch(rings[0],rings[h]))throw new Error('A parcel hole must lie strictly inside its outer ring.');
   for(var k=1;k<h;k++)if(ringsTouch(rings[h],rings[k])||E.pointInRing(rings[h][0],rings[k])||E.pointInRing(rings[k][0],rings[h]))throw new Error('Parcel holes overlap.');
  }
  return rings;
 });
 var bounds=box(all),center=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];
 if(bounds[2]-bounds[0]>.3||bounds[3]-bounds[1]>.3)throw new Error('Use a parcel or campus boundary no more than 0.3 degrees across.');
 var radius=input.radius_km===undefined?1:Number(input.radius_km);
 if(input.radius_km!==undefined&&typeof input.radius_km!=='number'&&typeof input.radius_km!=='string'||!isFinite(radius)||radius<.1||radius>5)throw new Error('Radius must be 0.1–5 km.');
 var pad=E.boxAround(center[1],center[0],radius),dx=pad[2]-center[0],dy=pad[3]-center[1];
 return {polygons:polygons,vertices:vertices,boundary:{type:g.type,coordinates:g.type==='Polygon'?polygons[0]:polygons},bbox:bounds,searchBox:[bounds[0]-dx,bounds[1]-dy,bounds[2]+dx,bounds[3]+dy],radius:radius};
}
function inPolygon(p,poly){return E.pointInRing(p,poly[0])&&!poly.slice(1).some(function(h){return E.pointInRing(p,h);});}
function lineDistance(line,polygons){
 var best=Infinity;
 polygons.forEach(function(poly){
  if(line.some(function(p){return inPolygon(p,poly);})){best=0;return;}
  poly.forEach(function(ring){for(var i=1;i<line.length;i++)for(var j=1;j<ring.length;j++){
   if(touches(line[i-1],line[i],ring[j-1],ring[j])){best=0;return;}
   best=Math.min(best,E.segmentToSegment(line[i-1],line[i],ring[j-1],ring[j]));
  }});
 });return best;
}
// Retain contiguous source vertices near the search box. Never connect
// separate parts or claim the display subset is an as-built route.
function displayParts(line,b){var out=[],run=[];for(var i=1;i<line.length;i++){
 if(hit(box([line[i-1],line[i]]),b)){if(!run.length)run.push(line[i-1]);run.push(line[i]);}
 else if(run.length){out.push(run);run=[];}
}if(run.length)out.push(run);return out;}
function inspect(input,dataset){
 var q=parse(input),data=dataset||E.combined(q.searchBox),routes=[],context=[],work=0;
 data.features.forEach(function(f){
  var p=f.properties||{},g=f.geometry;if(!g||['LineString','MultiLineString'].indexOf(g.type)<0)return;
  if(f.bbox&&!hit(f.bbox,q.searchBox))return;
  var lines=g.type==='LineString'?[g.coordinates]:g.coordinates,parts=[],distance=Infinity;
  lines.forEach(function(line){if(!hit(box(line),q.searchBox))return;
   work+=line.length*q.vertices*2;
   if(work>2000000){var error=new Error('Parcel inspection is too complex. Use a smaller radius or simplify the boundary; no partial result was returned.');error.status=422;throw error;}
   var d=lineDistance(line,q.polygons);if(d<=q.radius*1000){distance=Math.min(distance,d);parts=parts.concat(displayParts(line,q.searchBox));}});
  if(!isFinite(distance))return;
  var eligible=p.feature_kind==='fiber_route'&&p.proximity_eligible===true;
  var row={id:f.id,name:p.name||'Published route',operator:p.operator||'Not published',mapped_distance_m:Math.round(distance),intersects_boundary_or_interior:distance===0,
   relation:distance===0?'Published geometry intersects or lies within the supplied parcel':(distance<1?'Less than 1 m from the supplied parcel geometry':'Near the supplied parcel geometry'),
   proximity_eligible:eligible,geometry_quality:p.geometry_quality||'unknown',positional_accuracy_m:p.positional_accuracy_m==null?null:p.positional_accuracy_m,
   source_url:p.source_url,source_vintage:p.source_vintage||null,source_last_edited:p.source_last_edited||null,retrieved_at:p.retrieved_at,
   operational_status:p.operational_status,notes:p.notes||null,geometry:{type:'MultiLineString',coordinates:parts}};
  (eligible?routes:context).push(row);
 });
 [routes,context].forEach(function(a){a.sort(function(x,y){return x.mapped_distance_m-y.mapped_distance_m||String(x.id).localeCompare(String(y.id));});});
 var counts={mapped_routes:routes.length,planning_reference_or_unknown_medium:context.length},remaining=50000;
 function boundRows(rows){return rows.slice(0,25).map(function(row){var shown=[];row.display_geometry_truncated=false;row.geometry.coordinates.forEach(function(line){if(line.length<=remaining){shown.push(line);remaining-=line.length;}else row.display_geometry_truncated=true;});row.geometry.coordinates=shown;return row;});}
 return {schema_version:'fiber-parcel-v1',generated_at:new Date().toISOString(),boundary:q.boundary,radius_km:q.radius,
  measurement_method:'shortest_distance_to_supplied_polygon_including_holes_and_all_parts',geometry_extent:'Source segments near the parcel; full source paths may continue beyond the display.',
  counts:counts,results_truncated:routes.length>25||context.length>25,routes:boundRows(routes),context_routes:boundRows(context),
  inventory_built_at:data.usaBuiltAt||null,complete_national_inventory:false,site_has_fiber:null,site_serviceability:'unconfirmed',available_capacity_gbps:null,physical_route_diversity:'unconfirmed',
  limitations:['A mapped crossing is not a surveyed crossing, splice point, access right or service commitment.','Tax parcels and imported/drawn boundaries are not land surveys.','Distances measure published geometry, not a constructible lateral. Positional accuracy is generally unknown.','No mapped evidence does not mean no fiber. Multiple publisher records may describe the same infrastructure.','Planned, illustrative and unknown-medium lines are separate context, not qualifying route evidence.']};
}
module.exports={parse:parse,inspect:inspect,lineDistance:lineDistance,displayParts:displayParts};
