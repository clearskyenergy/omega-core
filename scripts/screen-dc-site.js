/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
// Local developer/research CLI. No auth bypass is added to the deployed API.
// node scripts/screen-dc-site.js LAT LON [MW] [GBPS]
var engine=require('../api/_lib/dc-site-evidence');
var args=process.argv.slice(2),input={lat:args[0],lon:args[1]};
if(args[2]!==undefined)input.requested_mw=args[2];if(args[3]!==undefined)input.requested_capacity_gbps=args[3];
Promise.resolve().then(function(){return engine.collect(input);}).then(function(r){process.stdout.write(JSON.stringify(r,null,2)+'\n');}).catch(function(e){process.stderr.write(e.message+'\n');process.exitCode=1;});
