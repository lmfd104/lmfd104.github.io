/* Which sound plays when — split out of js/audio.js so it is not welded to
 * WebAudio.
 *
 * audio.js keeps the ENGINE: contexts, buffers, gapless loops, volume config.
 * This file keeps the DECISIONS: which track fits the moment, which effect a
 * log line deserves. The decisions are pure over the game state (plus two UI
 * flags passed in), so guild_data.json can ship the tables and a parity vector
 * can pin the choices — otherwise each engine re-derives "what does a
 * permadeath sound like" by reading this file and hoping.
 *
 * TEXT_SFX patterns ship as regex SOURCE strings. The subset used (character
 * alternation, \\b, ^, |) behaves identically in JS, .NET and PCRE2 (Godot).
 */
window.GH = window.GH || {};

GH.audiocues = (function () {
  // log kind → sfx name (first match per emit wins; 'event' stays silent)
  const KIND_SFX = {
    level: 'jingle_level', win: 'jingle_win', loss: 'jingle_lose',
    crisis: 'breach_horn', recruit: 'tavern_door', turn: 'bell', recover: 'confirm',
  };
  const KIND_PRIORITY = ['level', 'win', 'loss', 'crisis', 'recruit', 'turn', 'recover'];

  // Moments that deserve their own voice, matched on the log line itself and
  // checked BEFORE KIND_SFX — a permadeath should not get the chirpy loss
  // jingle, and a boss falling should not sound like a delivered parcel.
  // Also the only way to voice 'event' lines, which stay silent by default.
  const TEXT_SFX = [
    ['☠|\\bfell during\\b', 'death_knell'],
    ['\\bis slain\\b', 'boss_roar'],
    ['\\bpromoted\\b', 'promote_shimmer'],
    ['tied their ribbon|opened up to you', 'heart_bond'],
    ['\\bForged\\b', 'anvil_forge'],
    ['signs the charter', 'quill_sign'],
    ['Guild Charter opens|answers the new charter', 'charter_unlock'],
    ['party sets out|team marches', 'party_depart'],
    ['Weekly upkeep paid', 'coin_purse'],
    ['^(Built|Upgraded) the ', 'build_raise'],
    ['undimmed ember-glass in the hall lamps', 'charter_unlock'],
  ];
  const TEXT_RES = TEXT_SFX.map(([src, sfx]) => [new RegExp(src), sfx]);

  function textSfx(e) {
    const hit = TEXT_RES.find(([re]) => re.test((e && e.text) || ''));
    return hit ? hit[1] : null;
  }

  // Scenario tracks degrade gracefully: if a file is missing, fall back.
  const MUSIC_FALLBACK = {
    hall: 'day', festival: 'day', grief: 'day', boss: 'danger',
    danger: 'day', marches: 'day', rift: 'danger',
  };

  /* The track that fits the moment. Pure: the two UI facts it needs (is the
   * title screen showing, is the hall view open) come in as flags, and the
   * missing-file memory comes in as a set, so the same call gives the same
   * answer in every engine.
   *
   * `prevWon` is the caller's memory that victory already played — the sting
   * fires once on the transition, not every tick of a won game.
   */
  function musicFor(st, opts) {
    const o = opts || {};
    if (!st || o.onTitle) return { track: 'title', loop: true };
    if (st.won && !o.prevWon && st.mode === 'campaign') {
      return { track: 'victory', loop: false };
    }
    let want;
    if (st.roster && st.roster.some((a) => (a.grieving || 0) > 0)) want = 'grief';
    else if ((st.outbreaks && st.outbreaks.length > 0) || (st.endless && st.endless.wave >= 3)) want = 'danger';
    else if ((st.expeditions || []).some((e) => e.job && e.job.isBoss)) want = 'boss';
    else if (st.day >= 5 && st.day % 10 === 0) want = 'festival';
    else if (o.hallOpen) want = 'hall';
    else want = 'day';
    // Era themes color the calm hours: the Marches get wind, the Rift dread.
    if (want === 'day' || want === 'hall') {
      if ((st.era || 1) >= 3) want = 'rift';
      else if ((st.era || 1) === 2) want = 'marches';
    }
    const missing = o.missing || {};
    while (missing[want] && MUSIC_FALLBACK[want]) want = MUSIC_FALLBACK[want];
    return { track: want, loop: true };
  }

  /* The effects a batch of fresh log lines deserves: specific line matches
   * first, then the kind default for any entry that did not match one, capped
   * at `cap` so a busy day-end does not become a drum roll. Mirrors the loop
   * audio.js runs on sim change; returns the names, engine-agnostic.
   */
  function sfxForLog(entries, cap) {
    const max = cap != null ? cap : 2;
    // VERBATIM from audio.js's onSimChange loop, including the dedup — two
    // deaths in one batch play ONE knell, and the cap applies after the kind
    // pass, not during the text pass. A first draft here "simplified" both away
    // and would have pinned different behaviour than the app ships.
    const picks = [];
    const add = (s) => { if (s && picks.indexOf(s) < 0) picks.push(s); };
    entries.forEach((e) => add(textSfx(e)));
    KIND_PRIORITY.forEach((k) => {
      if (entries.some((e) => e && e.kind === k && !textSfx(e))) add(KIND_SFX[k]);
    });
    return picks.slice(0, max);
  }

  return { KIND_SFX, KIND_PRIORITY, TEXT_SFX, MUSIC_FALLBACK, textSfx, musicFor, sfxForLog };
})();
