/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const SOURCES=[['omega_orgs',['name','status']],['projects',['orgId','orgsInvolved']],['team_members',['orgId']],['omega_users',['orgId']],['members',['status'],true]];
const norm=v=>{const x=String(v||'').trim().toLowerCase();return {'fenecon.de':'fenecon.com','fenecon.us':'fenecon.com'}[x]||x;};
async function collect(read){
 const data={},health=[];
 await Promise.all(SOURCES.map(async([name,fields,group])=>{try{const x=await read(name,fields,1000,!!group);if(!Array.isArray(x.rows)||!Number.isSafeInteger(x.total))throw Error('invalid source');data[name]=x.rows;health.push({source:name,total:x.total,scanned:x.rows.length,status:x.rows.length===x.total?'complete':'partial'});}catch(e){health.push({source:name,total:null,scanned:0,status:'unavailable'});}}));
 const complete=n=>health.some(h=>h.source===n&&h.status==='complete');
 const orgs=(data.omega_orgs||[]).map(o=>({id:o.id,name:o.name||o.id,status:o.status||'not recorded',projects:[],sharedProjects:[],teamRecords:[],partnerUserRecords:[],memberships:[]}));
 const lookup=new Map(orgs.map(o=>[norm(o.id),o]));const unresolved={projects:[],teamRecords:[],partnerUserRecords:[],memberships:[]};
 function join(rows,key,getOrg){for(const r of rows||[]){const o=lookup.get(norm(getOrg(r)));(o?o[key]:unresolved[key]).push(r.path||r.id);}}
 join(data.projects,'projects',r=>r.orgId);
 for(const p of data.projects||[])for(const id of new Set((Array.isArray(p.orgsInvolved)?p.orgsInvolved:[]).map(norm))){const o=lookup.get(id);if(o&&id!==norm(p.orgId))o.sharedProjects.push(p.id);}
 join(data.team_members,'teamRecords',r=>r.orgId||(r.id.includes('__')?r.id.split('__')[0]:''));
 join(data.omega_users,'partnerUserRecords',r=>r.orgId);
 // Only direct workspace memberships; other collections called members are not platform users.
 join((data.members||[]).filter(r=>/^omega_orgs\/[^/]+\/members\/[^/]+$/.test(r.path||'')),'memberships',r=>r.path.split('/')[1]);
 const missing=(data.projects||[]).filter(p=>!norm(p.orgId)).length;
 return {asOf:new Date().toISOString(),status:health.every(h=>h.status==='complete')?'complete':'partial',sources:health,tenants:orgs.sort((a,b)=>b.projects.length-a.projects.length||a.id.localeCompare(b.id)),unresolved,projectLinks:{scanned:(data.projects||[]).length,missingOrgId:missing,unresolvedOrg:complete('omega_orgs')?(data.projects||[]).filter(p=>norm(p.orgId)&&!lookup.has(norm(p.orgId))).length:null},scope:'Registered tenant workspaces, their recorded user memberships and owned/shared projects. User stores overlap; these are records, not unique people or paying customers. Firebase Authentication users are not inventoried. Lists are limited to 1,000 records per source; partial reads are labeled.',complete:Object.fromEntries(SOURCES.map(([n])=>[n,complete(n)]))};
}
async function fromDb(db){return collect(async(name,fields,limit,group)=>{const q=group?db.collectionGroup(name):db.collection(name);const [s,c]=await Promise.all([q.select(...fields).limit(limit).get(),q.count().get()]);return {rows:s.docs.map(d=>({...d.data(),id:d.id,path:d.ref.path})),total:c.data().count};});}
module.exports={collect,fromDb};
