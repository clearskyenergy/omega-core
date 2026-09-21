/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./_lib/admin'),X=require('./_lib/logic-access'),L=require('./_lib/customer-links');
module.exports=A.handler(async function(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='GET')throw A.httpError(405,'GET only');
  var org=A.safeOrg(req.query.org),ctx=await X.authorize(await A.authenticate(req),org,false),p=L.paths(org),s=await L.publicStorefront(A.db(),org);
  return {brand:require('./_lib/logic-brand')(ctx.org),org:org,rows:[
    {name:'Customer walkthrough',url:p.start,description:'Recommended website button: sizing, accounts and design.'},
    {name:'Customer signup / login',url:p.account,description:'Free customer account, orders, terms and documents.'},
    {name:'Editor Lite / Design studio',url:p.design,description:'Sign-in and subscription/trial check before opening saved designs.'},
    {name:'Battery sizer',url:s,embed:!!s,description:'Public sizing tool. Its publishable key must allow the website origin.'}
  ]};
});
