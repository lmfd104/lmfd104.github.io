/* Audio engine: WebAudio SFX + seamlessly-looping music.
 * Self-contained — subscribes to GH.sim.onChange and a delegated click
 * listener; no other module needs edits. All loops go through
 * AudioBufferSourceNode (gapless regardless of MP3 padding).
 *
 * SFX: Kenney CC0 packs (interface-sounds, rpg-audio, impact-sounds,
 * music-jingles) for UI, plus a set of guild-specific effects generated with
 * ElevenLabs. Music: generated with ACE-Step v1 (Apache-2.0).
 */
window.GH = window.GH || {};

GH.audio = (function () {
  const SFX_DIR = 'assets/audio/sfx/';
  const MUSIC_DIR = 'assets/audio/music/';

  // Which sound plays when lives in js/audiocues.js now — the decisions are
  // pure over game state, so they ship to the engine ports and are pinned by a
  // vector, while this file keeps the WebAudio plumbing. Same objects, one copy.
  const CUES = GH.audiocues;
  const KIND_SFX = CUES.KIND_SFX, KIND_PRIORITY = CUES.KIND_PRIORITY;
  const textSfx = CUES.textSfx;

  function readCfg() {
    try { return JSON.parse(GH.store.get('guildhall_audio')) || {}; }
    catch (e) { return {}; }
  }
  // The music is mastered to streaming levels — measured -12.8 to -15.0 LUFS
  // integrated across the ten tracks, against -16 to -22 for the sound effects.
  // Music also plays CONTINUOUSLY where an effect is a transient, so equal gain
  // is not equal loudness: at the old 0.5 default it sat on top of everything
  // ("the music is very loud"). 0.3 is about -10 dB, putting it near -24 LUFS
  // effective — present, but under the game. A player who has already set a
  // level keeps it; this only moves the untouched default.
  const MUSIC_DEFAULT = 0.3;
  const SFX_DEFAULT = 0.8;
  const store = readCfg();
  const cfg = {
    muted: !!store.muted,
    music: store.music == null ? MUSIC_DEFAULT : store.music,
    sfx: store.sfx == null ? SFX_DEFAULT : store.sfx,
  };
  // Native eviction recovery lands async — re-read once the mirror restore
  // is done. On web `ready` is already resolved and this re-reads the same
  // values (ctx is still null, so applyVolumes is a no-op).
  GH.store.ready.then(() => {
    const s = readCfg();
    cfg.muted = !!s.muted;
    cfg.music = s.music == null ? MUSIC_DEFAULT : s.music;
    cfg.sfx = s.sfx == null ? SFX_DEFAULT : s.sfx;
    applyVolumes();
  });
  function saveCfg() { GH.store.set('guildhall_audio', JSON.stringify(cfg)); }

  let ctx = null, sfxGain = null, musicGain = null;
  const buffers = {};        // url → AudioBuffer | Promise
  let unlocked = false;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    sfxGain = ctx.createGain(); sfxGain.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.connect(ctx.destination);
    applyVolumes();
    return ctx;
  }
  function applyVolumes() {
    if (!ctx) return;
    sfxGain.gain.value = cfg.muted ? 0 : cfg.sfx;
    musicGain.gain.value = cfg.muted ? 0 : cfg.music;
  }

  function load(url) {
    if (buffers[url]) return Promise.resolve(buffers[url]);
    if (!ensureCtx()) return Promise.reject(new Error('no webaudio'));
    buffers[url] = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => { buffers[url] = buf; return buf; })
      .catch((e) => { delete buffers[url]; throw e; });
    return Promise.resolve(buffers[url]);
  }

  // --- SFX ------------------------------------------------------------
  let lastSfxAt = 0;
  function play(name, opts) {
    if (cfg.muted || !unlocked) return;
    const now = performance.now();
    if (name === 'tap' && now - lastSfxAt < 60) return;   // debounce click spam
    lastSfxAt = now;
    load(SFX_DIR + name + '.mp3').then((buf) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      let out = sfxGain;
      if (opts && opts.vol != null) {
        const g = ctx.createGain(); g.gain.value = opts.vol; g.connect(sfxGain); out = g;
      }
      src.connect(out); src.start();
    }).catch(() => {});
  }

  // --- Music ----------------------------------------------------------
  let curTrack = null, curSrc = null, curTrackGain = null;
  let stingUntil = 0;        // while a one-shot (victory) plays, don't switch

  function playMusic(track, loop) {
    if (curTrack === track || !unlocked) return;
    load(MUSIC_DIR + track + '.mp3').then((buf) => {
      if (curTrack === track) return;
      const t = ctx.currentTime;
      if (curSrc) {          // fade the old track out, then stop it
        const old = curSrc, oldGain = curTrackGain;
        oldGain.gain.setValueAtTime(oldGain.gain.value, t);
        oldGain.gain.linearRampToValueAtTime(0, t + 1.2);
        old.stop(t + 1.3);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = loop !== false;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 1.2);
      src.connect(g); g.connect(musicGain);
      src.start(t);
      curTrack = track; curSrc = src; curTrackGain = g;
      if (loop === false) {
        stingUntil = t + buf.duration;
        src.onended = () => { if (curSrc === src) { curTrack = null; curSrc = null; } };
      }
    }).catch(() => { MISSING[track] = true; pickMusic(); });
  }

  // The track decision is audiocues.musicFor; what stays here is reading the
  // two UI facts it needs and remembering that victory already played.
  const MISSING = {};
  let prevWon = false;
  function pickMusic() {
    if (!unlocked || !ctx || ctx.currentTime < stingUntil) return;
    const st = GH.sim && GH.sim.get && GH.sim.get();
    const titleEl = document.getElementById('title');
    const onTitle = titleEl && titleEl.innerHTML !== '' &&
      titleEl.style.display !== 'none' && titleEl.offsetParent !== null;
    const pick = CUES.musicFor(st, {
      onTitle, prevWon, missing: MISSING,
      hallOpen: document.body.classList.contains('hall-open'),
    });
    if (st) prevWon = !!st.won;
    playMusic(pick.track, pick.loop);
  }

  // --- Game-event hookup (log diff, no ui.js edits) ---------------------
  let prevFirst = null, primed = false;
  function onSimChange(st) {
    const logArr = st && st.log;
    if (Array.isArray(logArr)) {
      if (!primed) { primed = true; prevFirst = logArr[0] || null; }
      else if (logArr[0] !== prevFirst) {
        let idx = prevFirst ? logArr.indexOf(prevFirst) : logArr.length;
        if (idx < 0) idx = Math.min(logArr.length, 8);
        const fresh = logArr.slice(0, idx);
        prevFirst = logArr[0] || null;
        // Specific line matches first, then the kind default for any entry
        // that did not match one. Still capped at 2 so a busy day-end does
        // not turn into a cacophony.
        const picks = [];
        const add = (s) => { if (s && picks.indexOf(s) < 0) picks.push(s); };
        fresh.forEach((e) => add(textSfx(e)));
        KIND_PRIORITY.forEach((k) => {
          if (fresh.some((e) => e.kind === k && !textSfx(e))) add(KIND_SFX[k]);
        });
        picks.slice(0, 2).forEach((s, i) => setTimeout(() => play(s), i * 350));
      }
    }
    pickMusic();
  }

  // --- Unlock on first gesture (browser autoplay policy) ----------------
  function unlock() {
    if (unlocked) return;
    if (!ensureCtx()) return;
    ctx.resume().then(() => {
      unlocked = true;
      ['tap', 'confirm', 'coins', 'bell'].forEach((n) => load(SFX_DIR + n + '.mp3').catch(() => {}));
      pickMusic();
    });
  }
  document.addEventListener('pointerdown', unlock, { capture: true });

  // Delegated tap sound for every button-ish element.
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest &&
      e.target.closest('button, .menu-btn, [data-action]');
    if (el && !el.hasAttribute('data-nosfx')) play('tap');
  }, true);

  // --- Mute toggle (self-injected; fork can restyle/move it) ------------
  function injectToggle() {
    const css = document.createElement('style');
    // Top-RIGHT, under the HUD ribbon: the top-left corner belongs to the
    // hall's "← Map" context chip and the two were overlapping.
    css.textContent = '.gh-mute{position:fixed;right:8px;top:calc(var(--topbar-h, 60px) + 8px);' +
      'z-index:400;width:34px;height:34px;border-radius:50%;border:2px solid rgba(0,0,0,.35);' +
      'background:rgba(20,17,13,.55);color:#f3e6c8;font-size:16px;line-height:30px;text-align:center;' +
      'cursor:pointer;opacity:.75;user-select:none}.gh-mute:active{transform:scale(.92)}';
    document.head.appendChild(css);
    const b = document.createElement('div');
    b.className = 'gh-mute';
    b.setAttribute('data-nosfx', '1');
    b.textContent = cfg.muted ? '🔇' : '🔊';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      cfg.muted = !cfg.muted; saveCfg(); applyVolumes();
      b.textContent = cfg.muted ? '🔇' : '🔊';
      if (!cfg.muted) { unlock(); play('tap'); }
    });
    document.body.appendChild(b);
  }

  function init() {
    injectToggle();
    if (GH.sim && GH.sim.onChange) GH.sim.onChange(onSimChange);
    setInterval(pickMusic, 1500);   // catches title-screen show/hide (not sim-driven)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    play, playMusic, pickMusic,
    setMusicVol(v) { cfg.music = Math.max(0, Math.min(1, v)); saveCfg(); applyVolumes(); },
    setSfxVol(v) { cfg.sfx = Math.max(0, Math.min(1, v)); saveCfg(); applyVolumes(); },
    setMuted(m) { cfg.muted = !!m; saveCfg(); applyVolumes(); },
    muted: () => cfg.muted, config: () => ({ ...cfg }),
  };
})();
