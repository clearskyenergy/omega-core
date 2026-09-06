/* Render intake.html / queue.html in Chrome with Firebase stubbed, so the
   pages can be looked at without a live project. Firestore returns the
   sample book of work; Storage is stubbed to a no-op. */
const p = require('puppeteer-core');
const fs = require('fs');

const CHROME = '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';
const PAGE = process.argv[2] || 'queue.html';
const OUT  = process.argv[3] || '/tmp/page.png';
const EMPTY = process.argv[4] === 'empty';

/* Injected before any page script. The compat SDK is blocked by sandbox
   egress, so we replace it entirely rather than letting the page hang on a
   script that will never load. */
const STUB = `
window.__SAMPLE_MODE = ${EMPTY ? 'true' : 'false'};
(function(){
  function P(v){ return Promise.resolve(v); }
  var docs = [];
  var SNAP = { forEach: function(cb){ docs.forEach(cb); }, size: docs.length,
               empty: docs.length === 0, docs: docs };
  function q(){ return {
    where: function(){ return q(); },
    orderBy: function(){ return q(); },
    limit: function(){ return q(); },
    get: function(){ return P(SNAP); },
    onSnapshot: function(cb){ setTimeout(function(){ try { cb(SNAP); } catch(e){} }, 10);
                              return function(){}; },
    add: function(){ return P({ id:'stub' }); },
    doc: function(){ return {
      get: function(){ return P({ exists:false, data:function(){ return {}; } }); },
      update: function(){ return P(); }, set: function(){ return P(); },
      onSnapshot: function(cb){ setTimeout(function(){
        try { cb({ exists:false, data:function(){ return {}; } }); } catch(e){} }, 10);
        return function(){}; }
    }; }
  }; }
  var fs_ = { collection: function(){ return q(); },
              doc: function(){ return q().doc(); } };
  window.firebase = {
    initializeApp: function(){},
    auth: function(){ return {
      currentUser: { email:'demo@cleantechir.com', displayName:'Demo User', uid:'u1' },
      onAuthStateChanged: function(cb){
        setTimeout(function(){ cb({ email:'demo@cleantechir.com', displayName:'Demo User', uid:'u1' }); }, 30);
      }
    }; },
    firestore: function(){ return fs_; },
    storage: function(){ return { ref: function(){ return {
      put: function(){ return P(); }, getDownloadURL: function(){ return P('https://x/f'); }
    }; } }; }
  };
  window.firebase.firestore.FieldValue = { serverTimestamp: function(){ return new Date(); } };
})();
`;

(async () => {
  const b = await p.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    headless: 'new'
  });
  const pg = await b.newPage();
  await pg.setViewport({ width: 1360, height: 1200, deviceScaleFactor: 2 });

  const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  /* Block the real Firebase SDK and the font CDN — neither is reachable. */
  await pg.setRequestInterception(true);
  pg.on('request', r => {
    const u = r.url();
    if (/gstatic\.com\/firebasejs|fonts\.googleapis|fonts\.gstatic|clearskyomega\.com/.test(u)) {
      return r.abort();
    }
    r.continue();
  });

  await pg.evaluateOnNewDocument(STUB);
  await pg.goto('http://127.0.0.1:8099/' + PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });

  /* Force sample mode on when asked, so the empty state can be seen too. */
  if (EMPTY) {
    await pg.evaluate(() => {
      if (window.CLEARSKY_CONFIG) window.CLEARSKY_CONFIG.tenant.delivery.sampleData = false;
    });
  }

  await new Promise(r => setTimeout(r, 2500));
  await pg.screenshot({ path: OUT, fullPage: true });

  const visible = await pg.evaluate(() => {
    const w = document.getElementById('wrap');
    const g = document.getElementById('gate');
    return {
      wrap: w ? getComputedStyle(w).display : 'missing',
      gate: g ? getComputedStyle(g).display : 'missing',
      chars: document.body.innerText.length,
      undef: /\bundefined\b|\bNaN\b|\[object Object\]/.test(document.body.innerText)
    };
  });

  await b.close();
  console.log(PAGE, JSON.stringify(visible));
  /* Aborted requests are expected; only report real script failures. */
  const real = errs.filter(e => !/Failed to load resource|net::ERR/.test(e));
  if (real.length) { console.log('  errors:'); real.forEach(e => console.log('   ', e)); }
  else console.log('  no script errors');
})();
