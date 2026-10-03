/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
(function(){
  'use strict';
  var I=window.OmegaScreeningImport,sites=[],report=null,user=null,busy=false,stopped=false,pending=null,selected=null,showAll=false,counter=0,previousFocus=null;
  var m=/[?&]tool=(parcel|bess)(?:&|$)/.exec(location.search),mode=m?m[1]:null;
  function el(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function n(v){return v==null?'Verify':Number(v).toLocaleString(undefined,{maximumFractionDigits:1});}
  function size(kw,kwh){return kw==null||kwh==null?'Verify':n(kw)+' kW / '+n(kwh)+' kWh';}
  function say(text,error){el('status').textContent=text;el('status').className='status'+(error?' error':'');}
  function active(){return mode==='bess'?'BESS Portfolio Screening':'Parcel Screening';}
  function drawMode(){
    el('hub').hidden=!!mode;el('work').hidden=!mode;if(!mode)return;
    document.title=active()+' · OMEGA';el('pageTitle').textContent=active();el('crumbTool').textContent='› '+active();
    el('pageIntro').textContent=mode==='bess'?'Turn your site list into a prioritized battery storage pipeline. Compare site suitability and preliminary system sizes, with clear next steps for each location.':'Evaluate one property or an entire portfolio. Review site details and project constraints, compare locations, and move promising sites into design.';
    el('parcelTab').className='button'+(mode==='parcel'?' active':'');el('bessTab').className='button'+(mode==='bess'?' active':'');
    el('file').accept=mode==='parcel'?'.xlsx,.csv,.json,.kml,.kmz':'.xlsx,.csv,.json';
    el('fileHelp').textContent='XLSX, CSV or a saved portfolio'+(mode==='parcel'?', plus multiple KML / KMZ files':'')+'. Up to 500 sites.';
  }
  function invalidate(){report=null;el('results').hidden=true;}
  function updateIntake(){
    el('runPanel').hidden=!sites.length;el('intakeCount').textContent=sites.length+' site'+(sites.length===1?'':'s')+' ready for review';
    el('downloadPortfolio').disabled=!sites.length||busy;el('run').disabled=!sites.length||busy||!user;
    var visible=showAll?sites:sites.slice(0,6);
    el('preview').innerHTML=visible.map(function(s){return '<div class="preview-row"><span><b>'+esc(s.address||s.name)+'</b><br><small>'+esc(s.source||'Entered site')+(s.importWarnings&&s.importWarnings.length?' · Verify imported data':'')+'</small></span><button type="button" data-edit="'+esc(s.id)+'">Review</button></div>';}).join('');
    el('showAll').hidden=sites.length<=6;el('showAll').textContent=showAll?'Show fewer sites':'Show all '+sites.length+' sites';
  }
  function add(rows){
    if(sites.length+rows.length>500)throw new Error('This would exceed 500 sites. Save the current portfolio and start another.');
    rows.forEach(function(s){s.id='site-'+Date.now()+'-'+(++counter);sites.push(s);});
    invalidate();updateIntake();say(rows.length+' site'+(rows.length===1?'':'s')+' added. Review the import, then screen your portfolio.');
  }
  function request(path,body,timeout){
    if(!user)return Promise.reject(new Error('Sign in through your OMEGA platform to run screening.'));
    if(window.OmegaTenant&&OmegaTenant.refused)return Promise.reject(new Error('This workspace is unavailable. Open the tool through your platform.'));
    return user.getIdToken().then(function(token){
      var ctl=typeof AbortController!=='undefined'?new AbortController():null,timer;
      var operation=fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),signal:ctl?ctl.signal:undefined}).then(function(r){return r.json().then(function(j){if(!r.ok){var e=new Error(j.error||'Screening request failed ('+r.status+').');e.status=r.status;throw e;}return j;});});
      var deadline=new Promise(function(resolve,reject){timer=setTimeout(function(){if(ctl)ctl.abort();reject(new Error('Lookup timed out. Inputs were kept; retry the site.'));},timeout||65000);});
      return Promise.race([operation,deadline]).then(function(v){clearTimeout(timer);return v;},function(e){clearTimeout(timer);throw e;});
    });
  }
  function setBusy(on){
    busy=on;['run','file','addAddresses','blankSite','confirmImport','clear','downloadPortfolio','template','showAll'].forEach(function(id){el(id).disabled=on;});
    el('stop').hidden=!on;el('stop').disabled=false;el('progressWrap').hidden=!on;updateIntake();
  }
  function merge(s,r){
    s.lookupNotes=r.notes||[];
    Object.keys(r.fields||{}).forEach(function(k){
      var v=r.fields[k];if(v==null||v==='')return;
      if(s[k]==null||s[k]==='')s[k]=v;
      else if(k==='taxId'&&I.norm(s[k])!==I.norm(v))s.lookupNotes.push('Verify parcel identity: workbook '+s[k]+' differs from map '+v+'.');
    });
    if(!s.features&&!s.kml&&r.features&&r.features.length)s.features=r.features;
    if(r.gridEvidence)s.gridEvidence=r.gridEvidence;
    s.lookupAt=r.checkedAt;
    s.source=s.source||'Parcel and Grid Atlas lookup';s.sourceDate=s.sourceDate||r.checkedAt;
  }
  function screen(skipLookup){
    if(busy||!sites.length)return;
    setBusy(true);stopped=false;invalidate();
    var index=0,lookup=!skipLookup&&el('enrich').checked;
    function step(){
      if(!lookup||stopped||index>=sites.length)return Promise.resolve();
      var s=sites[index++];
      el('progress').value=(index-1)/sites.length*85;el('progressLabel').textContent='Looking up site '+index+' of '+sites.length;
      if(!s.address && !(s.latitude!=null&&s.longitude!=null))return step();
      return request('/api/portfolio-enrich',{mode:mode,address:s.address,latitude:s.latitude,longitude:s.longitude}).then(function(r){merge(s,r);},function(e){if(e.status===401||e.status===403)throw e;s.lookupNotes=['Verify lookup: '+e.message];}).then(step);
    }
    step().then(function(){
      if(stopped){sites.slice(index).forEach(function(s){s.lookupNotes=['Verify: lookup was not run for this site.'];});}
      el('progress').value=90;el('progressLabel').textContent='Ranking '+sites.length+' sites';
      return request('/api/portfolio-screening',{mode:mode,sites:sites},45000);
    }).then(function(r){
      report=r;render();say('Screened '+r.rows.length+' sites.'+(stopped?' Lookup stopped early; unprocessed sites are retained for verification.':''));
      el('results').scrollIntoView({behavior:'smooth',block:'start'});
    }).catch(function(e){say(e.message,true);}).then(function(){setBusy(false);});
  }
  function render(){
    if(!report)return;el('results').hidden=false;
    var rows=report.rows,counts={'Priority Go':0,'Conditional Go':0,'Verify':0,'Hold / Needs Review':0};
    rows.forEach(function(r){counts[r.decision]=(counts[r.decision]||0)+1;});
    el('stats').innerHTML=[['Priority Go','Priority Go'],['Conditional Go','Conditional Go'],['Verify','Verify'],['Hold / Needs Review','Hold / Review']].map(function(p){return '<div class="stat"><b>'+counts[p[0]]+'</b><span>'+p[1]+'</span></div>';}).join('');
    var q=el('search').value.toLowerCase(),filter=el('filter').value;
    var list=rows.filter(function(r){return (filter==='all'||r.decision===filter)&&[r.name,r.address,r.taxId].join(' ').toLowerCase().indexOf(q)>=0;});
    el('resultCount').textContent='Showing '+list.length+' of '+rows.length+' sites. Ranking reflects preliminary screening, with missing evidence shown separately.';
    el('resultList').innerHTML=list.map(function(r){
      var s=r.sizing||{},p=s.physicalOption,score=r.score==null?(r.scoreRange?r.scoreRange[0]+'–'+r.scoreRange[1]:'Verify'):r.score+'/100';
      var badge=r.decision==='Priority Go'?'go':r.decision==='Hold / Needs Review'?'hold':'';
      return '<article class="result"><div class="result-top"><div class="rank">'+r.rank+'</div><div class="site"><div class="site-title">'+esc(r.address||r.name)+'</div><span class="badge '+badge+'">'+esc(r.decision)+'</span>'+(r.address&&r.name?'<div class="help">'+esc(r.name)+'</div>':'')+'</div><div class="metric"><small>Score</small><b>'+esc(score)+'</b><span>'+(r.score==null?'Verify missing inputs':mode==='bess'?'Physical screen':esc(r.confidence)+' confidence')+'</span></div>'+
        (mode==='bess'?'<div class="metric"><small>Physical-fit option</small><b>'+size(p&&p.kw,p&&p.kwh)+'</b><span>Preliminary size estimate</span></div><div class="metric"><small>Recommended size</small><b>'+size(s.recommendedKw,s.recommendedKwh)+'</b><span>'+esc(s.status||'Verify')+'</span></div>':'<div class="metric"><small>Parcel size</small><b>'+n(r.acres)+'</b><span>acres</span></div><div class="metric"><small>Grid context</small><b>'+n(r.grid&&r.grid.kv)+' kV</b><span>Capacity: Verify</span></div>')+
        '</div><div class="result-bottom"><div class="next"><b>Next:</b> '+esc(r.nextAction)+'</div><button data-edit="'+esc(r.id)+'">Review site</button></div><div class="print-only">'+esc((r.reasons||[]).join(' '))+'<br><b>Verify:</b> '+esc((r.verify||[]).join(' '))+'</div></article>';
    }).join('')||'<div class="empty">No sites match this filter.</div>';
    el('methodology').textContent=report.methodology+' '+report.ranking+' Physical-fit options are reference systems, not engineered layouts. Unknown values do not earn points or become zero-capacity approvals. Recommended sizing requires a documented objective, layout, utility limits, recharge feasibility and business case.';
    el('printStamp').textContent='Screening date: '+report.checkedAt+' · Model: '+report.version+' · '+report.methodology;
  }
  function read(file,type){return new Promise(function(resolve,reject){var r=new FileReader();r.onload=function(){resolve(r.result);};r.onerror=function(){reject(new Error('Could not read '+file.name));};if(type==='buffer')r.readAsArrayBuffer(file);else r.readAsText(file);});}
  function importFile(file){
    if(file.size>12000000)return Promise.reject(new Error(file.name+' exceeds 12 MB.'));
    var ext=file.name.split('.').pop().toLowerCase();
    if(ext==='json')return read(file).then(function(t){var j=JSON.parse(t);if(!j||j.schema!=='omega-screening-portfolio/1'||!Array.isArray(j.sites))throw new Error('Choose an OMEGA screening portfolio file.');add(j.sites);});
    if(ext==='csv')return read(file).then(function(t){pending={name:file.name,sheets:[{name:'CSV',rows:I.csv(t)}]};showMapping();});
    if(ext==='xlsx')return read(file,'buffer').then(I.readXlsx).then(function(sheets){
      var csk=I.csk(sheets,file.name);
      if(csk){add(csk);say('Imported '+csk.length+' sites. Review any conflicting information flagged for verification.');}
      else{pending={name:file.name,sheets:sheets};showMapping();}
    });
    if(mode!=='parcel'||['kml','kmz'].indexOf(ext)<0)return Promise.reject(new Error('Unsupported file. Choose XLSX, CSV'+(mode==='parcel'?', KML, KMZ':'')+' or a saved portfolio.'));
    function take(kml){if(kml.length>1500000)throw new Error(file.name+' exceeds the 1.5 MB geometry limit.');add([{name:file.name.replace(/\.(kmz|kml)$/i,''),kml:kml,source:file.name}]);}
    if(ext==='kml')return read(file).then(take);
    return read(file,'buffer').then(I.unzip).then(function(zip){var docs=zip.file(/\.kml$/i),chosen=zip.file('doc.kml')||(docs.length===1?docs[0]:null);if(!chosen)throw new Error('KMZ must contain doc.kml or exactly one KML document.');return chosen.async('string');}).then(take);
  }
  function showMapping(){
    el('sheet').innerHTML=pending.sheets.map(function(s,i){return '<option value="'+i+'">'+esc(s.name)+'</option>';}).join('');
    var best=0,count=0;pending.sheets.forEach(function(s,i){var c=I.detect(s.rows).count;if(c>count){best=i;count=c;}});el('sheet').value=String(best);chooseSheet();el('importPanel').hidden=false;el('importPanel').scrollIntoView({behavior:'smooth'});
  }
  function chooseSheet(){var sheet=pending.sheets[Number(el('sheet').value)],d=I.detect(sheet.rows);el('headerRow').value=d.row+1;paintMapping(d.mapping);}
  function paintMapping(mapping){
    var sheet=pending.sheets[Number(el('sheet').value)],h=Number(el('headerRow').value)-1,head=sheet.rows[h]||[];
    el('mapping').innerHTML=head.map(function(c,i){
      var field=mapping[i]||'',unit=I.unitFor(I.value(c));return '<label>'+esc(I.value(c)||'Column '+(i+1))+'<select data-column="'+i+'"><option value="">Ignore this column</option>'+I.fields.map(function(f){return '<option value="'+f[0]+'"'+(field===f[0]?' selected':'')+'>'+esc(f[1])+'</option>';}).join('')+'</select><small>Example: '+esc(I.value((sheet.rows[h+1]||[])[i]))+'</small><select data-unit-column="'+i+'" aria-label="Input units for column '+(i+1)+'">'+[['native','As labeled (sf / kW / kWh / fraction)'],['mw','MW → kW'],['mwh','MWh → kWh'],['acres','Acres → square feet'],['m2','Square metres → square feet'],['percent','Percent → fraction']].map(function(u){return '<option value="'+u[0]+'"'+(unit===u[0]?' selected':'')+'>'+u[1]+'</option>';}).join('')+'</select></label>';
    }).join('');
  }
  function download(name,body,type){var u=URL.createObjectURL(new Blob([body],{type:type||'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},1000);}
  function openDetail(id){
    if(busy){say('Finish or stop the current screening before editing a site.');return;}
    selected=sites.filter(function(s){return s.id===id;})[0];if(!selected)return;
    previousFocus=document.activeElement;el('detailTitle').textContent=selected.address||selected.name||'New site';
    var r=report&&report.rows.filter(function(r){return r.id===id;})[0],html='';
    if(r){
      html='<p><span class="badge">'+esc(r.decision)+'</span> '+(r.score==null?'Score: Verify':r.score+'/100')+'</p>';
      if(r.full&&r.half)html+='<table class="score-table"><thead><tr><th>Screening criterion</th><th>Full</th><th>Half</th><th>Max</th></tr></thead><tbody>'+r.full.components.map(function(c,i){return '<tr><td>'+esc(c.label)+'</td><td>'+n(c.points)+'</td><td>'+n(r.half.components[i].points)+'</td><td>'+c.max+'</td></tr>';}).join('')+'</tbody></table>';
      if(r.sizing){var z=r.sizing;html+='<div class="notice"><b>Recommended size: '+size(z.recommendedKw,z.recommendedKwh)+'</b><br>'+esc(z.reason)+'<br>Supplied-limit maximum: '+size(z.maxKw,z.maxKwh)+'</div>';}
      html+='<h3>Why this site ranks here</h3><ul>'+(r.reasons||[]).concat(r.risks||[]).map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ul><h3>Verify before advancing</h3><ul>'+(r.verify||[]).map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ul>';
    }
    var notes=(selected.importWarnings||[]).concat(selected.lookupNotes||[]);
    if(notes.length)html+='<details open><summary>Source and lookup notes</summary><ul>'+notes.map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ul></details>';
    html+='<p class="help">Source: '+esc(selected.source||'Entered by user')+(selected.sourceDate?' · '+esc(selected.sourceDate):'')+'</p>';
    el('detailBody').innerHTML=html;
    if(selected.importWarnings&&selected.importWarnings.length){
      el('detailBody').innerHTML+='<label class="check"><input id="resolveWarnings" type="checkbox">I checked the source conflicts and corrected the inputs below.</label><label for="resolutionNote">Verification reference / note</label><input id="resolutionNote" placeholder="Reference the checked source or utility confirmation">';
    }
    var booleans=['threePhase','siteControl','ahjAllowed','zoningSuitable','layoutVerified','interconnectionVerified','chargingVerified','economicsVerified','energyLimitNotApplicable'];
    var groupings=[['Property and utility',I.fields.slice(0,17)],['Sizing and verification',I.fields.slice(17)]];
    el('editInputs').innerHTML=groupings.map(function(group){return '<h3>'+group[0]+'</h3><div class="edit-grid">'+group[1].map(function(f){
      var v=selected[f[0]],field='';
      if(booleans.indexOf(f[0])>=0){var yn=/^(yes|y|true|1|confirmed)$/i.test(String(v))?'true':/^(no|n|false|0)$/i.test(String(v))?'false':'';field='<select name="'+f[0]+'"><option value="">Verify / unknown</option><option value="true"'+(yn==='true'?' selected':'')+'>Yes</option><option value="false"'+(yn==='false'?' selected':'')+'>No</option></select>';}
      else if(f[0]==='objective'){field='<select name="objective"><option value="">Verify / choose objective</option>'+['peak shaving','dispatch target','backup','vpp'].map(function(o){return '<option value="'+o+'"'+(String(v).toLowerCase()===o?' selected':'')+'>'+o+'</option>';}).join('')+'</select>';}
      else field='<input name="'+f[0]+'" value="'+esc(v)+'" placeholder="Verify / unknown">';
      return '<label>'+esc(f[1])+field+'</label>';
    }).join('')+'</div>';}).join('');
    el('editFields').open=!r;el('dialog').hidden=false;document.body.style.overflow='hidden';el('closeDialog').focus();
  }
  function closeDetail(){el('dialog').hidden=true;document.body.style.overflow='';selected=null;if(previousFocus&&document.body.contains(previousFocus))previousFocus.focus();}
  function exportResults(){
    if(!report)return;
    var rows=[['Rank','Site address','Site name','Tax ID','Decision','Score /100','Score range','Physical option kW','Physical option kWh','Recommended kW','Recommended kWh','Sizing status','Why','Risks','Verify','Next action','Source','Source date','Screened at','Model version']];
    report.rows.forEach(function(r){var s=r.sizing||{},p=s.physicalOption||{};rows.push([r.rank,r.address,r.name,r.taxId,r.decision,r.score==null?'Verify':r.score,r.scoreRange?r.scoreRange.join('–'):'',p.kw==null?'Verify':p.kw,p.kwh==null?'Verify':p.kwh,s.recommendedKw==null?'Verify':s.recommendedKw,s.recommendedKwh==null?'Verify':s.recommendedKwh,s.status||'Verify',(r.reasons||[]).join(' | '),(r.risks||[]).join(' | '),(r.verify||[]).join(' | '),r.nextAction,r.source,r.sourceDate,report.checkedAt,report.version]);});
    download('omega-'+mode+'-screening-results.csv',I.toCsv(rows),'text/csv;charset=utf-8');
  }
  drawMode();
  ['parcel','bess'].forEach(function(key){el(key+'Tab').onclick=function(e){if(!sites.length)return;e.preventDefault();if(busy)return;mode=key;history.replaceState(null,'','?tool='+key);invalidate();drawMode();say('Portfolio retained. Screen again with '+active()+'.');};});
  el('addAddresses').onclick=function(){try{var rows=el('addresses').value.split(/\r?\n/).map(function(v){return v.trim();}).filter(Boolean).map(function(v){return {address:v,source:'Pasted address list'};});if(!rows.length)throw new Error('Enter at least one site address.');add(rows);el('addresses').value='';}catch(e){say(e.message,true);}};
  el('blankSite').onclick=function(){try{add([{name:'New site',source:'Manual entry'}]);openDetail(sites[sites.length-1].id);}catch(e){say(e.message,true);}};
  el('showAll').onclick=function(){showAll=!showAll;updateIntake();};
  el('preview').onclick=el('resultList').onclick=function(e){var b=e.target.closest('[data-edit]');if(b)openDetail(b.getAttribute('data-edit'));};
  el('run').onclick=function(){screen(false);};el('stop').onclick=function(){stopped=true;el('stop').disabled=true;say('Stopping lookups after the current site. All sites will remain in the ranking.');};
  el('clear').onclick=function(){if(!confirm('Clear the current portfolio? Download it first if you want to reopen it later.'))return;sites=[];invalidate();updateIntake();say('Portfolio cleared.');};
  el('file').onchange=function(){
    var files=Array.prototype.slice.call(this.files||[]);if(!files.length)return;
    if(files.length>1&&files.some(function(f){return !/\.(kml|kmz)$/i.test(f.name);}))return say('Import one workbook or CSV at a time. Multiple selection supports KML / KMZ files.',true);
    el('file').disabled=true;var chain=Promise.resolve(),errors=[];
    files.forEach(function(f){chain=chain.then(function(){return importFile(f).catch(function(e){errors.push(f.name+': '+e.message);});});});
    chain.then(function(){el('file').disabled=false;el('file').value='';if(errors.length)say(errors.join(' '),true);});
  };
  el('sheet').onchange=chooseSheet;el('remap').onclick=function(){var s=pending.sheets[Number(el('sheet').value)],row=s.rows[Number(el('headerRow').value)-1]||[];paintMapping(I.detect([row]).mapping);};
  el('confirmImport').onclick=function(){try{var mapping=[],units=[];Array.prototype.forEach.call(el('mapping').querySelectorAll('[data-column]'),function(s){mapping[Number(s.getAttribute('data-column'))]=s.value;});Array.prototype.forEach.call(el('mapping').querySelectorAll('[data-unit-column]'),function(s){units[Number(s.getAttribute('data-unit-column'))]=s.value;});var sh=pending.sheets[Number(el('sheet').value)];add(I.table(sh.rows,mapping,Number(el('headerRow').value)-1,pending.name+' / '+sh.name,units));el('importPanel').hidden=true;pending=null;}catch(e){say(e.message,true);}};
  el('cancelImport').onclick=function(){pending=null;el('importPanel').hidden=true;};
  el('template').onclick=function(){download('omega-screening-import-template.csv',I.toCsv([I.fields.map(function(f){return f[1];})]),'text/csv;charset=utf-8');};
  el('downloadPortfolio').onclick=function(){download('omega-'+mode+'-portfolio.json',JSON.stringify({schema:'omega-screening-portfolio/1',mode:mode,savedAt:new Date().toISOString(),sites:sites},null,2),'application/json');};
  el('export').onclick=exportResults;el('print').onclick=function(){window.print();};el('search').oninput=render;el('filter').onchange=render;
  el('closeDialog').onclick=closeDetail;el('dialog').onclick=function(e){if(e.target===el('dialog'))closeDetail();};
  document.addEventListener('keydown',function(e){if(el('dialog').hidden)return;if(e.key==='Escape')closeDetail();if(e.key==='Tab'){var list=Array.prototype.slice.call(el('dialog').querySelectorAll('button,input,select,summary')).filter(function(n){return n.offsetParent!==null&&!n.disabled;}),first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  el('editForm').onsubmit=function(e){e.preventDefault();if(!selected)return;
    var oldAddress=selected.address,oldLat=selected.latitude,oldLng=selected.longitude;
    if(el('resolveWarnings')&&el('resolveWarnings').checked){
      var note=el('resolutionNote').value.trim();if(note.length<8){el('resolutionNote').setCustomValidity('Add a verification reference or note.');el('resolutionNote').reportValidity();return;}
      selected.resolvedWarnings=(selected.resolvedWarnings||[]).concat([{warnings:selected.importWarnings,note:note,at:new Date().toISOString()}]);selected.importWarnings=[];
    }
    Array.prototype.forEach.call(el('editInputs').querySelectorAll('input,select'),function(input){selected[input.name]=input.value;});
    if(selected.address!==String(oldAddress||'')||String(selected.latitude)!==String(oldLat==null?'':oldLat)||String(selected.longitude)!==String(oldLng==null?'':oldLng)){
      delete selected.gridEvidence;delete selected.features;delete selected.kml;
      if(selected.address!==String(oldAddress||'')&&String(selected.latitude)===String(oldLat==null?'':oldLat)&&String(selected.longitude)===String(oldLng==null?'':oldLng)){selected.latitude='';selected.longitude='';}
      selected.lookupNotes=['Verify the corrected location. Run parcel/grid lookup again before using its map context.'];
    }
    closeDetail();invalidate();updateIntake();if(user)screen(true);else say('Inputs saved. Sign in to rank this portfolio.');};
  el('removeSite').onclick=function(){if(!selected)return;var id=selected.id;sites=sites.filter(function(s){return s.id!==id;});closeDetail();invalidate();updateIntake();say('Site removed. Screen the portfolio again to refresh ranks.');};
  el('openEditor').onclick=function(){if(!selected)return;if(!selected.address)return say('Add the site address before opening the editor.',true);var r=report&&report.rows.filter(function(r){return r.id===selected.id;})[0],s=r&&r.sizing;
    var url='/editor.html?address='+encodeURIComponent(selected.address)+'&auto=map&from=screening';
    if(s&&s.recommendedKw>0&&s.recommendedKwh>0)url+='&mw='+s.recommendedKw/1000+'&mwh='+s.recommendedKwh/1000;
    window.open(url,'_blank','noopener');
  };
  window.addEventListener('beforeunload',function(e){if(sites.length){e.preventDefault();e.returnValue='';}});
  try{
    if(!window.firebase)throw new Error('Session library did not load.');
    if(!firebase.apps.length)firebase.initializeApp(window.CLEARSKY_CONFIG.firebase);
    firebase.auth().onAuthStateChanged(function(u){user=u;el('authNotice').hidden=!!u;el('workspace').textContent=u?u.email:'Sign in to screen sites';updateIntake();});
  }catch(e){el('authNotice').hidden=false;el('workspace').textContent='Session unavailable';}
})();
