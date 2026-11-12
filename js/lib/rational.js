// A typed F(s) as a ratio of polynomials. The denominator is kept as the factors that
// were typed, so (s+1)^3 stays a triple root instead of being multiplied out and found
// again numerically. Real polynomials here are plain number arrays, ascending.
import { InputError } from "./parse.js";

const strip = (p) => { let n = p.length; while (n > 1 && p[n - 1] === 0) n--; return p.slice(0, n); };
export function rmul(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return strip(out);
}
function radd(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push((a[i] ?? 0) + (b[i] ?? 0));
  return strip(out);
}
const rscale = (a, k) => strip(a.map((x) => x * k));
function rpow(a, k) { let r = [1]; for (let i = 0; i < k; i++) r = rmul(r, a); return r; }
const same = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= 1e-12 * Math.max(1, Math.abs(x)));

// { k, num, den }: a number times a ratio of products of factors, each factor
// { poly (monic, degree ≥ 1), pow }. Products and powers keep their factors; only a sum
// has to multiply its numerator out.
const rat = (k, num = [], den = []) => ({ k, num, den });
const expand = (fs) => fs.reduce((p, f) => rmul(p, rpow(f.poly, f.pow)), [1]);
function merge(a, b) {
  const out = a.map((f) => ({ ...f }));
  for (const f of b) {
    const hit = out.find((g) => same(g.poly, f.poly));
    if (hit) hit.pow += f.pow; else out.push({ ...f });
  }
  return out;
}
function fromPoly(p, den = []) {
  p = strip(p);
  const lead = p[p.length - 1];
  if (p.length === 1) return rat(lead, [], lead === 0 ? [] : den);
  return rat(lead, [{ poly: rscale(p, 1 / lead), pow: 1 }], den);
}
const mulRat = (a, b) => rat(a.k * b.k, merge(a.num, b.num), merge(a.den, b.den));
function invRat(a) {
  if (a.k === 0) throw new InputError("That divides by zero.");
  return rat(1 / a.k, a.den, a.num);
}
const negRat = (a) => rat(-a.k, a.num, a.den);
// The least common denominator: each factor to the higher of its two powers.
function addRat(a, b) {
  const den = a.den.map((f) => ({ ...f }));
  for (const f of b.den) {
    const hit = den.find((g) => same(g.poly, f.poly));
    if (hit) hit.pow = Math.max(hit.pow, f.pow); else den.push({ ...f });
  }
  const lift = (x) => {
    let n = rscale(expand(x.num), x.k);
    for (const f of den) {
      const have = x.den.find((g) => same(g.poly, f.poly))?.pow ?? 0;
      n = rmul(n, rpow(f.poly, f.pow - have));
    }
    return n;
  };
  return fromPoly(radd(lift(a), lift(b)), den);
}
const constRat = (x) => (x.den.length === 0 && x.num.length === 0 ? x.k : null);
const number = (v) => rat(v);

/** A syntax tree as a rational function of s. */
export function rationalFromAst(n) {
  switch (n.t) {
    case "num": return number(n.v);
    case "var":
      if (n.name === "s") return fromPoly([0, 1]);
      if (n.name === "e") return number(Math.E);
      if (n.name === "pi") return number(Math.PI);
      throw new InputError("t is the time variable, so it can't appear in F(s). Use s here, or switch to the Function f(t) mode.");
    case "y": throw new InputError("y belongs in a differential equation. Here, type the transform itself, such as 1/(s^2 + 4).");
    case "neg": return negRat(rationalFromAst(n.a));
    case "call": {
      const a = rationalFromAst(n.arg), k = constRat(a);
      if (n.fn === "sqrt" && k !== null) {
        if (k < 0) throw new InputError("The square root of a negative number isn't real.");
        return number(Math.sqrt(k));
      }
      if (n.fn === "exp" && k === null) throw new InputError("A delay factor such as exp(-2s) can only multiply the rest of F(s), not sit inside a function or a power.");
      if (k !== null && n.fn !== "u") return number({ exp: Math.exp, sin: Math.sin, cos: Math.cos, sinh: Math.sinh, cosh: Math.cosh }[n.fn](k));
      throw new InputError(`F(s) has to be a ratio of polynomials in s, so ${n.fn}(…) of s can't be part of it.`);
    }
    case "bin": {
      if (n.op === "^") {
        const e = constRat(rationalFromAst(n.b)), base = rationalFromAst(n.a), b = constRat(base);
        if (e === null) {
          if (b !== null) throw new InputError("A delay factor such as e^(-2s) can only multiply the rest of F(s), not sit inside a function or a power.");
          throw new InputError("A power has to be a whole number here, as in (s + 1)^2.");
        }
        if (b !== null) {
          const v = Math.pow(b, e);
          if (!Number.isFinite(v)) throw new InputError("That power doesn't give a real number.");
          return number(v);
        }
        if (!Number.isInteger(e)) throw new InputError("A power of s has to be a whole number: fractional powers aren't ratios of polynomials.");
        if (Math.abs(e) > 24) throw new InputError("That power is too high for this tool (the limit is 24).");
        const pos = e >= 0 ? base : invRat(base);
        let r = number(1);
        for (let i = 0; i < Math.abs(e); i++) r = mulRat(r, pos);
        return r;
      }
      const a = rationalFromAst(n.a), b = rationalFromAst(n.b);
      if (n.op === "+") return addRat(a, b);
      if (n.op === "-") return addRat(a, negRat(b));
      if (n.op === "*") return mulRat(a, b);
      return mulRat(a, invRat(b));
    }
  }
  throw new InputError("I couldn't make sense of that expression.");
}
/** The numerator multiplied out, as a real polynomial (ascending). */
export const numerator = (r) => rscale(expand(r.num), r.k);

// ── transforms with delay factors: Σ e^(−sT) R_T(s) ──
// A list of pieces [{ T, r }], T ≥ 0, each r a rational function as above. e^(−sT) is the
// transform's form of a delay by T (the time-delay rule); e^(+sT) would be an advance,
// which a signal that starts at t = 0 can't have.
const piece = (T, r) => ({ T, r });
const sameT = (a, b) => Math.abs(a - b) <= 1e-12 * (1 + Math.abs(a));
function addPieces(a, b) {
  const out = a.map((p) => piece(p.T, p.r));
  for (const p of b) {
    const i = out.findIndex((o) => sameT(o.T, p.T));
    if (i >= 0) out[i] = piece(out[i].T, addRat(out[i].r, p.r)); else out.push(p);
  }
  return out.filter((p) => p.r.k !== 0);
}
function mulPieces(a, b) {
  let out = [];
  for (const p of a) for (const q of b) out = addPieces(out, [piece(p.T + q.T, mulRat(p.r, q.r))]);
  return out;
}
// The delay a power of e (or of another positive number) stands for: b^(c·s + d) is
// b^d e^(c ln b · s), a delay of −c ln b when that is positive. null when it isn't one.
function delayOf(base, power) {
  const b = constRat(rationalFromAst(base));
  if (b === null || b <= 0) return null;
  const p = rationalFromAst(power);
  if (p.den.length || constRat(p) !== null) return null;
  const poly = numerator(p);
  if (poly.length !== 2) throw new InputError("The power of e can only be a number times s (plus a number), as in e^(-2s). Anything else isn't a delay.");
  const T = -poly[1] * Math.log(b);
  if (T < -1e-12) throw new InputError(`e^(+${+(-T).toPrecision(6)}s) would move the signal earlier, before t = 0, which a signal that starts at t = 0 can't do. A delay is e^(-${+(-T).toPrecision(6)}s), with a minus sign.`);
  return [piece(Math.max(0, T), number(Math.pow(b, poly[0])))];
}
const hasS = (n) => n.t === "var" ? n.name === "s" : n.t === "neg" ? hasS(n.a) : n.t === "call" ? hasS(n.arg) : n.t === "bin" ? hasS(n.a) || hasS(n.b) : false;

/** A syntax tree as Σ e^(−sT) R_T(s): pieces [{ T, r }]. Without delay factors, one piece at T = 0. */
export function delayedFromAst(n) {
  if (n.t === "neg") return delayedFromAst(n.a).map((p) => piece(p.T, negRat(p.r)));
  if (n.t === "call" && n.fn === "exp" && hasS(n.arg)) {
    const d = delayOf({ t: "var", name: "e" }, n.arg);
    if (d) return d;
  }
  if (n.t === "bin" && n.op === "^" && hasS(n.b)) {
    const d = delayOf(n.a, n.b);
    if (d) return d;
  }
  if (n.t === "bin" && n.op !== "^") {
    const a = delayedFromAst(n.a), b = delayedFromAst(n.b);
    if (n.op === "+") return addPieces(a, b);
    if (n.op === "-") return addPieces(a, b.map((p) => piece(p.T, negRat(p.r))));
    if (n.op === "*") return mulPieces(a, b);
    if (b.length !== 1 || b[0].T !== 0) {
      throw new InputError(b.length === 1
        ? "Dividing by a delay factor, e^(-Ts), would be an advance: the signal would have to start before t = 0. Multiply by the delay factor instead."
        : "Dividing by a sum that contains a delay factor doesn't give a signal this tool can invert. Delay factors can only multiply.");
    }
    return a.map((p) => piece(p.T, mulRat(p.r, invRat(b[0].r))));
  }
  if (n.t === "bin" && n.op === "^") {
    const base = delayedFromAst(n.a);
    if (base.length === 1 && base[0].T === 0) return [piece(0, rationalFromAst(n))];
    const e = constRat(rationalFromAst(n.b));
    if (e === null || !Number.isInteger(e) || e < 0) throw new InputError("A delay factor can only be raised to a whole, positive power.");
    let r = [piece(0, number(1))];
    for (let i = 0; i < e; i++) r = mulPieces(r, base);
    return r;
  }
  return [piece(0, rationalFromAst(n))];
}
