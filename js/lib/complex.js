// Complex numbers as plain { re, im } objects. Nothing here mutates its arguments.
export const C = (re = 0, im = 0) => ({ re, im });
export const ZERO = Object.freeze(C(0, 0));
export const ONE = Object.freeze(C(1, 0));

export const add = (a, b) => C(a.re + b.re, a.im + b.im);
export const sub = (a, b) => C(a.re - b.re, a.im - b.im);
export const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const scale = (a, k) => C(a.re * k, a.im * k);
export const neg = (a) => C(-a.re, -a.im);
export const conj = (a) => C(a.re, -a.im);
export const abs = (a) => Math.hypot(a.re, a.im);
export const arg = (a) => Math.atan2(a.im, a.re);
export const exp = (a) => { const m = Math.exp(a.re); return C(m * Math.cos(a.im), m * Math.sin(a.im)); };
export function div(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}
export const inv = (a) => div(ONE, a);
/** The principal square root. */
export function sqrt(a) {
  const m = abs(a);
  if (m === 0) return C(0, 0);
  const re = Math.sqrt((m + Math.abs(a.re)) / 2), im = a.im / (2 * re);
  return a.re >= 0 ? C(re, im) : C(Math.abs(im), a.im < 0 ? -re : re);
}
/** a to a whole-number power (negative allowed). */
export function powi(a, n) {
  if (n < 0) return inv(powi(a, -n));
  let r = C(1, 0), b = a;
  for (let k = n; k > 0; k >>= 1) { if (k & 1) r = mul(r, b); b = mul(b, b); }
  return r;
}
export const dist = (a, b) => Math.hypot(a.re - b.re, a.im - b.im);
