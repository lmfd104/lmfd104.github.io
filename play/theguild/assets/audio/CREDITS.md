# Audio credits & licensing

## Sound effects (`sfx/`)
All SFX are from Kenney (kenney.nl) asset packs, **CC0 / public domain** —
free for commercial use, no attribution required (credited here anyway):

- *Interface Sounds* — tap, open, close, confirm, error, alarm
- *RPG Audio* — coins, coins2, book_open, flip, door_open, door_close,
  draw_blade, cloth, leather, steps
- *Impact Sounds* — bell, toll, build, hurt
- *Music Jingles* — jingle_win (HIT11), jingle_level (HIT10),
  jingle_lose (PIZZI07), jingle_heart (PIZZI02)

Converted OGG→MP3 (Safari/iOS lacks Vorbis), mono 44.1 kHz.

### Guild-specific effects (ElevenLabs)
The Kenney set covers UI, but not the moments that make this game its own —
a rift opening, a hero not coming home, a hammer on the smithy anvil. These
were generated with **ElevenLabs** sound generation on a paid *Creator* plan,
whose terms grant a commercial licence covering games and monetized apps, so
they are shippable:

- `breach_horn` — war-horn alarm (an outbreak tears open) · replaces `alarm`
- `death_knell` — single mournful bell toll (an adventurer falls for good)
- `boss_roar` — beast roar (a zone boss is slain)
- `tavern_door` — heavy door + iron latch (someone joins) · replaces `door_open`
- `party_depart` — armoured boots and gear, fading out (a party sets out)
- `anvil_forge` — hammer on anvil (gear forged at the smithy)
- `quill_sign` — quill on parchment (a recruit signs the charter)
- `coin_purse` — coins poured on wood (weekly upkeep paid)
- `heart_bond` — warm chime (a heart event; The Promise)
- `promote_shimmer` — rising sparkle (a promotion)
- `charter_unlock` — golden bloom (the Guild Charter opens the campaign)
- `build_raise` — beams settling + final hammer (unwired; no build log line
  exists yet — call `GH.audio.play('build_raise')` from a build handler)

Post-processed to match the Kenney set: silence trimmed, EBU-R128 normalised
to −18 LUFS, mono 44.1 kHz MP3. Regenerate with the prompt table in
`audio-tools/` (see the workspace `guild_sfx.py` batch pattern).

Wiring lives entirely in `js/audio.js` (`KIND_SFX` + `TEXT_SFX`), which
matches on the log line, so no other module needed edits.

## Music (`music/`)
Generated locally with **ACE-Step v1 3.5B** (Apache-2.0 model) via ComfyUI.
Generated outputs; safe for commercial use. Regenerate/replace any track
with `tools/ace_music.py` (edit the TRACKS list, run against the ComfyUI box).

- `title.mp3` — 72s cozy tavern-folk loop (title screen)
- `day.mp3` — 96s pastoral adventure loop (map/hall)
- `danger.mp3` — 64s tense loop (active outbreaks / endless wave 3+)
- `victory.mp3` — 14s fanfare (campaign win, one-shot)
- `hall.mp3` — 84s cozy hall loop (home view)
- `festival.mp3` — 76s festival jig (every 10th day)
- `grief.mp3` — 60s lament (while the hall mourns)
- `boss.mp3` — 70s battle loop (boss expedition underway)

Loops are seamless because `js/audio.js` plays them through WebAudio
`AudioBufferSourceNode.loop`, not `<audio>` (MP3 edge padding never plays).
