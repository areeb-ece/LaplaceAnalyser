// Exponential polynomials: sums of c · t^n · e^(λt) with complex c and λ. Sines and
// cosines are two such terms each (Euler), and the set is closed under + and ×, so
// every signal this tool handles is one of these, exactly.
//
// A signal is a list of terms { c, n, lam, on }:
//   on absent    c t^n e^(λt), an expression in t that runs through t = 0 smoothly
//   on = T ≥ 0   u(t − T) · c (t − T)^n e^(λ(t − T)): switched on at T, and written in
//                τ = t − T, so a delayed piece transforms to e^(−sT) times its own
//                transform (the time-delay rule). on = 0 is u(t) itself: the same for
//                t ≥ 0, but its derivative has a jump at 0 (u′ = δ).
// and impulses { c, d, on }: c · δ^(d)(t − on), the unit impulse (d = 0) or its d-th
// derivative, at t = on (0 when absent). An impulse has no value at any other time,
// so evaluating a signal leaves them out; a product with an ordinary term sifts it
// (g(t) δ(t − T) = g(T) δ(t − T)), and two impulses can't be multiplied at all.
import { C, ZERO, ONE, add, mul, scale, neg, conj, abs, exp, inv, powi, dist } from "./complex.js";
import { InputError } from "./parse.js";

export const term = (c, n = 0, lam = ZERO) => ({ c, n, lam });
/** c · δ^(d)(t − at). */
export const impulse = (c, d = 0, at = 0) => (at ? { c, n: 0, lam: ZERO, d, on: at } : { c, n: 0, lam: ZERO, d });
/** Is this term an impulse? */
export const isImpulse = (x) => x.d !== undefined;
/** Is this ordinary term switched on by a step (at its start time)? */
export const isSwitched = (x) => !isImpulse(x) && x.on !== undefined;
/** Where a term starts: its step's time, or its impulse's (0 for a plain term). */
export const startOf = (x) => x.on ?? 0;
const sameLam = (a, b) => dist(a, b) <= 1e-12 * (1 + abs(a));
const sameTime = (a, b) => Math.abs(a - b) <= 1e-12 * (1 + Math.abs(a));
const same = (a, b) => {
  if (isImpulse(a) !== isImpulse(b)) return false;
  if (isImpulse(a)) return a.d === b.d && sameTime(startOf(a), startOf(b));
  return isSwitched(a) === isSwitched(b) && sameTime(startOf(a), startOf(b)) && a.n === b.n && sameLam(a.lam, b.lam);
};
const copy = (x, c = x.c) => {
  const out = isImpulse(x) ? { c, n: 0, lam: ZERO, d: x.d } : { c, n: x.n, lam: x.lam };
  if (x.on !== undefined) out.on = x.on;
  return out;
};
const order = (a, b) =>
  startOf(a) - startOf(b) || (isSwitched(a) - isSwitched(b)) || (isImpulse(b) - isImpulse(a)) ||
  (isImpulse(a) ? a.d - b.d : b.lam.re - a.lam.re || Math.abs(a.lam.im) - Math.abs(b.lam.im) || b.lam.im - a.lam.im || a.n - b.n);

/** Merges like terms, drops the ones that cancelled, and sorts (by start time, then as before). */
export function simplify(terms) {
  const out = [];
  for (const x of terms) {
    const hit = out.find((o) => same(o, x));
    if (hit) hit.c = add(hit.c, x.c);
    else out.push(copy(x));
  }
  // impulses and ordinary terms are compared for size among their own kind
  const big = (imp) => out.reduce((m, x) => (isImpulse(x) === imp ? Math.max(m, abs(x.c)) : m), 0);
  const bigT = big(false), bigD = big(true);
  return out.filter((x) => abs(x.c) > 1e-13 * (isImpulse(x) ? bigD : bigT) && abs(x.c) > 0).sort(order);
}
export const addEP = (a, b) => simplify(a.concat(b));
export const scaleEP = (a, k) => a.map((x) => copy(x, mul(x.c, k)));
export const negEP = (a) => scaleEP(a, C(-1, 0));

const binom = (k, j) => { let r = 1; for (let i = 1; i <= j; i++) r = (r * (k - j + i)) / i; return r; };
// One ordinary term re-written in τ = t − T, valid wherever it is on and t ≥ T:
// c (τ + Δ)^n e^(λ(τ + Δ)) = Σ_k C(n, k) Δ^(n−k) c e^(λΔ) τ^k e^(λτ), Δ = T − its start.
function shift(x, T) {
  const D = T - startOf(x), k0 = D ? mul(x.c, exp(scale(x.lam, D))) : x.c, out = [];
  for (let k = 0; k <= x.n; k++) {
    const w = binom(x.n, k) * (D ? Math.pow(D, x.n - k) : x.n === k ? 1 : 0);
    if (w) out.push({ c: scale(k0, w), n: k, lam: x.lam, on: T });
  }
  return out;
}
export function mulEP(a, b) {
  const out = [];
  for (const x of a) for (const y of b) {
    if (isImpulse(x) && isImpulse(y)) throw new InputError("Two impulses can't be multiplied together: δ(t)·δ(t) isn't defined. Add them, or multiply one by an ordinary function.");
    if (isImpulse(x) || isImpulse(y)) { out.push(...sift(isImpulse(x) ? y : x, isImpulse(x) ? x : y)); continue; }
    if (!isSwitched(x) && !isSwitched(y)) { out.push(term(mul(x.c, y.c), x.n + y.n, add(x.lam, y.lam))); continue; }
    // a step times anything: both re-written from the later start, where both are on
    const T = Math.max(isSwitched(x) ? x.on : 0, isSwitched(y) ? y.on : 0);
    for (const p of shift(x, T)) for (const q of shift(y, T)) out.push({ c: mul(p.c, q.c), n: p.n + q.n, lam: add(p.lam, q.lam), on: T });
  }
  return simplify(out);
}
// g(t) · c δ^(k)(t − a) = c Σ_j (−1)^j C(k, j) g^(j)(a) δ^(k−j)(t − a), for one ordinary term g.
function sift(g, imp) {
  const a = startOf(imp);
  if (isSwitched(g) && g.on > a + 1e-12) return []; // still off at the impulse
  if (isSwitched(g) && imp.d > 0 && sameTime(g.on, a) && a > 0) {
    throw new InputError(`That multiplies a derivative of an impulse by a step that switches on at the same instant, t = ${+a.toPrecision(6)}, which has no meaning. Move one of them, or use the impulse itself rather than its derivative.`);
  }
  const at = a - (isSwitched(g) ? g.on : 0), out = [];
  let dg = [term(g.c, g.n, g.lam)];
  for (let j = 0; j <= imp.d; j++) {
    const v = evalEP(dg, at);
    out.push(impulse(scale(mul(imp.c, v), (j % 2 ? -1 : 1) * binom(imp.d, j)), imp.d - j, a));
    dg = derivEP(dg);
  }
  return out;
}
export function powEP(a, k) {
  let r = [term(ONE)];
  for (let i = 0; i < k; i++) r = mulEP(r, a);
  return r;
}
/** d/dt of each term where it is on (an impulse's derivative is the next one up). */
export function derivEP(a) {
  const out = [];
  for (const x of a) {
    if (isImpulse(x)) { out.push({ ...copy(x), d: x.d + 1 }); continue; }
    if (x.n > 0) out.push(copy({ ...x, n: x.n - 1 }, scale(x.c, x.n)));
    out.push(copy(x, mul(x.c, x.lam)));
  }
  return simplify(out);
}
/**
 * The derivative of the signal as a whole, steps included: where a piece switches on,
 * its jump becomes an impulse (u′(t − T) = δ(t − T)). A plain term has no jump at 0:
 * its value just before 0 is the one the derivative rule subtracts, f(0⁻).
 */
export function diffEP(a) {
  const jumps = [];
  for (const x of a) if (isSwitched(x) && x.n === 0) jumps.push(impulse(x.c, 0, x.on));
  return simplify(derivEP(a).concat(jumps));
}
/** f(0⁻): the value of the plain terms at 0 (switched pieces and impulses are 0 before 0). */
export const valueBefore = (a) => a.reduce((v, x) => (isImpulse(x) || isSwitched(x) ? v : x.n === 0 ? add(v, x.c) : v), C());
/**
 * The running integral ∫ from 0⁻ to t, impulses at 0 included: each piece from where it
 * starts, so the result is switched on there. ∫₀^τ σ^n e^(λσ) dσ is done in closed form.
 */
export function integEP(a) {
  const out = [];
  for (const x of a) {
    const T = startOf(x);
    if (isImpulse(x)) { out.push(x.d ? { ...copy(x), d: x.d - 1 } : { c: x.c, n: 0, lam: ZERO, on: T }); continue; }
    const fact = (k) => { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; };
    if (abs(x.lam) === 0) { out.push({ c: scale(x.c, 1 / (x.n + 1)), n: x.n + 1, lam: ZERO, on: T }); continue; }
    // e^(λτ) Σ_k (−1)^k n!/(n−k)! τ^(n−k) / λ^(k+1)  −  (−1)^n n! / λ^(n+1)
    for (let k = 0; k <= x.n; k++) out.push({ c: scale(mul(x.c, powi(x.lam, -(k + 1))), ((k % 2 ? -1 : 1) * fact(x.n)) / fact(x.n - k)), n: x.n - k, lam: x.lam, on: T });
    out.push({ c: scale(mul(x.c, powi(x.lam, -(x.n + 1))), (x.n % 2 ? 1 : -1) * fact(x.n)), n: 0, lam: ZERO, on: T });
  }
  return simplify(out);
}
/** The value at time t (complex; real signals give a zero imaginary part). Impulses have none. */
export function evalEP(a, t) {
  let re = 0, im = 0;
  for (const x of a) {
    if (isImpulse(x)) continue;
    const tau = t - startOf(x);
    if (isSwitched(x) && tau < -1e-12) continue;
    const m = Math.exp(x.lam.re * tau) * (x.n ? Math.pow(tau, x.n) : 1), ph = x.lam.im * tau;
    const er = m * Math.cos(ph), ei = m * Math.sin(ph);
    re += x.c.re * er - x.c.im * ei;
    im += x.c.re * ei + x.c.im * er;
  }
  return C(re, im);
}
/** The number this is, when it's a constant; otherwise null. */
export function constOf(a) {
  if (!a.length) return C();
  if (a.some((x) => isImpulse(x) || isSwitched(x))) return null;
  if (a.length === 1 && a[0].n === 0 && abs(a[0].lam) === 0) return a[0].c;
  return null;
}
/** { a, b } when this is a·t + b with real a and b; otherwise null. */
export function linearOf(terms) {
  let a = 0, b = 0;
  for (const x of terms) {
    if (isImpulse(x) || isSwitched(x) || abs(x.lam) !== 0 || x.n > 1 || Math.abs(x.c.im) > 1e-12 * Math.max(1, Math.abs(x.c.re))) return null;
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
    const twin = out.find((o) => !isImpulse(o) && o.n === x.n && isSwitched(o) === isSwitched(x) && sameTime(startOf(o), startOf(x)) && o.lam.im < 0 && dist(o.lam, conj(x.lam)) <= 1e-9 * (1 + abs(x.lam)));
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
  const starts = [...new Set(terms.map(startOf))];
  for (const t of [0, 0.37, 1.1, 2.3, ...starts.map((T) => T + 0.41)]) { const v = evalEP(terms, t); worst = Math.max(worst, Math.abs(v.im)); big = Math.max(big, abs(v)); }
  return big ? worst / big : 0;
}

// Operators that need the transform (convolution) are supplied by operators.js, which
// can use the rest of the engine; this file can't import it without a cycle.
const hooks = {};
export const useOperators = (h) => Object.assign(hooks, h);

const real = (z, what) => {
  if (Math.abs(z.im) > 1e-12 * Math.max(1, Math.abs(z.re))) throw new InputError(`${what} has to be a real number.`);
  return z.re;
};
const constant = (v) => (v === 0 ? [] : [term(C(v, 0))]);

/**
 * A syntax tree as a signal in t. Anything that isn't a sum of t^n e^(at) cos/sin(bt)
 * terms, steps switching them on, and impulses, is refused with the reason.
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
      if (b.some(isSwitched)) throw new InputError("Dividing by a step isn't defined: it is zero before it switches on. Multiply by the step instead.");
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
  if (E.some(isSwitched)) throw new InputError("A step can't go in a power. Multiply by it instead, as in e^(-t) u(t - 1).");
  const k = constOf(E), base = constOf(B);
  if (k && Math.abs(k.im) < 1e-12 && Number.isInteger(k.re)) {
    if (k.re >= 0) {
      if (k.re > 24) throw new InputError("That power is too high for this tool (the limit is 24).");
      return powEP(B, k.re);
    }
    if (!B.length) throw new InputError("That divides by zero.");
    if (B.some(isSwitched)) throw new InputError("A negative power of a step isn't defined: the step is zero before it switches on.");
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
  // the operators take whole signals, steps and impulses included
  if (n.fn === "diff" || n.fn === "int" || n.fn === "conv") {
    if (!hooks[n.fn]) throw new InputError(`${n.fn}(…) isn't available here.`);
    return hooks[n.fn](n, ...[n.arg, n.arg2].filter(Boolean).map(signalFromAst));
  }
  const A = signalFromAst(n.arg);
  if (A.some(isImpulse)) throw new InputError(`An impulse can't go inside ${n.fn}(…). It can be multiplied by a number or a function, or added.`);
  if (A.some(isSwitched)) throw new InputError(`A step can't go inside ${n.fn}(…). Multiply by it instead, as in ${n.fn === "u" || n.fn === "delta" ? "sin(t - 1)" : n.fn + "(t - 1)"} u(t - 1).`);
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
    case "u": {
      if (a <= 0) throw new InputError("The unit step has to switch on as time goes forward: use u(t), or u(t - 2) for one that switches on at t = 2.");
      // u(at + b) switches on at t = −b/a; one that switched on before 0 is just 1 from 0 on
      const at = -b / a;
      return at < 0 ? constant(1) : [{ c: ONE, n: 0, lam: ZERO, on: Math.abs(at) < 1e-12 ? 0 : at }];
    }
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

// δ^(k)(a·t + b): the unit impulse at t = −b/a, scaled. δ^(k)(at + b) = δ^(k)(t + b/a) / (a^k |a|).
const MAX_ORDER = 4;
function impulseSignal(n, A) {
  const lin = linearOf(A), name = "delta" + "'".repeat(n.order);
  if (!lin || lin.a === 0) throw new InputError(`What's inside ${name}(…) has to be t, or t minus a time, as in ${name}(t) or ${name}(t - 2).`);
  let at = -lin.b / lin.a;
  if (Math.abs(at) < 1e-12) at = 0;
  if (at < 0) throw new InputError(`That's an impulse at t = ${+at.toPrecision(6)}, before the transform starts at t = 0, so it would count for nothing. Write delta(t) for an impulse at t = 0.`);
  if (n.order > MAX_ORDER) throw new InputError(`That derivative of the impulse is of too high an order: this tool goes up to the ${MAX_ORDER}th, delta${"'".repeat(MAX_ORDER)}(t).`);
  return [impulse(C(1 / (lin.a ** n.order * Math.abs(lin.a)), 0), n.order, at)];
}

/** A typed number such as 1/2 or pi (for initial conditions). */
export function numberFromAst(ast, what = "That") {
  const k = constOf(signalFromAst(ast));
  if (!k) throw new InputError(`${what} has to be a number, not something that changes with time.`);
  return real(k, what);
}
