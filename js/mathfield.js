// A box for typing maths that is typeset as it is typed: "/" starts a fraction, "^" a
// power, brackets close themselves, names such as sin and pi are recognised. The tree
// and every edit live in lib/field.js; this file draws the tree with KaTeX's fonts and
// turns keys, clicks and the clipboard into those edits.
//
// Keys go to a text box nobody sees, kept at the cursor, so that phones raise their
// keyboard, screen readers find a labelled field, and input methods work as usual.
import { h } from "./ui.js";
import * as F from "./lib/field.js";

const GLYPH = { "*": "⋅", "-": "−", "'": "′" };
const HISTORY = 200;

/**
 * mathField({ id, compact, describedBy, onChange(text), onEnter() }) →
 *   { el, text(), set(text), insert(keys), focus(), invalid(on) }
 * id goes on the hidden text box, so a <label for> works. The text is in parse.js's syntax.
 */
export function mathField({ id, compact = false, describedBy = "", onChange = () => {}, onEnter = () => {} }) {
  const st = F.createField("");
  const spoken = h("span", { id: id + "Text", hidden: true });
  const input = h("textarea", {
    class: "mf-in", id, rows: "1", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false",
    enterkeyhint: "done", "aria-multiline": "false", "aria-describedby": [describedBy, spoken.id].filter(Boolean).join(" "),
  });
  const body = h("span", { class: "mf-body", "aria-hidden": "true" });
  const caret = h("span", { class: "mf-caret" });
  const el = h("div", { class: compact ? "mf mf-compact" : "mf" }, input, body, spoken);

  const rowEls = new Map(), itemEls = new Map(), fracs = [];
  let focused = false, buffer = "", dragging = false;
  const undo = [], redo = [];

  // ── drawing ──
  function itemEl(it, kind, lead) {
    if (it.k === "frac") { const node = h("span", { class: "mf-frac" }, rowEl(it.num), rowEl(it.den)); fracs.push(node); return node; }   // inner ones first
    if (it.k === "sup") return h("span", { class: "mf-sup" }, rowEl(it.body));
    if (it.k === "sqrt") return h("span", { class: "mf-sqrt" }, h("span", { class: "mf-surd", text: "√" }), rowEl(it.body));
    const text = kind === "exp10" ? "×10" : GLYPH[it.c] || it.c;
    return h("span", { class: `mf-${kind}${it.ghost ? " mf-ghost" : ""}${lead ? " mf-gap" : ""}`, text });
  }
  function rowEl(r) {
    const kind = F.kinds(r), sel = F.selection(st);
    const box = h("span", { class: r.items.length ? "mf-row" : "mf-row mf-empty" });
    rowEls.set(r, box);
    r.items.forEach((it, k) => {
      // sin, cos… stand a little apart from what they multiply
      const lead = kind[k] === "fn" && kind[k - 1] !== "fn" && k > 0 && !["bin", "sign", "rel", "open"].includes(kind[k - 1]);
      const node = itemEl(it, kind[k], lead);
      if (sel && sel.row === r && k >= sel.a && k < sel.b) node.classList.add("mf-sel");
      itemEls.set(it, node);
      box.append(node);
    });
    if (focused && !sel && st.cur.row === r) box.insertBefore(caret, box.children[st.cur.i] || null);
    if (kind.includes("frac")) box.append(h("span", { class: "mf-base" }));   // marks the baseline, for level()
    return box;
  }
  // Every fraction bar goes on the line a minus sign sits on, a quarter of an em above
  // the baseline, whatever is above and below it. (CSS can only get close: the height
  // of a denominator with a power in it isn't known to it.)
  function level() {
    for (const node of fracs) {
      const line = node.parentElement, base = line.querySelector(":scope > .mf-base").getBoundingClientRect().top;
      const bar = node.lastElementChild.getBoundingClientRect().top;
      if (!bar && !base) return;                         // not on show
      const now = parseFloat(getComputedStyle(node).verticalAlign) || 0;
      node.style.setProperty("vertical-align", `${(now + bar - base + 0.25 * parseFloat(getComputedStyle(line).fontSize)).toFixed(2)}px`);
    }
  }
  // Brackets grow to the height of what they hold, and a power after a tall bracket
  // rises with it. (CSS can't know either height.)
  function stretch() {
    for (const [r] of rowEls) {
      const items = r.items;
      for (let k = 0; k < items.length; k++) {
        if (!F.is(items[k], "(")) continue;
        const m = F.closerOf(items, k);
        if (m < 0 || !items.slice(k + 1, m).some((it) => it.k === "frac")) continue;
        let top = Infinity, bottom = -Infinity;
        for (let j = k + 1; j < m; j++) { const b = itemEls.get(items[j]).getBoundingClientRect(); top = Math.min(top, b.top); bottom = Math.max(bottom, b.bottom); }
        const own = itemEls.get(items[k]).getBoundingClientRect(), scale = (bottom - top) / own.height;
        if (!(scale > 1.08)) continue;
        const shift = (top + bottom) / 2 - (own.top + own.bottom) / 2;
        for (const p of [items[k], items[m]]) itemEls.get(p).style.setProperty("transform", `translateY(${shift.toFixed(1)}px) scaleY(${scale.toFixed(3)})`);
        const power = items[m + 1];
        if (power && power.k === "sup") itemEls.get(power).style.setProperty("transform", `translateY(${(top - own.top).toFixed(1)}px)`);
      }
    }
  }
  function draw() {
    rowEls.clear();
    itemEls.clear();
    fracs.length = 0;
    body.replaceChildren(rowEl(st.root));
    spoken.textContent = F.textOf(st);
    level();
    stretch();
    if (!focused || !caret.isConnected) return;
    // the hidden text box rides on the cursor, and the cursor stays in sight
    const c = caret.getBoundingClientRect(), f = el.getBoundingClientRect();
    if (c.left < f.left + 8) el.scrollLeft -= f.left + 8 - c.left;
    else if (c.right > f.right - 8) el.scrollLeft += c.right - (f.right - 8);
    const at = caret.getBoundingClientRect();
    input.style.setProperty("left", `${(at.left - f.left + el.scrollLeft).toFixed(0)}px`);
    input.style.setProperty("top", `${(at.top - f.top).toFixed(0)}px`);
  }

  // ── edits ──
  const remember = () => { undo.push(F.save(st)); if (undo.length > HISTORY) undo.shift(); redo.length = 0; };
  function edit(fn) {
    const before = F.textOf(st);
    remember();
    fn();
    draw();
    if (F.textOf(st) !== before) onChange(F.textOf(st));
  }
  function travel(from, to) {
    if (!from.length) return;
    const before = F.textOf(st);
    to.push(F.save(st));
    F.load(st, from.pop());
    draw();
    if (F.textOf(st) !== before) onChange(F.textOf(st));
  }

  // ── keys ──
  const MOVES = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Home: "home", End: "end" };
  input.addEventListener("keydown", (e) => {
    if (e.isComposing || e.altKey) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key;
    let done = true;
    const far = { Home: "start", End: "finish", ArrowLeft: "home", ArrowRight: "end" };   // with Ctrl or ⌘
    if (MOVES[k]) { F.move(st, (mod && far[k]) || MOVES[k], e.shiftKey); draw(); }
    else if (k === "Backspace") edit(() => F.backspace(st));
    else if (k === "Delete") edit(() => F.del(st));
    else if (k === "Enter") onEnter();
    else if (k === "Tab" && !mod && F.nested(st)) { F.move(st, e.shiftKey ? "back" : "out"); draw(); }   // out of the fraction or power first; then Tab moves on as usual
    else if (mod && k.toLowerCase() === "a") { F.selectAll(st); draw(); }
    else if (mod && k.toLowerCase() === "z") travel(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo);
    else if (mod && k.toLowerCase() === "y") travel(redo, undo);
    else done = false;
    if (done) e.preventDefault();
  });
  // What was typed arrives as the text box's contents. While an input method is still
  // composing (a dead key, a phone keyboard's word), the box keeps its text and only
  // what changed since the last event is applied.
  input.addEventListener("input", (e) => {
    const v = input.value;
    let same = 0;
    while (same < buffer.length && same < v.length && buffer[same] === v[same]) same++;
    const gone = buffer.length - same, fresh = v.slice(same);
    if (gone || fresh) edit(() => {
      for (let n = 0; n < gone; n++) F.backspace(st);
      if (fresh.length > 1 && !e.isComposing) F.paste(st, fresh); else if (fresh) F.type(st, fresh);
    });
    buffer = v;
    if (!e.isComposing) { input.value = ""; buffer = ""; }
  });
  input.addEventListener("compositionend", () => { input.value = ""; buffer = ""; });
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (text) edit(() => F.paste(st, text));
  });
  for (const type of ["copy", "cut"]) input.addEventListener(type, (e) => {
    const text = F.selectedText(st);
    if (!text) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", text);
    if (type === "cut") edit(() => F.erase(st));
  });
  input.addEventListener("focus", () => { focused = true; el.dataset.focus = ""; draw(); });
  input.addEventListener("blur", () => { focused = false; delete el.dataset.focus; F.place(st, st.cur); draw(); });

  // ── the pointer ──
  const within = (b, x, y) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  function hit(x, y) {
    // the innermost box under the pointer
    let r = st.root, area = Infinity;
    for (const [each, box] of rowEls) {
      const b = box.getBoundingClientRect();
      if (within(b, x, y) && b.width * b.height < area) { r = each; area = b.width * b.height; }
    }
    for (;;) {
      const items = r.items;
      let i = items.length;
      for (let k = 0; k < items.length; k++) { const b = itemEls.get(items[k]).getBoundingClientRect(); if (x < b.left + b.width / 2) { i = k; break; } }
      // beside a short numerator is still inside its fraction
      const near = [items[i - 1], items[i]].find((it) => it && it.k !== "ch" && within(itemEls.get(it).getBoundingClientRect(), x, y));
      if (!near) return { row: r, i };
      const rows = F.rowsOf(near);
      r = rows.length > 1 && y >= rowEls.get(rows[1]).getBoundingClientRect().top ? rows[1] : rows[0];
    }
  }
  el.addEventListener("mousedown", (e) => e.preventDefault());   // the hidden box keeps the focus
  el.addEventListener("pointerdown", (e) => {
    if (e.button || e.pointerType === "touch") return;
    input.focus({ preventScroll: true });
    F.place(st, hit(e.clientX, e.clientY), e.shiftKey);
    draw();
    dragging = true;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => { if (dragging) { F.place(st, hit(e.clientX, e.clientY), true); draw(); } });
  for (const type of ["pointerup", "pointercancel"]) el.addEventListener(type, () => { dragging = false; });
  // a tap: phones only raise the keyboard for a focus made inside a click
  el.addEventListener("click", (e) => {
    if (focused && e.pointerType !== "touch") return;
    input.focus({ preventScroll: true });
    F.place(st, hit(e.clientX, e.clientY));
    draw();
  });

  draw();
  // sizes are measured, so measure again when they change: the fonts arriving, the
  // panel being shown or resized
  document.fonts?.ready.then(draw);
  if (window.ResizeObserver) new ResizeObserver(draw).observe(el);
  return {
    el,
    text: () => F.textOf(st),
    set(text) { F.reset(st, text); undo.length = redo.length = 0; draw(); },
    /** Type these keys at the cursor (the buttons under the box). */
    insert(keys) { edit(() => F.type(st, keys)); },
    focus() { input.focus({ preventScroll: true }); },
    invalid(on) { input.setAttribute("aria-invalid", String(!!on)); el.toggleAttribute("data-invalid", !!on); },
  };
}
