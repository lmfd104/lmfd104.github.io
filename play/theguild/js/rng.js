/* Randomness helpers. */
window.GH = window.GH || {};
GH.rng = (function () {
  // All randomness routes through rand() so a seed can be swapped in
  // temporarily (seeded guild generation) without touching call sites.
  let rand = Math.random;
  const float = () => rand();          // raw 0..1, still swappable by withSeed
  const int = (n) => Math.floor(rand() * n);
  const die = (n) => int(n) + 1;
  const d20 = () => die(20);
  const pick = (a) => a[int(a.length)];
  const chance = (p) => rand() < p;
  function withSeed(seed, fn) {
    const prev = rand;
    rand = seeded(seed).rnd;
    try { return fn(); } finally { rand = prev; }
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function weighted(items) { const t = items.reduce((s, x) => s + (x.weight || 1), 0); let r = rand() * t; for (const x of items) { r -= (x.weight || 1); if (r <= 0) return x; } return items[items.length - 1]; }
  // Deterministic PRNG (mulberry32) — same seed, same sequence, everywhere.
  // Used for the Weekly Trial so every player gets the same scenario.
  function seeded(seed) {
    let t = seed >>> 0;
    const rnd = () => {
      t += 0x6D2B79F5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    return {
      rnd,
      int: (n) => Math.floor(rnd() * n),
      pick: (a) => a[Math.floor(rnd() * a.length)],
      chance: (p) => rnd() < p,
    };
  }
  return { float, int, die, d20, pick, chance, shuffle, weighted, seeded, withSeed };
})();
