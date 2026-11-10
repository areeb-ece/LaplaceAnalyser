// Where the problem is typed: a differential equation with its starting values, a
// function of time, or a transform. Every keystroke is re-read; what the tool
// understood is set as maths underneath, and anything it can't do is said in words.
import { h, clear } from "../ui.js";
import { typeset } from "../math.js";
import { parseEquation } from "../lib/parse.js";
import { odeFromAst } from "../lib/ode.js";
import { PRESETS } from "../lib/presets.js";

const MODES = [
  { id: "ode", name: "Equation", field: "ode", label: "Differential equation", hint: "A linear equation in y, like y'' + 2y' + 5y = cos(2t)." },
  { id: "function", name: "Function f(t)", field: "fn", label: "Function of time", hint: "Like e^(-t) sin(3t), or t^2 e^(-2t) + 1." },
  { id: "rational", name: "Transform F(s)", field: "rational", label: "Transform", hint: "A ratio of polynomials in s, like (s + 3)/((s + 1)(s^2 + 4))." },
];
const yName = (k) => (k <= 3 ? "y" + "'".repeat(k) : `y^(${k})`) + "(0)";

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
      MODES.map((m) => h("button", { type: "button", role: "radio", "data-mode": m.id, text: m.name, on: { click: () => actions.setInput({ mode: m.id }) } })));
    const label = h("label", { class: "sd-label", for: "inExpr" });
    const expr = h("input", { class: "sd-input sd-mono", id: "inExpr", type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: false, "aria-describedby": "inHint inError" });
    const hint = h("p", { class: "sd-hint", id: "inHint" });
    const icsGrid = h("div", { class: "ics" });
    const ics = h("fieldset", { class: "sd-fieldset" }, h("legend", { text: "Starting values" }), icsGrid);
    const error = h("p", { class: "sd-callout sd-danger", id: "inError", role: "alert", hidden: true });
    const math = h("div", { class: "math", role: "math" });
    const readas = h("div", { class: "readas" }, "Read as", math);
    const examples = h("select", { id: "inExamples" }, h("option", { value: "", text: "Load an example…" }),
      [...new Set(PRESETS.map((p) => p.group))].map((g) => h("optgroup", { label: g }, PRESETS.filter((p) => p.group === g).map((p) => h("option", { value: p.id, text: p.name })))));
    examples.addEventListener("change", () => { if (examples.value) actions.loadPreset(examples.value); examples.value = ""; });
    el.append(h("form", { class: "form", novalidate: true, on: { submit: (e) => e.preventDefault() } },
      seg,
      h("div", { class: "sd-field" }, label, expr, hint),
      ics, error, readas,
      h("div", { class: "sd-field" }, h("label", { class: "sd-label", for: "inExamples", text: "Examples" }), h("span", { class: "sd-select sd-small" }, examples))));

    let order = 2, timer = 0;
    const mode = () => MODES.find((m) => m.id === store.state.input.mode);
    const later = (fn) => { clearTimeout(timer); timer = setTimeout(fn, 180); };
    expr.addEventListener("input", () => later(() => actions.setInput({ [mode().field]: expr.value })));
    expr.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(timer); actions.setInput({ [mode().field]: expr.value }); } });

    function drawIcs(input) {
      order = orderOf(input.ode, order);
      if (icsGrid.children.length === order) {
        [...icsGrid.querySelectorAll("input")].forEach((box, k) => { if (document.activeElement !== box) box.value = input.ics[k] ?? "0"; });
        return;
      }
      clear(icsGrid);
      for (let k = 0; k < order; k++) {
        const box = h("input", { class: "sd-input sd-small sd-mono", id: "inIc" + k, type: "text", inputmode: "decimal", autocomplete: "off", spellcheck: false, value: input.ics[k] ?? "0" });
        box.addEventListener("input", () => later(() => {
          const next = Array.from({ length: order }, (_, i) => icsGrid.querySelector("#inIc" + i)?.value ?? "0");
          actions.setInput({ ics: next });
        }));
        icsGrid.append(h("div", { class: "sd-field" }, h("label", { class: "sd-label", for: "inIc" + k, text: yName(k) }), box));
      }
    }

    function draw() {
      const { input, model, error: message } = store.state, m = mode();
      for (const b of seg.children) b.setAttribute("aria-checked", String(b.dataset.mode === input.mode));
      label.textContent = m.label;
      hint.textContent = m.hint;
      if (document.activeElement !== expr) expr.value = input[m.field];
      expr.setAttribute("aria-invalid", String(!!message));
      ics.hidden = input.mode !== "ode";
      if (input.mode === "ode") drawIcs(input);
      error.hidden = !message;
      error.textContent = message || "";
      readas.hidden = !!message || !model?.typed;
      if (!message && model?.typed) typeset(math, model.typed);
    }
    return { update(state, dirty) { if (dirty.has("input") || dirty.has("model") || dirty.has("error")) draw(); } };
  },
};
