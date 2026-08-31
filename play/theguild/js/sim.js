/* Central simulation: state, economy ledger, day cycle, needs, actions, save/load. */
window.GH = window.GH || {};

GH.sim = (function () {
  const D = GH.data, R = GH.rng, PF = GH.pf, K = GH.contracts;
  const SAVE = 'guildhall_save_v1';
  const BEDS = 6;            // dormitory capacity
  const YOUR_CUT = 0.5;      // guild keeps this share of each payout
  const TRAIN_COST = 25;
  const RECRUIT_COST = 40;
  const RENT = 40;

  let state = null;
  const listeners = [];
  const onChange = (fn) => listeners.push(fn);
  const emit = () => { listeners.forEach((f) => f(state)); persist(); };
  const get = () => state;

  function log(text, kind = 'event') {
    state.log.unshift({ text, kind, day: state.day });
    if (state.log.length > 150) state.log.pop();
  }

  // --- New game -----------------------------------------------------------
  // opts: { mode:'campaign'|'sandbox'|'challenge', challenge:{...} }
  function newGame(name, opts = {}) {
    const mode = opts.mode || 'campaign';
    state = {
      guildName: name || 'The Stamped Scroll',
      mode,
      difficulty: D.DIFFICULTIES[opts.difficulty] ? opts.difficulty : D.DEFAULT_DIFFICULTY,
      day: 1, gold: 150, reputation: 0,
      roster: [], board: [], log: [],
      beds: BEDS,
      zonesUnlocked: ['greenfields'], bossDone: {}, selectedZone: 'greenfields',
      inventory: GH.items.emptyInventory(),
      expeditions: [],
      // The starting guild is SMALL: a kitchen, the great hall, a board and a
      // corner of bunks. The yard and the forge are boarded plots you raise.
      // The zeros are EXPLICIT and load-bearing: migrate() reads a missing
      // training/smithy key as "an old save that already owned them" and hands
      // them over for free, so leaving them absent gifted every new guild a
      // yard and a forge the moment the app was closed and reopened.
      facilities: { dormitory: 1, kitchen: 1, training: 0, smithy: 0 },
      village: {},                    // raised village lots, by lot id
      teams: [], fallen: [], outbreaks: [],
      light: 72,          // the hall's ember-lamps; the realm's light is slowly dimming
      lastGlassDay: 0,
      challenge: opts.challenge || null,
      prestige: opts.prestige || 0,
      legacyFallen: opts.legacyFallen || [],
    };
    // Seeded founding: every charter starts small and simple — three
    // founders rolled from the guild's seed (same seed, same founders).
    state.seed = opts.seed != null ? opts.seed : R.int(2147483647);
    const startRoster = (opts.challenge && opts.challenge.roster) || 3;
    R.withSeed(state.seed, () => {
      for (let i = 0; i < startRoster; i++) state.roster.push(PF.generate({ spriteIndex: i, taken: state.roster.map((r) => r.name) }));
    });
    GH.items.addMat(state.inventory, 'iron', 3);

    if (mode === 'sandbox') {
      state.gold = 1000;
      D.ZONES.forEach((z) => { if (!state.zonesUnlocked.includes(z.id)) state.zonesUnlocked.push(z.id); });
      state.story = { seen: {}, objective: 'Sandbox — build, tinker, and play freely.', log: [], pending: [] };
    } else if (mode === 'challenge') {
      const c = opts.challenge || {};
      if (c.gold != null) state.gold = c.gold;
      state.story = { seen: {}, objective: c.goalText || '', log: [], pending: [] };
    } else if (GH.story) {
      GH.story.init(state);
    }

    refreshBoard();
    log(`${state.guildName} opens its doors${mode !== 'campaign' ? ` (${mode} mode)` : ''}.`, 'turn');
    emit();
    return state;
  }

  /* New Game+ — charter a new hall. One veteran carries over (level, skills,
   * gear, archetype, sworn bond); the fallen are remembered; the realm grows
   * harder and richer with every charter. */
  // boons (charter-point purchases): { secondVeteranId, extraGold }
  function newGamePlus(veteranId, guildName, boons) {
    const old = state;
    const carryOne = (id, slot) => {
      const src = old.roster.find((a) => a.id === id);
      if (!src) return null;
      const v = JSON.parse(JSON.stringify(src));
      v.status = 'idle'; v.actedToday = false; v.grieving = 0;
      v.fed = 90; v.rested = 90; v.happy = 80;
      v.bonds = {}; v.routine = v.routine || 'auto';
      state.roster[slot] = v;
      return v;
    };
    const vetId = (old.roster.find((a) => a.id === veteranId) || old.roster[0] || {}).id;
    const secondId = boons && boons.secondVeteranId;
    const prestige = (old.prestige || 0) + 1;
    const legacyFallen = (old.legacyFallen || []).concat(old.fallen || []).slice(-60);

    newGame(guildName || old.guildName, { mode: 'campaign', prestige, legacyFallen });

    const v1 = carryOne.call(null, vetId, 0);
    if (v1) log(`⚑ ${v1.name} answers the new charter — a legend among rookies.`, 'win');
    if (secondId && secondId !== vetId) {
      const v2 = carryOne.call(null, secondId, 1);
      if (v2) log(`⚑ ${v2.name} follows — old companions do not charter alone. (Charter boon)`, 'win');
    }
    state.gold += 50 * prestige + ((boons && boons.extraGold) || 0);
    if (boons && boons.extraGold) log(`✦ Charter boon: a patron's endowment of ${boons.extraGold}g awaits in the vault.`, 'turn');
    log(`✦ Charter ${prestige + 1}: the realm is harder now — and pays better. (+${50 * prestige}g endowment)`, 'turn');
    emit();
    return state;
  }

  /* Endless — "Hold the Line". Keeps the current (victorious) guild; no win
   * condition remains, outbreaks escalate in waves, survival is the score. */
  function startEndless() {
    state.endless = { startedDay: state.day, wave: 1 };
    state.story = state.story || { seen: {}, objective: '', log: [], pending: [] };
    state.story.objective = 'Hold the line. Survive the rising tide.';
    log('🛡 The waking never truly stopped. Wave 1 gathers beyond the borders…', 'crisis');
    emit();
    return state;
  }
  function endlessBest() { try { return parseInt(GH.store.get('guildhall_best_endless') || '0', 10); } catch (e) { return 0; } }
  function recordEndless(days) {
    try { if (days > endlessBest()) GH.store.set('guildhall_best_endless', String(days)); } catch (e) {}
  }

  // Build the board fresh (new game): fill every unlocked zone.
  function refreshBoard() {
    state.board = [];
    topUpBoard();
  }

  // Fill each zone up to its contract count + its boss (if unbeaten).
  function topUpBoard() {
    // The board grows with the story: a young hall sees little work; each
    // slain boss (and the War Room) widens the contract network.
    const perZone = 2 + Math.min(2, Object.keys(state.bossDone || {}).length) + facLevel('warroom');
    state.zonesUnlocked.forEach((zid) => {
      const zone = D.ZONE_BY_ID[zid];
      const have = state.board.filter((j) => j.zoneId === zid && !j.isBoss && j.status === 'open').length;
      for (let i = have; i < perZone; i++) state.board.push(K.generate(zone, false));
      if (!state.bossDone[zid] && !state.board.some((j) => j.zoneId === zid && j.isBoss)) {
        state.board.push(K.generate(zone, true));
      }
    });
  }

  // The living board: clients don't wait forever. Contracts age out, and
  // Rook Vane's company is only too happy to poach the rich ones you ignored.
  function tickBoard(events) {
    state.board.slice().forEach((j) => {
      if (j.isBoss || j.status !== 'open' || j.boardDays == null) return;
      j.boardDays -= 1;
      if (j.boardDays <= 0) {
        state.board = state.board.filter((x) => x.id !== j.id);
        if (j.rivalBid && GH.rival) {
          // Era II: a bid contract expiring IS the poach — the rival system
          // subsumes the old random flavor line.
          GH.rival.claim(state, j, events);
          log(`🏴 Vane's company took "${j.title}". −1 rep.`, 'loss');
        } else if ((state.era || 1) === 1 && j.bounty >= 120 && R.chance(0.25)) {
          state.reputation = Math.max(0, state.reputation - 1);
          events.push(`Rook Vane's company snapped up "${j.title}" while you sat on it (−1 rep).`);
          log(`🏴 Poached: "${j.title}" went to Rook Vane. −1 rep.`, 'loss');
        }
      }
    });
    topUpBoard();
  }

  // Unlock zones whose reputation requirement is met (secondary gate).
  // Charter gate: the first boss arc (tiers 1-2) ships free; the Guild
  // Charter unlock opens the rest of the campaign.
  function zoneAllowed(z) {
    if (z.tier >= 6 && (state ? (state.era || 1) : 1) < 2) return false;   // the Marches wait for Era II
    return z.tier <= 2 || !window.GH.shop || GH.shop.owned('charter');
  }

  function unlockByReputation() {
    D.ZONES.forEach((z) => {
      if (state.reputation >= z.reqRep && zoneAllowed(z) && !state.zonesUnlocked.includes(z.id)) {
        state.zonesUnlocked.push(z.id);
        log(`New region unlocked: ${z.name}.`, 'recruit');
      }
    });
  }

  // After a charter purchase: open everything the player has already earned.
  function recheckUnlocks() {
    unlockByReputation();
    D.ZONES.forEach((z, i) => {
      const next = D.ZONES[i + 1];
      if (state.bossDone[z.id] && next && zoneAllowed(next) && !state.zonesUnlocked.includes(next.id)) {
        state.zonesUnlocked.push(next.id);
        log(`New region unlocked: ${next.name}.`, 'recruit');
      }
    });
    topUpBoard();
    emit();
  }

  function selectZone(zid) { if (state.zonesUnlocked.includes(zid)) { state.selectedZone = zid; emit(); } }

  // --- Queries ------------------------------------------------------------
  const idle = () => state.roster.filter((a) => a.status === 'idle' && !a.actedToday);
  const findAdv = (id) => state.roster.find((a) => a.id === id);
  const findJob = (id) => state.board.find((j) => j.id === id);
  // --- Difficulty ---------------------------------------------------------
  // THE one place difficulty is resolved. Contracts, resolution and payout all
  // read this rather than each reaching into state, so a save with no setting
  // (or a bad one) can never produce a half-applied difficulty.
  function difficulty() {
    const id = state && state.difficulty;
    return D.DIFFICULTIES[id] || D.DIFFICULTIES[D.DEFAULT_DIFFICULTY];
  }
  function difficultyId() {
    return (state && D.DIFFICULTIES[state.difficulty]) ? state.difficulty : D.DEFAULT_DIFFICULTY;
  }
  // Changeable mid-campaign on purpose: this is a management game, and a player
  // who finds out on day 40 that they want a harder run should not have to
  // throw the hall away. The log records it so the chronicle stays honest.
  function setDifficulty(id) {
    if (!state || !D.DIFFICULTIES[id]) return { ok: false };
    if (id === difficultyId()) return { ok: true, unchanged: true };
    state.difficulty = id;
    log(`The Compact revises its terms — difficulty is now ${D.DIFFICULTIES[id].name}.`, 'turn');
    // Contracts already on the board were rolled at the old DC; clear the
    // unaccepted ones so the change takes effect now rather than in a week.
    state.board = state.board.filter((j) => j.status !== 'open');
    topUpBoard();
    emit();
    return { ok: true };
  }

  // --- Facilities ---------------------------------------------------------
  // Buildable expansions start at level 0 (not built); core rooms start at 1.
  function facLevel(id) {
    // The hall scene boots before any game exists (title screen) and asks what
    // stands, in order to size its camera. Reading state blindly threw there,
    // which aborted Phaser's create() halfway through and left the camera at
    // its raw 1:1 default — the hall then opened zoomed into one corner.
    const v = state && state.facilities ? state.facilities[id] : undefined;
    if (v != null) return v;
    return D.FACILITIES[id] && D.FACILITIES[id].buildable ? 0 : 1;
  }
  function bedsCount() { return 4 + facLevel('dormitory') * 2; }
  function trainCost() { return Math.max(8, TRAIN_COST - (facLevel('training') - 1) * 6); }
  function mealFedBonus() { return (facLevel('kitchen') - 1) * 8; }
  function mealHappyBonus() { return (facLevel('kitchen') - 1) * 2; }
  function maxCraftTier() { return Math.min(5, facLevel('smithy') + 1); }
  function craftDiscount() { return (facLevel('smithy') - 1) * 0.10; }
  function upgradeCost(id) { return D.FACILITIES[id].baseCost * Math.max(1, facLevel(id)); }

  function upgrade(id) {
    const fac = D.FACILITIES[id];
    if (!fac) return { ok: false, msg: 'Unknown facility.' };
    const lvl = facLevel(id);
    if (lvl >= fac.max) return { ok: false, msg: `${fac.name} is already maxed.` };
    const cost = fac.baseCost * Math.max(1, lvl);
    if (state.gold < cost) return { ok: false, msg: `Need ${cost}g.` };
    state.gold -= cost;
    state.facilities[id] = lvl + 1;
    const verb = lvl === 0 ? 'Built' : 'Upgraded';
    log(`${verb} the ${fac.name}${lvl > 0 ? ` to level ${lvl + 1}` : ''} (−${cost}g): ${fac.effect(lvl + 1)}.`, 'recover');
    emit();
    return { ok: true, id, level: lvl + 1, cost, built: lvl === 0, msg: `${fac.name} ${lvl === 0 ? 'built!' : 'is now level ' + (lvl + 1) + '.'}` };
  }

  // --- The village lots ---------------------------------------------------
  // The buildings along the street are LOTS: vacant ground until the guild
  // pays to raise them. Each finished building puts another villager on the
  // road (hall.js reads villageCount for its walker pool), so the street gets
  // visibly busier as the guild's fortunes lift the town around it.
  function villageLot(id) {
    for (const t of D.TOWN) if (t.lot && t.lot.id === id) return t.lot;
    return null;
  }
  function villageBuilt(id) { return !!(state && state.village && state.village[id]); }
  function villageCount() {
    return state && state.village ? Object.keys(state.village).length : 0;
  }
  function raiseLot(id) {
    const lot = villageLot(id);
    if (!lot) return { ok: false, msg: 'Unknown lot.' };
    if (villageBuilt(id)) return { ok: false, msg: `The ${lot.name} already stands.` };
    if (state.gold < lot.cost) return { ok: false, msg: `Need ${lot.cost}g.` };
    state.gold -= lot.cost;
    state.village[id] = 1;
    state.reputation = (state.reputation || 0) + 2;   // renown — the HUD reads state.reputation
    log(`🏠 Raised the ${lot.name} on the village street (−${lot.cost}g). The town grows. +2 renown.`, 'win');
    emit();
    return { ok: true, id, msg: `The ${lot.name} stands. The street gets a little busier.` };
  }

  // --- Dispatch a contract → the party sets out on a multi-day expedition --
  // opts.teamId marks a full-team dispatch (synergy applies).
  function dispatch(jobId, partyIds, opts) {
    const job = findJob(jobId) || (state.outbreaks || []).find((o) => o.id === jobId);
    if (!job || job.status !== 'open') return { ok: false, msg: 'That contract is no longer open.' };
    const party = partyIds.map(findAdv).filter((a) => a && a.status === 'idle');
    if (!party.length) return { ok: false, msg: 'Assign at least one available adventurer.' };
    if (job.minParty && party.length < job.minParty) {
      return { ok: false, msg: `This contract needs at least ${job.minParty} adventurers.` };
    }

    const days = (job.days || 1) + ((opts && opts.travel) || 0);
    party.forEach((a) => { a.status = 'away'; });
    if (job.isOutbreak) job.status = 'engaged';
    else state.board = state.board.filter((j) => j.id !== jobId);   // contract is taken
    state.expeditions.push({
      id: 'exp_' + state.day + '_' + R.int(99999),
      job, partyIds: party.map((a) => a.id), daysLeft: days, totalDays: days,
      teamId: (opts && opts.teamId) || null,
      travel: (opts && opts.travel) || 0,
    });
    log(`${opts && opts.teamId ? 'A team marches' : 'A party sets out'} for "${job.title}" — back in ${days} day${days > 1 ? 's' : ''}.`, 'event');
    emit();
    return { ok: true, departed: true, days, party: party.map((a) => a.name) };
  }

  // Dispatch a whole team (used by the Map view and outbreaks).
  function dispatchTeam(jobId, teamId) {
    const team = GH.teams.byId(state, teamId);
    if (!team) return { ok: false, msg: 'No such team.' };
    const r = GH.teams.readiness(state, team);
    if (!r.allReady) return { ok: false, msg: `${team.name} isn't fully ready (${r.ready}/${r.total}).` };
    // Rift gates shear loose formations apart — only a drilled team holds.
    const gateJob = (state.outbreaks || []).find((o) => o.id === jobId);
    if (gateJob && gateJob.isGate && GH.teams.synergyBonus(team) < 2) {
      return { ok: false, msg: `${team.name} isn't drilled enough for a rift gate — a team needs synergy +2 (march together; it grows with shared missions).` };
    }
    // Distance matters: outbreaks must be REACHED before they break.
    const job = state.board.find((j) => j.id === jobId) || (state.outbreaks || []).find((o) => o.id === jobId);
    if (job && job.isOutbreak) {
      const zone = D.ZONE_BY_ID[job.zoneId];
      const travel = GH.teams.travelDays(state, team, zone.tier);
      if (travel >= job.daysLeft) {
        const sp = GH.teams.speed(state, team);
        return { ok: false, msg: `${team.name} (${sp.label.toLowerCase()}) would arrive in ${travel}d — the breach breaks in ${job.daysLeft}d. A swifter team could make it.` };
      }
      return dispatch(jobId, team.memberIds, { teamId, travel });
    }
    return dispatch(jobId, team.memberIds, { teamId });
  }

  // Resolve a returning expedition: roll the checks, pay out, loot, rep, bosses.
  function settleExpedition(exp) {
    const job = exp.job;
    const party = exp.partyIds.map(findAdv).filter(Boolean);
    party.forEach((a) => { if (a.status === 'away') a.status = 'idle'; });
    if (!party.length) return null;

    const team = exp.teamId ? GH.teams.byId(state, exp.teamId) : null;
    let teamBonus = team ? GH.teams.synergyBonus(team) : 0;
    // The Sleeper's gate: the campaign's people weigh on the last rolls —
    // sworn bonds, vows, promises, old scars (GH.rift.legendBonus, cap +4).
    if (job.isGate && GH.rift) {
      const legend = GH.rift.legendBonus(state, job, party);
      if (legend) { teamBonus += legend; log(`The hall's whole legend stands at the gate with them: +${legend} to every roll.`, 'win'); }
    }
    const res = K.resolve(job, party, { teamBonus });    // mutates needs/xp; injures/kills on crit-fail
    res.title = job.title; res.days = exp.totalDays; res.party = party.map((a) => a.name);
    res.teamName = team ? team.name : null; res.teamBonus = teamBonus;

    let earned = Math.round(job.bounty * res.payRatio);
    if (job.bonus && job.bonus.type === 'flawless' && res.flawless && res.outcome !== 'failure') {
      const extra = Math.round(earned * job.bonus.pct / 100);
      earned += extra;
      res.bonusNote = `✦ Flawless execution — client pays +${job.bonus.pct}% (+${extra}g).`;
      log(`✦ Flawless bonus on "${job.title}": +${extra}g.`, 'win');
    }
    const partyPay = Math.round(earned * (1 - YOUR_CUT));
    const yourCut = earned - partyPay;
    state.gold += yourCut;
    res.earned = earned; res.partyPay = partyPay; res.yourCut = yourCut;

    const each = party.length ? Math.round(partyPay / party.length) : 0;
    party.forEach((a) => {
      if (res.outcome !== 'failure') {
        a.happy = Math.min(100, a.happy + 8 + Math.floor(each / 10)); a.loyalty = Math.min(100, a.loyalty + 6);
        if (GH.personality) GH.personality.sharedWin(a);   // victories deepen the bond
        if (GH.bios && res.outcome === 'triumph') GH.bios.deed(a, `Triumphed on "${job.title}".`);
      } else { a.happy = Math.max(0, a.happy - 12); a.loyalty = Math.max(0, a.loyalty - 8); }
      if (GH.bios && a.status === 'injured') GH.bios.deed(a, `Wounded on "${job.title}" — carried home to the infirmary.`);
    });

    const repGain = { triumph: D.RANK_ORDER.indexOf(job.rank) + 2, success: D.RANK_ORDER.indexOf(job.rank) + 1, partial: 1, failure: 0 }[res.outcome];
    state.reputation += repGain; res.repGain = repGain;
    if (res.outcome === 'failure') state.reputation = Math.max(0, state.reputation - 1);

    const zone = D.ZONE_BY_ID[job.zoneId];
    res.loot = GH.items.rollLoot(zone, res.outcome, job.isBoss);
    GH.items.grant(state.inventory, res.loot);

    if (job.isBoss && res.outcome !== 'failure' && !state.bossDone[zone.id]) {
      state.bossDone[zone.id] = true;
      if (GH.bios) party.forEach((a) => { if (a.status !== 'dead') GH.bios.deed(a, `Stood against ${zone.boss} — and won.`); });
      const idx = D.ZONES.findIndex((z) => z.id === zone.id);
      const next = D.ZONES[idx + 1];
      res.bossCleared = zone.name;
      if (next && zoneAllowed(next) && !state.zonesUnlocked.includes(next.id)) {
        state.zonesUnlocked.push(next.id);
        res.unlocked = next.name;
        log(`⚔ ${zone.boss} is slain! ${next.name} now lies open.`, 'win');
      } else if (next && !zoneAllowed(next)) {
        if (next.tier >= 6) {
          // Not a purchase wall — an era wall. The Marches open with victory.
          log(`⚔ ${zone.boss} is slain! Beyond lies ${next.name} — Marches territory, held for the next charter. Finish this one first.`, 'win');
        } else {
          res.charterWall = next.name;
          log(`⚔ ${zone.boss} is slain! ${next.name} waits beyond your charter — the Guild Charter opens the full campaign.`, 'win');
        }
      } else {
        log(`⚔ ${zone.boss} is slain — ${zone.name} is pacified.`, 'win');
      }
      if (GH.story) GH.story.onBossCleared(state, zone, res);
    }
    unlockByReputation();
    if (GH.social) GH.social.afterExpedition(state, party, res);

    // deaths: memorial, team grief, removal from the roster
    const dead = party.filter((a) => a.status === 'dead');
    res.deaths = dead.map((a) => a.name);
    dead.forEach((a) => {
      state.fallen.push({ name: a.name, class: a.class, ancestry: a.ancestry, level: a.level, day: state.day, mission: job.title });
      const t = GH.teams.teamOf(state, a.id);
      if (t) GH.teams.mourn(state, t, a, job.title);
      // hallmates grieve even outside the team
      state.roster.forEach((o) => { if (o.id !== a.id && GH.social.bondOf(o, a) >= GH.social.FRIEND) { o.happy = Math.max(0, o.happy - 15); o.grieving = Math.max(o.grieving || 0, 4); } });
      // a partner's loss cuts deepest — and hardens into a vow when mourning ends
      const partner = state.roster.find((o) => o.partnerId === a.id);
      if (partner) {
        partner.happy = Math.max(0, partner.happy - 30);
        partner.loyalty = Math.max(0, partner.loyalty - 10);
        partner.grieving = Math.max(partner.grieving || 0, 6);
        partner.vowPending = a.name;
        partner.partnerId = null; partner.partnerKind = null;
        log(`${partner.name} carried ${a.name.split(' ')[0]}'s ${a.partnerKind === 'heart' ? 'ribbon' : 'oath-coin'} home in silence. The hall gives them room.`, 'loss');
      }
      log(`☠ ${a.name} fell during "${job.title}". The hall goes quiet.`, 'loss');
      state.roster = state.roster.filter((x) => x.id !== a.id);
    });

    // team bookkeeping
    if (team) GH.teams.recordMission(state, team, res);

    // outbreak contained?
    if (job.isOutbreak) {
      job.status = res.outcome === 'failure' ? 'open' : 'contained';
      if (job.status === 'contained') {
        state.outbreaks = state.outbreaks.filter((o) => o.id !== job.id);
        if (job.isGate && GH.rift) {
          const won = GH.rift.onGateClosed(state, job);
          log(won ? `⛧→✦ THE LAST GATE IS SHUT. The song beneath the ash goes silent.`
                  : `⛧ Rift gate ${job.gateStage}/${GH.rift.STAGES} sealed at ${job.zoneName}. The realm breathes.`, 'win');
        } else {
          log(`⚔ Outbreak contained: ${job.title}.`, 'win');
        }
      } else {
        log(`The outbreak at ${job.zoneName} rages on — the assault failed.`, 'loss');
      }
    }

    // chronicle records: contract tallies + bestiary groundwork (per-tag victories)
    state.records = state.records || { contracts: 0, wins: 0, flawless: 0, byTag: {}, bosses: [] };
    state.records.contracts += 1;
    if (res.outcome !== 'failure') {
      state.records.wins += 1;
      state.records.byTag[job.tag] = (state.records.byTag[job.tag] || 0) + 1;
      if (job.isBoss && !state.records.bosses.includes(zone.boss)) state.records.bosses.push(zone.boss);
    }
    if (res.flawless) state.records.flawless += 1;

    const head = { triumph: '★ Triumph!', success: '✔ Success', partial: '◑ Partial success', failure: '✘ Failure' }[res.outcome];
    const lootStr = GH.items.lootSummary(res.loot);
    log(`${head} — "${job.title}". Cut: ${yourCut}g, +${repGain} rep${lootStr.length ? ', loot: ' + lootStr.join(', ') : ''}.`, res.outcome === 'failure' ? 'loss' : 'win');
    res.levelUps.forEach((e) => log(e, 'level'));
    (res.newScars || []).forEach((s) => log(s, 'event'));
    // Working a region pushes Vane's company back out of it (Era II).
    if (GH.rival) {
      const pushback = GH.rival.onContractDone(state, job.zoneId, res.outcome);
      if (pushback) { log(pushback, 'win'); res.rivalNote = pushback; }
    }
    return res;
  }

  const expeditions = () => state.expeditions || [];

  // --- Dungeon outbreaks: timed, semi-random crises on the map -------------
  function spawnOutbreak() {
    const zid = R.pick(state.zonesUnlocked);
    const zone = D.ZONE_BY_ID[zid];
    const tag = R.pick(zone.tags);
    const rk = D.RANKS[K.rankForZone(zone.tier, false)];
    const NAMES = ['A rift tears open', 'A warren boils over', 'A crypt bursts its seals', 'A nest erupts', 'A horde surges up'];
    const ob = {
      id: 'ob_' + state.day + '_' + R.int(99999),
      isOutbreak: true, zoneId: zid, zoneName: zone.name,
      title: `OUTBREAK: ${R.pick(NAMES)} in ${zone.name.replace(/^The /, '')}`,
      tag, skill: D.TAG_SKILL[tag], rank: 'D',
      dc: rk.dc + 1 + Math.min(3, state.prestige || 0) + (state.endless ? Math.floor(state.endless.wave / 2) : 0), stages: rk.stages + 1,
      bounty: Math.round(rk.bounty * 1.6), xp: Math.round(rk.xp * 1.5),
      days: 1,                        // urgent — resolves overnight
      daysLeft: state.endless ? Math.max(2, 3 - Math.floor(state.endless.wave / 4)) : 2 + R.int(2),
      status: 'open',
    };
    state.outbreaks.push(ob);
    log(`⚠ ${ob.title} — contain it within ${ob.daysLeft} days!`, 'crisis');
    if (GH.story) GH.story.onOutbreak(state, ob);
    return ob;
  }

  function tickOutbreaks(events) {
    (state.outbreaks || []).slice().forEach((ob) => {
      if (ob.status === 'engaged') return;            // a team is on it tonight
      ob.daysLeft -= 1;
      if (ob.daysLeft <= 0) {
        state.outbreaks = state.outbreaks.filter((o) => o.id !== ob.id);
        if (ob.isGate && GH.rift) {
          // an unanswered RIFT GATE is how the realm is lost — its own ledger
          GH.rift.onGateMissed(state, ob, events);
          log(`⛧ The gate in ${ob.zoneName} stood unanswered. The rift spreads.`, 'loss');
          return;
        }
        state.reputation = Math.max(0, state.reputation - 2);
        // endless: every rift you can't answer bleeds the treasury harder as the tide rises
        const dmg = state.endless ? 20 + 8 * state.endless.wave : 15;
        const sacked = state.endless
          ? Math.min(Math.max(0, state.gold + 100), dmg)   // endless can bleed into debt → bankruptcy ends the run
          : Math.min(state.gold, dmg);
        state.gold -= sacked;
        events.push(`The outbreak in ${ob.zoneName} overwhelmed the region — −2 rep, −${sacked}g in damages.`);
        log(`✘ Outbreak unanswered in ${ob.zoneName}: −2 reputation, −${sacked}g.`, 'loss');
      }
    });
    // semi-random spawn (none on day 1-2). Endless: the tide rises by waves.
    const wave = state.endless ? state.endless.wave : 0;
    const maxLive = state.endless ? Math.min(6, 2 + Math.floor(wave / 3)) : ((state.era || 1) >= 3 ? 3 : 2);
    if (state.day >= 3 && (state.outbreaks || []).length < maxLive) {
      let chance = state.mode === 'sandbox' ? 0.15 : 0.22 + Math.min(0.2, state.day * 0.004) + 0.04 * (state.prestige || 0);
      if (state.endless) chance = Math.min(0.95, 0.30 + 0.06 * wave);
      if (R.chance(chance)) spawnOutbreak();
    }
  }

  // --- Kitchen ------------------------------------------------------------
  function cook(mealIndex) {
    const meal = D.MEALS[mealIndex];
    if (!meal) return { ok: false, msg: 'No such meal.' };
    if (state.gold < meal.cost) return { ok: false, msg: 'Not enough gold for that meal.' };
    state.gold -= meal.cost;
    const fed = state.roster.filter((a) => a.status !== 'away' && a.status !== 'hunting');
    const fb = mealFedBonus(), hb = mealHappyBonus();
    fed.forEach((a) => { a.fed = Math.min(100, a.fed + meal.fed + fb); a.happy = Math.min(100, a.happy + meal.happy + hb); });
    log(`Served ${meal.name} to the hall (−${meal.cost}g). The roster is fed.`, 'recover');
    emit();
    return { ok: true, msg: `${meal.name} served to ${fed.length}.` };
  }

  // --- Training -----------------------------------------------------------
  function train(advId, skill) {
    const a = findAdv(advId);
    if (!a) return { ok: false, msg: 'Unknown adventurer.' };
    if (a.status !== 'idle') return { ok: false, msg: `${a.name} is ${a.status}.` };
    if (a.actedToday) return { ok: false, msg: `${a.name} has already worked today.` };
    // No yard, no drills — the room has to exist before anyone can use it.
    if (facLevel('training') === 0) return { ok: false, msg: 'The training yard is still a boarded-up plot. Raise it first.' };
    const cost = trainCost();
    if (state.gold < cost) return { ok: false, msg: 'Not enough gold to run a session.' };
    const can = PF.canTrain(a, skill);
    if (!can.ok) return { ok: false, msg: can.reason };
    state.gold -= cost;
    PF.train(a, skill);
    a.actedToday = true;
    a.rested = Math.max(0, a.rested - 15);
    log(`${a.name} trained ${D.SKILL_LABEL[skill]} → ${D.PROF_LABEL[a.skills[skill]]} (−${cost}g).`, 'recover');
    emit();
    return { ok: true, msg: `${a.name}: ${D.SKILL_LABEL[skill]} is now ${D.PROF_LABEL[a.skills[skill]]}.` };
  }

  // --- Recruit ------------------------------------------------------------
  function recruit() {
    if (state.roster.length >= bedsCount()) return { ok: false, msg: 'No free beds. Upgrade the dormitory first.' };
    // a tavern visitor (world event) signs first — seasoned, and at their asking price
    const v = state.visitor && state.day <= state.visitor.expiresDay ? state.visitor : null;
    const cost = v ? v.price : RECRUIT_COST;
    if (state.gold < cost) return { ok: false, msg: 'Not enough gold to recruit.' };
    state.gold -= cost;
    if (v) {
      state.visitor = null;
      state.roster.push(v.adv);
      v.adv.joinedDay = state.day;
      if (GH.bios) GH.bios.deed(v.adv, 'Walked in from the tavern, blade already proven, and signed the charter.');
      log(`${v.adv.name} signs the charter — the tavern guest joins for ${cost}g, blade already proven.`, 'recruit');
      emit();
      return { ok: true, adv: v.adv };
    }
    const a = PF.generate({ spriteIndex: state.roster.length, taken: state.roster.map((r) => r.name) });
    // legacy: names of the fallen echo through new charters
    const legacy = (state.legacyFallen || []);
    if (legacy.length && R.chance(0.25)) {
      const hero = legacy[R.int(legacy.length)];
      a.name = hero.name.split(' ')[0] + ' ' + a.name.split(' ').slice(1).join(' ');
      a.loyalty = Math.min(100, a.loyalty + 15);
      a.legacyOf = hero.name;
      log(`Recruited ${a.name} — named for the legend ${hero.name}. They arrive already devoted.`, 'recruit');
      if (GH.bios) GH.bios.deed(a, `Signed the charter, carrying the name of the legend ${hero.name}.`);
    } else {
      log(`Recruited ${a.name} — ${a.ancestry} ${a.class} (−${RECRUIT_COST}g).`, 'recruit');
      if (GH.bios) GH.bios.deed(a, 'Signed the guild charter.');
    }
    a.joinedDay = state.day;
    state.roster.push(a);
    emit();
    return { ok: true, adv: a };
  }

  // Undimmed Old Age glass is the one thing that puts light back in a hall.
  // This is the setting's economy in miniature: light is a resource you spend
  // expeditions to find, and it drains whether you use it or not.
  function LIGHT_PER_GLASS() { return 26; }
  function burnGlass() {
    if (GH.items.matCount(state.inventory, 'emberglass') < 1) {
      return { ok: false, msg: 'No undimmed ember-glass. The deep regions still hold it.' };
    }
    if (state.light >= 100) return { ok: false, msg: 'The hall is already bright.' };
    state.inventory.mats.emberglass -= 1;
    state.light = Math.min(100, state.light + LIGHT_PER_GLASS());
    state.lastGlassDay = state.day;
    log(`Set a shard of undimmed ember-glass in the hall lamps. The light steadies.`, 'recover');
    emit();
    return { ok: true, msg: 'The hall brightens.' };
  }

  // --- Smithy: craft & equip ---------------------------------------------
  function craftGold(gId) { return Math.round(GH.items.gear(gId).cost.gold * (1 - craftDiscount())); }
  function craft(gId) {
    const g = GH.items.gear(gId);
    if (!g) return { ok: false, msg: 'Unknown blueprint.' };
    if (facLevel('smithy') === 0) return { ok: false, msg: 'There is no forge yet — raise the Smithy first.' };
    if (g.tier > maxCraftTier()) return { ok: false, msg: `Upgrade the Smithy to forge tier ${g.tier}.` };
    const gold = craftGold(gId);
    const matsOk = Object.entries(g.cost.mats || {}).every(([m, q]) => GH.items.matCount(state.inventory, m) >= q);
    if (!matsOk) return { ok: false, msg: 'Missing materials.' };
    if (state.gold < gold) return { ok: false, msg: `Need ${gold}g.` };
    Object.entries(g.cost.mats || {}).forEach(([m, q]) => { state.inventory.mats[m] -= q; });
    GH.items.addGear(state.inventory, gId, 1);
    state.gold -= gold;
    log(`Forged ${g.name} (−${gold}g).`, 'recover');
    emit();
    return { ok: true, msg: `Forged ${g.name}.` };
  }
  function equip(advId, gId) {
    const a = findAdv(advId); if (!a) return { ok: false, msg: 'Unknown adventurer.' };
    const r = GH.items.equip(state.inventory, a, gId);
    if (!r.ok) return { ok: false, msg: r.reason };
    log(`${a.name} equipped ${GH.items.gear(gId).name}.`, 'event');
    emit();
    return { ok: true };
  }
  function unequip(advId, slot) {
    const a = findAdv(advId); if (!a) return { ok: false };
    const r = GH.items.unequip(state.inventory, a, slot);
    if (r.ok) emit();
    return r;
  }

  // Gift gear instead of merely issuing it — same equip, but it MEANS something.
  // Affinity scales with the gear's tier; one gift per adventurer per day.
  function gift(advId, gId) {
    const a = findAdv(advId); if (!a) return { ok: false, msg: 'Unknown adventurer.' };
    const g = GH.items.gear(gId); if (!g) return { ok: false, msg: 'Unknown item.' };
    if (a.lastGiftDay === state.day) return { ok: false, msg: `${a.name.split(' ')[0]} has already been spoiled today.` };
    const r = GH.items.equip(state.inventory, a, gId);
    if (!r.ok) return { ok: false, msg: r.reason };
    a.lastGiftDay = state.day;
    const gained = 6 + 3 * (g.tier || 1);
    a.affinity = Math.min(100, (a.affinity || 0) + gained);
    a.happy = Math.min(100, a.happy + 10);
    a.loyalty = Math.min(100, a.loyalty + 4);
    const line = GH.personality ? GH.personality.line(a, 'gift') : '';
    log(`🎁 ${g.name}, given as a gift to ${a.name.split(' ')[0]}. (+${gained} affinity)`, 'recover');
    emit();
    return { ok: true, line, gained, adv: a };
  }

  // --- Hall social life ------------------------------------------------------
  // Two idle adventurers share a table (hall.js drives the walking): bonds
  // grow, and a deep-enough bond between two unbannered heroes forms a team
  // on the spot — the ⭐ moment. Drinks (buyRound) lower the bar for a day.
  function hallMeet(idA, idB) {
    const a = findAdv(idA), b = findAdv(idB);
    if (!a || !b) return { ok: false };
    a.bonds = a.bonds || {}; b.bonds = b.bonds || {};
    a.bonds[b.id] = Math.min(100, (a.bonds[b.id] || 0) + 2);
    b.bonds[a.id] = Math.min(100, (b.bonds[a.id] || 0) + 2);
    let sparked = false, teamName = null;
    const unteamed = !GH.teams.teamOf(state, a.id) && !GH.teams.teamOf(state, b.id);
    const threshold = state.roundDay === state.day ? 32 : 45;
    if (unteamed && a.bonds[b.id] >= threshold) {
      const t = GH.teams.create(state, null, [a.id, b.id]);
      t.synergy = 4;   // they already fight like they drink — together (⭐ +1)
      t.history.push({ day: state.day, text: state.roundDay === state.day ? 'Founded over a round the Guildmaster stood.' : 'Founded across a tavern table.' });
      log(`⭐ ${a.name.split(' ')[0]} and ${b.name.split(' ')[0]} raise a banner together: ${t.name} — "${t.motto}"`, 'win');
      sparked = true; teamName = t.name;
      emit();
    } else {
      persist();   // bonds tick quietly — no full re-render every meetup
    }
    return { ok: true, sparked, teamName, bond: a.bonds[b.id] };
  }

  // 🍺 Stand a round: everyone at the hall gathers in the tavern tonight —
  // happier, closer, and far more likely to find their people.
  function buyRound() {
    const atHall = state.roster.filter((x) => x.status !== 'away' && x.status !== 'hunting');
    if (atHall.length < 2) return { ok: false, msg: 'The hall is nearly empty — save the coin for when they\'re home.' };
    if (state.roundDay === state.day) return { ok: false, msg: 'The cups are already full — one round a day keeps it special.' };
    const cost = 12 + 4 * atHall.length;
    if (state.gold < cost) return { ok: false, msg: `A round for ${atHall.length} runs ${cost}g — the purse says no.` };
    state.gold -= cost;
    state.roundDay = state.day;
    atHall.forEach((x) => { x.happy = Math.min(100, x.happy + 8); x.bonds = x.bonds || {}; });
    for (let i = 0; i < atHall.length; i++) {
      for (let j = i + 1; j < atHall.length; j++) {
        const p = atHall[i], q = atHall[j];
        p.bonds[q.id] = Math.min(100, (p.bonds[q.id] || 0) + 3);
        q.bonds[p.id] = Math.min(100, (q.bonds[p.id] || 0) + 3);
      }
    }
    log(`🍺 The Guildmaster stands a round (−${cost}g). The hall roars; grudges thin, stories thicken.`, 'recruit');
    emit();
    return { ok: true, cost, count: atHall.length };
  }

  // --- Using a wing -------------------------------------------------------
  // The five expansions were passive stat lines you could never visit. Each now
  // has one thing you DO in it, deliberately shaped like the tavern's round and
  // the kitchen's meals — gold against a hall-wide effect, once a day — so they
  // read as part of the game rather than bolted beside it. The level you paid
  // for scales the result, which is what makes upgrading a wing worth anything.
  function useWing(id) {
    const act = D.WING_ACTIONS[id], fac = D.FACILITIES[id];
    if (!act || !fac) return { ok: false, msg: 'No such wing.' };
    const lvl = facLevel(id);
    if (lvl <= 0) return { ok: false, msg: `The ${fac.name} has not been raised yet.` };
    state.wingUsed = state.wingUsed || {};
    if (state.wingUsed[id] === state.day) return { ok: false, msg: `The ${fac.name} has had its use of the day.` };
    if (state.gold < act.cost) return { ok: false, msg: `That runs ${act.cost}g — the purse says no.` };
    const home = state.roster.filter((x) => x.status !== 'away' && x.status !== 'hunting');
    if (!home.length) return { ok: false, msg: 'There is nobody home to feel the benefit.' };

    let line;
    if (id === 'infirmary') {
      // checked BEFORE charging, so a pointless visit costs nothing
      const hurt = home.filter((a) => a.status === 'injured');
      if (!hurt.length) return { ok: false, msg: 'Nobody is hurt. Save the linen.' };
      hurt.forEach((a) => {
        a.injuryDays = Math.max(0, a.injuryDays - (1 + Math.floor(lvl / 2)));
        a.hp = Math.min(a.maxHp, a.hp + 4 + lvl * 2);
        if (a.injuryDays === 0) a.status = 'idle';
      });
      line = `✚ The wounded are tended (−${act.cost}g). ${hurt.length} mending faster than they would have.`;
    } else if (id === 'library') {
      const xp = 8 + lvl * 4;
      home.forEach((a) => GH.pf.addXp(a, xp));
      line = `📖 The archives are opened (−${act.cost}g). The hall takes ${xp} XP from other people's mistakes.`;
    } else if (id === 'warroom') {
      const before = state.board.length;
      topUpBoard();
      const added = state.board.length - before;
      line = `🗺 The maps come out (−${act.cost}g). ${added > 0 ? added + ' fresh contract' + (added === 1 ? '' : 's') + ' posted.' : 'Nothing new on the roads today.'}`;
    } else if (id === 'chapel') {
      const amt = 10 + lvl * 5;
      home.forEach((a) => { a.happy = Math.min(100, a.happy + amt); a.loyalty = Math.min(100, a.loyalty + 3); });
      line = `🕯 A vigil is held (−${act.cost}g). The hall sits together; spirits lift ${amt}.`;
    } else {
      const amt = 12 + lvl * 6;
      home.forEach((a) => { a.rested = Math.min(100, a.rested + amt); });
      line = `♨️ The baths are heated (−${act.cost}g). ${amt} Rest back into every pair of shoulders.`;
    }
    state.gold -= act.cost;
    state.wingUsed[id] = state.day;
    log(line, 'recover');
    emit();
    return { ok: true, msg: line };
  }
  function wingUsedToday(id) {
    return !!(state && state.wingUsed && state.wingUsed[id] === state.day);
  }

  // Staff chats: familiarity is the save's memory of who you stop to talk to.
  function staffTalk(key) {
    if (!GH.staff || !GH.staff.BY_KEY[key]) return { ok: false };
    const r = GH.staff.lineFor(state, key);
    const cs = GH.staff.chatState(state, key);
    if (cs.lastDay !== state.day) {
      cs.lastDay = state.day;
      cs.count += 1;
      const t = GH.staff.tierOf(cs.count);
      if (t > GH.staff.tierOf(cs.count - 1)) {
        log(`You've come to know ${GH.staff.BY_KEY[key].name} — ${GH.staff.tierName(t).toLowerCase()}.`, 'recruit');
      }
    }
    persist();
    return Object.assign({ ok: true, staff: GH.staff.BY_KEY[key] }, r);
  }

  // --- Quartermaster: best-fit auto-equip + junk sale -----------------------
  // Greedy passes, veterans first: each pass gives everyone the best strict
  // upgrade in the stash for each slot (swaps cascade freed gear downward).
  function autoEquip() {
    const inv = state.inventory;
    const order = state.roster.filter((a) => a.status !== 'away' && a.status !== 'hunting')
      .sort((a, b) => b.level - a.level);
    let moves = 0;
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      order.forEach((a) => {
        D.SLOTS.forEach((slot) => {
          const cur = a.gear && a.gear[slot];
          const curScore = cur ? GH.items.fitScore(a, cur) : 0;
          let bestId = null, bestScore = curScore;
          Object.entries(inv.gear || {}).forEach(([gid, n]) => {
            if (n <= 0) return;
            const g = GH.items.gear(gid);
            if (!g || g.slot !== slot) return;
            const s = GH.items.fitScore(a, gid);
            if (s > bestScore + 0.01) { bestScore = s; bestId = gid; }
          });
          if (bestId) { GH.items.equip(inv, a, bestId); moves++; changed = true; }
        });
      });
      if (!changed) break;
    }
    if (moves) log(`Quartermaster's pass: ${moves} piece${moves > 1 ? 's' : ''} of gear moved to their best hands.`, 'event');
    emit();
    return { ok: true, moves };
  }

  // Junk = stash gear that upgrades NOBODY and sits below the best tier the
  // roster already wears in that slot (top-tier spares are kept for recruits).
  function junkPreview() {
    const inv = state.inventory;
    const bestTier = {};
    D.SLOTS.forEach((s) => { bestTier[s] = Math.max(0, ...state.roster.map((a) => { const g = GH.items.gear(a.gear && a.gear[s]); return g ? g.tier : 0; })); });
    let gold = 0, count = 0; const ids = [];
    Object.entries(inv.gear || {}).forEach(([gid, n]) => {
      if (n <= 0) return;
      const g = GH.items.gear(gid); if (!g) return;
      const upgradesSomeone = state.roster.some((a) => {
        const cur = a.gear && a.gear[g.slot];
        return GH.items.fitScore(a, gid) > (cur ? GH.items.fitScore(a, cur) : 0) + 0.01;
      });
      if (upgradesSomeone || g.tier >= bestTier[g.slot]) return;
      const price = Math.max(5, Math.round(((g.cost && g.cost.gold) || g.tier * 20) * 0.4));
      ids.push(gid); gold += price * n; count += n;
    });
    return { ids, gold, count };
  }
  function sellJunk() {
    const p = junkPreview();
    if (!p.count) return { ok: false, msg: 'Nothing in the stash reads as junk — it all still serves.' };
    p.ids.forEach((gid) => { state.inventory.gear[gid] = 0; });
    state.gold += p.gold;
    log(`Sold ${p.count} piece${p.count > 1 ? 's' : ''} of surplus gear to a passing trader: +${p.gold}g.`, 'recover');
    emit();
    return { ok: true, count: p.count, gold: p.gold };
  }

  // --- The day plan & promotions -------------------------------------------
  function setRoutine(advId, routine, skill) {
    const a = findAdv(advId); if (!a) return { ok: false };
    a.routine = routine; a.routineSkill = skill || null;
    log(`${a.name.split(' ')[0]}'s routine set: ${GH.routines.LABELS[routine] || routine}.`, 'event');
    emit();
    return { ok: true };
  }

  // Assign one half of somebody's day. A whole-day action fills both.
  function setSlot(advId, slot, value) {
    const a = findAdv(advId); if (!a) return { ok: false };
    GH.routines.setSlot(a, slot, value);
    emit();
    return { ok: true, plan: a.plan };
  }
  // Hand the whole roster's blank slots back to Auto — the escape hatch for a
  // guild too big to hand-assign every morning.
  function autoAssignAll() {
    let n = 0;
    state.roster.forEach((a) => {
      if (a.status !== 'idle') return;
      const p = GH.routines.planOf(a);
      D.DAY_SLOTS.forEach((s) => { if (GH.routines.kindOf(p[s]) !== 'auto') { p[s] = 'auto'; n += 1; } });
    });
    emit();
    return { ok: true, count: n };
  }

  /* Crafting done by a PERSON over a slot, rather than commissioned outright.
   * Cheaper, because their labour is the discount — this is what makes a spare
   * afternoon worth spending. Called from routines.runSlot at nightfall. */
  function slotCraft(a, branch, itemId) {
    if (branch === 'smith') {
      const g = GH.items.gear(itemId);
      if (!g) return { ok: false, msg: 'unknown blueprint' };
      if (facLevel('smithy') === 0) return { ok: false, msg: 'the forge is not built' };
      if (g.tier > maxCraftTier()) return { ok: false, msg: `the Smithy cannot forge tier ${g.tier}` };
      const gold = Math.round(craftGold(itemId) * (1 - D.SLOT_CRAFT_DISCOUNT));
      const matsOk = Object.entries(g.cost.mats || {}).every(([m, q]) => GH.items.matCount(state.inventory, m) >= q);
      if (!matsOk) return { ok: false, msg: 'missing materials' };
      if (state.gold < gold) return { ok: false, msg: `needed ${gold}g` };
      Object.entries(g.cost.mats || {}).forEach(([m, q]) => { state.inventory.mats[m] -= q; });
      state.gold -= gold;
      GH.items.addGear(state.inventory, itemId);
      return { ok: true, msg: `${a.name.split(' ')[0]} forged a ${g.name} (−${gold}g, ${Math.round(D.SLOT_CRAFT_DISCOUNT * 100)}% off for the labour).` };
    }
    if (branch === 'alchemy') {
      const r = D.REMEDY_BY_ID[itemId];
      if (!r) return { ok: false, msg: 'unknown recipe' };
      if (facLevel('library') === 0) return { ok: false, msg: 'there is no library to work from' };
      const gold = Math.round(r.cost.gold * (1 - D.SLOT_CRAFT_DISCOUNT));
      const matsOk = Object.entries(r.cost.mats || {}).every(([m, q]) => GH.items.matCount(state.inventory, m) >= q);
      if (!matsOk) return { ok: false, msg: 'missing materials' };
      if (state.gold < gold) return { ok: false, msg: `needed ${gold}g` };
      Object.entries(r.cost.mats || {}).forEach(([m, q]) => { state.inventory.mats[m] -= q; });
      state.gold -= gold;
      addRemedy(itemId, 1);
      return { ok: true, msg: `${a.name.split(' ')[0]} brewed a ${r.name} (−${gold}g).` };
    }
    return { ok: false, msg: 'unknown trade' };
  }

  // --- Remedies (alchemy stock) --------------------------------------------
  function remedies() { state.inventory.remedies = state.inventory.remedies || {}; return state.inventory.remedies; }
  function addRemedy(id, n) { const r = remedies(); r[id] = (r[id] || 0) + (n || 1); }
  function useRemedy(advId, id) {
    const a = findAdv(advId); if (!a) return { ok: false };
    const rec = D.REMEDY_BY_ID[id]; if (!rec) return { ok: false };
    const stock = remedies();
    if (!stock[id]) return { ok: false, msg: `No ${rec.name} in stock.` };
    const ap = rec.apply || {};
    if (ap.heal) {
      if (a.status !== 'injured') return { ok: false, msg: `${a.name.split(' ')[0]} is not hurt.` };
      a.injuryDays = Math.max(0, (a.injuryDays || 1) - ap.heal);
      if (!a.injuryDays) { a.status = 'idle'; a.hp = a.maxHp; }
    }
    if (ap.rested) a.rested = Math.min(100, a.rested + ap.rested);
    if (ap.fed) a.fed = Math.min(100, a.fed + ap.fed);
    if (ap.happy) a.happy = Math.min(100, a.happy + ap.happy);
    stock[id] -= 1; if (!stock[id]) delete stock[id];
    log(`${a.name.split(' ')[0]} took a ${rec.name}.`, 'recover');
    emit();
    return { ok: true, msg: `${a.name.split(' ')[0]} took a ${rec.name}.` };
  }

  function promote(advId, promoName) {
    const a = findAdv(advId); if (!a) return { ok: false, msg: 'Unknown adventurer.' };
    const promo = (D.PROMOTIONS[a.class] || []).find((p) => p.name === promoName);
    if (!promo) return { ok: false, msg: 'Unknown promotion.' };
    if (state.gold < promo.cost) return { ok: false, msg: `Need ${promo.cost}g.` };
    const r = PF.promote(a, promo);
    if (!r.ok) return { ok: false, msg: r.reason };
    state.gold -= promo.cost;
    if (GH.bios) GH.bios.deed(a, `Passed the exam — promoted to ${promo.name}.`);
    log(`⭐ ${a.name} has been promoted: ${a.class} → ${promo.name}! (−${promo.cost}g)`, 'win');
    emit();
    return { ok: true, msg: `${a.name.split(' ')[0]} is now a ${promo.name}!` };
  }

  // --- Talk (character interaction, personality-driven) --------------------
  function talk(advId) {
    const a = findAdv(advId);
    if (!a) return { ok: false };
    const r = GH.personality.talk(a);
    if (r.heart) log(`${a.name.split(' ')[0]} opened up to you. (${GH.personality.tierOf(a.affinity)})`, 'recruit');
    if (a.sworn && r.heart) {
      log(`⚔ ${a.name} swears a bond to the Guildmaster — +1 to all their rolls, always.`, 'win');
      if (GH.bios) GH.bios.deed(a, 'Swore the bond — their blade is yours, always.');
    } else if (r.heart && GH.bios) GH.bios.deed(a, `Opened their heart to you. (♥ ${r.heart.index + 1})`);
    emit();
    return { ok: true, line: r.line, affinity: r.affinity, tier: r.tier, gained: r.gained, heart: r.heart, responses: r.responses, adv: a };
  }

  // Ask them something. A question is a conversation; a tone is only half of
  // one — this is the other channel (see personality.askTopic).
  function askTopic(advId, key) {
    const a = findAdv(advId);
    if (!a) return { ok: false };
    const r = GH.personality.askTopic(a, key);
    if (!r.ok) return r;
    emit();
    return { ok: true, line: r.line, gained: r.gained, tier: r.tier, locked: r.locked, adv: a };
  }

  // --- Flirt: bolder than talk; unlocks at Friend, spicier as hearts open ---
  function flirt(advId) {
    const a = findAdv(advId);
    if (!a) return { ok: false };
    const r = GH.personality.flirt(a);
    if (!r.ok) return { ok: false, msg: r.msg };
    if (r.promise) log(`♥ ${a.name} tied their ribbon to the Guildmaster's wrist. The hall will gossip for a season.`, 'win');
    emit();
    return { ok: true, line: r.line, gained: r.gained, tier: r.tier, rebuff: r.rebuff, spice: r.spice, promise: r.promise, adv: a };
  }
  // Player picks a response style after talking — the empathy check lands.
  function respondTalk(advId, style) {
    const a = findAdv(advId);
    if (!a) return { ok: false };
    const r = GH.personality.respond(a, style);
    if (r.heart) log(`${a.name.split(' ')[0]} opened up to you. (${GH.personality.tierOf(a.affinity)})`, 'recruit');
    if (a.sworn && r.heart) log(`⚔ ${a.name} swears a bond to the Guildmaster — +1 to all their rolls, always.`, 'win');
    emit();
    return { ok: true, reaction: r.reaction, gained: r.gained, outcome: r.outcome, tier: r.tier, heart: r.heart, adv: a };
  }

  const pick = (arr) => arr[R.int(arr.length)];

  // --- End of day ---------------------------------------------------------
  function endDay() {
    const events = [];
    const returns = [];
    const goldAtDusk = state.gold;   // for the overnight ledger chip

    // 0) Solo hunters return from the day's hunt (routines module).
    if (GH.routines) GH.routines.settleHunts(state, events);

    // 1) Progress expeditions; settle those that arrive today.
    state.expeditions.forEach((exp) => { exp.daysLeft -= 1; });
    const arriving = state.expeditions.filter((exp) => exp.daysLeft <= 0);
    state.expeditions = state.expeditions.filter((exp) => exp.daysLeft > 0);
    arriving.forEach((exp) => { const r = settleExpedition(exp); if (r) returns.push(r); });

    // 2) Ongoing expeditions tax the party (no beds, no meals in the field).
    state.expeditions.forEach((exp) => {
      exp.partyIds.map(findAdv).filter(Boolean).forEach((a) => {
        a.fed = Math.max(0, a.fed - 12); a.rested = Math.max(0, a.rested - 12); a.happy = Math.max(0, a.happy - 4);
      });
    });

    // 3) Nightly routines — the roster acts on its own (auto/train/hunt/rest/social).
    if (GH.routines) GH.routines.execute(state, events);

    // 4) Upkeep for everyone at the hall (not away, not out hunting).
    const atHall = state.roster.filter((a) => a.status !== 'away' && a.status !== 'hunting').length;
    const wellRested = atHall <= bedsCount();
    const chapelHappy = facLevel('chapel') * 3;
    const bathRest = facLevel('bathhouse') * 6;
    const infirmaryBonus = Math.min(facLevel('infirmary'), 2);
    state.roster.slice().forEach((a) => {
      a.actedToday = false; a._talkedToday = false; a._respondedToday = false; a._flirtedToday = false; a._rebuffedToday = false;
      a._topicsToday = [];
      if (a.promised) a.loyalty = 100;   // the ribbon holds: a promised heart never wavers
      if (a.grieving > 0) a.grieving -= 1;
      if (!a.grieving && a.vowPending) {   // mourning ends as cold resolve
        a.vowDays = 7;
        a.loyalty = Math.min(100, Math.max(a.loyalty, 25) + 15);   // purpose renews them
        a.happy = Math.max(a.happy, 30);
        log(`${a.name} rises from mourning with cold fire in their eyes: "For ${a.vowPending.split(' ')[0]}." (+1 to all rolls, 7 days)`, 'win');
        if (GH.bios) GH.bios.deed(a, `Rose from mourning with a vow: "For ${a.vowPending.split(' ')[0]}."`);
        a.vowPending = null;
      }
      if (a.status === 'away' || a.status === 'hunting') return;
      if (a.status === 'injured') {
        a.injuryDays -= 1 + infirmaryBonus;
        if (a.injuryDays <= 0) { a.status = 'idle'; a.hp = a.maxHp; events.push(`${a.name} has recovered.`); }
      }
      a.fed = Math.max(0, a.fed - 22);
      a.happy = Math.max(0, Math.min(100, a.happy - 8 + chapelHappy));
      a.rested = Math.min(100, a.rested + (wellRested ? 45 : 18) + bathRest);
      if (a.fed <= 0) { a.happy = Math.max(0, a.happy - 12); a.loyalty = Math.max(0, a.loyalty - 6); }
      if (a.happy < 15) a.loyalty = Math.max(0, a.loyalty - 6);
      if (a.loyalty <= 0 && !a.grieving && !a.vowPending) {   // mourners stay — they have something to finish
        state.roster = state.roster.filter((x) => x.id !== a.id);
        events.push(`${a.name} quit the guild in disgust.`);
        log(`${a.name} quit — morale and loyalty bottomed out.`, 'loss');
      }
    });

    // 5) Banter between hallmates (relationships module, if present).
    if (GH.social) { const b = GH.social.dailyBanter(state); if (b) { log(b, 'event'); events.push(b); } }

    // 6) Outbreaks tick down / spawn.
    tickOutbreaks(events);
    if (GH.rift) GH.rift.tick(state, events);   // Era III: the rift surges

    // 6b) Endless: the tide rises every 5 survived days.
    if (state.endless) {
      const survived = state.day + 1 - state.endless.startedDay;
      const newWave = 1 + Math.floor(survived / 5);
      if (newWave > state.endless.wave) {
        state.endless.wave = newWave;
        events.push(`🌊 Wave ${newWave} — the tide rises. Outbreaks come faster and hit harder.`);
        log(`🌊 Wave ${newWave} breaks upon the realm.`, 'crisis');
      }
    }

    state.day += 1;
    if (state.day % 7 === 1) {
      // 📜 the week's report card — a rhythm to plan around
      if (state.week) {
        const rc = state.records || { contracts: 0 };
        const dGold = state.gold - state.week.gold;
        const dRep = state.reputation - state.week.rep;
        const dCon = (rc.contracts || 0) - state.week.contracts;
        const dLost = state.fallen.length - state.week.fallen;
        log(`📜 Week ${Math.floor(state.day / 7)} report: ${dCon} contract${dCon === 1 ? '' : 's'} worked, ${dGold >= 0 ? '+' : ''}${dGold}g, ${dRep >= 0 ? '+' : ''}${dRep} renown${dLost ? `, ${dLost} lost to the field` : ', no losses'}.`, 'turn');
      }
      state.week = { gold: state.gold, rep: state.reputation, contracts: (state.records && state.records.contracts) || 0, fallen: state.fallen.length };
      const rent = RENT + (state.endless ? 6 * state.endless.wave : 0);   // the siege economy: holding the line costs more every wave
      if (state.gold >= rent) { state.gold -= rent; log(`Weekly upkeep paid (−${rent}g${state.endless ? ' — siege prices' : ''}).`, 'event'); }
      else { state.reputation = Math.max(0, state.reputation - 3); log(`Couldn't cover upkeep! Reputation suffers.`, 'loss'); }
    }
    // The dimming: ember-glass loses its light across the realm a little every
    // night. A dark hall is a shamed hall — morale goes with the lamps. Burning
    // undimmed Old Age glass is the only way to put it back.
    if (state.light == null) state.light = 72;
    state.light = Math.max(0, state.light - 1);
    if (state.light <= 30) {
      const bite = state.light <= 15 ? 3 : 1;
      state.roster.forEach((a) => { a.happy = Math.max(0, (a.happy || 0) - bite); });
      events.push(state.light <= 15
        ? 'The lamps are guttering. The hall works in half-dark, and everyone feels it.'
        : 'The ember-lamps are dimming. Someone mutters about it over supper.');
    }

    tickBoard(events);   // the board lives: contracts age out, rivals poach, new work arrives
    if (GH.rival) GH.rival.tick(state, events);   // Vane's crews bid on tomorrow's rich work (Era II)
    if (GH.story) GH.story.onNewDay(state);
    if (GH.events) GH.events.endOfDay(state, events);   // world events, festivals, milestones
    const storyBeats = GH.story ? GH.story.takePending(state) : [];
    // Overnight ledger: one number that says how the night went, without
    // opening the chronicle. Rendered as a top-bar chip next to gold.
    state.dayLedger = { day: state.day, delta: state.gold - goldAtDusk };
    log(`— Day ${state.day} —`, 'turn');
    events.forEach((e) => log(e, 'event'));
    emit();
    return { events, returns, status: status(), story: storyBeats };
  }

  // --- Sandbox tools ------------------------------------------------------
  const sandbox = {
    gold(n) { state.gold += n; log(`Sandbox: +${n} gold.`, 'recover'); emit(); },
    mats() { D.MATERIALS.forEach((m) => GH.items.addMat(state.inventory, m.id, 5)); log('Sandbox: +5 of every material.', 'recover'); emit(); },
    recruit() { if (state.roster.length < bedsCount()) { const a = PF.generate({ spriteIndex: state.roster.length, taken: state.roster.map((r) => r.name) }); state.roster.push(a); log(`Sandbox: ${a.name} joins.`, 'recruit'); emit(); } },
    unlockAll() { D.ZONES.forEach((z) => { if (!state.zonesUnlocked.includes(z.id)) state.zonesUnlocked.push(z.id); }); refreshBoard(); log('Sandbox: all regions unlocked.', 'recruit'); emit(); },
    needs() { state.roster.forEach((a) => { a.fed = 100; a.rested = 100; a.happy = 100; a.loyalty = 100; if (a.status === 'injured') { a.status = 'idle'; a.injuryDays = 0; a.hp = a.maxHp; } }); log('Sandbox: roster fully restored.', 'recover'); emit(); },
    maxFacilities() { Object.keys(state.facilities).forEach((id) => { state.facilities[id] = D.FACILITIES[id].max; }); log('Sandbox: facilities maxed.', 'recover'); emit(); },
    rep(n) { state.reputation += n; emit(); },
  };

  // --- Win / loss ---------------------------------------------------------
  function status() {
    if (state.mode === 'sandbox') return { over: false };   // free play never ends
    if (state.mode === 'challenge' && GH.challenges) {
      const cs = GH.challenges.evaluate(state);
      if (cs.over) return cs;
    }
    if (state.endless) {
      // holding the line: no victory remains — only survival
      const days = state.day - state.endless.startedDay;
      if (state.roster.length === 0) { recordEndless(days); return { over: true, won: false, endlessDays: days, best: endlessBest(), msg: `The line broke after ${days} days. The tide takes the hall.` }; }
      if (state.gold <= -100) { recordEndless(days); return { over: true, won: false, endlessDays: days, best: endlessBest(), msg: `Bankrupt after ${days} days holding the line.` }; }
      return { over: false };
    }
    // Era III: close the Sleeper's gate, or lose the realm to three
    // unanswered gates. The overrun defeat still offers NG+ (st.overrun).
    if ((state.era || 1) === 3 && state.rift) {
      if (state.rift.won) return { over: true, won: true, msg: 'The last gate is shut. The Sleeper turns over in its long dark, and the song beneath the ash finally ends. Three charters, one hall, a realm that owes it everything.' };
      if (state.rift.gatesMissed >= (GH.rift ? GH.rift.MISS_LIMIT : 3)) {
        return { over: true, won: false, overrun: true, msg: 'Three gates stood unanswered. The rift takes the marches, then the roads, then the sky. The hall\'s banner is the last thing to burn.' };
      }
    }
    // Era II win: every Marches boss down AND Vane's company contained
    // (no region at sway). Dormant until the tier-6+ zones land — the
    // marches.length guard stops an empty-set instant win.
    if ((state.era || 1) === 2) {
      const marches = D.ZONES.filter((z) => z.tier >= 6);
      if (marches.length && marches.every((z) => state.bossDone[z.id])
          && (!GH.rival || GH.rival.maxPressure(state) < GH.rival.SWAY)) {
        return { over: true, won: true, msg: "The Marches fly your colours and Vane's company is outbid across the realm. A second legend is made." };
      }
    }
    // Era-I win conditions only apply in Era I — a guild that took the new
    // charter (era 2, the Marches) plays on; its win arrives with the Marches
    // bosses + rival containment (built in later slices). Losses always bite.
    if ((state.era || 1) === 1) {
      // Era I spans the five heartland regions only — the Marches (tier 6+)
      // belong to Era II and must not gate the first campaign's victory.
      const allBosses = D.ZONES.filter((z) => z.tier <= 5).every((z) => state.bossDone[z.id]);
      if (allBosses) return { over: true, won: true, msg: 'Every region pacified, every boss felled. Your guild is legend — and a new charter awaits.' };
      if (state.reputation >= 120) return { over: true, won: true, msg: 'Your guild is the talk of the realm. A legend is made.' };
    }
    if (state.roster.length === 0) return { over: true, won: false, msg: 'The last adventurer walked out. The guild is finished.' };
    if (state.gold <= -100) return { over: true, won: false, msg: 'Bankrupt. The creditors take the hall.' };
    return { over: false };
  }

  // --- Era II: the Marches charter (pacing plan, approved 2026-08-02) ------
  // Requires a graded Era-I victory (ui stores g.victory at the win screen).
  function beginEra2() {
    if ((state.era || 1) !== 1 || !state.victory) return { ok: false, msg: 'The Compact only extends the new charter to a victorious hall.' };
    state.era = 2;
    state.eraLog = [Object.assign({ era: 1 }, state.victory)];
    log('⚑ The Compact extends a new charter — the Marches are open. Seasons turn in the east. (Era II)', 'win');
    // Catch-up unlocks: the sunken boss-chain refused Thornmere while era 1,
    // and a rep-path victor may never have killed it — the rep gate covers
    // that road. Then seed the new regions' boards.
    recheckUnlocks();
    unlockByReputation();
    topUpBoard();
    if (GH.story) GH.story.check(state);
    emit();
    return { ok: true };
  }

  // --- Era III: the Rift. Requires a graded Era-II victory (g.victory2). ---
  function beginEra3() {
    if ((state.era || 1) !== 2 || !state.victory2) return { ok: false, msg: 'The rift answers only a hall that has taken the Marches.' };
    state.era = 3;
    state.eraLog = (state.eraLog || []).concat([Object.assign({ era: 2 }, state.victory2)]);
    state.rift = { stage: 0, gatesMissed: 0, nextSurge: state.day + 3, won: false };
    if (state.story) state.story.objective = 'Close the rift gates. Do not let three stand unanswered.';
    log('⛧ The Choir\'s song rises from under the ash — the first seal is splitting. (Era III: The Rift)', 'crisis');
    if (GH.story) GH.story.check(state);
    emit();
    return { ok: true };
  }

  // --- Charter points: account-wide, earned by finishing Era III, spent on
  // NG+ boons. Separate store key so S.clear()/new games never touch them.
  const PTS_KEY = 'guildhall_charter_points';
  function charterPoints() { try { return parseInt(GH.store.get(PTS_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  function addCharterPoints(n) { try { GH.store.set(PTS_KEY, String(charterPoints() + n)); } catch (e) {} }
  function spendCharterPoints(n) {
    const c = charterPoints();
    if (c < n) return false;
    try { GH.store.set(PTS_KEY, String(c - n)); } catch (e) {}
    return true;
  }

  // --- Persistence --------------------------------------------------------
  function persist() { try { GH.store.set(SAVE, JSON.stringify(state)); } catch (e) {} }
  function migrate(s) {
    if (!s) return s;
    if (!s.inventory) s.inventory = GH.items.emptyInventory();
    if (!s.inventory.mats) s.inventory.mats = {};
    if (!s.inventory.gear) s.inventory.gear = {};
    if (!s.zonesUnlocked) s.zonesUnlocked = ['greenfields'];
    if (!s.bossDone) s.bossDone = {};
    if (!s.selectedZone) s.selectedZone = s.zonesUnlocked[0] || 'greenfields';
    if (!s.expeditions) s.expeditions = [];
    // An EXISTING save keeps the yard and the forge it already paid for —
    // they only became "buildable" for new guilds. A save with no facilities
    // block at all predates the whole system and is treated as fully built.
    // Only a save written BEFORE they became buildable can be missing the key —
    // newGame writes an explicit 0 for an unraised plot (see above).
    // ⚠️ This `else` used to bind to the VILLAGE check below it, so the backfill
    // only ran for saves that already had a village block. A genuinely old save
    // — one from before village lots existed, which is exactly the save this
    // defends — skipped it entirely and lost the yard and forge it had paid for.
    if (!s.facilities) s.facilities = { dormitory: 1, kitchen: 1, training: 1, smithy: 1 };
    else ['training', 'smithy'].forEach((k) => { if (s.facilities[k] == null) s.facilities[k] = 1; });
    if (!s.village) s.village = {};   // pre-lot saves: every lot starts vacant
    // Boards saved before the no-repeat title fix can already hold two open
    // contracts with the same name in the same zone — which is what "completed
    // missions show up again" looks like from the outside. Drop the younger
    // duplicate once, on load; generation keeps it from recurring.
    if (Array.isArray(s.board)) {
      const seen = new Set();
      s.board = s.board.filter((j) => {
        if (j.isBoss || j.status !== 'open') return true;
        const k = j.zoneId + '|' + j.title;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    // A save from before difficulty existed was balanced at the default, so
    // that is what it keeps — never a tier the player did not choose.
    if (!D.DIFFICULTIES[s.difficulty]) s.difficulty = D.DEFAULT_DIFFICULTY;
    if (s.light == null) s.light = 72;
    if (!s.teams) s.teams = [];
    if (!s.fallen) s.fallen = [];
    if (!s.outbreaks) s.outbreaks = [];
    if (s.prestige == null) s.prestige = 0;
    if (s.era == null) s.era = 1;
    if (!s.rival) s.rival = { rep: 0, holdings: {} };
    if (!s.staffChat) s.staffChat = {};
    // s.endless persists as-is if present
    if (!s.legacyFallen) s.legacyFallen = [];
    if (!s.tutorial) s.tutorial = { step: 0, done: true };   // pre-tutorial saves skip the tour
    (s.roster || []).forEach((a) => {
      if (!a.archetype) a.archetype = GH.personality.assign();
      if (a.affinity == null) { a.affinity = 0; a.heartsSeen = 0; a.sworn = false; }
      if (!a.routine) { a.routine = 'auto'; a.routineSkill = null; }
      // routines.planOf translates the old whole-day routine into two slots,
      // so an existing save keeps whatever the player had already chosen.
      if (GH.routines && GH.routines.planOf) GH.routines.planOf(a);
      if (a.classAdv === undefined) a.classAdv = null;
    });
    if (!s.story) s.story = { seen: {}, objective: '', log: [], pending: [] };
    if (!s.mode) s.mode = 'campaign';
    (s.roster || []).forEach((a) => { if (!a.gear) a.gear = { weapon: null, armor: null, trinket: null }; if (!a.bonds) a.bonds = {}; });
    return s;
  }
  function load() { try { const r = GH.store.get(SAVE); if (r) { state = migrate(JSON.parse(r)); return state; } } catch (e) {} return null; }

  // Restore a pasted backup (export/import — survives WebView storage eviction).
  function importSave(raw) {
    try {
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.roster) || s.day == null) return { ok: false, msg: 'That does not look like a guild save.' };
      state = migrate(s);
      persist(); emit();
      return { ok: true };
    } catch (e) { return { ok: false, msg: 'Could not read that backup (invalid JSON).' }; }
  }
  function clear() { try { GH.store.remove(SAVE); } catch (e) {} state = null; }
  function hasSave() { try { return !!GH.store.get(SAVE); } catch (e) { return false; } }

  return {
    onChange, emit, get, newGame, newGamePlus, startEndless, endlessBest, refreshBoard, idle, findAdv, findJob, bedsCount, expeditions,
    dispatch, dispatchTeam, spawnOutbreak, cook, train, recruit, talk, respondTalk, askTopic, flirt, endDay, status,
    autoEquip, junkPreview, sellJunk,
    hallMeet, buyRound, staffTalk,
    selectZone, craft, equip, unequip, gift, sandbox, setRoutine, promote, burnGlass,
    difficulty, difficultyId, setDifficulty, useWing, wingUsedToday,
    setSlot, autoAssignAll, slotCraft, remedies, addRemedy, useRemedy,
    zoneAllowed, recheckUnlocks, beginEra2, beginEra3,
    charterPoints, addCharterPoints, spendCharterPoints,
    facLevel, trainCost, maxCraftTier, craftGold, upgradeCost, upgrade,
    villageLot, villageBuilt, villageCount, raiseLot,
    load, clear, hasSave, persist, importSave,
    BEDS, YOUR_CUT, TRAIN_COST, RECRUIT_COST, RENT,
  };
})();
