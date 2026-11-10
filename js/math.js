// Maths set with KaTeX (vendor/katex), three ways:
//   tex(el, src)        typeset into an element of the page
//   mathLayer(box)      labels placed over a canvas, at points the plot gives
//   paintMath(ctx, el)  the same typeset element drawn onto a canvas, for saved images
// KaTeX lays the maths out as ordinary HTML, so a saved image gets exactly what the page
// shows: each glyph is read back from the layout (where it is, in which font) and drawn
// with the same font. If KaTeX didn't load, the TeX source is shown as it is.
import { h } from "./ui.js";

/** Typeset src into el (inline unless display is set). Does nothing if it's already there. */
export function tex(el, src, display = false) {
  const key = (display ? "D" : "I") + src;
  if (el.dataset.tex === key) return el;
  el.dataset.tex = key;
  if (window.katex) window.katex.render(src, el, { displayMode: display, throwOnError: false });
  else el.textContent = src;
  return el;
}
/** A span of inline maths. */
export const m = (src, cls) => tex(h("span", { class: cls ? "m " + cls : "m" }), src);

const SHIFT = { left: "0", center: "-50%", right: "-100%", top: "0", middle: "-50%", bottom: "-100%" };

/**
 * Labels over a canvas. Between begin() and end(), each put(src, x, y, o) places one:
 * o.align (left, center, right), o.valign (top, middle, bottom), o.color, o.size (px),
 * o.chip (on a small plate, for labels over a busy picture), o.halo (default true: an
 * outline in the panel colour; with o.shade, in the darker ground colour instead).
 * Elements are reused from one frame to the next.
 */
export function mathLayer(box) {
  const host = h("div", { class: "mlayer", "aria-hidden": "true" });
  box.append(host);
  let n = 0;
  return {
    begin() { n = 0; },
    put(src, x, y, o = {}) {
      let el = host.children[n++];
      if (!el) { el = h("span"); host.append(el); }
      el.hidden = false;
      tex(el, src);
      const cls = "ml" + (o.chip ? " chip" : o.halo === false ? "" : o.shade ? " shade" : " halo");
      if (el.className !== cls) el.className = cls;
      el.style.setProperty("color", o.color || "");
      el.style.setProperty("font-size", o.size ? o.size + "px" : "");
      el.style.setProperty("transform", `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${SHIFT[o.align || "left"]}, ${SHIFT[o.valign || "middle"]})`);
    },
    end() { for (let i = n; i < host.children.length; i++) host.children[i].hidden = true; },
  };
}

// ── drawing typeset maths onto a canvas ──

let bench = null;
const made = new Map();
/** A typeset element that is laid out but not on show, to measure and to draw from. */
export function mathElement(src, size = 13, display = false) {
  const key = `${size}|${display ? "D" : "I"}|${src}`;
  let el = made.get(key);
  if (el) return el;
  if (!bench) { bench = h("div", { class: "mbench", "aria-hidden": "true" }); document.body.append(bench); }
  if (made.size > 600) { made.clear(); bench.replaceChildren(); } // labels with numbers in them pile up
  el = h("span", { class: "ml" });
  el.style.setProperty("font-size", size + "px");
  tex(el, src, display);
  bench.append(el);
  made.set(key, el);
  return el;
}

const ascents = new Map(), pictures = new Map();
function ascent(ctx, font) {
  let a = ascents.get(font);
  if (a == null) { ctx.font = font; a = ctx.measureText("x").fontBoundingBoxAscent; ascents.set(font, a); }
  return a;
}

/**
 * Draw a laid-out KaTeX element with its top-left corner at (x, y). o.color overrides
 * the element's own colour; o.halo is a colour to outline the glyphs with first.
 * Returns a promise only when the maths contains drawn parts (a root sign, a stretched
 * brace), which have to be decoded before they can be painted.
 */
export function paintMath(ctx, el, x, y, o = {}) {
  const base = el.getBoundingClientRect(), root = el.querySelector(".katex-html") || el;
  const texts = [], rules = [], range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode()); ) {
    const s = node.nodeValue;
    if (!s || !s.trim() || s === "​" || node.parentElement.closest("svg")) continue;
    range.selectNodeContents(node);
    const r = range.getClientRects()[0];
    if (!r || !r.width) continue;
    const cs = getComputedStyle(node.parentElement);
    texts.push({ s, x: x + r.left - base.left, top: y + r.top - base.top, font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, color: o.color || cs.color });
  }
  // fraction bars, overlines and table rules are borders
  for (const e of root.querySelectorAll(".frac-line, .overline-line, .underline-line, .hline, .rule")) {
    const cs = getComputedStyle(e), bw = parseFloat(cs.borderBottomWidth), r = e.getBoundingClientRect();
    if (bw > 0 && r.width > 0) rules.push({ x: x + r.left - base.left, y: y + r.bottom - base.top - bw, w: r.width, h: Math.max(bw, 0.6), color: o.color || cs.borderBottomColor });
  }
  ctx.save();
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  if (o.halo) {
    ctx.strokeStyle = o.halo; ctx.lineWidth = 3; ctx.lineJoin = "round";
    for (const t of texts) { ctx.font = t.font; ctx.strokeText(t.s, t.x, t.top + ascent(ctx, t.font)); }
  }
  for (const t of texts) { ctx.font = t.font; ctx.fillStyle = t.color; ctx.fillText(t.s, t.x, t.top + ascent(ctx, t.font)); }
  for (const r of rules) { ctx.fillStyle = r.color; ctx.fillRect(r.x, r.y, r.w, r.h); }
  ctx.restore();
  const svgs = [...root.querySelectorAll("svg")];
  if (!svgs.length) return undefined;
  const transform = ctx.getTransform();
  return Promise.all(svgs.map(async (svg) => {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const copy = svg.cloneNode(true), color = o.color || getComputedStyle(svg).color;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", String(r.width));
    copy.setAttribute("height", String(r.height));
    copy.setAttribute("fill", color);
    const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(copy));
    let img = pictures.get(src);
    if (!img) { img = new Image(); img.src = src; pictures.set(src, img); if (pictures.size > 200) pictures.clear(); }
    await img.decode();
    ctx.save();
    ctx.setTransform(transform);
    ctx.drawImage(img, x + r.left - base.left, y + r.top - base.top, r.width, r.height);
    ctx.restore();
  })).then(() => undefined);
}

/**
 * Labels collected while a plot is drawn for a saved image: put() has the signature of
 * a math layer's, and paint(ctx, pal, plain) then draws them all. With plain set (a
 * transparent picture) there are no outlines or plates, which would show as blotches.
 */
export function mathCollector() {
  const list = [];
  return {
    put(src, x, y, o = {}) { list.push({ src, x, y, o }); },
    async paint(ctx, pal, plain = false) {
      for (const { src, x, y, o } of list) {
        const el = mathElement(src, o.size || 13, !!o.display), box = el.getBoundingClientRect();
        const left = x - box.width * { left: 0, center: 0.5, right: 1 }[o.align || "left"], top = y - box.height * { top: 0, middle: 0.5, bottom: 1 }[o.valign || "middle"];
        if (o.chip && !plain) {
          ctx.fillStyle = pal.alpha("sheet", 0.86);
          ctx.beginPath(); ctx.roundRect(left - 6, top - 3, box.width + 12, box.height + 6, 6); ctx.fill();
        }
        const wait = paintMath(ctx, el, left, top, { color: o.color || pal.ink, halo: !plain && !o.chip && o.halo !== false ? (o.shade ? pal.bg : pal.sheet) : null });
        if (wait) await wait;
      }
    },
  };
}
