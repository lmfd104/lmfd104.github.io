/* The dock: which tabs exist, and what needs attention.
 *
 * Split out of js/ui.js's renderNav so the two engine ports share it. The tab
 * LIST is the app's information architecture — five places, named for the
 * place or the verb — and the badge rules are the game's "pull, don't push"
 * principle: things needing attention show as a count on their tab instead of
 * an interrupting popup. Both are decisions the rebuilt apps must reproduce,
 * neither is rendering.
 */
window.GH = window.GH || {};

GH.uinav = (function () {
  // ORDERED, and the order is the dock. Labels name the PLACE or the VERB:
  // "Teams" hid the roster (and therefore hiring); "Guild" meant nothing next
  // to a game called The Guild — it is where you build. `icon` is the
  // assets/ui/<icon>.png stem each renderer draws however it draws icons.
  const TABS = [
    { id: 'hall', label: 'Hall', icon: 'nav_guild' },
    { id: 'map', label: 'Map', icon: 'nav_map' },
    { id: 'board', label: 'Work', icon: 'nav_board' },
    { id: 'teams', label: 'People', icon: 'nav_teams' },
    { id: 'guild', label: 'Build', icon: 'nav_armory' },
  ];

  /* What each tab's attention count is, from the state alone.
   *   map    open outbreaks — the realm is on fire
   *   board  unaccepted contracts on their LAST day, in reachable zones —
   *          use them or lose them
   *   guild  a tavern visitor whose offer has not expired — hire or miss them
   * hall and teams never badge: nothing in them expires.
   */
  function badges(g) {
    if (!g) return { hall: 0, map: 0, board: 0, teams: 0, guild: 0 };
    const map = (g.outbreaks || []).filter((o) => o.status === 'open').length;
    const board = (g.board || []).filter((j) => !j.isBoss && j.status === 'open'
      && j.boardDays === 1 && (g.zonesUnlocked || []).includes(j.zoneId)).length;
    const guild = (g.visitor && g.day <= g.visitor.expiresDay) ? 1 : 0;
    return { hall: 0, map, board, teams: 0, guild };
  }

  return { TABS, badges };
})();
