/* World events — a storyteller-lite for the realm (RimWorld/Kairosoft pattern).
 * Runs once per dawn from sim.endDay. Three rules keep it fair and fresh:
 *   1. Calendar landmarks: a festival every 10th day, announced the day before,
 *      so every stretch of play has something to plan toward.
 *   2. Mercy scalar: recent deaths / live outbreaks / low morale suppress
 *      negative "spice" events and favor comfort — the realm eases up when
 *      the hall is bleeding (players quit at pile-ons, not at challenge).
 *   3. Cooldown: at most one random event per day, none two days in a row.
 * Everything surfaces through the log/day-report stream — never a popup.
 * Also owns the Chronicle milestone ladder (in-fiction achievements).
 */
window.GH = window.GH || {};

GH.events = (function () {
  const R = GH.rng;
  const first = (a) => a.name.split(' ')[0];
  const atHall = (st) => st.roster.filter((a) => a.status !== 'away' && a.status !== 'hunting');

  function logK(st, text, kind) { st.log.unshift({ text, kind: kind || 'event', day: st.day }); }

  // How hard is the hall hurting right now? 0 = thriving, 4+ = bleeding.
  function tension(st) {
    const recentDeaths = (st.fallen || []).filter((f) => f.day >= st.day - 4).length;
    const avgHappy = st.roster.length
      ? st.roster.reduce((s, a) => s + a.happy, 0) / st.roster.length : 60;
    return 3 * recentDeaths + 2 * (st.outbreaks || []).length +
      (avgHappy < 40 ? 2 : 0) + (st.gold < 40 ? 1 : 0);
  }

  // ---------------------------------------------------------------------
  // Random events. cond(st) gates, run(st) applies effects and returns the
  // day-report line (or null to abort). tier: comfort | flavor | spice.
  const EVENTS = [
    {
      id: 'patron_gift', tier: 'comfort', weight: 3,
      cond: (st) => st.reputation >= 10,
      run(st) {
        const g = 15 + R.int(26);
        st.gold += g;
        const who = R.pick(['an old patron', 'a grateful farmstead', 'the Merchant Guild', 'a rescued caravaneer']);
        return `A courier brings a purse from ${who} — +${g}g, "for services the ledgers forgot."`;
      },
    },
    {
      id: 'merchant_gift', tier: 'comfort', weight: 3,
      cond: () => true,
      run(st) {
        const mats = R.shuffle(['iron', 'iron', 'silver']).slice(0, 2);
        mats.forEach((m) => GH.items.addMat(st.inventory, m, 1));
        return 'A traveling smith shelters the night in your yard and leaves ore in thanks.';
      },
    },
    {
      id: 'memorial_candle', tier: 'comfort', weight: 4,
      cond: (st) => (st.fallen || []).length > 0 && st.roster.length > 0,
      run(st) {
        const hero = R.pick(st.fallen);
        st.roster.forEach((a) => { a.loyalty = Math.min(100, a.loyalty + 3); a.happy = Math.min(100, a.happy + 2); });
        return `Someone lit a candle under ${hero.name}'s portrait in the night. Nobody claims it. The hall stands a little taller. (+3 loyalty)`;
      },
    },
    {
      id: 'minstrel', tier: 'comfort', weight: 2,
      cond: (st) => st.reputation >= 15,
      run(st) {
        atHall(st).forEach((a) => { a.happy = Math.min(100, a.happy + 6); });
        st.reputation += 1;
        return 'A minstrel plays "The Ballad of the Hall" in the village square — your deeds, embroidered shamelessly. (+1 rep, the roster hums it all day)';
      },
    },
    {
      id: 'training_breakthrough', tier: 'comfort', weight: 2,
      cond: (st) => atHall(st).some((a) => a.status === 'idle'),
      run(st) {
        const idle = atHall(st).filter((a) => a.status === 'idle');
        const a = R.pick(idle);
        const skill = Object.keys(a.skills).find((s) => GH.pf.canTrain(a, s).ok);
        if (!skill) return null;
        GH.pf.train(a, skill);
        return `${first(a)} has a breakthrough drilling at dawn — ${GH.data.SKILL_LABEL[skill]} improves on their own time.`;
      },
    },
    {
      id: 'stray_cat', tier: 'comfort', weight: 1,
      cond: (st) => !st.hallCat,
      run(st) {
        st.hallCat = true;
        atHall(st).forEach((a) => { a.happy = Math.min(100, a.happy + 6); });
        return 'A one-eared cat has decided the hearth belongs to it. The roster has collectively decided the cat is staff. (The hall keeps a little more cheer each night.)';
      },
    },
    {
      id: 'veteran_visitor', tier: 'comfort', weight: 2,
      cond: (st) => st.reputation >= 20 && st.roster.length < (GH.sim.bedsCount ? GH.sim.bedsCount() : 6) && !st.visitor,
      run(st) {
        const adv = GH.pf.generate({ spriteIndex: st.roster.length, taken: st.roster.map((r) => r.name) });
        adv.level = 2; adv.xp = 0;
        st.visitor = { adv, price: 40, expiresDay: st.day + 3 };
        return `${adv.name}, a seasoned ${adv.ancestry} ${adv.class}, takes a room at the tavern — drawn by your banner. They'd sign for just ${st.visitor.price}g (next recruit, ${st.visitor.expiresDay - st.day} days).`;
      },
    },
    {
      id: 'childhood_friend', tier: 'flavor', weight: 1,
      cond: (st) => st.roster.length >= 3,
      run(st) {
        const pair = R.shuffle(st.roster).slice(0, 2);
        const [a, b] = pair;
        if (GH.social.bondOf(a, b) >= 30) return null;
        a.bonds = a.bonds || {}; b.bonds = b.bonds || {};
        a.bonds[b.id] = (a.bonds[b.id] || 0) + 25;
        b.bonds[a.id] = (b.bonds[a.id] || 0) + 25;
        return `Over supper it comes out: ${first(a)} and ${first(b)} grew up two villages apart and know all the same terrible songs. The hall suffers a duet.`;
      },
    },
    {
      id: 'quiet_day', tier: 'flavor', weight: 3,
      cond: (st) => st.roster.length > 0,
      run(st) {
        const a = R.pick(st.roster);
        return R.pick([
          `${first(a)} reorganizes the trophy wall. Again. It is exactly as it was.`,
          `Rain drums the roof all day. ${first(a)} wins forty hands of cards and all of them are suspicious.`,
          `The smith's apprentice comes to sharpen knives and stays three hours for the stew.`,
          `${first(a)} claims to have seen the hall cat catch a rat the size of a boot. The boot grows with each telling.`,
        ]);
      },
    },
    {
      id: 'harvest_feast', tier: 'comfort', weight: 2,
      cond: (st) => atHall(st).length > 0,
      run(st) {
        atHall(st).forEach((a) => { a.fed = Math.min(100, a.fed + 15); a.happy = Math.min(100, a.happy + 3); });
        return 'The village sends up a harvest cart — bread still warm, a wheel of cheese, and apples enough to juggle. The hall eats like kings.';
      },
    },
    {
      id: 'wandering_healer', tier: 'comfort', weight: 2,
      cond: (st) => st.roster.some((a) => a.status === 'injured'),
      run(st) {
        const hurt = st.roster.find((a) => a.status === 'injured');
        hurt.status = 'idle'; hurt.injuryDays = 0; hurt.hp = hurt.maxHp;
        return `A wandering healer trades a night's lodging for their craft — ${first(hurt)} is back on their feet by morning.`;
      },
    },
    {
      id: 'bard_epic', tier: 'comfort', weight: 1,
      cond: (st) => (st.fallen || []).length > 0 && st.reputation >= 10,
      run(st) {
        const hero = R.pick(st.fallen);
        atHall(st).forEach((a) => { a.happy = Math.min(100, a.happy + 5); });
        st.reputation += 1;
        return `A bard debuts "The Last Stand of ${hero.name}" in the tavern. Not a dry eye, and the tale travels. (+1 rep)`;
      },
    },
    {
      id: 'training_rivalry', tier: 'flavor', weight: 2,
      cond: (st) => atHall(st).filter((a) => a.status === 'idle').length >= 2,
      run(st) {
        const idle = R.shuffle(atHall(st).filter((a) => a.status === 'idle')).slice(0, 2);
        const ups = [];
        idle.forEach((a) => { a.rested = Math.max(0, a.rested - 5); GH.pf.addXp(a, 8).forEach((e) => ups.push(e)); });
        return `${first(idle[0])} and ${first(idle[1])} turn morning drills into a contest and won't stop until the cook rings the bell. (+8 XP each)${ups.length ? ' ' + ups.join(' ') : ''}`;
      },
    },
    {
      id: 'nightmare', tier: 'spice', weight: 1,
      cond: (st) => st.roster.some((a) => (a.scars || []).length),
      run(st) {
        const a = st.roster.find((x) => (x.scars || []).length);
        const scar = a.scars[0];
        a.happy = Math.max(0, a.happy - 4); a.rested = Math.max(0, a.rested - 8);
        return `${first(a)} wakes before dawn, hand pressed to the ${scar.name}. Some lessons cost sleep long after they're learned.`;
      },
    },
    {
      id: 'rook_rumors', tier: 'spice', weight: 2,
      cond: (st) => st.reputation >= 20,
      run(st) {
        st.reputation = Math.max(0, st.reputation - 1);
        return 'Rook Vane\'s agents spread word your hall pads its invoices. Baseless — but mud sticks. (−1 rep)';
      },
    },
    {
      id: 'rat_pantry', tier: 'spice', weight: 2,
      cond: (st) => atHall(st).length > 0,
      run(st) {
        atHall(st).forEach((a) => { a.fed = Math.max(0, a.fed - 8); });
        return 'Rats got into the pantry overnight. Breakfast is thin and opinions about it are not.';
      },
    },
    {
      id: 'sparring_brawl', tier: 'spice', weight: 2,
      cond: (st) => st.roster.some((a) => st.roster.some((b) => b.id !== a.id && GH.social.bondOf(a, b) <= GH.social.RIVAL)),
      run(st) {
        const a = st.roster.find((x) => st.roster.some((b) => b.id !== x.id && GH.social.bondOf(x, b) <= GH.social.RIVAL));
        const b = st.roster.find((x) => x.id !== a.id && GH.social.bondOf(a, x) <= GH.social.RIVAL);
        [a, b].forEach((x) => { x.rested = Math.max(0, x.rested - 15); });
        a.bonds[b.id] -= 4; b.bonds[a.id] -= 4;
        return `"Sparring practice" between ${first(a)} and ${first(b)} breaks a bench and nearly a nose. Both sleep badly and neither apologizes.`;
      },
    },
  ];

  // ---------------------------------------------------------------------
  // Chronicle milestones — fire once, in-fiction, through the log.
  const MILESTONES = [
    { id: 'day10', test: (st) => st.day >= 10, text: 'Ten days under the banner. The village stops saying "the new hall."' },
    { id: 'day25', test: (st) => st.day >= 25, text: 'Twenty-five days. The chronicle needs a second page.' },
    { id: 'day50', test: (st) => st.day >= 50, text: 'Fifty days. Children in the square play "guildmaster" now.' },
    { id: 'day100', test: (st) => st.day >= 100, text: 'One hundred days. They will tell of this hall for a generation.' },
    { id: 'rep25', test: (st) => st.reputation >= 25, text: 'Your name carries to the next county — 25 renown.' },
    { id: 'rep50', test: (st) => st.reputation >= 50, text: 'Nobles request YOUR people by name — 50 renown.' },
    { id: 'rep100', test: (st) => st.reputation >= 100, text: 'A hundred renown. Rival halls study your ledgers.' },
    { id: 'boss1', test: (st) => Object.keys(st.bossDone || {}).length >= 1, text: 'First great beast slain. The trophy wall begins.' },
    { id: 'bossAll', test: (st) => Object.keys(st.bossDone || {}).length >= 5, text: 'Every terror of the realm has fallen to your banner.' },
    { id: 'roster6', test: (st) => st.roster.length >= 6, text: 'Six blades under one roof — a proper company now.' },
    { id: 'roster8', test: (st) => st.roster.length >= 8, text: 'Eight strong. The dormitory sounds like a barracks.' },
    { id: 'gold500', test: (st) => st.gold >= 500, text: 'Five hundred gold in the strongbox. The lean days feel far away.' },
    { id: 'gold1000', test: (st) => st.gold >= 1000, text: 'A thousand gold. The Merchant Guild sends wine and flattery.' },
    { id: 'sworn1', test: (st) => st.roster.some((a) => a.sworn), text: 'Someone has sworn their blade to you for life.' },
    { id: 'partner1', test: (st) => st.roster.some((a) => a.partnerId), text: 'Two of yours are bound to each other now. The hall pretends not to gossip. The hall gossips.' },
    { id: 'fallen1', somber: true, test: (st) => (st.fallen || []).length >= 1, text: 'The first name is carved on the memorial wall. It will not be forgotten.' },
    { id: 'prestige1', test: (st) => (st.prestige || 0) >= 1, text: 'A second charter. Few guildmasters ever raise one banner — you raise another.' },
  ];

  function checkMilestones(st) {
    st.milestones = st.milestones || {};
    MILESTONES.forEach((m) => {
      if (st.milestones[m.id] || !m.test(st)) return;
      st.milestones[m.id] = st.day;
      logK(st, m.somber ? `🕯 Chronicle: ${m.text}` : `🏆 Chronicle: ${m.text}`, m.somber ? 'event' : 'win');
    });
  }

  // ---------------------------------------------------------------------
  // Dawn tick. `events` is sim.endDay's day-report array (lines pushed here
  // are also logged as kind 'event' by the sim).
  function endOfDay(st, events) {
    if (st.roster) st.roster.forEach((a) => { if (a.vowDays > 0) a.vowDays -= 1; });

    // hall cat: a little cheer every night, forever
    if (st.hallCat) atHall(st).forEach((a) => { a.happy = Math.min(100, a.happy + 1); });

    // visitor offer quietly expires
    if (st.visitor && st.day > st.visitor.expiresDay) {
      events.push(`${st.visitor.adv.name} settles their tavern bill and moves on down the road.`);
      st.visitor = null;
    }

    // calendar landmarks (skip the opening days)
    if (st.day >= 5 && st.day % 10 === 9) {
      events.push('A herald posts notices: the Festival of Banners is TOMORROW. The roster is already arguing about the tourney bracket.');
    }
    if (st.day >= 5 && st.day % 10 === 0) {
      const here = atHall(st);
      here.forEach((a) => {
        a.happy = Math.min(100, a.happy + 10);
        a.affinity = Math.min(100, (a.affinity || 0) + 2);
      });
      const champ = here.length ? R.pick(here) : null;
      events.push(`🎏 Festival of Banners! The village square fills with stalls and colors${champ ? `, and ${first(champ)} takes the sparring tourney to roars from the crowd` : ''}. (+10 cheer at the hall)`);
      logK(st, '🎏 The Festival of Banners lifts every heart at the hall.', 'win');
    } else {
      // random event: at most one, never two days running, mercy-gated
      st.lastEventDay = st.lastEventDay || 0;
      const calm = tension(st) === 0;
      const hurting = tension(st) >= 4;
      // The inverse of mercy: a rich, untroubled guild draws attention.
      // (RimWorld's wealth rule — keeps a coasting midgame from going flat.)
      const prosperous = calm && st.gold >= 600;
      if (st.day - st.lastEventDay >= 2 && st.day >= 3 && R.chance(hurting ? 0.5 : prosperous ? 0.55 : 0.4)) {
        let pool = EVENTS.filter((e) => e.cond(st));
        if (hurting) pool = pool.filter((e) => e.tier === 'comfort');           // mercy
        else if (!calm) pool = pool.filter((e) => e.tier !== 'spice');          // no pile-ons
        else if (prosperous) {
          const spice = pool.filter((e) => e.tier === 'spice');
          if (spice.length && R.chance(0.6)) pool = spice;
        }
        if (pool.length) {
          const ev = R.weighted(pool);
          const line = ev.run(st);
          if (line) { events.push(line); st.lastEventDay = st.day; }
        }
      }
    }

    checkMilestones(st);
  }

  return { endOfDay, tension, EVENTS, MILESTONES };
})();
