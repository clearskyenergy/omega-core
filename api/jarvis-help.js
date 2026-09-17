/* ══════════════════════════════════════════════════════════════════════
   /api/jarvis-help.js   ·  ClearSky-OMEGA  ·  Jarvis inside the editor
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The brain behind "Ask Jarvis" in Site Map Designer Pro. The page sends
   a question, a snapshot of the situation on that tab, the last few
   turns, and the ribbon's command list; this answers about THAT drawing
   and proposes up to three actions the page can run for the person.

   WHY THE KNOWLEDGE LIVES HERE
   What the tool is, how its gates read, what each build expects, how to
   recover — that is product knowledge, and browser code is readable by
   every tenant (CLAUDE.md, IP protection). The page carries none of it.

   AUTH
   A Firebase ID token, verified against Google's published keys with
   api/_lib/verify-token.js — no service account needed, the same road
   /api/parcel and the bill reader take. The org comes from the verified
   email, never the body, so one tenant cannot spend another's key.

   KEY RESOLUTION, most specific first (same as omega-ai-extract.js)
     1. AI_KEY_<ORG>            sunesol.com -> AI_KEY_SUNESOL_COM
     2. ANTHROPIC_API_KEY       platform-wide fallback

   MODEL
   OMEGA_HELP_MODEL, default claude-opus-5. The stable knowledge block is
   cached with cache_control so a conversation's later turns pay for the
   question and the situation, not the manual.

   WHAT IT WILL NOT DO
   Write anything. It reads nothing but the token and the request body.
   Every action it proposes is a name the page maps to an existing editor
   command, and the person clicks it. Proposals, not writes (the L2 rung).
   ══════════════════════════════════════════════════════════════════════ */
'use strict';

var V = require('./_lib/verify-token');

var DEFAULT_MODEL = process.env.OMEGA_HELP_MODEL || 'claude-opus-5';
var MAX_MESSAGE = 4000;
var MAX_TURNS = 12;
var MAX_SITUATION = 16000;   /* chars of JSON */
var MAX_COMMANDS = 220;

/* $ per million tokens, input / output. Cache writes bill 1.25x input,
   cache reads 0.1x. Unknown model: costUsd is null rather than a guess. */
var RATES = {
  'claude-opus-5': [5, 25], 'claude-opus-4-8': [5, 25], 'claude-opus-4-7': [5, 25], 'claude-opus-4-6': [5, 25],
  'claude-sonnet-5': [2, 10], 'claude-sonnet-4-6': [3, 15], 'claude-haiku-4-5': [1, 5], 'claude-fable-5-1': [10, 50]
};

var KNOWLEDGE = [
  'You are Jarvis, the assistant built into Site Map Designer Pro, the site-design editor of the ClearSky OMEGA platform.',
  'You are talking to a person who has the editor open. Every message carries a SITUATION snapshot of their tab: project, what is drawn, the RESULTS rail gates and numbers, any guided build in progress, faults, and recent errors. Answer from that snapshot. Never invent a number that is not in it; if something is not in the snapshot, say you cannot see it.',
  'Be terse and concrete. Plain sentences, no headings, no emoji. Under 120 words unless the person asks for detail. When you are guessing, say so and set confidence to "guessing".',
  '',
  'WHAT THE TOOL IS',
  'A one-page editor over a satellite map for BESS (battery storage), EV charging (Level 2 and DCFC), solar PV, DER/microgrid and data-centre sites. The person draws equipment and conduit on a locked satellite image, presses Run to compute results, and exports drawings, a bill of materials, an estimate and reports.',
  'Ribbon tabs: File, Edit, Build, Compute, Insert, Draw, Annotate, Analyze, Estimate, View, Output, Settings. Build groups: 1 SITE (Site Setup), 2 BUILD (DER Build, Auto Layout, BESS Build, Full Topology, Level 2, DCFC Build, Compute Build, Building Designer, Design with AI, Engineering Build), 3 SIZE & CONFIGURE (BESS Sizer, Solar BESS Sizer, Solar + Storage), GROUND (Upload Image, GPS Place, Recenter, Calibrate Scale, Clear Scale).',
  'Designer mode hides advanced buttons; Pro mode shows everything (the Designer/Pro switch in the title bar). Search tools (Ctrl/Cmd+K) finds any ribbon command by name.',
  'Layers on the site map: Power Gen, Trench / Conduit, BESS, EV, Wind / Gen, Compute, Fence / Tie, Structures. Site Map and One-Line Diagram are two views of the same project.',
  '',
  'THE RESULTS RAIL AND ITS GATES (their exact wording, and what fixes each)',
  '"Results not updated" / "The drawing changed. Press Run" — the results are stale; every export is blocked until Run is pressed. Action: run.',
  '"No map centre yet. Place or lock the satellite view to populate location." — the map has no fixed position: use GPS Place (Build > GROUND) with the address, or Site Setup, then lock (freeze) the satellite view. Until then results have no location, irradiance (GHI) or utility.',
  '"Area needs a drawing scale and a boundary." — Calibrate Scale (Build > GROUND: click two points a known distance apart) and draw the site boundary (Site Setup or Draw). Without a scale every length is in pixels; without a boundary there is no area.',
  '"Place BESS, solar, wind or a fuel cell to size the system." — POWER is empty because nothing that generates or stores has been placed; EV chargers are load, not generation.',
  '"Cut / fill needs terrain" — Analyze > Terrain samples the ground; earthworks stay blank without it.',
  'POWER FLOW is a nameplate sum of everything that can export, not an interconnection study and not an export limit.',
  '',
  'GUIDED BUILDS',
  'Level 2 (Build > Level 2): choose the charger model and count, Start Placing, then: click to place the service (meter), draw a trench run (click points, Enter finishes it, Backspace removes the last point), click ON the run to place the Outdoor Panel / Disconnect, draw the next run, click on it to place each EVSE. The build draws the interior feed and each branch trench (panel to EVSE) itself, plus a bollard on odd-numbered pedestals. F flips and R rotates the last part. Esc cancels. Undo is paused while a build is running; finish or cancel first.',
  'DCFC Build is the same flow with a transformer and switchgear before the chargers. BESS Build (BTM or FOM) and Solar + Storage walk battery, transformer, disconnect, switchgear, meter and stop at the point of interconnection; the person draws the utility trench. Compute Build lays out data-centre blocks and their feeders.',
  'Design with AI (Build): give an address and a size; it geocodes, pulls the parcel and roads, and runs the guided build for BESS and Solar + BESS; for other types it loads the site and hands off. Its layout is a sketch, not a surveyed placement.',
  '',
  'KNOWN FAULTS AND RECOVERIES',
  'A charger with no branch conduit from the panel (faults.chargersWithoutBranch): the leg was split by an undo or an old save. Action: reconnect — it rebuilds the branch along the drawn trench run and puts the bollard back. Press Run afterwards.',
  'A conduit that stays put when its equipment is dragged: select it and drag its points, or delete it (select, Delete) and draw it again from Draw.',
  'Exports refused: results are stale (press Run) or the site map is not marked complete (Bill of Materials).',
  'Things disappearing on pan or zoom: the satellite view is not locked; lock it (Site Setup) before laying out.',
  'A 503 from the platform that says "no Firestore credential" or a 402 that names an API key is platform configuration, not the drawing: tell the person to contact ClearSky support.',
  'Saving: the project autosaves every minute when signed in; the title bar reads Saved / Unsaved. Sign-in, tenant and billing questions go to the account owner or ClearSky.',
  '',
  'ACTIONS YOU MAY PROPOSE (at most three, only when they help; the person clicks them)',
  '{kind:"run"} press Run. {kind:"tab", page:<a tab id from situation.page.tabs — note the Build tab\'s id is "home">} open a ribbon tab. {kind:"command", name:<EXACT name from the command list>} run a ribbon command. {kind:"design_ai"} open Design with AI. {kind:"reconnect"} rebuild missing charger branches. {kind:"select", label:<exact element label from the situation>} select an object. {kind:"save"} save.',
  'Only propose a command whose exact name appears in the command list you are given. If the list lacks it, describe the steps in words instead. Fill unused fields with an empty string. Put a short reason in "why".'
].join('\n');

var ANSWER_TOOL = {
  name: 'answer',
  description: 'Reply to the person in the editor, with optional actions the page can run for them.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'The answer, plain prose, under 120 words unless detail was asked for.' },
      actions: {
        type: 'array', maxItems: 3,
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['command', 'run', 'tab', 'design_ai', 'reconnect', 'select', 'save'] },
            name: { type: 'string', description: 'For command: the exact command name. Else empty.' },
            page: { type: 'string', description: 'For tab: the page id. Else empty.' },
            label: { type: 'string', description: 'For select: the exact element label. Else empty.' },
            why: { type: 'string', description: 'One short clause on why.' }
          },
          required: ['kind', 'name', 'page', 'label', 'why'],
          additionalProperties: false
        }
      },
      confidence: { type: 'string', enum: ['sure', 'likely', 'guessing'] }
    },
    required: ['reply', 'actions', 'confidence'],
    additionalProperties: false
  }
};

function envNameFor(orgId) { return 'AI_KEY_' + String(orgId).toUpperCase().replace(/[^A-Z0-9]/g, '_'); }

function clampJson(v, max) {
  var s; try { s = JSON.stringify(v == null ? {} : v); } catch (e) { s = '{}'; }
  return s.length > max ? s.slice(0, max) + '… (truncated)' : s;
}

function costOf(model, u) {
  var r = RATES[model]; if (!r || !u) return null;
  var inp = +u.input_tokens || 0, out = +u.output_tokens || 0;
  var cw = +u.cache_creation_input_tokens || 0, cr = +u.cache_read_input_tokens || 0;
  return +(((inp * r[0]) + (cw * r[0] * 1.25) + (cr * r[0] * 0.1) + (out * r[1])) / 1e6).toFixed(5);
}

function buildMessages(body) {
  var hist = Array.isArray(body.history) ? body.history.slice(-MAX_TURNS) : [];
  var msgs = [];
  hist.forEach(function (h) {
    if (!h || (h.role !== 'user' && h.role !== 'assistant')) return;
    var t = String(h.text || '').slice(0, MAX_MESSAGE);
    if (!t) return;
    /* the API wants the first turn from the user */
    if (!msgs.length && h.role !== 'user') return;
    msgs.push({ role: h.role, content: t });
  });
  var q = String(body.message || '').slice(0, MAX_MESSAGE);
  msgs.push({ role: 'user', content: 'SITUATION (JSON):\n' + clampJson(body.situation, MAX_SITUATION) + '\n\nQUESTION:\n' + q });
  return msgs;
}

function commandsText(list) {
  if (!Array.isArray(list) || !list.length) return 'COMMAND LIST: none available on this tab.';
  var lines = list.slice(0, MAX_COMMANDS).map(function (c) {
    if (!c || !c.name) return null;
    return String(c.name).slice(0, 80) + (c.page ? ' [' + String(c.page).slice(0, 24) + ']' : '') + (c.group ? ' (' + String(c.group).slice(0, 40) + ')' : '');
  }).filter(Boolean);
  return 'COMMAND LIST (name [page id] (group)):\n' + lines.join('\n');
}

/* One call to the Messages API. Fallbacks are opt-in; if the account's
   API does not accept the beta yet, the same request is sent once more
   without it rather than failing the person's question. */
async function ask(key, model, system, messages, useFallbacks) {
  var headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  /* An organisation-level key (one not created inside a workspace) is
     refused unless the request names the workspace to bill. */
  if (process.env.ANTHROPIC_WORKSPACE_ID) headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
  var payload = {
    model: model, max_tokens: 2000,
    output_config: { effort: 'medium' },
    system: system, messages: messages,
    tools: [ANSWER_TOOL], tool_choice: { type: 'tool', name: 'answer' }
  };
  if (useFallbacks) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; payload.fallbacks = 'default'; }
  var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: headers, body: JSON.stringify(payload) });
  var data = null; try { data = await r.json(); } catch (e) { data = null; }
  if (!r.ok && useFallbacks && r.status === 400 && /fallback|beta/i.test((data && data.error && data.error.message) || '')) {
    return ask(key, model, system, messages, false);
  }
  return { status: r.status, data: data };
}

function parseAnswer(data) {
  var out = { reply: '', actions: [], confidence: 'likely' };
  if (!data) return out;
  if (data.stop_reason === 'refusal') {
    out.reply = 'I can’t help with that one. Ask me about the drawing or the tool.';
    out.confidence = 'sure';
    return out;
  }
  var blocks = data.content || [];
  var tool = null, text = [];
  blocks.forEach(function (b) {
    if (b.type === 'tool_use' && b.name === 'answer' && b.input && typeof b.input === 'object') tool = b.input;
    else if (b.type === 'text' && b.text) text.push(b.text);
  });
  if (tool) {
    out.reply = String(tool.reply || '').trim();
    out.confidence = ['sure', 'likely', 'guessing'].indexOf(tool.confidence) >= 0 ? tool.confidence : 'likely';
    out.actions = (Array.isArray(tool.actions) ? tool.actions : []).map(function (a) {
      if (!a || typeof a !== 'object') return null;
      var kind = String(a.kind || '');
      if (['command', 'run', 'tab', 'design_ai', 'reconnect', 'select', 'save'].indexOf(kind) < 0) return null;
      var act = { kind: kind, why: String(a.why || '').slice(0, 160) };
      if (kind === 'command') { act.name = String(a.name || '').slice(0, 80); if (!act.name) return null; }
      if (kind === 'tab') { act.page = String(a.page || '').slice(0, 24); if (!act.page) return null; }
      if (kind === 'select') { act.label = String(a.label || '').slice(0, 120); if (!act.label) return null; }
      return act;
    }).filter(Boolean).slice(0, 3);
  } else {
    out.reply = text.join('\n').trim();
  }
  if (!out.reply) out.reply = 'I could not put an answer together. Try asking in a different way.';
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  var body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  var auth = (req.headers && req.headers.authorization) || '';
  var tok = auth.indexOf('Bearer ') === 0 ? auth.slice(7) : null;
  if (!tok) { res.status(401).json({ error: 'Sign in to ask Jarvis.' }); return; }

  var caller;
  try { caller = await V.verifyIdToken(tok); }
  catch (e) { res.status(401).json({ error: 'Your session could not be verified. Reload the editor and sign in again.' }); return; }
  if (!caller.orgId) { res.status(403).json({ error: 'No organisation on this account.' }); return; }

  var question = String(body.message || '').trim();
  if (!question) { res.status(400).json({ error: 'Ask something.' }); return; }

  var envName = envNameFor(caller.orgId);
  var key = process.env[envName] || null, keySource = key ? 'tenant' : null;
  if (!key && process.env.ANTHROPIC_API_KEY) { key = process.env.ANTHROPIC_API_KEY; keySource = 'platform'; }
  if (!key) {
    res.status(402).json({ error: 'Jarvis is not switched on yet: the deployment has no platform AI key. ClearSky sets ANTHROPIC_API_KEY (or ' + envName + ' for this tenant only) in Vercel and redeploys — the gateway’s Server health lists it.' });
    return;
  }
  /* THE PER-TENANT SWITCH. The gateway's Manage › Billing form writes
     billing/current.jarvis; off wins over any key. Read through the Admin
     SDK; when the server has no Firestore credential the switch cannot be
     read and Jarvis stays on, which is the state every tenant had before
     the switch existed. */
  try {
    var A = require('./_lib/admin');
    if (!A.isDegraded()) {
      var bill = await A.db().collection('omega_orgs').doc(caller.orgId).collection('billing').doc('current').get();
      if (bill.exists && bill.data().jarvis === false) {
        res.status(402).json({ error: 'Jarvis is switched off for ' + caller.orgId + '. ClearSky turns it on in the gateway: Tenants › Manage › Jarvis.' });
        return;
      }
    }
  } catch (e) { console.error('[jarvis] could not read the tenant switch: ' + (e && e.message)); }

  var model = DEFAULT_MODEL;
  var system = [
    { type: 'text', text: KNOWLEDGE, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: commandsText(body.commands) + '\n\nThe person’s organisation is ' + caller.orgId + (caller.staff ? ' (ClearSky staff).' : '.') }
  ];
  var messages = buildMessages(body);

  var r;
  try { r = await ask(key, model, system, messages, true); }
  catch (e) {
    console.error('[jarvis-help] call failed:', e && e.message);
    res.status(502).json({ error: 'Jarvis could not be reached. Try again in a moment.' });
    return;
  }
  if (r.status !== 200) {
    var msg = (r.data && r.data.error && r.data.error.message) || 'The AI service refused the request.';
    console.error('[jarvis-help] upstream', r.status, msg);
    if (r.status === 401) msg = 'The ' + (keySource === 'tenant' ? caller.orgId : 'platform') + ' AI key was rejected. Check ' + (keySource === 'tenant' ? envName : 'ANTHROPIC_API_KEY') + '.';
    if (r.status === 429) msg = 'Jarvis is busy. Wait a moment and ask again.';
    res.status(r.status === 429 ? 429 : 502).json({ error: msg });
    return;
  }

  var ans = parseAnswer(r.data);
  var served = (r.data && r.data.model) || model;
  res.status(200).json({
    reply: ans.reply, actions: ans.actions, confidence: ans.confidence,
    model: served, costUsd: costOf(served, r.data && r.data.usage), usage: (r.data && r.data.usage) || null
  });
};

/* for scripts/tests */
module.exports._internal = { parseAnswer: parseAnswer, buildMessages: buildMessages, commandsText: commandsText, costOf: costOf, KNOWLEDGE: KNOWLEDGE, ANSWER_TOOL: ANSWER_TOOL };
