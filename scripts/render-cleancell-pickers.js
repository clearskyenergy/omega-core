/* Copyright 2025-2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Execute the editor's real placement functions and pad modal, not copies.
 * Auth/network/map rendering are not exercised; no production data is written.
 * PLAYWRIGHT=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/render-cleancell-pickers.js */
'use strict';
var fs=require('fs'), path=require('path'), assert=require('assert');
var ROOT=path.resolve(__dirname,'..');
var ed=fs.readFileSync(path.join(ROOT,'editor.html'),'utf8');
var ref=fs.readFileSync(path.join(ROOT,'omega-cleancell-catalog.js'),'utf8');
function fn(name){
  var at=ed.indexOf('function '+name+'(');
  assert(at>=0 && ed.indexOf('function '+name+'(',at+1)<0, 'unique native function '+name);
  var i=ed.indexOf('{',at), depth=0;
  for(;i<ed.length;i++){ if(ed[i]==='{') depth++; else if(ed[i]==='}' && --depth===0) break; }
  var out=ed.slice(at,i+1); new Function(out); return out;
}
function object(name){
  var at=ed.indexOf('const '+name+' = {'); assert(at>=0, name+' exists');
  var end=ed.indexOf('\n};',at); assert(end>at,name+' ends');
  return ed.slice(at,end+3);
}
var funcs=['_bespadModels','_padCurrentSpec','_openPadConfig','_fillPadModels','_padModelChange','_padScaleNote',
  '_padReadSpec','_padModalCancel','_padModalConfirm','_doPlaceBesPadGrid','_doPlaceBesPad','_asmElecFromSpec',
  '_asmAuxSpecs','_cbChecked','_padAsmToggle','_placeBesPad','applyBMCatalog'].map(fn).join('\n');
var padStart=ed.indexOf('<!-- BESS pad picker modal -->'), padEnd=ed.indexOf('<!-- Parking stalls picker modal -->',padStart);
assert(padStart>=0&&padEnd>padStart,'actual pad markup');
var fields=['name','mfr','model','kwh','usable','kw','dur','dcv','eqcost','inv','ikva','xfmr','disco','notes','acv','qty'].map(function(n){return '<input id="bm-'+n+'">';}).join('');
var html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'
  +'body{font:14px system-ui;margin:0;padding:12px;box-sizing:border-box;background:#25292d;color:#e9edef;--surface:#30363d;--text:#e9edef;--sub:#adb5be;--panel:#25292d;--border:#536170;--accent:#7bbcf5;--navy:#152539;--gold:#e8bb58;--scrim:rgba(0,0,0,.5)}'
  +'select,input{box-sizing:border-box;max-width:100%}select{width:100%}.cal-box{width:440px;background:var(--panel);padding:18px;border-radius:12px}.cal-btns{display:flex;justify-content:flex-end;gap:10px}.cal-btns button{padding:10px;border:0;border-radius:6px}'
  +'#sc{position:relative;height:850px}.hidden-fields{display:none}#pad-modal{position:fixed!important}#bm-catalog-preview{overflow-wrap:anywhere}</style></head><body>'
  +'<h2>Battery catalog</h2><select id="bm-catalog" onchange="applyBMCatalog()"><option value="">Choose a model</option><optgroup label="Legacy"><option value="CC-R60">CleanCell R60</option></optgroup></select>'
  +'<div id="bm-catalog-preview"></div><div class="hidden-fields">'+fields
  +'<select id="bm-chem"><option>LFP</option></select><input type="checkbox" id="bm-inc-pcs"><input type="checkbox" id="bm-inc-disco"><input type="checkbox" id="bm-inc-xfmr"><div id="bm-pq-status"></div><button id="bm-compare-btn"></button></div>'
  +'<div id="sc">'+ed.slice(padStart,padEnd)+'</div><script>'
  +'var S={pxPerFt:5,shapeStyle:"solid",shapes:[],elements:[],bessList:[]}; var _pendingPadPt=null; var BESPAD_DEFAULT_LF=19.875,BESPAD_DEFAULT_WF=8,SHAPE_STROKE="#fff",seq=0;'
  +'function uid(){return "test-"+(++seq);}function renderShape(){}function updShapeCount(){}function pushHist(){}function showBanner(){}function setMode(){}'
  +'function _ppCollectFleet(){return {totalKw:0,totalKwh:0};}'
  +object('GOTION_CATALOG_DIMS')+'\n'+object('BESS_CATALOG')+'\n'+funcs+'\n</script><script>'+ref+'</script></body></html>';
var chromium=require(process.env.PLAYWRIGHT||'playwright').chromium;
(async function(){
 var browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 var total=0;
 try {
  for(var width of [1280,390]){
   var page=await browser.newPage({viewport:{width:width,height:900}}), errors=[];
   page.on('pageerror',function(e){errors.push(e.message);});
   await page.route('**/*',function(route){return route.abort();});
   await page.setContent(html);
   await page.waitForFunction(function(){return !!document.getElementById('bm-cat-cleancell-revh');});
   var report=await page.evaluate(function(){
    var checks=0;
    function ok(v,m){if(!v)throw new Error(m);checks++;}
    function val(id,v){document.getElementById(id).value=String(v);}
    function choosePad(key){var models=_bespadModels(),i=models.findIndex(function(m){return m.id===key;});ok(i>=0,'placement key exists '+key);val('pad-model',i);_padModelChange();}
    var keys=Object.keys(OmegaCleanCellCatalog.entries());
    ok(document.querySelector('#bm-catalog optgroup').id==='bm-cat-cleancell-revh','sizing featured group first');
    ok(document.querySelectorAll('#bm-cat-cleancell-revh option').length===3,'three sizing entries');
    _fillPadModels();_padModelChange();
    ok(document.querySelector('#pad-model optgroup').label==='Featured - CleanCell US','placement featured group first');
    ok(_bespadModels().slice(0,3).every(function(m,i){return m.id===keys[i];}),'placement keys match shared references in order');
    ok(_bespadModels().some(function(m){return m.id==='CC-R60';}),'existing R60 preserved');
    ok(_bespadModels().some(function(m){return m.id==='GOTION-EDGE-760';}),'existing Gotion preserved');
    keys.forEach(function(key){
     val('bm-catalog',key);val('bm-usable',777);val('bm-eqcost',999);val('bm-ikva',555);val('bm-acv',13800);
     applyBMCatalog();var p=BESS_CATALOG[key];
     ok(+document.getElementById('bm-kw').value===p.kw,'selected AC power '+key);
     ok(+document.getElementById('bm-kwh').value===p.kwh,'selected DC energy '+key);
     ok(document.getElementById('bm-usable').value===''&&document.getElementById('bm-eqcost').value==='','unknown energy/price not inherited');
     ok(document.getElementById('bm-ikva').value===''&&document.getElementById('bm-acv').value==='480','unknown kVA and AC voltage not inherited');
     ok(document.getElementById('bm-inc-pcs').checked===p._incPCS,'PCS physical arrangement honored '+key);
     ok(!document.getElementById('bm-inc-xfmr').checked&&!document.getElementById('bm-inc-disco').checked,'no size-heuristic integrated gear');
     choosePad(key);var needs=key!==keys[0];
     ok((document.getElementById('pad-custom-row').style.display==='flex')===needs,'unknown footprints ask for dimensions');
     if(needs){
      document.getElementById('pad-modal').style.display='flex';_pendingPadPt={x:100,y:100};
      val('pad-lf','');val('pad-wf','');var before=S.shapes.length;_padModalConfirm();
      ok(S.shapes.length===before&&document.getElementById('pad-modal').style.display==='flex','blank footprint never places a generic container');
      val('pad-lf','Infinity');val('pad-wf',8);_padModalConfirm();ok(S.shapes.length===before,'nonfinite dimensions refused');
      val('pad-lf',-1);_padModalConfirm();ok(S.shapes.length===before,'negative dimensions refused');
      val('pad-lf',20);val('pad-wf',8);
     }
     var spec=_padReadSpec();ok(spec&&spec.catalogKey===key,'manual footprint preserves SKU');
     var e=_asmElecFromSpec(spec);ok(e.key===key&&e.kw===p.kw&&e.kwh===p.kwh&&e.cost===null,'drawing reads exact power/energy and unknown price');
     _doPlaceBesPad({x:100,y:100},spec,{assembly:false,fence:false,bollards:false});
     var sh=S.shapes[S.shapes.length-1];ok(sh.catalogKey===key&&sh.unitKw===p.kw&&sh.unitKwh===p.kwh,'plain pad carries catalog and ratings');
     ok(sh.geometryBasis===(needs?'user-entered-unverified':'reference-cabinet-only'),'geometry provenance survives placement');
     _doPlaceBesPad({x:100,y:100},spec,{assembly:true,fence:false,bollards:false});
     sh=S.shapes[S.shapes.length-1];ok(sh.parts.some(function(x){return x.key==='pcs';})===!p._incPCS,'assembly PCS matches catalog');
     val('pad-qty',2);val('pad-cols',2);document.getElementById('pad-assembly').checked=false;document.getElementById('pad-fence').checked=false;document.getElementById('pad-bollards').checked=false;
     _pendingPadPt=null;_padModalConfirm();ok(window._padQuickPlace&&_padCurrentSpec().catalogKey===key,'quick-place saves identity');
     before=S.shapes.length;_placeBesPad({x:200,y:200});ok(S.shapes.length===before+2,'quick placement honors requested count');
     ok(S.shapes.slice(-2).every(function(x){return x.catalogKey===key&&x.unitKw===p.kw&&x.unitKwh===p.kwh;}),'every clustered unit has the correct ratings');
     _fillPadModels();ok(_bespadModels()[+document.getElementById('pad-model').value].id===key,'reopening preserves selected SKU after featured sorting');
    });
    window._padSpec=null;choosePad(keys[1]);val('pad-lf',77);val('pad-wf',88);choosePad(keys[2]);
    ok(document.getElementById('pad-lf').value===''&&document.getElementById('pad-wf').value==='','new unknown product starts with no dimensions');
    window._padModelKey=null;window._padModelIdx=1;var oldKey=Object.keys(GOTION_CATALOG_DIMS)[1];_bespadModels();
    ok(window._padModelKey===oldKey,'legacy numeric choice migrates before featured insertion');
    choosePad('CC-R60');_fillPadModels();ok(_bespadModels()[+document.getElementById('pad-model').value].id==='CC-R60','existing model survives rebuild');
    val('pad-model','custom');_padModelChange();val('pad-lf',9);val('pad-wf',7);_pendingPadPt=null;_padModalConfirm();
    ok(_padCurrentSpec().lf===9&&_padCurrentSpec().wf===7&&!_padCurrentSpec().catalogKey,'custom quick-place retained');
    _fillPadModels();ok(document.getElementById('pad-model').value==='custom','custom selection retained');
    var oldName=BESS_CATALOG['GOTION-EDGE-760'].model;
    BESS_CATALOG['GOTION-EDGE-760'].model='<img src=x onerror=alert(1)>';
    _fillPadModels();ok(!document.querySelector('#pad-model img'),'supplier name cannot inject HTML');BESS_CATALOG['GOTION-EDGE-760'].model=oldName;
    var sel=document.getElementById('bm-catalog');sel.value='CC-R60';
    var group=document.createElement('optgroup');group.label='Tenant products';group.appendChild(document.createElement('option'));
    sel.insertBefore(group,sel.querySelector('optgroup'));
    return checks;
   });
   total+=report;
   await page.waitForFunction(function(){return document.querySelector('#bm-catalog optgroup').id==='bm-cat-cleancell-revh';});
   assert.strictEqual(await page.locator('#bm-catalog').inputValue(),'CC-R60','featured sorting never changes the current selection');total++;
   await page.evaluate(function(){
    var key=Object.keys(OmegaCleanCellCatalog.entries())[0];document.getElementById('bm-catalog').value=key;applyBMCatalog();
    _fillPadModels();document.getElementById('pad-model').value='0';_padModelChange();document.getElementById('pad-modal').style.display='flex';
   });
   assert(await page.evaluate(function(){return document.documentElement.scrollWidth<=window.innerWidth;}),'no horizontal page overflow at '+width);total++;
   assert.strictEqual(errors.length,0,'no page errors: '+errors.join(';'));total++;
   if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'cleancell-pickers-'+width+'.png')});}
   console.log(width+'px: '+(report+3)+' native picker / placement checks passed');await page.close();
  }
 } finally{await browser.close();}
 console.log('CleanCell native picker browser regression: '+total+' checks passed');
})().catch(function(e){console.error(e);process.exitCode=1;});
