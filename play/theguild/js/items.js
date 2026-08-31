/* Items: gear bonuses, crafting, equip/unequip, and expedition loot. */
window.GH = window.GH || {};

GH.items = (function () {
  const D = GH.data, R = GH.rng;

  const gear = (id) => D.GEAR_BY_ID[id];
  const mat = (id) => D.MAT_BY_ID[id];

  // Total item bonus an adventurer's equipped gear gives to one skill.
  function skillBonus(a, skill) {
    if (!a.gear) return 0;
    let b = 0;
    D.SLOTS.forEach((slot) => {
      const id = a.gear[slot];
      if (!id) return;
      const g = gear(id); if (!g) return;
      if (g.bonus.type === 'all') b += g.bonus.value;
      else if (g.bonus.type === 'skill' && g.bonus.skill === skill) b += g.bonus.value;
    });
    return b;
  }

  // Does the adventurer's armor guard against injury?
  function hasGuard(a) {
    if (!a.gear) return false;
    return D.SLOTS.some((s) => { const g = gear(a.gear[s]); return g && g.guard; });
  }

  // A rough "gear power" score for display / boss gating.
  function gearPower(a) {
    if (!a.gear) return 0;
    let p = 0;
    D.SLOTS.forEach((s) => { const g = gear(a.gear[s]); if (g) p += g.tier; });
    return p;
  }

  // How well one piece of gear fits one adventurer. 'all' bonuses beat
  // skill-matched ones, a matched skill beats a dead one, and armor guard is
  // worth the most to someone with no guard at all.
  function fitScore(a, gId) {
    const g = gear(gId); if (!g) return 0;
    let s = g.tier * 0.5;
    if (g.bonus.type === 'all') s += g.bonus.value * 3;
    else s += g.bonus.value * (a.skills && a.skills[g.bonus.skill] && a.skills[g.bonus.skill] !== 'U' ? 2 : 0.5);
    if (g.guard) s += hasGuard(a) ? 0.5 : 2;
    return s;
  }

  // --- Inventory helpers --------------------------------------------------
  function emptyInventory() { return { mats: {}, gear: {} }; }
  function matCount(inv, id) { return inv.mats[id] || 0; }
  function gearCount(inv, id) { return inv.gear[id] || 0; }
  function addMat(inv, id, n) { inv.mats[id] = (inv.mats[id] || 0) + n; }
  function addGear(inv, id, n) { inv.gear[id] = (inv.gear[id] || 0) + (n || 1); }

  function canCraft(inv, gold, gId) {
    const g = gear(gId); if (!g) return { ok: false, reason: 'Unknown blueprint.' };
    if (gold < g.cost.gold) return { ok: false, reason: `Need ${g.cost.gold}g.` };
    for (const [m, q] of Object.entries(g.cost.mats || {})) {
      if (matCount(inv, m) < q) return { ok: false, reason: `Need ${q} ${mat(m).name}.` };
    }
    return { ok: true };
  }

  // craft: returns {ok, goldSpent} and mutates inventory (caller deducts gold)
  function craft(inv, gold, gId) {
    const c = canCraft(inv, gold, gId);
    if (!c.ok) return c;
    const g = gear(gId);
    for (const [m, q] of Object.entries(g.cost.mats || {})) inv.mats[m] -= q;
    addGear(inv, gId, 1);
    return { ok: true, goldSpent: g.cost.gold, gear: g };
  }

  // equip: move a gear from inventory into an adventurer's slot (swap back any prior)
  function equip(inv, a, gId) {
    const g = gear(gId); if (!g) return { ok: false, reason: 'Unknown gear.' };
    if (gearCount(inv, gId) <= 0) return { ok: false, reason: 'None in stash.' };
    a.gear = a.gear || { weapon: null, armor: null, trinket: null };
    const prev = a.gear[g.slot];
    inv.gear[gId] -= 1;
    if (prev) addGear(inv, prev, 1);
    a.gear[g.slot] = gId;
    return { ok: true, swapped: prev };
  }
  function unequip(inv, a, slot) {
    a.gear = a.gear || { weapon: null, armor: null, trinket: null };
    const prev = a.gear[slot];
    if (!prev) return { ok: false };
    addGear(inv, prev, 1);
    a.gear[slot] = null;
    return { ok: true };
  }

  // --- Loot ---------------------------------------------------------------
  // Roll materials (+ rare gear) from an expedition based on zone & outcome.
  function rollLoot(zone, outcome, isBoss) {
    const loot = { mats: {}, gear: [], gold: 0 };
    if (outcome === 'failure' && !isBoss) return loot;
    const mult = { triumph: 1.6, success: 1.0, partial: 0.5, failure: 0.3 }[outcome] || 1;
    const drops = Math.max(1, Math.round((zone.tier + (isBoss ? 3 : 0)) * mult * (0.6 + R.float() * 0.8)));
    for (let i = 0; i < drops; i++) {
      const m = R.pick(zone.mats);
      loot.mats[m] = (loot.mats[m] || 0) + 1;
    }
    // gear drop chance: small normally, guaranteed on a boss kill
    const gearChance = isBoss ? 1 : (outcome === 'triumph' ? 0.25 : 0.10);
    if (R.chance(gearChance)) {
      const pool = D.GEAR.filter((g) => g.tier <= zone.tier + (isBoss ? 1 : 0) && g.tier >= Math.max(1, zone.tier - 1));
      if (pool.length) loot.gear.push(R.pick(pool).id);
    }
    return loot;
  }

  function grant(inv, loot) {
    Object.entries(loot.mats).forEach(([m, q]) => addMat(inv, m, q));
    loot.gear.forEach((gId) => addGear(inv, gId, 1));
  }

  function lootSummary(loot) {
    const parts = [];
    Object.entries(loot.mats).forEach(([m, q]) => parts.push(`${q}× ${mat(m).name}`));
    loot.gear.forEach((gId) => parts.push(gear(gId).name));
    return parts;
  }

  return {
    gear, mat, skillBonus, hasGuard, gearPower, fitScore,
    emptyInventory, matCount, gearCount, addMat, addGear,
    canCraft, craft, equip, unequip, rollLoot, grant, lootSummary,
  };
})();
