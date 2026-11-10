// Polynomials with complex coefficients, as arrays in ascending order: p[k] multiplies s^k.
import { C, add, mul, scale, abs } from "./complex.js";

export const fromReal = (a) => a.map((x) => C(x, 0));
export const degree = (p) => p.length - 1;
const size = (p) => p.reduce((m, z) => Math.max(m, abs(z)), 0);

/** Drops leading coefficients that are zero, or roundoff left by a sum that cancelled. */
export function trim(p, rel = 1e-13) {
  const m = size(p);
  let n = p.length;
  while (n > 1 && abs(p[n - 1]) <= rel * m) n--;
  return n === p.length ? p : p.slice(0, n);
}
/** The real parts, once the imaginary parts are known to be roundoff. */
export function toReal(p) {
  const m = size(p);
  for (const z of p) if (Math.abs(z.im) > 1e-8 * Math.max(m, 1e-300)) throw new Error("expected real coefficients");
  return p.map((z) => z.re);
}
export function padd(a, b) {
  const n = Math.max(a.length, b.length), out = [];
  for (let i = 0; i < n; i++) out.push(add(a[i] ?? C(), b[i] ?? C()));
  return out;
}
export const pscale = (a, k) => a.map((z) => mul(z, k));
export function pmul(a, b) {
  const out = Array.from({ length: a.length + b.length - 1 }, () => C());
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] = add(out[i + j], mul(a[i], b[j]));
  return out;
}
/** Horner's rule. */
export function peval(p, z) {
  let r = C();
  for (let i = p.length - 1; i >= 0; i--) r = add(mul(r, z), p[i]);
  return r;
}
export function pderiv(p) {
  if (p.length <= 1) return [C()];
  return p.slice(1).map((z, i) => scale(z, i + 1));
}
/** The monic polynomial with these roots: [{ s, mult }]. */
export function fromRoots(roots) {
  let p = [C(1, 0)];
  for (const r of roots) for (let k = 0; k < r.mult; k++) p = pmul(p, [C(-r.s.re, -r.s.im), C(1, 0)]);
  return p;
}
/** Taylor coefficients about a: p(s) = Σ b[k] (s − a)^k, by repeated synthetic division. */
export function taylor(p, a) {
  const b = p.slice(), n = b.length;
  for (let k = 0; k < n; k++) for (let i = n - 2; i >= k; i--) b[i] = add(b[i], mul(a, b[i + 1]));
  return b;
}
/** p(s) = (s − r) q(s) + rem. */
export function deflate(p, r) {
  const n = p.length - 1, q = new Array(n);
  let carry = C();
  for (let i = n; i >= 1; i--) { carry = add(p[i], mul(r, carry)); q[i - 1] = carry; }
  return { q, rem: add(p[0], mul(r, carry)) };
}
