// Infini-Cube state model.
//
// The cube is [0,1]^3 with x from L (0) to R (1), y from D (0) to U (1) and
// z from B (0) to F (1). Each face is stored on a grid whose cut points are
// exactly the move endpoints used so far, closed under t -> 1-t, so any real
// endpoint is represented exactly. Cuts that no longer separate different
// cells are pruned after every move.
//
// Grid coordinates: along each axis a point is either an interval index
// 0..k-1, or -1 / k for the faces at 0 / 1. Because the cuts are symmetric,
// the reflection t -> 1-t is simply p -> k-1-p.
//
// Every move acts on a point either trivially or as one of the 24 rotations
// of the whole cube, so the full state is a label per cell: the rotation h
// that brought its content there (the content at p started at h^-1 p).
// Colours are derived from labels.
(function (global) {
  'use strict';

  const EPS = 1e-9;
  const PRUNE_ALWAYS_BELOW = 200; // grid size k
  const PRUNE_EVERY = 32; // moves

  // Face order doubles as the initial colour index.
  const FACE_NAMES = ['U', 'L', 'F', 'R', 'B', 'D'];

  // axis: the axis the face is perpendicular to; side: 0 or 1 along it;
  // a1, a2: the two in-plane axes, used for storage as cells[i * k + j].
  const FACES = {
    U: { axis: 1, side: 1, a1: 0, a2: 2 },
    L: { axis: 0, side: 0, a1: 1, a2: 2 },
    F: { axis: 2, side: 1, a1: 0, a2: 1 },
    R: { axis: 0, side: 1, a1: 1, a2: 2 },
    B: { axis: 2, side: 0, a1: 0, a2: 1 },
    D: { axis: 1, side: 0, a1: 0, a2: 2 },
  };
  const FACE_LIST = FACE_NAMES.map((n) => FACES[n]);
  const FACE_AT = [0, 1, 2].map((axis) =>
    [0, 1].map((side) => FACE_LIST.findIndex((f) => f.axis === axis && f.side === side)));

  const AXIS_OF = { R: 0, U: 1, F: 2 };
  const OPPOSITE = { L: 'R', D: 'U', B: 'F' };

  // ---- the rotation group of the cube ----
  //
  // A rotation is { src, neg }: output coordinate o is input coordinate
  // src[o], reflected (t -> 1-t) when neg[o]. ROTATIONS[0] is the identity.

  // Quarter turns clockwise as seen from the R, U and F faces.
  const GENERATORS = [
    { src: [0, 2, 1], neg: [0, 0, 1] }, // R: (x, y, z) -> (x, z, 1-y)
    { src: [2, 1, 0], neg: [1, 0, 0] }, // U: (x, y, z) -> (1-z, y, x)
    { src: [1, 0, 2], neg: [0, 1, 0] }, // F: (x, y, z) -> (y, 1-x, z)
  ];

  function compose(g, h) { // g after h
    return {
      src: [0, 1, 2].map((o) => h.src[g.src[o]]),
      neg: [0, 1, 2].map((o) => g.neg[o] ^ h.neg[g.src[o]]),
    };
  }
  const keyOf = (r) => r.src.join('') + r.neg.join('');

  const ROTATIONS = [{ src: [0, 1, 2], neg: [0, 0, 0] }];
  const ROT_INDEX = new Map([[keyOf(ROTATIONS[0]), 0]]);
  for (let n = 0; n < ROTATIONS.length; n++) {
    for (const g of GENERATORS) {
      const r = compose(g, ROTATIONS[n]);
      if (!ROT_INDEX.has(keyOf(r))) { ROT_INDEX.set(keyOf(r), ROTATIONS.length); ROTATIONS.push(r); }
    }
  }
  const NROT = ROTATIONS.length; // 24
  const MUL = new Uint8Array(NROT * NROT); // MUL[g * NROT + h] = g after h
  for (let g = 0; g < NROT; g++) {
    for (let h = 0; h < NROT; h++) MUL[g * NROT + h] = ROT_INDEX.get(keyOf(compose(ROTATIONS[g], ROTATIONS[h])));
  }
  const INV = new Uint8Array(NROT);
  for (let g = 0; g < NROT; g++) INV[g] = [...Array(NROT).keys()].find((h) => MUL[g * NROT + h] === 0);
  // TURN[axis][q]: rotation index of q clockwise quarter turns about axis.
  const TURN = [0, 1, 2].map((axis) => {
    const g = ROT_INDEX.get(keyOf(GENERATORS[axis]));
    const out = [0];
    for (let q = 1; q < 4; q++) out.push(MUL[g * NROT + out[q - 1]]);
    return out;
  });

  // COLOUR[h * 6 + f]: colour seen on face f in a cell with label h, i.e. the
  // face that h^-1 maps f to.
  const COLOUR = new Uint8Array(NROT * 6);
  for (let h = 0; h < NROT; h++) {
    const r = ROTATIONS[INV[h]];
    for (let f = 0; f < 6; f++) {
      const { axis, side } = FACE_LIST[f];
      const o = r.src.indexOf(axis);
      COLOUR[h * 6 + f] = FACE_AT[o][side ^ r.neg[o]];
    }
  }

  // ---- moves ----

  // A move as entered: { face: 'U'|'L'|..., a, b, q } where [a,b] is the depth
  // from that face and q is clockwise quarter turns (1, 2, or 3 = prime).
  function toCanonical({ face, a, b, q }) {
    if (OPPOSITE[face]) return { axis: OPPOSITE[face], a: 1 - b, b: 1 - a, q: (4 - q) % 4 };
    return { axis: face, a, b, q };
  }

  function inverseMove(m) {
    return { ...m, q: (4 - m.q) % 4 };
  }

  function formatNumber(x) {
    return String(+x.toFixed(6));
  }

  function formatMove({ face, a, b, q }) {
    const suffix = q === 3 ? "'" : q === 2 ? '2' : '';
    return `${face}[${formatNumber(a)},${formatNumber(b)}]${suffix}`;
  }

  class Cube {
    constructor() {
      this.reset();
    }

    reset() {
      this.cuts = [0, 1];
      this.faces = FACE_NAMES.map(() => new Uint8Array([0]));
      this.sincePrune = 0;
    }

    get k() {
      return this.cuts.length - 1;
    }

    colourAt(f, cell) {
      return COLOUR[this.faces[f][cell] * 6 + f];
    }

    findCut(t) {
      return this.cuts.findIndex((c) => Math.abs(c - t) < EPS);
    }

    // Index of the interval containing t.
    intervalOf(t) {
      const cuts = this.cuts;
      let lo = 0, hi = cuts.length - 2;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (cuts[mid] <= t) lo = mid; else hi = mid - 1;
      }
      return lo;
    }

    addCuts(values) {
      const add = [];
      for (const v of values) {
        for (const c of [v, 1 - v]) {
          if (this.findCut(c) === -1 && !add.some((x) => Math.abs(x - c) < EPS)) add.push(c);
        }
      }
      if (!add.length) return;
      const old = this.cuts, k0 = old.length - 1;
      const cuts = old.concat(add).sort((p, q) => p - q);
      const k = cuts.length - 1;
      const parent = new Int32Array(k);
      for (let i = 0, p = 0; i < k; i++) {
        while (old[p + 1] <= cuts[i]) p++;
        parent[i] = p;
      }
      // Columns map to old columns in contiguous runs; a split interval
      // starts a new run, and a split row duplicates the row above it.
      const runs = [];
      for (let j = 0; j < k;) {
        let len = 1;
        while (j + len < k && parent[j + len] === parent[j] + len) len++;
        runs.push(j, parent[j], len);
        j += len;
      }
      this.faces = this.faces.map((cells) => {
        const out = new Uint8Array(k * k);
        for (let i = 0; i < k; i++) {
          const dst = i * k;
          if (i > 0 && parent[i] === parent[i - 1]) { out.copyWithin(dst, dst - k, dst); continue; }
          const src = parent[i] * k0;
          for (let r = 0; r < runs.length; r += 3) {
            out.set(cells.subarray(src + runs[r + 1], src + runs[r + 1] + runs[r + 2]), dst + runs[r]);
          }
        }
        return out;
      });
      this.cuts = cuts;
    }

    // Drop cut pairs {t, 1-t} that no longer separate different labels.
    prune() {
      this.sincePrune = 0;
      const k = this.k;
      if (k === 1) return;
      const needed = new Uint8Array(k + 1);
      needed[0] = needed[k] = 1;
      for (const cells of this.faces) {
        for (let i = 0; i < k; i++) {
          for (let j = 0; j < k; j++) {
            const v = cells[i * k + j];
            if (i > 0 && v !== cells[(i - 1) * k + j]) needed[i] = 1;
            if (j > 0 && v !== cells[i * k + j - 1]) needed[j] = 1;
          }
        }
      }
      const keep = needed.map((n, t) => n | needed[k - t]);
      if (keep.every(Boolean)) return;
      const cuts = this.cuts.filter((_, t) => keep[t]);
      const k2 = cuts.length - 1;
      const rep = new Int32Array(k2);
      for (let i = 0, n = -1; i < k; i++) if (keep[i]) rep[++n] = i;
      this.faces = this.faces.map((cells) => {
        const out = new Uint8Array(k2 * k2);
        for (let i = 0; i < k2; i++) {
          for (let j = 0; j < k2; j++) out[i * k2 + j] = cells[rep[i] * k + rep[j]];
        }
        return out;
      });
      this.cuts = cuts;
    }

    // Apply a canonical move { axis: 'R'|'U'|'F', a, b, q }.
    //
    // Works in place: the slab cells on the four faces around the axis are
    // permuted in cycles of length 4 (quarter turn) or 2 (half turn), so the
    // cost is proportional to the slab area. A face perpendicular to the axis
    // turns as a whole when the slab contains it.
    apply({ axis, a, b, q }) {
      q = ((q % 4) + 4) % 4;
      if (q === 0 || !(b - a > EPS)) return;
      this.addCuts([a, b]);
      const k = this.k, m = k - 1, ax = AXIS_OF[axis], faces = this.faces;
      // Depth [a,b] from the face at 1 is the absolute interval [1-b, 1-a].
      const lo = this.findCut(1 - b), hi = this.findCut(1 - a);
      const g = TURN[ax][q], gRow = g * NROT;
      const A = FACE_LIST.findIndex((fd) => fd.axis !== ax);
      const A1 = orbitMaps(A, TURN[ax][1], 1)[0].face;
      const len = q === 2 ? 2 : 4;

      // One representative face per cycle: A for a quarter turn, A and its
      // quarter-turn image for a half turn.
      for (const f of q === 2 ? [A, A1] : [A]) {
        const fd = FACE_LIST[f], cells = faces[f];
        const maps = orbitMaps(f, g, len);
        let i0 = 0, i1 = k, j0 = 0, j1 = k;
        if (fd.a1 === ax) { i0 = lo; i1 = hi; } else { j0 = lo; j1 = hi; }
        // Along a row (fixed i) each cycle position moves by a fixed stride.
        const T = maps.map((mp) => faces[mp.face]);
        const stride = maps.map((mp) => (mp.rs ? (mp.rf ? -k : k) : (mp.cf ? -1 : 1)));
        const at = (mp, i, j) => {
          const r = mp.rs ? j : i, cc = mp.cs ? j : i;
          return (mp.rf ? m - r : r) * k + (mp.cf ? m - cc : cc);
        };
        for (let i = i0; i < i1; i++) {
          if (len === 4) {
            const [t0, t1, t2, t3] = T, [s0, s1, s2, s3] = stride;
            let n0 = at(maps[0], i, j0), n1 = at(maps[1], i, j0), n2 = at(maps[2], i, j0), n3 = at(maps[3], i, j0);
            for (let j = j0, src = i * k + j0; j < j1; j++, src++) {
              let carry = cells[src], old;
              old = t0[n0]; t0[n0] = MUL[gRow + carry]; carry = old;
              old = t1[n1]; t1[n1] = MUL[gRow + carry]; carry = old;
              old = t2[n2]; t2[n2] = MUL[gRow + carry]; carry = old;
              t3[n3] = MUL[gRow + carry];
              n0 += s0; n1 += s1; n2 += s2; n3 += s3;
            }
          } else {
            const [t0, t1] = T, [s0, s1] = stride;
            let n0 = at(maps[0], i, j0), n1 = at(maps[1], i, j0);
            for (let j = j0, src = i * k + j0; j < j1; j++, src++) {
              const carry = cells[src], old = t0[n0];
              t0[n0] = MUL[gRow + carry];
              t1[n1] = MUL[gRow + old];
              n0 += s0; n1 += s1;
            }
          }
        }
      }
      for (let f = 0; f < 6; f++) {
        const fd = FACE_LIST[f];
        if (fd.axis !== ax || (fd.side ? hi !== k : lo !== 0)) continue;
        const cells = faces[f], before = cells.slice(), mp = orbitMaps(f, g, 1)[0];
        for (let i = 0; i < k; i++) {
          for (let j = 0; j < k; j++) {
            const r = mp.rs ? j : i, cc = mp.cs ? j : i;
            cells[(mp.rf ? m - r : r) * k + (mp.cf ? m - cc : cc)] = MUL[gRow + before[i * k + j]];
          }
        }
      }
      // Pruning scans the whole grid, so on large grids do it only now and then.
      if (k <= PRUNE_ALWAYS_BELOW || ++this.sincePrune >= PRUNE_EVERY) this.prune();
    }

    // Every region is back where it started.
    isSolved() {
      return this.faces.every((cells) => cells.every((v) => v === 0));
    }

    // Every face shows a single colour.
    looksSolved() {
      return this.faces.every((cells, f) => {
        const c0 = COLOUR[cells[0] * 6 + f];
        return cells.every((v) => COLOUR[v * 6 + f] === c0);
      });
    }
  }

  // Where cell (i, j) of face f goes under g, g^2, ..., g^len, as index maps:
  // for each step, the target face and, for its row and column, whether the
  // value is i or j (rs/cs) and whether it is reflected (rf/cf).
  const orbitCache = new Map();
  function orbitMaps(f, g, len) {
    const key = f * 10000 + g * 10 + len;
    if (orbitCache.has(key)) return orbitCache.get(key);
    // Symbolic coordinates: { s: 0 = i, 1 = j, 2 = fixed face side; f: reflected }.
    const fd = FACE_LIST[f];
    let c = [];
    c[fd.axis] = { s: 2, f: fd.side === 0 };
    c[fd.a1] = { s: 0, f: false };
    c[fd.a2] = { s: 1, f: false };
    const { src, neg } = ROTATIONS[g], out = [];
    for (let t = 0; t < len; t++) {
      c = [0, 1, 2].map((o) => ({ s: c[src[o]].s, f: c[src[o]].f !== !!neg[o] }));
      const axis = c.findIndex((x) => x.s === 2);
      const face = FACE_AT[axis][c[axis].f ? 0 : 1], td = FACE_LIST[face];
      out.push({ face, rs: c[td.a1].s, rf: c[td.a1].f, cs: c[td.a2].s, cf: c[td.a2].f });
    }
    orbitCache.set(key, out);
    return out;
  }

  function faceAt(c, k) {
    for (let a = 0; a < 3; a++) {
      if (c[a] === -1) return FACE_AT[a][0];
      if (c[a] === k) return FACE_AT[a][1];
    }
    throw new Error('point not on the surface');
  }

  global.InfiniCube = {
    EPS, FACE_NAMES, FACES, FACE_LIST, AXIS_OF, NROT, COLOUR, Cube,
    toCanonical, inverseMove, formatMove, formatNumber,
  };
})(typeof window !== 'undefined' ? window : globalThis);
