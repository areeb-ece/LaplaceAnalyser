// The Laplace integral as a sum of vectors: each slice of time adds a small arrow,
// f(t) e^(-st) Δt, tip to tail. Where the integral converges the arrows spiral in on
// F(s); where it doesn't, they wander off, even though the closed form for F(s) still
// has a value there (its analytic continuation). Impulses at t = 0 come first, as one
// arrow from the origin: all of their part of the integral arrives at once. A later
// impulse is one long arrow in the chain, at its time.
import { h } from "../ui.js";
import { palette } from "../palette.js";
import { mathLayer } from "../math.js";
import { legendDom } from "../legend.js";
import { fitCanvas, planeFrame, fitWindow, drawPlane, arrow, trace } from "../plot2d.js";
import { evalTransformAt, impulseAt } from "../lib/analyse.js";
import { texComplex, impTex } from "../lib/tex.js";
import { probePath, indexAt } from "../probe.js";

const ARROWS = 40; // slices the time window is cut into, one arrow each
const closedForm = (state) => { const F = evalTransformAt(state.model, state.probe); return { F, finite: Number.isFinite(F.re) && Number.isFinite(F.im) }; };

/** Draw the chain of arrows up to the time cursor, the total so far, and F(s). */
export function paintIntegral(g, state, o, cache) {
  const { ctx, w, h: hgt, pal, math } = g, { model, time } = state;
  const path = probePath(state), i = indexAt(path, time.t), { F, finite } = closedForm(state);
  if (cache.path !== path) {
    const pts = [[0, 0]];
    for (let k = 0; k <= path.n; k++) pts.push([path.ir[k], path.ii[k]]);
    const tight = fitWindow(pts, 1.3);
    // F(s) belongs in the picture unless it is far outside what the path covers
    const showF = finite && Math.hypot(F.re - tight.cx, F.im - tight.cy) < 6 * tight.half;
    if (showF) pts.push([F.re, F.im]);
    Object.assign(cache, { path, showF, win: fitWindow(pts, 1.3) });
  }
  const f = planeFrame(w, hgt, cache.win), X = (k) => f.x(path.ir[k]), Y = (k) => f.y(path.ii[k]);
  drawPlane(ctx, f, pal);
  trace(ctx, i, path.n, X, Y, pal.alpha("integral", 0.32), 1.25); // where it goes from here
  if (model.kicks.some((k) => k.T === 0)) arrow(ctx, f.x(0), f.y(0), X(0), Y(0), pal.alpha("integral", 0.9), 2.5, 10);
  const per = Math.max(1, Math.round(time.tMax / ARROWS / path.dt));
  for (let a = 0; a < i; a += per) {
    const b = Math.min(i, a + per);
    arrow(ctx, X(a), Y(a), X(b), Y(b), pal.alpha("integral", 0.9), 1.5, 7);
  }
  arrow(ctx, f.x(0), f.y(0), X(i), Y(i), pal.integral, 3, 12); // the total so far
  if (!cache.showF) return;
  const x = f.x(F.re), y = f.y(F.im), r = 6;
  ctx.beginPath(); ctx.moveTo(x, y - r - 2); ctx.lineTo(x + r + 2, y); ctx.lineTo(x, y + r + 2); ctx.lineTo(x - r - 2, y); ctx.closePath();
  ctx.fillStyle = pal.sheet; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
  ctx.strokeStyle = pal.value; ctx.lineWidth = 2; ctx.stroke();
  math(`${model.cap}(s)`, x + 11, y - 12, { color: pal.value });
}

/** The two values and, in words, how the whole integral behaves at this s (colour alone doesn't say it). */
export function integralLegend(state) {
  const { model, time } = state, path = probePath(state), i = indexAt(path, time.t), { F, finite } = closedForm(state);
  const last = { re: path.ir[path.n], im: path.ii[path.n] };
  const off = finite ? Math.hypot(last.re - F.re, last.im - F.im) / Math.max(Math.hypot(F.re, F.im), 1e-12) : Infinity;
  const [status, word, note] = path.status === "converges" ? (off <= 0.01 ? ["ok", "Converges", `to ${model.cap}(s)`] : ["warn", "Converging slowly", "this close to the edge of the region"])
    : path.status === "boundary" ? ["warn", "Never settles", "s is on the edge of the region of convergence"]
    : ["danger", "Diverges", `the value of ${model.cap}(s) here is its analytic continuation`];
  const kicked = model.kicks.some((k) => k.T === 0);
  return [
    { mark: "arrow", role: "integral", tint: true, tex: `\\int_{${kicked ? "0^-" : "0"}}^{${time.t.toFixed(2)}} ${model.sig}(\\tau)\\,e^{-s\\tau}\\,d\\tau = ${texComplex({ re: path.ir[i], im: path.ii[i] }, 3)}` },
    // what each impulse adds, all at once at its time: the first arrow, or a jump in the chain
    ...model.kicks.map((k) => ({ mark: "arrow", role: "integral", text: k.T ? `At t = ${+k.T.toPrecision(4)},` : "First, at t = 0,", tex: `${impTex(k.imp, k.T)} \\to ${texComplex(k.T ? impulseAt(k, state.probe) : path.kick, 3)}` })),
    { mark: "diamond", role: "value", tint: true, tex: `${model.cap}(s) = ${finite ? texComplex(F, 3) : "\\infty"}` },
    { text: word, status },
    { text: note },
  ];
}

export default {
  id: "integral", title: "Integral", paint: paintIntegral, legend: integralLegend,
  mount(el, store) {
    const box = h("div", { class: "plot" }), key = h("span", { class: "key", role: "status", "aria-live": "polite" });
    el.append(box, h("div", { class: "vbar" }, key));
    const cache = {}, cv = fitCanvas(box, draw), { canvas, ctx } = cv, layer = mathLayer(box);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "The running integral as a chain of vectors, with the closed-form value marked.");
    function draw() {
      const { w, h: hgt } = cv.size;
      if (!w || !store.state.model) return;
      const pal = palette();
      ctx.clearRect(0, 0, w, hgt);
      layer.begin();
      paintIntegral({ ctx, w, h: hgt, pal, math: layer.put }, store.state, { cursor: true }, cache);
      layer.end();
      legendDom(key, integralLegend(store.state), pal);
    }
    return { update(state, dirty) { if (dirty.has("model") || dirty.has("probe") || dirty.has("time") || dirty.has("theme")) draw(); } };
  },
};
