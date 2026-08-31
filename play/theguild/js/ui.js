/* DOM UI overlay: top bar, room panels, dispatch flow, character sheets, dialogue. */
window.GH = window.GH || {};

GH.ui = (function () {
  const D = GH.data, S = GH.sim, PF = GH.pf, K = GH.contracts;
  let topEl, modalEl, titleEl, navEl, mapEl, hallBarEl;
  const U = { panel: null, party: new Set(), dispatchJob: null, trainAdv: null, equipAdv: null, equipSlot: null, teamDraft: null, teamView: null };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sgn = (n) => (n >= 0 ? '+' : '') + n;
  const icon = (name, size) => `<img class="icon" src="assets/icons/${name}.png" style="width:${size || 28}px;height:${size || 28}px" alt="">`;
  const uiIcon = (name, size) => `<img class="uiicon" src="assets/icons/ui/${name}.png" style="width:${size || 20}px;height:${size || 20}px" alt="">`;
  function gearBonusText(g) {
    return g.bonus.type === 'all' ? `+${g.bonus.value} all checks` : `+${g.bonus.value} ${D.SKILL_LABEL[g.bonus.skill]}`;
  }
  function lootIcons(loot) {
    const parts = [];
    Object.entries(loot.mats).forEach(([m, q]) => parts.push(`<span class="lootitem">${icon(D.MAT_BY_ID[m].icon, 26)}×${q}</span>`));
    loot.gear.forEach((gId) => parts.push(`<span class="lootitem gearloot">${icon(GH.items.gear(gId).icon, 26)} ${esc(GH.items.gear(gId).name)}</span>`));
    return parts.join('') || '<span class="muted">—</span>';
  }
  function facilityHeader(id) {
    const g = S.get(); const fac = D.FACILITIES[id]; const lvl = S.facLevel(id);
    const maxed = lvl >= fac.max; const cost = S.upgradeCost(id);
    return `<div class="facbar">
      <span class="grow"><b>${uiIcon('fac_' + id, 22)} ${esc(fac.name)} · Lv ${lvl}</b>${maxed ? ' <small>(max)</small>' : ''}
        <br><small>${esc(fac.effect(lvl))}${maxed ? '' : ` → ${esc(fac.effect(lvl + 1))}`}</small></span>
      ${maxed ? '' : `<button class="small" data-action="upgrade" data-id="${id}" ${g.gold < cost ? 'disabled' : ''}>Upgrade ${cost}g</button>`}
    </div>`;
  }

  function mount() {
    topEl = document.getElementById('topbar');
    modalEl = document.getElementById('modal');
    titleEl = document.getElementById('title');
    navEl = document.getElementById('navbar');
    mapEl = document.getElementById('mapbase');
    hallBarEl = document.getElementById('hallbar');
    document.addEventListener('click', onClick);
    window.addEventListener('resize', () => syncNavHeight());
    // Tap the dimmed backdrop to close a bottom sheet. Never for fullsheet
    // panels — closing a story scene mid-chain would strand its queue.
    modalEl.addEventListener('click', (ev) => {
      if (ev.target === modalEl && !modalEl.classList.contains('fullsheet')) hideModal();
    });
    initTeamDrag();
    // renderHallBar was missing here, so the wings counter, the room row and
    // the zoom readout were all stale until you left the hall and came back —
    // you could raise a wing and watch the chip still say 0/7.
    S.onChange(() => { updateTop(); renderNav(); renderMapBase(); renderHallBar(); renderTutorBar(); GH.hall.refresh(); if (U.panel) rerenderPanel(); });
    if (S.hasSave()) { S.emit(); showGame(); } else showTitle();
  }

  // ---- Drag-to-dispatch: pointer drag a team chip onto a breach node ----
  function initTeamDrag() {
    let drag = null;   // { teamId, ghost }
    document.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest && e.target.closest('.teamchip-drag');
      if (!chip || chip.classList.contains('disabled')) return;
      e.preventDefault();
      const ghost = chip.cloneNode(true);
      ghost.className = 'teamchip-drag dragging';
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
      document.body.appendChild(ghost);
      drag = { teamId: chip.dataset.team, ghost };
      document.querySelectorAll('.mapnode.outbreak').forEach((n) => n.classList.add('droptarget'));
    }, { passive: false });
    document.addEventListener('pointermove', (e) => {
      if (!drag) return;
      e.preventDefault();
      drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
      const under = document.elementFromPoint(e.clientX, e.clientY);
      document.querySelectorAll('.mapnode.droptarget').forEach((n) => n.classList.toggle('drophover', !!(under && n.contains(under))));
    }, { passive: false });
    document.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const node = under && under.closest && under.closest('.mapnode.outbreak');
      const teamId = drag.teamId;
      drag.ghost.remove(); drag = null;
      document.querySelectorAll('.droptarget,.drophover').forEach((n) => n.classList.remove('droptarget', 'drophover'));
      if (!node) return;
      const g = S.get();
      const ob = (g.outbreaks || []).find((o) => o.zoneId === node.dataset.id || o.id === node.dataset.ob);
      if (!ob) { toast('No breach there.'); return; }
      const r = S.dispatchTeam(ob.id, teamId);
      if (r.ok) {
        const t = GH.teams.byId(g, teamId);
        toast(`⚑ ${esc(t.name)} rides for ${esc(ob.zoneName)}${r.days > 1 ? ` — ${r.days - 1}d on the road` : ' — they strike tonight'}.`);
      } else toast(r.msg);
    });
  }

  // Bottom tab bar (mobile) — big tap targets for the main destinations.
  function renderNav() {
    if (!navEl) return;
    const g = S.get();
    if (!g) { navEl.innerHTML = ''; return; }
    // The tab list and the badge rules live in js/uinav.js so the engine
    // ports share them — they are the app's information architecture, not
    // rendering. Same objects, one copy.
    const B = GH.uinav.badges(g);
    const tabs = GH.uinav.TABS.map((t) => [t.id, t.label, uiIcon(t.icon, 22), B[t.id]]);
    const isActive = (id) => {
      if (id === 'hall') return document.body.classList.contains('hall-open') ? 'active' : '';
      if (id === 'map') return (!U.panel && !document.body.classList.contains('hall-open')) ? 'active' : '';
      if (id === 'teams') return U.panel === 'teams' ? 'active' : '';
      if (id === 'guild') return U.panel === 'guildhub' ? 'active' : '';
      return (U.panel === 'room' && U.roomId === id) ? 'active' : '';
    };
    // One wooden dock: five tabs and the gold End Day seal at its end. The
    // old full-width End Day bar stacked a second storey on the nav and was
    // the single biggest piece of chrome on screen.
    navEl.innerHTML = `
      <div class="dock">
        ${tabs.map(([id, label, ic, badge]) => `<button class="navtab ${isActive(id)}" data-action="nav" data-nav="${id}">
          <span class="navic">${ic}${badge ? `<span class="navbadge">${badge}</span>` : ''}</span><span class="navlabel">${label}</span></button>`).join('')}
        <button class="endday-bar primary" data-action="end-day">End Day ▸<span class="daynum">Day ${g.day}</span></button>
      </div>`;
    syncNavHeight();
  }

  // --nav-h was a hardcoded 96px guess, and every fixed-position consumer (the
  // hall's room row, sheet footers, the map's scroll padding) trusted it. The
  // cozy skin's End Day button is thicker than the guess, so the real navbar
  // rose OVER the room row — "end of day option covers other options". Measure
  // the truth instead; the CSS value stays only as a pre-JS fallback.
  function syncNavHeight() {
    if (!navEl) return;
    const h = navEl.offsetHeight;
    if (h > 0) document.documentElement.style.setProperty('--nav-h', h + 'px');
  }

  // ---------- toast ----------
  function toast(msg) {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3400);
  }

  // ---------- title ----------
  function showTitle() {
    if (navEl) navEl.innerHTML = '';
    titleEl.style.display = 'flex';
    const cont = S.hasSave();
    titleEl.innerHTML = `<div class="titlehero">
      <div class="hero-spacer"></div>
      <div class="hero-card">
        <div class="hero-logo">
          <span class="hero-spark">✦</span>
          <h1 class="hero-title">The Guild</h1>
          <p class="hero-sub">Run the hall. Raise the banner. Send heroes to glory.</p>
        </div>
        <div class="hero-menu">
          ${cont ? `<button class="menu-btn continue" data-action="continue">${uiIcon('hub_realm', 26)} Continue</button>` : ''}
          <button class="menu-btn ${cont ? '' : 'continue'}" data-action="newgame">${uiIcon('fac_warroom', 26)} New Campaign</button>
          <button class="menu-btn" data-action="${GH.shop.owned('charter') ? 'open-challenges' : 'charter-offer'}">${uiIcon('menu_trophy', 26)} Challenges${GH.shop.owned('charter') ? '' : ' 🔒'}</button>
          <button class="menu-btn" data-action="${GH.shop.owned('charter') ? 'newsandbox' : 'charter-offer'}">${uiIcon('nav_guild', 26)} Sandbox${GH.shop.owned('charter') ? '' : ' 🔒'}</button>
          ${cont ? '<button class="menu-btn subtle" data-action="wipe">Abandon saved guild</button>' : ''}
          <button class="menu-btn subtle" data-action="open-audio-title">🔊 Audio</button>
          <button class="menu-btn subtle" data-action="open-credits">Credits</button>
        </div>
      </div>
    </div>`;
  }

  // Seraphine asks the guild's name — the campaign begins from her question.
  function openNameEntry() {
    titleEl.style.display = 'none';
    const npc = GH.story.STAFF.patron;
    showCine(`<div class="sheet-head sheet-head-portrait">
        ${staffFace('patron', npc, 64)}
        <div><h2>${esc(npc.name)}</h2><small class="muted">${esc(npc.role)}</small></div></div>
      <p class="storytext">“So you're the one taking over this draughty old hall. Every guild worth its salt needs a name the realm will remember. What shall we call yours?”</p>
      <label class="field"><span>Your guild's name</span>
        <input type="text" id="newname" value="The Stamped Scroll" maxlength="28"></label>
      <h3>How hard should the realm be?</h3>
      ${difficultyPicker(U.newDifficulty || D.DEFAULT_DIFFICULTY, 'diff-new')}
      <p class="muted" style="margin:6px 0 0">You can change this later from 🔨 Build.</p>
      <div class="dispatch-foot"><button class="ghost" data-action="title">← Back</button>
        <button class="primary" data-action="found-guild">Found the Guild ⚑</button></div>`);
    U.panel = 'nameentry';
  }

  // One picker, used both when founding a hall and when changing your mind
  // later — so the wording a player chose from is the wording they see again.
  function difficultyPicker(current, action) {
    return `<div class="diffgrid">${D.DIFFICULTY_ORDER.map((id) => {
      const d = D.DIFFICULTIES[id];
      return `<button class="diffopt ${id === current ? 'on' : ''}" data-action="${action}" data-diff="${id}">
        <span class="di">${d.icon}</span>
        <span class="grow"><b>${esc(d.name)}</b><small>${esc(d.blurb)}</small></span></button>`;
    }).join('')}</div>`;
  }

  function showGame() {
    titleEl.style.display = 'none';
    document.body.classList.add('hall-open');   // the hall is home
    updateTop(); renderNav(); renderMapBase(); renderHallBar(); renderTutorBar(); GH.hall.refresh();
  }

  // ---- Tutorial bar: rides above the nav, advances on real play ----------
  // The tutor bar floats above the sheets; publish its height so sheet padding
  // and the sticky dispatch footer can clear it instead of hiding underneath.
  function setTutorBarHeight(px) {
    document.documentElement.style.setProperty('--tutorbar-h', `${Math.round(px)}px`);
  }

  function renderTutorBar() {
    const bar = document.getElementById('tutorbar');
    if (!bar) return;
    const g = S.get();
    // U.panel === 'story': a story scene is its own Seraphine card — the tour
    // card floating over it doubles her up; it comes back when the scene ends.
    if (!g || !GH.tutorial || !GH.tutorial.active(g) || titleEl.style.display !== 'none' || U.panel === 'story') { bar.innerHTML = ''; bar.className = ''; setTutorBarHeight(0); document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow')); return; }
    const step = GH.tutorial.current(g);
    if (!step) { bar.innerHTML = ''; bar.className = ''; setTutorBarHeight(0); return; }
    const npc = GH.story.STAFF.patron;
    let choiceHtml = '';
    if (step.choice) {
      const c = GH.tutorial.firstChoices(g);
      if (c) {
        choiceHtml = `<div class="tut-choices">
          <button class="tut-choice" data-action="tut-pick" data-id="${c.safe.id}">
            <b>Steady coin</b><br><small>${esc(c.safe.title)} · DC ${c.safe.dc} · ${c.safe.bounty}g</small></button>
          <button class="tut-choice" data-action="tut-pick" data-id="${c.bold.id}">
            <b>Bold purse</b><br><small>${esc(c.bold.title)} · DC ${c.bold.dc} · ${c.bold.bounty}g</small></button>
        </div>`;
      } else { GH.tutorial.next(g); renderTutorBar(); return; }
    }
    bar.className = 'on';
    bar.innerHTML = `<div class="tut-card">
      <div class="tut-head">${staffFace('patron', npc, 40)}<b>${esc(npc.name)}</b>
        <span class="tut-step">${g.tutorial.step + 1}/${GH.tutorial.STEPS.length}</span></div>
      <p class="tut-text">${esc(typeof step.text === 'function' ? step.text(g) : step.text)}</p>
      ${choiceHtml}
      <div class="tut-buttons">${(step.buttons || []).map(([a, l]) => `<button class="small ${a === 'tut-next' || a === 'tut-done' ? 'primary' : 'ghost'}" data-action="${a}">${l}</button>`).join('')}</div>
    </div>`;
    setTutorBarHeight(bar.getBoundingClientRect().height + 8);
    // highlight the target control; a step may compute its selector from live
    // UI state, and may name a fallback for when the real target is not on
    // screen (e.g. the dispatch button after the player closed the sheet).
    document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
    const sel = typeof step.highlight === 'function' ? step.highlight() : step.highlight;
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    let targets = sel ? [...document.querySelectorAll(sel)].filter(visible) : [];
    if (!targets.length && step.fallback) targets = [...document.querySelectorAll(step.fallback)].filter(visible);
    targets.forEach((e) => e.classList.add('tut-glow'));
  }

  // ---- Staff chats: the people who run the building ----------------------
  function openStaff(key) {
    const r = S.staffTalk(key);
    if (!r.ok) return;
    const s = r.staff;
    const face = s.speaker ? staffFace(s.speaker, GH.story.STAFF[s.speaker], 72)
      : `<span class="staffmono">${esc(s.name[0])}</span>`;
    const pips = '●'.repeat(Math.min(7, r.count)) + '○'.repeat(Math.max(0, 7 - Math.min(7, r.count)));
    showModal(`<div class="sheet-head sheet-head-portrait">${face}
        <h2>${esc(s.name)}<br><small class="muted" style="font-weight:normal">${esc(s.role)}</small></h2>
        <button class="x" data-action="close">✕</button></div>
      <div class="dialogue"><div class="quote">“${esc(r.line)}”</div></div>
      <div class="stafffam"><span class="muted">${esc(r.tierName)}</span> <span class="fampips">${pips}</span></div>
      <div class="dispatch-foot">
        <span class="muted" style="font-size:.8rem">Stop by daily — people open up to a Guildmaster who listens.</span>
        <button class="primary" data-action="staff-again" data-id="${key}">Chat ▸</button>
      </div>`);
    U.panel = 'staff';
  }

  // ---- Hall view: step inside the guild (Phaser canvas + facility bar) ----
  function openHallView() {
    hideModal();
    U.home = 'hall';
    document.body.classList.add('hall-open');
    renderNav(); renderHallBar();
  }
  function closeHallView() {
    U.home = 'map';
    document.body.classList.remove('hall-open');
    renderNav();
  }
  // How much of the guild stands, in one glanceable line. Lives in the HUD,
  // not on the canvas: an in-world banner collided with this very bar.
  function wingsChip(g) {
    const wings = Object.keys(D.FACILITIES).filter((id) => D.FACILITIES[id].buildable);
    const raised = wings.filter((id) => S.facLevel(id) > 0);
    const pips = wings.map((id) => (S.facLevel(id) > 0 ? '▣' : '▢')).join('');
    return `<span class="wingschip ${raised.length ? 'on' : ''}">${pips}</span> ${raised.length}/${wings.length} raised`;
  }

  // The zoom buttons ALWAYS worked — measured 0.387 -> 0.522 -> 0.705 on real
  // device taps — but with nothing on screen that names the current zoom, a tap
  // that pans the same painting a little closer reads as a dead control. So say
  // the number out loud, and grey the button that has nowhere left to go.
  function syncZoomRead() {
    const read = document.querySelector('.zoomread');
    if (!read || !GH.hall || !GH.hall.zoomInfo) return;
    const z = GH.hall.zoomInfo();
    // `min` is the cover zoom, computed from the camera's width and height —
    // both 0 until the canvas has been laid out, and momentarily 0 again across
    // a rotation. Dividing by it then puts a literal "Infinity%" in front of the
    // player, so anything that is not a finite ratio counts as "not known yet".
    const pct = z && z.min > 0 ? (z.zoom / z.min) * 100 : NaN;
    if (!isFinite(pct)) { read.textContent = ''; read.classList.add('empty'); return; }
    read.classList.remove('empty');
    read.textContent = Math.round(pct) + '%';
    const btn = (dir) => document.querySelector(`.zoombtn[data-dir="${dir}"]`);
    if (btn('in')) btn('in').classList.toggle('atlimit', !!z.atMax);
    if (btn('out')) btn('out').classList.toggle('atlimit', !!z.atMin);
  }

  function renderHallBar() {
    if (!hallBarEl) return;
    const g = S.get();
    if (!g) { hallBarEl.innerHTML = ''; return; }
    // The room-chip row is GONE: every room and vacant plot is tappable in the
    // hall itself, and Build has its own dock tab — the row was a second copy
    // of the building drawn over the building. What remains is one context
    // chip (way out + wings raised) and the zoom cluster.
    hallBarEl.innerHTML = `
      <div class="hallchip">
        <button class="ghost" data-action="hall-back">← Map</button>
        <span>${wingsChip(g)}</span>
      </div>
      <div class="hallbar-zoom">
        <button class="zoombtn" data-action="hall-zoom" data-dir="in" aria-label="Zoom in">＋</button>
        <span class="zoomread empty" aria-live="polite"></span>
        <button class="zoombtn" data-action="hall-zoom" data-dir="out" aria-label="Zoom out">−</button>
        <button class="zoombtn" data-action="hall-wide" aria-label="Whole hall">⤢</button>
      </div>`;
    syncZoomRead();
  }

  // ---- The Map: persistent home base ----
  // Teams on the road: a flag creeps from the hall toward the breach.
  const HALL_XY = [10, 74];   // the guild sits in the Greenfields (map %)
  function transitMarkers(g) {
    const SPOTS2 = { greenfields: [19, 66], ashwood: [36, 32], karst: [54, 62], cinder: [72, 30], sunken: [86, 62] };
    return (S.expeditions() || []).filter((e) => e.travel || e.job.isOutbreak).map((e) => {
      const dst = SPOTS2[e.job.zoneId] || [50, 50];
      const done = e.totalDays - e.daysLeft, prog = Math.min(1, (done + 0.35) / Math.max(1, e.totalDays));
      const x = HALL_XY[0] + (dst[0] - HALL_XY[0]) * prog;
      const y = HALL_XY[1] + (dst[1] - HALL_XY[1]) * prog;
      const t = e.teamId ? GH.teams.byId(g, e.teamId) : null;
      return `<span class="transit" style="left:${x}%;top:${y}%" title="${esc(e.job.title)}">⚑<small>${t ? esc(t.name) : e.daysLeft + 'd'}</small></span>`;
    }).join('');
  }

  // Drag a team chip onto a breach to answer it. Speed decides reach.
  function teamTray(g) {
    if (!(g.outbreaks || []).length || !(g.teams || []).length) return '';
    const chips = g.teams.map((t) => {
      const r = GH.teams.readiness(g, t);
      const sp = GH.teams.speed(g, t);
      return `<div class="teamchip-drag ${r.allReady ? '' : 'disabled'}" data-team="${t.id}">
        ${teamStrip(g, t, 24)}<b>${esc(t.name)}</b>
        <span class="speedtag">${sp.icon} ${sp.label}</span>
        <small>${r.ready}/${r.total}</small>
      </div>`;
    }).join('');
    return `<div class="teamtray"><span class="traylabel">⚠ Drag a team onto the breach</span><div class="traychips">${chips}</div></div>`;
  }

  function renderMapBase() {
    if (!mapEl) return;
    const g = S.get();
    if (!g) { mapEl.innerHTML = ''; return; }
    const terr = GH.story.territory(g);

    // Regions as pin markers on the painted map. Boxes-and-dashed-lines read
    // as a flowchart over the art; a pin + a name plate reads as a place.
    const SPOTS = [[19, 66], [36, 32], [54, 62], [72, 30], [86, 62], [90, 18], [93, 46], [89, 79]];   // 5 heartland + 3 Marches (east)
    const nodes = D.ZONES.map((z, i) => {
      const st = GH.story.regionStatus(g, z);
      const ob = (g.outbreaks || []).find((o) => o.zoneId === z.id);
      const cls = st === 'controlled' ? 'held' : st === 'active' ? 'contested' : 'locked';
      const [sx, sy] = SPOTS[i % SPOTS.length];
      const marker = ob ? uiIcon('mark_outbreak', 26)
        : st === 'controlled' ? uiIcon('hub_realm', 26)
        : st === 'active' ? uiIcon('fac_warroom', 26)
        : uiIcon('mark_locked', 26);
      const jobs = (g.board || []).filter((j) => j.zoneId === z.id && j.status === 'open').length;
      // Every region opens its own panel — locked ones included, so you can
      // see what it is and what it needs rather than getting a dead tap.
      const act = (st === 'locked' && !S.zoneAllowed(z)) ? 'charter-offer' : 'region';
      const rivaled = GH.rival && GH.rival.contested(g, z.id);
      return `<button class="mappin ${cls} ${ob ? 'outbreak' : ''} ${rivaled ? 'rivaled' : ''}" style="left:${sx}%;top:${sy}%"
          data-action="${act}" data-id="${z.id}" title="${esc(z.name)}">
        <span class="pinhead">${marker}${ob ? '<i class="pinalert">!</i>' : ''}${jobs && !ob ? `<i class="pinjobs">${jobs}</i>` : ''}</span>
        <span class="pinplate"><b>${esc(z.name)}</b>${tierPips(z.tier)}${rivaled ? '<i class="pinrival">⚔ Vane</i>' : ''}</span>
      </button>`;
    }).join('');
    const route = '';

    // the guild hall node — tap to step inside
    const hallNode = `<div class="hallnode" data-action="open-hall">
      ${uiIcon('nav_guild', 34)}
      <span class="grow"><b>${esc(g.guildName)}</b><br><small>${g.roster.filter(a=>a.status!=='away'&&a.status!=='hunting').length} at the hall · tap to enter</small></span>
      <span class="objective-mini">${g.story && g.story.objective ? '▶ ' + esc(g.story.objective) : ''}</span>
    </div>`;

    // teams in the field: live progress
    const exps = S.expeditions();
    const fieldRows = exps.map((e) => {
      const t = e.teamId ? GH.teams.byId(g, e.teamId) : null;
      const done = e.totalDays - e.daysLeft;
      const pct = Math.round((done / e.totalDays) * 100);
      const names = e.partyIds.map((id) => { const a = S.findAdv(id); return a ? a : null; }).filter(Boolean);
      return `<div class="fieldrow">
        <span class="fieldfaces">${names.slice(0, 3).map((a) => GH.portraits.img(a, 30)).join('')}</span>
        <span class="grow"><b>${t ? '⚑ ' + esc(t.name) : esc(names.map(n=>n.name.split(' ')[0]).join(', '))}</b>
          <br><small>${esc(e.job.title)}</small>
          <div class="fieldbar"><div class="fieldfill" style="width:${Math.max(8, pct)}%"></div></div></span>
        <span class="daysleft">${e.daysLeft}d</span>
      </div>`;
    }).join('');
    const hunters = g.roster.filter((a) => a.status === 'hunting');
    const huntRows = hunters.map((a) => `<div class="fieldrow">
      <span class="fieldfaces">${GH.portraits.img(a, 30)}</span>
      <span class="grow"><b>${esc(a.name.split(' ')[0])}</b><br><small>hunting in ${esc((D.ZONE_BY_ID[a.huntZone] || {}).name || 'the wilds')}</small></span>
      <span class="daysleft">🏹</span>
    </div>`).join('');
    const field = (fieldRows || huntRows)
      ? `<h3>In the field</h3>${fieldRows}${huntRows}`
      : '<p class="muted" style="text-align:center">No one is in the field. The Board has work.</p>';

    // outbreak alerts with team dispatch
    const obs = (g.outbreaks || []).map((ob) => outbreakCard(g, ob)).join('');

    mapEl.innerHTML = `
      <div class="mapscroll">
        ${hallNode}
        <div class="terrline"><button class="realmbtn" data-action="open-realm">🗺 Territory ${terr.controlled}/${terr.total} ▸</button><span class="muted"> · day ${g.day}</span>${g.endless ? `<span class="wavebadge">🛡 Wave ${g.endless.wave} · held ${g.day - g.endless.startedDay}d${S.endlessBest() ? ' · best ' + S.endlessBest() + 'd' : ''}</span>` : (g.era >= 3 && g.rift ? `<span class="wavebadge riftbadge">⛧ Rift ${g.rift.stage}/${GH.rift ? GH.rift.STAGES : 5} sealed · ${g.rift.gatesMissed}/${GH.rift ? GH.rift.MISS_LIMIT : 3} lost</span>` : (g.prestige ? `<span class="wavebadge">✦ Charter ${g.prestige + 1}</span>` : ''))}</div>
        <div class="worldmap${(g.outbreaks || []).length ? ' breach' : ''}">${route}${nodes}${transitMarkers(g)}<span class="mapcompass">✦<small>N</small></span></div>
        ${teamTray(g)}
        ${obs ? '<h3>⚠ Outbreaks</h3>' + obs : ''}
        ${field}
      </div>`;
  }


  // ---------- top bar: one resource plaque + small icon buttons ----------
  const rcIcon = (name, size) => `<img src="assets/icons/rc/gold/${name}.png" style="width:${size || 22}px;height:${size || 22}px" alt="">`;
  // Money legibility: last night's net gold, and when the next upkeep lands.
  function ledgerChip(g) {
    const l = g.dayLedger;
    if (!l || l.day !== g.day || !l.delta) return '';
    return ` <small class="ledger ${l.delta > 0 ? 'up' : 'down'}" title="Last night's net gold">${l.delta > 0 ? '▲+' : '▼'}${l.delta}g</small>`;
  }
  function rentChip(g) {
    const rent = S.RENT + (g.endless ? 6 * g.endless.wave : 0);
    const days = ((8 - (g.day % 7)) % 7) || 7;   // upkeep lands entering day ≡1 (mod 7)
    const short = g.gold < rent;
    if (!short && days > 2) return '';           // only speak up when it's near or tight
    return ` <small class="rentchip ${short ? 'warn' : ''}" title="Weekly upkeep ${rent}g in ${days} day${days > 1 ? 's' : ''}${short ? ' — you are short!' : ''}">🏠${rent}g·${days}d</small>`;
  }

  function updateTop() {
    const g = S.get(); if (!g) return;
    // Four unlabelled glyphs and a number each ("150 · ★0 · 3/6 · ⏱1") is not
    // a readable HUD — nobody can tell what "3/6" counts. Every figure now
    // carries its NAME under it, and the values are sized to be read at a
    // glance, because this strip is the most-looked-at thing in the game.
    // One carved ribbon for every screen size: the four numbers you actually
    // read, each named, and a single menu button. Everything the old desktop
    // icon cluster reached lives in the More menu now.
    topEl.innerHTML = `
      <div class="hud">
        <span class="res"><span class="v gold">${rcIcon('cash_coin_A', 15)}${g.gold}</span>
          <span class="k">Gold${ledgerChip(g)}</span></span>
        <span class="res"><span class="v rep">${rcIcon('star', 15)}${g.reputation}</span>
          <span class="k">Renown</span></span>
        <span class="res"><span class="v">${rcIcon('friend_list', 15)}${g.roster.length}/${S.bedsCount()}</span>
          <span class="k">People</span></span>
        <span class="res"><span class="v">${rcIcon('time', 15)}${g.day}</span>
          <span class="k">Day${rentChip(g)}</span></span>
        ${g.endless ? `<span class="res"><span class="v">${rcIcon('warning', 15)}${g.endless.wave}</span>
          <span class="k">Wave</span></span>` : ''}
        <button class="hud-menu" data-action="more-menu" aria-label="Menu">${rcIcon('menu', 20)}</button>
      </div>`;
  }

  // ---------- modal plumbing ----------
  // Default = bottom sheet (the hall stays visible behind). Cinematic panels
  // (story scenes, heart/promise events, game over) pass { full: true }.
  function showModal(html, opts) {
    // A re-render replaces the sheet's innerHTML wholesale, which throws the
    // scroll position back to the top. On the character sheet the gear slots
    // are well below the fold, so tapping a slot to add an item yanked the
    // screen up to the portrait — "it jumps on the screen". Panels that
    // re-render themselves (the sheet, the armory) pass keepScroll so the
    // reader stays where they were looking.
    // Which element scrolls depends on the layout: .sheet on a phone bottom
    // sheet, #modal on wide. Read both, restore to both.
    const prev = opts && opts.keepScroll ? modalEl.querySelector('.sheet') : null;
    const keptScroll = prev ? (prev.scrollTop || modalEl.scrollTop) : 0;
    modalEl.innerHTML = `<div class="sheet">${html}</div>`;
    if (keptScroll) {
      const sheet = modalEl.querySelector('.sheet');
      sheet.scrollTop = keptScroll;
      if (!sheet.scrollTop) modalEl.scrollTop = keptScroll;
    }
    modalEl.classList.add('open');
    modalEl.classList.toggle('fullsheet', !!(opts && opts.full));
    document.body.classList.add('modal-open');
  }
  function hideModal() { modalEl.classList.remove('open'); modalEl.classList.remove('fullsheet'); document.body.classList.remove('modal-open'); modalEl.innerHTML = ''; U.panel = null; U.dispatchJob = null; U.party.clear(); U.trainAdv = null; U.equipAdv = null; U.equipSlot = null; if (typeof renderTutorBar === 'function') renderTutorBar(); }
  // Cinematic panels take the whole screen; everything else is a bottom sheet.
  function showCine(html) { showModal(html, { full: true }); }
  function rerenderPanel() {
    if (!U.panel) return;
    // A conversation exchange updates the sheet in place (dialogue + affinity
    // row); a full rebuild here would flash the sheet and reset its scroll on
    // every line — the "clunky interactions" feel.
    if (U.holdPanel) return;
    if (U.panel === 'room') openRoom(U.roomId, true);
    else if (U.panel === 'region') openRegion(U.regionId, true);
    else if (U.panel === 'adv') openAdventurer(U.advId, true);
    else if (U.panel === 'log') openLog(true);
    else if (U.panel === 'realm') openRealm(true);
    else if (U.panel === 'armory') openArmory(true);
    else if (U.panel === 'styles') openStyles(true);
    else if (U.panel === 'teams') openTeams(true);
    else if (U.panel === 'guildhub') openGuildHub(true);
  }

  // In-place affinity feedback: tween the bar, bump the number, float a ±♥.
  function bumpAffinity(a, gained) {
    const row = document.querySelector('#modal .affinityrow');
    if (!row) return;
    const fill = row.querySelector('.needfill.aff'); if (fill) fill.style.width = `${a.affinity || 0}%`;
    const val = row.querySelector('.needval'); if (val) val.textContent = a.affinity || 0;
    const lab = row.querySelector('.afflabel'); if (lab) lab.textContent = a.sworn ? '⚔ Sworn' : GH.personality.tierOf(a.affinity || 0);
    if (gained) {
      const f = document.createElement('span');
      f.className = 'affup' + (gained < 0 ? ' neg' : '');
      f.textContent = `${gained > 0 ? '+' : ''}${gained} ♥`;
      row.appendChild(f);
      setTimeout(() => f.remove(), 1000);
    }
  }

  // ---------- needs / bars ----------
  function bar(label, v, cls) {
    const pct = Math.max(0, Math.min(100, v));
    return `<div class="needrow"><span class="needlabel">${label}</span>
      <div class="needbar"><div class="needfill ${cls}" style="width:${pct}%"></div></div>
      <span class="needval">${Math.round(v)}</span></div>`;
  }

  // ====================================================================
  //  ROOM PANELS
  // ====================================================================
  // A room that has not been raised is a plot: the only thing you can do in
  // it is commission it. (Level-0 buildables — see FACILITIES.buildable.)
  function plotPanel(id) {
    const fac = D.FACILITIES[id];
    const cost = S.upgradeCost(id);
    const g = S.get();
    const can = g.gold >= cost;
    return `<div class="plotcard">
        <span class="plotic">${fac.icon || '＋'}</span>
        <div class="grow"><b>An empty plot.</b>
          <p class="muted" style="margin:4px 0 0">Boards over the doorway and cold air behind them.
            Raise it and the guild grows by a room.</p>
          <p class="level" style="margin:8px 0 0">Once raised: ${esc(fac.effect(1))}</p></div>
      </div>
      <div class="dispatch-foot"><span class="muted">You have ${g.gold}g</span>
        <button class="primary" data-action="upgrade" data-id="${id}" ${can ? '' : 'disabled'}>
          ＋ Raise the ${esc(fac.name)} — ${cost}g</button></div>`;
  }

  // A vacant village lot: what it is, what it costs, what it does for the
  // street. Raising is a one-shot buy — the building stands from then on.
  function openVillageLot(id) {
    const lot = S.villageLot(id);
    if (!lot) return;
    const g = S.get(); if (!g) return;
    if (S.villageBuilt(id)) return;
    U.panel = 'villagelot'; U.lotId = id;
    const can = g.gold >= lot.cost;
    showModal(`<div class="sheet-head"><h2>A vacant lot</h2><button class="x" data-action="close">✕</button></div>
      <div class="plotcard">
        <span class="plotic">🏠</span>
        <div class="grow"><b>${esc(lot.name)}</b>
          <p class="muted" style="margin:4px 0 0">${esc(lot.blurb)}</p>
          <p class="level" style="margin:8px 0 0">Once raised: the street gets busier, and the guild earns +2 renown.</p></div>
      </div>
      <div class="dispatch-foot"><span class="muted">You have ${g.gold}g</span>
        <button class="primary" data-action="raise-lot" data-id="${esc(id)}" ${can ? '' : 'disabled'}>
          ＋ Raise the ${esc(lot.name)} — ${lot.cost}g</button></div>`);
  }

  function openRoom(id, keep) {
    U.panel = 'room'; U.roomId = id;
    const room = D.ROOMS.find((r) => r.id === id);
    const fac = D.FACILITIES[id];
    if (fac && fac.buildable && S.facLevel(id) === 0) {
      showModal(`<div class="sheet-head"><h2>${esc(room.name)}</h2><button class="x" data-action="close">✕</button></div>
        ${plotPanel(id)}`);
      return;
    }
    let body = '';
    if (id === 'board') body = boardPanel();
    else if (id === 'kitchen') body = kitchenPanel();
    else if (id === 'training') body = trainingPanel();
    else if (id === 'dormitory') body = dormitoryPanel();
    else if (id === 'tavern') body = tavernPanel();
    else if (id === 'smithy') body = smithyPanel();
    showModal(`<div class="sheet-head"><h2>${esc(room.name)}</h2><button class="x" data-action="close">✕</button></div>
      <p class="muted">${esc(room.blurb)}</p>${body}`);
  }

  // --- Contract board + dispatch -----------------------------------------
  function boardPanel() {
    if (U.dispatchJob) return dispatchView();
    const g = S.get();
    const zoneStrip = D.ZONES.map((z) => {
      const unlocked = g.zonesUnlocked.includes(z.id);
      const sel = g.selectedZone === z.id;
      const cleared = g.bossDone[z.id];
      return `<button class="zonetab ${sel ? 'active' : ''} ${unlocked ? '' : 'locked'}"
        ${unlocked ? `data-action="select-zone" data-id="${z.id}"` : 'disabled'}>
        <span class="zname">${esc(z.name)}</span>
        <span class="ztier">${unlocked ? (cleared ? '✔ cleared' : 'Tier ' + z.tier) : (S.zoneAllowed(z) ? '🔒 rep ' + z.reqRep : '🔒 charter')}</span>
      </button>`;
    }).join('');
    const zone = D.ZONE_BY_ID[g.selectedZone];
    const jobs = g.board.filter((j) => j.zoneId === g.selectedZone);
    const cards = jobs.map((j, i) => contractCard(g, j, i)).join('') || '<p class="muted">No contracts here today — try another region or End the Day.</p>';
    const exps = S.expeditions();
    const expHtml = exps.length ? `<div class="expbar"><span class="invlabel">On expedition</span>${exps.map((e) => {
      const names = e.partyIds.map((id) => { const a = S.findAdv(id); return a ? esc(a.name.split(' ')[0]) : '?'; }).join(', ');
      return `<div class="exprow"><span class="grow">${esc(e.job.title)} <small>— ${names}</small></span><span class="daysleft">${e.daysLeft}d</span></div>`;
    }).join('')}</div>` : '';
    const ready = S.idle().length;
    return `<div class="zonestrip">${zoneStrip}</div>
      <div class="zonebanner zb-${zone.id}"><span class="zb-label">${esc(zone.name)} · Tier ${zone.tier}</span></div>
      ${(GH.seasons && GH.seasons.of(g)) ? `<div class="seasonline">${GH.seasons.of(g).glyph} <b>${esc(GH.seasons.of(g).name)}</b> — ${esc(GH.seasons.of(g).blurb)}</div>` : ''}
      ${expHtml}
      <div class="spread"><p class="muted" style="margin:0">${esc(zone.name)} · materials: ${zone.mats.map((m) => D.MAT_BY_ID[m].name).join(', ')}</p>
        <button class="small" data-action="auto-day" ${ready ? '' : 'disabled'} title="Let the advisor form parties and dispatch the best contracts">✦ Auto-run day</button></div>
      <div class="contracts">${cards}</div>`;
  }

  // Talking should show the person, not just their words. Use the same
  // cutout busts the heart scenes use, falling back to the framed portrait
  // when a character has no cutout yet.
  function speakerFigure(a, expr) {
    const bust = GH.portraits.bustSrc ? GH.portraits.bustSrc(a, expr) : null;
    if (bust) return `<img class="talkbust" src="${bust}" alt="">`;
    const art = GH.portraits.srcFor ? GH.portraits.srcFor(a, expr) : null;
    if (art) return `<img class="talkbust talkmasked" src="${art}" alt="">`;
    return `<span class="talkfallback">${GH.portraits.img(a, 120)}</span>`;
  }
  // plain = the line already carries its own narration and quote marks (a
  // topic answer is "they look away, then: ..."), so don't wrap it again.
  function dialogueBlock(a, line, meta, choices, expr, plain) {
    return `<div class="talkscene">${speakerFigure(a, expr)}
        <span class="talkname">${esc(a.name.split(' ')[0])}</span></div>
      <span class="quote">${plain ? esc(line) : '“' + esc(line) + '”'}</span>${meta || ''}
      ${choices ? `<div class="resp-row">${choices}</div>` : ''}`;
  }
  // The sheet head is sticky at the top and the action row sticky at the
  // bottom; a conversation rendered outside the gap between them ends up half
  // under one of them. Put it in the middle of the free window.
  function showDialogue(el, html) {
    if (!el) return;
    el.innerHTML = html;
    setTimeout(() => {
      // Centre the REPLIES when there are any: they're the interaction, and
      // a tall block centred as a whole leaves them under the action row.
      const t = el.querySelector('.resp-row') || el;
      try { t.scrollIntoView({ block: 'center' }); } catch (e) {}
    }, 0);
  }

  function hashCode(str) {
    let h = 0;
    for (let k = 0; k < String(str).length; k++) h = (h * 31 + String(str).charCodeAt(k)) | 0;
    return Math.abs(h);
  }

  function contractCard(g, j, i) {
    const rk = D.RANKS[j.rank];
    const done = j.status !== 'open';
    const expiring = j.boardDays != null && j.boardDays <= 1;
    const rivalChip = j.rivalBid ? `<span class="ctag rival">⚔ Vane's crew — ${j.boardDays}d</span>` : '';
    const extras = [
      rivalChip,
      j.boardDays != null ? `<span class="ctag ${expiring ? 'urgent' : ''}">⏳ ${j.boardDays}d left</span>` : '',
      j.minParty > 1 ? `<span class="ctag">${j.minParty}+ party</span>` : '',
      j.bonus ? `<span class="ctag bonus">✦ flawless +${j.bonus.pct}%</span>` : '',
    ].join('');
    const tilt = ((hashCode(j.id) % 5) - 2) * 0.35;
    // A boss is the point of a whole region, and it used to look like every
    // other slip of paper on the board. Give it a face.
    const face = j.isBoss ? bossFace(j.zoneId) : '';
    return `<div class="contract paper ${done ? 'spent' : ''} ${j.isBoss ? 'boss' : ''}" style="--tilt:${tilt}deg">
      <span class="pin" aria-hidden="true"></span>
      ${face}
      <div class="cmeta"><span class="rank" style="--rc:${rk.color}">${j.rank}</span>
        <span class="ctag">${j.tag}</span>${j.isBoss ? '<span class="bosstag">BOSS</span>' : ''}${extras}
        <span class="cdc">DC ${j.dc} · ${D.SKILL_LABEL[j.skill]}</span></div>
      <div class="ctitle">${esc(j.title)}</div>
      <div class="cclient">${esc(j.client)} · reward <b>${j.bounty}g</b> · ${j.stages} stage${j.stages > 1 ? 's' : ''}</div>
      <div class="crow">${done ? `<span class="muted">${j.status === 'done' ? 'Completed' : 'Failed'}</span>`
        : `<button class="primary small" data-action="auto-dispatch" data-id="${j.id}">Send Party ▸</button>
           <button class="ghost small" data-action="dispatch-start" data-id="${j.id}">pick myself</button>`}</div>
    </div>`;
  }

  // Boss art, keyed by zone. Absent files simply do not render — the same
  // graceful-absence contract the portrait manifest uses, so a half-finished
  // art pass can never break the board.
  const BOSS_ART = new Set(['greenfields', 'ashwood', 'karst', 'cinder', 'sunken',
    'thornmere', 'greyreach', 'emberwastes']);
  function bossFace(zoneId, cls) {
    if (!BOSS_ART.has(zoneId)) return '';
    const z = D.ZONE_BY_ID[zoneId];
    return `<img class="bossface ${cls || ''}" src="assets/bosses/${zoneId}.webp"
      alt="${esc((z && z.boss) || 'Boss')}" loading="lazy"
      onerror="this.remove()">`;
  }

  function dispatchView() {
    const g = S.get();
    const j = S.findJob(U.dispatchJob);
    if (!j) { U.dispatchJob = null; return boardPanel(); }
    const rk = D.RANKS[j.rank];
    const heroes = g.roster.map((a) => {
      const avail = a.status === 'idle' && !a.actedToday;
      const m = PF.bestSkillFor(a, j.tag).mod;   // same number the dice will use
      const need = (a.status === 'injured') ? 'injured' : (a.actedToday ? 'worked today' : '');
      const inParty = U.party.has(a.id);
      const hint = m >= (j.dc - 10) ? 'good' : (m >= (j.dc - 14) ? 'ok' : 'risky');
      return `<label class="pickrow ${avail ? '' : 'disabled'} ${inParty ? 'sel' : ''}">
        <input type="checkbox" data-action="party-toggle" data-id="${a.id}" ${inParty ? 'checked' : ''} ${avail ? '' : 'disabled'}>
        ${GH.portraits.img(a, 40)}
        <span class="grow"><b>${esc(a.name.split(' ')[0])}</b> <small>${a.ancestry} ${a.class} · Lv${a.level}</small>
          ${need ? `<small class="warn">(${need})</small>` : ''}</span>
        <span class="modpill ${hint}">${D.SKILL_LABEL[j.skill]} ${sgn(m)}</span>
      </label>`;
    }).join('');
    const party = Array.from(U.party);
    const odds = estimateOdds(j, party.map(S.findAdv).filter(Boolean));
    return `<button class="ghost small" data-action="dispatch-cancel">← Back to board</button>
      <div class="contract big">
        <div class="cmeta"><span class="rank" style="--rc:${rk.color}">${j.rank}</span>
          <span class="ctag">${j.tag}</span><span class="cdc">DC ${j.dc} · ${D.SKILL_LABEL[j.skill]}</span></div>
        <div class="ctitle">${esc(j.title)}</div>
        <div class="cclient">${esc(j.client)} · reward <b>${j.bounty}g</b> (your cut ≈ <b>${Math.round(j.bounty * S.YOUR_CUT)}g</b>) · needs ${j.stages} net success${j.stages > 1 ? 'es' : ''} · <b>${j.days} day${j.days > 1 ? 's' : ''} away</b></div>
      </div>
      <div class="spread"><h3>Assign your party</h3>
        <button class="small" data-action="auto-party" data-id="${j.id}">✦ Suggest party</button></div>
      ${(g.teams || []).length ? `<div class="teamchips">${g.teams.map((t) => {
        const r = GH.teams.readiness(g, t);
        return `<button class="teamchip" data-action="use-team" data-id="${t.id}" ${r.ready ? '' : 'disabled'} style="--tc:${t.color}">⚑ ${esc(t.name)} <small>${r.ready}/${r.total}</small></button>`;
      }).join('')}</div>` : ''}
      <div class="picklist">${heroes}</div>
      <div class="dispatch-foot">
        <span class="odds ${odds.cls}">${j.minParty > 1 && party.length < j.minParty ? `Needs ${j.minParty}+ adventurers` : odds.label}</span>
        <button class="primary" data-action="dispatch-go" ${party.length && (!j.minParty || party.length >= j.minParty) ? '' : 'disabled'}>Send out (${party.length}) ▸</button>
      </div>`;
  }

  function estimateOdds(j, party) {
    if (!party.length) return { label: 'Pick at least one adventurer', cls: 'risky' };
    // expected net successes: sum over party of P(success)*1 + P(crit)*1 - P(critfail)*1
    let exp = 0;
    party.forEach((a) => {
      const m = PF.bestSkillFor(a, j.tag).mod;   // same number the dice will use
      const need = j.dc - m;                       // d20 must be >= need
      const pSucc = clamp01((21 - need) / 20);
      const pCrit = clamp01((21 - (need + 10)) / 20);
      const pCF = clamp01(((j.dc - 10 - m)) / 20); // roughly
      exp += pSucc + pCrit - Math.max(0, pCF);
    });
    const ratio = exp / j.stages;
    if (ratio >= 1.6) return { label: 'Strong odds', cls: 'good' };
    if (ratio >= 1.0) return { label: 'Fair odds', cls: 'ok' };
    if (ratio >= 0.6) return { label: 'Risky', cls: 'risky' };
    return { label: 'Long shot', cls: 'risky' };
  }
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  function doDispatch() {
    const j = U.dispatchJob; const party = Array.from(U.party);
    // if the picked party IS a full team, dispatch as that team (synergy applies)
    const g = S.get();
    const asTeam = (g.teams || []).find((t) => t.memberIds.length === party.length && t.memberIds.every((id) => party.includes(id)));
    const r = S.dispatch(j, party, asTeam ? { teamId: asTeam.id } : undefined);
    if (!r.ok) { toast(r.msg); return; }
    U.dispatchJob = null; U.party.clear();
    const g2 = S.get();
    if (GH.tutorial && GH.tutorial.active(g2) && GH.tutorial.notify(g2, 'dispatched')) { S.persist(); hideModal(); renderTutorBar(); }
    else openRoom('board', true);
    toast(`${party.length} adventurer${party.length > 1 ? 's' : ''} set out — back in ${r.days} day${r.days > 1 ? 's' : ''}.`);
  }

  // Dawn digest — the ONE morning sheet: expedition returns, overnight
  // events, and the money line, folded together (was a toast + a separate
  // returns modal). Story beats still play after as their own scenes.
  function showDawnDigest(r) {
    const g = S.get();
    const l = g.dayLedger || { delta: 0 };
    const rent = S.RENT + (g.endless ? 6 * g.endless.wave : 0);
    const rentDays = ((8 - (g.day % 7)) % 7) || 7;
    const short = g.gold < rent;
    const ledger = `<div class="dawnledger">
      <span class="${l.delta >= 0 ? 'good' : 'bad'}"><b>${l.delta >= 0 ? '+' : ''}${l.delta}g</b> overnight</span>
      <span>· purse <b>${g.gold}g</b></span>
      <span class="${short ? 'bad' : ''}">· upkeep ${rent}g in ${rentDays}d${short ? ' — short!' : ''}</span>
    </div>`;
    const events = (r.events || []).length
      ? `<div class="dawnevents">${r.events.map((e) => `<div class="dawnline">${esc(e)}</div>`).join('')}</div>` : '';
    const season = GH.seasons && GH.seasons.of(g);
    showModal(`<div class="sheet-head"><h2>☀ Dawn — Day ${g.day}${season ? ` <small class="seasontag">${season.glyph} ${esc(season.name)}</small>` : ''}</h2></div>
      ${ledger}
      ${(r.returns && r.returns.length) ? `<div class="returns">${returnBlocks(r.returns)}</div>` : ''}
      ${events}
      <div class="dispatch-foot"><span></span><button class="primary" data-action="result-done">Begin the day ▸</button></div>`);
    U.panel = 'result';
  }

  function returnBlocks(returns) {
    return returns.map((res) => {
      const banner = { triumph: '★ TRIUMPH', success: '✔ SUCCESS', partial: '◑ PARTIAL', failure: '✘ FAILURE' }[res.outcome];
      const econ = res.outcome === 'failure' ? 'No payment.' : `Your cut <b>${res.yourCut}g</b>, +${res.repGain} rep`;
      const loot = (res.loot && (Object.keys(res.loot.mats).length || res.loot.gear.length)) ? ` · ${lootIcons(res.loot)}` : '';
      const boss = res.bossCleared ? `<div class="level">⚔ ${esc(res.bossCleared)} cleared!${res.unlocked ? ` <b>${esc(res.unlocked)}</b> open.` : ''}</div>` : '';
      const lvl = res.levelUps && res.levelUps.length ? `<div class="level">${res.levelUps.map(esc).join(' · ')}</div>` : '';
      const deaths = res.deaths && res.deaths.length
        ? `<div class="deathnote">☠ ${res.deaths.map(esc).join(', ')} ${res.deaths.length > 1 ? 'fell' : 'fell'} on this mission. The hall mourns.</div>` : '';
      const bonusLine = res.bonusNote ? `<div class="level">${esc(res.bonusNote)}</div>` : '';
      const teamLine = res.teamName ? `<small class="teamline">⚑ ${esc(res.teamName)}${res.teamBonus ? ` · synergy +${res.teamBonus}` : ''}</small>` : `<small>${esc(res.party.join(', '))}</small>`;
      return `<div class="returncard ${res.outcome}">
        <div class="spread"><b class="banner ${res.outcome}">${banner}</b>${teamLine}</div>
        <div class="ctitle">${esc(res.title)}</div>
        <div class="cclient">${econ}${loot}</div>${deaths}${bonusLine}${boss}${lvl}</div>`;
    }).join('');
  }

  function showResult(res) {
    const rows = res.rolls.map((r) => {
      // expression thumb: the violence and the cost, on their faces
      let face = '';
      const adv = r.advId ? S.findAdv(r.advId) : null;
      if (adv && GH.portraits.srcFor) {
        const expr = (r.died || r.injured) ? 'hurt' : (r.degree >= 2 ? 'fury' : (r.degree >= 1 ? null : null));
        const src = GH.portraits.srcFor(adv, expr);
        if (src) face = `<img class="rollface" src="${src}" alt="">`;
      }
      return `<div class="rollrow deg${r.degree}">
      ${face}<b>${esc(r.name.split(' ')[0])}</b> — ${r.skill}: d20 <b>${r.roll}</b> ${sgn(r.mod)}${r.bond ? ` ${sgn(r.bond)} bond` : ''} = <b>${r.total}</b> vs DC ${r.dc}
      → <span class="deglabel">${r.label}</span>${r.died ? ' <span class="warn">☠ fell!</span>' : r.injured ? ' <span class="warn">injured!</span>' : ''}</div>`;
    }).join('');
    const banner = { triumph: '★ TRIUMPH', success: '✔ SUCCESS', partial: '◑ PARTIAL', failure: '✘ FAILURE' }[res.outcome];
    const econ = res.outcome === 'failure'
      ? `<p>No payment. Reputation dips.</p>`
      : `<p>Client paid <b>${res.earned}g</b>. Party took <b>${res.partyPay}g</b>. <b>Your cut: ${res.yourCut}g</b>. +${res.repGain} reputation.</p>`;
    const lootHtml = (res.loot && (Object.keys(res.loot.mats).length || res.loot.gear.length))
      ? `<div class="loot"><b>Recovered:</b> ${lootIcons(res.loot)}</div>` : '';
    const bossHtml = res.bossCleared
      ? `<p class="level">⚔ ${esc(res.bossCleared)} cleared!${res.unlocked ? ` <b>${esc(res.unlocked)}</b> is now open.` : ''}</p>` : '';
    showModal(`<div class="sheet-head"><h2 class="banner ${res.outcome}">${banner}</h2></div>
      <div class="rolls">${rows}</div>
      ${econ}
      ${lootHtml}
      ${bossHtml}
      ${res.levelUps.length ? `<p class="level">${res.levelUps.map(esc).join('<br>')}</p>` : ''}
      <div class="dispatch-foot"><span></span><button class="primary" data-action="result-done">Continue</button></div>`);
    U.panel = 'result';
  }

  // ====================================================================
  //  MAP — territory, outbreaks, dispatch view
  // ====================================================================
  function openMap(keep) {
    U.panel = 'map';
    const g = S.get();
    const terr = GH.story.territory(g);

    const nodes = D.ZONES.map((z) => {
      const st = GH.story.regionStatus(g, z);
      const ob = (g.outbreaks || []).find((o) => o.zoneId === z.id);
      const cls = st === 'controlled' ? 'held' : st === 'active' ? 'contested' : 'locked';
      const marker = ob ? uiIcon('mark_outbreak', 28)
        : st === 'controlled' ? uiIcon('hub_realm', 28)
        : st === 'active' ? uiIcon('fac_warroom', 28)
        : uiIcon('mark_locked', 28);
      return `<div class="mapnode ${cls} ${ob ? 'outbreak' : ''}" ${st !== 'locked' ? `data-action="map-zone" data-id="${z.id}"` : (S.zoneAllowed(z) ? '' : 'data-action="charter-offer"')}>
        <span class="nodedot">${marker}</span>
        <span class="nodename">${esc(z.name)}</span>
        ${tierPips(z.tier)}
        <span class="nodesub">${ob ? `⚠ OUTBREAK · ${ob.status === 'engaged' ? 'team engaged' : ob.daysLeft + 'd left'}`
          : (GH.rival && GH.rival.contested(g, z.id)) ? '⚔ Vane holds sway'
          : (st === 'controlled' ? 'under your banner' : st === 'active' ? 'tier ' + z.tier : (S.zoneAllowed(z) ? 'rep ' + z.reqRep : '🔒 charter'))}</span>
      </div>`;
    }).join('<div class="maplink"></div>');

    const obs = (g.outbreaks || []).map((ob) => outbreakCard(g, ob)).join('')
      || '<p class="muted">No active outbreaks. The realm holds its breath.</p>';

    const exps = S.expeditions();
    const transit = exps.length ? `<h3>In the field</h3>${exps.map((e) => {
      const names = e.partyIds.map((id) => { const a = S.findAdv(id); return a ? esc(a.name.split(' ')[0]) : '?'; }).join(', ');
      const t = e.teamId ? GH.teams.byId(g, e.teamId) : null;
      return `<div class="exprow">${t ? `<span class="teamdot" style="--tc:${t.color}"></span><b>${esc(t.name)}</b>` : ''}<span class="grow">${esc(e.job.title)} <small>— ${names}</small></span><span class="daysleft">${e.daysLeft}d</span></div>`;
    }).join('')}` : '';

    showModal(`<div class="sheet-head"><h2>The Map</h2><button class="x" data-action="close">✕</button></div>
      <p class="muted">Territory: <b>${terr.controlled}/${terr.total}</b> regions fly your banner.</p>
      <div class="worldmap${(g.outbreaks || []).length ? ' breach' : ''}">${nodes}</div>
      <h3>⚠ Dungeon Outbreaks</h3>
      <p class="muted">Outbreaks are timed — send a full team before the count runs out or the region pays for it.</p>
      ${obs}
      ${transit}`);
  }

  function outbreakCard(g, ob) {
    const engaged = ob.status === 'engaged';
    const teams = (g.teams || []);
    const teamRows = teams.length ? teams.map((t) => {
      const r = GH.teams.readiness(g, t);
      const bonus = GH.teams.synergyBonus(t);
      return `<div class="teampick ${r.allReady ? '' : 'disabled'}">
        ${teamStrip(g, t, 30)}
        <span class="grow"><b>${esc(t.name)}</b> <small>${r.ready}/${r.total} ready${bonus ? ` · synergy +${bonus}` : ''}</small></span>
        <button class="primary small" data-action="send-team" data-ob="${ob.id}" data-team="${t.id}" ${r.allReady && !engaged && (!ob.isGate || bonus >= 2) ? '' : 'disabled'}>${ob.isGate && bonus < 2 ? 'not drilled' : 'Send ▸'}</button>
      </div>`;
    }).join('') : '<p class="muted">No teams formed yet — build one in the Teams tab.</p>';
    return `<div class="contract boss ob-${ob.zoneId} ${ob.isGate ? 'gatecard' : ''}">
      <div class="cmeta"><span class="bosstag">${ob.isGate ? '⛧' : '⚠'} ${engaged ? 'ENGAGED' : ob.daysLeft + ' DAY' + (ob.daysLeft > 1 ? 'S' : '') + ' LEFT'}</span>
        <span class="ctag">${ob.tag}</span><span class="cdc">DC ${ob.dc} · ${D.SKILL_LABEL[ob.skill]}</span></div>
      ${ob.isGate ? '<div class="gatereq">⛧ A rift gate holds only against a DRILLED team — full roster, synergy +2.</div>' : ''}
      <div class="ctitle">${uiIcon('mark_outbreak', 22)} ${esc(ob.title)}</div>
      <div class="cclient">reward <b>${ob.bounty}g</b> · ${ob.stages} stages · overnight assault</div>
      ${engaged ? '<p class="muted">A team is on it — results at dawn.</p>' : `<div class="teampicks">${teamRows}</div>`}
    </div>`;
  }

  // ====================================================================
  //  TEAMS — build, history, memorial
  // ====================================================================
  function teamStrip(g, team, px) {
    const ms = GH.teams.members(g, team);
    return `<span class="teamstrip">${ms.map((a) => GH.portraits.img(a, px || 34)).join('')}</span>`;
  }

  function openTeams(keep) {
    U.panel = 'teams';
    const g = S.get();
    if (U.teamView) { const t = GH.teams.byId(g, U.teamView); if (t) return teamDetail(g, t); U.teamView = null; }
    if (U.teamDraft) return teamCreate(g);

    const cards = (g.teams || []).map((t) => {
      const r = GH.teams.readiness(g, t);
      const bonus = GH.teams.synergyBonus(t);
      return `<div class="card teamcard" data-action="team-view" data-id="${t.id}" style="--tc:${t.color}">
        <div class="spread"><b class="teamname">${esc(t.name)}</b>
          <small>${t.wins}W–${t.losses}L${bonus ? ` · synergy +${bonus}` : ''}</small></div>
        ${teamStrip(g, t, 44)}
        <div class="meta">“${esc(t.motto)}” · ${r.ready}/${r.total} ready${t.fallen.length ? ` · ☠ ${t.fallen.length} fallen` : ''}</div>
      </div>`;
    }).join('') || '<p class="muted">No teams yet. Bind your people into squads — they fight better together, and they remember.</p>';

    const unteamed = g.roster.filter((a) => !GH.teams.teamOf(g, a.id)).length;
    const legacyWall = (g.legacyFallen || []).length ? `<h3>Honored of Past Charters</h3><div class="memorial legacy">${g.legacyFallen.slice(-8).map((f) =>
      `<div class="fallenrow">${uiIcon('mark_skull', 16)} <b>${esc(f.name)}</b> <small>${esc(f.class)} — charter past, "${esc(f.mission)}"</small></div>`).join('')}</div>` : '';
    const memorial = (g.fallen || []).length ? `<h3>The Memorial Wall</h3><div class="memorial">${g.fallen.map((f) =>
      `<div class="fallenrow">${uiIcon('mark_skull', 18)} <b>${esc(f.name)}</b> <small>${esc(f.ancestry)} ${esc(f.class)} Lv${f.level} — fell on day ${f.day}, “${esc(f.mission)}”</small></div>`).join('')}</div>` : '';

    const everyone = g.roster.map((a) => {
      const t = GH.teams.teamOf(g, a.id);
      return `<div class="pickrow" data-action="open-adv" data-id="${a.id}" style="cursor:pointer">
        ${GH.portraits.img(a, 40)}
        <span class="grow"><b>${esc(a.name)}</b>${t ? ` <span class="teamdot" style="--tc:${t.color}"></span>` : ''}${a._talkedToday ? ' <span class="talkedchip" title="Talked today">💬</span>' : ''}
          <small>${esc(a.classAdv || a.class)} Lv${a.level}</small> ${planTag(a)}</span>
        ${miniNeeds(a)}</div>`;
    }).join('');
    // Hiring lived inside the tavern panel and was effectively undiscoverable
    // ("hard to know if you are hiring"). It belongs at the top of the roster,
    // saying its price and why it is unavailable when it is.
    const full = g.roster.length >= S.bedsCount();
    const canHire = !full && g.gold >= S.RECRUIT_COST;
    const hireNote = full ? `All ${S.bedsCount()} beds are full — upgrade the Dormitory`
      : g.gold < S.RECRUIT_COST ? `You need ${S.RECRUIT_COST}g`
      : `${S.bedsCount() - g.roster.length} bed${S.bedsCount() - g.roster.length > 1 ? 's' : ''} free`;
    showModal(`<div class="sheet-head"><h2>Your People</h2><button class="x" data-action="close">✕</button></div>
      <div class="hirerow">
        <button class="primary" data-action="recruit" ${canHire ? '' : 'disabled'}>
          ＋ Hire an adventurer — ${S.RECRUIT_COST}g</button>
        <small class="muted">${esc(hireNote)}</small>
      </div>
      <div class="spread"><h3>Everyone <small class="muted">(${g.roster.length})</small></h3>
        <button class="small" data-action="auto-assign-all" title="Hand every unassigned half-day back to Auto">✦ Auto-assign all</button></div>
      ${everyone}
      <h3>Teams</h3>
      <div class="row" style="margin-bottom:10px">
        <button class="primary" data-action="team-new" ${unteamed >= 2 ? '' : 'disabled'}>+ Form a Team</button>
        <button data-action="team-selfform" ${unteamed >= 2 ? '' : 'disabled'}>Let them choose ✦</button>
      </div>
      ${cards}
      ${memorial}
      ${legacyWall}`);
  }

  function teamCreate(g) {
    const draft = U.teamDraft;
    const picks = g.roster.filter((a) => !GH.teams.teamOf(g, a.id)).map((a) => {
      const sel = draft.members.has(a.id);
      return `<div class="pickrow ${sel ? 'sel' : ''}" data-action="team-pick" data-id="${a.id}">
        ${GH.portraits.img(a, 40)}
        <span class="grow"><b>${esc(a.name.split(' ')[0])}</b> <small>${a.ancestry} ${a.class} · Lv${a.level}</small></span>
        <span class="modpill ${sel ? 'good' : ''}">${sel ? '✓ in' : 'tap'}</span>
      </div>`;
    }).join('');
    showModal(`<div class="sheet-head"><h2>Raise a Banner</h2><button class="x" data-action="team-cancel">✕</button></div>
      <label class="field"><span>Team name</span><input type="text" id="teamname" value="${esc(draft.name)}"></label>
      <p class="muted">Pick 2–4 members. Friends fight better; rivals drag a team down.</p>
      ${picks}
      <div class="dispatch-foot"><span class="muted">${draft.members.size}/4 picked</span>
        <button class="primary" data-action="team-found" ${draft.members.size >= 2 ? '' : 'disabled'}>Found Team ⚑</button></div>`);
  }

  function teamDetail(g, t) {
    const ms = GH.teams.members(g, t);
    const bonus = GH.teams.synergyBonus(t);
    const memberRows = ms.map((a) => `<div class="pickrow" data-action="open-adv" data-id="${a.id}">
      ${GH.portraits.img(a, 44)}
      <span class="grow"><b>${esc(a.name)}</b> <small>${a.class} Lv${a.level} · ${a.status}</small></span>
      ${miniNeeds(a)}</div>`).join('');
    const fallen = t.fallen.length ? `<h3>☠ The Fallen</h3>${t.fallen.map((f) =>
      `<div class="fallenrow">${uiIcon('mark_skull', 18)} <b>${esc(f.name)}</b> <small>${esc(f.class)} — day ${f.day}, “${esc(f.mission)}”</small></div>`).join('')}` : '';
    const hist = t.history.slice(0, 10).map((h) => `<div class="logentry">${esc(h.text)}<small>Day ${h.day}</small></div>`).join('');
    showModal(`<div class="sheet-head"><h2 style="--tc:${t.color}"><span class="teamdot" style="--tc:${t.color}"></span>${esc(t.name)}</h2>
        <button class="x" data-action="team-back">✕</button></div>
      <p class="muted">“${esc(t.motto)}” · founded day ${t.founded} · ${t.missions} missions, ${t.wins}W–${t.losses}L
        ${bonus ? ` · fights as one: <b>+${bonus}</b> to all rolls` : ' · synergy still forming'}</p>
      ${teamStrip(g, t, 56)}
      <h3>Members</h3>${memberRows}
      ${fallen}
      <h3>Banner History</h3><div class="logwrap">${hist}</div>
      <div class="dispatch-foot"><button class="danger small" data-action="team-disband" data-id="${t.id}">Disband</button><span></span></div>`);
  }

  // ---- Armory: the guild's steel, and who carries it ----------------------
  function openArmory(keep) {
    U.panel = 'armory';
    const g = S.get();
    const inv = g.inventory;
    const stash = Object.entries(inv.gear || {}).filter(([, n]) => n > 0);
    const stashHtml = stash.length ? stash.map(([gid, n]) => {
      const go = GH.items.gear(gid);
      return `<span class="lootitem gearloot" title="${esc(gearBonusText(go))}">${icon(go.icon, 26)} ${esc(go.name)} ×${n}</span>`;
    }).join('') : '<span class="muted">Nothing in the stash — forge gear at the Smithy or loot it in the field.</span>';
    const mats = D.MATERIALS.map((m) => `<span class="invmat" title="${esc(m.name)}">${icon(m.icon, 26)}<span class="mc">${GH.items.matCount(inv, m.id)}</span></span>`).join('');

    const rows = g.roster.map((a) => `<div class="armory-row">
      <div class="spread" style="align-items:center">
        ${GH.portraits.img(a, 44)}
        <span class="grow" style="margin-left:8px"><b>${esc(a.name)}</b>
          <small>${esc(a.classAdv || a.class)} Lv${a.level} · ${a.status}</small></span>
        <span class="modpill">${GH.items.gearPower(a) ? 'gear +' + GH.items.gearPower(a) : 'unarmed'}</span>
      </div>
      ${gearSlots(a)}
    </div>`).join('');

    const junk = S.junkPreview ? S.junkPreview() : { count: 0, gold: 0 };
    showModal(`<div class="sheet-head"><h2>The Armory</h2><button class="x" data-action="close">✕</button></div>
      <div class="row" style="margin-bottom:8px">
        <button class="small" data-action="auto-equip" ${stash.length ? '' : 'disabled'} title="Give every piece in the stash to whoever it serves best">✦ Best fit</button>
        <button class="small" data-action="sell-junk" ${junk.count ? '' : 'disabled'} title="Sell stash gear that upgrades nobody and trails the roster's kit">${junk.count ? `Sell junk ×${junk.count} · +${junk.gold}g` : 'No junk to sell'}</button>
      </div>
      <div class="invbar"><span class="invlabel">Stash</span>${stashHtml}</div>
      <div class="invbar"><span class="invlabel">Materials</span>${mats}
        <button class="small" data-action="nav-room" data-id="smithy" style="margin-left:auto">${uiIcon('fac_smithy', 18)} Smithy</button></div>
      ${rows}`, { keepScroll: keep });
  }

  // ---- Portrait Styles: cosmetic packs (first paid add-on) ----------------
  function openStyles(keep) {
    U.panel = 'styles';
    const active = GH.shop.activePack();
    const cards = GH.shop.PACKS.map((p) => {
      const owned = GH.shop.owned(p.id);
      const isActive = active === p.id;
      const strip = p.samples.map((f) => `<img class="stylesample" src="assets/portraits/${f}">`).join('');
      const action = isActive ? '<span class="modpill good">✓ In use</span>'
        : owned ? `<button class="primary small" data-action="style-use" data-id="${p.id}">Use this style</button>`
        : `<button class="primary small" data-action="style-buy" data-id="${p.id}">Unlock · ${p.price}</button>`;
      return `<div class="card stylecard ${isActive ? 'sel' : ''}">
        <div class="spread"><b>${esc(p.name)}</b>${p.price && !owned ? `<span class="ctag bonus">${p.price}</span>` : ''}</div>
        <div class="stylestrip">${strip}</div>
        <p class="muted" style="margin:.4em 0">${esc(p.desc)}</p>
        <div class="crow">${action}</div>
      </div>`;
    }).join('');
    // Hall themes — whole-UI reskins behind the Wardrobe bundle.
    const themeActive = GH.shop.activeTheme();
    const wardrobeOwned = GH.shop.owned('wardrobe');
    const themeCards = GH.shop.THEMES.map((t) => {
      const un = GH.shop.themeOwned(t.id);
      const isOn = themeActive === t.id;
      const act = isOn ? '<span class="modpill good">✓ In use</span>'
        : un ? `<button class="primary small" data-action="theme-use" data-id="${t.id}">Wear it</button>`
        : `<span class="modpill">🔒 Wardrobe</span>`;
      return `<div class="card stylecard ${isOn ? 'sel' : ''}">
        <div class="spread"><b>${esc(t.name)}</b>${act}</div>
        <p class="muted" style="margin:.3em 0 0">${esc(t.desc)}</p>
      </div>`;
    }).join('');
    const w = GH.shop.WARDROBE;
    const wardrobeCta = wardrobeOwned ? '' : `<div class="crow" style="margin:6px 0 2px">
      <button class="primary small" data-action="style-buy" data-id="wardrobe">Unlock the Guild Wardrobe · ${w.price}</button></div>
      <p class="muted" style="font-size:.8rem">${esc(w.desc)}</p>`;
    showModal(`<div class="sheet-head"><h2>Portrait Styles</h2><button class="x" data-action="close">✕</button></div>
      <p class="muted">How your roster is drawn. Styles apply everywhere — sheets, teams, the field.</p>
      ${cards}
      <h3>Hall Themes</h3>
      <p class="muted">How the hall itself is dressed — panels, buttons, parchment and all.</p>
      ${themeCards}
      ${wardrobeCta}
      <div class="crow" style="justify-content:space-between;align-items:center">
        <p class="muted" style="font-size:.8rem;margin:0">Purchases are account-wide and survive new campaigns.</p>
        <button class="ghost small" data-action="restore-purchases">Restore Purchases</button>
      </div>`);
  }

  // ---- The Guild Charter: full-campaign unlock ----------------------------
  // The hosted browser demo cannot take money: there is no billing adapter outside Capacitor, and
  // the free-grant dev stub is confined to localhost so a visitor cannot unlock paid content by
  // clicking Buy. Every purchase entry point lands here instead.
  // Deliberately NO store button: The Guild's Play production track is empty, so a "Get it on
  // Google Play" link would 404 for every person who tapped it. Add one here when it ships.
  function openDemoUpsell(itemName) {
    U.panel = 'demo-upsell';
    showCine(`<div class="sheet-head"><h2>Part of the full game</h2><button class="x" data-action="close">✕</button></div>
      <p>${esc(itemName)} unlocks in the full version of <b>The Guild: Emberfall</b>. You are playing
      the free browser demo — your hall is saved in this browser, on this device.</p>
      <p class="muted">The demo runs the opening regions in full. The complete campaign is coming to
      Android, and one purchase there unlocks everything.</p>
      <div class="crow" style="justify-content:space-between;align-items:center">
        <button class="primary" data-action="close">Keep playing the demo</button>
        <a class="muted small" href="https://lmfd104.github.io/" target="_blank" rel="noopener">Follow the app →</a>
      </div>`);
  }
  function openCharterOffer() {
    U.panel = 'charter';
    const c = GH.shop.CHARTER;
    showCine(`<div class="sheet-head"><h2>The Guild Charter</h2><button class="x" data-action="close">✕</button></div>
      <div class="zonebanner zb-karst"><span class="zb-label">The full campaign awaits</span></div>
      <p>${esc(c.desc)}</p>
      <p class="muted">Included free forever: the Greenfields and Ashwood arcs, teams, outbreaks, promotions, and the living hall.</p>
      <div class="crow" style="justify-content:space-between;align-items:center">
        <button class="primary" data-action="charter-buy">Unlock the full campaign · ${esc(c.price)}</button>
        <button class="ghost small" data-action="restore-purchases">Restore Purchases</button>
      </div>`);
  }

  // Audio has had working volume controls since it was written — setMusicVol,
  // setSfxVol, persistence, the lot — and no way for a player to reach any of
  // them except one mute button. Loud or silent were the only two options.
  function openAudio(fromTitle) {
    U.panel = 'audio';
    U.audioFromTitle = !!fromTitle;
    const c = GH.audio.config();
    const row = (id, label, hint, val) => `
      <div class="volrow">
        <label for="vol-${id}"><b>${label}</b><small>${esc(hint)}</small></label>
        <div class="volline">
          <input id="vol-${id}" type="range" min="0" max="100" step="5"
            value="${Math.round(val * 100)}" data-action="vol-set" data-vol="${id}">
          <span class="volpct" data-volpct="${id}">${Math.round(val * 100)}%</span>
        </div>
      </div>`;
    showModal(`<div class="sheet-head"><h2>Audio</h2>
        <button class="x" data-action="${fromTitle ? 'title' : 'open-guildhub'}">✕</button></div>
      ${row('music', 'Music', "The hall's own score. It plays throughout.", c.music)}
      ${row('sfx', 'Sound', 'Dice, doors, hammers and horns.', c.sfx)}
      <div class="crow"><button class="small ${c.muted ? 'primary' : 'ghost'}" data-action="vol-mute">
        ${c.muted ? '🔇 Muted — tap to unmute' : '🔊 Mute everything'}</button></div>`);
  }

  // A wing you raised is a place you walk into, not a line in a list.
  function openWing(id) {
    const g = S.get(); if (!g) return;
    const fac = D.FACILITIES[id], plot = D.WING_PLOTS[id], act = D.WING_ACTIONS[id];
    if (!fac || !plot || !act) return;
    const lvl = S.facLevel(id);
    if (lvl <= 0) { openGuildHub(); return; }          // not raised yet: the hub builds it
    U.panel = 'wing'; U.wingId = id;
    const used = S.wingUsedToday(id);
    const canUp = lvl < fac.max;
    const home = g.roster.filter((a) => a.status !== 'away' && a.status !== 'hunting');
    showModal(`<div class="sheet-head"><h2>${fac.icon || ''} ${esc(fac.name)}</h2>
        <button class="x" data-action="close">✕</button></div>
      <p class="flavor">${esc(plot.blurb)}</p>
      <p class="muted">Level ${lvl}/${fac.max} · ${esc(fac.effect(lvl))}</p>
      <div class="roomcard">
        <h3>${act.icon} ${esc(act.name)}</h3>
        <p>${esc(act.blurb)} · <b>${act.cost}g</b></p>
        <button class="primary" data-action="wing-use" data-id="${id}" ${used ? 'disabled' : ''}>
          ${used ? 'Already done today' : `${act.icon} ${esc(act.name)}`}</button>
        <p class="muted" style="margin:6px 0 0">${home.length} at the hall to feel it.</p>
      </div>
      ${canUp ? `<div class="roomcard"><h3>Improve the ${esc(fac.name)}</h3>
        <p class="muted">${esc(fac.effect(lvl + 1))}</p>
        <button class="small" data-action="upgrade" data-id="${id}">↑ Upgrade ${S.upgradeCost(id)}g</button></div>`
        : '<p class="muted">Improved as far as it goes.</p>'}`);
  }

  function openDifficulty() {
    U.panel = 'difficulty';
    const cur = S.difficultyId();
    showModal(`<div class="sheet-head"><h2>Difficulty</h2>
        <button class="x" data-action="open-guildhub">✕</button></div>
      <p class="muted">Change it whenever you like — this is a hall to run, not a score to defend.
        Open contracts are re-posted at the new terms; anything already dispatched plays out as agreed.</p>
      ${difficultyPicker(cur, 'diff-set')}`);
  }

  function terrOf(g) { return GH.story ? GH.story.territory(g).controlled : 0; }

  // --- Guild hub (facilities under one tab) --------------------------------
  function openGuildHub(keep) {
    U.panel = 'guildhub';
    const g = S.get();
    const items = [
      { a: 'nav-room', id: 'kitchen', l: `${uiIcon('fac_kitchen', 24)} Kitchen`, s: `feed the hall · Lv${S.facLevel('kitchen')}` },
      { a: 'nav-room', id: 'smithy', l: `${uiIcon('fac_smithy', 24)} Smithy`, s: `forge gear · Lv${S.facLevel('smithy')}` },
      { a: 'nav-room', id: 'training', l: `${uiIcon('fac_training', 24)} Training Yard`, s: `drill skills · Lv${S.facLevel('training')}` },
      { a: 'nav-room', id: 'tavern', l: `${uiIcon('fac_tavern', 24)} Tavern`, s: 'recruit adventurers' },
      { a: 'open-realm', l: `${uiIcon('hub_realm', 24)} The Realm`, s: 'story, staff & territory' },
      { a: 'open-log', l: `${uiIcon('hub_chronicle', 24)} Chronicle`, s: 'everything that happened' },
      { a: 'nav-armory', l: `${uiIcon('nav_armory', 24)} Armory`, s: 'equip and gift gear' },
      { a: 'open-styles', l: `🎨 Portrait Styles`, s: 'change how your roster is drawn' },
    ];
    if (g.mode === 'sandbox') items.push({ a: 'open-tools', l: '🛠 Sandbox Tools', s: 'bend reality' });
    if (g.mode === 'challenge') items.push({ a: 'open-challenge-status', l: '🏁 Challenge Goal', s: 'the clock is ticking' });
    const dif = D.DIFFICULTIES[S.difficultyId()];
    items.push({ a: 'open-difficulty', l: `${dif.icon} Difficulty`, s: `${dif.name} — change any time` });
    const ac = GH.audio.config();
    items.push({ a: 'open-audio', l: '🔊 Audio', s: ac.muted ? 'muted' : `music ${Math.round(ac.music * 100)}% · sound ${Math.round(ac.sfx * 100)}%` });
    items.push({ a: 'save-export', l: '📤 Export Save', s: 'copy your guild as text (backup)' });
    items.push({ a: 'save-import', l: '📥 Import Save', s: 'paste a backup to restore' });
    items.push({ a: 'menu', l: '↩ Return to Title', s: 'your guild is saved' });

    // Who is actually in each room right now — the hall's own activity rules.
    const home = g.roster.filter((a) => a.status !== 'away' && a.status !== 'hunting');
    const busy = { kitchen: [], dorm: [], yard: [], tavern: [], forge: [] };
    if (GH.hall && GH.hall.activityFor) {
      home.forEach((a) => { const p = GH.hall.activityFor(a, 'am').pool; if (busy[p]) busy[p].push(a.name.split(' ')[0]); });
    }
    const POOL = { kitchen: 'kitchen', smithy: 'forge', training: 'yard', tavern: 'tavern', dormitory: 'dorm' };
    // Rooms you can walk into have their own screen; the buildable wings do
    // not exist yet, so tapping an empty plot raises it.
    const VISITABLE = { tavern: 1, kitchen: 1, training: 1, smithy: 1 };

    const roomTile = (id, label, blurb) => {
      const fac = D.FACILITIES[id];
      const lvl = fac ? S.facLevel(id) : 1;
      const unbuilt = !!fac && lvl === 0;
      const maxed = fac ? lvl >= fac.max : true;
      const cost = fac ? S.upgradeCost(id) : 0;
      const inRoom = POOL[id] ? busy[POOL[id]] : null;
      const affordable = fac && !maxed && g.gold >= cost;
      const name = label || (fac ? fac.name : id);
      const action = unbuilt ? 'upgrade' : (VISITABLE[id] ? 'nav-room' : 'open-guildhub-build');
      return `<button class="roomtile ${unbuilt ? 'unbuilt' : ''}" data-action="${action}" data-id="${id}"${unbuilt && !affordable ? ' disabled' : ''}>
        <span class="rt-ic">${uiIcon('fac_' + id, 26)}</span>
        <span class="rt-name">${esc(name)}</span>
        <span class="rt-lvl">${!fac ? '' : unbuilt ? '<i class="warn">empty plot</i>' : 'Lv ' + lvl}</span>
        <span class="rt-eff">${fac ? esc(fac.effect(Math.max(1, lvl))) : esc(blurb || '')}</span>
        ${inRoom && inRoom.length ? `<span class="rt-who">${esc(inRoom.slice(0, 3).join(', '))}${inRoom.length > 3 ? ' +' + (inRoom.length - 3) : ''}</span>`
          : unbuilt ? '' : '<span class="rt-who empty">empty</span>'}
        ${!fac ? ''
          : maxed ? '<span class="rt-up maxed">max</span>'
          : affordable ? `<span class="rt-up">${unbuilt ? '＋ raise' : '⬆ upgrade'} ${cost}g</span>`
          : fac ? `<span class="rt-up cant">${unbuilt ? 'build' : 'upgrade'} ${cost}g</span>` : ''}
      </button>`;
    };

    // Core rooms first, then the wings you can add — an unraised wing is a
    // visible empty plot rather than a line hidden in a list further down.
    const CORE = ['tavern', 'kitchen', 'training', 'smithy', 'dormitory'];
    const WINGS = Object.keys(D.FACILITIES).filter((id) => D.FACILITIES[id].buildable);
    const rooms = CORE.map((id) => id === 'tavern' ? roomTile('tavern', 'Tavern', 'recruit and unwind') : roomTile(id)).join('');
    const wings = WINGS.map((id) => roomTile(id)).join('');
    const raised = WINGS.filter((id) => S.facLevel(id) > 0).length;

    const util = items.filter((it) => it.a !== 'nav-room');

    showModal(`<div class="sheet-head"><h2>${esc(g.guildName)}</h2><button class="x" data-action="close">✕</button></div>
      <div class="guildstat">
        <span><b>${g.gold}</b><small>gold</small></span>
        <span><b>${g.reputation}</b><small>rep</small></span>
        <span><b>${home.length}/${S.bedsCount()}</b><small>beds</small></span>
        <span><b>${terrOf(g)}/5</b><small>held</small></span>
        <span><b>${g.day}</b><small>day</small></span>
        <span class="${(g.light || 0) <= 30 ? 'lowlight' : ''}"><b>${Math.round(g.light || 0)}%</b><small>light</small></span>
      </div>
      <div class="lightbar ${(g.light || 0) <= 30 ? 'low' : ''}">
        <div class="lightfill" style="width:${Math.max(0, Math.min(100, g.light || 0))}%"></div>
        <span class="lightlbl">${(g.light || 0) <= 15 ? 'The lamps are guttering — the hall works in half-dark'
          : (g.light || 0) <= 30 ? 'The ember-lamps are dimming'
          : 'The hall is lit'} · ${GH.items.matCount(g.inventory, 'emberglass')} undimmed shard${GH.items.matCount(g.inventory, 'emberglass') === 1 ? '' : 's'}</span>
      </div>
      <button class="small" data-action="burn-glass" ${GH.items.matCount(g.inventory, 'emberglass') < 1 || (g.light || 0) >= 100 ? 'disabled' : ''}>✦ Set a shard in the lamps</button>
      <h3>🏗 The Hall</h3>
      <div class="roomgrid">${rooms}</div>
      <h3>Wings — ${raised}/${WINGS.length} raised</h3>
      <p class="muted">Empty plots are yours to build on. Each wing unlocks promotions or a nightly comfort, and your people use it on their own.</p>
      <div class="roomgrid">${wings}</div>
      <h3>Ledger & Records</h3>
      <div class="morelist">${util.map((it) => `<button class="morebtn" data-action="${it.a}"${it.id ? ` data-id="${it.id}"` : ''}>${it.l}<br><small class="muted">${it.s}</small></button>`).join('')}</div>
`);
  }

  // --- Mobile "More" menu ------------------------------------------------
  function openMore() {
    U.panel = 'more';
    const g = S.get();
    const items = [
      { a: 'nav', nav: 'tavern', l: '🍺 Tavern — Recruit' },
      { a: 'nav', nav: 'training', l: '🎯 Training Yard' },
      { a: 'open-log', l: '📜 Chronicle' },
      { a: 'open-realm', l: '🗺 The Realm' },
      { a: 'open-audio', l: '🔊 Audio' },
    ];
    if (g.mode === 'sandbox') items.push({ a: 'open-tools', l: '🛠 Sandbox Tools' });
    if (g.mode === 'challenge') items.push({ a: 'open-challenge-status', l: '🏁 Challenge Goal' });
    if (GH.shop) items.push({ a: 'open-styles', l: '🎨 Portrait Styles' });
    items.push({ a: 'save-export', l: '💾 Export Save — copy a backup' });
    items.push({ a: 'save-import', l: '📥 Import Save — paste a backup' });
    items.push({ a: 'open-credits', l: '📖 Credits' });
    items.push({ a: 'menu', l: '↩ Return to Title' });
    showModal(`<div class="sheet-head"><h2>Menu</h2><button class="x" data-action="close">✕</button></div>
      <div class="morelist">${items.map((it) => `<button class="morebtn" data-action="${it.a}"${it.nav ? ` data-nav="${it.nav}"` : ''}>${it.l}</button>`).join('')}</div>`);
  }

  // --- Credits: the artists who built the look ---------------------------
  function openCredits() {
    U.panel = 'credits';
    titleEl.style.display = 'none';
    const back = S.get() ? '' : '<button class="ghost small" data-action="back-title">← Back</button>';
    showModal(`<div class="sheet-head"><h2>Credits</h2>${back || '<button class="x" data-action="close">✕</button>'}</div>
      <h3>Art & UI</h3>
      <div class="creditlist">
        <p><b>Super Pixel Fantasy UI — Royal Crown</b><br><small class="muted">Will Tice / unTied Games — ornate frames & icon set</small></p>
        <p><b>Pixel UI Kit</b><br><small class="muted">panel, button & slot pieces (recolored with permission of the license)</small></p>
        <p><b>Pixel Crawler</b><br><small class="muted">Anokolisa — guild hall tileset & props</small></p>
        <p><b>Kibyra</b><br><small class="muted">facility & map icons</small></p>
        <p><b>NJ-PixelSmooth</b><br><small class="muted">nojoule.com — pixel typeface</small></p>
      </div>
      <h3>Portraits</h3>
      <p class="muted">Character & staff portraits generated in-house for The Guild.</p>
      <h3>A Miami Jambo game</h3>
      <p class="muted">Made with an unreasonable fondness for its adventurers.</p>
      <div class="dispatch-foot"><span></span>
        <button class="primary" data-action="${S.get() ? 'close' : 'back-title'}">Done</button></div>`);
  }

  // --- Challenge select + goal status ------------------------------------
  function openChallenges() {
    U.panel = 'challenges';
    titleEl.style.display = 'none';   // shown from the title screen
    const cards = GH.challenges.LIST.map((c) => `<div class="contract">
      <div class="cmeta"><span class="ctag">${esc(c.difficulty)}</span></div>
      <div class="ctitle">${esc(c.name)}</div>
      <div class="cclient">${esc(c.desc)}</div>
      <div class="cclient"><b>Goal:</b> ${esc(c.goalText)} · ${c.roster} adventurers · ${c.gold}g</div>
      <div class="crow"><button class="primary small" data-action="start-challenge" data-id="${c.id}">Start ▸</button></div>
    </div>`).join('');
    showModal(`<div class="sheet-head"><h2>Challenges</h2><button class="ghost small" data-action="back-title">← Back</button></div>
      <p class="muted">Constrained scenarios with a set goal and a clock. No story — just the run.</p>
      <div class="contracts">${cards}</div>`);
  }

  function openChallengeStatus() {
    const g = S.get();
    if (!g.challenge) return;
    showModal(`<div class="sheet-head"><h2>${esc(g.challenge.name)}</h2><button class="x" data-action="close">✕</button></div>
      <div class="objective">▶ ${esc(g.challenge.goalText)}</div>
      <p>Progress: <b>${esc(GH.challenges.progress(g))}</b></p>`);
    U.panel = 'chalstatus';
  }

  // --- Sandbox tools -----------------------------------------------------
  function openTools(keep) {
    U.panel = 'tools';
    showModal(`<div class="sheet-head"><h2>Sandbox Tools</h2><button class="x" data-action="close">✕</button></div>
      <p class="muted">Tinker freely — nothing can end a sandbox game.</p>
      <div class="toolgrid">
        <button data-action="sb" data-t="gold">+500 Gold</button>
        <button data-action="sb" data-t="mats">+5 Each Material</button>
        <button data-action="sb" data-t="recruit">Free Recruit</button>
        <button data-action="sb" data-t="unlock">Unlock All Regions</button>
        <button data-action="sb" data-t="needs">Restore Roster</button>
        <button data-action="sb" data-t="facilities">Max Facilities</button>
        <button data-action="sb" data-t="rep">+10 Reputation</button>
      </div>`);
  }

  const STAFF_ART = { patron: 'seraphine', loremaster: 'brann', quartermaster: 'maribel', rival: 'rook' };
  // Danger at a glance: five pips, filled to the zone's tier, colour-ramped
  // green→red. Lets the map communicate difficulty without a tooltip.
  function tierPips(tier) {
    const t = Math.max(1, Math.min(5, tier || 1));
    return `<span class="nodetier" data-tier="${t}">${'◆'.repeat(t)}${'◇'.repeat(5 - t)}</span>`;
  }

  function staffFace(key, npc, px, mood) {
    const f = STAFF_ART[key];
    if (!f) return `<span class="mono" style="--mc:${npc.color}">${npc.mono}</span>`;
    const base = `assets/portraits/staff_${f}.webp`;
    const src = mood ? `assets/portraits/staff_${f}_${mood}.webp` : base;
    return `<img class="staffart" src="${src}" data-base="${base}" style="width:${px}px;height:${px}px"
      onerror="if(this.src!==this.dataset.base){this.src=this.dataset.base;}else{this.outerHTML='<span class=\'mono\' style=\'--mc:${npc.color}\'>${npc.mono}</span>';}">`;
  }

  // --- Story dialogue + chain (returns → story beats → game over) --------
  function showStory() {
    const beat = (U.storyQueue || []).shift();
    if (!beat) { finishChain(); return; }
    const npc = GH.story.STAFF[beat.speaker];
    const rewards = beat.reward && beat.reward.length ? `<div class="storyreward">Received: ${beat.reward.map(esc).join(', ')}</div>` : '';
    const obj = beat.objective ? `<div class="objective">▶ ${esc(beat.objective)}</div>` : '';
    const stage = beat.scene
      ? `<div class="storyscene" style="background-image:url('${beat.scene}')">
          ${staffFace(beat.speaker, npc, 150, beat.mood)}
          <div class="vnname">${esc(npc.name)}<small>${esc(npc.role)}</small></div>
        </div>`
      : `<div class="storyhead">${staffFace(beat.speaker, npc, 72, beat.mood)}
          <div><b class="storyname">${esc(npc.name)}</b><br><small>${esc(npc.role)}</small></div></div>`;
    showCine(`${stage}
      <p class="storytext">${esc(beat.text)}</p>${rewards}${obj}
      <div class="dispatch-foot"><span></span><button class="primary" data-action="story-next">${(U.storyQueue || []).length ? 'Next ▸' : 'Continue'}</button></div>`);
    U.panel = 'story';
    renderTutorBar();
  }
  function advanceAfterReturns() { if ((U.storyQueue || []).length) showStory(); else finishChain(); }
  function finishChain() { if (U.pendingOver) { const o = U.pendingOver; U.pendingOver = null; gameOver(o); } else hideModal(); }

  // --- Region: a place you can look at, not a jump to the guild board ----
  function openRegion(id, keep) {
    const g = S.get();
    const z = D.ZONE_BY_ID[id] || D.ZONES.find((x) => x.id === id);
    if (!z) { hideModal(); return; }
    U.panel = 'region'; U.regionId = id;
    const st = GH.story.regionStatus(g, z);
    const ob = (g.outbreaks || []).find((o) => o.zoneId === z.id);
    const allowed = S.zoneAllowed(z);
    const jobs = (g.board || []).filter((j) => j.zoneId === z.id && j.status === 'open');
    const boss = g.bossDone && g.bossDone[z.id];
    const parties = S.expeditions().filter((e) => e.job && e.job.zoneId === z.id);
    const mats = (z.mats || []).map((m) => D.MAT_BY_ID[m] ? esc(D.MAT_BY_ID[m].name) : m).join(', ');
    const standing = boss ? '<span class="rg-ok">✔ Under your banner</span>'
      : st === 'active' ? '<span class="rg-on">Contested — open for contracts</span>'
      : allowed ? `<span class="rg-off">Locked — needs ${z.reqRep} reputation</span>`
      : '<span class="rg-off">🔒 Guild Charter</span>';
    const rp = GH.rival ? GH.rival.pressure(g, z.id) : 0;
    const rivalRow = (GH.rival && GH.rival.active(g) && rp > 0)
      ? [["Vane's company", GH.rival.contested(g, z.id)
          ? `<b class="warn">⚔ holds sway (${rp})</b> <small class="muted">— clients pay 10% less; work contracts here to push them out</small>`
          : `pressing (${rp}) <small class="muted">— every finished contract here pushes them back</small>`]]
      : [];
    const rows = [
      ['Tier', `${z.tier} ${tierPips(z.tier)}`],
      ['Boss', boss ? `${esc(z.boss)} <small class="muted">— defeated</small>` : esc(z.boss)],
      ['Materials', mats || '—'],
      ['Contracts', st === 'locked' ? '—' : `${jobs.length} on the board`],
      ['In the field', parties.length ? `${parties.length} of your parties` : 'nobody'],
    ].concat(rivalRow).map(([k, v]) => `<div class="rg-row"><span class="rg-k">${k}</span><span class="rg-v">${v}</span></div>`).join('');
    const alert = ob ? `<div class="rg-alert">⚠ Breach open — ${ob.status === 'engaged' ? 'a team is engaged' : ob.daysLeft + ' days before it breaks'}</div>` : '';
    const acts = st === 'locked'
      ? (allowed ? '<button class="ghost" data-action="close">Close</button>'
                 : '<button class="primary" data-action="charter-offer">Unlock with the Charter</button>')
      : `<button data-action="close">Close</button>
         <button class="primary" data-action="region-board" data-id="${z.id}">Contracts ▸</button>`;
    showModal(`<div class="sheet-head"><h2>${esc(z.name)}</h2><button class="x" data-action="close">✕</button></div>
      <div class="regionart" style="background-image:url('assets/maps/zone_${z.id}.jpg')">
        <span class="rg-standing">${standing}</span></div>
      ${alert}
      <div class="rg-rows">${rows}</div>
      <div class="dispatch-foot"><span></span><span class="rg-acts">${acts}</span></div>`);
  }

  // --- Realm: territory map + staff + objective + story log --------------
  function openRealm(keep) {
    U.panel = 'realm';
    const g = S.get();
    const terr = GH.story.territory(g);
    const pct = Math.round((terr.controlled / terr.total) * 100);
    const SPOTS = [[19, 66], [36, 32], [54, 62], [72, 30], [86, 62], [90, 18], [93, 46], [89, 79]];   // 5 heartland + 3 Marches (east)

    // The overworld at full size — pannable, so the painted map is a place you
    // survey rather than a strip of dots. Same pins as the home map.
    const pins = D.ZONES.map((z, i) => {
      const st = GH.story.regionStatus(g, z);
      const ob = (g.outbreaks || []).find((o) => o.zoneId === z.id);
      const cls = st === 'controlled' ? 'held' : st === 'active' ? 'contested' : 'locked';
      const [sx, sy] = SPOTS[i % SPOTS.length];
      const marker = ob ? uiIcon('mark_outbreak', 26)
        : st === 'controlled' ? uiIcon('hub_realm', 26)
        : st === 'active' ? uiIcon('fac_warroom', 26)
        : uiIcon('mark_locked', 26);
      const act = (st === 'locked' && !S.zoneAllowed(z)) ? 'charter-offer' : 'region';
      const rivaled = GH.rival && GH.rival.contested(g, z.id);
      return `<button class="mappin ${cls} ${ob ? 'outbreak' : ''} ${rivaled ? 'rivaled' : ''}" style="left:${sx}%;top:${sy}%"
          data-action="${act}" data-id="${z.id}" title="${esc(z.name)}">
        <span class="pinhead">${marker}${ob ? '<i class="pinalert">!</i>' : ''}</span>
        <span class="pinplate"><b>${esc(z.name)}</b>${tierPips(z.tier)}${rivaled ? '<i class="pinrival">⚔ Vane</i>' : ''}</span>
      </button>`;
    }).join('');

    // Progress, region by region — what is cleared, what is left.
    const rows = D.ZONES.map((z) => {
      const st = GH.story.regionStatus(g, z);
      const done = !!(g.bossDone && g.bossDone[z.id]);
      const ob = (g.outbreaks || []).find((o) => o.zoneId === z.id);
      const open = (g.board || []).filter((j) => j.zoneId === z.id && j.status === 'open').length;
      const state = done ? '<span class="rg-ok">✔ held</span>'
        : ob ? '<span class="rp-warn">⚠ breach</span>'
        : st === 'active' ? '<span class="rg-on">contested</span>'
        : S.zoneAllowed(z) ? `<span class="rg-off">rep ${z.reqRep}</span>`
        : '<span class="rg-off">🔒 charter</span>';
      return `<button class="realmrow ${done ? 'done' : ''}" data-action="${(st === 'locked' && !S.zoneAllowed(z)) ? 'charter-offer' : 'region'}" data-id="${z.id}">
        <span class="rr-tier">${tierPips(z.tier)}</span>
        <span class="rr-name"><b>${esc(z.name)}</b><br><small class="muted">${esc(z.boss)}${done ? ' — defeated' : ''}</small></span>
        <span class="rr-state">${state}${open && st !== 'locked' ? `<br><small class="muted">${open} contracts</small>` : ''}</span>
      </button>`;
    }).join('');

    const staff = Object.entries(GH.story.STAFF).map(([key, sm]) => `<div class="staffcard">
      ${staffFace(key, sm, 52)}
      <span class="grow"><b>${esc(sm.name)}</b><br><small>${esc(sm.role)}</small></span></div>`).join('');
    const logHtml = (g.story.log || []).map((e) => { const sp = GH.story.STAFF[e.speaker]; return `<div class="storylogentry"><b style="color:${sp.color}">${esc(sp.name)}</b> ${esc(e.text)}</div>`; }).join('') || '<p class="muted">Your story is just beginning.</p>';

    showModal(`<div class="sheet-head"><h2>The Realm</h2><button class="x" data-action="close">✕</button></div>
      <div class="spread"><b>Territory — ${terr.controlled}/${terr.total} regions</b> <small class="muted">drag the map to explore</small></div>
      <div class="terrbar"><div class="terrfill" style="width:${pct}%"></div><span class="terrlbl">${pct}% of the realm flies your banner</span></div>
      <div class="realmscroll"><div class="realmmap">${pins}</div></div>
      ${g.story.objective ? `<div class="objective">▶ ${esc(g.story.objective)}</div>` : ''}
      <h3>Regions</h3><div class="realmrows">${rows}</div>
      <h3>Your Staff</h3><div class="staffrow">${staff}</div>
      <h3>The Story So Far</h3><div class="storylogwrap">${logHtml}</div>`);
    // open centred on the map so it reads as a big world, not a banner
    const sc = document.querySelector('.realmscroll');
    if (sc) sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2;
  }

  // --- Kitchen -----------------------------------------------------------
  function kitchenPanel() {
    const g = S.get();
    const meals = D.MEALS.map((m, i) => `<div class="contract">
      <div class="ctitle">${esc(m.name)}</div>
      <div class="cclient">Restores ${m.fed} Fed${m.happy ? `, +${m.happy} Happy` : ''} to the whole hall · <b>${m.cost}g</b></div>
      <div class="crow"><button class="primary small" data-action="cook" data-i="${i}" ${g.gold < m.cost ? 'disabled' : ''}>Serve</button></div>
    </div>`).join('');
    const avg = g.roster.length ? Math.round(g.roster.reduce((s, a) => s + a.fed, 0) / g.roster.length) : 0;
    return `${facilityHeader('kitchen')}<p class="muted">Average roster Fed: <b>${avg}</b>. Hungry adventurers roll worse.</p><div class="contracts">${meals}</div>`;
  }

  // --- Training ----------------------------------------------------------
  function trainingPanel() {
    const g = S.get();
    const adv = U.trainAdv ? S.findAdv(U.trainAdv) : null;
    const advOpts = g.roster.map((a) => `<option value="${a.id}" ${adv && adv.id === a.id ? 'selected' : ''}>${esc(a.name)} — Lv${a.level} ${a.class}</option>`).join('');
    let skillList = '<p class="muted">Pick an adventurer to see trainable skills.</p>';
    if (adv) {
      skillList = Object.keys(D.SKILLS).map((sk) => {
        const can = PF.canTrain(adv, sk);
        const cur = D.PROF_LABEL[adv.skills[sk]];
        const m = PF.skillMod(adv, sk, { ignoreNeeds: true });
        const tc = S.trainCost();
        return `<div class="pickrow">
          <span class="grow"><b>${D.SKILL_LABEL[sk]}</b> <small>${cur} · ${sgn(m)}</small></span>
          <button class="small" data-action="train" data-id="${adv.id}" data-skill="${sk}" ${can.ok && g.gold >= tc && adv.status === 'idle' && !adv.actedToday ? '' : 'disabled'}>
            ${can.ok ? `→ ${D.PROF_LABEL[can.next]} (${tc}g)` : (can.reason || 'maxed')}</button>
        </div>`;
      }).join('');
      if (adv.status !== 'idle') skillList = `<p class="warn">${esc(adv.name)} is ${adv.status} and can't train.</p>` + skillList;
      else if (adv.actedToday) skillList = `<p class="warn">${esc(adv.name)} has already worked today.</p>` + skillList;
    }
    return `${facilityHeader('training')}<label class="field"><span>Adventurer</span>
      <select data-action="train-pick">${advOpts}</select></label>${skillList}`;
  }

  // --- Dormitory ---------------------------------------------------------
  function dormitoryPanel() {
    const g = S.get();
    const rows = g.roster.map((a) => {
      const t = GH.teams.teamOf(g, a.id);
      return `<div class="pickrow" data-action="open-adv" data-id="${a.id}" style="cursor:pointer">
      ${GH.portraits.img(a, 44)}
      <span class="grow"><b>${esc(a.name)}</b>${t ? ` <span class="teamdot" style="--tc:${t.color}" title="${esc(t.name)}"></span>` : ''}${a._talkedToday ? ' <span class="talkedchip" title="Talked today">💬</span>' : ''} <small>${a.ancestry} ${a.class} ${routineTag(a)}</small></span>
      ${miniNeeds(a)}</div>`;
    }).join('');
    const full = g.roster.length >= S.bedsCount();
    return `${facilityHeader('dormitory')}
      <div class="spread"><p class="muted" style="margin:0">Beds: <b>${g.roster.length}/${S.bedsCount()}</b>. Rest refills overnight.</p>
        <button class="small" data-action="recruit" ${full || g.gold < S.RECRUIT_COST ? 'disabled' : ''}>${full ? 'No beds' : `Recruit ${S.RECRUIT_COST}g`}</button></div>
      <p class="muted">Tap anyone for their sheet.</p>${rows}`;
  }
  function miniNeeds(a) {
    return `<span class="minineeds">
      <span class="mn" title="Fed">🍖${Math.round(a.fed)}</span>
      <span class="mn" title="Rested">💤${Math.round(a.rested)}</span>
      <span class="mn" title="Happy">😊${Math.round(a.happy)}</span></span>`;
  }
  // One-glyph routine tag for roster rows — makes "who is on Auto, who did I
  // pin to the yard" readable without opening every sheet.
  const ROUTINE_ICON = { auto: '✦', train: '🎯', hunt: '🏹', rest: '🛏', social: '🍺' };
  // What this person is doing today, readable on a roster row without opening
  // anything — the whole point of the day plan being visible.
  function planTag(a) {
    if (!GH.routines || !GH.routines.planOf) return '';
    if (a.status === 'away') return '<span class="plantag away">on expedition</span>';
    if (a.status === 'hunting') return '<span class="plantag">🏹 hunting</span>';
    const RT = GH.routines, p = RT.planOf(a);
    if (RT.takesWholeDay(p.am)) return `<span class="plantag">${esc(RT.slotLabel(p.am))} · all day</span>`;
    return `<span class="plantag">${esc(RT.slotLabel(p.am))} <i>/</i> ${esc(RT.slotLabel(p.pm))}</span>`;
  }
  function routineTag(a) {
    const r = a.routine || 'auto';
    const label = (GH.routines && GH.routines.LABELS[r]) || r;
    return `<span class="routinetag ${r === 'auto' ? 'auto' : 'manual'}" title="${esc(label)}">${ROUTINE_ICON[r] || '✦'}</span>`;
  }

  // --- Tavern (recruit + morale) -----------------------------------------
  function tavernPanel() {
    const g = S.get();
    const full = g.roster.length >= S.bedsCount();
    const avgHappy = g.roster.length ? Math.round(g.roster.reduce((s, a) => s + a.happy, 0) / g.roster.length) : 0;
    const atHall = g.roster.filter((x) => x.status !== 'away' && x.status !== 'hunting').length;
    const roundCost = 12 + 4 * atHall;
    const roundDone = g.roundDay === g.day;
    return `<p class="muted">Hall morale: <b>${avgHappy}</b>. Word of a lively hall draws fresh recruits.</p>
      <div class="contract">
        <div class="ctitle">🍺 Stand a round</div>
        <div class="cclient">Everyone home gathers to drink tonight — spirits rise, bonds deepen, and new banners are born over full cups · <b>${roundCost}g</b></div>
        <div class="crow"><button class="primary small" data-action="buy-round" ${roundDone || atHall < 2 || g.gold < roundCost ? 'disabled' : ''}>
          ${roundDone ? 'Cups are full' : atHall < 2 ? 'Too few home' : 'Stand a round'}</button></div>
      </div>
      <div class="contract">
        <div class="ctitle">Put out the call</div>
        <div class="cclient">Recruit a new adventurer (random ancestry/class) · <b>${S.RECRUIT_COST}g</b></div>
        <div class="crow"><button class="primary small" data-action="recruit" ${full || g.gold < S.RECRUIT_COST ? 'disabled' : ''}>
          ${full ? 'No free beds' : 'Recruit'}</button></div>
      </div>`;
  }

  // --- Smithy (crafting) -------------------------------------------------
  function smithyPanel() {
    const g = S.get();
    const inv = g.inventory;
    const mats = D.MATERIALS.map((m) => `<span class="invmat" title="${esc(m.name)}">${icon(m.icon, 30)}<span class="mc">${GH.items.matCount(inv, m.id)}</span></span>`).join('');
    const maxTier = S.maxCraftTier();
    const blueprints = D.GEAR.map((bp) => {
      const locked = bp.tier > maxTier;
      const goldCost = S.craftGold(bp.id);
      const affordable = !locked && (g.gold >= goldCost) && Object.entries(bp.cost.mats || {}).every(([m, q]) => GH.items.matCount(inv, m) >= q);
      const owned = GH.items.gearCount(inv, bp.id);
      const cost = `${goldCost}g` + Object.entries(bp.cost.mats || {}).map(([m, q]) => ` · ${q} ${D.MAT_BY_ID[m].name}`).join('');
      const label = locked ? `Smithy Lv${bp.tier - 1}` : (affordable ? 'Forge' : '—');
      return `<div class="gearcard ${locked ? 'spent' : ''}">
        ${icon(bp.icon, 42)}
        <span class="grow"><b>${esc(bp.name)}</b> <span class="slottag">${bp.slot}</span> <span class="tiertag">T${bp.tier}</span>${owned ? ` <span class="owned">×${owned}</span>` : ''}
          <br><small>${gearBonusText(bp)}${bp.guard ? ' · guards vs injury' : ''} · ${cost}</small></span>
        <button class="primary small" data-action="craft" data-id="${bp.id}" ${affordable ? '' : 'disabled'}>${label}</button>
      </div>`;
    }).join('');
    return `${facilityHeader('smithy')}<div class="invbar"><span class="invlabel">Materials</span>${mats}</div>
      <h3>Blueprints</h3><div class="gearlist">${blueprints}</div>
      <p class="muted">Equip forged gear from each adventurer's sheet (Dormitory → click anyone).</p>`;
  }

  // ====================================================================
  //  CHARACTER SHEET
  // ====================================================================
  function openAdventurer(id, keep) {
    U.panel = 'adv';
    // A fresh open always lands on Person; re-renders keep the chosen tab.
    // A fresh open lands on the DAY: what this person is about to do is the
    // thing you came to decide. (Was 'person', which buried the whole plan
    // behind a dropdown labelled "Daily Routine".)
    if (U.advId !== id || !keep) { U.advTab = 'day'; U.slotPick = null; }
    U.advId = id;
    const a = S.findAdv(id); if (!a) { hideModal(); return; }
    const abil = D.ABILITIES.map((k) => `<div class="ab"><span class="abk">${D.ABILITY_LABEL[k]}</span>
      <span class="abv">${a.scores[k]}</span><span class="abm">${sgn(PF.mod(a.scores[k]))}</span></div>`).join('');
    const skills = Object.keys(D.SKILLS).filter((s) => a.skills[s] !== 'U').map((s) =>
      `<div class="skrow"><span>${D.SKILL_LABEL[s]}</span><span class="prof">${D.PROF_LABEL[a.skills[s]]}</span><span class="skm">${sgn(PF.skillMod(a, s, { ignoreNeeds: true }))}</span></div>`).join('')
      || '<div class="muted">Untrained in everything — needs the yard.</div>';
    const statusBadge = a.status !== 'idle' ? `<span class="badge ${a.status}">${a.status}</span>` : (a.actedToday ? '<span class="badge worked">worked today</span>' : '');
    const team = GH.teams.teamOf(S.get(), a.id);
    const arch = GH.personality.of(a);
    const tier = GH.personality.tierOf(a.affinity || 0);
    const classLabel = a.classAdv ? `<b>${esc(a.classAdv)}</b> <small>(${esc(a.class)})</small>` : `<b>${esc(a.class)}</b>`;
    // The portrait was a 68px thumbnail beside the name — the person you opened
    // the sheet to look at was the smallest thing on it. It is a banner across
    // the top half now, using the full-size pool art rather than a scaled-down
    // icon, with the name laid over the foot of it.
    const heroArt = GH.portraits.srcFor ? GH.portraits.srcFor(a, GH.portraits.moodExpr(a)) : null;
    // ✕ lives OUTSIDE the banner: the old .sheet-head was sticky, so the close
    // button survived scrolling. A banner that scrolls away takes it with it,
    // which left no way out of the sheet but the backdrop. `.xpin` is a
    // zero-height sticky strip — it pins ✕ to the top of the sheet without
    // taking layout space or sitting over the portrait's composition.
    const hero = heroArt
      ? `<div class="xpin"><button class="x" data-action="close">✕</button></div>
         <div class="advhero" data-action="portrait-big" data-id="${a.id}" title="Tap to enlarge">
           <img src="${heroArt}" alt="">
           <div class="advhero-name"><h2>${esc(a.name)} ${statusBadge}</h2></div>
         </div>`
      : `<div class="sheet-head sheet-head-portrait">
           <span class="portraitzoom" data-action="portrait-big" data-id="${a.id}">${GH.portraits.img(a, 68)}</span>
           <h2>${esc(a.name)} ${statusBadge}</h2><button class="x" data-action="close">✕</button></div>`;
    // The ❗ over their head in the hall told you somebody wanted a word and
    // nothing told you what about. Same function, same answer, said in words.
    const want = GH.personality.wantsAWord ? GH.personality.wantsAWord(a, S.get()) : null;
    const wantBanner = want ? `<div class="wantsword">❗ ${esc(want.line)}</div>` : '';
    showModal(`${hero}${wantBanner}
      <p class="muted">${esc(a.ancestry)} ${esc(a.background)} · ${classLabel} · Level ${a.level} · <span class="trait">${esc(a.trait)}</span>
        · <span class="archetype">${esc(arch.name)}</span>
        ${team ? ` · <span class="teamdot" style="--tc:${team.color}"></span> ${esc(team.name)}` : ''}</p>
      <div class="advtabs">
        <button class="advtab ${U.advTab === 'day' ? 'active' : ''}" data-action="adv-tab" data-tab="day" data-id="${a.id}">Day</button>
        <button class="advtab ${U.advTab === 'person' ? 'active' : ''}" data-action="adv-tab" data-tab="person" data-id="${a.id}">Person</button>
        <button class="advtab ${U.advTab === 'sheet' ? 'active' : ''}" data-action="adv-tab" data-tab="sheet" data-id="${a.id}">Sheet</button>
      </div>
      ${statStrip(a, tier)}
      ${GH.advisor ? `<div class="advisor">💡 ${esc(GH.advisor.recommend(a))}</div>` : ''}
      <div id="dialogue" class="dialogue"></div>
      ${U.advTab === 'sheet' ? `
        <div class="abilities">${abil}</div>
        <h3>Skills</h3><div class="skills">${skills}</div>
        <h3>Gear</h3>${gearSlots(a)}
        ${promotionBlock(a)}
      ` : U.advTab === 'person' ? `
        ${talkRow(a)}
        ${readBlock(a)}
        ${topicsBlock(a)}
        ${relationshipsBlock(a)}
        ${storyBlock(a)}
      ` : dayTab(a)}`, { keepScroll: keep });
  }

  /* Talking belongs with the person, not in a bar floating over the panel.
   * The sheet's sticky action row pinned itself into the MIDDLE of the sheet
   * and painted across whichever tab was open; and "Train ▸" is redundant now
   * that training is something you assign to half a day. So the row is gone
   * and its two real verbs live where they belong. */
  function talkRow(a) {
    return `<div class="talkrow">
      <button data-action="talk" data-id="${a.id}" class="${a._talkedToday ? 'talked' : ''}">${uiIcon('act_talk', 18)} Talk${a._talkedToday ? ' ✓' : ''}</button>
      ${(a.affinity || 0) < 40
        ? `<button data-action="flirt" data-id="${a.id}" class="flirtbtn locked" title="Unlocks at Friend (affinity 40) — talk to them daily">🔒 Flirt <small>at Friend</small></button>`
        : `<button data-action="flirt" data-id="${a.id}" class="flirtbtn ${a._flirtedToday ? 'talked' : ''}" title="Say something bold">
        <img src="assets/icons/rc/gold/heart.png" style="width:18px;height:18px;vertical-align:-4px" alt=""> Flirt</button>`}
    </div>`;
  }

  /* One compact strip instead of an affinity bar, an HP line and four
   * full-width need bars stacked before you reach anything you can act on.
   * The sheet used to spend most of a phone screen on read-only numbers. */
  function statStrip(a, tier) {
    const pip = (k, v, cls) => `<span class="np ${cls} ${v < 35 ? 'low' : ''}" title="${k} ${v}">
      <span class="npk">${k}</span><span class="npbar"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>
      <span class="npv">${Math.round(v)}</span></span>`;
    return `<div class="statstrip">
        <span class="sschip"><b>HP</b> ${a.hp}/${a.maxHp}</span>
        <span class="sschip"><b>XP</b> ${a.xp}/${a.level * 100}</span>
        <span class="sschip aff"><b>${a.sworn ? '⚔ Sworn' : esc(tier)}</b> ${a.affinity || 0}</span>
      </div>
      <div class="needpips">
        ${pip('Fed', a.fed, 'fed')}${pip('Rested', a.rested, 'rested')}
        ${pip('Happy', a.happy, 'happy')}${pip('Loyal', a.loyalty, 'loyal')}
      </div>`;
  }

  /* ---- The Day tab: two slots, and what fills them --------------------- */
  // The old model was one hidden dropdown that resolved at nightfall, so you
  // could never see what anybody was about to do. Now a person's day is two
  // cards you tap, and their place in the hall follows from it.
  function dayTab(a) {
    const RT = GH.routines;
    if (a.status === 'away') return `<p class="muted">On expedition — their whole day is spoken for.</p>`;
    if (U.slotPick && U.slotPick.id === a.id) return slotPicker(a, U.slotPick.slot);
    const p = RT.planOf(a);
    const whole = RT.takesWholeDay(p.am);
    const cards = whole
      ? `<button class="slotcard whole" data-action="slot-pick" data-id="${a.id}" data-slot="am">
           <span class="slotwhen">All day</span>
           <span class="slotwhat">${esc(RT.slotLabel(p.am))}</span>
           <span class="slotgo">change ▸</span></button>`
      : D.DAY_SLOTS.map((s) => `<button class="slotcard" data-action="slot-pick" data-id="${a.id}" data-slot="${s}">
           <span class="slotwhen">${D.SLOT_LABEL[s]}</span>
           <span class="slotwhat">${esc(RT.slotLabel(p[s]))}</span>
           <span class="slotgo">change ▸</span></button>`).join('');
    const stock = Object.entries(S.remedies()).filter(([, n]) => n > 0);
    const remedyRow = stock.length ? `<h3>Remedies</h3><div class="remedies">${stock.map(([id, n]) => {
      const r = D.REMEDY_BY_ID[id]; if (!r) return '';
      return `<button class="small remedybtn" data-action="use-remedy" data-id="${a.id}" data-rem="${id}">
        ${r.icon} ${esc(r.name)} <b>×${n}</b><small>${esc(r.blurb)}</small></button>`;
    }).join('')}</div>` : '';
    return `<h3>Their day</h3>
      <div class="slotgrid">${cards}</div>
      <p class="muted" style="margin:6px 0 0">Both halves resolve at nightfall. ✦ Auto weighs their own needs.</p>
      ${remedyRow}`;
  }

  function slotPicker(a, slot) {
    const RT = GH.routines;
    const p = RT.planOf(a);
    const cur = p[slot];
    const opt = (val, icon, name, note, disabled) =>
      `<button class="slotopt ${cur === val ? 'on' : ''} ${disabled ? 'shut' : ''}"
        ${disabled ? 'disabled' : `data-action="slot-set" data-id="${a.id}" data-slot="${slot}" data-val="${val}"`}>
        <span class="oi">${icon}</span><span class="grow"><b>${esc(name)}</b><small>${esc(note)}</small></span></button>`;

    const trains = Object.entries(D.TRAIN_BRANCHES).map(([k, b]) => {
      const open = RT.branchOpen('train', k);
      const sk = RT.trainableIn(a, k);
      const note = !open.ok ? open.why
        : !sk ? 'Nothing left to raise here.'
        : `${D.SKILL_LABEL[sk]} → next rank · ${S.trainCost()}g`;
      return opt('train:' + k, b.icon, b.name, note, !open.ok || !sk);
    }).join('');

    const craftable = [];
    if (RT.branchOpen('craft', 'smith').ok) {
      D.GEAR.filter((g) => g.tier <= S.maxCraftTier()).slice(0, 6).forEach((g) => {
        const gold = Math.round(S.craftGold(g.id) * (1 - D.SLOT_CRAFT_DISCOUNT));
        craftable.push(opt(`craft:smith:${g.id}`, '🔨', g.name, `${gold}g at the forge`, S.get().gold < gold));
      });
    }
    if (RT.branchOpen('craft', 'alchemy').ok) {
      D.REMEDIES.forEach((r) => {
        const gold = Math.round(r.cost.gold * (1 - D.SLOT_CRAFT_DISCOUNT));
        craftable.push(opt(`craft:alchemy:${r.id}`, r.icon, r.name, `${gold}g · ${r.blurb}`, S.get().gold < gold));
      });
    }
    const craftNote = craftable.length ? '' :
      `<p class="muted">Nothing to work yet — raise the ${esc(D.FACILITIES.smithy.name)} for smithing or the ${esc(D.FACILITIES.library.name)} for alchemy.</p>`;

    return `<div class="spread"><h3>${esc(D.SLOT_LABEL[slot] || 'All day')}</h3>
        <button class="small" data-action="slot-cancel" data-id="${a.id}">✕ back</button></div>
      <div class="slotopts">
        ${opt('auto', '✦', 'Auto', 'They decide by what they need.')}
        ${opt('rest', '🛏', 'Rest', 'Sleep it off — restores Rested.')}
        ${opt('hall', '🍺', 'Hall time', 'Drink and talk — mood and bonds.')}
      </div>
      <h3>Train</h3><div class="slotopts">${trains}</div>
      <h3>Craft <small class="muted">(${Math.round(D.SLOT_CRAFT_DISCOUNT * 100)}% off — their labour)</small></h3>
      <div class="slotopts">${craftable.join('')}</div>${craftNote}
      <h3>All day</h3><div class="slotopts">
        ${opt('hunt', '🏹', 'Hunt alone', 'Gone the whole of tomorrow. XP and loot — and real risk.')}
      </div>`;
  }

  // A reply button shows the LINE, with the tone as a caption underneath —
  // "Keep it easy" is a mood, not something a person says out loud.
  function respChoices(responses, rd, id) {
    return (responses || []).map((c) => {
      const mark = rd.best === c.style ? '<i class="cue good">♥</i>' : rd.avoid === c.style ? '<i class="cue bad">✕</i>' : '';
      return `<button class="small resp-choice" data-action="talk-respond" data-id="${id}" data-style="${c.style}">
        <span class="say">${esc(c.label)}</span>
        <small class="tone">${esc(c.tone || '')} ${mark}</small></button>`;
    }).join('');
  }

  // Things to ASK. The bios were always there, gated behind affinity, but
  // reading them off a card is not a conversation — putting the question to
  // their face is. Locked topics still answer, in the way a person deflects.
  function topicsBlock(a) {
    if (!GH.personality || !GH.personality.topicsFor) return '';
    const rows = GH.personality.topicsFor(a).map((t) => {
      const cls = t.done ? 'topicbtn done' : t.open ? 'topicbtn' : 'topicbtn shut';
      return `<button class="small ${cls}" data-action="ask-topic" data-id="${a.id}" data-topic="${t.key}"
        ${t.done ? 'disabled' : ''}>${t.open ? '' : '🔒 '}${esc(t.label)}${t.done ? ' ✓' : ''}</button>`;
    }).join('');
    return `<h3>Ask them</h3><div class="topics">${rows}</div>
      <p class="muted" style="margin:4px 0 0">One answer each per day. The first two questions warm them a little.</p>`;
  }

  // What they want to hear, and how the last attempt landed — so a
  // conversation is a readable choice instead of a coin flip.
  function readBlock(a) {
    if (!GH.personality || !GH.personality.readOf) return '';
    const r = GH.personality.readOf(a);
    const L = GH.personality.RESPONSE_LABELS || {};
    const last = a._lastRespond;
    const lastTxt = last ? `<div class="readlast">Last time you ${esc((L[last.style] || last.style).toLowerCase())} — ${
      last.outcome === 'best' ? '<b class="good">they lit up</b>'
      : last.outcome === 'worst' ? '<b class="bad">it landed badly</b>'
      : '<b>they took it fine</b>'}</div>` : '';
    return `<h3>Reading them</h3>
      <div class="readcard read-${r.level}">
        <span class="readicon">${r.level === 'known' ? '♥' : r.level === 'hint' ? '◆' : '?'}</span>
        <span class="grow">${esc(r.text)}${a._respondedToday ? '<br><small class="muted">You have already spoken today.</small>' : ''}</span>
      </div>${lastTxt}`;
  }

  // Their story: bio facts unlocked by intimacy + the deeds timeline.
  function storyBlock(a) {
    if (!GH.bios) return '';
    const rows = GH.bios.reveal(a).map((r) => r.open
      ? `<div class="biorow"><span class="biok">${r.k}</span><span class="biov">${esc(r.v)}</span></div>`
      : `<div class="biorow locked"><span class="biok">${r.k}</span><span class="biov">🔒 <i>${esc(r.tease)}</i></span></div>`).join('');
    const ds = GH.bios.deeds(a).slice(-7).reverse().map((d) =>
      `<div class="deedrow"><span class="deedday">d${d.day}</span><span>${esc(d.text)}</span></div>`).join('');
    return `<h3>Their Story</h3><div class="bios">${rows}</div>
      ${a.promised ? '<p class="level">♥ Promised — a ribbon on your wrist, a vow between you.</p>' : ''}
      <h3>Deeds</h3><div class="deeds">${ds}</div>`;
  }

  // The Promise: the ribbon scene — the romance capstone, VN-staged.
  function showPromiseEvent(a, promise) {
    const bust = GH.portraits.bustSrc ? GH.portraits.bustSrc(a, 'desire') : null;
    const art = GH.portraits.srcFor ? GH.portraits.srcFor(a, 'desire') : null;
    const figure = bust ? `<img class="vnbust" src="${bust}" alt="">`
      : art ? `<img class="vnbust vnmasked" src="${art}" alt="">`
      : `<span class="vnfallback">${GH.portraits.img(a, 128)}</span>`;
    const lines = promise.lines.map((l) => `<p class="storytext">“${esc(l)}”</p>`).join('');
    showCine(`<div class="vnscene">
        ${figure}
        <div class="vnname">${esc(a.name)}<small>the rooftop · after close · ♥ The Promise</small></div>
      </div>
      ${lines}
      <p class="level">♥ Promised — their loyalty will never waver again.</p>
      <div class="dispatch-foot"><span></span>
        <button class="primary" data-action="heart-done" data-id="${a.id}">Tie the ribbon ▸</button></div>`);
    U.panel = 'heart';
  }

  // A heart event: VN-style scene — bust over the darkened hall, speech below.
  // The third heart (the confession) uses the 'desire' expression when available.
  function showHeartEvent(a, heart) {
    const arch = GH.personality.of(a);
    const expr = heart.index === 2 ? 'desire' : heart.index === 1 ? 'happy' : null;
    const bust = GH.portraits.bustSrc ? GH.portraits.bustSrc(a, expr) : null;
    const art = GH.portraits.srcFor ? GH.portraits.srcFor(a, expr) : null;
    const figure = bust
      ? `<img class="vnbust" src="${bust}" alt="">`
      : art
        ? `<img class="vnbust vnmasked" src="${art}" alt="">`
        : `<span class="vnfallback">${GH.portraits.img(a, 128)}</span>`;
    const lines = heart.lines.map((l) => `<p class="storytext">“${esc(l)}”</p>`).join('');
    showCine(`<div class="vnscene">
        ${figure}
        <div class="vnname">${esc(a.name)}<small>${esc(arch.name)} · a quiet moment · ♥ ${heart.index + 1}/3</small></div>
      </div>
      ${lines}
      ${a.sworn ? '<p class="level">⚔ Sworn bond — +1 to all their rolls, from here to the end.</p>' : ''}
      <div class="dispatch-foot"><span></span>
        <button class="primary" data-action="heart-done" data-id="${a.id}">Stay a while ▸</button></div>`);
    U.panel = 'heart';
  }

  function promotionBlock(a) {
    if (a.classAdv) return `<h3>Class</h3><p class="muted">⭐ Promoted: <b>${esc(a.classAdv)}</b>.</p>`;
    const promos = D.PROMOTIONS[a.class] || [];
    if (!promos.length) return '';
    if (a.level < 3) return `<h3>Promotion</h3><p class="muted">Reaches the promotion exam at level 3 (now ${a.level}).</p>`;
    const g = S.get();
    const rows = promos.map((p) => {
      const can = PF.canPromote(a, p);
      const affordable = g.gold >= p.cost;
      const reqTxt = Object.entries(p.req).map(([f, l]) => `${D.FACILITIES[f].name} Lv${l}`).join(' + ');
      return `<div class="pickrow">
        <span class="grow"><b>⭐ ${esc(p.name)}</b> <small>${esc(p.blurb)}</small><br>
          <small class="${can.ok ? 'muted' : 'warn'}">${reqTxt} · ${p.cost}g</small></span>
        <button class="primary small" data-action="promote" data-id="${a.id}" data-promo="${esc(p.name)}"
          ${can.ok && affordable ? '' : 'disabled'}>${can.ok ? (affordable ? 'Promote' : p.cost + 'g') : 'Locked'}</button>
      </div>`;
    }).join('');
    return `<h3>Promotion</h3>${rows}`;
  }

  function relationshipsBlock(a) {
    if (!GH.social) return '';
    const rel = GH.social.relationships(a, S.get().roster);
    if (!rel.friends.length && !rel.rivals.length) return '<h3>Bonds</h3><p class="muted">No strong bonds yet — send people on expeditions together.</p>';
    const fr = rel.friends.map((f) => `<span class="bondchip friend">♥ ${esc(f.name.split(' ')[0])}</span>`).join('');
    const rv = rel.rivals.map((f) => `<span class="bondchip rival">✗ ${esc(f.name.split(' ')[0])}</span>`).join('');
    return `<h3>Bonds</h3><div class="bonds">${fr}${rv}</div>`;
  }

  function gearSlots(a) {
    const inv = S.get().inventory;
    const rows = D.SLOTS.map((slot) => {
      const gid = a.gear && a.gear[slot];
      const gObj = gid ? GH.items.gear(gid) : null;
      const choosing = U.equipAdv === a.id && U.equipSlot === slot;
      let row = `<div class="gearslot">
        <span class="slotname">${slot}</span>
        ${gObj ? `${icon(gObj.icon, 30)}<span class="grow"><b>${esc(gObj.name)}</b> <small>${gearBonusText(gObj)}</small></span>
          <button class="small" data-action="unequip" data-id="${a.id}" data-slot="${slot}">Remove</button>`
        : `<span class="grow muted">— empty —</span>
          <button class="small" data-action="equip-open" data-id="${a.id}" data-slot="${slot}">Equip ▾</button>`}
      </div>`;
      if (choosing) {
        const choices = Object.keys(inv.gear).filter((g2) => GH.items.gearCount(inv, g2) > 0 && GH.items.gear(g2).slot === slot);
        const list = choices.length ? choices.map((g2) => {
          const go = GH.items.gear(g2);
          return `<div class="choicerow"><button class="equipchoice" data-action="equip" data-id="${a.id}" data-gid="${g2}">${icon(go.icon, 24)} ${esc(go.name)} <small>${gearBonusText(go)} ×${GH.items.gearCount(inv, g2)}</small></button><button class="giftbtn" data-action="gift" data-id="${a.id}" data-gid="${g2}" title="Give as a gift — they'll remember it">🎁</button></div>`;
        }).join('') : '<span class="muted">Nothing in the stash for this slot — forge some at the Smithy.</span>';
        row += `<div class="equiplist">${list}<button class="ghost small" data-action="equip-cancel">cancel</button></div>`;
      }
      return row;
    }).join('');
    return `<div class="gearslots">${rows}</div>`;
  }

  // ---------- log ----------
  function openLog(keep) {
    U.panel = 'log';
    const g = S.get();
    const entries = g.log.map((e) => `<div class="logentry ${e.kind}">${esc(e.text)}<small>Day ${e.day}</small></div>`).join('');
    showModal(`<div class="sheet-head"><h2>Guild Chronicle</h2><button class="x" data-action="close">✕</button></div>
      <div class="logwrap">${entries || '<p class="muted">Nothing yet.</p>'}</div>`);
  }

  // ====================================================================
  //  ACTION DISPATCH
  // ====================================================================
  function onClick(ev) {
    const el = ev.target.closest('[data-action]');
    // select/checkbox handled separately
    if (ev.target.matches('select[data-action="train-pick"]')) return;
    if (!el) return;
    const a = el.dataset.action;
    const g = S.get();
    // the tutorial listens to real play
    if (g && GH.tutorial && GH.tutorial.active(g)) {
      if ((a === 'nav' && el.dataset.nav === 'board') || a === 'dispatch-start') { if (GH.tutorial.notify(g, 'board-open')) S.persist(); }
      if (a === 'talk') { if (GH.tutorial.notify(g, 'talked')) S.persist(); }
      // The day system and the Build tab are steps of the tour now, so real
      // play has to be able to satisfy them the same way the rest does.
      if (a === 'slot-set') { if (GH.tutorial.notify(g, 'slot-set')) S.persist(); }
      if ((a === 'nav' && el.dataset.nav === 'guild') || a === 'open-guildhub') { if (GH.tutorial.notify(g, 'build-open')) S.persist(); }
      setTimeout(renderTutorBar, 60);
    }
    switch (a) {
      case 'portrait-big': {
        const a = S.findAdv(el.dataset.id); if (!a) break;
        const art = GH.portraits.srcFor ? GH.portraits.srcFor(a, GH.portraits.moodExpr(a)) : null;
        U.bigFrom = a.id;
        showModal(`<div class="sheet-head"><h2>${esc(a.name)}</h2><button class="x" data-action="back-adv" data-id="${a.id}">✕</button></div>
          <div class="bigportrait">${art ? `<img src="${art}" alt="">` : GH.portraits.img(a, 320)}</div>
          <p class="muted">${esc(a.ancestry)} ${esc(a.background)} · ${esc(a.classAdv || a.class)} · Level ${a.level}</p>
          <div class="dispatch-foot"><span></span><button class="primary" data-action="back-adv" data-id="${a.id}">Back ▸</button></div>`);
        U.panel = 'bigportrait';
        break;
      }
      case 'back-adv': openAdventurer(el.dataset.id); break;
      case 'adv-tab': {
        U.advTab = el.dataset.tab; openAdventurer(el.dataset.id, true);
        // Person and Sheet are very different heights; keeping the old
        // scrollTop drops you into unrelated content. Pin the tab row.
        const tabs = document.querySelector('#modal .advtabs');
        if (tabs && modalEl) modalEl.scrollTop = Math.max(0, tabs.offsetTop - 90);
        break;
      }
      case 'newgame': openNameEntry(); break;
      case 'title': hideModal(); showTitle(); break;
      case 'found-guild': {
        const n = (document.getElementById('newname') || {}).value || 'The Stamped Scroll';
        hideModal(); S.newGame(n, { difficulty: U.newDifficulty || D.DEFAULT_DIFFICULTY }); showGame();
        U.storyQueue = GH.story ? GH.story.takePending(S.get()) : [];
        U.pendingOver = null;
        // Persist immediately. Every other tutorial transition writes the save,
        // but begin() only mutated memory — so a player who founded a guild and
        // closed the app before touching the first card came back to a save with
        // no `tutorial` key at all, and migrate() reads that as "a save from
        // before the tour existed" and marks it done. The tour then never
        // appeared again, for anyone, ever.
        if (GH.tutorial) { GH.tutorial.begin(S.get()); S.persist(); renderTutorBar(); }
        if (U.storyQueue.length) showStory();
        break;
      }
      case 'newsandbox': { const n = (document.getElementById('newname') || {}).value || 'Sandbox Hall'; S.newGame(n, { mode: 'sandbox' }); showGame(); hideModal(); break; }
      case 'open-challenges': openChallenges(); break;
      case 'back-title': hideModal(); showTitle(); break;
      case 'open-challenge-status': openChallengeStatus(); break;
      case 'start-challenge': {
        const def = GH.challenges.BY_ID[el.dataset.id];
        if (def) { S.newGame(def.name + ' Hall', { mode: 'challenge', challenge: def }); showGame(); hideModal(); toast(`Challenge: ${def.goalText}`); }
        break;
      }
      case 'open-tools': openTools(); break;
      case 'sb': {
        const t = el.dataset.t;
        if (t === 'gold') S.sandbox.gold(500);
        else if (t === 'mats') S.sandbox.mats();
        else if (t === 'recruit') S.sandbox.recruit();
        else if (t === 'unlock') S.sandbox.unlockAll();
        else if (t === 'needs') S.sandbox.needs();
        else if (t === 'facilities') S.sandbox.maxFacilities();
        else if (t === 'rep') S.sandbox.rep(10);
        openTools(true); break;
      }
      case 'continue': showGame(); break;
      case 'wipe': if (confirm('Abandon your saved guild?')) { S.clear(); showTitle(); } break;
      case 'open-styles': openStyles(); break;
      case 'style-use': {
        const r = GH.shop.setActivePack(el.dataset.id);
        if (r.ok) { S.emit(); openStyles(true); toast(`Style applied: ${esc(GH.shop.BY_ID[el.dataset.id].name)}.`); }
        else toast(r.msg);
        break;
      }
      case 'theme-use': {
        const r = GH.shop.setActiveTheme(el.dataset.id);
        if (r.ok) { openStyles(true); toast(`The hall redecorates: ${esc((GH.shop.THEMES.find((t) => t.id === el.dataset.id) || {}).name || '')}.`); }
        else toast(r.msg);
        break;
      }
      case 'style-buy': {
        const p = GH.shop.BY_ID[el.dataset.id];
        const store = !!(GH.billing && GH.billing.available());
        if (GH.shop.isDemo()) { openDemoUpsell(p.name); break; }
        // Native builds get the platform's own purchase sheet; only the web dev
        // stub needs this confirm.
        if (!store && !confirm(`Unlock "${p.name}" for ${p.price}?\n\n(Dev build: this grants the pack instantly. Real store purchase arrives with the mobile release.)`)) break;
        Promise.resolve(GH.shop.purchase(p.id)).then((r) => {
          if (!(r && r.ok)) {
            if (r && r.error && r.error !== 'cancelled') toast(`Purchase failed: ${esc(String(r.error))}`);
            return;
          }
          // Only PORTRAIT packs auto-apply as the active pack — the wardrobe
          // (themes bundle) must never land in the portrait-pack pref.
          if (GH.shop.PACKS.some((x) => x.id === p.id)) GH.shop.setActivePack(p.id);
          S.emit(); openStyles(true);
          toast(`✨ ${esc(p.name)} unlocked${GH.shop.PACKS.some((x) => x.id === p.id) ? ' and applied' : ' — pick a theme below'}.${r.dev ? ' (dev grant)' : ''}`);
        });
        break;
      }
      case 'charter-offer': openCharterOffer(); break;
      case 'charter-buy': {
        const c = GH.shop.CHARTER;
        const store = !!(GH.billing && GH.billing.available());
        if (GH.shop.isDemo()) { openDemoUpsell(c.name); break; }
        if (!store && !confirm(`Unlock "${c.name}" for ${c.price}?\n\n(Dev build: this grants the unlock instantly. Real store purchase arrives with the mobile release.)`)) break;
        Promise.resolve(GH.shop.purchase('charter')).then((r) => {
          if (!(r && r.ok)) {
            if (r && r.error && r.error !== 'cancelled') toast(`Purchase failed: ${esc(String(r.error))}`);
            return;
          }
          hideModal();
          if (S.get()) S.recheckUnlocks();
          else showTitle();
          toast(`✦ The Guild Charter is yours — the full campaign is open.${r.dev ? ' (dev grant)' : ''}`);
        });
        break;
      }
      case 'restore-purchases': {
        GH.shop.restorePurchases().then((r) => {
          if (r.ok && r.restored.length) {
            if (r.restored.includes('charter') && S.get()) S.recheckUnlocks();
            if (S.get()) S.emit();
            if (U.panel === 'styles') openStyles(true); else hideModal();
            toast(`✨ Restored: ${r.restored.map((id) => esc(GH.shop.BY_ID[id].name)).join(', ')}.`);
          }
          else if (r.ok) toast('No previous purchases found for this account.');
          else toast(r.error === 'billing_unavailable' ? 'Restore is available in the mobile app.' : `Restore failed: ${esc(String(r.error))}`);
        });
        break;
      }
      case 'tut-next': GH.tutorial.next(g); S.persist(); renderTutorBar(); break;
      case 'tut-skip': GH.tutorial.skip(g); S.persist(); renderTutorBar(); toast('Tour skipped — Seraphine is around if you need her.'); break;
      case 'tut-done': GH.tutorial.finish(g); S.emit(); toast('+50g — the guild is yours.'); break;
      case 'tut-pick': {
        GH.tutorial.next(g); S.persist();
        U.dispatchJob = el.dataset.id; U.party.clear();
        const bp = GH.advisor.bestParty(S.findJob(el.dataset.id), S.idle());
        // The tour's 'meet your people' step needs someone HOME — never let
        // the suggested first party empty the hall.
        if (bp.party.length >= g.roster.length && bp.party.length > 1) bp.party = bp.party.slice(0, g.roster.length - 1);
        U.party = new Set(bp.party);
        openRoom('board', true);
        renderTutorBar();
        break;
      }
      case 'menu': if (confirm('Return to title? (Your guild is saved.)')) { hideModal(); showTitle(); } break;
      case 'ngp-pick': {
        // First pick may arm boons; the Old Companion boon loops the picker
        // once more for the second veteran before the charter begins.
        if (!U.ngpFirst) {
          U.ngpBoons = {
            companion: !!(document.getElementById('boon-companion') || {}).checked,
            endowment: !!(document.getElementById('boon-endowment') || {}).checked,
          };
          if (U.ngpBoons.companion) { U.ngpFirst = el.dataset.id; openVeteranPicker(); break; }
        }
        const firstId = U.ngpFirst || el.dataset.id;
        const secondId = U.ngpFirst ? el.dataset.id : null;
        const boons = {};
        let cost = (U.ngpBoons && U.ngpBoons.companion ? 2 : 0) + (U.ngpBoons && U.ngpBoons.endowment ? 1 : 0);
        if (cost && S.spendCharterPoints && S.spendCharterPoints(cost)) {
          if (U.ngpBoons.companion && secondId) boons.secondVeteranId = secondId;
          if (U.ngpBoons.endowment) boons.extraGold = 250;
        }
        const vet = S.findAdv(firstId);
        U.ngpFirst = null; U.ngpBoons = null;
        S.newGamePlus(firstId, null, boons);
        hideModal(); showGame();
        toast(`⚑ Charter ${S.get().prestige + 1} begins — ${esc(vet ? vet.name.split(' ')[0] : 'a veteran')} carries the banner${boons.secondVeteranId ? ', and an old companion follows' : ''}.`);
        break;
      }
      case 'save-export': {
        const data = JSON.stringify(S.get());
        const done = () => toast('Save copied to clipboard — paste it somewhere safe.');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(data).then(done, () => window.prompt('Copy your save:', data));
        else window.prompt('Copy your save:', data);
        break;
      }
      case 'save-import': {
        const raw = window.prompt('Paste a save backup:');
        if (!raw) break;
        const r = S.importSave(raw);
        toast(r.ok ? `Welcome back, ${esc(S.get().guildName)} — day ${S.get().day}.` : r.msg);
        if (r.ok) { hideModal(); showGame(); }
        break;
      }
      case 'close': hideModal(); break;
      case 'end-day': endDay(); break;
      case 'open-log': openLog(); break;

      case 'dispatch-start': U.dispatchJob = el.dataset.id; U.party.clear(); openRoom('board', true); break;
      case 'dispatch-cancel': U.dispatchJob = null; U.party.clear(); openRoom('board', true); break;
      case 'party-toggle': break; // handled by change listener
      case 'dispatch-go': doDispatch(); break;
      case 'result-done': advanceAfterReturns(); break;
      case 'story-next': showStory(); break;
      case 'open-realm': openRealm(); break;
      case 'more-menu': openMore(); break;
      case 'open-credits': openCredits(); break;
      case 'auto-dispatch': {
        const job = S.findJob(el.dataset.id);
        if (!job) break;
        const pick = GH.advisor.bestParty(job);
        const ids = (pick && pick.party) || [];
        if (!ids.length) { toast('No one fit is free — rest, heal, or recruit.'); break; }
        const names = ids.map((id) => S.findAdv(id)).filter(Boolean).map((a) => esc(a.name.split(' ')[0]));
        const r = S.dispatch(job.id, ids);
        if (r.ok) toast(`▸ ${names.join(', ')} take "${esc(job.title)}" (${esc(pick.note)}).`);
        else toast(r.msg);
        break;
      }
      case 'burn-glass': { const r = S.burnGlass(); toast(r.msg); if (r.ok) openGuildHub(true); break; }
      // A camera pan alone reads as "the button did nothing" — land the player
      // in the room's management panel too, same as tapping the room itself.
      case 'look-room': if (GH.hall && GH.hall.focusRoom) GH.hall.focusRoom(el.dataset.id); openRoom(el.dataset.id); break;
      case 'hall-wide': if (GH.hall && GH.hall.resetView) GH.hall.resetView(); syncZoomRead(); break;
      case 'hall-zoom': if (GH.hall && GH.hall.zoomBy) GH.hall.zoomBy(el.dataset.dir === 'in' ? 1.35 : 1 / 1.35); syncZoomRead(); break;
      case 'nav-armory': openArmory(); break;
      case 'nav': {
        const n = el.dataset.nav;
        if (n === 'realm') openRealm();
        else if (n === 'hall') { hideModal(); openHallView(); }
        else if (n === 'map') { hideModal(); closeHallView(); }
        else if (n === 'teams') { U.teamView = null; U.teamDraft = null; openTeams(); }
        else if (n === 'armory') openArmory();
        else if (n === 'guild') openGuildHub();
        else openRoom(n);
        break;
      }
      case 'open-hall': openHallView(); break;
      case 'hall-back': closeHallView(); break;
      case 'open-guildhub': openGuildHub(); break;
      case 'diff-new':
        U.newDifficulty = el.dataset.diff;
        openNameEntry();                      // re-render with the new pick lit
        break;
      case 'wing-use': {
        const r = S.useWing(el.dataset.id);
        toast(r.ok ? r.msg : r.msg);
        if (r.ok && GH.audio) GH.audio.play('tap');
        openWing(el.dataset.id);
        break;
      }
      case 'open-audio': openAudio(false); break;
      case 'open-audio-title': openAudio(true); break;
      case 'vol-mute': {
        GH.audio.setMuted(!GH.audio.muted());
        if (!GH.audio.muted()) GH.audio.play('tap');
        openAudio(U.audioFromTitle);
        break;
      }
      case 'open-difficulty': openDifficulty(); break;
      case 'diff-set': {
        const r = S.setDifficulty(el.dataset.diff);
        if (r.ok && !r.unchanged) toast(`Difficulty is now ${D.DIFFICULTIES[el.dataset.diff].name}.`);
        openDifficulty();
        break;
      }
      case 'open-guildhub-build': { const t = document.querySelector('#modal h3:last-of-type'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); break; }
      case 'nav-room': openRoom(el.dataset.id); break;

      // map / outbreaks
      case 'map-zone': S.selectZone(el.dataset.id); openRoom('board'); break;
      case 'region': openRegion(el.dataset.id); break;
      case 'region-board': S.selectZone(el.dataset.id); openRoom('board'); break;
      case 'send-team': {
        const r = S.dispatchTeam(el.dataset.ob, el.dataset.team);
        toast(r.ok ? 'The team marches — results at dawn.' : r.msg);
        // map home re-renders via emit; nothing to open
        break;
      }

      // teams
      case 'team-view': U.teamView = el.dataset.id; openTeams(true); break;
      case 'team-back': U.teamView = null; openTeams(true); break;
      case 'team-new': U.teamDraft = { name: GH.teams.suggestName(), members: new Set() }; openTeams(true); break;
      case 'team-cancel': U.teamDraft = null; openTeams(true); break;
      case 'team-pick': {
        const nm = document.getElementById('teamname'); if (nm) U.teamDraft.name = nm.value;
        const id = el.dataset.id;
        if (U.teamDraft.members.has(id)) U.teamDraft.members.delete(id);
        else if (U.teamDraft.members.size < 4) U.teamDraft.members.add(id);
        openTeams(true); break;
      }
      case 'team-found': {
        const nm = document.getElementById('teamname');
        const g2 = S.get();
        const t = GH.teams.create(g2, (nm && nm.value) || null, Array.from(U.teamDraft.members));
        U.teamDraft = null; U.teamView = t.id;
        S.emit(); toast(`⚑ ${esc(t.name)} raised — “${esc(t.motto)}”`);
        break;
      }
      case 'team-selfform': {
        const t = GH.teams.selfForm(S.get());
        if (t) { U.teamView = t.id; S.emit(); toast(`⚑ ${esc(t.name)} formed on their own.`); }
        else toast('No willing group found — build bonds on shared expeditions first.');
        break;
      }
      case 'team-disband': {
        if (confirm('Disband this team? Their history is not forgotten, but the banner comes down.')) {
          GH.teams.disband(S.get(), el.dataset.id); U.teamView = null; S.emit();
        }
        break;
      }
      case 'use-team': {
        const t = GH.teams.byId(S.get(), el.dataset.id);
        if (t) { U.party = new Set(t.memberIds.filter((id) => { const a = S.findAdv(id); return a && a.status === 'idle'; })); openRoom('board', true); }
        break;
      }

      case 'cook': { const r = S.cook(+el.dataset.i); toast(r.ok ? r.msg : r.msg); break; }
      case 'recruit': { const r = S.recruit(); toast(r.ok ? `Recruited ${r.adv.name}!` : r.msg); break; }
      case 'buy-round': {
        const r = S.buyRound();
        toast(r.ok ? `🍺 A round for ${r.count} (−${r.cost}g) — the hall gathers.` : r.msg);
        if (r.ok && U.panel === 'room') openRoom(U.roomId, true);
        break;
      }
      case 'staff-again': openStaff(el.dataset.id); break;
      case 'train': { const r = S.train(el.dataset.id, el.dataset.skill); toast(r.msg); break; }
      case 'goto-train': U.trainAdv = el.dataset.id; openRoom('training', true); break;
      case 'open-adv': openAdventurer(el.dataset.id); break;
      case 'talk': {
        U.holdPanel = true; const r = S.talk(el.dataset.id); U.holdPanel = false;
        if (!r.ok) break;
        if (r.heart) { showHeartEvent(r.adv, r.heart); break; }
        const d = document.getElementById('dialogue');
        if (!d) { openAdventurer(el.dataset.id, true); }   // sheet not open — rebuild it
        const dd = d || document.getElementById('dialogue');
        if (dd) {
          const adv0 = r.adv || S.findAdv(el.dataset.id);
          bumpAffinity(adv0, r.gained);
          const rd = (GH.personality && GH.personality.readOf) ? GH.personality.readOf(adv0) : {};
          const choices = respChoices(r.responses, rd, el.dataset.id);
          const meta = r.gained ? ` <small class="muted">(+${r.gained} affinity · ${esc(r.tier)})</small>` : '';
          showDialogue(dd, dialogueBlock(adv0, r.line, meta, choices, r.gained ? 'happy' : null));
          const tb = document.querySelector(`#modal [data-action="talk"][data-id="${el.dataset.id}"]`);
          if (tb) tb.classList.add('talked');
        }
        break;
      }
      case 'talk-respond': {
        U.holdPanel = true; const r = S.respondTalk(el.dataset.id, el.dataset.style);
        U.holdPanel = false;
        if (!r.ok) break;
        if (r.heart) { showHeartEvent(r.adv, r.heart); break; }
        const d2 = document.getElementById('dialogue');
        if (d2 && r.reaction) {
          const sign = r.gained > 0 ? '+' : '';
          const adv = r.adv || S.findAdv(el.dataset.id);
          bumpAffinity(adv, r.gained);
          const expr = r.outcome === 'worst' ? 'hurt' : r.gained > 0 ? 'happy' : null;
          showDialogue(d2, dialogueBlock(adv, r.reaction, ` <small class="muted">(${sign}${r.gained} affinity · ${esc(r.tier)})</small>`, '', expr));
        }
        break;
      }
      case 'slot-pick': U.slotPick = { id: el.dataset.id, slot: el.dataset.slot }; openAdventurer(el.dataset.id, true); break;
      case 'slot-cancel': U.slotPick = null; openAdventurer(el.dataset.id, true); break;
      case 'slot-set': {
        U.holdPanel = true;
        S.setSlot(el.dataset.id, el.dataset.slot, el.dataset.val);
        U.holdPanel = false; U.slotPick = null;
        if (window.__haptic) window.__haptic('medium');
        openAdventurer(el.dataset.id, true);
        break;
      }
      case 'auto-assign-all': { const r = S.autoAssignAll(); toast(r.count ? `${r.count} slot${r.count > 1 ? 's' : ''} handed back to Auto.` : 'Everyone is already on Auto.'); break; }
      case 'use-remedy': { const r = S.useRemedy(el.dataset.id, el.dataset.rem); toast(r.msg || 'Not now.'); break; }
      case 'ask-topic': {
        U.holdPanel = true; const r = S.askTopic(el.dataset.id, el.dataset.topic); U.holdPanel = false;
        if (!r.ok) { toast(r.msg || 'Not now.'); break; }
        const adv = r.adv || S.findAdv(el.dataset.id);
        const td = document.getElementById('dialogue');
        if (td) {
          if (r.gained) bumpAffinity(adv, r.gained);
          const meta = r.gained ? ` <small class="muted">(+${r.gained} affinity · ${esc(r.tier)})</small>` : '';
          showDialogue(td, dialogueBlock(adv, r.line, meta, '', r.locked ? null : 'happy', true));
        }
        // grey the asked question out without losing the answer on screen
        el.disabled = true; el.classList.add('done');
        break;
      }
      case 'flirt': {
        U.holdPanel = true; const r = S.flirt(el.dataset.id); U.holdPanel = false;
        if (!r.ok) { toast(r.msg || 'Not now.'); break; }
        if (r.promise) { showPromiseEvent(r.adv, r.promise); break; }
        const fd = document.getElementById('dialogue');
        if (fd) {
          const adv = r.adv || S.findAdv(el.dataset.id);
          bumpAffinity(adv, r.gained);
          const meta = r.rebuff
            ? `<small class="muted"> (${r.gained ? '+' + r.gained + ' affinity · ' : ''}flirting unlocks at Friend — affinity ${adv.affinity || 0}/40)</small>`
            : `<small class="muted"> (+${r.gained} affinity · ♥ ${esc(r.spice || '')})</small>`;
          showDialogue(fd, dialogueBlock(adv, r.line, meta, '', r.rebuff ? null : 'desire'));
          const q = fd.querySelector('.quote'); if (q) q.classList.add('flirtquote');
        }
        break;
      }
      case 'heart-done': { const id = el.dataset.id; openAdventurer(id, true); break; }
      case 'promote': { const r = S.promote(el.dataset.id, el.dataset.promo); toast(r.msg); break; }

      case 'select-zone': S.selectZone(el.dataset.id); openRoom('board', true); break;
      case 'auto-party': { const j = S.findJob(el.dataset.id); if (j && GH.advisor) { const bp = GH.advisor.bestParty(j, S.idle()); U.party = new Set(bp.party); toast(`Suggested ${bp.party.length} — ${bp.note}.`); openRoom('board', true); } break; }
      case 'auto-day': {
        if (!GH.advisor) break;
        const sum = GH.advisor.allocateDay();
        const msg = sum.dispatched.length
          ? `Auto-dispatched ${sum.dispatched.length} expedition${sum.dispatched.length > 1 ? 's' : ''}${sum.cooked ? ' (and served a meal)' : ''}.`
          : 'The advisor found no contracts worth the risk right now.';
        toast(msg); openRoom('board', true); break;
      }
      case 'raise-lot': {
        const r = S.raiseLot(el.dataset.id);
        toast(r.msg);
        if (r.ok) {
          if (window.__haptic) window.__haptic('success');
          hideModal();
        }
        break;
      }
      case 'upgrade': {
        const r = S.upgrade(el.dataset.id);
        toast(r.msg);
        if (r.ok) {
          // The spend needs a felt receipt: buzz, flash the room gold, float
          // the cost + new level off it. (emit() has already rebuilt the
          // panel, so find the room's fresh node before decorating it.)
          if (window.__haptic) window.__haptic('success');
          setTimeout(() => {
            const t = document.querySelector(`[data-action="upgrade"][data-id="${r.id}"], .roomtile[data-id="${r.id}"]`);
            const tile = t ? (t.closest('.roomtile') || t) : null;
            if (!tile) return;
            tile.classList.add('just-upgraded');
            const f = document.createElement('span');
            f.className = 'upfloat';
            f.textContent = `−${r.cost}g · ${r.built ? 'raised!' : 'Lv ' + r.level}`;
            tile.appendChild(f);
            setTimeout(() => { tile.classList.remove('just-upgraded'); f.remove(); }, 1400);
          }, 0);
        }
        break;
      }
      case 'craft': { const r = S.craft(el.dataset.id); toast(r.msg); break; }
      case 'equip-open': U.equipAdv = el.dataset.id; U.equipSlot = el.dataset.slot; if (U.panel === 'armory') openArmory(true); else openAdventurer(el.dataset.id, true); break;
      case 'equip-cancel': { const wasArmory = U.panel === 'armory'; U.equipAdv = null; U.equipSlot = null; if (wasArmory) openArmory(true); else openAdventurer(U.advId, true); break; }
      case 'equip': { U.equipAdv = null; U.equipSlot = null; const r = S.equip(el.dataset.id, el.dataset.gid); if (!r.ok) toast(r.msg); break; }
      case 'gift': { U.equipAdv = null; U.equipSlot = null; const r = S.gift(el.dataset.id, el.dataset.gid); toast(r.ok ? `🎁 "${r.line}" (+${r.gained} affinity)` : r.msg); break; }
      case 'unequip': S.unequip(el.dataset.id, el.dataset.slot); break;
      case 'auto-equip': {
        const r = S.autoEquip();
        toast(r.moves ? `✦ Quartermaster's pass: ${r.moves} piece${r.moves > 1 ? 's' : ''} re-assigned.` : 'Everyone already carries their best fit.');
        if (U.panel === 'armory') openArmory(true);
        break;
      }
      case 'sell-junk': {
        const r = S.sellJunk();
        toast(r.ok ? `Sold ${r.count} surplus piece${r.count > 1 ? 's' : ''} for +${r.gold}g.` : r.msg);
        if (U.panel === 'armory') openArmory(true);
        break;
      }
    }
  }

  // Sliders fire `input` continuously while dragged, which is what makes a
  // volume control feel like one — you hear the change under your thumb rather
  // than after letting go. Writing the save on every tick would be wasteful, so
  // the value is applied live and persisted on release (`change`).
  function applyVol(el, persist) {
    const which = el.dataset.vol;
    const v = Math.max(0, Math.min(1, Number(el.value) / 100));
    if (which === 'music') GH.audio.setMusicVol(v); else GH.audio.setSfxVol(v);
    const pct = document.querySelector(`[data-volpct="${which}"]`);
    if (pct) pct.textContent = Math.round(v * 100) + '%';
    // A sound slider you cannot hear is guesswork: give it something to land on.
    if (persist && which === 'sfx' && v > 0 && !GH.audio.muted()) GH.audio.play('tap');
  }
  document.addEventListener('input', (ev) => {
    if (ev.target.matches('input[data-action="vol-set"]')) applyVol(ev.target, false);
  });

  // checkbox + select changes
  document.addEventListener('change', (ev) => {
    if (ev.target.matches('input[data-action="vol-set"]')) { applyVol(ev.target, true); return; }
    if (ev.target.matches('[data-action="party-toggle"]')) {
      const id = ev.target.dataset.id;
      if (ev.target.checked) U.party.add(id); else U.party.delete(id);
      openRoom('board', true);
    } else if (ev.target.matches('select[data-action="train-pick"]')) {
      U.trainAdv = ev.target.value; openRoom('training', true);
    }
    // (the old `routine-pick` select is gone — a day is two assignable slots
    //  now, so nothing renders that control and nothing can fire this)
  });

  function endDay() {
    const r = S.endDay();
    const g3 = S.get();
    if (GH.tutorial && GH.tutorial.active(g3)) { GH.tutorial.notify(g3, 'day-ended'); S.persist(); }
    U.storyQueue = r.story || [];
    U.pendingOver = r.status.over ? r.status : null;
    // One dawn digest instead of a toast + a separate returns modal;
    // result-done → advanceAfterReturns keeps the story/game-over chain.
    if ((r.returns && r.returns.length) || (r.events && r.events.length)) showDawnDigest(r);
    else { toast(`Day ${S.get().day} begins.`); advanceAfterReturns(); }
  }

  // A campaign win is GRADED, not just declared — days, losses, and treasury
  // against the balance baseline, with later eras allowed longer runs and a
  // costlier butcher's bill. Stored per era (g.victory / victory2 / victory3).
  const GRADE_BANDS = { 1: { day: [70, 95], lost: [0, 2] }, 2: { day: [140, 170], lost: [2, 5] }, 3: { day: [230, 260], lost: [4, 8] } };
  const GRADE_PTS = { Gold: 3, Silver: 2, Bronze: 1 };
  function victoryGrade(g, era) {
    const b = GRADE_BANDS[era] || GRADE_BANDS[1];
    let score = 0;
    if (g.day <= b.day[0]) score += 2; else if (g.day <= b.day[1]) score += 1;
    const lost = (g.fallen || []).length;
    if (lost <= b.lost[0]) score += 2; else if (lost <= b.lost[1]) score += 1;
    if (g.gold >= 500) score += 1;
    const grade = score >= 4 ? 'Gold' : score >= 2 ? 'Silver' : 'Bronze';
    const line = {
      Gold: 'Songs will name this hall for a century.',
      Silver: 'A charter honored — the Compact takes notice.',
      Bronze: 'Hard-won, and won all the same.',
    }[grade];
    return { grade, line, day: g.day, lost, gold: g.gold };
  }
  function gradeLineHtml(v, label) {
    const medal = { Gold: '🥇', Silver: '🥈', Bronze: '🥉' }[v.grade];
    return `<p class="flavor gradeline">${medal} <b>${v.grade} ${label}</b> — day ${v.day},
      ${v.lost === 0 ? 'not one hero lost' : v.lost + ' laid to rest'}, ${v.gold}g in the vault.<br>
      <i>${esc(v.line)}</i></p>`;
  }

  function gameOver(st) {
    const g = S.get();
    const era = g ? (g.era || 1) : 1;
    // NG+ is open to any campaign victory — and to the Era III overrun: a
    // hall that fell at the last gate still has veterans worth carrying.
    const canNGP = (st.won || st.overrun) && g && g.mode === 'campaign' && g.roster.length > 0;
    let gradeHtml = '';
    if (st.won && g && g.mode === 'campaign' && st.endlessDays == null) {
      if (era === 1 && !g.victory) { g.victory = victoryGrade(g, 1); S.persist(); }
      if (era === 2 && !g.victory2) { g.victory2 = victoryGrade(g, 2); S.persist(); }
      if (era === 3 && !g.victory3) {
        g.victory3 = victoryGrade(g, 3);
        // Charter points: grade-weighted across every era of this run,
        // banked account-wide, spent on NG+ boons in the veteran picker.
        const pts = [g.victory, g.victory2, g.victory3].filter(Boolean)
          .reduce((s, v) => s + (GRADE_PTS[v.grade] || 1), 0);
        g.pointsEarned = pts;
        if (!g.pointsBanked) { g.pointsBanked = true; S.addCharterPoints(pts); }
        S.persist();
      }
      const v = era === 3 ? g.victory3 : era === 2 ? g.victory2 : g.victory;
      const label = era === 3 ? 'Legend (Era III)' : era === 2 ? 'Marches Charter (Era II)' : 'Charter';
      if (v) gradeHtml = gradeLineHtml(v, label);
      if (era === 3 && g.pointsEarned) {
        gradeHtml += `<p class="flavor">✦ <b>${g.pointsEarned} Charter Point${g.pointsEarned > 1 ? 's' : ''}</b> earned across three eras — ${S.charterPoints()} banked. Spend them on your next charter.</p>`;
      }
    }
    titleEl.style.display = 'flex';
    titleEl.innerHTML = `<div class="title-card">
      <h1>${st.won ? 'A Legend Made' : 'The Hall Goes Dark'}</h1>
      <p class="flavor">${esc(st.msg)}</p>
      ${gradeHtml}
      ${g && g.prestige ? `<p class="flavor">✦ Charter ${g.prestige + 1} complete.</p>` : ''}
      ${st.endlessDays != null ? `<p class="flavor">🛡 Held the line for <b>${st.endlessDays}</b> days${st.best ? ` · best: <b>${st.best}</b>` : ''}.</p>` : ''}
      <div class="title-actions">
        ${st.won && era === 1 && canNGP ? '<button class="primary" data-action="era2-open">⚑ Open the Marches (Era II)</button>' : ''}
        ${st.won && era === 2 && canNGP ? '<button class="primary" data-action="era3-open">⛧ Descend to the Rift (Era III)</button>' : ''}
        ${canNGP ? `<button ${st.won && era <= 2 ? '' : 'class="primary"'} data-action="ngp-open">⚑ Charter a New Hall (NG+)</button>` : ''}
        ${st.won && canNGP ? '<button data-action="endless-start">🛡 Hold the Line (Endless)</button>' : ''}
        <button ${canNGP ? '' : 'class="primary"'} data-action="newgame-after">Begin Again</button>
      </div>
    </div>`;
    titleEl.querySelector('[data-action="newgame-after"]').addEventListener('click', () => { S.clear(); showTitle(); });
    const eraBtn = (sel, fn) => {
      const el = titleEl.querySelector(sel);
      if (el) el.addEventListener('click', () => {
        const r = fn();
        if (!r.ok) { toast(r.msg || 'Not yet.'); return; }
        titleEl.style.display = 'none'; showGame();
        U.storyQueue = GH.story ? GH.story.takePending(S.get()) : [];
        if (U.storyQueue.length) showStory();
      });
    };
    eraBtn('[data-action="era2-open"]', S.beginEra2);
    eraBtn('[data-action="era3-open"]', S.beginEra3);
    const ngp = titleEl.querySelector('[data-action="ngp-open"]');
    if (ngp) ngp.addEventListener('click', () => { titleEl.style.display = 'none'; openVeteranPicker(); });
    const el2 = titleEl.querySelector('[data-action="endless-start"]');
    if (el2) el2.addEventListener('click', () => {
      S.startEndless(); titleEl.style.display = 'none'; showGame();
      toast('🛡 Endless begins. Best so far: ' + (S.endlessBest() || '—') + ' days. Hold.');
    });
  }

  // NG+ veteran picker — one hero carries the old banner into the new charter.
  // Charter points (earned by finishing Era III) buy boons here.
  function openVeteranPicker() {
    const g = S.get();
    const pts = S.charterPoints ? S.charterPoints() : 0;
    const picking2nd = !!U.ngpFirst;
    const rows = g.roster.filter((a) => a.id !== U.ngpFirst).map((a) => `<div class="pickrow" data-action="ngp-pick" data-id="${a.id}" style="cursor:pointer">
      ${GH.portraits.img(a, 44)}
      <span class="grow"><b>${esc(a.name)}</b>${a.sworn ? ' <span class="ctag bonus">⚔ sworn</span>' : ''}
        <br><small>${a.classAdv ? esc(a.classAdv) : esc(a.class)} Lv${a.level} · ${a.contracts} contracts</small></span>
      <span class="modpill ok">carry ▸</span></div>`).join('');
    const boons = (!picking2nd && pts > 0) ? `<div class="boonbox">
        <b>✦ Charter Points: ${pts}</b> <small class="muted">— earned by ending the song. Spend them on this charter:</small>
        <label class="boonrow"><input type="checkbox" id="boon-companion" ${pts >= 2 ? '' : 'disabled'}>
          <span>Old Companion <b>(2 pts)</b> — a second veteran follows the first</span></label>
        <label class="boonrow"><input type="checkbox" id="boon-endowment" ${pts >= 1 ? '' : 'disabled'}>
          <span>Patron's Endowment <b>(1 pt)</b> — +250g in the new vault</span></label>
      </div>` : '';
    showCine(`<div class="sheet-head"><h2>${picking2nd ? 'And who follows them?' : 'Who carries the banner?'}</h2></div>
      <p class="muted">${picking2nd ? 'The Old Companion boon: choose the second veteran to walk in beside the first.'
        : `One veteran joins your new charter — level, skills, gear, and their bond with you intact.
      The realm grows harder (+1 DC) and richer (+10% pay) with every charter. The fallen will be remembered.`}</p>
      ${boons}
      ${rows}`);
    U.panel = 'ngp';
  }

  // modalOpen/hideModal are exposed for the native (Android) back-button bridge.
  function modalOpen() { return !!(modalEl && modalEl.classList.contains('open')); }

  return { mount, openRoom, openAdventurer, openStaff, openWing, openVillageLot, toast, toastFromHall: toast, hideModal, modalOpen,
    syncZoom: syncZoomRead };
})();
