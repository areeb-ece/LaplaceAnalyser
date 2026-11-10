// The algebra, step by step: the transformed equation, Y(s), its partial fractions and
// the function of time they invert to.
import { h, clear } from "../ui.js";
import { typeset } from "../math.js";

export default {
  id: "steps", title: "Worked steps",
  mount(el, store) {
    const list = h("ol", { class: "steps", "aria-label": "Worked steps" });
    el.append(list);
    let shown = null;
    function draw() {
      const { model } = store.state;
      if (!model || model === shown) return;
      shown = model;
      clear(list);
      for (const step of model.steps) {
        const math = h("div", { class: "math", tabindex: 0, role: "math" });
        typeset(math, step.tex);
        list.append(h("li", null, h("h3", { text: step.title }), math));
      }
    }
    return { update(state, dirty) { if (dirty.has("model")) draw(); } };
  },
};
