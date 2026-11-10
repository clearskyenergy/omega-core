const fs = require('fs'), vm = require('vm'), assert = require('assert');
const context = vm.createContext({window:{}, ArrayBuffer, DataView, Uint8Array, TextDecoder, Promise});
vm.runInContext(fs.readFileSync('omega-personal-character.js','utf8'), context);
const api = context.window.OmegaPersonalCharacter;
function glb(data) {
  let text = JSON.stringify(data); while(text.length%4) text+=' ';
  const bytes = new ArrayBuffer(20+text.length), view = new DataView(bytes);
  [0x46546c67,2,bytes.byteLength,text.length,0x4e4f534a].forEach((v,i)=>view.setUint32(i*4,v,true));
  new Uint8Array(bytes,20).set(Buffer.from(text)); return bytes;
}
const valid=glb({asset:{version:'2.0'},buffers:[{byteLength:0}]});
assert.strictEqual(api.validate(valid),valid);
assert.throws(()=>api.validate(new ArrayBuffer(3)));
assert.throws(()=>api.validate(glb({images:[{uri:'https://example.com/image.png'}]})),/embed/);
assert.throws(()=>api.validate(glb({buffers:[{uri:'file:///private/file'}]})),/embed/);
assert.throws(()=>api.validate(glb({images:[{uri:'../image.png'}]})),/embed/);
const broken=valid.slice(0);new DataView(broken).setUint32(12,99999,true);
assert.throws(()=>api.validate(broken),/incomplete/);
if(fs.existsSync('../ben-ben/output/Ben-Ben-Stylized-Animated.glb')) {
 const actual=fs.readFileSync('../ben-ben/output/Ben-Ben-Stylized-Animated.glb');
 api.validate(actual.buffer.slice(actual.byteOffset,actual.byteOffset+actual.byteLength));
}
api.load().then(()=>assert.fail('Missing storage should fail')).catch(e=>{
  assert.match(e.message,/unavailable/);
  console.log('PASS: self-contained GLB validation, malformed and external resources rejected, storage failure reported');
}).catch(e=>{console.error(e);process.exitCode=1;});
