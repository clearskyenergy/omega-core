/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Extract current editor source for offline behavioral tests, never a copy. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../../editor.html'),'utf8');
function block(start,end){const a=source.indexOf(start);if(a<0)throw Error('Missing '+start);const b=source.indexOf(end,a+start.length);if(b<0)throw Error('Missing '+end);return source.slice(a,b);}
function fn(name){
  const marker='function '+name+'(',a=source.indexOf(marker);
  if(a<0||source.indexOf(marker,a+1)>=0)throw Error('Function missing or ambiguous: '+name);
  let start=a;if(source.slice(a-6,a)==='async ')start=a-6;
  let n=0,i=source.indexOf('{',a);
  for(;i<source.length;i++){if(source[i]==='{')n++;else if(source[i]==='}'&&--n===0)return source.slice(start,i+1);}
  throw Error('Unclosed '+name);
}
function run(code,context){vm.createContext(context);vm.runInContext(code,context);return context;}
module.exports={source,block,fn,run};
