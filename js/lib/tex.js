// Engine results as TeX (for KaTeX) and as plain text (for canvas labels and readouts).
// Numbers print the way a textbook would write them when they are simple fractions or
// surds, and to four significant figures otherwise.
import { abs, conj, mul } from "./complex.js";

// The fraction p/q with q ≤ maxDen that x is (to 1e-10), by continued fractions.
function asFraction(x, maxDen) {
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
  for (let i = 0; i < 24; i++) {
    const a = Math.floor(b), h = a * h1 + h0, k = a * k1 + k0;
    if (k > maxDen || h > 1e7) return null;
    [h0, h1, k0, k1] = [h1, h, k1, k];
    if (Math.abs(x - h / k) <= 1e-10 * Math.max(1, x)) return [h, k];
    const f = b - a;
    if (f < 1e-13) return null;
    b = 1 / f;
  }
  return null;
}
const frac = (top, q) => (q === 1 ? top : `\\tfrac{${top}}{${q}}`);

/** |x| as TeX. */
export function mag(x) {
  x = Math.abs(x);
  if (x === 0) return "0";
  const f = asFraction(x, 99);
  if (f) return frac(String(f[0]), f[1]);
  for (const n of [2, 3, 5, 6, 7, 10]) {
    const g = asFraction(x / Math.sqrt(n), 12);
    if (g && g[0] <= 24) return frac(`${g[0] === 1 ? "" : g[0]}\\sqrt{${n}}`, g[1]);
  }
  const g = asFraction(x / Math.PI, 12);
  if (g && g[0] <= 24) return frac(`${g[0] === 1 ? "" : g[0]}\\pi`, g[1]);
  if (x >= 1e5 || x < 1e-3) {
    const e = Math.floor(Math.log10(x)), m = Number((x / 10 ** e).toPrecision(3));
    return `${m === 1 ? "" : m + "\\times"}10^{${e}}`;
  }
  return String(Number(x.toPrecision(4)));
}
/** A signed real number as TeX. */
export const num = (x) => (x < 0 ? "-" : "") + mag(x);

/** A complex number as TeX. */
export function cplx(z) {
  const tol = 1e-10 * Math.max(1, abs(z));
  if (Math.abs(z.im) <= tol) return num(z.re);
  const im = (mag(z.im) === "1" ? "" : mag(z.im)) + "i";
  if (Math.abs(z.re) <= tol) return (z.im < 0 ? "-" : "") + im;
  return `${num(z.re)} ${z.im < 0 ? "-" : "+"} ${im}`;
}

// Σ k · body, with the signs and the invisible 1s handled. parts: [{ k, body }]
function sum(parts) {
  const big = parts.reduce((m, p) => Math.max(m, Math.abs(p.k)), 0);
  const kept = parts.filter((p) => Math.abs(p.k) > 1e-10 * big && p.k !== 0);
  if (!kept.length) return "0";
  return kept.map((p, i) => {
    const m = mag(p.k);
    const piece = !p.body ? m : m === "1" ? p.body : m + (/^\d/.test(p.body) ? "\\cdot " : /\d$/.test(m) ? "" : "\\,") + p.body;
    return (i === 0 ? (p.k < 0 ? "-" : "") : p.k < 0 ? " - " : " + ") + piece;
  }).join("");
}

/** A real polynomial (ascending) in v, highest power first. */
export function polyTex(coefs, v = "s") {
  const parts = [];
  for (let k = coefs.length - 1; k >= 0; k--) parts.push({ k: coefs[k], body: k === 0 ? "" : k === 1 ? v : `${v}^{${k}}` });
  return sum(parts);
}

const tPower = (n) => (n === 0 ? "" : n === 1 ? "t" : `t^{${n}}`);
const kt = (k) => (mag(k) === "1" ? "" : mag(k)) + "t";
const expo = (sigma) => (sigma === 0 ? "" : `e^{${sigma < 0 ? "-" : ""}${kt(sigma)}}`);

/** A real signal (a list of terms) as a sum of t^n e^(σt) cos(ωt) and sin(ωt). */
export function timeTex(terms) {
  const parts = [];
  for (const x of terms) {
    if (x.lam.im < 0) continue; // counted with its conjugate
    const head = [tPower(x.n), expo(x.lam.re)].filter(Boolean).join("\\,");
    if (x.lam.im === 0) { parts.push({ k: x.c.re, body: head }); continue; }
    const w = kt(x.lam.im), join = head ? head + "\\," : "";
    parts.push({ k: 2 * x.c.re, body: `${join}\\cos(${w})` });
    parts.push({ k: -2 * x.c.im, body: `${join}\\sin(${w})` });
  }
  return sum(parts);
}

// The factors of a denominator given by its roots: real roots as (s − p), conjugate
// pairs as one real quadratic. j overrides the power (for partial fractions).
function factors(poles) {
  const out = [];
  for (const p of poles) {
    if (p.s.im < 0) continue;
    if (p.s.im === 0 && p.s.re === 0) out.unshift({ inner: "s", atom: true, pow: p.mult });
    else if (p.s.im === 0) out.push({ inner: `s ${p.s.re < 0 ? "+" : "-"} ${mag(p.s.re)}`, pow: p.mult });
    else out.push({ inner: polyTex([p.s.re * p.s.re + p.s.im * p.s.im, -2 * p.s.re, 1]), pow: p.mult });
  }
  return out;
}
function product(fs) {
  if (!fs.length) return "1";
  const alone = fs.length === 1 && fs[0].pow === 1;
  return fs.map((f) => (f.atom || alone ? f.inner : `(${f.inner})`) + (f.pow > 1 ? `^{${f.pow}}` : "")).join("");
}
/** Π (s − p)^m with real factors. */
export const denTex = (poles) => product(factors(poles));

/** num / (lead · Π (s − p)^m) as one fraction; num is real, ascending. */
export function fractionTex(numReal, lead, poles) {
  const top = polyTex(numReal.map((x) => x / lead));
  return poles.length ? `\\frac{${top}}{${denTex(poles)}}` : top;
}

/** Partial fractions, with each conjugate pair of simple terms combined into a real one. */
export function fractionsTex(poles) {
  const big = Math.max(...poles.flatMap((p) => p.res.map(abs)), 0);
  const pieces = [];
  for (const p of poles) {
    if (p.s.im < 0) continue;
    p.res.forEach((A, j) => {
      if (abs(A) <= 1e-10 * big) return;
      const den = product(factors([{ s: p.s, mult: j + 1 }]));
      if (p.s.im === 0) { pieces.push({ neg: A.re < 0, tex: `\\frac{${mag(A.re)}}{${den}}` }); return; }
      if (j === 0) {
        // A/(s − p) + Ā/(s − p̄) = (2Re(A) s − 2Re(A p̄)) / (s² − 2σs + |p|²)
        let top = [-2 * mul(A, conj(p.s)).re, 2 * A.re];
        const lead = Math.abs(top[1]) > 1e-10 * big ? top[1] : top[0];
        if (lead < 0) top = top.map((v) => -v);
        pieces.push({ neg: lead < 0, tex: `\\frac{${polyTex(top)}}{${den}}` });
        return;
      }
      // repeated complex poles: left as the conjugate pair they are
      const away = (s) => (s.re === 0 ? `s ${s.im < 0 ? "+" : "-"} ${cplx({ re: 0, im: Math.abs(s.im) })}` : `s - (${cplx(s)})`);
      const one = (a, s) => `\\frac{${cplx(a)}}{(${away(s)})^{${j + 1}}}`;
      pieces.push({ neg: false, tex: `${one(A, p.s)} + ${one(conj(A), conj(p.s))}` });
    });
  }
  if (!pieces.length) return "0";
  return pieces.map((x, i) => (i === 0 ? (x.neg ? "-" : "") : x.neg ? " - " : " + ") + x.tex).join("");
}

const yTex = (k, arg = "") => (k <= 3 ? "y" + "'".repeat(k) : `y^{(${k})}`) + arg;

/** Σ a_k y^(k) = g(t). */
export function odeTex(coefs, forcing) {
  const parts = [];
  for (let k = coefs.length - 1; k >= 0; k--) parts.push({ k: coefs[k], body: yTex(k) });
  return `${sum(parts)} = ${timeTex(forcing)}`;
}
/** y(0) = …, y'(0) = …. */
export const icsTex = (ics) => ics.map((v, k) => `${yTex(k, "(0)")} = ${num(v)}`).join(",\\quad ");

/**
 * The equation after transforming both sides, with the initial values written in:
 * each a_k y^(k) becomes a_k [ s^k Y(s) − (the initial-value polynomial) ].
 */
export function transformedTex(coefs, ics, rhsTex) {
  const pieces = [];
  for (let k = coefs.length - 1; k >= 0; k--) {
    const a = coefs[k];
    if (Math.abs(a) < 1e-14) continue;
    const init = [];
    for (let j = 0; j < k; j++) init[k - 1 - j] = ics[j] ?? 0;
    const sY = (k === 0 ? "" : k === 1 ? "s" : `s^{${k}}`) + "Y(s)";
    const has = init.some((v) => v !== 0);
    const initTex = has ? polyTex(init) : "";
    const inner = !has ? sY : `${sY} - ${init.filter((v) => v !== 0).length > 1 || /^-/.test(initTex) ? `\\left(${initTex}\\right)` : initTex}`;
    const m = mag(a), body = m === "1" ? (has && pieces.length ? `\\left[${inner}\\right]` : inner) : `${m}${has ? `\\left[${inner}\\right]` : inner}`;
    pieces.push((pieces.length ? (a < 0 ? " - " : " + ") : a < 0 ? "-" : "") + body);
  }
  return `${pieces.join("")} = ${rhsTex}`;
}

// ── what was typed, set as maths (the preview under the input box) ──
const NAMES = { e: "e", pi: "\\pi", t: "t", s: "s" };
const isSum = (n) => n.t === "bin" && (n.op === "+" || n.op === "-");
const wrap = (n, on) => (on ? `\\left(${astTex(n)}\\right)` : astTex(n));
export function astTex(n) {
  switch (n.t) {
    case "num": return String(n.v).replace(/e([+-]?\d+)/, "\\times10^{$1}");
    case "var": return NAMES[n.name];
    case "y": return yTex(n.order);
    case "neg": return "-" + wrap(n.a, isSum(n.a));
    case "call":
      if (n.fn === "sqrt") return `\\sqrt{${astTex(n.arg)}}`;
      if (n.fn === "exp") return `e^{${astTex(n.arg)}}`;
      if (n.fn === "u") return `u(${astTex(n.arg)})`;
      return `\\${n.fn}\\left(${astTex(n.arg)}\\right)`;
    case "bin": {
      const { a, b } = n;
      if (n.op === "+") return `${astTex(a)} + ${astTex(b)}`;
      if (n.op === "-") return `${astTex(a)} - ${wrap(b, isSum(b))}`;
      if (n.op === "/") return `\\frac{${astTex(a)}}{${astTex(b)}}`;
      if (n.op === "^") {
        const simple = a.t === "num" || a.t === "var" || a.t === "y";
        return `${simple ? astTex(a) : `\\left(${astTex(a)}\\right)`}^{${astTex(b)}}`;
      }
      if (a.t === "neg" && !a.paren) return "-" + astTex({ t: "bin", op: "*", a: a.a, b });
      const left = wrap(a, isSum(a) || a.t === "neg"), right = wrap(b, isSum(b) || b.t === "neg");
      const digits = /^[\d.]/.test(right) || (b.t === "bin" && b.op === "^" && b.a.t === "num");
      const tight = a.t === "num" && !digits && (b.t === "var" || b.t === "y" || b.t === "call" || (b.t === "bin" && b.op === "^"));
      return left + (digits ? " \\cdot " : tight ? "" : "\\,") + right;
    }
  }
  return "";
}

// ── plain text ──
/** A number to a few significant figures, without an exponent where one isn't needed. */
export function fmt(x, sig = 3) {
  if (!Number.isFinite(x)) return x > 0 ? "∞" : x < 0 ? "−∞" : "?";
  if (Math.abs(x) < 1e-12) return "0";
  const a = Math.abs(x);
  const s = a >= 1e5 || a < 1e-3 ? x.toExponential(sig - 1).replace("e", "×10^").replace("+", "") : String(Number(x.toPrecision(sig)));
  return s.replace("-", "−");
}
/** A complex number with fixed decimals, like the probe label: 0.06 + 0.78i. */
export function fmtComplex(z, places = 2) {
  const r = z.re.toFixed(places).replace("-", "−"), i = Math.abs(z.im).toFixed(places);
  return `${/^−?0\.?0*$/.test(r) ? r.replace("−", "") : r} ${z.im < 0 ? "−" : "+"} ${i}i`;
}

// ── numbers as TeX, for labels that change as something is dragged ──
/** A number to a few significant figures. */
export function texNum(x, sig = 3) {
  if (!Number.isFinite(x)) return x > 0 ? "\\infty" : x < 0 ? "-\\infty" : "?";
  if (Math.abs(x) < 1e-12) return "0";
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) {
    const e = Math.floor(Math.log10(a)), mant = Number((x / 10 ** e).toPrecision(sig));
    return `${mant}\\times10^{${e}}`;
  }
  return String(Number(x.toPrecision(sig)));
}
/** A complex number with fixed decimals: 0.06 + 0.78i. */
export function texComplex(z, places = 2) {
  const re = z.re.toFixed(places), im = Math.abs(z.im).toFixed(places);
  return `${/^-0\.?0*$/.test(re) ? re.slice(1) : re} ${z.im < 0 ? "-" : "+"} ${im}i`;
}
