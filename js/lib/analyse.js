// The engine's one entry point: what was typed → everything the views draw.
// analyse(input) returns either
//   { ok: true, kind, sig, cap, num, lead, poles, zeros, cancelled, roc, terms, imp, kicks,
//     groups, delayed, tWindow, sWindow, steps }
// or { ok: false, message } with a message written for the person who typed the input.
//
// The transform is a sum of pieces, F(s) = Σ e^(−sT) F_T(s), one per time T at which
// something starts (a step switching on, or an impulse); without delays there is one
// piece, T = 0, and then:
//   num, lead, poles   F(s) = num(s) / (lead · Π (s − p)^m); poles carry their residues:
//                      poles[k].res[j−1] is the coefficient of 1/(s − p)^j
//   imp                F's polynomial part, Σ imp[k] s^k (real, ascending; empty if none),
//                      which is the transform of the impulses Σ imp[k] δ^(k)(t) at t = 0
//   zeros              the roots of num
// With delays (delayed: true), each piece is in groups [{ T, num, numC, lead, poles, imp,
// terms, rest }], num and zeros are null and [] (e^(−sT) has no finite list of zeros),
// and poles are the poles of F as a whole: a pole of a piece can cancel against another
// piece's (a pulse, (e^(−s) − e^(−2s))/s, has none at all).
//   terms              the whole signal's ordinary terms (pieces switched on carry `on`),
//                      its value at every t, impulses left out
//   kicks              the impulses: [{ T, imp }]
//   roc                the abscissa of convergence: the integral converges for Re(s) > roc
//                      (−Infinity when there are no poles: a signal that is all impulses,
//                      or that ends, converges everywhere)
import { C, add, sub, mul, scale, exp, abs, dist } from "./complex.js";
import { fromReal, toReal, peval, pmul, fromRoots } from "./poly.js";
import { distinctRoots } from "./roots.js";
import { InputError, parse, parseEquation } from "./parse.js";
import { signalFromAst, numberFromAst, makeReal, evalEP, imagShare, isImpulse } from "./expoly.js";
import { rationalFromAst, numerator, delayedFromAst } from "./rational.js";
import { transformTerms, cancelCommon, partialFractions, polyPart, inverseTerms, residuesOf, evalTransform, evalFractions, pairUp, samePole, groupsOf } from "./laplace.js";
import { odeFromAst, solveOde } from "./ode.js";
import { notes } from "./operators.js";
import * as T from "./tex.js";

const MAX_DEGREE = 12;
const MAX_IMPULSE = 4; // the highest derivative of δ(t) a result may contain
const MAX_DELAYS = 6;  // how many different start times one input may have

export function analyse(input) {
  try {
    const m = input.mode === "ode" ? fromOde(input) : input.mode === "rational" ? fromRational(input) : fromFunction(input);
    return finish(m);
  } catch (e) {
    if (e instanceof InputError) return { ok: false, message: e.message };
    return { ok: false, message: "Something went wrong while working that out, so there's no result to show. (" + e.message + ")" };
  }
}

/** f(t) or y(t) at time t (impulses have no value to add). */
export const evalSignal = (model, t) => evalEP(model.terms, t).re;
/** Does the signal have impulses (at t = 0 or later)? */
export const hasImpulses = (model) => model.kicks.length > 0;
/** What the impulses at T add to the Laplace integral at s: e^(−sT) Σ imp[k] s^k. */
export const impulseAt = (kick, s) => mul(exp(scale(s, -kick.T)), peval(fromReal(kick.imp), s));
/** F(s) or Y(s) at s, from its closed form (valid everywhere but at the poles). */
export function evalTransformAt(model, s) {
  const at = (z) => model.groups.reduce((sum, g) => add(sum, mul(exp(scale(z, -g.T)), evalTransform({ num: g.numC, lead: g.lead, poles: g.poles }, z))), C());
  const v = at(s);
  if (Number.isFinite(v.re) && Number.isFinite(v.im) || !model.delayed) return v;
  // on a pole of one piece that another piece cancels: the value is the limit there
  const h = 1e-6 * (1 + abs(s)), a = at(add(s, C(h, 0))), b = at(sub(s, C(h, 0)));
  return scale(add(a, b), 0.5);
}

// ── the three kinds of input ──

function fromFunction(input) {
  const ast = parse(input.fn ?? "");
  notes.length = 0;
  const all = makeReal(signalFromAst(ast));
  if (!all.length) throw new InputError("That's the zero function, so there's nothing to transform. Try e^(-t) or cos(2t).");
  const rules = notes.slice(); // the property steps of any operators typed
  const groups = groupsOf(all).map((g) => ({ T: g.T, F: transformTerms(g.terms), terms: g.terms.filter((x) => !isImpulse(x)) }));
  const steps = (m) => {
    const out = [...rules, { title: rules.length ? "So, in time" : "The function", tex: `f(t) = ${T.signalTex(all)},\\quad t \\ge 0` }];
    if (m.delayed) {
      out.push({ title: "Transform each piece; a piece that starts late gets its delay as a factor", tex: `F(s) = ${T.delayedPartsTex(m.groups)}` });
      out.push({ title: "Each delay's piece as one fraction", tex: `F(s) = ${T.delayedTex(m.groups)}` });
      return out;
    }
    if (!rules.length) { const p = propertyStep(ast, all); if (p) out.push(p); }
    // One term (or one conjugate pair) is already a single fraction: no third step then.
    const each = T.partsTex(m.imp, m.poles), whole = T.fractionTex(m.num, m.lead, m.poles);
    const one = each === whole || T.single(each);
    out.push({ title: one ? "Its transform" : "Transform term by term (the transform is linear)", tex: `F(s) = ${each}` });
    if (!one) out.push({ title: "As one fraction", tex: `F(s) = ${whole}` });
    return out;
  };
  return { kind: "function", sig: "f", cap: "F", groups, signal: all, steps, typed: T.astTex(ast) };
}

// The property a product written as e^(at) · g(t) or t^k · g(t) shows off: exponential
// scaling, F(s) = G(s − a), or multiplication by t, F(s) = (−1)^k G^(k)(s). Null when
// the input isn't written that way.
function propertyStep(ast, all) {
  const factors = (n) => (n.t === "bin" && n.op === "*" ? [...factors(n.a), ...factors(n.b)] : n.t === "neg" ? factors(n.a) : [n]);
  const fs = factors(ast);
  if (fs.length < 2 || all.some((x) => isImpulse(x) || x.on !== undefined)) return null;
  const one = (n) => { try { const x = makeReal(signalFromAst(n)); return x.length === 1 ? x[0] : null; } catch { return null; } };
  const frac = (F) => T.fractionTex(toReal(F.num), F.lead, F.poles);
  const powerOfT = fs.map(one).find((x) => x && x.n >= 1 && abs(x.lam) === 0 && x.c.re === 1 && x.c.im === 0);
  if (powerOfT && all.every((x) => x.n >= powerOfT.n)) {
    const k = powerOfT.n, g = all.map((x) => ({ c: x.c, n: x.n - k, lam: x.lam })), G = transformTerms(g);
    const d = k === 1 ? "-\\frac{d}{ds}" : `${k % 2 ? "-" : ""}\\frac{d^{${k}}}{ds^{${k}}}`;
    return { title: "Multiplication by t: the transform's derivative", tex: `\\mathcal{L}\\{${T.signalTex(g)}\\} = ${frac(G)},\\quad\\text{so}\\quad F(s) = ${d}\\,${frac(G)}` };
  }
  const e = fs.map(one).find((x) => x && x.n === 0 && x.lam.im === 0 && x.lam.re !== 0);
  if (e) {
    const a = e.lam.re, g = all.map((x) => ({ c: x.c, n: x.n, lam: sub(x.lam, C(a, 0)) })), G = transformTerms(g);
    const v = `(s ${a < 0 ? "+" : "-"} ${T.mag(a)})`, den = fromRoots(G.poles).map((z) => z.re);
    const top = T.polyTex(toReal(G.num), v), unwrapped = top === v ? v.slice(1, -1) : top;
    const shifted = G.poles.length ? `\\frac{${unwrapped}}{${T.polyTex(den, v)}}` : top;
    return { title: "Exponential scaling: a shift in s", tex: `\\mathcal{L}\\{${T.signalTex(g)}\\} = G(s) = ${frac(G)},\\quad\\text{so}\\quad F(s) = G${v} = ${shifted}` };
  }
  return null;
}

// The poles of a factored denominator, merged.
function polesOf(r) {
  let poles = [];
  for (const f of r.den) {
    for (const root of distinctRoots(fromReal(f.poly), true)) {
      const hit = poles.find((p) => samePole(p.s, root.s));
      if (hit) hit.mult += root.mult * f.pow; else poles.push({ s: root.s, mult: root.mult * f.pow });
    }
  }
  return pairUp(poles);
}

function fromRational(input) {
  const ast = parse(input.rational ?? "");
  const pieces = delayedFromAst(ast);
  if (!pieces.length) throw new InputError("That's zero, so there's nothing to invert. Try 1/(s^2 + 4).");
  const cancelled = [];
  const groups = pieces.sort((a, b) => a.T - b.T).map(({ T: at, r }) => {
    const c = cancelCommon({ num: fromReal(numerator(r)), lead: 1, poles: polesOf(r) });
    cancelled.push(...c.cancelled);
    return { T: at, F: c.F };
  });
  const steps = (m) => {
    if (m.delayed) return [
      { title: "The transform: each delay factor delays its piece", tex: `F(s) = ${T.delayedTex(m.groups)}` },
      { title: "Partial fractions, piece by piece", tex: `F(s) = ${T.delayedPartsTex(m.groups)}` },
      { title: "Invert each term, and delay each piece: it is switched on at T", tex: `f(t) = ${T.signalTex(m.signal)},\\quad t \\ge 0` },
    ];
    return [
      { title: m.cancelled.length ? "The transform, after cancelling common factors" : "The transform", tex: `F(s) = ${T.fractionTex(m.num, m.lead, m.poles)}` },
      ...divided(m, "F"),
      ...equated(m),
      { title: "Partial fractions", tex: `F(s) = ${T.partsTex(m.imp, m.poles)}` },
      { title: "Invert each term", tex: `f(t) = ${T.timeTex(m.terms, m.imp)},\\quad t \\ge 0` },
    ];
  };
  return { kind: "rational", sig: "f", cap: "F", groups, cancelled, steps, typed: T.astTex(ast) };
}

function fromOde(input) {
  const eq = parseEquation(input.ode ?? "");
  const { coefs, forcing } = odeFromAst(eq);
  const order = coefs.length - 1;
  const ics = Array.from({ length: order }, (_, k) => {
    const text = String(input.ics?.[k] ?? "").trim();
    if (!text) return 0;
    const name = "y" + "'".repeat(k) + "(0)";
    try { return numberFromAst(parse(text), name); }
    catch (e) { throw e instanceof InputError ? new InputError(`${name}: ${e.message}`) : e; }
  });
  // Each piece of the forcing that starts at T > 0 gives Y_T = G_T / P, delayed by T; the
  // starting values belong with the piece at T = 0.
  const real = makeReal(forcing), parts = groupsOf(real);
  const atZero = parts.find((g) => g.T === 0)?.terms ?? [];
  const sol = solveOde(coefs, atZero, ics), cancelled = [];
  const groups = [], gs = [];
  const add_ = (at, Y, G) => {
    if (Y.num.length === 1 && abs(Y.num[0]) === 0) return;
    const c = cancelCommon(Y);
    cancelled.push(...c.cancelled);
    groups.push({ T: at, F: c.F });
    gs.push({ T: at, num: toReal(G.num), lead: 1, poles: G.poles });
  };
  add_(0, sol.Y, sol.G);
  for (const g of parts) if (g.T > 0) { const s2 = solveOde(coefs, g.terms, []); add_(g.T, s2.Y, s2.G); }
  if (!groups.length) {
    throw new InputError("With nothing driving the equation and every starting value zero, the solution is y(t) = 0 for all time. Add a forcing term on the right, or a non-zero starting value.");
  }
  const rhs = !real.length ? "0" : gs.length > 1 || gs[0]?.T ? T.delayedTex(gs.filter((g) => g.num.some((x) => x !== 0))) : T.fractionTex(toReal(sol.G.num), 1, sol.G.poles);
  // With an impulse at t = 0 on the right, y and its derivatives can jump there: the
  // starting values are the ones just before it, at t = 0⁻, which is what the transform uses.
  const kicked = real.some((x) => isImpulse(x) && !x.on);
  const steps = (m) => [
    { title: "The equation and its starting values", tex: `\\begin{aligned}&${T.odeTex(coefs, forcing)}\\\\&${T.icsTex(ics, kicked)}\\end{aligned}` },
    { title: "Transform both sides", tex: T.transformedTex(coefs, ics, rhs) },
    ...(m.delayed ? [
      { title: "Solve for Y(s)", tex: `Y(s) = ${T.delayedTex(m.groups)}` },
      { title: "Partial fractions, piece by piece", tex: `Y(s) = ${T.delayedPartsTex(m.groups)}` },
      { title: "Invert each term, and delay each piece: it is switched on at T", tex: `y(t) = ${T.signalTex(m.signal)},\\quad t \\ge 0` },
    ] : [
      { title: "Solve for Y(s)", tex: `Y(s) = ${T.fractionTex(m.num, m.lead, m.poles)}` },
      ...divided(m, "Y"),
      ...equated(m),
      { title: "Partial fractions", tex: `Y(s) = ${T.partsTex(m.imp, m.poles)}` },
      { title: "Invert each term", tex: `y(t) = ${T.timeTex(m.terms, m.imp)},\\quad t \\ge 0` },
    ]),
  ];
  return { kind: "ode", sig: "y", cap: "Y", groups, cancelled, steps, order, coefs, ics, typed: `${T.astTex(eq.lhs)} = ${T.astTex(eq.rhs)}` };
}

// An improper transform first loses its polynomial part, by long division: one step
// showing F(s) = (the impulses' polynomial) + (a proper fraction).
function divided(m, cap) {
  if (!m.imp.length || !m.poles.length) return [];
  const top = m.rest.findLast((x) => x !== 0) ?? 0, minus = top / m.lead < 0;
  const rest = T.fractionTex(minus ? m.rest.map((x) => -x) : m.rest, m.lead, m.poles);
  return [{ title: "Divide out the polynomial part", tex: `${cap}(s) = ${T.polyTex(m.imp)} ${minus ? "-" : "+"} ${rest}` }];
}
// The partial fractions by hand: unknowns, both sides times the denominator, coefficients equated.
function equated(m) {
  const tex = m.poles.length ? T.equateTex(m.rest, m.lead, m.poles) : null;
  return tex ? [{ title: "Equate coefficients", tex }] : [];
}

// ── the part every kind shares ──

// One piece, e^(−sT) F_T(s): its polynomial part (impulses at T), partial fractions and
// time terms, checked against each other.
function solvePiece(g) {
  const F = g.F;
  if (F.num.length - 1 > MAX_DEGREE) throw new InputError(`That works out to a transform whose numerator has degree ${F.num.length - 1}. This tool stops at ${MAX_DEGREE}, beyond which the arithmetic gets too unreliable to trust.`);
  const Q = polyPart(F);
  if (Q.length - 1 > MAX_IMPULSE) {
    throw new InputError(`The numerator's degree is ${Q.length - 1} more than the denominator's, so the inverse would contain the ${Q.length - 1}th derivative of an impulse. This tool goes up to the ${MAX_IMPULSE}th.`);
  }
  const imp = realImpulses(Q);
  const poles = g.terms ? residuesOf(g.terms, F.poles) : partialFractions(F);
  const terms = g.terms ?? inverseTerms(poles);
  check(F, imp, poles, terms);
  const num = toReal(F.num);
  return { T: g.T, num, numC: F.num, lead: F.lead, poles: pairUp(poles), imp, terms, rest: restOf(num, imp, F) };
}

function finish(m) {
  if (m.groups.length > MAX_DELAYS) throw new InputError(`That has pieces starting at ${m.groups.length} different times. This tool takes up to ${MAX_DELAYS}.`);
  const groups = m.groups.map(solvePiece);
  const delayed = groups.some((g) => g.T > 0);
  // the whole signal: each piece's terms switched on at its start, impulses at theirs
  const signal = m.signal ?? makeReal(groups.flatMap((g) => [
    ...g.imp.map((c, d) => (c ? { c: C(c, 0), n: 0, lam: C(), d, ...(g.T ? { on: g.T } : {}) } : null)).filter(Boolean),
    ...g.terms.map((x) => (g.T ? { ...x, on: g.T } : x)),
  ]));
  const terms = signal.filter((x) => !isImpulse(x));
  if (!terms.length && groups.every((g) => !g.imp.some((d) => d !== 0))) throw new InputError("That's zero, so there's nothing to show.");
  if (imagShare(terms) > 1e-7) throw new InputError("That didn't come out as a real function of time, which means the arithmetic went wrong. There's no result to show.");
  const all = allPoles(groups);
  const degree = all.reduce((n, p) => n + p.mult, 0);
  if (degree > MAX_DEGREE) throw new InputError(`That works out to a transform with ${degree} poles. This tool stops at ${MAX_DEGREE}, beyond which the arithmetic gets too unreliable to trust.`);
  const poles = delayed ? effectivePoles(all) : groups[0].poles;
  const zeros = delayed ? [] : distinctRoots(groups[0].numC, true);
  const roc = poles.length ? Math.max(...poles.map((p) => p.s.re)) : -Infinity;
  const g0 = groups.find((g) => g.T === 0);
  const kicks = groups.filter((g) => g.imp.some((d) => d !== 0)).map((g) => ({ T: g.T, imp: g.imp }));
  const model = {
    ok: true, kind: m.kind, sig: m.sig, cap: m.cap, typed: m.typed, order: m.order, coefs: m.coefs, ics: m.ics,
    delayed, groups, signal, allPoles: all,
    num: delayed ? null : g0.num, numC: delayed ? null : g0.numC, lead: delayed ? null : g0.lead, rest: delayed ? null : g0.rest,
    poles, zeros, cancelled: m.cancelled ?? [], roc, terms, imp: delayed ? (g0?.imp ?? []) : g0.imp, kicks,
    tWindow: timeWindow(all, groups.reduce((t, g) => Math.max(t, g.T), 0)), sWindow: planeWindow(all, zeros),
  };
  // A step that only repeats the one before it (a single term is its own partial fraction) is left out.
  const rhs = (x) => x.tex.slice(x.tex.indexOf("=") + 1);
  model.steps = m.steps(model).filter((x, i, all) => i === 0 || rhs(x) !== rhs(all[i - 1]));
  return model;
}

// Every pole of every piece, merged, with the residues each piece gives it: parts [{ T, res }].
function allPoles(groups) {
  const out = [];
  for (const g of groups) for (const p of g.poles) {
    let hit = out.find((o) => samePole(o.s, p.s));
    if (!hit) out.push((hit = { s: p.s, mult: 0, parts: [] }));
    hit.mult = Math.max(hit.mult, p.mult);
    hit.parts.push({ T: g.T, res: p.res });
  }
  return pairUp(out);
}
const fact = (k) => { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; };
// The poles of F as a whole. Near p, e^(−sT) = e^(−pT) Σ (−T)^m (s − p)^m / m!, so the
// coefficient of (s − p)^(−k) in Σ e^(−sT) F_T is
//   c_k = Σ_T e^(−pT) Σ_{j ≥ k} res_j (−T)^(j−k) / (j−k)!.
// A pole whose c_k all vanish isn't one (the pieces cancel there); otherwise its order is
// the highest k with c_k ≠ 0, and res is the principal part (c_1, c_2, …).
function effectivePoles(all) {
  const out = [];
  for (const p of all) {
    const c = [];
    let big = 0;
    for (let k = 1; k <= p.mult; k++) {
      let v = C();
      for (const part of p.parts) {
        const w = exp(scale(p.s, -part.T));
        for (let j = k; j <= part.res.length; j++) {
          const term = mul(w, scale(part.res[j - 1], Math.pow(-part.T, j - k) / fact(j - k)));
          v = add(v, term);
          big = Math.max(big, abs(term));
        }
      }
      c.push(v);
    }
    let mult = c.length;
    while (mult > 0 && abs(c[mult - 1]) <= 1e-9 * Math.max(big, 1e-300)) mult--;
    if (mult > 0) out.push({ s: p.s, mult, res: c.slice(0, mult) });
  }
  return pairUp(out);
}

// The polynomial part's coefficients are real for a real signal; what's left in their
// imaginary parts is roundoff. A coefficient that is roundoff next to the rest is zero.
function realImpulses(Q) {
  const big = Q.reduce((m, z) => Math.max(m, abs(z)), 0);
  const out = Q.map((z) => (abs(z) <= 1e-10 * big ? 0 : z.re));
  while (out.length && out[out.length - 1] === 0) out.pop();
  return out;
}
// The numerator left over once the polynomial part is divided out: num − Q · lead · D.
function restOf(num, imp, F) {
  if (!imp.length) return num;
  const den = pmul(fromReal([F.lead]), fromRoots(F.poles)).map((z) => z.re);
  const out = num.slice();
  imp.forEach((q, k) => den.forEach((d, i) => { out[k + i] -= q * d; }));
  out.length = Math.max(1, den.length - 1);
  return out.map((x) => (Math.abs(x) <= 1e-12 * Math.max(1, ...num.map(Math.abs)) ? 0 : x));
}

// Never show a silently wrong result: the polynomial part and the partial fractions must
// add back up to the fraction they came from, and the signal must be real. Badly
// conditioned inputs (poles almost, but not quite, on top of each other) fail here
// instead of on screen.
function check(F, imp, poles, terms) {
  const right = poles.length ? Math.max(...poles.map((p) => p.s.re)) : 0, span = 1 + Math.max(0, ...poles.map((p) => abs(p.s)));
  for (const s of [C(right + 0.7 * span, 0.3 * span), C(right + 1.9 * span, -1.1 * span), C(right + 0.4 * span, 2.3 * span)]) {
    const a = evalTransform(F, s), b = add(evalFractions(poles, s), peval(fromReal(imp), s));
    if (!(dist(a, b) <= 1e-7 * Math.max(abs(a), 1e-300))) {
      throw new InputError("The arithmetic for that one isn't reliable enough to show: some of its poles are too close together to separate accurately. If two factors are meant to be the same, type them identically, for example (s + 1)^2.");
    }
  }
  if (imagShare(terms) > 1e-7) throw new InputError("That didn't come out as a real function of time, which means the arithmetic went wrong. There's no result to show.");
}

// A round number of seconds that shows the signal's behaviour: several time constants
// of the slowest decay, a few turns of the slowest oscillation, and room after the last
// delay for what it switches on to be seen.
function timeWindow(poles, lastStart = 0) {
  let T = 0;
  for (const p of poles) {
    if (Math.abs(p.s.re) > 1e-9) T = Math.max(T, (p.s.re < 0 ? 6 : 3) / Math.abs(p.s.re));
    if (Math.abs(p.s.im) > 1e-9) T = Math.max(T, (3 * 2 * Math.PI) / Math.abs(p.s.im));
  }
  if (!T) T = 5;
  T = Math.max(T, lastStart * 2);
  T = Math.min(Math.max(T, 1), 500);
  const e = 10 ** Math.floor(Math.log10(T)), f = T / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

// The square of the s-plane both plane views show: every pole and zero inside, with room.
function planeWindow(poles, zeros) {
  const pts = [...poles, ...zeros].map((p) => p.s);
  let lo = -1, hi = 1, im = 1;
  for (const z of pts) { lo = Math.min(lo, z.re); hi = Math.max(hi, z.re); im = Math.max(im, Math.abs(z.im)); }
  const half = Math.max(2, Math.ceil(1.4 * Math.max((hi - lo) / 2 + 0.6, im + 0.6)));
  return { cx: Math.round(((lo + hi) / 2) * 2) / 2, cy: 0, half };
}
