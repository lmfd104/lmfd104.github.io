/* Rook Vane's Company — the rival guild (Era II). Not a villain in the log:
 * a competitor on the board. His crews BID on rich open contracts (red chip,
 * the job leaves the board a day early); anything they take feeds their
 * standing and their grip ("pressure") on that region. Pressure ≥60 means
 * they hold sway there — clients hedge and pay you less — and you push them
 * back the honest way: by working the region.
 *
 * Everything gates on state.era >= 2 and rolls no RNG before that gate, so
 * Era-I seeded runs stay byte-identical. Save state: state.rival =
 * { rep, holdings: { zoneId: 0-100 } } (migrated, lazily guarded).
 */
window.GH = window.GH || {};

GH.rival = (function () {
  const R = GH.rng, D = GH.data;

  const SWAY = 60;   // pressure at which a region counts as contested

  function active(state) { return !!state && (state.era || 1) >= 2; }
  function ensure(state) { if (!state.rival) state.rival = { rep: 0, holdings: {} }; return state.rival; }
  function pressure(state, zoneId) { return (state.rival && state.rival.holdings && state.rival.holdings[zoneId]) || 0; }
  function contested(state, zoneId) { return active(state) && pressure(state, zoneId) >= SWAY; }
  function maxPressure(state) {
    const h = (state.rival && state.rival.holdings) || {};
    return Object.values(h).reduce((m, v) => Math.max(m, v), 0);
  }

  // Nightly: crews notice rich open work. A bid job loses a day on the spot —
  // Vane moves fast — and the board card carries his red chip from then on.
  function tick(state, events) {
    if (!active(state)) return;
    const rv = ensure(state);
    state.board.forEach((j) => {
      if (j.isBoss || j.status !== 'open' || j.boardDays == null || j.rivalBid) return;
      if (!state.zonesUnlocked.includes(j.zoneId)) return;
      if (j.boardDays < 2) return;   // too late to matter
      const chance = Math.min(0.35,
        0.10 + (j.bounty >= 100 ? 0.15 : j.bounty >= 60 ? 0.08 : 0) + Math.min(0.10, rv.rep * 0.005));
      if (R.chance(chance)) {
        j.rivalBid = state.day;
        j.boardDays -= 1;
        events.push(`⚔ Vane's crew is bidding on "${j.title}" — it won't wait for you.`);
      }
    });
  }

  // A BID contract aged off the board: Vane takes it (called from tickBoard).
  function claim(state, j, events) {
    const rv = ensure(state);
    rv.rep += 1;
    const gain = 8 + R.int(8);
    rv.holdings[j.zoneId] = Math.min(100, (rv.holdings[j.zoneId] || 0) + gain);
    state.reputation = Math.max(0, state.reputation - 1);
    const zone = D.ZONE_BY_ID[j.zoneId];
    const sway = rv.holdings[j.zoneId] >= SWAY;
    events.push(`🏴 Vane's company took "${j.title}" out from under you${sway ? ` — they hold sway in ${zone ? zone.name : j.zoneId} now` : ''}. (−1 rep)`);
  }

  // Working a region is how you push the company back out of it.
  // Returns a chronicle line when your work breaks their sway.
  function onContractDone(state, zoneId, outcome) {
    if (!active(state) || !state.rival) return null;
    const cur = state.rival.holdings[zoneId] || 0;
    if (!cur) return null;
    const drop = outcome === 'triumph' ? 20 : outcome === 'success' ? 15 : outcome === 'partial' ? 8 : 0;
    if (!drop) return null;
    state.rival.holdings[zoneId] = Math.max(0, cur - drop);
    if (cur >= SWAY && state.rival.holdings[zoneId] < SWAY) {
      const zone = D.ZONE_BY_ID[zoneId];
      return `⚑ Your banner outbids Vane's in ${zone ? zone.name : zoneId} — the company pulls back.`;
    }
    return null;
  }

  // Clients hedge while Vane holds sway: new contracts there pay less.
  function modifyJob(state, job) {
    if (!job.isBoss && contested(state, job.zoneId)) job.bounty = Math.round(job.bounty * 0.9);
    return job;
  }

  return { SWAY, active, pressure, contested, maxPressure, tick, claim, onContractDone, modifyJob };
})();
