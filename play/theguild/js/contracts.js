/* Contracts: generation and resolution via d20 skill checks (degrees of success). */
window.GH = window.GH || {};

GH.contracts = (function () {
  const D = GH.data, R = GH.rng, PF = GH.pf;
  let _id = 0;
  const uid = () => 'job_' + (++_id) + '_' + R.int(99999);

  // Rank band for a zone tier (1-based). Boss contracts run two ranks hotter.
  function rankForZone(tier, isBoss) {
    if (isBoss) return D.RANK_ORDER[Math.min(6, tier + 1)];
    // Clamp the way the boss line already does. The Marches run to tier 8 but
    // the rank ladder stops at S (index 6), so an unclamped tier-8 board rolled
    // RANK_ORDER[7] -> undefined -> `rk.stages` threw and took the whole board
    // generation down with it. Sandbox unlocks every zone at once so it crashed
    // on new-game; a campaign only reached it in the Ember Wastes.
    const base = Math.min(6, Math.max(0, tier - 1));
    const idx = R.weighted([{ v: base, weight: 3 }, { v: Math.min(6, base + 1), weight: 2 }]);
    return D.RANK_ORDER[idx.v];
  }

  function generate(zone, isBoss) {
    // Era II seasons color the work: harvest floods the board with escort
    // jobs. (The extra R.chance draw only happens once seasons are active,
    // so Era-I seeded runs are byte-identical.)
    const season = (GH.seasons && GH.sim) ? GH.seasons.of(GH.sim.get()) : null;
    let tag = R.pick(zone.tags);
    // Caravans cross EVERY region at harvest — escort contracts appear on all
    // boards, not just zones that happen to carry the tag.
    if (season && season.id === 'harvest' && !isBoss && R.chance(0.35)) tag = 'protection';
    const rank = rankForZone(zone.tier, isBoss);
    const rk = D.RANKS[rank];
    const variance = 0.85 + R.float() * 0.4;
    const prestige = (GH.sim && GH.sim.get() && GH.sim.get().prestige) || 0;   // NG+ pressure & pay
    const diff = (GH.sim && GH.sim.difficulty) ? GH.sim.difficulty() : { dc: 0, bounty: 1, death: 1 };
    let title, stages = rk.stages, dc = rk.dc + Math.min(3, prestige) + diff.dc, xp = rk.xp,
        bounty = Math.round(rk.bounty * variance * (1 + 0.1 * prestige) * diff.bounty);
    if (isBoss) {
      title = `BOSS: ${zone.boss}`;
      stages = rk.stages + 1; xp = rk.xp * 2;
      dc = rk.dc + 1 + Math.min(3, prestige) + diff.dc;
      bounty = Math.round(rk.bounty * 1.8 * (1 + 0.1 * prestige) * diff.bounty);
    } else {
      // "Completed missions show up again": with three templates per tag, a
      // fresh contract often re-rolled the EXACT title just finished in that
      // zone, which reads as the same job relisting. Keep the RNG draw (the
      // stream must not change for seeded runs), then walk forward through the
      // template list — no extra draws — until the title is not one of the
      // zone's last few. The memory lives on the save; absent = legacy = off.
      const g2 = GH.sim && GH.sim.get ? GH.sim.get() : null;
      const tmpls = D.CONTRACT_TEMPLATES[tag];
      let pickIdx = tmpls.indexOf(R.pick(tmpls));
      const recent = g2 ? ((g2.recentTitles = g2.recentTitles || {})[zone.id]
        = (g2.recentTitles[zone.id] || [])) : [];
      for (let n = 0; n < tmpls.length; n++) {
        const cand = tmpls[(pickIdx + n) % tmpls.length].replace('{x}', zone.name.replace(/^The /, ''));
        title = cand;
        if (!recent.includes(cand)) break;
      }
      if (recent) { recent.push(title); while (recent.length > 4) recent.shift(); }
    }
    const tierDays = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };
    let days = tierDays[zone.tier] || 1;
    if (isBoss) days += 1;
    if (!isBoss && R.chance(0.3)) days += 1;   // a little variety

    // A living board: normal contracts wait only so long before the client
    // finds someone else. Escort-ish work needs numbers; clean work pays extra.
    const boardDays = isBoss ? null : 2 + R.int(3);              // 2-4 days on the board
    const minParty = (!isBoss && ['protection', 'social', 'political'].includes(tag) && R.chance(0.35)) ? 2 : 1;
    const bonus = (!isBoss && R.chance(0.25)) ? { type: 'flawless', pct: 50 } : null;

    const job = {
      id: uid(),
      title, zoneId: zone.id, isBoss: !!isBoss,
      tag, skill: D.TAG_SKILL[tag], rank,
      dc, stages, bounty, xp, days,
      boardDays, minParty, bonus,
      client: isBoss ? zone.name : R.pick(D.CLIENTS),
      status: 'open',     // open | done | failed
    };
    let out = season ? GH.seasons.modifyJob(GH.sim.get(), job) : job;
    if (GH.rival && GH.sim) out = GH.rival.modifyJob(GH.sim.get(), out);   // contested regions pay less
    return out;
  }

  function degree(roll, total, dc) {
    if (roll === 20 && total >= dc) return 2;        // nat 20 + meet = bump (treat as crit)
    if (total >= dc + 10) return 2;                  // critical success
    if (total >= dc) return 1;                       // success
    if (roll === 1) return total - dc >= 0 ? 0 : -1; // nat 1 worsens
    if (total <= dc - 10) return -1;                 // critical failure
    return 0;                                         // failure
  }
  const DEGREE_LABEL = { 2: 'Critical Success', 1: 'Success', 0: 'Failure', '-1': 'Critical Failure' };

  /* Resolve a contract with a party (array of adventurers). Mutates adventurers
   * (needs, xp, injuries) and returns a structured result for display. */
  // Scars: survivors of a brush with death learn their horror's shape.
  const SCAR_NAME = {
    combat: 'Shieldsplit Scar', beast: 'Fangmark', stealth: 'Shadowline Scar',
    arcane: 'Riftburn', social: 'Oathbrand', undead: 'Gravechill',
    exploration: 'Wayfarer\'s Limp', recovery: 'Trapline Scar',
  };

  function resolve(job, party, opts) {
    const rolls = [];
    const newScars = [];
    const teamBonus = (opts && opts.teamBonus) || 0;   // synergy from fighting as a unit
    let score = 0;
    party.forEach((a) => {
      const best = PF.bestSkillFor(a, job.tag);
      const bond = GH.social ? GH.social.partyBonus(a, party) : 0;   // friends help, rivals hinder
      const scar = (a.scars || []).some((s) => s.tag === job.tag) ? 1 : 0;  // they know this foe
      const r = R.d20();
      const total = r + best.mod + bond + teamBonus + scar;
      const deg = degree(r, total, job.dc);
      score += deg;
      let died = false;
      if (deg === -1) {
        const guarded = GH.items && GH.items.hasGuard(a) && R.chance(0.6);
        if (!guarded) {
          // critical failures can kill — more often on bosses and outbreaks
          // What a crit-fail costs is the third difficulty lever: a tier that
          // only moved DC would make Grim slower rather than tenser.
          const dMul = (GH.sim && GH.sim.difficulty) ? GH.sim.difficulty().death : 1;
          const deathChance = ((job.isBoss || job.isOutbreak) ? 0.28 : 0.10) * dMul;
          if (R.chance(deathChance)) { a.status = 'dead'; a.hp = 0; died = true; }
          else {
            a.status = 'injured'; a.injuryDays = 1 + R.int(2); a.hp = Math.max(1, a.hp - R.int(6) - 2);
            // a brush with death can leave a permanent scar — and a lesson
            if (R.chance(0.5) && !(a.scars || []).some((s) => s.tag === job.tag)) {
              a.scars = a.scars || [];
              const nm = SCAR_NAME[job.tag] || 'Old Scar';
              a.scars.push({ tag: job.tag, name: nm, mission: job.title });
              newScars.push(`${a.name} will carry the ${nm} from "${job.title}" — and fight that kind of horror smarter, forever. (+1 vs ${job.tag})`);
            }
          }
        }
      }
      // dispatch is tiring & hungry work
      a.rested = Math.max(0, a.rested - (15 + R.int(15)));
      a.fed = Math.max(0, a.fed - (10 + R.int(10)));
      a.contracts += 1;
      rolls.push({
        advId: a.id, name: a.name, skill: D.SKILL_LABEL[best.skill], roll: r, mod: best.mod, bond, team: teamBonus, scar, total,
        dc: job.dc, degree: deg, label: DEGREE_LABEL[deg], injured: deg === -1 && !died, died,
      });
    });

    let outcome, payRatio;
    if (score >= job.stages + 2) { outcome = 'triumph'; payRatio = 1.25; }
    else if (score >= job.stages) { outcome = 'success'; payRatio = 1.0; }
    else if (score >= 1) { outcome = 'partial'; payRatio = 0.4; }
    else { outcome = 'failure'; payRatio = 0; }

    // flawless: every roll succeeded — clean-work bonuses trigger on this
    const flawless = rolls.length > 0 && rolls.every((r) => r.degree >= 1);

    job.status = (outcome === 'failure') ? 'failed' : 'done';

    // XP: full to each on win, partial otherwise
    const levelUps = [];
    const xpEach = Math.round(job.xp * (outcome === 'failure' ? 0.25 : outcome === 'partial' ? 0.6 : 1));
    party.forEach((a) => { PF.addXp(a, xpEach).forEach((e) => levelUps.push(e)); });

    return { job, rolls, score, outcome, payRatio, xpEach, levelUps, flawless, newScars };
  }

  return { generate, resolve, rankForZone, DEGREE_LABEL, degree };
})();
