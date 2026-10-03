/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
(function(root){
  'use strict';
  var FIELDS=[
    ['address','Site address','address|site address|commonly known address|street address|full address'],
    ['name','Site name','name|site name|project name|site|parcel'],
    ['taxId','Tax / parcel ID','tax id|tax identification no pin|pin|apn|parcel id'],
    ['propertyAreaSf','Property area (sf)','property area sf|lot area sf|parcel area sf|propertyareasf'],
    ['buildingAreaSf','Building footprint (sf)','building footprint sf|building area sf|buildingareasf'],
    ['openAreaSf','Open area (sf)','available open area sf|available non building area sf|open area sf|openareasf'],
    ['parkingSpaces','Parking spaces','parking spaces|striped parking spaces on site|parkingspaces'],
    ['parcelCount','Number of parcels','number of tax parcels pins|parcel count|number of parcels|parcelcount'],
    ['zoning','Zoning','zoning|zoning code'],['floodZone','Flood zone','flood zone|fema flood zone designation|floodzone'],
    ['threePhase','Adjacent three-phase power','adjacent 3 phase power y n|adjacent three phase power|threephase'],
    ['hostingBand','Storage hosting band','comed est hosting capacity kw|storage hosting band|hosting band|hostingband'],
    ['utility','Utility','utility|utility company'],['latitude','Latitude','lat|latitude'],['longitude','Longitude','lon|lng|longitude'],
    ['source','Evidence source','source|evidence source|source document'],['sourceDate','Source date','source date|survey date|sourcedate'],
    ['objective','Sizing objective','objective|sizing objective'],['targetKw','Target power (kW)','target kw|target power kw|targetkw'],
    ['targetKwh','Target energy (kWh)','target kwh|target energy kwh|targetkwh'],
    ['demandReductionKw','Demand reduction (kW)','demand reduction kw|demandreductionkw'],['peakDurationHours','Peak duration (hours)','peak duration hours|peakdurationhours'],
    ['usableFraction','Usable fraction (0–1)','usable fraction 0 1|usablefraction'],['dischargeEfficiency','Discharge efficiency (0–1)','discharge efficiency 0 1|dischargeefficiency'],
    ['layoutKw','Checked layout power (kW)','checked layout power kw|layoutkw'],['layoutKwh','Checked layout energy (kWh)','checked layout energy kwh|layoutkwh'],
    ['utilityApprovedKw','Utility-approved power (kW)','utility approved power kw|utilityapprovedkw'],['utilityApprovedKwh','Utility-approved energy (kWh)','utility approved energy kwh|utilityapprovedkwh'],
    ['layoutVerified','Layout verified','layout verified|layoutverified'],['interconnectionVerified','Interconnection verified','interconnection verified|interconnectionverified'],
    ['chargingVerified','Charging verified','charging verified|chargingverified'],['economicsVerified','Business case verified','business case verified|economicsverified'],
    ['energyLimitNotApplicable','No utility energy limit confirmed','no utility energy limit confirmed|energylimitnotapplicable'],
    ['sizingSource','Sizing evidence / reference','sizing evidence reference|sizingsource'],['siteControl','Site control confirmed','site control confirmed|sitecontrol'],
    ['ahjAllowed','AHJ pathway confirmed','ahj pathway confirmed|ahjallowed'],['zoningSuitable','Local zoning suitability confirmed','local zoning suitability confirmed|zoningsuitable'],['notes','Notes','notes']
  ];
  function norm(v){return String(v==null?'':v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function identity(v){return norm(v).replace(/ /g,'');}
  function unitFor(header){var n=norm(header);return /\bmwh\b/.test(n)?'mwh':/\bmw\b/.test(n)?'mw':/\bacres?\b/.test(n)?'acres':/\bm2\b|\bsq m\b/.test(n)?'m2':/%|percent/.test(String(header))?'percent':'native';}
  function convert(v,key,unit){
    if(v==null||v===''||typeof v==='boolean')return v;
    var clean=String(v).trim().replace(/,/g,''),n=Number(clean);
    if(!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(clean)||!isFinite(n))return v;
    if(unit==='native'||!unit)return v;
    if(unit==='mw'&&/Kw$/.test(key))return n*1000;
    if(unit==='mwh'&&/Kwh$/.test(key))return n*1000;
    if(unit==='acres'&&/Sf$/.test(key))return n*43560;
    if(unit==='m2'&&/Sf$/.test(key))return n*10.7639104167;
    if(unit==='percent'&&['usableFraction','dischargeEfficiency'].indexOf(key)>=0)return n/100;
    throw new Error('Units do not match '+key+'. Select the input units for that column.');
  }
  function value(c){return c&&typeof c==='object'&&'value' in c?c.value:c==null?'':c;}
  function csv(text){
    text=String(text).replace(/^\uFEFF/,'');var rows=[],row=[],cell='',quoted=false;
    for(var i=0;i<text.length;i++){
      var ch=text.charAt(i);
      if(ch==='"'){if(quoted&&text.charAt(i+1)==='"'){cell+='"';i++;}else if(quoted||cell===''){quoted=!quoted;}else cell+=ch;}
      else if(ch===','&&!quoted){row.push(cell);cell='';}
      else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text.charAt(i+1)==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
      else cell+=ch;
    }
    if(quoted)throw new Error('CSV contains an unclosed quoted cell.');
    if(cell!==''||row.length){row.push(cell);rows.push(row);}return rows;
  }
  function detect(rows){
    var best={row:0,mapping:[],count:0};
    rows.slice(0,30).forEach(function(row,i){
      var mapping=row.map(function(cell){var n=norm(value(cell)).replace(/\bmwh\b/g,'kwh').replace(/\bmw\b/g,'kw').replace(/\bacres?\b|\bm2\b/g,'sf'),f=FIELDS.filter(function(f){return f[2].split('|').indexOf(n)>=0||norm(f[0])===n;});return f.length?f[0][0]:'';});
      var count=mapping.filter(Boolean).length;
      if(count>best.count)best={row:i,mapping:mapping,count:count};
    });return best;
  }
  function table(rows,mapping,header,source,units){
    var fields=mapping.filter(Boolean),seen={};
    fields.forEach(function(k){if(seen[k])throw new Error('Two columns map to '+k+'. Choose one.');seen[k]=true;});
    if(!seen.address&&!seen.name)throw new Error('Map a Site address or Site name column.');
    var out=[];
    rows.slice(header+1).forEach(function(row,i){
      if(!row.some(function(c){return String(value(c)).trim()!=='';}))return;
      var obj={id:'row-'+(header+i+2),source:source,importWarnings:[]};
      mapping.forEach(function(key,j){if(key)obj[key]=convert(value(row[j]),key,units&&units[j]||unitFor(value((rows[header]||[])[j])));});
      if(!String(obj.address||obj.name||'').trim()){
        obj.name='Unidentified row '+(header+i+2);obj.importWarnings.push('Verify row '+(header+i+2)+': missing site identity.');
      }
      if(obj.parcelCount==null&&obj.taxId){var pins=String(obj.taxId).match(/\d{2}-\d{2}-\d{3}-\d{3}-\d{4}/g);if(pins)obj.parcelCount=pins.length;}
      out.push(obj);
    });
    if(!out.length)throw new Error('No site rows were found under this header.');
    if(out.length>500)throw new Error('This workbook has '+out.length+' rows. Split it into portfolios of at most 500; no rows were imported.');
    return out;
  }
  function xml(text){
    if(/<!DOCTYPE/i.test(text))throw new Error('External XML document types are unsupported.');
    var d=new DOMParser().parseFromString(text,'application/xml');
    if(d.getElementsByTagName('parsererror').length)throw new Error('Invalid workbook XML.');return d;
  }
  function els(n,name){return Array.prototype.slice.call(n.getElementsByTagNameNS('*',name));}
  function col(ref){var m=/^[A-Z]+/.exec(ref||''),v=0;if(!m)return 0;for(var i=0;i<m[0].length;i++)v=v*26+m[0].charCodeAt(i)-64;return v-1;}
  function preflight(buffer){
    var d=new DataView(buffer),total=0,entries=0;
    for(var i=0;i+46<=d.byteLength;i++){
      if(d.getUint32(i,true)!==0x02014b50)continue;
      var size=d.getUint32(i+24,true),name=d.getUint16(i+28,true),extra=d.getUint16(i+30,true),comment=d.getUint16(i+32,true);
      total+=size;entries++;
      if(size>10000000||total>30000000||entries>300)throw new Error('Expanded workbook is too large. Use a smaller workbook or CSV.');
      i+=45+name+extra+comment;
    }
    if(!entries)throw new Error('No readable ZIP directory found. Use .xlsx, .csv, .kml or .kmz.');
  }
  function unzip(buffer){
    if(buffer.byteLength>12000000)throw new Error('File exceeds 12 MB. Split the portfolio.');
    if(!root.JSZip)throw new Error('Workbook reader did not load. Reload the page.');
    preflight(buffer);return root.JSZip.loadAsync(buffer);
  }
  function readXlsx(buffer){
    return unzip(buffer).then(function(z){
      function get(path,optional){var f=z.file(path);if(!f){if(optional)return Promise.resolve('');throw new Error('Missing workbook part: '+path);}return f.async('string');}
      return Promise.all([get('xl/workbook.xml'),get('xl/_rels/workbook.xml.rels'),get('xl/sharedStrings.xml',true)]).then(function(parts){
        var names=els(xml(parts[0]),'sheet'),rels={},shared=[];
        if(parts[2])shared=els(xml(parts[2]),'si').map(function(si){return els(si,'t').map(function(t){return t.textContent;}).join('');});
        els(xml(parts[1]),'Relationship').forEach(function(r){rels[r.getAttribute('Id')]=r.getAttribute('Target');});
        if(names.length>100)throw new Error('Workbook has too many worksheets.');
        return Promise.all(names.map(function(s){
          var target=rels[s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')];
          if(!target||target.indexOf('..')>=0||/^\w+:/.test(target))throw new Error('Unsupported worksheet relationship.');
          var path=target.charAt(0)==='/'?target.slice(1):'xl/'+target;
          return get(path).then(function(t){
            var doc=xml(t),rows=[],cells={};
            els(doc,'row').forEach(function(row){
              var idx=Number(row.getAttribute('r'))-1;if(idx<0||idx>100000)throw new Error('Worksheet row is outside the supported range.');
              var out=[];els(row,'c').forEach(function(c){
                var ref=c.getAttribute('r'),type=c.getAttribute('t'),vs=els(c,'v'),fs=els(c,'f'),v=vs.length?vs[0].textContent:'';
                if(type==='s')v=shared[Number(v)]||'';
                else if(type==='inlineStr')v=els(c,'t').map(function(n){return n.textContent;}).join('');
                else if(type==='b')v=v==='1';
                else if(type!=='str'&&type!=='e'&&v!==''&&isFinite(Number(v)))v=Number(v);
                var cell={value:v,formula:fs.length?fs[0].textContent:'',ref:ref};cells[ref]=cell;out[col(ref)]=cell;
              });rows[idx]=out;
            });
            for(var i=0;i<rows.length;i++)if(!rows[i])rows[i]=[];
            return {name:s.getAttribute('name'),rows:rows,cells:cells};
          });
        }));
      });
    });
  }
  function csk(sheets,file){
    var details=sheets.filter(function(s){return /^P\d+/i.test(s.name)&&s.cells&&value(s.cells.B5)&&norm(value(s.cells.A15))==='property area sf';});
    if(!details.length)return null;
    var summary=sheets.filter(function(s){return s.name==='Summary & Ranking';})[0],out=[];
    var cells={address:'B5',taxId:'B6',propertyAreaSf:'B15',buildingAreaSf:'B16',openAreaSf:'B17',zoning:'B20',floodZone:'B21',parkingSpaces:'B23',parcelCount:'B26',threePhase:'B29',hostingBand:'B30',sourceDate:'B10'};
    details.forEach(function(s,i){
      var row={id:'csk-'+(i+1),name:s.name,source:file+' / '+s.name,importWarnings:[],utility:'ComEd'};
      Object.keys(cells).forEach(function(k){row[k]=value(s.cells[cells[k]]);});
      if(summary){
        var matches=summary.rows.filter(function(r){return identity(value(r[3]))===identity(row.address)&&identity(value(r[4]))===identity(row.taxId);});
        if(matches.length!==1)row.importWarnings.push('Verify summary-to-detail identity: no unique address and Tax ID match for '+s.name+'.');
        else [['threePhase',12],['hostingBand',13]].forEach(function(pair){
          var c=matches[0][pair[1]],v=value(c),wrong=c&&c.formula&&/^'([^']+)'!/.test(c.formula)&&/^'([^']+)'!/.exec(c.formula)[1]!==s.name;
          if(wrong||String(v)!==String(row[pair[0]])){
            row.importWarnings.push('Verify '+pair[0]+': summary '+String(v)+' conflicts with or references a different site from '+s.name+' ('+String(row[pair[0]])+').');row[pair[0]]='';
          }
        });
      }
      out.push(row);
    });return out;
  }
  function safeCell(v){var s=String(v==null?'':v);if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  function toCsv(rows){return '\uFEFF'+rows.map(function(r){return r.map(safeCell).join(',');}).join('\r\n');}
  root.OmegaScreeningImport={fields:FIELDS,norm:norm,value:value,csv:csv,detect:detect,table:table,readXlsx:readXlsx,csk:csk,unzip:unzip,toCsv:toCsv,unitFor:unitFor,convert:convert};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.OmegaScreeningImport;
})(typeof window!=='undefined'?window:globalThis);
