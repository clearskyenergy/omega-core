/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Optional authoring script: writes a portable animated copy, no deployment build. */
'use strict';
var fs=require('fs'),vm=require('vm'),T=require('../assets/vendor/three-r128/three.min.js');
var source=fs.readFileSync('assets/doom/dr-doom-v2.glb'),jsonLength=source.readUInt32LE(12),g=JSON.parse(source.subarray(20,20+jsonLength)),binOffset=20+jsonLength;
var parts=[source.subarray(binOffset+8,binOffset+8+source.readUInt32LE(binOffset))],byteLength=parts[0].length;
var nodeIndex=new Map(),jointSet=new Set(g.skins[0].joints);
var nodes=g.nodes.map(function(n,i){var o=jointSet.has(i)?new T.Bone():new T.Object3D();o.name=n.name;nodeIndex.set(o,i);if(n.matrix)o.applyMatrix4(new T.Matrix4().fromArray(n.matrix));else{if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);}return o;});
g.nodes.forEach(function(n,i){(n.children||[]).forEach(function(j){nodes[i].add(nodes[j]);});});var scene=new T.Scene();scene.add(nodes[0]);scene.updateMatrixWorld(true);
var seed=11,math=Object.create(Math);math.random=function(){seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};var context={window:{},Math:math};vm.runInNewContext(fs.readFileSync('omega-doom.js','utf8'),context);
var buildRig=context.window.OmegaDoom.createDoomRig,rig=buildRig(scene,T);if(!rig)throw new Error('Expected the supplied Bip001 rig');
/* Store the corrected rigid accessory parents and local bind transforms. */
nodes.forEach(function(o,i){g.nodes[i].children=o.children.map(function(child){return nodeIndex.get(child);}).filter(function(j){return j!==undefined;});});
[170,172].forEach(function(i){var n=g.nodes[i],o=nodes[i];delete n.matrix;n.translation=o.position.toArray();n.rotation=o.quaternion.toArray();n.scale=o.scale.toArray();});
function accessor(values,type,width){while(byteLength%4){parts.push(Buffer.alloc(1));byteLength++;}var flat=width===1?values:values.flat(),buffer=Buffer.alloc(flat.length*4);flat.forEach(function(v,i){buffer.writeFloatLE(v,i*4);});var view=g.bufferViews.length;g.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:buffer.length});parts.push(buffer);byteLength+=buffer.length;var a={bufferView:view,componentType:5126,count:values.length,type:type};if(width===1){a.min=[Math.min.apply(null,values)];a.max=[Math.max.apply(null,values)];}var index=g.accessors.length;g.accessors.push(a);return index;}
g.animations=[];
[['Idle',Math.PI*2/1.6,'idle'],['Walk',Math.PI*2/4.5,'walk'],['Talk',6,'speaking']].forEach(function(spec){
rig.reset();rig=buildRig(scene,T);var dt=1/60;for(var warm=0;warm<120;warm++)rig.step(dt,spec[2],0,false);
var duration=spec[1],steps=Math.ceil(duration*30),times=[],samples={};jointSet.forEach(function(i){samples[i]=[];});
for(var frame=0;frame<=steps;frame++){var time=duration*frame/steps;times.push(time);rig.step(duration/steps,spec[2],spec[2]==='speaking'?.3:0,false);jointSet.forEach(function(i){samples[i].push(nodes[i].quaternion.clone().normalize());});}
var anim={name:spec[0],samplers:[],channels:[]},input=accessor(times,'SCALAR',1);
jointSet.forEach(function(i){var qs=samples[i],first=qs[0];var moving=qs.some(function(q){return first.angleTo(q)>.0005;});var sourcePose=new T.Quaternion().fromArray(g.nodes[i].rotation||[0,0,0,1]);if(!moving&&first.angleTo(sourcePose)<.0005)return;
qs.forEach(function(q,k){if(times[k]>duration-.25){var t=(times[k]-(duration-.25))/.25;q.slerp(first,t*t*(3-2*t));}if(k&&q.dot(qs[k-1])<0){q.x*=-1;q.y*=-1;q.z*=-1;q.w*=-1;}});
var sampler=anim.samplers.length;anim.samplers.push({input:input,output:accessor(qs.map(function(q){return q.toArray();}),'VEC4',4),interpolation:'LINEAR'});anim.channels.push({sampler:sampler,target:{node:i,path:'rotation'}});
});g.animations.push(anim);console.log(spec[0]+': '+anim.channels.length+' joint tracks');
});
g.asset.extras.modifications='Procedural Idle, Walk (in-place), Talk animation and rigid accessory binding added by ClearSky. Original model by Visiion, CC BY 4.0.';
g.buffers[0].byteLength=byteLength;var bin=Buffer.concat(parts);if(bin.length%4)bin=Buffer.concat([bin,Buffer.alloc(4-bin.length%4)]);var json=Buffer.from(JSON.stringify(g));if(json.length%4)json=Buffer.concat([json,Buffer.alloc(4-json.length%4,32)]);var header=Buffer.alloc(12),jc=Buffer.alloc(8),bc=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);jc.writeUInt32LE(json.length,0);jc.writeUInt32LE(0x4e4f534a,4);bc.writeUInt32LE(bin.length,0);bc.writeUInt32LE(0x004e4942,4);fs.writeFileSync('assets/doom/dr-doom-v2-animated.glb',Buffer.concat([header,jc,json,bc,bin]));
