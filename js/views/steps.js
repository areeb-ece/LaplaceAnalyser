// The algebra, step by step: the transformed equation, Y(s), its partial fractions and
// the function of time they invert to.
import { h, clear } from "../ui.js";
import { tex, mathElement, paintMath } from "../math.js";

const TITLE = 12, MATH = 15, PAD = 14;

/**
 * The steps drawn for a saved image: each title over its equation, the whole column
 * scaled down if it is wider or taller than the room it has.
 */
export async function paintSteps(g, state) {
  const { ctx, w, h: hgt, pal } = g, steps = state.model.steps;
  const els = steps.map((s) => mathElement(s.tex, MATH, true)), boxes = els.map((e) => e.getBoundingClientRect());
  const need = { w: Math.max(...boxes.map((b) => b.width), 120) + 2 * PAD, h: boxes.reduce((sum, b) => sum + TITLE + 8 + b.height + 18, 0) + PAD };
  const k = Math.min(1, w / need.w, hgt / need.h);
  ctx.save();
  ctx.scale(k, k);
  let y = PAD;
  for (let i = 0; i < steps.length; i++) {
    ctx.font = `600 ${TITLE}px ${pal.text}`; ctx.fillStyle = pal.ink2; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`${i + 1}. ${steps[i].title}`, PAD, y);
    y += TITLE + 8;
    const wait = paintMath(ctx, els[i], PAD, y, { color: pal.ink });
    if (wait) await wait;
    y += boxes[i].height + 18;
  }
  ctx.restore();
}

export default {
  id: "steps", title: "Worked steps", paint: paintSteps,
  mount(el, store) {
    const list = h("ol", { class: "steps", "aria-label": "Worked steps" });
    el.append(list);
    let shown = null;
    function draw() {
      const { model } = store.state;
      if (!model || model === shown) return;
      shown = model;
      clear(list);
      for (const step of model.steps) list.append(h("li", null, h("h3", { text: step.title }), tex(h("div", { class: "math", tabindex: 0, role: "math" }), step.tex, true)));
    }
    return { update(state, dirty) { if (dirty.has("model")) draw(); } };
  },
};
