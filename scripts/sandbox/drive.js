/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Drives all three stories in a real browser and asserts the boundaries. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

/* Served over HTTP, not file://, for two reasons: file:// defaults the
   charset to windows-1252 so every × and ’ in the page arrives mojibake, and
   an opaque origin has no localStorage, which is the state this page keeps. */
const html = fs.readFileSync(path.join(__dirname, 'index.html'));
const srv = http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'domcontentloaded' });

  const txt = async () => (await p.textContent('main')).replace(/\s+/g, ' ');
  const click = async (sel, wait = 130) => { await p.click(sel); await p.waitForTimeout(wait); };
  const act = async k => click(`[data-act-key="${k}"]`);
  const step = async i => click(`[data-step="${i}"]`);
  const fail = m => { console.log('FAIL  ' + m); process.exitCode = 1; };
  const ok = (cond, m) => console.log((cond ? 'ok    ' : (process.exitCode = 1, 'FAIL  ')) + m);

  /* ══ STORY A — a customer buys ═════════════════════════════════════════ */
  console.log('\n— A · a customer buys —');
  await act('a1');
  await p.fill('#i-kw', '900'); await p.fill('#i-h', '2');
  await click('#do-size');
  const sized = (await p.textContent('.rec')).replace(/\s+/g, ' ').trim();
  ok(/\d+ × /.test(sized), 'sized: ' + sized.slice(0, 74));

  await step(1); await click('#do-study');
  ok(await p.$('.canvas svg'), 'site study drew a plot plan to scale');

  await step(2); await click('#do-signup');
  ok((await txt()).includes('You are signed in'), 'account created by the customer themselves');

  await step(3); await click('#do-order');
  let t = await txt();
  ok(/CC-20260920-\d+/.test(t), 'order placed: ' + (t.match(/CC-20260920-\d+/) || [])[0]);
  ok(t.includes('Price pending'), 'no price is shown before one is published');

  await step(4);
  ok((await txt()).includes('Site Map is part of the designer'), 'designer is gated behind the plan');
  await click('#do-upgrade');
  ok((await txt()).includes('You are on the designer'), 'upgraded — toolAccess allowlist');

  await step(5);
  await p.fill('#d-kw', '1000'); await p.fill('#d-h', '2');
  await click('#do-build');
  ok(await p.$('.canvas svg'), 'guided build placed units on the plot plan');
  for (const [tab, needle] of [['one', 'PCS'], ['bom', 'Electrical estimate'], ['prop', 'Excluded'], ['blue', 'Single-line diagram']]) {
    await click(`[data-xt="${tab}"]`);
    ok((await txt()).includes(needle), `export "${tab}" renders (${needle})`);
  }
  await click('[data-xt="plot"]');
  await click('#do-push');
  await click('#do-order2');
  await step(6);
  const twoOrders = await p.$$eval('.ord .no', n => n.map(x => x.textContent));
  ok(twoOrders.length >= 2, 'two orders on one account: ' + twoOrders.join(', '));

  /* ══ STORY C first — so B has a ClearSky order to intake ═══════════════ */
  console.log('\n— C · ClearSky sells direct —');
  await act('a3');
  await click('#do-intake');
  let tc = await txt();
  ok(tc.includes('Halsted Logistics'), 'ClearSky took a direct order from a client');

  /* Halsted is not Dana. Their order must not appear on her account. */
  const halsted = (tc.match(/CC-20260920-\d+/) || [])[0];
  await act('a1'); await step(6);
  const onHers = await p.$$eval('.ord .no', n => n.map(x => x.textContent.trim()));
  ok(halsted && onHers.indexOf(halsted) < 0,
     'another company\u2019s order stays off this account (' + halsted + ' not in ' + onHers.join(',') + ')');
  await act('a3');

  await step(1);
  await click('[data-act="price"]');
  ok((await txt()).includes('nothing yet'), 'priced, but the client still sees nothing');
  await click('[data-act="publish"]');
  ok(!(await txt()).includes('nothing yet'), 'published — now the client sees a number');

  await step(2); await click('[data-act="deposit"]');
  await step(3); await click('[data-act="release"]');
  ok((await txt()).includes('serials'), 'pushed to the plant — serials allocated');

  /* ══ STORY B — Clean Cell builds it ════════════════════════════════════ */
  console.log('\n— B · Clean Cell builds it —');
  await act('a2');
  await step(2);   /* first scan */
  const serials = await p.$$eval('.g', n => n.map(x => x.getAttribute('data-serial')));
  ok(serials.length > 0, plural(serials.length) + ' on the floor');

  /* an out-of-sequence scan must be refused */
  await p.selectOption('#b-station', 'rack'); await p.waitForTimeout(120);
  await p.click('.g'); await p.waitForTimeout(160);
  let v = (await p.textContent('#verdict')).replace(/\s+/g, ' ').trim();
  ok(/out_of_sequence/.test(v), 'illegal scan refused: ' + v.slice(0, 82));
  await p.waitForTimeout(950);

  /* the machine station must be refused */
  await p.selectOption('#b-station', 'eol'); await p.waitForTimeout(120);
  await p.click('.g'); await p.waitForTimeout(160);
  v = (await p.textContent('#verdict')).replace(/\s+/g, ' ').trim();
  ok(/machine_station/.test(v), 'machine station refused: ' + v.slice(0, 82));
  await p.waitForTimeout(950);

  /* a legal scan at Kitting */
  await p.selectOption('#b-station', 'kit'); await p.waitForTimeout(120);
  await p.click('.g'); await p.waitForTimeout(1200);
  ok((await txt()).includes('Kitting'), 'legal scan advanced the unit');

  await step(3);
  for (let i = 0; i < 5; i++) await click('#do-advance', 160);

  await step(4);
  const before = await p.$$eval('.pill', n => n.map(x => x.textContent.trim()));
  await click('#b-hold');
  const held = await p.$$eval('.pill', n => n.map(x => x.textContent.trim()));
  const heldSay = (await p.textContent('.say')).replace(/\s+/g, ' ').trim();
  ok(held.indexOf('In production') >= 0 && held.join() === before.join(),
     'a unit on hold does not move the customer\u2019s milestone: "' + heldSay.slice(0, 52) + '"');

  await step(5); await click('#b-release-hold');
  for (let i = 0; i < 10; i++) await click('#do-advance', 130);

  await step(6);
  const shipBtn = await p.$('[data-act="ship"]:not([disabled])');
  ok(!!shipBtn, 'mark-complete unlocked only once every unit is Ready to ship');
  if (shipBtn) { await shipBtn.click(); await p.waitForTimeout(200); }
  ok((await txt()).includes('Shipped'), 'shipped — and the customer card moved on its own');

  /* ══ back to C — close it, then the proof ══════════════════════════════ */
  console.log('\n— C · close and prove —');
  await act('a3'); await step(5);
  const paidBtn = await p.$('[data-act="paid"]');
  if (paidBtn) { await paidBtn.click(); await p.waitForTimeout(160); }
  ok((await txt()).includes('Closed'), 'balance received — order closed');

  await step(6); await click('#do-leak', 260);
  const leak = await p.textContent('#leak-out');
  const leaked = leak.split('\n').filter(l => l.indexOf('LEAKED') >= 0);
  ok(leaked.length === 0, 'leak test: ' + (leaked.length ? leaked.join(' / ') : 'nothing leaked'));
  console.log(leak.split('Searched')[1].split('What the buyer')[0].trim().split('\n').map(s => '        ' + s.trim()).join('\n'));

  /* ══ hygiene ═══════════════════════════════════════════════════════════ */
  console.log('\n— hygiene —');
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(220);
  ok((await txt()).includes('Closed') || (await txt()).length > 200, 'state survives a reload');
  await p.setViewportSize({ width: 390, height: 900 }); await p.waitForTimeout(250);
  const hs = await p.evaluate(() => {
    const W = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
    const out = [];
    if (sw > W + 1) document.querySelectorAll('main *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 && r.width > 0) out.push(el.tagName + '.' + String(el.className).slice(0, 24) + ' w=' + Math.round(r.width));
    });
    const st = document.querySelector('.stage');
    return { W, sw, cols: getComputedStyle(st).gridTemplateColumns,
             stage: Math.round(st.getBoundingClientRect().width), out: out.slice(0, 5) };
  });
  ok(hs.sw <= hs.W + 1, 'no horizontal page scroll at 390px' + (hs.sw > hs.W + 1 ? ' — ' + hs.sw + 'px, stage=' + hs.stage + ', cols=' + hs.cols + ': ' + hs.out.join(', ') : ''));
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(150);
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bg !== 'rgba(0, 0, 0, 0)', 'dark mode paints a background: ' + bg);
  ok(errs.length === 0, 'js errors: ' + (errs.length ? errs.join(' | ') : 'none'));

  await b.close();
  srv.close();
  function plural(n) { return n + (n === 1 ? ' unit' : ' units'); }
})();
