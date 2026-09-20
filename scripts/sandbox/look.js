/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Screenshots for eyeballing. Drives the same path as drive.js, then shoots. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const D = __dirname;
const html = fs.readFileSync(path.join(D, 'index.html'));
const srv = http.createServer((_, res) => { res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); });
(async () => {
  await new Promise(r => srv.listen(0,'127.0.0.1',r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  await p.goto('http://127.0.0.1:'+srv.address().port+'/', { waitUntil:'domcontentloaded' });
  const c = async (s, w=140) => { await p.click(s); await p.waitForTimeout(w); };

  await p.fill('#i-kw','900'); await c('#do-size');
  await c('[data-step="1"]'); await c('#do-study');
  await c('[data-step="2"]'); await c('#do-signup');
  await c('[data-step="3"]'); await c('#do-order');
  await c('[data-step="4"]'); await c('#do-upgrade');
  await c('[data-step="5"]'); await p.fill('#d-kw','1000'); await c('#do-build');
  await p.screenshot({ path: path.join(D,'look-designer.png'), fullPage: false });

  await c('[data-act-key="a3"]'); await c('#do-intake');
  await c('[data-step="1"]'); await c('[data-act="price"]'); await c('[data-act="publish"]');
  await c('[data-step="2"]'); await c('[data-act="deposit"]');
  await c('[data-step="3"]'); await c('[data-act="release"]');
  await c('[data-act-key="a2"]'); await c('[data-step="3"]');
  for (let i=0;i<4;i++) await c('#do-advance',150);
  await p.screenshot({ path: path.join(D,'look-plant.png'), fullPage: false });

  await c('[data-act-key="a1"]'); await c('[data-step="3"]');
  await p.screenshot({ path: path.join(D,'look-buyer.png'), fullPage: false });
  await b.close(); srv.close();
  console.log('shot 3');
})();
