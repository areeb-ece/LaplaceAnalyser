// The shell: one shared state, the docking workspace, the layouts, the time transport
// and what is remembered between visits. Each view is a module { id, title, mount }.
import { createStore, ALL } from "./store.js";
import { createDock, stack, row, col } from "./dock.js";
import { h, icon, attachMenu, storage, clear } from "./ui.js";
import { onThemeChange } from "./palette.js";
import { tex } from "./math.js";
import { createExporter } from "./export/dialog.js";
import { analyse } from "./lib/analyse.js";
import { fmt } from "./lib/tex.js";
import { PRESETS, DEFAULT_PRESET } from "./lib/presets.js";
import input from "./views/input.js";
import steps from "./views/steps.js";
import time from "./views/time.js";
import surface from "./views/surface.js";
import pz from "./views/pz.js";
import integrand from "./views/integrand.js";
import integral from "./views/integral.js";
import decomp from "./views/decomp.js";

const VIEWS = [input, steps, time, pz, surface, integrand, integral, decomp];
const STATE_KEY = "laplaceanalyser.state", LAYOUT_KEY = "laplaceanalyser.layout", VERSION = 1;

const LAYOUTS = {
  overview: () => row([0.25, 0.45, 0.3], stack("input", "steps"), stack("surface"), col([0.5, 0.5], stack("time"), stack("pz"))),
  probe: () => row([0.42, 0.29, 0.29], stack("surface"), col([0.5, 0.5], stack("integrand"), stack("integral")), col([0.5, 0.5], stack("pz"), stack("time", "input"))),
  ode: () => row([0.32, 0.34, 0.34], col([0.54, 0.46], stack("input"), stack("steps")), col([0.5, 0.5], stack("time"), stack("pz")), stack("decomp")),
};

// ── state: the last input if there is one that still works, otherwise the first example ──
const EMPTY = { mode: "function", ode: "y'' + 2y' + 10y = 10", ics: ["0", "0"], fn: "cos(t)", rational: "(s + 3)/((s + 1)(s^2 + 2s + 5))" };
const text = (v, fallback) => (typeof v === "string" && v.length <= 400 ? v : fallback);
function restore() {
  const saved = storage.get(STATE_KEY), s = saved && saved.v === VERSION && typeof saved === "object" ? saved : {};
  const i = s.input && typeof s.input === "object" ? s.input : {};
  const input = {
    mode: ["ode", "function", "rational"].includes(i.mode) ? i.mode : EMPTY.mode,
    ode: text(i.ode, EMPTY.ode), fn: text(i.fn, EMPTY.fn), rational: text(i.rational, EMPTY.rational),
    ics: Array.isArray(i.ics) ? i.ics.slice(0, 8).map((v) => text(v, "0")) : EMPTY.ics,
  };
  const num = (v, d) => (Number.isFinite(v) ? v : d), o = s.opts && typeof s.opts === "object" ? s.opts : {};
  return {
    input,
    probe: { re: num(s.probe?.re, DEFAULT_PRESET.probe[0]), im: num(s.probe?.im, DEFAULT_PRESET.probe[1]) },
    opts: { log: o.log === true, clamp: Math.min(1, Math.max(0, num(o.clamp, 0.5))), samples: o.samples !== false },
  };
}
const first = restore();
let model = analyse(first.input);
if (!model.ok) { first.input = { ...EMPTY }; model = analyse(first.input); }
const store = createStore({
  input: first.input, model, error: null, preset: null, probe: first.probe, opts: first.opts,
  time: { t: model.tWindow, tMax: model.tWindow, playing: false, speed: 1 },
  win: { ...model.sWindow },
});
const { state } = store;

// ── actions the views call ──
const actions = {
  /** Change part of the input and work everything out again. */
  setInput(part) {
    const next = { ...state.input, ...part }, m = analyse(next);
    store.set("input", next);
    store.set("preset", null); // typed over: no longer the example as it was loaded
    store.set("error", m.ok ? null : m.message);
    if (!m.ok) return;
    store.set("model", m);
    store.set("time", { ...state.time, t: m.tWindow, tMax: m.tWindow, playing: false });
    store.set("win", { ...m.sWindow });
  },
  /** Load a built-in example: its input, how much time to show, and where the probe goes. */
  loadPreset(id) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    actions.setInput(p.input);
    store.set("preset", id);
    if (p.tMax) store.set("time", { ...state.time, t: p.tMax, tMax: p.tMax });
    // unless the example says where, half a unit into the region of convergence
    store.set("probe", p.probe ? { re: p.probe[0], im: p.probe[1] } : { re: Math.round((state.model.roc + 0.5) * 2) / 2, im: 1 });
  },
};

// ── the workspace ──
const host = document.getElementById("dock");
const made = {};
const dock = createDock(host, {
  titles: Object.fromEntries(VIEWS.map((v) => [v.id, v.title])),
  elFor(id) {
    if (!made[id]) {
      const el = h("div", { class: "view", "data-view": id });
      made[id] = { el, view: VIEWS.find((v) => v.id === id).mount(el, store, actions) };
    }
    return made[id].el;
  },
  // a view that was off screen missed every change: tell it all of them
  onShow: (id) => requestAnimationFrame(() => made[id]?.view.update?.(state, ALL)),
  onChange: () => storage.set(LAYOUT_KEY, { v: VERSION, tree: dock.get() }),
});
const savedLayout = storage.get(LAYOUT_KEY);
if (!(savedLayout?.v === VERSION && savedLayout.tree && dock.set(savedLayout.tree))) dock.set(LAYOUTS.overview());

for (const b of document.querySelectorAll("[data-layout]")) {
  b.addEventListener("click", () => {
    dock.set(LAYOUTS[b.dataset.layout]());
    // "Solve an ODE" on a plain function would have nothing to solve
    if (b.dataset.layout === "ode" && state.input.mode !== "ode") actions.setInput({ mode: "ode" });
  });
}
document.getElementById("btnReset").addEventListener("click", () => { storage.remove(LAYOUT_KEY); dock.set(LAYOUTS.overview()); });
attachMenu(document.getElementById("btnViews"), () => VIEWS.map((v) => ({
  label: v.title, checked: dock.isOpen(v.id), run: () => (dock.isOpen(v.id) ? dock.close(v.id) : dock.open(v.id)),
})));
// Saving pictures: a view that was never opened is made now, off the page, so it can be drawn.
const instance = (id) => { dock.elFor(id); return made[id].view; };
const exporter = createExporter({ store, views: VIEWS, instance, openIds: () => VIEWS.map((v) => v.id).filter((id) => dock.isOpen(id)) });
document.getElementById("btnImage").addEventListener("click", () => exporter.open());
const narrow = matchMedia("(max-width: 899px)");
const setNarrow = () => dock.setStacked(narrow.matches);
narrow.addEventListener("change", setNarrow);
setNarrow();

// ── time: one transport for every view ──
const playBtn = document.getElementById("btnPlay"), range = document.getElementById("timeRange"), out = document.getElementById("timeOut"), speedSeg = document.getElementById("speedSeg");
let lastTick = 0;
function tick(now) {
  if (!state.time.playing) return;
  const { t, tMax, speed } = state.time, dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;
  // the whole window takes between 6 and 20 seconds at 1×, however long it is
  const next = t + (dt * speed * tMax) / Math.min(20, Math.max(6, tMax));
  store.patch("time", next >= tMax ? { t: tMax, playing: false } : { t: next });
  requestAnimationFrame(tick);
}
function togglePlay() {
  const { playing, t, tMax } = state.time;
  if (playing) { store.patch("time", { playing: false }); return; }
  store.patch("time", { playing: true, t: t >= tMax ? 0 : t });
  lastTick = performance.now();
  requestAnimationFrame(tick);
}
playBtn.addEventListener("click", togglePlay);
range.addEventListener("input", () => store.patch("time", { t: Number(range.value), playing: false }));
for (const b of speedSeg.children) b.addEventListener("click", () => store.patch("time", { speed: Number(b.dataset.speed) }));
let playShown = null;
function drawTransport() {
  const { t, tMax, playing, speed } = state.time;
  if (playShown !== playing) {
    playShown = playing;
    clear(playBtn).append(icon(playing ? "pause" : "play"), playing ? "Pause" : "Play");
    playBtn.setAttribute("aria-pressed", String(playing));
  }
  range.max = String(tMax);
  range.value = String(t);
  tex(out, `t = ${t.toFixed(tMax >= 100 ? 1 : 2)}\\ \\mathrm{s}`);
  range.setAttribute("aria-valuetext", `${fmt(t)} seconds of ${fmt(tMax)}`);
  for (const b of speedSeg.children) b.setAttribute("aria-checked", String(Number(b.dataset.speed) === speed));
}
// The probe, as numbers: the exact way to place it, and the keyboard's.
const probeRe = document.getElementById("probeRe"), probeIm = document.getElementById("probeIm");
function drawProbe() {
  if (document.activeElement !== probeRe) probeRe.value = String(Number(state.probe.re.toFixed(3)));
  if (document.activeElement !== probeIm) probeIm.value = String(Number(state.probe.im.toFixed(3)));
}
for (const box of [probeRe, probeIm]) {
  box.addEventListener("input", () => {
    const re = Number(probeRe.value), im = Number(probeIm.value);
    if (probeRe.value !== "" && probeIm.value !== "" && Number.isFinite(re) && Number.isFinite(im)) store.set("probe", { re, im });
  });
}
// Space plays and pauses, except where it already means something (a button, a text box).
document.addEventListener("keydown", (e) => {
  if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.("button, input, select, textarea, a, [role='menu'], dialog")) return;
  togglePlay();
  e.preventDefault();
});

// ── every change, once per frame ──
let saveTimer = 0;
store.on((s, dirty) => {
  if (dirty.has("error")) host.toggleAttribute("data-stale", !!s.error);
  if (dirty.has("time")) drawTransport();
  if (dirty.has("probe")) drawProbe();
  for (const id in made) if (dock.isShown(id)) made[id].view.update?.(s, dirty);
  if (dirty.has("input") || dirty.has("probe") || dirty.has("opts")) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => storage.set(STATE_KEY, { v: VERSION, input: s.input, probe: s.probe, opts: s.opts }), 300);
  }
});
for (const el of document.querySelectorAll("[data-m]")) tex(el, el.dataset.m); // maths written into the page itself
drawTransport();
drawProbe();
onThemeChange(() => store.touch("theme"));
// The plots' axis numbers are drawn in KaTeX's faces: draw again once those have loaded.
Promise.all(["12px KaTeX_Main", "italic 12px KaTeX_Math"].map((f) => document.fonts.load(f))).then(() => store.touch("theme"), () => {});

// ── the syntax sheet, the skip link and the offline light/dark switch ──
const help = document.getElementById("help");
document.getElementById("btnHelp").addEventListener("click", () => help.showModal());
for (const id of ["helpClose", "helpDone"]) document.getElementById(id).addEventListener("click", () => help.close());
document.getElementById("skip").addEventListener("click", () => (host.querySelector("[role='tab']") || host).focus());
if (!window.SiteDesign) {
  const btn = document.getElementById("btnTheme"), root = document.documentElement;
  const name = () => (btn.textContent = root.dataset.theme === "light" ? "Dark" : "Light");
  btn.hidden = false;
  name();
  btn.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem("laplaceanalyser.theme", root.dataset.theme); } catch (e) { /* this visit only */ }
    name();
  });
}
