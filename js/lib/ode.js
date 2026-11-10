// Linear constant-coefficient differential equations: text to coefficients, then to Y(s).
import { C } from "./complex.js";
import { fromReal, pmul, padd, fromRoots, trim } from "./poly.js";
import { distinctRoots } from "./roots.js";
import { InputError, hasY } from "./parse.js";
import { signalFromAst, constOf, addEP, negEP, scaleEP, simplify } from "./expoly.js";
import { transformTerms, samePole, pairUp } from "./laplace.js";

const NONLINEAR = "That makes the equation non-linear (y multiplied by y, a power of y, or y inside a function). This tool solves linear equations only.";
const VARIABLE = "The coefficients of y and its derivatives have to be plain numbers. One of them here changes with t, which makes it a variable-coefficient equation, and those are outside what this tool solves.";

// One side of the equation as { y: coefficients by derivative order, g: a signal in t }.
function linear(n) {
  if (!hasY(n)) return { y: [], g: signalFromAst(n) };
  if (n.t === "y") { const y = []; y[n.order] = 1; return { y, g: [] }; }
  if (n.t === "neg") return times(linear(n.a), -1);
  if (n.t === "call") throw new InputError(NONLINEAR);
  if (n.op === "+" || n.op === "-") {
    const a = linear(n.a), b = times(linear(n.b), n.op === "+" ? 1 : -1), y = [];
    for (let i = 0; i < Math.max(a.y.length, b.y.length); i++) y[i] = (a.y[i] ?? 0) + (b.y[i] ?? 0);
    return { y, g: addEP(a.g, b.g) };
  }
  if (n.op === "*") {
    if (hasY(n.a) && hasY(n.b)) throw new InputError(NONLINEAR);
    const [withY, other] = hasY(n.a) ? [n.a, n.b] : [n.b, n.a];
    return times(linear(withY), number(other));
  }
  if (n.op === "/") {
    if (hasY(n.b)) throw new InputError(NONLINEAR);
    const k = number(n.b);
    if (k === 0) throw new InputError("That divides by zero.");
    return times(linear(n.a), 1 / k);
  }
  throw new InputError(NONLINEAR);
}
function number(ast) {
  const k = constOf(signalFromAst(ast));
  if (!k || Math.abs(k.im) > 1e-12) throw new InputError(VARIABLE);
  return k.re;
}
const times = (f, k) => ({ y: f.y.map((v) => v * k), g: scaleEP(f.g, C(k, 0)) });

/**
 * { lhs, rhs } → { coefs, forcing }: Σ coefs[k] y^(k) = forcing(t), with every y term
 * moved to the left and everything else to the right.
 */
export function odeFromAst({ lhs, rhs }) {
  const L = linear(lhs), R = linear(rhs);
  const coefs = [];
  for (let i = 0; i < Math.max(L.y.length, R.y.length); i++) coefs[i] = (L.y[i] ?? 0) - (R.y[i] ?? 0);
  while (coefs.length && Math.abs(coefs[coefs.length - 1]) < 1e-14) coefs.pop();
  if (!coefs.length) throw new InputError("There's no y left in that equation. A differential equation needs y and at least one of its derivatives, as in y' + 2y = 1.");
  if (coefs.length === 1) throw new InputError("There's no derivative of y in that equation, so it's ordinary algebra. Add a term such as y' or y''.");
  if (coefs.length - 1 > 8) throw new InputError("That equation is of order " + (coefs.length - 1) + ". This tool goes up to order 8.");
  return { coefs, forcing: simplify(addEP(R.g, negEP(L.g))) };
}

/** The initial-condition polynomial I(s) = Σ_k a_k Σ_{j<k} s^(k−1−j) y^(j)(0), real, ascending. */
export function initialPoly(coefs, ics) {
  const out = new Array(Math.max(coefs.length - 1, 1)).fill(0);
  for (let k = 1; k < coefs.length; k++) for (let j = 0; j < k; j++) out[k - 1 - j] += coefs[k] * (ics[j] ?? 0);
  return out;
}

/**
 * Y(s) = (G(s) + I(s)) / P(s) as { num, lead, poles }, plus the pieces the worked
 * steps show. The forcing's poles are exact; the characteristic roots are found
 * numerically and, where one coincides with a forcing pole (resonance), merged with it.
 */
export function solveOde(coefs, forcing, ics) {
  const G = transformTerms(forcing);
  const I = initialPoly(coefs, ics);
  const charRoots = distinctRoots(fromReal(coefs), true);
  const poles = G.poles.map((p) => ({ s: p.s, mult: p.mult }));
  for (const r of charRoots) {
    const hit = poles.find((p) => samePole(p.s, r.s));
    if (hit) hit.mult += r.mult; else poles.push({ s: r.s, mult: r.mult });
  }
  // N = N_g + I · D_g, over P · D_g
  const num = trim(padd(G.num, pmul(fromReal(I), fromRoots(G.poles))));
  const lead = coefs[coefs.length - 1];
  return { Y: { num, lead, poles: pairUp(poles) }, G, I, charRoots };
}
