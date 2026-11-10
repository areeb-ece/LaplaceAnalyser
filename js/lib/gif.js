// A GIF89a writer: a shared palette chosen from the frames by median cut, each frame
// reduced to it (with a fixed dither pattern, so still areas stay still), frames stored
// as the part that changed since the one before, and LZW compression. Pure: no DOM.
//
//   const pal = buildPalette(histogramOf([rgba, …]), 255);
//   const gif = new GifWriter(width, height, pal, { loop: true });
//   gif.addFrame(rgba, { delay: 7 });          // delay in hundredths of a second
//   const bytes = gif.finish();                // Uint8Array

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bin = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/**
 * How often each colour occurs across some RGBA frames, in 32768 bins (5 bits a
 * channel), with the true colours in each bin added up so a bin's average is exact.
 * See-through pixels don't count. Pass the result back in to add more frames to it.
 */
export function histogramOf(frames, hist = { n: new Uint32Array(32768), sum: new Float64Array(32768 * 3) }) {
  for (const px of frames) {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      const k = bin(px[i], px[i + 1], px[i + 2]);
      hist.n[k]++;
      hist.sum[k * 3] += px[i]; hist.sum[k * 3 + 1] += px[i + 1]; hist.sum[k * 3 + 2] += px[i + 2];
    }
  }
  return hist;
}

/**
 * Up to max colours that represent the histogram well, as a flat [r, g, b, …] array:
 * the colours are sorted into boxes, the widest well-used box is cut in two until
 * there are enough, and each box gives the average of what is in it. A flat colour
 * that has a box to itself comes out exactly.
 */
export function buildPalette(hist, max = 255) {
  const all = [];
  for (let i = 0; i < 32768; i++) if (hist.n[i]) all.push({ c: [hist.sum[i * 3] / hist.n[i], hist.sum[i * 3 + 1] / hist.n[i], hist.sum[i * 3 + 2] / hist.n[i]], n: hist.n[i] });
  if (!all.length) return new Uint8Array([0, 0, 0]);
  const span = (box) => {
    let best = 0, axis = 0;
    for (let a = 0; a < 3; a++) {
      let lo = 255, hi = 0;
      for (const e of box) { if (e.c[a] < lo) lo = e.c[a]; if (e.c[a] > hi) hi = e.c[a]; }
      if (hi - lo > best) { best = hi - lo; axis = a; }
    }
    return { best, axis };
  };
  const boxes = [{ list: all, ...span(all), n: all.reduce((s, e) => s + e.n, 0) }];
  while (boxes.length < max) {
    // split the box that is both wide and well used; a box of one colour can't be split
    let pick = -1, score = 0;
    boxes.forEach((b, i) => { const v = b.best * Math.sqrt(b.n); if (b.list.length > 1 && v > score) { score = v; pick = i; } });
    if (pick < 0) break;
    const box = boxes[pick], axis = box.axis;
    box.list.sort((p, q) => p.c[axis] - q.c[axis]);
    let acc = 0, cut = 1;
    for (let i = 0; i < box.list.length - 1; i++) { acc += box.list[i].n; cut = i + 1; if (acc >= box.n / 2) break; }
    const a = box.list.slice(0, cut), b = box.list.slice(cut);
    boxes[pick] = { list: a, ...span(a), n: a.reduce((s, e) => s + e.n, 0) };
    boxes.push({ list: b, ...span(b), n: b.reduce((s, e) => s + e.n, 0) });
  }
  const out = new Uint8Array(boxes.length * 3);
  boxes.forEach((box, i) => { for (let a = 0; a < 3; a++) out[i * 3 + a] = Math.round(box.list.reduce((s, e) => s + e.c[a] * e.n, 0) / box.n); });
  return out;
}

/** (r, g, b) → index of the nearest palette colour, remembered per 5-bit colour. */
export function nearest(palette) {
  const n = palette.length / 3, memo = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const key = bin(r, g, b);
    let hit = memo[key];
    if (hit >= 0) return hit;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const dr = palette[i * 3] - r, dg = palette[i * 3 + 1] - g, db = palette[i * 3 + 2] - b, d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < best) { best = d; hit = i; }
    }
    return (memo[key] = hit);
  };
}

/** GIF's LZW: palette indices → the bytes of the image data, cut into sub-blocks. */
export function lzw(indices, minCode) {
  const clear = 1 << minCode, eoi = clear + 1, out = [];
  let size = minCode + 1, next = eoi + 1, cur = 0, bits = 0, block = [];
  let table = new Map();
  const emit = (code) => {
    cur |= code << bits; bits += size;
    while (bits >= 8) {
      block.push(cur & 255); cur >>>= 8; bits -= 8;
      if (block.length === 255) { out.push(255, ...block); block = []; }
    }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = (prefix << 8) | k, code = table.get(key);
    if (code !== undefined) { prefix = code; continue; }
    emit(prefix);
    if (next === 4096) { emit(clear); next = eoi + 1; size = minCode + 1; table = new Map(); }
    else { if (next >= 1 << size) size++; table.set(key, next++); }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) block.push(cur & 255);
  if (block.length) out.push(block.length, ...block);
  out.push(0);
  return out;
}

export class GifWriter {
  /**
   * @param palette  flat [r, g, b, …], at most 255 colours (one index is kept for "see-through")
   * @param o.loop   play forever
   * @param o.transparent  the picture itself has see-through parts, so every frame is
   *                 stored whole and cleared before the next; otherwise a frame stores
   *                 only what changed
   * @param o.dither break smooth gradients up with a fixed pattern
   */
  constructor(width, height, palette, o = {}) {
    this.w = width; this.h = height; this.o = o;
    const colours = Math.min(255, palette.length / 3);
    this.clearIndex = colours; // the extra entry that means "see-through" or "unchanged"
    this.bitsPer = Math.max(2, Math.ceil(Math.log2(colours + 1)));
    this.table = new Uint8Array(3 << this.bitsPer);
    this.table.set(palette.subarray(0, colours * 3));
    this.map = nearest(palette.subarray(0, colours * 3));
    this.prev = null;
    const b = this.bytes = [];
    for (const ch of "GIF89a") b.push(ch.charCodeAt(0));
    b.push(width & 255, width >> 8, height & 255, height >> 8, 0xf0 | (this.bitsPer - 1), 0, 0, ...this.table);
    if (o.loop) b.push(0x21, 0xff, 11, ...[..."NETSCAPE2.0"].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  }
  /** Reduce an RGBA frame to palette indices. */
  index(rgba) {
    const { w, h, map, clearIndex } = this, out = new Uint8Array(w * h), dither = this.o.dither;
    for (let y = 0, i = 0, p = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4, p++) {
        if (rgba[i + 3] < 128) { out[p] = clearIndex; continue; }
        if (!dither) { out[p] = map(rgba[i], rgba[i + 1], rgba[i + 2]); continue; }
        const d = BAYER[((y & 3) << 2) | (x & 3)] - 7.5; // ±7.5, about one 5-bit step
        const r = rgba[i] + d, g = rgba[i + 1] + d, b = rgba[i + 2] + d;
        out[p] = map(r < 0 ? 0 : r > 255 ? 255 : r, g < 0 ? 0 : g > 255 ? 255 : g, b < 0 ? 0 : b > 255 ? 255 : b);
      }
    }
    return out;
  }
  /** Add a frame. delay is in hundredths of a second. */
  addFrame(rgba, { delay = 10 } = {}) {
    const { w, h, clearIndex, bytes: b } = this, idx = this.index(rgba);
    let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1, data = idx, disposal = 2;
    if (!this.o.transparent) {
      disposal = 1;
      if (this.prev) {
        // keep only what changed: its bounding box, with unchanged pixels inside it see-through
        x0 = w; y0 = h; x1 = -1; y1 = -1;
        for (let y = 0, p = 0; y < h; y++) for (let x = 0; x < w; x++, p++) if (idx[p] !== this.prev[p]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) { x0 = y0 = x1 = y1 = 0; } // nothing moved: a one-pixel frame keeps the timing
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        data = new Uint8Array(bw * bh);
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const p = (y0 + y) * w + x0 + x; data[y * bw + x] = idx[p] === this.prev[p] ? clearIndex : idx[p]; }
      }
      this.prev = idx;
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    b.push(0x21, 0xf9, 4, (disposal << 2) | 1, delay & 255, delay >> 8, clearIndex, 0);
    b.push(0x2c, x0 & 255, x0 >> 8, y0 & 255, y0 >> 8, bw & 255, bw >> 8, bh & 255, bh >> 8, 0, this.bitsPer);
    const packed = lzw(data, this.bitsPer);
    for (let i = 0; i < packed.length; i++) b.push(packed[i]);
  }
  finish() { this.bytes.push(0x3b); return new Uint8Array(this.bytes); }
}
