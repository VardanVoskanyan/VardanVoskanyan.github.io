// Random walks on the Infini-Cube: a seeded generator and step distributions.
(function (global) {
  'use strict';

  // mulberry32: small, fast, seedable.
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Each sample returns a depth interval [a, b] with a < b.
  const DISTRIBUTIONS = {
    uniform: {
      label: 'Uniform interval',
      sample(r) {
        const x = r(), y = r();
        return [Math.min(x, y), Math.max(x, y)];
      },
    },
    outer: {
      label: 'Outer layer X[s]',
      sample(r) { return [0, r()]; },
    },
    mixed: {
      label: 'Uniform or outer, 50/50',
      sample(r) { return r() < 0.5 ? DISTRIBUTIONS.uniform.sample(r) : DISTRIBUTIONS.outer.sample(r); },
    },
    width: {
      label: 'Fixed width w',
      param: { name: 'w', value: 0.05, min: 0.001, max: 1, step: 0.01 },
      sample(r, w) {
        const a = r() * (1 - w);
        return [a, a + w];
      },
    },
    grid: {
      label: 'Grid 1/n (n×n×n cube)',
      param: { name: 'n', value: 7, min: 1, max: 1000, step: 1 },
      sample(r, n) {
        n = Math.max(1, Math.round(n));
        const i = Math.floor(r() * (n + 1));
        let j = Math.floor(r() * n);
        if (j >= i) j++;
        return [Math.min(i, j) / n, Math.max(i, j) / n];
      },
    },
  };

  // A random move: axis uniform over R, U, F; turn uniform over 1, 2, 3.
  function randomMove(r, dist, param) {
    const [a, b] = DISTRIBUTIONS[dist].sample(r, param);
    return { face: 'RUF'[Math.floor(r() * 3)], a, b, q: 1 + Math.floor(r() * 3) };
  }

  global.InfiniCube.walk = { rng, DISTRIBUTIONS, randomMove };
})(typeof window !== 'undefined' ? window : globalThis);
