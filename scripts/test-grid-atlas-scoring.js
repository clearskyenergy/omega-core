/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert=require('assert'),fs=require('fs');
var html=fs.readFileSync('grid-atlas.html','utf8'),map=fs.readFileSync('usa-fiber-map.html','utf8'),ui=fs.readFileSync('dc-site-screen.js','utf8');
assert(!/function wScore|var dcW=|var pFiber=|var fcW=|var mwBand/.test(html),'No client scoring or inferred deliverable MW');
assert(!/Strong data-center candidate|Challenged for DC scale|Cooling water/.test(html),'Legacy suitability claims are removed');
assert(/OmegaDCScreen.mount/.test(html),'Pinned sites use the shared server scorecard');
assert(/dc-site-screen.js/.test(map),'Standalone map exposes site screening');
assert(ui.indexOf('/api/dc-site-screen')>=0&&/Authorization/.test(ui),'UI calls the authenticated server');
assert(/measured_weight_pct/.test(ui)&&/unmeasured_weight_pct/.test(ui),'Coverage is shown beside the score');
assert(/generation/.test(ui)&&/id!==generation/.test(ui),'Late results cannot attach to another site');
assert(/lastResult=null/.test(ui)&&/save.disabled=true/.test(ui),'Changed inputs invalidate exports');
assert(!/score\s*[:=]\s*Math|Math\.round|Math\.log/.test(ui),'Renderer contains no scoring math');
[html,map].forEach(function(s){assert(/omega-brand.js[^]*omega-tenant.js/.test(s),'Standard tenant initialization order');});
console.log('PASS server-only DC scorecard, shared map integration, coverage labels, stale-result protection and tenant initialization');
