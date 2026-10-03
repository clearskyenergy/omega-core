/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert'),path=require('path'),cp=require('child_process');
const root=path.join(__dirname,'../..'),tools=require('../../omega-tools'),hub=require('../../omega-workspace-hub'),modules=require('../../api/_lib/modules');
const sales=hub.AREAS.find(a=>a.key==='sales'),subject=sales.subjects.find(s=>s.key==='screening');
assert.deepEqual(subject.tools,['parcelscreening','bessscreening']);
const rows=hub.items('sales',{tool:k=>tools.byKey(k),canOpen:()=>true});
assert.equal(rows.filter(r=>r.subject&&r.href==='/screening.html').length,1);
assert(!rows.some(r=>subject.tools.includes(r.key)),'subject tools should not duplicate the Sales rows');
assert(modules.get('siteintel').tools.includes('parcelscreening'));
assert(modules.get('storage').tools.includes('bessscreening'));
assert.equal(tools.byKey('parcelscreening').file,'/screening.html?tool=parcel');
assert.equal(tools.byKey('bessscreening').file,'/screening.html?tool=bess');
for(const file of ['test-portfolio-screening.js','test-screening-lookups.js']){
 const run=cp.spawnSync(process.execPath,[path.join(root,'scripts',file)],{cwd:root,stdio:'inherit'});
 assert.equal(run.status,0,file);
}
console.log('Sales Screening navigation, ownership, engine and access checks passed.');
