// Live Infini-Cube figures for the blog post.
//
// Uses the cube model, notation parser and 3D view of the Infini-Cube
// (cube.js, notation.js, walk.js, draw.js, view3d.js, loaded before this file).
//
//   <div class="cube-demo" data-alg="[R[0.3,0.45], U[0.55,0.7]]" data-net></div>
//
// Attributes:
//   data-alg       notation to play, one move at a time
//   data-setup     notation applied instantly before playing (optional)
//   data-scramble  number of random moves; Play scrambles, then undoes them
//   data-draw      "curve": draw a random curve on the blue face (new one per replay)
//   data-columns   number of columns of the drawing (default 64)
//   data-two       draw with the 3-cycles that change only two faces
//   data-depth     adds a slider for the default layer depth (value = start)
//   data-ms        duration of a quarter turn in ms (default 650)
//   data-speed     adds a speed slider
//   data-batch     moves applied per tick, without animating the turns
//   data-net       show the unfolded cube beside the 3D view, with a switch to the circle map
//   data-map       start with the circle map instead of the net
//   data-yaw       starting view angle about the vertical, in radians
//   data-autoplay  play once when the figure scrolls into view
(function () {
  'use strict';

  const IC = window.InfiniCube;
  if (!IC || !IC.CubeView) return;
  const { FACE_NAMES, FACES, FACE_VIEW, toCanonical, formatMove } = IC;
  const PALETTE = { U: [247, 245, 239], L: [245, 143, 41], F: [43, 163, 108], R: [217, 66, 63], B: [44, 111, 219], D: [247, 203, 61] };
  const RGB = FACE_NAMES.map((n) => PALETTE[n]);
  const INK = '#20232a';
  const NET = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

  // The circle map. Three families of circles, one per axis, centred at the
  // corners of a triangle. A point of a face with coordinates (t1, t2) along
  // its two axes sits where the circle of radius rho(t1) of the first family
  // meets the circle of radius rho(t2) of the second; the two crossings belong
  // to the two opposite faces. A slab turn moves points along the circles of
  // its own family, so a slab is a ring.
  const CM = { e: 0.81, r0: 1.01, r1: 1.79, ang: [30, -90, 150] };       // angle of the centre of axis 0, 1, 2
  const cmCentre = (axis) => [CM.e * Math.cos(CM.ang[axis] * Math.PI / 180), CM.e * Math.sin(CM.ang[axis] * Math.PI / 180)];
  const cmRadius = (t) => CM.r1 - (CM.r1 - CM.r0) * t;
  function cmPoint(face, t1, t2) {
    const C1 = cmCentre(face.a1), C2 = cmCentre(face.a2), CA = cmCentre(face.axis);
    const r1 = cmRadius(t1), r2 = cmRadius(t2);
    const dx = C2[0] - C1[0], dy = C2[1] - C1[1], d = Math.hypot(dx, dy);
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const mx = C1[0] + a * dx / d, my = C1[1] + a * dy / d;
    const P = [mx - h * dy / d, my + h * dx / d], Q = [mx + h * dy / d, my - h * dx / d];
    const near = Math.hypot(P[0] - CA[0], P[1] - CA[1]) < Math.hypot(Q[0] - CA[0], Q[1] - CA[1]);
    return face.side === 1 ? (near ? P : Q) : (near ? Q : P);
  }
  const f4 = (x) => x.toFixed(4);
  function cmQuad(face, a, b, c, d) {
    const C1 = cmCentre(face.a1), C2 = cmCentre(face.a2);
    const arc = (from, to, C, r) => {
      const cross = (from[0] - C[0]) * (to[1] - C[1]) - (from[1] - C[1]) * (to[0] - C[0]);
      // A very short arc is drawn as a line: rounding can turn it into a full circle.
      if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 1e-3) return `L${f4(to[0])} ${f4(to[1])}`;
      return `A${f4(r)} ${f4(r)} 0 0 ${cross > 0 ? 1 : 0} ${f4(to[0])} ${f4(to[1])}`;
    };
    const p = [cmPoint(face, a, c), cmPoint(face, b, c), cmPoint(face, b, d), cmPoint(face, a, d)];
    return `M${f4(p[0][0])} ${f4(p[0][1])}${arc(p[0], p[1], C2, cmRadius(c))}${arc(p[1], p[2], C1, cmRadius(b))}` +
      `${arc(p[2], p[3], C2, cmRadius(d))}${arc(p[3], p[0], C1, cmRadius(a))}z`;
  }
  const CM_OUTLINE = FACE_NAMES.map((n) => new Path2D(cmQuad(FACES[n], 0, 1, 0, 1)));

  // The 3D view was designed for a dark stage; these suit the light page.
  IC.view3d.SEAM.splice(0, 3, 32, 35, 42);
  IC.view3d.INSIDE.splice(0, 3, 163, 168, 178);

  // Same drawing as CubeView, with gentler shading so colours stay true.
  class View extends IC.CubeView {
    drawItems(items) {
      const { ctx } = this;
      const path = (pts) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };
      for (const it of items) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        path(it.pts);
        ctx.fillStyle = it.face < 0 ? 'rgb(163,168,178)' : INK;
        ctx.fill();
        if (it.face >= 0) {
          const { P, Pu, Pv, u0, u1, v0, v1 } = it.map, tex = this.tex[it.face], S = tex.width;
          ctx.setTransform(Pu[0] - P[0], Pu[1] - P[1], Pv[0] - P[0], Pv[1] - P[1], P[0], P[1]);
          ctx.drawImage(tex, u0 * S, v0 * S, (u1 - u0) * S, (v1 - v0) * S, 0, 0, 1, 1);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        path(it.pts);
        ctx.fillStyle = `rgba(0, 0, 0, ${((1 - it.shade) * (it.face < 0 ? 0.9 : 0.34)).toFixed(3)})`;
        ctx.fill();
        ctx.lineWidth = 1.3 * this.dpr;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
    }
  }

  // The six faces as ImageData, oriented as the 3D view expects.
  function faceImages(cube, size) {
    const k = cube.k;
    const idx = (flip) => Int32Array.from({ length: size }, (_, p) => {
      const t = (p + 0.5) / size;
      return cube.intervalOf(flip ? 1 - t : t);
    });
    const straight = idx(false), flipped = idx(true);
    return FACE_NAMES.map((name, f) => {
      const view = FACE_VIEW[name];
      const us = view.u[1] ? flipped : straight, vs = view.v[1] ? flipped : straight;
      const uFirst = view.u[0] === FACES[name].a1;
      const img = new ImageData(size, size), d = img.data;
      for (let py = 0, o = 0; py < size; py++) {
        for (let px = 0; px < size; px++, o += 4) {
          const c = RGB[cube.colourAt(f, uFirst ? us[px] * k + vs[py] : vs[py] * k + us[px])];
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
      }
      return img;
    });
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };

  // A move with depths rounded to two decimals, for the readout.
  const short = (m) => formatMove({ ...m, a: Math.round(m.a * 100) / 100, b: Math.round(m.b * 100) / 100 });

  function setup(root) {
    const baseMs = +root.dataset.ms || 650;
    let speed = 1;
    const scramble = +root.dataset.scramble || 0;
    const batch = Math.max(1, +root.dataset.batch || 1);
    const draw = root.dataset.draw || '';
    const withNet0 = root.hasAttribute('data-net');
    let depth = root.dataset.depth ? +root.dataset.depth : 1 / 3;
    let seed = draw ? 7 : 1;
    let mapMode = root.hasAttribute('data-map');
    let ring = null;

    const withNet = withNet0 || mapMode;
    if (withNet) root.classList.add('cube-wide');
    const stage = el('div', 'cube-stage');
    const canvas = el('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', root.dataset.label || 'Interactive Infini-Cube. Drag to rotate.');
    stage.append(canvas);
    // The 3D view zooms on wheel; in a post the page should scroll instead.
    stage.addEventListener('wheel', (e) => e.stopPropagation(), { capture: true });
    const netCanvas = withNet ? el('canvas', 'cube-net') : null;
    if (netCanvas) {
      netCanvas.setAttribute('aria-hidden', 'true');
      stage.append(netCanvas);
    }

    const bar = el('div', 'cube-bar');
    const play = el('button', 'cube-btn cube-primary', 'Play');
    const step = el('button', 'cube-btn', 'Step');
    const reset = el('button', 'cube-btn', 'Reset');
    const readout = el('code', 'cube-readout');
    const flat = withNet ? el('button', 'cube-btn', mapMode ? 'Show net' : 'Show circle map') : null;
    bar.append(play, step, reset);
    if (flat) bar.append(flat);
    bar.append(readout);
    root.append(stage, bar);

    const cube = new IC.Cube();
    const view = new View(canvas);
    if (root.dataset.yaw) view.yaw = +root.dataset.yaw;
    let moves = [], pos = 0, timer = null, netTimer = null, playing = false, netSize = 0;

    if (root.dataset.depth) {
      const row = el('label', 'cube-slider');
      const value = el('span', null, depth.toFixed(2));
      const slider = el('input');
      Object.assign(slider, { type: 'range', min: 0.05, max: 0.5, step: 0.01, value: depth });
      row.append('layer depth ', slider, value);
      root.append(row);
      slider.addEventListener('input', () => {
        depth = +slider.value;
        value.textContent = depth.toFixed(2);
        // Show the result for this depth straight away.
        restart();
        while (pos < moves.length) cube.apply(toCanonical(moves[pos++]));
        paint();
        show();
      });
    }

    if (root.hasAttribute('data-speed')) {
      const row = el('label', 'cube-slider');
      const value = el('span', null, '1×');
      const slider = el('input');
      Object.assign(slider, { type: 'range', min: -2, max: 3, step: 0.5, value: 0 });
      row.append('speed ', slider, value);
      root.append(row);
      slider.addEventListener('input', () => {
        speed = 2 ** +slider.value;
        value.textContent = (speed >= 1 ? String(+speed.toFixed(1)) : '1/' + +(1 / speed).toFixed(1)) + '×';
      });
    }

    function build() {
      if (scramble) {
        const r = IC.walk.rng(seed);
        const fwd = Array.from({ length: scramble }, () => IC.walk.randomMove(r, 'uniform'));
        return fwd.concat(IC.notation.invert(fwd));
      }
      if (draw === 'curve') {
        return IC.notation.toMoves(IC.draw.graph(IC.draw.randomFunction(seed), {
          n: +root.dataset.columns || 64, width: 0.04, colour: 'L', two: root.hasAttribute('data-two'), d: 0.03,
        }));
      }
      return IC.notation.toMoves(root.dataset.alg || '', { depth });
    }

    // The unfolded cube, drawn from the textures of the 3D view.
    // Cells of the current state as curved quadrilaterals: [{ f, a, b, c, d, col, moving }].
    // Runs of one colour are merged along the second axis, but never across the edge of the slab.
    function mapCells(slab) {
      const k = cube.k, cuts = cube.cuts, out = [];
      const inSlab = (i) => slab && cuts[i] >= slab.a - 1e-9 && cuts[i + 1] <= slab.b + 1e-9;
      FACE_NAMES.forEach((name, f) => {
        const face = FACES[name];
        const whole = slab && face.axis === slab.axis && (face.side ? slab.b > 1 - 1e-9 : slab.a < 1e-9);
        for (let i = 0; i < k; i++) {
          const mi = whole || (slab && face.a1 === slab.axis && inSlab(i));
          let start = 0, prev = cube.colourAt(f, i * k), pm = mi || (slab && face.a2 === slab.axis && inSlab(0));
          for (let j = 1; j <= k; j++) {
            const col = j < k ? cube.colourAt(f, i * k + j) : -1;
            const mv = j < k && (mi || (slab && face.a2 === slab.axis && inSlab(j)));
            if (col === prev && mv === pm) continue;
            out.push({ f, a: cuts[i], b: cuts[i + 1], c: cuts[start], d: cuts[j], col: prev, moving: !!pm });
            start = j; prev = col; pm = mv;
          }
        }
      });
      return out;
    }

    function mapFrame(ctx) {
      const dpr = view.dpr, W = netCanvas.width, H = netCanvas.height;
      // The map spans x in [-2.6, 2.6] and y in [-2.6, 2.2].
      const S = Math.min(W / 5.3, H / 4.9);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(S, 0, 0, S, W / 2, H / 2 + 0.2 * S);
      ctx.lineJoin = 'round';
      for (let axis = 0; axis < 3; axis++) {
        const [cx, cy] = cmCentre(axis);
        ctx.lineWidth = dpr / S;
        ctx.strokeStyle = 'rgba(32, 35, 42, 0.14)';
        for (const t of [0, 1]) { ctx.beginPath(); ctx.arc(cx, cy, cmRadius(t), 0, 2 * Math.PI); ctx.stroke(); }
      }
      if (ring) {
        const [cx, cy] = cmCentre(ring.axis), ra = cmRadius(ring.a), rb = cmRadius(ring.b);
        ctx.beginPath();
        ctx.arc(cx, cy, (ra + rb) / 2, 0, 2 * Math.PI);
        ctx.lineWidth = Math.abs(ra - rb);
        ctx.strokeStyle = 'rgba(32, 35, 42, 0.13)';
        ctx.stroke();
      }
      return S;
    }

    const fillCells = (ctx, S, byCol) => {
      for (const col of Object.keys(byCol)) {
        ctx.fillStyle = ctx.strokeStyle = `rgb(${RGB[col].join(',')})`;
        ctx.lineWidth = 0.6 * view.dpr / S;
        ctx.fill(byCol[col]);
        ctx.stroke(byCol[col]);
      }
    };
    const outlines = (ctx, S) => {
      ctx.lineWidth = 1.3 * view.dpr / S;
      ctx.strokeStyle = INK;
      for (const o of CM_OUTLINE) ctx.stroke(o);
    };
    const pathsOf = (cells) => {
      const d = {};
      for (const c of cells) (d[c.col] = d[c.col] || []).push(cmQuad(FACES[FACE_NAMES[c.f]], c.a, c.b, c.c, c.d));
      const out = {};
      for (const col of Object.keys(d)) out[col] = new Path2D(d[col].join(''));
      return out;
    };

    function paintMap() {
      const ctx = netCanvas.getContext('2d'), S = mapFrame(ctx);
      fillCells(ctx, S, pathsOf(mapCells(null)));
      outlines(ctx, S);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ---- a turn on the map: every point of the slab slides along its circle ----

    // A point of the surface after a quarter turn about `axis` (sense +1 or -1).
    function quarter(pt, axis, sense) {
      const face = FACES[FACE_NAMES[pt.f]], P = [0, 0, 0];
      P[face.axis] = face.side; P[face.a1] = pt.t1; P[face.a2] = pt.t2;
      const u = (axis + 1) % 3, v = (axis + 2) % 3, du = P[u] - 0.5, dv = P[v] - 0.5;
      P[u] = 0.5 - sense * dv; P[v] = 0.5 + sense * du;
      let f = pt.f;
      if (face.axis !== axis) {
        const na = face.axis === u ? v : u, side = P[na] > 0.5 ? 1 : 0;
        f = FACE_NAMES.findIndex((n) => FACES[n].axis === na && FACES[n].side === side);
      }
      const g = FACES[FACE_NAMES[f]];
      return { f, t1: P[g.a1], t2: P[g.a2] };
    }
    const posOf = (pt) => cmPoint(FACES[FACE_NAMES[pt.f]], pt.t1, pt.t2);
    const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));

    // Which geometric sense a clockwise quarter turn of this axis has, read off the cube model.
    const senseCache = {};
    function senseOf(letter) {
      if (senseCache[letter]) return senseCache[letter];
      const axis = IC.AXIS_OF[letter], other = (axis + 1) % 3;
      const src = FACE_NAMES.findIndex((n) => FACES[n].axis === other && FACES[n].side === 1), sf = FACES[FACE_NAMES[src]];
      const t = new IC.Cube();
      t.apply({ axis: letter, a: 0.3, b: 0.7, q: 1 });
      const to = quarter({ f: src, t1: sf.a1 === axis ? 0.5 : 0.2, t2: sf.a2 === axis ? 0.5 : 0.2 }, axis, 1);
      const hit = t.colourAt(to.f, t.intervalOf(to.t1) * t.k + t.intervalOf(to.t2)) === src;
      return (senseCache[letter] = hit ? 1 : -1);
    }

    let mapAnim = null;
    function startMapAnim(m, duration) {
      const axis = IC.AXIS_OF[m.axis], slab = { axis, a: 1 - m.b, b: 1 - m.a };
      const steps = m.q === 2 ? 2 : 1, sense = senseOf(m.axis) * (m.q === 3 ? -1 : 1);
      // The state before the move, on the cuts of the state after it.
      cube.apply({ ...m, q: (4 - m.q) % 4 });
      const cells = mapCells(slab);
      cube.apply(m);
      const C = cmCentre(axis);
      // The sense in which the ring turns on the map: follow one point all the way round.
      const other = (axis + 1) % 3, rf = FACE_NAMES.findIndex((n) => FACES[n].axis === other && FACES[n].side === 1);
      let ref = { f: rf, t1: 0.5, t2: 0.5 }, votes = 0;
      for (let n = 0; n < 4; n++) {
        const nx = quarter(ref, axis, sense), p0 = posOf(ref), p1 = posOf(nx);
        votes += Math.sign(wrap(Math.atan2(p1[1] - C[1], p1[0] - C[0]) - Math.atan2(p0[1] - C[1], p0[0] - C[0])));
        ref = nx;
      }
      const turn = Math.sign(votes) || 1;
      const track = (f, t1, t2) => {
        const face = FACES[FACE_NAMES[f]], onRing = face.axis !== axis;
        let pt = { f, t1, t2 }, p = posOf(pt);
        const c = onRing ? C : cmPoint(face, 0.5, 0.5);
        const r0 = Math.hypot(p[0] - c[0], p[1] - c[1]), a0 = Math.atan2(p[1] - c[1], p[0] - c[0]);
        let a = a0, total = 0, r1 = r0;
        for (let n = 0; n < steps; n++) {
          pt = quarter(pt, axis, sense);
          p = posOf(pt);
          const an = Math.atan2(p[1] - c[1], p[0] - c[0]);
          let d = wrap(an - a);
          if (onRing && Math.abs(d) > 1e-6 && Math.sign(d) !== turn) d += turn * 2 * Math.PI;
          total += d; a = an; r1 = Math.hypot(p[0] - c[0], p[1] - c[1]);
        }
        return [c[0], c[1], r0, r1, a0, total];
      };
      const N = 6, moving = [];
      for (const cell of cells) {
        if (!cell.moving) continue;
        const pts = [];
        for (let n = 0; n < N; n++) pts.push(track(cell.f, cell.a + (cell.b - cell.a) * n / N, cell.c));
        for (let n = 0; n < N; n++) pts.push(track(cell.f, cell.b, cell.c + (cell.d - cell.c) * n / N));
        for (let n = 0; n < N; n++) pts.push(track(cell.f, cell.b - (cell.b - cell.a) * n / N, cell.d));
        for (let n = 0; n < N; n++) pts.push(track(cell.f, cell.a, cell.d - (cell.d - cell.c) * n / N));
        moving.push({ col: cell.col, pts });
      }
      ring = slab;
      mapAnim = { fixed: pathsOf(cells.filter((c) => !c.moving)), moving, start: performance.now(), ms: (m.q === 2 ? 1.4 : 1) * duration };
      requestAnimationFrame(mapTick);
    }

    function mapTick(now) {
      const A = mapAnim;
      if (!A) return;
      // The frame time can be slightly earlier than the start time.
      const raw = Math.max(0, Math.min(1, (now - A.start) / A.ms));
      if (mapMode && netSize) {
        const e = IC.view3d.ease(raw), ctx = netCanvas.getContext('2d'), S = mapFrame(ctx);
        fillCells(ctx, S, A.fixed);
        for (const cell of A.moving) {
          ctx.beginPath();
          cell.pts.forEach(([cx, cy, r0, r1, a0, da], n) => {
            const r = r0 + (r1 - r0) * e, a = a0 + da * e, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
            if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          });
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle = `rgb(${RGB[cell.col].join(',')})`;
          ctx.lineWidth = 0.6 * view.dpr / S;
          ctx.fill();
          ctx.stroke();
        }
        outlines(ctx, S);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (raw < 1) requestAnimationFrame(mapTick);
      else { mapAnim = null; ring = null; paintNet(); }
    }

    function paintNet() {
      if (!netCanvas || !netSize) return;
      if (mapMode) { if (!mapAnim) paintMap(); return; }
      const ctx = netCanvas.getContext('2d'), dpr = view.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const gap = 4 * dpr, s = (netCanvas.width - 3 * gap - 2 * dpr) / 4;
      ctx.clearRect(0, 0, netCanvas.width, netCanvas.height);
      ctx.imageSmoothingEnabled = view.tex[0].width > s;
      FACE_NAMES.forEach((name, f) => {
        const x = dpr + NET[name][0] * (s + gap), y = dpr + NET[name][1] * (s + gap);
        ctx.drawImage(view.tex[f], x, y, s, s);
        ctx.lineWidth = 1.2 * dpr;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = INK;
        ctx.strokeRect(x, y, s, s);
      });
    }

    function paint() {
      ring = null;
      mapAnim = null;
      clearTimeout(netTimer);
      view.setFaces(faceImages(cube, view.texSize));
      view.render();
      paintNet();
    }

    function show() {
      if (!moves.length) { readout.textContent = ''; return; }
      const last = pos > 0 ? short(moves[pos - 1]) : 'solved';
      const phase = scramble ? (pos <= scramble ? 'scramble' : 'undo') + ' · ' : '';
      readout.textContent = `${phase}${last} · ${pos}/${moves.length}`;
      step.disabled = pos >= moves.length;
      play.textContent = playing ? 'Pause' : pos >= moves.length ? 'Replay' : 'Play';
    }

    function restart() {
      stop();
      view.stop();
      cube.reset();
      if (root.dataset.setup) for (const m of IC.notation.toMoves(root.dataset.setup, { depth })) cube.apply(toCanonical(m));
      moves = build();
      pos = 0;
    }

    // One animated move. The net follows when the turn has finished.
    function advance(duration) {
      if (pos >= moves.length) return false;
      const m = toCanonical(moves[pos++]);
      cube.apply(m);
      view.setFaces(faceImages(cube, view.texSize));
      view.animate(m, duration);
      startMapAnim(m, duration);
      clearTimeout(netTimer);
      netTimer = setTimeout(paintNet, (m.q === 2 ? 1.4 : 1) * duration);
      show();
      return true;
    }

    function stop() {
      playing = false;
      clearTimeout(timer);
      timer = null;
    }

    function run() {
      if (!playing) return;
      const ms = baseMs / speed;
      if (pos >= moves.length) { stop(); show(); return; }
      if (batch > 1) {
        for (let i = 0; i < batch && pos < moves.length; i++) cube.apply(toCanonical(moves[pos++]));
        paint();
        show();
        timer = setTimeout(run, ms);
        return;
      }
      const d = moves[pos].q === 2 ? ms * 1.4 : ms;
      advance(ms);
      timer = setTimeout(run, d + Math.min(180, ms * 0.3));
    }

    play.addEventListener('click', () => {
      if (playing) { stop(); show(); return; }
      if (pos >= moves.length) { if (scramble || draw) seed++; restart(); paint(); }
      playing = true;
      show();
      run();
    });
    step.addEventListener('click', () => { stop(); advance(Math.max(baseMs / speed, 350)); });
    reset.addEventListener('click', () => { restart(); paint(); show(); });
    if (flat) flat.addEventListener('click', () => {
      mapMode = !mapMode;
      flat.textContent = mapMode ? 'Show net' : 'Show circle map';
      paintNet();
    });

    function fit() {
      const total = stage.clientWidth;
      if (!total) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const side = withNet && total >= 600;
      const w = side ? Math.round(total * 0.54) : Math.min(total, 460);
      view.resize(w, Math.round(w * 0.78), dpr);
      if (netCanvas) {
        const nw = side ? total - w - 28 : Math.min(total - 32, 380);
        netSize = nw;
        netCanvas.width = Math.round(nw * dpr);
        netCanvas.height = Math.round((nw * 3) / 4 * dpr);
        netCanvas.style.width = nw + 'px';
        netCanvas.style.height = (nw * 3) / 4 + 'px';
      }
      paint();
    }

    restart();
    fit();
    show();
    new ResizeObserver(fit).observe(stage);

    if (root.hasAttribute('data-autoplay') && 'IntersectionObserver' in window &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); if (!playing && pos === 0) play.click(); }
      }, { threshold: 0.6 });
      io.observe(stage);
    }
  }

  document.querySelectorAll('.cube-demo').forEach(setup);
})();
