/* Seasons — Era II's heartbeat. A 30-day cycle derived purely from state.day
 * (deterministic: no RNG, no save field), active only once the guild enters
 * the Marches (state.era >= 2) so Era I balance is untouched.
 *
 *   Sowing (8d) → High Sun (7d) → Harvest (8d) → Frost (7d)
 *
 * Effects are applied where the systems already live: contract generation
 * (travel days + bounty + tag bias), nightly rest, and flavor in the UI.
 */
window.GH = window.GH || {};

GH.seasons = (function () {
  const CYCLE = [
    { id: 'sowing', name: 'Sowing', glyph: '🌱', days: 8,
      blurb: 'Soft roads and green fields — the realm catches its breath.' },
    { id: 'highsun', name: 'High Sun', glyph: '☀', days: 7,
      blurb: 'Long days. The board turns over quickly.' },
    { id: 'harvest', name: 'Harvest', glyph: '🌾', days: 8,
      blurb: 'Caravans everywhere: escort work floods in, but purses run lighter (−15% pay).' },
    { id: 'frost', name: 'Frost', glyph: '❄', days: 7,
      blurb: 'Snowbound roads: every journey +1 day, desperate clients pay +20%.' },
  ];
  const LEN = CYCLE.reduce((s, c) => s + c.days, 0);   // 30

  function active(state) { return !!state && (state.era || 1) >= 2; }
  function at(day) {
    let d = ((day - 1) % LEN + LEN) % LEN;
    for (const s of CYCLE) { if (d < s.days) return s; d -= s.days; }
    return CYCLE[0];
  }
  function of(state) { return active(state) ? at(state.day) : null; }
  function chip(state) { const s = of(state); return s ? `${s.glyph} ${s.name}` : ''; }

  // Contract modifiers, applied at generation (no RNG here — seeded runs hold).
  function modifyJob(state, job) {
    const s = of(state);
    if (!s || job.isBoss) return job;
    if (s.id === 'frost') { job.days += 1; job.bounty = Math.round(job.bounty * 1.2); }
    else if (s.id === 'harvest') { job.bounty = Math.round(job.bounty * 0.85); }
    return job;
  }
  // Frost makes the dormitory colder: nightly rest routine restores less.
  function restPenalty(state) { const s = of(state); return s && s.id === 'frost' ? 5 : 0; }

  return { CYCLE, LEN, active, at, of, chip, modifyJob, restPenalty };
})();
