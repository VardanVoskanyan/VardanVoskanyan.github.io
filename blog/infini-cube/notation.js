// Parser for the Infini-Cube notation described in the README.
//
//   R[a,b]  R[s]  R[a,b]'  R[a,b]2      slab moves (any of R U F L D B)
//   R U F L D B                         outer layer of default depth d
//   r u f l d b, Rw ...                 wide: outer layer of depth 2d
//   M E S                               middle slices [d, 1-d]
//   x y z                               whole-cube rotations
//   (A)n  (A)'                          repetition and inverse of a group
//   [A, B]  [A: B]                      commutator A B A' B', conjugate A B A'
//   // comment                          to the end of the line
//
// Numbers are decimals (0.25, .25) or fractions (1/3).
(function (global) {
  'use strict';

  const { inverseMove } = global.InfiniCube;

  class NotationError extends Error {
    constructor(message, pos) {
      super(`${message} (at position ${pos + 1})`);
      this.pos = pos;
    }
  }

  // AST nodes: { type: 'move', move } | { type: 'seq', items } |
  // { type: 'comm' | 'conj', a, b } | { type: 'pow', node, n } (n may be negative).

  function parse(text, { depth = 1 / 3 } = {}) {
    let pos = 0;
    const peek = () => text[pos];
    const skip = () => {
      for (;;) {
        while (pos < text.length && /[\s]/.test(text[pos])) pos++;
        if (text.startsWith('//', pos)) { while (pos < text.length && text[pos] !== '\n') pos++; continue; }
        break;
      }
    };

    function number() {
      const m = /^(\d+\.?\d*|\.\d+)(?:\s*\/\s*(\d+\.?\d*|\.\d+))?/.exec(text.slice(pos));
      if (!m) throw new NotationError('expected a number', pos);
      pos += m[0].length;
      const v = m[2] !== undefined ? +m[1] / +m[2] : +m[1];
      if (!isFinite(v)) throw new NotationError('bad number', pos);
      return v;
    }

    // Suffix after a move or group: any mix of digits and primes, e.g. 2, ', 2', 3.
    function suffix() {
      let n = 1, any = false;
      for (;;) {
        const c = peek();
        if (c === "'" || c === '’' || c === '′') { n = -n; pos++; any = true; }
        else if (c >= '0' && c <= '9') {
          const m = /^\d+/.exec(text.slice(pos));
          n *= +m[0];
          pos += m[0].length;
          any = true;
        } else break;
      }
      return any ? n : 1;
    }

    function interval(letterPos) {
      // directly after the letter: [a,b] or [s]
      pos++; // '['
      skip();
      const a = number();
      skip();
      let lo = 0, hi = a;
      if (peek() === ',') {
        pos++;
        skip();
        lo = a;
        hi = number();
        skip();
      }
      if (peek() !== ']') throw new NotationError('expected ]', pos);
      pos++;
      if (!(lo >= 0 && hi <= 1 && hi > lo)) throw new NotationError('interval must satisfy 0 ≤ a < b ≤ 1', letterPos);
      return [lo, hi];
    }

    function move() {
      const start = pos;
      const c = peek();
      let face, a, b;
      if ('RUFLDB'.includes(c)) {
        pos++;
        face = c;
        if (peek() === '[') [a, b] = interval(start);
        else if (peek() === 'w') { pos++; [a, b] = [0, Math.min(1, 2 * depth)]; }
        else [a, b] = [0, depth];
      } else if ('rufldb'.includes(c)) {
        pos++;
        face = c.toUpperCase();
        [a, b] = [0, Math.min(1, 2 * depth)];
      } else if ('MES'.includes(c)) {
        pos++;
        face = { M: 'L', E: 'D', S: 'F' }[c];
        [a, b] = [depth, 1 - depth];
      } else if ('xyz'.includes(c)) {
        pos++;
        face = { x: 'R', y: 'U', z: 'F' }[c];
        [a, b] = [0, 1];
      } else {
        throw new NotationError(`unexpected "${c}"`, pos);
      }
      if (!(b > a)) throw new NotationError('empty slab', start);
      return { type: 'move', move: { face, a, b, q: 1 } };
    }

    function item() {
      skip();
      const c = peek();
      let node;
      if (c === '(') {
        pos++;
        node = seq(')');
        if (peek() !== ')') throw new NotationError('expected )', pos);
        pos++;
      } else if (c === '[') {
        const open = pos;
        pos++;
        const a = seq(',:]');
        const sep = peek();
        if (sep !== ',' && sep !== ':') throw new NotationError('expected , or : in bracket', open);
        pos++;
        const b = seq(']');
        if (peek() !== ']') throw new NotationError('expected ]', pos);
        pos++;
        node = { type: sep === ',' ? 'comm' : 'conj', a, b };
      } else {
        node = move();
      }
      const n = suffix();
      return n === 1 ? node : { type: 'pow', node, n };
    }

    function seq(stops) {
      const items = [];
      for (;;) {
        skip();
        if (pos >= text.length || stops.includes(peek())) break;
        items.push(item());
      }
      return { type: 'seq', items };
    }

    const tree = seq('');
    if (pos < text.length) throw new NotationError(`unexpected "${peek()}"`, pos);
    return tree;
  }

  function invert(moves) {
    return moves.slice().reverse().map(inverseMove);
  }

  // Flatten an AST to a list of moves { face, a, b, q } with q in 1..3.
  function expand(node, limit = 1e6) {
    const out = [];
    const emit = (moves) => {
      for (const m of moves) {
        out.push(m);
        if (out.length > limit) throw new Error(`more than ${limit} moves`);
      }
    };
    const walk = (n) => {
      switch (n.type) {
        case 'move': return [n.move];
        case 'seq': return n.items.flatMap(walk);
        case 'comm': { const a = walk(n.a), b = walk(n.b); return [...a, ...b, ...invert(a), ...invert(b)]; }
        case 'conj': { const a = walk(n.a), b = walk(n.b); return [...a, ...b, ...invert(a)]; }
        case 'pow': {
          // A single move with a numeric suffix is a turn count, not a repeat.
          if (n.node.type === 'move') {
            const q = ((n.n % 4) + 4) % 4;
            return q ? [{ ...n.node.move, q }] : [];
          }
          const body = n.n < 0 ? invert(walk(n.node)) : walk(n.node);
          const reps = [];
          for (let i = 0; i < Math.abs(n.n); i++) reps.push(...body);
          return reps;
        }
      }
      throw new Error('bad node');
    };
    emit(walk(node));
    return out;
  }

  // Parse and expand in one go.
  function toMoves(text, opts) {
    return expand(parse(text, opts));
  }

  global.InfiniCube.notation = { parse, expand, toMoves, invert, NotationError };
})(typeof window !== 'undefined' ? window : globalThis);
