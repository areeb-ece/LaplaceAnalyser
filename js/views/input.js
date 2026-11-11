// Where the problem is typed: a differential equation with its starting values, a
// function of time, or a transform. The boxes typeset the maths as it is typed
// (mathfield.js), every keystroke is re-read, and anything the tool can't do is said in
// words.
import { h, clear } from "../ui.js";
import { m } from "../math.js";
import { mathField } from "../mathfield.js";
import { parseEquation } from "../lib/parse.js";
import { odeFromAst } from "../lib/ode.js";
import { PRESETS } from "../lib/presets.js";

// The keys under the box: what each shows (as maths), what it is called, and what it types.
const KEY = {
  d1: ["y'", "First derivative", "y'"], d2: ["y''", "Second derivative", "y''"],
  frac: ["\\tfrac{a}{b}", "Fraction", "/"], pow: ["a^b", "Power", "^"], exp: ["e^{a}", "Exponential", "e^"],
  sin: ["\\sin", "Sine", "sin("], cos: ["\\cos", "Cosine", "cos("], root: ["\\sqrt{a}", "Square root", "sqrt"], pi: ["\\pi", "Pi", "pi"],
};
const MODES = [
  { id: "ode", name: "Equation", field: "ode", label: "Differential equation", keys: ["d1", "d2", "frac", "pow", "exp", "sin", "cos"], hint: ["A linear equation in ", m("y"), ". Type it like ", ["y'' + 2y' + 5y = cos(2t)"]] },
  { id: "function", name: "Function", sym: "f(t)", field: "fn", label: "Function of time", keys: ["frac", "pow", "exp", "sin", "cos", "root", "pi"], hint: ["Type it like ", ["e^(-t) sin(3t)"], " or ", ["t^2 e^(-2t) + 1"]] },
  { id: "rational", name: "Transform", sym: "F(s)", field: "rational", label: "Transform", keys: ["frac", "pow", "root", "pi"], hint: ["A ratio of polynomials in ", m("s"), ". Type it like ", ["(s + 3)/((s + 1)(s^2 + 4))"]] },
];
// How the box behaves, said once under every mode's own hint.
const HOW = [["/"], " starts a fraction and ", ["^"], " a power; ", ["Space"], " or ", ["→"], " steps out of one."];
const typedAs = (parts) => parts.map((part) => (Array.isArray(part) ? h("code", { text: part[0] }) : part));
// y(0), y'(0), … as maths (the labels of the starting-value boxes) and as plain words (for errors).
const yTex = (k) => (k <= 3 ? "y" + "'".repeat(k) : `y^{(${k})}`) + "(0)";

// How many starting values the equation needs. While it's half-typed and won't parse,
// count the highest derivative that appears in the text.
function orderOf(text, fallback) {
  try { return odeFromAst(parseEquation(text)).coefs.length - 1; } catch (e) { /* not an equation yet */ }
  let n = 0;
  for (const m of text.matchAll(/y\s*('+)|y\s*\^\s*\(\s*(\d+)\s*\)|d\s*\^?\s*(\d+)\s*y|(d\s*y)/g)) n = Math.max(n, m[1] ? m[1].length : m[4] ? 1 : +(m[2] ?? m[3]));
  return n > 0 && n <= 8 ? n : fallback;
}

export default {
  id: "input", title: "Input",
  mount(el, store, actions) {
    const seg = h("div", { class: "sd-seg", role: "radiogroup", "aria-label": "What to start from" },
      MODES.map((x) => h("button", { type: "button", role: "radio", "data-mode": x.id, on: { click: () => switchTo({ mode: x.id }) } }, x.name, x.sym ? [" ", m(x.sym)] : null)));
    const label = h("label", { class: "sd-label", for: "inExpr" });
    let order = 2, timer = 0, waiting = false, synced = null, boxes = [];
    const mode = () => MODES.find((x) => x.id === store.state.input.mode);
    // what the boxes hold goes to the store a moment after the last key, or at once on Enter
    const send = () => {
      clearTimeout(timer);
      waiting = false;
      synced = expr.text();
      const part = { [mode().field]: synced };
      if (mode().id === "ode" && boxes.length) { for (const b of boxes) b.sent = b.field.text() || "0"; part.ics = boxes.map((b) => b.sent); }
      actions.setInput(part);
    };
    const later = () => { clearTimeout(timer); waiting = true; timer = setTimeout(send, 180); };
    // Another mode or an example changes what the boxes hold. What was being typed is
    // sent first (or dropped, when an example replaces it), and the boxes are refilled
    // at once, not a frame later, so keys that follow straight away land in the new text.
    const switchTo = (part) => { if (waiting) send(); actions.setInput(part); draw(); };
    const expr = mathField({ id: "inExpr", describedBy: "inHint inError", onChange: later, onEnter: send });
    const keys = h("div", { class: "mf-keys", role: "group", "aria-label": "Maths keys" });
    const hint = h("p", { class: "sd-hint", id: "inHint" });
    const icsGrid = h("div", { class: "ics" });
    const ics = h("fieldset", { class: "sd-fieldset" }, h("legend", { text: "Starting values" }), icsGrid);
    const error = h("p", { class: "sd-callout sd-danger", id: "inError", role: "alert", hidden: true });
    const examples = h("select", { id: "inExamples" }, h("option", { value: "", text: "Load an example…" }),
      [...new Set(PRESETS.map((p) => p.group))].map((g) => h("optgroup", { label: g }, PRESETS.filter((p) => p.group === g).map((p) => h("option", { value: p.id, text: p.name })))));
    examples.addEventListener("change", () => {
      if (examples.value) { clearTimeout(timer); waiting = false; actions.loadPreset(examples.value); draw(); }
      examples.value = "";
    });
    // what the loaded example models; words with maths between $ signs
    const about = h("p", { class: "sd-hint about", hidden: true });
    const told = (text) => text.split("$").map((part, i) => (i % 2 ? m(part) : part));
    el.append(h("form", { class: "form", novalidate: true, on: { submit: (e) => e.preventDefault() } },
      seg,
      h("div", { class: "sd-field" }, label, expr.el, keys, hint),
      error, ics,
      h("div", { class: "sd-field" }, h("label", { class: "sd-label", for: "inExamples", text: "Examples" }), h("span", { class: "sd-select sd-small" }, examples), about)));

    // the starting values: one small box each, read the same way as the big one
    function drawIcs(input) {
      order = orderOf(input.ode, order);
      if (boxes.length === order) {
        boxes.forEach((box, k) => { if (box.sent !== (input.ics[k] ?? "0")) { box.sent = input.ics[k] ?? "0"; box.field.set(box.sent); } });
        return;
      }
      clear(icsGrid);
      boxes = Array.from({ length: order }, (_, k) => {
        const box = { sent: input.ics[k] ?? "0" };
        box.field = mathField({ id: "inIc" + k, compact: true, describedBy: "inError", onChange: later, onEnter: send });
        box.field.set(box.sent);
        icsGrid.append(h("div", { class: "sd-field" }, h("label", { class: "sd-label", for: "inIc" + k }, m(yTex(k))), box.field.el));
        return box;
      });
    }

    function draw() {
      const { input, error: message } = store.state, md = mode();
      for (const b of seg.children) b.setAttribute("aria-checked", String(b.dataset.mode === input.mode));
      label.textContent = md.label;
      if (hint.dataset.mode !== md.id) {
        hint.dataset.mode = md.id;
        // what to type is shown as typed (in the code face); the maths around it is typeset
        hint.replaceChildren(...typedAs(md.hint), h("span", { class: "how" }, typedAs(HOW)));
        keys.replaceChildren(...md.keys.map((id) => {
          const [face, name, types] = KEY[id];
          // mousedown is stopped so the cursor stays in the box while its keys are pressed
          return h("button", { class: "sd-btn sd-small", type: "button", "aria-label": name, title: name, on: { mousedown: (e) => e.preventDefault(), click: () => { expr.insert(types); expr.focus(); } } }, m(face));
        }));
      }
      // the box is refilled only when the store's text is news to it (an example, another
      // mode, a saved session), never with an older copy of what is being typed
      if (input[md.field] !== synced) { synced = input[md.field]; if (expr.text() !== synced) expr.set(synced); }
      expr.invalid(!!message);
      ics.hidden = input.mode !== "ode";
      if (input.mode === "ode") drawIcs(input);
      error.hidden = !message;
      error.textContent = message || "";
      const preset = PRESETS.find((p) => p.id === store.state.preset);
      about.hidden = !preset;
      if (preset && about.dataset.id !== preset.id) { about.dataset.id = preset.id; about.replaceChildren(h("b", { text: preset.name + ". " }), ...told(preset.note)); }
    }
    draw();   // filled from the first moment it is on the page
    return { update(state, dirty) { if (dirty.has("input") || dirty.has("model") || dirty.has("error") || dirty.has("preset")) draw(); } };
  },
};
