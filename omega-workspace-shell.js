/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-workspace-shell.js — the ONE chrome of Omega Workspace.

   The navy rail, the white topbar with the company switcher, the blueprint
   grid behind everything, the side panel, the toast and the phone tab bar,
   painted the same way on every workspace page so moving between Home,
   Projects, Tools, Marketplace and Team never reads as changing product.
   The dashboard, the projects page and the marketplace each carried a copy
   of the rail before this; a copy per page is how the same nav came to
   disagree with itself between two clicks.

   It is the workspace's twin of OmegaLogicTheme.chrome(): a page never
   builds its own rail, it calls this after it knows who is signed in.

     OmegaWorkspaceShell.mount({ current, search, tabs })   the skeleton
     OmegaWorkspaceShell.paint({ ws, user })                 names, tier, avatar
     OmegaWorkspaceShell.section(title, items)               add a rail group (Omega Logic)
     OmegaWorkspaceShell.badge(key, n)                        a count on a rail item
     OmegaWorkspaceShell.workspaces(list)                     the switcher's companies
     OmegaWorkspaceShell.drawer(opts) / closeDrawer()         the side panel
     OmegaWorkspaceShell.toast(text)
     OmegaWorkspaceShell.theme()                              legacy pages: grid + home link only
     OmegaWorkspaceShell.homeHref()                           '/workspace' or '/'

   The rail keeps the element ids omega-jd-nav.js reveals (sn-jv-divider,
   sn-jv-label, sn-osa, sn-jda, sn-dealroom, sn-design) so the Joint
   development and Deal Room entries appear here exactly as they do on every
   other shell, from the same read. Showing an item is never access.

   The grid is the website's: login.html's 120px major over 24px minor lines
   in the blue tint, and the finance portal's 44px white grid on the navy.
   ES5, no build step, no dependencies. */
(function (global) {
  'use strict';
  var doc = global.document;
  var PRODUCT = 'Omega Workspace';
  var CSS = [
    ':root{--ows-page:#F5F4F0;--ows-paper:#FFFFFF;--ows-ink:#14171A;--ows-ink2:#556B82;--ows-ink3:#86A0A9;--ows-line:#E4E8EC;--ows-line2:#DCD9D2;--ows-sunk:#F1FAFC;',
    '--ows-rail:#0B2A3D;--ows-rail-ink:#C9D6E2;--ows-rail-dim:#7F97AA;--ows-rail-on:#1264A3;--ows-brand:#2B5FA8;--ows-brand-soft:#E7EEF9;--ows-brand-ink:#1E4A8C;',
    '--ows-teal:#3FAFC6;--ows-teal-d:#2A8CA3;--ows-teal-soft:#E2F4F8;--ows-coral:#EE5A4F;--ows-green:#2E7D5B;--ows-green-soft:#E3F2EA;--ows-amber:#B8791B;--ows-amber-soft:#FFF6E5;',
    '--ows-shadow:0 1px 2px rgba(20,23,26,.05),0 6px 20px rgba(20,23,26,.06);--ows-r:14px;--ows-grid-major:rgba(43,95,168,.09);--ows-grid-minor:rgba(43,95,168,.04);--ows-grid-rail:rgba(255,255,255,.055)}',
    /* the ground: the website\'s blueprint grid, fixed so content scrolls over it */
    'body.ows{margin:0;background-color:var(--ows-page);background-image:linear-gradient(var(--ows-grid-major) 1px,transparent 1px),linear-gradient(90deg,var(--ows-grid-major) 1px,transparent 1px),linear-gradient(var(--ows-grid-minor) 1px,transparent 1px),linear-gradient(90deg,var(--ows-grid-minor) 1px,transparent 1px);background-size:120px 120px,120px 120px,24px 24px,24px 24px;background-attachment:fixed;color:var(--ows-ink);font-family:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.45}',
    'body.ows *,body.ows *::before,body.ows *::after{box-sizing:border-box}',
    'body.ows button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}body.ows a{color:inherit;text-decoration:none}',
    'body.ows :focus-visible{outline:2px solid var(--ows-teal);outline-offset:2px}',
    '.ows-app{display:grid;grid-template-columns:224px minmax(0,1fr);min-height:100vh}',
    /* the rail */
    '.ows-rail{position:sticky;top:0;height:100vh;overflow:auto;display:flex;flex-direction:column;gap:2px;padding:18px 12px 12px;color:var(--ows-rail-ink);background-color:var(--ows-rail);background-image:linear-gradient(var(--ows-grid-rail) 1px,transparent 1px),linear-gradient(90deg,var(--ows-grid-rail) 1px,transparent 1px);background-size:44px 44px}',
    '.ows-rail::before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 40%,var(--ows-rail) 100%);opacity:.9}.ows-rail>*{position:relative}',
    '.ows-rail .sn-head{display:flex;align-items:center;gap:10px;padding:4px 8px 16px;color:#fff}',
    '.ows-rail .sn-mark{width:34px;height:34px;border-radius:9px;background:radial-gradient(circle at 30% 30%,#17293A,#050A11);display:grid;place-items:center;font:700 20px Poppins,"DM Sans",sans-serif;color:#2FE3C8;box-shadow:inset 0 0 0 1px rgba(53,198,244,.35);flex:none}',
    '.ows-rail .sn-head b{display:block;font:600 15px/1.1 Poppins,"DM Sans",sans-serif}.ows-rail .sn-head small{font-size:11px;color:var(--ows-rail-dim)}',
    '.ows-rail .sn-section-label{padding:14px 8px 4px;font:500 10.5px "DM Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ows-rail-dim)}',
    '.ows-rail .sn-divider{height:0;margin:6px 0}',
    '.ows-rail .sn-item{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:9px;color:var(--ows-rail-ink);font-weight:500;text-align:left;font-size:14px}',
    '.ows-rail .sn-item svg{width:18px;height:18px;flex:none;opacity:.9}.ows-rail .sn-item:hover{background:rgba(255,255,255,.06)}.ows-rail .sn-item.active{background:var(--ows-rail-on);color:#fff}',
    '.ows-rail .sn-count{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--ows-coral);color:#fff;font:700 11px "DM Mono",monospace;display:inline-flex;align-items:center;justify-content:center}.ows-rail .sn-count:empty{display:none}',
    '.ows-rail .sn-spacer{flex:1}',
    '.ows-rail .sn-me{display:flex;align-items:center;gap:10px;padding:10px;border-top:1px solid rgba(255,255,255,.08);margin-top:8px;min-width:0}',
    '.ows-rail .sn-me .sn-av{width:30px;height:30px;border-radius:50%;background:var(--ows-teal-d);color:#fff;display:grid;place-items:center;font-weight:700;font-size:12px;flex:none;overflow:hidden}.ows-rail .sn-me .sn-av img{width:100%;height:100%;object-fit:cover}',
    '.ows-rail .sn-me b{display:block;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ows-rail .sn-me small{display:block;color:var(--ows-rail-dim);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ows-rail .sn-me>div{min-width:0}',
    '.ows-rail .sn-me .sn-out{margin-left:auto;padding:5px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.18);font-size:12px;color:#fff;flex:none}',
    /* the topbar */
    '.ows-main{min-width:0;display:flex;flex-direction:column}',
    '.ows-top{position:sticky;top:0;z-index:30;height:56px;display:flex;align-items:center;gap:12px;padding:0 20px;background:rgba(255,255,255,.92);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border-bottom:1px solid var(--ows-line)}',
    '.ows-burger{display:none;width:38px;height:38px;border-radius:9px;place-items:center;color:var(--ows-ink2)}.ows-burger:hover{background:var(--ows-sunk)}',
    '.ows-switch{position:relative}.ows-switch>button{display:flex;align-items:center;gap:10px;padding:5px 10px 5px 6px;border-radius:10px;border:1px solid var(--ows-line);background:var(--ows-paper);max-width:320px}',
    '.ows-switch .co{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;font-weight:700;color:#fff;font-size:12px;background:var(--ows-brand);flex:none;overflow:hidden}.ows-switch .co img{width:100%;height:100%;object-fit:contain;background:#fff}',
    '.ows-switch .t{text-align:left;min-width:0}.ows-switch .t b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ows-switch .t small{display:block;color:var(--ows-ink3);font-size:11px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ows-switch .caret{color:var(--ows-ink3);font-size:11px}',
    '.ows-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:300px;max-width:min(92vw,380px);background:var(--ows-paper);border:1px solid var(--ows-line);border-radius:12px;box-shadow:var(--ows-shadow);padding:6px;z-index:40}',
    '.ows-menu .hd{padding:8px 10px 4px;font:500 11px "DM Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ows-ink3)}',
    '.ows-menu .row{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:9px;text-align:left}.ows-menu .row:hover{background:var(--ows-sunk)}.ows-menu .row.on{background:var(--ows-brand-soft)}',
    '.ows-menu .row .co{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;color:#fff;font-weight:700;font-size:11px;background:var(--ows-brand);flex:none}.ows-menu .row b{display:block;font-weight:600}.ows-menu .row small{display:block;color:var(--ows-ink3);font-size:11px}',
    '.ows-menu .note{padding:8px 10px 6px;font-size:11.5px;color:var(--ows-ink3);line-height:1.4}',
    '.ows-search{flex:1;max-width:420px;display:flex;align-items:center;gap:8px;background:var(--ows-sunk);border:1px solid var(--ows-line);border-radius:10px;padding:7px 12px;color:var(--ows-ink3)}.ows-search input{border:0;background:transparent;flex:1;font:inherit;color:var(--ows-ink);outline:none;min-width:0}',
    '.ows-top .right{margin-left:auto;display:flex;align-items:center;gap:10px}',
    '.ows-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 12px;font-weight:600;font-size:12.5px;border:1px solid var(--ows-line2);background:var(--ows-paper);color:var(--ows-ink);white-space:nowrap;cursor:pointer;text-decoration:none}.ows-pill:hover{filter:brightness(.97)}',
    '.ows-pill.primary{background:var(--ows-brand);border-color:var(--ows-brand);color:#fff}.ows-pill.ghost{background:transparent}.ows-pill.sm{font-size:12px;padding:4px 10px}',
    '.ows-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:3px 9px;border-radius:999px;background:var(--ows-sunk);border:1px solid var(--ows-line);color:var(--ows-ink2);white-space:nowrap}.ows-chip.on{background:var(--ows-teal-soft);border-color:transparent;color:var(--ows-teal-d)}.ows-chip.lock{opacity:.55}',
    '.ows-top .tb-av{width:32px;height:32px;border-radius:50%;background:var(--ows-teal-d);color:#fff;display:grid;place-items:center;font-weight:700;font-size:12.5px;overflow:hidden;flex:none}.ows-top .tb-av img{width:100%;height:100%;object-fit:cover}',
    '.ows-content{padding:22px 24px 40px;display:flex;flex-direction:column;gap:22px;width:100%;max-width:1240px}',
    /* the side panel */
    '.ows-scrim{position:fixed;inset:0;background:rgba(11,42,61,.35);z-index:60}',
    '.ows-drawer{position:fixed;top:0;right:0;bottom:0;width:min(380px,100%);background:var(--ows-paper);border-left:1px solid var(--ows-line);z-index:61;padding:22px 20px;overflow:auto;display:flex;flex-direction:column;gap:16px;box-shadow:var(--ows-shadow)}',
    '.ows-drawer .x{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:8px;display:grid;place-items:center;font-size:18px;color:var(--ows-ink2)}.ows-drawer .x:hover{background:var(--ows-sunk)}',
    '.ows-drawer h2{margin:0;font:600 17px Poppins,"DM Sans",sans-serif}.ows-drawer .eyebrow{font:500 11px "DM Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ows-ink3)}.ows-drawer .sub{color:var(--ows-ink2);font-size:13px;margin-top:4px}',
    '.ows-rows{display:flex;flex-direction:column;gap:8px}',
    '.ows-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--ows-line);border-radius:10px;background:var(--ows-paper);width:100%;text-align:left;color:inherit}.ows-row:hover{background:var(--ows-sunk)}',
    '.ows-row .ic{width:30px;height:30px;border-radius:8px;background:var(--ows-brand-soft);color:var(--ows-brand-ink);display:grid;place-items:center;font-size:15px;flex:none}.ows-row .ic svg{width:16px;height:16px}',
    '.ows-row>div{min-width:0;flex:1}.ows-row b{display:block;font-weight:600}.ows-row small{display:block;color:var(--ows-ink2);font-size:12px}.ows-row .ows-pill{margin-left:auto;flex:none}',
    '.ows-row.locked .ic{background:var(--ows-sunk);color:var(--ows-ink3)}.ows-row.locked b{color:var(--ows-ink2)}',
    '.ows-note{color:var(--ows-ink2);font-size:13px;background:var(--ows-sunk);border-radius:10px;padding:12px 14px;line-height:1.5}.ows-note b{color:var(--ows-ink)}',
    '.ows-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--ows-ink);color:var(--ows-page);padding:9px 16px;border-radius:999px;font-size:13px;z-index:70;box-shadow:var(--ows-shadow);opacity:0;transition:opacity .2s;pointer-events:none;max-width:92vw}.ows-toast.show{opacity:1}',
    /* the phone tab bar */
    '.ows-tabs{display:none;position:fixed;left:0;right:0;bottom:0;z-index:35;grid-template-columns:repeat(5,1fr);border-top:1px solid var(--ows-line);background:var(--ows-paper);padding:6px 4px calc(8px + env(safe-area-inset-bottom,0px))}',
    '.ows-tabs a{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10.5px;color:var(--ows-ink3);font-weight:500;padding:4px 0;position:relative}.ows-tabs a svg{width:20px;height:20px}.ows-tabs a.active{color:var(--ows-teal-d)}',
    '.ows-tabs a .sn-count{position:absolute;top:0;left:calc(50% + 6px);min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--ows-coral);color:#fff;font:700 10px "DM Mono",monospace;display:inline-flex;align-items:center;justify-content:center}.ows-tabs a .sn-count:empty{display:none}',
    /* narrow */
    '@media (max-width:900px){.ows-app{grid-template-columns:minmax(0,1fr)}.ows-burger{display:grid}',
    '.ows-rail{position:fixed;top:0;bottom:0;left:0;width:min(280px,86vw);z-index:65;transform:translateX(-102%);transition:transform .2s;box-shadow:0 20px 60px rgba(0,0,0,.35)}body.ows-rail-open .ows-rail{transform:none}',
    '.ows-rail-scrim{display:none;position:fixed;inset:0;background:rgba(11,42,61,.45);z-index:64}body.ows-rail-open .ows-rail-scrim{display:block}',
    '.ows-top{padding:0 14px;gap:8px}.ows-search{display:none}.ows-switch>button{max-width:200px}.ows-content{padding:16px 16px 32px}}',
    '@media (max-width:700px){.ows-tabs.on{display:grid}body.ows-has-tabs .ows-content{padding-bottom:calc(80px + env(safe-area-inset-bottom,0px))}}',
    '@media (prefers-reduced-motion:reduce){.ows-rail{transition:none}}',
    /* legacy pages: the ground only */
    'body.ows-theme{background-color:#F5F4F0;background-image:linear-gradient(rgba(43,95,168,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(43,95,168,.09) 1px,transparent 1px),linear-gradient(rgba(43,95,168,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(43,95,168,.04) 1px,transparent 1px);background-size:120px 120px,120px 120px,24px 24px,24px 24px;background-attachment:fixed}',
    'body.ows-theme #side-nav{background-image:linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px);background-size:44px 44px}',
    /* a legacy page wearing the workspace rail (adopt): its own .sn-* rules
       style the items; these cover what its head and counts do not */
    'body.ows-theme #side-nav .sn-head.ows-head{display:flex;align-items:center;gap:10px;padding:14px 14px 12px;color:#fff}',
    'body.ows-theme #side-nav .sn-head.ows-head .sn-mark{width:32px;height:32px;border-radius:9px;background:radial-gradient(circle at 30% 30%,#17293A,#050A11);display:grid;place-items:center;font:700 19px Poppins,"DM Sans",sans-serif;color:#2FE3C8;box-shadow:inset 0 0 0 1px rgba(53,198,244,.35);flex:none}',
    'body.ows-theme #side-nav .sn-head.ows-head b{display:block;font:600 14.5px/1.1 Poppins,"DM Sans",sans-serif;color:#fff}body.ows-theme #side-nav .sn-head.ows-head small{display:block;font-size:11px;color:#7E93A6;margin-top:2px}',
    'body.ows-theme #side-nav .sn-item .sn-count{flex:none;margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#EE5A4F;color:#fff;font:700 11px "DM Mono",monospace;display:inline-flex;align-items:center;justify-content:center}body.ows-theme #side-nav .sn-item .sn-count:empty{display:none}'
  ].join('');
  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
    projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    tools: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>',
    marketplace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 22V12h6v10"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>',
    feed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    quotes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>',
    billing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6M9 11h3"/></svg>',
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 12h20"/></svg>',
    console: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 20h8M12 18v2"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    burger: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>'
  };
  /* THE RAIL. Home · Projects · All tools · Marketplace · Team · Feed, then
     the sections other shells reveal, then Account. Tools and Team live on
     the home page (its sections), so their links are anchors there. */
  var NAV = [
    { section: 'Workspace' },
    { key: 'home', label: 'Home', icon: 'home', href: '/workspace', sn: 'dashboard' },
    { key: 'projects', label: 'Projects', icon: 'projects', href: '/projects.html', sn: 'projects' },
    { key: 'tools', label: 'All tools', icon: 'tools', href: '/workspace#tools', sn: 'apps' },
    { key: 'marketplace', label: 'Marketplace', icon: 'marketplace', href: '/marketplace.html', sn: 'marketplace' },
    { key: 'quotes', label: 'Quote Desk', icon: 'quotes', href: '/rfq.html', sn: 'rfq' },
    { key: 'team', label: 'Team', icon: 'team', href: '/workspace#team', sn: 'team' },
    { key: 'feed', label: 'Feed', icon: 'feed', href: '/workspace#feed', sn: 'feed' },
    { divider: 'sn-jv-divider', label: 'Joint development', labelId: 'sn-jv-label', hidden: true },
    { key: 'osa', id: 'sn-osa', label: 'OSA Workspace', icon: 'shield', href: '/osa', sn: 'osa', hidden: true },
    { key: 'design', id: 'sn-design', label: 'Design Queue', icon: 'pen', href: '/jd-workspace.html', sn: 'design', hidden: true, labelSpan: 'sn-design-label', count: 'sn-design-n' },
    { key: 'jda', id: 'sn-jda', label: 'JD Partners', icon: 'file', href: '/jda.html', sn: 'jda', hidden: true },
    { key: 'dealroom', id: 'sn-dealroom', label: 'Deal Room', icon: 'bank', href: '/portals/finance/', sn: 'dealroom', hidden: true },
    { divider: 'sn-adm-divider', label: 'Administration', labelId: 'sn-adm-label', hidden: true },
    { key: 'admin', id: 'sn-admin', label: 'Admin Console', icon: 'shield', href: '/admin/', sn: 'admin', hidden: true },
    { key: 'ops', id: 'sn-ops', label: 'Ops Console', icon: 'console', href: '/console/', sn: 'ops', hidden: true },
    { mount: 'sn-extra' },
    { section: 'Account' },
    { key: 'billing', label: 'Plan & billing', icon: 'billing', href: '/workspace#billing', sn: 'billing' },
    { key: 'settings', label: 'Settings', icon: 'settings', href: '/workspace#settings', sn: 'settings' }
  ];
  var TABS = [['home', 'Home', 'home', '/workspace'], ['projects', 'Projects', 'projects', '/projects.html'], ['tools', 'Tools', 'tools', '/workspace#tools'], ['team', 'Team', 'team', '/workspace#team'], ['me', 'Me', 'me', '/workspace#settings']];

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function byId(id) { return doc.getElementById(id); }
  function css() {
    if (byId('ows-css')) return;
    var s = doc.createElement('style'); s.id = 'ows-css'; s.textContent = CSS; (doc.head || doc.documentElement).appendChild(s);
    if (!doc.querySelector('link[href*="fonts.googleapis.com"][href*="Poppins"]')) {
      var l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Poppins:wght@500;600;700&family=DM+Mono:wght@400;500&display=swap'; doc.head.appendChild(l);
    }
  }
  function initials(name) { return String(name || '?').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase() || '?'; }
  function productName() {
    try { if (global.OmegaWhiteLabel && OmegaWhiteLabel.active && OmegaWhiteLabel.active()) return OmegaWhiteLabel.platformName(); } catch (e) {}
    return PRODUCT;
  }

  var state = { current: 'home', opts: {}, ws: null, user: null, list: [] };

  function headHtml(cls) { return '<div class="sn-head' + (cls ? ' ' + cls : '') + '"><span class="sn-mark">Ω</span><div><b id="ows-product">' + esc(productName()) + '</b><small id="ows-by">' + (productName() === PRODUCT ? 'by ClearSky' : 'Powered by ClearSky OMEGA') + '</small></div></div>'; }
  function railHtml(opts) {
    var h = opts.head === false ? '' : headHtml('');
    NAV.forEach(function (n) {
      if (n.section) { h += '<div class="sn-section-label">' + esc(n.section) + '</div>'; return; }
      if (n.divider) { h += '<div class="sn-divider" id="' + n.divider + '"' + (n.hidden ? ' style="display:none"' : '') + '></div><div class="sn-section-label" id="' + n.labelId + '"' + (n.hidden ? ' style="display:none"' : '') + '>' + esc(n.label) + '</div>'; return; }
      if (n.mount) { h += '<div id="' + n.mount + '"></div>'; return; }
      h += '<a class="sn-item' + (n.key === opts.current ? ' active' : '') + '" data-sn="' + n.sn + '" data-key="' + n.key + '"' + (n.id ? ' id="' + n.id + '"' : '') + ' href="' + esc(n.href) + '"' + (n.hidden ? ' style="display:none"' : '') + '>' + ICON[n.icon] + '<span' + (n.labelSpan ? ' id="' + n.labelSpan + '"' : '') + '>' + esc(n.label) + '</span><span class="sn-count" id="' + (n.count || 'ows-count-' + n.key) + '"></span></a>';
    });
    if (opts.me === false) return h;
    h += '<div class="sn-spacer"></div><div class="sn-me" id="ows-me"><span class="sn-av" id="ows-me-av">?</span><div><b id="ows-me-name">…</b><small id="ows-me-mail"></small></div><button class="sn-out" id="ows-signout" type="button">Sign out</button></div>';
    return h;
  }
  function topHtml(opts) {
    return '<button class="ows-burger" id="ows-burger" type="button" aria-label="Menu" aria-expanded="false">' + ICON.burger + '</button>'
      + '<div class="ows-switch" id="ows-switch"><button type="button" id="ows-switch-btn" aria-haspopup="true" aria-expanded="false"><span class="co" id="ows-co">…</span><span class="t"><b id="ows-co-name">Loading…</b><small id="ows-co-sub"></small></span><span class="caret">▾</span></button></div>'
      + (opts.search === false ? '' : '<label class="ows-search"><span>⌕</span><input id="ows-q" type="search" placeholder="Search projects, tools, people…" aria-label="Search"></label>')
      + '<div class="right" id="ows-top-right"><span class="tb-av" id="tb-avatar-wrap"><span class="tb-av-txt" id="tb-avatar">?</span></span></div>';
  }
  function tabsHtml(opts) {
    return TABS.map(function (t) { return '<a href="' + t[3] + '" data-tab="' + t[0] + '" class="' + (t[0] === opts.current ? 'active' : '') + '">' + ICON[t[2]] + t[1] + '<span class="sn-count" id="ows-tab-' + t[0] + '"></span></a>'; }).join('');
  }
  /* Build the skeleton: the page provides #side-nav, #topbar and #main
     (or just #main, and the shell wraps it). */
  function mount(opts) {
    opts = opts || {}; state.opts = opts; state.current = opts.current || 'home';
    css(); doc.body.classList.add('ows');
    var rail = byId('side-nav'), top = byId('topbar'), main = byId('main');
    if (!rail || !top) {
      var app = doc.createElement('div'); app.className = 'ows-app';
      rail = doc.createElement('nav'); rail.id = 'side-nav';
      var mainWrap = doc.createElement('div'); mainWrap.className = 'ows-main';
      top = doc.createElement('header'); top.id = 'topbar';
      mainWrap.appendChild(top);
      if (main) { main.parentNode.insertBefore(app, main); mainWrap.appendChild(main); } else { main = doc.createElement('main'); main.id = 'main'; mainWrap.appendChild(main); doc.body.appendChild(app); }
      app.appendChild(rail); app.appendChild(mainWrap);
    }
    rail.className = 'ows-rail'; rail.setAttribute('aria-label', 'Workspace'); rail.innerHTML = railHtml(opts);
    top.className = 'ows-top'; top.innerHTML = topHtml(opts);
    var scrim = doc.createElement('div'); scrim.className = 'ows-rail-scrim'; scrim.addEventListener('click', closeRail); doc.body.appendChild(scrim);
    if (opts.tabs) { var tb = doc.createElement('nav'); tb.className = 'ows-tabs on'; tb.setAttribute('aria-label', 'Sections'); tb.innerHTML = tabsHtml(opts); doc.body.appendChild(tb); doc.body.classList.add('ows-has-tabs'); }
    byId('ows-burger').addEventListener('click', function () { doc.body.classList.contains('ows-rail-open') ? closeRail() : openRail(); });
    byId('ows-signout').addEventListener('click', signOut);
    byId('ows-switch-btn').addEventListener('click', toggleMenu);
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); closeRail(); closeMenu(); } });
    /* a rail link the page handles itself (an area panel) */
    Array.prototype.forEach.call(rail.querySelectorAll('.sn-item'), function (a) {
      a.addEventListener('click', function (e) {
        var key = a.getAttribute('data-key');
        if (typeof opts.onNav === 'function' && opts.onNav(key, a, e) === true) { e.preventDefault(); closeRail(); }
      });
    });
    var q = byId('ows-q');
    if (q && typeof opts.search === 'function') q.addEventListener('input', function () { opts.search(q.value); });
    return { rail: rail, top: top, main: main };
  }
  function openRail() { doc.body.classList.add('ows-rail-open'); var b = byId('ows-burger'); if (b) b.setAttribute('aria-expanded', 'true'); }
  function closeRail() { doc.body.classList.remove('ows-rail-open'); var b = byId('ows-burger'); if (b) b.setAttribute('aria-expanded', 'false'); }

  /* names, tier, the person */
  function paint(o) {
    o = o || {}; var ws = o.ws || state.ws || {}, user = o.user || state.user || {};
    state.ws = ws; state.user = user;
    var name = ws.clientName || ws.name || (ws.orgId || '').split('.')[0] || 'Workspace';
    var role = ws.role || 'member', tier = o.plan || ws.accountTier || '';
    var pn = byId('ows-product'); if (pn) pn.textContent = productName();
    var by = byId('ows-by'); if (by) by.textContent = productName() === PRODUCT ? 'by ClearSky' : (global.OmegaWhiteLabel && OmegaWhiteLabel.attribution ? OmegaWhiteLabel.attribution() : '');
    var co = byId('ows-co'); if (co) co.innerHTML = ws.logo ? '<img src="' + esc(ws.logo) + '" alt="" onerror="this.parentNode.textContent=\'' + esc(initials(name)) + '\'">' : esc(initials(name));
    var cn = byId('ows-co-name'); if (cn) cn.textContent = name;
    var cs = byId('ows-co-sub'); if (cs) cs.textContent = (ws.orgId || '') + (role ? ' · ' + role : '') + (tier ? ' · ' + tier : '');
    var who = o.displayName || user.displayName || (user.email ? String(user.email).split('@')[0] : '');
    var mn = byId('ows-me-name'); if (mn) mn.textContent = who;
    var mm = byId('ows-me-mail'); if (mm) mm.textContent = user.email || '';
    var av = user.photoURL ? '<img src="' + esc(user.photoURL) + '" alt="">' : esc(initials(who));
    var ma = byId('ows-me-av'); if (ma) ma.innerHTML = av;
    var ta = byId('tb-avatar-wrap'); if (ta) ta.innerHTML = av;
    var tn = byId('tb-name'); if (tn) tn.textContent = who;
    try { doc.title = name + ' · ' + productName(); } catch (e) {}
    var q = byId('ows-q'); if (q && ws.hideMarketplace) { var m = doc.querySelector('.sn-item[data-key="marketplace"]'); if (m) m.style.display = 'none'; var mt = doc.querySelector('.ows-tabs [data-tab="marketplace"]'); if (mt) mt.style.display = 'none'; }
  }
  function badge(key, n) {
    ['ows-count-' + key, 'ows-tab-' + key].forEach(function (id) { var e = byId(id); if (e) e.textContent = n ? (n > 99 ? '99+' : String(n)) : ''; });
  }
  /* an extra rail group, e.g. Omega Logic for a workspace that holds it */
  function section(title, items) {
    var m = byId('sn-extra'); if (!m) return;
    var h = '<div class="sn-divider"></div><div class="sn-section-label">' + esc(title) + '</div>';
    items.forEach(function (it) { h += '<a class="sn-item" data-key="' + esc(it.key) + '" href="' + esc(it.href) + '">' + (ICON[it.icon] || ICON.tools) + '<span>' + esc(it.label) + '</span><span class="sn-count" id="ows-count-' + esc(it.key) + '">' + (it.badge ? esc(it.badge) : '') + '</span></a>'; });
    m.innerHTML += h;
  }
  /* the switcher: one sign-in, every company this person belongs to */
  function workspaces(list) { state.list = Array.isArray(list) ? list : []; }
  function toggleMenu() { if (byId('ows-menu')) closeMenu(); else openMenu(); }
  function closeMenu() { var m = byId('ows-menu'); if (m) m.parentNode.removeChild(m); var b = byId('ows-switch-btn'); if (b) b.setAttribute('aria-expanded', 'false'); }
  function openMenu() {
    var ws = state.ws || {}, host = byId('ows-switch'); if (!host) return;
    var here = ws.orgId || '';
    var rows = state.list.length ? state.list : [{ orgId: here, name: ws.clientName || ws.name || here, role: ws.role || 'member', current: true }];
    var m = doc.createElement('div'); m.className = 'ows-menu'; m.id = 'ows-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = '<div class="hd">Open your company</div>' + rows.map(function (r) {
      var on = (r.orgId === here) || r.current;
      return '<a class="row' + (on ? ' on' : '') + '" role="menuitem" href="' + esc(r.href || '#') + '" data-org="' + esc(r.orgId) + '"><span class="co">' + esc(initials(r.name)) + '</span><div><b>' + esc(r.name) + '</b><small>' + esc(r.orgId) + (r.role ? ' · ' + r.role : '') + (on ? ' · here now' : '') + '</small></div></a>';
    }).join('') + '<div class="note">' + (rows.length > 1 ? 'One sign-in, every company you belong to.' : 'This sign-in belongs to one company. A grant from another workspace lists it here.') + '</div>';
    host.appendChild(m); byId('ows-switch-btn').setAttribute('aria-expanded', 'true');
    Array.prototype.forEach.call(m.querySelectorAll('.row'), function (a) { a.addEventListener('click', function (e) { if (a.classList.contains('on') || a.getAttribute('href') === '#') { e.preventDefault(); closeMenu(); } }); });
    setTimeout(function () { doc.addEventListener('click', function h(e) { if (!host.contains(e.target)) { closeMenu(); doc.removeEventListener('click', h); } }); }, 0);
  }

  /* the side panel: a quick look at an area, with the page a click further */
  function drawer(o) {
    o = o || {}; closeDrawer();
    var wrap = doc.createElement('div'); wrap.id = 'ows-overlay';
    var rows = (o.rows || []).map(function (r) {
      var tag = r.href && !r.locked ? 'a' : 'button', attrs = tag === 'a' ? ' href="' + esc(r.href) + '"' + (r.newTab ? ' target="_blank" rel="noopener"' : '') : ' type="button"';
      return '<' + tag + ' class="ows-row' + (r.locked ? ' locked' : '') + '"' + attrs + ' data-row="' + esc(r.key || r.name) + '"><span class="ic">' + (r.icon || ICON.tools) + '</span><div><b>' + esc(r.name) + '</b>' + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</div><span class="ows-pill sm' + (r.locked ? ' ghost' : '') + '">' + esc(r.locked ? 'Locked' : (r.cta || 'Open')) + '</span></' + tag + '>';
    }).join('');
    wrap.innerHTML = '<div class="ows-scrim" data-close></div><aside class="ows-drawer" role="dialog" aria-label="' + esc(o.title || '') + '"><button class="x" type="button" data-close aria-label="Close">×</button>'
      + '<div>' + (o.eyebrow ? '<div class="eyebrow">' + esc(o.eyebrow) + '</div>' : '') + '<h2>' + esc(o.title || '') + '</h2>' + (o.sub ? '<div class="sub">' + esc(o.sub) + '</div>' : '') + '</div>'
      + (o.html || '') + (rows ? '<div class="ows-rows">' + rows + '</div>' : '') + (o.note ? '<div class="ows-note">' + o.note + '</div>' : '') + '</aside>';
    doc.body.appendChild(wrap);
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-close]'), function (x) { x.addEventListener('click', closeDrawer); });
    Array.prototype.forEach.call(wrap.querySelectorAll('.ows-row'), function (x) {
      x.addEventListener('click', function (e) {
        var key = x.getAttribute('data-row'), row = null;
        (o.rows || []).forEach(function (r) { if ((r.key || r.name) === key) row = r; });
        if (row && typeof row.onClick === 'function') { e.preventDefault(); row.onClick(row); }
        else if (row && row.locked && typeof o.onLocked === 'function') { e.preventDefault(); o.onLocked(row); }
      });
    });
    if (typeof o.ready === 'function') o.ready(wrap.querySelector('.ows-drawer'));
    var x = wrap.querySelector('.x'); if (x) x.focus();
    return wrap.querySelector('.ows-drawer');
  }
  function closeDrawer() { var w = byId('ows-overlay'); if (w) w.parentNode.removeChild(w); }
  var toastT;
  function toast(text) {
    var t = byId('ows-toast'); if (!t) { t = doc.createElement('div'); t.id = 'ows-toast'; t.className = 'ows-toast'; t.setAttribute('role', 'status'); doc.body.appendChild(t); }
    t.textContent = text; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function signOut() {
    try { if (global.OmegaTenant && OmegaTenant.endSession) OmegaTenant.endSession(); } catch (e) {}
    try { global.firebase.auth().signOut().then(function () { global.location.href = '/login.html'; }, function () { global.location.href = '/login.html'; }); }
    catch (e) { global.location.href = '/login.html'; }
  }

  /* ── THE CUTOVER SWITCH ───────────────────────────────────────────────
     Where "home" is for this person: the workspace once the tenant's
     record says shell: 'workspace' (a per-tenant flip from the console),
     or when they asked for it on this browser (?home=workspace, which
     sticks; ?home=classic undoes it). Read by index.html to send a
     signed-in visit on, and by the legacy pages to point their Dashboard
     link at the same place, so the flow is one loop and not two. */
  var HOME_KEY = 'omega_home';
  function homePref() {
    try {
      var m = /[?&]home=(workspace|classic)\b/.exec(global.location.search || '');
      if (m) { global.localStorage.setItem(HOME_KEY, m[1]); return m[1]; }
      return global.localStorage.getItem(HOME_KEY) || '';
    } catch (e) { return ''; }
  }
  function wantsWorkspace(ws) {
    /* ?stay=classic: this one visit stays on the dashboard (the referral
       inbox lives there) without touching the browser's home */
    if (/[?&]stay=classic\b/.test(global.location.search || '')) return false;
    var pref = homePref();
    if (pref === 'classic') return false;
    if (pref === 'workspace') return true;
    ws = ws || global.OMEGA_WORKSPACE || null;
    return !!(ws && ws.shell === 'workspace');
  }
  function homeHref(ws) { return wantsWorkspace(ws) ? '/workspace' : '/'; }
  /* which rail item this page IS */
  function currentKey() {
    var p = String(global.location.pathname || '').replace(/\.html$/, '');
    return p === '/projects' ? 'projects' : p === '/marketplace' ? 'marketplace' : p === '/rfq' ? 'quotes' : p === '/workspace' ? 'home' : '';
  }
  /* ONE RAIL, EVERY PAGE. A legacy page (projects, marketplace, the quote
     desk) keeps its own topbar and its own CSS for .sn-item, .sn-divider
     and .sn-section-label — the class names are shared on purpose — and
     once the workspace is home, its rail's CONTENT becomes the workspace
     rail: the same items in the same order with this page marked current,
     and the same element ids, so omega-jd-nav.js reveals Joint development
     and the Deal Room here exactly as it does everywhere else. What an
     earlier reveal already showed stays shown. Runs once. */
  var adopted = false;
  function adopt() {
    var rail = byId('side-nav'); if (adopted || !rail || rail.classList.contains('ows-rail')) return false;
    var shown = {};
    ['sn-jv-divider', 'sn-jv-label', 'sn-osa', 'sn-design', 'sn-jda', 'sn-dealroom', 'sn-adm-divider', 'sn-adm-label', 'sn-admin', 'sn-ops'].forEach(function (id) { var el = byId(id); if (el && el.style.display !== 'none') shown[id] = true; });
    var label = byId('sn-design-label'), designText = label ? label.textContent : '', count = byId('sn-design-n'), countText = count ? count.textContent : '';
    rail.innerHTML = headHtml('ows-head') + '<div class="sn-scroll">' + railHtml({ current: currentKey(), head: false, me: false }) + '</div>';
    Object.keys(shown).forEach(function (id) { var el = byId(id); if (el) el.style.display = ''; });
    if (designText && byId('sn-design-label')) byId('sn-design-label').textContent = designText;
    if (countText && byId('sn-design-n')) byId('sn-design-n').textContent = countText;
    adopted = true; return true;
  }
  /* a legacy page (projects, marketplace): the same ground, the same rail
     and the same home once the workspace is home */
  function theme() {
    css(); doc.body.classList.add('ows-theme');
    function point() {
      if (!wantsWorkspace()) return;
      Array.prototype.forEach.call(doc.querySelectorAll('a[data-sn="dashboard"], a.tb-logo, #tab-portal'), function (a) {
        var h = a.getAttribute('href') || '';
        if (h === '/' || h === '/index.html') { a.setAttribute('href', '/workspace'); var s = a.querySelector('span'); if (s && /^Dashboard$/.test(s.textContent.trim())) s.textContent = 'Home'; }
      });
    }
    function both() { if (wantsWorkspace()) { adopt(); point(); } }
    both(); global.addEventListener('omega:entitlements', both); setTimeout(both, 1500);
  }

  global.OmegaWorkspaceShell = { mount: mount, adopt: adopt, currentKey: currentKey, paint: paint, badge: badge, section: section, workspaces: workspaces, drawer: drawer, closeDrawer: closeDrawer, toast: toast, signOut: signOut, theme: theme, homeHref: homeHref, wantsWorkspace: wantsWorkspace, closeRail: closeRail, ICON: ICON, PRODUCT: PRODUCT, esc: esc, initials: initials };
})(window);
