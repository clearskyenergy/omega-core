/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert=require('assert'),fs=require('fs'),vm=require('vm'),T=require('../assets/vendor/three-r128/three.min.js');
var bytes=fs.readFileSync('assets/doom/dr-doom-v2.glb');
assert.strictEqual(bytes.readUInt32LE(0),0x46546c67);assert.strictEqual(bytes.readUInt32LE(8),bytes.length);
var g=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
var joints=new Set(g.skins[0].joints);assert.strictEqual(joints.size,151);assert.strictEqual((g.animations||[]).length,0);
var nodes=g.nodes.map(function(n,i){var o=joints.has(i)?new T.Bone():new T.Object3D();o.name=n.name;if(n.matrix)o.applyMatrix4(new T.Matrix4().fromArray(n.matrix));else{if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);}return o;});
g.nodes.forEach(function(n,i){(n.children||[]).forEach(function(j){nodes[i].add(nodes[j]);});});
var scene=new T.Scene();scene.add(nodes[0]);scene.updateMatrixWorld(true);
var clamps=nodes[170].getWorldPosition(new T.Vector3()),belt=nodes[172].getWorldPosition(new T.Vector3());
var context={window:{}};vm.runInNewContext(fs.readFileSync('omega-doom.js','utf8'),context);
var rig=context.window.OmegaDoom.createDoomRig(scene,T);assert(rig&&rig.mapped);
scene.updateMatrixWorld(true);
assert(clamps.distanceTo(nodes[170].getWorldPosition(new T.Vector3()))<1e-6,'Clasp reparent preserves bind position');
assert(belt.distanceTo(nodes[172].getWorldPosition(new T.Vector3()))<1e-6,'Belt reparent preserves bind position');
rig.step(.016,'idle',0,false);scene.updateMatrixWorld(true);var restHand=nodes[71].getWorldPosition(new T.Vector3()),maxHand=0;
for(var i=0;i<1800;i++){rig.step(1/60,'speaking',.4,false);scene.updateMatrixWorld(true);maxHand=Math.max(maxHand,restHand.distanceTo(nodes[71].getWorldPosition(new T.Vector3())));joints.forEach(function(j){var q=nodes[j].quaternion;assert(q.toArray().every(Number.isFinite));assert(Math.abs(q.length()-1)<1e-5);});}
assert(maxHand>.1,'Speech actually articulates the hand through the skeleton');
var legRest=nodes[10].quaternion.clone(),maxLeg=0;
for(var k=0;k<600;k++){var movement=rig.step(1/60,'walk',0,false);maxLeg=Math.max(maxLeg,legRest.angleTo(nodes[10].quaternion));assert(movement.walk>=0&&movement.walk<=1);}
assert(maxLeg>.2,'Walk rotates hip joints');
for(var j=0;j<600;j++)rig.step(1/60,'idle',0,true);
var held=nodes[24].quaternion.clone();rig.step(1/60,'speaking',1,true);assert(held.angleTo(nodes[24].quaternion)<1e-5,'Reduced motion suppresses audio nod');
console.log('PASS: source GLB, 151 joints, accessory attachments, speech articulation, gait, finite rotations, reduced motion');
