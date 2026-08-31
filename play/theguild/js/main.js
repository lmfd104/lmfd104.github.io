/* Bootstrap. */
(function () {
  async function boot() {
    // Native bridge (Android) restores the save from Preferences into
    // localStorage before load(); resolves immediately on web.
    await (window.__nativeReady || Promise.resolve());
    // Decide the portrait pack BEFORE a save can exist — see shop.initDefaultPack.
    if (GH.shop && GH.shop.initDefaultPack) GH.shop.initDefaultPack();
    GH.sim.load();
    // Screenshot rig: "#dev=seed,board" seeds a deterministic sandbox (only on
    // a profile with no save) and jumps straight to a panel once the UI is up.
    // tools/shoot_ui.sh drives headless Chrome through every screen with it.
    // Inert without the hash — a normal launch never matches.
    const dev = /[#&]dev=([\w,-]+)/.exec(location.hash);
    if (dev && dev[1].split(',').includes('seed') && !GH.sim.get()) {
      GH.sim.newGame('The Stamped Scroll', { mode: 'sandbox', seed: 7 });
      GH.sim.persist();   // mount() decides title-vs-game off the STORED save
    }
    GH.hall.init('game');
    GH.ui.mount();
    if (dev) {
      const target = dev[1].split(',').find((t) => t !== 'seed');
      if (target) setTimeout(() => {
        if (target.indexOf('room-') === 0) GH.ui.openRoom(target.slice(5));
        else if (target === 'adv') { const g = GH.sim.get(); if (g && g.roster[0]) GH.ui.openAdventurer(g.roster[0].id); }
        else if (target === 'staff') GH.ui.openStaff('brann');
        else {
          const btn = document.querySelector(`[data-nav="${target}"]`) || document.querySelector(`[data-action="${target}"]`);
          if (btn) btn.click();
        }
      }, 900);
    }
    // re-render once the portrait sprite sheet is ready
    GH.portraits.onReady(() => { if (GH.sim.get()) GH.sim.emit(); });
  }
  // Wait for the durable-storage mirror to restore any evicted keys before
  // the first save read. On web GH.store.ready is already resolved.
  function start() { GH.store.ready.then(boot); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
