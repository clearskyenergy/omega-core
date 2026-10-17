/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-recovery.js — a local draft of a Site Plan.
 *
 * The same rules as the Site Map draft (omega-editor-recovery.js): a draft
 * is offered, never applied on its own, only for this project, and only
 * when it is newer than the copy that was saved. A successful save drops
 * it. This file does not write a workspace. The drawing it stores is an
 * editor-v2 document, not the Site Map's elements/shapes/trenches.
 */
(function (root) {
  'use strict';

  var D = root.OmegaEditorV2Doc || (typeof require === 'function' ? require('./omega-editor-v2-doc.js') : null);

  var KEY = 'omega.editorV2.draft';
  var LEGACY = 'omega.editorV2.recovery';
  var MAX_BYTES = 1500000;
  var MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

  function memory() {
    var bag = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
      setItem: function (k, v) { bag[k] = String(v); },
      removeItem: function (k) { delete bag[k]; }
    };
  }

  function counts(doc) {
    return (doc && doc.entities && doc.entities.length) || 0;
  }

  /* Table geometry is derived. A copy of it in the draft is how a drawing
     crosses the localStorage quota without adding anything the person drew. */
  function shed(doc) {
    var out = D.serialize(doc), i, e, c, k;
    if (!out.entities) return out;
    for (i = 0; i < out.entities.length; i++) {
      e = out.entities[i];
      if (!e || !e.tables) continue;
      c = {};
      for (k in e) if (Object.prototype.hasOwnProperty.call(e, k) && k !== 'tables') c[k] = e[k];
      c.tables = null;
      c._tablesShed = true;
      out.entities[i] = c;
    }
    return out;
  }

  function pack(doc, at) {
    var body, json;
    try { body = shed(doc); }
    catch (e) { return { ok: false, reason: 'serialize' }; }
    var draft = {
      v: 1,
      projectId: (doc && doc.projectId) || '',
      name: (doc && doc.name) || '',
      at: typeof at === 'number' ? at : Date.now(),
      doc: body
    };
    try { json = JSON.stringify(draft); }
    catch (e2) { return { ok: false, reason: 'serialize' }; }
    if (json.length > MAX_BYTES) return { ok: false, reason: 'size', bytes: json.length };
    return { ok: true, draft: draft, json: json, bytes: json.length };
  }

  function normalize(box) {
    if (!box || typeof box !== 'object') return null;
    if (box.v === 1 && box.doc) return box;
    if (box.doc && box.doc.entities) {
      return {
        v: 1,
        projectId: box.doc.projectId || '',
        name: box.doc.name || '',
        at: typeof box.at === 'number' ? box.at : 0,
        doc: box.doc
      };
    }
    return null;
  }

  function read(storage) {
    var raw = null;
    try { raw = storage.getItem(KEY) || storage.getItem(LEGACY); }
    catch (e) { return null; }
    if (!raw) return null;
    try { return normalize(JSON.parse(raw)); }
    catch (e2) { return null; }
  }

  function write(storage, doc, at) {
    var packed = pack(doc, at);
    if (!packed.ok) return packed;
    try { storage.setItem(KEY, packed.json); }
    catch (e) { return { ok: false, reason: 'quota', bytes: packed.bytes }; }
    return packed;
  }

  function drop(storage) {
    try { storage.removeItem(KEY); storage.removeItem(LEGACY); }
    catch (e) { /* a private window may refuse storage */ }
  }

  /* Offer only for this project, only while the draft is recent, and only
     when it is newer than the saved copy (or there is no saved copy). */
  function offer(draft, ctx) {
    ctx = ctx || {};
    if (!draft || draft.v !== 1) return { offer: false, reason: 'none' };
    if (!counts(draft.doc)) return { offer: false, reason: 'empty' };
    var now = typeof ctx.now === 'number' ? ctx.now : Date.now();
    if (!draft.at || (now - draft.at) > MAX_AGE_MS || draft.at > now + 60000) {
      return { offer: false, reason: 'stale' };
    }
    if (ctx.projectId != null && String(draft.projectId) !== String(ctx.projectId)) {
      return { offer: false, reason: 'other-project' };
    }
    if (ctx.savedAt != null && draft.at <= (+ctx.savedAt) + 1000) {
      return { offer: false, reason: 'saved-newer' };
    }
    return { offer: true, reason: 'newer' };
  }

  /* The load that finishes after a person has already edited must not
     report the sheet as saved. */
  function loadKeepsDirty(editedDuringLoad) {
    return !!editedDuringLoad;
  }

  /* An empty boot is not dirty and does not warn. A save still in flight
     does, and so does any sheet the person has changed. */
  function shouldWarnOnClose(dirty, saving) {
    return !!saving || !!dirty;
  }

  var api = {
    KEY: KEY,
    LEGACY: LEGACY,
    MAX_BYTES: MAX_BYTES,
    memory: memory,
    pack: pack,
    read: read,
    write: write,
    drop: drop,
    offer: offer,
    loadKeepsDirty: loadKeepsDirty,
    shouldWarnOnClose: shouldWarnOnClose,
    VERSION: 'editor-v2-recovery/1'
  };

  root.OmegaEditorV2Recovery = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
