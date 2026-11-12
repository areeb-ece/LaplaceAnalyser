// The Laplace integral, done numerically: ∫₀ᵀ f(t) e^(−st) dt as a running total.
// The model's closed form for F(s) is never used here, so comparing the two is a real check.
// Impulses at t = 0 are the one part not done numerically: by definition (sifting),
// ∫ δ^(k)(t) e^(−st) dt = s^k, so they add Σ imp[k] s^k at once, between t = 0⁻ and 0⁺.
import { fromReal, peval } from "./poly.js";

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
 * least 40 per turn of the fastest-turning part. Returns typed arrays of length n + 1:
 * t, zr, zi (the integrand, impulses left out) and ir, ii (the integral from 0⁻ to t,
 * so ir[0], ii[0] is what the impulses add), and kick, that amount as { re, im }.
 */
export function integralPath(model, s, T, maxSteps = 6000) {
  let wMax = Math.abs(s.im), rate = 0;
  for (const x of model.terms) { wMax = Math.max(wMax, Math.abs(x.lam.im - s.im), Math.abs(x.lam.im)); rate = Math.max(rate, Math.abs(x.lam.re - s.re)); }
  const n = Math.max(400, Math.min(maxSteps, Math.ceil((T * Math.max(wMax, rate) * 40) / (2 * Math.PI))));
  const dt = T / n;
  const t = new Float64Array(n + 1), zr = new Float64Array(n + 1), zi = new Float64Array(n + 1), ir = new Float64Array(n + 1), ii = new Float64Array(n + 1);
  const terms = model.terms;
  // f(t) is the real part of Σ c t^n e^(λt); multiplying by e^(−st) is done separately so
  // the integrand is built the way the definition reads.
  const z = (tt, out) => {
    let f = 0;
    for (const x of terms) {
      const m = Math.exp(x.lam.re * tt) * (x.n ? Math.pow(tt, x.n) : 1), ph = x.lam.im * tt;
      f += m * (x.c.re * Math.cos(ph) - x.c.im * Math.sin(ph));
    }
    const k = Math.exp(-s.re * tt);
    out[0] = f * k * Math.cos(s.im * tt);
    out[1] = -f * k * Math.sin(s.im * tt);
  };
  const a = [0, 0], mid = [0, 0], b = [0, 0];
  z(0, a);
  zr[0] = a[0]; zi[0] = a[1];
  const kick = model.imp?.length ? peval(fromReal(model.imp), s) : { re: 0, im: 0 };
  ir[0] = kick.re; ii[0] = kick.im;
  for (let i = 0; i < n; i++) {
    const t1 = (i + 1) * dt;
    z((i + 0.5) * dt, mid);
    z(t1, b);
    t[i + 1] = t1; zr[i + 1] = b[0]; zi[i + 1] = b[1];
    ir[i + 1] = ir[i] + (dt / 6) * (a[0] + 4 * mid[0] + b[0]);
    ii[i + 1] = ii[i] + (dt / 6) * (a[1] + 4 * mid[1] + b[1]);
    a[0] = b[0]; a[1] = b[1];
  }
  return { n, dt, T, t, zr, zi, ir, ii, kick };
}
