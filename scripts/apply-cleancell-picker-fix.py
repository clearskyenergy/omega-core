from pathlib import Path
root=Path('.')
p=root/'omega-cleancell-catalog.js'
s=p.read_text()
s=s.replace("p.catalogStatus = 'planning-verify';", "p.integrationBasis = 'catalog-package-arrangement';\n      p.catalogStatus = 'planning-verify';")
marker='  function install(catalog, doc) {'
assert s.count(marker)==1
helpers="""  /* One reference record drives both electrical selection and placement.
   * Missing released dimensions must not be replaced by generic containers. */
  function pickerLabel(p) {
    var name = p.sku === 'CC290-125' ? 'CC290/125' :
      (p.sku === 'CC-LGJP2-1000' ? 'LG JP-2 (BABA-oriented)' : 'Smart Module (non-BABA)');
    return 'CleanCell ' + name + ' - ' + p.kw + ' kW / '
      + (p.nominalEnergyApproximate ? '~' : '') + p.kwh + ' kWh DC';
  }
  function padModels(legacy, catalog) {
    var out = [], ids = mergeInto(catalog), seen = {};
    for (var i = 0; i < ids.length; i++) {
      var key = ids[i], p = catalog[key];
      seen[key] = true;
      out.push({ id: key, name: p.model, pickerLabel: pickerLabel(p),
        lf: p.widthFt, wf: p.depthFt, sysQty: 0, featured: true,
        requiresDimensions: !(p.widthFt > 0 && p.depthFt > 0),
        geometryBasis: p.dimensionsStatus,
        geometryNote: p.packaging + ' ' + p.dims
          + '. Reference layout only; confirm external equipment footprints and required clearances.' });
    }
    for (var j = 0; j < (legacy || []).length; j++) {
      if (!seen[legacy[j].id]) out.push(legacy[j]);
    }
    return out;
  }
  function featureFirst(sel, group) {
    var children = sel.children, first = null;
    for (var i = 0; i < children.length; i++) {
      var c = children[i], tag = String(c.tagName || c.tag || '').toLowerCase();
      if (c === group) return;
      if (tag === 'option' && !c.value) continue;
      first = c; break;
    }
    if (first) sel.insertBefore(group, first);
  }

"""
s=s.replace(marker,helpers+marker)
s=s.replace("group.label = 'CleanCell US - Rev H (planning specifications)';", "group.label = 'Featured - CleanCell US';")
s=s.replace("option.textContent = p.model + ' | ' + p.kw + ' kW AC / ' + (p.nominalEnergyApproximate ? '~' : '') + p.kwh + ' kWh DC';", "option.textContent = pickerLabel(p);")
s=s.replace("    var panel = doc.getElementById('bm-cleancell-revh-details');", """    featureFirst(sel, group);
    /* Tenant products may arrive after the reference script. Keep featured
     * presentation first without changing a tenant's products or selection. */
    if (root.MutationObserver && !sel._omegaCleanCellFeaturedObserver) {
      var observer = new root.MutationObserver(function () { featureFirst(sel, group); });
      observer.observe(sel, { childList: true });
      sel._omegaCleanCellFeaturedObserver = observer;
    }
    var panel = doc.getElementById('bm-cleancell-revh-details');""")
s=s.replace("var api = { entries: entries, mergeInto: mergeInto, install: install, revision: 'H' };", "var api = { entries: entries, mergeInto: mergeInto, install: install, padModels: padModels,\n    pickerLabel: pickerLabel, revision: 'H', build: '20261010-featured2' };")
s=s.replace("    if (catalog) install(catalog, root.document);", """    if (catalog) {
      install(catalog, root.document);
      /* Refresh an already-open placement picker after an asynchronous load. */
      if (typeof root._fillPadModels === 'function') root._fillPadModels();
      if (typeof root._padModelChange === 'function') root._padModelChange();
    }""")
p.write_text(s)
p=root/'omega-bess-products.js'
s=p.read_text().replace('20261009-revh1','20261010-revh2').replace("if (!doc) return;", "if (!doc || typeof doc.getElementById !== 'function') return;")
p.write_text(s)
p=root/'editor.html'; s=p.read_text()
def replace_func(name,new):
 global s
 start=s.index('function '+name+'(')
 assert s.find('function '+name+'(',start+1)<0,name
 end=s.index('\n}',start)+2
 s=s[:start]+new.rstrip()+s[end:]
old="""  }catch(e){}
  return list;
}
var BESPAD_DEFAULT_LF"""
new="""  }catch(e){}
  /* Preserve a legacy numeric quick-place choice before featured rows move
     the positions. New choices remember the catalog key, never an index. */
  if(!window._padModelKey && window._padModelIdx!=null && list[window._padModelIdx])
    window._padModelKey=list[window._padModelIdx].id;
  if(window.OmegaCleanCellCatalog && typeof BESS_CATALOG!=='undefined')
    return OmegaCleanCellCatalog.padModels(list, BESS_CATALOG);
  return list;
}
var BESPAD_DEFAULT_LF"""
assert s.count(old)==1
s=s.replace(old,new)
replace_func('_padCurrentSpec',"""function _padCurrentSpec(){
  if(window._padSpec && window._padSpec.lf>0 && window._padSpec.wf>0)
    return JSON.parse(JSON.stringify(window._padSpec));
  var models=_bespadModels(), sm=null;
  for(var i=0;i<models.length;i++) if(models[i].id===window._padModelKey) sm=models[i];
  sm=sm||models[0];
  if(sm && sm.requiresDimensions) return null;
  if(sm) return { lf:sm.lf, wf:sm.wf, model:sm.name, catalogKey:sm.id,
    geometryBasis:sm.geometryBasis||'', geometryNote:sm.geometryNote||'' };
  return { lf:BESPAD_DEFAULT_LF, wf:BESPAD_DEFAULT_WF, model:'BESS Pad' };
}""")
s=s.replace("  window._padQuickPlace=true;\n  try{ if(typeof setMode", "  /* Quick-place is enabled only after a valid configuration is confirmed. */\n  try{ if(typeof setMode",1)
old="""    var opts={ assembly:true, fence:true, bollards:true };
    var qty=(window._padQty&&window._padQty>1)?window._padQty:1;
    var cols=(window._padCols||0);
    if(qty>1){ _doPlaceBesPadGrid(p,spec,opts,qty,cols); }
    else { _doPlaceBesPad(p,spec,opts); }
    return;"""
new="""    if(spec){
      var opts=window._padOpts||{ assembly:true, fence:true, bollards:true };
      var qty=(window._padQty&&window._padQty>1)?window._padQty:1;
      var cols=(window._padCols||0);
      if(qty>1){ _doPlaceBesPadGrid(p,spec,opts,qty,cols); }
      else { _doPlaceBesPad(p,spec,opts); }
      return;
    }
    window._padQuickPlace=false;"""
assert s.count(old)==1
s=s.replace(old,new)
replace_func('_fillPadModels',"""function _fillPadModels(){
  var sel=document.getElementById('pad-model'); if(!sel) return;
  var previous=sel.value==='custom' ? 'custom' :
    ((sel._padModelKeys||[])[parseInt(sel.value,10)]||window._padModelKey||'');
  var models=_bespadModels(), selected=-1, group='', keys=[];
  /* Build DOM nodes, not HTML from a supplier's model name. */
  sel.innerHTML='';
  var target=sel;
  for(var i=0;i<models.length;i++){
    var m=models[i], label=m.featured?'Featured - CleanCell US':'Other battery systems';
    if(group!==label){
      target=document.createElement('optgroup'); target.label=label;
      sel.appendChild(target); group=label;
    }
    var opt=document.createElement('option'); opt.value=String(i);
    var dims=m.requiresDimensions?'enter footprint':
      ((Math.round(m.lf*1000)/1000)+' ft x '+(Math.round(m.wf*1000)/1000)+' ft');
    opt.textContent=(m.pickerLabel||m.name)+' ('+dims+')';
    opt.setAttribute('data-catalog-key',m.id);
    target.appendChild(opt); keys.push(m.id);
    if(m.id===previous) selected=i;
  }
  var custom=document.createElement('option'); custom.value='custom';
  custom.textContent='Custom size...'; sel.appendChild(custom);
  sel._padModelKeys=keys;
  if(previous==='custom') sel.value='custom';
  else if(selected>=0) sel.value=String(selected);
}""")
replace_func('_padModelChange',"""function _padModelChange(){
  var sel=document.getElementById('pad-model'), row=document.getElementById('pad-custom-row');
  if(!sel||!row) return;
  var models=_bespadModels(), sm=sel.value==='custom'?null:models[parseInt(sel.value,10)];
  var needs=!!(sm&&sm.requiresDimensions), key=sm?sm.id:'custom';
  row.style.display=(sel.value==='custom'||needs)?'flex':'none';
  if(needs && sel._padDimensionKey!==key){
    var saved=window._padSpec, same=saved&&saved.catalogKey===key;
    var lf=document.getElementById('pad-lf'), wf=document.getElementById('pad-wf');
    if(lf) lf.value=same?saved.lf:'';
    if(wf) wf.value=same?saved.wf:'';
  }
  sel._padDimensionKey=key;
  var qtyEl=document.getElementById('pad-qty');
  if(sm && sm.sysQty && qtyEl) qtyEl.value=sm.sysQty;
  _padScaleNote();
}""")
replace_func('_padScaleNote',"""function _padScaleNote(){
  var note=document.getElementById('pad-scale-note'); if(!note) return;
  var sel=document.getElementById('pad-model'), models=_bespadModels();
  var sm=sel&&sel.value!=='custom'?models[parseInt(sel.value,10)]:null;
  var ppf=(S.pxPerFt && S.pxPerFt>0);
  note.setAttribute('role','status');
  note.style.color=sm&&sm.geometryNote?'var(--gold)':'var(--sub)';
  if(sm&&sm.requiresDimensions){
    note.textContent='Enter the battery enclosure length and width in feet before placing. '
      +sm.geometryNote+' User-entered dimensions are not manufacturer-verified.';
    return;
  }
  note.textContent=(ppf?'Drawing calibrated - geometry uses the listed dimensions.':
    'Not calibrated - preview scale only. Use Calibrate for true scale.')
    +(sm&&sm.geometryNote?' '+sm.geometryNote:'');
}
/* Keep the product identity when its footprint must be entered manually. */
function _padReadSpec(){
  var sel=document.getElementById('pad-model'), models=_bespadModels();
  var sm=sel&&sel.value!=='custom'?models[parseInt(sel.value,10)||0]:null;
  var custom=sel&&sel.value==='custom', needs=!!(sm&&sm.requiresDimensions);
  var lf=sm?sm.lf:BESPAD_DEFAULT_LF, wf=sm?sm.wf:BESPAD_DEFAULT_WF;
  if(custom||needs){
    lf=parseFloat((document.getElementById('pad-lf')||{}).value);
    wf=parseFloat((document.getElementById('pad-wf')||{}).value);
    if(needs && (!(lf>0)||!(wf>0)||!isFinite(lf)||!isFinite(wf))){
      var note=document.getElementById('pad-scale-note');
      if(note){ note.textContent='Length and width are required for this model. Enter positive finite dimensions in feet; no generic container footprint will be substituted.'; note.style.color='var(--gold)'; }
      return null;
    }
    if(!(lf>0)||!isFinite(lf)) lf=BESPAD_DEFAULT_LF;
    if(!(wf>0)||!isFinite(wf)) wf=BESPAD_DEFAULT_WF;
  }
  return { lf:lf, wf:wf, model:sm?sm.name:('Custom '+lf+' ft x '+wf+' ft'),
    catalogKey:sm?sm.id:null,
    geometryBasis:needs?'user-entered-unverified':(sm&&sm.geometryBasis||''),
    geometryNote:sm&&sm.geometryNote||'' };
}""")
replace_func('_padModalConfirm',"""function _padModalConfirm(){
  var spec=_padReadSpec(); if(!spec) return;
  var sel=document.getElementById('pad-model');
  window._padModelKey=spec.catalogKey||'custom';
  window._padModelIdx=sel&&sel.value!=='custom'?parseInt(sel.value,10):null;
  window._padSpec=JSON.parse(JSON.stringify(spec));
  var m=document.getElementById('pad-modal'); if(m) m.style.display='none';
  var opts={ assembly:_cbChecked('pad-assembly'), fence:_cbChecked('pad-fence'), bollards:_cbChecked('pad-bollards') };
  var qty=parseInt((document.getElementById('pad-qty')||{}).value,10)||1;
  var cols=parseInt((document.getElementById('pad-cols')||{}).value,10)||0;
  window._padQty=qty; window._padCols=cols; window._padOpts=opts;
  if(!_pendingPadPt){
    window._padQuickPlace=true;
    if(typeof showBanner==='function') showBanner('shape','Quick-place set ('+qty+' units) - click the map to place.');
    return;
  }
  var p=_pendingPadPt; _pendingPadPt=null;
  if(qty>1) _doPlaceBesPadGrid(p,spec,opts,qty,cols);
  else _doPlaceBesPad(p,spec,opts);
}""")
s=s.replace("catalogKey:_pelec.key, unitKwh:_pelec.kwh, unitKw:_pelec.kw, unitCost:_pelec.cost };", "catalogKey:_pelec.key, unitKwh:_pelec.kwh, unitKw:_pelec.kw, unitCost:_pelec.cost,\n             geometryBasis:spec.geometryBasis||'', geometryNote:spec.geometryNote||'' };")
s=s.replace("catalogKey:_elec.key, unitKwh:_elec.kwh, unitKw:_elec.kw, unitCost:_elec.cost,", "catalogKey:_elec.key, unitKwh:_elec.kwh, unitKw:_elec.kw, unitCost:_elec.cost,\n            geometryBasis:spec.geometryBasis||'', geometryNote:spec.geometryNote||'',")
old="""  _setChk('inc-pcs',  m._incPCS===true   || _big);
  _setChk('inc-disco',m._incDisco===true || (_big && !!m.disco));
  _setChk('inc-xfmr', m._incXfmr===true  || (_big && !!m.xfmr));"""
new="""  var _explicit=m.integrationBasis==='catalog-package-arrangement';
  _setChk('inc-pcs',  m._incPCS===true   || _big);
  _setChk('inc-disco',m._incDisco===true || (_big && !!m.disco));
  _setChk('inc-xfmr', m._incXfmr===true  || (_big && !!m.xfmr));
  if(_explicit){
    _setChk('inc-pcs',m._incPCS===true);
    _setChk('inc-disco',m._incDisco===true);
    _setChk('inc-xfmr',m._incXfmr===true);
    set('acv',m.acVoltage);
    var kva=document.getElementById('bm-ikva'); if(kva && m.ikva==null) kva.value='';
  }"""
assert s.count(old)==1
s=s.replace(old,new)
pos=s.index('<!-- BESS pad picker modal -->'); end=s.index('<!-- Parking stalls picker modal -->',pos)
block=s[pos:end].replace('<div class="cal-box">','<div class="cal-box" style="max-width:calc(100vw - 24px);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box">',1)
s=s[:pos]+block+s[end:]
p.write_text(s)
p=root/'scripts/tests/tcleancellcatalog.js'; p.write_text(p.read_text().replace('20261009-revh1','20261010-revh2'))
p=root/'.github/workflows/cleancell-catalog.yml'
s=p.read_text().replace("      - 'omega-cleancell-catalog.js'", "      - 'editor.html'\n      - 'scripts/render-cleancell-pickers.js'\n      - 'omega-cleancell-catalog.js'")
s += """      - name: Install browser regression dependency
        run: |
          npm i --prefix /tmp/catalog-browser --no-save --no-audit --no-fund playwright@1.63.0
          node /tmp/catalog-browser/node_modules/playwright/cli.js install --with-deps chromium
      - name: Native sizing and placement pickers on desktop and phone
        env:
          PLAYWRIGHT: /tmp/catalog-browser/node_modules/playwright
        run: node scripts/render-cleancell-pickers.js
"""
p.write_text(s)
p=root/'MERGE.md'
p.write_text(p.read_text()+"""

## 2026-10-10 - CleanCell references in BOTH battery pickers

The sizing catalog and the BESS Pad placement menu now consume the same
revisioned CleanCell reference records. Both feature the three Rev H products
first, retain other manufacturers and keep selection by SKU rather than array
position. Late tenant-catalog loading cannot displace the featured group.

The placement menu previously read only GOTION_CATALOG_DIMS, so adding a record
to BESS_CATALOG could never expose it there. The adapter does not invent entries
in that dimensions table: CC290 uses its cabinet reference; the two 1 MW
products require an entered footprint and retain an unverified geometry basis.
Model identity, AC kW, DC kWh and geometry provenance survive plain, assembly,
cluster and quick placement. Catalog package-arrangement flags override the
legacy size heuristic only on explicitly marked reference records. No pricing,
scoring, dispatch or approval engine changed; no database mutation or migration.

Regression: scripts/render-cleancell-pickers.js runs the actual editor
functions and actual pad modal at 1280px and 390px, with map rendering, auth and
network stubbed. It tests both orders, late tenant load, manual dimensions,
identity/ratings, native placement, integrated PCS, custom entry and reopen.
""")
print('Patched native picker, reference adapter, cache key, tests and documentation.')
