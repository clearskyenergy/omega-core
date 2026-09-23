/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync('mission.html', 'utf8');
const nodes = {}, actors = [], saved = {};
function el(id) { return nodes[id] || (nodes[id] = {style:{},classList:{values:new Set(),add(v){this.values.add(v);},remove(v){this.values.delete(v);},contains(v){return this.values.has(v);}},addEventListener(name,fn){this[name]=fn;}}); }
function actor(){let resolve,reject;const a={ready:new Promise((r,j)=>{resolve=r;reject=j;}),resolve:()=>resolve(),reject:()=>reject(),destroy(){this.dead=true;},setState(v){this.state=v;},setEnergy(v){this.energy=v;}};actors.push(a);return a;}
const context = vm.createContext({el,document:{documentElement:{dataset:{mode:'doom'}}},localStorage:{getItem:k=>saved[k],setItem:(k,v)=>saved[k]=v},OmegaDoom:{create:actor,createMask:actor,createPortrait:actor},makeCore:()=>({set(){},say(){},resize(){}}),window:{addEventListener(){}},setMode(){}});
vm.runInContext(source.slice(source.indexOf('const classicDoomCore ='),source.indexOf('/* The gold sphere for the command centre')),context);
(async function(){
vm.runInContext('syncDoomCharacter()',context);const first=actors[0];
vm.runInContext("doomCharacter='portrait';syncDoomCharacter()",context);assert(first.dead);
first.resolve();await Promise.resolve();assert(!el('coreLayer').classList.contains('characterReady'));
actors[1].resolve();await Promise.resolve();assert(el('coreLayer').classList.contains('characterReady'));
vm.runInContext('doomCore.say(0.7)',context);assert.equal(actors[1].state,'speaking');
vm.runInContext('doomCore.say(0)',context);assert.equal(actors[1].state,'idle');
vm.runInContext("doomCharacter='mask';syncDoomCharacter()",context);assert(actors[1].dead);actors[2].resolve();await Promise.resolve();assert.equal(actors[2].state,'idle');assert(el('missionDoomCredit').textContent.includes('Mask'));
vm.runInContext("doomCharacter='classic';syncDoomCharacter()",context);assert(actors[2].dead);assert(!el('coreLayer').classList.contains('characterReady'));
vm.runInContext("doomCharacter='rigged';syncDoomCharacter()",context);actors[3].reject();await Promise.resolve();await Promise.resolve();assert(actors[3].dead);assert(el('characterStatus').textContent.includes('classic'));
console.log('PASS: character switching, mask source, stale loads, speech state, classic selection and load failure fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
