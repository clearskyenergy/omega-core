/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Editor adapter and rendering only; financial model is in api/_lib/site-economics.js. */
(function (root) {
  'use strict';
  var fields = [
    ['computeKw','Compute IT load (kW)'], ['pue','PUE (facility / IT power)'],
    ['utilizationPct','Billable utilization (%)'], ['computeRate','Net compute receipts ($ / utilized IT kWh)'],
    ['batteryCost','BESS equipment total ($)'], ['inverterCost','Inverter total ($)'],
    ['chipCost','Compute chips total, all units ($)'], ['otherCapex','All other capex ($): enclosure, cooling, EV, solar, install, utility, fiber'],
    ['serviceKw','Confirmed usable service (kW)'], ['otherPeakKw','Reserved building / other peak (kW)'],
    ['evPeakKw','Reserved simultaneous EV load (kW)'], ['energyRate','Electricity ($/kWh)'],
    ['demandRate','Incremental demand tariff ($/kW/month)'], ['annualOpex','Annual non-energy operating costs ($)'],
    ['annualReplacement','Annual hardware / battery replacement reserve ($)'],
    ['otherAnnualNet','Other annual NET site contribution ($), excluding compute'],
    ['recoveryYears','Capital recovery period (years)'], ['returnPct','Target annual capital return (%)'],
    ['hostSharePct','Host share of remaining cash (%)']
  ];
  var watch = null;
  var defaults = {pue:1.3, utilizationPct:70, batteryCost:24000, inverterCost:2500, chipCost:250000,
    otherAnnualNet:0, recoveryYears:5, returnPct:12, hostSharePct:50, capexMode:'run', revenueBasis:'scenario'};
  function state() { return root.S || {}; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function money(v) { return v == null ? 'Not available' : '$' + Number(v).toLocaleString(undefined,{maximumFractionDigits:0}); }
  function snapshot() {
    var s = state(), inv = {computeUnits:0, computeKw:0, bessUnits:0, bessKw:0, bessKwh:0};
    (s.shapes || []).forEach(function(sh){
      if (sh.kind === 'derdc') { inv.computeUnits++; inv.computeKw += Number(sh.kw) || 0; }
      if (sh.kind === 'bespad' && !sh.omegaController) { inv.bessUnits++; inv.bessKw += Number(sh.kw)||0; inv.bessKwh += Number(sh.kwh)||0; }
    });
    inv.ev = root.evChargerTotals ? root.evChargerTotals() : {};
    return {inventory:inv, run:{at:s.lastRunAt || null, stale:!!s.resultsStale || !!s.running,
      capex:root._COST_TOTAL == null ? null : root._COST_TOTAL,
      annualRevenue:root._YR1_REV == null ? null : root._YR1_REV,
      bess:root._BESS_TOTAL || 0, compute:root._COMPUTE_TOTAL || 0, ev:root._EV_TOTAL || 0,
      solar:root._SOLAR_TOTAL || 0}};
  }
  function el(id) { return document.getElementById('ose-' + id); }
  function collect() {
    var a = {};
    fields.forEach(function(f){a[f[0]] = el(f[0]).value;});
    ['capexMode','revenueBasis','revenueNote'].forEach(function(k){a[k] = el(k).value;});
    return a;
  }
  function save() { state().siteEconomics = collect(); root._workDirty = true; }
  function invalidate() { save(); el('output').textContent = 'Inputs changed. Calculate to refresh the lease budget.'; }
  function fill(a) {
    fields.forEach(function(f){ el(f[0]).value = a[f[0]] == null ? '' : a[f[0]]; });
    ['capexMode','revenueBasis','revenueNote'].forEach(function(k){el(k).value = a[k] || '';});
  }
  function summary() {
    var b = snapshot(), i = b.inventory, e = i.ev;
    var cards = [
      ['Compute', i.computeKw.toLocaleString() + ' kW IT', i.computeUnits + ' units'],
      ['Battery storage', i.bessKw.toLocaleString() + ' kW', i.bessKwh.toLocaleString() + ' kWh · ' + i.bessUnits + ' units'],
      ['Level 2', (e.l2Kw || 0).toLocaleString() + ' kW', (e.l2Units || 0) + ' chargers'],
      ['DC fast charging', (e.dcfcKw || 0).toLocaleString() + ' kW', (e.dcfcUnits || 0) + ' chargers'],
      ['Run capex', money(b.run.capex), 'Full design total'],
      ['Run revenue', money(b.run.annualRevenue), 'Annual · reference only']
    ];
    var h = '<div class="ose-summary-grid">';
    cards.forEach(function(c){h += '<div class="ose-stat"><span>'+esc(c[0])+'</span><strong>'+esc(c[1])+'</strong><small>'+esc(c[2])+'</small></div>';});
    h += '</div><div class="ose-run-note"><span class="ose-badge'+(b.run.stale ? ' ose-stale' : '')+'">'+(b.run.stale ? 'Run needs updating' : b.run.at ? 'Latest Run' : 'Not run')+'</span>';
    h += '<span>'+(b.run.at ? esc(new Date(b.run.at).toLocaleString()) : 'Run the design to populate project costs.')+'</span></div>';
    el('drawing').innerHTML = h;
  }
  function render(r) {
    var rows = [['Status',r.status], ['Modeled total capex',money(r.capex)],
      ['Compute facility peak',r.computePeakKw.toFixed(1)+' kW'],['Available for compute',r.availableComputeKw == null ? 'Unknown' : r.availableComputeKw.toFixed(1)+' kW'],
      ['Annual compute electricity',Math.round(r.annualComputeKwh).toLocaleString()+' kWh'],
      ['Annual compute receipts',money(r.annualComputeRevenue)],['Annual compute energy + demand',money(r.annualEnergyCost)+' + '+money(r.annualDemandCost)],
      ['Annual cash before rent / capital recovery',money(r.annualBeforeRent)],['Annual capital recovery incl. target return',money(r.annualCapitalRecovery)],
      ['Break-even receipts before rent',r.breakEvenRate == null ? 'No billable output' : '$'+r.breakEvenRate.toFixed(3)+' / utilized IT kWh']];
    var h = '<h3>Site economics · '+esc(r.model)+'</h3>';
    if (r.missing.length) h += '<p>Complete: '+esc(r.missing.join(', '))+'. Partial figures below are not an offer.</p>';
    h += '<table>';
    rows.forEach(function(x){h += '<tr><td>'+esc(x[0])+'</td><td>'+esc(x[1])+'</td></tr>';});
    h += '</table><h3>'+(r.offer ? 'Indicative host offer: '+money(r.offer.monthly)+'/month · '+money(r.offer.annual)+'/year' : 'No lease offer available')+'</h3>';
    if(r.offer) h += '<p>Maximum affordable flat rent: '+money(r.offer.ceilingAnnual)+'/year. '+esc(r.offer.label)+'.</p>';
    h += '<ul>'; r.notes.forEach(function(n){h += '<li>'+esc(n)+'</li>';}); h += '</ul>';
    el('output').innerHTML = h;
    el('output').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function calculate() {
    save(); var s = state(), a = collect(), b = snapshot(), signature = JSON.stringify({a:a,b:b});
    var output = el('output'); output.textContent = 'Calculating…'; el('calculate').disabled = true;
    var user = root._currentUser || (root.firebase && root.firebase.auth().currentUser);
    Promise.resolve().then(function(){
      if(!user) throw new Error('Sign in to calculate site economics.');
      return user.getIdToken();
    }).then(function(token){
      return fetch('/api/compute-lease',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({action:'site-economics',rep:{},assumptions:a,inventory:b.inventory,run:b.run})});
    }).then(function(response){return response.json().then(function(j){if(!response.ok) throw new Error(j.error || 'Calculation failed'); return j;});})
      .then(function(r){
        if(el('output') !== output) return;
        if(state() !== s || JSON.stringify({a:collect(),b:snapshot()}) !== signature) { output.textContent='Drawing, run or inputs changed. Calculate again.'; return; }
        render(r);
      }).catch(function(e){if(el('output') === output) output.textContent=e.message;})
      .then(function(){if(el('output') === output) el('calculate').disabled=false;});
  }
  function open() {
    if(watch) { clearInterval(watch); watch=null; }
    var old = el('modal'); if(old) old.remove();
    var box = document.createElement('div'); box.id='ose-modal'; box.setAttribute('role','dialog'); box.setAttribute('aria-label','Compute and site economics');
    var css = '#ose-modal{position:fixed;inset:4vh 4vw;margin:auto;max-width:1120px;z-index:200000;background:#101b2c;color:#e4edf7;border:1px solid #36465d;border-radius:16px;box-shadow:0 0 0 100vmax #0009,0 24px 80px #0006;font:14px/1.5 Arial,sans-serif;display:flex;flex-direction:column;overflow:hidden;text-align:left;color-scheme:dark}'
      + '#ose-modal *{box-sizing:border-box}#ose-modal h2,#ose-modal h3,#ose-modal p{margin:0}#ose-modal h2{font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-.3px}#ose-modal h3{font-size:15px;font-weight:700;line-height:1.4}'
      + '#ose-modal .ose-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 28px;background:#101b2c;border-bottom:1px solid #2b3b50;flex-shrink:0}#ose-modal .ose-header p{color:#9baec5;margin-top:5px;font-size:13px}'
      + '#ose-modal .ose-body{overflow:auto;padding:24px 28px 32px;min-height:0;overscroll-behavior:contain}#ose-modal .ose-section{margin-top:22px;padding:22px;background:#142237;border:1px solid #2c3d55;border-radius:12px}#ose-modal .ose-section-head{display:flex;align-items:baseline;gap:10px;margin-bottom:18px}#ose-modal .ose-step{font:700 11px Arial;color:#7dd3fc;border:1px solid #375674;border-radius:5px;padding:3px 6px}'
      + '#ose-modal .ose-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px 22px;align-items:start}#ose-modal .ose-grid-two{grid-template-columns:repeat(2,minmax(0,1fr))}#ose-modal .ose-field{display:flex;flex-direction:column;gap:7px;min-width:0;font-size:13px;font-weight:500;color:#d8e4f3}#ose-modal .ose-field-title{min-height:20px}#ose-modal .ose-full{grid-column:1/-1}'
      + '#ose-modal input,#ose-modal select{display:block;width:100%;min-width:0;height:42px;margin:0;background:#0e1b2c;color:#f1f5f9;border:1px solid #496079;border-radius:7px;padding:9px 11px;font:14px Arial;box-shadow:none}#ose-modal select{padding-right:28px}#ose-modal small,#ose-modal .ose-help{font-size:12px;line-height:1.55;color:#9fb2ca;font-weight:400}#ose-modal .ose-help{margin-top:13px}#ose-modal .ose-field small{margin-top:-2px}'
      + '#ose-modal button{background:#1c344e;color:#eff6ff;border:1px solid #4b6682;border-radius:7px;padding:9px 14px;min-height:38px;font:600 12px/1.4 Arial;cursor:pointer;white-space:normal}#ose-modal button:hover{background:#294563}#ose-modal button:disabled{opacity:.5;cursor:wait}#ose-modal input:focus,#ose-modal select:focus,#ose-modal button:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}'
      + '#ose-modal .ose-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}#ose-modal .ose-primary{background:#1478a0;border-color:#2997bf;color:#fff;font-size:14px;padding:11px 20px}#ose-modal .ose-primary:hover{background:#198db8}#ose-modal .ose-footer{padding:15px 28px;border-top:1px solid #304158;display:flex;align-items:center;justify-content:space-between;gap:16px;background:#101b2c;flex-shrink:0}#ose-modal .ose-footer span{font-size:12px;color:#a5b6cb}'
      + '#ose-modal .ose-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}#ose-modal .ose-stat{padding:14px 16px;border:1px solid #30445c;border-radius:9px;background:#142237;min-width:0}#ose-modal .ose-stat span{display:block;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#9db2cd}#ose-modal .ose-stat strong{display:block;font-size:20px;line-height:1.3;margin:6px 0 3px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}#ose-modal .ose-stat small{display:block}'
      + '#ose-modal .ose-run-note{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:12px;color:#9fb2ca;font-size:12px}#ose-modal .ose-badge{background:#18384a;color:#9edff6;border-radius:20px;padding:4px 9px;font-size:11px}#ose-modal .ose-stale{background:#44341c;color:#f5cc86}#ose-modal .ose-intro{margin-bottom:14px;color:#aebfd3;font-size:13px}'
      + '#ose-modal #ose-output{margin-top:22px;font-size:13px;line-height:1.65;color:#c2d3e7}#ose-modal #ose-output:empty{display:none}#ose-modal #ose-output h3{margin:20px 0 12px;font-size:17px;color:#f1f5f9}#ose-modal #ose-output p{margin:10px 0}#ose-modal #ose-output table{width:100%;border-collapse:collapse;table-layout:fixed}#ose-modal #ose-output td{padding:10px 12px;border-bottom:1px solid #2c3e55;overflow-wrap:anywhere}#ose-modal #ose-output td:last-child{text-align:right;font-variant-numeric:tabular-nums;color:#f1f5f9;width:35%}#ose-modal #ose-output li{margin:8px 0}#ose-modal #ose-output ul{padding-left:20px}'
      + '@media(max-width:760px){#ose-modal{inset:12px;max-width:none}#ose-modal .ose-header{padding:18px}#ose-modal .ose-body{padding:18px}#ose-modal .ose-section{padding:16px}#ose-modal .ose-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#ose-modal .ose-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#ose-modal .ose-footer{padding:12px 18px}#ose-modal .ose-stat strong{font-size:18px}}'
      + '@media(max-width:480px){#ose-modal .ose-grid{grid-template-columns:minmax(0,1fr)}#ose-modal h2{font-size:18px}#ose-modal .ose-header p{font-size:12px}#ose-modal .ose-footer{flex-direction:column;align-items:stretch;gap:8px}#ose-modal .ose-footer span{text-align:center}#ose-modal .ose-stat{padding:11px}#ose-modal .ose-stat strong{font-size:16px}}';
    function section(step, title, content) { return '<section class="ose-section"><div class="ose-section-head"><span class="ose-step">'+step+'</span><h3>'+title+'</h3></div>'+content+'</section>'; }
    function field(k, title, hint) {
      var original = ''; fields.forEach(function(f){if(f[0]===k) original=f[1];});
      return '<label class="ose-field"><span class="ose-field-title">'+title+'</span><input id="ose-'+k+'" aria-label="'+esc(original)+'" type="number" step="any">'+(hint ? '<small>'+hint+'</small>' : '')+'</label>';
    }
    var h = '<header class="ose-header"><div><h2>Compute + site economics</h2><p>Project costs, operating assumptions and an indicative land-lease budget.</p></div><button id="ose-close">Close</button></header><div class="ose-body">'
      + '<div class="ose-intro">On the drawing · latest design Run</div><div id="ose-drawing"></div>'
      + '<div class="ose-actions"><button id="ose-refresh">Read drawing + latest Run</button><button id="ose-preset">Use 70 kW compute / R60 scenario</button></div>'
      + '<p class="ose-help">The preset models 2 × 35 kW compute units and a 60 kW CleanCell R60. It does not place equipment. The $250,000 chip allowance covers both units; battery capacity and inverter compatibility need confirmation.</p>';
    h += section('01','Cost basis', '<div class="ose-grid ose-grid-two"><label class="ose-field ose-full"><span>Project cost source</span><select id="ose-capexMode" aria-label="Capex basis"><option value="run">Full design Run total</option><option value="itemized">Itemized scenario</option></select><small>Choose one total. Equipment allowances below apply only to the itemized scenario.</small></label>'
      + field('batteryCost','BESS equipment ($)') + field('inverterCost','Inverter ($)')
      + field('chipCost','Compute chips — all units ($)') + field('otherCapex','Other project costs ($)','Enclosure, cooling, EV, solar, installation, utility and fiber.') + '</div>');
    h += section('02','Compute & revenue', '<div class="ose-grid">'
      + field('computeKw','Compute IT load (kW)') + field('pue','Facility / IT power (PUE)') + field('utilizationPct','Billable utilization (%)')
      + field('computeRate','Net compute receipts ($/IT kWh)','Per utilized IT kWh, after operator deductions.')
      + '<label class="ose-field"><span class="ose-field-title">Revenue basis</span><select id="ose-revenueBasis"><option value="scenario">Manual sensitivity assumption</option><option value="manual">Commercial / SLA terms</option></select><small>Sensitivity inputs are not market quotes.</small></label>'
      + field('otherAnnualNet','Other net site income ($/year)','Exclude compute. Reconcile the Run revenue to net contribution.')
      + '<label class="ose-field ose-full"><span>Revenue source / SLA note</span><input id="ose-revenueNote" placeholder="Describe your rate assumption or commercial terms; note if the SLA is pending."></label></div>');
    h += section('03','Power & electricity', '<div class="ose-grid">'
      + field('serviceKw','Confirmed usable service (kW)') + field('otherPeakKw','Building / other peak (kW)') + field('evPeakKw','Simultaneous EV load (kW)')
      + field('energyRate','Electricity ($/kWh)') + field('demandRate','Demand tariff ($/kW/month)')
      + '</div><p class="ose-help">Reserve peak EV capacity. Average charger utilization does not establish available power.</p>');
    h += section('04','Operating costs & lease target', '<div class="ose-grid ose-grid-two">'
      + field('annualOpex','Operating costs ($/year)','Fiber, maintenance, insurance and fees not deducted from receipts.')
      + field('annualReplacement','Replacement reserve ($/year)','Hardware and battery replacement allowance.')
      + field('recoveryYears','Capital recovery (years)') + field('returnPct','Target capital return (%)')
      + field('hostSharePct','Host share of remaining cash (%)') + '</div>');
    h += '<div id="ose-output" aria-live="polite"></div></div><footer class="ose-footer"><span>Enter 0 explicitly for costs that do not apply.</span><button class="ose-primary" id="ose-calculate">Calculate lease budget</button></footer>';
    box.innerHTML='<style>'+css+'</style>'+h; document.body.appendChild(box);
    var a={}, saved=state().siteEconomics || {}; Object.keys(defaults).forEach(function(k){a[k]=defaults[k];}); Object.keys(saved).forEach(function(k){a[k]=saved[k];});
    if(a.computeKw == null) a.computeKw=snapshot().inventory.computeKw || '';
    fill(a); summary();
    el('close').onclick=function(){save();clearInterval(watch);watch=null;box.remove();};
    el('calculate').onclick=calculate;
    box.onchange=function(e){if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT') invalidate();};
    box.oninput=function(e){if(e.target.tagName==='INPUT') invalidate();};
    el('preset').onclick=function(){var v=collect();v.computeKw=70;v.batteryCost=24000;v.inverterCost=2500;v.chipCost=250000;v.capexMode='itemized';fill(v);invalidate();};
    el('refresh').onclick=function(){
      var b=snapshot(), v=collect();v.computeKw=b.inventory.computeKw || '';v.capexMode='run';
      v.evPeakKw=(Number(b.inventory.ev.l2Kw)||0)+(Number(b.inventory.ev.dcfcKw)||0);
      fill(v);summary();invalidate();
    };
    var drawingSignature=JSON.stringify(snapshot());
    watch=setInterval(function(){
      var next=JSON.stringify(snapshot());
      if(next !== drawingSignature){drawingSignature=next;summary();el('output').textContent='Drawing or Run changed. Read the drawing and calculate again.';}
    },1000);
    el('close').focus();
  }
  function injectFinance() {
    var page = document.querySelector('#ribbon .ribbon-page[data-page="finance"]');
    if (!page || document.getElementById('rb-site-economics')) return;
    var panel = document.createElement('div'); panel.className = 'rpanel';
    panel.innerHTML = '<div class="rpanel-body"><button class="rbtn" id="rb-site-economics" title="Compute + Site Economics — use the drawing and Run to calculate an indicative land lease"><span class="rb-ico" style="color:#38bdf8">$</span><span class="rb-lbl">Compute +<br>Site Economics</span></button></div><div class="rpanel-cap">Site Economics &amp; Land Lease</div>';
    page.appendChild(panel);
    document.getElementById('rb-site-economics').onclick = open;
    try { if (root.OmegaMode && root.OmegaMode.keep) root.OmegaMode.keep(/rb-site-economics/); } catch (e) {}
  }
  root.OmegaSiteEconomics = {open:open,snapshot:snapshot,injectFinance:injectFinance};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectFinance);
  else injectFinance();
})(window);
