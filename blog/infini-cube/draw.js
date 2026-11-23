// Drawing pictures on the blue face (B) with thin-slab commutators.
//
// Coordinates are the B face as shown in the net: u runs left to right and v
// top to bottom, both in [0, 1]. For a column u in [u0, u1] and a run v in
// [v0, v1], the commutator of R[u0,u1] and U[v0,v1] permutes six rectangles
// of that size, one of which is exactly that rectangle on B, and leaves the
// rest of the cube untouched. Which colour lands on B depends on the variant:
//
//   [R[I], U[J]]    white      [U[J], R[I]]    orange
//   [R[I]', U[J]]   yellow     [U[J]', R[I]]   red
//
// Commutators in different columns move disjoint rectangles, so a picture
// made of column runs costs exactly 4 moves per run. Starting from the solved
// cube, the result on B is exact up to a 1e-6 margin at the face edges (see
// EDGE); only the column width discretises it. Runs in one column should not
// overlap.
(function (global) {
  'use strict';

  const num = (x) => String(+x.toFixed(6));
  const R = (u0, u1) => `R[${num(u0)},${num(u1)}]`;
  const U = (v0, v1) => `U[${num(v0)},${num(v1)}]`;

  const PAINT = {
    U: (u0, u1, v0, v1) => `[${R(u0, u1)}, ${U(v0, v1)}]`,
    D: (u0, u1, v0, v1) => `[${R(u0, u1)}', ${U(v0, v1)}]`,
    L: (u0, u1, v0, v1) => `[${U(v0, v1)}, ${R(u0, u1)}]`,
    R: (u0, u1, v0, v1) => `[${U(v0, v1)}', ${R(u0, u1)}]`,
  };
  const COLOURS = [
    { value: 'L', label: 'orange' },
    { value: 'U', label: 'white' },
    { value: 'D', label: 'yellow' },
    { value: 'R', label: 'red' },
  ];

  // A slab that reaches 0 or 1 contains a whole outer face, which then turns
  // as a block and breaks the six-rectangle structure. So slabs stay EDGE
  // inside the cube; the unpainted margin is far below what can be seen.
  const EDGE = 1e-6;
  const clamp = (x) => Math.min(1 - EDGE, Math.max(EDGE, x));

  // columns: [{ u0, u1, runs: [{ v0, v1, colour }] }] -> algorithm text
  function paint(columns) {
    const parts = [];
    for (const { u0, u1, runs } of columns) {
      const c0 = clamp(u0), c1 = clamp(u1);
      for (const { v0, v1, colour } of runs) {
        const a = clamp(v0), b = clamp(v1);
        if (b - a > 1e-6 && c1 - c0 > 1e-6) parts.push(PAINT[colour](c0, c1, a, b));
      }
    }
    return parts.join('\n');
  }

  // ---- two-face drawing ----
  //
  // The commutator above changes six faces. A commutator of a slab turn A with
  // B = C D C', where D is a slab parallel to A and C a thin outer layer, is a
  // 3-cycle of three rectangles only: the target rectangle on the blue face,
  // one rectangle on the face that gives the colour, and a third rectangle
  // that lies on one of those two faces and usually exchanges equal colours.
  // So the picture appears on the blue face, the displaced blue appears on
  // the donor face, and the other four faces stay solved. 8 moves per run.
  //
  // Each entry: [sequence, where the rectangle lands on the blue face as
  // "x-range x y-range" in cube coordinates]. Found by search (see the post).
  const TWO = {
    L: [
      ["U[I1] B[d] U[I2] B[d]' U[I1]' B[d] U[I2]' B[d]'", '1-I2 x 1-I1'],
      ["B[d] U[I2] B[d]' U[I1] B[d] U[I2]' B[d]' U[I1]'", '1-I2 x 1-I1'],
      ["U[I1] B[d] D[I2]' B[d]' U[I1]' B[d] D[I2] B[d]'", 'I2 x 1-I1'],
      ["B[d] D[I2]' B[d]' U[I1] B[d] D[I2] B[d]' U[I1]'", 'I2 x 1-I1'],
      ["U[I1] B[d]' U[I2] B[d] U[I1]' B[d]' U[I2]' B[d]", 'I2 x 1-I1'],
      ["B[d]' U[I2] B[d] U[I1] B[d]' U[I2]' B[d] U[I1]'", 'I2 x 1-I1'],
      ["U[I1] B[d]' D[I2]' B[d] U[I1]' B[d]' D[I2] B[d]", '1-I2 x 1-I1'],
      ["B[d]' D[I2]' B[d] U[I1] B[d]' D[I2] B[d] U[I1]'", '1-I2 x 1-I1'],
      ["U[I1]' L[d] U[I2]' L[d]' U[I1] L[d] U[I2] L[d]'", 'I1 x 1-I2'],
      ["L[d] U[I2]' L[d]' U[I1]' L[d] U[I2] L[d]' U[I1]", '1-I2 x 1-I1'],
      ["U[I1]' L[d] D[I2] L[d]' U[I1] L[d] D[I2]' L[d]'", 'I1 x I2'],
      ["L[d] D[I2] L[d]' U[I1]' L[d] D[I2]' L[d]' U[I1]", 'I2 x 1-I1'],
      ["U[I1]' L[d]' U[I2]' L[d] U[I1] L[d]' U[I2] L[d]", '1-I1 x 1-I2'],
      ["L[d]' U[I2]' L[d] U[I1]' L[d]' U[I2] L[d] U[I1]", 'I2 x 1-I1'],
      ["U[I1]' L[d]' D[I2] L[d] U[I1] L[d]' D[I2]' L[d]", '1-I1 x I2'],
      ["L[d]' D[I2] L[d] U[I1]' L[d]' D[I2]' L[d] U[I1]", '1-I2 x 1-I1'],
      ["D[I1] L[d] U[I2]' L[d]' D[I1]' L[d] U[I2] L[d]'", '1-I1 x 1-I2'],
      ["L[d] U[I2]' L[d]' D[I1] L[d] U[I2] L[d]' D[I1]'", '1-I2 x I1'],
      ["D[I1] L[d] D[I2] L[d]' D[I1]' L[d] D[I2]' L[d]'", '1-I1 x I2'],
      ["L[d] D[I2] L[d]' D[I1] L[d] D[I2]' L[d]' D[I1]'", 'I2 x I1'],
      ["D[I1] L[d]' U[I2]' L[d] D[I1]' L[d]' U[I2] L[d]", 'I1 x 1-I2'],
      ["L[d]' U[I2]' L[d] D[I1] L[d]' U[I2] L[d] D[I1]'", 'I2 x I1'],
      ["D[I1] L[d]' D[I2] L[d] D[I1]' L[d]' D[I2]' L[d]", 'I1 x I2'],
      ["L[d]' D[I2] L[d] D[I1] L[d]' D[I2]' L[d] D[I1]'", '1-I2 x I1'],
      ["D[I1]' B[d] U[I2] B[d]' D[I1] B[d] U[I2]' B[d]'", '1-I2 x I1'],
      ["B[d] U[I2] B[d]' D[I1]' B[d] U[I2]' B[d]' D[I1]", '1-I2 x I1'],
      ["D[I1]' B[d] D[I2]' B[d]' D[I1] B[d] D[I2] B[d]'", 'I2 x I1'],
      ["B[d] D[I2]' B[d]' D[I1]' B[d] D[I2] B[d]' D[I1]", 'I2 x I1'],
      ["D[I1]' B[d]' U[I2] B[d] D[I1] B[d]' U[I2]' B[d]", 'I2 x I1'],
      ["B[d]' U[I2] B[d] D[I1]' B[d]' U[I2]' B[d] D[I1]", 'I2 x I1'],
      ["D[I1]' B[d]' D[I2]' B[d] D[I1] B[d]' D[I2] B[d]", '1-I2 x I1'],
      ["B[d]' D[I2]' B[d] D[I1]' B[d]' D[I2] B[d] D[I1]", '1-I2 x I1'],
    ],
    U: [
      ["L[I1] U[d] L[I2] U[d]' L[I1]' U[d] L[I2]' U[d]'", 'I2 x I1'],
      ["U[d] L[I2] U[d]' L[I1] U[d] L[I2]' U[d]' L[I1]'", 'I1 x 1-I2'],
      ["L[I1] U[d] R[I2]' U[d]' L[I1]' U[d] R[I2] U[d]'", '1-I2 x I1'],
      ["U[d] R[I2]' U[d]' L[I1] U[d] R[I2] U[d]' L[I1]'", 'I1 x I2'],
      ["L[I1] U[d]' L[I2] U[d] L[I1]' U[d]' L[I2]' U[d]", 'I2 x 1-I1'],
      ["U[d]' L[I2] U[d] L[I1] U[d]' L[I2]' U[d] L[I1]'", 'I1 x I2'],
      ["L[I1] U[d]' R[I2]' U[d] L[I1]' U[d]' R[I2] U[d]", '1-I2 x 1-I1'],
      ["U[d]' R[I2]' U[d] L[I1] U[d]' R[I2] U[d] L[I1]'", 'I1 x 1-I2'],
      ["L[I1]' B[d] L[I2]' B[d]' L[I1] B[d] L[I2] B[d]'", 'I1 x 1-I2'],
      ["B[d] L[I2]' B[d]' L[I1]' B[d] L[I2] B[d]' L[I1]", 'I1 x 1-I2'],
      ["L[I1]' B[d] R[I2] B[d]' L[I1] B[d] R[I2]' B[d]'", 'I1 x I2'],
      ["B[d] R[I2] B[d]' L[I1]' B[d] R[I2]' B[d]' L[I1]", 'I1 x I2'],
      ["L[I1]' B[d]' L[I2]' B[d] L[I1] B[d]' L[I2] B[d]", 'I1 x I2'],
      ["B[d]' L[I2]' B[d] L[I1]' B[d]' L[I2] B[d] L[I1]", 'I1 x I2'],
      ["L[I1]' B[d]' R[I2] B[d] L[I1] B[d]' R[I2]' B[d]", 'I1 x 1-I2'],
      ["B[d]' R[I2] B[d] L[I1]' B[d]' R[I2]' B[d] L[I1]", 'I1 x 1-I2'],
      ["R[I1] B[d] L[I2]' B[d]' R[I1]' B[d] L[I2] B[d]'", '1-I1 x 1-I2'],
      ["B[d] L[I2]' B[d]' R[I1] B[d] L[I2] B[d]' R[I1]'", '1-I1 x 1-I2'],
      ["R[I1] B[d] R[I2] B[d]' R[I1]' B[d] R[I2]' B[d]'", '1-I1 x I2'],
      ["B[d] R[I2] B[d]' R[I1] B[d] R[I2]' B[d]' R[I1]'", '1-I1 x I2'],
      ["R[I1] B[d]' L[I2]' B[d] R[I1]' B[d]' L[I2] B[d]", '1-I1 x I2'],
      ["B[d]' L[I2]' B[d] R[I1] B[d]' L[I2] B[d] R[I1]'", '1-I1 x I2'],
      ["R[I1] B[d]' R[I2] B[d] R[I1]' B[d]' R[I2]' B[d]", '1-I1 x 1-I2'],
      ["B[d]' R[I2] B[d] R[I1] B[d]' R[I2]' B[d] R[I1]'", '1-I1 x 1-I2'],
      ["R[I1]' U[d] L[I2] U[d]' R[I1] U[d] L[I2]' U[d]'", 'I2 x 1-I1'],
      ["U[d] L[I2] U[d]' R[I1]' U[d] L[I2]' U[d]' R[I1]", '1-I1 x 1-I2'],
      ["R[I1]' U[d] R[I2]' U[d]' R[I1] U[d] R[I2] U[d]'", '1-I2 x 1-I1'],
      ["U[d] R[I2]' U[d]' R[I1]' U[d] R[I2] U[d]' R[I1]", '1-I1 x I2'],
      ["R[I1]' U[d]' L[I2] U[d] R[I1] U[d]' L[I2]' U[d]", 'I2 x I1'],
      ["U[d]' L[I2] U[d] R[I1]' U[d]' L[I2]' U[d] R[I1]", '1-I1 x I2'],
      ["R[I1]' U[d]' R[I2]' U[d] R[I1] U[d]' R[I2] U[d]", '1-I2 x I1'],
      ["U[d]' R[I2]' U[d] R[I1]' U[d]' R[I2] U[d] R[I1]", '1-I1 x 1-I2'],
    ],
    R: [
      ["U[I1] R[d] U[I2] R[d]' U[I1]' R[d] U[I2]' R[d]'", 'I1 x 1-I2'],
      ["R[d] U[I2] R[d]' U[I1] R[d] U[I2]' R[d]' U[I1]'", '1-I2 x 1-I1'],
      ["U[I1] R[d] D[I2]' R[d]' U[I1]' R[d] D[I2] R[d]'", 'I1 x I2'],
      ["R[d] D[I2]' R[d]' U[I1] R[d] D[I2] R[d]' U[I1]'", 'I2 x 1-I1'],
      ["U[I1] R[d]' U[I2] R[d] U[I1]' R[d]' U[I2]' R[d]", '1-I1 x 1-I2'],
      ["R[d]' U[I2] R[d] U[I1] R[d]' U[I2]' R[d] U[I1]'", 'I2 x 1-I1'],
      ["U[I1] R[d]' D[I2]' R[d] U[I1]' R[d]' D[I2] R[d]", '1-I1 x I2'],
      ["R[d]' D[I2]' R[d] U[I1] R[d]' D[I2] R[d] U[I1]'", '1-I2 x 1-I1'],
      ["U[I1]' B[d] U[I2]' B[d]' U[I1] B[d] U[I2] B[d]'", '1-I2 x 1-I1'],
      ["B[d] U[I2]' B[d]' U[I1]' B[d] U[I2] B[d]' U[I1]", '1-I2 x 1-I1'],
      ["U[I1]' B[d] D[I2] B[d]' U[I1] B[d] D[I2]' B[d]'", 'I2 x 1-I1'],
      ["B[d] D[I2] B[d]' U[I1]' B[d] D[I2]' B[d]' U[I1]", 'I2 x 1-I1'],
      ["U[I1]' B[d]' U[I2]' B[d] U[I1] B[d]' U[I2] B[d]", 'I2 x 1-I1'],
      ["B[d]' U[I2]' B[d] U[I1]' B[d]' U[I2] B[d] U[I1]", 'I2 x 1-I1'],
      ["U[I1]' B[d]' D[I2] B[d] U[I1] B[d]' D[I2]' B[d]", '1-I2 x 1-I1'],
      ["B[d]' D[I2] B[d] U[I1]' B[d]' D[I2]' B[d] U[I1]", '1-I2 x 1-I1'],
      ["D[I1] B[d] U[I2]' B[d]' D[I1]' B[d] U[I2] B[d]'", '1-I2 x I1'],
      ["B[d] U[I2]' B[d]' D[I1] B[d] U[I2] B[d]' D[I1]'", '1-I2 x I1'],
      ["D[I1] B[d] D[I2] B[d]' D[I1]' B[d] D[I2]' B[d]'", 'I2 x I1'],
      ["B[d] D[I2] B[d]' D[I1] B[d] D[I2]' B[d]' D[I1]'", 'I2 x I1'],
      ["D[I1] B[d]' U[I2]' B[d] D[I1]' B[d]' U[I2] B[d]", 'I2 x I1'],
      ["B[d]' U[I2]' B[d] D[I1] B[d]' U[I2] B[d] D[I1]'", 'I2 x I1'],
      ["D[I1] B[d]' D[I2] B[d] D[I1]' B[d]' D[I2]' B[d]", '1-I2 x I1'],
      ["B[d]' D[I2] B[d] D[I1] B[d]' D[I2]' B[d] D[I1]'", '1-I2 x I1'],
      ["D[I1]' R[d] U[I2] R[d]' D[I1] R[d] U[I2]' R[d]'", '1-I1 x 1-I2'],
      ["R[d] U[I2] R[d]' D[I1]' R[d] U[I2]' R[d]' D[I1]", '1-I2 x I1'],
      ["D[I1]' R[d] D[I2]' R[d]' D[I1] R[d] D[I2] R[d]'", '1-I1 x I2'],
      ["R[d] D[I2]' R[d]' D[I1]' R[d] D[I2] R[d]' D[I1]", 'I2 x I1'],
      ["D[I1]' R[d]' U[I2] R[d] D[I1] R[d]' U[I2]' R[d]", 'I1 x 1-I2'],
      ["R[d]' U[I2] R[d] D[I1]' R[d]' U[I2]' R[d] D[I1]", 'I2 x I1'],
      ["D[I1]' R[d]' D[I2]' R[d] D[I1] R[d]' D[I2] R[d]", 'I1 x I2'],
      ["R[d]' D[I2]' R[d] D[I1]' R[d]' D[I2] R[d] D[I1]", '1-I2 x I1'],
    ],
    D: [
      ["L[I1] B[d] L[I2] B[d]' L[I1]' B[d] L[I2]' B[d]'", 'I1 x 1-I2'],
      ["B[d] L[I2] B[d]' L[I1] B[d] L[I2]' B[d]' L[I1]'", 'I1 x 1-I2'],
      ["L[I1] B[d] R[I2]' B[d]' L[I1]' B[d] R[I2] B[d]'", 'I1 x I2'],
      ["B[d] R[I2]' B[d]' L[I1] B[d] R[I2] B[d]' L[I1]'", 'I1 x I2'],
      ["L[I1] B[d]' L[I2] B[d] L[I1]' B[d]' L[I2]' B[d]", 'I1 x I2'],
      ["B[d]' L[I2] B[d] L[I1] B[d]' L[I2]' B[d] L[I1]'", 'I1 x I2'],
      ["L[I1] B[d]' R[I2]' B[d] L[I1]' B[d]' R[I2] B[d]", 'I1 x 1-I2'],
      ["B[d]' R[I2]' B[d] L[I1] B[d]' R[I2] B[d] L[I1]'", 'I1 x 1-I2'],
      ["L[I1]' D[d] L[I2]' D[d]' L[I1] D[d] L[I2] D[d]'", 'I2 x I1'],
      ["D[d] L[I2]' D[d]' L[I1]' D[d] L[I2] D[d]' L[I1]", 'I1 x 1-I2'],
      ["L[I1]' D[d] R[I2] D[d]' L[I1] D[d] R[I2]' D[d]'", '1-I2 x I1'],
      ["D[d] R[I2] D[d]' L[I1]' D[d] R[I2]' D[d]' L[I1]", 'I1 x I2'],
      ["L[I1]' D[d]' L[I2]' D[d] L[I1] D[d]' L[I2] D[d]", 'I2 x 1-I1'],
      ["D[d]' L[I2]' D[d] L[I1]' D[d]' L[I2] D[d] L[I1]", 'I1 x I2'],
      ["L[I1]' D[d]' R[I2] D[d] L[I1] D[d]' R[I2]' D[d]", '1-I2 x 1-I1'],
      ["D[d]' R[I2] D[d] L[I1]' D[d]' R[I2]' D[d] L[I1]", 'I1 x 1-I2'],
      ["R[I1] D[d] L[I2]' D[d]' R[I1]' D[d] L[I2] D[d]'", 'I2 x 1-I1'],
      ["D[d] L[I2]' D[d]' R[I1] D[d] L[I2] D[d]' R[I1]'", '1-I1 x 1-I2'],
      ["R[I1] D[d] R[I2] D[d]' R[I1]' D[d] R[I2]' D[d]'", '1-I2 x 1-I1'],
      ["D[d] R[I2] D[d]' R[I1] D[d] R[I2]' D[d]' R[I1]'", '1-I1 x I2'],
      ["R[I1] D[d]' L[I2]' D[d] R[I1]' D[d]' L[I2] D[d]", 'I2 x I1'],
      ["D[d]' L[I2]' D[d] R[I1] D[d]' L[I2] D[d] R[I1]'", '1-I1 x I2'],
      ["R[I1] D[d]' R[I2] D[d] R[I1]' D[d]' R[I2]' D[d]", '1-I2 x I1'],
      ["D[d]' R[I2] D[d] R[I1] D[d]' R[I2]' D[d] R[I1]'", '1-I1 x 1-I2'],
      ["R[I1]' B[d] L[I2] B[d]' R[I1] B[d] L[I2]' B[d]'", '1-I1 x 1-I2'],
      ["B[d] L[I2] B[d]' R[I1]' B[d] L[I2]' B[d]' R[I1]", '1-I1 x 1-I2'],
      ["R[I1]' B[d] R[I2]' B[d]' R[I1] B[d] R[I2] B[d]'", '1-I1 x I2'],
      ["B[d] R[I2]' B[d]' R[I1]' B[d] R[I2] B[d]' R[I1]", '1-I1 x I2'],
      ["R[I1]' B[d]' L[I2] B[d] R[I1] B[d]' L[I2]' B[d]", '1-I1 x I2'],
      ["B[d]' L[I2] B[d] R[I1]' B[d]' L[I2]' B[d] R[I1]", '1-I1 x I2'],
      ["R[I1]' B[d]' R[I2]' B[d] R[I1] B[d]' R[I2] B[d]", '1-I1 x 1-I2'],
      ["B[d]' R[I2]' B[d] R[I1]' B[d]' R[I2] B[d] R[I1]", '1-I1 x 1-I2'],
    ],
  };
  const flip = ([a, b]) => [1 - b, 1 - a];
  const iv = ([a, b]) => `[${num(a)},${num(b)}]`;

  // The sequence of a variant for the rectangle X x Y (cube coordinates on the blue face).
  function twoFace([tpl, spec], X, Y, d) {
    const [sx, sy] = spec.split(' x '), I = {};
    I[sx.slice(-2)] = sx.startsWith('1-') ? flip(X) : X;
    I[sy.slice(-2)] = sy.startsWith('1-') ? flip(Y) : Y;
    return tpl.replace(/\[I1\]/g, iv(I.I1)).replace(/\[I2\]/g, iv(I.I2)).replace(/\[d\]/g, `[0,${num(d)}]`);
  }

  // Like paint, but changing only the blue face and the face of each colour.
  // Every run is checked on a model cube; a variant that would disturb an
  // earlier run is skipped. Returns { text, fallbacks } (fallbacks: runs
  // that had to use the six-face commutator).
  function paintTwo(columns, { d = 0.03 } = {}) {
    const IC = global.InfiniCube, cube = new IC.Cube(), parts = [];
    const B = IC.FACE_NAMES.indexOf('B');
    let painted = 0, total = 0, fallbacks = 0;
    const wrong = () => {                       // [changed area on the blue face, changed area anywhere]
      const k = cube.k, c = cube.cuts;
      let onB = 0, all = 0;
      for (let f = 0; f < 6; f++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
        if (cube.colourAt(f, i * k + j) === f) continue;
        const a = (c[i + 1] - c[i]) * (c[j + 1] - c[j]);
        all += a;
        if (f === B) onB += a;
      }
      return [onB, all];
    };
    const run = (text, sign) => {
      const ms = IC.notation.toMoves(text).map(IC.toCanonical);
      if (sign > 0) for (const m of ms) cube.apply(m);
      else for (let n = ms.length - 1; n >= 0; n--) cube.apply(IC.inverseMove(ms[n]));
    };
    // The thin outer layer of a sequence covers a frame of width d around the
    // face, so the picture stays inside [d, 1 - d].
    // Rounded as the notation will print it, so that the check below is exact.
    const inside = (x) => +Math.min(1 - d, Math.max(d, x)).toFixed(6);
    for (const { u0, u1, runs } of columns) {
      const c0 = inside(u0), c1 = inside(u1);
      for (const { v0, v1, colour } of runs) {
        const a = inside(v0), b = inside(v1);
        if (!(b - a > 1e-5 && c1 - c0 > 1e-5)) continue;
        // The two slabs of a sequence are parallel and must not overlap, so cut the
        // run where it crosses the diagonals of the face.
        const marks = [a, b];
        for (const m of [c0, c1, 1 - c0, 1 - c1]) if (m > a + 1e-9 && m < b - 1e-9) marks.push(+m.toFixed(6));
        marks.sort((p, q) => p - q);
        for (let n = 0; n + 1 < marks.length; n++) if (marks[n + 1] - marks[n] > 1e-5) piece(c0, c1, marks[n], marks[n + 1], colour, 0);
      }
    }
    function piece(c0, c1, a, b, colour, depth) {
      const X = [1 - c1, 1 - c0], Y = [1 - b, 1 - a], area = (c1 - c0) * (b - a);
      for (const variant of TWO[colour]) {
        const text = twoFace(variant, X, Y, d);
        run(text, 1);
        const [onB, all] = wrong();
        if (Math.abs(onB - painted - area) < 1e-9 && Math.abs(all - total - 2 * area) < 1e-9) {
          parts.push(text); painted += area; total += 2 * area;
          return;
        }
        run(text, -1);
      }
      if (depth < 2 && b - a > 4e-3) {
        const mid = +((a + b) / 2).toFixed(6);
        piece(c0, c1, a, mid, colour, depth + 1);
        piece(c0, c1, mid, b, colour, depth + 1);
        return;
      }
      const text = PAINT[colour](c0, c1, a, b);
      run(text, 1);
      parts.push(text); fallbacks++; painted += area; total += 6 * area;
    }
    return { text: parts.join('\n'), fallbacks };
  }

  // Split [0, 1] into n columns and let run(u0, u1) give each column's runs.
  // two: use the two-face construction.
  function byColumns(n, run, two, d) {
    const cols = [];
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      cols.push({ u0, u1, runs: run(u0, u1) });
    }
    return two ? paintTwo(cols, d ? { d } : {}).text : paint(cols);
  }

  // Extent of f over [u0, u1], sampled.
  function extent(f, u0, u1) {
    let lo = Infinity, hi = -Infinity;
    for (let s = 0; s <= 8; s++) {
      const y = f(u0 + ((u1 - u0) * s) / 8);
      if (isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
    return [lo, hi];
  }

  // The graph of y = f(u) (y measured upwards, so v = 1 - y), drawn with the
  // given line width, or the region below or above the graph.
  function graph(f, { n, width = 0.03, mode = 'curve', colour = 'L', two = false, d = 0 }) {
    const g = (u) => 1 - f(u);
    return byColumns(n, (u0, u1) => {
      const [lo, hi] = extent(g, u0, u1);
      if (!isFinite(lo)) return [];
      if (mode === 'below') return [{ v0: g((u0 + u1) / 2), v1: 1, colour }];
      if (mode === 'above') return [{ v0: 0, v1: g((u0 + u1) / 2), colour }];
      return [{ v0: lo - width / 2, v1: hi + width / 2, colour }];
    }, two, d);
  }

  // A smooth random function on [0, 1] with values in [0.15, 0.85]: a few
  // random sine modes, rescaled.
  function randomFunction(seed, modes = 4) {
    const r = global.InfiniCube.walk.rng(seed);
    const terms = Array.from({ length: modes }, (_, k) => ({
      a: (r() * 2 - 1) / (k + 1), w: 2 * Math.PI * (k + 1) * (0.5 + r()), p: 2 * Math.PI * r(),
    }));
    const raw = (u) => terms.reduce((s, t) => s + t.a * Math.sin(t.w * u + t.p), 0);
    let lo = Infinity, hi = -Infinity;
    for (let s = 0; s <= 400; s++) { const y = raw(s / 400); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const span = hi - lo || 1;
    return (u) => 0.15 + (0.7 * (raw(u) - lo)) / span;
  }

  // A user function of u, written with Math names: sin, cos, PI, abs, ...
  function userFunction(text) {
    const names = Object.getOwnPropertyNames(Math);
    // eslint-disable-next-line no-new-func
    const f = new Function('u', ...names, `return (${text});`);
    const args = names.map((k) => Math[k]);
    return (u) => +f(u, ...args);
  }

  function disc({ n, cx = 0.5, cy = 0.5, r = 0.3, colour = 'L', two = false, d = 0 }) {
    return byColumns(n, (u0, u1) => {
      // widest vertical extent of the disc over the column
      const du = Math.max(0, Math.abs((u0 + u1) / 2 - cx) - (u1 - u0) / 2);
      if (du >= r) return [];
      const h = Math.sqrt(r * r - du * du), cv = 1 - cy;
      return [{ v0: cv - h, v1: cv + h, colour }];
    }, two, d);
  }

  global.InfiniCube.draw = { PAINT, COLOURS, TWO, paint, paintTwo, twoFace, byColumns, graph, randomFunction, userFunction, disc };
})(typeof window !== 'undefined' ? window : globalThis);
