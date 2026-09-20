/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
const fs=require('fs'),vm=require('vm');
const tool=require('../api/_lib/battery-tool-engine');
const html=fs.readFileSync('battery-sizer.html','utf8');
let funcs=[];let re=/^function (\w+)\([^\n]*\).*$/gm,m;
while((m=re.exec(html))){let first=m[0];if(first.endsWith('}'))funcs.push(first);else{let end=html.indexOf('\n}',m.index);funcs.push(html.slice(m.index,end+2));}}
/* The extractor pulls `function` declarations only, so every top-level var
   render() touches has to be handed in here. Same for the DOM: render()
   now also seeds the engineering-design form, and a field that is present
   in the page but missing here would let a real prefill bug through. */
const nodes={out:{innerHTML:''},designCard:{style:{}},designProg:{style:{}},outDesign:{innerHTML:''}};
const DESIGN_IDS=['dLoadMw','dDurH','dDod','dRte','dCapex','dDemRate','dOnRate','dOffRate',
                  'dYears','dDisc','dEsc','dUnitMwh','dPcsMw'];
DESIGN_IDS.forEach(id=>{nodes[id]={value:'',style:{}};});
const box={console,Math,Date,setTimeout:()=>0,window:{},document:{getElementById:k=>nodes[k]||null},MONNAMES:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']};
vm.createContext(box);vm.runInContext(funcs.join('\n'),box);box.$=k=>nodes[k]||null;box.wireHelp=()=>{};box.drawMonthly=()=>{};box.drawSweep=()=>{};box.drawPeakDay=()=>{};
for(const mode of ['tool-interval','tool-monthly']){
 const load=Array.from({length:744},(_,i)=>i%24>=10&&i%24<15?1000:300);
 const data=[{load,dt:1,peak:1000,min:300,days:31,label:'Jan 2025',key:'2025-01',kwh:300000,rate:18.5}];
 box.DESIGN=null;
 DESIGN_IDS.forEach(id=>{nodes[id].value='';});
 box.RESULT=JSON.parse(JSON.stringify(tool({mode,data,settings:{obj:'npv'},durations:[2,4]})));
 box.SERIES={kw:load,t:load.map((_,i)=>new Date(2025,0,1,i)),dt:1,dtMin:60};box.RESULT.best.payback??=Infinity;box.RESULT.rec.payback??=Infinity;
 try {box.render();if(/NaN|undefined/.test(nodes.out.innerHTML))throw new Error('Invalid result text');console.log(mode,'rendered',nodes.out.innerHTML.length,'characters',/NaN|undefined/.test(nodes.out.innerHTML)?('BAD VALUES '+nodes.out.innerHTML.slice(Math.max(0,nodes.out.innerHTML.search(/NaN|undefined/)-80),nodes.out.innerHTML.search(/NaN|undefined/)+100)):'OK');}catch(e){console.error(e.stack);process.exitCode=1;}

 /* The design form is seeded from the sizing result, not typed. A blank or
    non-numeric field here means the carry-across silently stopped working
    and the schedule would be computed from the placeholder defaults. */
 const bad=DESIGN_IDS.filter(id=>nodes[id].value===''||!isFinite(Number(nodes[id].value)));
 if(bad.length){console.error(mode,'design prefill left these unset or non-numeric:',bad.join(', '));process.exitCode=1;}
 else console.log(mode,'design prefill OK —',DESIGN_IDS.length,'fields carried across',
   '(load '+nodes.dLoadMw.value+' MW, '+nodes.dDurH.value+' h, capex '+nodes.dCapex.value+')');
}
