/* Relationships & banter: adventurers form bonds and rivalries through
 * shared expeditions, shaded by trait compatibility. Bonds buff a party;
 * rivalries drag it down. Hallmates banter between days.
 */
window.GH = window.GH || {};

GH.social = (function () {
  const R = GH.rng;
  const FRIEND = 40, RIVAL = -40, PARTNER = 75;

  // Trait-kind compatibility (GuildHall traits use kinds: good/cost/risk).
  function traitCompat(a, b) {
    const ka = a.traitKind, kb = b.traitKind;
    let d = 0;
    if (ka === 'good' && kb === 'good') d += 2;
    else if (ka === 'good' || kb === 'good') d += 1;
    if (ka === 'risk' && kb === 'risk') d -= 3;
    if (ka === 'cost' && kb === 'cost') d -= 1;
    if (ka === 'risk' && kb === 'cost') d -= 1;
    if (kb === 'risk' && ka === 'cost') d -= 1;
    return d;
  }

  function bondOf(a, b) { return (a.bonds && a.bonds[b.id]) || 0; }
  function setBond(a, b, v) { a.bonds = a.bonds || {}; a.bonds[b.id] = Math.max(-100, Math.min(100, v)); }
  function adjust(a, b, delta) { setBond(a, b, bondOf(a, b) + delta); setBond(b, a, bondOf(b, a) + delta); }

  // After an expedition, the party's shared experience moves their bonds.
  function afterExpedition(state, party, res) {
    if (party.length < 2) return;
    const base = { triumph: 9, success: 7, partial: 4, failure: 2 }[res.outcome] || 4;
    for (let i = 0; i < party.length; i++) {
      for (let j = i + 1; j < party.length; j++) {
        const a = party[i], b = party[j];
        const before = bondOf(a, b);
        adjust(a, b, base + traitCompat(a, b));
        const after = bondOf(a, b);
        // announce threshold crossings
        if (before < FRIEND && after >= FRIEND) state && GH.sim && GH.sim.get() && logTo(state, `${a.name.split(' ')[0]} and ${b.name.split(' ')[0]} have become firm friends.`);
        else if (before > RIVAL && after <= RIVAL) logTo(state, `${a.name.split(' ')[0]} and ${b.name.split(' ')[0]} can't stand each other now.`);
        // deep bonds become partnerships: hearts entwined, or an oath of siblings-in-arms
        if (after >= PARTNER && !a.partnerId && !b.partnerId && traitCompat(a, b) >= 0 && R.chance(0.5)) {
          const kind = R.chance(0.45) ? 'heart' : 'oath';
          a.partnerId = b.id; b.partnerId = a.id;
          a.partnerKind = kind; b.partnerKind = kind;
          const an = a.name.split(' ')[0], bn = b.name.split(' ')[0];
          logTo(state, kind === 'heart'
            ? `❤ ${an} and ${bn} came back from the field holding hands and daring anyone to comment. Partners, then.`
            : `⚔ ${an} and ${bn} swear the old oath — siblings-in-arms, one shield between them.`, 'win');
        }
      }
    }
  }
  function logTo(state, text, kind) { if (state) { state.log.unshift({ text, kind: kind || 'recruit', day: state.day }); } }

  // Per-adventurer party modifier during a contract check.
  function partyBonus(a, party) {
    let b = 0;
    party.forEach((o) => {
      if (o.id === a.id) return;
      if (o.id === a.partnerId) { b += 2; return; }   // partners fight as one
      const s = bondOf(a, o);
      if (s >= FRIEND) b += 1; else if (s <= RIVAL) b -= 1;
    });
    return Math.max(-2, Math.min(3, b));
  }

  // Friends / rivals of an adventurer, resolved against the roster.
  function relationships(a, roster) {
    const friends = [], rivals = [];
    Object.entries(a.bonds || {}).forEach(([id, score]) => {
      const o = roster.find((x) => x.id === id);
      if (!o) return;
      if (score >= FRIEND) friends.push({ name: o.name, score });
      else if (score <= RIVAL) rivals.push({ name: o.name, score });
    });
    const po = a.partnerId ? roster.find((x) => x.id === a.partnerId) : null;
    const partner = po ? { name: po.name, kind: a.partnerKind } : null;
    return { friends, rivals, partner };
  }

  // A banter line between two hallmates (returns null most days).
  function dailyBanter(state) {
    const here = state.roster.filter((a) => a.status !== 'away');
    if (here.length < 2 || !R.chance(0.5)) return null;
    const a = R.pick(here);
    let b = R.pick(here); let guard = 0;
    while (b.id === a.id && guard++ < 5) b = R.pick(here);
    if (b.id === a.id) return null;
    const an = a.name.split(' ')[0], bn = b.name.split(' ')[0];
    const score = bondOf(a, b);
    if (a.partnerId === b.id) return a.partnerKind === 'heart' ? R.pick([
      `${an} and ${bn} share one cloak on the night watch. There are two cloaks. Everyone has counted.`,
      `${bn} saves the last honeycake for ${an}. ${an} splits it anyway.`,
      `${an} braids a luck-charm into ${bn}'s gear before every dispatch. Neither calls it superstition.`,
    ]) : R.pick([
      `${an} and ${bn} drill shield-to-shield until the yard torches gutter out.`,
      `${bn} recites the old oath under their breath; ${an} finishes it without looking up.`,
      `${an} sharpens both swords. ${bn} oils both shields. Nobody assigned this.`,
    ]);
    if (score >= FRIEND) return R.pick([
      `${an} and ${bn} swap war stories late into the night.`,
      `${an} saves the best seat by the fire for ${bn}.`,
      `${an} and ${bn} are inseparable in the hall.`,
    ]);
    if (score <= RIVAL) return R.pick([
      `${an} and ${bn} argue over the last of the stew.`,
      `${an} pointedly ignores ${bn} at supper.`,
      `${an} and ${bn} nearly come to blows over an old grudge.`,
    ]);
    return R.pick([
      `${an} (${a.trait}) and ${bn} (${b.trait}) trade jokes by the hearth.`,
      `${bn} watches ${an} polish their gear, unimpressed.`,
      `${an} tries to teach ${bn} a card game. It does not go well.`,
      `${an} and ${bn} compare scars over a quiet drink.`,
    ]);
  }

  return { FRIEND, RIVAL, PARTNER, afterExpedition, partyBonus, relationships, dailyBanter, bondOf, traitCompat };
})();
