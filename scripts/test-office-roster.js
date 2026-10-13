/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double');
FD.mock('../api/_lib/admin', { httpError: function (s,m) { var e=new Error(m);e.status=s;return e; } });
var O=require('../api/_lib/office-roster');
var db=new FD.DB();db.serial=true;
var staff={staff:true,by:'tom@clearsky-usa.com'}, bot={agent:true,by:'agent:sales'}, now=Date.parse('2026-10-09T19:00:00Z');
async function main(){
  var p={id:'bdm',name:'BDM',desk:'sales',enabled:true,cc:['mike@clearsky-usa.com','tom@clearsky-usa.com']};
  assert.throws(function(){O.save(db,bot,p,now);},/Only staff/);
  await assert.rejects(O.save(db,staff,Object.assign({},p,{sender:'x@gmail.com'}),now),/mailbox/);
  await O.save(db,staff,p,now);db.seed('sales_prospects/acme.example',{id:'acme.example'});
  var t={id:'work-1',agentId:'bdm',prospectId:'acme.example',kind:'research',title:'Research Acme',due:'2026-10-09'};
  await O.addTask(db,staff,t,now);assert.equal((await O.addTask(db,staff,t,now)).duplicate,true);
  var results=await Promise.allSettled([O.transition(db,bot,{id:t.id,operation:'claim'},now),O.transition(db,bot,{id:t.id,operation:'claim'},now)]);
  assert.equal(results.filter(function(r){return r.status==='fulfilled';}).length,1);
  var claim=results.find(function(r){return r.status==='fulfilled';}).value.task.claim;
  await assert.rejects(O.transition(db,bot,{id:t.id,operation:'finish',claim:'bad',status:'completed',outcome:'ok',evidence:'record'},now),/claim/);
  await assert.rejects(O.transition(db,bot,{id:t.id,operation:'finish',claim:claim,status:'completed',outcome:'ok'},now),/evidence/);
  await O.transition(db,bot,{id:t.id,operation:'finish',claim:claim,status:'completed',outcome:'Researched',evidence:'CRM: acme.example'},now);
  await assert.rejects(O.transition(db,bot,{id:t.id,operation:'claim'},now),/available/);
  var call=await O.addTask(db,staff,Object.assign({},t,{id:'call-1',kind:'call'}),now);assert.equal(call.task.status,'blocked');
  await assert.rejects(O.transition(db,bot,{id:'call-1',operation:'record',outcome:'Called'},now),/Only staff/);
  await O.transition(db,staff,{id:'call-1',operation:'record',outcome:'Thomas called; requested proposal'},now);
  await O.addTask(db,staff,Object.assign({},t,{id:'future',due:'2026-10-10'}),now);
  await assert.rejects(O.transition(db,bot,{id:'future',operation:'claim'},now),/not due/);
  var book=await O.list(db);assert.equal(book.agents.length,1);assert.equal(book.tasks.length,3);
  assert.equal(db.data.get('sales_activity/office_work-1_finish').prospectId,'acme.example');
  console.log('Office: staff permissions, duplicate creation, exclusive claims, evidence, no replay, blocked calls, CRM logging and due dates passed.');
}
main().catch(function(e){console.error(e);process.exit(1);});
