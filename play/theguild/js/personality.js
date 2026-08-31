/* Personalities & conversations — the anime heart of the guild.
 * Every adventurer gets an archetype (how they talk), an affinity score
 * with the Guildmaster (0-100), and "heart events": longer conversations
 * that fire at affinity milestones and develop their character arc.
 * At the final tier they swear a bond: +1 to all their rolls, forever.
 */
window.GH = window.GH || {};

GH.personality = (function () {
  const R = GH.rng, D = GH.data;

  // Affinity tiers
  const TIERS = [
    { at: 0, name: 'Stranger' }, { at: 15, name: 'Guildmate' }, { at: 40, name: 'Friend' },
    { at: 70, name: 'Confidant' }, { at: 95, name: 'Kindred' },
  ];
  const HEARTS = [25, 55, 85];      // heart-event thresholds

  /* Six archetypes. dialog contexts:
   * idle, hungry, tired, sad, injured, afterWin, afterLoss, grief,
   * huntBack, promoted — arrays of lines. {G} = guild name, {N} = their first name. */
  const ARCHETYPES = {
    tsun: {
      name: 'Prickly', vibe: 'sharp-tongued, secretly devoted',
      dialog: {
        idle: ["What? I'm busy. ...Fine, I have a minute.", "Don't get the wrong idea. I fight for the coin, not for you.",
          "You again? The hall's too small, that's what it is.", "Hmph. At least the roof doesn't leak anymore."],
        hungry: ["I'm not hungry. ...That growl was the floorboards.", "If you let your best blade starve, that's on you, Guildmaster."],
        tired: ["I could go three more rounds. ...Two. One round.", "Who said I was tired? Wake me in an hour."],
        sad: ["I'm FINE. Leave it.", "Some days this place feels like a cage. Don't quote me."],
        injured: ["It's a scratch. Stop hovering.", "Laugh and I'll show you how healthy my sword arm is."],
        afterWin: ["Obviously we won. I was there.", "Save the praise. ...Okay, a little praise."],
        afterLoss: ["Say nothing. NOTHING.", "Next time I pick the plan. Yours was garbage."],
        grief: ["...They owed me a drink. They still owe me a drink.", "Don't you dare hang their portrait crooked."],
        huntBack: ["I hunted. Things died. You're welcome.", "Brought back trophies. Try to look impressed."],
        promoted: ["About time someone noticed. ...Thank you. There, I said it."],
        gift: ["For ME? I mean— obviously. Who else would deserve it. ...It's really good craftsmanship. Shut up.",
          "I'm only accepting this because refusing would be rude. ...I'm naming it. That's normal. Don't look at me."],
      },
      hearts: [
        ["...You're still here? Fine. One story.", "I burned my first guild card. They said I was unteachable. Too angry.", "So don't think this is loyalty. I just haven't found a better hall. ...Yet."],
        ["That thing I said, about a better hall.", "I stopped looking. Months ago. Don't make it weird.", "If you tell anyone I said that, I will deny it and then set your ledger on fire."],
        ["Listen once, because I won't repeat it.", "Every guild threw me away. You handed me a banner and a bunk and asked nothing back.", "So here's my oath, Guildmaster: my blade is yours until the last hall light goes out. ...Stop smiling."],
      ],
    },
    needy: {
      name: 'Clingy', vibe: 'affection-starved, fiercely attached',
      dialog: {
        idle: ["You came to see me? Me specifically? Say it was me specifically.", "Notice anything? New ribbon. You didn't notice. It's fine. (Notice next time.)",
          "Sit with me at supper? You always sit with the ledgers.", "If you assign me away for more than two days I WILL write letters. Daily."],
        hungry: ["Guildmaster, I'm wasting away. Dramatically. Look how dramatic.", "Feed me and I'll love you forever. More than currently. Which is a lot."],
        tired: ["Carry me to the dorm. You won't? Then I'll just... sleep... here...", "Five more minutes by the fire. Sit. Staaay."],
        sad: ["Everyone has a person. Do I have a person? Am I anyone's person?", "You'd notice if I vanished, right? Right??"],
        injured: ["Does it hurt? Yes. Will attention fix it? Also yes.", "The healer said rest. YOUR visits are rest."],
        afterWin: ["Did you watch?! Tell me you watched!", "I did the thing! The good thing! Praise is customary!"],
        afterLoss: ["Don't be disappointed in me. Anything but that.", "I'll do better. Just... don't look away."],
        grief: ["They always saved me a seat. Who saves me a seat now?", "Hold the memorial candle with me? I can't do it alone."],
        huntBack: ["I'm back! You may express relief now.", "I hunted ALL day and thought about the hall the whole time."],
        promoted: ["A promotion?! From YOU?! I'm going to cry on the paperwork."],
        gift: ["You picked this out? For me?? I'm never taking it off. Ever. It goes in the will.",
          "A GIFT. From YOU. To ME. I need to sit down. Sit down with me. This is a moment."],
      },
      hearts: [
        ["Can I tell you something? Don't laugh.", "Before this guild, I ate alone for three years. Every meal. I counted.", "The first night here, someone just... sat next to me. No reason. I joined for that."],
        ["I used to think being needed and being wanted were the same thing.", "Contracts need me. The team wants me. It took this hall to learn the difference.", "You want me here, right? ...You don't have to answer. Your ledger already budgeted my bunk through winter. I checked."],
        ["Okay. Big speech. Deep breath.", "You're my person, Guildmaster. This hall is my home. That's the whole speech.", "I will follow your banner into anything. Even paperwork. THAT'S devotion."],
      ],
    },
    genki: {
      name: 'Sunbeam', vibe: 'relentlessly cheerful, secretly works hardest',
      dialog: {
        idle: ["GOOD MORNING GUILDMASTER! It's afternoon? GOOD AFTERNOON GUILDMASTER!", "Today's the day something AMAZING happens. I can feel it in my boots!",
          "I reorganized the trophy wall by scariness. The bear is winning.", "Race you to the job board! Ready go!"],
        hungry: ["Fun fact: heroes run on stew! Empty stew tank over here!", "My stomach just roared louder than the last monster. New record!"],
        tired: ["Not tired! ...Okay slightly horizontal. Strategically horizontal.", "Power nap! Twenty minutes! Legendary efficiency!"],
        sad: ["Even sunbeams get clouds sometimes. I'll bounce back! Probably by dinner.", "Smiling's easier when someone checks on you. Thanks for checking."],
        injured: ["The bandages make me look TOUGH, right?", "Healer says a week. I say four days. We compromised on... a week."],
        afterWin: ["WE! ARE! AMAZING! Team hug! Mandatory team hug!", "Did you SEE that?! Someone write a song!"],
        afterLoss: ["Okay so THAT plan's off the list. Growth!", "We lost the fight, not the war! I checked, the war's still on!"],
        grief: ["I keep setting their place at the table. I'm going to keep doing it.", "They liked my dumb jokes. Somebody has to keep laughing for them."],
        huntBack: ["I'm baaack! The forest says hi. The wolves do not.", "Solo hunt complete! Barely got lost twice!"],
        promoted: ["LEVEL UP! I mean— ahem — I humbly accept. WOOHOO!"],
        gift: ["NEW GEAR DAY! Best day! Watch me do the gear dance! There's a dance!",
          "For me?! I'm going to win SO HARD with this. Officially. It's official now."],
      },
      hearts: [
        ["Wanna know a secret? The smile's a choice.", "My village didn't make it. The night I lost everything, a guild took me in and someone said 'you're safe now.'", "I decided right there: I'd be the one who says it next. This hall? This is me saying it."],
        ["You've noticed I train before dawn, right? Don't tell the others.", "Cheer doesn't kill monsters. Practice does. The smile just keeps everyone moving between fights.", "But between us — some mornings the smile only shows up because YOU keep this hall standing."],
        ["Guildmaster! Official sunshine report: this is the safest anyone's ever made me feel.", "So here's my vow — as long as your banner flies, nobody in this hall eats alone, fights alone, or grieves alone.", "That's MY contract. No gold required. Signed, sealed, SUNBEAMED."],
      ],
    },
    kuu: {
      name: 'Frostglass', vibe: 'cool, precise, thaws slowly',
      dialog: {
        idle: ["Guildmaster.", "The hall is at acceptable operating standards. ...That is a compliment.",
          "I have reviewed tomorrow's contracts. Two are beneath us. One is interesting.", "Speak. I am listening. I am always listening."],
        hungry: ["Caloric intake: suboptimal. Correct this.", "I do not 'crave'. I require. There is a difference. ...Stew, preferably."],
        tired: ["Efficiency has dropped four percent. I will rest.", "Do not read into the yawn. It was tactical."],
        sad: ["I am functional.", "...The hall is loud. That used to bother me. Tonight the quiet does instead."],
        injured: ["The wound is catalogued. Recovery is scheduled.", "Pain is information. I have received quite enough information."],
        afterWin: ["Outcome: expected.", "The plan held. Your plan. Noted."],
        afterLoss: ["Recalculating.", "Failure is data. I dislike data today."],
        grief: ["Their bunk is empty. I have walked past it eleven times.", "I do not cry. The dust in the memorial hall is simply aggressive."],
        huntBack: ["Hunt complete. Threats: neutralized. Souvenirs: confiscated by me.", "The wilds were quiet. I made them quieter."],
        promoted: ["Acknowledged. ...I will be worth it."],
        gift: ["...You selected this. Specifically. For my loadout. That is... efficient. And other things. It is other things too.",
          "Acceptable. ...More than acceptable. I will maintain it perfectly. Thank you, Guildmaster."],
      },
      hearts: [
        ["A question. Why do you speak to me daily when I give you nothing back?", "...No. Don't answer. I am not ready for the answer.", "Continue the practice regardless. It is... structurally significant. To morale. Mine."],
        ["I was raised to be a weapon. Weapons do not have halls, or suppers, or people who wave when they return.", "I find, lately, that I wave back.", "This is your fault, Guildmaster. I am documenting it as such."],
        ["Assessment complete. Three hundred days of observation.", "Conclusion: this hall is not a posting. It is a home. You are not an employer. You are... mine to protect.", "The ice was armor, not architecture. You may consider it... off duty. For you."],
      ],
    },
    brash: {
      name: 'Loudmouth', vibe: 'arrogant, magnetic, means half of it',
      dialog: {
        idle: ["There they are! The second-most impressive person in this guild!", "I've been thinking about my statue. Courtyard? Courtyard.",
          "The bards WILL sing about me. I've started writing down suggestions.", "Boss! Great news: I'm still incredible."],
        hungry: ["Legends require FUEL. Where's the meat?!", "I could eat a wyvern. I HAVE eaten a wyvern. Ask about it."],
        tired: ["Even the sun sets, baby. I'll rise harder tomorrow.", "This isn't napping, it's dramatic recharging."],
        sad: ["Even I have off days. Tell no one or the legend suffers.", "You ever roar just to hear an echo? ...Forget it."],
        injured: ["The OTHER guy? Unrecognizable.", "Scars are just tattoos with better stories."],
        afterWin: ["AS FORETOLD! By me! Ten minutes ago!", "Add it to the legend! Chapter twelve: STILL UNDEFEATED-ISH!"],
        afterLoss: ["We don't speak of this. The legend has editors.", "A setback! Every saga needs one. ONE."],
        grief: ["They were louder than me once. Once. ...I'd give a lot to lose that contest again.", "Pour one out. The legend has a hole in it now."],
        huntBack: ["The wilds have HEARD of me now.", "Solo hunt? More like a farewell tour for some very unlucky monsters."],
        promoted: ["FINALLY the paperwork agrees with the prophecy!"],
        gift: ["A gift worthy of the legend! You DO have taste! The bards will mention this chapter!",
          "For me? Naturally. Still — you chose well, boss. This goes on the statue."],
      },
      hearts: [
        ["Between us? The bravado's load-bearing.", "Little village, big monster, and me — the kid who hid. Everyone who didn't hide is a name on a stone now.", "So I got loud. Monsters flinch first when you're loud. So does the memory."],
        ["You've never once called my boasting stupid. You just... point it at the right monsters.", "That's management, that is. The bards should sing about YOU. Don't worry — I'm ghostwriting it.", "Working title: 'The Quiet One Who Aimed the Cannon.' It'll slap."],
        ["Alright. Chapter one, the real one, just for you.", "The kid who hid found a hall where nobody has to hide. That's the whole legend. Everything else is fireworks.", "Point me at anything, Guildmaster. The loudest thing in this realm is on YOUR side."],
      ],
    },
    timid: {
      name: 'Mouse', vibe: 'soft-spoken, notices everything, braver than anyone',
      dialog: {
        idle: ["Oh! Um. Hello. I was just... here. I'm often here.", "I fixed the squeaky door. Nobody asked. I hope that's okay.",
          "The new recruit seemed lonely so I. Um. Left them a biscuit.", "You work very late. I see the candle. Please sleep."],
        hungry: ["I didn't want to bother the cook, so I just. Didn't eat. Sorry.", "Is there... maybe... soup? Only if there's extra."],
        tired: ["I'm fine! I just walked into the doorframe. Twice.", "I'll sleep after everyone else has bunks. There might not be enough."],
        sad: ["It's silly. It's nothing. It's... maybe something.", "Sometimes I think the hall wouldn't notice me gone. ...Thank you for noticing me now."],
        injured: ["Please don't fuss. Others got hurt worse. Historically. Somewhere.", "The healer was very kind. I apologized the whole time."],
        afterWin: ["We won and nobody died and I only screamed twice!", "I helped! A little! The little helped!"],
        afterLoss: ["I'm sorry. I froze. I'll... I'll do better.", "Everyone came back. That's the part I'm holding onto."],
        grief: ["I know everyone's favorite mug. Theirs is still on the shelf. I can't move it.", "They told me I was brave once. I'm trying to be it for them now."],
        huntBack: ["I went hunting! Alone! On purpose! My heart has mostly restarted!", "The monster was big and I was quiet and now it's... not a problem. Anymore."],
        promoted: ["M-me? There must be a mistake. ...There's no mistake? Oh no. Oh WOW."],
        gift: ["For... me? You're sure? You checked the name twice? ...I'm going to cry on it. Happy crying! The good kind!",
          "Nobody's ever... um. I'll take extremely good care of it. Forever. Thank you. THANK you."],
      },
      hearts: [
        ["Um. Can I sit? I practiced this conversation four times.", "Everyone thinks I joined by accident. I didn't. I read your guild charter on the notice board. The part about no one left behind.", "I've been left behind before. I memorized the sentence. That's all. That's the story. ...Thank you for the seat."],
        ["I made a list of everyone's small sadnesses. It helps me help.", "Yours is the ledger, by the way. You frown at the fourth column. Every time.", "So I. Um. Reorganized the fourth column. Please don't be mad. Your frown budget is too high."],
        ["I want to say it without stammering, so here goes.", "You saw someone small and handed them a banner like it was obvious. Nobody's ever done that.", "I'm not scared when I'm behind your banner. So I'm going to carry it. In front. Where the scary is. ...Okay NOW my heart can panic."],
      ],
    },
  };
  const KEYS = Object.keys(ARCHETYPES);

  /* Response choices — an empathy check, not a branch. Three styles:
   * sincere (speak from the heart), tease (play/banter), calm (measured).
   * Reading the archetype right pays; misreading them stings a little. */
  const RESPONSE_LABELS = {
    sincere: 'Speak from the heart', tease: 'Tease them', calm: 'Keep it easy',
  };

  /* ...but "Keep it easy" is a MOOD, not a sentence, and three fixed moods
   * every single day is not a conversation (player report: "give conversation
   * options, not just keep it easy"). The tone stays the scoring mechanic —
   * what changes is that each option now shows the LINE you would actually
   * say, chosen from what is true about this person right now. Same empathy
   * check; an actual exchange on top of it. */
  const TALK_OPTIONS = {
    injured: {
      sincere: 'That wound frightens me. Sit down.',
      tease: 'You were supposed to dodge, you know.',
      calm: 'Let it close. The board keeps.',
    },
    hungry: {
      sincere: "You haven't eaten. Let me put that right.",
      tease: "You'd gnaw the table leg, wouldn't you?",
      calm: "Kitchen's warm. Go and be fed.",
    },
    tired: {
      sincere: "You've given enough today. I mean it.",
      tease: "You're swaying. Very heroic.",
      calm: 'Bed. Nothing burns down overnight.',
    },
    sad: {
      sincere: "Talk to me. What's sitting on you?",
      tease: "That face would curdle Maribel's stew.",
      calm: "I'll sit here a while. No need to talk.",
    },
    deed: {
      sincere: 'What you did out there mattered.',
      tease: "Don't let it go to your head. Too late.",
      calm: 'Good work. Same again tomorrow.',
    },
    stranger: {
      sincere: "I'm glad you signed with us.",
      tease: "Still can't tell if you're trouble.",
      calm: 'Settling in? Take your time.',
    },
    close: {
      sincere: "There's nobody I'd rather have at my back.",
      tease: "You're still the worst. Affectionately.",
      calm: 'Quiet day. Those are worth something.',
    },
    idle: {
      sincere: 'How are you, really?',
      tease: "Slacking already? It's barely noon.",
      calm: 'Nothing pressing. Just looking in.',
    },
  };
  function optionContext(a) {
    if (a.status === 'injured') return 'injured';
    if (a.fed < 30) return 'hungry';
    if (a.rested < 30) return 'tired';
    if (a.happy < 35) return 'sad';
    const g = GH.sim && GH.sim.get && GH.sim.get();
    const last = a.deeds && a.deeds[a.deeds.length - 1];
    if (last && g && g.day - last.day <= 1) return 'deed';
    if (a.sworn || (a.affinity || 0) >= 70) return 'close';
    if ((a.affinity || 0) < 15) return 'stranger';
    return 'idle';
  }
  function optionsFor(a) {
    const bank = TALK_OPTIONS[optionContext(a)] || TALK_OPTIONS.idle;
    return ['sincere', 'tease', 'calm'].map((sty) => ({
      style: sty, label: bank[sty], tone: RESPONSE_LABELS[sty],
    }));
  }

  /* --- Topics: things to ASK, not just a tone to strike. -------------------
   * The bios already hold a past, a reason, a type and a secret gated behind
   * affinity — but the only way to see them was to scroll a card. Asking is
   * the natural verb, so each gate is now a question you can put to their
   * face, plus two that read the live game state (their work, the hall).
   * One answer each per day; the first two each day are worth a point. */
  const TOPIC_LEADS = {
    tsun: 'They look away first. "...Fine. Since you asked."',
    needy: 'They light up at being asked. "You want to know? Really?"',
    genki: 'They swing a chair round backwards and sit. "Ooh, story time!"',
    kuu: 'A pause, precisely one beat long. "Query accepted."',
    brash: 'They spread their hands like a bard taking the stage. "At LAST, someone asks."',
    timid: 'They study their boots a moment. "Oh — um. If you want."',
  };
  const TOPICS = [
    { key: 'work', label: 'Ask about the work', need: 0 },
    { key: 'past', label: 'Ask where they came from', need: 15, field: 'past',
      locked: 'They change the subject, smoothly. (Reach Guildmate — 15)' },
    { key: 'hall', label: 'Ask about the others', need: 15,
      locked: 'They are not going to gossip with someone they barely know. (15)' },
    { key: 'why', label: 'Ask why they stayed', need: 40, field: 'why',
      locked: 'You get the official answer, which is not the answer. (Reach Friend — 40)' },
    { key: 'type', label: 'Ask what turns their head', need: 40, field: 'desire',
      locked: 'They go pink and find something urgent to do. (Reach Friend — 40)' },
    { key: 'secret', label: 'Ask what they never say', need: 70, field: 'secret',
      locked: "That door isn't open yet. (Reach Confidant — 70)" },
  ];
  function topicsFor(a) {
    const aff = a.affinity || 0;
    const asked = a._topicsToday || [];
    return TOPICS.map((t) => ({
      key: t.key, label: t.label, need: t.need,
      open: aff >= t.need, done: asked.indexOf(t.key) >= 0,
    }));
  }
  function workAnswer(a) {
    const best = Object.keys(a.skills || {}).filter((s) => a.skills[s] !== 'U')
      .sort((x, y) => D.PROF_ORDER.indexOf(a.skills[y]) - D.PROF_ORDER.indexOf(a.skills[x]))[0];
    const skill = best ? D.SKILL_LABEL[best].toLowerCase() : 'staying out of the way';
    const routine = (GH.routines && GH.routines.LABELS && GH.routines.LABELS[a.routine]) || 'whatever the day asks';
    const bank = {
      tsun: `"${a.class}. Obviously. I'm best at ${skill} and I don't need you telling me so." (Currently on ${routine}.)`,
      needy: `"I'm good at ${skill}! You knew that, right? You DID know that." (They're on ${routine} — because you set it.)`,
      genki: `"${skill.toUpperCase()}! That's my thing! Point me at something and watch!" (Happily running ${routine}.)`,
      kuu: `"Specialisation: ${skill}. Efficiency is highest there. Assign accordingly." (Logged under ${routine}.)`,
      brash: `"${skill}, and the bards have NOTES. Glowing ones." (Presently on ${routine}, which he calls 'training for greatness'.)`,
      timid: `"I'm... alright at ${skill}? People say so. I don't know." (Quietly keeping to ${routine}.)`,
    };
    return bank[a.archetype] || bank.genki;
  }
  function hallAnswer(a) {
    // relationships() needs the ROSTER to resolve bond ids into people. It was
    // called with one argument, so `roster.find` threw the moment the person
    // had any bond at all — i.e. from their first shared expedition onward.
    // With no bonds the forEach never ran, which is the only reason this
    // survived testing.
    const g = GH.sim && GH.sim.get && GH.sim.get();
    const rel = (GH.social && GH.social.relationships && g)
      ? GH.social.relationships(a, g.roster) : null;
    const nm = (x) => x.name.split(' ')[0];
    if (rel && rel.partner) return `"${nm(rel.partner)}? …We've bled on the same ground. That's not nothing."`;
    if (rel && rel.friends && rel.friends.length) return `"${nm(rel.friends[0])}'s solid. I'd take that one anywhere."`;
    if (rel && rel.rivals && rel.rivals.length) return `"Don't put me on a road with ${nm(rel.rivals[0])} again. I'm asking nicely. Once."`;
    return '"Ask me again when I\'ve shared a road with somebody. Right now they\'re all just faces."';
  }
  function askTopic(a, key) {
    const t = TOPICS.find((x) => x.key === key);
    if (!t) return { ok: false };
    const aff = a.affinity || 0;
    if (aff < t.need) return { ok: true, line: t.locked, gained: 0, locked: true, tier: tierOf(aff) };
    a._topicsToday = a._topicsToday || [];
    if (a._topicsToday.indexOf(key) >= 0) {
      return { ok: false, msg: `${a.name.split(' ')[0]} has already answered that today.` };
    }
    // The first two questions a day are worth a point of warmth; after that
    // they'll still answer, but you're interviewing, not talking.
    const gained = a._topicsToday.length < 2 ? 1 : 0;
    a._topicsToday.push(key);
    if (gained) a.affinity = Math.min(100, aff + gained);
    const body = t.field ? GH.bios.bio(a)[t.field]
      : key === 'work' ? workAnswer(a) : hallAnswer(a);
    const lead = t.field ? (TOPIC_LEADS[a.archetype] || TOPIC_LEADS.genki) + ' ' : '';
    return { ok: true, line: lead + body, gained, tier: tierOf(a.affinity) };
  }
  const RESPONSE_PREFS = {
    tsun:  { best: 'tease',   neutral: 'calm',    worst: 'sincere' },
    needy: { best: 'sincere', neutral: 'tease',   worst: 'calm' },
    genki: { best: 'tease',   neutral: 'sincere', worst: 'calm' },
    kuu:   { best: 'calm',    neutral: 'sincere', worst: 'tease' },
    brash: { best: 'sincere', neutral: 'tease',   worst: 'calm' },
    timid: { best: 'sincere', neutral: 'calm',    worst: 'tease' },
  };
  const REACTIONS = {
    tsun: {
      best: ["...Pfft. Fine, that was almost funny. ALMOST.", "Don't get cocky just because you made me smirk."],
      neutral: ["Hm. Acceptable answer, I suppose.", "At least you didn't make it weird."],
      worst: ["Ugh — don't get all SINCERE on me. Gross. We're done here.", "Who told you to have feelings at me?!"],
    },
    needy: {
      best: ["You mean it?? Say it again. Slower. I'm memorizing it.", "THIS is why you're my favorite person in the entire hall."],
      neutral: ["Heehee — okay, okay. But you DO like me best, right?", "Rude! ...Do it again."],
      worst: ["Oh. Okay. 'Easy.' Sure. I'll just... be over here. Alone. Easily.", "You sounded just like everyone who ever left."],
    },
    genki: {
      best: ["HA! Okay you're officially fun today. New rule: you're on my team forever.", "See?! THIS is the energy! The hall NEEDS this energy!"],
      neutral: ["Aww, that's sweet! Little quiet for my taste, but sweet!", "Solid! Six out of ten! Room to grow!"],
      worst: ["...That was the most boring sentence I've heard all WEEK. Impressive, honestly.", "Even the hall cat looked away. The CAT."],
    },
    kuu: {
      best: ["...A measured response. Correct. I have noted it favorably.", "Efficient. No wasted sentiment. We understand each other."],
      neutral: ["Sentiment acknowledged. Filed.", "That was... adequate."],
      worst: ["Why are you being loud at me. Stop it.", "I am deducting points. From you. Personally."],
    },
    brash: {
      best: ["EXACTLY! Finally someone SAYS it! Chapter thirteen: 'The Boss Understood Me!'", "Correct answer! The legend grows and YOU'RE in the acknowledgments!"],
      neutral: ["Ha! Cheeky. I allow it — the legend enjoys a jester.", "You mock, but the statue fund grows daily."],
      worst: ["'Keep it easy'?! Legends do not KEEP IT EASY.", "Boring! The bards would cut that line in the first draft."],
    },
    timid: {
      best: ["Oh. That's... um. Nobody says things like that to me. Thank you. Really.", "I'm going to think about that all day. In a good way! The good way."],
      neutral: ["Okay. Um. Yes. Quiet is good, I like quiet.", "That's... fair. Thank you for not making it loud."],
      worst: ["Oh no. Am I— are you laughing AT me or... I can never tell. I'll just... sorry.", "Um. Ha. Ha? ...I need to go check on the biscuits."],
    },
  };

  // Resolve a response choice. Returns { reaction, gained, outcome, tier, heart }.
  /* What do they want to hear? At Stranger you are guessing; the more they
   * trust you the more the hall can tell you. Turns "I don't know what to
   * say" into a readable, earnable signal. */
  function readOf(a) {
    const prefs = RESPONSE_PREFS[a.archetype] || RESPONSE_PREFS.genki;
    const aff = a.affinity || 0;
    if (aff < 15) return { level: 'unknown', text: "You don't know them well enough to read yet." };
    if (aff < 40) return { level: 'hint', text: `They bristle at ${RESPONSE_LABELS[prefs.worst].toLowerCase()}.`, avoid: prefs.worst };
    return { level: 'known', text: `They warm to ${RESPONSE_LABELS[prefs.best].toLowerCase()}.`, best: prefs.best, avoid: prefs.worst };
  }

  function respond(a, style) {
    a.affinity = a.affinity || 0;
    if (a._respondedToday) return { reaction: null, gained: 0, outcome: 'spent', tier: tierOf(a.affinity), heart: null };
    a._respondedToday = true;
    const prefs = RESPONSE_PREFS[a.archetype] || RESPONSE_PREFS.genki;
    const bank = REACTIONS[a.archetype] || REACTIONS.genki;
    let outcome = 'neutral', gained = 3;
    if (style === prefs.best) { outcome = 'best'; gained = 6; }
    else if (style === prefs.worst) { outcome = 'worst'; gained = -2; }
    a.affinity = Math.max(0, Math.min(100, a.affinity + gained));
    if (outcome === 'best') a.happy = Math.min(100, (a.happy || 0) + 3);
    let heart = null;
    a.heartsSeen = a.heartsSeen || 0;
    if (gained > 0 && a.heartsSeen < HEARTS.length && a.affinity >= HEARTS[a.heartsSeen]) {
      const arch = of(a);
      heart = { index: a.heartsSeen, lines: arch.hearts[a.heartsSeen].map((l) => fmt(l, a)) };
      a.heartsSeen += 1;
      a.loyalty = Math.min(100, a.loyalty + 10);
      if (a.heartsSeen === HEARTS.length) { a.sworn = true; }
    }
    a._lastRespond = { style, outcome, day: (GH.sim && GH.sim.get() && GH.sim.get().day) || 0 };
    return { reaction: fmt(R.pick(bank[outcome]), a), gained, outcome, tier: tierOf(a.affinity), heart };
  }

  /* --- Flirting: a second channel of affection, unlocked at Friend(40). ---
   * Lines escalate by tier — friend / confidant / kindred(sworn+) — and stay
   * on the tasteful side of steamy. Below Friend you get an archetype rebuff
   * (and a little affinity anyway, because trying counts). */
  const FLIRTS = {
    tsun: {
      friend: ["W-what's with that look?! Say what you want or keep walking. ...You can walk slower, though.",
        "Flattery gets you nowhere. ...Where exactly were you trying to get? Asking for tactical reasons.",
        "You're insufferable. Sit down, I'll pour you the good stuff before someone worse drinks it."],
      confidant: ["Quit smiling at me like that in front of PEOPLE. ...Do it again when they're gone.",
        "I sharpened your letter opener. It's not a love token. It's PRACTICAL. The engraving was on sale.",
        "If you must stand that close, at least be useful. ...No. Closer. I said useful."],
      kindred: ["Everyone's asleep. So if my head ends up on your shoulder, it's because it's WARM, understand?",
        "I fight better when you watch. There. That's the most embarrassing true thing I own. It's yours now.",
        "Come here. If I only get one soft thing in this life, I'm not wasting it on being proud tonight."],
    },
    needy: {
      friend: ["Is that a compliment?? Write it down. Date it. Sign it. I'm framing it.",
        "You flirt with everyone... no? Just me? JUST ME. Okay. Okay!! Acting normal starts now.",
        "Careful, Guildmaster. I imprint like a duckling. A very committed duckling."],
      confidant: ["Sit with me and tell me I'm your favorite. I already know. I just like the words.",
        "I saved you the seat next to mine. I will always have saved you the seat next to mine.",
        "Say my name again? Not for anything. Just... inventory purposes. Mine."],
      kindred: ["Tonight I get you all to myself and the whole hall knows better than to knock. I checked. Twice.",
        "I used to beg the world for scraps of wanted. Then you. You're the whole feast, you know that?",
        "Closer. The fire's warm but you're warmer and I have DATA on this."],
    },
    genki: {
      friend: ["Are you FLIRTING?! With ME?! Best day! Previous best day, dethroned!",
        "My heart just did the double-jump. That's not training. That's YOU.",
        "Race you to the kitchen! Loser feeds the winner dessert! There is no losing this one!"],
      confidant: ["Okay real talk: your laugh is my favorite sound in the entire hall. I've ranked them. All of them.",
        "Dance with me! No music? Guildmaster, I AM music. Hands here. There we go~",
        "I sparkle 10% harder when you're watching. Independent observers have confirmed."],
      kindred: ["Sunset, rooftop, two mugs, one blanket. That's the whole plan. The blanket is not negotiable.",
        "I smile all day for everyone. This one, right now? This one's only ever been yours.",
        "Catch! ...It's my heart, by the way. You caught it years ago, I'm just doing the paperwork."],
    },
    kuu: {
      friend: ["Your pulse elevated when you approached me. Interesting. ...Mine is none of your business.",
        "Compliment received. Filed under... recurring. You may continue the pattern.",
        "You are standing 11% closer than professional standards require. I have not stepped back. Note that."],
      confidant: ["I have begun to reserve my evenings. In case you ask. This is an operational note.",
        "The scarf you left — I kept it. It smells like the hall. Like you. This data was unsolicited.",
        "When you laugh, I lose my place in whatever I am reading. Twelve times now. I stopped counting at twelve."],
      kindred: ["The fire is adequate. The wine is adequate. You are... considerably above adequate. Sit.",
        "I calculated the odds of someone melting me. Rounded to zero. I have never been so pleased to be wrong.",
        "Stay. That is not a request from the roster. It is one from me."],
    },
    brash: {
      friend: ["Flirting with a legend? Bold! Correct choice, but bold!",
        "I've arm-wrestled ogres, but your smile just took me two out of three. Rematch. Right now.",
        "Careful — people who wink at me end up in ballads. Verse three gets STEAMY."],
      confidant: ["Everyone gets the legend. You get the person. Don't tell anyone he's the better deal.",
        "Front row of my next fight. I hit 20% harder when you're there — that's not bravado, that's physics.",
        "The bards asked who the love interest in my saga is. I said 'classified.' You. It's you."],
      kindred: ["Come up to the roof. The stars asked for an audience and I only do joint appearances now.",
        "I've shouted my name at the whole realm. Yours is the only one I want to say quiet.",
        "The legend kneels for nobody. ...The man, though? For you, watch him."],
    },
    timid: {
      friend: ["Oh!! Um!! That was— a compliment— I am now going to walk into this wall. Politely.",
        "I practiced saying something smooth. It was 'hi.' I have now used my whole arsenal. ...Hi.",
        "You have very— arms. Sword arms. GOOD arms. I'm going to go breathe into a bucket, but happy."],
      confidant: ["I made you a good-luck charm. It's the seventh one. The first six weren't brave enough. Neither was I.",
        "Sometimes you look at me and I forget to be scared of anything. Do it again? For practice?",
        "I told the hall cat about you. In confidence. The cat approves. This is HUGE."],
      kindred: ["Can I... sit against your shoulder? I've been brave all day and I'd like to be small for one hour.",
        "You called my name across the yard once and my whole heart just... came when called. It still does.",
        "I'm not scared right now. Do you understand what that means? YOU'RE what that means."],
    },
  };
  const REBUFFS = {
    tsun: "Ha?! Buy me a drink and win a war first. THEN we'll discuss your little smile.",
    needy: "W-wait, really?? No no, not yet — I want to be sure first. Ask me again when we're... us.",
    genki: "Hehe, smooth!! Redeem this coupon later — one (1) flirt, once we're proper friends!",
    kuu: "Premature. Affection requires clearance you have not yet earned. Continue your efforts.",
    brash: "Everyone flirts with the legend! Stick around, earn the backstage pass, THEN we talk.",
    timid: "Eep! I— you— maybe when I know you better I won't faint?? Progress requires friendship!",
  };

  /* The Promise: past the third heart, at full affinity, a final scene.
   * A ribbon, a rooftop, a vow — the closest this hall gets to a wedding. */
  const PROMISES = {
    tsun: ["Shut up and hold still. This ribbon — it's mine. Was mine.", "It goes on your wrist now, and if you EVER take it off I will end you and then cry about it.", "There. Promised. You're stuck with me until the last hall light goes out. ...Say it back, idiot."],
    needy: ["I bought two ribbons the week I joined. I never told you that.", "One's been on my wrist every day since. The other one's been waiting in my pocket. For you. The whole time.", "Wear it and I'll never ask the world for anything again. I promise. I PROMISE."],
    genki: ["Okay so this is the last big feeling I've got and it's ALL yours, ready?", "Every sunrise, every dumb joke, every victory dance — first one goes to you. Forever. That's the contract.", "Signed with a ribbon! No refunds! Kiss the paperwork, Guildmaster!"],
    kuu: ["Final assessment. Subject: us. Duration of study: every day since I arrived.", "Conclusion: where you are is home. The variable was never the hall.", "This ribbon is a binding contract with no exit clause. Sign with your hand. In mine."],
    brash: ["The bards wanted an epic ending. I told them the truth is better.", "The loudest man in the realm goes quiet exactly once — right now — for exactly one person.", "Ribbon's yours. Legend's yours. Man's yours. Try to look surprised for the painting."],
    timid: ["I rehearsed this seventy times and I'm going to shake anyway, so. Here.", "You made a small scared person feel like a banner in the wind. Nobody else gets to know what that took.", "This ribbon was my mother's. It only goes to the bravest thing I ever chose. That's you. That's us."],
  };

  function flirt(a) {
    a.affinity = a.affinity || 0;
    // Below Friend the lock is shown on the button itself; a tap still gets a
    // playful rebuff and a little warmth (once a day), but never spends the
    // real flirt — punishing an invisible gate was the old bad feel.
    if (a.affinity < 40) {
      let gained = 0;
      if (!a._rebuffedToday) { a._rebuffedToday = true; gained = 2; a.affinity = Math.min(100, a.affinity + 2); }
      return { ok: true, line: fmt(REBUFFS[a.archetype] || REBUFFS.genki, a), gained, rebuff: true, need: 40, tier: tierOf(a.affinity) };
    }
    if (a._flirtedToday) return { ok: false, msg: a.name.split(' ')[0] + ' is still blushing from earlier. Tomorrow.' };
    a._flirtedToday = true;
    const arch = of(a);
    const spice = (a.sworn || a.affinity >= 95) ? 'kindred' : a.affinity >= 70 ? 'confidant' : 'friend';
    const pool = (FLIRTS[a.archetype] || FLIRTS.genki)[spice];
    a.affinity = Math.min(100, a.affinity + 4);
    a.happy = Math.min(100, a.happy + 6);
    // The Promise: sworn + full hearts + full affinity, once ever.
    let promise = null;
    if (a.sworn && a.affinity >= 100 && !a.promised) {
      a.promised = true;
      a.loyalty = 100;
      promise = { lines: (PROMISES[a.archetype] || PROMISES.genki).map((l) => fmt(l, a)) };
      if (GH.bios) GH.bios.deed(a, 'Tied the ribbon — promised to the Guildmaster.');
    }
    return { ok: true, line: fmt(R.pick(pool), a), gained: 4, spice, tier: tierOf(a.affinity), promise };
  }

  function assign() { return R.pick(KEYS); }
  function of(a) { return ARCHETYPES[a.archetype] || ARCHETYPES.genki; }
  function tierOf(aff) { let t = TIERS[0]; TIERS.forEach((x) => { if (aff >= x.at) t = x; }); return t.name; }

  function fmt(line, a) {
    const g = GH.sim.get();
    return line.replace(/\{G\}/g, (g && g.guildName) || 'the guild').replace(/\{N\}/g, a.name.split(' ')[0]);
  }

  // Pick a context line for the adventurer's current state.
  function line(a, ctx) {
    const arch = of(a);
    const pool = arch.dialog[ctx] || arch.dialog.idle;
    return fmt(R.pick(pool), a);
  }
  function contextFor(a) {
    if (a.status === 'injured') return 'injured';
    if (a.fed < 30) return 'hungry';
    if (a.rested < 30) return 'tired';
    if (a.happy < 35) return 'sad';
    return 'idle';
  }

  /* Talk to an adventurer. Returns { line, affinity, tier, heart }.
   * heart = { index, lines[] } when a milestone conversation fires. */
  // The logbook talks back: recent deeds surface in conversation.
  const MEMORY_TEMPLATES = {
    tsun: 'About "{D}"... it was fine. I was fine. Stop looking proud.',
    needy: 'You saw it, right? "{D}"? Tell me you saw it.',
    genki: '"{D}"!! I\'m STILL buzzing about it!',
    kuu: 'Regarding "{D}": satisfactory outcome. ...I may have re-read the entry twice.',
    brash: '"{D}" — chapter material. The bards are being notified.',
    timid: 'Um. About "{D}"... I keep thinking about it. Did I... do okay?',
  };
  function memoryLine(a) {
    const g = GH.sim && GH.sim.get && GH.sim.get();
    if (!g || !a.deeds || !a.deeds.length) return null;
    const recent = a.deeds[a.deeds.length - 1];
    if (g.day - recent.day > 2) return null;
    const tpl = MEMORY_TEMPLATES[a.archetype] || MEMORY_TEMPLATES.genki;
    const short = recent.text.length > 60 ? recent.text.slice(0, 57) + '…' : recent.text;
    return tpl.replace('{D}', short);
  }

  function talk(a) {
    a.affinity = a.affinity || 0;
    a.heartsSeen = a.heartsSeen || 0;
    let gained = 0;
    // First talk of the day is the one that counts (Rune Factory rule):
    // +3 affinity, +4 happy, and a point of loyalty once they call you friend.
    if (!a._talkedToday) {
      gained = 3; a.affinity = Math.min(100, a.affinity + gained);
      a.happy = Math.min(100, a.happy + 4);
      if (a.affinity >= 40) a.loyalty = Math.min(100, (a.loyalty || 0) + 1);
      a._talkedToday = true;
    }

    // heart event?
    let heart = null;
    if (a.heartsSeen < HEARTS.length && a.affinity >= HEARTS[a.heartsSeen]) {
      const arch = of(a);
      heart = { index: a.heartsSeen, lines: arch.hearts[a.heartsSeen].map((l) => fmt(l, a)) };
      a.heartsSeen += 1;
      a.loyalty = Math.min(100, a.loyalty + 10);
      if (a.heartsSeen === HEARTS.length) { a.sworn = true; }   // final tier: +1 all rolls (pf hooks this)
    }
    const mem = R.chance(0.35) ? memoryLine(a) : null;
    const responses = a._respondedToday ? [] : optionsFor(a);
    return { line: mem || line(a, contextFor(a)), affinity: a.affinity, tier: tierOf(a.affinity), gained, heart, responses };
  }

  // Passive affinity from shared victories (called from sim settle).
  function sharedWin(a) { a.affinity = Math.min(100, (a.affinity || 0) + 2); }


  // Why is there a ❗ over this person's head?
  //
  // The hall worked this out to decide whether to draw the mark, then threw the
  // answer away — so you tapped someone flagged as wanting a word and got no
  // hint what about. One function now, read by BOTH the marker in the hall and
  // the banner on their sheet, so the mark and the reason can never disagree.
  //
  // Ordered by weight: a heart event outranks a bad day, which outranks news.
  function wantsAWord(a, g) {
    if (!a || a._talkedToday) return null;
    const seen = a.heartsSeen || 0;
    if (seen < HEARTS.length && (a.affinity || 0) >= HEARTS[seen]) {
      return { kind: 'heart', line: 'Has something they want to say to you.' };
    }
    if (a.status === 'injured') {
      return { kind: 'hurt', line: 'Hurt, and would rather you heard it from them.' };
    }
    if ((a.happy || 0) < 45) {
      return { kind: 'low', line: 'Spirits are low. A word would help.' };
    }
    const deeds = a.deeds || [];
    const last = deeds[deeds.length - 1];
    if (last && g && (g.day - last.day) <= 1) {
      return { kind: 'deed', line: 'Fresh from ' + (last.what || 'the job') + ' — wants to tell you about it.' };
    }
    return null;
  }

  return { ARCHETYPES, TIERS, HEARTS, wantsAWord, RESPONSE_LABELS, RESPONSE_PREFS, readOf, assign, of, tierOf, line, contextFor,
    talk, respond, sharedWin, flirt, optionsFor, topicsFor, askTopic,
    // Exported so migration/parity/export_data.mjs can ship them to the engine
    // ports as DATA. This is the largest block of prose in the game; hand-copying
    // it into two languages would drift on the first typo.
    TALK_OPTIONS, TOPIC_LEADS, TOPICS, REACTIONS, FLIRTS, REBUFFS, PROMISES,
    MEMORY_TEMPLATES };
})();
