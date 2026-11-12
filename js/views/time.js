// f(t) or y(t) against time, with the time cursor that every other view follows.
// Impulses are drawn the usual way: an arrow standing on the axis where each one is,
// labelled with its size (an impulse has no height to plot, only an area). Where a
// piece switches on, the curve jumps straight up or down at that instant.
import { h, icon } from "../ui.js";
import { palette } from "../palette.js";
import { mathLayer } from "../math.js";
import { fitCanvas, niceStep, tick, dot, arrow } from "../plot2d.js";
import { evalSignal } from "../lib/analyse.js";
import { texNum, impTex } from "../lib/tex.js";

const PAD = { l: 46, r: 30, t: 34, b: 28 }; // the top holds the axis name (and, on the page, the zoom buttons)

function samples(state, w, cache) {
  const { model, time } = state, n = Math.min(2400, Math.max(300, Math.round(w * 2)));
  if (cache.model === model && cache.tMax === time.tMax && cache.n === n) return cache;
  // even steps, and at each switch-on time the values just before and just after it
  const ts = [];
  for (let i = 0; i <= n; i++) ts.push((time.tMax * i) / n);
  const jumps = [...new Set(model.terms.map((x) => x.on ?? 0).filter((v) => v > 0 && v < time.tMax))];
  for (const T of jumps) ts.push(T * (1 - 1e-12), T);
  ts.sort((a, b) => a - b);
  const ys = new Float64Array(ts.length);
  let lo = 0, hi = 0;
  ts.forEach((t, i) => { const v = evalSignal(model, t); ys[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; });
  // an impulse's arrow needs the zero line at least halfway from the edge it points to
  const dirs = new Set(model.kicks.map(upward));
  if (dirs.has(true)) hi = Math.max(hi, -lo);
  if (dirs.has(false)) lo = Math.min(lo, -hi);
  if (hi - lo < 1e-12) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08;
  return Object.assign(cache, { model, tMax: time.tMax, n, ts, ys, lo: lo - pad, hi: hi + pad });
}

// Which way an impulse's arrow points: by the sign of δ's size, or of the first
// derivative's when there's no plain impulse there.
const upward = (kick) => kick.imp.find((d) => d !== 0) > 0;

/** Draw the plot. g = { ctx, w, h, pal, math }; o.cursor: whether to mark the time cursor. */
export function paintTime(g, state, o, cache) {
  const { ctx, w, h: hgt, pal, math } = g, { model, time } = state;
  const s = samples(state, w, cache);
  const X = (t) => PAD.l + (t / time.tMax) * (w - PAD.l - PAD.r);
  const Y = (v) => hgt - PAD.b - ((v - s.lo) / (s.hi - s.lo)) * (hgt - PAD.t - PAD.b);
  ctx.lineWidth = 1;
  const xs = niceStep(time.tMax, (w - PAD.l - PAD.r) / 80), ystep = niceStep(s.hi - s.lo, (hgt - PAD.t - PAD.b) / 40);
  ctx.strokeStyle = pal.rule2; ctx.fillStyle = pal.ink3;
  ctx.beginPath();
  for (let v = 0; v <= time.tMax * (1 + 1e-9); v += xs) {
    const x = Math.round(X(v)) + 0.5;
    ctx.moveTo(x, PAD.t); ctx.lineTo(x, hgt - PAD.b);
    tick(ctx, Number(v.toPrecision(10)), x, hgt - PAD.b + 6, "center", "top");
  }
  for (let v = Math.ceil(s.lo / ystep) * ystep; v <= s.hi; v += ystep) {
    const y = Math.round(Y(v)) + 0.5;
    ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y);
    tick(ctx, Math.abs(v) < ystep / 1e6 ? 0 : Number(v.toPrecision(10)), PAD.l - 6, y, "right", "middle");
  }
  ctx.stroke();
  // the axes: t = 0 and the zero line, each with its name
  ctx.strokeStyle = pal.ink4;
  ctx.beginPath();
  ctx.moveTo(PAD.l + 0.5, PAD.t); ctx.lineTo(PAD.l + 0.5, hgt - PAD.b);
  ctx.moveTo(PAD.l, Math.round(Y(0)) + 0.5); ctx.lineTo(w - PAD.r, Math.round(Y(0)) + 0.5);
  ctx.stroke();
  math(`${model.sig}(t)`, PAD.l - 4, PAD.t - 14, { color: pal.signal, halo: false });
  math("t", w - 8, hgt - PAD.b + 13, { color: pal.ink3, align: "right", halo: false, size: 12 });
  // the signal
  ctx.save();
  ctx.beginPath(); ctx.rect(PAD.l, PAD.t - 4, w - PAD.l - PAD.r, hgt - PAD.t - PAD.b + 8); ctx.clip();
  ctx.strokeStyle = pal.signal; ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.beginPath();
  s.ts.forEach((t, i) => { const x = X(t), y = Y(s.ys[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.stroke();
  ctx.restore();
  for (const kick of model.kicks) {
    if (kick.T > time.tMax) continue;
    const up = upward(kick), x = X(kick.T), y0 = Y(0), room = up ? y0 - PAD.t : hgt - PAD.b - y0, tip = y0 + (up ? -1 : 1) * room * 0.82;
    arrow(ctx, x, y0, x, tip, pal.signal, 2.5, 11);
    const right = x < w - 120;
    math(impTex(kick.imp, kick.T), x + (right ? 9 : -9), tip + (up ? 6 : -6), { color: pal.signal, align: right ? "left" : "right", valign: up ? "top" : "bottom" });
  }
  if (!o.cursor) return;
  const v = evalSignal(model, time.t), cx = X(time.t);
  ctx.strokeStyle = pal.ink2; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, PAD.t); ctx.lineTo(Math.round(cx) + 0.5, hgt - PAD.b); ctx.stroke();
  ctx.setLineDash([]);
  dot(ctx, cx, Y(v), pal.signal, pal);
  const right = cx < w - 130;
  // where an impulse is, it has no value: what is shown is the value just after it
  const at = texNum(time.t) + (model.kicks.some((k) => k.T === time.t) ? "^+" : "");
  math(`${model.sig}(${at}) = ${texNum(v)}`, cx + (right ? 10 : -10), Math.max(PAD.t + 10, Math.min(hgt - PAD.b - 10, Y(v) - 14)), { color: pal.ink, align: right ? "left" : "right" });
}

export default {
  id: "time", title: "Time domain", paint: paintTime,
  mount(el, store) {
    const box = h("div", { class: "plot" });
    const zoom = (k) => () => {
      const { tMax, t } = store.state.time, next = Math.min(2000, Math.max(0.1, tMax * k));
      store.patch("time", { tMax: next, t: Math.min(t, next) });
    };
    el.append(box);
    const cache = {}, cv = fitCanvas(box, draw), { canvas, ctx } = cv, layer = mathLayer(box);
    box.append(h("div", { class: "corner" },
      h("button", { class: "sd-btn sd-ghost sd-small sd-icon", type: "button", title: "Show half as much time", "aria-label": "Show half as much time", on: { click: zoom(0.5) } }, icon("plus")),
      h("button", { class: "sd-btn sd-ghost sd-small sd-icon", type: "button", title: "Show twice as much time", "aria-label": "Show twice as much time", on: { click: zoom(2) } }, icon("minus"))));
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "slider");
    canvas.setAttribute("aria-label", "Time cursor, in seconds");
    canvas.setAttribute("aria-valuemin", "0");

    function draw() {
      const { model, time } = store.state, { w, h: hgt } = cv.size;
      if (!w || !model) return;
      ctx.clearRect(0, 0, w, hgt);
      layer.begin();
      paintTime({ ctx, w, h: hgt, pal: palette(), math: layer.put }, store.state, { cursor: true }, cache);
      layer.end();
      canvas.setAttribute("aria-valuemax", String(time.tMax));
      canvas.setAttribute("aria-valuenow", String(Number(time.t.toFixed(3))));
      canvas.setAttribute("aria-valuetext", `t = ${texNum(time.t)} seconds, ${model.sig} = ${texNum(evalSignal(model, time.t))}`);
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
