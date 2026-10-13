/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert=require('assert');
require('./_lib/firestore-double').mock('../api/_lib/admin',{httpError:function(status,message){var e=new Error(message);e.status=status;return e;}});
var O=require('../api/_lib/sales-ownership');
var base={ownerName:'Andrew Dunn',ownerKind:'human',dealValue:10000,referral:'Mike Lopez',nextAction:'Call buyer',nextDue:'2026-10-15'};
assert.equal(O.clean(base).owner.name,'Andrew Dunn');
assert.equal(O.clean(Object.assign({},base,{ownerKind:'ai',ownerName:'Sales agent'})).owner.kind,'ai');
assert.equal(O.clean(Object.assign({},base,{dealValue:''})).dealValue,null);
assert.equal(O.clean(Object.assign({},base,{dealValue:0})).dealValue,0);
assert.throws(()=>O.clean(Object.assign({},base,{dealValue:-1})));
assert.throws(()=>O.clean(Object.assign({},base,{ownerName:''})));
assert.throws(()=>O.clean(Object.assign({},base,{nextDue:'2026-02-30'})));
assert.throws(()=>O.clean(Object.assign({},base,{nextAction:''})));
assert.throws(()=>O.save({}, {agent:true},base,Date.now()),/Staff/);
console.log('9 sales ownership checks passed');
var DB=require('./_lib/firestore-double').DB;
(async function(){
  var db=new DB(); db.seed('sales_prospects/buyerco.example',{company:'Example',contacts:[{email:'buyer@buyerco.example'}],stage:'demo',createdAt:'2026-01-01'});
  await O.save(db,{staff:true,by:'tom' },Object.assign({},base,{prospectId:'buyerco.example',stage:'proposal'}),Date.now());
  var p=(await db.collection('sales_prospects').doc('buyerco.example').get()).data();
  assert.equal(p.owner.name,'Andrew Dunn');assert.equal(p.contacts[0].email,'buyer@buyerco.example');assert.equal(p.createdAt,'2026-01-01');assert.equal(p.stage,'proposal');
  assert.equal((await db.collection('sales_activity').get()).size,1);
  console.log('Sales record persists with attribution and preserves existing contacts');
})().catch(e=>{console.error(e);process.exitCode=1;});
