/* Procedural pixel portraits: crop the sprite head, tint per ancestry,
 * frame per class. Cached as data URLs; regenerated per adventurer id.
 */
window.GH = window.GH || {};

GH.portraits = (function () {
  const cache = {};          // key → dataURL
  let sheet = null;          // loaded sprite image
  let ready = false;
  const onReadyFns = [];

  const CLASS_COLOR = {
    Fighter: '#a23a2e', Rogue: '#5c5c6e', Wizard: '#5c7a93',
    Cleric: '#c0a04a', Ranger: '#6f8f4e', Bard: '#8a6aa3',
  };

  // Optional anime-portrait manifest (see docs/asset-production-plan.md §8).
  // Absent manifest = procedural portraits; art drops in with zero code changes.
  let manifest = null;
  function load() {
    const img = new Image();
    img.onload = () => { sheet = img; ready = true; onReadyFns.forEach((f) => f()); };
    img.src = 'assets/chars/player.png';
    fetch('assets/portraits/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { if (m && Array.isArray(m.pool) && m.pool.length) { manifest = m; if (GH.sim && GH.sim.get()) GH.sim.emit(); } })
      .catch(() => {});
  }
  function onReady(fn) { if (ready) fn(); else onReadyFns.push(fn); }

  // Stable per-adventurer pick from the manifest pool (exact → ancestry → any).
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return Math.abs(h); }
  function poolFile(a) {
    if (!manifest) return null;
    const packId = (window.GH && GH.shop) ? GH.shop.activePack() : 'classic';
    let pool = manifest.pool.filter((p) => (p.pack || 'classic') === packId);
    if (!pool.length) pool = manifest.pool;        // pack empty → fall back to everything
    // persisted assignment stays only while it belongs to the active pack
    if (a.portraitFile && pool.some((p) => p.file === a.portraitFile)) return a.portraitFile;
    let cands = pool.filter((p) => p.ancestry === a.ancestry && p.class === a.class);
    if (!cands.length) cands = pool.filter((p) => p.ancestry === a.ancestry);
    if (!cands.length) cands = pool;
    const pick = cands[hash(a.id) % cands.length];
    a.portraitFile = pick.file;                    // persisted with the save
    a.portraitExpr = pick.expressions || null;
    return pick.file;
  }
  // Which expression should this adventurer wear right now?
  // Priority: forced override > injured(hurt) > grieving(grief) > joyful(happy).
  function moodExpr(a) {
    if (a.status === 'injured') return 'hurt';
    if (a.grieving > 0) return 'grief';
    if (a.happy >= 80) return 'happy';
    return null;
  }

  // Expression-aware source. expr override wins (e.g. 'desire' for the
  // confession heart, 'fury' on battle rows); falls back to the base art.
  function srcFor(a, expr) {
    const base = poolFile(a);
    if (!base) return null;
    const want = expr || moodExpr(a);
    if (want && a.portraitExpr && a.portraitExpr[want]) return 'assets/portraits/' + a.portraitExpr[want];
    return 'assets/portraits/' + base;
  }
  function artSrc(a) { return srcFor(a, null); }

  // VN-style conversation bust (transparent cutout), if the pack provides them.
  // Falls back to the framed art (CSS-masked) or null → caller uses portrait.
  function bustSrc(a, expr) {
    if (!manifest || !Array.isArray(manifest.bustFiles)) return null;
    const src = srcFor(a, expr);
    if (!src) return null;
    const fname = src.replace('assets/portraits/', '');
    if (!manifest.bustFiles.includes(fname)) return null;   // no cutout yet → caller falls back
    return 'assets/portraits/busts/' + fname;   // pool + busts both ship as webp
  }

  // Build a portrait data URL for an adventurer.
  function make(a, size) {
    size = size || 96;
    const key = a.id + '_' + size + '_' + (a.status === 'dead' ? 'd' : 'a');
    if (cache[key]) return cache[key];
    if (!sheet) return null;

    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // background: class color wash
    const cls = CLASS_COLOR[a.class] || '#3a2f22';
    ctx.fillStyle = '#15110b'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = cls + '55'; ctx.fillRect(0, 0, size, size);

    // head crop from frame (0,0): head sits ~x8..24, y2..20 of the 32px frame
    const sx = 8, sy = 2, sw = 16, sh = 18;
    const pad = size * 0.12;
    ctx.drawImage(sheet, sx, sy, sw, sh, pad, pad, size - pad * 2, size - pad * 2);

    // ancestry tint (multiply)
    if (a.tint) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#' + a.tint.toString(16).padStart(6, '0');
      ctx.globalAlpha = 0.28;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // dead → desaturate wash
    if (a.status === 'dead') {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#00000066'; ctx.fillRect(0, 0, size, size);
    }

    // frame
    const bw = Math.max(2, Math.round(size / 24));
    ctx.strokeStyle = cls; ctx.lineWidth = bw * 2;
    ctx.strokeRect(bw, bw, size - bw * 2, size - bw * 2);
    ctx.strokeStyle = '#d9a441'; ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2, bw / 2, size - bw, size - bw);

    const url = c.toDataURL();
    cache[key] = url;
    return url;
  }

  // <img> tag helper — anime art from the manifest when present,
  // procedural pixel crop otherwise (placeholder square until the sheet loads).
  function img(a, px) {
    px = px || 44;
    const art = artSrc(a);
    if (art) return `<img class="portrait art" src="${art}" style="width:${px}px;height:${px}px" alt="">`;
    const url = make(a, Math.max(64, px * 2));
    if (!url) return `<span class="portrait ph" style="width:${px}px;height:${px}px"></span>`;
    return `<img class="portrait" src="${url}" style="width:${px}px;height:${px}px" alt="">`;
  }

  load();
  return { make, img, onReady, poolFile, artSrc, srcFor, bustSrc, moodExpr };
})();
