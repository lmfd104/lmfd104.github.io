/* Durable storage adapter.
 *
 * localStorage is the single synchronous source of truth — every read/write
 * goes straight through it, so web behavior is byte-identical to before.
 * On native (Capacitor), WebView localStorage can be evicted by the OS, so
 * each guildhall_* write is additionally mirrored (async, fire-and-forget)
 * into Capacitor Preferences (SharedPreferences / NSUserDefaults), and on
 * startup any guildhall_* key present in Preferences but missing from
 * localStorage is restored before `ready` resolves.
 *
 * Contract:
 *   GH.store.get(key)        → string|null (same throw semantics as localStorage.getItem)
 *   GH.store.set(key, value) → void        (same throw semantics as localStorage.setItem)
 *   GH.store.remove(key)     → void
 *   GH.store.ready           → Promise; resolves immediately on web, after
 *                              eviction-recovery on native. Boot awaits it.
 *
 * Requires `npm i @capacitor/preferences` in the Capacitor project; on web
 * (or if the plugin is absent) the mirror is a silent no-op.
 */
window.GH = window.GH || {};

GH.store = (function () {
  const PREFIX = 'guildhall_';

  // Capacitor Preferences plugin, or null on web / plugin missing.
  function prefs() {
    try {
      const C = window.Capacitor;
      if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return null;
      return (C.Plugins && C.Plugins.Preferences) || null;
    } catch (e) { return null; }
  }

  // Async write-behind mirror — must never throw into the sync path.
  function mirrorSet(key, value) {
    const P = prefs();
    if (!P) return;
    try { P.set({ key: key, value: String(value) }).catch(function () {}); } catch (e) {}
  }
  function mirrorRemove(key) {
    const P = prefs();
    if (!P) return;
    try { P.remove({ key: key }).catch(function () {}); } catch (e) {}
  }

  // Native init: copy any mirrored guildhall_* key the WebView lost back
  // into localStorage. Best-effort; never rejects.
  async function restore() {
    const P = prefs();
    if (!P) return;
    try {
      const res = await P.keys();
      const keys = (res && res.keys) || [];
      for (const key of keys) {
        if (key.indexOf(PREFIX) !== 0) continue;
        let missing = false;
        try { missing = localStorage.getItem(key) == null; } catch (e) {}
        if (!missing) continue;
        const got = await P.get({ key: key });
        if (got && got.value != null) {
          try { localStorage.setItem(key, got.value); } catch (e) {}
        }
      }
    } catch (e) { /* recovery is best-effort */ }
  }

  const ready = prefs() ? restore() : Promise.resolve();

  return {
    ready: ready,
    get: function (key) { return localStorage.getItem(key); },
    set: function (key, value) {
      try {
        localStorage.setItem(key, value);
      } finally {
        if (String(key).indexOf(PREFIX) === 0) mirrorSet(key, value);
      }
    },
    remove: function (key) {
      try {
        localStorage.removeItem(key);
      } finally {
        if (String(key).indexOf(PREFIX) === 0) mirrorRemove(key);
      }
    },
  };
})();
