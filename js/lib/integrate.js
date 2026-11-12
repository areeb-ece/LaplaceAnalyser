// The Laplace integral, done numerically: ∫₀ᵀ f(t) e^(−st) dt as a running total.
// The model's closed form for F(s) is never used here, so comparing the two is a real check.
// Impulses at t = 0 are the one part not done numerically: by definition (sifting),
// ∫ δ^(k)(t) e^(−st) dt = s^k, so they add Σ imp[k] s^k at once, between t = 0⁻ and 0⁺.
import { fromReal, peval } from "./poly.js";
import { mul, exp, scale } from "./complex.js";

/** "converges", "boundary" (on the edge of the region: it never settles) or "diverges". */
export function convergence(model, s) {
  if (model.roc === -Infinity) return "converges"; // impulses alone: every s
  const gap = s.re - model.roc;
  if (Math.abs(gap) <= 1e-9 * (1 + Math.abs(model.roc))) return "boundary";
  return gap > 0 ? "converges" : "diverges";
}

/**
 * How far to integrate so that a converging integral has visibly arrived: the tail
 * decays like t^(m−1) e^(−(σ−σc)t). Never shorter than the time window, and capped at
 * 12 windows so that a probe hugging the boundary stays drawable.
 */
export function horizon(model, s, tMax) {
  if (convergence(model, s) !== "converges" || !model.poles.length) return tMax;
  const m = Math.max(...model.poles.map((p) => p.mult));
  return Math.min(Math.max(tMax, (9 + 3 * (m - 1)) / (s.re - model.roc)), 12 * tMax);
}

/**
 * Samples the integrand z(t) = f(t) e^(−st) and its running integral on [0, T].
 * Simpson's rule on each step (ends and midpoint), with steps short enough for at
 * least 40 per turn of the fastest-turning part. A step that a piece switches on inside
 * is split there, so no rule is applied across a jump. Returns typed arrays of length
 * n + 1: t, zr, zi (the integrand, impulses left out) and ir, ii (the integral from 0⁻
 * to t, so ir[0], ii[0] is what the impulses at 0 add), and kick, that amount as { re, im }.
 */
export function integralPath(model, s, T, maxSteps = 6000) {
  let wMax = Math.abs(s.im), rate = 0;
  for (const x of model.terms) { wMax = Math.max(wMax, Math.abs(x.lam.im - s.im), Math.abs(x.lam.im)); rate = Math.max(rate, Math.abs(x.lam.re - s.re)); }
  const n = Math.max(400, Math.min(maxSteps, Math.ceil((T * Math.max(wMax, rate) * 40) / (2 * Math.PI))));
  const dt = T / n;
  const t = new Float64Array(n + 1), zr = new Float64Array(n + 1), zi = new Float64Array(n + 1), ir = new Float64Array(n + 1), ii = new Float64Array(n + 1);
  const terms = model.terms;
  // f(t) is the real part of Σ c t^n e^(λt) (each piece from where it switches on);
  // multiplying by e^(−st) is done separately so the integrand reads like the definition.
  // side: −1 for the value just before t, +1 just after (they differ where a piece starts).
  const z = (tt, out, side = 0) => {
    let f = 0;
    for (const x of terms) {
      const T0 = x.on ?? 0, tau = tt - T0;
      if (x.on !== undefined && (tau < 0 || (tau === 0 && side < 0 && T0 > 0))) continue;
      const m = Math.exp(x.lam.re * tau) * (x.n ? Math.pow(tau, x.n) : 1), ph = x.lam.im * tau;
      f += m * (x.c.re * Math.cos(ph) - x.c.im * Math.sin(ph));
    }
    const k = Math.exp(-s.re * tt);
    out[0] = f * k * Math.cos(s.im * tt);
    out[1] = -f * k * Math.sin(s.im * tt);
  };
  // where pieces switch on (after 0), and what each impulse adds: e^(−sT) Σ imp[k] s^k
  const starts = [...new Set(terms.map((x) => x.on ?? 0).filter((v) => v > 0))].sort((p, q) => p - q);
  const kicks = (model.kicks ?? []).map((k) => ({ T: k.T, v: mul(exp(scale(s, -k.T)), peval(fromReal(k.imp), s)) }));
  const kick = kicks.find((k) => k.T === 0)?.v ?? { re: 0, im: 0 };
  const a = [0, 0], mid = [0, 0], b = [0, 0];
  const simpson = (t0, t1, sum) => {
    z(t0, a, 1); z((t0 + t1) / 2, mid); z(t1, b, -1);
    sum[0] += ((t1 - t0) / 6) * (a[0] + 4 * mid[0] + b[0]);
    sum[1] += ((t1 - t0) / 6) * (a[1] + 4 * mid[1] + b[1]);
  };
  z(0, b);
  zr[0] = b[0]; zi[0] = b[1];
  ir[0] = kick.re; ii[0] = kick.im;
  const sum = [0, 0];
  for (let i = 0; i < n; i++) {
    const t0 = i * dt, t1 = (i + 1) * dt;
    sum[0] = ir[i]; sum[1] = ii[i];
    let from = t0;
    for (const at of starts) if (at > t0 && at < t1) { simpson(from, at, sum); from = at; }
    simpson(from, t1, sum);
    for (const k of kicks) if (k.T > t0 && k.T <= t1) { sum[0] += k.v.re; sum[1] += k.v.im; }
    z(t1, b, 1);
    t[i + 1] = t1; zr[i + 1] = b[0]; zi[i + 1] = b[1];
    ir[i + 1] = sum[0]; ii[i + 1] = sum[1];
  }
  return { n, dt, T, t, zr, zi, ir, ii, kick };
}
