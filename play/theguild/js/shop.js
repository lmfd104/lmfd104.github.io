/* Shop & entitlements — cosmetic packs (the monetization plan's cosmetic lane).
 * Entitlements live in their own localStorage key: account-wide, not per-save,
 * so purchases survive New Game / New Game+.
 * Store wiring (Play Billing / StoreKit / RevenueCat) replaces `purchase()`
 * when the mobile build lands; until then it's a clearly-labeled dev unlock.
 */
window.GH = window.GH || {};

GH.shop = (function () {
  const KEY = 'guildhall_owned';
  const PREF = 'guildhall_style_pack';

  // Cosmetic catalog — first entry ships free as the default look.
  const PACKS = [
    { id: 'classic', name: 'Guild Classic', price: null,
      desc: 'The hand-drawn cast of the guild — every ancestry, every class.',
      samples: ['elf_wizard_1.webp', 'halforc_ranger_1.webp', 'gnome_wizard_1.webp'] },
    { id: 'painted', name: 'Painted Legends', price: '$2.99', productId: 'guildhall_pack_painted',
      desc: 'Your roster reimagined as painterly heroes — gallery-grade portraits for the whole pool.',
      samples: ['p_elf_wizard_1.webp', 'p_human_fighter_1.webp', 'p_halfling_bard_1.webp'] },
    { id: 'inked', name: 'Inked', price: null,
      desc: 'Bold lineart and hard cel shading — the same hand that draws the region bosses, turned on your own roster.',
      samples: ['n_elf_wizard_1.webp', 'n_dwarf_fighter_1.webp', 'n_human_ranger_1.webp'] },
    { id: 'wildkin', name: 'Wildkin', price: null,
      desc: 'A full alternate cast — anime adventurers with varied poses and a mix of beastfolk-touched heroes across every ancestry and class.',
      samples: ['w_elf_rogue_1.webp', 'w_human_fighter_1.webp', 'w_gnome_bard_1.webp'] },
  ];
  // Hall themes — the second cosmetic lane: palette variants of the one
  // Hearthwood UI system (css/styles.css). Hearthwood ships free as the
  // default; the Wardrobe bundle unlocks the other four. The id 'royal' is
  // the free slot's SAVED id — keep it even though the look moved on.
  const THEMES = [
    { id: 'royal', name: 'Hearthwood', file: 'ui-skin-royal.css?v=12', free: true,
      desc: 'Oak, parchment and gold — the hall as you know it.' },
    { id: 'cozy', name: 'Hearthside', file: 'ui-skin-cozy.css?v=5',
      desc: 'Candlelit — aged parchment and ember-red timber.' },
    { id: 'arcane', name: 'Arcane Violet', file: 'ui-skin-arcane.css?v=5',
      desc: 'Plum and lavender — a hall run by wizards.' },
    { id: 'midnight', name: 'Midnight Watch', file: 'ui-skin-midnight.css?v=5',
      desc: 'The dark theme — night slate, iron-blue timber.' },
    { id: 'clean', name: 'Fieldbook', file: 'ui-skin-clean.css?v=5',
      desc: 'A surveyor\'s notebook — bright paper, slate and brass.' },
  ];
  const WARDROBE = {
    id: 'wardrobe', name: 'The Guild Wardrobe', price: '$1.99', productId: 'guildhall_pack_themes',
    desc: 'Four complete hall themes — Hearthside, Arcane Violet, Midnight Watch, and Fieldbook. Redecorate whenever the mood takes you.',
  };
  // Content unlock — the premium model: first two regions free, the charter
  // opens the rest. Price moves $4.99 → $6.99 WITH the three-era update: new
  // buyers pay for the bigger game, existing owners get every era free.
  const CHARTER = {
    id: 'charter', name: 'The Guild Charter', price: '$6.99', productId: 'guildhall_charter',
    desc: 'Unlock the full three-era campaign — the deep regions, the Marches, and the Rift — plus Challenges and Sandbox. All future eras included. Yours forever.',
  };

  const BY_ID = Object.fromEntries(PACKS.concat([CHARTER, WARDROBE]).map((p) => [p.id, p]));

  function ownedSet() {
    try { return new Set(JSON.parse(GH.store.get(KEY) || '[]')); } catch (e) { return new Set(); }
  }
  function owned(id) { return !BY_ID[id] || BY_ID[id].price == null || ownedSet().has(id); }
  function grant(id) {
    const s = ownedSet(); s.add(id);
    try { GH.store.set(KEY, JSON.stringify(Array.from(s))); } catch (e) {}
  }

  // Where the free-grant dev stub is allowed to run. It must NEVER be reachable on the public web
  // build: the hosted demo is served from the same files as the paid Android app, so a stub that
  // grants on any billing-less platform would hand every visitor the $4.99 Charter and every
  // cosmetic pack for nothing. Keyed on hostname rather than a flag or query param because those
  // can be set by anyone loading the page; a remote visitor cannot make themselves localhost.
  const DEV_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

  // Split out and exported as _devHostAllowed so it can be exercised for BOTH answers. A gate whose
  // permissive branch is the one that runs on the developer's own machine is invisible to any test
  // run there: everything passes locally whether or not the deny path works at all. The only honest
  // check is to feed it the hostnames it will actually see in production.
  function devHostAllowed(hostname) {
    // An empty hostname is file:// — a local dev open, not a hosted page.
    if (!hostname) return true;
    return DEV_HOSTS.indexOf(hostname) !== -1;
  }

  function devPurchasesAllowed() {
    try {
      if (devHostAllowed(location.hostname)) return true;
    } catch (e) {}
    return window.GH_DEV_PURCHASES === true;
  }

  /** True when nothing can actually be bought here — the hosted web demo. */
  function isDemo() {
    const store = !!(window.GH && GH.billing && GH.billing.available());
    return !store && !devPurchasesAllowed();
  }

  // Store purchase — goes through the platform billing adapter (js/billing.js,
  // RevenueCat on native Capacitor builds) when available. Returns a Promise on
  // that path. Off-store it either refuses (hosted demo) or runs the labeled dev
  // stub synchronously, exactly as before.
  function purchase(id) {
    const pack = BY_ID[id];
    if (window.GH && GH.billing && GH.billing.available() && pack && pack.productId) {
      return GH.billing.purchase(pack.productId).then((r) => {
        if (r && r.ok) grant(id);
        return r;
      });
    }
    // Hosted demo: refuse rather than grant. The caller shows the store upsell.
    if (!devPurchasesAllowed()) return { ok: false, demo: true, error: 'demo' };
    // Dev stub — local development only.
    grant(id);
    return { ok: true, dev: true };
  }

  // Restore prior store purchases (native only) and grant their packs.
  // Resolves { ok, restored: [packId...], error? }.
  function restorePurchases() {
    if (!(window.GH && GH.billing && GH.billing.available())) {
      return Promise.resolve({ ok: false, restored: [], error: 'billing_unavailable' });
    }
    return GH.billing.restore().then((r) => {
      const granted = [];
      if (r && r.ok && Array.isArray(r.restored)) {
        for (const productId of r.restored) {
          const item = PACKS.concat([CHARTER, WARDROBE]).find((p) => p.productId === productId);
          if (item && !ownedSet().has(item.id)) { grant(item.id); granted.push(item.id); }
        }
      }
      return { ok: !!(r && r.ok), restored: granted, error: r && r.error };
    });
  }

  const DEFAULT_PACK = 'inked';
  // Switching the default is not free: portraits.js keeps a saved assignment
  // ONLY while it belongs to the active pack, and `a.portraitFile` is persisted
  // per character — so a player who never opened Portrait Styles would come back
  // to a roster of strangers. Anyone who already has a guild is pinned to what
  // they have been looking at; only fresh installs get the new default.
  // Must run at BOOT, before a game can exist. Resolving this lazily inside
  // activePack() looked right and was wrong: portraits.js does not ask until it
  // needs a face, by which point newGame has already written a save — so a
  // fresh install answered "a save exists" and pinned itself to Classic. The
  // question is only meaningful before load().
  function initDefaultPack() {
    try {
      if (GH.store.get(PREF)) return;
      GH.store.set(PREF, GH.store.get('guildhall_save_v1') ? 'classic' : DEFAULT_PACK);
    } catch (e) {}
  }
  function activePack() {
    try { const p = GH.store.get(PREF); return p && owned(p) ? p : DEFAULT_PACK; } catch (e) { return DEFAULT_PACK; }
  }
  function setActivePack(id) {
    if (!owned(id)) return { ok: false, msg: 'Not owned yet.' };
    try { GH.store.set(PREF, id); } catch (e) {}
    return { ok: true };
  }

  // --- Hall themes: swap the skin stylesheet at runtime, remember the pick.
  const THEME_PREF = 'guildhall_theme';
  const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
  function themeOwned(id) { const t = THEME_BY_ID[id]; return !!t && (t.free || owned('wardrobe')); }
  function activeTheme() {
    try { const t = GH.store.get(THEME_PREF); return t && themeOwned(t) ? t : 'royal'; } catch (e) { return 'royal'; }
  }
  // Swapping the stylesheet is the DOM half of choosing a theme, and it is the
  // only part of this module that needs one. Guarded so the decision half
  // (owned? remembered?) runs headless — under a test, and in an engine that
  // has no DOM at all. The boot-time call below already had to try/catch this;
  // a no-op without a document is more honest than swallowing a TypeError.
  function applyTheme(id) {
    if (typeof document === 'undefined' || !document) return;
    const t = THEME_BY_ID[id] || THEME_BY_ID.royal;
    const link = document.getElementById('skinlink');
    if (link && !link.getAttribute('href').endsWith(t.file)) link.setAttribute('href', 'css/' + t.file);
  }
  function setActiveTheme(id) {
    if (!themeOwned(id)) return { ok: false, msg: 'Unlock the Guild Wardrobe first.' };
    try { GH.store.set(THEME_PREF, id); } catch (e) {}
    applyTheme(id);
    return { ok: true };
  }
  // Apply the remembered theme at load (the link tag is already in <head>).
  try { applyTheme(activeTheme()); } catch (e) {}

  return { PACKS, CHARTER, WARDROBE, THEMES, BY_ID, owned, grant, purchase, restorePurchases,
    isDemo, _devHostAllowed: devHostAllowed,
    activePack, setActivePack, initDefaultPack, themeOwned, activeTheme, setActiveTheme, applyTheme };
})();
