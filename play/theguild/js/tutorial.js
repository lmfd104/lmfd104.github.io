/* First-run tutorial — a guided tour with real choices, riding the player's
 * actual actions (not a slideshow). Skippable at every step.
 * state.tutorial = { step, done } — campaign only, persisted with the save.
 */
window.GH = window.GH || {};

GH.tutorial = (function () {
  // Each step: text (+speaker), what advances it, optional highlight target.
  //
  // The tour teaches the game that shipped, in the order you actually play it:
  // meet the people, give one of them a day, then find work, send them, end the
  // day, and see where the guild grows. Two things it deliberately does NOT do
  // any more:
  //   - It no longer opens on the Board. "There is nobody to talk to" was the
  //     round-5 complaint, and it was structural: the tour said "meet your
  //     people" AFTER dispatching them, so the hall it pointed at was empty.
  //     Meeting comes first now, on day one, when everyone is demonstrably home.
  //   - It no longer explains a "Daily Routine" dropdown. That control does not
  //     exist — a day is a MORNING and an AFTERNOON you assign — so the step
  //     highlighted nothing and described a screen the player could never find.
  const STEPS = [
    { id: 'welcome',
      text: "Welcome, Guildmaster. This hall, these people, that board — all yours. Shall I walk you through it? It won't take long.",
      buttons: [['tut-next', 'Show me around'], ['tut-skip', 'I know guilds']] },
    { id: 'meet',
      // Day one, before anyone is dispatched: the hall is full by construction.
      // The fallback still exists for a player who ran ahead of the script.
      text: (g) => {
        const home = (g.roster || []).some((a) => a.status !== 'away' && a.status !== 'hunting');
        return home
          ? 'Start with the people. Tap one of them down in the hall and talk — bonds pay better than gold, and they will tell you what they want.'
          : 'Everyone is out earning your coin already. Open ⚑ People, tap any name, and Talk: bonds pay better than gold, even by letter.';
      },
      advanceOn: ['talked'],
      highlight: () => {
        const g = GH.sim.get();
        const home = g && (g.roster || []).some((a) => a.status !== 'away' && a.status !== 'hunting');
        if (!home) return '[data-nav="teams"]';
        // The hall IS home, so a player standing in it needs no button pointed
        // at — highlighting the tab they are already on reads as a bug.
        return document.body.classList.contains('hall-open') ? '' : '[data-nav="hall"], [data-action="open-hall"]';
      },
      buttons: [['tut-skip', 'Skip tour']] },
    { id: 'plan',
      text: "Nobody works a whole day and a night. Each of them has a MORNING and an AFTERNOON — rest, drill, a craft, or time in the hall. Open their Day and give one half an order.",
      advanceOn: ['slot-set'], highlight: '[data-action="slot-pick"], [data-action="slot-set"]',
      // If they closed the sheet, point them back at the roster rather than
      // glowing nothing at all.
      fallback: '[data-nav="teams"]',
      buttons: [['tut-skip', 'Skip tour']] },
    { id: 'work',
      text: 'Now the work. ⚔ Work is the contract board — every region, every job, and what it pays.',
      advanceOn: ['board-open'], highlight: '[data-nav="board"]',
      buttons: [['tut-skip', 'Skip tour']] },
    { id: 'choose',
      text: 'I flagged two for your first job. Steady coin… or a bolder purse. Your call, Guildmaster.',
      choice: true,
      buttons: [['tut-skip', 'Skip tour']] },
    { id: 'dispatch',
      text: 'Pick who goes — watch their skill numbers and the odds line. Then send them out.',
      advanceOn: ['dispatched'], highlight: '[data-action="auto-dispatch"], [data-action="dispatch-go"]',
      fallback: '[data-nav="board"]',
      buttons: [['tut-skip', 'Skip tour']] },
    { id: 'endday',
      text: 'Expeditions resolve overnight, and so does everything you assigned. When the orders are given, End the Day.',
      advanceOn: ['day-ended'], highlight: '.endday-bar, #navbar [data-action="end-day"], #topbar [data-action="end-day"]',
      buttons: [['tut-skip', 'Skip tour']] },
    { id: 'grow',
      text: 'One last thing. The yard and the forge out there are boarded plots, not rooms — 🔨 Build is where you raise them, and ⚑ People is where you hire. A bigger hall is a bigger banner.',
      advanceOn: ['build-open'], highlight: '[data-nav="guild"]',
      buttons: [['tut-skip', 'Skip tour']] },
    { id: 'finish',
      text: "That's the trade: contracts in, heroes out, legend up. Watch the Map for OUTBREAKS — those need a full team, fast. Here's 50 gold for the road. Make this banner mean something.",
      buttons: [['tut-done', 'Begin ⚑']] },
  ];

  function begin(state) {
    if (state.mode !== 'campaign') { state.tutorial = { step: 0, done: true }; return; }
    state.tutorial = { step: 0, done: false };
  }
  // !! so a predicate returns a BOOLEAN. The bare && chain returned `undefined`
  // for a save with no tutorial block, which is falsy and so behaved correctly
  // everywhere it was tested — but it is not false, it vanishes from
  // JSON.stringify, and `active(s) === false` reads as a bug that is not there.
  function active(state) { return !!(state && state.tutorial && !state.tutorial.done); }
  function current(state) { return active(state) ? STEPS[state.tutorial.step] : null; }

  // The two curated first contracts (safe vs bold) from the starting region.
  function firstChoices(state) {
    const jobs = state.board.filter((j) => !j.isBoss && j.status === 'open' && j.zoneId === 'greenfields');
    if (jobs.length < 2) return null;
    const byDc = jobs.slice().sort((a, b) => a.dc - b.dc || a.bounty - b.bounty);
    const safe = byDc[0];
    const bold = jobs.slice().sort((a, b) => b.bounty - a.bounty)[0];
    return { safe, bold: bold.id === safe.id ? byDc[byDc.length - 1] : bold };
  }

  // Advance when the right action happens. Returns true if the step moved.
  // Real play is allowed to run ahead of the script: a player who ignores the
  // card and does the thing anyway must never strand the tour on a stale step.
  const idx = (id) => STEPS.findIndex((s) => s.id === id);
  function notify(state, event) {
    const step = current(state);
    if (!step) return false;
    if (step.advanceOn && step.advanceOn.includes(event)) { state.tutorial.step += 1; return true; }
    // Off-script jumps. A player who ignores the card and does the thing anyway
    // must never strand the tour on a step they have already blown past — so
    // every jump moves FORWARD to the first step that is still ahead of them.
    const ahead = (id) => { if (state.tutorial.step < idx(id)) { state.tutorial.step = idx(id); return true; } return false; };
    if (event === 'talked') return ahead('plan');
    if (event === 'slot-set') return ahead('work');
    if (event === 'board-open') return ahead('choose');
    if (event === 'dispatched') return ahead('endday');
    if (event === 'day-ended') return ahead('grow');
    if (event === 'build-open') return ahead('finish');
    return false;
  }
  function next(state) { if (active(state)) state.tutorial.step += 1; }
  function skip(state) { if (state.tutorial) state.tutorial.done = true; }
  function finish(state) {
    if (!state.tutorial || state.tutorial.done) return;
    state.tutorial.done = true;
    state.gold += 50;
    state.log.unshift({ text: "Seraphine's road stipend: +50g. The tour is over — the guild is yours.", kind: 'recruit', day: state.day });
  }

  // The card PROSE, exported for the engine ports. Most steps carry one
  // string; 'meet' has two variants because its text depends on whether anyone
  // is home. The highlight selectors stay behind — they are DOM selectors and
  // mean nothing outside this renderer.
  const TEXTS = STEPS.map((s) => ({
    id: s.id,
    text: typeof s.text === 'function' ? null : s.text,
    variants: s.id === 'meet' ? {
      home: s.text({ roster: [{ status: 'idle' }] }),
      away: s.text({ roster: [{ status: 'away' }] }),
    } : null,
    buttons: (s.buttons || []).map(([a, l]) => ({ action: a, label: l })),
  }));

  return { STEPS, TEXTS, begin, active, current, firstChoices, notify, next, skip, finish };
})();
