// "Save as an image", as in the other tools, for a workspace of live plots: choose the
// views and how big each is, the picture's shape and size, the sheet, what to show, and
// whether it's a still (PNG), or time playing from 0 to the end of the window as a GIF
// or a video. The preview is the picture itself, drawn smaller.
import { h, icon, storage } from "../ui.js";
import { m } from "../math.js";
import { renderFrame } from "./render.js";
import { histogramOf, buildPalette, GifWriter } from "../lib/gif.js";

const KEY = "laplaceanalyser.image";
const ORDER = ["surface", "time", "pz", "integrand", "integral", "decomp", "steps"];
const RATIOS = { "16:9": 16 / 9, "3:2": 3 / 2, "4:3": 4 / 3, "1:1": 1, "3:4": 3 / 4, "9:16": 9 / 16 };
const LAYOUT = { small: 1700, normal: 1280, large: 960 }; // the page width the picture is laid out at
const WIDTH = { png: 1920, gif: 960, video: 1280 };
const VIDEO_TYPES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const DEFAULTS = {
  views: null, sizes: {}, format: "png", ratio: "16:9", width: WIDTH.png, height: 1080, text: "normal", theme: "current",
  transparent: false, title: true, titles: true, keys: true, probe: true, cursor: true, seconds: 8, fps: 15,
};
const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const tick = () => new Promise((r) => setTimeout(r));

/**
 * @param store     the app's store
 * @param views     every view module
 * @param instance  id → that view's mounted instance (mounting it if it hasn't been)
 * @param openIds   () → the ids of the views open in the workspace
 */
export function createExporter({ store, views, instance, openIds }) {
  const byId = Object.fromEntries(views.map((v) => [v.id, v]));
  const prefs = { ...DEFAULTS, ...(storage.get(KEY) || {}) };
  const videoType = window.MediaRecorder && HTMLCanvasElement.prototype.captureStream ? VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) : null;
  let dlg = null, env = null, busy = null, timer = 0, ui = {};

  // ── small controls ──
  const seg = (options, get, set, label) => {
    const el = h("div", { class: "sd-seg", role: "radiogroup", "aria-label": label }, options.map((opt) => h("button", { type: "button", role: "radio", "data-v": opt.value, disabled: !!opt.disabled, title: opt.title, on: { click: () => { set(opt.value); changed(); } } }, opt.label)));
    el.sync = () => { for (const b of el.children) b.setAttribute("aria-checked", String(b.dataset.v === String(get()))); };
    return el;
  };
  const check = (label, key) => {
    const box = h("input", { type: "checkbox", on: { change: () => { prefs[key] = box.checked; changed(); } } });
    const el = h("label", { class: "sd-check" }, box, ...[].concat(label));
    el.sync = () => { box.checked = !!prefs[key]; };
    el.box = box;
    return el;
  };
  const group = (title, ...kids) => h("fieldset", { class: "sd-fieldset" }, h("legend", { text: title }), ...kids);
  const select = (options, key, label, cast = String) => {
    const el = h("select", { "aria-label": label, on: { change: () => { prefs[key] = cast(el.value); changed(); } } }, options.map((o) => h("option", { value: o.value, text: o.label })));
    const wrap = h("span", { class: "sd-select sd-small" }, el);
    wrap.sync = () => { el.value = String(prefs[key]); };
    return wrap;
  };

  // ── what the options mean ──
  const picked = () => ORDER.filter((id) => prefs.views.includes(id) && (id !== "surface" || env?.surface));
  function spec(maxWidth) {
    const ratio = prefs.ratio === "custom" ? prefs.width / prefs.height : RATIOS[prefs.ratio];
    let width = even(Math.min(4096, Math.max(320, prefs.width))), height = even(prefs.ratio === "custom" ? Math.min(4096, Math.max(200, prefs.height)) : width / ratio);
    const layoutHeight = (height * LAYOUT[prefs.text]) / width; // the same layout whatever size it's drawn at
    if (maxWidth && width > maxWidth) { height = even((height * maxWidth) / width); width = even(maxWidth); }
    const moving = prefs.format !== "png";
    return {
      views: picked().map((id) => ({ id, size: prefs.sizes[id] || "m" })), width, height, layout: LAYOUT[prefs.text], layoutHeight, theme: prefs.theme,
      transparent: prefs.transparent && prefs.format !== "video", title: prefs.title, titles: prefs.titles, keys: prefs.keys, probe: prefs.probe, cursor: prefs.cursor,
      frames: moving ? Math.max(2, Math.round(prefs.seconds * prefs.fps)) : 1,
    };
  }
  // A still shows the cursor where it is, or the whole window when the cursor is left out.
  const at = (t) => ({ ...store.state, time: { ...store.state.time, t } });
  const stillTime = () => (prefs.cursor ? store.state.time.t : store.state.time.tMax);
  const fileName = () => {
    const { input } = store.state, typed = input[{ ode: "ode", function: "fn", rational: "rational" }[input.mode]];
    const slug = typed.toLowerCase().replace(/'/g, "p").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return "laplace-analyser" + (slug ? "-" + slug : "");
  };

  // ── the dialog ──
  function build() {
    ui.views = ORDER.map((id) => {
      const box = h("input", { type: "checkbox", on: { change: () => { prefs.views = box.checked ? prefs.views.concat(id) : prefs.views.filter((v) => v !== id); changed(); } } });
      const size = seg([{ value: "s", label: "S", title: "Small" }, { value: "m", label: "M", title: "Medium" }, { value: "l", label: "L", title: "Large" }], () => prefs.sizes[id] || "m", (v) => (prefs.sizes[id] = v), `Size of ${byId[id].title}`);
      const row = h("div", { class: "ex-view" }, h("label", { class: "sd-check" }, box, byId[id].title), size);
      row.sync = () => {
        const off = id === "surface" && !env.surface;
        box.checked = prefs.views.includes(id) && !off;
        box.disabled = off;
        row.title = off ? "The surface needs WebGL, which this browser doesn't have" : "";
        size.sync();
        for (const b of size.children) b.disabled = !box.checked;
      };
      return row;
    });
    ui.format = seg([{ value: "png", label: "PNG" }, { value: "gif", label: "GIF" }, { value: "video", label: "Video", disabled: !videoType, title: videoType ? "" : "This browser can't record video" }], () => prefs.format, (v) => {
      if (prefs.width === WIDTH[prefs.format]) prefs.width = WIDTH[v]; // a size the format suggested moves with the format
      prefs.format = v;
    }, "Format");
    ui.ratio = select([...Object.keys(RATIOS).map((r) => ({ value: r, label: r.replace(":", " : ") })), { value: "custom", label: "Custom" }], "ratio", "Shape");
    const size = (key, label) => {
      const el = h("input", { class: "sd-input sd-small sd-mono", type: "number", min: 200, max: 4096, step: 10, "aria-label": label, on: { change: () => { const v = Number(el.value); if (Number.isFinite(v) && v > 0) prefs[key] = v; changed(); } } });
      el.sync = () => { el.value = String(key === "height" ? spec().height : spec().width); };
      return el;
    };
    ui.width = size("width", "Width in pixels");
    ui.height = size("height", "Height in pixels");
    ui.text = seg([{ value: "small", label: "Small" }, { value: "normal", label: "Normal" }, { value: "large", label: "Large" }], () => prefs.text, (v) => (prefs.text = v), "Text and lines");
    ui.theme = seg([{ value: "current", label: "Current theme" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light / print" }], () => prefs.theme, (v) => (prefs.theme = v), "Sheet");
    ui.transparent = check("See-through background", "transparent");
    ui.shows = [check("Title block", "title"), check("Panel titles", "titles"), check("Keys and values", "keys"), check(["Probe point ", m("s")], "probe"), check("Time cursor", "cursor")];
    ui.seconds = select([4, 6, 8, 12, 20].map((v) => ({ value: v, label: `${v} seconds` })), "seconds", "Length", Number);
    ui.fps = select([10, 15, 20, 25, 30, 60].map((v) => ({ value: v, label: `${v} frames a second` })), "fps", "Smoothness", Number);
    ui.motion = group("Time playing", h("div", { class: "ex-two" }, ui.seconds, ui.fps));
    ui.canvas = h("canvas", { class: "ex-canvas", role: "img", "aria-label": "Preview of the picture" });
    ui.note = h("p", { class: "sd-hint" });
    ui.status = h("p", { class: "ex-status", role: "status", "aria-live": "polite" });
    ui.progress = h("progress", { max: 1, value: 0, hidden: true, "aria-label": "Progress" });
    ui.save = h("button", { class: "sd-btn sd-primary", type: "button", on: { click: save } }, "Save");
    ui.copy = h("button", { class: "sd-btn", type: "button", title: "Copy the picture to the clipboard", on: { click: copy } }, "Copy");
    ui.stop = h("button", { class: "sd-btn", type: "button", hidden: true, on: { click: () => { if (busy) busy.stop = true; } } }, "Stop");
    dlg = h("dialog", { class: "sd-dialog export", "aria-labelledby": "exTitle" },
      h("header", null, h("h2", { id: "exTitle", text: "Save as an image" }), h("button", { class: "sd-btn sd-ghost sd-icon", type: "button", "aria-label": "Close", on: { click: () => dlg.close() } }, icon("close"))),
      h("div", { class: "sd-body ex-grid" },
        h("div", { class: "ex-opts" },
          group("Views and their sizes", ...ui.views),
          group("Format", ui.format),
          group("Shape", h("div", { class: "ex-shape" }, ui.ratio, ui.width, h("span", { "aria-hidden": "true", text: "×" }), ui.height, h("span", { text: "px" }))),
          group("Text and lines", ui.text),
          group("Sheet", ui.theme, ui.transparent),
          group("Show", ...ui.shows),
          ui.motion),
        h("div", { class: "ex-side" }, h("div", { class: "ex-frame" }, ui.canvas), ui.note)),
      h("footer", null, ui.progress, ui.status, ui.stop, ui.copy, ui.save));
    dlg.addEventListener("close", () => { if (busy) busy.stop = true; });
    dlg.addEventListener("cancel", (e) => { if (busy) { busy.stop = true; e.preventDefault(); } }); // Escape stops a recording first
    document.body.append(dlg);
  }

  function sync() {
    for (const el of [...ui.views, ui.format, ui.ratio, ui.width, ui.height, ui.text, ui.theme, ui.transparent, ...ui.shows, ui.seconds, ui.fps]) el.sync();
    const moving = prefs.format !== "png", sp = spec();
    ui.height.disabled = prefs.ratio !== "custom";
    ui.motion.hidden = !moving;
    ui.transparent.box.disabled = prefs.format === "video";
    ui.transparent.title = prefs.format === "video" ? "A video can't be see-through" : "";
    ui.copy.hidden = moving || !navigator.clipboard?.write || !window.ClipboardItem;
    ui.save.textContent = { png: "Save image", gif: "Save GIF", video: `Save video (${/mp4/.test(videoType || "") ? "MP4" : "WebM"})` }[prefs.format];
    ui.save.disabled = ui.copy.disabled = !sp.views.length || !!busy;
    ui.frame = ui.canvas.parentElement;
    ui.frame.toggleAttribute("data-clear", sp.transparent);
    const big = moving && sp.width * sp.height * sp.frames > 150e6;
    ui.note.textContent = !sp.views.length ? "Tick at least one view."
      : `${sp.width.toLocaleString()} × ${sp.height.toLocaleString()} px` + (moving ? `, ${sp.frames} frames` : "") + (prefs.format === "video" ? ". Recording takes as long as the clip." : big ? ". At this size it will take a while and make a large file." : ".");
  }
  function changed() {
    storage.set(KEY, prefs);
    sync();
    clearTimeout(timer);
    timer = setTimeout(preview, 60);
  }
  async function preview() {
    if (busy || !dlg.open) return;
    const sp = spec(Math.min(900, Math.max(360, ui.frame.clientWidth * (window.devicePixelRatio || 1))));
    if (!sp.views.length) { ui.canvas.width = ui.canvas.width; return; }
    // a moving picture is previewed part of the way through
    await renderFrame(ui.canvas, sp, at(prefs.format === "png" ? stillTime() : store.state.time.tMax * 0.6), env);
  }

  // ── saving ──
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = h("a", { href: url, download: name });
    dlg.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  const say = (text) => { ui.status.textContent = text; };
  const pngBlob = (canvas) => new Promise((done) => canvas.toBlob(done, "image/png"));

  async function run(job) {
    busy = { stop: false };
    ui.progress.hidden = false; ui.progress.value = 0; ui.stop.hidden = false;
    say("");
    sync();
    try { await job(busy, (f) => { ui.progress.value = f; }); }
    catch (e) { say("That didn't work: " + e.message); }
    busy = null;
    ui.progress.hidden = true; ui.stop.hidden = true;
    sync();
    preview();
  }
  const save = () => run(async (job, progress) => {
    const sp = spec(), name = fileName(), canvas = document.createElement("canvas"), size = `${sp.width.toLocaleString()} × ${sp.height.toLocaleString()} px`;
    if (prefs.format === "png") {
      await renderFrame(canvas, sp, at(stillTime()), env);
      download(await pngBlob(canvas), name + ".png");
      say(`Saved ${name}.png · ${size}`);
    } else if (prefs.format === "gif") {
      const bytes = await gif(canvas, sp, job, progress);
      if (!bytes) { say("Stopped. Nothing was saved."); return; }
      download(new Blob([bytes], { type: "image/gif" }), name + ".gif");
      say(`Saved ${name}.gif · ${size}, ${sp.frames} frames, ${(bytes.length / 1048576).toFixed(1)} MB`);
    } else {
      const blob = await video(canvas, sp, job, progress);
      if (!blob) { say("Stopped. Nothing was saved."); return; }
      const ext = /mp4/.test(blob.type) ? "mp4" : "webm";
      download(blob, `${name}.${ext}`);
      say(`Saved ${name}.${ext} · ${size}, ${prefs.seconds} s, ${(blob.size / 1048576).toFixed(1)} MB`);
    }
  });
  const copy = () => run(async () => {
    const sp = spec(), canvas = document.createElement("canvas");
    await renderFrame(canvas, sp, at(stillTime()), env);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": await pngBlob(canvas) })]);
    say(`Copied · ${sp.width.toLocaleString()} × ${sp.height.toLocaleString()} px`);
  });

  // Time runs from 0 to the end of the window across the frames.
  const timeOf = (k, n) => (store.state.time.tMax * k) / (n - 1);
  async function gif(canvas, sp, job, progress) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true }), n = sp.frames, probes = Math.min(n, 8);
    const pixels = () => ctx.getImageData(0, 0, sp.width, sp.height).data;
    // first a few frames spread across the clip, to choose the colours from
    let hist;
    for (let i = 0; i < probes; i++) {
      await renderFrame(canvas, sp, at(timeOf(Math.round((i * (n - 1)) / Math.max(1, probes - 1)), n)), env);
      hist = histogramOf([pixels()], hist);
      progress((i + 1) / (n + probes));
      await tick();
      if (job.stop) return null;
    }
    const out = new GifWriter(sp.width, sp.height, buildPalette(hist, 255), { loop: true, transparent: sp.transparent, dither: sp.views.some((v) => v.id === "surface") });
    const delay = Math.max(2, Math.round(100 / prefs.fps));
    for (let k = 0; k < n; k++) {
      await renderFrame(canvas, sp, at(timeOf(k, n)), env);
      out.addFrame(pixels(), { delay });
      progress((probes + k + 1) / (n + probes));
      await tick();
      if (job.stop) return null;
    }
    return out.finish();
  }
  async function video(canvas, sp, job, progress) {
    await renderFrame(canvas, sp, at(0), env);
    const rec = new MediaRecorder(canvas.captureStream(prefs.fps), { mimeType: videoType, videoBitsPerSecond: Math.min(40e6, Math.max(4e6, sp.width * sp.height * 6)) });
    const parts = [], done = new Promise((ok, fail) => { rec.onstop = ok; rec.onerror = (e) => fail(e.error || new Error("the recorder failed")); });
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.start();
    const start = performance.now(), length = prefs.seconds * 1000;
    for (;;) {
      const gone = performance.now() - start;
      await renderFrame(canvas, sp, at(store.state.time.tMax * Math.min(1, gone / length)), env);
      progress(Math.min(1, gone / length));
      await new Promise((r) => requestAnimationFrame(r));
      if (job.stop || gone >= length) break;
    }
    await new Promise((r) => setTimeout(r, 120)); // let the last frame reach the recorder
    rec.stop();
    await done;
    return job.stop ? null : new Blob(parts, { type: rec.mimeType || videoType });
  }

  return {
    async open() {
      const surface = instance("surface");
      env = { views: byId, caches: {}, surface: (await surface.ready) ? surface : null }; // new caches: the state may have changed since last time
      if (!dlg) build();
      if (!Array.isArray(prefs.views)) {
        // the first time: what's open in the workspace, or the overview's three
        const open = openIds().filter((id) => ORDER.includes(id));
        prefs.views = open.length ? open : ["surface", "time", "pz"];
      }
      say("");
      dlg.showModal();
      sync();
      preview();
    },
  };
}
