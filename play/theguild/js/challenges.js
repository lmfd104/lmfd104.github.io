/* Challenges mode: preset scenarios with constraints and win conditions.
 * sim.status() defers to evaluate() when state.mode === 'challenge'.
 */
window.GH = window.GH || {};

GH.challenges = (function () {
  const LIST = [
    {
      id: 'rookie', name: 'Rookie Rush', difficulty: 'Easy',
      desc: 'A small hall, a tight clock. Build a name fast.',
      roster: 3, gold: 100,
      goal: { type: 'rep', target: 15, byDay: 12 },
      goalText: 'Reach 15 reputation by day 12.',
    },
    {
      id: 'shoestring', name: 'Shoestring Budget', difficulty: 'Hard',
      desc: 'Fifty gold and a prayer. Every coin counts.',
      roster: 4, gold: 50,
      goal: { type: 'rep', target: 10, byDay: 14 },
      goalText: 'Reach 10 reputation by day 14, starting with only 50 gold.',
    },
    {
      id: 'giant', name: 'Giant Slayer', difficulty: 'Medium',
      desc: 'Two regions, two bosses, one deadline.',
      roster: 4, gold: 150,
      goal: { type: 'bosses', zones: ['greenfields', 'ashwood'], byDay: 18 },
      goalText: 'Defeat the Greenfields and Ashwood bosses by day 18.',
    },
    {
      id: 'lonewolf', name: 'Lone Wolf', difficulty: 'Hard',
      desc: 'Just two adventurers against the frontier.',
      roster: 2, gold: 150,
      goal: { type: 'rep', target: 12, byDay: 16 },
      goalText: 'Reach 12 reputation by day 16 with a roster of just 2.',
    },
    {
      id: 'endurance', name: 'Endurance', difficulty: 'Medium',
      desc: 'No grand goal — just keep the doors open.',
      roster: 4, gold: 120,
      goal: { type: 'survive', days: 20 },
      goalText: 'Keep the hall alive to day 20 without collapse.',
    },
  ];

  // Weekly Trial — one seeded scenario per ISO week, identical for every
  // guildmaster in the realm. Compare notes; brag accordingly.
  //
  // The clock read and the scenario derivation are deliberately SEPARATE. The
  // derivation is pure — (year, week) in, scenario out — so it can be pinned by
  // a test and replayed by another engine; only isoWeekOf() touches the wall
  // clock, and nothing can pin that.
  function isoWeekOf(now) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));           // ISO week anchor (Thursday)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return { year: d.getUTCFullYear(), week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7) };
  }

  function weeklyFor(year, week) {
    const rng = GH.rng.seeded(year * 100 + week);
    const roster = 2 + rng.int(3);
    const gold = 60 + rng.int(5) * 20;
    let goal, goalText;
    const kind = rng.pick(['rep', 'survive', 'bosses']);
    if (kind === 'rep') {
      const target = 10 + rng.int(8), byDay = 12 + rng.int(6);
      goal = { type: 'rep', target, byDay };
      goalText = `Reach ${target} reputation by day ${byDay}.`;
    } else if (kind === 'survive') {
      const days = 15 + rng.int(10);
      goal = { type: 'survive', days };
      goalText = `Keep the hall alive to day ${days}.`;
    } else {
      const byDay = 16 + rng.int(6);
      goal = { type: 'bosses', zones: ['greenfields', 'ashwood'], byDay };
      goalText = `Defeat the Greenfields and Ashwood bosses by day ${byDay}.`;
    }
    return {
      id: 'weekly', name: `Weekly Trial — Week ${week}`, difficulty: 'Rotates weekly',
      desc: `This week's realm-wide trial: ${roster} adventurers, ${gold}g. Every guildmaster gets the same start.`,
      roster, gold, goal, goalText,
    };
  }

  const PRESETS = LIST.slice();          // the fixed five, before this week's trial
  const NOW = isoWeekOf(new Date());
  LIST.push(weeklyFor(NOW.year, NOW.week));

  const BY_ID = Object.fromEntries(LIST.map((c) => [c.id, c]));

  function evaluate(state) {
    const c = state.challenge; if (!c) return { over: false };
    const g = c.goal;
    let won = false;
    if (g.type === 'rep') won = state.reputation >= g.target;
    else if (g.type === 'gold') won = state.gold >= g.target;
    else if (g.type === 'bosses') won = g.zones.every((z) => state.bossDone[z]);
    else if (g.type === 'survive') won = state.day >= g.days;
    if (won) return { over: true, won: true, msg: `Challenge complete — ${c.name}!` };

    if (state.roster.length === 0) return { over: true, won: false, msg: 'Your roster is gone. Challenge failed.' };
    if (state.gold <= -50) return { over: true, won: false, msg: 'Bankrupt. Challenge failed.' };
    if (g.byDay && state.day > g.byDay) return { over: true, won: false, msg: `Out of time — ${c.name} failed.` };
    return { over: false };
  }

  // Human-readable progress toward the goal.
  function progress(state) {
    const c = state.challenge; if (!c) return '';
    const g = c.goal;
    const dayPart = g.byDay ? ` · day ${state.day}/${g.byDay}` : (g.days ? ` · day ${state.day}/${g.days}` : '');
    if (g.type === 'rep') return `Reputation ${state.reputation}/${g.target}${dayPart}`;
    if (g.type === 'gold') return `Gold ${state.gold}/${g.target}${dayPart}`;
    if (g.type === 'bosses') { const done = g.zones.filter((z) => state.bossDone[z]).length; return `Bosses ${done}/${g.zones.length}${dayPart}`; }
    if (g.type === 'survive') return `Surviving — day ${state.day}/${g.days}`;
    return '';
  }

  return { LIST, PRESETS, BY_ID, isoWeekOf, weeklyFor, evaluate, progress };
})();
