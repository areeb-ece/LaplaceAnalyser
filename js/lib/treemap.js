// Fits rectangles into a rectangle: each gets an area in proportion to its weight, and
// together they fill it exactly. Used to lay the chosen views out in a saved image.
//
// The rectangle is cut in two by a straight line, the pieces shared between the two
// sides, and each side cut again. Every way of doing that (with the pieces taken
// largest first) is tried, and the one whose worst-shaped piece is least badly shaped
// wins. That is a handful of cases for the few views there are.

/**
 * weights → [{ x, y, w, h }] in the same order, together filling rect exactly.
 * shapes[i] is the width-to-height ratio piece i would like (1, a square, if not given);
 * a piece is judged by how far its shape is from that, either way.
 */
export function fitRects(weights, rect, shapes = []) {
  const order = weights.map((wt, i) => ({ i, wt })).sort((a, b) => b.wt - a.wt || a.i - b.i);
  const sums = [0];
  for (const o of order) sums.push(sums[sums.length - 1] + o.wt);
  const out = new Array(weights.length);
  if (!weights.length || !(sums[sums.length - 1] > 0)) return [];
  // the best layout of pieces a…b−1 in r: { worst, cells }
  const best = (a, b, r) => {
    if (b - a === 1) {
      const off = r.w / r.h / (shapes[order[a].i] || 1), bad = Math.max(off, 1 / off);
      return { worst: bad, total: bad, cells: [{ i: order[a].i, ...r }] };
    }
    let win = null;
    for (let k = a + 1; k < b; k++) {
      const share = (sums[k] - sums[a]) / (sums[b] - sums[a]);
      for (const across of [true, false]) {
        const first = across ? { x: r.x, y: r.y, w: r.w * share, h: r.h } : { x: r.x, y: r.y, w: r.w, h: r.h * share };
        const second = across ? { x: r.x + first.w, y: r.y, w: r.w - first.w, h: r.h } : { x: r.x, y: r.y + first.h, w: r.w, h: r.h - first.h };
        const p = best(a, k, first), q = best(k, b, second), worst = Math.max(p.worst, q.worst), total = p.total + q.total;
        // a clear improvement only: near-ties keep the first found, so a picture and its
        // smaller preview (whose shape differs by a rounded pixel) are laid out alike
        if (!win || worst < win.worst * 0.97 || (worst < win.worst * 1.03 && total < win.total * 0.97)) win = { worst, total, cells: p.cells.concat(q.cells) };
      }
    }
    return win;
  };
  for (const c of best(0, order.length, rect).cells) out[c.i] = { x: c.x, y: c.y, w: c.w, h: c.h };
  return out;
}
