/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
const fs=require('fs'),vm=require('vm');
const tool=require('../api/_lib/battery-tool-engine');
const html=fs.readFileSync('battery-sizer.html','utf8');
let funcs=[];let re=/^function (\w+)\([^\n]*\).*$/gm,m;
while((m=re.exec(html))){let first=m[0];if(first.endsWith('}'))funcs.push(first);else{let end=html.indexOf('\n}',m.index);funcs.push(html.slice(m.index,end+2));}}
const nodes={out:{innerHTML:''}};
const box={console,Math,Date,setTimeout:()=>0,window:{},document:{getElementById:k=>nodes[k]||null},MONNAMES:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']};
vm.createContext(box);vm.runInContext(funcs.join('\n'),box);box.$=k=>nodes[k]||null;box.wireHelp=()=>{};box.drawMonthly=()=>{};box.drawSweep=()=>{};box.drawPeakDay=()=>{};
for(const mode of ['tool-interval','tool-monthly']){
 const load=Array.from({length:744},(_,i)=>i%24>=10&&i%24<15?1000:300);
 const data=[{load,dt:1,peak:1000,min:300,days:31,label:'Jan 2025',key:'2025-01',kwh:300000,rate:18.5}];
 box.RESULT=JSON.parse(JSON.stringify(tool({mode,data,settings:{obj:'npv'},durations:[2,4]})));
 box.SERIES={kw:load,t:load.map((_,i)=>new Date(2025,0,1,i)),dt:1,dtMin:60};box.RESULT.best.payback??=Infinity;box.RESULT.rec.payback??=Infinity;
 try {box.render();if(/NaN|undefined/.test(nodes.out.innerHTML))throw new Error('Invalid result text');console.log(mode,'rendered',nodes.out.innerHTML.length,'characters',/NaN|undefined/.test(nodes.out.innerHTML)?('BAD VALUES '+nodes.out.innerHTML.slice(Math.max(0,nodes.out.innerHTML.search(/NaN|undefined/)-80),nodes.out.innerHTML.search(/NaN|undefined/)+100)):'OK');}catch(e){console.error(e.stack);process.exitCode=1;}
}
