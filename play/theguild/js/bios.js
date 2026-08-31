/* Bios & deeds — every adventurer gets a life: an origin, a past, a reason
 * they walked through YOUR door, a type they fall for, and a secret.
 * Deterministic per adventurer (seeded on id) so a character's story never
 * changes between sessions. Story unlocks with affinity — get closer, learn
 * more. Deeds are a living timeline written by actual play.
 */
window.GH = window.GH || {};

GH.bios = (function () {
  // --- seeded picks (stable per id + slot) --------------------------------
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return Math.abs(h); }
  const pick = (a, arr, salt) => arr[hash(a.id + salt) % arr.length];

  // --- Origins: where they're from, by ancestry ---------------------------
  const ORIGINS = {
    Human: [
      'Born on a river barge that never moored twice in the same town.',
      'Raised over a smithy; fell asleep every night to hammer-song.',
      'A border-village kid who watched armies pass both ways and trusted neither.',
      'Grew up in the capital\'s shadow district, where every alley owed somebody.',
    ],
    Elf: [
      'Left a canopy city that will not notice their absence for a century.',
      'Youngest of an old house — "youngest" meaning barely eighty.',
      'Raised in a glade shrine, singing to trees that sang back.',
      'Walked out of the Everwood the morning after their first heartbreak.',
    ],
    Dwarf: [
      'Cut their teeth in the deep-hold mines, third generation at the same seam.',
      'From a mountain hall that measures wealth in oaths kept, not gold.',
      'Raised in a brewery; can read a person by what they order.',
      'The clan\'s black sheep — chose sky over stone and never looked back.',
    ],
    Halfling: [
      'From a hill-warren of forty cousins; learned to be quick or eat last.',
      'Grew up on a wandering kitchen-wagon feeding harvest crews.',
      'A riverside burrow, a hundred aunties, and exactly zero privacy.',
      'Left home with one pan, two knives, and an unreasonable amount of luck.',
    ],
    'Half-Orc': [
      'Raised between two camps that both called them the other one\'s.',
      'Brought up by a human grandmother who took exactly zero nonsense.',
      'Came off a war-road orphan train and made family out of strangers since.',
      'Grew up pit-fighting for coin until someone finally asked their name.',
    ],
    Gnome: [
      'Emerged from a burrow-workshop that exploded slightly more often than average.',
      'Raised by a fey-touched aunt who spoke to the house. The house answered.',
      'Left a clockwork commune after "the incident with the automated bees."',
      'Grew up cataloguing feelings like specimens. Still does. Yours included.',
    ],
  };

  // --- Pasts: what they did before, keyed by background -------------------
  // Keyed by data.js BACKGROUNDS — every name here must match one exactly.
  //
  // These used to be keyed by backgrounds from a different game entirely
  // (Street Urchin, Acolyte, Gladiator…), none of which this world has. Nothing
  // ever matched, so the `|| FALLBACK` below caught EVERY adventurer and the
  // whole roster shared the mercenary's past — two lines across a hundred
  // people. Found by porting, fixed 2026-08-17; BiosBackgroundKeysTest in
  // tools/selftest.mjs now fails if the two lists drift apart again.
  const PASTS = {
    'Ash-Warden': [
      'Sang the warding-songs over a village that emptied anyway. Still sings them, at the edge of camp, when they think everyone is asleep.',
      'Walked the treeline alone for six winters so the hearth-town could sleep through them. Says the quiet was good company. It was not.',
    ],
    'Lantern-Bearer': [
      'Carried the lantern for forty-one funerals and can still name all forty-one. Does, sometimes, under their breath.',
      'Sat up with a stranger through their last night because nobody else would. Has never once mentioned it to anyone here.',
    ],
    'Caravan Hand': [
      'Knows every toll-post on the Nine Roads, and which three will take bread instead of coin. Made sure the other drivers knew too.',
      'Held a washed-out crossing alone while the caravan ran for it. The master offered them a share of the load. They asked for the mule.',
    ],
    'Guild Factor': [
      'Counted ember-glass for the Emberwrights until the ledger stopped matching the vaults. Asked about it once. Left the same night.',
      'Their signature is on four clean years of Emberwright manifests. They have never explained the fifth, and nobody has made them.',
    ],
    'Road Warden': [
      'Held sixty miles of road-law with four riders and a horn. Lost the road. Kept the four.',
      'Let a bread-thief go on the Ninth Road and wrote it up as a pursuit. The report is still on file, still a lie, still the right call.',
    ],
    'Vault-Delver': [
      'Opened a sealed hall on a wager and came back out alone. Will not say what the wager was, or who else went in.',
      'Reads a vault door the way other people read weather. Has turned around and walked away from three that everyone else called fine.',
    ],
    'Registered Mystic': [
      'Registered with the Compact at sixteen and has renewed the token every year since. Works exactly the way they were going to work anyway.',
      'Reported their own teacher for unlicensed practice, then quietly paid the fine themselves. Neither of them has ever brought it up.',
    ],
    'Hearth-Town Brawler': [
      'Kept order in a Ninth Road taproom for nine years and only ever broke one table. It was load-bearing.',
      'Threw a man twice their size into the street for frightening the kitchen girl. She still writes to them.',
    ],
  };
  // Only reached if a background has no entry — which the selftest forbids.
  // Deliberately vague: the old fallback was the Mercenary's history, so a miss
  // did not read as a miss, it read as a biography.
  const PAST_FALLBACK = [
    'Does not talk about what came before the hall, and nobody has earned the asking yet.',
    'Whatever they did before this, they arrived with the tools for it and no stories.',
  ];

  // --- Why they joined YOUR hall, by archetype -----------------------------
  const WHY = {
    tsun: ['Says it was "the only hall still hiring." The recruiter remembers them asking about you by name.', 'Claims the pay is average and the company worse. Renewed their charter early. Twice.'],
    needy: ['Read the charter line "no one left behind" four times, then signed with shaking hands.', 'Followed a warm light through the rain and decided the light was where they lived now.'],
    genki: ['Burst in asking if the hall needed sunshine. It did.', 'Heard your guild feeds people BEFORE asking their rank. Signed on the spot.'],
    kuu: ['Evaluated seventeen guilds on a weighted matrix. Yours won. The "why" column is... redacted.', 'Arrived with one bag, no explanation, and a letter of reference they never handed over.'],
    brash: ['Announced their arrival as "the best day in this guild\'s history." Day two was rough.', 'Says legends need a good backdrop and your banner photographs well. Stayed for other reasons.'],
    timid: ['Stood outside the door for three hours. You left it open. That decided it.', 'Joined the day after watching your people carry a wounded stranger home.'],
  };

  // --- Their type — what makes them blush, by archetype (kept classy-spicy) --
  const DESIRE = {
    tsun: ['Falls hard for people who out-stubborn her and then hand her the last dumpling like it\'s nothing.', 'Weak to calloused hands and anyone who notices when she\'s lying about being fine.'],
    needy: ['Wants someone who says "come here" first. Will absolutely melt. Every time.', 'Dreams about forehead touches and being someone\'s obvious favorite.'],
    genki: ['Falls for the quiet ones who laugh at the joke nobody else caught.', 'Weak-kneed for slow dances and anyone who matches her energy at 2am.'],
    kuu: ['Composure shatters for exactly one thing: someone reading beside her, shoulder against shoulder.', 'Has a documented weakness for warm hands on cold nights. The documentation is hidden.'],
    brash: ['Wants somebody bold enough to steal the spotlight and share it.', 'Flexes for everyone; goes quiet and careful for the one who sees through it.'],
    timid: ['Blushes at hand-holding. Combusts entirely at being called brave by the right voice.', 'Keeps every kind note ever received in a box. There is room in the box.'],
  };

  // --- Secrets: the Confidant-tier reveal ----------------------------------
  const SECRETS = [
    'Carries a locket with no portrait in it. "Saving the spot," they say.',
    'Sends half of every bounty somewhere. The courier is sworn to silence.',
    'Has a bounty on their head in a distant duchy — for something noble, they insist.',
    'Can\'t swim. Guards this fact like a dragon guards gold.',
    'Keeps a tally of every life saved. Won\'t share the number. It\'s large.',
    'Writes poetry. Burns most of it. The survivors are about someone in this hall.',
    'Was offered a knighthood once. Turned it down and won\'t say what they asked for instead.',
    'Talks in their sleep. Names, apologies, and once — clear as a bell — yours.',
    'Owns a nobleman\'s signet ring that fits them perfectly. Asks you not to think about it.',
    'Learned to dance for a wedding that never happened. Still practices, alone, after close.',
    'Has broken out of two prisons. "Both times were misunderstandings."',
    'Keeps their first wooden training sword under the bunk. Names it. Talks to it after losses.',
  ];

  // --- Quirks: table-flavor, always visible --------------------------------
  const QUIRKS = [
    'Steals blankets. Unrepentant.', 'Names every horse. And most weapons. And one particular chair.',
    'Hums battle-hymns while doing dishes.', 'Can\'t pass a dog without a full negotiation.',
    'Puts honey on everything. Everything.', 'Sharpens knives when thinking. The hall reads the mood by the sound.',
    'Collects river stones shaped like hearts. Claims it\'s ironic.', 'Laughs at funerals, cries at weddings. Wired backwards, works fine.',
    'Braids hair — theirs, yours, the war-horse\'s — when nervous.', 'Undefeated at cards. Banned at two taverns. Proud of both.',
    'Whittles tiny guild banners and leaves them where people will find them.', 'Sings only when it rains. Worth the weather.',
    'Remembers everyone\'s birthday. Refuses to reveal their own.', 'Bites their thumbnail exactly once before every mission. Once.',
    'Keeps a "revenge list." Every entry is crossed out and replaced with "forgiven." Almost every entry.', 'Feeds the hall cat first. THE cat feeds no one first.',
  ];

  // --- Compose (stable per adventurer) -------------------------------------
  function bio(a) {
    return {
      origin: pick(a, ORIGINS[a.ancestry] || ORIGINS.Human, 'org'),
      past: pick(a, PASTS[a.background] || PAST_FALLBACK, 'pst'),
      why: pick(a, WHY[a.archetype] || WHY.genki, 'why'),
      desire: pick(a, DESIRE[a.archetype] || DESIRE.genki, 'dsr'),
      secret: pick(a, SECRETS, 'sec'),
      quirk: pick(a, QUIRKS, 'qrk'),
    };
  }

  /* Reveal gating: intimacy earns the story.
   * always: origin + quirk · Guildmate(15): past · Friend(40): why + type ·
   * Confidant(70): secret. Locked lines render as teases. */
  function reveal(a) {
    const b = bio(a);
    const aff = a.affinity || 0;
    return [
      { k: 'Roots', v: b.origin, open: true },
      { k: 'Quirk', v: b.quirk, open: true },
      { k: 'Before the hall', v: b.past, open: aff >= 15, tease: 'They deflect questions about the past. (Reach Guildmate)' },
      { k: 'Why they stayed', v: b.why, open: aff >= 40, tease: 'There\'s a real answer under the official one. (Reach Friend)' },
      { k: 'Their type', v: b.desire, open: aff >= 40, tease: 'You catch them looking sometimes. At what, exactly? (Reach Friend)' },
      { k: 'Secret', v: b.secret, open: aff >= 70, tease: 'Something they\'ve never told anyone. (Reach Confidant)' },
    ];
  }

  // --- Deeds: a life, as actually lived in your hall ----------------------
  function deed(a, text) {
    const g = GH.sim && GH.sim.get();
    a.deeds = a.deeds || [];
    a.deeds.push({ day: g ? g.day : 1, text });
    if (a.deeds.length > 24) a.deeds = a.deeds.slice(-24);
  }
  function deeds(a) {
    if (!a.deeds || !a.deeds.length) return [{ day: a.joinedDay || 1, text: 'Signed the guild charter.' }];
    return a.deeds;
  }

  return {
    bio, reveal, deed, deeds,
    // Exported so migration/parity/export_data.mjs can ship them to the engine
    // ports as DATA rather than have them hand-copied into two languages.
    ORIGINS, PASTS, PAST_FALLBACK, WHY, DESIRE, SECRETS, QUIRKS,
  };
})();
