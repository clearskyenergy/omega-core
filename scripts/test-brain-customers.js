'use strict';
const assert=require('assert/strict'),C=require('../api/_lib/brain-customers');
(async()=>{
 const rows={omega_orgs:[{id:'fenecon.com',name:'Tenant A'}],projects:[{id:'p1',orgId:'fenecon.de',orgsInvolved:['fenecon.com','fenecon.de']},{id:'p2'},{id:'p3',orgId:'unknown',orgsInvolved:['fenecon.com']}],team_members:[{id:'fenecon.com__a@example.com'}],omega_users:[{id:'u1',orgId:'fenecon.com'}],members:[{id:'u1',path:'omega_orgs/fenecon.com/members/u1'},{id:'other',path:'something/x/members/other'}]};
 const read=async n=>({rows:rows[n],total:rows[n].length});const p=await C.collect(read);
 assert.equal(p.status,'complete');assert.deepEqual(p.tenants[0].projects,['p1']);assert.deepEqual(p.tenants[0].sharedProjects,['p3']);assert.equal(p.tenants[0].memberships.length,1);assert.equal(p.tenants[0].teamRecords.length,1);assert.equal(p.projectLinks.missingOrgId,1);assert.equal(p.projectLinks.unresolvedOrg,1);
 const partial=await C.collect(async n=>n==='omega_orgs'?{rows:[],total:10}:read(n));assert.equal(partial.projectLinks.unresolvedOrg,null);assert.equal(partial.status,'partial');
 const failed=await C.collect(async n=>{if(n==='members')throw Error('denied');return read(n);});assert.equal(failed.complete.members,false);assert.equal(failed.sources.find(x=>x.source==='members').total,null);
 const I=require('../api/_lib/brain-inventory');const inventory=I.summarize([{id:'omega_orgs',count:26},{id:'team_members',count:60},{id:'omega_users',count:7},{id:'nested:members',count:37},{id:'projects',count:288}]);assert.equal(inventory.groups.find(x=>x.id==='customers').count,130);assert.equal(inventory.total,418);
 console.log('PASS: tenant/project joins, alias handling, shared ownership deduplication, membership scope, partial/failed reads and customer classification.');
})().catch(e=>{console.error(e);process.exitCode=1;});
