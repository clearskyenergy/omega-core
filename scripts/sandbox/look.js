/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const D=__dirname, html=fs.readFileSync(path.join(D,'index.html'));
const srv=http.createServer((_,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
(async()=>{
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1320,height:1000}});
  await p.goto('http://127.0.0.1:'+srv.address().port+'/',{waitUntil:'domcontentloaded'});
  const c=async(s,w=140)=>{await p.click(s);await p.waitForTimeout(w);};
  const shot=n=>p.screenshot({path:path.join(D,'look-'+n+'.png')});

  await shot('1-site');
  await p.fill('#h-kw','900'); await c('#h-size');
  await c('[data-go="study"]'); await c('#st-go'); await shot('2-study');
  await c('[data-go="checkout"]'); await c('#c-place');
  await c('[data-modal="signup"]'); await c('#m-signup',220);
  await c('[data-go="p/design"]'); await c('[data-modal="upgrade"]'); await c('#m-upgrade',220);
  await c('[data-go="d/studio"]'); await p.fill('#d-kw','1000'); await c('#d-build',200);
  await shot('3-studio');
  await c('#d-order',200);
  await c('[data-who="omega"]'); await c('[data-modal="newcs"]'); await c('#m-newcs',200);
  await c('[data-act="price"]'); await c('[data-act="publish"]');
  await c('[data-act="deposit"]'); await c('[data-act="release"]');
  await c('[data-who="bench"]');
  for(let i=0;i<3;i++) await c('#b-run',150);
  await p.selectOption('#b-station','rack'); await p.waitForTimeout(120);
  await c('.gun',220); await shot('4-bench');
  await c('[data-who="buyer"]'); await p.waitForTimeout(150);
  const row=await p.$('tbody tr'); if(row){await row.click(); await p.waitForTimeout(200);} 
  await shot('5-order');
  await c('[data-who="omega"]'); await c(String.fromCharCode(91)+"data-go=\"o/tenants\""+String.fromCharCode(93),180); await c(String.fromCharCode(91)+"data-go=\"o/tenant/cleancell.us\""+String.fromCharCode(93),200);
  await shot('6-tenant');
  await b.close(); srv.close(); console.log('shot 6');
})();
