// The transform itself: signal terms to a rational F(s), partial fractions (repeated
// poles included) and back. A transform is { num, lead, poles }:
//   F(s) = num(s) / (lead · Π (s − p)^m),  num a complex polynomial (ascending),
// with the denominator always kept as its roots rather than multiplied out.
import { C, add, sub, mul, div, scale, abs, conj, dist } from "./complex.js";
import { padd, pscale, peval, fromRoots, taylor, deflate, trim } from "./poly.js";
import { term, makeReal } from "./expoly.js";

const fact = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const samePole = (a, b) => dist(a, b) <= 1e-9 * (1 + abs(a));

/** L{ Σ c t^n e^(λt) } = Σ c n! / (s − λ)^(n+1). The poles are the λ themselves, exactly. */
export function transformTerms(terms) {
  const poles = [];
  for (const x of terms) {
    const hit = poles.find((p) => samePole(p.s, x.lam));
    if (hit) hit.mult = Math.max(hit.mult, x.n + 1);
    else poles.push({ s: x.lam, mult: x.n + 1 });
  }
  let num = [C()];
  for (const x of terms) {
    // this term over the common denominator: every factor except its own (n+1)
    const rest = poles.map((p) => ({ s: p.s, mult: p.mult - (samePole(p.s, x.lam) ? x.n + 1 : 0) }));
    num = padd(num, pscale(fromRoots(rest), scale(x.c, fact(x.n))));
  }
  return { num: trim(num), lead: 1, poles };
}

/** F at a point s. */
export function evalTransform(F, s) {
  let d = C(F.lead, 0);
  for (const p of F.poles) for (let k = 0; k < p.mult; k++) d = mul(d, sub(s, p.s));
  return div(peval(F.num, s), d);
}

/**
 * Removes factors common to the numerator and the denominator. A pole p cancels when
 * the numerator is zero there, measured against the size of the terms that make it up.
 * Returns the reduced transform and what was cancelled.
 */
export function cancelCommon(F) {
  let num = F.num;
  const poles = [], cancelled = [];
  for (const p of F.poles) {
    let mult = p.mult, gone = 0;
    while (mult > 0 && num.length > 1) {
      let norm = 0;
      for (let i = 0; i < num.length; i++) norm += abs(num[i]) * Math.pow(abs(p.s), i);
      if (abs(peval(num, p.s)) > 1e-9 * norm) break;
      num = deflate(num, p.s).q;
      mult--; gone++;
    }
    if (mult > 0) poles.push({ s: p.s, mult });
    if (gone) cancelled.push({ s: p.s, mult: gone });
  }
  return { F: { num: trim(num), lead: F.lead, poles }, cancelled };
}

/**
 * Partial fractions of a strictly proper F: for each pole, res[j−1] is the coefficient
 * of 1/(s − p)^j. Around a pole p of multiplicity m, F = N(s)/Q(s) · (s − p)^(−m) with
 * Q the rest of the denominator; N and Q are re-expanded about p and their power series
 * divided, so repeated poles need no numerical differentiation.
 */
export function partialFractions(F) {
  return F.poles.map((p) => {
    const N = taylor(F.num, p.s);
    const Q = taylor(pscale(fromRoots(F.poles.filter((o) => o !== p)), C(F.lead, 0)), p.s);
    const r = [];
    for (let k = 0; k < p.mult; k++) {
      let v = N[k] ?? C();
      for (let i = 1; i <= k; i++) v = sub(v, mul(Q[i] ?? C(), r[k - i]));
      r.push(div(v, Q[0]));
    }
    return { s: p.s, mult: p.mult, res: Array.from({ length: p.mult }, (_, j) => r[p.mult - 1 - j]) };
  });
}

/** A / (s − p)^j  ↔  A t^(j−1) e^(pt) / (j−1)!. */
export function inverseTerms(poles) {
  const out = [];
  for (const p of poles) p.res.forEach((A, j) => { if (abs(A) > 0) out.push(term(scale(A, 1 / fact(j)), j, p.s)); });
  return makeReal(out);
}
/** The other direction: the residues that a signal's terms stand for. */
export function residuesOf(terms, poles) {
  return poles.map((p) => {
    const res = Array.from({ length: p.mult }, () => C());
    for (const x of terms) if (samePole(x.lam, p.s) && x.n < p.mult) res[x.n] = add(res[x.n], scale(x.c, fact(x.n)));
    return { s: p.s, mult: p.mult, res };
  });
}

/** Σ A / (s − p)^j, for checking partial fractions against the fraction they came from. */
export function evalFractions(poles, s) {
  let sum = C();
  for (const p of poles) {
    const d = sub(s, p.s);
    let pw = C(1, 0);
    for (const A of p.res) { pw = mul(pw, d); sum = add(sum, div(A, pw)); }
  }
  return sum;
}

/** Real-coefficient poles come in conjugate pairs: make that exact after merging lists. */
export function pairUp(poles) {
  for (const p of poles) {
    if (Math.abs(p.s.im) <= 1e-12 * (1 + abs(p.s))) { p.s = C(p.s.re, 0); continue; }
    if (p.s.im < 0) continue;
    const twin = poles.find((o) => o.s.im < 0 && samePole(o.s, conj(p.s)));
    if (twin) twin.s = conj(p.s);
  }
  return poles.sort((a, b) => b.s.re - a.s.re || Math.abs(a.s.im) - Math.abs(b.s.im) || b.s.im - a.s.im);
}

export { samePole };
