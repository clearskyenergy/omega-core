#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),https=require('https'),cp=require('child_process'),E=require('../api/_lib/brain-evidence');
const BASE='/v1/projects/clearsky-portal/databases/(default)/documents';
function token(){let last;for(const bin of ['gcloud',path.join(os.homedir(),'google-cloud-sdk/bin/gcloud'),'/opt/homebrew/bin/gcloud']){try{return cp.execFileSync(bin,['auth','print-access-token','--account=jarvis-reader@clearsky-portal.iam.gserviceaccount.com'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim();}catch(e){last=e;}}throw Error('Read-only jarvis-reader authentication unavailable; no personal-account fallback.');}
function post(suffix,body,t){return new Promise((resolve,reject)=>{const payload=JSON.stringify(body),req=https.request({hostname:'firestore.googleapis.com',path:BASE+suffix,method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>{try{if(res.statusCode!==200)throw Error('Firestore read HTTP '+res.statusCode);resolve(JSON.parse(b));}catch(e){reject(e);}});});req.setTimeout(20000,()=>req.destroy(Error('Firestore read timeout')));req.on('error',reject);req.end(payload);});}
function unpack(v){if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('timestampValue'in v)return v.timestampValue;if('booleanValue'in v)return v.booleanValue;if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,unpack(x)]));if('arrayValue'in v)return(v.arrayValue.values||[]).map(unpack);return null;}
async function main(){const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--desk'))throw Error('Usage: brain-evidence-cli.js [--desk software|admin|...]');
 const desk=args[1];if(desk)E.forDesk({findings:[]},desk);const t=token();
 const packet=await E.collect(async(name,fields,limit)=>{const q={from:[{collectionId:name}]};const [r,n]=await Promise.all([post(':runQuery',{structuredQuery:{...q,select:{fields:fields.map(fieldPath=>({fieldPath}))},limit}},t),post(':runAggregationQuery',{structuredAggregationQuery:{structuredQuery:q,aggregations:[{count:{},alias:'total'}]}},t)]);return {rows:r.filter(x=>x.document).map(x=>({id:x.document.name.split('/').pop(),...Object.fromEntries(Object.entries(x.document.fields||{}).map(([k,v])=>[k,unpack(v)]))})),total:Number(n[0].result.aggregateFields.total.integerValue)};});
 console.log(JSON.stringify(desk?E.forDesk(packet,desk):packet));
}
main().catch(e=>{console.error('brain-evidence: '+e.message);process.exitCode=1;});
