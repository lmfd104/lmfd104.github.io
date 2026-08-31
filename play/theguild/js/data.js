/* Adventurer's Guild — static data.
 * A Pathfinder-flavored character model (open mechanics + original flavor),
 * plus contracts, facilities, meals, and training.
 */
window.GH = window.GH || {};

GH.data = (function () {
  // Six classic ability scores
  const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const ABILITY_LABEL = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

  // Skills → key ability
  const SKILLS = {
    athletics: 'str', acrobatics: 'dex', stealth: 'dex', survival: 'wis',
    medicine: 'wis', arcana: 'int', diplomacy: 'cha', intimidation: 'cha',
  };
  const SKILL_LABEL = {
    athletics: 'Athletics', acrobatics: 'Acrobatics', stealth: 'Stealth', survival: 'Survival',
    medicine: 'Medicine', arcana: 'Arcana', diplomacy: 'Diplomacy', intimidation: 'Intimidation',
  };

  // Proficiency ladder (PF2e-style): rank → flat bonus added to (ability + level)
  const PROF = { U: 0, T: 2, E: 4, M: 6, L: 8 };
  const PROF_LABEL = { U: 'Untrained', T: 'Trained', E: 'Expert', M: 'Master', L: 'Legendary' };
  const PROF_ORDER = ['U', 'T', 'E', 'M', 'L'];

  // --- Ancestries: ability boosts (+2), one flaw (-2), base HP, blurb ----
  const ANCESTRIES = [
    { name: 'Human', boosts: ['free', 'free'], flaw: null, hp: 8, tint: 0xf0c89a, blurb: 'Hearth-town stock — rebuilt the world once already.' },
    { name: 'Elf', boosts: ['dex', 'int'], flaw: 'con', hp: 6, tint: 0xb8e0c0, blurb: 'Remembers the Old Age. Does not discuss it.' },
    { name: 'Dwarf', boosts: ['con', 'wis'], flaw: 'cha', hp: 10, tint: 0xd9a05a, blurb: 'Vault-delvers. Trusts stone over sky.' },
    { name: 'Halfling', boosts: ['dex', 'wis'], flaw: 'str', hp: 6, tint: 0xe6c27a, blurb: 'Road-born, raised on caravans and rumour.' },
    { name: 'Half-Orc', boosts: ['str', 'con'], flaw: 'int', hp: 10, tint: 0x9fbf6f, blurb: 'Grey Marches blood — the emptied country made them hard.' },
    { name: 'Gnome', boosts: ['con', 'cha'], flaw: 'str', hp: 8, tint: 0xc89ad9, blurb: 'Ash-touched: the burning changed their line, and it shows.' },
  ];

  // --- Backgrounds: two boosts + a trained skill + flavor --------------
  const BACKGROUNDS = [
    { name: 'Ash-Warden', boosts: ['wis', 'dex'], skill: 'survival', blurb: 'Village-sworn. Knows the treeline\u2019s moods and the old warding-songs.' },
    { name: 'Lantern-Bearer', boosts: ['wis', 'int'], skill: 'medicine', blurb: 'Carried the dead\u2019s lantern until it guttered. Never flinched.' },
    { name: 'Caravan Hand', boosts: ['con', 'cha'], skill: 'diplomacy', blurb: 'Nine Roads and every toll-post on them.' },
    { name: 'Guild Factor', boosts: ['int', 'cha'], skill: 'arcana', blurb: 'Counted ember-glass for the Emberwrights. Left owing answers.' },
    { name: 'Road Warden', boosts: ['str', 'con'], skill: 'athletics', blurb: 'Held road-law with too few hands, and knows it.' },
    { name: 'Vault-Delver', boosts: ['dex', 'con'], skill: 'stealth', blurb: 'Opened a sealed hall once. Talks about it rarely.' },
    { name: 'Registered Mystic', boosts: ['int', 'wis'], skill: 'arcana', blurb: 'Wears the Warden\u2019s token. Works quietly anyway.' },
    { name: 'Hearth-Town Brawler', boosts: ['str', 'cha'], skill: 'intimidation', blurb: 'Kept order in a taproom on the Ninth Road.' },
  ];

  const CLASSES = [
    { name: 'Fighter', key: 'str', hp: 10, skills: ['athletics', 'intimidation'], tags: ['combat', 'beast'], blurb: 'Master of arms.' },
    { name: 'Rogue', key: 'dex', hp: 8, skills: ['stealth', 'acrobatics'], tags: ['stealth', 'recovery'], blurb: 'Strikes from the dark.' },
    { name: 'Wizard', key: 'int', hp: 6, skills: ['arcana'], tags: ['arcane', 'undead'], blurb: 'Bends reality with study.' },
    { name: 'Cleric', key: 'wis', hp: 8, skills: ['medicine', 'diplomacy'], tags: ['undead', 'social'], blurb: 'Channels a higher power.' },
    { name: 'Ranger', key: 'dex', hp: 8, skills: ['survival', 'athletics'], tags: ['beast', 'exploration'], blurb: 'Hunts across any wild.' },
    { name: 'Bard', key: 'cha', hp: 8, skills: ['diplomacy', 'acrobatics'], tags: ['social', 'arcane'], blurb: 'Wins with wit and song.' },
  ];

  const TRAITS = [
    { name: 'Loyal', kind: 'good' }, { name: 'Greedy', kind: 'cost' }, { name: 'Reckless', kind: 'risk' },
    { name: 'Stoic', kind: 'good' }, { name: 'Arrogant', kind: 'risk' }, { name: 'Curious', kind: 'cost' },
    { name: 'Ambitious', kind: 'risk' }, { name: 'Kindhearted', kind: 'good' }, { name: 'Glutton', kind: 'cost' },
    { name: 'Night Owl', kind: 'cost' }, { name: 'Brave', kind: 'good' }, { name: 'Superstitious', kind: 'risk' },
  ];

  // --- Contracts: tag → required skill, plus rank table -----------------
  const TAG_SKILL = {
    combat: 'athletics', beast: 'survival', stealth: 'stealth', arcane: 'arcana',
    social: 'diplomacy', undead: 'medicine', exploration: 'acrobatics', recovery: 'stealth',
    protection: 'athletics',   // harvest escorts (Era II seasons); Knight/Warden tagAdd finally bites
  };
  const TAGS = Object.keys(TAG_SKILL);

  // Rank → DC, base bounty, stages (checks needed), xp
  const RANKS = {
    F: { dc: 13, bounty: 40, stages: 1, xp: 20, color: '#8a8a8a' },
    E: { dc: 15, bounty: 72, stages: 1, xp: 30, color: '#7fae7f' },
    D: { dc: 17, bounty: 118, stages: 2, xp: 45, color: '#6fa0c0' },
    C: { dc: 20, bounty: 195, stages: 2, xp: 70, color: '#8a7fc0' },
    B: { dc: 23, bounty: 338, stages: 3, xp: 110, color: '#c0a04a' },
    A: { dc: 26, bounty: 585, stages: 3, xp: 170, color: '#c07a4a' },
    S: { dc: 30, bounty: 1040, stages: 4, xp: 280, color: '#c04a4a' },
  };
  const RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

  const CONTRACT_TEMPLATES = {
    combat: ['Drive off the {x} raiders', 'Break the siege at {x}', 'Subdue the {x} brawlers'],
    beast: ['Cull the {x} wolfpack', 'Trap the {x} drake', 'Hunt the man-eater of {x}'],
    stealth: ['Steal the ledger from {x}', 'Infiltrate the {x} compound', 'Sabotage the {x} works'],
    arcane: ['Contain the rift at {x}', 'Decipher the {x} grimoire', 'Bind the {x} elemental'],
    social: ['Broker peace with {x}', 'Sway the council of {x}', 'Expose the liar in {x}'],
    undead: ['Lay the {x} dead to rest', 'Purge the haunting of {x}', 'Cleanse the {x} crypt'],
    exploration: ['Chart the {x} caverns', 'Map the ruins of {x}', 'Scout the {x} pass'],
    recovery: ['Recover the relic from {x}', 'Retrieve the heirloom at {x}', 'Reclaim the lost cache of {x}'],
    protection: ['Escort the harvest train through {x}', 'Guard the {x} granary convoy', 'See the tithe wagons safe past {x}'],
  };
  const PLACES = ['Hollowmere', 'Ashwood', 'Blackstone', 'Karst', 'Old Wall', 'Cinder Steps',
    'Drownmarsh', 'Greywick', 'Sunken Mile', 'Thornfield'];
  const CLIENTS = ['Magistrate Voll', 'the Merchant Guild', 'House Rell', 'a frightened farmer',
    'the Temple of Dawn', 'an anonymous noble', 'the Miners\' Union', 'Captain Brae'];

  // --- Facilities (rooms) — hotspots over the hall image ----------------
  // rect is in 0..1 normalized coords over the 1280x1280 hall image.
  // Rects trace the REBUILT hall — the building is composed from a tile kit by
  // tools/gen_hall_build.py now, not painted once — and each rect includes the
  // room's wall-face overhang (72px above its top wall cell), because that is
  // what the per-tier room images cover.
  const ROOMS = [
    { id: 'board', name: 'Contract Board', rect: [0.025, 0.50625, 0.15, 0.16875], blurb: 'Choose a region, accept and dispatch jobs.' },
    { id: 'kitchen', name: 'Kitchen', rect: [0.025, 0.01875, 0.175, 0.3375], blurb: 'Cook meals to keep your people Fed.' },
    { id: 'tavern', name: 'Great Hall', rect: [0.2, 0.13125, 0.6, 0.45], blurb: 'Food, drink, and morale. Recruit here.' },
    { id: 'training', name: 'Training Room', rect: [0.725, 0.675, 0.25, 0.31875], blurb: 'Drill skills up the proficiency ladder.' },
    { id: 'smithy', name: 'Smithy', rect: [0.45, 0.675, 0.25, 0.31875], blurb: 'Forge gear from looted materials.' },
    { id: 'dormitory', name: 'Dormitory', rect: [0.175, 0.675, 0.25, 0.31875], blurb: 'Beds. Rest restores your roster.' },
  ];

  // Rooms that are REAL ROOMS: a walled shell with a door and its own picture
  // at every tier, instead of a rectangle drawn over one painting.
  //
  // Three of them stand along the guild's south range, on the 332x322 cells the
  // painting already had built there. The rects above changed with them, and
  // those old rects were the whole problem: the training yard was three mats on
  // the DINING floor ("who trains next to a dining table?"), the smithy sat over
  // a painted BATHROOM, and the dormitory "grew" by shrinking a rectangle —
  // which is what read as a block of brown laid over the room. Raising one now
  // swaps its picture, and the dormitory gains a BED per tier.
  //
  // `art` is the assets/hall/rooms/<art>_<level>.png stem; `tiers` is how many
  // were rendered (levels past it reuse the top one).
  const ROOM_ART = {
    dormitory: { art: 'dorm', tiers: 4 },
    smithy: { art: 'smithy', tiers: 4 },
    training: { art: 'training', tiers: 4 },
  };
  // --- The people, as sprites -------------------------------------------
  // Every class sheet is the same Cute Fantasy layout: 32x32 frames, 6 per row.
  // The rows below are the animations the hall plays. This is a TABLE, and it
  // lived inside hall.js's Phaser setup until 2026-08-17 — where neither
  // rebuilt engine could read it, so both would have re-counted sprite rows by
  // hand off the same PNG.
  //
  // `sheets` are the per-class files under assets/chars/player_<id>.png; a
  // class with no sheet of its own falls back to `player.png`.
  // 96px frames, drawn 1:1. They were 32px shown at 3.2x, which made a
  // character's pixel 3.2 times the size of every other pixel in the world
  // — the largest grain break on screen, and the one thing scaling cannot
  // fix. Every renderer reads `frame` from here; none may assume 32.
  const CHAR_SHEET = { frame: 96, cols: 6, fallback: 'player' };
  const CHAR_SHEETS = ['bard', 'cleric', 'fighter', 'ranger', 'rogue', 'wizard'];
  // ORDERED only for legibility; looked up by name. `repeat` -1 loops forever.
  const CHAR_ANIMS = {
    // the breathing idle is four poses, not six — the count is the art's,
    // not a round number, or a renderer slices empty cells at the row's end
    'idle-down':  { row: 0, frames: 4, fps: 6 },
    'idle-right': { row: 1, frames: 4, fps: 6 },
    'idle-up':    { row: 2, frames: 4, fps: 6 },
    'walk-down':  { row: 3, frames: 6, fps: 10 },
    'walk-right': { row: 4, frames: 6, fps: 10 },
    'walk-up':    { row: 5, frames: 6, fps: 10 },
    // drills and hammer work both use the swing; six poses, from the art
    swing:        { row: 7, frames: 6, fps: 10 },
  };

  // The walkable floor inside one of those cells, in CELL-LOCAL normalized
  // units (x, y, w, h). Everything outside it is wall, and that is what stops
  // people walking through the furniture. Mirrors INNER in tools/gen_hall_rooms.py.
  // Rect-local, /1280 units like everything else: the rect starts 72px above
  // the top wall (the face band), the floor starts 96px in from that, and the
  // walls are one 32x24 cell thick.
  const ROOM_INNER = [0.025, 0.075, 0.2, 0.225];

  // --- The day: two slots, morning and afternoon ------------------------
  // A person is not an infinite resource. Each adventurer gets a MORNING and
  // an AFTERNOON, and what they do in each is a decision you make (or hand to
  // Auto). An expedition or a hunt takes the whole day.
  const DAY_SLOTS = ['am', 'pm'];
  const SLOT_LABEL = { am: 'Morning', pm: 'Afternoon' };

  // Training is not one undifferentiated "drill" any more. Each discipline
  // covers a group of skills and needs a place to practise it.
  const TRAIN_BRANCHES = {
    physical: { name: 'Physical', icon: '💪', needs: 'training',
      blurb: 'Blade, balance and breath — the yard.',
      skills: ['athletics', 'acrobatics', 'stealth'] },
    mind: { name: 'Mind', icon: '📖', needs: null,
      blurb: 'Lore, medicine, and the read of people.',
      skills: ['survival', 'medicine', 'diplomacy', 'intimidation'] },
    magic: { name: 'Magic', icon: '✨', needs: 'library',
      blurb: 'The arcane disciplines. Needs a library to study in.',
      skills: ['arcana'] },
  };
  const BRANCH_OF_SKILL = {};
  Object.entries(TRAIN_BRANCHES).forEach(([k, b]) => b.skills.forEach((s) => { BRANCH_OF_SKILL[s] = k; }));

  // Crafting splits the same way: the forge and the bench are different trades.
  const CRAFT_BRANCHES = {
    smith: { name: 'Smithing', icon: '🔨', needs: 'smithy',
      blurb: 'Weapons, armour and trinkets at the forge.' },
    alchemy: { name: 'Alchemy', icon: '⚗', needs: 'library',
      blurb: 'Salves and tonics, worked from field stock and books.' },
  };
  // Doing it yourself over a slot is cheaper than commissioning it outright.
  const SLOT_CRAFT_DISCOUNT = 0.25;

  // --- Remedies (alchemy output) ----------------------------------------
  // Consumables you make and then spend on a person who needs them. Cheap,
  // immediate, and the reason a spare afternoon is worth something.
  const REMEDIES = [
    { id: 'tonic', name: 'Waking Tonic', icon: '☕', cost: { gold: 14 },
      blurb: 'Restores 35 Rested.', apply: { rested: 35 } },
    { id: 'ration', name: 'Rich Ration', icon: '🥘', cost: { gold: 12 },
      blurb: 'Restores 35 Fed.', apply: { fed: 35 } },
    { id: 'cordial', name: 'Hearth Cordial', icon: '🍯', cost: { gold: 22 },
      blurb: 'Lifts spirits by 25.', apply: { happy: 25 } },
    { id: 'salve', name: 'Field Salve', icon: '⚕', cost: { gold: 30, mats: { iron: 1 } },
      blurb: 'Mends a wound — clears one day of injury.', apply: { heal: 1 } },
  ];
  const REMEDY_BY_ID = Object.fromEntries(REMEDIES.map((r) => [r.id, r]));

  // --- Crafting materials (looted from expeditions) ---------------------
  const MATERIALS = [
    { id: 'iron', name: 'Iron Ore', icon: 'mat_iron', tier: 1 },
    { id: 'silver', name: 'Silver Ore', icon: 'mat_silver', tier: 2 },
    { id: 'gold', name: 'Gold Ore', icon: 'mat_gold', tier: 3 },
    { id: 'darksteel', name: 'Dark Steel', icon: 'mat_darksteel', tier: 4 },
    { id: 'emberglass', name: 'Undimmed Ember-Glass', icon: 'mat_meteor', tier: 5 },
  ];
  const MAT_BY_ID = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

  // --- Gear blueprints --------------------------------------------------
  // bonus: { type:'skill', skill, value } | { type:'all', value }
  // slot: weapon | armor | trinket ; guard reduces injury on a crit-fail
  const GEAR = [
    { id: 'blood_blade', name: 'Bloodletter Blade', slot: 'weapon', icon: 'wpn_blood', tier: 1,
      bonus: { type: 'skill', skill: 'athletics', value: 2 }, cost: { gold: 30, mats: { iron: 2 } } },
    { id: 'lucky_charm', name: 'Lucky Charm', slot: 'trinket', icon: 'trk_charm', tier: 1,
      bonus: { type: 'all', value: 1 }, cost: { gold: 40, mats: { iron: 1 } } },
    { id: 'hunters_bow', name: "Hunter's Bow", slot: 'weapon', icon: 'wpn_bow', tier: 2,
      bonus: { type: 'skill', skill: 'survival', value: 2 }, cost: { gold: 55, mats: { iron: 2, silver: 1 } } },
    { id: 'apprentice_staff', name: 'Apprentice Staff', slot: 'weapon', icon: 'wpn_staff', tier: 2,
      bonus: { type: 'skill', skill: 'arcana', value: 2 }, cost: { gold: 55, mats: { silver: 2 } } },
    { id: 'warded_robe', name: 'Warded Robe', slot: 'armor', icon: 'arm_robe', tier: 2,
      bonus: { type: 'all', value: 1 }, cost: { gold: 60, mats: { silver: 2 } } },
    { id: 'ward_charm', name: 'Ward Charm', slot: 'trinket', icon: 'trk_ward', tier: 2,
      bonus: { type: 'skill', skill: 'arcana', value: 2 }, cost: { gold: 70, mats: { silver: 1, gold: 1 } } },
    { id: 'storm_edge', name: 'Storm Edge', slot: 'weapon', icon: 'wpn_storm', tier: 3,
      bonus: { type: 'skill', skill: 'athletics', value: 3 }, cost: { gold: 120, mats: { silver: 2, gold: 1 } } },
    { id: 'frostplate', name: 'Frostplate', slot: 'armor', icon: 'arm_plate', tier: 3, guard: true,
      bonus: { type: 'all', value: 1 }, cost: { gold: 140, mats: { gold: 2, iron: 2 } } },
    { id: 'heros_plate', name: "Hero's Plate", slot: 'armor', icon: 'arm_hero', tier: 4, guard: true,
      bonus: { type: 'all', value: 2 }, cost: { gold: 280, mats: { darksteel: 2, gold: 2 } } },
  ];
  const GEAR_BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g]));
  const SLOTS = ['weapon', 'armor', 'trinket'];

  // --- Expedition zones (the route/progression spine) -------------------
  // Unlock the next by defeating a zone's boss. Higher tiers = harder
  // contracts, better loot, rarer materials.
  const ZONES = [
    { id: 'greenfields', name: 'The Greenfields', tier: 1, reqRep: 0, tags: ['combat', 'social', 'beast'], boss: 'The Bandit Chief', mats: ['iron'] },
    { id: 'ashwood', name: 'Ashwood', tier: 2, reqRep: 8, tags: ['beast', 'exploration', 'recovery'], boss: 'The Direwolf Alpha', mats: ['iron', 'silver'] },
    { id: 'karst', name: 'Karst Depths', tier: 3, reqRep: 20, tags: ['stealth', 'arcane', 'recovery'], boss: 'The Hollow King', mats: ['silver', 'gold'] },
    { id: 'cinder', name: 'Cinder Reach', tier: 4, reqRep: 36, tags: ['arcane', 'undead', 'combat'], boss: 'The Cinder Wyrm', mats: ['gold', 'emberglass'] },
    { id: 'sunken', name: 'The Sunken Mile', tier: 5, reqRep: 55, tags: ['undead', 'arcane', 'social'], boss: 'The Drowned Sovereign', mats: ['darksteel', 'emberglass'] },
    // --- The Marches (Era II) — east along the Nine Roads, where the
    // dimming runs deepest. Locked behind era >= 2 (see sim.zoneAllowed).
    { id: 'thornmere', name: 'Thornmere', tier: 6, reqRep: 60, tags: ['beast', 'protection', 'exploration'], boss: 'The Briar-Bound Knight', mats: ['darksteel', 'emberglass'] },
    { id: 'greyreach', name: 'Greyreach', tier: 7, reqRep: 140, tags: ['undead', 'stealth', 'social'], boss: 'The Pale Magistrate', mats: ['gold', 'emberglass'] },
    { id: 'emberwastes', name: 'The Ember Wastes', tier: 8, reqRep: 170, tags: ['arcane', 'undead', 'combat'], boss: "The Choir's Herald", mats: ['darksteel', 'emberglass'] },
  ];
  const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));

  // --- Upgradeable facilities -------------------------------------------
  // level 1..max; cost to reach next = baseCost * currentLevel.
  // Facilities with `buildable: true` start at level 0 (not built yet).
  const FACILITIES = {
    dormitory: { name: 'Dormitory', room: 'dormitory', baseCost: 80, max: 4,
      effect: (l) => `${4 + l * 2} beds` },
    kitchen: { name: 'Kitchen', room: 'kitchen', baseCost: 70, max: 4,
      effect: (l) => l <= 1 ? 'meals restore Fed' : `meals +${(l - 1) * 8} Fed, +${(l - 1) * 2} Happy` },
    // A guild starts as a kitchen, a great hall, a board and a few bunks. The
    // yard and the forge are the first things you CHOOSE to build — which is
    // what makes the hall visibly grow instead of arriving finished.
    training: { name: 'Training Yard', room: 'training', baseCost: 90, max: 4, buildable: true, icon: '⚔',
      effect: (l) => l === 0 ? 'a boarded-up plot' : `sessions cost ${Math.max(8, 25 - (l - 1) * 6)}g` },
    smithy: { name: 'Smithy', room: 'smithy', baseCost: 110, max: 4, buildable: true, icon: '🔨',
      effect: (l) => l === 0 ? 'a cold, empty forge-house' : l === 1 ? `forge up to tier ${Math.min(5, l + 1)}` : `forge up to tier ${Math.min(5, l + 1)}, ${(l - 1) * 10}% cheaper` },
    // --- buildable expansions (guild building mechanic) ---
    library: { name: 'Library', baseCost: 120, max: 3, buildable: true, icon: '📚',
      effect: (l) => l === 0 ? 'not built' : `unlocks scholar promotions · lore hunts +${l * 5} XP` },
    chapel: { name: 'Chapel', baseCost: 100, max: 3, buildable: true, icon: '⛪',
      effect: (l) => l === 0 ? 'not built' : `unlocks holy promotions · +${l * 3} Happy each night` },
    bathhouse: { name: 'Bathhouse', baseCost: 90, max: 3, buildable: true, icon: '♨️',
      effect: (l) => l === 0 ? 'not built' : `+${l * 6} Rest each night` },
    infirmary: { name: 'Infirmary', baseCost: 110, max: 3, buildable: true, icon: '✚',
      effect: (l) => l === 0 ? 'not built' : `injuries heal ${l} day${l > 1 ? 's' : ''} faster` },
    warroom: { name: 'War Room', baseCost: 150, max: 2, buildable: true, icon: '🗡',
      effect: (l) => l === 0 ? 'not built' : `+${l} contract${l > 1 ? 's' : ''} per region on the board` },
  };

  // --- Class promotions ---------------------------------------------------
  // Requires level 3+, gold, and facility levels ("more trainers, a library, a master").
  // Grants +2 key ability, +6 max HP, an extra contract-tag affinity.
  const PROMOTIONS = {
    Fighter: [
      { name: 'Knight', req: { training: 3 }, cost: 150, key: 'con', tagAdd: 'protection', blurb: 'An oath, a wall, a shield that holds.' },
      { name: 'Berserker', req: { training: 2 }, cost: 120, key: 'str', tagAdd: 'beast', blurb: 'Fury as a fighting style.' },
    ],
    Rogue: [
      // 'political' was never a contract tag, so this promotion's advertised
      // affinity could not have matched a job even once the mechanic worked.
      { name: 'Assassin', req: { training: 2 }, cost: 150, key: 'dex', tagAdd: 'combat', blurb: 'One mark, one shadow, one cut.' },
      { name: 'Trickster', req: { library: 1 }, cost: 120, key: 'cha', tagAdd: 'social', blurb: 'The con is mightier than the sword.' },
    ],
    Wizard: [
      { name: 'Archmage', req: { library: 2 }, cost: 180, key: 'int', tagAdd: 'undead', blurb: 'The tower bows to no crown.' },
      { name: 'Spellblade', req: { library: 1, training: 2 }, cost: 150, key: 'dex', tagAdd: 'combat', blurb: 'Cantrips at sword-length.' },
    ],
    Cleric: [
      { name: 'High Priest', req: { chapel: 2 }, cost: 180, key: 'wis', tagAdd: 'social', blurb: 'A voice the gods answer promptly.' },
      { name: 'Paladin', req: { chapel: 1, training: 2 }, cost: 150, key: 'str', tagAdd: 'combat', blurb: 'Faith, armored.' },
    ],
    Ranger: [
      { name: 'Beastlord', req: { training: 2 }, cost: 120, key: 'wis', tagAdd: 'combat', blurb: 'The pack answers to one whistle.' },
      { name: 'Warden', req: { library: 1, training: 1 }, cost: 120, key: 'con', tagAdd: 'protection', blurb: 'The border walks with them.' },
    ],
    Bard: [
      { name: 'Enchanter', req: { library: 2 }, cost: 150, key: 'cha', tagAdd: 'arcane', blurb: 'A song that argues back.' },
      { name: 'Duelist', req: { training: 2 }, cost: 120, key: 'dex', tagAdd: 'combat', blurb: 'Wit at rapier speed.' },
    ],
  };

  // --- Buildable wings, standing on the guild's own land ------------------
  // The five expansions used to be pure stat lines: you paid 120g for a Library
  // and nothing appeared anywhere, and there was nowhere to go. They are places
  // now — each has a plot, a building that rises on it, and a door.
  //
  // Coordinates are the SAME hall-normalized space every room and waypoint uses,
  // and they are deliberately allowed OUTSIDE 0..1. The painting fills its own
  // canvas (only two clear patches of grass big enough to build on), so the site
  // extends past it — which is also the truthful picture: the guild owns land,
  // and raising a wing claims another piece of it. Nothing inside the painting
  // had to be re-measured for this, which is exactly the trap that killed the
  // base-image-swap approach.
  const WING_PLOTS = {
    library:   { rect: [0.255, 0.005, 0.199, 0.116], art: 'wing_tables', tint: 0x9fb6d8,
                 blurb: 'Reading tables and a locked case. Scholars work here.' },
    warroom:   { rect: [0.460, 0.005, 0.199, 0.116], art: 'wing_tables', tint: 0xd8a878,
                 blurb: 'A long table, and the realm laid out on it.' },
    chapel:    { rect: [-0.150, 0.280, 0.114, 0.203], art: 'wing_stone', tint: 0xd9cf9f,
                 blurb: 'Cold stone, warm candles. The hall comes here to sit.' },
    bathhouse: { rect: [-0.150, 0.560, 0.106, 0.152], art: 'wing_bath', tint: 0xffffff,
                 blurb: 'Hot water and a bench. Cheaper than a physician.' },
    infirmary: { rect: [1.030, 0.300, 0.162, 0.155], art: 'wing_beds', tint: 0xc9dcc9,
                 blurb: 'Clean beds, boiled linen, someone awake at night.' },
  };

  // --- the town the guild stands in ---------------------------------------
  // The guild used to float in a black void. This is the village street north
  // of it: buildings the guild does not own, on ground it does not own, purely
  // so the hall is somewhere rather than nowhere.
  //
  // Same normalized space as WING_PLOTS (over the 1280px hall image, negative
  // and >1 allowed). `art` is the assets/town/<art>.png stem, and the rect is
  // the art's own pixel size / 1280 so it draws at 1:1 — these are pixel art,
  // and scaling them to fit a rect would resample them into mush.
  //
  // NOTHING here is interactive. The plot zones and the room hotspots already
  // compete for taps; a tappable building out here would be a third claimant
  // and the plot-tap bug would come back somewhere new.
  //
  // ⚠️ These rects must NOT reach the camera's fit/start zoom — see
  // siteBounds() vs worldBounds() in hall.js. They widen the world you can pan
  // over, not the view you open on.
  const TOWN_STREET_Y = -0.108;          // the road's centre line
  // Buildings with a `lot` are VILLAGE LOTS: they start as vacant ground and
  // are raised with gold, one by one — the street gets busier as they go up
  // (each finished building puts another villager on the road). The stall,
  // the well and the trees are street furniture and are always there.
  const TOWN = [
    // north side of the street, facing down onto it
    { art: 'inn',     rect: [-0.0020, -0.4089, 0.2375, 0.2734],
      lot: { id: 'inn', name: 'Coaching Inn', cost: 150,
             blurb: 'Beds for travellers, and travellers bring coin and rumour.' } },
    { art: 'bakery',  rect: [0.2905, -0.3792, 0.1984, 0.2437],
      lot: { id: 'bakery', name: 'Bakery', cost: 90,
             blurb: 'Warm bread on the morning air. The street wakes earlier.' } },
    { art: 'smithy',  rect: [0.5439, -0.3730, 0.2234, 0.2375],
      lot: { id: 'smith_n', name: 'Village Smithy', cost: 110,
             blurb: 'Hammer-song and horseshoes. Farmers stop complaining about the roads.' } },
    { art: 'chapel',  rect: [0.8223, -0.3746, 0.1797, 0.2391],
      lot: { id: 'chapel_t', name: 'Wayside Chapel', cost: 130,
             blurb: 'A bell for weddings and warnings both.' } },
    { art: 'cottage', rect: [1.0570, -0.2839, 0.1766, 0.1484],
      lot: { id: 'cot_e', name: 'Cottage', cost: 40,
             blurb: 'Somebody moves in. Lights in a window at dusk.' } },
    { art: 'cottage', rect: [-0.2336, -0.2839, 0.1766, 0.1484],
      lot: { id: 'cot_w', name: 'Cottage', cost: 40,
             blurb: 'Somebody moves in. Washing on a line by noon.' } },
    // south side, between the street and the guild's own north wings
    { art: 'stall',   rect: [0.2037, -0.1361, 0.1625, 0.1297] },
    { art: 'well',    rect: [0.5867, -0.1320, 0.0891, 0.1250] },
    // and two down the western approach, past the chapel and bathhouse
    { art: 'cottage', rect: [-0.3683, 0.2641, 0.1766, 0.1484],
      lot: { id: 'cot_sw', name: 'Cottage', cost: 40,
             blurb: 'The lane stops feeling like the edge of town.' } },
    { art: 'smithy',  rect: [-0.3942, 0.4200, 0.2234, 0.2375],
      lot: { id: 'smith_w', name: 'Wagonwright', cost: 110,
             blurb: 'Wheels mended, axles trued. Caravans linger longer.' } },
    // Greenery and street dressing, arranged as CLUSTERS around anchor trees
    // ("more natural, less like you threw a bunch of icons at the screen"):
    // nature clumps — a tree gathers a bush, flowers and a stone; open meadow
    // breathes between groups; worn-earth patches sit where feet would wear
    // the grass (the well, the stall). `flip` mirrors a sprite for variety.
    // Sizes are each PNG's own /1280; contact shadows are baked in by
    // tools/gen_ground_layer.py. Provenance: tools/town.json.
    // -- the tree line behind the street lots
    { art: 'tree_pine', rect: [-0.1972, -0.5276, 0.1406, 0.2672] },
    { art: 'bush',      rect: [-0.100, -0.300, 0.0375, 0.03125] },
    { art: 'tree_oak',  rect: [-0.0366, -0.4700, 0.1781, 0.2188] },
    { art: 'flowers',   rect: [0.078, -0.290, 0.025, 0.025] },
    { art: 'tree_pine', rect: [0.2128, -0.5276, 0.1406, 0.2672], flip: true },
    { art: 'bush',      rect: [0.302, -0.296, 0.0375, 0.03125], flip: true },
    { art: 'tree_oak',  rect: [0.3784, -0.4700, 0.1781, 0.2188] },
    { art: 'clover',    rect: [0.492, -0.288, 0.0375, 0.028125] },
    { art: 'tree_pine', rect: [0.5628, -0.5276, 0.1406, 0.2672] },
    { art: 'bush',      rect: [0.655, -0.298, 0.0375, 0.03125] },
    { art: 'tree_oak',  rect: [0.8734, -0.4700, 0.1781, 0.2188], flip: true },
    { art: 'flowers',   rect: [0.978, -0.290, 0.025, 0.025] },
    // -- colour accents: the census said the world was 45% orange-brown with
    // under 2% red and 1% purple — these are the missing complements
    { art: 'flowerbed_warm', rect: [0.414, -0.0925, 0.0625, 0.0375] },
    { art: 'flowerbed_cool', rect: [0.535, -0.090, 0.0625, 0.0375] },
    { art: 'flowerbed_warm', rect: [-0.310, 0.400, 0.0625, 0.0375] },
    { art: 'flowerbed_cool', rect: [0.600, 1.055, 0.0625, 0.0375] },
    { art: 'pond',           rect: [1.200, 0.325, 0.1, 0.075] },
    // -- the street's south verge: worn where people actually stand
    { art: 'wornearth', rect: [0.243, -0.047, 0.0625, 0.04375] },
    { art: 'wornearth', rect: [0.568, -0.052, 0.0625, 0.04375] },
    { art: 'flowers',   rect: [0.160, -0.055, 0.025, 0.025] },
    { art: 'haycart',   rect: [0.720, -0.085, 0.05, 0.04375] },
    { art: 'rocks',     rect: [0.778, -0.052, 0.03125, 0.025], flip: true },
    // -- the western margin, three loose groups down the lane
    { art: 'tree_oak',  rect: [-0.4666, -0.0250, 0.1781, 0.2188] },
    { art: 'bush',      rect: [-0.352, 0.158, 0.0375, 0.03125], flip: true },
    { art: 'flowers',   rect: [-0.310, 0.143, 0.025, 0.025] },
    { art: 'tree_pine', rect: [-0.4622, 0.2544, 0.1406, 0.2672] },
    { art: 'rocks',     rect: [-0.360, 0.472, 0.03125, 0.025] },
    { art: 'tree_oak',  rect: [-0.4616, 0.5350, 0.1781, 0.2188], flip: true },
    { art: 'bush',      rect: [-0.346, 0.712, 0.0375, 0.03125] },
    { art: 'clover',    rect: [-0.300, 0.726, 0.0375, 0.028125] },
    // -- close to the guild
    { art: 'bush',      rect: [-0.075, 0.030, 0.0375, 0.03125] },
    { art: 'flowers',   rect: [-0.044, 0.078, 0.025, 0.025] },
    { art: 'bush',      rect: [0.050, 0.400, 0.0375, 0.03125] },
    { art: 'rocks',     rect: [0.096, 0.448, 0.03125, 0.025] },
    { art: 'flowers',   rect: [0.116, 0.412, 0.025, 0.025] },
    // -- north-east corner grove
    { art: 'tree_oak',  rect: [0.8084, -0.1050, 0.1781, 0.2188] },
    { art: 'bush',      rect: [0.917, 0.078, 0.0375, 0.03125], flip: true },
    { art: 'flowers',   rect: [0.842, 0.102, 0.025, 0.025] },
    { art: 'rocks',     rect: [0.950, 0.220, 0.03125, 0.025] },
    // -- the east lawn: a real grove, a lone pine, a lower stand
    { art: 'tree_pine', rect: [1.0078, -0.1176, 0.1406, 0.2672] },
    { art: 'tree_oak',  rect: [1.0464, -0.0130, 0.1781, 0.2188], flip: true },
    { art: 'bush',      rect: [1.165, 0.165, 0.0375, 0.03125] },
    { art: 'rocks',     rect: [1.058, 0.186, 0.03125, 0.025], flip: true },
    { art: 'tree_pine', rect: [1.1928, 0.3044, 0.1406, 0.2672], flip: true },
    { art: 'flowers',   rect: [1.212, 0.532, 0.025, 0.025] },
    { art: 'tree_oak',  rect: [1.0484, 0.3950, 0.1781, 0.2188], flip: true },
    { art: 'tree_pine', rect: [0.9878, 0.4324, 0.1406, 0.2672] },
    { art: 'bush',      rect: [1.092, 0.648, 0.0375, 0.03125] },
    { art: 'clover',    rect: [1.150, 0.602, 0.0375, 0.028125] },
    { art: 'tree_oak',  rect: [1.1684, 0.5550, 0.1781, 0.2188] },
    { art: 'bush',      rect: [1.200, 0.840, 0.0375, 0.03125], flip: true },
    { art: 'tree_oak',  rect: [1.0084, 0.7750, 0.1781, 0.2188] },
    { art: 'rocks',     rect: [1.122, 0.958, 0.03125, 0.025] },
    // -- the south field
    { art: 'tree_pine', rect: [-0.0922, 0.8444, 0.1406, 0.2672] },
    { art: 'bush',      rect: [0.004, 1.076, 0.0375, 0.03125] },
    { art: 'tree_pine', rect: [0.2578, 0.8544, 0.1406, 0.2672], flip: true },
    { art: 'tree_oak',  rect: [0.3044, 0.9390, 0.1781, 0.2188], flip: true },
    { art: 'flowers',   rect: [0.318, 1.102, 0.025, 0.025] },
    { art: 'clover',    rect: [0.422, 1.052, 0.0375, 0.028125] },
    { art: 'tree_oak',  rect: [0.4984, 0.9150, 0.1781, 0.2188] },
    { art: 'rocks',     rect: [0.612, 1.100, 0.03125, 0.025] },
    { art: 'tree_oak',  rect: [0.8084, 0.8950, 0.1781, 0.2188], flip: true },
    { art: 'bush',      rect: [0.922, 1.076, 0.0375, 0.03125] },
    { art: 'flowers',   rect: [0.900, 1.104, 0.025, 0.025] },
  ];

  // The roads themselves, as bands rather than an autotiled grid: the town is
  // static scenery, so a Wang autotiler would be machinery with one input. Each
  // is [x, y, w, h] with the SAME normalized space, drawn with road_h/road_v.
  const TOWN_ROADS = [
    // the spur from the street down to the guild's front door — a place feels
    // designed when the ways people walk are worn into it
    { dir: 'v', rect: [0.4875, -0.108, 0.025, 0.245] },
    { dir: 'h', rect: [-0.420, TOWN_STREET_Y - 0.0125, 1.640, 0.025] },
    { dir: 'v', rect: [-0.2425, TOWN_STREET_Y, 0.025, 0.790] },
  ];

  // Where townsfolk walk. A loop along the street and down the western
  // approach, in the same normalized space. They are scenery: they never enter
  // the guild, are not in any roster, and are not tappable.
  const TOWN_WALK = [
    [-0.230, TOWN_STREET_Y], [0.180, TOWN_STREET_Y], [0.430, TOWN_STREET_Y],
    [0.700, TOWN_STREET_Y], [0.960, TOWN_STREET_Y], [0.700, TOWN_STREET_Y],
    [0.430, TOWN_STREET_Y], [0.180, TOWN_STREET_Y],
    [-0.230, TOWN_STREET_Y], [-0.230, 0.360], [-0.230, 0.600], [-0.230, 0.360],
  ];

  // The fires the hall painting already draws, and how far each throws light.
  // [x, y, radius] — x/y normalized like every other hall rect, radius in
  // world pixels. Lives here rather than in hall.js because the Godot and
  // Unity halls light the same fires: a hearth list in the renderer would be
  // three hand-copies of the same seven numbers.
  const HEARTHS = [
    [0.258, 0.428, 150], [0.555, 0.428, 150],                // the fire pillars
    [0.390, 0.300, 110],                                     // the bar's candles
    [0.100, 0.075, 100],                                     // the kitchen range
    [0.280, 0.617, 120], [0.460, 0.617, 120],
    [0.640, 0.617, 120], [0.820, 0.617, 120],                // the south range
  ];

  // What you can DO in each once it stands. Deliberately the same shape as the
  // tavern's "stand a round" and the kitchen's meals — a gold cost against a
  // hall-wide effect — so the wings read as part of the game rather than beside it.
  const WING_ACTIONS = {
    library:   { id: 'study', name: 'Open the archives', icon: '📖', cost: 18,
                 blurb: 'An afternoon over old campaign accounts. Everyone learns something.' },
    warroom:   { id: 'maps', name: 'Study the maps', icon: '🗺', cost: 25,
                 blurb: 'Re-read the roads. Fresh work is posted to the board.' },
    chapel:    { id: 'vigil', name: 'Hold a vigil', icon: '🕯', cost: 20,
                 blurb: 'A night for the fallen and the frightened alike.' },
    bathhouse: { id: 'baths', name: 'Heat the baths', icon: '♨️', cost: 16,
                 blurb: 'Steam, and an hour where nobody is anybody\'s captain.' },
    infirmary: { id: 'tend', name: 'Tend the wounded', icon: '✚', cost: 22,
                 blurb: 'Dress every wound properly instead of quickly.' },
  };

  // --- Difficulty --------------------------------------------------------
  // Class-tag affinity made the campaign markedly easier (88% win / 103 days
  // before it worked, 94% / 76 after), and picking a single number for everyone
  // is the wrong call to make on a player's behalf — so it is a setting.
  //
  // Three levers, chosen because they move different things: `dc` changes how
  // often you succeed, `bounty` changes how fast the guild can afford to grow,
  // and `death` changes what a critical failure costs you. A tier that only
  // moved DC would make hard mode slower rather than tenser.
  const DIFFICULTIES = {
    steady: { name: 'Steady', icon: '🕯', dc: -2, bounty: 1.15, death: 0.6,
      blurb: 'Kinder contracts, better pay, and your people are harder to lose. For playing the management, not the odds.' },
    guildmaster: { name: 'Guildmaster', icon: '⚑', dc: 0, bounty: 1, death: 1,
      blurb: 'The hall as it was built. Contracts as written, losses as they fall.' },
    grim: { name: 'Grim', icon: '💀', dc: 2, bounty: 0.9, death: 1.35,
      blurb: 'Harder checks, thinner purses, and a crit-fail is far likelier to be somebody\'s last. Expect to lose halls.' },
  };
  const DIFFICULTY_ORDER = ['steady', 'guildmaster', 'grim'];
  const DEFAULT_DIFFICULTY = 'guildmaster';

  // --- Meals (kitchen) — cost, fed restored, mood bonus -----------------
  const MEALS = [
    { name: 'Gruel', cost: 5, fed: 25, happy: 0 },
    { name: 'Hearty Stew', cost: 15, fed: 55, happy: 8 },
    { name: 'Feast', cost: 40, fed: 100, happy: 25 },
  ];

  // Names
  const FIRST = ['Lessa', 'Torga', 'Bellan', 'Velk', 'Mira', 'Karro', 'Sable', 'Doran', 'Vey', 'Halric',
    'Ona', 'Pike', 'Wren', 'Garrick', 'Isolde', 'Bram', 'Nyx', 'Corvin', 'Tamsin', 'Faye', 'Roon', 'Cael'];
  const LAST = ['the Whisper', 'the Bold', 'Quickhand', 'the Grim', 'Ironfoot', 'the Lucky', 'Stormborn',
    'the Crow', 'Goldeye', 'the Vagrant', 'Brightblade', 'of Hollowmere', 'the Untested', 'Ashwalker'];

  return {
    ABILITIES, ABILITY_LABEL, SKILLS, SKILL_LABEL, PROF, PROF_LABEL, PROF_ORDER,
    ANCESTRIES, BACKGROUNDS, CLASSES, TRAITS, TAG_SKILL, TAGS,
    RANKS, RANK_ORDER, CONTRACT_TEMPLATES, PLACES, CLIENTS, ROOMS, MEALS, FIRST, LAST,
    MATERIALS, MAT_BY_ID, GEAR, GEAR_BY_ID, SLOTS, ZONES, ZONE_BY_ID, FACILITIES, PROMOTIONS,
    DAY_SLOTS, SLOT_LABEL, TRAIN_BRANCHES, BRANCH_OF_SKILL, CRAFT_BRANCHES,
    SLOT_CRAFT_DISCOUNT, REMEDIES, REMEDY_BY_ID,
    DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, WING_PLOTS, WING_ACTIONS,
    ROOM_ART, ROOM_INNER, CHAR_SHEET, CHAR_SHEETS, CHAR_ANIMS,
    TOWN, TOWN_ROADS, TOWN_WALK, TOWN_STREET_Y, HEARTHS,
  };
})();
