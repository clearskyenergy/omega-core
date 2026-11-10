/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Local-only personal character storage. No account, uploads or assistant identity. */
(function (root) {
  'use strict';
  var MAX_BYTES = 32 * 1024 * 1024;
  function validate(bytes) {
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 20 || bytes.byteLength > MAX_BYTES) throw new Error('Choose a self-contained GLB smaller than 32 MB.');
    var view = new DataView(bytes);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('This file is not a valid GLB 2.0 character.');
    var size = view.getUint32(12, true);
    if (size > bytes.byteLength - 20) throw new Error('The GLB is incomplete.');
    var data = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, size)));
    ['buffers', 'images'].forEach(function (key) {
      (data[key] || []).forEach(function (entry) {
        if (entry.uri && !/^data:/i.test(entry.uri)) throw new Error('The character must embed all textures and buffers.');
      });
    });
    return bytes;
  }
  function transact(write, record) {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('Local character storage is unavailable.')); return; }
      var request = root.indexedDB.open('jarvis-personal-character', 1);
      request.onupgradeneeded = function () { request.result.createObjectStore('character'); };
      request.onerror = function () { reject(new Error('Unable to open local character storage.')); };
      request.onblocked = function () { reject(new Error('Close other Mission tabs and try again.')); };
      request.onsuccess = function () {
        var db = request.result, tx = db.transaction('character', write ? 'readwrite' : 'readonly');
        var store = tx.objectStore('character');
        var op = write ? store.put(record, 'current') : store.get('current');
        tx.oncomplete = function () { var value = op.result; db.close(); resolve(write ? record : value); };
        tx.onabort = tx.onerror = function () { db.close(); reject(new Error('Unable to save or read the local character.')); };
      };
    });
  }
  root.OmegaPersonalCharacter = {
    validate: validate,
    load: function () { return transact(false).then(function (record) { if (record) validate(record.bytes); return record; }); },
    save: function (record) { validate(record.bytes); return transact(true, record); }
  };
})(window);
