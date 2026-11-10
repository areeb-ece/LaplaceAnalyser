// The thing being integrated, f(t) e^(-st), as a curve in the complex plane: e^(-st)
// spins and shrinks (or grows) the real value f(t) as t advances.
import { h } from "../ui.js";
import { palette } from "../palette.js";
import { mathLayer } from "../math.js";
import { legendDom } from "../legend.js";
import { fitCanvas, planeFrame, fitWindow, drawPlane, arrow, dot, trace } from "../plot2d.js";
import { texComplex } from "../lib/tex.js";
import { probePath, indexAt } from "../probe.js";

/** Draw the curve. With o.cursor it is bright up to the time cursor, where its value is marked. */
export function paintIntegrand(g, state, o, cache) {
  const { ctx, w, h: hgt, pal } = g, path = probePath(state), i = o.cursor ? indexAt(path, state.time.t) : path.n;
  if (cache.path !== path) {
    const pts = [];
    for (let k = 0; k <= path.n; k++) pts.push([path.zr[k], path.zi[k]]);
    Object.assign(cache, { path, win: fitWindow(pts, 1.25) });
  }
  const f = planeFrame(w, hgt, cache.win), X = (k) => f.x(path.zr[k]), Y = (k) => f.y(path.zi[k]);
  drawPlane(ctx, f, pal);
  trace(ctx, i, path.n, X, Y, pal.alpha("integrand", 0.3), 1.25); // still to come
  trace(ctx, 0, i, X, Y, pal.integrand, 2);
  if (!o.cursor) return;
  arrow(ctx, f.x(0), f.y(0), X(i), Y(i), pal.alpha("integrand", 0.75), 1.5, 8);
  dot(ctx, X(i), Y(i), pal.integrand, pal);
}
/** What the curve is and, with the cursor, its value there. */
export function integrandLegend(state, o) {
  const path = probePath(state), i = indexAt(path, state.time.t), name = `${state.model.sig}(t)\\,e^{-st}`;
  return [{ mark: "line", role: "integrand", tint: true, tex: o.cursor ? `${name} = ${texComplex({ re: path.zr[i], im: path.zi[i] }, 3)}` : name }];
}

export default {
  id: "integrand", title: "Integrand", paint: paintIntegrand, legend: integrandLegend,
  mount(el, store) {
    const box = h("div", { class: "plot" }), key = h("span", { class: "key" });
    el.append(box, h("div", { class: "vbar" }, key));
    const cache = {}, cv = fitCanvas(box, draw), { canvas, ctx } = cv, layer = mathLayer(box);
    canvas.setAttribute("role", "img");
    function draw() {
      const { w, h: hgt } = cv.size;
      if (!w || !store.state.model) return;
      const pal = palette();
      ctx.clearRect(0, 0, w, hgt);
      layer.begin();
      paintIntegrand({ ctx, w, h: hgt, pal, math: layer.put }, store.state, { cursor: true }, cache);
      layer.end();
      legendDom(key, integrandLegend(store.state, { cursor: true }), pal);
      canvas.setAttribute("aria-label", `The integrand ${store.state.model.sig}(t) times e to the minus s t, traced in the complex plane up to the time cursor.`);
    }
    return { update(state, dirty) { if (dirty.has("model") || dirty.has("probe") || dirty.has("time") || dirty.has("theme")) draw(); } };
  },
};
