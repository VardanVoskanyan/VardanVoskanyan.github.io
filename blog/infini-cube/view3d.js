// 3D view of the cube.
//
// The projection is orthographic, so a square face maps to a parallelogram:
// an affine image of its texture. Each face (or part of a face while a slab
// turns) is therefore one affinely mapped image.
//
// A turn is animated after the move has been applied: the slab of the new
// state is drawn rotated back by the remaining angle, which shows exactly
// the old state at the start and the new state at the end.
//
// scene() is pure geometry and also runs in Node (research/tools/render.js
// rasterises it for the blog figures); CubeView draws it on a canvas.
(function (global) {
  'use strict';

  const IC = global.InfiniCube;
  const { FACE_NAMES, FACES, AXIS_OF } = IC;

  // Each face seen from outside: which axis runs along the texture's u
  // (left -> right) and v (top -> bottom), and whether it runs from 1 to 0.
  // The net uses the same orientation.
  const FACE_VIEW = {
    U: { u: [0, false], v: [2, false] },
    D: { u: [0, false], v: [2, true] },
    F: { u: [0, false], v: [1, true] },
    L: { u: [2, false], v: [1, true] },
    R: { u: [2, true], v: [1, true] },
    B: { u: [0, true], v: [1, true] },
  };

  const HOME = { yaw: -0.62, pitch: 0.5 };
  const INSIDE = [77, 76, 72]; // cut faces seen during a turn: grey, to stand out from the stage
  const SEAM = [21, 21, 20];
  const LIGHT = (() => { const v = [-0.35, 0.65, 0.7], n = Math.hypot(...v); return v.map((x) => x / n); })();

  // ---- 3x3 matrices, row-major ----

  const mul = (A, B) => {
    const C = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
    return C;
  };
  const apply = (A, v) => [0, 1, 2].map((i) => A[i * 3] * v[0] + A[i * 3 + 1] * v[1] + A[i * 3 + 2] * v[2]);

  // Rotation by t about the x, y or z axis (right-handed).
  function rot(axis, t) {
    const c = Math.cos(t), s = Math.sin(t);
    if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
    if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  }

  // World -> view: turn by yaw about the vertical, then tilt by pitch.
  const viewMatrix = (yaw, pitch) => mul(rot(0, pitch), rot(1, yaw));
  // The opposite corner: the three faces hidden in viewMatrix(yaw, pitch).
  const backMatrix = (yaw, pitch) => mul(rot(0, -pitch), rot(1, yaw + Math.PI));

  const FACE_INDEX = [0, 1, 2].map((axis) => [0, 1].map((side) =>
    FACE_NAMES.findIndex((n) => FACES[n].axis === axis && FACES[n].side === side)));

  // The animation of a canonical move { axis: 'R'|'U'|'F', a, b, q }:
  // which slab turns, and by how much. A quarter turn is a rotation by
  // -90 degrees about the +axis.
  function turnOf(move) {
    const turns = move.q === 3 ? -1 : move.q;
    return { axis: AXIS_OF[move.axis], lo: 1 - move.b, hi: 1 - move.a, angle: (Math.PI / 2) * turns };
  }

  const ease = (p) => p * p * (3 - 2 * p);

  // Corners of a box face in world coordinates, in order.
  function quad(box, ax, side) {
    const [b, c] = [0, 1, 2].filter((i) => i !== ax);
    const corner = (i, j) => {
      const w = [0, 0, 0];
      w[ax] = box[ax][side];
      w[b] = box[b][i];
      w[c] = box[c][j];
      return w;
    };
    return [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
  }

  // Everything to draw for one cube, back to front. V: view matrix; the
  // cube centre goes to (cx, cy) and an edge has length L (screen y points
  // down). turn: turnOf(move) or null; p: animation progress in [0, 1].
  // Each item: { pts: four screen corners, shade: 0..1, face: index or -1
  // for a cut face, map: { P, Pu, Pv, u0, u1, v0, v1 } }. The map sends
  // texture point (u, v) to P + s (Pu - P) + t (Pv - P), with
  // s = (u - u0) / (u1 - u0) and t = (v - v0) / (v1 - v0).
  function scene(V, cx, cy, L, turn, p = 1) {
    const pieces = [];
    if (turn && p < 1) {
      const T = rot(turn.axis, turn.angle * (1 - ease(p)));
      const span = (lo, hi) => [0, 1, 2].map((ax) => (ax === turn.axis ? [lo, hi] : [0, 1]));
      if (turn.lo > 1e-9) pieces.push({ box: span(0, turn.lo), M: V, c: turn.lo / 2 });
      pieces.push({ box: span(turn.lo, turn.hi), M: mul(V, T), c: (turn.lo + turn.hi) / 2 });
      if (turn.hi < 1 - 1e-9) pieces.push({ box: span(turn.hi, 1), M: V, c: (1 + turn.hi) / 2 });
      // Back to front: the pieces are separated by planes across the axis.
      const toward = V[6 + turn.axis]; // view z of the axis direction
      pieces.sort((u, v) => (u.c - v.c) * toward);
    } else {
      pieces.push({ box: [[0, 1], [0, 1], [0, 1]], M: V });
    }
    const items = [];
    for (const { box, M } of pieces) {
      const proj = (w) => {
        const v = apply(M, [w[0] - 0.5, w[1] - 0.5, w[2] - 0.5]);
        return [cx + L * v[0], cy - L * v[1]];
      };
      for (let ax = 0; ax < 3; ax++) {
        for (let side = 0; side < 2; side++) {
          const n = [0, 0, 0];
          n[ax] = side ? 1 : -1;
          const nv = apply(M, n);
          if (nv[2] <= 1e-6) continue;
          const shade = 0.62 + 0.38 * Math.max(0, nv[0] * LIGHT[0] + nv[1] * LIGHT[1] + nv[2] * LIGHT[2]);
          const coord = box[ax][side];
          const pts = quad(box, ax, side).map(proj);
          const surface = side ? coord >= 1 - 1e-9 : coord <= 1e-9;
          if (!surface) {
            items.push({ pts, shade, face: -1, map: { P: pts[0], Pu: pts[1], Pv: pts[3], u0: 0, u1: 1, v0: 0, v1: 1 } });
            continue;
          }
          const f = FACE_INDEX[ax][side], view = FACE_VIEW[FACE_NAMES[f]];
          const [ua, uFlip] = view.u, [va, vFlip] = view.v;
          const range = (r, flip) => (flip ? [1 - r[1], 1 - r[0]] : r);
          const [u0, u1] = range(box[ua], uFlip), [v0, v1] = range(box[va], vFlip);
          const world = (u, v) => {
            const w = [0, 0, 0];
            w[ax] = coord;
            w[ua] = uFlip ? 1 - u : u;
            w[va] = vFlip ? 1 - v : v;
            return w;
          };
          items.push({ pts, shade, face: f, map: { P: proj(world(u0, v0)), Pu: proj(world(u1, v0)), Pv: proj(world(u0, v1)), u0, u1, v0, v1 } });
        }
      }
    }
    return items;
  }

  // The visible outside faces of the slab [lo, hi] along axis, unturned.
  function slabQuads(V, cx, cy, L, { axis, lo, hi }) {
    const box = [0, 1, 2].map((ax) => (ax === axis ? [lo, hi] : [0, 1]));
    const proj = (w) => {
      const v = apply(V, [w[0] - 0.5, w[1] - 0.5, w[2] - 0.5]);
      return [cx + L * v[0], cy - L * v[1]];
    };
    const out = [];
    for (let ax = 0; ax < 3; ax++) {
      for (let side = 0; side < 2; side++) {
        const n = [0, 0, 0];
        n[ax] = side ? 1 : -1;
        if (apply(V, n)[2] <= 1e-6) continue;
        const coord = box[ax][side];
        if (side ? coord < 1 - 1e-9 : coord > 1e-9) continue;
        out.push(quad(box, ax, side).map(proj));
      }
    }
    return out;
  }

  // Texture coordinates (s, t) of a screen point in an item's map, or null
  // if the point is outside the quad.
  function locate(item, x, y) {
    const { P, Pu, Pv } = item.map;
    const ax = Pu[0] - P[0], ay = Pu[1] - P[1], bx = Pv[0] - P[0], by = Pv[1] - P[1];
    const det = ax * by - ay * bx;
    if (Math.abs(det) < 1e-12) return null;
    const dx = x - P[0], dy = y - P[1];
    const s = (dx * by - dy * bx) / det, t = (ax * dy - ay * dx) / det;
    return s >= 0 && s <= 1 && t >= 0 && t <= 1 ? [s, t] : null;
  }

  // ---- the canvas view (browser only) ----

  const css = (rgb, k = 1) => `rgb(${rgb.map((c) => Math.round(c * k)).join(',')})`;

  class CubeView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.tex = FACE_NAMES.map(() => document.createElement('canvas'));
      this.texSize = 0;
      this.yaw = HOME.yaw;
      this.pitch = HOME.pitch;
      this.zoom = 1;
      this.spin = 0; // yaw velocity after a flick, radians per ms
      this.anim = null; // { turn, start, ms }
      this.slab = null; // { axis, lo, hi } to outline
      this.overlay = null; // (ctx) => void, drawn on top
      this.onPick = null; // (face name) => void, on a click on a face
      this.running = false;
      this.dpr = 1;
      this.main = null; // { cx, cy, L } of the main cube in the last render
      this.bindPointer();
    }

    bindPointer() {
      const c = this.canvas;
      let last = null, moved = 0, samples = [];
      c.addEventListener('pointerdown', (e) => {
        last = [e.clientX, e.clientY];
        moved = 0;
        samples = [];
        this.spin = 0;
        c.setPointerCapture(e.pointerId);
        c.classList.add('dragging');
      });
      c.addEventListener('pointermove', (e) => {
        if (!last) {
          c.classList.toggle('pickable', !!this.faceAt(e));
          return;
        }
        const dx = e.clientX - last[0], dy = e.clientY - last[1];
        moved += Math.abs(dx) + Math.abs(dy);
        this.yaw += dx * 0.01;
        this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch + dy * 0.01));
        last = [e.clientX, e.clientY];
        samples.push([performance.now(), dx * 0.01]);
        this.render();
      });
      const end = (e) => {
        if (!last) return;
        last = null;
        c.classList.remove('dragging');
        if (moved < 4) {
          const face = this.faceAt(e);
          if (face && this.onPick) this.onPick(face);
          return;
        }
        // A flick keeps the cube spinning for a moment.
        const now = performance.now(), recent = samples.filter(([t]) => now - t < 80);
        if (recent.length > 1) {
          const span = Math.max(16, now - recent[0][0]);
          this.spin = recent.reduce((s, [, d]) => s + d, 0) / span;
          if (Math.abs(this.spin) > 2e-4) this.kick();
          else this.spin = 0;
        }
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', () => { last = null; c.classList.remove('dragging'); });
      c.addEventListener('dblclick', () => {
        this.yaw = HOME.yaw;
        this.pitch = HOME.pitch;
        this.zoom = 1;
        this.spin = 0;
        this.render();
      });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.zoom = Math.max(0.5, Math.min(2.2, this.zoom * Math.exp(-e.deltaY * 0.0015)));
        this.render();
      }, { passive: false });
    }

    // The face of the main cube under a pointer event, or null.
    faceAt(e) {
      if (!this.main) return null;
      const r = this.canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) * this.dpr, y = (e.clientY - r.top) * this.dpr;
      const { cx, cy, L } = this.main;
      const items = scene(viewMatrix(this.yaw, this.pitch), cx, cy, L, null);
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].face >= 0 && locate(items[i], x, y)) return FACE_NAMES[items[i].face];
      }
      return null;
    }

    // Size in CSS pixels. Returns the texture size worth rendering.
    resize(width, height, dpr) {
      const c = this.canvas;
      this.dpr = dpr;
      c.width = Math.max(1, Math.round(width * dpr));
      c.height = Math.max(1, Math.round(height * dpr));
      c.style.width = width + 'px';
      c.style.height = height + 'px';
      this.edge = Math.min(c.width, c.height) / 1.75;
      this.texSize = Math.max(64, Math.min(512, Math.round(this.edge)));
      return this.texSize;
    }

    // images: one ImageData per face, in FACE_NAMES order, oriented as FACE_VIEW.
    setFaces(images) {
      images.forEach((img, f) => {
        const t = this.tex[f];
        if (t.width !== img.width || t.height !== img.height) { t.width = img.width; t.height = img.height; }
        t.getContext('2d').putImageData(img, 0, 0);
      });
    }

    // Animate a canonical move that has just been applied. Half turns take
    // a little longer than quarter turns.
    animate(move, ms) {
      if (!(ms > 0) || !move.q) { this.anim = null; return; }
      this.anim = { turn: turnOf(move), start: performance.now(), ms: move.q === 2 ? ms * 1.4 : ms };
      this.kick();
    }

    stop() { this.anim = null; }

    kick() {
      if (this.running) return;
      this.running = true;
      this.lastFrame = performance.now();
      requestAnimationFrame(() => this.frame());
    }

    frame() {
      const now = performance.now(), dt = Math.min(50, now - this.lastFrame);
      this.lastFrame = now;
      if (this.spin) {
        this.yaw += this.spin * dt;
        this.spin *= Math.exp(-dt / 350);
        if (Math.abs(this.spin) < 3e-5) this.spin = 0;
      }
      this.render();
      if (this.anim || this.spin) requestAnimationFrame(() => this.frame());
      else this.running = false;
    }

    render() {
      const { ctx, canvas } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!this.texSize) return;
      let turn = null, p = 1;
      if (this.anim) {
        p = Math.min(1, (performance.now() - this.anim.start) / this.anim.ms);
        turn = this.anim.turn;
        if (p >= 1) this.anim = null;
      }
      const inset = Math.min(canvas.width, canvas.height) > 240 * this.dpr;
      // The main cube, nudged up and left when the back view sits in the corner.
      const shift = inset ? this.edge * 0.16 : 0;
      const L = this.edge * (inset ? 0.84 : 1) * this.zoom;
      this.main = { cx: canvas.width / 2 - shift, cy: canvas.height / 2 - shift / 2, L };
      const V = viewMatrix(this.yaw, this.pitch);
      this.drawItems(scene(V, this.main.cx, this.main.cy, L, turn, p));
      if (this.slab && p >= 1) this.drawSlab(slabQuads(V, this.main.cx, this.main.cy, L, this.slab));
      if (inset) {
        // The three hidden faces, seen from behind and below.
        const e = this.edge * 0.3;
        const x = canvas.width - e * 0.95, y = canvas.height - e * 1.2;
        this.drawItems(scene(backMatrix(this.yaw, this.pitch), x, y, e, turn, p));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = `${11 * this.dpr}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.fillStyle = '#9a9993';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('from behind', x, y + e * 0.95);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.overlay) this.overlay(ctx);
    }

    drawItems(items) {
      const { ctx } = this;
      const path = (pts) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };
      for (const it of items) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // A dark underlay hides the seams between neighbouring quads.
        path(it.pts);
        ctx.fillStyle = css(it.face < 0 ? INSIDE : SEAM);
        ctx.fill();
        ctx.lineWidth = this.dpr;
        ctx.strokeStyle = css(SEAM);
        ctx.stroke();
        if (it.face >= 0) {
          const { P, Pu, Pv, u0, u1, v0, v1 } = it.map, tex = this.tex[it.face], S = tex.width;
          ctx.setTransform(Pu[0] - P[0], Pu[1] - P[1], Pv[0] - P[0], Pv[1] - P[1], P[0], P[1]);
          ctx.drawImage(tex, u0 * S, v0 * S, (u1 - u0) * S, (v1 - v0) * S, 0, 0, 1, 1);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        path(it.pts);
        ctx.fillStyle = `rgba(0, 0, 0, ${(1 - it.shade).toFixed(3)})`;
        ctx.fill();
      }
    }

    // Outline the visible surface of the slab that the selected move turns.
    drawSlab(quads) {
      const { ctx, dpr } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const pts of quads) {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
        ctx.fill();
        ctx.setLineDash([]);
        ctx.lineWidth = 2 * dpr;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.stroke();
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.lineWidth = dpr;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  IC.FACE_VIEW = FACE_VIEW;
  IC.CubeView = CubeView;
  IC.view3d = { HOME, INSIDE, SEAM, viewMatrix, backMatrix, turnOf, scene, slabQuads, locate, ease };
})(typeof window !== 'undefined' ? window : globalThis);
