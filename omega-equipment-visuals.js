/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Product geometry references, reviewed 2026-09-17. Dimensions are enclosure
   W/H/D in inches, not drawing-symbol bounds, pads or working clearances.
   A reference appearance is never a BOM substitution or an equipment approval. */
(function(root){
  'use strict';
  var products={
    qo60:{kind:'panel',name:'Square D QO24L60NRNM',w:6.5,h:8.8,d:2.9,
      description:'60 A · 120/240 V · 2 spaces · NEMA 3R · main lugs',
      url:'https://www.se.com/us/en/product/QO24L60NRNM/',
      drawing:'https://assets.rs-online.com/v1731415434/Datasheets/6b95cffdcebb80c766802a9c01590b11.pdf'},
    milbank200:{kind:'meter',name:'Milbank U4801-O socket',w:13,h:19,d:4.844,
      description:'200 A · single position · ringless socket · NEMA 3R; meter shown illustratively',
      url:'https://www.milbankworks.com/specsheets/1001102_SS.pdf'},
    du221:{kind:'disco',name:'Square D DU221RB',w:7.75,h:9.63,d:3.75,
      description:'30 A · 240 V · 2 pole · non-fusible · NEMA 3R',
      url:'https://www.se.com/us/en/product/DU221RB/'},
    autelpro:{kind:'charger',name:'Autel MaxiCharger AC Pro',w:8.5,h:14.5,d:5.1,
      description:'80 A maximum · single connector · enclosure dimensions; support is illustrative',
      url:'https://www.autelenergy.com/global/product/ac-pro'}
  };
  function resolve(ref,kind){
    ref=ref||{};
    var selected=products[ref._visProduct];
    if(selected && selected.kind===kind) return {product:selected,exact:true,key:ref._visProduct};
    var name=[ref.evId,ref.evModel,ref.model,ref.label,ref.catalogId].join(' ');
    if(kind==='charger' && /autel.*(?:ac[ _-]*pro|maxicharger ac pro)/i.test(name))
      return {product:products.autelpro,exact:true,key:'autelpro'};
    if(kind==='panel' && /QO24L60NRNM/i.test(name)) return {product:products.qo60,exact:true,key:'qo60'};
    if(kind==='meter' && /U4801-O/i.test(name)) return {product:products.milbank200,exact:true,key:'milbank200'};
    if(kind==='disco' && /DU221RB/i.test(name)) return {product:products.du221,exact:true,key:'du221'};
    /* Unknown existing equipment retains its identity. These small-service
       references supply appearance only, and are labelled as such in the UI. */
    if(kind==='meter') return {product:products.milbank200,exact:false,key:'milbank200'};
    if(kind==='panel' && /outdoor panel|level.?2|subpanel/i.test(name)) return {product:products.qo60,exact:false,key:'qo60'};
    return null;
  }
  function symbol(kind,w,h){
    var body='<rect x="22" y="8" width="56" height="81" rx="3" fill="#adb5bd" stroke="#303b46" stroke-width="2"/>';
    if(kind==='meter') body+='<circle cx="50" cy="38" r="21" fill="#e0e9e9" stroke="#465868" stroke-width="4"/><circle cx="50" cy="38" r="17" fill="#c3d2d1"/><rect x="38" y="32" width="24" height="9" rx="1" fill="#33433f"/><path d="M37 49h26M27 65h46" stroke="#52636b" stroke-width="2"/><rect x="47" y="76" width="6" height="5" fill="#465868"/>';
    else body+='<path d="M19 10h62v5H19z" fill="#667582"/><rect x="27" y="20" width="46" height="63" rx="2" fill="#909da7" stroke="#4c5863"/><rect x="61" y="53" width="5" height="14" rx="1" fill="#27323d"/><rect x="38" y="29" width="23" height="9" fill="#d9dfe0"/><path d="M30 24v11M30 68v11" stroke="#dce3e7" stroke-width="3"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">'+body+'</svg>';
  }
  function build(it,T){
    var ref=it.ref||{}, kind=it.arch, resolved=resolve(ref,kind);
    if(['meter','panel','disco'].indexOf(kind)<0 && !resolved) return null;
    var p=resolved && resolved.product;
    var w=p?p.w/12:Math.max(.5,Math.min(it.wf||2,4));
    var h=p?p.h/12:(kind==='panel'?3:2), d=p?p.d/12:.65;
    var group=new T.Group(), mats={};
    function material(color,metal){
      var key=color+':'+(metal||0);
      if(!mats[key]){mats[key]=new T.MeshStandardMaterial({color:color,roughness:.55,metalness:metal||0});mats[key]._owned=true;}
      return mats[key];
    }
    var gray=material(0xaab2b8,.35), dark=material(0x253039,.3), silver=material(0xd0d7db,.65);
    function box(name,x,y,z,bw,bh,bd,mat,parent){
      var mesh=new T.Mesh(new T.BoxGeometry(bw,bh,bd),mat);
      mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;(parent||group).add(mesh);return mesh;
    }
    function disk(name,x,y,z,r,depth,mat,parent){
      var mesh=new T.Mesh(new T.CylinderGeometry(r,r,depth,40),mat);
      mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);mesh.name=name;mesh.castShadow=true;(parent||group).add(mesh);return mesh;
    }
    function rounded(name,x,y,z,bw,bh,bd,mat,parent){
      var r=Math.min(bw,bh)*.09, shape=new T.Shape();
      shape.moveTo(-bw/2+r,-bh/2);shape.lineTo(bw/2-r,-bh/2);
      shape.quadraticCurveTo(bw/2,-bh/2,bw/2,-bh/2+r);shape.lineTo(bw/2,bh/2-r);
      shape.quadraticCurveTo(bw/2,bh/2,bw/2-r,bh/2);shape.lineTo(-bw/2+r,bh/2);
      shape.quadraticCurveTo(-bw/2,bh/2,-bw/2,bh/2-r);shape.lineTo(-bw/2,-bh/2+r);
      shape.quadraticCurveTo(-bw/2,-bh/2,-bw/2+r,-bh/2);
      var mesh=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:bd,bevelEnabled:false,curveSegments:8}),mat);
      mesh.name=name;mesh.position.set(x,y,z-bd/2);mesh.castShadow=true;(parent||group).add(mesh);return mesh;
    }
    /* Nominal presentation support. Mount elevation can be authored; do not
       invent a building wall or a concrete equipment vault beneath the unit. */
    var center=ref._visMountCenterFt>0?+ref._visMountCenterFt:4.5;
    var back=-d/2-.13;
    if(ref._visMount!=='wall'){
      if(kind==='charger'){
        box('Illustrative pedestal',0,center/2,back,.32,center,.24,dark);
        box('Pedestal base',0,.045,back,.65,.09,.6,silver);
      }else{
        [-1,1].forEach(function(side){box('Support strut',side*w*.38,center/2,back,.12,center+.25,.12,silver);});
        box('Mounting rail',0,center,back,w+.2,.1,.1,silver);
      }
    }
    function enclosure(parent){
      (kind==='charger'?rounded:box)('Enclosure',0,center,0,w,h,d,gray,parent);
      var face=d/2+.015;
      if(kind==='meter'){
        box('Socket cover seam',0,center-h*.23,face,w*.92,.025,.025,dark,parent);
        var radius=Math.min(w*.34,h*.26);
        disk('Meter retaining ring',0,center+h*.13,face+.03,radius,.07,silver,parent);
        disk('Meter glass face',0,center+h*.13,face+.1,radius*.88,.11,material(0xbcd3d0,.25),parent);
        box('Meter LCD',0,center+h*.16,face+.17,radius*1.18,radius*.32,.02,dark,parent);
        box('Meter reading',0,center+h*.16,face+.185,radius*.9,radius*.1,.008,material(0x91a89c),parent);
        box('Meter seal',w*.12,center-h*.38,face,.07,.12,.04,dark,parent);
      }else if(kind==='charger'){
        rounded('Black charger face',0,center,face,w*.91,h*.94,.04,dark,parent);
        box('Display surround',0,center+h*.2,face+.027,w*.72,h*.29,.02,silver,parent);
        box('Charger display',0,center+h*.2,face+.044,w*.65,h*.24,.018,material(0x152b36),parent);
        box('Status light',0,center+h*.04,face+.056,w*.48,.02,.012,material(0x63cc9b),parent);
        disk('Connector holster',0,center-h*.21,face+.05,w*.16,.07,silver,parent);
        var pts=[new T.Vector3(w*.23,center-h*.4,.05),new T.Vector3(w*.63,center-h*.85,face+.22),new T.Vector3(w*.15,center-h*1.15,face+.26),new T.Vector3(-w*.5,center-h*.78,face+.27),new T.Vector3(0,center-h*.22,face+.16)];
        var cable=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),32,.028,8,false),dark);
        cable.name='Charging cable';(parent||group).add(cable);
        box('Holstered connector grip',0,center-h*.29,face+.19,.11,.23,.12,dark,parent);
      }else{
        box('Door seam',0,center,face,w*.91,h*.92,.022,dark,parent);
        box('Hinged door',0,center,face+.02,w*.87,h*.88,.025,gray,parent);
        box('Rain hood',0,center+h/2+.015,.025,w+.07,.04,d+.08,gray,parent);
        [-.32,.32].forEach(function(y){box('Door hinge',-w*.44,center+h*y,face+.04,.035,h*.1,.035,silver,parent);});
        box('Door latch',w*.32,center-h*.12,face+.05,.045,h*.13,.045,dark,parent);
        box('Equipment label',0,center+h*.23,face+.043,w*.4,h*.09,.012,silver,parent);
        if(kind==='disco'){
          box('External switch mechanism',w/2+.035,center,0,.07,h*.38,d*.7,dark,parent);
          box('Disconnect operating handle',w/2+.09,center+h*.09,d*.25,.09,h*.26,.1,material(0xb72f29),parent);
        }
      }
    }
    enclosure();
    if(kind==='charger' && (+ref.units>1 || /dual/i.test(ref.catalogId||''))){
      var second=new T.Group();second.rotation.y=Math.PI;second.position.z=-d-.27;group.add(second);enclosure(second);
    }
    group.userData.product=resolved?resolved.key:null;
    group.userData.referenceOnly=resolved?!resolved.exact:true;
    return group;
  }
  root.OmegaEquipmentVisuals={products:products,resolve:resolve,symbol:symbol,build:build};
})(window);
