/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert');
require('../../omega-editor-v2-geom');const D=require('../../omega-editor-v2-doc');require('../../omega-editor-v2-bridge');
const rows={}, writes=[];let org='example.com', denied=false;
const user={uid:'u1',email:'designer@example.com',getIdToken:()=>Promise.resolve('test-token'),getIdTokenResult:()=>Promise.resolve({claims:{orgId:org}})};
function clone(v){return JSON.parse(JSON.stringify(v));}
function ref(path){return {id:path.split('/').pop(),get:async()=>{
 const d=rows[path];if(d&&d.orgId&&d.orgId!==org)throw new Error('permission-denied');return {exists:!!d,id:path.split('/').pop(),data:()=>clone(d)};
},update:async patch=>{if(denied)throw new Error('permission-denied');if(!rows[path])throw new Error('missing');Object.assign(rows[path],clone(patch));},path:path};}
const db={collection:c=>({doc:id=>ref(c+'/'+id),where:()=>({get:async()=>({forEach:fn=>Object.keys(rows).filter(k=>k.startsWith(c+'/')&&rows[k].orgId===org).forEach(k=>fn({id:k.split('/')[1],data:()=>clone(rows[k])}))})})}),
 runTransaction:async fn=>{const pending=[];const result=await fn({get:r=>r.get(),update:(r,d)=>pending.push([r.path,d])});if(denied)throw new Error('permission-denied');pending.forEach(([p,d])=>{rows[p]=Object.assign(rows[p]||{},clone(d));});return result;}};
function firestore(){return db;}firestore.FieldValue={arrayUnion:v=>[v]};
global.firebase={auth:()=>({currentUser:user}),firestore:firestore};
global.location={origin:'https://trial.example.com'};
global.OmegaEditorV2Auth={whenReady:()=>Promise.resolve(user),signIn:()=>Promise.resolve(user),projectId:()=> 'test-project',idToken:()=>user.getIdToken()};
function decode(v){if('nullValue'in v)return null;if(v.mapValue)return fields(v.mapValue.fields);if(v.arrayValue)return (v.arrayValue.values||[]).map(decode);return v.stringValue!==undefined?v.stringValue:v.doubleValue!==undefined?v.doubleValue:v.booleanValue;}
function fields(f){return Object.fromEntries(Object.entries(f).map(([k,v])=>[k,decode(v)]));}
global.fetch=async(url,o)=>{assert(o.headers.Authorization==='Bearer test-token');const w=JSON.parse(o.body).writes[0], p=w.update.name.split('/documents/')[1];writes.push(w);
 if(denied)return {ok:false,status:403};if(rows[p])return {ok:false,status:409};assert.strictEqual(w.currentDocument.exists,false);rows[p]=fields(w.update.fields);return {ok:true,status:200};};
require('../../omega-editor-v2-workspace');const W=global.OmegaEditorV2Workspace;
(async()=>{
 let doc=D.create({projectId:'p_test',name:'Battery site',address:'100 Main St',entities:[{id:'b',type:'equip',key:'bess',x:0,y:0,w:20,h:8,kw:100,kwh:200}]});
 let r=await W.save(doc);assert.strictEqual(r.orgId,org);assert.strictEqual(rows['projects/p_test'].editor,'v2');assert.strictEqual(writes.length,1);
 Object.assign(doc,{remoteProjectId:r.id,orgId:r.orgId,workspaceRevision:r.revision});
 rows['projects/p_test'].stage='contracted';rows['projects/p_test'].orgsInvolved=['partner.com'];
 r=await W.save(doc);assert.strictEqual(rows['projects/p_test'].stage,'contracted');assert.deepStrictEqual(rows['projects/p_test'].orgsInvolved,['partner.com']);
 await assert.rejects(W.save(doc),/newer version/);doc.workspaceRevision=r.revision;
 const opened=await W.open('p_test');const restored=global.OmegaEditorV2Bridge.fromRecord(opened);assert.strictEqual(restored.workspaceRevision,r.revision);assert.strictEqual(restored.entities[0].kwh,200);
 rows['projects/classic']={editor:'classic',orgId:org};await assert.rejects(W.save(Object.assign({},doc,{remoteProjectId:'classic'})),/another drawing/);
 assert.strictEqual(rows['projects/classic'].editor,'classic');
 denied=true;await assert.rejects(W.save(doc),/permission-denied/);denied=false;
 org='foreign.com';await assert.rejects(W.open('p_test'),/permission-denied/);org='example.com';
 rows['fin_profiles/u1']={org:'Example',orgKey:'example'};
 const mid=await W.marketplace(doc);assert.strictEqual(rows['fin_projects/'+mid].sourceProjectId,'p_test');
 rows['fin_projects/'+mid].status='awarded';rows['fin_projects/'+mid].offers=5;doc.name='Revised site';
 assert.strictEqual(await W.marketplace(doc),mid);assert.strictEqual(rows['fin_projects/'+mid].status,'awarded');assert.strictEqual(rows['fin_projects/'+mid].offers,5);
 await W.feedback(doc,'The plan is easier to use.');assert.strictEqual(rows['projects/p_test'].sitePlanFeedback[0].by,'u1');
 assert(W.href(doc,'prime').includes('project=p_test')&&W.href(doc,'prime').includes('editor=v2'));assert(W.href(doc,'logic').includes('org=example.com'));
 assert.strictEqual((await W.list()).length,1);
 console.log('workspace: create, reopen, stale save, old-editor protection, tenant denial, marketplace retry, feedback and handoffs passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
