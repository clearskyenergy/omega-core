/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
// A versioned prioritization model, not engineering feasibility or a Tier rating.
// Missing public evidence is unknown, never a failed site or confirmed capacity.
var VERSION='dc-site-screen-v1.0';
var DEFS=[
 ['power_mapping','Mapped power proximity',20],['fiber_mapping','Mapped fiber proximity',20],
 ['network_market','Carrier interconnection market',10],['flood','Mapped flood exposure',10],
 ['power_capacity','Deliverable power and energization',15],['carrier_service','Parcel service and bandwidth',10],
 ['physical_diversity','Physically diverse routes',5],['cooling','Cooling and water feasibility',5],
 ['land','Land, zoning and environmental diligence',5]
];
function finite(v){return typeof v==='number'&&isFinite(v)&&v>=0;}
function curve(km,bands){if(!finite(km))return null;for(var i=0;i<bands.length;i++)if(km<=bands[i][0])return bands[i][1];return 5;}
function usable(s){return s&&(s.status==='ok'||s.status==='empty');}
function build(input){
 input=input||{};var pf=input.fiber||{},power=input.power||{},market=input.market||{},flood=input.flood||{};
 var attrs=DEFS.map(function(d){return {key:d[0],label:d[1],weight:d[2],score:null,status:'unknown',basis:'No qualifying evidence collected',sources:[]};});
 function set(key,score,basis,sources){var a=attrs.filter(function(x){return x.key===key;})[0];a.score=score;a.status=score==null?'unknown':'public_screening_signal';a.basis=basis;a.sources=sources||[];}
 var route=usable(pf)&&(pf.routes||[]).filter(function(r){return r.feature_kind==='fiber_route'&&finite(r.mapped_distance_m);}).sort(function(a,b){return a.mapped_distance_m-b.mapped_distance_m;})[0];
 set('fiber_mapping',route?curve(route.mapped_distance_m/1000,[[.25,100],[1,90],[2,75],[5,50],[10,25],[25,5]]):null,
  route?route.mapped_distance_m+' m to published route geometry; not a lateral design or service confirmation':pf.status==='failed'?'Fiber inventory lookup failed':'No qualifying mapped route in the searched partial inventory; actual fiber presence unknown',route?[route]:[]);
 var readings=[];['substations','transmission'].forEach(function(k){var s=power[k];if(usable(s)&&s.nearest&&finite(s.nearest.distance_km))readings.push(s.nearest);});
 set('power_mapping',readings.length?Math.round(readings.reduce(function(n,r){return n+curve(r.distance_km,[[.5,100],[2,85],[5,65],[10,35],[25,10]]);},0)/readings.length):null,
  readings.length?'Proximity to mapped electrical infrastructure only. Voltage does not establish spare MW, upgrade cost or delivery date.':'No qualifying nearby power measurement; capacity is unknown',readings);
 var facility=usable(market)&&market.nearest;
 set('network_market',facility?curve(facility.distance_km,[[5,100],[20,80],[50,55],[100,25]]):null,
  facility?'Distance to a PeeringDB facility reporting at least 10 networks; not a direct circuit, latency measurement or parcel service.':'Carrier interconnection market not established by the returned public records',facility?[facility]:[]);
 var zones=usable(flood)?flood.zones||[]:[],hazard=zones.some(function(z){return z.sfha==='T'||/^(A|AE|AO|AH|AR|A99|V|VE)$/.test(z.zone);});
 var unknownZone=zones.some(function(z){return !/^(A|AE|AO|AH|AR|A99|V|VE|X|B|C)$/.test(z.zone);});
 var floodScore=hazard?10:!zones.length||unknownZone?null:zones.some(function(z){return z.zone==='B'||/0\.2|500.YEAR|REDUCED.*FLOOD|LEVEE/i.test(z.subtype||'');})?60:90;
 set('flood',floodScore,zones.length?'FEMA mapped zone(s): '+zones.map(function(z){return z.zone+(z.subtype?' / '+z.subtype:'');}).join('; ')+'. Point screen only; evaluate the entire parcel, access roads and local drainage.':'No usable FEMA zone returned; not evidence of low flood risk',zones);
 var gates=[
  {key:'power_capacity',label:'Utility capacity / energization',status:'unconfirmed',needed:'Utility study or service agreement for required MW, redundancy, upgrades, cost and energization date.'},
  {key:'carrier_service',label:'Fiber service / bandwidth',status:'unconfirmed',needed:'Carrier confirmation for exact parcel, demarcation, committed bandwidth, spare capacity, SLA, cost and delivery date.'},
  {key:'physical_diversity',label:'Route resilience',status:'unconfirmed',needed:'Carrier route drawings and shared-risk review for separate conduits, entrances, bridges and upstream facilities. Two names or map lines do not prove diversity.'},
  {key:'cooling',label:'Cooling and water',status:'unconfirmed',needed:'Cooling design, climate basis, water/wastewater capacity and rights where applicable. Nearby surface water is not a supply entitlement.'},
  {key:'land',label:'Land / permitting / environment',status:'unconfirmed',needed:'Usable acreage, site control, zoning, environmental review, wetlands, geotechnical conditions, setbacks and permits.'},
  {key:'hazards',label:'Flood and other hazards',status:hazard?'mapped_risk':'unconfirmed',needed:'Parcel-wide flood/drainage review, seismic, wildfire, wind and access risks. A point result is not parcel clearance.'},
  {key:'latency',label:'Latency and customer destinations',status:'unconfirmed',needed:'Measured or engineered end-to-end paths to required customer/cloud/IX destinations; no latency inferred from a map.'},
  {key:'delivery',label:'Cost and schedule',status:'unconfirmed',needed:'Utility/carrier quotes, construction schedule, equipment lead times, tariffs and permitting milestones.'}
 ];
 gates.forEach(function(g){var a=attrs.filter(function(x){return x.key===g.key;})[0];if(a&&a.score==null)a.basis=g.needed;});
 var measured=attrs.filter(function(a){return a.score!=null;}),weight=measured.reduce(function(n,a){return n+a.weight;},0);
 var score=weight?Math.round(measured.reduce(function(n,a){return n+a.score*a.weight;},0)/weight):null;
 return {model:VERSION,generated_at:new Date().toISOString(),profile:(input.request||{}).profile||'general',
  request:input.request||{},score:score,score_label:'Preliminary mapped-signal score',measured_weight_pct:weight,
  unmeasured_weight_pct:100-weight,readiness_score:null,ready_for_development:null,
  verdict:score==null?'Insufficient measured evidence':'Preliminary signals only — critical requirements unresolved',
  attributes:attrs,requirements:gates,
  sources:{fiber:pf.status||'not_checked',substations:(power.substations||{}).status||'not_checked',transmission:(power.transmission||{}).status||'not_checked',peeringdb:market.status||'not_checked',fema:flood.status||'not_checked'},
  fiber_evidence:{nearest:route||null,counts:pf.counts_in_radius||null,measurement:pf.measurement_method||'great_circle_distance_to_published_geometry',datasets:pf.datasets||null,results_truncated:!!pf.results_truncated},
  limitations:['Internal screening weights, not an industry certification or calibrated prediction of project success.',
   'The score averages measured attributes only. Always compare evidence coverage and the same model version alongside scores.',
   'Mapped power/fiber proximity, provider labels and facility counts do not establish utility capacity, serviceability or physical diversity.',
   'Planned/inactive routes, unknown-medium lines, road-routed corridors and publisher images do not earn fiber-proximity points.',
   'Source retrieval time is not the observation date. Public geometry may be old, generalized, duplicated across publishers or incomplete.',
   'No saved site, Firestore record or utility/carrier confirmation is created by this screen.']};
}
module.exports={build:build,version:VERSION};
