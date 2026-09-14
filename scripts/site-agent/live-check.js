/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Preflight for a live run. Read-only: it calls omega_context and omega_view
   only, so it never places, saves or modifies anything in the editor.
   Usage: node scripts/site-agent/live-check.js [--shot out.png] */
'use strict';
const {spawn}=require('child_process'),readline=require('readline'),fs=require('fs'),path=require('path');
const mcp=path.join(__dirname,'server.js');
const shot=(()=>{const i=process.argv.indexOf('--shot');return i>0?process.argv[i+1]:null;})();
function env(){
  let url=process.env.OMEGA_EDITOR_URL,cdp=process.env.OMEGA_CDP_URL;
  if(!url){try{const c=JSON.parse(fs.readFileSync(path.join(__dirname,'../../.mcp.json'),'utf8')).mcpServers.omega.env;url=url||c.OMEGA_EDITOR_URL;cdp=cdp||c.OMEGA_CDP_URL;}catch(e){}}
  if(!url)throw Error('Set OMEGA_EDITOR_URL or register the omega server in .mcp.json.');
  return {OMEGA_EDITOR_URL:url,OMEGA_CDP_URL:cdp||'http://127.0.0.1:9222'};
}
function run(vars){
  return new Promise((resolve,reject)=>{
    const p=spawn('node',[mcp],{env:Object.assign({},process.env,vars)});
    const out=[];let done=false;
    const timer=setTimeout(()=>{if(!done){p.kill();reject(Error('The editor did not answer within 90s.'));}},90000);
    p.stderr.on('data',d=>process.stderr.write(d));
    readline.createInterface({input:p.stdout}).on('line',l=>{
      let m;try{m=JSON.parse(l);}catch(e){return;}
      out.push(m);
      if(m.id===3){done=true;clearTimeout(timer);p.stdin.end();resolve(out);}
    });
    p.on('error',reject);
    const send=m=>p.stdin.write(JSON.stringify(m)+'\n');
    send({jsonrpc:'2.0',id:1,method:'initialize',params:{}});
    send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'omega_context',arguments:{}}});
    send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'omega_view',arguments:{}}});
  });
}
const hint=m=>/Sign in/i.test(m)?'Sign in to OMEGA in that browser tab.'
 :/exactly one/i.test(m)?'Leave exactly one tab open at OMEGA_EDITOR_URL — its URL must match character for character.'
 :/connect|ECONNREFUSED|CDP/i.test(m)?'Start Chrome with --remote-debugging-port=9222 in a separate profile.'
 :'';
(async()=>{
  const vars=env();
  console.log('editor :',vars.OMEGA_EDITOR_URL);
  console.log('browser:',vars.OMEGA_CDP_URL,'\n');
  const out=await run(vars);
  const pick=id=>out.find(m=>m.id===id);
  const ctx=pick(2),view=pick(3);
  const fail=m=>m&&m.result&&m.result.isError;
  if(fail(ctx)){const t=ctx.result.content[0].text;console.log('NOT READY:',t.split('\n')[0]);const h=hint(t);if(h)console.log('  ->',h);process.exit(1);}
  const c=JSON.parse(ctx.result.content[0].text);
  const n=k=>(c.objects[k]||[]).length;
  const drawn=n('elements')+n('shapes')+n('conduits')+n('trenches');
  console.log('signed in       : yes');
  console.log('project         :',c.project||'(unsaved new project)');
  console.log('map centre      :',c.map&&c.map.lat!=null?c.map.lat.toFixed(6)+', '+c.map.lng.toFixed(6):'(no map loaded)');
  console.log('scale           :',c.map&&c.map.pxPerFt?c.map.pxPerFt.toFixed(4)+' px/ft':'(uncalibrated)');
  console.log('objects on canvas:',drawn,`(elements ${n('elements')}, shapes ${n('shapes')}, conduits ${n('conduits')}, trenches ${n('trenches')})`);
  console.log('revision        :',String(c.revision).slice(0,12));
  if(!fail(view)&&shot){fs.writeFileSync(shot,Buffer.from(view.result.content[0].data,'base64'));console.log('screenshot      :',shot);}
  else if(fail(view))console.log('screenshot      : failed —',view.result.content[0].text.split('\n')[0]);
  console.log('');
  console.log(drawn?'BLOCKED: v0.1 plans only onto an empty canvas. Open a new project, or supply these objects as reviewed obstacles.'
                   :'READY: empty canvas. omega_address can load a site.');
  process.exit(drawn?1:0);
})().catch(e=>{console.error('FAILED:',e.message);const h=hint(e.message);if(h)console.error('  ->',h);process.exit(1);});
