// The engine's one entry point: what was typed → everything the views draw.
// analyse(input) returns either
//   { ok: true, kind, sig, cap, num, lead, poles, zeros, cancelled, roc, terms, tWindow, sWindow, steps }
// or { ok: false, message } with a message written for the person who typed the input.
//
//   num, lead, poles   F(s) = num(s) / (lead · Π (s − p)^m); poles carry their residues:
//                      poles[k].res[j−1] is the coefficient of 1/(s − p)^j
//   terms              the time signal, Σ c t^n e^(λt)
//   roc                the abscissa of convergence: the integral converges for Re(s) > roc
import { C, abs, dist } from "./complex.js";
import { fromReal, toReal } from "./poly.js";
import { distinctRoots } from "./roots.js";
import { InputError, parse, parseEquation } from "./parse.js";
import { signalFromAst, numberFromAst, makeReal, evalEP, imagShare } from "./expoly.js";
import { rationalFromAst } from "./rational.js";
import { transformTerms, cancelCommon, partialFractions, inverseTerms, residuesOf, evalTransform, evalFractions, pairUp, samePole } from "./laplace.js";
import { odeFromAst, solveOde } from "./ode.js";
import * as T from "./tex.js";

const MAX_DEGREE = 12;

export function analyse(input) {
  try {
    const m = input.mode === "ode" ? fromOde(input) : input.mode === "rational" ? fromRational(input) : fromFunction(input);
    return finish(m);
  } catch (e) {
    if (e instanceof InputError) return { ok: false, message: e.message };
    return { ok: false, message: "Something went wrong while working that out, so there's no result to show. (" + e.message + ")" };
  }
}

/** f(t) or y(t) at time t. */
export const evalSignal = (model, t) => evalEP(model.terms, t).re;
/** F(s) or Y(s) at s, from its closed form (valid everywhere but at the poles). */
export const evalTransformAt = (model, s) => evalTransform({ num: model.numC, lead: model.lead, poles: model.poles }, s);

// ── the three kinds of input ──

function fromFunction(input) {
  const ast = parse(input.fn ?? "");
  const terms = makeReal(signalFromAst(ast));
  if (!terms.length) throw new InputError("That's the zero function, so there's nothing to transform. Try e^(-t) or cos(2t).");
  const F = transformTerms(terms);
  const steps = (m) => [
    { title: "The function", tex: `f(t) = ${T.timeTex(m.terms)},\\quad t \\ge 0` },
    { title: "Transform term by term", tex: `F(s) = ${T.fractionsTex(m.poles)}` },
    { title: "As one fraction", tex: `F(s) = ${T.fractionTex(m.num, m.lead, m.poles)}` },
  ];
  return { kind: "function", sig: "f", cap: "F", F, terms, steps, typed: T.astTex(ast) };
}

function fromRational(input) {
  const ast = parse(input.rational ?? "");
  const r = rationalFromAst(ast);
  if (r.num.length === 1 && r.num[0] === 0) throw new InputError("That's zero, so there's nothing to invert. Try 1/(s^2 + 4).");
  let poles = [];
  for (const f of r.den) {
    for (const root of distinctRoots(fromReal(f.poly), true)) {
      const hit = poles.find((p) => samePole(p.s, root.s));
      if (hit) hit.mult += root.mult * f.pow; else poles.push({ s: root.s, mult: root.mult * f.pow });
    }
  }
  poles = pairUp(poles);
  const { F, cancelled } = cancelCommon({ num: fromReal(r.num), lead: 1, poles });
  const degN = F.num.length - 1, degD = F.poles.reduce((n, p) => n + p.mult, 0);
  if (degN >= degD) {
    throw new InputError(degD === 0
      ? "That's a polynomial in s, not a fraction. Its inverse transform is made of impulses, which this tool doesn't draw. F(s) needs a denominator of higher degree than its numerator, like 1/(s + 1)."
      : `The numerator (degree ${degN}) has to be of lower degree than the denominator (degree ${degD}). Otherwise f(t) contains an impulse at t = 0, which this tool doesn't draw.`);
  }
  const steps = (m) => [
    { title: m.cancelled.length ? "The transform, after cancelling common factors" : "The transform", tex: `F(s) = ${T.fractionTex(m.num, m.lead, m.poles)}` },
    { title: "Partial fractions", tex: `F(s) = ${T.fractionsTex(m.poles)}` },
    { title: "Invert each term", tex: `f(t) = ${T.timeTex(m.terms)},\\quad t \\ge 0` },
  ];
  return { kind: "rational", sig: "f", cap: "F", F, cancelled, steps, typed: T.astTex(ast) };
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
  const sol = solveOde(coefs, makeReal(forcing), ics);
  if (sol.Y.num.length === 1 && abs(sol.Y.num[0]) === 0) {
    throw new InputError("With nothing driving the equation and every starting value zero, the solution is y(t) = 0 for all time. Add a forcing term on the right, or a non-zero starting value.");
  }
  const { F, cancelled } = cancelCommon(sol.Y);
  const rhs = forcing.length ? T.fractionTex(toReal(sol.G.num), 1, sol.G.poles) : "0";
  const steps = (m) => [
    { title: "The equation", tex: `${T.odeTex(coefs, forcing)}${order ? `,\\qquad ${T.icsTex(ics)}` : ""}` },
    { title: "Transform both sides", tex: T.transformedTex(coefs, ics, rhs) },
    { title: "Solve for Y(s)", tex: `Y(s) = ${T.fractionTex(m.num, m.lead, m.poles)}` },
    { title: "Partial fractions", tex: `Y(s) = ${T.fractionsTex(m.poles)}` },
    { title: "Invert each term", tex: `y(t) = ${T.timeTex(m.terms)},\\quad t \\ge 0` },
  ];
  return { kind: "ode", sig: "y", cap: "Y", F, cancelled, steps, order, coefs, ics, typed: `${T.astTex(eq.lhs)} = ${T.astTex(eq.rhs)}` };
}

// ── the part every kind shares ──

function finish(m) {
  const F = m.F;
  const degree = F.poles.reduce((n, p) => n + p.mult, 0);
  if (degree > MAX_DEGREE) throw new InputError(`That works out to a transform with ${degree} poles. This tool stops at ${MAX_DEGREE}, beyond which the arithmetic gets too unreliable to trust.`);
  const poles = m.terms ? residuesOf(m.terms, F.poles) : partialFractions(F);
  const terms = m.terms ?? inverseTerms(poles);
  check(F, poles, terms);
  const num = toReal(F.num);
  const zeros = distinctRoots(F.num, true);
  const roc = Math.max(...poles.map((p) => p.s.re));
  const model = {
    ok: true, kind: m.kind, sig: m.sig, cap: m.cap, typed: m.typed, order: m.order, coefs: m.coefs, ics: m.ics,
    num, numC: F.num, lead: F.lead, poles: pairUp(poles), zeros, cancelled: m.cancelled ?? [], roc, terms,
    tWindow: timeWindow(poles), sWindow: planeWindow(poles, zeros),
  };
  model.steps = m.steps(model);
  return model;
}

// Never show a silently wrong result: the partial fractions must add back up to the
// fraction they came from, and the signal must be real. Badly conditioned inputs
// (poles almost, but not quite, on top of each other) fail here instead of on screen.
function check(F, poles, terms) {
  const right = Math.max(...poles.map((p) => p.s.re)), span = 1 + Math.max(...poles.map((p) => abs(p.s)));
  for (const s of [C(right + 0.7 * span, 0.3 * span), C(right + 1.9 * span, -1.1 * span), C(right + 0.4 * span, 2.3 * span)]) {
    const a = evalTransform(F, s), b = evalFractions(poles, s);
    if (!(dist(a, b) <= 1e-7 * Math.max(abs(a), 1e-300))) {
      throw new InputError("The arithmetic for that one isn't reliable enough to show: some of its poles are too close together to separate accurately. If two factors are meant to be the same, type them identically, for example (s + 1)^2.");
    }
  }
  if (imagShare(terms) > 1e-7) throw new InputError("That didn't come out as a real function of time, which means the arithmetic went wrong. There's no result to show.");
}

// A round number of seconds that shows the signal's behaviour: several time constants
// of the slowest decay, a few turns of the slowest oscillation.
function timeWindow(poles) {
  let T = 0;
  for (const p of poles) {
    if (Math.abs(p.s.re) > 1e-9) T = Math.max(T, (p.s.re < 0 ? 6 : 3) / Math.abs(p.s.re));
    if (Math.abs(p.s.im) > 1e-9) T = Math.max(T, (3 * 2 * Math.PI) / Math.abs(p.s.im));
  }
  if (!T) T = 5;
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
