// A saved image, drawn: the chosen views laid out in the chosen shape, each drawn by
// the same function that draws it on the page, with an optional title block (the
// problem, typeset), panel titles and keys, and the credit line.
//
// spec = { views: [{ id, size }], width, height (pixels), layout (the width the picture
//          is laid out at, in page pixels: text and lines scale by width / layout),
//          layoutHeight (the height to match; given when drawing a smaller preview),
//          theme ("current" | "dark" | "light"), transparent, title, titles, keys,
//          probe, cursor }
import { palette } from "../palette.js";
import { mathCollector, mathElement } from "../math.js";
import { legendPaint } from "../legend.js";
import { fitRects } from "../lib/treemap.js";
import { texComplex } from "../lib/tex.js";

export const SITE = "areeb-ece.github.io/LaplaceAnalyser";
export const SIZES = { s: 1, m: 2, l: 3.5 };
const PAD = 14, GAP = 10, HEAD = 30, FOOT = 26;
const USES_S = ["integrand", "integral"], USES_T = ["integrand", "integral", "decomp"];
// The shape (width to height) each view reads best at.
const SHAPE = { surface: 1.5, time: 2, pz: 1.25, integrand: 1.25, integral: 1.25, decomp: 1.5, steps: 0.9 };

/**
 * Draw one picture into canvas. state is the app's state (with the time to show in
 * state.time.t). env carries what lasts between frames of an animation:
 *   env.views    { id: view module }
 *   env.surface  the surface view's mounted instance, or null if it can't draw
 *   env.caches   {} (filled in here; start a new one whenever the app's state may have changed)
 */
export async function renderFrame(canvas, spec, state, env) {
  // laid out in spec.layout × spec.layoutHeight page pixels, whatever size it is drawn at
  const scale = spec.width / spec.layout, W = spec.layout, H = spec.layoutHeight ?? spec.height / scale;
  const pal = palette(spec.theme), ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (canvas.width !== spec.width || canvas.height !== spec.height) { canvas.width = spec.width; canvas.height = spec.height; }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!spec.transparent) { ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H); }
  const labels = mathCollector(), ids = spec.views.map((v) => v.id), o = { cursor: spec.cursor, probe: spec.probe };
  let top = PAD;

  // ── the title block: the problem itself ──
  if (spec.title) {
    const src = state.model.steps[0].tex, box = mathElement(src, 17, true).getBoundingClientRect();
    const k = Math.min(1, (W - 2 * PAD) / box.width); // a long equation is shrunk to fit, never cut
    labels.put(src, PAD + 4, top, { size: Math.max(9, Math.floor(17 * k)), display: true, valign: "top", color: pal.ink, halo: false });
    top += Math.ceil(box.height * k) + 12;
  }

  // ── the footer: which s and t the picture is for (where no view says), and the credit ──
  const footY = H - PAD - FOOT / 2 + 4;
  ctx.textBaseline = "middle";
  ctx.font = `12px ${pal.mono}`;
  const siteW = ctx.measureText(SITE).width;
  ctx.fillStyle = pal.accent; ctx.textAlign = "left";
  ctx.fillText(SITE, W - PAD - siteW, footY);
  ctx.font = `700 12px ${pal.text}`; ctx.fillStyle = pal.ink2; ctx.textAlign = "right";
  ctx.fillText("made by areeb · ", W - PAD - siteW, footY);
  const facts = [];
  if (ids.some((id) => USES_S.includes(id)) && !(spec.probe && ids.some((id) => id === "pz" || id === "surface"))) facts.push("s = " + texComplex(state.probe));
  if (spec.cursor && !ids.includes("time") && ids.some((id) => USES_T.includes(id))) facts.push(`t = ${state.time.t.toFixed(2)}`);
  if (facts.length) labels.put(facts.join(",\\quad "), PAD + 4, footY, { color: pal.ink2, halo: false });

  // ── the views ──
  const area = { x: PAD, y: top, w: W - 2 * PAD, h: H - top - PAD - FOOT };
  const cells = fitRects(spec.views.map((v) => SIZES[v.size] ?? 2), { x: area.x, y: area.y, w: area.w + GAP, h: area.h + GAP }, ids.map((id) => SHAPE[id]));
  for (let n = 0; n < ids.length; n++) {
    const id = ids[n], view = env.views[id], c = { x: cells[n].x, y: cells[n].y, w: cells[n].w - GAP, h: cells[n].h - GAP };
    if (c.w < 40 || c.h < 40) continue;
    if (!spec.transparent) { ctx.fillStyle = pal.sheet; ctx.beginPath(); ctx.roundRect(c.x, c.y, c.w, c.h, 10); ctx.fill(); }
    let py = c.y, ph = c.h;
    if (spec.titles) {
      ctx.font = `600 12.5px ${pal.text}`; ctx.fillStyle = pal.ink2; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(view.title, c.x + 12, c.y + HEAD / 2 + 1);
      py += HEAD; ph -= HEAD;
    }
    const cache = ((env.caches ??= {})[id] ??= {});
    const items = spec.keys && view.legend ? view.legend(state, o, cache) : null;
    if (items?.length) {
      const lh = legendPaint(ctx, items, c.x + 12, 0, c.w - 24, pal, labels.put, true);
      if (ph - lh - 8 > 60) { legendPaint(ctx, items, c.x + 12, py + ph - lh - 6, c.w - 24, pal, labels.put); ph -= lh + 8; }
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(c.x, py, c.w, ph); ctx.clip();
    if (id === "surface") await surface(ctx, { x: c.x, y: py, w: c.w, h: ph }, spec, scale, pal, env, labels);
    else {
      ctx.translate(c.x, py);
      await view.paint({ ctx, w: c.w, h: ph, pal, math: (src, x, y, opt) => labels.put(src, c.x + x, py + y, opt) }, state, o, cache);
    }
    ctx.restore();
  }
  await labels.paint(ctx, pal, spec.transparent);
  return canvas;
}

// The surface doesn't change with time, and drawing it means borrowing the page's WebGL
// canvas: draw it once per size and look, and reuse the picture for every frame after.
async function surface(ctx, r, spec, scale, pal, env, labels) {
  if (!env.surface) return;
  const w = Math.round(r.w), h = Math.round(r.h), key = [w, h, scale, pal.theme, pal.ink, spec.probe].join("|");
  let kept = (env.caches ??= {}).surfaceShot;
  if (!kept || kept.key !== key) {
    const off = document.createElement("canvas"), list = [];
    off.width = Math.round(w * scale); off.height = Math.round(h * scale);
    const c = off.getContext("2d");
    c.scale(scale, scale);
    if (!env.surface.renderTo(c, 0, 0, w, h, { pal, probe: spec.probe, scale, put: (src, x, y, opt) => list.push({ src, x, y, opt }) })) return;
    kept = env.caches.surfaceShot = { key, off, list };
  }
  ctx.drawImage(kept.off, r.x, r.y, w, h);
  for (const l of kept.list) labels.put(l.src, r.x + l.x, r.y + l.y, l.opt);
}
