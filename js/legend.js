// The key to a plot's marks, and the figures that go with it. A view describes it once,
// as items { mark, role, text, tex }, and it is drawn two ways from that: as elements
// under the plot on the page, and painted under the plot in a saved image.
//   mark  cross · ring · hatch · line · arrow · diamond · phase · none
//   role  which palette colour the mark takes (palette.js)
//   text  words;  tex  maths that follows them
import { h } from "./ui.js";
import { tex, mathElement } from "./math.js";

const W = { phase: 64 };
const widthOf = (mark) => (mark === "none" || !mark ? 0 : W[mark] ?? 16);

/** Draw one mark in a box widthOf(mark) wide and 14 high, with its top-left at (x, y). */
export function drawMark(ctx, mark, role, x, y, pal) {
  const cx = x + 8, cy = y + 7, c = pal[role] || pal.ink;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = c; ctx.fillStyle = c;
  if (mark === "cross") { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 4.5, cy - 4.5); ctx.lineTo(cx + 4.5, cy + 4.5); ctx.moveTo(cx + 4.5, cy - 4.5); ctx.lineTo(cx - 4.5, cy + 4.5); ctx.stroke(); }
  else if (mark === "ring") { ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, 2 * Math.PI); ctx.stroke(); }
  else if (mark === "hatch") {
    ctx.fillStyle = pal.alpha("accent", 0.2); ctx.fillRect(x + 1, y, 14, 14);
    ctx.beginPath(); ctx.rect(x + 1, y, 14, 14); ctx.clip();
    ctx.strokeStyle = pal.alpha("accent", 0.9); ctx.lineWidth = 1;
    ctx.beginPath(); for (let d = -14; d < 16; d += 5) { ctx.moveTo(x + d, y + 14); ctx.lineTo(x + d + 14, y); } ctx.stroke();
  }
  else if (mark === "line") { ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 1, cy); ctx.lineTo(x + 15, cy); ctx.stroke(); }
  else if (mark === "arrow") {
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 1, cy); ctx.lineTo(x + 10, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 15, cy); ctx.lineTo(x + 9, cy - 3.5); ctx.lineTo(x + 9, cy + 3.5); ctx.closePath(); ctx.fill();
  }
  else if (mark === "diamond") { ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 5, cy); ctx.closePath(); ctx.stroke(); }
  else if (mark === "phase") {
    // the hue wheel the surface is coloured with, from −π to π
    for (let i = 0; i < 64; i++) { ctx.fillStyle = `hsl(${(((i / 63 - 0.5) * 360) + 360) % 360} ${pal.light ? 62 : 68}% ${pal.light ? 50 : 56}%)`; ctx.fillRect(x + i, y + 3, 1.2, 8); }
  }
  ctx.restore();
}

/**
 * The key as elements in host. Kept from one frame to the next: only what changed is redone.
 * An item with status (ok, warn or danger) is a tag; with tint, its maths takes the mark's colour.
 */
export function legendDom(host, items, pal) {
  const sig = items.map((i) => `${i.mark}|${i.role}|${i.text ?? ""}|${i.status ?? ""}`).join("§") + "§" + pal.theme + pal.ink + pal.accent;
  if (host.dataset.sig !== sig) {
    host.dataset.sig = sig;
    host.replaceChildren(...items.map((it) => {
      const w = widthOf(it.mark), cv = w ? h("canvas", { width: w * 2, height: 28 }) : null;
      if (cv) { cv.style.setProperty("width", w + "px"); cv.style.setProperty("height", "14px"); const c = cv.getContext("2d"); c.scale(2, 2); drawMark(c, it.mark, it.role, 0, 0, pal); }
      return h("span", { class: "k" }, cv, it.text ? h("span", { class: it.status ? "sd-tag sd-" + it.status : null, text: it.text }) : null, h("span", { class: "m" }));
    }));
  }
  items.forEach((it, i) => {
    const slot = host.children[i].lastChild;
    slot.hidden = !it.tex;
    if (!it.tex) return;
    tex(slot, it.tex);
    slot.style.setProperty("color", it.tint ? pal[it.role] : "");
  });
}

/**
 * The key painted for a saved image, from (x, y), wrapping at maxW. put is a maths
 * collector's. Returns the height it took; with measure set, nothing is drawn.
 */
export function legendPaint(ctx, items, x, y, maxW, pal, put, measure = false) {
  const GAP = 16, ROW = 22, SIZE = 12;
  let cx = x, cy = y;
  for (const it of items) {
    ctx.font = `${it.status ? 600 : 400} ${SIZE}px ${pal.text}`;
    const mw = widthOf(it.mark), tw = it.text ? ctx.measureText(it.text).width : 0;
    const ew = it.tex ? mathElement(it.tex, SIZE).getBoundingClientRect().width : 0;
    const total = mw + (mw && (tw || ew) ? 6 : 0) + tw + (tw && ew ? 5 : 0) + ew;
    if (cx > x && cx + total > x + maxW) { cx = x; cy += ROW; }
    if (!measure) {
      let px = cx;
      if (mw) { drawMark(ctx, it.mark, it.role, px, cy + (ROW - 14) / 2, pal); px += mw + 6; }
      if (tw) { ctx.fillStyle = it.status ? pal.ink : pal.ink2; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(it.text, px, cy + ROW / 2 + 0.5); px += tw + 5; }
      if (ew) put(it.tex, px, cy + ROW / 2, { size: SIZE, color: it.tint ? pal[it.role] : pal.ink2, halo: false });
    }
    cx += total + GAP;
  }
  return cy - y + ROW;
}
