/* Pathfinder-flavored character model: generation, derived stats, training.
 * Open mechanics, original flavor — no proprietary text.
 */
window.GH = window.GH || {};

GH.pf = (function () {
  const D = GH.data, R = GH.rng;
  let _id = 0;
  const uid = () => 'adv_' + (++_id) + '_' + R.int(99999);

  const mod = (score) => Math.floor((score - 10) / 2);

  function applyBoost(scores, ab) {
    if (ab === 'free') {
      // assign free boost to the currently lowest-but-useful score (random among lowest)
      const min = Math.min(...D.ABILITIES.map((k) => scores[k]));
      const cands = D.ABILITIES.filter((k) => scores[k] === min);
      ab = R.pick(cands);
    }
    scores[ab] += 2;
    return ab;
  }

  // Avoid handing out a name someone in the hall already answers to. Both
  // pools are small (22 firsts, 14 epithets), so give up gracefully rather
  // than spin once a pool is exhausted.
  function pickUnused(pool, used) {
    let v = R.pick(pool);
    for (let i = 0; used.has(v) && i < 40 && used.size < pool.length; i++) v = R.pick(pool);
    return v;
  }
  function pickName(taken) {
    const names = (taken || []).map(String);
    const first = pickUnused(D.FIRST, new Set(names.map((n) => n.split(' ')[0])));
    const last = pickUnused(D.LAST, new Set(names.map((n) => n.split(' ').slice(1).join(' '))));
    return first + ' ' + last;
  }

  function generate(opts = {}) {
    const ancestry = opts.ancestry || R.pick(D.ANCESTRIES);
    const background = opts.background || R.pick(D.BACKGROUNDS);
    const cls = opts.cls || R.pick(D.CLASSES);
    const trait = opts.trait || R.pick(D.TRAITS);
    const level = opts.level || R.weighted([{ v: 1, weight: 5 }, { v: 2, weight: 3 }, { v: 3, weight: 1 }]).v;

    const scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    ancestry.boosts.forEach((b) => applyBoost(scores, b));
    if (ancestry.flaw) scores[ancestry.flaw] -= 2;
    background.boosts.forEach((b) => applyBoost(scores, b));
    applyBoost(scores, cls.key);                 // class key boost
    // four free boosts (PF2e), but no double-dipping into one score in a round
    let pool = D.ABILITIES.slice();
    for (let i = 0; i < 4; i++) {
      if (!pool.length) pool = D.ABILITIES.slice();
      const ab = R.pick(pool);
      pool = pool.filter((x) => x !== ab);
      scores[ab] += 2;
    }

    // Skills: start Untrained; set trained from background + class; key skill may be Expert
    const skills = {};
    Object.keys(D.SKILLS).forEach((s) => { skills[s] = 'U'; });
    skills[background.skill] = 'T';
    cls.skills.forEach((s) => { skills[s] = 'T'; });
    // signature skill bumps with level
    const sig = cls.skills[0];
    if (level >= 2) skills[sig] = 'E';
    if (level >= 3 && R.chance(0.5)) skills[background.skill] = 'E';

    const hp = ancestry.hp + (cls.hp + mod(scores.con)) * level;

    const a = {
      id: uid(),
      name: opts.name || pickName(opts.taken),
      ancestry: ancestry.name, background: background.name, class: cls.name,
      classTags: cls.tags.slice(), tint: ancestry.tint,
      trait: trait.name, traitKind: trait.kind,
      level, xp: 0,
      scores, skills,
      maxHp: hp, hp,
      // needs (0-100)
      fed: 70 + R.int(20), rested: 70 + R.int(20), happy: 60 + R.int(25),
      loyalty: 50,
      status: 'idle',          // idle | away | injured
      injuryDays: 0,
      contracts: 0,
      gear: { weapon: null, armor: null, trinket: null },
      bonds: {},
      archetype: (GH.personality ? GH.personality.assign() : 'genki'),
      affinity: 0, heartsSeen: 0, sworn: false,
      routine: 'auto',             // auto | train | hunt | rest | social
      routineSkill: null,
      classAdv: null,              // promoted class name (promotions system)
      spriteIndex: opts.spriteIndex != null ? opts.spriteIndex : 0,
    };
    return a;
  }

  // Skill modifier = ability mod + (rank flat + level if trained+) + need penalties
  function skillMod(a, skill, opts = {}) {
    const rank = a.skills[skill] || 'U';
    const base = mod(a.scores[D.SKILLS[skill]]);
    const profBonus = rank === 'U' ? 0 : (D.PROF[rank] + a.level);
    let m = base + profBonus;
    if (window.GH && GH.items) m += GH.items.skillBonus(a, skill);   // equipped gear
    if (a.sworn) m += 1;                                             // sworn bond with the Guildmaster
    if (a.vowDays > 0) m += 1;                                       // fighting in a fallen partner's name
    if (!opts.ignoreNeeds) m += needPenalty(a);
    return m;
  }

  // Low needs sap performance (the engine that makes feeding/resting matter)
  function needPenalty(a) {
    let p = 0;
    if (a.fed < 25) p -= 2; else if (a.fed < 50) p -= 1;
    if (a.rested < 25) p -= 2; else if (a.rested < 50) p -= 1;
    if (a.happy < 25) p -= 1;
    return p;
  }

  // A class's trade is supposed to mean something. CLASSES[].tags and every
  // promotion's `tagAdd` were copied onto each adventurer as `a.classTags` —
  // and then read by NOTHING, so a Fighter had no edge on a combat job over a
  // Wizard, and the "extra contract-tag affinity" data.js advertises for all
  // twelve promotions was inert. Players were paying 120-180g for it.
  const AFFINITY = 2;
  function tagAffinity(a, tag) {
    return tag && (a.classTags || []).indexOf(tag) >= 0 ? AFFINITY : 0;
  }

  // THE one place a contract modifier is computed. Resolution, the advisor and
  // the dispatch odds line each did their own arithmetic, so a bonus added to
  // one of them would have made the shown odds disagree with what the dice
  // actually did — the same defect as an attack row that prints one number and
  // rolls another. They all call this now.
  function bestSkillFor(a, tag, opts) {
    const primary = D.TAG_SKILL[tag];
    const affinity = tagAffinity(a, tag);
    return { skill: primary, affinity, mod: skillMod(a, primary, opts) + affinity };
  }

  // XP → level up at 100*level thresholds; bump a skill on level up
  function addXp(a, amount) {
    a.xp += amount;
    const events = [];
    while (a.xp >= a.level * 100 && a.level < 6) {
      a.xp -= a.level * 100;
      a.level += 1;
      a.maxHp += GH.data.CLASSES.find((c) => c.name === a.class).hp + mod(a.scores.con);
      a.hp = a.maxHp;
      events.push(`${a.name} reached level ${a.level}!`);
    }
    return events;
  }

  // Training: advance one skill one rank (caps by level: T at any, E at 2+, M at 4+, L at 6)
  function canTrain(a, skill) {
    const cur = a.skills[skill] || 'U';
    const idx = D.PROF_ORDER.indexOf(cur);
    const next = D.PROF_ORDER[idx + 1];
    if (!next) return { ok: false, reason: 'Already Legendary.' };
    const minLevel = { T: 1, E: 2, M: 4, L: 6 }[next];
    if (a.level < minLevel) return { ok: false, reason: `Needs level ${minLevel}.` };
    return { ok: true, next };
  }
  function train(a, skill) {
    const c = canTrain(a, skill);
    if (!c.ok) return c;
    a.skills[skill] = c.next;
    return { ok: true, rank: c.next };
  }

  // --- Class promotions (facility-gated, level 3+) -------------------------
  function promotionsFor(a) { return (a.classAdv ? [] : (GH.data.PROMOTIONS[a.class] || [])); }
  function canPromote(a, promo) {
    if (a.classAdv) return { ok: false, reason: 'Already promoted.' };
    if (a.level < 3) return { ok: false, reason: 'Needs level 3.' };
    for (const [fac, lvl] of Object.entries(promo.req)) {
      if (GH.sim.facLevel(fac) < lvl) return { ok: false, reason: `Needs ${GH.data.FACILITIES[fac].name} Lv${lvl}.` };
    }
    return { ok: true };
  }
  function promote(a, promo) {
    const c = canPromote(a, promo);
    if (!c.ok) return c;
    a.classAdv = promo.name;
    a.scores[promo.key] += 2;
    a.maxHp += 6; a.hp = a.maxHp;
    if (!a.classTags.includes(promo.tagAdd)) a.classTags.push(promo.tagAdd);
    a.happy = Math.min(100, a.happy + 20);
    a.loyalty = Math.min(100, a.loyalty + 10);
    return { ok: true };
  }

  return { generate, mod, skillMod, needPenalty, bestSkillFor, addXp, train, canTrain, promotionsFor, canPromote, promote, uid };
})();
