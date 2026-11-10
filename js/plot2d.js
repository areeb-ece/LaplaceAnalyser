// What the 2D views share: a canvas that fills its panel, the two kinds of axes (a
// complex plane with equal scales, and value against time), arrows and labels.
import { h } from "./ui.js";

/**
 * A canvas that fills box at the screen's pixel density and calls draw whenever its
 * size changes. Drawing is in CSS pixels. Returns { canvas, ctx, size: { w, h } }.
 */
export function fitCanvas(box, draw) {
  const canvas = h("canvas"), ctx = canvas.getContext("2d"), size = { w: 0, h: 0 };
  box.append(canvas);
  new ResizeObserver(() => {
    const w = Math.floor(box.clientWidth), hgt = Math.floor(box.clientHeight);
    if (!w || !hgt) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size.w = w; size.h = hgt;
    draw();
  }).observe(box);
  return { canvas, ctx, size };
}

/** A tick spacing of 1, 2 or 5 × 10^k giving about `count` ticks across `span`. */
export function niceStep(span, count) {
  const raw = span / Math.max(1, count), e = 10 ** Math.floor(Math.log10(raw)), f = raw / e;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e;
}
const tidy = (v, step) => { const r = Math.round(v / step) * step; return Math.abs(r) < step / 1e6 ? 0 : Number(r.toPrecision(10)); };
export const tickText = (v) => String(v).replace("-", "−");

/**
 * The mapping for a complex plane: the square win = { cx, cy, half } fits inside the
 * w × h box with the same scale on both axes (so circles are circles).
 */
export function planeFrame(w, hgt, win) {
  const k = Math.min(w, hgt) / (2 * win.half);
  return {
    w, h: hgt, k, win,
    x: (re) => w / 2 + (re - win.cx) * k,
    y: (im) => hgt / 2 - (im - win.cy) * k,
    re: (x) => win.cx + (x - w / 2) / k,
    im: (y) => win.cy - (y - hgt / 2) / k,
  };
}
/** The square window that holds every point given (as [re, im] pairs), with a margin. */
export function fitWindow(points, margin = 1.18, least = 1e-9) {
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  for (const [x, y] of points) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, half: Math.max(least, (margin * Math.max(x1 - x0, y1 - y0)) / 2) };
}

/** Grid, axes and tick labels of a complex plane. Imaginary ticks read i, 2i, −i. */
export function drawPlane(ctx, f, pal, { labels = true } = {}) {
  const step = niceStep(Math.max(f.w, f.h) / f.k, Math.max(f.w, f.h) / 72);
  const reLo = f.re(0), reHi = f.re(f.w), imLo = f.im(f.h), imHi = f.im(0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.rule2;
  ctx.beginPath();
  for (let v = Math.ceil(reLo / step) * step; v <= reHi; v += step) { const x = Math.round(f.x(v)) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, f.h); }
  for (let v = Math.ceil(imLo / step) * step; v <= imHi; v += step) { const y = Math.round(f.y(v)) + 0.5; ctx.moveTo(0, y); ctx.lineTo(f.w, y); }
  ctx.stroke();
  ctx.strokeStyle = pal.ink4;
  ctx.beginPath();
  const ax = Math.round(f.x(0)) + 0.5, ay = Math.round(f.y(0)) + 0.5;
  ctx.moveTo(ax, 0); ctx.lineTo(ax, f.h); ctx.moveTo(0, ay); ctx.lineTo(f.w, ay);
  ctx.stroke();
  if (!labels) return;
  ctx.font = `11px ${pal.mono}`;
  ctx.fillStyle = pal.ink3;
  // labels sit by their axis, or along the edge when the axis is out of view
  const ly = Math.min(Math.max(ay + 5, 4), f.h - 16), lx = Math.min(Math.max(ax - 6, 30), f.w - 4);
  ctx.textBaseline = "top"; ctx.textAlign = "center";
  for (let v = Math.ceil(reLo / step) * step; v <= reHi; v += step) {
    const t = tidy(v, step);
    if (t !== 0 && f.x(t) > 16 && f.x(t) < f.w - 16) ctx.fillText(tickText(t), f.x(t), ly);
  }
  ctx.textBaseline = "middle"; ctx.textAlign = "right";
  for (let v = Math.ceil(imLo / step) * step; v <= imHi; v += step) {
    const t = tidy(v, step);
    if (t !== 0 && f.y(t) > 10 && f.y(t) < f.h - 10) ctx.fillText((t === 1 ? "" : t === -1 ? "−" : tickText(t)) + "i", lx, f.y(t));
  }
}

/** An arrow from (x0, y0) to (x1, y1), in pixels. */
export function arrow(ctx, x0, y0, x1, y1, color, width = 2, head = 9) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (!(len > 0.5)) return;
  const ux = dx / len, uy = dy / len, hl = Math.min(head, len * 0.6), hw = hl * 0.42;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * hl * 0.8, y1 - uy * hl * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * hl + uy * hw, y1 - uy * hl - ux * hw);
  ctx.lineTo(x1 - ux * hl - uy * hw, y1 - uy * hl + ux * hw);
  ctx.closePath();
  ctx.fill();
}

/** Text with a halo of the sheet colour, so it stays readable over lines. */
export function label(ctx, text, x, y, color, pal, { align = "left", baseline = "alphabetic", size = 12 } = {}) {
  ctx.font = `${size}px ${pal.mono}`;
  ctx.textAlign = align; ctx.textBaseline = baseline;
  ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = pal.sheet;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** A dot with a ring of the sheet colour round it. */
export function dot(ctx, x, y, color, pal, r = 4.5) {
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, 2 * Math.PI); ctx.fillStyle = pal.sheet; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
}

/** A polyline through points given by x(i), y(i) for i in [from, to]. */
export function trace(ctx, from, to, x, y, color, width = 2) {
  if (to <= from) return;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x(from), y(from));
  for (let i = from + 1; i <= to; i++) ctx.lineTo(x(i), y(i));
  ctx.stroke();
}
