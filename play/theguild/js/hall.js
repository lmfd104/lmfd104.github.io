/* The guild hall — a Phaser scene: background image, clickable room hotspots,
 * and adventurer sprites you can click to inspect/talk.
 */
window.GH = window.GH || {};

GH.hall = (function () {
  const D = GH.data, S = GH.sim;
  // The hall art is 1280x1280. It used to be squashed into a 720 canvas and
  // then FIT into a ~414px phone viewport — roughly a third of native, which
  // is why nothing was legible. Now the world IS the art's native size and the
  // camera shows part of it; you pan and pinch instead of squinting.
  const SIZE = 1280;

  // The walkable graph, the standing spots and the room-open rule all live in
  // js/nav.js now. They are plain tables and arithmetic, so they ship to the
  // engine ports in guild_data.json and are pinned by a parity vector; while
  // they sat in this file the rebuilt engines would have had to re-derive a
  // waypoint graph by eye. Same objects, one copy.
  const NAV = GH.nav;
  const SEATS = NAV.SEATS, SPOTS = NAV.SPOTS, SOLIDS = NAV.PROP_SOLIDS;
  const NODES = NAV.NODES, EDGES = NAV.EDGES, NODE_ROOM = NAV.NODE_ROOM;
  const POOL_ROOM = NAV.POOL_ROOM;
  const roomOpen = NAV.roomOpen, nodeOpen = NAV.nodeOpen;
  const nearestNode = NAV.nearestNode, routeBetween = NAV.routeBetween;

  let game, scene, ready = false;

  // Phaser listens for pointer events on the DOCUMENT, not on the canvas, so an
  // HTML control painted above the hall does NOT stop the zone underneath from
  // firing (this is also why `pointer-events: none` on the canvas is no help).
  // Left unguarded the tutorial card was unusable: tapping either of its buttons
  // fired the room zone behind it, and `body.modal-open` then hid #tutorbar
  // before the button's own click could dispatch, so the tap was swallowed.
  // modalOpen() does not cover this — the tutor bar is not a modal. Ignore any
  // tap whose topmost element is UI rather than the canvas itself. Note this
  // deliberately does NOT block hall taps while the tutorial is up: the tutorial
  // advances on real taps, and those land on the canvas, not on the card.
  // NB: on a phone/tablet the event is a TouchEvent, which carries no clientX of
  // its own — the coordinates live on changedTouches[0]. Reading only clientX
  // silently disabled this guard on every touch device, which is the whole
  // platform. Fall through to "not UI" when coordinates can't be resolved, so a
  // surprise event shape can never make the hall untappable.
  function tapHitsUI(p) {
    const ev = p && p.event;
    if (!ev) return false;
    let cx = ev.clientX, cy = ev.clientY;
    if (typeof cx !== 'number') {
      const t = (ev.changedTouches && ev.changedTouches[0]) || (ev.touches && ev.touches[0]);
      if (!t) return false;
      cx = t.clientX; cy = t.clientY;
    }
    if (typeof cx !== 'number' || typeof cy !== 'number') return false;
    const el = document.elementFromPoint(cx, cy);
    return !!(el && el.tagName !== 'CANVAS');
  }

  // ---- What part of the building actually EXISTS yet. ---------------------
  // "Make the initial guild small; adding modules grows the guild in size and
  // prosperity" — so the hall is no longer a finished building you tour. You
  // start with a kitchen, a great hall, a board and a corner of bunks; the
  // rest is boarded-over plot. Two axes of growth:
  //   1. a whole room is UNBUILT (training yard, smithy) until you raise it;
  //   2. the dormitory GROWS ACROSS the lower floor as its level rises.
  // Everything unlit is drawn as hoarding, and the camera only ranges over
  // what stands — so the guild is physically smaller on day one.
  
  // A room is its rect, full stop.
  //
  // The dormitory used to be the exception: its rect was SCALED by level, so a
  // level-1 bunkroom was 34% of the floor and the remainder was covered over.
  // That cover is what "still just a block of brown over the current setup" was
  // describing — three releases changed what it was FILLED with (black, then
  // planks, then earth) without noticing that the cover itself was the bug. The
  // dormitory grows by gaining BEDS in its picture now (D.ROOM_ART), so there
  // is nothing left to cover.
  function roomRect(room) { return room.rect; }
  function roomById(id) { return D.ROOMS.find((r) => r.id === id); }
  // Which tier picture a room is wearing right now — null if it has no per-tier
  // art, or has not been raised.
  function roomArtKey(id) {
    const spec = D.ROOM_ART[id];
    if (!spec || !roomOpen(id)) return null;
    const lvl = Math.max(1, Math.min(spec.tiers, S.get() ? S.facLevel(id) : 1));
    return 'room-' + spec.art + '_' + lvl;
  }
  // Every rect that is NOT part of the guild yet.
  function plots() {
    const out = [];
    Object.entries(D.WING_PLOTS).forEach(([id, wing]) => {
      if (GH.sim.facLevel(id) <= 0) out.push({ id, rect: wing.rect, name: D.FACILITIES[id].name });
    });
    D.ROOMS.forEach((room) => {
      // `room: true` → the dressing covers only the room's INTERIOR. The rect
      // includes the walls, and dirt drawn over them cut a hole in the
      // building's envelope — the hull stays whole, the floor is what's dirt.
      if (!roomOpen(room.id)) out.push({ id: room.id, rect: room.rect, name: room.name, room: true });
    });
    return out;
  }
  // The walkable floor of a cell room, in world pixels. Walls are everything
  // else, and this is what keeps a sprite off the furniture.
  function roomFloor(id) {
    const room = roomById(id);
    if (!room || !D.ROOM_ART[id]) return null;
    const [rx, ry, rw, rh] = room.rect, [ix, iy, iw, ih] = D.ROOM_INNER;
    const sx = rw / 0.25, sy = rh / 0.31875;          // rect-local units -> this rect
    return { x: (rx + ix * sx) * SIZE, y: (ry + iy * sy) * SIZE,
      w: iw * sx * SIZE, h: ih * sy * SIZE };
  }
  // The pannable world is the whole SITE — every room plus every boarded plot.
  // (Clipping it to what's built made the plots unreachable: you could see
  // "＋ Raise the Smithy" at the edge but never pan onto it to tap it, which
  // hides the one thing the growth mechanic is about.)
  // The GUILD's extent — every room plus every boarded plot. This is what the
  // camera's zoom is fitted to, so it decides how the game opens.
  function siteBounds() {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    D.ROOMS.forEach(({ rect: [x, y, w, h] }) => {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
    });
    // The wings stand on the guild's LAND, which reaches past the edges of the
    // painting — their rects are the same normalized space and may be negative
    // or over 1. Including them here is what lets the camera reach them.
    Object.values(D.WING_PLOTS).forEach(({ rect: [x, y, w, h] }) => {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
    });
    const pad = 0.03;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    return { x: x0 * SIZE, y: y0 * SIZE, w: (x1 - x0) * SIZE, h: (y1 - y0) * SIZE,
      cx: (x0 + x1) / 2 * SIZE, cy: (y0 + y1) / 2 * SIZE };
  }
  // The guild PLUS the town it stands in. Only two things may use this: how far
  // you can pan, and how far the ground is tiled.
  //
  // ⚠️ It must never reach fitZoom(). Zoom is FLOORED at cover of whatever
  // rect it is given and the game opens exactly there, so feeding it the town
  // opens on the whole village with the guild a postage stamp in the middle —
  // the opposite of "the guild hall set in a town". That is why these are two
  // functions and not one.
  function worldBounds() {
    const b = siteBounds();
    let x0 = b.x / SIZE, y0 = b.y / SIZE;
    let x1 = (b.x + b.w) / SIZE, y1 = (b.y + b.h) / SIZE;
    D.TOWN.forEach(({ rect: [x, y, w, h] }) => {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
    });
    const pad = 0.05;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    return { x: x0 * SIZE, y: y0 * SIZE, w: (x1 - x0) * SIZE, h: (y1 - y0) * SIZE,
      cx: (x0 + x1) / 2 * SIZE, cy: (y0 + y1) / 2 * SIZE };
  }
  // …but you OPEN looking at the guild you actually have, not at the empty
  // plots. This is the centre of what stands.
  function homeCenter() {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0, any = false;
    D.ROOMS.forEach((room) => {
      if (!roomOpen(room.id)) return;
      const [x, y, w, h] = roomRect(room);
      any = true;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
    });
    if (!any) { const b = siteBounds(); return { cx: b.cx, cy: b.cy }; }
    return { cx: (x0 + x1) / 2 * SIZE, cy: (y0 + y1) / 2 * SIZE };
  }

  // seats by room (normalized over the hall image) — the hall is alive:
  // sprites stand where their needs or routines take them.
  // Standing room in the great hall — in the AISLES beside the tables, not on
  // them. Checked against SOLIDS rather than eyeballed.
  
  // Standing places INSIDE each room's four walls, beside the thing you came
  // for — a bed, the anvil, the pell. These moved with the rooms; the old yard
  // spots stood on the dining floor and the old forge spots stood in a painted
  // bathroom.
  

  // ---- Furniture you cannot walk through. --------------------------------
  // "People walk over tables, chairs, benches." They did: the lane graph keeps
  // a route out of the WALLS, but between two waypoints a sprite tweened dead
  // straight, and the great hall is mostly tables. These are the solid things
  // in it — the long tables, the bar, and the fire pillars — as normalized
  // rects over the painting, read off the art rather than guessed.
  //
  // Anything inside a composed room is already handled by that room's walls.
  
  // The fires the painting already shows, as light sources: x, y, radius(px).
  // The three iron fire-pillars down the great hall, the bar's candles, and the
  // corridor braziers.
  // The fires this painting draws, and how far each throws light. The table
  // moved to data.js so the Godot and Unity halls light the same hearths from
  // the shipped JSON instead of three hand-copies of seven numbers.
  const HEARTHS = D.HEARTHS;
  const SOLID_PAD = 16;             // clearance in world px, roughly a shoulder
  // A composed room's WALLS, derived from its cell rather than hand-listed:
  // everything outside D.ROOM_INNER is wall. The top wall is split either side
  // of the doorway so the one gap people are meant to use stays open — which is
  // what turns "walks through the wall" into "walks in through the door".
  function solidRects() {
    // The walls and base furniture, emitted by tools/gen_hall_build.py from
    // the floorplan itself (assets/hall/solids.json, loaded in preload).
    const built = (scene && scene.cache.json.get('hall-solids')) || [];
    return SOLIDS.concat(built)
      .map(([x, y, w, h]) => ({ x: x * SIZE, y: y * SIZE, w: w * SIZE, h: h * SIZE }));
  }
  let SOLID_PX = null;
  // Does the segment a→b cut through this rect? Grown by SOLID_PAD so a sprite
  // clears the edge instead of grazing it.
  function segHitsRect(x1, y1, x2, y2, r) {
    const x0 = r.x - SOLID_PAD, y0 = r.y - SOLID_PAD;
    const x3 = r.x + r.w + SOLID_PAD, y3 = r.y + r.h + SOLID_PAD;
    if (Math.max(x1, x2) < x0 || Math.min(x1, x2) > x3) return false;
    if (Math.max(y1, y2) < y0 || Math.min(y1, y2) > y3) return false;
    // Liang–Barsky: clip the segment to the box; any surviving span is a hit.
    const dx = x2 - x1, dy = y2 - y1;
    let t0 = 0, t1 = 1;
    const clip = (p, q) => {
      if (p === 0) return q >= 0;
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    };
    return clip(-dx, x1 - x0) && clip(dx, x3 - x1) && clip(-dy, y1 - y0) && clip(dy, y3 - y1);
  }
  // Walk round anything in the way.
  //
  // Aiming at the single nearest CORNER does not work, and the unit check below
  // caught it: the leg from where you stand to that corner can still clip the
  // same box, so the recursion picks the same corner again, burns its depth and
  // hands back a path that still crosses the table. Go round a SIDE instead —
  // two corners, so the middle leg runs along the box edge and is clear by
  // construction. Depth-capped; a sprite that cannot find a way round walks the
  // straight line rather than freezing, which is the right way to fail.
  function dodge(p0, p1, depth) {
    if (depth > 2 || !SOLID_PX) return [p1];
    const hit = SOLID_PX.find((r) => segHitsRect(p0[0], p0[1], p1[0], p1[1], r));
    if (!hit) return [p1];
    const P = SOLID_PAD + 6;
    const ax = hit.x - P, ay = hit.y - P;
    const bx = hit.x + hit.w + P, by = hit.y + hit.h + P;
    const sides = [
      [[ax, ay], [bx, ay]],       // over the top
      [[ax, by], [bx, by]],       // under the bottom
      [[ax, ay], [ax, by]],       // round the left
      [[bx, ay], [bx, by]],       // round the right
    ];
    let best = null, bd = Infinity;
    sides.forEach((s) => {
      [[s[0], s[1]], [s[1], s[0]]].forEach((o) => {
        const d = Math.hypot(o[0][0] - p0[0], o[0][1] - p0[1])
          + Math.hypot(o[1][0] - o[0][0], o[1][1] - o[0][1])
          + Math.hypot(p1[0] - o[1][0], p1[1] - o[1][1]);
        if (d < bd) { bd = d; best = o; }
      });
    });
    return dodge(p0, best[0], depth + 1)
      .concat(dodge(best[0], best[1], depth + 1))
      .concat(dodge(best[1], p1, depth + 1));
  }

  // Walkable waypoint graph (doorways + floor lanes) so nobody strolls
  // through a wall: route = nearest node → BFS → nearest node to target.
  
  
  // A lane through a room that hasn't been built is not a lane. Nodes inside
  // an unraised room (or past the end of the bunks) drop out of the graph, so
  // nobody strolls into a boarded-up plot.
  
  
  
  

  // Where is this adventurer, and why?
  //
  // A sprite's PLACE IS ITS ASSIGNMENT. This used to be a needs-and-routine
  // guess that sent people wandering between pools for no reason a player
  // could name ("they move in the same area too much, just bounce around";
  // "why are they going into the kitchen? that is staff only"). Now the hall
  // simply shows you the day plan you set: rest means a bunk, training means
  // the mats, a craft means the forge. The kitchen is Maribel's — adventurers
  // never work in it.
  
  function planActivity(value) {
    const RT = GH.routines;
    if (!RT) return null;
    const kind = RT.kindOf(value);
    if (kind === 'rest') return { pool: 'dorm', icon: '💤', why: 'resting' };
    if (kind === 'hall') return { pool: 'tavern', icon: '🍺', why: 'unwinding' };
    if (kind === 'train') {
      const branch = RT.argOf(value, 1);
      if (branch === 'physical') return { pool: 'yard', icon: '⚔', why: 'training' };
      return { pool: 'tavern', icon: '📖', why: 'studying' };   // mind & magic are book work
    }
    if (kind === 'craft') {
      return RT.argOf(value, 1) === 'smith'
        ? { pool: 'forge', icon: '🔨', why: 'forging' }
        : { pool: 'tavern', icon: '⚗', why: 'brewing' };
    }
    return null;   // 'auto' and anything unknown: they are waiting on the day
  }
  function activityFor(a, half) {
    const want = (function () {
      if (a.status === 'injured') return { pool: 'dorm', icon: '✚', why: 'healing' };
      // needs still override a plan — a starving guild is not a scheduling
      // problem, and eating happens at the tables, never in the kitchen.
      if (a.fed < 45) return { pool: 'tavern', icon: '🍲', why: 'eating' };
      // the Guildmaster stood a round today — everyone able gathers to drink
      const g = S.get && S.get();
      if (g && g.roundDay === g.day) return { pool: 'tavern', icon: '🍻', why: 'unwinding' };
      const RT = GH.routines;
      if (RT && RT.planOf) {
        const p = RT.planOf(a);
        if (RT.kindOf(p.am) === 'hunt') return { pool: 'tavern', icon: '🏹', why: 'unwinding' };
        const fromPlan = planActivity(p[half || 'am']);
        if (fromPlan) return fromPlan;
      }
      // No orders: they wait in the Great Hall rather than pacing the building.
      if (a.rested < 45) return { pool: 'dorm', icon: '💤', why: 'resting' };
      return { pool: 'tavern', icon: '✦', why: 'unwinding' };
    })();
    if (!roomOpen(POOL_ROOM[want.pool] || 'tavern')) return { pool: 'tavern', icon: '🍺', why: 'unwinding' };
    return want;
  }
  // Only the seats that stand inside the built footprint (the bunks reach
  // further across the lower floor with every dormitory upgrade).
  function seatsFor(pool) {
    const all = SPOTS[pool] || SPOTS.tavern;
    if (pool !== 'dorm') return all;
    const room = roomById('dormitory'); if (!room) return all;
    const [x, , w] = roomRect(room);
    const ok = all.filter((s) => s[0] <= x + w - 0.01);
    return ok.length ? ok : [all[0]];
  }
  function spotFor(a, i) {
    const pool = seatsFor(activityFor(a, 'am').pool);
    return pool[i % pool.length];
  }
  // Changing somebody's orders should move them; nothing else should.
  function planKeyOf(a) {
    const RT = GH.routines;
    if (!RT || !RT.planOf) return '';
    const p = RT.planOf(a);
    return p.am + '|' + p.pm;
  }

  function init(parentId) {
    const config = {
      type: Phaser.AUTO,
      width: SIZE, height: SIZE,
      parent: parentId,
      pixelArt: true,
      backgroundColor: '#101b12',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
      scene: { preload, create },
    };
    game = new Phaser.Game(config);
  }

  // ---- Props: the furniture an upgrade actually buys you. ------------------
  // A level used to be a number on a panel plus a slightly warmer tint. Now the
  // room gains things you can point at: a straw pell in the yard, hams in the
  // larder, an anvil and a lit hearth in the forge, a wolf's head over the hall
  // door for every boss you put down. Placement lives in layout.json so the
  // preview tool and the game read the SAME table — see tools/preview_hall_props.py.
  // Classes with their own mini. Anything not in here falls back to the
  // villager sheet, so a new class is a missing costume and not a crash.
  const MINI_SHEETS = ['fighter', 'rogue', 'wizard', 'cleric', 'ranger', 'bard'];
  function sheetFor(a) {
    const k = (a && a.class || '').toLowerCase();
    return MINI_SHEETS.indexOf(k) >= 0 ? 'player-' + k : 'player';
  }
  // Animations are per sheet, so an actor's animation key carries its costume.
  // --- townsfolk ----------------------------------------------------------
  // Scenery, not people. They are deliberately NOT in `actors`: they never
  // enter the guild, hold no roster entry, carry no name label or ❗ bubble, and
  // are not interactive — the room hotspots and the plot zones already compete
  // for taps and a third claimant out here would bring that bug back somewhere
  // new. All they do is make the street a street instead of a diorama.
  //
  // They walk on the villager sheet, tinted, which is exactly what guild STAFF
  // already do; the six class sheets stay meaning "an adventurer".
  const TOWNSFOLK_TINT = [0xd8c9a8, 0xb9c7d8, 0xd8b8b8, 0xc2d8b8, 0xd9cbb0,
    0xcabde0, 0xe0d3ae, 0xb8d8d2];
  const TOWNSFOLK_SPD = 46 * 1.78;      // the same pace the guild's own people walk
  // 2 walkers on a quiet street; +1 per raised village lot, capped by the
  // tint pool. Walkers are only ever ADDED — nobody vanishes mid-stroll.
  function townsfolkTarget() {
    const built = S.villageCount ? S.villageCount() : 0;
    return Math.min(TOWNSFOLK_TINT.length, 2 + built);
  }
  function topUpTownsfolk() {
    if (!scene || !scene.townsfolk || !scene.townsfolkSpawn) return;
    while (scene.townsfolk.length < townsfolkTarget()) scene.townsfolkSpawn();
  }
  function startTownsfolk() {
    if (!scene.textures.exists('player') || !(D.TOWN_WALK || []).length) return;
    const pts = D.TOWN_WALK.map(([x, y]) => ({ x: x * SIZE, y: y * SIZE }));
    const walk = (f) => {
      const from = pts[f.at], to = pts[(f.at + 1) % pts.length];
      const dx = to.x - from.x, dy = to.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      if (Math.abs(dx) >= Math.abs(dy)) { f.spr.play('walk-right', true); f.spr.setFlipX(dx < 0); }
      else { f.spr.play(dy > 0 ? 'walk-down' : 'walk-up', true); f.spr.setFlipX(false); }
      scene.tweens.add({
        targets: f.spr, x: to.x, y: to.y,
        duration: Math.max(160, (d / (TOWNSFOLK_SPD * f.gait)) * 1000),
        ease: 'Sine.inOut',
        onComplete: () => {
          f.at = (f.at + 1) % pts.length;
          // A pause at the corner, so five people on one loop do not read as a
          // conveyor belt. Idle plays through it.
          f.spr.play('idle-down', true);
          scene.time.delayedCall(600 + Math.random() * 2600, () => walk(f));
        },
      });
    };
    scene.townsfolk = [];
    scene.townsfolkSpawn = function () {
      const i = scene.townsfolk.length;
      const at = Math.floor((i * pts.length) / TOWNSFOLK_TINT.length) % pts.length;
      const f = {
        at,
        gait: 0.85 + Math.random() * 0.35,
        spr: scene.add.sprite(pts[at].x, pts[at].y, 'player', 0)
          .setScale(3.2).setTint(TOWNSFOLK_TINT[i % TOWNSFOLK_TINT.length]).setDepth(-1),
      };
      walk(f);
      scene.townsfolk.push(f);
    };
    for (let i = 0; i < townsfolkTarget(); i++) scene.townsfolkSpawn();
  }

  function anim(actor, base) {
    const k = actor && actor.sheet && actor.sheet !== 'player' ? base + '@' + actor.sheet : base;
    return scene.anims.exists(k) ? k : base;
  }

  const PROP_DIR = 'assets/hall/props/';
  const TOWN_DIR = 'assets/town/';
  const ROOM_DIR = 'assets/hall/rooms/';
  let propLayout = null;

  function preload() {
    scene = this;
    this.load.image('hall', 'assets/hall/hall.png');
    this.load.spritesheet('player', 'assets/chars/player.png', { frameWidth: 32, frameHeight: 32 });
    // One sheet per class. "Minis all look the same" was true: everybody was
    // the villager above, recoloured by a flat ancestry tint. Each class now
    // wears its own kit and, more to the point, its own SILHOUETTE — at 32px a
    // hue shift reads as lighting, and only an outline reads as another person.
    // Built by tools/gen_class_minis.py from that same sheet, so the style
    // cannot drift. Ancestry keeps its tint on top: ancestry is who they are,
    // class is what they wear.
    MINI_SHEETS.forEach((k) => {
      this.load.spritesheet('player-' + k, 'assets/chars/player_' + k + '.png',
        { frameWidth: 32, frameHeight: 32 });
    });
    // Queue the prop images the moment the layout lands: Phaser keeps draining
    // the queue while the load loop runs, so files added from a filecomplete
    // handler are still fetched before create().
    // The boarding is dressing for ground you have NOT bought, so it has no
    // layout entry to be discovered from — load it by name.
    this.load.image('prop-hoarding', PROP_DIR + 'hoarding.png');
    this.load.image('prop-scaffold', PROP_DIR + 'scaffold.png');
    this.load.image('prop-ground', PROP_DIR + 'ground.png');
    this.load.image('prop-exterior', PROP_DIR + 'exterior.png');
    // The town: ground tiles, road tiles, and one image per DISTINCT building
    // (the layout reuses cottage and smithy, and loading a key twice makes
    // Phaser warn and skip).
    this.load.image('town-grass', TOWN_DIR + 'grass_macro.png');   // the 384px meadow macro-tile
    ['road_h', 'road_v'].forEach((k) => {
      this.load.image('town-' + k, TOWN_DIR + k + '.png');
    });
    Array.from(new Set(D.TOWN.map((t) => t.art))).forEach((art) => {
      this.load.image('town-' + art, TOWN_DIR + art + '.png');
    });
    // Every tier of every composed room. Twelve small images, all needed the
    // moment a room is raised — loading them lazily would show the old picture
    // for a frame after the upgrade lands.
    Object.values(D.ROOM_ART).forEach((spec) => {
      for (let l = 1; l <= spec.tiers; l++) {
        this.load.image('room-' + spec.art + '_' + l, ROOM_DIR + spec.art + '_' + l + '.png');
      }
    });
    Object.values(D.WING_PLOTS).forEach((w) => {
      if (!this.textures.exists('prop-' + w.art)) this.load.image('prop-' + w.art, PROP_DIR + w.art + '.png');
    });
    this.load.json('propLayout', PROP_DIR + 'layout.json');
    // The walls-and-furniture collision, emitted by tools/gen_hall_build.py
    // from the same floorplan the hall is drawn from.
    this.load.json('hall-solids', 'assets/hall/solids.json');
    this.load.once('filecomplete-json-propLayout', (key, type, data) => {
      propLayout = data;
      propEntries(data).forEach((e) => {
        if (!this.textures.exists('prop-' + e.key)) this.load.image('prop-' + e.key, PROP_DIR + e.key + '.png');
      });
    });
  }

  function propEntries(layout) {
    const out = [];
    Object.entries(layout || {}).forEach(([room, list]) => {
      if (room.charAt(0) === '_' || !Array.isArray(list)) return;
      list.forEach((e) => out.push(Object.assign({ room }, e)));
    });
    return out;
  }

  // Has this prop been earned? Rooms gate on their own facility level; the
  // Great Hall's trophies gate on bosses put down, because nothing you can buy
  // should be able to hang a wolf's head on that wall.
  function propEarned(e) {
    const g = S.get(); if (!g) return false;
    if (e.bosses) return ((g.records && g.records.bosses) || []).length >= e.bosses;
    if (!roomOpen(e.room)) return false;
    if (S.facLevel(e.room) < (e.lvl || 1)) return false;
    // The bunks spread across the lower floor as the dormitory grows; a prop
    // standing on ground the guild has not reached yet is standing in a hoarding.
    if (e.room === 'dormitory') {
      const room = roomById('dormitory');
      if (room) { const [x, , w] = roomRect(room); return e.at[0] <= x + w - 0.005; }
    }
    return true;
  }

  function create() {
    // The guild stands on GROUND. A fifth of the hall painting was opaque black
    // — the void the building floats in — and the player's read of the vc11
    // building-site pass was "still the original with black over it". They were
    // right: that pass only dressed the two unbuilt ROOM rects, and the void is
    // not a room. tools/gen_hall_props.py keys the exterior black out of
    // hall.png, and this is what shows through it.
    if (this.textures.exists('prop-exterior')) {
      const b = worldBounds();       // the town stands on ground too
      scene.groundTile = this.add.tileSprite(b.x, b.y, b.w, b.h, 'prop-exterior')
        .setOrigin(0, 0).setDepth(-3);
    }
    // The village: grass under it, the street across it, then the buildings.
    // All of it is scenery — depth below the guild and below every actor, and
    // not one pixel of it is interactive.
    if (this.textures.exists('town-grass')) {
      const b = worldBounds();
      scene.townGrass = this.add.tileSprite(b.x, b.y, b.w, b.h, 'town-grass')
        .setOrigin(0, 0).setDepth(-2.5);
    }
    D.TOWN_ROADS.forEach(({ dir, rect: [x, y, w, h] }) => {
      const key = 'town-road_' + dir;
      if (!this.textures.exists(key)) return;
      this.add.tileSprite(x * SIZE, y * SIZE, w * SIZE, h * SIZE, key)
        .setOrigin(0, 0).setDepth(-2.4);
    });
    // 1:1, never scaled to the rect. These are pixel art and the rects are
    // derived from the PNGs' own sizes; letting Phaser fit them would resample
    // 32px-grid art onto a fractional grid and turn it to mush — the same
    // mistake that cost a pass on the class minis.
    //
    // Street furniture (the stall, the well, every tree) is always there.
    // Buildings with a `lot` are drawn by buildVillage() from save state —
    // vacant ground until raised — so they live in updateDressing's cycle.
    D.TOWN.forEach(({ art, lot, flip, rect: [x, y] }) => {
      if (lot || !this.textures.exists('town-' + art)) return;
      this.add.image(x * SIZE, y * SIZE, 'town-' + art).setOrigin(0, 0).setDepth(-2)
        .setFlipX(!!flip);   // mirrored repeats stop reading as stamps
    });
    scene.villageArt = [];
    startTownsfolk();
    const bg = this.add.image(0, 0, 'hall').setOrigin(0, 0);
    bg.setDisplaySize(SIZE, SIZE);
    // NO global warm tint. An amber film over the whole building plus glow
    // layers on top read as "washed out" — low contrast, everything the same
    // yellow. Atmosphere comes from CONTRAST: a slightly cooler, darker ambient
    // with bright pools at the fires, not a filter over the lot.
    bg.setTint(0xdfe6ea);

    // hover highlight graphics
    this.roomGfx = this.add.graphics();
    this.tooltip = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '20px', color: '#f2c668',
      backgroundColor: '#1a140d', padding: { x: 6, y: 3 },
    }).setDepth(50).setVisible(false);

    // room hotspots
    D.ROOMS.forEach((room) => {
      const [x, y, w, h] = room.rect;
      const zx = x * SIZE, zy = y * SIZE, zw = w * SIZE, zh = h * SIZE;
      const zone = this.add.zone(zx, zy, zw, zh).setOrigin(0, 0).setDepth(1).setInteractive({ useHandCursor: true });
      // Hover is a MOUSE affordance. On touch, `pointerover` fires on press
      // and the highlight sticks — which is exactly the gold box over every
      // building the player asked us to get rid of. Desktop only.
      zone.on('pointerover', (p) => {
        if (p && p.wasTouch) return;
        this.roomGfx.clear();
        this.roomGfx.lineStyle(3, 0xf2c668, 0.9).strokeRect(zx, zy, zw, zh);
        this.roomGfx.fillStyle(0xf2c668, 0.10).fillRect(zx, zy, zw, zh);
        this.tooltip.setText(room.name).setPosition(zx + 4, zy - 22).setVisible(true);
      });
      zone.on('pointerout', () => { this.roomGfx.clear(); this.tooltip.setVisible(false); });
      // Phaser hotspots still receive pointerdown while an HTML sheet covers the
      // canvas, which would swap the open panel out from under the player.
      zone.on('pointerup', (p) => { if (scene.dragMoved && scene.dragMoved()) return; if (tapHitsUI(p)) return; if (GH.ui && !GH.ui.modalOpen()) GH.ui.openRoom(room.id); });
    });

    // ---- the hall as a GROWING building. No outlines (they read as debug
    // boxes) — instead each room wears a small sign that gains stars as you
    // upgrade it, and the wings are shuttered plots until you raise them.
    // Everything here is registered in scene.hudText so it can be scaled
    // against the camera: world-space text at 0.37 zoom is unreadable.
    scene.hudText = [];
    // `keep` = permanent label, registered for camera counter-scaling. Plot
    // signs are rebuilt on every dressing pass, so they must NOT join that
    // list — syncHud would keep scaling destroyed objects. They are scaled
    // from scene.plotSigns instead.
    const sign = (wx, wy, txt, color, size, keep) => {
      const t = this.add.text(wx, wy, txt, {
        fontFamily: 'monospace', fontSize: (size || 20) + 'px', color: color || '#e8d9ae',
        backgroundColor: '#120d07cc', padding: { x: 6, y: 3 }, align: 'center',
      }).setOrigin(0.5, 0.5).setDepth(6);
      if (keep !== false) scene.hudText.push(t);
      return t;
    };

    scene.roomSigns = {};
    D.ROOMS.forEach((room) => {
      if (room.id === 'board') return;                  // the board has its own art
      const [x, y, w, h] = room.rect;
      scene.roomSigns[room.id] = sign((x + w / 2) * SIZE, (y + 0.012) * SIZE + 14, room.name, '#e8d9ae', 20);
    });

    // Hoardings over ground the guild has not claimed yet, and the warm light
    // a room gains as it is upgraded. Both live under the sprites (depth 4/5)
    // and above the painted floor.
    scene.warmGfx = this.add.graphics().setDepth(4);
    scene.plotGfx = this.add.graphics().setDepth(5);
    scene.plotSigns = [];
    // Props sit UNDER the warm glow (depth 4) so an upgraded room's firelight
    // washes over its own furniture, and under the hoarding (5) so a plot that
    // has not been raised covers whatever will one day stand there.
    scene.propSprites = [];
    scene.plotArt = [];
    scene.wingArt = [];
    scene.roomArt = [];
    // Above the planking (5), below the "＋ Raise the …" sign (6). Plain
    // horizontal courses read as decking at hall zoom; the diagonal is what
    // makes a wall of planks say "nailed shut".
    scene.braceGfx = this.add.graphics().setDepth(5.5);
    // (a boarded plot needs no zone of its own — the room hotspot is already
    // there, and openRoom shows the build prompt when the room is unraised)

    // Repaint every sign, hoarding and lamp from the live facility levels —
    // this is what makes building and upgrading visibly change the hall.
    scene.updateDressing = function () {
      const g = S.get(); if (!g) return;
      Object.entries(scene.roomSigns).forEach(([id, t]) => {
        const fac = D.FACILITIES[id];
        const open = roomOpen(id);
        const lvl = fac ? GH.sim.facLevel(id) : 0;
        const stars = fac && open ? '\n' + '★'.repeat(Math.min(5, lvl)) + '☆'.repeat(Math.max(0, Math.min(5, fac.max) - lvl)) : '';
        const room = roomById(id); if (!room) return;
        t.setText(room.name + stars);
        t.setColor(!open ? '#8a7a5c' : lvl >= 3 ? '#f2c668' : '#e8d9ae');
        // A sign belongs over the part of the room that actually stands — but
        // a composed room now has a DOOR in the middle of that wall, and a
        // centred sign hangs straight over it. Shift those to the left quarter.
        const [rx, ry, rw] = roomRect(room);
        const sx = D.ROOM_ART[id] ? rx + rw * 0.25 : rx + rw / 2;
        t.setPosition(sx * SIZE, (ry + 0.012) * SIZE + 14);
        t.setVisible(open);          // an unraised plot wears its own ＋ sign
      });

      // --- the south range: every room wears its own tier picture ----------
      // This is the whole point of the revamp. The room is not a rect over the
      // painting any more; it is an image, and raising it swaps the image for
      // one with more in it. Drawn above the painting (which still holds the
      // bedrooms these cells replace) and below the warm glow and the sprites.
      scene.roomArt.forEach((o) => o.destroy());
      scene.roomArt = [];
      D.ROOMS.forEach((room) => {
        const key = roomArtKey(room.id);
        if (!key || !scene.textures.exists(key)) return;
        const [rx, ry, rw, rh] = room.rect;
        const img = scene.add.image(rx * SIZE, ry * SIZE, key).setOrigin(0, 0).setDepth(1.5);
        img.setDisplaySize(rw * SIZE, rh * SIZE);
        scene.roomArt.push(img);
      });

      // --- the village lots: vacant ground, or the building the guild paid
      // for. Redrawn whole on every dressing pass so a raise appears at once.
      (scene.villageArt || []).forEach((o) => o.destroy());
      scene.villageArt = [];
      scene.villageSigns = [];
      D.TOWN.forEach((t) => {
        if (!t.lot) return;
        const [x, y, w, h] = t.rect;
        const px = x * SIZE, py = y * SIZE, pw = w * SIZE, ph = h * SIZE;
        if (S.villageBuilt(t.lot.id)) {
          if (scene.textures.exists('town-' + t.art)) {
            scene.villageArt.push(scene.add.image(px, py, 'town-' + t.art)
              .setOrigin(0, 0).setDepth(-2));
          }
          return;
        }
        // A vacant lot: cleared earth on the grass, and a price on a post.
        // Same visual language as the guild's own boarded plots.
        if (scene.textures.exists('prop-ground')) {
          scene.villageArt.push(scene.add.tileSprite(px + pw * 0.1, py + ph * 0.35, pw * 0.8, ph * 0.6, 'prop-ground')
            .setOrigin(0, 0).setDepth(-2.2).setAlpha(0.9));
        }
        const t2 = sign(px + pw / 2, py + ph * 0.62, `＋ ${t.lot.name}
${t.lot.cost}g`, '#e3b869', 20, false);
        t2.setDepth(6).setScale(scene.hudK ? scene.hudK() : 1);
        scene.villageArt.push(t2);
        // NOT plotSigns: that array is destroyed+rebuilt later in this same
        // pass (the building-sites section), which would erase these signs.
        scene.villageSigns.push(t2);
        const z = scene.add.zone(px, py + ph * 0.3, pw, ph * 0.7)
          .setOrigin(0, 0).setDepth(2).setInteractive({ useHandCursor: true });
        z.on('pointerup', (p) => {
          if (scene.dragMoved && scene.dragMoved()) return;
          if (tapHitsUI(p)) return;
          if (GH.ui && !GH.ui.modalOpen() && GH.ui.openVillageLot) GH.ui.openVillageLot(t.lot.id);
        });
        scene.villageArt.push(z);
      });
      // The street busies up as the village grows: two walkers on a quiet
      // street, one more per raised building.
      topUpTownsfolk();

      // A drillmaster standing in a boarded-up yard reads as a bug. Staff
      // posted to an unraised room simply aren't here yet.
      (scene.staffNodes || []).forEach((s) => {
        const here = roomOpen(s.post);
        s.node.setVisible(here); s.tag.setVisible(here);
        if (here) s.node.setInteractive(); else s.node.disableInteractive();
      });

      // --- the furniture a level actually buys ---
      scene.propSprites.forEach((s) => s.destroy());
      scene.propSprites = [];
      propEntries(propLayout).forEach((e) => {
        if (!propEarned(e) || !scene.textures.exists('prop-' + e.key)) return;
        const img = scene.add.image(e.at[0] * SIZE, e.at[1] * SIZE, 'prop-' + e.key)
          .setOrigin(0.5, 1).setDepth(3).setScale(e.scale || 1);
        scene.propSprites.push(img);
      });

      // --- building sites: ground the guild has not built on yet ---
      //
      // Three treatments, in order of how well they told the truth:
      //   1. a 90%-opaque black rectangle. It hid the plot instead of
      //      describing it — "not just blacked out, it is a cheap way".
      //   2. plank hoarding nailed over the room. Better, but it says "this
      //      room is shut", and the room is not shut, it does not EXIST.
      //   3. what is here now: bare earth with the stone footings of the room
      //      to come, fenced off, with a scaffold at each end.
      //
      // That third reading is what Pass 4b was actually for. The plan asked for
      // swapped base paintings — a small lodge growing into a full hall — which
      // needs art nobody can author in this style and would force every ROOMS
      // rect, waypoint NODE and SPOT to be re-derived per image. Covering the
      // unbuilt wings in open ground gets the same thing said: on day one the
      // guild really is a kitchen, a hall, a board and a corner of bunks, with
      // foundations staked out around it, and raising a wing lays a floor where
      // there was dirt.
      scene.plotGfx.clear();
      scene.braceGfx.clear();
      scene.plotSigns.forEach((s) => s.destroy());
      scene.plotSigns = [];
      scene.plotArt.forEach((s) => s.destroy());
      scene.plotArt = [];
      const hasGround = scene.textures.exists('prop-ground');
      const hasFence = scene.textures.exists('prop-hoarding');
      plots().forEach((p) => {
        const [x, y, w, h] = p.rect;
        let px = x * SIZE, py = y * SIZE, pw = w * SIZE, ph = h * SIZE;
        if (p.room) {
          // an unbuilt ROOM keeps its walls — only the floor is bare ground
          const f = roomFloor(p.id);
          if (f) { px = f.x; py = f.y; pw = f.w; ph = f.h; }
        }
        if (hasGround) {
          // Opaque: this is not a veil over the room, it IS the ground.
          scene.plotArt.push(scene.add.tileSprite(px, py, pw, ph, 'prop-ground')
            .setOrigin(0, 0).setDepth(5));
        } else {
          scene.plotGfx.fillStyle(0x3a2c1e, 1).fillRect(px, py, pw, ph);
        }
        // Footings: the room's own outline, staked out in stone. This is what
        // makes it read as "a wing that is coming" instead of "a gap".
        const foot = 14;
        scene.braceGfx.fillStyle(0x4d4d41, 1);
        scene.braceGfx.fillRect(px, py, pw, foot).fillRect(px, py + ph - foot, pw, foot);
        scene.braceGfx.fillRect(px, py, foot, ph).fillRect(px + pw - foot, py, foot, ph);
        scene.braceGfx.lineStyle(2, 0x2a2a22, 0.9).strokeRect(px + 1, py + 1, pw - 2, ph - 2);
        scene.braceGfx.lineStyle(2, 0x626253, 0.8)
          .strokeRect(px + foot, py + foot, pw - foot * 2, ph - foot * 2);
        if (!p.mute) {
          // A site fence along the open edge, not boarding over the whole room.
          if (hasFence) {
            scene.plotArt.push(scene.add.tileSprite(px + foot, py + ph - foot - 26, pw - foot * 2, 26, 'prop-hoarding')
              .setOrigin(0, 0).setDepth(5.4));
          }
          if (scene.textures.exists('prop-scaffold')) {
            // one at each end, so a wide plot does not look like a single tile
            [px + Math.min(64, pw * 0.16), px + pw - Math.min(64, pw * 0.16)].forEach((sx) => {
              scene.plotArt.push(scene.add.image(sx, py + ph - 8, 'prop-scaffold')
                .setOrigin(0.5, 1).setDepth(5.5).setScale(1.4));
            });
          }
          const fac = D.FACILITIES[p.id];
          const cost = fac ? GH.sim.upgradeCost(p.id) : 0;
          const t = sign(px + pw / 2, py + ph / 2, `＋ Raise the ${p.name}\n${cost}g`, '#e3b869', 20, false);
          t.setDepth(6).setScale(scene.hudK ? scene.hudK() : 1);
          scene.plotSigns.push(t);
        }
      });

      // --- the wings: buildings on the guild's own land ---
      // Unbuilt, they fall through to the building-site treatment below (staked
      // ground, footings, a price). Built, a real structure rises on the plot
      // and gains a door you can walk up to and open.
      scene.wingArt.forEach((o) => o.destroy());
      scene.wingArt = [];
      Object.entries(D.WING_PLOTS).forEach(([id, wing]) => {
        const built = GH.sim.facLevel(id) > 0;
        const [x, y, w, h] = wing.rect;
        if (!built) {
          // An unraised wing still needs a door, or the "+ Raise the Library
          // 120g" sign is a label you cannot act on — openWing sends an
          // unbuilt one to the Build tab.
          const zu = scene.add.zone(x * SIZE, y * SIZE, w * SIZE, h * SIZE)
            .setOrigin(0, 0).setDepth(14).setInteractive({ useHandCursor: true });
          zu.on('pointerup', (p) => {
            if (scene.dragMoved && scene.dragMoved()) return;
            if (tapHitsUI(p)) return;
            if (GH.ui && !GH.ui.modalOpen() && GH.ui.openWing) GH.ui.openWing(id);
          });
          scene.wingArt.push(zu);
          return;
        }
        const px = x * SIZE, py = y * SIZE, pw = w * SIZE, ph = h * SIZE;
        const key = 'prop-' + wing.art;
        if (scene.textures.exists(key)) {
          const img = scene.add.image(px + pw / 2, py + ph / 2, key).setDepth(2);
          img.setDisplaySize(pw, ph);
          if (wing.tint && wing.tint !== 0xffffff) img.setTint(wing.tint);
          scene.wingArt.push(img);
        }
        const fac = D.FACILITIES[id];
        const lvl = GH.sim.facLevel(id);
        const stars = '★'.repeat(Math.min(5, lvl)) + '☆'.repeat(Math.max(0, Math.min(5, fac.max) - lvl));
        const t = sign(px + pw / 2, py - 6, fac.name + '\n' + stars,
          lvl >= 3 ? '#f2c668' : '#e8d9ae', 20, false);
        t.setDepth(6).setScale(scene.hudK ? scene.hudK() : 1);
        scene.plotSigns.push(t);
        // the door: tapping the building opens the wing, same as a room
        const z = scene.add.zone(px, py, pw, ph).setOrigin(0, 0).setDepth(14)
          .setInteractive({ useHandCursor: true });
        z.on('pointerup', (p) => {
          if (scene.dragMoved && scene.dragMoved()) return;
          if (tapHitsUI(p)) return;
          if (GH.ui && !GH.ui.modalOpen() && GH.ui.openWing) GH.ui.openWing(id);
        });
        scene.wingArt.push(z);
      });

      // --- prosperity: a raised room glows warmer the higher it goes, so an
      // upgrade changes the look of the inside and not just a number ---
      scene.warmGfx.clear();

      // Static hearthlight. Warmth was the ask, and the composed rooms bake
      // their own lamplight — so the painted half of the guild needed the same
      // treatment or the two halves would not sit together. These are fires the
      // painting already draws; all this adds is the pool of light they should
      // be casting. Concentric discs, brightest in the middle.
      HEARTHS.forEach(([hx, hy, r]) => {
        for (let i = 8; i >= 1; i--) {
          scene.warmGfx.fillStyle(0xffa851, 0.05).fillCircle(hx * SIZE, hy * SIZE, r * (i / 8));
        }
      });

      D.ROOMS.forEach((room) => {
        const fac = D.FACILITIES[room.id];
        if (!fac || !roomOpen(room.id)) return;
        // A composed room carries its own light at every tier. Washing a
        // translucent rectangle over it would put a coloured block back on top
        // of a room — the exact thing this release took away.
        if (D.ROOM_ART[room.id]) return;
        const lvl = GH.sim.facLevel(room.id);
        if (lvl <= 1) return;
        const [x, y, w, h] = roomRect(room);
        const a = Math.min(0.20, (lvl - 1) * 0.055);
        scene.warmGfx.fillStyle(0xffb85a, a).fillRect(x * SIZE, y * SIZE, w * SIZE, h * SIZE);
        // hearth-lamps along the wall, one per level above the first
        scene.warmGfx.fillStyle(0xffe6a8, 0.85);
        for (let i = 1; i < lvl; i++) {
          const lx = (x + w * (i / lvl)) * SIZE, ly = (y + 0.018) * SIZE;
          scene.warmGfx.fillCircle(lx, ly, 7);
          scene.warmGfx.fillStyle(0xffb85a, 0.22).fillCircle(lx, ly, 22);
          scene.warmGfx.fillStyle(0xffe6a8, 0.85);
        }
      });

      // the world is only as large as the guild — rebuild the camera bounds
      if (scene.applyBounds) scene.applyBounds();
      if (scene.reclampZoom) scene.reclampZoom();
      if (scene.syncHud) scene.syncHud();
      // (wing status lives in the HUD hall bar — see ui.wingsChip)
    };

    // ---- persistent staff: the people who run the building. Baked figures
    // get tap zones; the smith and drillmaster are spawned sprites.
    // The smith and the drillmaster work in rooms that may not exist yet —
    // they arrive with the building. Tracked so updateDressing can hide them.
    scene.staffNodes = [];
    (GH.staff ? GH.staff.STAFF : []).forEach((s) => {
      let cx, cy, node = null;
      if (s.zone) {
        const [zx, zy, zw, zh] = s.zone;
        cx = (zx + zw / 2) * SIZE; cy = (zy + zh / 2) * SIZE;
        // Precedence is PERSON > STAFF > ROOM, and it has now been wrong in
        // both directions. Originally staff sat at the room's own depth and the
        // room won, so no staffer could be tapped at all. The fix for that put
        // staff at 25 — ABOVE the adventurers at 20 — and Old Tessa's zone
        // covers two of the four dormitory bunks, so anyone resting there became
        // untappable, including someone standing under a ❗ asking to be talked
        // to. 15 clears every room hotspot (depth 1) and stays under the people.
        const z = this.add.zone(zx * SIZE, zy * SIZE, zw * SIZE, zh * SIZE)
          .setOrigin(0, 0).setDepth(15).setInteractive({ useHandCursor: true });
        z.on('pointerup', (p) => { if (scene.dragMoved && scene.dragMoved()) return; if (tapHitsUI(p)) return; if (GH.ui && !GH.ui.modalOpen() && GH.ui.openStaff) GH.ui.openStaff(s.key); });
      } else if (s.spawn) {
        cx = s.spawn[0] * SIZE; cy = s.spawn[1] * SIZE;
        const spr = this.add.sprite(0, 0, 'player', 0).setScale(3.2).setTint(s.spawn[2]);
        spr.play('idle-down');
        const cont = this.add.container(cx, cy, [spr]).setSize(110, 150).setDepth(19)
          .setInteractive(new Phaser.Geom.Rectangle(-55, -75, 110, 150), Phaser.Geom.Rectangle.Contains, { useHandCursor: true });
        cont.on('pointerup', (p) => { if (scene.dragMoved && scene.dragMoved()) return; if (tapHitsUI(p)) return; if (GH.ui && !GH.ui.modalOpen() && GH.ui.openStaff) GH.ui.openStaff(s.key); });
        node = cont;
      }
      // a quiet name tag so staff read as PEOPLE, not furniture
      const tag = this.add.text(cx, cy + 34, s.name.split(' ')[0], {
        fontFamily: 'monospace', fontSize: '20px', color: '#c9b98a',
        backgroundColor: '#241c12b8', padding: { x: 4, y: 2 },
      }).setOrigin(0.5, 0).setDepth(19);
      scene.hudText.push(tag);
      if (node) scene.staffNodes.push({ post: s.post, node, tag });
    });

    // ---- camera: the hall is bigger than the screen, so you move over it ----
    const cam = this.cameras.main;
    cam.setBackgroundColor('#101b12');
    // The camera ranges over the GUILD, not the whole painting: on day one
    // the training yard and the smithy are boarded plots and the bunks reach
    // only a corner of the lower floor, so the world you can pan around is
    // genuinely smaller — and grows the moment you raise something.
    scene.applyBounds = function () {
      const b = worldBounds();      // pan over the town too — but never OPEN there
      cam.setBounds(b.x, b.y, b.w, b.h);
    };
    scene.applyBounds();

    // Zoom range. The floor is COVER, not FIT: the hall art is square and the
    // phone viewport is tall, so fitting the whole building left ~90px of dead
    // black above and below it inside the canvas ("a lot of black space below
    // the map"), and zooming out of a letterboxed image reads as doing
    // nothing. Cover fills the view at every zoom and you pan instead.
    const fitZoom = () => { const b = siteBounds(); return Math.max(cam.width / b.w, cam.height / b.h); };
    const clampZoom = (z) => Math.max(fitZoom(), Math.min(2, z));
    // Open a little closer than "fit" so detail is readable straight away —
    // but only a little. 1.9x-fit plus a "show at most 55% of the hall" floor
    // opened on a wall of giant sprites with no sense of the room (player
    // feedback: "too zoomed in"). Pinch/wheel still goes closer on demand.
    // Open AT cover — the widest view that still fills the screen.
    const startZoom = () => clampZoom(fitZoom());

    scene.hallCam = cam;
    scene.focusRoom = function (roomId, instant) {
      const room = roomById(roomId);
      if (!room) return;
      const [x, y, w, h] = roomRect(room);
      const cx = (x + w / 2) * SIZE, cy = (y + h / 2) * SIZE;
      const z = clampZoom(Math.min(1.2, cam.height / (h * SIZE * 2.2)));
      cam.setZoom(z);
      cam.centerOn(cx, cy);
      syncHud();
    };
    scene.resetView = function () { const h = homeCenter(); cam.setZoom(startZoom()); cam.centerOn(h.cx, h.cy); syncHud(); };
    // A gesture is not a control. Pinch is fiddly on a canvas embedded in a
    // scrolling page, and the "⤢ Whole hall" button lived in a horizontally
    // scrolling row where it sat off the right edge of a phone — so zooming
    // out was, in practice, impossible. These back the on-screen buttons.
    scene.zoomBy = function (f) { cam.setZoom(clampZoom(cam.zoom * f)); syncHud(); };
    // The guild just grew or shrank: the old zoom may now be outside the range
    // the new footprint allows. (Defined after clampZoom on purpose — const
    // declarations are not hoisted, so an earlier caller would hit the TDZ.)
    scene.reclampZoom = function () { const z = clampZoom(cam.zoom); if (z > 0 && isFinite(z)) cam.setZoom(z); };
    scene.zoomInfo = function () {
      const z = cam.zoom, f = fitZoom();
      return { zoom: z, min: f, max: 2, atMin: z <= f * 1.02, atMax: z >= 1.98 };
    };

    // World-space text shrinks with the camera — at the default "whole hall"
    // zoom a 20px name renders ~7px and is unreadable (player report: "can't
    // see people's names"). Counter-scale every label so it holds a constant
    // on-screen size no matter how far out you are.
    scene.hudK = () => Phaser.Math.Clamp(0.62 / cam.zoom, 1, 3.2);
    function syncHud() {
      const k = scene.hudK();
      (scene.hudText || []).forEach((t) => t.setScale(k));
      (scene.plotSigns || []).forEach((t) => t.setScale(k));
      (scene.villageSigns || []).forEach((t) => t.setScale(k));
      Object.values(actors).forEach((a) => {
        if (a.label) a.label.setScale(k);
        if (a.bubble && !a.pulse) a.bubble.setScale(k);
      });
    }
    scene.syncHud = syncHud;
    scene.resetView();
    // The hall bar is painted by the DOM before Phaser finishes booting, so the
    // zoom readout has nothing to report at first render. Tell it once we do.
    if (GH.ui && GH.ui.syncZoom) GH.ui.syncZoom();

    // drag to pan — only when the press did not start on a sprite/room
    let dragging = false, lastX = 0, lastY = 0, moved = 0;
    this.input.on('pointerdown', (p) => { dragging = true; moved = 0; lastX = p.x; lastY = p.y; });
    this.input.on('pointermove', (p) => {
      if (!dragging || !p.isDown || this.input.pointer2.isDown) return;
      const dx = (p.x - lastX) / cam.zoom, dy = (p.y - lastY) / cam.zoom;
      moved += Math.abs(dx) + Math.abs(dy);
      cam.scrollX -= dx; cam.scrollY -= dy;
      lastX = p.x; lastY = p.y;
    });
    this.input.on('pointerup', () => { dragging = false; });
    // a drag past a few pixels must not also count as a tap on what is under it
    scene.dragMoved = () => moved > 8;

    // pinch to zoom.
    // Phaser allocates ONE touch pointer by default, so `input.pointer2` was
    // never a live pointer and pinch could not fire on any touch device —
    // meaning that once a room focus zoomed you in, there was no gesture to
    // get back out (player report: "can't zoom out once zoomed in").
    this.input.addPointer(1);
    let pinchStart = 0, zoomStart = 1;
    this.input.on('pointermove', () => {
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (!p2 || !(p1.isDown && p2.isDown)) { pinchStart = 0; return; }
      const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      if (!pinchStart) { pinchStart = dist; zoomStart = cam.zoom; return; }
      cam.setZoom(clampZoom(zoomStart * (dist / pinchStart))); syncHud();
    });
    // wheel zoom for desktop
    this.input.on('wheel', (p, o, dx, dy) => { cam.setZoom(clampZoom(cam.zoom * (dy > 0 ? 0.9 : 1.1))); syncHud(); });
    this.scale.on('resize', () => {
      if (!cam.width || !cam.height) return;
      scene.applyBounds();
      const z = clampZoom(cam.zoom);
      if (z > 0 && isFinite(z)) cam.setZoom(z); else scene.resetView();
      syncHud();
    });

    // real animation rows from the Cute Fantasy sheet (6 frames per row).
    // Every class sheet shares that layout, so the same rows build them all —
    // suffixed '@<sheet>' and resolved by anim().
    const mkOn = (tex, suffix) => {
      const mk = (key, row, n, rate, repeat) => {
        const k = key + suffix;
        if (!this.anims.exists(k)) this.anims.create({
          key: k, frames: this.anims.generateFrameNumbers(tex, { start: row * 6, end: row * 6 + (n - 1) }),
          frameRate: rate, repeat: repeat != null ? repeat : -1,
        });
      };
      // rows come from D.CHAR_ANIMS so the engine ports build the same set off
      // the same table instead of re-counting rows off the PNG
      Object.entries(D.CHAR_ANIMS).forEach(([key, a]) => mk(key, a.row, a.frames, a.fps));
    };
    mkOn('player', '');
    MINI_SHEETS.forEach((k) => {
      if (this.textures.exists('player-' + k)) mkOn('player-' + k, '@player-' + k);
    });

    // NB: adventurers are deliberately NOT parented into a layer container.
    // They used to live in `advLayer`, a Container at depth 20 — but a
    // Container's children are not in the SCENE's display list, and Phaser sorts
    // input candidates by that list. So every hero lost the hit test to the room
    // Zone underneath them (depth 1), and tapping anybody standing in the Great
    // Hall opened the Great Hall panel instead of the person. Each actor now
    // sits at scene level and carries its own depth, which is what the depth
    // ordering assumed all along.
    scene.ACTOR_DEPTH = 20;
    ready = true;
    refresh();
  }

  // Persistent sprites keyed by adventurer id — they WALK between rooms
  // instead of teleporting, and wander a little on their own.
  const actors = {};   // id -> { cont, spr, bubble, targetX, targetY }

  function stopAnims(actor) {
    if (actor.walkTween) { actor.walkTween.stop(); actor.walkTween = null; }
    if (actor.actTween) { actor.actTween.stop(); actor.actTween = null; }
    actor.cont.angle = 0; actor.spr.y = 0; actor.spr.x = 0;
  }

  // Room actions on arrival, using the sheet's real animation rows.
  function playAction(actor, why) {
    if (!scene || !actor.cont.active) return;
    if (actor.actTween) actor.actTween.stop();
    actor.spr.setFlipX(false);
    if (why === 'eating') {
      actor.spr.anims.stop(); actor.spr.setFrame(54);      // seated at the table
      actor.actTween = scene.tweens.add({ targets: actor.spr, y: 2, duration: 300, yoyo: true, repeat: -1, repeatDelay: 500, ease: 'Sine.inOut' });
    } else if (why === 'resting' || why === 'healing') {
      actor.spr.anims.stop(); actor.spr.setFrame(56);      // lying in the bunk
      actor.actTween = scene.tweens.add({ targets: actor.spr, alpha: 0.78, duration: 1500, yoyo: true, repeat: -1 });
    } else if (why === 'training' || why === 'forging') {
      actor.spr.play(anim(actor, 'swing'));                 // drills / hammer work
      actor.spr.anims.get && (actor.spr.anims.currentAnim.repeatDelay = why === 'forging' ? 500 : 700);
    } else if (why === 'studying' || why === 'brewing') {
      actor.spr.anims.stop(); actor.spr.setFrame(54);      // bent over a table
      actor.actTween = scene.tweens.add({ targets: actor.spr, y: 1.5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else {
      actor.spr.play(anim(actor, 'idle-down'));             // breathing idle
      if (Math.random() < 0.4) { actor.spr.play(anim(actor, 'idle-right')); actor.spr.setFlipX(Math.random() < 0.5); }
    }
  }

  function walkTo(actor, px, py, speed, why) {
    const sx = actor.cont.x, sy = actor.cont.y;
    const dist0 = Math.hypot(px - sx, py - sy);
    if (dist0 < 6) { playAction(actor, why); return; }
    stopAnims(actor);
    const route = routeBetween(sx, sy, px, py).concat([[px, py]]);
    // drop leading waypoints that are behind us already
    while (route.length > 1 && Math.hypot(route[0][0] - sx, route[0][1] - sy) < 24) route.shift();
    // Then bend every leg around the furniture. The lane graph gets you to the
    // right part of the room; this is what stops you crossing a table to do it.
    if (!SOLID_PX) SOLID_PX = solidRects();
    const pts = [];
    let from = [sx, sy];
    route.forEach((p) => { dodge(from, p, 0).forEach((q) => pts.push(q)); from = p; });
    const spd = (speed || 46) * 1.78 * (actor.gait || 1);
    let i = 0;
    const step = () => {
      if (i >= pts.length || !actor.cont.active) {
        actor.spr.anims.stop();
        // settle bounce on arrival
        scene.tweens.add({ targets: actor.spr, scaleY: 2.88, duration: 90, yoyo: true,
          onComplete: () => actor.spr.setScale(3.2) });
        playAction(actor, why);
        return;
      }
      const [tx, ty] = pts[i++];
      const dx = tx - actor.cont.x, dy = ty - actor.cont.y;
      const d = Math.hypot(dx, dy);
      // face the segment and play the matching walk cycle
      if (Math.abs(dx) >= Math.abs(dy)) { actor.spr.play(anim(actor, 'walk-right'), true); actor.spr.setFlipX(dx < 0); }
      else { actor.spr.play(anim(actor, dy > 0 ? 'walk-down' : 'walk-up'), true); actor.spr.setFlipX(false); }
      // a light waypoint wobble keeps paths from feeling laser-straight
      const midJitter = d > 106 ? (Math.random() * 18 - 9) : 0;
      actor.walkTween = scene.tweens.add({
        targets: actor.cont, x: tx + midJitter, y: ty,
        duration: Math.max(140, (d / spd) * 1000), ease: 'Sine.inOut',
        onComplete: step,
      });
    };
    step();
  }

  // ---- Daily life: a SCHEDULE, not jitter. Each actor holds a current
  // activity and a dwell timer; when it runs out they pick the next thing
  // (needs first, then routine, then variety) and walk there through the
  // lane graph — sit and eat, then cross to the yard and drill, then a drink.
  // (Small random shuffles read as "bouncing around" and are gone.)
  // Player feedback ("Till wanders randomly too much — should sit and eat,
  // then move to a new room or buy something, purposeful agenda"): dwells are
  // MINUTES-feeling now, not seconds. Sitting down means staying down.
  const DWELL = { eating: [34000, 55000], resting: [45000, 75000], healing: [50000, 80000],
                  training: [40000, 65000], studying: [42000, 68000], forging: [42000, 68000],
                  brewing: [38000, 60000], unwinding: [35000, 60000] };

  // The loop walks each actor through their MORNING and then their AFTERNOON,
  // over and over — "sit to eat, then walk over and train". No random pool
  // shuffling: if they end up somewhere, it is because you sent them there.
  function nextPlan(a, actor) {
    actor.half = actor.half === 'am' ? 'pm' : 'am';
    return activityFor(a, actor.half);
  }

  function dwellFor(why) {
    const d = DWELL[why] || DWELL.unwinding;
    return Date.now() + d[0] + Math.random() * (d[1] - d[0]);
  }
  // The bar sits against the great hall's west side; a finished meal earns a
  // stroll over for a drink before the day's next station. That little errand
  // is what makes the room read as people WITH plans, not particles.
  const BAR_STOP = [0.40, 0.40];
  function sendTo(actor, plan) {
    // Same pool as before? Then they are already where the plan wants them —
    // staying put IS the purposeful behaviour. A tiny re-dwell, no pacing.
    if (actor.pool === plan.pool && !actor.errand) {
      actor.why = plan.why;
      actor.dwellUntil = dwellFor(plan.why);
      return;
    }
    // Finished eating in the great hall -> buy a drink at the bar first.
    if (actor.pool === 'tavern' && actor.why === 'eating' && !actor.errand && Math.random() < 0.6) {
      actor.errand = plan;                       // remember where they were headed
      walkTo(actor, BAR_STOP[0] * SIZE + (Math.random() * 18 - 9),
             BAR_STOP[1] * SIZE + (Math.random() * 10 - 5), 44, 'buying');
      if (actor.bubble) { actor.bubble.setText('🍺'); scene.time.delayedCall(9000, () => { if (actor.bubble && actor.bubble.text === '🍺') actor.bubble.setText(''); }); }
      actor.dwellUntil = Date.now() + 8000 + Math.random() * 5000;
      return;
    }
    const next = actor.errand || plan;
    actor.errand = null;
    const pool = seatsFor(next.pool);
    const seat = pool[Math.floor(Math.random() * pool.length)];
    actor.pool = next.pool; actor.why = next.why;
    walkTo(actor, seat[0] * SIZE + (Math.random() * 26 - 13),
           seat[1] * SIZE + (Math.random() * 15 - 7), 44, next.why);
    actor.dwellUntil = dwellFor(next.why);
  }

  let lifeTimer = null;
  function startLife() {
    if (lifeTimer) return;
    lifeTimer = setInterval(() => {
      // Gate on "is the hall on screen", NOT document.hidden — WebViews and
      // embedded panes misreport that flag (the audio unlock hit the same
      // trap), and a false positive freezes every sprite in place.
      if (!ready || !scene || !document.body.classList.contains('hall-open')) return;
      maybeMeet();
      const g = S.get(); if (!g) return;
      const now = Date.now();
      Object.keys(actors).forEach((id) => {
        const actor = actors[id];
        if (actor.meeting || now < (actor.dwellUntil || 0)) return;
        const a = g.roster.find((x) => x.id === id);
        if (!a) return;
        sendTo(actor, nextPlan(a, actor));
      });
    }, 1400);
  }

  // ---- Meetups: two idle adventurers find each other at a table. Bonds
  // grow; when a pair without banners bonds deeply enough, a team forms on
  // the spot — the ⭐ moment (sim.hallMeet owns the rules + persistence).
  let meetCooldown = 0;
  function maybeMeet() {
    if (meetCooldown > 0) { meetCooldown -= 1; return; }
    const g = S.get(); if (!g || !GH.sim.hallMeet) return;
    if (Math.random() > 0.22) return;
    // Only people who are actually AT LEISURE find each other over a drink.
    // Someone you assigned to the forge does not wander off to socialise.
    const idle = Object.keys(actors).filter((id) => {
      const a = g.roster.find((x) => x.id === id);
      if (!a || a.status !== 'idle' || actors[id].meeting) return false;
      if (actors[id].pool !== 'tavern') return false;
      const why = actors[id].why;
      return why === 'unwinding' || why === 'eating';
    });
    if (idle.length < 2) return;
    const i = Math.floor(Math.random() * idle.length);
    let j = Math.floor(Math.random() * (idle.length - 1)); if (j >= i) j += 1;
    const A = actors[idle[i]], B = actors[idle[j]];
    const seat = SEATS[Math.floor(Math.random() * SEATS.length)];
    const sx = seat[0] * SIZE, sy = seat[1] * SIZE;
    A.meeting = B.meeting = true;
    walkTo(A, sx - 26, sy, 40, 'unwinding');
    walkTo(B, sx + 26, sy, 40, 'unwinding');
    meetCooldown = 3;   // one meetup per ~8s window at most
    setTimeout(() => {
      if (!A.cont.active || !B.cont.active) { A.meeting = B.meeting = false; return; }
      const r = GH.sim.hallMeet(idle[i], idle[j]);
      A.bubble.setText('💬'); B.bubble.setText('💬');
      if (r && r.sparked) {
        A.bubble.setText('⭐'); B.bubble.setText('⭐');
        [A, B].forEach((ac) => scene.tweens.add({ targets: ac.bubble, scale: 1.6, duration: 380, yoyo: true, repeat: 3 }));
        if (GH.ui && GH.ui.toastFromHall) GH.ui.toastFromHall(`⭐ ${r.teamName} — a banner is born over drinks!`);
      }
      setTimeout(() => { A.meeting = B.meeting = false; }, 2600);
    }, 2300);
  }

  function refresh() {
    if (!ready || !scene) return;
    startLife();
    if (scene.updateDressing) scene.updateDressing();
    const gNow = S.get();
    const live = new Set();
    // adventurers away on expedition or out hunting aren't in the hall
    const roster = ((S.get() && S.get().roster) || []).filter((a) => a.status !== 'away' && a.status !== 'hunting');
    roster.forEach((a, i) => {
      live.add(a.id);
      const actorNow = actors[a.id];
      const act = activityFor(a, (actorNow && actorNow.half) || 'am');
      const seat = spotFor(a, i);
      const px = seat[0] * SIZE, py = seat[1] * SIZE;
      // Re-place them when a NEED or a re-assignment moved them, not on every
      // state emit (that per-emit yank was the old jitter).
      const needsMove = a.status === 'injured' || a.fed < 45
        || (gNow && gNow.roundDay === gNow.day)
        || (actorNow && actorNow.planKey !== planKeyOf(a));
      let actor = actors[a.id];
      if (!actor) {
        const sheet = sheetFor(a);
        const spr = scene.add.sprite(0, 0, sheet, 0).setScale(3.2);
        spr.play(sheet === 'player' ? 'idle-down' : 'idle-down@' + sheet);
        const label = scene.add.text(0, 40 + (i % 3) * 20, a.name.split(' ')[0], {
          fontFamily: 'monospace', fontSize: '20px', color: '#f2e4c0',
          backgroundColor: '#241c12b8', padding: { x: 4, y: 1 },
        }).setOrigin(0.5, 0).setDepth(2);
        // No background box: a floating emoji with a soft outline reads clean
        // over any floor ("black box around their conversation looks unclean").
        const bubble = scene.add.text(0, -52, '', {
          fontSize: '30px', stroke: '#241c12', strokeThickness: 6,
        }).setOrigin(0.5);
        const cont = scene.add.container(px, py, [spr, label, bubble]).setSize(120, 156).setInteractive(
          new Phaser.Geom.Rectangle(-60, -78, 120, 170), Phaser.Geom.Rectangle.Contains, { useHandCursor: true }
        );
        cont.on('pointerover', () => spr.setTint(0xffffff));
        cont.on('pointerout', () => { spr.clearTint(); if (a.tint) spr.setTint(a.tint); if (a.status === 'injured') spr.setTint(0x884444); });
        cont.on('pointerup', (p) => { if (scene.dragMoved && scene.dragMoved()) return; if (tapHitsUI(p)) return; if (GH.ui && !GH.ui.modalOpen()) GH.ui.openAdventurer(a.id); });
        cont.setDepth(scene.ACTOR_DEPTH);
        const GAITS = { genki: 1.35, brash: 1.2, tsun: 1.1, needy: 1.0, kuu: 0.9, timid: 0.8 };
        // `sheet` rides on the actor so anim() can pick the costume's own
        // animation set — the keys are per texture.
        actor = actors[a.id] = { cont, spr, label, bubble, sheet, gait: (GAITS[a.archetype] || 1) * (0.92 + Math.random() * 0.16) };
        cont.setPosition(px + (Math.random() * 54 - 27), py);
      }
      const { spr, bubble } = actor;
      spr.clearTint();
      if (a.tint) spr.setTint(a.tint);
      if (a.status === 'injured') spr.setTint(0x884444);
      spr.setAlpha(a.actedToday && a.status === 'idle' ? 0.7 : 1);
      // an armed heart event waits for the guildmaster — pull, don't push
      // ❗ = this person has something to say today: a heart event is armed,
      // a fresh deed to tell, or they're hurting. Pull, don't push.
      // One source of truth for the mark AND the reason — see
      // GH.personality.wantsAWord. The sheet shows the same line, so tapping
      // the ❗ now tells you what it was about.
      const wants = !!GH.personality.wantsAWord(a, gNow);
      const k = scene.hudK ? scene.hudK() : 1;
      bubble.setText(wants ? '❗' : act.icon);
      bubble.setColor(wants ? '#ffd75e' : '#ffffff');
      if (wants && !actor.pulse) {
        actor.pulse = scene.tweens.add({ targets: bubble, scale: k * 1.35, duration: 460, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      } else if (!wants && actor.pulse) { actor.pulse.stop(); actor.pulse = null; bubble.setScale(k); }
      // Movement belongs to the life loop — only intervene when a NEED moved
      // them, or they have no plan yet. (Walking on every emit was the bounce.)
      actor.planKey = planKeyOf(a);
      if (!actor.pool) sendTo(actor, act);
      else if (needsMove && act.pool !== actor.pool) sendTo(actor, act);
    });
    // remove actors whose adventurers left the hall
    Object.keys(actors).forEach((id) => {
      if (!live.has(id)) { actors[id].cont.destroy(); delete actors[id]; }
    });
    if (scene.syncHud) scene.syncHud();   // new labels join at readable size
  }

  function focusRoom(id) { if (scene && scene.focusRoom) scene.focusRoom(id); }
  function resetView() { if (scene && scene.resetView) scene.resetView(); }
  function zoomBy(f) { if (scene && scene.zoomBy) scene.zoomBy(f); }

  // _scene is a debug handle: on-device/browser verification needs to read
  // camera zoom, label scales and sign text without a Phaser global.
  function zoomInfo() { return scene && scene.zoomInfo ? scene.zoomInfo() : null; }

  return { init, refresh, activityFor, focusRoom, resetView, zoomBy, zoomInfo, roomOpen, roomRect,
    siteBounds, worldBounds,
    _scene: () => scene, _actors: () => actors };
})();
