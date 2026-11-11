// The maths box's model (js/lib/field.js): what keys do to it, and that the text it
// writes out means exactly what the box shows.
import test from "node:test";
import assert from "node:assert/strict";
import * as F from "../js/lib/field.js";
import { analyse } from "../js/lib/analyse.js";
import { PRESETS } from "../js/lib/presets.js";

const typed = (keys) => { const st = F.createField(""); F.type(st, keys); return F.textOf(st); };
const read = (text) => F.textOf(F.createField(text));
const FIELD = { ode: "ode", function: "fn", rational: "rational" };

test("a line typed with its usual spaces becomes the maths it stands for", () => {
  assert.equal(typed("y'' + 2y' + 5y = cos(2t)"), "y'' + 2y' + 5y = cos(2t)");
  assert.equal(typed("e^(-t) sin(3t)"), "e^(-t) sin(3t)");
  assert.equal(typed("t^2 e^(-2t) + 1"), "t^2 e^(-2t) + 1");
  assert.equal(typed("(s + 3)/((s + 1)(s^2 + 4))"), "(s + 3)/((s + 1)(s^2 + 4))");
  assert.equal(typed("1/(s^2 + 2s + 5)"), "1/(s^2 + 2s + 5)");
  assert.equal(typed("cos(2t + pi/4)"), "cos(2t + pi/4)");
});

test("a fraction takes what stands before the slash, and a power what is typed after the ^", () => {
  assert.equal(typed("2t/3"), "2t/3");
  assert.equal(typed("1+2/3"), "1 + 2/3");
  assert.equal(typed("sin(t)/t"), "sin(t)/t");
  assert.equal(typed("/2"), "2/(□)", "nothing before the slash: the numerator is filled first");
  assert.equal(typed("1/2t"), "1/(2t)", "typing goes on in the denominator");
  assert.equal(typed("1/2 t"), "(1/2)t", "until a space steps out");
  assert.equal(typed("e^-2t"), "e^(-2t)");
  assert.equal(typed("e^-2 t"), "e^(-2) t");
  assert.equal(typed("s^2+4"), "s^(2 + 4)");
  assert.equal(typed("s^2 +4"), "s^2 + 4");
  assert.equal(typed("s^2^3"), "s^(2^3)");
  assert.equal(typed("t²e^(-t)"), "t^2 e^(-t)");
});

test("brackets pair themselves", () => {
  assert.equal(typed("(s+1"), "(s + 1)", "an open one is closed at the end");
  assert.equal(typed("s+1)"), "(s + 1)", "a closing one is opened at the start");
  assert.equal(typed("y = (t"), "y = (t)", "on its own side of the =");
  assert.equal(typed("(s^2)"), "(s^2)", "a ) with nothing open in the power closes the bracket outside");
  assert.equal(typed("(1/2)^2"), "(1/2)^2");
  const st = F.createField("");
  F.type(st, "(s");
  F.backspace(st); F.backspace(st);
  assert.equal(F.textOf(st), "", "deleting the bracket takes its partner with it");
});

test("names, numbers and derivatives are found as the parser finds them", () => {
  assert.equal(typed("2pi"), "2pi");
  assert.equal(typed("sqrt(2)/2"), "sqrt(2)/2");
  assert.equal(typed("sqrt2"), "sqrt(2)");
  assert.equal(typed("1e-6 t"), "1e-6t");
  assert.deepEqual(F.kinds(F.createField("1e-6").root), ["digit", "exp10", "raised", "raised"]);
  assert.deepEqual(F.kinds(F.createField("2e-t").root), ["digit", "var", "bin", "var"]);
  assert.deepEqual(F.kinds(F.createField("-3sin(t)").root), ["sign", "digit", "fn", "fn", "fn", "open", "var", "close"]);
  assert.equal(typed("dy/dt + y = 0"), "dy/dt + y = 0");
  assert.equal(typed("d^2 y/dt^2 = 1"), "d^2y/dt^2 = 1", "an = always goes to the top line");
  assert.equal(typed("y^(4) = 1"), "y^(4) = 1", "the brackets of a derivative's order are kept");
  assert.equal(typed("y^4 = 1"), "y^4 = 1");
  assert.equal(typed("S+1"), "s + 1");
  assert.equal(typed("2·t−1"), "2*t - 1");
});

test("backspace, delete, moving and selecting", () => {
  const st = F.createField("");
  F.type(st, "(s+1)/s^2");
  assert.equal(F.textOf(st), "(s + 1)/(s^2)");
  F.backspace(st);                       // the 2
  F.backspace(st);                       // the empty power
  assert.equal(F.textOf(st), "(s + 1)/s");
  F.backspace(st);                       // the s
  F.backspace(st);                       // the bar: the sum comes back in its brackets
  assert.equal(F.textOf(st), "(s + 1)");
  F.type(st, "/2");
  F.move(st, "up"); F.move(st, "home");
  F.type(st, "3");
  assert.equal(F.textOf(st), "(3s + 1)/2");
  F.move(st, "down"); F.move(st, "out");
  F.type(st, "t");
  assert.equal(F.textOf(st), "((3s + 1)/2)t");
  F.move(st, "left", true);
  assert.equal(F.selectedText(st), "t");
  F.move(st, "left", true);
  assert.equal(F.selectedText(st), "((3s + 1)/2)t", "a fraction is selected whole");
  F.type(st, "(");
  assert.equal(F.textOf(st), "(((3s + 1)/2)t)", "a bracket wraps what is selected");
  F.selectAll(st);
  F.type(st, "7");
  assert.equal(F.textOf(st), "7");
  F.move(st, "start");
  F.del(st);
  assert.equal(F.textOf(st), "");
});

test("undo comes back to the same box and cursor", () => {
  const st = F.createField("1/(s + 1)");
  F.move(st, "left"); F.move(st, "left");
  const snap = F.save(st);
  F.type(st, "23");
  assert.equal(F.textOf(st), "1/(s + 231)");
  F.load(st, snap);
  assert.equal(F.textOf(st), "1/(s + 1)");
  F.type(st, "4");
  assert.equal(F.textOf(st), "1/(s + 41)");
});

test("text is read into the box as the parser reads it, or left as typed where the parser would ask", () => {
  assert.equal(read("a/b"), "a/b");
  assert.equal(read("t^2/2"), "t^2/2");
  assert.equal(read("1/2/3"), "1/2/3");
  assert.equal(read("d2y/dt2 + dy/dt = 1"), "d^2y/dt^2 + dy/dt = 1");
  assert.equal(read("y^(4) + y = 0"), "y^(4) + y = 0");
  assert.equal(read("e^-2 t"), "e^(-2) t");
  for (const asked of ["1/2t", "e^-2t", "1/s(s+1)", "sin t"]) {
    const st = F.createField(asked);
    assert.ok(st.root.items.every((it) => it.k === "ch"), asked);
    assert.equal(F.textOf(st).replace(/ /g, ""), asked.replace(/ /g, ""));
    assert.equal(analyse({ mode: "function", fn: F.textOf(st) }).ok, false, asked);
  }
});

test("every example survives the box: read in, written out, and typed key by key", () => {
  for (const p of PRESETS) {
    const field = FIELD[p.input.mode], src = p.input[field];
    const want = analyse(p.input);
    assert.ok(want.ok, p.id);
    const same = (text, how) => {
      const got = analyse({ ...p.input, [field]: text });
      assert.ok(got.ok, `${p.id} ${how}: ${text}: ${got.message}`);
      assert.deepEqual(got.steps.map((s) => s.tex), want.steps.map((s) => s.tex), `${p.id} ${how}: ${text}`);
    };
    same(read(src), "read");
    same(typed(src), "typed");
    assert.equal(read(read(src)), read(src), `${p.id}: writing it out twice gives the same text`);
  }
});

test("an empty box inside the maths is refused in words", () => {
  for (const keys of ["1/", "e^", "sqrt"]) {
    const m = analyse({ mode: "function", fn: typed(keys) });
    assert.equal(m.ok, false);
    assert.match(m.message, /still empty/, keys);
  }
});
