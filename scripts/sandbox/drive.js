/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:1100,height:900}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+__dirname+'/index.html',{waitUntil:'load'});
  const tab = async r => { await p.click(`[data-role="${r}"]`); await p.waitForTimeout(120); };
  const txt = async () => (await p.textContent('#view')).replace(/\s+/g,' ');

  // 1 · BUYER sizes and orders
  await p.fill('#i-kw','600'); await p.fill('#i-h','2');
  await p.click('#do-size'); await p.waitForTimeout(150);
  console.log('sized     :', (await p.textContent('.rec')).replace(/\s+/g,' ').trim().slice(0,86));
  await p.click('#do-order'); await p.waitForTimeout(150);
  console.log('after order:', (await txt()).match(/CLEANCELL-\S+/)?.[0],
              '|', (await txt()).match(/Received|Confirmed|In production/)?.[0]);

  // 2 · CLEAN CELL confirms
  await tab('tenant');
  await p.click('[data-act="confirm"]'); await p.waitForTimeout(150);

  // 3 · CLEARSKY prices
  await tab('staff');
  await p.click('[data-act="price"]'); await p.waitForTimeout(150);

  // 4 · CLEAN CELL publishes price, takes deposit, releases
  await tab('tenant');
  await p.click('[data-act="publish"]'); await p.waitForTimeout(120);
  await p.click('[data-act="deposit"]'); await p.waitForTimeout(120);
  await p.click('[data-act="release"]'); await p.waitForTimeout(150);
  console.log('released  :', (await txt()).match(/\d+ units? on the floor/)?.[0]);

  // 5 · BUYER now sees In production + their price + a document
  await tab('customer');
  let t = await txt();
  console.log('buyer sees:', t.match(/In production|Received|Confirmed/)?.[0],
              '| price shown:', /\$\d/.test(t),
              '| doc:', /Deposit invoice/.test(t),
              '| internal doc hidden:', !/Margin sheet/.test(t));

  // 6 · BENCH: walk one unit forward, and try an illegal jump
  await tab('bench');
  const serials = await p.$$eval('.g', g=>g.map(x=>x.dataset.serial));
  console.log('serials   :', serials.length);
  // wrong bench first — default bench is Kitting, so scan is legal; switch to Pack
  await p.selectOption('#b-station','pack'); await p.waitForTimeout(150);
  await p.click(`.g[data-serial="${serials[0]}"]`); await p.waitForTimeout(400);
  console.log('illegal   :', (await p.textContent('#verdict')).replace(/\s+/g,' ').trim().slice(0,90));
  await p.waitForTimeout(700);
  // now walk it properly through every station
  const stations = await p.$$eval('#b-station option', o=>o.map(x=>x.value));
  for (const st of stations) {
    if (st==='eol') continue;                       // machine station: refuses a human scan
    await p.selectOption('#b-station', st); await p.waitForTimeout(90);
    await p.click(`.g[data-serial="${serials[0]}"]`); await p.waitForTimeout(280);
    await p.waitForTimeout(650);
  }
  console.log('eol test  : skipped a machine station on purpose');
  await p.selectOption('#b-station','eol'); await p.waitForTimeout(120);
  await p.click(`.g[data-serial="${serials[0]}"]`); await p.waitForTimeout(400);
  console.log('machine   :', (await p.textContent('#verdict')).replace(/\s+/g,' ').trim().slice(0,90));
  await p.waitForTimeout(700);

  // 7 · a hold must stop the milestone advancing
  await p.click('#b-hold'); await p.waitForTimeout(200);
  await tab('customer');
  t = await txt();
  console.log('with hold :', t.match(/In production|Inspection & test|Ready to ship|Shipped/)?.[0]);

  // 8 · THE LEAK TEST
  await tab('staff');
  await p.click('#do-leak'); await p.waitForTimeout(250);
  const leak = await p.textContent('#leak-out');
  const leaked = (leak.match(/LEAKED/g)||[]).length;
  console.log('leak test :', leaked===0 ? 'nothing leaked' : leaked+' LEAKED');
  console.log(leak.split('Searched')[1]?.split('What the buyer')[0].trim().split('\n').map(s=>'   '+s.trim()).join('\n'));

  // 9 · terms round-trip
  await tab('tenant');
  await p.fill('#c-net','45'); await p.fill('#c-disc','7'); await p.click('#c-save'); await p.waitForTimeout(150);
  await tab('customer');
  console.log('terms     :', /Net 45/.test(await txt()) && /7%/.test(await txt()) ? 'visible to buyer' : 'NOT SHOWN');

  // 10 · persistence + phone width
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(250);
  console.log('persisted :', /CLEANCELL-/.test(await p.textContent('#view')));
  await p.setViewportSize({width:400,height:820}); await p.waitForTimeout(200);
  const hs = await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  console.log('400px h-scroll:', hs);
  console.log('js errors :', errs.length?errs:'none');
  await b.close();
})();
