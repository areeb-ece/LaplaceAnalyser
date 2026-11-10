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
];
for (const [fn, F] of PAIRS) {
  test(`transform of ${fn}`, () => {
    const m = good({ mode: "function", fn });
    for (const s of S.map((z) => add(z, C(Math.max(0, m.roc), 0)))) closeC(evalTransformAt(m, s), F(s), `F(${s.re}+${s.im}i)`);
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
      const s = C(m.roc + dx, im);
      assert.equal(convergence(m, s), "converges");
      const path = integralPath(m, s, horizon(m, s, m.tWindow), 20000);
      const got = C(path.ir[path.n], path.ii[path.n]), want = evalTransformAt(m, s);
      assert.ok(dist(got, want) <= 0.01 * abs(want), `${preset.id} at ${s.re}+${s.im}i: ${got.re}+${got.im}i vs ${want.re}+${want.im}i`);
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
    assert.ok(m.steps.length >= 3 && m.steps.every((s) => s.tex && !/NaN|undefined/.test(s.tex)), p.id);
    for (const pole of m.poles) if (pole.s.im !== 0) assert.ok(m.poles.some((o) => o.s.re === pole.s.re && o.s.im === -pole.s.im), p.id);
  }
});
