/* The advisor — a transparent decision matrix (not "AI"). It scores
 * adventurers by expected contribution to a contract, forms sensible
 * parties, allocates the whole roster across the board, and gives
 * per-adventurer recommendations.
 */
window.GH = window.GH || {};

GH.advisor = (function () {
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  // Expected degree-points a single adventurer contributes to a contract.
  // degree points: crit +2, success +1, fail 0, crit-fail -1 → E = pSucc + pCrit - pCritFail
  function expected(a, job, partyForBonds) {
    const bond = (GH.social && partyForBonds) ? GH.social.partyBonus(a, partyForBonds) : 0;
    const m = GH.pf.bestSkillFor(a, job.tag).mod + bond;   // includes class-tag affinity
    const pSucc = clamp01((21 - (job.dc - m)) / 20);
    const pCrit = clamp01((21 - (job.dc + 10 - m)) / 20);
    const pCF = clamp01((job.dc - 10 - m) / 20);
    return pSucc + pCrit - pCF;
  }

  function oddsNote(exp, stages) {
    const r = exp / Math.max(1, stages);
    if (r >= 1.6) return { label: 'Strong odds', cls: 'good' };
    if (r >= 1.0) return { label: 'Fair odds', cls: 'ok' };
    if (r >= 0.6) return { label: 'Risky', cls: 'risky' };
    return { label: 'Long shot', cls: 'risky' };
  }

  // Greedily build the best party for a contract from a pool of adventurers.
  // Stops once odds are comfortable, to keep the rest of the roster free.
  function bestParty(job, pool) {
    pool = (pool || GH.sim.idle()).slice();
    const ranked = pool
      .map((a) => ({ a, base: expected(a, job, null) }))
      .sort((x, y) => y.base - x.base);

    const party = [];
    const maxSize = Math.min(3, job.stages + 1);           // don't over-commit small jobs
    const sumExp = () => party.reduce((s, m) => s + expected(m, job, party), 0);
    for (const c of ranked) {
      if (party.length >= maxSize) break;
      const trialExp = expected(c.a, job, party.concat(c.a));
      if (trialExp < 0.12 && party.length >= 1) continue;  // negligible / negative help — skip
      party.push(c.a);
      if (sumExp() >= job.stages + 0.6) break;             // comfortable margin → keep the rest free
    }
    if (!party.length && ranked.length) party.push(ranked[0].a);
    // escort-type contracts demand numbers — pad up to the minimum
    if (job.minParty) {
      for (const c of ranked) {
        if (party.length >= job.minParty) break;
        if (!party.includes(c.a)) party.push(c.a);
      }
    }
    const exp = sumExp();
    return { party: party.map((a) => a.id), expected: exp, target: job.stages, note: oddsNote(exp, job.stages).label };
  }

  // Allocate the whole roster across the open board, best-value first.
  function allocateDay() {
    const st = GH.sim.get();
    const summary = { dispatched: [], skipped: 0, cooked: false };

    // feed the hall first if it's hungry and we can afford a stew
    const here = st.roster.filter((a) => a.status !== 'away');
    const avgFed = here.length ? here.reduce((s, a) => s + a.fed, 0) / here.length : 100;
    if (avgFed < 45 && st.gold >= GH.data.MEALS[1].cost) { GH.sim.cook(1); summary.cooked = true; }

    // expiring-tomorrow contracts first (use them or lose them), then value
    const open = st.board.filter((j) => j.status === 'open').slice().sort((a, b) => {
      const ua = a.boardDays === 1 ? 1 : 0, ub = b.boardDays === 1 ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return b.bounty - a.bounty;
    });
    for (const job of open) {
      const pool = GH.sim.idle();
      if (!pool.length) break;
      const bp = bestParty(job, pool);
      if (job.minParty && bp.party.length < job.minParty) { summary.skipped++; continue; }
      const ratio = bp.expected / Math.max(1, job.stages);
      const threshold = job.isBoss ? 1.1 : 0.8;          // be cautious with bosses
      if (bp.party.length && ratio >= threshold) {
        const r = GH.sim.dispatch(job.id, bp.party);
        if (r.ok) summary.dispatched.push({ title: job.title, n: bp.party.length, days: r.days, note: bp.note });
        else summary.skipped++;
      } else summary.skipped++;
    }
    return summary;
  }

  // A one-line recommendation for an idle adventurer.
  function recommend(a) {
    if (a.status === 'away') return 'On expedition.';
    if (a.status === 'injured') return `Injured — recovering (${a.injuryDays}d left).`;
    if (a.fed < 35) return 'Hungry — serve a meal in the Kitchen.';
    if (a.rested < 35) return 'Exhausted — let them rest before the next expedition.';
    if (a.happy < 35) return 'Low morale — a win or a feast would lift it.';
    if (a.loyalty < 25) return 'Wavering loyalty — pay them with a good contract soon.';
    // suggest training the signature skill if it can still improve
    const D = GH.data;
    for (const sk of Object.keys(D.SKILLS)) {
      if (a.skills[sk] !== 'U') {
        const can = GH.pf.canTrain(a, sk);
        if (can.ok && a.level >= 2) return `Fit — send on a contract, or train ${D.SKILL_LABEL[sk]}.`;
      }
    }
    return 'Fit and ready — assign to a contract.';
  }

  return { expected, oddsNote, bestParty, allocateDay, recommend };
})();
