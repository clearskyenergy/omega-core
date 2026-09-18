/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var engine=require('../api/_lib/fiber-evidence');
try {
  var request={lat:process.argv[2],lon:process.argv[3]};
  if(process.argv[4]!==undefined) request.radius_km=process.argv[4];
  if(process.argv[5]!==undefined) request.requested_capacity_gbps=process.argv[5];
  process.stdout.write(JSON.stringify(engine.screen(request),null,2)+'\n');
} catch(e) { process.stderr.write(e.message+'\nUsage: node scripts/fiber-screen.js LAT LON [RADIUS_KM] [GBPS]\n');process.exitCode=1; }
