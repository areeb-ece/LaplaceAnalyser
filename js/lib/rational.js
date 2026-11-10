// A typed F(s) as a ratio of polynomials. The denominator is kept as the factors that
// were typed, so (s+1)^3 stays a triple root instead of being multiplied out and found
// again numerically. Real polynomials here are plain number arrays, ascending.
import { InputError } from "./parse.js";

const strip = (p) => { let n = p.length; while (n > 1 && p[n - 1] === 0) n--; return p.slice(0, n); };
const isZero = (p) => p.length === 1 && p[0] === 0;
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

// { num, den: [{ poly (monic, degree ≥ 1), pow }] }
const rat = (num, den = []) => ({ num: strip(num), den });
const expand = (den) => den.reduce((p, f) => rmul(p, rpow(f.poly, f.pow)), [1]);
function withFactor(den, poly, pow) {
  const out = den.map((f) => ({ ...f }));
  const hit = out.find((f) => same(f.poly, poly));
  if (hit) hit.pow += pow; else out.push({ poly, pow });
  return out;
}
function mulRat(a, b) {
  let den = a.den;
  for (const f of b.den) den = withFactor(den, f.poly, f.pow);
  return rat(rmul(a.num, b.num), den);
}
function invRat(a) {
  if (isZero(a.num)) throw new InputError("That divides by zero.");
  const lead = a.num[a.num.length - 1];
  const num = rscale(expand(a.den), 1 / lead);
  return a.num.length === 1 ? rat(num) : rat(num, [{ poly: rscale(a.num, 1 / lead), pow: 1 }]);
}
// The least common denominator: each factor to the higher of its two powers.
function addRat(a, b) {
  let den = a.den.map((f) => ({ ...f }));
  for (const f of b.den) {
    const hit = den.find((g) => same(g.poly, f.poly));
    if (hit) hit.pow = Math.max(hit.pow, f.pow); else den.push({ ...f });
  }
  const lift = (x) => {
    let n = x.num;
    for (const f of den) {
      const have = x.den.find((g) => same(g.poly, f.poly))?.pow ?? 0;
      n = rmul(n, rpow(f.poly, f.pow - have));
    }
    return n;
  };
  return rat(radd(lift(a), lift(b)), den);
}
const constRat = (x) => (x.den.length === 0 && x.num.length === 1 ? x.num[0] : null);

/** A syntax tree as a rational function of s. */
export function rationalFromAst(n) {
  switch (n.t) {
    case "num": return rat([n.v]);
    case "var":
      if (n.name === "s") return rat([0, 1]);
      if (n.name === "e") return rat([Math.E]);
      if (n.name === "pi") return rat([Math.PI]);
      throw new InputError("t is the time variable, so it can't appear in F(s). Use s here, or switch to the Function f(t) mode.");
    case "y": throw new InputError("y belongs in a differential equation. Here, type the transform itself, such as 1/(s^2 + 4).");
    case "neg": { const a = rationalFromAst(n.a); return rat(rscale(a.num, -1), a.den); }
    case "call": {
      const a = rationalFromAst(n.arg), k = constRat(a);
      if (n.fn === "sqrt" && k !== null) {
        if (k < 0) throw new InputError("The square root of a negative number isn't real.");
        return rat([Math.sqrt(k)]);
      }
      if (n.fn === "exp" && k === null) throw new InputError("A delay factor such as exp(-2s) isn't supported yet: F(s) has to be a ratio of polynomials in s.");
      if (k !== null && n.fn !== "u") return rat([{ exp: Math.exp, sin: Math.sin, cos: Math.cos, sinh: Math.sinh, cosh: Math.cosh }[n.fn](k)]);
      throw new InputError(`F(s) has to be a ratio of polynomials in s, so ${n.fn}(…) of s can't be part of it.`);
    }
    case "bin": {
      if (n.op === "^") {
        const e = constRat(rationalFromAst(n.b)), base = rationalFromAst(n.a), b = constRat(base);
        if (e === null) {
          if (b !== null) throw new InputError("A delay factor such as e^(-2s) isn't supported yet: F(s) has to be a ratio of polynomials in s.");
          throw new InputError("A power has to be a whole number here, as in (s + 1)^2.");
        }
        if (b !== null) {
          const v = Math.pow(b, e);
          if (!Number.isFinite(v)) throw new InputError("That power doesn't give a real number.");
          return rat([v]);
        }
        if (!Number.isInteger(e)) throw new InputError("A power of s has to be a whole number: fractional powers aren't ratios of polynomials.");
        if (Math.abs(e) > 24) throw new InputError("That power is too high for this tool (the limit is 24).");
        const pos = e >= 0 ? base : invRat(base);
        let r = rat([1]);
        for (let i = 0; i < Math.abs(e); i++) r = mulRat(r, pos);
        return r;
      }
      const a = rationalFromAst(n.a), b = rationalFromAst(n.b);
      if (n.op === "+") return addRat(a, b);
      if (n.op === "-") return addRat(a, rat(rscale(b.num, -1), b.den));
      if (n.op === "*") return mulRat(a, b);
      return mulRat(a, invRat(b));
    }
  }
  throw new InputError("I couldn't make sense of that expression.");
}
export { expand };
