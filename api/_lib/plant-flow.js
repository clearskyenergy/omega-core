/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./admin'),P=require('./plant'),R=require('./plant-release');
function clean(v,n){return String(v||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n||160);}
function normalize(raw){
  raw=raw||{};var routing=R.routingOf(raw.routing||P.DEFAULT_ROUTING);
  // The present battery evidence pipeline requires these gates. Custom
  // operations may be inserted, but not used to waive machine evidence.
  var keys=routing.map(function(s){return s.key;});
  if(keys.indexOf('eol')<0||keys.indexOf('qa')<=keys.indexOf('eol')||keys.indexOf('pack')<=keys.indexOf('qa')||keys[keys.length-1]!=='ready')throw A.httpError(400,'Keep EOL → QA → Pack → Ready in that order, with Ready last.');
  routing.forEach(function(s,i){var source=(raw.routing||[])[i]||{};s.instructions=clean(source.instructions,2000);s.parameters=clean(source.parameters,1000);
    /* Check-only steps the operator confirms at this operation (a torque
       check, a firmware load): one per line. Steps that CONSUME parts come
       off each product's bill of materials instead (api/_lib/plant-work.js). */
    var checks=Array.isArray(source.checks)?source.checks:String(source.checks||'').split(/\r?\n/);
    s.checks=checks.map(function(c){return clean(c,80);}).filter(Boolean).slice(0,24);});
  var seen={},lines=(raw.lines||[{id:'main',name:'Main line'}]);
  if(!Array.isArray(lines)||!lines.length||lines.length>30)throw A.httpError(400,'Configure 1–30 lines');
  lines=lines.map(function(l){var id=clean(l.id,40),name=clean(l.name,100);if(!/^[a-z][a-z0-9_-]*$/.test(id)||seen[id]||!name)throw A.httpError(400,'Each line needs a unique safe ID and a name');seen[id]=true;return {id:id,name:name,location:clean(l.location,160)};});
  return {routing:routing,lines:lines};
}
function current(config){var raw=config&&config.production||{},out=normalize(raw);out.version=Number(raw.version)||0;return out;}
function stationView(s,id){return {id:id,station:s.station,roaming:s.roaming===true,label:s.label||s.station,lineId:s.lineId||'',location:s.location||'',instructions:s.instructions||'',active:s.active!==false,machine:!!s.machine,lastSeenAt:s.lastSeenAt||null,lastSerial:s.lastSerial||null,revision:Number(s.revision)||0};}
module.exports={normalize:normalize,current:current,clean:clean,stationView:stationView};
