/* Storyline: staff NPCs, a campaign of beats tied to milestones, and a
 * territory that grows as you conquer regions. Beats fire from triggers
 * (start / day / reputation / boss cleared) and are shown as NPC dialogue.
 */
window.GH = window.GH || {};

GH.story = (function () {
  // --- Staff / cast -------------------------------------------------------
  // Setting: EMBERFALL (the Mythloom universe) — three generations after the
  // Cinder War, when the sky burned for a year. Ember-glass lights the towns
  // and it is slowly dimming; the Compact of Nine Roads holds a fragile
  // peace; something under the ash-forests is being sung awake.
  const STAFF = {
    patron: { name: 'Warden Seraphine Vaile', role: 'Warden of the Compact', color: '#c0a04a', mono: 'S' },
    loremaster: { name: 'Old Brann', role: 'Loremaster of the Ashfall', color: '#6fa0c0', mono: 'B' },
    quartermaster: { name: 'Maribel', role: 'Emberwright Quartermaster', color: '#9fbf6f', mono: 'M' },
    rival: { name: 'Rook Vane', role: "Emberwrights' Company Master", color: '#a23a2e', mono: 'R' },
  };

  // --- Beats (in roughly the order they unlock) --------------------------
  const BEATS = [
    {
      id: 'intro', scene: 'assets/keyart/hall_counter.jpg', trigger: { start: true }, speaker: 'patron',
      text: "The Compact can't be seen doing this work, so I'm chartering you to do it instead. This hall, a thin ledger, and road-law at your back — make it count. Start small: bandits on the Greenfields road are bleeding the hearth-towns, and their Chief laughs at Warden patrols. Deal with him.",
      objective: 'Clear the Greenfields — defeat the Bandit Chief.',
    },
    {
      id: 'gf_clear', scene: 'assets/maps/zone_ashwood.jpg', mood: 'warm', trigger: { boss: 'greenfields' }, speaker: 'loremaster',
      text: "The Chief is dead and the Nine Roads breathe easier. But listen — Ashwood has gone quiet. The ash-fed trees grow too tall there, and the children's rhymes have new verses nobody taught them. The Choir's song, some say. Send your people north, and mind what sings back.",
      objective: 'Push north into Ashwood.', reward: { mats: { iron: 4 } },
    },
    {
      id: 'rep10', scene: 'assets/keyart/ext_market.jpg', mood: 'warm', trigger: { rep: 10 }, speaker: 'quartermaster',
      text: "Word's spreading down the Nine Roads. The Guild let me buy ember-glass at wright's rates this morning — that never happens for a charter hall. Take some coin off the books and put it into the forge. Out here, good steel outlasts good luck.",
      reward: { gold: 70 },
    },
    {
      id: 'aw_clear', scene: 'assets/maps/zone_karst.jpg', mood: 'stern', trigger: { boss: 'ashwood' }, speaker: 'rival',
      text: "So the charter hall can swing a sword. Enjoy your haunted forest — the Emberwrights pay me for real work: opening Old Age vaults in the Karst. Rich seams, undimmed glass. Stay out of my Depths, Guildmaster. They'd eat your rookies alive.",
      objective: 'Descend into the Karst Depths.',
    },
    {
      id: 'rep25', scene: 'assets/maps/map_realm.jpg', mood: 'warm', trigger: { rep: 25 }, speaker: 'patron',
      text: "The Free Cities' councils met last night. They voted to fly your banner over the eastern holdings — the first charter hall so honoured since the Compact was signed. Territory, and the responsibilities that come with it. Spend wisely.",
      reward: { gold: 120 }, annex: true,
    },
    {
      id: 'ka_clear', scene: 'assets/maps/zone_cinder.jpg', mood: 'stern', trigger: { boss: 'karst' }, speaker: 'loremaster',
      text: "The Hollow King was no king — it was a seal, set in the Old Age to keep something sleeping. Rook's Emberwrights cracked the vaults hunting undimmed glass, and the Choir's song poured in like water. Region by region, the sleeper stirs. Cinder Reach is next — where the sky first burned.",
      objective: 'Brave Cinder Reach before it spreads.',
    },
    {
      id: 'ci_clear', scene: 'assets/maps/zone_sunken.jpg', mood: 'stern', trigger: { boss: 'cinder' }, speaker: 'rival',
      text: "...I lost two whole companies to the Cinder Wyrm, and the Guild's ledgers called it acceptable. It wasn't. You cleared it. I don't like you — but I opened those vaults, and I like what's waking even less. The song ends at the Sunken Mile. Take every hand you can get. Mine included.",
      objective: 'End it at the Sunken Mile.', reward: { recruit: true },
    },
    {
      id: 'su_clear', scene: 'assets/keyart/ext_festival.jpg', mood: 'warm', trigger: { boss: 'sunken' }, speaker: 'patron',
      text: "The Drowned Sovereign is sunk for good, the vaults are sealed, and the song under the ash has gone quiet. Five regions fly your colours. The Wardens will write this plainly: when the Compact could not act, this hall did. You are in the histories now, Guildmaster. We both are.",
    },
    {
      id: 'era2_open', scene: 'assets/maps/map_realm.jpg', mood: 'stern', trigger: { era: 2 }, speaker: 'patron',
      text: "The Compact read our ledgers twice — they didn't believe them either time. So here is a second charter: the Marches, east along the Nine Roads, where the dimming runs deepest and the seasons still have teeth. Harvest will drown you in escort work; Frost will freeze your roads and fatten your purses. And Rook Vane's company is already out there, bidding on everything that pays. Provision accordingly, Guildmaster.",
      objective: 'Era II — The Marches: take Thornmere from the briars.',
    },
    {
      id: 'th_clear', scene: 'assets/maps/zone_thornmere.jpg', mood: 'stern', trigger: { boss: 'thornmere' }, speaker: 'rival',
      text: "The Briar-Bound Knight. My grandfather's company left him in those hedges and wrote the ledger closed. You cut him out. Fine — I'll say it once, plainly: my crews will keep bidding, because that's the trade. But Greyreach... Greyreach buries the crews that go alone. Watch the pale processions. Count who comes back.",
      objective: 'Greyreach lies open — mind the processions.',
    },
    {
      id: 'gr_clear', scene: 'assets/maps/zone_greyreach.jpg', mood: 'stern', trigger: { boss: 'greyreach' }, speaker: 'loremaster',
      text: "The Pale Magistrate kept court for a century because nobody contested the docket. You just did. What's left is the Ember Wastes — where the glass in the ground still hums the Choir's song, and something out there answers to a Herald. End the Marches charter there, Guildmaster. And come back — all of you.",
      objective: "The Ember Wastes: silence the Choir's Herald.",
    },
    {
      id: 'era3_open', scene: 'assets/maps/zone_emberwastes.jpg', mood: 'stern', trigger: { era: 3 }, speaker: 'loremaster',
      text: "It was never five bosses, or a rival's ledgers. It was a lullaby sung backwards, one seal at a time. The Choir means to wake what the Old Age put under the ash, and the gates are how it breathes. Every gate you shut buys the realm a season. Three left open, and there is no realm. Take your drilled teams — the sworn, the scarred, the ones who made you promises. They are the only arithmetic the Sleeper understands.",
      objective: 'Close the rift gates — never let three stand unanswered.',
    },
  ];
  const BEAT_BY_ID = Object.fromEntries(BEATS.map((b) => [b.id, b]));

  function fresh() { return { seen: {}, objective: '', log: [], pending: [] }; }

  function triggerMet(state, t) {
    if (t.start) return true;
    if (t.day != null) return state.day >= t.day;
    if (t.rep != null) return state.reputation >= t.rep;
    if (t.boss) return !!state.bossDone[t.boss];
    if (t.zone) return state.zonesUnlocked.includes(t.zone);
    if (t.era != null) return (state.era || 1) >= t.era;
    return false;
  }

  function applyReward(state, r) {
    if (!r) return [];
    const notes = [];
    if (r.gold) { state.gold += r.gold; notes.push(`+${r.gold}g`); }
    if (r.mats) Object.entries(r.mats).forEach(([m, q]) => { GH.items.addMat(state.inventory, m, q); notes.push(`+${q} ${GH.data.MAT_BY_ID[m].name}`); });
    if (r.recruit && state.roster.length < GH.sim.bedsCount()) {
      const a = GH.pf.generate({ spriteIndex: state.roster.length, taken: state.roster.map((r) => r.name) });
      state.roster.push(a); notes.push(`${a.name} joins`);
    }
    return notes;
  }

  // Evaluate triggers; fire any newly-met, unseen beats. Returns fired beats.
  function check(state) {
    if (!state.story) state.story = fresh();
    const fired = [];
    BEATS.forEach((b) => {
      if (state.story.seen[b.id]) return;
      if (!triggerMet(state, b.trigger)) return;
      state.story.seen[b.id] = true;
      const rewardNotes = applyReward(state, b.reward);
      if (b.objective) state.story.objective = b.objective;
      const entry = { id: b.id, speaker: b.speaker, mood: b.mood || '', scene: b.scene || '', text: b.text, objective: b.objective || '', reward: rewardNotes };
      state.story.log.unshift(entry);
      state.story.pending.push(entry);
      fired.push(entry);
      if (state.log) state.log.unshift({ text: `${STAFF[b.speaker].name}: a word with you…`, kind: 'turn', day: state.day });
    });
    return fired;
  }

  function init(state) { state.story = fresh(); check(state); }
  function onNewDay(state) { return check(state); }
  function onBossCleared() { /* territory follows bossDone; beats fire on the day check */ }

  // First outbreak → Old Brann explains the stakes (one-time beat).
  function onOutbreak(state, ob) {
    if (!state.story) state.story = fresh();
    if (state.story.seen.first_outbreak) return;
    state.story.seen.first_outbreak = true;
    const entry = {
      id: 'first_outbreak', speaker: 'loremaster',
      scene: 'assets/maps/map_breach.jpg',
      text: `That rumble under your boots? ${ob.zoneName} just cracked open — an old seal giving way, and what was under it climbing out. Outbreaks don't wait politely on a job board: send a full team before the count runs out, or the region pays for our slowness. Check the map, Guildmaster.`,
      objective: 'Contain the outbreak from the Map before it expires.', reward: [],
    };
    state.story.log.unshift(entry);
    state.story.pending.push(entry);
  }

  function takePending(state) {
    if (!state.story) return [];
    const p = state.story.pending; state.story.pending = []; return p;
  }

  // Territory = regions whose boss is cleared.
  function territory(state) {
    const total = GH.data.ZONES.length;
    const controlled = GH.data.ZONES.filter((z) => state.bossDone[z.id]).length;
    return { controlled, total };
  }
  function regionStatus(state, zone) {
    if (state.bossDone[zone.id]) return 'controlled';
    if (state.zonesUnlocked.includes(zone.id)) return 'active';
    return 'locked';
  }

  return { STAFF, BEATS, BEAT_BY_ID, init, check, onNewDay, onBossCleared, onOutbreak, takePending, territory, regionStatus };
})();
