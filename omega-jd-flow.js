/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-jd-flow.js — the joint-development referral flow.

   Every organisation in a JDA runs the same six steps on a referred site:
   somebody brings it, somebody screens it, a gate says go or no-go, it gets
   developed and drawn, it reaches the stage the receiving partner takes over
   at, and it goes to them. The stage ladder already records WHERE a project
   is. What it does not say is WHOSE move it is next, and that is the only
   question this file answers.

   Deliberately free of Firestore, of the DOM, and of any one tenant's stage
   table. The caller injects rankOf/isExit for its own ladder, so a tenant
   with different stage keys gets the same flow without a fork. ES5: this
   runs wherever a field rep opens it.

   The handoff stage is the PARTNER'S finish line, not ours. A project is
   ready when it reaches the stage that partner takes over at — which is why
   readiness is meaningless until somebody sets one. */
(function (global) {
  'use strict';

  /* The six steps. 'gate' is the only one that is a decision rather than a
     place: everything before it is looking, everything after it costs money. */
  var STEPS = [
    { key:'referred', label:'Referred',    verb:'Assign a rep',
      hint:'A partner brought it. Nobody is working it yet.' },
    { key:'screening', label:'Screening',  verb:'Score it',
      hint:'A named rep is working the site.' },
    { key:'gate',      label:'Go / no-go', verb:'Clear the gate',
      hint:'Viability decides. The gate between looking and spending.' },
    { key:'developing',label:'Developing', verb:'Get it drawn',
      hint:'We are spending. The design produces the price.' },
    { key:'ready',     label:'Ready',      verb:'Hand it off',
      hint:'It reached the stage this partner takes over at.' },
    { key:'sent',      label:'Handed off', verb:'With them',
      hint:'In the partner’s room. Their move.' }
  ];

  function stepOf(key) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].key === key) return STEPS[i];
    return null;
  }

  /* Normalise whatever the caller passes so every function below can assume
     the four things it needs exist. A tenant that forgets isExit gets a flow
     that never treats anything as dead, not a crash. */
  function ctxOf(ctx) {
    var c = ctx || {};
    return {
      handoffRank: +c.handoffRank || 0,
      rankOf:  typeof c.rankOf === 'function' ? c.rankOf : function () { return 0; },
      isExit:  typeof c.isExit === 'function' ? c.isExit : function () { return false; },
      gateRank: c.gateRank == null ? 30 : +c.gateRank,
      handoffLabel: c.handoffLabel || ''
    };
  }

  /* Go / no-go, read off the project rather than asserted. Three states,
     because "not scored yet" is not the same answer as "scored and failed"
     and showing them the same colour is how a failed site keeps moving. */
  function gate(deal) {
    var v = (deal && deal.viability) || {};
    if (v.score == null) return { state:'unscored', label:'Not scored', ok:false,
                                  why:'No viability score yet.' };
    if (v.verdict === 'pass') return { state:'go', label:'Go', ok:true, score:v.score,
                                       why:'Scored ' + v.score + ' — passed.' };
    return { state:'nogo', label:'No-go', ok:false, score:v.score,
             why:'Scored ' + v.score
                 + (v.threshold != null ? ', below ' + v.threshold : '') + '.' };
  }

  function handedOff(deal) { return !!(deal && deal.dealRoomId); }

  /* Which of the six a project is on. Order matters: handed off wins over
     everything, and a dead project is on no step at all rather than sitting
     in whichever column it died in. */
  function stepFor(deal, ctx) {
    var c = ctxOf(ctx);
    if (!deal) return null;
    if (handedOff(deal)) return 'sent';
    if (c.isExit(deal.stage)) return null;

    var rank = c.rankOf(deal.stage);
    if (c.handoffRank && rank >= c.handoffRank) return 'ready';
    if (rank >= c.gateRank) return 'developing';

    /* Below the gate the question is whether the gate can be cleared, so a
       scored-and-passed project shows as waiting ON the gate rather than
       still screening. */
    var g = gate(deal);
    if (g.state === 'go') return 'gate';
    var rep = ((deal.assignment || {}).rep) || '';
    return rep ? 'screening' : 'referred';
  }

  /* Counts per step, in step order, for the flow strip. Dead and handed-off
     projects are reported separately: folding them into the funnel makes a
     partnership look busier than it is. */
  function funnel(deals, ctx) {
    var c = ctxOf(ctx), list = deals || [], counts = {}, i;
    for (i = 0; i < STEPS.length; i++) counts[STEPS[i].key] = 0;
    for (i = 0; i < list.length; i++) {
      var k = stepFor(list[i], c);
      if (k !== null) counts[k]++;
    }
    return STEPS.map(function (s) {
      return { key:s.key, label:s.label, verb:s.verb, hint:s.hint, count:counts[s.key] };
    });
  }

  function funnelTotals(deals, ctx) {
    var c = ctxOf(ctx), list = deals || [], dead = 0, live = 0;
    for (var i = 0; i < list.length; i++) {
      if (stepFor(list[i], c) === null) dead++; else live++;
    }
    return { total:list.length, live:live, dead:dead };
  }

  /* Whose move it is, in one line. `blocked` means the step cannot advance
     until something outside this screen happens — the difference between a
     button worth showing and a sentence worth reading. */
  function nextAction(deal, ctx) {
    var c = ctxOf(ctx), k = stepFor(deal, c);
    if (k === null) return { step:null, label:'Closed', why:'This project is no longer live.',
                             blocked:true };
    var g = gate(deal);

    if (k === 'referred')
      return { step:k, label:'Assign a rep', blocked:false,
               why:'Nobody is answerable for this site yet.' };

    if (k === 'screening')
      return { step:k, label:'Score it', blocked:false,
               why:g.state === 'nogo' ? g.why + ' Re-score it or close it.'
                                      : 'A rep is on it. Viability decides what happens next.' };

    if (k === 'gate')
      return { step:k, label:'Move it into development', blocked:false,
               why:g.why + ' Nothing has been spent yet.' };

    if (k === 'developing') {
      var dz = (deal && deal.design) || {};
      if (!dz.lead && !(dz.team || []).length)
        return { step:k, label:'Assign the design team', blocked:false,
                 why:'The drawing is what produces the price.' };
      if (dz.status === 'in_design')
        return { step:k, label:'Waiting on the design', blocked:true,
                 why:'With ' + String(dz.lead || (dz.team || [])[0] || 'the design team')
                     + (dz.rounds ? ' · round ' + (dz.rounds + 1) : '') + '.' };
      if (!c.handoffRank)
        return { step:k, label:'Set their handoff stage', blocked:false,
                 why:'Without one, nothing can be called ready for this partner.' };
      return { step:k, label:'Keep it moving', blocked:false,
               why:'Ready once it reaches ' + (c.handoffLabel || 'the handoff stage') + '.' };
    }

    if (k === 'ready')
      return { step:k, label:'Hand it off', blocked:false,
               why:'It has reached the stage this partner takes over at.' };

    return { step:k, label:'With them', blocked:true, why:'In the partner’s room.' };
  }

  /* Ready-to-send, which is the number somebody actually acts on. Empty
     rather than everything when no handoff stage is set — claiming a project
     is ready for a partner whose finish line nobody recorded is a guess. */
  function readyFor(deals, ctx) {
    var c = ctxOf(ctx);
    if (!c.handoffRank) return [];
    return (deals || []).filter(function (d) { return stepFor(d, c) === 'ready'; });
  }

  global.OmegaJDFlow = {
    STEPS: STEPS, stepOf: stepOf, gate: gate, stepFor: stepFor,
    funnel: funnel, funnelTotals: funnelTotals, nextAction: nextAction,
    readyFor: readyFor, handedOff: handedOff
  };
/* globalThis where it exists, `this` otherwise — which is `window` in the old
   embedded browsers this file has to keep running in. Not `this` alone: at
   CommonJS top level that is module.exports, and the tests would attach the
   namespace to the wrong object. */
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports)
  module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).OmegaJDFlow;
