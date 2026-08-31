/* Where you can walk in the hall, and where you are going.
 *
 * Split out of js/hall.js so it is not locked inside the renderer. Every table
 * here is a plain table and every function is arithmetic over it — no Phaser,
 * no DOM — so guild_data.json can ship it to the engine ports and a parity
 * vector can pin the routing. Inside hall.js none of that was possible, and
 * both rebuilt engines would have had to re-derive a waypoint graph by eye.
 *
 * The pathing is deliberately a small hand-placed GRAPH rather than a grid
 * search: routes have to go THROUGH doorways, and a grid search happily hugs a
 * wall and cuts the corner through a doorframe. Nodes sit on the lanes and in
 * the doorways, so a route that reaches a room went in by the door.
 */
window.GH = window.GH || {};

GH.nav = (function () {
  const D = GH.data;
  const SIZE = 1280;              // the hall's world, same units as ROOMS rects

  const SEATS = [
    [0.47, 0.42], [0.560, 0.320],
    [0.408, 0.418], [0.520, 0.418],
    [0.550, 0.545],
  ];

  const SPOTS = {
    kitchen: [[0.10, 0.16], [0.14, 0.24], [0.075, 0.315]],  // STAFF ONLY (Maribel)
    dorm: [[0.28, 0.90], [0.33, 0.90], [0.28, 0.94], [0.33, 0.94]],
    yard: [[0.80, 0.90], [0.85, 0.93], [0.78, 0.94]],
    forge: [[0.52, 0.91], [0.575, 0.93]],
    tavern: SEATS,
  };

  const PROP_SOLIDS = [
    // ONLY the level-gated hearth-side props live here now. Every wall and
    // every piece of base furniture is in assets/hall/solids.json, EMITTED by
    // tools/gen_hall_build.py from the same floorplan that draws them — a
    // drawn wall you can walk through is impossible by construction. These
    // five stay hand-listed because they appear with the tavern's level, and
    // the rug is deliberately absent: you walk on a rug.
    [0.654, 0.241, 0.042, 0.055],   // the great hearth
    [0.685, 0.429, 0.030, 0.026],   // long table at the fire
    [0.746, 0.435, 0.017, 0.033],   // barrels
    [0.624, 0.262, 0.022, 0.043],   // tall plant
    [0.727, 0.263, 0.041, 0.032],   // chest
  ];

  const NODES = {
    kitchen: [0.11, 0.22], pantry: [0.08, 0.30],
    // the kitchen-tavern doorway (both rooms' doors align at rows 11-12,
    // ABOVE the bar — the bar hugs the west wall south of it)
    kdoor: [0.20, 0.225], tdoorW: [0.235, 0.225],
    // the great hall's lane runs along the clear aisle in FRONT of the tables
    hallL: [0.30, 0.545], hallC: [0.50, 0.545], hallR: [0.66, 0.545],
    // the corridor, with a node lined up under each doorway it serves
    corrL: [0.325, 0.615], corrC: [0.50, 0.615], corrF: [0.60, 0.615], corrR: [0.875, 0.615],
    bdoor: [0.165, 0.615], boardI: [0.10, 0.61],
    // The south range: an approach on the ground outside each door and one
    // node on the floor, so a route goes THROUGH the doorway.
    dormD: [0.325, 0.70], dormI: [0.325, 0.88],
    forgeD: [0.60, 0.70], forgeI: [0.60, 0.88],
    trainD: [0.875, 0.70], trainI: [0.875, 0.88],
  };

  const EDGES = {
    kitchen: ['kdoor', 'pantry'], pantry: ['kitchen'],
    kdoor: ['kitchen', 'tdoorW'], tdoorW: ['kdoor', 'hallL'],
    hallL: ['tdoorW', 'hallC'], hallC: ['hallL', 'hallR', 'corrC'], hallR: ['hallC'],
    corrC: ['hallC', 'corrL', 'corrF'],
    corrL: ['corrC', 'bdoor', 'dormD'],
    corrF: ['corrC', 'corrR', 'forgeD'],
    corrR: ['corrF', 'trainD'],
    bdoor: ['corrL', 'boardI'], boardI: ['bdoor'],
    dormD: ['corrL', 'dormI'], dormI: ['dormD'],
    forgeD: ['corrF', 'forgeI'], forgeI: ['forgeD'],
    trainD: ['corrR', 'trainI'], trainI: ['trainD'],
  };

  const NODE_ROOM = {
    kitchen: 'kitchen', pantry: 'kitchen', boardI: 'board',
    trainD: 'training', trainI: 'training',
    forgeD: 'smithy', forgeI: 'smithy',
    dormD: 'dormitory', dormI: 'dormitory',
  };

  const POOL_ROOM = { yard: 'training', dorm: 'dormitory', tavern: 'tavern', forge: 'smithy' };

  // A buildable room that has not been raised is not somewhere you can be.
  // board and the great hall are the guild itself and are always open; with no
  // game loaded at all the whole building shows, which is what the hall
  // preview on the title screen wants.
  function roomOpen(id) {
    const fac = D.FACILITIES[id];
    if (!fac || !fac.buildable) return true;
    const S = GH.sim;
    if (!S || !S.get || !S.get()) return true;
    return S.facLevel(id) > 0;
  }

  // A lane through a room that has not been built is not a lane, so nodes
  // inside an unraised room drop out of the graph and nobody strolls into a
  // boarded-up plot.
  function nodeOpen(k) {
    const rid = NODE_ROOM[k];
    return !rid || roomOpen(rid);
  }

  function nearestNode(x, y) {
    let best = null, bd = 1e9;
    Object.entries(NODES).forEach(([k, [nx, ny]]) => {
      if (!nodeOpen(k)) return;
      const d = (nx * SIZE - x) ** 2 + (ny * SIZE - y) ** 2;
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }

  // nearest node to each end, then a breadth-first walk between them. BFS
  // rather than Dijkstra because every edge here is one lane and the graph is
  // eighteen nodes — the shortest hop count IS the sensible route.
  function routeBetween(x1, y1, x2, y2) {
    const a = nearestNode(x1, y1), b = nearestNode(x2, y2);
    if (!a || !b || a === b) return [];
    const prev = { [a]: null }, q = [a];
    while (q.length) {
      const n = q.shift();
      if (n === b) break;
      (EDGES[n] || []).forEach((m) => { if (!(m in prev) && nodeOpen(m)) { prev[m] = n; q.push(m); } });
    }
    if (!(b in prev)) return [];
    const path = [];
    for (let n = b; n; n = prev[n]) path.unshift(NODES[n]);
    return path.map(([nx, ny]) => [nx * SIZE, ny * SIZE]);
  }

  // The names of the nodes a route passes through, which is what a test can
  // read. routeBetween returns coordinates because that is what the renderer
  // wants; this is the same walk, reported.
  function routeNodes(x1, y1, x2, y2) {
    const a = nearestNode(x1, y1), b = nearestNode(x2, y2);
    if (!a || !b || a === b) return [];
    const prev = { [a]: null }, q = [a];
    while (q.length) {
      const n = q.shift();
      if (n === b) break;
      (EDGES[n] || []).forEach((m) => { if (!(m in prev) && nodeOpen(m)) { prev[m] = n; q.push(m); } });
    }
    if (!(b in prev)) return [];
    const path = [];
    for (let n = b; n; n = prev[n]) path.unshift(n);
    return path;
  }

  return {
    SIZE, SEATS, SPOTS, PROP_SOLIDS, NODES, EDGES, NODE_ROOM, POOL_ROOM,
    roomOpen, nodeOpen, nearestNode, routeBetween, routeNodes,
  };
})();
