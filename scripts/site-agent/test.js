/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert'),planner=require('../../api/_lib/site-agent-planner'),fixture=require('./example-site.json');
const clone=x=>JSON.parse(JSON.stringify(x));
const s=clone(fixture),start=Date.now(),result=planner.plan(s);
assert.equal(result.status,'concept_ready');
assert(planner.fits(result.layout.battery.rect,s.parcel,s.constraints.parcelSetbackFt));
assert(!planner.overlap(result.layout.battery.rect,s.building));
assert.equal(result.layout.switchgear.x+result.layout.switchgear.w,s.building.x,'gear touches confirmed west wall');
assert.equal(result.layout.switchgear.y+result.layout.switchgear.h/2,s.building.y+s.service.offsetFt);
const path=result.layout.route;
for(let i=1;i<path.length;i++){
 assert(path[i].x===path[i-1].x||path[i].y===path[i-1].y,'route remains orthogonal');
 for(const r of [s.building,...s.obstacles])assert(!planner.blockedSegment(path[i-1],path[i],r),'route cannot cross building or no-dig area');
}
const unknown=clone(s);unknown.service.confirmed=false;assert.equal(planner.plan(unknown).status,'needs_input');
const unset=clone(s);delete unset.constraints;assert.equal(planner.plan(unset).status,'needs_input');
const noEntry=clone(s);delete noEntry.battery.connectionSide;assert.equal(planner.plan(noEntry).status,'needs_input');
const obstructed=clone(s);obstructed.obstacles.push({x:55,y:70,w:15,h:30});assert.equal(planner.plan(obstructed).status,'blocked');
const outside=clone(s);outside.building.x=200;assert.throws(()=>planner.plan(outside));
const malformed=clone(s);malformed.parcel=[{x:0,y:0},{x:120,y:120},{x:0,y:120},{x:120,y:0}];assert.throws(()=>planner.plan(malformed));
const area=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
const wall=[{x:45,y:0,w:10,h:100}];
assert.equal(planner.route({x:20,y:50},{x:80,y:50},area,wall,10,1),null,'no route through a full barrier');
const detour=planner.route({x:20,y:50},{x:80,y:50},area,[{x:45,y:20,w:10,h:50}],10,1);assert(detour&&detour.length>2);
const {respond}=require('./server');
(async()=>{
 assert.equal((await respond({id:1,method:'initialize'})).result.serverInfo.name,'omega');
 assert.equal((await respond({id:2,method:'tools/list'})).result.tools.length,8);
 assert.equal(await respond({method:'notifications/initialized'}),null);
 assert.equal((await respond({id:3,method:'tools/call',params:{name:'arbitrary_js'}})).result.isError,true);
 console.log('PASS: placement, service wall, clearances, route barriers, missing evidence, polygon refusal and MCP protocol ('+(Date.now()-start)+' ms).');
})().catch(e=>{console.error(e);process.exitCode=1;});
