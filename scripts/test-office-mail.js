/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert=require('node:assert/strict'), FD=require('./_lib/firestore-double');
FD.mock('../api/_lib/admin',{httpError:function(s,m){var e=new Error(m);e.status=s;return e;}});
var M=require('../api/_lib/office-mail'),db=new FD.DB(), calls=[];
var staff={staff:true,by:'tom@clearsky-usa.com'},bot={agent:true,by:'agent:sales'};
global.fetch=async function(url,opts){calls.push({url:url,method:opts.method,body:JSON.parse(opts.body||'{}')});return {ok:true,json:async function(){return url.endsWith('/drafts')?{draft_id:'draft-1'}:{inbox_id:'inbox-1',email:'bdm@agentmail.to'};}};};
async function main(){
  delete process.env.AGENTMAIL_API_KEY;
  assert.throws(function(){M.request('/inboxes','POST',{});},/not connected/);
  assert.throws(function(){M.provision(db,bot,{id:'bdm'});},/Only staff/);
  process.env.AGENTMAIL_API_KEY='test-only';
  db.seed('sales_config/office_agent_bdm',{id:'bdm',name:'Alex',desk:'sales',enabled:true,cc:['mike@clearsky-usa.com','tom@clearsky-usa.com']});
  await M.provision(db,staff,{id:'bdm'});await M.provision(db,staff,{id:'bdm'});assert.equal(calls.length,1);
  assert.equal(calls[0].body.client_id,'clearsky-office-bdm');
  db.seed('sales_prospects/acme.example',{contacts:[{email:'jane@acme.example'}],inbound:true});
  db.seed('sales_config/office_task_t1',{id:'t1',agentId:'bdm',desk:'sales',prospectId:'acme.example',kind:'email-draft',status:'running',claim:'claim-1',claimedBy:bot.by});
  var b={id:'t1',claim:'claim-1',operation:'draft',to:'jane@acme.example',subject:'Joliet',text:'Hello Jane'};
  await assert.rejects(M.activity(db,bot,Object.assign({},b,{claim:'wrong'})),/claim/);
  await assert.rejects(M.activity(db,bot,Object.assign({},b,{to:'other@acme.example'})),/CRM account/);
  var draft=await M.activity(db,bot,b);assert.equal(draft.sent,false);assert.equal(calls.length,2);
  assert.deepEqual(calls[1].body.cc,['mike@clearsky-usa.com','tom@clearsky-usa.com']);
  assert.match(calls[1].body.text,/AI assistant/);assert.equal(calls[1].body.send_at,undefined);
  await M.activity(db,bot,b);assert.equal(calls.length,2);
  assert.equal(db.data.get('sales_activity/office_draft_t1').ref,'draft-1');
  db.seed('sales_config/office_agent_existing',{id:'existing',name:'BDM',desk:'sales'});
  await M.provision(db,staff,{id:'existing',inboxId:'clearsky-bdm@agentmail.to'});
  assert.equal(calls[calls.length-1].method,'GET');
  assert.match(calls[calls.length-1].url,/clearsky-bdm%40agentmail.to$/);
  assert.equal(db.data.get('sales_config/office_agent_existing').mailbox.inboxId,'inbox-1');
  db.seed('sales_config/office_agent_invalid',{id:'invalid'});
  await assert.rejects(M.provision(db,staff,{id:'invalid',inboxId:'../../keys'}),/Invalid inbox/);
  delete process.env.AGENTMAIL_API_KEY;
  console.log('AgentMail: missing credentials, staff-only provisioning, stable inbox ID, claim checks, CRM recipient binding, enforced CCs, draft reuse and audit logging passed.');
}
main().catch(function(e){console.error(e);process.exit(1);});
