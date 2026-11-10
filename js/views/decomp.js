// The signal taken apart: each pole p contributes one phasor, its residue times e^(pt),
// turning at the pole's imaginary part and growing or shrinking at its real part. Laid
// tip to tail they add up to f(t). Conjugate pairs cancel each other's imaginary parts,
// so the sum stays on the real axis, where it draws the signal as time runs.
import { h, clear } from "../ui.js";
import { palette } from "../palette.js";
import { fitCanvas, planeFrame, drawPlane, arrow, dot } from "../plot2d.js";
import { typeset } from "../math.js";
import { cplx, fmt } from "../lib/tex.js";

const TRACE = 1.7; // how far down the trace of past values hangs, in units of the phasors' reach

// One entry per pole, a conjugate straight after its partner so each pair returns to the axis.
function chainOf(model) {
  const out = [];
  for (const p of model.poles) {
    if (p.s.im < 0) continue;
    out.push({ ...p, role: p.s.im > 0 ? "phUp" : "phReal" });
    const twin = p.s.im > 0 && model.poles.find((o) => o.s.re === p.s.re && o.s.im === -p.s.im);
    if (twin) out.push({ ...twin, role: "phDown" });
  }
  return out;
}
// The phasor of one pole at time t: (A₁ + A₂ t + A₃ t²/2 + …) e^(pt).
function phasor(p, t) {
  let ar = 0, ai = 0, k = 1;
  for (let j = 0; j < p.res.length; j++) { ar += p.res[j].re * k; ai += p.res[j].im * k; k *= t / (j + 1); }
  const m = Math.exp(p.s.re * t), c = m * Math.cos(p.s.im * t), s = m * Math.sin(p.s.im * t);
  return [ar * c - ai * s, ar * s + ai * c];
}

export default {
  id: "decomp", title: "Decomposition",
  mount(el, store) {
    const minis = h("div", { class: "minis" }), box = h("div", { class: "plot" });
    const value = h("b", { class: "fig", vars: { "--kc": "var(--c0)" } });
    const key = h("span", { class: "key" });
    el.append(h("div", { class: "decomp" }, minis, box), h("div", { class: "vbar" }, key));
    const cv = fitCanvas(box, draw), { canvas, ctx } = cv;
    box.prepend(canvas);
    canvas.setAttribute("role", "img");

    let built = null; // what depends on the model and the time window only
    function build() {
      const { model, time } = store.state;
      if (built && built.model === model && built.tMax === time.tMax) return built;
      const chain = chainOf(model);
      // how far from the origin any point of the chain gets
      let reach = 1e-9;
      for (let i = 0; i <= 240; i++) {
        let x = 0, y = 0;
        for (const p of chain) { const v = phasor(p, (time.tMax * i) / 240); x += v[0]; y += v[1]; reach = Math.max(reach, Math.hypot(x, y)); }
      }
      // the small panels: e^(pt) alone, one per pole
      clear(minis);
      const panels = chain.map((p) => {
        const c = h("canvas", { width: 220, height: 220 }), cap = h("span");
        typeset(cap, p.s.re === 0 && p.s.im === 0 ? "e^{0t} = 1" : `e^{${p.s.re !== 0 && p.s.im !== 0 ? `(${cplx(p.s)})` : cplx(p.s) === "1" ? "" : cplx(p.s) === "-1" ? "-" : cplx(p.s)}t}`, true);
        minis.append(h("div", { class: "mini" }, c, cap));
        return { c, half: 1.25 * Math.max(1, Math.min(1e6, Math.exp(p.s.re * time.tMax))) };
      });
      clear(key);
      const roles = new Set(chain.map((p) => p.role));
      const sw = (token, text) => h("span", { class: "k" }, h("span", { class: "sw", vars: { "--kc": `var(${token})` } }), text);
      if (roles.has("phUp")) key.append(sw("--c5", "Poles above the axis"), sw("--c7", "Their conjugates"));
      if (roles.has("phReal")) key.append(sw("--c1", "Real poles"));
      key.append(h("span", { class: "k" }, h("span", { class: "sw", vars: { "--kc": "var(--c0)" } }), `Their sum, ${model.sig}(t) =`, value));
      return (built = { model, tMax: time.tMax, chain, reach, panels });
    }

    function draw() {
      const { model, time } = store.state, { w, h: hgt } = cv.size;
      if (!w || !model) return;
      const pal = palette(), b = build(), R = b.reach * 1.15, D = b.reach * TRACE, t = time.t;
      // the plane holds the phasors (within R of the origin) and the trace hanging below
      const boxH = R + Math.max(R, D), k = Math.min(w / (2 * R), hgt / boxH);
      const oy = (hgt - boxH * k) / 2 + R * k;
      const f = { w, h: hgt, k, x: (re) => w / 2 + re * k, y: (im) => oy - im * k, re: (x) => (x - w / 2) / k, im: (y) => (oy - y) / k };
      ctx.clearRect(0, 0, w, hgt);
      drawPlane(ctx, f, pal);
      // the past values of the sum, newest at the axis
      const n = 400, from = Math.max(0, t - time.tMax);
      ctx.strokeStyle = pal.signal; ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const tau = t - ((t - from) * i) / n;
        let x = 0;
        for (const p of b.chain) x += phasor(p, tau)[0];
        const px = f.x(x), py = oy + ((t - tau) / time.tMax) * D * k;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      // the phasors, tip to tail
      let x = 0, y = 0;
      for (const p of b.chain) {
        const v = phasor(p, t);
        arrow(ctx, f.x(x), f.y(y), f.x(x + v[0]), f.y(y + v[1]), pal[p.role], 2.5, 10);
        x += v[0]; y += v[1];
      }
      dot(ctx, f.x(x), f.y(0), pal.signal, pal, 5);
      value.textContent = fmt(x, 4);
      canvas.setAttribute("aria-label", `One rotating vector per pole, added tip to tail. Their sum is ${model.sig} of t, ${fmt(x, 4)} at the time cursor.`);
      // the small panels
      b.chain.forEach((p, i) => {
        const { c, half } = b.panels[i], g = c.getContext("2d"), m = planeFrame(c.width, c.height, { cx: 0, cy: 0, half });
        g.clearRect(0, 0, c.width, c.height);
        g.lineWidth = 2;
        g.strokeStyle = pal.ink4;
        g.beginPath(); g.moveTo(0, m.y(0)); g.lineTo(c.width, m.y(0)); g.moveTo(m.x(0), 0); g.lineTo(m.x(0), c.height); g.stroke();
        g.strokeStyle = pal.rule; g.setLineDash([6, 6]);
        g.beginPath(); g.arc(m.x(0), m.y(0), m.k, 0, 2 * Math.PI); g.stroke(); // the unit circle
        g.setLineDash([]);
        g.strokeStyle = pal.alpha(p.role, 0.5); g.lineWidth = 3;
        g.beginPath();
        for (let j = 0; j <= 160; j++) {
          const tau = (t * j) / 160, r = Math.exp(p.s.re * tau), px = m.x(r * Math.cos(p.s.im * tau)), py = m.y(r * Math.sin(p.s.im * tau));
          if (j) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.stroke();
        const r = Math.exp(p.s.re * t);
        arrow(g, m.x(0), m.y(0), m.x(r * Math.cos(p.s.im * t)), m.y(r * Math.sin(p.s.im * t)), pal[p.role], 5, 20);
      });
    }
    return { update(state, dirty) { if (dirty.has("model") || dirty.has("time") || dirty.has("theme")) draw(); } };
  },
};
