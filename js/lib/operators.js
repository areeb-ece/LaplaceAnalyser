// The transform's properties as things you can type, each worked out the way the rule
// says and recorded as a step that names the rule:
//   diff(f)     the derivative            L{f′} = s F(s) − f(0⁻)
//   int(f)      the running integral      L{∫₀ᵗ f(τ) dτ} = F(s) / s
//   conv(f, g)  the convolution           L{f * g} = F(s) G(s)
// The derivative and the integral are done in time (expoly.js) and only described here;
// the convolution is done by multiplying the transforms and inverting the product.
import { abs } from "./complex.js";
import { toReal } from "./poly.js";
import { useOperators, diffEP, integEP, valueBefore, makeReal, impulse } from "./expoly.js";
import { groupsOf, transformTerms, mulTransform, inverseOf } from "./laplace.js";
import * as T from "./tex.js";

/** The steps recorded while the last function was read; analyse.js empties it first. */
export const notes = [];

// A signal's transform, Σ e^(−sT) F_T(s), as TeX: one fraction per start time.
function transformTex(signal) {
  if (!signal.length) return "0";
  return T.delayedTex(groupsOf(signal).map((g) => {
    const F = transformTerms(g.terms);
    return { T: g.T, num: realOf(F.num), lead: F.lead, poles: F.poles };
  }));
}
const realOf = (p) => { try { return toReal(p); } catch { return p.map((z) => z.re); } };
// s times a transform: brackets unless it is a plain number or a single symbol
const wrap = (tex) => (/^-?[\d.]+$|^[a-z]$/.test(tex) ? `\\cdot ${tex}` : `\\left(${tex}\\right)`);
// F(s)/s: a fraction gets 1/s in front, anything simpler goes over s
const over = (tex) => (tex.includes("\\frac") ? `\\frac{1}{s}\\left(${tex}\\right)` : `\\frac{${tex}}{s}`);
const given = (name, cap, arg, signal) => `${name}(t) &= ${T.astTex(arg)}, & ${cap}(s) &= ${transformTex(signal)}`;

useOperators({
  diff(n, f) {
    const out = makeReal(diffEP(f)), v = valueBefore(f).re;
    notes.push({
      title: "The derivative rule",
      tex: `\\begin{aligned}${given("f", "F", n.arg, f)}\\\\ \\mathcal{L}\\{f'\\} &= s\\,F(s) - f(0^-) = s${wrap(transformTex(f))} - ${T.num(v).replace(/^-/, "(-") + (v < 0 ? ")" : "")} = ${transformTex(out)}\\end{aligned}`,
    });
    return out;
  },
  int(n, f) {
    const out = makeReal(integEP(f));
    notes.push({
      title: "The integral rule",
      tex: `\\begin{aligned}${given("f", "F", n.arg, f)}\\\\ \\mathcal{L}\\left\\{\\int_{0^-}^{t} f(\\tau)\\,d\\tau\\right\\} &= \\frac{F(s)}{s} = ${over(transformTex(f))} = ${transformTex(out)}\\end{aligned}`,
    });
    return out;
  },
  conv(n, f, g) {
    // H(s) = F(s) G(s), piece by piece: a piece of f starting at T₁ and one of g at T₂
    // give one starting at T₁ + T₂. Each product is inverted back to time.
    const out = [];
    for (const a of groupsOf(f)) for (const b of groupsOf(g)) {
      const H = mulTransform(transformTerms(a.terms), transformTerms(b.terms)), at = a.T + b.T;
      const back = inverseOf(H);
      back.imp.forEach((c, k) => { if (abs(c) > 0) out.push(impulse(c, k, at)); });
      for (const x of back.terms) out.push({ c: x.c, n: x.n, lam: x.lam, on: at });
    }
    const h = makeReal(out);
    notes.push({
      title: "The convolution rule",
      tex: `\\begin{aligned}${given("f", "F", n.arg, f)}\\\\ ${given("g", "G", n.arg2, g)}\\\\ \\mathcal{L}\\{f * g\\} &= F(s)\\,G(s) = ${transformTex(h)}\\end{aligned}`,
    });
    return h;
  },
});
