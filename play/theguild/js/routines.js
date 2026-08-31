/* The day — two slots, morning and afternoon.
 *
 * A person is not an infinite resource. Each adventurer has a MORNING and an
 * AFTERNOON, and each is one decision: rest, train a discipline, work a craft,
 * or spend it in the hall. An expedition or a solo hunt eats the whole day.
 * Auto fills a slot for you, so you can run a big guild without micromanaging
 * every name — but nothing happens invisibly any more: the plan is on the
 * character sheet before nightfall, and the hall shows people where their plan
 * put them.
 *
 * Replaces the old single hidden `a.routine`, which resolved at nightfall with
 * no way to see what anyone was about to do.
 */
window.GH = window.GH || {};

GH.routines = (function () {
  const R = GH.rng, D = GH.data;

  // Legacy: the old whole-day routine names. Kept so saves (and the routine
  // picker's callers) migrate cleanly instead of losing their settings.
  const LABELS = {
    auto: '✦ Auto — they decide',
    train: '🎯 Training drills',
    hunt: '🏹 Monster hunting (solo, next day)',
    rest: '🛏 Rest & recover',
    social: '🍺 Hall time',
  };

  /* ---- slot actions -----------------------------------------------------
   * A slot value is a string: 'auto' | 'rest' | 'hall' | 'hunt'
   *   | 'train:<branch>' | 'craft:<branch>:<itemId>'
   * 'hunt' and an active expedition occupy BOTH slots. */
  const ACTIONS = {
    auto: { name: 'Auto', icon: '✦', blurb: 'They decide, by what they need.' },
    rest: { name: 'Rest', icon: '🛏', blurb: 'Sleep it off. Restores Rested.' },
    hall: { name: 'Hall time', icon: '🍺', blurb: 'Drink, talk, build bonds.' },
    train: { name: 'Train', icon: '🎯', blurb: 'Drill a discipline.' },
    craft: { name: 'Craft', icon: '🔨', blurb: 'Work the forge or the bench.' },
    hunt: { name: 'Hunt', icon: '🏹', blurb: 'Out alone all day. XP and loot — and risk.' },
  };
  const kindOf = (slot) => String(slot || 'auto').split(':')[0];
  const argOf = (slot, i) => String(slot || '').split(':')[i] || null;
  const WHOLE_DAY = ['hunt'];
  const takesWholeDay = (slot) => WHOLE_DAY.indexOf(kindOf(slot)) >= 0;

  // A plan always exists. Old saves carry `a.routine`, so translate it rather
  // than dropping what the player had already chosen.
  const FROM_ROUTINE = { auto: 'auto', train: 'train:physical', hunt: 'hunt', rest: 'rest', social: 'hall' };
  function planOf(a) {
    if (!a.plan) {
      const legacy = FROM_ROUTINE[a.routine] || 'auto';
      a.plan = takesWholeDay(legacy) ? { am: legacy, pm: legacy } : { am: legacy, pm: 'auto' };
    }
    return a.plan;
  }
  function setSlot(a, slot, value) {
    const p = planOf(a);
    if (takesWholeDay(value)) { p.am = value; p.pm = value; return p; }
    // leaving a whole-day plan frees the other half rather than stranding it
    if (takesWholeDay(p[slot === 'am' ? 'pm' : 'am'])) p[slot === 'am' ? 'pm' : 'am'] = 'auto';
    p[slot] = value;
    return p;
  }

  /* ---- availability ------------------------------------------------------
   * A discipline you have nowhere to practise is not offered, and says why. */
  function branchOpen(kind, key) {
    const table = kind === 'train' ? D.TRAIN_BRANCHES : D.CRAFT_BRANCHES;
    const b = table[key];
    if (!b) return { ok: false, why: 'Unknown discipline.' };
    if (!b.needs) return { ok: true };
    if (GH.sim.facLevel(b.needs) > 0) return { ok: true };
    return { ok: false, why: `Needs the ${D.FACILITIES[b.needs].name} — not raised yet.` };
  }
  function trainableIn(a, branchKey) {
    const b = D.TRAIN_BRANCHES[branchKey];
    if (!b) return null;
    const open = b.skills.filter((s) => GH.pf.canTrain(a, s).ok);
    if (!open.length) return null;
    // push the ones they already have furthest, so a slot feels like progress
    open.sort((x, y) => D.PROF_ORDER.indexOf(a.skills[y]) - D.PROF_ORDER.indexOf(a.skills[x]));
    return open[0];
  }
  function bestTrainable(a) {
    for (const k of Object.keys(D.TRAIN_BRANCHES)) {
      if (!branchOpen('train', k).ok) continue;
      const sk = trainableIn(a, k);
      if (sk) return sk;
    }
    return null;
  }

  /* ---- auto -------------------------------------------------------------
   * Needs first, then a discipline they can actually use, then the hall.
   * Deliberately does NOT pick training when it cannot pay for it twice over:
   * a guild that drills itself broke loses. */
  function autoSlot(state, a, slot, already) {
    if (a.fed < 45 || a.rested < 45) return 'rest';
    if (a.status === 'injured') return 'rest';
    const cost = GH.sim.trainCost();
    const canTrain = state.gold >= cost + 80;
    if (canTrain && a.happy >= 40 && already !== 'train') {
      const keys = Object.keys(D.TRAIN_BRANCHES).filter((k) => branchOpen('train', k).ok && trainableIn(a, k));
      if (keys.length && R.chance(0.55)) return 'train:' + R.pick(keys);
    }
    if (a.rested < 70 && R.chance(0.4)) return 'rest';
    return 'hall';
  }

  /* ---- resolve one slot -------------------------------------------------- */
  function runSlot(state, a, value, events) {
    const kind = kindOf(value);
    switch (kind) {
      case 'rest':
        a.rested = Math.min(100, a.rested + 22 - (GH.seasons ? GH.seasons.restPenalty(state) : 0));
        return 'rest';
      case 'hall': {
        a.happy = Math.min(100, a.happy + 5);
        const others = state.roster.filter((o) => o.id !== a.id && o.status !== 'away' && o.status !== 'hunting');
        const other = others.length ? R.pick(others) : null;
        if (other && GH.social) {
          a.bonds = a.bonds || {}; other.bonds = other.bonds || {};
          a.bonds[other.id] = Math.min(100, (a.bonds[other.id] || 0) + 3);
          other.bonds[a.id] = Math.min(100, (other.bonds[a.id] || 0) + 3);
        }
        return 'hall';
      }
      case 'train': {
        const branch = argOf(value, 1) || 'physical';
        if (!branchOpen('train', branch).ok) return null;
        const sk = trainableIn(a, branch);
        const cost = GH.sim.trainCost();
        if (!sk || state.gold < cost) return null;
        state.gold -= cost;
        GH.pf.train(a, sk);
        a.rested = Math.max(0, a.rested - 8);   // a slot of work, not a whole day
        events.push(`${a.name.split(' ')[0]} drilled ${D.SKILL_LABEL[sk]} → ${D.PROF_LABEL[a.skills[sk]]} (−${cost}g).`);
        return 'train';
      }
      case 'craft': {
        const branch = argOf(value, 1), itemId = argOf(value, 2);
        if (!branchOpen('craft', branch).ok || !itemId) return null;
        const r = GH.sim.slotCraft(a, branch, itemId);
        if (!r.ok) { events.push(`${a.name.split(' ')[0]} could not finish the work: ${r.msg}`); return null; }
        a.rested = Math.max(0, a.rested - 8);
        events.push(r.msg);
        return 'craft';
      }
      default: return null;
    }
  }

  /* Execute the day's plans for everyone at the hall. Whole-day actions run
   * once; otherwise each slot resolves in turn. */
  function execute(state, events) {
    state.roster.forEach((a) => {
      if (a.status !== 'idle' || a.actedToday) return;
      const p = planOf(a);
      if (takesWholeDay(p.am) && kindOf(p.am) === 'hunt') {
        a.status = 'hunting';
        a.huntZone = R.pick(state.zonesUnlocked);
        events.push(`${a.name.split(' ')[0]} slipped out at dusk to hunt in ${D.ZONE_BY_ID[a.huntZone].name}.`);
        return;
      }
      let already = null;
      D.DAY_SLOTS.forEach((slot) => {
        let v = p[slot];
        if (kindOf(v) === 'auto') v = autoSlot(state, a, slot, already);
        const did = runSlot(state, a, v, events);
        if (did) already = did;
      });
    });
  }

  /* Settle hunters who have been out all day. Called at the NEXT nightfall,
   * before new plans run. Outbreaks make the wilds lethal for loners. */
  function settleHunts(state, events) {
    state.roster.forEach((a) => {
      if (a.status !== 'hunting') return;
      a.status = 'idle';
      const zone = D.ZONE_BY_ID[a.huntZone] || D.ZONES[0];
      const outbreakHere = (state.outbreaks || []).some((o) => o.zoneId === zone.id);
      const outbreakAnywhere = (state.outbreaks || []).length > 0;

      // spoils
      const xp = 12 + zone.tier * 6 + R.die(6) + (GH.sim.facLevel('library') ? GH.sim.facLevel('library') * 5 : 0);
      const ups = GH.pf.addXp(a, xp);
      let note = `${a.name.split(' ')[0]} returned from the hunt: +${xp} XP`;
      if (R.chance(0.35)) { const m = R.pick(zone.mats); GH.items.addMat(state.inventory, m, 1); note += `, 1 ${D.MAT_BY_ID[m].name}`; }

      // danger: a lone hunter during an outbreak is exposed
      let injuryChance = 0.15 + (outbreakAnywhere ? 0.12 : 0);
      const guarded = GH.items.hasGuard(a) && R.chance(0.5);
      if (outbreakHere && !guarded && R.chance(0.08)) {
        a.status = 'dead'; a.hp = 0;
        state.fallen.push({ name: a.name, class: a.class, ancestry: a.ancestry, level: a.level, day: state.day, mission: `hunting alone during the ${zone.name} outbreak` });
        const t = GH.teams.teamOf(state, a.id);
        if (t) GH.teams.mourn(state, t, a, 'a solo hunt gone wrong');
        state.roster = state.roster.filter((x) => x.id !== a.id);
        events.push(`☠ ${a.name} never came back from ${zone.name}. The outbreak got them.`);
        return;
      }
      if (!guarded && R.chance(injuryChance)) {
        a.status = 'injured'; a.injuryDays = 1;
        note += ' — limped home injured';
      }
      a.fed = Math.max(0, a.fed - 20); a.rested = Math.max(0, a.rested - 25);
      a.happy = Math.min(100, a.happy + 5);   // the wilds clear the head
      events.push(note + '.');
      ups.forEach((u) => events.push(u));
      a.huntZone = null;
      // a hunt consumed the whole day; don't silently repeat it forever
      if (a.plan && kindOf(a.plan.am) === 'hunt') a.plan = { am: 'auto', pm: 'auto' };
    });
  }

  // What a slot reads as on a card, without opening anything.
  function slotLabel(value) {
    const kind = kindOf(value);
    if (kind === 'train') {
      const b = D.TRAIN_BRANCHES[argOf(value, 1)];
      return b ? `${b.icon} ${b.name}` : '🎯 Train';
    }
    if (kind === 'craft') {
      const b = D.CRAFT_BRANCHES[argOf(value, 1)];
      const id = argOf(value, 2);
      const item = (GH.items && GH.items.gear(id)) || D.REMEDY_BY_ID[id];
      return `${b ? b.icon : '🔨'} ${item ? item.name : (b ? b.name : 'Craft')}`;
    }
    const act = ACTIONS[kind] || ACTIONS.auto;
    return `${act.icon} ${act.name}`;
  }

  return { LABELS, ACTIONS, planOf, setSlot, kindOf, argOf, takesWholeDay,
    branchOpen, trainableIn, bestTrainable, autoSlot, slotLabel, execute, settleHunts,
    // Exported so the parity vectors can pin ONE slot at a time. Reaching it
    // only through execute() makes a mismatch show up three layers away from
    // whichever branch actually diverged.
    runSlot };
})();
