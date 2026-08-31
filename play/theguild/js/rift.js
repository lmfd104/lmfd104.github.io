/* The Rift — Era III's invasion finale. The Hollow Choir's song wakes what
 * sleeps under the ash: five RIFT GATES open in surges, each a full-team
 * assault (existing outbreak machinery — gates ARE outbreaks with isGate),
 * but a gate demands a DRILLED team: full roster ready AND synergy >= 2.
 * Three gates left unanswered and the realm is overrun. Close the fifth —
 * the Sleeper's gate — and the campaign ends in a final graded victory,
 * where the party's sworn bonds, vows, and scars weigh on the last rolls.
 *
 * Gates on state.era >= 3; no RNG before the gate, so earlier eras' seeded
 * runs stay byte-identical. Save state: state.rift =
 * { stage (gates CLOSED), gatesMissed, nextSurge, won } (lazily guarded).
 */
window.GH = window.GH || {};

GH.rift = (function () {
  const R = GH.rng, D = GH.data;

  const STAGES = 5;
  const MISS_LIMIT = 3;
  const GATE_FLAVOR = [
    'the first seal splits',
    'the Choir sings through it',
    'the sky above it runs like wax',
    'the Herald walks its threshold',
    'THE SLEEPER STIRS beneath',
  ];

  function active(state) { return !!state && (state.era || 1) >= 3 && state.rift && !state.rift.won; }
  function ensure(state) {
    if (!state.rift) state.rift = { stage: 0, gatesMissed: 0, nextSurge: (state.day || 1) + 3, won: false };
    return state.rift;
  }
  function liveGate(state) { return (state.outbreaks || []).find((o) => o.isGate); }

  // Nightly (after tickOutbreaks): when the field is quiet and the surge day
  // arrives, the rift answers — ambient outbreaks plus the next gate.
  function tick(state, events) {
    if (!active(state)) return;
    const rf = ensure(state);
    if (liveGate(state)) return;
    if (state.day < rf.nextSurge || rf.stage >= STAGES) return;
    const extras = rf.stage >= 3 ? 2 : 1;
    for (let i = 0; i < extras; i++) {
      if ((state.outbreaks || []).length < 4) GH.sim.spawnOutbreak();
    }
    spawnGate(state, rf.stage + 1, events);
  }

  function spawnGate(state, stage, events) {
    // Gates favor the deep east: the highest-tier regions you hold.
    const open = state.zonesUnlocked.slice()
      .sort((a, b) => (D.ZONE_BY_ID[b].tier || 0) - (D.ZONE_BY_ID[a].tier || 0)).slice(0, 3);
    const zid = R.pick(open);
    const zone = D.ZONE_BY_ID[zid];
    const finale = stage === STAGES;
    const gate = {
      id: 'gate_' + state.day + '_' + R.int(99999),
      isOutbreak: true, isGate: true, gateStage: stage,
      zoneId: zid, zoneName: zone.name,
      title: finale ? `THE LAST GATE: ${GATE_FLAVOR[4]} ${zone.name}`
                    : `RIFT GATE ${stage}/${STAGES}: ${GATE_FLAVOR[stage - 1]} in ${zone.name.replace(/^The /, '')}`,
      tag: 'arcane', skill: 'arcana', rank: 'S',
      dc: 23 + stage + (finale ? 1 : 0), stages: finale ? 4 : 3,
      bounty: 300 + 120 * stage, xp: 220 + 80 * stage,
      days: 1, daysLeft: 4, status: 'open',
    };
    state.outbreaks.push(gate);
    events.push(`⛧ ${gate.title} — a drilled team must close it within ${gate.daysLeft} days.`);
    return gate;
  }

  // A gate aged out unanswered (called from tickOutbreaks' expiry branch).
  function onGateMissed(state, gate, events) {
    const rf = ensure(state);
    rf.gatesMissed += 1;
    rf.nextSurge = state.day + 3;   // the same seal splits again, soon
    state.reputation = Math.max(0, state.reputation - 4);
    const sacked = Math.min(state.gold, 40 + 15 * gate.gateStage);
    state.gold -= sacked;
    events.push(`⛧ The gate in ${gate.zoneName} stood unanswered (${rf.gatesMissed}/${MISS_LIMIT}) — the rift spreads. −4 rep, −${sacked}g.`);
  }

  // A gate assault succeeded (called from settleExpedition's contained branch).
  function onGateClosed(state, gate) {
    const rf = ensure(state);
    rf.stage = Math.max(rf.stage, gate.gateStage);
    rf.nextSurge = state.day + 8 + R.int(3);
    if (gate.gateStage >= STAGES) rf.won = true;
    return rf.won;
  }

  // The finale is where the campaign's PEOPLE weigh in: sworn bonds, vows,
  // promises, and old scars steady the last rolls (flat bonus, capped).
  function legendBonus(state, gate, party) {
    if (!gate.isGate || gate.gateStage < STAGES) return 0;
    let b = 0;
    party.forEach((a) => {
      if (a.sworn || a.promised) b += 1;
      if ((a.vowDays || 0) > 0) b += 1;
    });
    if (party.filter((a) => (a.scars || []).length > 0).length >= 2) b += 1;
    return Math.min(4, b);
  }

  return { STAGES, MISS_LIMIT, active, ensure, liveGate, tick, spawnGate, onGateMissed, onGateClosed, legendBonus };
})();
