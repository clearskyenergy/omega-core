/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
// Counts are physical documents, never unique customers or valued assets.
// Nested collection names declared in firestore.rules. Group counts subtract root
// documents of the same name, so a project is never counted twice.
var NESTED = ['fin_views','offers','inquiries','unlocks','catalog','quote','invoice','messages','private','recipients','events','custody_events','billing','history','invoices','operations','members','layouts','customers','users','projects','contacts','activity','files','customer_index','notifications','storefront'];
var GROUPS = [
  ['customers','Tenants & user records', /^(omega_orgs|omega_users|org_members|team_members|tenant_public)$|^nested:(members|customers|users|customer_index)$/,'clients','Connect tenant workspaces, user memberships and customer records to their projects. Counts are records, not unique customers.'],
  ['knowledge','Mail, meetings & decisions', /^(twin_sources|twin_meetings|twin_people|twin_memory|twin_chat|twin_backlog|twin_drafts)$/,'command','Recover decisions and follow through on commitments.'],
  ['projects','Projects, sites & infrastructure', /^(projects|sites|intake_|circuitCapacity|capacityAllocations|slc_|fc_|parcel_)/,'clients','Reuse site diligence and compare engineering assumptions.'],
  ['commercial','Sales & finance', /^(sales_(prospects|activity|candidates)|omega_contracts|omega_partner_orgs|deals|referrals|fin_(projects|profiles|orgs)|mkt_|vdc_|subscription_proposals|pricebook|distributors)/,'sales','Prioritize opportunities and shorten proposal preparation.'],
  ['operations','Delivery & operations', /^(plant_|orders|om_|fs_|sla_|rpt_|team_(convo|messages|todos))/,'logic','Trace delivery, equipment and service outcomes.'],
  ['telemetry','Automation & usage logs', /^(twin_runs|twin_events|omega_audit)$/,'platform','Diagnose failures and learn which workflows are used.'],
  ['nested','Nested business records', /^nested:/,'clients','Bring billing, customer history and project detail into the inventory.'],
  ['system','Configuration & other records', /.*/,'platform','Review classification; configuration is not a customer dataset.']
];
function classify(id){return GROUPS.find(function(g){return g[2].test(id);});}
function summarize(rows, startedAt){
  var groups=GROUPS.map(function(g){return {id:g[0],label:g[1],view:g[3],use:g[4],count:0,collections:0,failed:0};});
  var total=0, failed=0;
  rows.forEach(function(r){var g=groups.find(function(g){return g.id===classify(r.id)[0];});r.group=g.id;g.collections++;if(r.count===null){failed++;g.failed++;}else{total+=r.count;g.count+=r.count;}});
  return {ok:true,asOf:new Date().toISOString(),startedAt:startedAt,scope:'Firestore documents across root collections and known nested collection groups; not unique entities. Files and external accounts are excluded. Counts are measured over an interval, not an atomic snapshot.',total:total,failed:failed,collections:rows.sort(function(a,b){return (b.count||0)-(a.count||0)||a.id.localeCompare(b.id);}),groups:groups,
    gaps:[
      'Known nested collections are counted separately without root overlap. Undeclared nested collection names may remain outside coverage.',
      'Drive, Gmail outside the ingested subset, attachments and Cloud Storage: not inventoried.',
      'Local vault, phone and meeting graph: separate Mac sources; not included in this cloud count.',
      'Unique entities, completeness, duplicates, freshness and reuse rights: not yet audited.',
      'Database storage bytes: not measured. Document count is not storage size.'
    ],
    value:{status:'Illustrative annual capacity value; not a sale price or measured savings.',formula:'Hours saved per week × loaded hourly cost × 48 working weeks. Subtract implementation and running costs; saved time becomes cash only if redeployed or expense is reduced.',scenarios:[5,10,20].map(function(h){return {hours:h,rate:100,weeks:48,annual:h*100*48};}),next:'Measure time saved on site screening, proposals and follow-ups. Link each project to outcomes and realized margin before estimating revenue uplift. No resale valuation until ownership, permitted reuse and buyer demand are established.',source:'https://www.oecd.org/en/publications/measuring-the-economic-value-of-data_f46b3691-en.html'}
  };
}
async function collect(db){
  var startedAt=new Date().toISOString(), refs=await db.listCollections(), rows=[], next=0;
  async function worker(){while(next<refs.length){var ref=refs[next++];try{var s=await ref.count().get();var n=s.data().count;if(!Number.isSafeInteger(n)||n<0)throw Error('invalid count');rows.push({id:ref.id,count:n,status:'measured'});}catch(e){rows.push({id:ref.id,count:null,status:'unavailable'});}}}
  await Promise.all(Array.from({length:Math.min(6,refs.length)},worker));
  var rootCounts={};rows.forEach(function(r){rootCounts[r.id]=r.count;});
  next=0;
  async function nestedWorker(){while(next<NESTED.length){var id=NESTED[next++];try{
    if(rootCounts[id]===null)throw Error('root overlap unknown');
    var n=(await db.collectionGroup(id).count().get()).data().count;
    if(!Number.isSafeInteger(n)||n<0)throw Error('invalid group count');
    n-=rootCounts[id]||0;if(n<0)throw Error('source changed during count');
    rows.push({id:'nested:'+id,count:n,status:'measured'});
  }catch(e){rows.push({id:'nested:'+id,count:null,status:'unavailable'});}}}
  await Promise.all(Array.from({length:6},nestedWorker));
  return summarize(rows,startedAt);
}
module.exports={collect:collect,summarize:summarize,nested:NESTED};
