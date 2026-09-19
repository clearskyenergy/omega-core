/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var fs=require('fs'),path=require('path'),root=path.join(__dirname,'../data/usa-fiber/');
var m=JSON.parse(fs.readFileSync(root+'manifest.json')),r=JSON.parse(fs.readFileSync(root+'research-sources.json')),parcels=JSON.parse(fs.readFileSync(root+'parcel-sources.json'));
r.references=r.references.filter(function(x){return x.researchBatch!=='20260919-parcel';});
m.states.forEach(function(state){
 m.sources.filter(function(s){return s.importBatch==='20260919-parcel'&&state.sources.indexOf(s.id)>=0;}).forEach(function(s){
  r.references.push({state:state.code,title:s.name,url:s.pageUrl,kind:s.proximityEligible===false?'Imported illustrative reference; scoring excluded':s.category==='planned'?'Imported plans; not confirmed built':'Imported public route geometry',note:s.networkType+' '+s.routeStatus+'. Original line paths retained; positional accuracy and parcel service remain unverified.',checkedAt:'2026-09-19',researchBatch:'20260919-parcel'});
 });
 parcels.sources.filter(function(p){return p.state===state.code;}).forEach(function(p){r.references.push({state:state.code,title:p.name+' parcel boundary overlay',url:p.url,kind:'Live public parcel geometry',note:'Viewport-limited parcel IDs and Polygon/MultiPolygon geometry only. County coverage, not statewide. Tax boundaries are not surveys. Select a parcel against the detailed fiber layer; service remains unconfirmed.',checkedAt:parcels.verifiedAt,researchBatch:'20260919-parcel'});});
});
r.references.push({state:'TX',title:'Third-party purchased GeoTel layer excluded',url:'https://maps.pape-dawson.com/server1/rest/services/LandDevelopment/LANDDEVELOPMENT__Hines_SiteSelection/MapServer/layers',kind:'Not imported — commercial dataset',note:'Search found a layer explicitly described as purchased GeoTel 2021 data. No licensed third-party geometry was copied from it.',checkedAt:'2026-09-19',researchBatch:'20260919-parcel'});
r.scope='Continuing public-source discovery, including Google and original publishers. Added Uniti dark/developing layers and municipal records, plus parcel inspection. All states remain partial; no survey-verified nationwide cable system is claimed. Public county parcel coverage is currently limited to Dallas TX, Fulton GA, and Cook/DuPage/Lake IL; draw/import supports all states. Publicly visible purchased third-party datasets are not imported.';
fs.writeFileSync(root+'research-sources.json',JSON.stringify(r,null,2)+'\n');
console.log('Updated state-by-state research with '+r.references.filter(function(x){return x.researchBatch==='20260919-parcel';}).length+' new source/parcel references.');
