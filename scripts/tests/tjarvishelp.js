/* Ask Jarvis: the in-editor help window and its function.
   Static checks on the browser module (ES5, wired into editor.html, the
   palette exported) and an offline run of /api/jarvis-help with the token
   verifier and the AI call stubbed. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
const mod = fs.readFileSync(path.join(ROOT, 'omega-jarvis-help.js'), 'utf8');

function chk(l, ok, x = '') { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); return ok; }
let all = true;

console.log('\nbrowser module');
all &= chk('carries the proprietary header', /© 2025–2026 ClearSky Energy Solutions LLC/.test(mod));
all &= chk('is ES5 (no arrows, const/let, template strings, async)',
  !/=>/.test(mod) && !/\b(const|let)\s/.test(mod) && !/`/.test(mod) && !/\basync\b/.test(mod));
all &= chk('editor.html loads it right after Design with AI',
  html.indexOf('<script src="/omega-design-ai.js"></script>\n<!-- Ask Jarvis') > 0 && /<script src="\/omega-jarvis-help\.js"><\/script>/.test(html));
all &= chk('the command palette exports OmegaCommands.list/run', html.indexOf('window.OmegaCommands = {') > 0 && /run: function \(name\)/.test(html));
all &= chk('the panel never renders a reply as markup', /b\.textContent = text \|\| ''/.test(mod) && !/innerHTML\s*=\s*(text|j\.reply|reply)/.test(mod));
all &= chk('actions are applied only by a click, never on arrival', /b\.onclick = function \(\) \{\s*var ok = applyAction\(a\)/.test(mod) && !/applyAction\(a\);\s*\}\);\s*\}\s*function renderFile/.test(mod));
all &= chk('the twin filing is staff-only on the client', /function renderFile[\s\S]*?if \(!isStaff\(\)\) return;/.test(mod));
all &= chk('the module knows the guided-build accessors and the reconnect', /_dcfcState/.test(mod) && /_bgbState/.test(mod) && /_cgcState/.test(mod) && /OmegaEvReconnect\.orphans/.test(mod));

/* ── the function, offline ─────────────────────────────────────────────── */
console.log('\napi/jarvis-help');
const vtPath = require.resolve(path.join(ROOT, 'api', '_lib', 'verify-token.js'));
let verifyImpl = async () => ({ uid: 'u1', email: 'rep@sunesol.com', orgId: 'sunesol.com', staff: false });
require.cache[vtPath] = { id: vtPath, filename: vtPath, loaded: true, exports: { verifyIdToken: (t) => verifyImpl(t) } };
const calls = [];
let upstream = null;
global.fetch = async (url, opts) => {
  calls.push({ url, opts, body: JSON.parse(opts.body), headers: opts.headers });
  const u = typeof upstream === 'function' ? upstream(calls.length) : upstream;
  return { ok: u.status === 200, status: u.status, json: async () => u.data };
};
const H = require(path.join(ROOT, 'api', 'jarvis-help.js'));
const I = H._internal;

function req(method, body, auth) {
  return { method, body, headers: auth === undefined ? { authorization: 'Bearer tok' } : (auth ? { authorization: auth } : {}) };
}
function res() {
  const r = { code: null, out: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.out = o; return r; };
  r.end = () => r;
  return r;
}
const OK_ANSWER = {
  status: 200,
  data: {
    model: 'claude-opus-5', stop_reason: 'tool_use',
    usage: { input_tokens: 3000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 2500 },
    content: [{ type: 'tool_use', name: 'answer', input: {
      reply: 'The results are stale. Press Run.', confidence: 'sure',
      actions: [
        { kind: 'run', name: '', page: '', label: '', why: 'the drawing changed' },
        { kind: 'command', name: 'Calibrate Scale', page: '', label: '', why: 'no scale yet' },
        { kind: 'bogus', name: '', page: '', label: '', why: '' },
        { kind: 'command', name: '', page: '', label: '', why: 'no name -> dropped' },
        { kind: 'tab', name: '', page: 'build', label: '', why: 'x' }
      ] } }]
  }
};

(async () => {
  let r = res(); await H(req('OPTIONS'), r);
  all &= chk('OPTIONS -> 204', r.code === 204);
  r = res(); await H(req('GET'), r);
  all &= chk('GET -> 405', r.code === 405);
  r = res(); await H(req('POST', { message: 'hi' }, null), r);
  all &= chk('no token -> 401', r.code === 401);
  verifyImpl = async () => { throw new Error('bad'); };
  r = res(); await H(req('POST', { message: 'hi' }), r);
  all &= chk('rejected token -> 401', r.code === 401);
  verifyImpl = async () => ({ uid: 'u1', email: 'rep@sunesol.com', orgId: 'sunesol.com', staff: false });
  r = res(); await H(req('POST', { message: '   ' }), r);
  all &= chk('empty question -> 400', r.code === 400);
  delete process.env.ANTHROPIC_API_KEY; delete process.env.AI_KEY_SUNESOL_COM;
  r = res(); await H(req('POST', { message: 'hi' }), r);
  all &= chk('no key -> 402 naming the tenant variable', r.code === 402 && /AI_KEY_SUNESOL_COM/.test(r.out.error));

  process.env.ANTHROPIC_API_KEY = 'k';
  upstream = OK_ANSWER; calls.length = 0;
  r = res(); await H(req('POST', {
    message: 'why are results not updated?',
    situation: { results: { stale: true } },
    history: [{ role: 'assistant', text: 'orphan first turn' }, { role: 'user', text: 'earlier' }, { role: 'assistant', text: 'earlier answer' }],
    commands: [{ name: 'Calibrate Scale', group: 'GROUND', page: 'build' }]
  }), r);
  all &= chk('happy path -> 200 with the reply', r.code === 200 && r.out.reply === 'The results are stale. Press Run.', JSON.stringify(r.out && r.out.error));
  all &= chk('unknown and nameless actions are dropped, at most three kept',
    r.out.actions.length === 3 && r.out.actions.map(a => a.kind).join() === 'run,command,tab' && r.out.actions[1].name === 'Calibrate Scale');
  all &= chk('cost is computed from usage at the served model’s rate',
    Math.abs(r.out.costUsd - ((3000 * 5 + 2500 * 0.5 + 200 * 25) / 1e6)) < 1e-6, String(r.out.costUsd));
  const sent = calls[0].body;
  all &= chk('forces the answer tool with a strict schema', sent.tool_choice.name === 'answer' && sent.tools[0].strict === true && sent.tools[0].input_schema.additionalProperties === false);
  all &= chk('the knowledge block is cached and comes first', sent.system[0].cache_control && sent.system[0].cache_control.type === 'ephemeral' && /Site Map Designer Pro/.test(sent.system[0].text));
  all &= chk('the command list rides in the system prompt after the cache breakpoint', /Calibrate Scale \[build\] \(GROUND\)/.test(sent.system[1].text));
  all &= chk('history starts with a user turn and the question carries the situation',
    sent.messages[0].role === 'user' && sent.messages[0].content === 'earlier' && /SITUATION \(JSON\):\n\{"results":\{"stale":true\}\}\n\nQUESTION:\nwhy are results/.test(sent.messages[sent.messages.length - 1].content));
  all &= chk('fallbacks are requested with their beta header', sent.fallbacks === 'default' && calls[0].headers['anthropic-beta'] === 'server-side-fallback-2026-07-01');
  all &= chk('effort medium, adaptive thinking left at its default', sent.output_config.effort === 'medium' && !('thinking' in sent) && !('temperature' in sent));

  /* the API does not know the fallbacks beta: retried once without it */
  calls.length = 0;
  upstream = (n) => n === 1 ? { status: 400, data: { error: { message: 'Unexpected value for fallbacks' } } } : OK_ANSWER;
  r = res(); await H(req('POST', { message: 'hi' }), r);
  all &= chk('a 400 about fallbacks retries once without them', r.code === 200 && calls.length === 2 && !('fallbacks' in calls[1].body) && !calls[1].headers['anthropic-beta']);

  /* refusal, rate limit, outage */
  upstream = { status: 200, data: { model: 'claude-opus-5', stop_reason: 'refusal', content: [], usage: { input_tokens: 10, output_tokens: 0 } } };
  r = res(); await H(req('POST', { message: 'hi' }), r);
  all &= chk('a refusal becomes a plain sentence, not an error', r.code === 200 && /can’t help with that one/.test(r.out.reply) && r.out.actions.length === 0);
  upstream = { status: 429, data: { error: { message: 'rate' } } };
  r = res(); await H(req('POST', { message: 'hi' }), r);
  all &= chk('429 upstream -> 429 with a human message', r.code === 429 && /busy/.test(r.out.error));
  upstream = { status: 500, data: null };
  r = res(); await H(req('POST', { message: 'hi' }), r);
  all &= chk('5xx upstream -> 502', r.code === 502);
  upstream = { status: 200, data: { model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'plain words' }], usage: {} } };
  r = res(); await H(req('POST', { message: 'hi' }), r);
  all &= chk('a text-only answer still comes back as the reply', r.code === 200 && r.out.reply === 'plain words');

  /* a tenant key wins over the platform key */
  process.env.AI_KEY_SUNESOL_COM = 'tenant-key'; calls.length = 0; upstream = OK_ANSWER;
  r = res(); await H(req('POST', { message: 'hi' }), r);
  all &= chk('the tenant key is used when set', calls[0].headers['x-api-key'] === 'tenant-key');

  /* size limits */
  const big = { pad: 'x'.repeat(40000) };
  const m = I.buildMessages({ message: 'q', situation: big, history: new Array(40).fill(0).map((_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 't' + i })) });
  all &= chk('the situation is clamped and history capped', m[m.length - 1].content.length < 17000 && m.length <= 13, `msgs=${m.length}`);
  all &= chk('cost is null for an unknown model rather than a guess', I.costOf('claude-unknown', { input_tokens: 1 }) === null);
  all &= chk('the knowledge names the rail gates by their wording', /No map centre yet/.test(I.KNOWLEDGE) && /Area needs a drawing scale and a boundary/.test(I.KNOWLEDGE) && /Results not updated/.test(I.KNOWLEDGE));

  console.log(all ? '\nALL PASS' : '\nFAILURES ABOVE');
  process.exit(all ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
