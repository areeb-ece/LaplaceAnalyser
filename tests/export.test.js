// The parts of image export that need no browser: the GIF writer (checked by reading
// its output back with an independent decoder) and the layout of views in a picture.
import test from "node:test";
import assert from "node:assert/strict";
import { histogramOf, buildPalette, nearest, lzw, GifWriter } from "../js/lib/gif.js";
import { fitRects } from "../js/lib/treemap.js";

// A plain GIF reader, written from the format description rather than from the writer.
function readGif(bytes) {
  let p = 0;
  const u16 = () => { const v = bytes[p] | (bytes[p + 1] << 8); p += 2; return v; };
  const sig = String.fromCharCode(...bytes.subarray(0, 6)); p = 6;
  const w = u16(), h = u16(), flags = bytes[p++]; p += 2;
  const size = 1 << ((flags & 7) + 1), table = bytes.subarray(p, p + 3 * size); p += 3 * size;
  const out = { sig, w, h, table, loop: false, frames: [] };
  let gce = null;
  for (;;) {
    const b = bytes[p++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = bytes[p++];
      if (label === 0xf9) { p++; const f = bytes[p++]; const delay = u16(); const ti = bytes[p++]; p++; gce = { disposal: (f >> 2) & 7, delay, transparent: f & 1 ? ti : -1 }; continue; }
      if (label === 0xff) out.loop = true;
      for (let n = bytes[p++]; n; n = bytes[p++]) p += n;
      continue;
    }
    assert.equal(b, 0x2c, "image separator");
    const x = u16(), y = u16(), fw = u16(), fh = u16(); p++;
    const min = bytes[p++], data = [];
    for (let n = bytes[p++]; n; n = bytes[p++]) { for (let i = 0; i < n; i++) data.push(bytes[p + i]); p += n; }
    out.frames.push({ x, y, w: fw, h: fh, ...gce, pixels: unlzw(data, min, fw * fh) });
  }
  return out;
}
function unlzw(data, min, count) {
  const clear = 1 << min, eoi = clear + 1, out = [];
  let size = min + 1, dict = [], prev = null, cur = 0, bits = 0, p = 0;
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = null; size = min + 1; prev = null; };
  reset();
  while (out.length < count) {
    while (bits < size) { cur |= data[p++] << bits; bits += 8; }
    const code = cur & ((1 << size) - 1); cur >>>= size; bits -= size;
    if (code === clear) { reset(); continue; }
    if (code === eoi) break;
    let entry;
    if (code < dict.length) entry = dict[code];
    else { assert.equal(code, dict.length, "a code can be at most one ahead"); entry = prev.concat(prev[0]); }
    out.push(...entry);
    if (prev) { dict.push(prev.concat(entry[0])); if (dict.length === 1 << size && size < 12) size++; }
    prev = entry;
  }
  return out;
}
const rgbaOf = (w, h, fn) => { const px = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(fn(x, y), (y * w + x) * 4); return px; };

test("LZW output decodes to what went in, across table resets", () => {
  for (const [n, colours, min] of [[10, 2, 2], [5000, 4, 2], [60000, 200, 8], [300000, 256, 8]]) {
    let seed = n;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    const idx = Uint8Array.from({ length: n }, (_, i) => (rnd() < 0.3 ? Math.floor(rnd() * colours) : (i >> 3) % colours));
    // undo the sub-block framing (a length byte before each run of up to 255 bytes)
    const packed = lzw(idx, min), flat = [];
    for (let p = 0; packed[p]; p += packed[p] + 1) for (let i = 1; i <= packed[p]; i++) flat.push(packed[p + i]);
    assert.deepEqual(unlzw(flat, min, n), [...idx], `${n} pixels`);
  }
});

test("a GIF holds its size, loop flag, timing and pixels", () => {
  const w = 40, h = 30;
  const frames = [0, 1, 2].map((k) => rgbaOf(w, h, (x, y) => (x >= 5 + 8 * k && x < 15 + 8 * k && y >= 10 && y < 20 ? [240, 60, 60, 255] : (x + y) % 9 === 0 ? [40, 200, 90, 255] : [20, 22, 30, 255])));
  const palette = buildPalette(histogramOf(frames), 255);
  assert.deepEqual([...palette].sort((a, b) => a - b), [20, 22, 30, 40, 200, 90, 240, 60, 60].sort((a, b) => a - b), "the three flat colours, exactly");
  const gif = new GifWriter(w, h, palette, { loop: true });
  frames.forEach((f) => gif.addFrame(f, { delay: 7 }));
  const back = readGif(gif.finish());
  assert.equal(back.sig, "GIF89a");
  assert.deepEqual([back.w, back.h, back.loop, back.frames.length], [w, h, true, 3]);
  assert.ok(back.frames.every((f) => f.delay === 7 && f.disposal === 1));
  // play it: paint each frame over the last, skipping see-through pixels
  const screen = new Uint8Array(w * h * 3), map = nearest(palette);
  back.frames.forEach((f, k) => {
    f.pixels.forEach((c, i) => { if (c === f.transparent) return; const p = ((f.y + Math.floor(i / f.w)) * w + f.x + (i % f.w)) * 3; screen.set(back.table.subarray(c * 3, c * 3 + 3), p); });
    for (let i = 0; i < w * h; i++) {
      const want = map(frames[k][i * 4], frames[k][i * 4 + 1], frames[k][i * 4 + 2]);
      assert.deepEqual([...screen.subarray(i * 3, i * 3 + 3)], [...palette.subarray(want * 3, want * 3 + 3)], `frame ${k}, pixel ${i}`);
    }
  });
  assert.ok(back.frames[1].w < w && back.frames[1].h < h, "later frames store only what changed");
});

test("a see-through GIF stores whole frames and clears between them", () => {
  const w = 16, h = 12, frames = [0, 1].map((k) => rgbaOf(w, h, (x, y) => (Math.hypot(x - 5 - 4 * k, y - 6) < 4 ? [200, 180, 40, 255] : [0, 0, 0, 0])));
  const gif = new GifWriter(w, h, buildPalette(histogramOf(frames), 255), { transparent: true });
  frames.forEach((f) => gif.addFrame(f));
  const back = readGif(gif.finish());
  assert.ok(back.frames.every((f) => f.w === w && f.h === h && f.disposal === 2 && f.transparent >= 0));
  assert.equal(back.frames[0].pixels[0], back.frames[0].transparent, "the corner is see-through");
  assert.notEqual(back.frames[0].pixels[6 * w + 5], back.frames[0].transparent, "the disc is not");
});

test("the palette is no bigger than asked and keeps flat colours exact enough", () => {
  const px = rgbaOf(64, 64, (x, y) => [x * 4, y * 4, (x * y) % 256, 255]);
  const palette = buildPalette(histogramOf([px]), 255);
  assert.ok(palette.length / 3 <= 255 && palette.length / 3 > 200);
  const map = nearest(palette);
  let worst = 0;
  for (let i = 0; i < px.length; i += 4) { const c = map(px[i], px[i + 1], px[i + 2]) * 3; worst = Math.max(worst, Math.abs(palette[c] - px[i]), Math.abs(palette[c + 1] - px[i + 1])); }
  assert.ok(worst < 48, `largest error ${worst}`);
});

test("views fill the picture in proportion to their sizes", () => {
  const rect = { x: 10, y: 20, w: 1600, h: 900 };
  for (const weights of [[1], [2, 1], [1, 1, 1], [3.5, 2, 2, 1], [2, 2, 2, 2, 2, 2, 2], [3.5, 1, 1, 1, 1, 1, 1], [1, 3.5, 2, 1, 2]]) {
    const cells = fitRects(weights, rect), total = weights.reduce((a, b) => a + b, 0);
    assert.equal(cells.length, weights.length);
    cells.forEach((c, i) => {
      assert.ok(Math.abs(c.w * c.h - (weights[i] / total) * rect.w * rect.h) < 1e-6 * rect.w * rect.h, "area in proportion");
      assert.ok(c.x >= rect.x - 1e-9 && c.y >= rect.y - 1e-9 && c.x + c.w <= rect.x + rect.w + 1e-9 && c.y + c.h <= rect.y + rect.h + 1e-9, "inside the picture");
      assert.ok(Math.max(c.w / c.h, c.h / c.w) < 3.2, `not a sliver: ${c.w.toFixed(0)} × ${c.h.toFixed(0)}`);
    });
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j], overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-6;
      assert.ok(!overlap, "no two overlap");
    }
  }
});

test("a view can ask for a shape, and a slightly different picture is laid out the same way", () => {
  const weights = [2, 2, 2, 2, 2], shapes = [1.5, 2, 1.25, 1.25, 1.25];
  const a = fitRects(weights, { x: 0, y: 0, w: 1280, h: 720 }, shapes), b = fitRects(weights, { x: 0, y: 0, w: 1280, h: 721.4 }, shapes);
  a.forEach((c, i) => {
    assert.ok(c.w >= c.h * 0.8, `view ${i} isn't a tall strip: ${c.w.toFixed(0)} × ${c.h.toFixed(0)}`);
    assert.ok(Math.abs(c.x - b[i].x) < 2 && Math.abs(c.w - b[i].w) < 2, "same columns");
  });
});
