/* omega-jd-flow.js — the joint-development referral flow, and the routing
   rule that decides which OSA page a person lands on.

   The flow is the part every JD organisation shares: a referral arrives, a
   rep screens it, a gate says go or no-go, it gets developed and drawn, it
   reaches the stage the receiving partner takes over at, and it goes to them.
   Two properties matter more than the rest and are checked hardest:

     - nothing is ever "ready" for a partner whose handoff stage nobody set.
       Ready is a claim about somebody else's finish line; without one there
       is no line to have reached.
     - "not scored yet" and "scored and failed" are different answers. Folding
       them together is how a site that failed viability keeps moving.

   The routing rule gets its own section because it can loop: the portfolio
   sends people back to the portal, and the portal now sends staff to the
   portfolio. */
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

const J = require(path.join(__dirname, '..', '..', 'omega-jd-flow.js'));

/* A stage ladder, injected the way a tenant injects its own. */
const RANK = { referred:10, screening:20, qualified:30, pre_dev:40,
               permitting:50, verified:60, marketplace:70, funded:80 };
const base = {
  rankOf: k => RANK[k] || 0,
  isExit: k => k === 'dead' || k === 'discarded',
  gateRank: RANK.qualified
};
const ctx = Object.assign({}, base, { handoffRank: RANK.funded, handoffLabel: 'Funded' });
const noHandoff = Object.assign({}, base);

const rep = { rep: 'rep@clearsky-usa.com' };

console.log('the six steps');
ok(J.STEPS.length === 6, 'six of them');
ok(J.STEPS.map(s => s.key).join(',') === 'referred,screening,gate,developing,ready,sent',
   'in referral-to-handoff order');

console.log('\nwhere a project sits');
ok(J.stepFor({ stage:'referred' }, ctx) === 'referred',
   'no rep assigned is still just referred');
ok(J.stepFor({ stage:'screening', assignment:rep }, ctx) === 'screening',
   'a named rep means somebody is working it');
ok(J.stepFor({ stage:'referred', assignment:rep }, ctx) === 'screening',
   'the rep, not the stage label, is what makes it screening');
ok(J.stepFor({ stage:'screening', assignment:rep,
               viability:{score:82, verdict:'pass'} }, ctx) === 'gate',
   'scored and passed waits ON the gate, not behind it');
ok(J.stepFor({ stage:'pre_dev' }, ctx) === 'developing',
   'past the gate is development');
ok(J.stepFor({ stage:'funded' }, ctx) === 'ready',
   'reaching the partner handoff stage is ready');
ok(J.stepFor({ stage:'marketplace', dealRoomId:'room_1' }, ctx) === 'sent',
   'a deal room means handed off, whatever the stage says');
ok(J.stepFor({ stage:'dead' }, ctx) === null,
   'a closed project is on no step');
ok(J.stepFor({ stage:'dead', dealRoomId:'room_1' }, ctx) === 'sent',
   'handed off outranks closed — it really is with them');

console.log('\nready is a claim about the partner’s finish line');
ok(J.readyFor([{stage:'funded'}, {stage:'marketplace'}], noHandoff).length === 0,
   'nothing is ready when no handoff stage is set');
ok(J.readyFor([{stage:'funded'}, {stage:'pre_dev'}], ctx).length === 1,
   'with one set, only what reached it counts');
ok(J.stepFor({ stage:'funded' }, noHandoff) === 'developing',
   'without a handoff stage a late project is developing, never ready');

console.log('\ngo / no-go is three answers, not two');
ok(J.gate({}).state === 'unscored', 'no score reads as unscored');
ok(J.gate({viability:{score:41, verdict:'fail', threshold:60}}).state === 'nogo', 'a failed score is no-go');
ok(J.gate({viability:{score:88, verdict:'pass'}}).state === 'go', 'a passed score is go');
ok(J.gate({}).ok === false && J.gate({viability:{score:41,verdict:'fail'}}).ok === false,
   'neither unscored nor no-go is ok');
ok(J.gate({viability:{score:41, verdict:'fail', threshold:60}}).why.indexOf('60') >= 0,
   'the no-go says what it missed');

console.log('\nthe funnel');
const deals = [
  { stage:'referred' },
  { stage:'screening', assignment:rep },
  { stage:'screening', assignment:rep, viability:{score:82, verdict:'pass'} },
  { stage:'pre_dev', design:{status:'in_design', lead:'d@e.com'} },
  { stage:'funded' },
  { stage:'marketplace', dealRoomId:'r1' },
  { stage:'dead' }
];
const f = J.funnel(deals, ctx);
ok(f.length === 6 && f.every(s => s.count === 1),
   'one project on each of the six steps');
const t = J.funnelTotals(deals, ctx);
ok(t.total === 7 && t.live === 6 && t.dead === 1,
   'the closed one is counted apart, not folded in');
ok(J.funnel([], ctx).every(s => s.count === 0), 'an empty roster is all zeroes, not a crash');

console.log('\nwhose move it is');
ok(J.nextAction({stage:'referred'}, ctx).label === 'Assign a rep',
   'an unworked referral needs somebody answerable');
ok(J.nextAction({stage:'pre_dev', design:{}}, ctx).label === 'Assign the design team',
   'development with no design team needs one');
const waiting = J.nextAction({stage:'pre_dev', design:{status:'in_design', lead:'d@e.com'}}, ctx);
ok(waiting.blocked === true, 'waiting on a design is blocked — nothing to click');
ok(waiting.why.indexOf('d@e.com') >= 0, 'and it says who has it');
ok(J.nextAction({stage:'funded'}, ctx).label === 'Hand it off', 'ready means hand it off');
ok(J.nextAction({stage:'dead'}, ctx).blocked === true, 'a closed project has no next move');
ok(J.nextAction({stage:'pre_dev', design:{lead:'d@e.com', status:'complete'}}, noHandoff)
    .label === 'Set their handoff stage',
   'a drawn project with no handoff stage names the missing setting');

/* ── the routing rule ─────────────────────────────────────────────────────
   Pulled out of index.html and run against stub actors. The loop case is the
   one worth having a test for: the portfolio's Portal button links back here,
   and without the portal=1 exemption a staff user bounces forever. */
console.log('\nwhich OSA page a person lands on');
const idx = fs.readFileSync(path.join(__dirname, '..', '..', 'tenants', 'osa', 'index.html'), 'utf8');
const src = idx.match(/function sendToPortfolio\(actor\)\{[\s\S]*?\n\}/);
ok(!!src, 'sendToPortfolio is still in index.html');
if (src) {
  const make = new Function('location', 'return ' + src[0] + '; ');
  const at = search => make({ search });
  const plain = at('');
  ok(plain({ kind:'internal' }) === true,
     'ClearSky staff go to the portfolio — they have no verifier queue');
  ok(plain({ kind:'partner', retained:false }) === true,
     'a partner who is not a retained verifier goes to the portfolio');
  ok(plain({ kind:'partner', retained:true }) === false,
     'a retained verifier stays on the verifier portal');
  ok(plain(null) === false, 'an unresolved actor is never redirected');
  ok(at('?portal=1')({ kind:'internal' }) === false,
     'portal=1 keeps staff here, so the two pages cannot bounce each other');
  ok(at('?via=omega-gateway&portal=1')({ kind:'internal' }) === false,
     'and it is found when it is not the first parameter');
}
ok(/href="\/\?via=omega-gateway&amp;portal=1"/.test(
     fs.readFileSync(path.join(__dirname, '..', '..', 'tenants', 'osa', 'portfolio.html'), 'utf8')),
   'the portfolio’s way back carries portal=1');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
