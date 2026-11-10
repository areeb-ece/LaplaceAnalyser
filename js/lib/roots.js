// Roots of a polynomial, and which of them are really one root repeated.
import { C, add, sub, mul, div, scale, abs, sqrt, conj, dist } from "./complex.js";
import { trim, peval, pderiv, taylor } from "./poly.js";

/** Every root of p (complex coefficients, ascending), repeated ones listed as often as they repeat. */
export function polyRoots(input) {
  let p = trim(input);
  const roots = [];
  while (p.length > 1 && abs(p[0]) === 0) { roots.push(C()); p = p.slice(1); } // roots at 0, exactly
  const n = p.length - 1;
  if (n <= 0) return roots;
  if (n === 1) return roots.concat([scale(div(p[0], p[1]), -1)]);
  if (n === 2) return roots.concat(quadratic(p[0], p[1], p[2]));
  return roots.concat(aberth(p));
}

// The form that doesn't lose digits when b² is much bigger than 4ac. Real coefficients
// with a negative discriminant come out as an exact conjugate pair.
function quadratic(c, b, a) {
  const root = sqrt(sub(mul(b, b), scale(mul(a, c), 4)));
  const same = b.re * root.re + b.im * root.im >= 0;
  const q = scale(add(b, same ? root : scale(root, -1)), -0.5);
  if (abs(q) === 0) return [C(), C()];
  return [div(q, a), div(c, q)];
}

// Aberth–Ehrlich: Newton's step for every root at once, each pushed away from the others.
function aberth(p) {
  const n = p.length - 1, dp = pderiv(p);
  const radius = Math.pow(abs(p[0]) / abs(p[n]), 1 / n) || 1;
  let z = Array.from({ length: n }, (_, k) => {
    const th = (2 * Math.PI * k) / n + 0.4;
    return C(radius * Math.cos(th), radius * Math.sin(th));
  });
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    z = z.map((zk, k) => {
      const pv = peval(p, zk);
      if (abs(pv) === 0) return zk;
      const ratio = div(pv, peval(dp, zk));
      let sum = C();
      for (let j = 0; j < n; j++) if (j !== k) sum = add(sum, div(C(1, 0), sub(zk, z[j])));
      const step = div(ratio, sub(C(1, 0), mul(ratio, sum)));
      if (!Number.isFinite(step.re) || !Number.isFinite(step.im)) return zk;
      moved = Math.max(moved, abs(step) / Math.max(1, abs(zk)));
      return sub(zk, step);
    });
    if (moved < 1e-15) break;
  }
  return z;
}

// Single linkage: two roots are in one group when a chain of gaps under thr joins them.
function split(roots, thr) {
  const groups = [];
  const left = roots.slice();
  while (left.length) {
    const g = [left.pop()];
    for (let i = 0; i < g.length; i++) {
      for (let j = left.length - 1; j >= 0; j--) if (dist(g[i], left[j]) <= thr) g.push(...left.splice(j, 1));
    }
    groups.push(g);
  }
  return groups;
}

const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };

// Is c a root of p repeated m times? Only if p's Taylor coefficients below order m all
// vanish there, compared with the size of the terms that were summed to get them.
function isRoot(p, c, m) {
  const b = taylor(p, c), r = abs(c);
  for (let j = 0; j < m; j++) {
    let norm = 0;
    for (let i = j; i < p.length; i++) norm += abs(p[i]) * binom(i, j) * Math.pow(r, i - j);
    if (abs(b[j]) > 1e-10 * norm) return false;
  }
  return true;
}

// A root repeated m times is a simple root of the (m−1)th derivative, where Newton's
// method converges quickly and to full precision.
function polish(p, z0, m, scaleOf) {
  let q = p;
  for (let k = 1; k < m; k++) q = pderiv(q);
  const dq = pderiv(q);
  let z = z0;
  for (let it = 0; it < 12; it++) {
    const d = peval(dq, z);
    if (abs(d) === 0) break;
    const step = div(peval(q, z), d);
    if (!Number.isFinite(step.re) || !Number.isFinite(step.im)) break;
    z = sub(z, step);
    if (abs(step) < 1e-16 * scaleOf) break;
  }
  return dist(z, z0) <= 0.05 * scaleOf ? z : z0;
}

/**
 * The distinct roots of p with their multiplicities: [{ s, mult }].
 * Roots that agree to within roundoff are merged only when p really has a repeated root
 * there (to 1e-10 of its own size), so two close but different roots stay apart.
 * With real = true (real coefficients) roots on the real or imaginary axis are put
 * exactly on it and conjugate pairs are made exact.
 */
export function distinctRoots(p, real = true) {
  p = trim(p);
  const all = polyRoots(p);
  if (!all.length) return [];
  const scaleOf = Math.max(1, ...all.map(abs));
  const out = [];
  const visit = (g, thr) => {
    if (g.length === 1) { out.push({ s: polish(p, g[0], 1, scaleOf), mult: 1 }); return; }
    const mean = scale(g.reduce(add, C()), 1 / g.length);
    const c = polish(p, mean, g.length, scaleOf);
    if (isRoot(p, c, g.length)) { out.push({ s: c, mult: g.length }); return; }
    let parts = [g], t = thr;
    while (parts.length === 1 && t > 1e-15 * scaleOf) { t /= 4; parts = split(g, t); }
    if (parts.length === 1) g.forEach((z) => visit([z], t));
    else parts.forEach((x) => visit(x, t));
  };
  split(all, 0.05 * scaleOf).forEach((g) => visit(g, 0.05 * scaleOf));
  if (real) snapReal(out, scaleOf);
  return out.sort((a, b) => a.s.re - b.s.re || Math.abs(a.s.im) - Math.abs(b.s.im) || b.s.im - a.s.im);
}

function snapReal(roots, scaleOf) {
  for (const r of roots) {
    if (Math.abs(r.s.im) <= 1e-9 * scaleOf) r.s = C(r.s.re, 0);
    if (Math.abs(r.s.re) <= 1e-12 * scaleOf) r.s = C(0, r.s.im);
  }
  for (const r of roots) {
    if (r.s.im <= 0) continue;
    const twin = roots.find((o) => o.s.im < 0 && o.mult === r.mult && dist(o.s, conj(r.s)) <= 1e-7 * scaleOf);
    if (twin) twin.s = conj(r.s);
  }
}
