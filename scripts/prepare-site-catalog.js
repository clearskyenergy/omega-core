/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Prepare a verified browser capture for the tenant catalogue. No DB writes.
 */
'use strict';
var fs = require('fs'), path = require('path');
function csv(rows) { return rows.map(function(r){return r.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');}).join('\n'); }
function parseCSV(s) {
  var rows=[],row=[],cell='',quote=false;
  for(var i=0;i<s.length;i++){var c=s[i];if(c==='"'){if(quote&&s[i+1]==='"'){cell+='"';i++;}else quote=!quote;}
    else if(c===','&&!quote){row.push(cell);cell='';}else if(c==='\n'&&!quote){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}return rows;
}
function normalize(r) {
  var a=r.address.match(/^(.*),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/);
  var lines=r.sourceText.split('\n').map(function(s){return s.trim();}).filter(Boolean);
  var p=lines.filter(function(s){return /^\$[\d,]+(?:\.\d+)?$/.test(s);})[0];
  var detail=lines.filter(function(s){return /^(Industrial|Retail|Office|Multifamily|Land|Mixed Use|Hospitality|Special Purpose|Self Storage|Mobile Home Park)\b/.test(s);})[0]||'';
  var sf=detail.match(/([\d,]+(?:\.\d+)?)\s*SF\b/i), acres=detail.match(/([\d,]+(?:\.\d+)?)\s*acres?\b/i);
  var type=(detail.split('|')[0]||'Other').trim();if(type==='Land')type='Vacant Land';
  return {id:'crexi:'+r.listingId,listingId:r.listingId,addr:a?a[1]:r.address,city:a?a[2]:'',state:a?a[3]:'IL',zip:a?a[4]:'',
    fullAddress:r.address,type:type,subtype:detail,sqft:sf?Number(sf[1].replace(/,/g,'')):null,lotAcres:acres?Number(acres[1].replace(/,/g,'')):null,
    lat:null,lon:null,photos:[],owner:{name:''},feederId:'',annualKwh:null,src:'crexi-import',
    listed:{forSale:true,url:r.listingUrl,askPrice:p?Number(p.slice(1).replace(/,/g,'')):null,asOf:r.observedAt},
    sourceText:r.sourceText,observedAt:r.observedAt,geocode:{status:'unmatched',source:'US Census',accuracy:'unknown'}};
}
async function main(){
  var file=path.resolve(process.argv[2]),dir=path.dirname(file),source=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!source.manifest.collectionComplete||source.manifest.orgId!=='chileasing.com')throw Error('Verified source required');
  var rows=source.listings.map(normalize), geoFile=path.join(dir,'census-geocodes.json');
  var text;
  if(fs.existsSync(geoFile))text=JSON.parse(fs.readFileSync(geoFile,'utf8')).response;
  else{
    var form=new FormData();form.append('benchmark','Public_AR_Current');
    form.append('addressFile',new Blob([csv(rows.filter(function(r){return r.city;}).map(function(r){return [r.id,r.addr,r.city,r.state,r.zip];}))],{type:'text/csv'}),'addresses.csv');
    console.log('Geocoding '+rows.length+' public listing addresses with US Census');
    var res=await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch',{method:'POST',body:form,signal:AbortSignal.timeout(600000)});
    if(!res.ok)throw Error('Census HTTP '+res.status);text=await res.text();
    if(!text.includes('Match')&&!text.includes('No_Match'))throw Error('Unrecognized Census response');
    fs.writeFileSync(geoFile,JSON.stringify({at:new Date().toISOString(),response:text}),{flag:'wx',mode:384});
  }
  var geo={};parseCSV(text).forEach(function(r){geo[r[0]]=r;});
  rows.forEach(function(r){var g=geo[r.id];if(!g||g[2]!=='Match'||g[3]!=='Exact')return;var ll=(g[5]||'').split(',').map(Number);
    if(ll.length!==2||ll[0]<-89||ll[0]>-87||ll[1]<41||ll[1]>43)return;
    r.lon=ll[0];r.lat=ll[1];r.geocode={status:'matched',source:'US Census',accuracy:'street-interpolated, not rooftop',matchedAddress:g[4]};});
  var manifest={orgId:'chileasing.com',count:rows.length,located:rows.filter(function(r){return r.lat!==null;}).length,source:'Crexi Cook County for-sale search',importedAt:new Date().toISOString(),snapshot:true};
  var out=path.join(dir,'catalog-prepared.json');fs.writeFileSync(out,JSON.stringify({manifest:manifest,rows:rows},null,2),{flag:'wx',mode:384});console.log(JSON.stringify({file:out,manifest:manifest}));
}
if(require.main===module)main().catch(function(e){console.error(e.message);process.exitCode=1;});
module.exports={normalize:normalize,parseCSV:parseCSV};
