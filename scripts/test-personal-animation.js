const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('omega-doom.js','utf8');
const idle={getClip:()=>({name:'Idle | Ben Ben'}),reset(){return this;},setEffectiveWeight(){return this;},play(){this.playing=true;return this;},stop(){this.playing=false;},crossFadeTo(){}};
const context=vm.createContext({actions:[idle],state:'speaking',opts:{idleFallback:true},activeAction:null,nextGesture:0,phase:0,lastClip:-1,Math});
vm.runInContext(source.slice(source.indexOf('function chooseClip()'),source.indexOf('var ready=Promise.resolve(source)')),context);
vm.runInContext('chooseClip()',context);assert(idle.playing);
context.opts.idleFallback=false;vm.runInContext('chooseClip()',context);assert(!idle.playing);
const html=fs.readFileSync('mission.html','utf8');let count=0;
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
 if(/\bsrc\s*=|application\/ld\+json|application\/json/.test(match[1]))continue;
 if (/type="module"/.test(match[1])) require('child_process').execFileSync(process.execPath,['--input-type=module','--check'],{input:match[2]}); else new vm.Script(match[2]);count++;
}
console.log('PASS: authored idle continues during speech, existing behavior preserved, '+count+' inline Mission scripts parse');
