// Small DOM helpers. Nothing here writes a style attribute: sizes and positions go
// through el.style.setProperty, as in the other tools.
const SVGNS = "http://www.w3.org/2000/svg";

function put(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "text") el.textContent = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "vars") for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k in el && !k.includes("-") && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
}
function kids(el, list) {
  for (const c of list.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
/** h("div", { class: "x", on: { click } }, child, "text", [more]) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  put(el, props);
  return kids(el, children);
}
export const clear = (el) => { el.replaceChildren(); return el; };

// One stroked icon set, drawn here rather than borrowed from text glyphs.
const ICONS = {
  play: { d: "M8 5.5v13l11-6.5z", fill: true },
  pause: { d: "M8.5 5.5v13M15.5 5.5v13" },
  close: { d: "M6.5 6.5l11 11M17.5 6.5l-11 11" },
  max: { d: "M5 5h14v14H5z" },
  restore: { d: "M8.5 8.5H19V19H8.5zM5 15.5V5h10.5" },
  more: { d: "M6 12h.01M12 12h.01M18 12h.01", w: 3 },
  check: { d: "M5 12.5l4.5 4.5L19 7" },
  minus: { d: "M6 12h12" },
  plus: { d: "M6 12h12M12 6v12" },
  home: { d: "M4 12l8-7 8 7M6.5 10.5V19h11v-8.5" },
};
export function icon(name) {
  const i = ICONS[name], svg = document.createElementNS(SVGNS, "svg"), path = document.createElementNS(SVGNS, "path");
  for (const [k, v] of Object.entries({ class: "ico", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": i.w ?? 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(k, v);
  path.setAttribute("d", i.d);
  if (i.fill) path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

// One menu for the whole page: a popover, so Escape and a click elsewhere close it and
// it sits above everything without a z-index. Whichever button opened it owns it.
let pop = null, list = null, owner = null;
function menuEl() {
  if (pop) return pop;
  list = h("ul", { class: "sd-nav" });
  pop = h("div", { class: "menu", role: "menu", popover: "auto" }, list);
  document.body.append(pop);
  pop.addEventListener("toggle", (e) => {
    const isOpen = e.newState === "open";
    owner?.setAttribute("aria-expanded", String(isOpen));
    if (!isOpen && pop.contains(document.activeElement)) owner?.focus();
  });
  pop.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const all = [...list.querySelectorAll("button:not(:disabled)")], i = all.indexOf(document.activeElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length;
    all[next]?.focus();
    e.preventDefault();
  });
  return pop;
}
/**
 * Makes button open a menu. items() is called each time and returns
 * [{ label, run, checked?, disabled? }]; a checked value (true or false) makes the
 * item a tick box.
 */
export function attachMenu(button, items) {
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    const el = menuEl();
    if (el.matches(":popover-open")) { const mine = owner === button; el.hidePopover(); if (mine) return; }
    owner = button;
    clear(list);
    for (const it of items()) {
      const b = h("button", { type: "button", role: it.checked == null ? "menuitem" : "menuitemcheckbox", "aria-checked": it.checked == null ? null : String(it.checked), disabled: !!it.disabled },
        it.checked == null ? null : icon("check"), h("span", { text: it.label }));
      b.addEventListener("click", () => { el.hidePopover(); it.run(); });
      list.append(h("li", null, b));
    }
    el.showPopover();
    const r = button.getBoundingClientRect(), w = el.offsetWidth, ph = el.offsetHeight;
    el.style.setProperty("left", Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px");
    el.style.setProperty("top", (r.bottom + ph + 12 > innerHeight && r.top - ph - 4 > 0 ? r.top - ph - 4 : r.bottom + 4) + "px");
    list.querySelector("button:not(:disabled)")?.focus();
  });
}

/** Storage that may be missing or blocked: reads give null, writes are dropped. */
export const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode, or full */ } },
  remove(key) { try { localStorage.removeItem(key); } catch (e) { /* same */ } },
};
