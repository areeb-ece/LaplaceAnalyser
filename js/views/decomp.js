// The signal taken apart: each pole p contributes one phasor, its residue times e^(pt),
// turning at the pole's imaginary part and growing or shrinking at its real part. Laid
// tip to tail they add up to f(t). Conjugate pairs cancel each other's imaginary parts,
// so the sum stays on the real axis, where it draws the signal as time runs. Down the
// left, each e^(pt) on its own. Impulses at t = 0 have no pole and no phasor: the key
// names them.
import { h } from "../ui.js";
import { palette } from "../palette.js";
import { mathLayer } from "../math.js";
import { legendDom } from "../legend.js";
import { fitCanvas, planeFrame, drawPlane, arrow, dot } from "../plot2d.js";
import { cplx, texNum, signalTex } from "../lib/tex.js";
import { hasImpulses } from "../lib/analyse.js";

const TRACE = 1.7; // how far down the trace of past values hangs, in units of the phasors' reach

// One entry per pole, a conjugate straight after its partner so each pair returns to the
// axis. With delays, every pole of every piece: a pole that cancels in F(s) as a whole
// still turns while its pieces are on.
function chainOf(model) {
  const out = [], poles = model.delayed ? model.allPoles : model.poles;
  for (const p of poles) {
    if (p.s.im < 0) continue;
    out.push({ ...p, role: p.s.im > 0 ? "phUp" : "phReal" });
    const twin = p.s.im > 0 && poles.find((o) => o.s.re === p.s.re && o.s.im === -p.s.im);
    if (twin) out.push({ ...twin, role: "phDown" });
  }
  return out;
}
// The phasor of one pole at time t: (A₁ + A₂ t + A₃ t²/2 + …) e^(pt), or with delays,
// the same from each piece that has switched on, in t − T.
function phasor(p, t) {
  const parts = p.parts ?? [{ T: 0, res: p.res }];
  let x = 0, y = 0;
  for (const part of parts) {
    const tau = t - part.T;
    if (tau < 0) continue;
    let ar = 0, ai = 0, k = 1;
    for (let j = 0; j < part.res.length; j++) { ar += part.res[j].re * k; ai += part.res[j].im * k; k *= tau / (j + 1); }
    const m = Math.exp(p.s.re * tau), c = m * Math.cos(p.s.im * tau), s = m * Math.sin(p.s.im * tau);
    x += ar * c - ai * s; y += ar * s + ai * c;
  }
  return [x, y];
}
// e^(pt) as TeX: e^{-2t}, e^{it}, e^{(-1+3i)t}.
function expTex(p) {
  if (p.s.re === 0 && p.s.im === 0) return "e^{0t} = 1";
  const c = cplx(p.s);
  return `e^{${p.s.re !== 0 && p.s.im !== 0 ? `(${c})` : c === "1" ? "" : c === "-1" ? "-" : c}t}`;
}
function build(state, cache) {
  const { model, time } = state;
  if (cache.model === model && cache.tMax === time.tMax) return cache;
  const chain = chainOf(model);
  let reach = 1e-9; // how far from the origin any point of the chain gets
  for (let i = 0; i <= 240; i++) {
    let x = 0, y = 0;
    for (const p of chain) { const v = phasor(p, (time.tMax * i) / 240); x += v[0]; y += v[1]; reach = Math.max(reach, Math.hypot(x, y)); }
  }
  return Object.assign(cache, { model, tMax: time.tMax, chain, reach });
}
const sumAt = (chain, t) => chain.reduce((x, p) => x + phasor(p, t)[0], 0);

/** Draw the small e^(pt) panels (where there's room), the phasor chain and the trace of its sum. */
export function paintDecomp(g, state, o, cache) {
  const { ctx, w: full, h: hgt, pal, math } = g, { time } = state, b = build(state, cache), t = time.t, n = b.chain.length;
  // impulses alone: no poles, so no phasors and no sum to trace
  if (!n) { math("\\text{No poles, so nothing turns}", full / 2, hgt / 2, { align: "center", color: pal.ink2, halo: false }); return; }
  // ── the small panels: one or two columns down the left, each as big as fits ──
  const cols = n > 5 ? 2 : 1, rows = Math.ceil(n / cols), size = Math.min(92, Math.floor((hgt - 8) / rows) - 26);
  const strip = full >= 360 && size >= 34 ? cols * (size + 10) + 6 : 0;
  if (strip) {
    b.chain.forEach((p, i) => {
      const x0 = 8 + (i % cols) * (size + 10), y0 = 8 + Math.floor(i / cols) * (size + 26);
      const m = planeFrame(size, size, { cx: 0, cy: 0, half: 1.25 * Math.max(1, Math.min(1e6, Math.exp(p.s.re * time.tMax))) });
      ctx.save();
      ctx.translate(x0, y0);
      ctx.fillStyle = pal.well; ctx.beginPath(); ctx.roundRect(0, 0, size, size, 6); ctx.fill();
      ctx.beginPath(); ctx.roundRect(0, 0, size, size, 6); ctx.clip();
      ctx.lineWidth = 1; ctx.strokeStyle = pal.ink4;
      ctx.beginPath(); ctx.moveTo(0, m.y(0)); ctx.lineTo(size, m.y(0)); ctx.moveTo(m.x(0), 0); ctx.lineTo(m.x(0), size); ctx.stroke();
      ctx.strokeStyle = pal.rule; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(m.x(0), m.y(0), m.k, 0, 2 * Math.PI); ctx.stroke(); // the unit circle
      ctx.setLineDash([]);
      ctx.strokeStyle = pal.alpha(p.role, 0.5); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let j = 0; j <= 160; j++) {
        const tau = (t * j) / 160, r = Math.exp(p.s.re * tau), px = m.x(r * Math.cos(p.s.im * tau)), py = m.y(r * Math.sin(p.s.im * tau));
        if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      const r = Math.exp(p.s.re * t);
      arrow(ctx, m.x(0), m.y(0), m.x(r * Math.cos(p.s.im * t)), m.y(r * Math.sin(p.s.im * t)), pal[p.role], 2.2, 9);
      ctx.restore();
      math(expTex(p), x0 + size / 2, y0 + size + 11, { align: "center", color: pal.ink2, size: 11, halo: false });
    });
    ctx.strokeStyle = pal.rule2; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(strip + 0.5, 0); ctx.lineTo(strip + 0.5, hgt); ctx.stroke();
  }
  // ── the plane: the phasors within R of the origin, the trace hanging below ──
  const w = full - strip, R = b.reach * 1.15, D = b.reach * TRACE;
  const boxH = R + Math.max(R, D), k = Math.min(w / (2 * R), hgt / boxH), oy = (hgt - boxH * k) / 2 + R * k;
  const f = { w, h: hgt, k, x: (re) => w / 2 + re * k, y: (im) => oy - im * k, re: (x) => (x - w / 2) / k, im: (y) => (oy - y) / k };
  ctx.save();
  ctx.translate(strip, 0);
  ctx.beginPath(); ctx.rect(0, 0, w, hgt); ctx.clip();
  drawPlane(ctx, f, pal);
  // the past values of the sum, newest at the axis
  const steps = 400, from = Math.max(0, t - time.tMax);
  ctx.strokeStyle = pal.signal; ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const tau = t - ((t - from) * i) / steps, px = f.x(sumAt(b.chain, tau)), py = oy + ((t - tau) / time.tMax) * D * k;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.stroke();
  let x = 0, y = 0;
  for (const p of b.chain) {
    const v = phasor(p, t);
    arrow(ctx, f.x(x), f.y(y), f.x(x + v[0]), f.y(y + v[1]), pal[p.role], 2.5, 10);
    x += v[0]; y += v[1];
  }
  dot(ctx, f.x(x), f.y(0), pal.signal, pal, 5);
  ctx.restore();
}
/** Which colour is which kind of pole, and the sum's value. */
export function decompLegend(state, o, cache = {}) {
  const b = build(state, cache), roles = new Set(b.chain.map((p) => p.role)), out = [];
  if (roles.has("phUp")) out.push({ mark: "arrow", role: "phUp", text: "Poles above the axis" }, { mark: "arrow", role: "phDown", text: "Their conjugates" });
  if (roles.has("phReal")) out.push({ mark: "arrow", role: "phReal", text: "Real poles" });
  if (b.chain.length) out.push({ mark: "line", role: "signal", text: "Their sum,", tint: true, tex: `${state.model.sig}(${texNum(state.time.t)}) = ${texNum(sumAt(b.chain, state.time.t), 4)}` });
  if (hasImpulses(state.model)) out.push({ text: "Plus, the impulses,", tex: signalTex(state.model.signal.filter((x) => x.d !== undefined)) });
  return out;
}

export default {
  id: "decomp", title: "Decomposition", paint: paintDecomp, legend: decompLegend,
  mount(el, store) {
    const box = h("div", { class: "plot" }), key = h("span", { class: "key" });
    el.append(box, h("div", { class: "vbar" }, key));
    const cache = {}, cv = fitCanvas(box, draw), { canvas, ctx } = cv, layer = mathLayer(box);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "One rotating vector per pole, added tip to tail; their sum traces the signal.");
    function draw() {
      const { w, h: hgt } = cv.size;
      if (!w || !store.state.model) return;
      const pal = palette();
      ctx.clearRect(0, 0, w, hgt);
      layer.begin();
      paintDecomp({ ctx, w, h: hgt, pal, math: layer.put }, store.state, { cursor: true }, cache);
      layer.end();
      legendDom(key, decompLegend(store.state, {}, cache), pal);
    }
    return { update(state, dirty) { if (dirty.has("model") || dirty.has("time") || dirty.has("theme")) draw(); } };
  },
};
