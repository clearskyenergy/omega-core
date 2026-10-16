/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* omega-demo.js — a guided demo that runs ON the real product.

   Nothing here is a mock-up. The pages are the live tools, signed in, on
   live data; this file only adds a guide card, rings the control the
   presenter should use next, and (in Guided mode) refuses clicks anywhere
   else so a live demo cannot wander off the path.

   It does nothing unless a demo is switched on:
     /grid-atlas.html?demo=fenecon-il&q=<address>&at=<lat>,<lng>
   which stores { id, step, addr, at } in sessionStorage for this tab, so
   the guide follows the presenter from page to page. Exit (or closing the
   tab) switches it off. Changes no data, calls no endpoint, reads no
   token: every action is the presenter's own click on the real control.

   A page that takes part loads it with one tag:
     <script src="/omega-demo.js" defer></script>
   Steps name controls by selector; a selector that is not on the page
   yet is waited for, never faked. ES5, no build step. */
(function () {
  'use strict';
  var KEY = 'omega:demo';

  /* ── state ─────────────────────────────────────────────────────────── */
  function qp(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search || '');
    if (!m) return '';
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; }
  }
  function load() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function clear() { try { sessionStorage.removeItem(KEY); } catch (e) {} }

  var S = load();
  var asked = qp('demo');
  if (asked) {
    if (asked === 'off') { clear(); return; }
    if (!S || S.id !== asked) S = { id: asked, step: 0, lock: true };
    if (qp('addr') || qp('q')) S.addr = qp('addr') || qp('q');
    if (qp('at')) S.at = qp('at');
    if (qp('step')) S.step = Math.max(0, parseInt(qp('step'), 10) - 1 || 0);
    save(S);
  }
  if (!S) return;

  /* ── the demos ─────────────────────────────────────────────────────── */
  function enc(v) { return encodeURIComponent(v || ''); }
  function atParts() {
    var m = String(S.at || '').replace(/\s/g, '').match(/^(-?[\d.]+),(-?[\d.]+)$/);
    return m ? { lat: m[1], lng: m[2] } : null;
  }
  function txt(sel) { var e = document.querySelector(sel); return e ? (e.innerText || e.textContent || '') : ''; }
  function active(sel) { var e = document.querySelector(sel); return !!(e && /\bactive\b/.test(e.className)); }
  function shown(sel) { var e = document.querySelector(sel); if (!e) return false; if (/modal-bg/.test(e.className) && !/\bon\b/.test(e.className)) return false; var cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; }
  function isOpen(sel) { var e = document.querySelector(sel); return !!(e && /\bopen\b/.test(e.className)); }

  var DEMOS = {
    'fenecon-il': {
      title: 'FENECON · Illinois site · 5 MWh',
      steps: [
        /* ── Grid Atlas ── */
        { page: /grid-atlas/, title: 'Grid Atlas: is the grid here right?',
          text: 'This is the live Grid Atlas on the client\'s site. Start by telling it what we are screening for.',
          say: 'One click sets every layer a battery site needs: substations, transmission, the utility territory and the market.',
          sel: '#projectSelect', act: 'Choose BESS in "Screen for"',
          done: function () { var e = document.querySelector('#projectSelect'); return e && e.value === 'bess'; } },
        { page: /grid-atlas/, title: 'Pin the site',
          text: 'Drop a pin on the client\'s parcel. Grid Atlas measures the nearest substation, transmission line and fiber from that point.',
          say: 'Is there a strong substation close enough, at a voltage that works for 2.5 MW?',
          sel: '#pinBtn', allow: ['#map', '#q', '#search'], act: 'Press Pin Site, then click the parcel on the map',
          done: function () { return /substation/i.test(txt('#pBody')); } },
        { page: /grid-atlas/, title: 'Read the site',
          text: 'The Project panel now lists what is near the pin, from public grid data, with distances.',
          say: 'Grid Atlas tells us the grid is near. Next: does the ComEd circuit under this parcel have room?',
          sel: '#pBody', allow: ['#pBody', '#map'], act: 'Walk the panel, then press Next' },
        { page: /grid-atlas/, title: 'On to ComEd hosting capacity',
          text: 'Open the Site Finder on the same site.',
          say: 'Near is not the same as available. ComEd publishes how much each circuit can take.',
          go: function () { var a = atParts(); return '/clearsky-sitefinder.html' + (a ? '?at=' + a.lat + ',' + a.lng + ',17' : ''); },
          act: 'Press Open Site Finder' },

        /* ── Site Finder · ComEd ── */
        { page: /clearsky-sitefinder/, title: 'ComEd hosting capacity, by circuit',
          text: 'Each shaded area is one ComEd circuit, coloured by its published hosting capacity. This is ComEd\'s own service, read live.',
          say: 'We are getting down to the individual circuit with every utility. This is ComEd.',
          sel: '#lyHost', allow: ['#map'], act: 'Point at the shading, then press Next' },
        { page: /clearsky-sitefinder/, title: 'Resolve the circuit at the parcel',
          text: 'Click the client\'s parcel. The tool asks ComEd which circuit serves that exact point and what it can host.',
          say: 'The same question ComEd\'s own viewer answers, at full resolution.',
          sel: '#map', allow: ['#map', '#q', '#qGo', '#drawer'], act: 'Click the parcel on the map',
          done: function () { return isOpen('#drawer'); } },
        { page: /clearsky-sitefinder/, title: 'The circuit\'s answer',
          text: 'The circuit, its substation, the published hosting capacity, what is already claimed and what is left.',
          say: 'The FENECON Industrial XXL is 2,508 kW. Does the room left cover it?',
          sel: '#drawer', allow: ['#drawer'], act: 'Read the panel, then press Next' },
        { page: /clearsky-sitefinder/, title: 'Subtract the queue',
          text: 'ComEd publishes a headline figure and leaves out what is already queued on the feeder. Open Settings.',
          say: 'The headline oversells. We net out the queue.',
          sel: '#setOpen', act: 'Press Settings',
          done: function () { return isOpen('#settings'); } },
        { page: /clearsky-sitefinder/, title: 'Shade net of queued DER',
          text: 'Turn on net shading. The map recolours on what is really left.',
          say: 'This is the honest number.',
          sel: '#setNetQueue', allow: ['#settings'], act: 'Tick Shade net of queued DER',
          done: function () { var e = document.querySelector('#setNetQueue'); return e && e.checked; } },
        { page: /clearsky-sitefinder/, title: 'Every call is checkable',
          text: 'The diagnostics list every request this page made to ComEd, with its URL.',
          say: 'Anyone can check our number against ComEd\'s own map.',
          sel: '#setDiag', allow: ['#settings'], act: 'Show the request list, then close Settings',
          done: function () { return !isOpen('#settings'); } },
        { page: /clearsky-sitefinder/, title: 'Only circuits that fit the XXL',
          text: 'Set Min. hosting to 2,500 kW. Every circuit that cannot take the XXL drops out.',
          say: 'A rep only ever sees sites where a 5 MWh FENECON unit can connect.',
          sel: '#fHost', act: 'Type 2500 in Min. hosting (kW)',
          done: function () { var e = document.querySelector('#fHost'); return e && +e.value >= 2500; } },
        { page: /clearsky-sitefinder/, title: 'The neighbourhood',
          text: 'Turn on C&I parcels: more sites like this one on circuits with room.',
          say: 'One good site has neighbours. This is how the pipeline grows.',
          sel: '#lyCI', allow: ['#map', '#drawer'], act: 'Tick C&I / industrial parcels',
          done: function () { var e = document.querySelector('#lyCI'); return e && e.checked; } },
        { page: /clearsky-sitefinder/, title: 'Design it',
          text: 'The site passes. Open it in Site Map to build and price the FENECON system.',
          say: 'Screened before anyone draws a line.',
          go: function () { return '/editor' + (S.addr ? '?addr=' + enc(S.addr) : ''); },
          act: 'Press Open Site Map' },

        /* ── Site Map (editor.html) ── */
        { page: /\/editor/, title: 'The site in Site Map',
          text: 'Open the client\'s project (File, Open Projects) or load the address in the Satellite Photo box.',
          say: 'Same site, now on the drawing.',
          sel: '#addr-in', free: true, act: 'Load the site, then press Next' },
        { page: /\/editor/, title: 'Start from the client\'s bill',
          text: 'Open the Analyze tab.',
          say: 'We size from what this site pays ComEd for demand.',
          sel: '#ribbon-tabs .rtab[data-page="analyze"]', act: 'Click Analyze',
          done: function () { return active('#ribbon-tabs .rtab[data-page="analyze"]'); } },
        { page: /\/editor/, title: 'Import the ComEd bill',
          text: 'Import Bill reads the tariff, the monthly peaks and the demand charges. Check them, then Use these values.',
          say: 'The demand charge is what the battery attacks first.',
          sel: '.ribbon-page[data-page="analyze"] button[onclick="openBillImport()"]', allow: ['#bill-import-modal'],
          act: 'Press Import Bill, drop the bill, press Use these values' },
        { page: /\/editor/, title: 'Back to Build',
          text: 'Open the Build tab.',
          sel: '#ribbon-tabs .rtab[data-page="home"]', act: 'Click Build',
          done: function () { return active('#ribbon-tabs .rtab[data-page="home"]'); } },
        { page: /\/editor/, title: 'BESS Guided Build',
          text: 'The guided build walks the battery from configuration to placement.',
          say: 'Every rep builds a battery site the same way.',
          sel: '.ribbon-page[data-page="home"] button[onclick="_guidedPick(\'standard\')"]', act: 'Press BESS Build',
          done: function () { return shown('#bgb-modal'); } },
        { page: /\/editor/, title: 'Configure the system',
          text: 'Open the configuration.',
          sel: '#bgb-cfgrow button[onclick="_bgbOpenConfig()"]', allow: ['#bgb-modal'], act: 'Press Configure BESS System',
          done: function () { return shown('#bess-modal'); } },
        { page: /\/editor/, title: 'FENECON Industrial XXL',
          text: 'From the Product Catalog choose FENECON Industrial XXL, 2.508 MW / 5.015 MWh. Its real specs fill the form: inverter, 3,000 kVA transformer, 4,000 A disconnect, footprint.',
          say: 'FENECON\'s own unit, with its own balance of system.',
          sel: '#bm-catalog', allow: ['#bess-modal'], act: 'Choose FENECON Industrial XXL',
          done: function () { var e = document.querySelector('#bm-catalog'); return e && e.value === 'FENECON-IND-XXL'; } },
        { page: /\/editor/, title: 'Save the configuration',
          text: 'Walk the filled form, then save it back to the build.',
          sel: '#bm-save-btn', allow: ['#bess-modal'], act: 'Press Configure & Return to Build',
          done: function () { return !shown('#bess-modal'); } },
        { page: /\/editor/, title: 'Place it on the site',
          text: 'Place the configured system: the container at its true 20 x 8 ft, then the trench and nodes to the service.',
          say: 'Drawn to scale on the real parcel. Every foot of trench is priced.',
          sel: '#bgb-modal button[onclick="_bgbStartPlacing()"]', free: true,
          act: 'Press Place Configured System and place it on the pad' },
        { page: /\/editor/, title: 'Utility side',
          text: 'On the Draw tab, Utility holds the utility transformer and the disconnect; Conduit draws the run to the point of interconnection.',
          sel: '#rb-util-meter', free: true, act: 'Add what the site needs, then press Next' },
        { page: /\/editor/, title: 'Run',
          text: 'Run prices the installation from the drawing and calculates what the battery earns.',
          say: 'Calculated on our servers, so every rep gets the same numbers.',
          sel: '#rr-run', allow: ['#rr'], act: 'Press Run' },
        { page: /\/editor/, title: 'The results',
          text: 'Walk the Results rail: site, power, civil, energy, and Financial for the installed cost.',
          say: 'The FENECON unit is quote-required; everything around it is priced here.',
          sel: '#rr', allow: ['#rr'], act: 'Walk the results, then press Next' },
        { page: /\/editor/, title: 'Bill of materials',
          text: 'Open the Estimate tab, then BOM / Sourcing.',
          sel: '#ribbon-tabs .rtab[data-page="estimate"]', free: true, act: 'Click Estimate, then BOM / Sourcing',
          done: function () { return shown('#bom-modal'); } },
        { page: /\/editor/, title: 'Request for Quote',
          text: 'The RFQ goes to FENECON with the whole BOM, the drawing and the load.',
          say: 'FENECON only ever quotes a site that has been screened, drawn and costed.',
          sel: '#bom-rfq button[onclick="openRfqFile()"]', allow: ['#bom-modal'], act: 'Press File RFQ',
          done: function () { return shown('#rfq-file-modal'); } },
        { page: /\/editor/, title: 'Send it',
          text: 'Check the ZIP and the note. Send RFQ files a REAL request through /api/rfq, so send it only on a real project.',
          sel: '#rfq-send-btn', allow: ['#rfq-file-modal'], act: 'Press Send RFQ (or Next to skip)' },
        { page: /\/editor/, title: 'The Quote Desk',
          text: 'Every RFQ, both directions, in one place.',
          go: function () { return '/rfq.html#sent'; }, act: 'Press Open Quote Desk' },

        /* ── Quote Desk (rfq.html) ── */
        { page: /\/rfq/, title: 'Requests sent and received',
          text: 'Sent is what this workspace asked for. Received is what a supplier like FENECON answers: Open BOM, then Send quote.',
          say: 'FENECON prices the unit here, and the client gets one number for the whole project.',
          sel: '#tab-received', free: true, act: 'Show both tabs, then press Next' },
        { page: /\/rfq/, title: 'When the client says yes',
          text: 'The order runs in Omega Logic: Today ringed by Sales, Customers, Plant, Deliver, Stock and Money. Open an order under Sales to show the price box and Approve price & accept order (these write to the order: on a real order only). The guide ends here.',
          say: 'Nothing is charged until the price is approved. Then the plant, shipping and the customer\'s app follow from the order.',
          go: function () { return '/omega-logic'; }, act: 'Press Open Omega Logic' }
      ]
    }
  };

  var D = DEMOS[S.id];
  if (!D) { clear(); return; }
  /* Pages beyond the screening are appended by name so the list stays one
     list (see EXTRA below). */
  if (window.OmegaDemoExtra && window.OmegaDemoExtra[S.id]) D.steps = D.steps.concat(window.OmegaDemoExtra[S.id]);
  var STEPS = D.steps;
  if (S.step >= STEPS.length) S.step = STEPS.length - 1;

  /* ── UI ────────────────────────────────────────────────────────────── */
  var css = '' +
    '#omd{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));width:340px;max-width:calc(100vw - 32px);' +
    'background:#fff;color:#14171A;border:1px solid #E4E8EC;border-radius:8px;box-shadow:0 12px 34px rgba(11,42,61,.28);z-index:2147483000;' +
    'font:14px/1.5 "IBM Plex Sans",system-ui,-apple-system,sans-serif;overflow:hidden}' +
    '#omd .h{background:#0B2A3D;color:#fff;display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px}' +
    '#omd .h b{font:600 11px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.06em;color:#3FAFC6;flex:1}' +
    '#omd .h button{all:unset;cursor:pointer;color:#C9D6E2;font-size:12px;padding:2px 4px}#omd .h button:hover{color:#fff}' +
    '#omd .bar{height:3px;background:#E4E8EC}#omd .bar i{display:block;height:100%;background:#E2701B}' +
    '#omd .b{padding:12px 14px 12px}#omd h4{margin:0 0 4px;font-size:15px}#omd p{margin:0 0 8px;color:#556B82}' +
    '#omd .say{border-left:3px solid #E2701B;padding-left:10px;font-style:italic;color:#14171A;margin:8px 0}' +
    '#omd .act{font-size:12px;font-weight:600;color:#2B5FA8;margin-top:6px}' +
    '#omd .act.ok{color:#2E7D5B}#omd .wait{font-size:12px;color:#B8791B;margin-top:6px}' +
    '#omd .f{display:flex;gap:8px;justify-content:space-between;padding:0 14px 12px}' +
    '#omd .f button{font:inherit;font-size:13px;border:1px solid #DCE2E8;background:#fff;color:#14171A;border-radius:4px;padding:6px 12px;cursor:pointer}' +
    '#omd .f button.p{background:#2B5FA8;border-color:#2B5FA8;color:#fff;font-weight:600}' +
    '#omd .f button:disabled{opacity:.45;cursor:default}' +
    '#omd.min .b,#omd.min .f{display:none}' +
    '.omd-ring{outline:3px solid #E2701B!important;outline-offset:3px!important;border-radius:4px;animation:omdp 1.4s infinite}' +
    '@keyframes omdp{50%{outline-color:rgba(226,112,27,.3)}}' +
    '@media (prefers-reduced-motion:reduce){.omd-ring{animation:none}}' +
    '#omd-t{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#0B2A3D;color:#fff;padding:8px 14px;border-radius:5px;' +
    'font:13px "IBM Plex Sans",system-ui,sans-serif;z-index:2147483001;opacity:0;transition:opacity .2s;pointer-events:none}#omd-t.on{opacity:1}';

  var box, ringed = null, poll = null, toastT = null;

  function toast(m) {
    var t = document.getElementById('omd-t');
    if (!t) { t = document.createElement('div'); t.id = 'omd-t'; document.body.appendChild(t); }
    t.textContent = m; t.className = 'on';
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = ''; }, 2400);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function cur() { return STEPS[S.step]; }
  function here(st) { return !st.page || st.page.test(location.pathname); }

  function ring(el) {
    if (ringed && ringed !== el) ringed.classList.remove('omd-ring');
    ringed = el;
    if (el) {
      el.classList.add('omd-ring');
      var r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }
    }
  }

  function render() {
    var st = cur(), n = S.step + 1, onPage = here(st);
    var doneNow = !!(st.done && onPage && safe(st.done));
    var html = '<div class="h"><b>DEMO · ' + n + ' / ' + STEPS.length + '</b>' +
      '<button data-a="lock" title="Guided refuses clicks off the path; Free lets you click anything">' + (S.lock ? 'Guided' : 'Free') + '</button>' +
      '<button data-a="min">' + (box && /\bmin\b/.test(box.className) ? 'Show' : 'Hide') + '</button>' +
      '<button data-a="exit" title="Switch the demo off in this tab">Exit</button></div>' +
      '<div class="bar"><i style="width:' + Math.round((S.step) / Math.max(1, STEPS.length - 1) * 100) + '%"></i></div>' +
      '<div class="b"><h4>' + esc(st.title) + '</h4><p>' + esc(st.text) + '</p>' +
      (st.say ? '<div class="say">Say: ' + esc(st.say) + '</div>' : '');
    if (!onPage) html += '<div class="wait">This step is on another page. Use the button below to go there.</div>';
    else if (st.sel && !document.querySelector(st.sel)) html += '<div class="wait">Waiting for the page to show this control…</div>';
    else html += '<div class="act' + (doneNow ? ' ok' : '') + '">' + (doneNow ? 'Done. Press Next.' : '→ ' + esc(st.act || '')) + '</div>';
    html += '</div><div class="f"><button data-a="back"' + (S.step === 0 ? ' disabled' : '') + '>Back</button>';
    if (st.go && onPage) html += '<button class="p" data-a="go">' + esc((st.act || 'Go').replace(/^Press /, '')) + ' →</button>';
    else if (!onPage && st.goTo) html += '<button class="p" data-a="goto">Go there →</button>';
    else html += '<button class="p" data-a="next"' + (st.done && !doneNow ? ' title="Not done yet: Next skips it"' : '') + (S.step === STEPS.length - 1 ? ' disabled' : '') + '>Next →</button>';
    html += '</div>';
    box.innerHTML = html;
    ring(onPage && st.sel ? document.querySelector(st.sel) : null);
  }

  function safe(fn) { try { return !!fn(); } catch (e) { return false; } }

  function step(k) {
    S.step = Math.max(0, Math.min(STEPS.length - 1, k)); save(S); render();
  }

  function onBox(e) {
    var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
    if (!a) return;
    var st = cur();
    if (a === 'next') step(S.step + 1);
    else if (a === 'back') step(S.step - 1);
    else if (a === 'min') { box.className = /\bmin\b/.test(box.className) ? '' : 'min'; render(); }
    else if (a === 'lock') { S.lock = !S.lock; save(S); render(); toast(S.lock ? 'Guided: only the next step is clickable.' : 'Free: click anything.'); }
    else if (a === 'exit') { clear(); if (ringed) ringed.classList.remove('omd-ring'); box.parentNode.removeChild(box); clearInterval(poll); document.removeEventListener('click', gate, true); toast('Demo off.'); }
    else if (a === 'go') { var u = st.go(); S.step = S.step + 1; save(S); location.href = u; }
    else if (a === 'goto') { location.href = st.goTo(); }
  }

  /* Guided mode: a click must land on the ringed control, on something the
     step allows (a map, a drawer the control opened), or on the guide. */
  function inside(t, sel) { try { return !!(t.closest && t.closest(sel)); } catch (e) { return false; } }
  function gate(e) {
    if (!S.lock) return;
    var t = e.target; if (!t || !t.closest) return;
    if (t.closest('#omd')) return;
    var st = cur();
    if (!here(st) || st.free) return;
    var ok = (st.sel && inside(t, st.sel)) || (st.allow || []).some(function (s) { return inside(t, s); });
    /* Leaflet panes, popups and controls live inside #map; a popup or
       dropdown the page appends to body for the ringed control is allowed
       by the step's own `allow`. */
    if (ok) return;
    e.preventDefault(); e.stopPropagation();
    toast('Guided demo: ' + (st.act || 'use the highlighted control') + '.');
  }

  function boot() {
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    box = document.createElement('div'); box.id = 'omd'; box.setAttribute('role', 'complementary'); box.setAttribute('aria-label', 'Demo guide');
    document.body.appendChild(box);
    box.addEventListener('click', onBox);
    document.addEventListener('click', gate, true);
    render();
    /* Re-check the step's own condition and the control's presence. Cheap:
       a selector and a predicate twice a second. */
    var last = '';
    poll = setInterval(function () {
      var st = cur(), onPage = here(st);
      var sig = S.step + '|' + (onPage && st.sel ? !!document.querySelector(st.sel) : 'x') + '|' + (onPage && st.done ? safe(st.done) : 'x');
      if (sig !== last) { last = sig; render(); }
      else if (onPage && st.sel && ringed !== document.querySelector(st.sel)) ring(document.querySelector(st.sel));
    }, 500);
  }

  window.OmegaDemo = { state: function () { return load(); }, step: step, exit: function () { clear(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
