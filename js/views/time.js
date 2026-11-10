// f(t) or y(t) against time, with the time cursor that every other view follows.
import { h, icon } from "../ui.js";
import { palette } from "../palette.js";
import { fitCanvas, niceStep, tickText, dot, label } from "../plot2d.js";
import { evalSignal } from "../lib/analyse.js";
import { fmt } from "../lib/tex.js";

const PAD = { l: 46, r: 14, t: 34, b: 26 }; // the top leaves room for the zoom buttons

export default {
  id: "time", title: "Time domain",
  mount(el, store) {
    const box = h("div", { class: "plot" });
    const zoom = (k) => () => {
      const { tMax, t } = store.state.time, next = Math.min(2000, Math.max(0.1, tMax * k));
      store.patch("time", { tMax: next, t: Math.min(t, next) });
    };
    box.append(h("div", { class: "corner" },
      h("button", { class: "sd-btn sd-ghost sd-small sd-icon", type: "button", title: "Show half as much time", "aria-label": "Show half as much time", on: { click: zoom(0.5) } }, icon("plus")),
      h("button", { class: "sd-btn sd-ghost sd-small sd-icon", type: "button", title: "Show twice as much time", "aria-label": "Show twice as much time", on: { click: zoom(2) } }, icon("minus"))));
    el.append(box);
    const cv = fitCanvas(box, draw), { canvas, ctx } = cv;
    box.prepend(canvas);
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "slider");
    canvas.setAttribute("aria-label", "Time cursor, in seconds");
    canvas.setAttribute("aria-valuemin", "0");

    let cache = null;
    function samples() {
      const { model, time } = store.state, n = Math.min(2400, Math.max(300, cv.size.w * 2));
      if (cache && cache.model === model && cache.tMax === time.tMax && cache.n === n) return cache;
      const ys = new Float64Array(n + 1);
      let lo = 0, hi = 0;
      for (let i = 0; i <= n; i++) { const v = evalSignal(model, (time.tMax * i) / n); ys[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi - lo < 1e-12) { hi += 1; lo -= 1; }
      const pad = (hi - lo) * 0.08;
      return (cache = { model, tMax: time.tMax, n, ys, lo: lo - pad, hi: hi + pad });
    }
    const X = (t) => PAD.l + (t / store.state.time.tMax) * (cv.size.w - PAD.l - PAD.r);

    function draw() {
      const { model, time } = store.state, { w, h: hgt } = cv.size;
      if (!w || !model) return;
      const pal = palette(), s = samples();
      const Y = (v) => hgt - PAD.b - ((v - s.lo) / (s.hi - s.lo)) * (hgt - PAD.t - PAD.b);
      ctx.clearRect(0, 0, w, hgt);
      ctx.font = `11px ${pal.mono}`;
      ctx.lineWidth = 1;
      const xs = niceStep(time.tMax, (w - PAD.l - PAD.r) / 80), ystep = niceStep(s.hi - s.lo, (hgt - PAD.t - PAD.b) / 40);
      ctx.strokeStyle = pal.rule2; ctx.fillStyle = pal.ink3;
      ctx.beginPath();
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (let v = 0; v <= time.tMax * (1 + 1e-9); v += xs) {
        const x = Math.round(X(v)) + 0.5;
        ctx.moveTo(x, PAD.t); ctx.lineTo(x, hgt - PAD.b);
        ctx.fillText(tickText(Number(v.toPrecision(10))), x, hgt - PAD.b + 6);
      }
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (let v = Math.ceil(s.lo / ystep) * ystep; v <= s.hi; v += ystep) {
        const y = Math.round(Y(v)) + 0.5, t = Math.abs(v) < ystep / 1e6 ? 0 : Number(v.toPrecision(10));
        ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y);
        ctx.fillText(tickText(t), PAD.l - 6, y);
      }
      ctx.stroke();
      // the axes: t = 0 and the zero line
      ctx.strokeStyle = pal.ink4;
      ctx.beginPath();
      ctx.moveTo(PAD.l + 0.5, PAD.t); ctx.lineTo(PAD.l + 0.5, hgt - PAD.b);
      ctx.moveTo(PAD.l, Math.round(Y(0)) + 0.5); ctx.lineTo(w - PAD.r, Math.round(Y(0)) + 0.5);
      ctx.stroke();
      // the signal
      ctx.save();
      ctx.beginPath(); ctx.rect(PAD.l, PAD.t - 4, w - PAD.l - PAD.r, hgt - PAD.t - PAD.b + 8); ctx.clip();
      ctx.strokeStyle = pal.signal; ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i <= s.n; i++) { const x = X((time.tMax * i) / s.n), y = Y(s.ys[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.restore();
      // the cursor
      const v = evalSignal(model, time.t), cx = X(time.t);
      ctx.strokeStyle = pal.ink2; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, PAD.t); ctx.lineTo(Math.round(cx) + 0.5, hgt - PAD.b); ctx.stroke();
      ctx.setLineDash([]);
      dot(ctx, cx, Y(v), pal.signal, pal);
      const right = cx < w - 110;
      label(ctx, `${model.sig}(t) = ${fmt(v)}`, cx + (right ? 10 : -10), Math.max(PAD.t + 8, Math.min(hgt - PAD.b - 8, Y(v) - 12)), pal.ink, pal, { align: right ? "left" : "right", baseline: "middle" });
      canvas.setAttribute("aria-valuemax", String(time.tMax));
      canvas.setAttribute("aria-valuenow", String(Number(time.t.toFixed(3))));
      canvas.setAttribute("aria-valuetext", `t = ${fmt(time.t)} seconds, ${model.sig} = ${fmt(v)}`);
    }

    // Anywhere on the plot scrubs: the cursor goes to the pointer.
    const scrub = (e) => {
      const r = canvas.getBoundingClientRect(), { tMax } = store.state.time;
      const t = ((e.clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r)) * tMax;
      store.patch("time", { t: Math.min(tMax, Math.max(0, t)), playing: false });
    };
    canvas.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true }); scrub(e); });
    canvas.addEventListener("pointermove", (e) => { if (canvas.hasPointerCapture(e.pointerId)) scrub(e); });
    canvas.addEventListener("keydown", (e) => {
      const { t, tMax } = store.state.time, step = tMax / (e.shiftKey ? 20 : 200);
      const next = { ArrowLeft: t - step, ArrowDown: t - step, ArrowRight: t + step, ArrowUp: t + step, Home: 0, End: tMax }[e.key];
      if (next == null) return;
      store.patch("time", { t: Math.min(tMax, Math.max(0, next)), playing: false });
      e.preventDefault();
    });

    return { update(state, dirty) { if (dirty.has("model") || dirty.has("time") || dirty.has("theme")) draw(); } };
  },
};
