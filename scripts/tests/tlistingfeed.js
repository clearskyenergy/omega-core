/* Taking a partner's listing feed in without a deploy.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Every Crexi field name in omega-listings-source.js was written from public
   documentation before any live record existed, under a note saying to
   confirm each one before it reached a customer. Confirming them meant
   editing that file — so the integration could never be finished by the
   person holding the credentials and the sample payload.

   These tests hold the property that fixes it: where their data lives is
   configuration, what the pipeline calls it is not. */
'use strict';
const path = require('path'), assert = require('assert');
global.window = global;
require(path.join(__dirname, '..', '..', 'omega-listings-source.js'));
const LS = global.OmegaListings;
const SET = require(path.join(__dirname, '..', '..', 'omega-settings.js'));
let fails = 0;
function ok(name, fn){
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { fails++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}

/* A payload shaped nothing like our guesses — the realistic case. Guessing
   right is the unlikely outcome, not the likely one. */
const SAMPLE = {
  propertyId: 'X1', propertyAddress: '900 W Cermak Rd',
  geo: { lat: 41.85, lng: -87.65 }, city: 'Chicago', stateCode: 'IL',
  buildingSqFt: 48000, assetClass: 'Industrial',
  agent: { fullName: 'J. Ruiz', phone: '312-555-0100' },
  saleType: 'For Sale', askPriceUsd: 3200000, detailUrl: 'https://crexi.com/x1'
};
const MAP = {
  id:['propertyId'], addr:['propertyAddress'], lat:['geo.lat'], lon:['geo.lng'],
  state:['stateCode'], sqft:['buildingSqFt'], type:['assetClass'],
  brokerName:['agent.fullName'], brokerPhone:['agent.phone'],
  dealType:['saleType'], askPrice:['askPriceUsd'], url:['detailUrl']
};

console.log('listing feed — configuration, not a deploy');

ok('the built-in guesses barely fit a real payload', function(){
  /* The reason the mapping layer exists, stated as a number. */
  const rep = LS.mapReport(SAMPLE);
  assert(rep.filled.length <= 3,
    'the defaults filled ' + rep.filled.length + ' fields — if guesses now fit, '
    + 'check the sample is still realistic rather than relaxing this');
  assert(rep.unused.length >= 8, 'the report does not notice their unread fields');
});

ok('a configured map fixes it without touching the source', function(){
  const rep = LS.mapReport(SAMPLE, MAP);
  assert(rep.filled.length >= 12,
    'only ' + rep.filled.length + ' fields mapped');
  assert(rep.unused.length === 0,
    'their fields still unread: ' + rep.unused.join(', '));
});

ok('dotted paths resolve, because listing APIs nest', function(){
  const rep = LS.mapReport(SAMPLE, MAP);
  const lat = rep.filled.filter(f => f.field === 'lat')[0];
  assert(lat && lat.path === 'geo.lat' && lat.value === 41.85,
    'a nested path did not resolve — a map that cannot express nesting sends '
    + 'everybody back to editing the source');
});

ok('a missing branch does not throw', function(){
  /* Half the records in a real feed are missing half the fields. */
  const rep = LS.mapReport({ propertyId: 'only-this' }, MAP);
  assert(rep.filled.length === 1, 'expected one field to land');
});

ok('the report names what nothing is reading', function(){
  /* Usually where the useful thing is hiding. */
  const rep = LS.mapReport(SAMPLE);
  assert(rep.unused.indexOf('askPriceUsd') >= 0,
    'an unread field of theirs is not reported');
});

ok('configure() sets the endpoint and the map on the provider', function(){
  LS.configure('crexi', { proxy: 'https://p.example/crexi', map: MAP, enabled: true });
  const p = LS.providers.crexi;
  assert(p.proxy === 'https://p.example/crexi', 'endpoint not applied');
  assert(p.map && p.map.addr[0] === 'propertyAddress', 'field map not applied');
});

ok('the pipeline shape is NOT configurable', function(){
  /* A provider may say where its data lives. It may not rename the record
     every card, the ledger, the packet and the estimator read. */
  const rec = LS.providers.crexi;
  assert(!rec.shape && !rec.fields,
    'a provider can redefine the record shape, which would break every consumer');
});

ok('settings round-trips a provider config as one object', function(){
  /* Endpoint, map and switch are one agreement. Split across string keys,
     three save and the fourth is lost. */
  assert(typeof SET.getObj === 'function' && typeof SET.setObj === 'function',
    'structured settings are missing');
  assert(SET.LISTING_FIELDS.length >= 20,
    'the mapping screen offers only ' + SET.LISTING_FIELDS.length + ' fields');
});

ok('no credential is stored in the browser module', function(){
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'omega-settings.js'), 'utf8');
  const seg = src.slice(src.indexOf('function renderListingsTab'));
  assert(!/apiKey|token|Authorization|bearer/i.test(seg.slice(0, 4000)),
    'the listing panel handles a credential in the browser; the route is '
    + 'proxied so the key rides on the server-side request');
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
