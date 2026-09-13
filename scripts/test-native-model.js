/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('editor.html','utf8');
function lift(name){let a=src.indexOf('function '+name+'('),b=src.indexOf('\n}',a);return src.slice(a,b+2);}
let element={id:'battery',type:'evgear',x:100,y:200,w:40,h:20,rot:0};
let shape={id:'block',kind:'rect',tx:0,ty:0,scale:1};
let history=0,attached=0,refresh=0;
let items=[{id:'battery',src:'element',ref:element},{id:'block',src:'shape',ref:shape}];
const box={S:{history:[{}]},readSite:()=>({calibrated:true,ppf:2,items}),renderEl:()=>{},renderShape:()=>{},updateAttached:()=>attached++,pushHist:()=>history++,reload:()=>refresh++};
vm.createContext(box);vm.runInContext(lift('elementBox')+'\n'+lift('applyModelEdit'),box);
box.applyModelEdit('battery',{east:10,north:5,rotation:450,scale:2,height:8,elevation:1,color:'#123456'});
assert.equal(element.x,100);assert.equal(element.y,180);assert.equal(element.w,80);assert.equal(element.h,40);assert.equal(element.rot,90);assert.equal(element._modelHeightFt,8);assert.equal(history,1);assert.equal(attached,1);assert.equal(refresh,1);
box.applyModelEdit('block',{east:3,north:4,rotation:20,scale:1.5});assert.equal(shape.tx,6);assert.equal(shape.ty,-8);assert.equal(shape.scale,1.5);
const before=JSON.stringify(element);assert.throws(()=>box.applyModelEdit('battery',{scale:0}));assert.equal(JSON.stringify(element),before);
box.readSite=()=>({calibrated:false,ppf:2,items});assert.throws(()=>box.applyModelEdit('battery',{east:1}));assert.equal(JSON.stringify(element),before);
assert(!src.includes('function blenderOBJ'));assert(!src.includes('Blender OBJ'));
console.log('5 native model checks passed: shared element transform, shared shape transform, invalid-input atomicity, calibration gate, no Blender export');
