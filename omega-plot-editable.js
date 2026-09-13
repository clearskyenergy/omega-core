/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Native editable drawing export. Unsupported SVG features stop the export.
 * Engineering validation is independent of PowerPoint editability.
 */
(function(root){
'use strict';
function fail(s){throw new Error(s);}
function point(m,x,y){return {x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};}
function path(d,m){
  var tokens=(d||'').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
  var out=[],i=0,cmd='',x=0,y=0,sx=0,sy=0;
  function num(){var t=tokens[i++],n=Number(t);if(t===undefined||!isFinite(n))fail('Invalid SVG path');return n;}
  function p(a,b){return point(m,a,b);}
  while(i<tokens.length){
    if(/^[a-zA-Z]$/.test(tokens[i]))cmd=tokens[i++];
    var up=cmd.toUpperCase(),rel=cmd!==up,bx=rel?x:0,by=rel?y:0,q,r,v;
    if(up==='Z'){out.push({close:true});x=sx;y=sy;cmd='';continue;}
    if(up==='M'||up==='L'){x=num()+bx;y=num()+by;v=p(x,y);if(up==='M'){v.moveTo=true;sx=x;sy=y;cmd=rel?'l':'L';}out.push(v);}
    else if(up==='H'){x=num()+bx;out.push(p(x,y));}
    else if(up==='V'){y=num()+by;out.push(p(x,y));}
    else if(up==='Q'){q=p(num()+bx,num()+by);x=num()+bx;y=num()+by;v=p(x,y);v.curve={type:'quadratic',x1:q.x,y1:q.y};out.push(v);}
    else if(up==='C'){q=p(num()+bx,num()+by);r=p(num()+bx,num()+by);x=num()+bx;y=num()+by;v=p(x,y);v.curve={type:'cubic',x1:q.x,y1:q.y,x2:r.x,y2:r.y};out.push(v);}
    else fail('Unsupported path command '+cmd+'; no sheet was flattened or omitted.');
  }
  return out;
}
function color(s){
  if(!s||s==='none')return null;
  if(/^#[a-f\d]{6}$/i.test(s))return s.slice(1);
  if(/^#[a-f\d]{3}$/i.test(s))return s.slice(1).replace(/./g,function(c){return c+c;});
  var a=/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/.exec(s);
  if(a)return a.slice(1,4).map(function(n){return ('0'+Number(n).toString(16)).slice(-2);}).join('');
  fail('Unsupported drawing colour '+s);
}
function compile(svgText){
  var doc=new root.DOMParser().parseFromString(svgText,'image/svg+xml');
  if(doc.querySelector('parsererror'))fail('Invalid SVG sheet');
  if(doc.querySelector('script,foreignObject,style,animate,animateTransform'))fail('Unsupported active or styled SVG content');
  Array.prototype.forEach.call(doc.querySelectorAll('*'),function(el){
    Array.prototype.forEach.call(el.attributes,function(a){
      if(/^on/i.test(a.name))fail('Event attributes are not permitted in drawing exports');
      if(/^(?:href|xlink:href)$/.test(a.name)&&!/^data:image\/(png|jpeg);base64,/.test(a.value))fail('Drawing images must be embedded PNG or JPEG');
    });
  });
  var svg=doc.documentElement;
  var vb=(svg.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
  if(vb.length!==4||vb.some(function(n){return !isFinite(n);})||vb[2]<=0||vb[3]<=0)fail('Sheet requires a valid viewBox');
  var holder=root.document.createElement('div');
  holder.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  svg=root.document.importNode(svg,true);
  svg.setAttribute('width',vb[2]);svg.setAttribute('height',vb[3]);
  holder.appendChild(svg);root.document.body.appendChild(holder);
  var objects=[];
  try{
    var inverse=svg.getCTM().inverse();
    function visit(el,alpha){
      var tag=el.localName,style=root.getComputedStyle(el);
      if(tag==='defs'||tag==='title'||tag==='desc'||tag==='metadata')return;
      if(style.display==='none'||style.visibility==='hidden'&&el.getAttribute('visibility')==='hidden')return;
      alpha*=isFinite(parseFloat(style.opacity))?parseFloat(style.opacity):1;
      if(alpha===0)return;
      if(style.clipPath&&style.clipPath!=='none'||style.mask&&style.mask!=='none'||style.filter&&style.filter!=='none')fail('Clipped, masked or filtered object requires a reviewed conversion');
      if(tag==='svg'||tag==='g'){Array.prototype.forEach.call(el.children,function(c){visit(c,alpha);});return;}
      var m=inverse.multiply(el.getCTM()),pts=[],n=objects.length+1;
      function a(k,def){var v=el.getAttribute(k);return v===null?(def||0):Number(v);}
      function p(x,y){return point(m,x,y);}
      var rec={name:(el.id||tag)+' '+n,fill:color(style.fill),stroke:color(style.stroke),alpha:alpha,
        fillAlpha:parseFloat(style.fillOpacity),strokeAlpha:parseFloat(style.strokeOpacity),
        lineWidth:parseFloat(style.strokeWidth)*Math.sqrt(m.a*m.a+m.b*m.b),dash:style.strokeDasharray!=='none'};
      if(style.markerStart&&style.markerStart!=='none'||style.markerEnd&&style.markerEnd!=='none'||style.markerMid&&style.markerMid!=='none')fail('SVG marker requires explicit drawing geometry');
      if(tag==='text'){
        if(el.children.length)fail('Rich SVG text requires a reviewed conversion');
        if(Math.abs(m.a*m.c+m.b*m.d)>0.001)fail('Skewed text is unsupported');
        var box=el.getBBox(),angle=Math.atan2(m.b,m.a)*180/Math.PI,center=p(box.x+box.width/2,box.y+box.height/2);
        var scaleX=Math.hypot(m.a,m.b),scaleY=Math.hypot(m.c,m.d);
        if(m.a*m.d-m.b*m.c<=0||Math.abs(scaleX-scaleY)>0.001)fail('Reflected or stretched text requires a reviewed conversion');
        rec.type='text';rec.text=el.textContent;rec.w=box.width*scaleX;rec.h=box.height*scaleY;
        rec.x=center.x-rec.w/2;rec.y=center.y-rec.h/2;rec.rotate=angle;
        rec.fontSize=parseFloat(style.fontSize)*scaleY;rec.fontFace=style.fontFamily.split(',')[0].replace(/["']/g,'');
        rec.bold=parseInt(style.fontWeight,10)>=600||style.fontWeight==='bold';rec.italic=style.fontStyle==='italic';
      }else if(tag==='image'){
        if(Math.abs(m.b)>0.001||Math.abs(m.c)>0.001||m.a<=0||m.d<=0)fail('Rotated image requires a reviewed conversion');
        var href=el.getAttribute('href')||el.getAttributeNS('http://www.w3.org/1999/xlink','href');
        if(!/^data:image\/(png|jpeg);base64,/.test(href||''))fail('Map and logo images must be embedded PNG or JPEG');
        if(el.getAttribute('preserveAspectRatio')!=='none')fail('Image cropping must be resolved before editable export');
        var ip=p(a('x'),a('y'));rec.type='image';rec.data=href;rec.x=ip.x;rec.y=ip.y;rec.w=a('width')*m.a;rec.h=a('height')*m.d;
      }else{
        rec.type='shape';
        if(tag==='path')pts=path(el.getAttribute('d'),m);
        else if(tag==='line')pts=[p(a('x1'),a('y1')),p(a('x2'),a('y2'))];
        else if(tag==='rect'){
          if(a('rx')||a('ry'))fail('Rounded rectangle requires a reviewed conversion');
          var x=a('x'),y=a('y'),w=a('width'),h=a('height');
          pts=[p(x,y),p(x+w,y),p(x+w,y+h),p(x,y+h),{close:true}];
        }else if(tag==='polygon'||tag==='polyline'){
          var vals=(el.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number);
          if(vals.length<4||vals.length%2||vals.some(function(v){return !isFinite(v);}))fail('Invalid polygon');
          for(var k=0;k<vals.length;k+=2)pts.push(p(vals[k],vals[k+1]));
          if(tag==='polygon')pts.push({close:true});
        }else if(tag==='circle'||tag==='ellipse'){
          var cx=a('cx'),cy=a('cy'),rx=a('rx',a('r')),ry=a('ry',a('r')),c=0.5522847498307936;
          var curve='M '+(cx+rx)+' '+cy+' C '+(cx+rx)+' '+(cy+c*ry)+' '+(cx+c*rx)+' '+(cy+ry)+' '+cx+' '+(cy+ry)
            +' C '+(cx-c*rx)+' '+(cy+ry)+' '+(cx-rx)+' '+(cy+c*ry)+' '+(cx-rx)+' '+cy
            +' C '+(cx-rx)+' '+(cy-c*ry)+' '+(cx-c*rx)+' '+(cy-ry)+' '+cx+' '+(cy-ry)
            +' C '+(cx+c*rx)+' '+(cy-ry)+' '+(cx+rx)+' '+(cy-c*ry)+' '+(cx+rx)+' '+cy+' Z';
          pts=path(curve,m);
        }else fail('Unsupported SVG object '+tag);
        if(!pts.length)return;
        rec.points=pts;
      }
      if(rec.type==='shape'){
        rec.points.forEach(function(v){
          if(v.close)return;
          if(!isFinite(v.x)||!isFinite(v.y))fail('Nonfinite drawing coordinates');
          if(v.curve&&(!isFinite(v.curve.x1)||!isFinite(v.curve.y1)||v.curve.type==='cubic'&&(!isFinite(v.curve.x2)||!isFinite(v.curve.y2))))fail('Nonfinite curve coordinates');
        });
      }else if(!isFinite(rec.x)||!isFinite(rec.y)||!isFinite(rec.w)||!isFinite(rec.h)||rec.w<0||rec.h<0)fail('Invalid drawing object bounds');
      objects.push(rec);
    }
    visit(svg,1);
    return {viewBox:vb,objects:objects};
  }finally{holder.remove();}
}
function addObjects(slide,scene,units){
  var vb=scene.viewBox;
  scene.objects.forEach(function(r){
    var common={objectName:r.name,x:(r.x-vb[0])/units,y:(r.y-vb[1])/units,w:r.w/units,h:r.h/units};
    if(r.type==='text'){
      common.fontSize=r.fontSize*72/units;common.fontFace=r.fontFace;common.bold=r.bold;common.italic=r.italic;
      common.rotate=r.rotate;common.margin=0;common.breakLine=false;common.valign='mid';common.color=r.fill||'000000';
      common.transparency=100*(1-r.alpha*r.fillAlpha);
      slide.addText(r.text,common);
    }else if(r.type==='image'){common.data=r.data;common.transparency=100*(1-r.alpha);slide.addImage(common);}
    else{
      var all=[];r.points.forEach(function(p){if(p.close)return;all.push({x:p.x,y:p.y});if(p.curve){all.push({x:p.curve.x1,y:p.curve.y1});if(p.curve.type==='cubic')all.push({x:p.curve.x2,y:p.curve.y2});}});
      var xs=all.map(function(p){return p.x;}),ys=all.map(function(p){return p.y;});
      var minX=Math.min.apply(null,xs),minY=Math.min.apply(null,ys),maxX=Math.max.apply(null,xs),maxY=Math.max.apply(null,ys);
      common.x=(minX-vb[0])/units;common.y=(minY-vb[1])/units;common.w=Math.max(0.001,(maxX-minX)/units);common.h=Math.max(0.001,(maxY-minY)/units);
      common.fill=r.fill?{color:r.fill,transparency:100*(1-r.alpha*r.fillAlpha)}:{color:'FFFFFF',transparency:100};
      common.line={color:r.stroke||'FFFFFF',width:(r.lineWidth||0)*72/units,transparency:r.stroke?100*(1-r.alpha*r.strokeAlpha):100,dashType:r.dash?'dash':'solid'};
      common.points=r.points.map(function(p){
        if(p.close)return {close:true};
        var q={x:(p.x-minX)/units,y:(p.y-minY)/units};if(p.moveTo)q.moveTo=true;
        if(p.curve){q.curve={type:p.curve.type,x1:(p.curve.x1-minX)/units,y1:(p.curve.y1-minY)/units};if(p.curve.type==='cubic'){q.curve.x2=(p.curve.x2-minX)/units;q.curve.y2=(p.curve.y2-minY)/units;}}
        return q;
      });
      slide.addShape('custGeom',common);
    }
  });
}
var libraryPromise;
function ready(){
  if(libraryPromise)return libraryPromise;
  libraryPromise=new Promise(function(resolve,reject){
    var frame=root.document.createElement('iframe');frame.style.display='none';
    frame.title='OMEGA editable drawing exporter';root.document.body.appendChild(frame);
    var script=frame.contentDocument.createElement('script');
    script.src=new URL('vendor/pptxgenjs-4.0.1.bundle.js',root.document.baseURI).href;
    var timer=setTimeout(function(){script.onload=null;script.onerror=null;frame.remove();libraryPromise=null;reject(new Error('Editable PowerPoint library timed out'));},15000);
    script.onload=function(){clearTimeout(timer);var C=frame.contentWindow.pptxgen||frame.contentWindow.PptxGenJS;if(!C){frame.remove();libraryPromise=null;reject(new Error('Editable PowerPoint library did not initialize'));return;}resolve(C);};
    script.onerror=function(){clearTimeout(timer);frame.remove();libraryPromise=null;reject(new Error('Editable PowerPoint library could not load'));};
    frame.contentDocument.head.appendChild(script);
  });
  return libraryPromise;
}
function build(sheets,opts,cb){
  opts=opts||{};
  if(!opts.Constructor){ready().then(function(C){var next={};Object.keys(opts).forEach(function(k){next[k]=opts[k];});next.Constructor=C;build(sheets,next,cb);},function(e){cb(null,e.message);});return;}
  try{
    var C=opts.Constructor;
    if(!C)fail('PowerPoint library did not load');
    if(!sheets||!sheets.length)fail('No sheets selected');
    var ppt=new C();
    if(!ppt.ShapeType||!ppt.ShapeType.custGeom)fail('This PowerPoint library lacks native custom geometry support');
    var units=opts.unitsPerInch||96,scenes=sheets.map(function(s,i){
      if(opts.onProgress)opts.onProgress(i+1,sheets.length,s.no);
      try{return compile(s.svg);}catch(e){fail('Sheet '+s.no+': '+e.message);}
    });
    var first=scenes[0].viewBox,w=first[2]/units,h=first[3]/units;
    if(w>56||h>56)fail('Drawing exceeds PowerPoint sheet dimensions');
    ppt.defineLayout({name:'ENGINEERING',width:w,height:h});ppt.layout='ENGINEERING';
    ppt.author='ClearSky OMEGA';ppt.title=opts.title||'Engineering review drawings';
    scenes.forEach(function(scene,i){
      if(scene.viewBox[2]!==first[2]||scene.viewBox[3]!==first[3])fail('Select a single paper size for this drawing set');
      var slide=ppt.addSlide();slide.background={color:'FFFFFF'};addObjects(slide,scene,units);
      slide.addNotes('Sheet '+sheets[i].no+'. Native editable drawing objects. Independent engineering review required. PowerPoint edits do not update the OMEGA project.');
    });
    var name=(opts.title||'OMEGA').replace(/[^a-z0-9_-]+/gi,'-').slice(0,80);
    ppt.writeFile({fileName:name+'-Editable-Drawings.pptx'}).then(function(){cb(sheets.length,null);},function(e){cb(null,e.message);});
  }catch(e){cb(null,e.message);}
}
root.OmegaEditablePlotPPT={build:build,compile:compile,addObjects:addObjects,path:path};
})(typeof window!=='undefined'?window:globalThis);
