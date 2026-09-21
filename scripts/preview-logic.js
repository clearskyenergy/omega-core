/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Local UI fixture only. No Firebase, QuickBooks or bank calls. */
'use strict';
var http=require('http'),fs=require('fs'),path=require('path');
var base=path.resolve(__dirname,'..'),org='cleancell.us',query='?org='+org;
var links={office:'/omega-logic'+query,factory:'/plant/'+query,customer:'/portals/customer/'+query,
  customers:'/portals/customer/admin.html'+query,
  storefront:'/embed/storefront.html?k=fixture',setup:'/whitelabel-setup.html'+query,
  editor:'/editor.html',preview:'/editor.html?wlpreview='+org,mission:'/mission?view=logic&org='+org};
var commercial=require('../api/_lib/logic-policy').snapshot(100000);
var fixture={owner:true,org:org,name:'CleanCell · LOCAL TEST DATA',active:true,products:2,links:links,
  config:{enabled:true,terms:{depositPct:30,dueDays:0},fee:{percent:0.25,fixed:0},realmId:'SANDBOX FIXTURE',itemRef:'1',accountingApproved:true},
  orders:[{id:'preview1',orderNo:'CC-TEST-001',customer:{name:'Example commercial site',email:'buyer@example.invalid'},status:'in_fulfilment',items:[{sku:'EXAMPLE-CAB',name:'Example battery cabinet (not a real catalog SKU)',qty:2}],worksOrderId:'wo_preview1',logic:{commercial:commercial,acceptedAt:'2026-09-21',releasedAt:'2026-09-21',invoices:{deposit:{amountCents:commercial.depositCents,paidCents:commercial.depositCents,status:'paid'}},allocatedSerials:['TEST-001'],requirements:[{sku:'EXAMPLE-CAB',qty:1}],payout:{status:'awaiting_cleared_funds',sentCents:0}}},
    {id:'preview2',orderNo:'CC-TEST-002',customer:{name:'Example warehouse',email:'warehouse@example.invalid'},status:'new',items:[{sku:'EXAMPLE-CAB',qty:1}]}]};
var fake='<script>window.CLEARSKY_CONFIG={};var qaUser={email:"tom@clearsky-usa.com",getIdToken:function(){return Promise.resolve("LOCAL-FIXTURE");}};var qaAuth={currentUser:qaUser,onAuthStateChanged:function(fn){setTimeout(function(){fn(qaUser);},0);}};window.firebase={apps:[{}],auth:function(){return qaAuth;}};</script>';
var server=http.createServer(function(req,res){var u=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Local preview is read-only. No live operation was performed.'}));return;}
  if(['/omega-logic-theme.css','/omega-logic-theme.js'].indexOf(u.pathname)>=0){res.setHeader('Content-Type',u.pathname.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(base,u.pathname.slice(1))));return;}
  if(u.pathname==='/api/customer-portal'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({org:org,brand:{name:fixture.name,primary:'#3FAFC6'},editorLite:{monthlyPriceCents:79900,checkoutAvailable:false}}));return;}
  if(u.pathname==='/api/buyers'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(u.searchParams.has('email')?{company:'Example buyer · LOCAL FIXTURE',email:'buyer@example.invalid',terms:{depositPct:30,dueDays:0},orders:fixture.orders}:{org:org,name:fixture.name,portalUrl:links.customer,customers:[{id:'test',company:'Example buyer · LOCAL FIXTURE',status:'active',terms:{depositPct:30,dueDays:0},users:[{email:'buyer@example.invalid',name:'Example contact',activated:false}]}]}));return;}
  if(u.pathname==='/api/my-account'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({company:'Example buyer · LOCAL FIXTURE',plan:'free',status:'active',you:{email:'buyer@example.invalid',name:'Example contact',role:'owner'},terms:{depositPct:30,dueDays:0},agreements:[],orders:1}));return;}
  if(u.pathname==='/api/my-orders'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({orders:fixture.orders.map(function(o){return require('../api/_lib/portal').publicOrder(o);})}));return;}
  if(u.pathname==='/api/logic-office'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(u.searchParams.get('org')?fixture:{owner:true,tenants:[{name:fixture.name,orgId:org,status:'LOCAL FIXTURE',links:links}]}));return;}
  if(u.pathname==='/api/logic-plant'){res.setHeader('Content-Type','application/json');var testUnit={serial:'TEST-001',sku:'EXAMPLE-CAB',at:'ready',shipUnit:true,unitType:'cabinet',orderNo:'CC-TEST-001',trace:{lot:'LOCAL-TEST-LOT'},test:{result:'pass',measurements:{fixtureOnly:1}}};res.end(JSON.stringify(u.searchParams.get('serial')?{unit:testUnit,genealogy:[testUnit],events:[{at:'LOCAL FIXTURE',station:'eol',verdict:{say:'Example pass record'},test:testUnit.test}]}:{name:fixture.name,worksOrders:[{id:'wo_preview1',orderId:'preview1',orderNo:'CC-TEST-001',status:'awaiting_serials',requirements:[{sku:'EXAMPLE-CAB',qty:1}]}],units:[testUnit]}));return;}
  var page=u.pathname==='/portals/customer/admin.html'?'portals/customer/admin.html':u.pathname==='/portals/customer/'?'portals/customer/index.html':u.pathname.indexOf('/plant')===0?'plant/index.html':'omega-logic.html';
  var html=fs.readFileSync(path.join(base,page),'utf8').replace(/<script\s+src="([^"]+)"><\/script>/g,function(tag,src){return src==='/omega-logic-theme.js'?tag:'';});
  html=html.replace('</head>',fake+'</head>');res.setHeader('Content-Type','text/html');res.end(html);
});
server.listen(Number(process.argv[2]||8798),'127.0.0.1',function(){console.log('LOCAL FIXTURE ONLY — http://127.0.0.1:'+server.address().port+'/omega-logic?org=cleancell.us&order=preview1');});
