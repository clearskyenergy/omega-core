/* ═══════════════════════════════════════════════════════════════════════════════
   /tremco-patches.js — TEMPORARY PLATFORM PATCH

   ⚠ DELETE THIS FILE once the upstream fix lands in the shared index.html, and
     remove its loader line from /config.js. It exists only so Tremco's trial
     isn't showing a visibly broken dashboard while that fix is queued.

   ── THE BUG ────────────────────────────────────────────────────────────────
   The "Upgrade" badge on locked Quick Access tiles jumps in and out of place
   as the mouse moves across the row.

   applyToolLocks() in index.html locks any [data-tool] element the tenant's
   plan doesn't cover. Two different kinds of element carry data-tool:

     .pm-tile     the marketplace / My Applications cards   — position:relative
     .quick-link  the four Quick Access tiles               — NO position at all

   lockTile() appends .pm-lock-badge (position:absolute; top:8px; right:8px)
   and .pm-lock (position:absolute; inset:0) to whichever it locked. An
   absolutely positioned element resolves against its nearest POSITIONED
   ancestor, so on a .quick-link both children escape the tile and anchor to
   .dash-block[data-block="command"] — the panel wrapping Quick Access AND the
   Portfolio Command Center.

   What makes it flicker rather than merely sit in the wrong place:

       .quick-link:hover{ ... transform:translateY(-1px) }

   A non-none transform makes an element a containing block for absolutely
   positioned descendants. So while the tile is hovered the badge snaps
   correctly into its top-right corner; the moment the pointer leaves, the
   transform goes and the badge jumps back out to the corner of the whole
   block. Moving across the row toggles it repeatedly.

   Because the command block's right edge nearly coincides with the last
   tile's, the escaped badge lands close enough to look almost right — which
   is why this reads as a flicker rather than as an obviously misplaced label.

   TWO MORE SYMPTOMS FROM THE SAME ROOT CAUSE, both worth checking on the live
   site once this is in:

     1. The grey-out and the "Upgrade to unlock" hover overlay never appear on
        Quick Access tiles. Those rules are scoped to `.pm-tile.locked`, which
        a .quick-link never matches — so a locked tile looks fully enabled
        right up until clicking it opens the upgrade modal.
     2. .pm-lock is `inset:0` against that same block, so a locked Quick Access
        tile injects an invisible (opacity:0, z-index:3) layer stretched over
        the entire Quick Access + Command Center area. opacity:0 does not stop
        hit-testing, so this is the first thing to suspect if tiles or KPIs in
        that panel are intermittently unclickable.

   ── SCOPE ──────────────────────────────────────────────────────────────────
   Only bites tenants below Enterprise: applyToolLocks() early-returns at
   tierLevel >= 3, so nothing locks and nothing escapes. Every trial and Tier 1
   tenant on this build is affected, not just Tremco. Under `tier1` the
   `investment` tile unlocks and the symptom disappears on its own — which is
   worth knowing before anyone concludes an upgrade "fixed" it.

   ── THE REAL FIX ───────────────────────────────────────────────────────────
   Three CSS rules in the shared index.html. Tenant-neutral, fixes it for every
   deployment. See README → "The Upgrade badge flicker".
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

if (document.getElementById('tremco-patch-css')) return;

var css = [
  /* 1 — Give the tile its own containing block so the badge and overlay anchor
         to the tile instead of the surrounding dashboard block. This single
         declaration is what stops the jumping; the rest is the missing locked
         styling that was only ever written for .pm-tile. */
  '.quick-link.locked{position:relative;cursor:pointer}',

  /* 2 — Dim the tile's own content so a locked tile reads as locked. The badge
         is excluded so it stays legible; the .pm-tile rule upstream does dim
         its badge, which is a smaller cosmetic issue not worth diverging over
         here beyond leaving ours readable. */
  '.quick-link.locked > *:not(.pm-lock):not(.pm-lock-badge)'
    + '{filter:grayscale(.85) opacity(.45);pointer-events:none}',

  /* 3 — Reveal the "Upgrade to unlock" overlay on hover, matching .pm-tile. */
  '.quick-link.locked:hover .pm-lock{opacity:1}',

  /* 4 — Belt and braces: even before a tile is locked, keep .quick-link a
         containing block so nothing absolutely positioned inside it can ever
         escape to the dashboard block again. */
  '.quick-link{position:relative}'
].join('\n');

var el = document.createElement('style');
el.id = 'tremco-patch-css';
el.textContent = css;

/* Append to <head> so normal cascade order applies — this must win over the
   base .quick-link rule, and it does by being later in the document. No
   !important: if the upstream fix lands and this file lingers, the two agree
   rather than fight. */
(document.head || document.documentElement).appendChild(el);

if (window.console && console.info){
  console.info('[tremco-patches] Quick Access lock-badge positioning patched. '
             + 'Remove this file once the upstream index.html fix ships.');
}

})();
