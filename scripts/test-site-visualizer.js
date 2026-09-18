/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Regression checks for canvas/3D alignment and asynchronous ground loads. */
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var html = fs.readFileSync(require('path').join(__dirname, '../editor.html'), 'utf8');
var ground = html.slice(html.indexOf('function buildGround(site, span){'), html.indexOf('/* Release the GPU side of a discarded subtree.'));
var assembly = html.slice(html.indexOf('function buildBessAssembly(it, arch){'), html.indexOf('function buildCabinet(it, arch, mat){'));
function vector() { return {set:function(x,y,z){this.x=x;this.y=y;this.z=z;}}; }
function Group(){this.children=[];this.position=vector();}
Group.prototype.add=function(v){this.children.push(v);};
Group.prototype.remove=function(v){var i=this.children.indexOf(v);if(i>=0)this.children.splice(i,1);};
function Geometry(w,h){this.w=w;this.h=h;this.dispose=function(){};}
function Material(opts){Object.assign(this,opts);this.dispose=function(){};}
function Mesh(geometry,material){this.geometry=geometry;this.material=material;this.rotation={x:0,y:0,z:0};this.position=vector();this.scale=vector();}
function fixture(upload, zoom){
  var requests=[], timers=[];
  function Loader(){}
  Loader.prototype.setCrossOrigin=function(){};
  Loader.prototype.load=function(src,ok,progress,fail){requests.push({src:src,ok:ok,fail:fail});};
  var ctx={THREE:{Group:Group,Mesh:Mesh,PlaneGeometry:Geometry,MeshStandardMaterial:Material,TextureLoader:Loader},
    V:{groundToken:0,groundGrp:new Group(),opts:{sat:true,quality:'high'},sph:{r:100}},
    MAT:{ground:new Material()},QUALITY:{high:{aniso:4}},BG:{scale:2,tx:20,ty:-10,rot:30},
    window:{_isUploadedPhoto:!!upload},_CFG:{googleMapsKey:'test-key'},localStorage:{getItem:function(){return null;}},
    document:{getElementById:function(id){return id==='sc'?{clientWidth:1000,clientHeight:600}:id==='backdrop'?{src:'capture',style:{}}:null;},createElement:function(){throw Error('No image sampling in unit test');}},
    _liveMapState:function(){return {lat:40,lng:-90,zoom:zoom};},
    setTimeout:function(fn){timers.push(fn);},console:{warn:function(){}}};
  vm.createContext(ctx);vm.runInContext(ground,ctx);
  function build(){ctx.buildGround({ppf:2,originPx:{x:100,y:50},sizeFt:{w:500,h:300}},500);}
  function texture(){return {image:{width:1000,height:600},dispose:function(){this.disposed=true;}};}
  return {ctx:ctx,requests:requests,timers:timers,build:build,texture:texture};
}
var f=fixture(false,20);f.build();
assert(f.requests[0].src.indexOf('zoom=19&size=500x300')>=0,'Static image preserves the canvas geographic extent');
f.timers[0]();var capture=f.requests[f.requests.length-1];
f.requests[0].ok(f.texture());var late=f.texture();capture.ok(late);
assert(late.disposed,'Late capture cannot cover a successful exact map');
assert.equal(f.ctx.V.groundGrp.children.length,2);
var plane=f.ctx.V.groundGrp.children[1];
assert.equal(plane.geometry.w,500);assert.equal(plane.geometry.h,300);
assert.equal(plane.position.x,200);assert.equal(plane.position.z,125);
f.requests[1].fail();assert.equal(f.requests.length,4,'Context failure does not start another capture');
var stale=f.requests[2];f.build();var old=f.texture();stale.ok(old);
assert(old.disposed,'Old refresh callbacks dispose their textures');
f=fixture(true,20);f.build();
assert.equal(f.requests.length,1);assert.equal(f.requests[0].src,'capture','Uploaded maps must not be replaced by satellite imagery');
f.requests[0].ok(f.texture());plane=f.ctx.V.groundGrp.children[1];
assert.equal(plane.rotation.y,0,'Image rotation must not tilt the ground plane');
assert(Math.abs(plane.rotation.z+Math.PI/6)<1e-9);
assert.equal(plane.position.x,210);assert.equal(plane.position.z,120);
assert.equal(plane.scale.x,2);assert.equal(plane.scale.y,2);
f=fixture(false,undefined);f.build();
assert(f.requests.every(function(r){return r.src.indexOf('size=500x300')<0;}),'Unknown zoom must not fabricate an aligned foreground');

var runs=[], models=[];
var ctx={THREE:{Group:Group},ARCH:{'bess-container':{},xfmr:{},pcs:{},disco:{},ems:{},fence:{h:7},bollard:{}},MAT:{}};
['buildPad','buildContainer','buildXfmr','buildCabinet','buildBollard'].forEach(function(name){
  ctx[name]=function(it){var node=new Group();node.kind=name;node.item=it;models.push(node);return node;};
});
ctx.fenceRun=function(){runs.push(Array.prototype.slice.call(arguments,1));};
vm.createContext(ctx);vm.runInContext(assembly,ctx);
ctx.buildBessAssembly({assemblyScale:2,ref:{parts:[{key:'concpad',lf:20,wf:10,dx:0,dy:0},{key:'bess',lf:10,wf:8,dx:-3,dy:0},{key:'pcs',lf:3,wf:2,dx:6,dy:1}],
  sides:{n:'fence',e:'none',s:'bollards',w:'none'},fenceClear:0,bollardOffset:0,bollardSpacing:5}},{});
assert.equal(runs.length,1,'Only authored fence sides render');
assert.deepEqual(runs[0].slice(0,4),[-20,-10,20,-10],'Zero clearance and assembly scale are preserved');
assert.equal(models.filter(function(m){return m.kind==='buildBollard';}).length,5,'Bollards follow authored side length and spacing');
var battery=models.filter(function(m){return m.kind==='buildContainer';})[0];
assert.equal(battery.position.x,-6);assert.equal(battery.item.wf,20);assert.equal(battery.item.lf,16);
console.log('Site visualizer: ground alignment, upload transforms, image-load races and assembly geometry passed.');

var visualContext={window:{}};
vm.createContext(visualContext);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../omega-equipment-visuals.js'),'utf8'),visualContext);
var visuals=visualContext.window.OmegaEquipmentVisuals;
var autel=visuals.resolve({evModel:'Autel AC Pro'},'charger');
assert(autel.exact);assert.equal(autel.product.w,8.5);assert.equal(autel.product.h,14.5);assert.equal(autel.product.d,5.1);
assert.equal(visuals.resolve({evModel:'Other manufacturer'},'charger'),null,'Unknown chargers cannot acquire Autel identity');
assert.equal(visuals.resolve({label:'Existing Meter Bank'},'meter').exact,false,'Existing meters are not silently assigned a model');
assert.equal(visuals.resolve({label:'Outdoor Panel / Disconnect'},'panel').exact,false);
assert.equal(visuals.resolve({label:'Main switchgear'},'panel'),null,'Small 60 A enclosure is not a switchgear reference');
assert.equal(visuals.resolve({_visProduct:'qo60'},'panel').product.h,8.8);
assert.equal(visuals.resolve({_visProduct:'qo60'},'charger'),null,'Product overrides must match the equipment type');
assert(visuals.symbol('meter',60,60).indexOf('<circle')>=0);
assert(visuals.symbol('panel',60,60).indexOf('<circle')<0);
console.log('Equipment references: manufacturer dimensions, type matching and unverified-model labels passed.');
