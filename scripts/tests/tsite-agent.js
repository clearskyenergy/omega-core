/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const cp=require('child_process'),path=require('path');
for(const name of ['test.js','test-bridge.js']){
 const r=cp.spawnSync(process.execPath,[path.join(__dirname,'../site-agent',name)],{stdio:'inherit',timeout:30000});
 if(r.status!==0)process.exit(r.status||1);
}
