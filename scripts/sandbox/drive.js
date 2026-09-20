/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Clicks the demo the way a person would, and asserts the boundaries. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

/* Served over HTTP, not file://: file:// defaults the charset to
   windows-1252 so every × and ’ arrives mojibake, and an opaque origin has
   no localStorage, which is the state this page keeps. */
const html = fs.readFileSync(path.join(__dirname, 'index.html'));
const srv = http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1320, height: 980 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'domcontentloaded' });

  let n = 0;
  const ok = (c, m) => { n++; console.log((c ? 'ok    ' : (process.exitCode = 1, 'FAIL  ')) + m); };
  const click = async (sel, w = 130) => { await p.click(sel); await p.waitForTimeout(w); };
  const who = async k => click(`[data-who="${k}"]`);
  const txt = async () => (await p.textContent('#vp')).replace(/\s+/g, ' ');
  const addr = async () => (await p.textContent('#urltext')).trim();

  /* ══ 1 · a stranger on cleancell.us ═════════════════════════════════════ */
  console.log('\n— on cleancell.us —');
  ok((await addr()) === 'cleancell.us/', 'lands on ' + (await addr()));
  ok((await txt()).includes('Clean Cell'), 'Clean Cell branding, no platform name');
  ok(!(await txt()).toLowerCase().includes('clearsky'), 'our name appears nowhere on their site');

  await p.fill('#h-kw', '900'); await p.fill('#h-h', '2');
  await click('#h-size');
  ok((await addr()).indexOf('/size-my-system') > 0, 'quick sizer routed to ' + (await addr()));
  const rec = (await txt()).match(/Recommended system.{0,90}/)[0];
  ok(/\d+ × CC-\d+/.test(rec), 'sized: ' + (rec.match(/\d+ × CC-\d+/) || [''])[0]
     + ' — ' + (rec.match(/[\d,]+ kW · [\d,]+ kWh/) || [''])[0]);

  await click('[data-go="study"]'); await click('#st-go');
  ok(await p.$('.canvas svg, .panel svg'), 'site plan drawn to scale');
  ok((await addr()).indexOf('cleancell.us') === 0, 'still on their domain: ' + (await addr()));

  await click('[data-go="checkout"]');
  await click('#c-place');
  const ordNo = (await txt()).match(/CC-26-\d+/)[0];
  ok((await txt()).includes('Request received'), 'order placed with no account: ' + ordNo);

  /* ══ 2 · she creates the account afterwards ═════════════════════════════ */
  console.log('\n— creating an account —');
  await click('[data-modal="signup"]');
  ok(await p.$('#m-signup'), 'sign-up modal opened');
  await click('#m-signup', 200);
  ok((await addr()).indexOf('portal.cleancell.us') === 0, 'lands in the portal: ' + (await addr()));
  ok((await txt()).includes('already on this address'), 'the order she placed as a stranger was claimed by email');
  ok((await txt()).includes(ordNo), 'her order is listed');

  await click(`[data-go="p/order/${ordNo}"]`);
  ok((await txt()).includes('Received'), 'order page shows a public milestone');
  ok(!(await txt()).toLowerCase().includes('quoted'), 'the internal status is not shown');
  ok((await txt()).includes('Pending') || (await txt()).includes('pending'), 'no price before one is published');

  /* ══ 3 · the second sale ════════════════════════════════════════════════ */
  console.log('\n— the second sale —');
  await click('[data-go="p/design"]');
  ok((await txt()).includes('part of the Designer plan'), 'the designer is gated');
  await click('[data-modal="upgrade"]'); await click('#m-upgrade', 200);
  ok((await txt()).includes('Subscribed'), 'subscribed');
  await click('[data-go="d/studio"]');
  ok((await addr()).indexOf('design.cleancell.us') === 0, 'the studio is on their domain too: ' + (await addr()));
  ok((await p.textContent('.tools')).includes('Compute'), 'compute is listed as not in this plan');
  ok(await p.$('.tools button.off[disabled]'), 'and it is disabled, not hidden');

  await p.fill('#d-kw', '1000'); await click('#d-build');
  ok(await p.$('.cvs svg'), 'guided build placed the units');
  for (const [v, needle] of [['one', 'PCS'], ['bom', 'Electrical estimate'], ['prop', 'Excluded'], ['set', 'Single-line diagram']]) {
    await click(`[data-view="${v}"]`);
    ok((await p.textContent('.cvs')).includes(needle), `view "${v}" renders`);
  }
  await click('[data-view="plan"]');
  await click('#d-order', 200);
  const ord2 = (await addr()).match(/CC-26-\d+/) ? (await txt()).match(/CC-26-\d+/)[0] : null;
  ok(ord2 && ord2 !== ordNo, 'a second order came out of the drawing: ' + ord2);

  /* ══ 4 · ClearSky takes one directly ════════════════════════════════════ */
  console.log('\n— ClearSky console —');
  await who('omega');
  ok((await addr()).indexOf('console.clearskyomega.com') === 0, 'different product, different domain: ' + (await addr()));
  await click('[data-modal="newcs"]'); await click('#m-newcs', 200);
  const ord3 = (await txt()).match(/CC-26-\d+/)[0];
  ok(ord3 !== ordNo, 'ClearSky took a direct order: ' + ord3);
  ok((await txt()).includes('Our cost'), 'cost and margin are visible here');

  /* Halsted is not Dana. */
  await who('buyer');
  const hers = await p.$$eval('td.mono', t => t.map(x => x.textContent.trim()));
  ok(hers.indexOf(ord3) < 0, 'another company’s order stays off her account (' + hers.join(',') + ')');

  await who('omega');
  await click(`[data-go="o/order/${ord3}"]`);
  await click('[data-act="price"]');
  ok((await txt()).includes('priced is not published'), 'priced, and the customer still sees nothing');
  await click('[data-act="publish"]');
  await click('[data-act="deposit"]');
  await click('[data-act="release"]');
  ok((await txt()).includes('Kitting'), 'pushed to the plant — the floor now holds it');

  /* ══ 5 · the bench ══════════════════════════════════════════════════════ */
  console.log('\n— the bench tablet —');
  await who('bench');
  ok((await addr()).indexOf('plant.cleancell.us') === 0, 'kiosk on ' + (await addr()));
  const serials = await p.$$eval('.gun', g => g.map(x => x.getAttribute('data-serial')));
  ok(serials.length > 0, serials.length + ' units on this bench');

  await p.selectOption('#b-station', 'rack'); await p.waitForTimeout(140);
  await click('.gun', 200);
  let v = (await p.textContent('.verdict')).replace(/\s+/g, ' ');
  ok(/out_of_sequence/.test(v), 'wrong-station scan refused: ' + v.slice(2, 84).trim());

  await p.selectOption('#b-station', 'eol'); await p.waitForTimeout(140);
  await click('.gun', 200);
  v = (await p.textContent('.verdict')).replace(/\s+/g, ' ');
  ok(/machine_station/.test(v), 'machine-station scan refused: ' + v.slice(2, 84).trim());

  await p.selectOption('#b-station', 'kit'); await p.waitForTimeout(140);
  await click('.gun', 200);
  v = (await p.textContent('.verdict')).replace(/\s+/g, ' ');
  ok(/✓/.test(v), 'legal scan accepted: ' + v.slice(2, 70).trim());
  await click('.gun', 200);
  v = (await p.textContent('.verdict')).replace(/\s+/g, ' ');
  ok(/Already at/.test(v), 'a double-fire is a duplicate, not an error');

  /* typing a serial by hand is the same path a wedge scanner takes */
  await p.fill('#b-input', 'https://plant.cleancell.us/u/' + serials[1]);
  await p.press('#b-input', 'Enter'); await p.waitForTimeout(200);
  ok(/✓/.test((await p.textContent('.verdict'))), 'a typed label scans identically');

  for (let i = 0; i < 4; i++) await click('#b-run', 170);

  /* ══ 6 · a hold does not stall the customer's status — it reverses it ═══ */
  const custMs = async () => {
    await who('omega');
    await click(`[data-go="o/order/${ord3}"]`);
    return (await p.textContent('#cust-ms')).trim();
  };
  const before = await custMs();
  await who('bench');
  await click('#b-hold', 160);
  ok((await p.textContent('#vp')).includes('NCR-26-89'), 'QA held a unit');
  const after = await custMs();
  ok(before === 'In production' && after === 'Confirmed',
     'one held unit pulls the whole order BACK a milestone: "' + before + '" -> "' + after + '"');

  /* ══ 7 · finish and ship ════════════════════════════════════════════════ */
  console.log('\n— finishing —');
  await who('bench');
  await click('#b-clear', 150);
  for (let i = 0; i < 10; i++) await click('#b-run', 120);
  await who('cc');
  ok((await addr()).indexOf('admin.cleancell.us') === 0, 'Clean Cell admin on ' + (await addr()));
  await click(`[data-go="a/order/${ord3}"]`);
  const shipBtn = await p.$('[data-act="ship"]');
  ok(!!shipBtn, 'mark-complete appears only once every unit is Ready to ship');
  if (shipBtn) { await shipBtn.click(); await p.waitForTimeout(220); }
  ok((await txt()).includes('shipped'), 'shipped by a person, not by a trigger pull');

  await who('omega');
  await click(`[data-go="o/order/${ord3}"]`);
  ok((await txt()).includes('Shipped'), 'the customer view moved on its own');

  /* ══ 8 · the leak test ══════════════════════════════════════════════════ */
  console.log('\n— what the buyer receives —');
  await click(`[data-leak="${ord3}"]`, 260);
  const leak = await p.textContent('#vp');
  const leaked = (leak.match(/LEAKED\s+\S+/g) || []);
  ok(leaked.length === 0, 'leak test: ' + (leaked.length ? leaked.join(' / ') : 'nothing leaked'));
  const absent = (leak.match(/absent\s+\S+/g) || []).map(s => s.split(/\s+/)[1]);
  console.log('        absent: ' + absent.join(', '));

  /* ══ 9 · terms are an overlay set after the fact ════════════════════════ */
  console.log('\n— terms —');
  await who('cc');
  await click('[data-go="a/customers"]');
  const em = await p.$$eval('tbody tr', rs => {
    const hit = rs.find(r => (r.getAttribute('data-go') || '').indexOf('riverside') > 0);
    return (hit || rs[0]).getAttribute('data-go');
  });
  await click(`[data-go="${em}"]`);
  if (await p.$('#t-net')) {
    await p.fill('#t-net', '45'); await p.fill('#t-disc', '4');
    await click('#t-save', 160);
    await who('buyer'); await click('[data-go="p/terms"]');
    ok((await txt()).includes('Net 45'), 'terms Clean Cell set afterwards show on her portal');
  } else { ok(false, 'terms editor did not render'); }

  /* ══ 10 · hygiene ═══════════════════════════════════════════════════════ */
  console.log('\n— hygiene —');
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(260);
  ok((await txt()).length > 300, 'state survives a reload');
  await click('#tnote', 160);
  ok(!(await p.$eval('#note', e => e.hidden)), '"show what is real" reveals the footnote');
  await click('#tnote', 140);

  const pages = ['home', 'products', 'how', 'size', 'p/orders', 'p/documents', 'p/terms',
                 'p/account', 'p/design', 'd/studio', 'a/orders', 'a/customers', 'a/production',
                 'b/scan', 'o/orders', 'o/tenants', 'o/tenant/cleancell.us', 'o/systems'];
  let bad = [];
  await p.setViewportSize({ width: 390, height: 900 });
  for (const r of pages) {
    await p.evaluate(rt => { const s = window.__demoState(); s.route = rt; window.__demoRender(); }, r);
    await p.waitForTimeout(90);
    const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 1) bad.push(r + '(+' + o + ')');
  }
  ok(bad.length === 0, 'no horizontal scroll at 390px on ' + pages.length + ' pages' + (bad.length ? ': ' + bad.join(', ') : ''));

  await p.setViewportSize({ width: 1320, height: 980 });
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(160);
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bg !== 'rgba(0, 0, 0, 0)', 'dark mode paints a background: ' + bg);
  ok(errs.length === 0, 'js errors: ' + (errs.length ? errs.join(' | ') : 'none'));

  console.log('\n' + n + ' assertions');
  await b.close(); srv.close();
})();
