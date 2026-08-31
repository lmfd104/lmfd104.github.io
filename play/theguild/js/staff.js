/* Persistent hall staff — the people who run the building while heroes come
 * and go. Each staffer keeps a post, has a face (canon art where it exists,
 * monogram fallback otherwise), and opens up as you talk: familiarity is
 * counted per save (state.staffChat[key] = { count, lastDay }) and their
 * dialogue pools deepen at 3 and 7 chats. First chat each day counts.
 */
window.GH = window.GH || {};

GH.staff = (function () {
  // post: room id (for "who's here" listings); zone: normalized tap rect over
  // a figure BAKED into the hall art; spawn: [x,y,tint] for staff we add as
  // sprites (smith, drillmaster). speaker: staffFace() art key when canon.
  // Every staffer is a SPAWNED SPRITE now. Four of them used to be figures
  // painted into the old hall art with only a tap `zone` over the paint — and
  // when the hall stopped being that painting (tools/gen_hall_build.py), their
  // bodies went with it, leaving name tags floating over bare floor. That was
  // the player's "Brann is the character hidden under the floor".
  const STAFF = [
    { key: 'maribel', name: 'Maribel', role: 'Keeper of the Kitchen', speaker: 'quartermaster', post: 'kitchen',
      spawn: [0.105, 0.170, 0xd9a05a] },
    { key: 'brann', name: 'Brann', role: 'Barkeep & Loremaster', speaker: 'loremaster', post: 'tavern',
      spawn: [0.34, 0.298, 0xcc8855] },
    { key: 'seraphine', name: 'Warden Seraphine Vaile', role: 'The Compact\'s Warden', speaker: 'patron', post: 'training',
      spawn: [0.845, 0.79, 0xaa88cc] },
    { key: 'tessa', name: 'Old Tessa', role: 'Keeper of the Keys', post: 'dormitory',
      spawn: [0.33, 0.77, 0xddddcc] },
    { key: 'hedda', name: 'Hedda', role: 'Guild Smith', post: 'smithy',
      spawn: [0.545, 0.80, 0xb0b8c8] },
    { key: 'orn', name: 'Drillmaster Orn', role: 'Master-at-Arms', post: 'training',
      spawn: [0.80, 0.83, 0x88aacc] },
  ];
  const BY_KEY = Object.fromEntries(STAFF.map((s) => [s.key, s]));

  // Dialogue pools by familiarity tier: 0 = new, 1 = warm (3+), 2 = trusted (7+).
  const LINES = {
    maribel: [
      ["The stew's honest and the bread's fresh. That's the whole secret.",
       'Eat before you ride, that\'s all I ask. Corpses don\'t pay board.',
       'Mind the floor, I just did it. Adventurers, I swear.'],
      ['You want the trick? Bay leaf, and don\'t stir angry. Food knows.',
       'I feed them like they\'re mine. They are, a little, aren\'t they?',
       'The tall one hides bread in their pack for the road. I bake extra now.'],
      ['I had a hall of my own once, before the Cinder War took the village. This kitchen is that hall. Thank you for keeping it loud.',
       'When one of ours doesn\'t come home, I still set their bowl out. Once. Then I wash it and we go on. That\'s how kitchens grieve.'],
    ],
    brann: [
      ['Ask the ale or ask the archive — I keep both.',
       'Every scar in this room has a story. Most of them are even true.',
       'The Compact writes history. I just remember it correctly.'],
      ['You run this hall better than the last three charters. I keep records; I\'d know.',
       'The song under the ash — it\'s older than the Compact. Older than the Nine Roads. Drink up.',
       'Vane\'s grandfather drank here once. Tipped well. Families are complicated.'],
      ['I was an Emberwright, before the vaults. I keep the bar because glass behaves and history doesn\'t.',
       'When this is all written down, Guildmaster, I\'ll see they spell your name right. It\'s the only immortality that keeps.'],
    ],
    seraphine: [
      ['The Compact watches. Fortunately for you, so do I.',
       'Contracts, Guildmaster. Renown is just paperwork that learned to sing.',
       'Walk with me sometime. The trophy wall tells the hall\'s real ledger.'],
      ['I chartered eleven halls before this one. I remember why I stopped counting at yours.',
       'The Wardens call this hall "the deniable option." I\'ve started correcting them: "the dependable one."'],
      ['I was a sword before I was a seal, you know. Some mornings I miss the honesty of it. Then a courier arrives, and I get to fight with better weapons.',
       'If I\'m ever recalled, refuse my replacement twice before you accept. It\'s how you\'ll know their measure. It\'s how I knew yours.'],
    ],
    tessa: [
      ['Beds made, keys counted, lamps trimmed. Don\'t track mud past me.',
       'I know who snores, who cries, and who prays. Keys hear everything.',
       'The dimming takes the lamps a little more each year. I trim them anyway.'],
      ['The young ones leave their boots crooked when they\'re homesick. I straighten them. Don\'t tell.',
       'You keep the roof, I keep the rooms. Between us it\'s almost a home.'],
      ['My husband was a Warden. His key still hangs on my ring — the door it opened is ash now. You keep filling these beds, and I\'ll keep having reasons to count keys.'],
    ],
    hedda: [
      ['Iron\'s honest. Bring me ore and stand back.',
       'A dull blade is a funeral you paid for in advance. Bring it here first.',
       'The forge doesn\'t care about renown. It cares about carbon.'],
      ['Your people ask for their dead friends\' weapons rehung, not melted. I do it free. Don\'t put it in the ledger.',
       'Ember-glass in the billet sings when you quench it. First time I heard it, I dropped the tongs.'],
      ['I smithed for Vane\'s company once. They pay better. They also melt the dead\'s blades. That\'s the whole difference, and it\'s everything.'],
    ],
    orn: [
      ['Mats. Forms. Repeat. Glory is footwork that got lucky.',
       'I can make anyone dangerous in a month. Alive-dangerous takes a year.',
       'Again! — sorry, habit. That was for the recruit behind you.'],
      ['Your roster listens now. First month they trained to impress you. Now they train to come home. Better fuel.',
       'The sworn ones drill differently. Watch them sometime — they guard their partner\'s side, not their own.'],
      ['I held a gate once, in the last war. Alone at the end. Every drill I run is so nobody in this hall ever learns what that\'s like.'],
    ],
  };

  function fresh() { return {}; }
  function chatState(state, key) {
    state.staffChat = state.staffChat || fresh();
    state.staffChat[key] = state.staffChat[key] || { count: 0, lastDay: 0 };
    return state.staffChat[key];
  }
  function tierOf(count) { return count >= 7 ? 2 : count >= 3 ? 1 : 0; }
  function tierName(t) { return ['New face', 'Warming up', 'Old friend'][t]; }

  // A situational opener beats a canned line when the hall has news.
  function opener(state, s) {
    const rent = GH.sim.RENT || 40;
    if ((state.outbreaks || []).some((o) => o.isGate)) return 'That gate hums through the floorboards. End it soon, Guildmaster.';
    if ((state.outbreaks || []).length) return 'The hall can feel the outbreak from here. Everyone\'s quieter.';
    if (state.gold < rent) return 'Word is the purse is light for upkeep. We\'ve thinned soup before; we\'ll manage.';
    if (GH.seasons && GH.seasons.of(state) && GH.seasons.of(state).id === 'frost') return 'Frost on the roads. Double socks, half speed, full pay.';
    return null;
  }

  // Pick the line for THIS chat. sim.staffTalk mutates the count; this is pure.
  function lineFor(state, key) {
    const cs = chatState(state, key);
    const t = tierOf(cs.count);
    const pool = (LINES[key] || [[]])[t] || LINES[key][0];
    const line = pool[cs.count % pool.length];
    // GH.rng.chance, not Math.random: rand() is swappable so a seed can be
    // dropped in, and this was the one game-logic call site that reached past
    // it. Same odds for a player; reproducible for a test or another engine.
    const op = (cs.count > 0 && GH.rng.chance(0.35)) ? opener(state, BY_KEY[key]) : null;
    return { line: op || line, tier: t, tierName: tierName(t), count: cs.count };
  }

  return { STAFF, BY_KEY, LINES, chatState, tierOf, tierName, lineFor };
})();
