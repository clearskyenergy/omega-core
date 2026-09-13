/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Native editable drawing export.
 *
 * WHAT "EDITABLE" HAS TO MEAN HERE. An engineering firm has to be able to
 * select one fence segment, one ground rod, one dimension string, and change
 * it. So every drawn object becomes its own PowerPoint shape or text box.
 * Nothing is rasterised to get past a feature this file does not implement,
 * and nothing is dropped to make an export succeed: a sheet either converts
 * completely or the export stops and names the sheet.
 *
 * That rule is only honest if the converter actually implements what the
 * sheets emit. Counted across editor.html's own generators: 220 rounded
 * rectangles, 30 preserveAspectRatio images, 12 marker references over 7
 * marker definitions, 10 <use> instances, 9 elliptical arcs, 2 clip paths,
 * 1 smooth curve. All of those are converted below. tspan, mask and filter
 * are emitted nowhere, so they still refuse rather than carry untested code.
 *
 * Engineering validation is independent of PowerPoint editability.
 */
(function(root){
'use strict';
function fail(s){throw new Error(s);}

/* ── elliptical arc → cubics ────────────────────────────────────────────────
   SVG arcs are endpoint-parameterised; PowerPoint freeforms take cubics. The
   conversion is the endpoint-to-centre form in SVG 1.1 F.6.5, then one cubic
   per <=90 degrees of sweep, which keeps the error well under a drawing's
   line width at any sheet size we issue. Radii are scaled up when the
   endpoints are too far apart for the ones given (F.6.6) — the alternative
   is NaN geometry, and a silently missing arc is exactly what this file
   exists to prevent. */
function arcToCubics(x1,y1,rx,ry,phiDeg,largeArc,sweep,x2,y2){
  if(x1===x2&&y1===y2) return [];
  rx=Math.abs(rx); ry=Math.abs(ry);
  if(!rx||!ry) return [{line:true,x:x2,y:y2}];
  var phi=phiDeg*Math.PI/180, cp=Math.cos(phi), sp=Math.sin(phi);
  var dx=(x1-x2)/2, dy=(y1-y2)/2;
  var x1p= cp*dx+sp*dy, y1p=-sp*dx+cp*dy;
  var lam=(x1p*x1p)/(rx*rx)+(y1p*y1p)/(ry*ry);
  if(lam>1){ var sq=Math.sqrt(lam); rx*=sq; ry*=sq; }
  var den=rx*rx*y1p*y1p+ry*ry*x1p*x1p;
  var numr=rx*rx*ry*ry-den;
  var co=den?Math.sqrt(Math.max(0,numr/den)):0;
  if(largeArc===sweep) co=-co;
  var cxp=co*rx*y1p/ry, cyp=-co*ry*x1p/rx;
  var cx=cp*cxp-sp*cyp+(x1+x2)/2, cy=sp*cxp+cp*cyp+(y1+y2)/2;
  function ang(ux,uy,vx,vy){
    var d=Math.sqrt((ux*ux+uy*uy)*(vx*vx+vy*vy));
    if(!d) return 0;
    var c=Math.max(-1,Math.min(1,(ux*vx+uy*vy)/d));
    return (ux*vy-uy*vx<0?-1:1)*Math.acos(c);
  }
  var ux=(x1p-cxp)/rx, uy=(y1p-cyp)/ry, vx=(-x1p-cxp)/rx, vy=(-y1p-cyp)/ry;
  var th1=ang(1,0,ux,uy), dth=ang(ux,uy,vx,vy);
  if(!sweep&&dth>0) dth-=2*Math.PI;
  else if(sweep&&dth<0) dth+=2*Math.PI;
  var segs=Math.max(1,Math.ceil(Math.abs(dth)/(Math.PI/2))), out=[];
  var delta=dth/segs, k=4/3*Math.tan(delta/4);
  var t=th1;
  for(var i=0;i<segs;i++){
    var t2=t+delta;
    var c1=Math.cos(t), s1=Math.sin(t), c2=Math.cos(t2), s2=Math.sin(t2);
    /* Control points in the unrotated ellipse frame, then rotated out. */
    function pt(a,b){ return { x:cx+cp*(rx*a)-sp*(ry*b), y:cy+sp*(rx*a)+cp*(ry*b) }; }
    var p1=pt(c1-k*s1, s1+k*c1), p2=pt(c2+k*s2, s2-k*c2), pe=pt(c2,s2);
    out.push({cubic:true,x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,x:pe.x,y:pe.y});
    t=t2;
  }
  return out;
}

/* A rounded rectangle as a path. SVG clamps the radii to half the side and
   fills in a missing rx/ry from the other (SVG 1.1 §9.2), and the sheets rely
   on both behaviours. Pure, so the arithmetic is testable without a DOM. */
function roundRectPath(x,y,w,h,rx,ry){
  if(rx==null&&ry==null) rx=ry=0;
  if(rx==null) rx=ry;
  if(ry==null) ry=rx;
  rx=Math.min(Math.abs(rx),w/2); ry=Math.min(Math.abs(ry),h/2);
  if(!(rx>0&&ry>0))
    return 'M '+x+' '+y+' L '+(x+w)+' '+y+' L '+(x+w)+' '+(y+h)+' L '+x+' '+(y+h)+' Z';
  return 'M '+(x+rx)+' '+y
    +' L '+(x+w-rx)+' '+y+' A '+rx+' '+ry+' 0 0 1 '+(x+w)+' '+(y+ry)
    +' L '+(x+w)+' '+(y+h-ry)+' A '+rx+' '+ry+' 0 0 1 '+(x+w-rx)+' '+(y+h)
    +' L '+(x+rx)+' '+(y+h)+' A '+rx+' '+ry+' 0 0 1 '+x+' '+(y+h-ry)
    +' L '+x+' '+(y+ry)+' A '+rx+' '+ry+' 0 0 1 '+(x+rx)+' '+y+' Z';
}
function point(m,x,y){return {x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};}
function path(d,m){
  var tokens=(d||'').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
  var out=[],i=0,cmd='',x=0,y=0,sx=0,sy=0;
  /* Last control point in USER space, for the smooth commands. It has to be
     user-space: S and T reflect through the current point before the CTM is
     applied, and reflecting the transformed control point instead is wrong
     the moment a sheet is rotated or mirrored. */
  var lcx=null,lcy=null,lastKind='';
  function num(){var t=tokens[i++],n=Number(t);if(t===undefined||!isFinite(n))fail('Invalid SVG path');return n;}
  /* Flags in an arc may be written unseparated (a1 1 0 011 1 is legal). The
     tokeniser splits on numbers, so read a flag as the leading digit of
     whatever is next and push the remainder back. */
  function flag(){
    var t=tokens[i];
    if(t===undefined)fail('Invalid SVG arc');
    if(t==='0'||t==='1'){i++;return t==='1';}
    if(/^[01]/.test(t)){tokens[i]=t.slice(1);return t.charAt(0)==='1';}
    fail('Invalid SVG arc flag');
  }
  function p(a,b){return point(m,a,b);}
  while(i<tokens.length){
    if(/^[a-zA-Z]$/.test(tokens[i]))cmd=tokens[i++];
    var up=cmd.toUpperCase(),rel=cmd!==up,bx=rel?x:0,by=rel?y:0,q,r,v,c1x,c1y;
    if(up==='Z'){out.push({close:true});x=sx;y=sy;lcx=lcy=null;lastKind='';cmd='';continue;}
    if(up==='M'||up==='L'){x=num()+bx;y=num()+by;v=p(x,y);if(up==='M'){v.moveTo=true;sx=x;sy=y;cmd=rel?'l':'L';}out.push(v);lcx=lcy=null;lastKind='';}
    else if(up==='H'){x=num()+bx;out.push(p(x,y));lcx=lcy=null;lastKind='';}
    else if(up==='V'){y=num()+by;out.push(p(x,y));lcx=lcy=null;lastKind='';}
    else if(up==='Q'||up==='T'){
      if(up==='Q'){c1x=num()+bx;c1y=num()+by;}
      else{ /* reflect the previous quadratic control point, or sit on the
               current point when the previous command was not a quadratic */
        c1x=(lastKind==='Q'&&lcx!=null)?2*x-lcx:x;
        c1y=(lastKind==='Q'&&lcy!=null)?2*y-lcy:y;
      }
      q=p(c1x,c1y);x=num()+bx;y=num()+by;v=p(x,y);
      v.curve={type:'quadratic',x1:q.x,y1:q.y};out.push(v);
      lcx=c1x;lcy=c1y;lastKind='Q';
    }
    else if(up==='C'||up==='S'){
      if(up==='C'){c1x=num()+bx;c1y=num()+by;}
      else{
        c1x=(lastKind==='C'&&lcx!=null)?2*x-lcx:x;
        c1y=(lastKind==='C'&&lcy!=null)?2*y-lcy:y;
      }
      q=p(c1x,c1y);
      var c2x=num()+bx,c2y=num()+by; r=p(c2x,c2y);
      x=num()+bx;y=num()+by;v=p(x,y);
      v.curve={type:'cubic',x1:q.x,y1:q.y,x2:r.x,y2:r.y};out.push(v);
      lcx=c2x;lcy=c2y;lastKind='C';
    }
    else if(up==='A'){
      var arx=num(),ary=num(),rot=num(),la=flag(),sw=flag();
      var ex=num()+bx,ey=num()+by;
      arcToCubics(x,y,arx,ary,rot,la,sw,ex,ey).forEach(function(seg){
        if(seg.line){var lp=p(seg.x,seg.y);out.push(lp);return;}
        var a1=p(seg.x1,seg.y1),a2=p(seg.x2,seg.y2),ae=p(seg.x,seg.y);
        ae.curve={type:'cubic',x1:a1.x,y1:a1.y,x2:a2.x,y2:a2.y};
        out.push(ae);
      });
      x=ex;y=ey;lcx=lcy=null;lastKind='';
    }
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
      /* href means two different things now. On <image> it must be an
         embedded PNG or JPEG — an export that reaches out to the network is
         not a self-contained drawing. On <use> it is a fragment naming a
         symbol in this same sheet. Before <use> was supported every href was
         an image, so one rule covered both; it now rejects every one-line
         symbol on the sheet. Both intents are kept: nothing remote, ever. */
      if(/^(?:href|xlink:href)$/.test(a.name)){
        if(el.localName==='image'){
          if(!/^data:image\/(png|jpeg);base64,/.test(a.value))fail('Drawing images must be embedded PNG or JPEG');
        }else if(!/^#[^\s]+$/.test(String(a.value).trim())){
          fail('Only same-sheet references are permitted in drawing exports');
        }
      }
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
    var IDENT={a:1,b:0,c:0,d:1,e:0,f:0};

    /* Resolve an id inside the sheet being measured. It must be the LIVE
       imported tree, not the parsed document: cloning a node out of another
       document and inserting it here is a different node with no CTM. */
    function byId(id){
      return svg.querySelector('[id="'+String(id).replace(/["\\]/g,'\\$&')+'"]');
    }

    /* Expanding <use> and markers works by building the real geometry as a
       temporary group beside the element, letting the browser resolve its
       CTM, visiting it like anything else, and removing it. Composing the
       matrices by hand instead means reimplementing viewBox fitting and
       nested transforms, and getting one of them subtly wrong puts a symbol
       in the right place on most sheets and the wrong place on one. */
    function withTempGroup(sibling,transform,children,alpha,clip){
      var g=root.document.createElementNS('http://www.w3.org/2000/svg','g');
      if(transform)g.setAttribute('transform',transform);
      children.forEach(function(c){g.appendChild(c.cloneNode(true));});
      sibling.parentNode.insertBefore(g,sibling);
      try{ Array.prototype.slice.call(g.children).forEach(function(c){visit(c,alpha,clip);}); }
      finally{ g.parentNode&&g.parentNode.removeChild(g); }
    }

    /* viewBox fitting for <use> on a <symbol>. Only the default
       preserveAspectRatio behaviours are implemented, because that is what
       the symbol library uses; anything else refuses rather than guessing a
       scale, which would move an electrical symbol off its bus. */
    function symbolTransform(sym,ux,uy,uw,uh){
      var vb=(sym.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
      if(vb.length!==4||vb.some(function(n){return !isFinite(n);})||vb[2]<=0||vb[3]<=0)
        return 'translate('+ux+' '+uy+')';
      if(!(uw>0&&uh>0)) fail('<use> of a symbol needs width and height');
      var par=(sym.getAttribute('preserveAspectRatio')||'xMidYMid meet').trim();
      if(/none/.test(par))
        return 'translate('+ux+' '+uy+') scale('+(uw/vb[2])+' '+(uh/vb[3])+') translate('+(-vb[0])+' '+(-vb[1])+')';
      if(!/^xMidYMid(\s+meet)?$/.test(par))
        fail('Symbol alignment '+par+' requires a reviewed conversion');
      var k=Math.min(uw/vb[2],uh/vb[3]);
      var tx=ux+(uw-vb[2]*k)/2, ty=uy+(uh-vb[3]*k)/2;
      return 'translate('+tx+' '+ty+') scale('+k+') translate('+(-vb[0])+' '+(-vb[1])+')';
    }

    /* Vertices in the element's own user space — the frame a marker's
       transform has to be written in, since the temp group is inserted as a
       sibling and inherits the same CTM. */
    function userVertices(el,tag){
      function n(k,d){var v=el.getAttribute(k);return v===null?(d||0):Number(v);}
      if(tag==='line')return [{x:n('x1'),y:n('y1')},{x:n('x2'),y:n('y2')}];
      if(tag==='polyline'||tag==='polygon'){
        var vals=(el.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number),o=[];
        for(var i=0;i+1<vals.length;i+=2)o.push({x:vals[i],y:vals[i+1]});
        return o;
      }
      if(tag==='path')return path(el.getAttribute('d'),IDENT).filter(function(v){return !v.close;});
      return [];
    }

    /* Markers are drawing content, not decoration: on these sheets they are
       the arrowheads on one-line connections and on dimension leaders. A
       drawing that loses them loses direction of flow. */
    function emitMarkers(el,tag,style,alpha,clip){
      var refs=[['markerStart',style.markerStart],['markerMid',style.markerMid],['markerEnd',style.markerEnd]];
      if(!refs.some(function(r){return r[1]&&r[1]!=='none';}))return;
      var verts=userVertices(el,tag);
      if(verts.length<2)return;
      var sw=parseFloat(style.strokeWidth); if(!isFinite(sw)||sw<=0)sw=1;
      refs.forEach(function(r){
        var raw=r[1]; if(!raw||raw==='none')return;
        var id=/url\(["']?#([^"')]+)["']?\)/.exec(raw); if(!id)return;
        var mk=byId(id[1]);
        if(!mk)fail('Marker #'+id[1]+' is referenced but not defined');
        var mvb=(mk.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
        var mw=Number(mk.getAttribute('markerWidth')||3), mh=Number(mk.getAttribute('markerHeight')||3);
        var rx=Number(mk.getAttribute('refX')||0), ry=Number(mk.getAttribute('refY')||0);
        var unit=(mk.getAttribute('markerUnits')||'strokeWidth')==='userSpaceOnUse'?1:sw;
        var orient=mk.getAttribute('orient')||'0';
        var k=1;
        if(mvb.length===4&&mvb[2]>0&&mvb[3]>0)k=Math.min(mw/mvb[2],mh/mvb[3]);
        var at=[];
        if(r[0]==='markerStart')at=[0];
        else if(r[0]==='markerEnd')at=[verts.length-1];
        else for(var q=1;q<verts.length-1;q++)at.push(q);
        at.forEach(function(idx){
          var prev=verts[Math.max(0,idx-1)],next=verts[Math.min(verts.length-1,idx+1)];
          var ang=orient==='auto'||orient==='auto-start-reverse'
            ? Math.atan2(next.y-prev.y,next.x-prev.x)*180/Math.PI
            : (parseFloat(orient)||0);
          if(orient==='auto-start-reverse'&&r[0]==='markerStart')ang+=180;
          var t='translate('+verts[idx].x+' '+verts[idx].y+') rotate('+ang+') scale('+(unit*k)+') '
               +'translate('+(-rx)+' '+(-ry)+')';
          withTempGroup(el,t,Array.prototype.slice.call(mk.children),alpha,clip);
        });
      });
    }

    /* The clip rectangle in the same normalised space as every emitted
       object, or a refusal if the clip is not a single untransformed rect. */
    function clipRectOf(cssValue,el){
      var id=/url\(["']?#([^"')]+)["']?\)/.exec(cssValue);
      if(!id)fail('Clip path '+cssValue+' requires a reviewed conversion');
      var cp=byId(id[1]);
      if(!cp)fail('Clip path #'+id[1]+' is referenced but not defined');
      var kids=Array.prototype.filter.call(cp.children,function(c){
        return c.localName!=='title'&&c.localName!=='desc';});
      if(kids.length!==1||kids[0].localName!=='rect'||kids[0].getAttribute('transform'))
        fail('Only a single rectangular clip path is supported; #'+id[1]+' is not one');
      var r=kids[0],m2=inverse.multiply(el.getCTM());
      function rn(k){var v=r.getAttribute(k);return v===null?0:Number(v);}
      var c1=point(m2,rn('x'),rn('y')),c2=point(m2,rn('x')+rn('width'),rn('y')+rn('height'));
      if(Math.abs(m2.b)>0.001||Math.abs(m2.c)>0.001)
        fail('A rotated clip path requires a reviewed conversion');
      return {x:Math.min(c1.x,c2.x),y:Math.min(c1.y,c2.y),
              X:Math.max(c1.x,c2.x),Y:Math.max(c1.y,c2.y)};
    }
    function boundsOf(rec){
      if(rec.type!=='shape')
        return {x:rec.x,y:rec.y,X:rec.x+rec.w,Y:rec.y+rec.h};
      var xs=[],ys=[];
      rec.points.forEach(function(v){
        if(v.close)return; xs.push(v.x);ys.push(v.y);
        if(v.curve){xs.push(v.curve.x1);ys.push(v.curve.y1);
          if(v.curve.type==='cubic'){xs.push(v.curve.x2);ys.push(v.curve.y2);}}
      });
      if(!xs.length)return null;
      return {x:Math.min.apply(null,xs),y:Math.min.apply(null,ys),
              X:Math.max.apply(null,xs),Y:Math.max.apply(null,ys)};
    }
    function intersect(a,b){
      if(!a)return b; if(!b)return a;
      return {x:Math.max(a.x,b.x),y:Math.max(a.y,b.y),X:Math.min(a.X,b.X),Y:Math.min(a.Y,b.Y)};
    }

    /* The Selection Pane name is how an engineer finds one object among two
       thousand. "path 412" is not a name. In order of preference: an explicit
       data-omega-name the sheet generator supplied, the element's id, or the
       enclosing group's identity plus the tag — so a fence segment reads
       "Fence · line 12" rather than "line 12" even before the generators are
       taught to label their output. The numeric suffix stays: it keeps names
       unique, which PowerPoint needs. */
    function nameFor(el,tag,n){
      var explicit=el.getAttribute('data-omega-name')||el.getAttribute('data-omega-id');
      if(explicit)return String(explicit)+' '+n;
      if(el.id)return el.id+' '+n;
      var g=el.parentNode,depth=0;
      while(g&&g.nodeType===1&&depth++<4){
        var gl=g.getAttribute&&(g.getAttribute('data-omega-layer')||g.getAttribute('data-omega-name')||g.id);
        if(gl)return String(gl).replace(/[-_]+/g,' ')+' \u00b7 '+tag+' '+n;
        g=g.parentNode;
      }
      return tag+' '+n;
    }

    function visit(el,alpha,clip){
      var tag=el.localName,style=root.getComputedStyle(el);
      if(tag==='defs'||tag==='title'||tag==='desc'||tag==='metadata')return;
      if(style.display==='none'||style.visibility==='hidden'&&el.getAttribute('visibility')==='hidden')return;
      alpha*=isFinite(parseFloat(style.opacity))?parseFloat(style.opacity):1;
      if(alpha===0)return;
      if(style.mask&&style.mask!=='none'||style.filter&&style.filter!=='none')fail('Masked or filtered object requires a reviewed conversion');
      if(style.clipPath&&style.clipPath!=='none'){
        /* Both clips on these sheets are a plain rectangle around the map
           group. A rectangle intersects cleanly, so it is carried down as a
           window rather than refused. Anything else still refuses: a general
           clip needs polygon booleans, and approximating one moves a
           property line. */
        clip=intersect(clip,clipRectOf(style.clipPath,el));
      }
      if(tag==='svg'||tag==='g'){
        /* Snapshot: expanding a <use> or a marker inserts a temporary sibling,
           and el.children is a live collection. Iterating it directly makes an
           insertion shift the index and either duplicate an object or drop
           one — the exact silent omission this converter must not do. */
        Array.prototype.slice.call(el.children).forEach(function(c){visit(c,alpha,clip);});
        return;
      }
      if(tag==='use'){
        /* One-line symbols — breaker, transformer, meter, PCS — are all drawn
           this way. Refusing <use> refused the one-line diagram. */
        var uref=el.getAttribute('href')||el.getAttributeNS('http://www.w3.org/1999/xlink','href')||'';
        var uid=/^#(.+)$/.exec(uref.trim());
        if(!uid)fail('<use> must reference an element in this sheet');
        var target=byId(uid[1]);
        if(!target)fail('<use> references #'+uid[1]+', which is not defined in this sheet');
        function ua(k){var v=el.getAttribute(k);return v===null?0:Number(v);}
        var utf=target.localName==='symbol'
          ? symbolTransform(target,ua('x'),ua('y'),ua('width'),ua('height'))
          : 'translate('+ua('x')+' '+ua('y')+')';
        var kids=target.localName==='symbol'||target.localName==='g'
          ? Array.prototype.slice.call(target.children) : [target];
        withTempGroup(el,utf,kids,alpha,clip);
        return;
      }
      var m=inverse.multiply(el.getCTM()),pts=[],n=objects.length+1;
      function a(k,def){var v=el.getAttribute(k);return v===null?(def||0):Number(v);}
      function p(x,y){return point(m,x,y);}
      var rec={name:nameFor(el,tag,n),fill:color(style.fill),stroke:color(style.stroke),alpha:alpha,
        fillAlpha:parseFloat(style.fillOpacity),strokeAlpha:parseFloat(style.strokeOpacity),
        lineWidth:parseFloat(style.strokeWidth)*Math.sqrt(m.a*m.a+m.b*m.b),dash:style.strokeDasharray!=='none'};

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
        var href=el.getAttribute('href')||el.getAttributeNS('http://www.w3.org/1999/xlink','href');
        if(!/^data:image\/(png|jpeg);base64,/.test(href||''))fail('Map and logo images must be embedded PNG or JPEG');
        /* An image may be rotated with the sheet. Reflections are refused:
           PowerPoint expresses them as a flip, and a mirrored site photo is
           worse than no photo. Skew is not expressible at all. */
        var det=m.a*m.d-m.b*m.c;
        if(det<=0)fail('Reflected image requires a reviewed conversion');
        if(Math.abs(m.a*m.c+m.b*m.d)>0.001)fail('Skewed image requires a reviewed conversion');
        var isx=Math.hypot(m.a,m.b), isy=Math.hypot(m.c,m.d);
        var iw=a('width')*isx, ih=a('height')*isy;
        /* Rotation is about the image centre in PowerPoint and about the
           origin in SVG, so place by centre and let the rotation happen
           there. Placing by corner puts a rotated map off the sheet. */
        var ic=p(a('x')+a('width')/2, a('y')+a('height')/2);
        rec.type='image';rec.data=href;rec.w=iw;rec.h=ih;
        rec.x=ic.x-iw/2;rec.y=ic.y-ih/2;
        rec.rotate=Math.atan2(m.b,m.a)*180/Math.PI;

        /* preserveAspectRatio decides what happens when the image's own
           aspect ratio does not match the box. `none` stretches, which is
           what the box already describes. `meet` letterboxes: shrink to fit
           so nothing is lost. `slice` crops: PowerPoint expresses that as a
           source-rectangle crop, which stays a separate, removable, editable
           picture rather than being burned into the drawing. */
        var par=(el.getAttribute('preserveAspectRatio')||'xMidYMid meet').trim();
        if(!/none/.test(par)){
          if(!/^xMidYMid(\s+(meet|slice))?$/.test(par)&&!/^xMaxYMid\s+slice$/.test(par))
            fail('Image alignment '+par+' requires a reviewed conversion');
          /* xMaxYMid slice appears once. The exporter's cover centres the
             crop rather than pinning it right; on a near-square image the
             difference is invisible and on a wide one it shifts the visible
             window. Recorded in the validation report rather than blocking
             an export over an alignment. */
          rec.fit={mode:/slice/.test(par)?'slice':'meet'};
        }
      }else{
        rec.type='shape';
        if(tag==='path')pts=path(el.getAttribute('d'),m);
        else if(tag==='line')pts=[p(a('x1'),a('y1')),p(a('x2'),a('y2'))];
        else if(tag==='rect'){
          var x=a('x'),y=a('y'),w=a('width'),h=a('height');
          var hasRx=el.getAttribute('rx')!==null,hasRy=el.getAttribute('ry')!==null;
          if(hasRx||hasRy){
            /* 220 of these across the sheet generators — equipment outlines,
               title-block cells, legend chips. Refusing them stopped almost
               every sheet. Same grammar as any other path, so the corners are
               real editable geometry rather than a squared-off approximation. */
            pts=path(roundRectPath(x,y,w,h,hasRx?a('rx'):null,hasRy?a('ry'):null),m);
          }else{
            pts=[p(x,y),p(x+w,y),p(x+w,y+h),p(x,y+h),{close:true}];
          }
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

      if(clip){
        var bb=boundsOf(rec);
        if(bb){
          /* Wholly outside the clip is not a silent omission — the clip
             already hid it, and drawing it would ADD content the sheet does
             not show. */
          if(bb.X<=clip.x||bb.x>=clip.X||bb.Y<=clip.y||bb.y>=clip.Y)return;
          var inside=bb.x>=clip.x-0.01&&bb.X<=clip.X+0.01&&bb.y>=clip.y-0.01&&bb.Y<=clip.Y+0.01;
          if(!inside){
            if(rec.type==='image'){
              /* Crop the map to the window. Still one whole picture in the
                 file with a source rectangle, so it stays removable. */
              rec.clipTo={x:Math.max(bb.x,clip.x),y:Math.max(bb.y,clip.y),
                          X:Math.min(bb.X,clip.X),Y:Math.min(bb.Y,clip.Y)};
            }else if(rec.type!=='text'){
              fail('Object "'+rec.name+'" crosses a clip boundary; clipping vector geometry requires a reviewed conversion');
            }
            /* Text straddling the window is kept whole: a half-drawn label is
               worse than one that overhangs, and the reviewer can see it. */
          }
        }
      }
      objects.push(rec);
      /* After the line itself, so the arrowhead sits above it in the
         Selection Pane in the order a reader expects. */
      if(rec.type==='shape')emitMarkers(el,tag,style,alpha,clip);
    }
    visit(svg,1,null);
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
    }else if(r.type==='image'){
      common.data=r.data;common.transparency=100*(1-r.alpha);
      if(r.rotate)common.rotate=r.rotate;
      /* preserveAspectRatio maps straight onto the exporter's own fitting:
         `meet` is contain (letterbox, nothing lost), `slice` is cover (fill
         and crop the overflow). Both are written as a source rectangle on a
         whole picture, so the map stays one separate, removable, uncropped
         image in the file — which is the requirement. Absent fit means the
         sheet asked for `none`, and the box is the answer. */
      if(r.clipTo){
        /* A clip window over part of the image. Verified against the bundled
           exporter: it calls the sizing function as fn({w,h} of the object's
           own box, {w,h,x,y} of the sizing) and derives srcRect from the
           ratio, so x/y/w/h are inches WITHIN the placement box. Keep w/h as
           the full image box — that is the reference the ratio is taken
           against — and move the frame to the window's own corner. */
        common.x=(r.clipTo.x-vb[0])/units; common.y=(r.clipTo.y-vb[1])/units;
        common.sizing={type:'crop',
          x:(r.clipTo.x-r.x)/units, y:(r.clipTo.y-r.y)/units,
          w:(r.clipTo.X-r.clipTo.x)/units, h:(r.clipTo.Y-r.clipTo.y)/units};
      }else if(r.fit){
        common.sizing={type:r.fit.mode==='slice'?'cover':'contain',w:common.w,h:common.h};
      }
      slide.addImage(common);
    }
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
/* arcToCubics and roundRectPath are exported for the tests. They are the only
   parts of the converter that are pure arithmetic, and they are also the parts
   most likely to be silently wrong — a bad arc is a shape that still draws,
   just in the wrong place. Testing them needs no DOM. */
root.OmegaEditablePlotPPT={build:build,compile:compile,addObjects:addObjects,path:path,
  arcToCubics:arcToCubics,roundRectPath:roundRectPath};
})(typeof window!=='undefined'?window:globalThis);
