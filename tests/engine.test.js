// The maths, checked against textbook results. Tolerance is 1e-6 throughout.
import test from "node:test";
import assert from "node:assert/strict";
import { C, abs, sub, div, mul, add, dist } from "../js/lib/complex.js";
import { analyse, evalSignal, evalTransformAt } from "../js/lib/analyse.js";
import { derivEP, evalEP } from "../js/lib/expoly.js";
import { distinctRoots } from "../js/lib/roots.js";
import { fromReal } from "../js/lib/poly.js";
import { integralPath, convergence, horizon } from "../js/lib/integrate.js";
import { PRESETS } from "../js/lib/presets.js";

const TOL = 1e-6;
const S = [C(1.3, 0.7), C(2.1, -3.4), C(0.6, 5.2), C(4, 0)];
const TIMES = [0, 0.1, 0.5, 1, 2.3, 4, 7.5];
const close = (a, b, what) => assert.ok(Math.abs(a - b) <= TOL * Math.max(1, Math.abs(b)), `${what}: got ${a}, expected ${b}`);
const closeC = (a, b, what) => assert.ok(dist(a, b) <= TOL * Math.max(1, abs(b)), `${what}: got ${a.re}+${a.im}i, expected ${b.re}+${b.im}i`);
const good = (input) => { const m = analyse(input); assert.ok(m.ok, m.message); return m; };
const one = C(1, 0), sq = (z) => mul(z, z), cube = (z) => mul(z, sq(z));
const plus = (z, k) => add(z, C(k, 0));

// f(t) → F(s): at least 15 pairs.
const PAIRS = [
  ["1", (s) => div(one, s)],
  ["u(t)", (s) => div(one, s)],
  ["t", (s) => div(one, sq(s))],
  ["t^3", (s) => div(C(6, 0), sq(sq(s)))],
  ["e^(-2t)", (s) => div(one, plus(s, 2))],
  ["t e^(-3t)", (s) => div(one, sq(plus(s, 3)))],
  ["t^2 e^(-t)", (s) => div(C(2, 0), cube(plus(s, 1)))],
  ["sin(2t)", (s) => div(C(2, 0), plus(sq(s), 4))],
  ["cos(3t)", (s) => div(s, plus(sq(s), 9))],
  ["e^(-t) sin(2t)", (s) => div(C(2, 0), plus(sq(plus(s, 1)), 4))],
  ["e^(-2t) cos(5t)", (s) => div(plus(s, 2), plus(sq(plus(s, 2)), 25))],
  ["t sin(t)", (s) => div(mul(C(2, 0), s), sq(plus(sq(s), 1)))],
  ["t cos(2t)", (s) => div(plus(sq(s), -4), sq(plus(sq(s), 4)))],
  ["sinh(2t)", (s) => div(C(2, 0), plus(sq(s), -4))],
  ["cosh(t)", (s) => div(s, plus(sq(s), -1))],
  ["sin(t)^2", (s) => div(C(2, 0), mul(s, plus(sq(s), 4)))],
  ["sin(t)cos(t)", (s) => div(one, plus(sq(s), 4))],
  ["3 - 2e^(-t) + t/2", (s) => add(sub(div(C(3, 0), s), div(C(2, 0), plus(s, 1))), div(C(0.5, 0), sq(s)))],
  ["cos(2t + pi/3)", (s) => div(sub(mul(s, C(0.5, 0)), C(Math.sqrt(3), 0)), plus(sq(s), 4))],
  ["exp(-t)*(1 - t)^2", (s) => add(sub(div(one, plus(s, 1)), div(C(2, 0), sq(plus(s, 1)))), div(C(2, 0), cube(plus(s, 1))))],
  ["2^t", (s) => div(one, plus(s, -Math.log(2)))],
  // impulses at t = 0: L{δ^(k)} = s^k, and a product with a function sifts it
  ["delta(t)", () => one],
  ["delta'(t)", (s) => s],
  ["2delta(t) + e^(-t)", (s) => add(C(2, 0), div(one, plus(s, 1)))],
  ["e^(3t) delta'(t)", (s) => plus(s, -3)],
  ["t delta''(t)", (s) => mul(C(-2, 0), s)],
  ["delta(2t) - delta''(t)", (s) => sub(C(0.5, 0), sq(s))],
];
for (const [fn, F] of PAIRS) {
  test(`transform of ${fn}`, () => {
    const m = good({ mode: "function", fn });
    for (const s of S.map((z) => add(z, C(Math.max(0, Number.isFinite(m.roc) ? m.roc : 0), 0)))) closeC(evalTransformAt(m, s), F(s), `F(${s.re}+${s.im}i)`);
  });
}

// F(s) → f(t).
const INVERSES = [
  ["1/(s(s+1))", (t) => 1 - Math.exp(-t)],
  ["(s+3)/(s^2+2s+5)", (t) => Math.exp(-t) * (Math.cos(2 * t) + Math.sin(2 * t))],
  ["1/(s+1)^3", (t) => (t * t * Math.exp(-t)) / 2],
  ["1/(s^2+1)^2", (t) => (Math.sin(t) - t * Math.cos(t)) / 2],
  ["1/(s^3+3s^2+3s+1)", (t) => (t * t * Math.exp(-t)) / 2], // a triple root, typed multiplied out
  ["(s+1)/((s+1)(s+2))", (t) => Math.exp(-2 * t)], // a cancelling factor
  ["1/(s+1) + 2/(s+1)", (t) => 3 * Math.exp(-t)],
  ["s/((s+1)(s+2)(s+3))", (t) => -0.5 * Math.exp(-t) + 2 * Math.exp(-2 * t) - 1.5 * Math.exp(-3 * t)],
  ["1/s^2 - 1/(s^2+4)", (t) => t - Math.sin(2 * t) / 2],
  ["10/(s^4 + 5s^2 + 4)", (t) => (10 / 3) * (Math.sin(t) - Math.sin(2 * t) / 2)],
];
for (const [rational, f] of INVERSES) {
  test(`inverse of ${rational}`, () => {
    const m = good({ mode: "rational", rational });
    for (const t of TIMES) close(evalSignal(m, t), f(t), `f(${t})`);
  });
}

// ODEs with known closed forms.
const ODES = [
  ["y' + 2y = 0", ["3"], (t) => 3 * Math.exp(-2 * t)],
  ["y'' + 3y' + 2y = 0", ["1", "0"], (t) => 2 * Math.exp(-t) - Math.exp(-2 * t)],
  ["y'' + 4y = 0", ["0", "2"], (t) => Math.sin(2 * t)],
  ["y'' + 2y' + 5y = 0", ["1", "-1"], (t) => Math.exp(-t) * Math.cos(2 * t)],
  ["y'' + 4y = cos(2t)", ["0", "0"], (t) => (t * Math.sin(2 * t)) / 4], // resonance
  ["y'' + 2y' + y = e^(-t)", ["0", "0"], (t) => (t * t * Math.exp(-t)) / 2], // triple pole
  ["0.5y' + y = 1", ["0"], (t) => 1 - Math.exp(-2 * t)],
  ["y''' + 6y'' + 11y' + 6y = 6", ["0", "0", "0"], (t) => 1 - 3 * Math.exp(-t) + 3 * Math.exp(-2 * t) - Math.exp(-3 * t)],
  ["y'''' - y = 0", ["1", "0", "0", "0"], (t) => (Math.cosh(t) + Math.cos(t)) / 2],
  ["y'' + y = t", ["0", "0"], (t) => t - Math.sin(t)],
  ["y'' - 3y' + 2y = e^(3t)", ["1", "0"], (t) => 2.5 * Math.exp(t) - 2 * Math.exp(2 * t) + 0.5 * Math.exp(3 * t)],
  ["d^2y/dt^2 + 2 dy/dt + 10y = 10", ["0", "0"], (t) => 1 - Math.exp(-t) * (Math.cos(3 * t) + Math.sin(3 * t) / 3)],
  ["y^(4) + 2y'' + y = 0", ["0", "1", "0", "0"], (t) => (3 * Math.sin(t) - t * Math.cos(t)) / 2], // repeated complex roots
  ["2y'' = 6 - 8y", ["0", "0"], (t) => 0.75 * (1 - Math.cos(2 * t))], // terms on both sides
];
for (const [ode, ics, y] of ODES) {
  test(`solve ${ode}`, () => {
    const m = good({ mode: "ode", ode, ics });
    for (const t of TIMES) close(evalSignal(m, t), y(t), `y(${t})`);
    // and the solution satisfies the starting values
    let d = m.terms;
    for (let k = 0; k < m.order; k++) { close(evalEP(d, 0).re, m.ics[k], `y^(${k})(0)`); d = derivEP(d); }
  });
}

// F(s) with a polynomial part → impulses at t = 0, then the rest.
for (const [rational, imp, f] of [
  ["s/(s+1)", [1], (t) => -Math.exp(-t)],
  ["s^2/(s+1)", [-1, 1], (t) => Math.exp(-t)],
  ["(s+1)/(s+10)", [1], (t) => -9 * Math.exp(-10 * t)],
  ["(s^3+2)/((s+1)(s^2+4))", [1], (t) => -1.2 * Math.cos(2 * t) - 1.4 * Math.sin(2 * t) + 0.2 * Math.exp(-t)],
  ["2s + 1", [1, 2], () => 0],
  ["3", [3], () => 0],
]) {
  test(`inverse of ${rational}: impulses ${imp.join(", ")}`, () => {
    const m = good({ mode: "rational", rational });
    assert.equal(m.imp.length, imp.length);
    m.imp.forEach((d, k) => close(d, imp[k], `δ^(${k})`));
    for (const t of TIMES.filter((t) => t > 0)) close(evalSignal(m, t), f(t), `f(${t})`);
  });
}

test("an impulse on the right of an equation: starting values at 0⁻, a jump at 0⁺", () => {
  // a blow to a mass at rest: the velocity jumps to 1, the position doesn't
  const m = good({ mode: "ode", ode: "y'' + 0.4y' + 4y = delta(t)", ics: ["0", "0"] });
  assert.deepEqual(m.imp, []);
  close(evalEP(m.terms, 0).re, 0, "y(0⁺)");
  close(evalEP(derivEP(m.terms), 0).re, 1, "y'(0⁺)");
  const ds = [m.terms, derivEP(m.terms), derivEP(derivEP(m.terms))];
  for (const t of TIMES.filter((t) => t > 0)) close(ds[2].length && evalEP(ds[2], t).re + 0.4 * evalEP(ds[1], t).re + 4 * evalEP(ds[0], t).re, 0, `residual at ${t}`);
  assert.match(m.steps[0].tex, /y\(0\^-\) = 0/);
  // a bolus: the level jumps to the dose
  close(evalEP(good({ mode: "ode", ode: "y' + 0.2y = 5delta(t)", ics: ["0"] }).terms, 0).re, 5, "y(0⁺)");
  // the solution itself can hold an impulse
  const d = good({ mode: "ode", ode: "y' + y = delta'(t)", ics: ["0"] });
  assert.deepEqual(d.imp, [1]);
  close(evalSignal(d, 1), -Math.exp(-1), "y(1)");
});

test("impulses alone have no poles, and their integral converges everywhere", () => {
  const m = good({ mode: "function", fn: "delta(t) + 2delta'(t)" });
  assert.equal(m.poles.length, 0);
  assert.equal(m.roc, -Infinity);
  for (const s of [C(-100, 3), C(0, 0), C(5, -2)]) {
    assert.equal(convergence(m, s), "converges");
    const path = integralPath(m, s, horizon(m, s, m.tWindow));
    closeC(C(path.ir[path.n], path.ii[path.n]), add(one, mul(C(2, 0), s)), `the integral at ${s.re}+${s.im}i`);
  }
  assert.match(m.steps[0].tex, /\\delta\(t\) \+ 2\\delta'\(t\)/);
  assert.equal(m.steps.at(-1).tex, "F(s) = 2s + 1");
});

test("the solution of an ODE satisfies the equation", () => {
  const m = good({ mode: "ode", ode: "y''' + 2y'' + 5y' + 3y = e^(-t) sin(2t) + 4", ics: ["1", "-2", "0.5"] });
  const forcing = (t) => Math.exp(-t) * Math.sin(2 * t) + 4;
  const ds = [m.terms];
  for (let k = 1; k <= 3; k++) ds.push(derivEP(ds[k - 1]));
  for (const t of TIMES) {
    const lhs = m.coefs.reduce((sum, a, k) => sum + a * evalEP(ds[k], t).re, 0);
    close(lhs, forcing(t), `residual at ${t}`);
  }
});

test("cos(t): poles at ±i, a zero at 0, converging right of the imaginary axis", () => {
  const m = good({ mode: "function", fn: "cos(t)" });
  assert.deepEqual(m.poles.map((p) => [p.s.re, p.s.im, p.mult]), [[0, 1, 1], [0, -1, 1]]);
  assert.deepEqual(m.zeros.map((z) => [z.s.re, z.s.im, z.mult]), [[0, 0, 1]]);
  assert.equal(m.roc, 0);
  m.poles.forEach((p) => closeC(p.res[0], C(0.5, 0), "residue"));
});

test("repeated roots are found as one root, close ones stay apart", () => {
  const triple = distinctRoots(fromReal([1, 3, 3, 1]));
  assert.equal(triple.length, 1);
  assert.equal(triple[0].mult, 3);
  close(triple[0].s.re, -1, "triple root");
  const pair = distinctRoots(fromReal([1.001, 2.001, 1])); // (s+1)(s+1.001)
  assert.deepEqual(pair.map((r) => r.mult), [1, 1]);
  const mixed = distinctRoots(fromReal([4, 4, 5, 4, 1])); // (s+1)^2 (s^2+2s+4)... see below
  assert.equal(mixed.reduce((n, r) => n + r.mult, 0), 4);
  const quad = distinctRoots(fromReal([16, 0, 8, 0, 1])); // (s^2+4)^2
  assert.deepEqual(quad.map((r) => [r.s.re, Math.abs(r.s.im), r.mult]), [[0, 2, 2], [0, 2, 2]]);
});

test("cancelled factors are reported", () => {
  const m = good({ mode: "rational", rational: "(s+1)/((s+1)(s+2))" });
  assert.equal(m.poles.length, 1);
  assert.equal(m.cancelled.length, 1);
  assert.equal(m.cancelled[0].s.re, -1);
});

// The numerical integral against the closed form: within 1% anywhere properly inside
// the region of convergence.
test("the numerical integral matches F(s) inside the region of convergence", () => {
  for (const preset of PRESETS) {
    const m = good(preset.input);
    for (const [dx, im] of [[0.3, 0.8], [1, 0], [0.6, -2.5], [2, 4]]) {
      const s = C((Number.isFinite(m.roc) ? m.roc : 0) + dx, im);
      assert.equal(convergence(m, s), "converges");
      const path = integralPath(m, s, horizon(m, s, m.tWindow), 20000);
      const got = C(path.ir[path.n], path.ii[path.n]), want = evalTransformAt(m, s);
      // (at a zero of F, 1% of nothing is no tolerance at all: there it is 3e-4)
      assert.ok(dist(got, want) <= 0.01 * Math.max(abs(want), 0.03), `${preset.id} at ${s.re}+${s.im}i: ${got.re}+${got.im}i vs ${want.re}+${want.im}i`);
    }
  }
});

test("outside the region the integral grows without limit", () => {
  const m = good({ mode: "function", fn: "cos(t)" });
  const s = C(-0.3, 0.5);
  assert.equal(convergence(m, s), "diverges");
  assert.equal(convergence(m, C(0, 0.5)), "boundary");
  const short = integralPath(m, s, 20), long = integralPath(m, s, 40);
  assert.ok(Math.hypot(long.ir[long.n], long.ii[long.n]) > 50 * Math.hypot(short.ir[short.n], short.ii[short.n]));
  assert.ok(Number.isFinite(evalTransformAt(m, s).re), "the closed form still has a value there");
});

test("every preset works and has real poles or conjugate pairs", () => {
  assert.ok(PRESETS.length >= 8);
  for (const p of PRESETS) {
    const m = good(p.input);
    assert.ok(m.steps.length >= 2 && m.steps.every((s) => s.tex && !/NaN|undefined/.test(s.tex)), p.id);
    for (const pole of m.poles) if (pole.s.im !== 0) assert.ok(m.poles.some((o) => o.s.re === pole.s.re && o.s.im === -pole.s.im), p.id);
  }
});

// ── the lecture's properties: time delay, derivative, integral, convolution, scaling ──

const at = (m, s) => evalTransformAt(m, s);
test("time delay: a piece switched on at T transforms to e^(−sT) times its own transform", () => {
  const e = (s, T) => { const k = Math.exp(-s.re * T); return C(k * Math.cos(s.im * T), -k * Math.sin(s.im * T)); };
  for (const [input, F] of [
    [{ mode: "function", fn: "u(t - 1) - u(t - 2)" }, (s) => div(sub(e(s, 1), e(s, 2)), s)],
    [{ mode: "rational", rational: "(e^(-s) - e^(-2s))/s" }, (s) => div(sub(e(s, 1), e(s, 2)), s)],
    [{ mode: "function", fn: "sin(t - 2) u(t - 2)" }, (s) => div(e(s, 2), plus(sq(s), 1))],
    [{ mode: "function", fn: "t u(t - 1)" }, (s) => mul(e(s, 1), add(div(one, sq(s)), div(one, s)))], // t = (t − 1) + 1
    [{ mode: "function", fn: "3delta(t - 2)" }, (s) => mul(C(3, 0), e(s, 2))],
    [{ mode: "rational", rational: "e^(-2s)/(s + 1)" }, (s) => div(e(s, 2), plus(s, 1))],
  ]) {
    const m = good(input);
    assert.ok(m.delayed, JSON.stringify(input));
    for (const s of S) closeC(at(m, s), F(s), `${JSON.stringify(input)} at ${s.re}+${s.im}i`);
  }
});

test("a delayed piece is zero until it switches on, then the shifted signal", () => {
  const m = good({ mode: "rational", rational: "e^(-2s)/(s + 1)" });
  close(evalSignal(m, 1.9), 0, "before");
  for (const t of [2, 2.5, 4]) close(evalSignal(m, t), Math.exp(-(t - 2)), `f(${t})`);
  const pulse = good({ mode: "function", fn: "u(t - 1) - u(t - 2)" });
  assert.deepEqual([0.5, 1, 1.5, 2, 3].map((t) => evalSignal(pulse, t)), [0, 1, 1, 0, 0]);
  assert.match(m.steps.at(-1).tex, /e\^\{-\(t - 2\)\}\\,u\(t - 2\)/);
});

test("a pole that the delayed pieces cancel isn't a pole: a pulse converges everywhere", () => {
  const pulse = good({ mode: "function", fn: "u(t - 1) - u(t - 2)" });
  assert.equal(pulse.poles.length, 0);
  assert.equal(pulse.roc, -Infinity);
  closeC(at(pulse, C(0, 0)), one, "F(0) is the pulse's area"); // the limit, at the cancelled pole
  for (const s of [C(-2, 1), C(0.3, -4)]) {
    assert.equal(convergence(pulse, s), "converges");
    const path = integralPath(pulse, s, horizon(pulse, s, pulse.tWindow), 20000);
    closeC(C(path.ir[path.n], path.ii[path.n]), at(pulse, s), `the integral at ${s.re}+${s.im}i`);
  }
  // a pulse into an RC circuit: the pole at 0 cancels, the circuit's own at −1 stays
  const rc = good({ mode: "ode", ode: "y' + y = u(t) - u(t - 1)", ics: ["0"] });
  assert.deepEqual(rc.poles.map((p) => p.s.re), [-1]);
  close(evalSignal(rc, 1), 1 - Math.exp(-1), "y(1)");
  close(evalSignal(rc, 3), (1 - Math.exp(-1)) * Math.exp(-2), "y(3)");
});

test("the derivative rule: L{f′} = sF(s) − f(0⁻), jumps becoming impulses", () => {
  const d = (fn) => good({ mode: "function", fn: `diff(${fn})` });
  // e^t is continuous at 0, so f(0⁻) = 1 and L{f′} = s/(s − 1) − 1 = 1/(s − 1)
  for (const s of S) closeC(at(d("e^t"), s), div(one, plus(s, -1)), "diff(e^t)");
  for (const s of S) closeC(at(d("cos(2t)"), s), div(C(-4, 0), plus(sq(s), 4)), "diff(cos 2t)");
  // the step jumps at 0: its derivative is the impulse
  const u = d("u(t)");
  assert.deepEqual(u.imp, [1]);
  assert.equal(u.terms.length, 0);
  // and a delayed step's derivative is a delayed impulse
  assert.deepEqual(d("u(t - 3)").kicks.map((k) => [k.T, k.imp]), [[3, [1]]]);
  assert.match(u.steps[0].tex, /s\\,F\(s\) - f\(0\^-\) = s\\left\(\\frac\{1\}\{s\}\\right\) - 0 = 1/);
});

test("the integral rule: L{∫ f} = F(s)/s", () => {
  for (const [fn, F] of [
    ["delta(t)", (s) => div(one, s)],
    ["u(t)", (s) => div(one, sq(s))],
    ["e^(-2t)", (s) => div(one, mul(s, plus(s, 2)))],
    ["t^2 e^(-t)", (s) => div(C(2, 0), mul(s, cube(plus(s, 1))))],
    ["sin(3t)", (s) => div(C(3, 0), mul(s, plus(sq(s), 9)))],
    ["u(t - 1)", (s) => div(C(Math.exp(-s.re) * Math.cos(s.im), -Math.exp(-s.re) * Math.sin(s.im)), sq(s))],
  ]) {
    const m = good({ mode: "function", fn: `int(${fn})` });
    for (const s of S) closeC(at(m, s), F(s), `int(${fn}) at ${s.re}+${s.im}i`);
  }
  close(evalSignal(good({ mode: "function", fn: "int(e^(-2t))" }), 1), (1 - Math.exp(-2)) / 2, "∫₀¹ e^(−2τ) dτ");
});

test("the convolution rule: L{f * g} = F(s) G(s)", () => {
  const h = good({ mode: "function", fn: "conv(e^(-t), sin(t))" });
  for (const s of S) closeC(at(h, s), div(one, mul(plus(s, 1), plus(sq(s), 1))), "F·G");
  // against the convolution integral itself, by Simpson's rule
  const f = (t) => Math.exp(-t), g = (t) => Math.sin(t), t = 2.7, n = 2000;
  let sum = 0;
  for (let i = 0; i <= n; i++) { const tau = (t * i) / n, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; sum += w * f(tau) * g(t - tau); }
  close(evalSignal(h, t), (sum * t) / n / 3, "(f * g)(2.7)");
  // an impulse is the convolution's identity, and a delay adds up
  for (const s of S) closeC(at(good({ mode: "function", fn: "conv(delta(t), e^(-t))" }), s), div(one, plus(s, 1)), "δ * f");
  assert.deepEqual(good({ mode: "function", fn: "conv(u(t - 1), delta(t - 2))" }).signal.map((x) => x.on), [3]);
});

test("the worked steps name the property used", () => {
  const titles = (input) => good(input).steps.map((s) => s.title).join(" | ");
  assert.match(titles({ mode: "function", fn: "e^(-t) cos(t)" }), /Exponential scaling/);
  assert.match(good({ mode: "function", fn: "e^(-t) cos(t)" }).steps[1].tex, /G\(s \+ 1\) = \\frac\{s \+ 1\}\{\(s \+ 1\)\^\{2\} \+ 1\}/);
  assert.match(titles({ mode: "function", fn: "t e^(-t)" }), /Multiplication by t/);
  assert.match(titles({ mode: "function", fn: "3delta(t) - 2e^t" }), /linear/);
  assert.match(titles({ mode: "function", fn: "diff(u(t))" }), /The derivative rule/);
  assert.match(titles({ mode: "function", fn: "int(u(t))" }), /The integral rule/);
  assert.match(titles({ mode: "function", fn: "conv(e^(-t), sin(t))" }), /The convolution rule/);
  assert.match(titles({ mode: "function", fn: "u(t - 1) - u(t - 2)" }), /delay as a factor/);
});

test("partial fractions by equating coefficients, as done by hand", () => {
  const eq = (rational) => good({ mode: "rational", rational }).steps.find((s) => s.title === "Equate coefficients")?.tex ?? "";
  const lecture = eq("(s + 1)/((s + 2)(s + 3))");
  assert.match(lecture, /&= A\(s \+ 3\) \+ B\(s \+ 2\)/);
  assert.match(lecture, /A \+ B &= 1\\\\3A \+ 2B &= 1/);
  assert.match(lecture, /A = -1,\\quad B = 2/);
  assert.match(eq("(2s^2 + 3s + 1)/(s(s + 1)(s + 2))"), /A = \\tfrac\{1\}\{2\},\\quad B = \\tfrac\{3\}\{2\}/);
  // complex and repeated poles: (As + B)/(s² + 4) + C/(s + 1) + D/(s + 1)²
  const mixed = eq("(s^3 + 2)/((s + 1)^2 (s^2 + 4))");
  assert.match(mixed, /\\frac\{As \+ B\}\{s\^\{2\} \+ 4\} \+ \\frac\{C\}\{s \+ 1\} \+ \\frac\{D\}\{\(s \+ 1\)\^\{2\}\}/);
  assert.match(mixed, /\(As \+ B\)\(s \+ 1\)\^\{2\} \+ C\(s\^\{2\} \+ 4\)\(s \+ 1\) \+ D\(s\^\{2\} \+ 4\)/);
  // more than five unknowns, or repeated complex poles: no hand-sized system to show
  assert.equal(eq("1/(s^2 + 1)^2"), "");
  assert.equal(eq("1/(s + 1)"), "");
});

test("every example's note is clean TeX between $ signs", () => {
  for (const p of PRESETS) {
    assert.ok(!/[\u0000-\u001f]/.test(p.note), `${p.id}: a control character (an escape lost its backslash?)`);
    const maths = p.note.split("$").filter((_, i) => i % 2);
    assert.equal(p.note.split("$").length % 2, 1, `${p.id}: unbalanced $`);
    for (const m of maths) assert.doesNotMatch(m, /(?<!\\)\b(mathcal|frac|tfrac|delta|cdot|pm|sqrt|tau|sin|cos|operatorname)\b/, `${p.id}: ${m}`);
  }
});
