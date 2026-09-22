/* ═══════════════════════════════════════════════════════════════════════════════
   /api/agent/openapi   —  the OpenAPI document a Custom GPT imports as an Action
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET → application/json, OpenAPI 3.1. No auth: the document describes the
   door, it does not open it. Everything it points at needs the agent key.

   WHY A FUNCTION AND NOT A STATIC FILE. ChatGPT requires `servers[0].url` to
   be the host it will call, and this platform answers on many hosts
   (silmarillion.clearskyomega.com, osa.clearskyomega.com, the *.vercel.app
   previews). Building the document per request means the URL the GPT
   imported is the URL it was imported from, and a preview deploy tests
   against itself rather than production.

   SETUP (also in docs/AGENT-CONNECTOR.md):
     1. scripts/agent-key.js --org ogisolar.com --label "CFA/OGI JV GPT" --apply
     2. ChatGPT → Configure → Actions → Import from URL → this endpoint
     3. Authentication: API Key, Auth type Bearer, paste the key
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var Auth = require('../_lib/agent-auth');

function ring() {
  return { type: 'array', description: 'Closed polygon as [lng,lat] pairs (KML order). [lat,lng] is detected and accepted.',
           items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 }, minItems: 3 };
}

function siteSummary() {
  return { type: 'object', properties: {
    id: { type: 'string' }, name: { type: 'string' }, address: { type: 'string' }, state: { type: 'string' },
    stage: { type: 'string', description: 'referred, screening, qualified, … or dead/parked/discarded' },
    projectType: { type: 'string' }, partnerOrg: { type: 'string' }, partnerName: { type: 'string' },
    sizeMw: { type: ['number', 'null'] }, sizeMwh: { type: ['number', 'null'] },
    acres: { type: ['number', 'null'], description: 'Measured from the traced outline when one exists, else the stated figure.' },
    lat: { type: ['number', 'null'] }, lng: { type: ['number', 'null'] },
    gridScore: { type: ['number', 'null'], description: 'Screening rank 0–100 from traced geometry or Grid Atlas. Not a utility study.' },
    gridSummary: { type: 'string' },
    viabilityScore: { type: ['number', 'null'] }, viabilityVerdict: { type: 'string' },
    hasOutline: { type: 'boolean' }, outlineSource: { type: 'string' }, outlineTracedAt: { type: ['string', 'null'] },
    externalId: { type: 'string' }, siteNotes: { type: 'string' },
    updatedAt: { type: ['string', 'null'] }, createdAt: { type: ['string', 'null'] },
    outlineUrl: { type: 'string', description: 'GET this (with the same bearer key) for the outline, KML and KMZ link.' }
  } };
}

function spec(base) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ClearSky OMEGA — Sites for agents',
      version: '1.0.0',
      description: 'Read the JV portfolio\'s larger sites, fetch a site\'s traced outline as KML and a KMZ download link, and upload new sites with their outline. ' +
        'Every figure is screening evidence from hand-traced geometry, not a survey or a utility study. Attribution, stage and funding on a site are never changed through this API.'
    },
    servers: [{ url: base }],
    security: [{ agentKey: [] }],
    components: {
      securitySchemes: { agentKey: { type: 'http', scheme: 'bearer', description: 'An OMEGA agent key (omega_ak_…), minted by ClearSky with scripts/agent-key.js.' } },
      schemas: {
        SiteSummary: siteSummary(),
        SiteUpload: { type: 'object', required: ['name'], properties: {
          name: { type: 'string', maxLength: 160 },
          externalId: { type: 'string', description: 'Your own id for the site. Re-uploading with the same externalId updates rather than duplicates.' },
          address: { type: 'string' }, state: { type: 'string', description: 'Two-letter US state; derived from the address when omitted.' },
          lat: { type: 'number' }, lng: { type: 'number' },
          acres: { type: 'number', description: 'Stated acreage. Ignored for area when an outline is supplied (the ring is measured).' },
          sizeMw: { type: 'number' }, sizeMwh: { type: 'number' },
          projectType: { type: 'string', description: 'solar, bess, solar_bess, compute, powergen, microgrid, dcfc …' },
          notes: { type: 'string', maxLength: 2000 },
          outline: ring(),
          kml: { type: 'string', description: 'KML text of the site as drawn in Google Earth. Parcel rings, transmission lines, substations and gas lines are recognised and scored.' },
          kmzBase64: { type: 'string', description: 'A .kmz file, base64. Same treatment as kml.' },
          fileName: { type: 'string' },
          contactName: { type: 'string' }, contactEmail: { type: 'string' }
        } }
      }
    },
    paths: {
      '/api/agent/sites': {
        get: {
          operationId: 'listSites',
          summary: 'List the sites this key may see, biggest first',
          description: 'Sorted by acreage then MW. Use minAcres and/or minMw to keep only the larger sites. Dead, parked and discarded sites are excluded unless includeDead=true.',
          parameters: [
            { name: 'minAcres', in: 'query', schema: { type: 'number' }, description: 'Only sites with at least this many acres on record.' },
            { name: 'minMw', in: 'query', schema: { type: 'number' }, description: 'Only sites with at least this many MW on record.' },
            { name: 'stage', in: 'query', schema: { type: 'string' } },
            { name: 'state', in: 'query', schema: { type: 'string' }, description: 'Two-letter US state.' },
            { name: 'hasOutline', in: 'query', schema: { type: 'boolean' }, description: 'Only sites with a traced outline (a KMZ can be produced).' },
            { name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Only sites updated at or after this time.' },
            { name: 'includeDead', in: 'query', schema: { type: 'boolean' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }
          ],
          responses: { '200': { description: 'The sites', content: { 'application/json': { schema: { type: 'object', properties: {
            ok: { type: 'boolean' }, org: { type: 'string' }, total: { type: 'integer' }, count: { type: 'integer' },
            sites: { type: 'array', items: { $ref: '#/components/schemas/SiteSummary' } }, note: { type: 'string' }
          } } } } }, '401': { description: 'No or unknown key' }, '403': { description: 'Revoked, expired or out of scope' } }
        },
        post: {
          operationId: 'uploadSites',
          summary: 'Upload one or more sites, with their outline when you have it',
          description: 'Creates a site in the portfolio at stage referred, originated by the key\'s org, or updates an existing one matched by externalId then by name and address. ' +
            'Updates are additive: an outline, a blank size or address, a note. Attribution, stage and money are never touched. Supply the outline as a ring, as KML text, or as a base64 KMZ; a KMZ with transmission and substation placemarks is scored on the way in.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['sites'], properties: {
            sites: { type: 'array', minItems: 1, maxItems: 100, items: { $ref: '#/components/schemas/SiteUpload' } }
          } } } } },
          responses: { '200': { description: 'One result per site', content: { 'application/json': { schema: { type: 'object', properties: {
            ok: { type: 'boolean' }, batch: { type: 'string' }, created: { type: 'integer' }, updated: { type: 'integer' }, unchanged: { type: 'integer' }, errors: { type: 'integer' },
            results: { type: 'array', items: { type: 'object', properties: {
              index: { type: 'integer' }, name: { type: 'string' }, action: { type: 'string', enum: ['created', 'updated', 'unchanged', 'error'] },
              id: { type: 'string' }, error: { type: 'string' }, changed: { type: 'array', items: { type: 'string' } },
              acres: { type: ['number', 'null'] }, gridScore: { type: ['number', 'null'] }, flags: { type: 'array', items: { type: 'string' } }, outlineUrl: { type: 'string' }
            } } }
          } } } } }, '400': { description: 'Malformed body' }, '403': { description: 'The key lacks sites:write' } }
        }
      },
      '/api/agent/site-outline': {
        get: {
          operationId: 'getSiteOutline',
          summary: 'One site with its outline, the KML text, and a KMZ download link',
          description: 'Returns the traced ring and features, the KML as text, and a signed kmzUrl the user can open in Google Earth (valid seven days). If the site has no outline, the KML carries a pin and the note says so; never describe a ring that is not there.',
          parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' }, description: 'The site id from listSites or uploadSites.' }],
          responses: { '200': { description: 'The site', content: { 'application/json': { schema: { type: 'object', properties: {
            ok: { type: 'boolean' },
            site: { allOf: [{ $ref: '#/components/schemas/SiteSummary' }, { type: 'object', properties: {
              outline: { type: ['object', 'null'], properties: { ring: ring(), acres: { type: ['number', 'null'] }, statedAcres: { type: ['number', 'null'] },
                centroid: { type: ['array', 'null'], items: { type: 'number' } }, source: { type: 'string' }, fileName: { type: 'string' }, tracedAt: { type: ['string', 'null'] },
                features: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, kind: { type: 'string' }, name: { type: 'string' }, kv: { type: ['number', 'null'] }, owner: { type: 'string' }, points: { type: 'integer' } } } },
                flags: { type: 'array', items: { type: 'object', properties: { level: { type: 'string' }, code: { type: 'string' }, msg: { type: 'string' } } } } } },
              grid: { type: ['object', 'null'] }
            } }] },
            kml: { type: 'string' }, kmlFileName: { type: 'string' },
            kmzUrl: { type: ['string', 'null'], description: 'Give this link to the user verbatim.' }, kmzFileName: { type: 'string' }, kmzExpiresAt: { type: 'string' },
            note: { type: 'string' }
          } } } } }, '404': { description: 'No such site for this key' } }
        }
      }
    }
  };
}

module.exports = function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  res.status(200).json(spec(Auth.baseUrl(req)));
};
module.exports.spec = spec;
