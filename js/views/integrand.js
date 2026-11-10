// The thing being integrated, f(t) e^(-st), as a curve in the complex plane: e^(-st)
// spins and shrinks (or grows) the real value f(t) as t advances.
import { h } from "../ui.js";
import { palette } from "../palette.js";
import { fitCanvas, planeFrame, fitWindow, drawPlane, arrow, dot, trace } from "../plot2d.js";
import { fmtComplex } from "../lib/tex.js";
import { probePath, indexAt } from "../probe.js";

export default {
  id: "integrand", title: "Integrand",
  mount(el, store) {
    const box = h("div", { class: "plot" }), value = h("b"), name = h("span");
    el.append(box, h("div", { class: "vbar figures", vars: { "--kc": "var(--c6)" } }, h("span", null, name, " = ", value)));
    const cv = fitCanvas(box, draw), { canvas, ctx } = cv;
    box.prepend(canvas);
    canvas.setAttribute("role", "img");

    let fit = null;
    function draw() {
      const { model, time } = store.state, { w, h: hgt } = cv.size;
      if (!w || !model) return;
      const pal = palette(), path = probePath(store.state), i = indexAt(path, time.t);
      if (!fit || fit.path !== path) {
        const pts = [];
        for (let k = 0; k <= path.n; k++) pts.push([path.zr[k], path.zi[k]]);
        fit = { path, win: fitWindow(pts, 1.25) };
      }
      const f = planeFrame(w, hgt, fit.win), X = (k) => f.x(path.zr[k]), Y = (k) => f.y(path.zi[k]);
      ctx.clearRect(0, 0, w, hgt);
      drawPlane(ctx, f, pal);
      trace(ctx, i, path.n, X, Y, pal.alpha("integrand", 0.3), 1.25); // still to come
      trace(ctx, 0, i, X, Y, pal.integrand, 2);
      arrow(ctx, f.x(0), f.y(0), X(i), Y(i), pal.alpha("integrand", 0.75), 1.5, 8);
      dot(ctx, X(i), Y(i), pal.integrand, pal);
      const z = { re: path.zr[i], im: path.zi[i] };
      name.textContent = `${model.sig}(t)·e^(−st)`;
      value.textContent = fmtComplex(z, 3);
      canvas.setAttribute("aria-label", `The integrand ${model.sig}(t) times e to the minus s t, traced in the complex plane up to the time cursor. Its value there is ${fmtComplex(z, 3)}.`);
    }
    return { update(state, dirty) { if (dirty.has("model") || dirty.has("probe") || dirty.has("time") || dirty.has("theme")) draw(); } };
  },
};
