// Canvas and WebGL can't read CSS variables, so the plot colours are resolved here
// from the shared palette, once per theme. One role, one token, in every view.
const ROLES = {
  signal: "--c0",     // f(t), y(t), and the sum of the phasors (which is f)
  probe: "--c4",      // the probe point s
  integrand: "--c6",  // f(t) e^(-st)
  integral: "--c2",   // the running integral and its resultant
  value: "--c3",      // the closed-form F(s)
  phUp: "--c5",       // phasors of poles above the real axis
  phDown: "--c7",     // their conjugates
  phReal: "--c1",     // phasors of real poles
  ink: "--ink", ink2: "--ink-2", ink3: "--ink-3", ink4: "--ink-4",
  rule: "--rule", rule2: "--rule-2", sheet: "--sheet", card: "--card", bg: "--bg",
  accent: "--accent", tint: "--tint", well: "--well",
};
export const PLOT_ROLES = ["signal", "probe", "integrand", "integral", "value", "phUp", "phDown", "phReal"];
export const ROLE_TOKENS = ROLES;

let cache = null, probeEl = null;

// "rgb(1 2 3)", "rgba(1, 2, 3, .5)" or "color(srgb .1 .2 .3)" → [r, g, b] in 0–1.
function parse(text) {
  const n = (text.match(/-?[\d.]+(e-?\d+)?%?/g) || []).map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v)));
  if (/^color\(/.test(text)) return n.slice(0, 3);
  return n.slice(0, 3).map((v) => v / 255);
}
const css = (c, a = 1) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)} / ${a})`;

export function palette() {
  if (cache) return cache;
  if (!probeEl) { probeEl = document.createElement("i"); probeEl.hidden = true; document.body.append(probeEl); }
  const root = getComputedStyle(document.documentElement), rgb = {};
  for (const [role, token] of Object.entries(ROLES)) {
    probeEl.style.setProperty("color", `var(${token})`);
    rgb[role] = parse(getComputedStyle(probeEl).color);
  }
  const p = { rgb, light: /light/.test(root.colorScheme) && !/dark/.test(root.colorScheme) };
  for (const role of Object.keys(ROLES)) p[role] = css(rgb[role]);
  p.alpha = (role, a) => css(rgb[role], a);
  p.mono = root.getPropertyValue("--font-mono").trim() || "monospace";
  p.text = root.getPropertyValue("--font-text").trim() || "sans-serif";
  return (cache = p);
}

/** Calls fn after the theme (or the visitor's accent or corners) changes. */
export function onThemeChange(fn) {
  let queued = false;
  const go = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; cache = null; fn(); });
  };
  new MutationObserver(go).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-scheme", "style"] });
  // a stylesheet that arrives late (the offline copy of the design) changes the colours too
  addEventListener("load", go);
  document.fonts?.ready.then(go);
}
