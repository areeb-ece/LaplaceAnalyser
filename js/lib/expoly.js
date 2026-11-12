// Exponential polynomials: sums of c · t^n · e^(λt) with complex c and λ. Sines and
// cosines are two such terms each (Euler), and the set is closed under + and ×, so
// every signal this tool handles is one of these, exactly.
// A signal is a list of terms { c, n, lam }, plus, at t = 0, impulses: a term
// { c, d } is c · δ^(d)(t), the unit impulse (d = 0) or its d-th derivative.
// An impulse has no value at any t > 0, so evaluating a signal leaves them out; a
// product with an ordinary term sifts it (g(t) δ(t) = g(0) δ(t)), and two impulses
// can't be multiplied at all.
import { C, ZERO, ONE, add, mul, scale, neg, conj, abs, exp, inv, powi, dist } from "./complex.js";
import { InputError } from "./parse.js";

export const term = (c, n = 0, lam = ZERO) => ({ c, n, lam });
/** c · δ^(d)(t). */
export const impulse = (c, d = 0) => ({ c, n: 0, lam: ZERO, d });
/** Is this term an impulse? */
export const isImpulse = (x) => x.d !== undefined;
const sameLam = (a, b) => dist(a, b) <= 1e-12 * (1 + abs(a));
const same = (a, b) => (isImpulse(a) || isImpulse(b) ? a.d === b.d : a.n === b.n && sameLam(a.lam, b.lam));

/** Merges like terms, drops the ones that cancelled, and sorts. */
export function simplify(terms) {
  const out = [];
  for (const x of terms) {
    const hit = out.find((o) => same(o, x));
    if (hit) hit.c = add(hit.c, x.c);
    else out.push(isImpulse(x) ? impulse(x.c, x.d) : { c: x.c, n: x.n, lam: x.lam });
  }
  // impulses and ordinary terms are compared for size among their own kind
  const big = (imp) => out.reduce((m, x) => (isImpulse(x) === imp ? Math.max(m, abs(x.c)) : m), 0);
  const bigT = big(false), bigD = big(true);
  return out
    .filter((x) => abs(x.c) > 1e-13 * (isImpulse(x) ? bigD : bigT) && abs(x.c) > 0)
    .sort((a, b) => (isImpulse(b) - isImpulse(a)) || (isImpulse(a) ? a.d - b.d : b.lam.re - a.lam.re || Math.abs(a.lam.im) - Math.abs(b.lam.im) || b.lam.im - a.lam.im || a.n - b.n));
}
export const addEP = (a, b) => simplify(a.concat(b));
export const scaleEP = (a, k) => a.map((x) => (isImpulse(x) ? impulse(mul(x.c, k), x.d) : term(mul(x.c, k), x.n, x.lam)));
export const negEP = (a) => scaleEP(a, C(-1, 0));
export function mulEP(a, b) {
  const out = [];
  for (const x of a) for (const y of b) {
    if (isImpulse(x) && isImpulse(y)) throw new InputError("Two impulses can't be multiplied together: δ(t)·δ(t) isn't defined. Add them, or multiply one by an ordinary function.");
    if (isImpulse(x) || isImpulse(y)) out.push(...sift(isImpulse(x) ? y : x, isImpulse(x) ? x : y));
    else out.push(term(mul(x.c, y.c), x.n + y.n, add(x.lam, y.lam)));
  }
  return simplify(out);
}
const binom = (k, j) => { let r = 1; for (let i = 1; i <= j; i++) r = (r * (k - j + i)) / i; return r; };
// g(t) · c δ^(k)(t) = c Σ_j (−1)^j C(k, j) g^(j)(0) δ^(k−j)(t), for one ordinary term g.
function sift(g, imp) {
  const out = [];
  let dg = [g];
  for (let j = 0; j <= imp.d; j++) {
    const v = evalEP(dg, 0);
    out.push(impulse(scale(mul(imp.c, v), (j % 2 ? -1 : 1) * binom(imp.d, j)), imp.d - j));
    dg = derivEP(dg);
  }
  return out;
}
export function powEP(a, k) {
  let r = [term(ONE)];
  for (let i = 0; i < k; i++) r = mulEP(r, a);
  return r;
}
/** d/dt of the ordinary terms (an impulse's derivative is the next one up). */
export function derivEP(a) {
  const out = [];
  for (const x of a) {
    if (isImpulse(x)) { out.push(impulse(x.c, x.d + 1)); continue; }
    if (x.n > 0) out.push(term(scale(x.c, x.n), x.n - 1, x.lam));
    out.push(term(mul(x.c, x.lam), x.n, x.lam));
  }
  return simplify(out);
}
/** The value at time t > 0 (complex; real signals give a zero imaginary part). Impulses have none. */
export function evalEP(a, t) {
  let re = 0, im = 0;
  for (const x of a) {
    if (isImpulse(x)) continue;
    const m = Math.exp(x.lam.re * t) * (x.n ? Math.pow(t, x.n) : 1), ph = x.lam.im * t;
    const er = m * Math.cos(ph), ei = m * Math.sin(ph);
    re += x.c.re * er - x.c.im * ei;
    im += x.c.re * ei + x.c.im * er;
  }
  return C(re, im);
}
/** The number this is, when it's a constant; otherwise null. */
export function constOf(a) {
  if (!a.length) return C();
  if (a.some(isImpulse)) return null;
  if (a.length === 1 && a[0].n === 0 && abs(a[0].lam) === 0) return a[0].c;
  return null;
}
/** { a, b } when this is a·t + b with real a and b; otherwise null. */
export function linearOf(terms) {
  let a = 0, b = 0;
  for (const x of terms) {
    if (isImpulse(x) || abs(x.lam) !== 0 || x.n > 1 || Math.abs(x.c.im) > 1e-12 * Math.max(1, Math.abs(x.c.re))) return null;
    if (x.n === 1) a += x.c.re; else b += x.c.re;
  }
  return { a, b };
}
/** Forces exact conjugate symmetry, which a real signal has and roundoff slightly breaks. */
export function makeReal(terms) {
  const out = simplify(terms);
  for (const x of out) {
    if (isImpulse(x) || Math.abs(x.lam.im) <= 1e-12 * (1 + abs(x.lam))) { x.lam = C(x.lam.re, 0); x.c = C(x.c.re, 0); continue; }
    if (x.lam.im < 0) continue;
    const twin = out.find((o) => o.n === x.n && o.lam.im < 0 && dist(o.lam, conj(x.lam)) <= 1e-9 * (1 + abs(x.lam)));
    if (twin) {
      const c = scale(add(x.c, conj(twin.c)), 0.5);
      x.c = c; twin.c = conj(c); twin.lam = conj(x.lam);
    }
  }
  return out;
}
/** How far from real the signal is, relative to its size (0 for a real signal). */
export function imagShare(terms) {
  let worst = 0, big = 0;
  for (const t of [0, 0.37, 1.1, 2.3]) { const v = evalEP(terms, t); worst = Math.max(worst, Math.abs(v.im)); big = Math.max(big, abs(v)); }
  return big ? worst / big : 0;
}

const real = (z, what) => {
  if (Math.abs(z.im) > 1e-12 * Math.max(1, Math.abs(z.re))) throw new InputError(`${what} has to be a real number.`);
  return z.re;
};
const constant = (v) => (v === 0 ? [] : [term(C(v, 0))]);

/**
 * A syntax tree as a signal in t. Anything that isn't a sum of t^n e^(at) cos/sin(bt)
 * terms is refused with the reason.
 */
export function signalFromAst(n) {
  switch (n.t) {
    case "num": return constant(n.v);
    case "var":
      if (n.name === "t") return [term(ONE, 1)];
      if (n.name === "e") return constant(Math.E);
      if (n.name === "pi") return constant(Math.PI);
      throw new InputError("s is the transform's variable, so it can't appear in a function of time. Use t here, or switch to the Transform F(s) mode.");
    case "y": throw new InputError("y belongs in a differential equation. Here, type the function itself, such as e^(-t) sin(3t).");
    case "neg": return negEP(signalFromAst(n.a));
    case "call": return callSignal(n);
    case "bin": {
      if (n.op === "^") return powerSignal(n);
      const a = signalFromAst(n.a), b = signalFromAst(n.b);
      if (n.op === "+") return addEP(a, b);
      if (n.op === "-") return addEP(a, negEP(b));
      if (n.op === "*") return mulEP(a, b);
      if (!b.length) throw new InputError("That divides by zero.");
      if (b.some(isImpulse)) throw new InputError("Dividing by an impulse isn't defined. An impulse can be multiplied by a number or a function, or added.");
      // 1/(c e^(λt)) is another exponential; 1/t, 1/sin(t) and the like have no rational transform.
      if (b.length === 1 && b[0].n === 0) return mulEP(a, [term(inv(b[0].c), 0, neg(b[0].lam))]);
      throw new InputError("I can only divide by a number or by a single exponential such as e^(2t). Dividing by t, or by a sum, gives a function whose transform isn't a ratio of polynomials.");
    }
  }
  throw new InputError("I couldn't make sense of that expression.");
}

function powerSignal(n) {
  const E = signalFromAst(n.b), B = signalFromAst(n.a);
  if (E.some(isImpulse)) throw new InputError("An impulse can't go in a power. It can be multiplied by a number or a function, or added.");
  if (B.some(isImpulse) && !(constOf(E)?.re === 1)) throw new InputError("Powers of an impulse aren't defined: δ(t)² has no meaning. Write the impulse to the first power, times a number if needed.");
  const k = constOf(E), base = constOf(B);
  if (k && Math.abs(k.im) < 1e-12 && Number.isInteger(k.re)) {
    if (k.re >= 0) {
      if (k.re > 24) throw new InputError("That power is too high for this tool (the limit is 24).");
      return powEP(B, k.re);
    }
    if (!B.length) throw new InputError("That divides by zero.");
    if (B.length === 1 && B[0].n === 0) return [term(powi(B[0].c, k.re), 0, scale(B[0].lam, k.re))];
    throw new InputError("A negative power only works on a number or a single exponential, like e^(2t)^-1. Negative powers of t have no rational transform.");
  }
  if (base && Math.abs(base.im) < 1e-12 && base.re > 0) {
    const lin = linearOf(E);
    if (!lin) throw new InputError("The power of an exponential has to be of the form a·t + b, like e^(-2t). Powers such as e^(t^2) are outside what the Laplace tables cover here.");
    const ln = Math.log(base.re);
    return [term(C(Math.exp(lin.b * ln), 0), 0, C(lin.a * ln, 0))];
  }
  if (base && k) throw new InputError("That power of a negative number isn't a real number.");
  if (!k) throw new InputError("Only a number can be raised to a power that contains t. Did you mean e^(…)?");
  throw new InputError("Powers have to be whole numbers here, as in t^2 or sin(t)^3. Fractional powers such as sqrt(t) don't have a rational transform.");
}

function callSignal(n) {
  const A = signalFromAst(n.arg);
  if (A.some(isImpulse)) throw new InputError(`An impulse can't go inside ${n.fn}(…). It can be multiplied by a number or a function, or added.`);
  if (n.fn === "delta") return impulseSignal(n, A);
  if (n.fn === "sqrt") {
    const k = constOf(A);
    if (!k) throw new InputError("sqrt only works on numbers here. sqrt(t) doesn't have a transform that's a ratio of polynomials.");
    const v = real(k, "The number under sqrt");
    if (v < 0) throw new InputError("The square root of a negative number isn't real.");
    return constant(Math.sqrt(v));
  }
  const lin = linearOf(A);
  if (!lin) {
    const shown = n.fn === "u" ? "u(t)" : `${n.fn}(a·t + b)`;
    throw new InputError(`What's inside ${n.fn}(…) has to be of the form a·t + b, as in ${shown}. Anything else, such as ${n.fn === "exp" ? "exp" : n.fn}(t^2), is outside the family of functions this tool transforms.`);
  }
  const { a, b } = lin;
  switch (n.fn) {
    case "exp": return [term(C(Math.exp(b), 0), 0, C(a, 0))];
    case "u":
      if (a <= 0) throw new InputError("The unit step has to switch on as time goes forward: use u(t).");
      if (b < 0) throw new InputError(`A delayed step, u(t − ${+(-b / a).toPrecision(6)}), isn't supported yet. Only u(t), which switches on at t = 0, is.`);
      return constant(1);
    case "cos": case "sin": {
      if (a === 0) return constant(n.fn === "cos" ? Math.cos(b) : Math.sin(b));
      // cos(at+b) = ½ e^(ib) e^(iat) + ½ e^(−ib) e^(−iat); sin has 1/(2i) and a minus.
      const up = exp(C(0, b)), k = n.fn === "cos" ? C(0.5, 0) : C(0, -0.5);
      return simplify([term(mul(k, up), 0, C(0, a)), term(conj(mul(k, up)), 0, C(0, -a))]);
    }
    case "cosh": case "sinh": {
      const sign = n.fn === "cosh" ? 1 : -1;
      return simplify([term(C(Math.exp(b) / 2, 0), 0, C(a, 0)), term(C((sign * Math.exp(-b)) / 2, 0), 0, C(-a, 0))]);
    }
  }
  throw new InputError(`I don't know the function ${n.fn}.`);
}

// δ^(k)(a·t): the unit impulse at t = 0, scaled. δ^(k)(at) = δ^(k)(t) / (a^k |a|).
const MAX_ORDER = 4;
function impulseSignal(n, A) {
  const lin = linearOf(A), name = "delta" + "'".repeat(n.order);
  if (!lin || lin.a === 0) throw new InputError(`What's inside ${name}(…) has to be t, or a number times t, as in ${name}(t).`);
  if (lin.b !== 0) {
    const at = -lin.b / lin.a;
    throw new InputError(at > 0
      ? `That's an impulse at t = ${+at.toPrecision(6)}, a delayed one, which isn't supported yet. Only impulses at t = 0, delta(t), are.`
      : `That's an impulse at t = ${+at.toPrecision(6)}, before the transform starts at t = 0, so it would count for nothing. Write delta(t) for an impulse at t = 0.`);
  }
  if (n.order > MAX_ORDER) throw new InputError(`That derivative of the impulse is of too high an order: this tool goes up to the ${MAX_ORDER}th, delta${"'".repeat(MAX_ORDER)}(t).`);
  return [impulse(C(1 / (lin.a ** n.order * Math.abs(lin.a)), 0), n.order)];
}

/** A typed number such as 1/2 or pi (for initial conditions). */
export function numberFromAst(ast, what = "That") {
  const k = constOf(signalFromAst(ast));
  if (!k) throw new InputError(`${what} has to be a number, not something that changes with time.`);
  return real(k, what);
}
