// The Laplace integral as a sum of vectors: each slice of time adds a small arrow,
// f(t) e^(-st) Δt, tip to tail. Where the integral converges the arrows spiral in on
// F(s); where it doesn't, they wander off, even though the closed form for F(s) still
// has a value there (its analytic continuation).
import { h } from "../ui.js";
import { palette } from "../palette.js";
import { fitCanvas, planeFrame, fitWindow, drawPlane, arrow, trace, label } from "../plot2d.js";
import { evalTransformAt } from "../lib/analyse.js";
import { fmtComplex } from "../lib/tex.js";
import { probePath, indexAt } from "../probe.js";

const ARROWS = 40; // slices the time window is cut into, one arrow each

export default {
  id: "integral", title: "Integral",
  mount(el, store) {
    const box = h("div", { class: "plot" });
    const sumName = h("span"), sum = h("b", { vars: { "--kc": "var(--c2)" } }), closedName = h("span"), closed = h("b", { vars: { "--kc": "var(--c3)" } });
    const tag = h("span", { class: "sd-tag" }), note = h("span", { class: "note" });
    el.append(box, h("div", { class: "vbar figures" }, h("span", null, sumName, " = ", sum), h("span", null, closedName, " = ", closed), h("span", { class: "status", role: "status", "aria-live": "polite" }, tag, note)));
    const cv = fitCanvas(box, draw), { canvas, ctx } = cv;
    box.prepend(canvas);
    canvas.setAttribute("role", "img");

    let fit = null, said = "";
    function draw() {
      const { model, probe, time } = store.state, { w, h: hgt } = cv.size;
      if (!w || !model) return;
      const pal = palette(), path = probePath(store.state), i = indexAt(path, time.t);
      const F = evalTransformAt(model, probe), finite = Number.isFinite(F.re) && Number.isFinite(F.im);
      if (!fit || fit.path !== path) {
        const pts = [];
        for (let k = 0; k <= path.n; k++) pts.push([path.ir[k], path.ii[k]]);
        const tight = fitWindow(pts, 1.3);
        // F(s) belongs in the picture unless it is far outside what the path covers
        const showF = finite && Math.hypot(F.re - tight.cx, F.im - tight.cy) < 6 * tight.half;
        if (showF) pts.push([F.re, F.im]);
        fit = { path, showF, win: fitWindow(pts, 1.3) };
      }
      const f = planeFrame(w, hgt, fit.win), X = (k) => f.x(path.ir[k]), Y = (k) => f.y(path.ii[k]);
      ctx.clearRect(0, 0, w, hgt);
      drawPlane(ctx, f, pal);
      trace(ctx, i, path.n, X, Y, pal.alpha("integral", 0.32), 1.25); // where it goes from here
      // one arrow per slice of time, up to the cursor
      const per = Math.max(1, Math.round(time.tMax / ARROWS / path.dt));
      for (let a = 0; a < i; a += per) {
        const b = Math.min(i, a + per);
        arrow(ctx, X(a), Y(a), X(b), Y(b), pal.alpha("integral", 0.9), 1.5, 7);
      }
      arrow(ctx, f.x(0), f.y(0), X(i), Y(i), pal.integral, 3, 12); // the total so far
      if (fit.showF) {
        const x = f.x(F.re), y = f.y(F.im), r = 6;
        ctx.beginPath(); ctx.moveTo(x, y - r - 2); ctx.lineTo(x + r + 2, y); ctx.lineTo(x, y + r + 2); ctx.lineTo(x - r - 2, y); ctx.closePath();
        ctx.fillStyle = pal.sheet; ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
        ctx.strokeStyle = pal.value; ctx.lineWidth = 2; ctx.stroke();
        label(ctx, `${model.cap}(s)`, x + 11, y - 9, pal.value, pal);
      }
      const total = { re: path.ir[i], im: path.ii[i] }, last = { re: path.ir[path.n], im: path.ii[path.n] };
      sumName.textContent = `∫ 0 to ${time.t.toFixed(2)}`;
      sum.textContent = fmtComplex(total, 3);
      closedName.textContent = `${model.cap}(s)`;
      closed.textContent = finite ? fmtComplex(F, 3) : "infinite: a pole";
      // how the whole integral behaves at this s, in words (colour alone doesn't say it)
      const off = finite ? Math.hypot(last.re - F.re, last.im - F.im) / Math.max(Math.hypot(F.re, F.im), 1e-12) : Infinity;
      const state = path.status === "converges" ? (off <= 0.01 ? ["sd-ok", "Converges", `to ${model.cap}(s)`] : ["sd-warn", "Converging slowly", "this close to the edge of the region"])
        : path.status === "boundary" ? ["sd-warn", "Never settles", "s is on the edge of the region of convergence"]
        : ["sd-danger", "Diverges", `the value of ${model.cap}(s) here is its analytic continuation`];
      if (said !== state.join()) { said = state.join(); tag.className = "sd-tag " + state[0]; tag.textContent = state[1]; note.textContent = state[2]; }
      canvas.setAttribute("aria-label", `The running integral as a chain of vectors. Up to the time cursor it is ${fmtComplex(total, 3)}. ${state[1]}: ${state[2]}.`);
    }
    return { update(state, dirty) { if (dirty.has("model") || dirty.has("probe") || dirty.has("time") || dirty.has("theme")) draw(); } };
  },
};
