/* Teams: persistent named squads with shared history.
 * Synergy grows with missions fought together and buffs their rolls.
 * Deaths are permanent — memorials, grief, and broken synergy make
 * losing a teammate genuinely painful.
 */
window.GH = window.GH || {};

GH.teams = (function () {
  const R = GH.rng;
  let _id = 0;
  const uid = () => 'team_' + (++_id) + '_' + R.int(99999);

  const NAME_A = ['Iron', 'Ember', 'Grey', 'Storm', 'Oath', 'Dawn', 'Thorn', 'Wolf', 'Ash', 'Gold'];
  const NAME_B = ['Wardens', 'Blades', 'Company', 'Vipers', 'Shields', 'Ravens', 'Lanterns', 'Fangs', 'Banner', 'Pact'];
  const MOTTOS = [
    'First in, last out.', 'No one left behind.', 'Coin and glory.', 'We hold the line.',
    'Quiet feet, quick hands.', 'For the fallen.', 'Luck favors the bold.', 'Home by winter.',
  ];
  const COLORS = ['#a23a2e', '#5c7a93', '#6f8f4e', '#8a6aa3', '#c0a04a', '#5c5c6e'];

  function suggestName() { return R.pick(NAME_A) + ' ' + R.pick(NAME_B); }

  function create(state, name, memberIds) {
    const team = {
      id: uid(),
      name: name || suggestName(),
      motto: R.pick(MOTTOS),
      color: COLORS[(state.teams || []).length % COLORS.length],
      memberIds: memberIds.slice(0, 4),
      founded: state.day,
      missions: 0, wins: 0, losses: 0,
      synergy: 0,                    // grows with missions together
      fallen: [],                    // memorial: {name, class, day, mission}
      history: [{ day: state.day, text: 'The banner is raised.' }],
    };
    state.teams = state.teams || [];
    state.teams.push(team);
    return team;
  }

  function disband(state, teamId) {
    state.teams = (state.teams || []).filter((t) => t.id !== teamId);
  }

  function byId(state, id) { return (state.teams || []).find((t) => t.id === id); }
  function teamOf(state, advId) { return (state.teams || []).find((t) => t.memberIds.includes(advId)); }

  function members(state, team) {
    return team.memberIds.map((id) => state.roster.find((a) => a.id === id)).filter(Boolean);
  }
  function readiness(state, team) {
    const ms = members(state, team);
    const ready = ms.filter((a) => a.status === 'idle');
    return { total: ms.length, ready: ready.length, allReady: ms.length > 0 && ready.length === ms.length };
  }

  // Flat roll bonus for dispatching a full team together.
  function synergyBonus(team) { return Math.min(3, Math.floor(team.synergy / 4)); }

  // Team pace: the slowest member sets it. Swift teams reach distant
  // breaches that slow ones simply can't.
  function speed(state, team) {
    const ms = members(state, team);
    if (!ms.length) return { tier: 'slow', icon: '🐢', label: 'Slow' };
    const minLvl = Math.min(...ms.map((a) => a.level || 1));
    const burdened = ms.some((a) => a.status === 'injured');
    if (!burdened && minLvl >= 3) return { tier: 'swift', icon: '🐎', label: 'Swift' };
    if (!burdened && minLvl >= 2) return { tier: 'steady', icon: '👢', label: 'Steady' };
    return { tier: 'slow', icon: '🐢', label: 'Slow' };
  }
  // Days on the road to a zone of this tier (0 = strike tonight).
  function travelDays(state, team, zoneTier) {
    const t = speed(state, team).tier;
    const base = zoneTier <= 2 ? 0 : zoneTier <= 4 ? 1 : 2;
    if (t === 'swift') return Math.max(0, base - 1);
    if (t === 'slow') return base + (zoneTier >= 3 ? 1 : 0);
    return base;
  }

  // Self-form: cluster the largest friend-group among unteamed idle adventurers.
  function selfForm(state) {
    const unteamed = state.roster.filter((a) => (a.status === 'idle' || a.status === 'injured') && !teamOf(state, a.id));
    if (unteamed.length < 2) return null;
    // score each pair by bond; greedily grow from the strongest pair
    let best = null;
    for (let i = 0; i < unteamed.length; i++) {
      for (let j = i + 1; j < unteamed.length; j++) {
        const s = GH.social.bondOf(unteamed[i], unteamed[j]);
        if (!best || s > best.s) best = { a: unteamed[i], b: unteamed[j], s };
      }
    }
    if (!best) return null;
    const group = [best.a, best.b];
    // add up to 2 more with the highest average bond to the group
    const rest = unteamed.filter((x) => x !== best.a && x !== best.b)
      .map((x) => ({ x, avg: group.reduce((s, g) => s + GH.social.bondOf(x, g), 0) / group.length }))
      .sort((p, q) => q.avg - p.avg);
    rest.slice(0, 2).forEach((p) => { if (p.avg > -10) group.push(p.x); });
    const team = create(state, null, group.map((a) => a.id));
    team.history.push({ day: state.day, text: 'They chose each other — the roster made this one on its own.' });
    return team;
  }

  // --- Mission bookkeeping -------------------------------------------------
  function recordMission(state, team, res) {
    team.missions += 1;
    const won = res.outcome === 'success' || res.outcome === 'triumph';
    if (won) { team.wins += 1; team.synergy += 2; }
    else { team.losses += 1; team.synergy += 1; }
    team.history.unshift({ day: state.day, text: `${won ? '✔' : '✘'} ${res.title} — ${res.outcome}.` });
    if (team.history.length > 20) team.history.pop();
  }

  // A member has died. Grief: memorial, synergy collapse, morale wounds.
  function mourn(state, team, dead, missionTitle) {
    team.memberIds = team.memberIds.filter((id) => id !== dead.id);
    team.fallen.push({ name: dead.name, class: dead.class, day: state.day, mission: missionTitle });
    team.synergy = Math.floor(team.synergy / 2);
    team.history.unshift({ day: state.day, text: `☠ ${dead.name} fell — ${missionTitle}. The banner hangs at half-mast.` });
    members(state, team).forEach((a) => {
      a.happy = Math.max(0, a.happy - 25);
      a.loyalty = Math.max(0, a.loyalty - 10);
      a.grieving = Math.max(a.grieving || 0, 3);           // they wear the loss for days
      const s = GH.social.bondOf(a, dead);
      if (s >= GH.social.FRIEND) { a.happy = Math.max(0, a.happy - 10); a.grieving = 5; }
    });
  }

  return {
    create, disband, byId, teamOf, members, readiness, synergyBonus, speed, travelDays,
    selfForm, recordMission, mourn, suggestName,
    // Exported so migration/parity/export_data.mjs can ship them to the engine
    // ports as DATA rather than have them hand-copied into two languages.
    NAME_A, NAME_B, MOTTOS, COLORS,
  };
})();
