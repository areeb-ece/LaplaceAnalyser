// What gets refused, and that the refusal says why. Nothing here may come back as a result.
import test from "node:test";
import assert from "node:assert/strict";
import { analyse, evalSignal } from "../js/lib/analyse.js";

const refuse = (input, pattern) => {
  const m = analyse(input);
  assert.equal(m.ok, false, `expected a refusal for ${JSON.stringify(input)}`);
  assert.match(m.message, pattern, m.message);
};
const fn = (fn) => ({ mode: "function", fn });
const rat = (rational) => ({ mode: "rational", rational });
const ode = (ode, ics = []) => ({ mode: "ode", ode, ics });

test("functions outside the supported family", () => {
  refuse(fn(""), /nothing to work with/);
  refuse(fn("1/t"), /divide by a number or by a single exponential/);
  refuse(fn("sin(t^2)"), /form a·t \+ b/);
  refuse(fn("e^(t^2)"), /form a·t \+ b/);
  refuse(fn("sqrt(t)"), /sqrt only works on numbers/);
  refuse(fn("t^0.5"), /whole numbers/);
  refuse(fn("tan(t)"), /don't know what "an"|don't know what/);
  refuse(fn("ln(t)"), /don't know what "ln"/);
  refuse(fn("u(t-2)"), /delayed step/i);
  refuse(fn("s + 1"), /s is the transform's variable/);
  refuse(fn("y' + y"), /belongs in a differential equation/);
  refuse(fn("0"), /zero function/);
  refuse(fn("sin(t) - sin(t)"), /zero function/);
  refuse(fn("t ="), /not an equation/);
});

test("ambiguous typing is asked about, not guessed", () => {
  refuse(fn("e^-2t"), /can't tell where the power ends/);
  refuse(fn("1/2t"), /ambiguous/);
  refuse(rat("1/s(s+1)"), /ambiguous/);
  refuse(fn("sin t"), /in brackets/);
  refuse(fn("sin^2(t)"), /after the brackets/);
  refuse(fn("(t + 1"), /never closed/);
  refuse(fn("t + 1)"), /no opening/);
  refuse(fn("2 +"), /stops early/);
});

test("the readings that are unambiguous are accepted", () => {
  const at = (text, t) => { const m = analyse(fn(text)); assert.ok(m.ok, m.message); return evalSignal(m, t); };
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  near(at("e^(-2t)", 0.5), Math.exp(-1));
  near(at("e^-2 t", 0.5), Math.exp(-2) * 0.5);
  near(at("t^2 e^(-t)", 2), 4 * Math.exp(-2));
  near(at("t^2e^(-t)", 2), 4 * Math.exp(-2));
  near(at("2t cos(3t)", 1), 2 * Math.cos(3));
  near(at("3·sin(2t)×e^(−t)", 1), 3 * Math.sin(2) * Math.exp(-1));
  near(at("-t^2", 3), -9);
  near(at("1/2*t", 3), 1.5);
  near(at("1/(2e^(t))", 1), 0.5 * Math.exp(-1));
  near(at("exp(-t)(1+t)", 1), 2 * Math.exp(-1));
  near(at("2e3 t", 1), 2000);
  near(at("STEP(T) * 5", 1), 5);
});

test("transforms that aren't proper rational functions", () => {
  refuse(rat("s^2/(s+1)"), /lower degree than the denominator/);
  refuse(rat("(s+1)/(s+2)"), /lower degree than the denominator/);
  refuse(rat("s + 1"), /polynomial in s/);
  refuse(rat("e^(-2s)/s"), /delay factor/);
  refuse(rat("exp(-s)/(s+1)"), /delay factor/);
  refuse(rat("1/sqrt(s)"), /ratio of polynomials/);
  refuse(rat("1/s^0.5"), /whole number/);
  refuse(rat("1/(t+1)"), /t is the time variable/);
  refuse(rat("1/0"), /divides by zero/);
  refuse(rat("0/(s+1)"), /zero/);
  refuse(rat("1/(s+1)^13"), /stops at 12/);
});

test("equations this tool doesn't solve", () => {
  refuse(ode("y'' + 4y"), /needs an = sign/);
  refuse(ode("y'' + y^2 = 0"), /non-linear/);
  refuse(ode("y y' = 1"), /non-linear/);
  refuse(ode("y' + sin(y) = 0"), /non-linear/);
  refuse(ode("t y' + y = 0"), /variable-coefficient/);
  refuse(ode("y'/t + y = 0"), /variable-coefficient|divide by a number/);
  refuse(ode("3y = 6"), /no derivative/);
  refuse(ode("t = 2"), /no y/);
  refuse(ode("y' = y'"), /no y/);
  refuse(ode("y'' + y = 0", ["0", "0"]), /y\(t\) = 0/);
  refuse(ode("y' + y = 1/t"), /divide by a number/);
  refuse(ode("y' + y = 1", ["t"]), /y\(0\): .*has to be a number/);
  refuse(ode("y' + y = 1 = 2"), /more than one = sign/);
  refuse(ode("d^2y/dt^3 + y = 0"), /two orders differ/);
});

test("typed numbers in starting values", () => {
  const m = analyse(ode("y' + y = 0", ["1/2"]));
  assert.ok(m.ok, m.message);
  assert.ok(Math.abs(evalSignal(m, 0) - 0.5) < 1e-12);
});

test("nearly coincident poles are refused rather than shown wrong", () => {
  // Far enough apart to be different roots, too close for the arithmetic to separate well.
  const m = analyse(rat("1/((s+1)^4 (s+1.00001)^4)"));
  if (m.ok) {
    // if it is accepted, it must actually be right: compare with the merged 8-fold pole
    const t = 2, want = (t ** 7 * Math.exp(-t)) / 5040;
    assert.ok(Math.abs(evalSignal(m, t) - want) < 1e-3 * want, "accepted but inaccurate");
  } else assert.match(m.message, /too close together/);
});
