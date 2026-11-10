// F(s) as a surface over the s-plane: height is |F(s)|, hue is its phase. Poles are
// spikes, cut off at the height limit so they don't flatten everything else.
//
// The mesh is a fixed grid. Its height and colour are worked out on the GPU from the
// poles, zeros and gain, so a new equation only changes a few uniforms and nothing is
// rebuilt: log|F| = log|K| + Σ log|s − z| − Σ log|s − p|, and likewise for the phase.
// The frame is redrawn only when something changed.
import { h } from "../ui.js";
import { palette } from "../palette.js";
import { niceStep, tickText } from "../plot2d.js";
import { evalTransformAt } from "../lib/analyse.js";
import { fmtComplex } from "../lib/tex.js";

const N = 320;        // grid cells along each side
const HEIGHT = 0.95;  // world height of the limit (the plane is the square [-1, 1]²)
const MAX = 12;       // poles, and zeros, the shader has room for
const RIM = 0.45;     // how far past the limit (in ln|F|) the flat rim of a cut spike reaches
const DECADES = 3;    // what the log scale spans below the limit
const SAMPLE_T = 6;   // seconds of e^(st) drawn in each sample
const HOME = { az: -0.36, pol: 1.0, dist: 4.3 };

const COMMON = `
uniform vec3 uWin; uniform vec3 uPoles[${MAX}]; uniform vec3 uZeros[${MAX}]; uniform int uNp; uniform int uNz;
uniform float uLogK; uniform float uTop; uniform float uFloor; uniform float uLogMode; uniform float uH;
float logMag(vec2 s) {
  float l = uLogK;
  for (int i = 0; i < ${MAX}; i++) { if (i >= uNz) break; vec2 d = s - uZeros[i].xy; l += uZeros[i].z * 0.5 * log(max(dot(d, d), 1e-30)); }
  for (int i = 0; i < ${MAX}; i++) { if (i >= uNp) break; vec2 d = s - uPoles[i].xy; l -= uPoles[i].z * 0.5 * log(max(dot(d, d), 1e-30)); }
  return l;
}
float lift(float lm) {
  if (uLogMode > 0.5) return uH * clamp((lm - uFloor) / (uTop - uFloor), 0.0, 1.0);
  return uH * min(exp(min(lm - uTop, 0.0)), 1.0);
}`;
const VERT = `${COMMON}
varying vec2 vS; varying vec3 vN;
void main() {
  vec2 s = uWin.xy + uWin.z * position.xy;
  float e = uWin.z / ${N}.0, w = 2.0 / ${N}.0;
  // the slope, from neighbours half a cell away, for smooth shading
  float hu = (lift(logMag(s + vec2(e, 0.0))) - lift(logMag(s - vec2(e, 0.0)))) / w;
  float hv = (lift(logMag(s + vec2(0.0, e))) - lift(logMag(s - vec2(0.0, e)))) / w;
  vN = vec3(-hu, 1.0, hv);
  vS = s;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, lift(logMag(s)), -position.y, 1.0);
}`;
const FRAG = `${COMMON}
uniform float uSignK; uniform float uStep; uniform vec3 uInk; uniform float uSat; uniform float uLight; uniform vec3 uSun;
varying vec2 vS; varying vec3 vN;
float phase(vec2 s) {
  float a = uSignK < 0.0 ? 3.14159265 : 0.0;
  for (int i = 0; i < ${MAX}; i++) { if (i >= uNz) break; vec2 d = s - uZeros[i].xy; a += uZeros[i].z * atan(d.y, d.x); }
  for (int i = 0; i < ${MAX}; i++) { if (i >= uNp) break; vec2 d = s - uPoles[i].xy; a -= uPoles[i].z * atan(d.y, d.x); }
  return a;
}
vec3 hsl(float hue, float s, float l) {
  vec3 k = mod(vec3(0.0, 8.0, 4.0) + hue * 12.0, 12.0);
  return l - s * min(l, 1.0 - l) * max(min(min(k - 3.0, 9.0 - k), 1.0), -1.0);
}
float lines(vec2 g, float px) { vec2 a = abs(fract(g - 0.5) - 0.5) / max(fwidth(g) * px, 1e-6); return 1.0 - min(min(a.x, a.y), 1.0); }
void main() {
  float over = logMag(vS) - uTop;
  if (over > ${RIM.toFixed(2)}) discard;                       // inside a cut spike: open, like a tube
  vec3 col = hsl(fract(phase(vS) / 6.2831853), uSat, uLight);
  vec3 n = normalize(vN);
  float lit = 0.6 + 0.4 * max(dot(n, uSun), 0.0);
  if (!gl_FrontFacing) lit *= 0.62;
  col *= lit;
  vec2 g = vS / uStep;
  col = mix(col, uInk, 0.12 * lines(g * 4.0, 1.0));
  col = mix(col, uInk, 0.42 * lines(g, 1.3));
  vec2 ax = abs(vS) / max(fwidth(vS) * 1.6, 1e-6);
  col = mix(col, uInk, 0.85 * (1.0 - min(min(ax.x, ax.y), 1.0)));
  gl_FragColor = vec4(col, 1.0);
}`;

export default {
  id: "surface", title: "S-plane surface",
  mount(el, store) {
    const box = h("div", { class: "plot" }), labels = h("div", { class: "labels", "aria-hidden": "true" });
    const canvas = h("canvas", { tabindex: 0, role: "application", "aria-label": "Surface of the transform over the s-plane. Arrow keys move the probe point s; Alt with the arrow keys turns the view." });
    box.append(canvas, labels);
    const check = (text, key) => {
      const input = h("input", { type: "checkbox", checked: store.state.opts[key] });
      input.addEventListener("change", () => store.patch("opts", { [key]: input.checked }));
      return h("label", { class: "sd-check" }, input, text);
    };
    const limit = h("input", { class: "sd-range", type: "range", min: 0, max: 1, step: 0.01, value: store.state.opts.clamp, "aria-label": "Height limit" });
    limit.addEventListener("input", () => store.patch("opts", { clamp: Number(limit.value) }));
    const keyCanvas = h("canvas", { class: "phasekey", width: 96, height: 10 });
    const bar = h("div", { class: "vbar" },
      h("label", { class: "pair", title: "Spikes are cut off above this height" }, "Height limit", limit),
      check("Log height", "log"),
      check("e^(st) samples", "samples"),
      h("span", { class: "grow" }),
      h("span", { class: "pair", title: "The colour is the phase (argument) of the transform" }, "Phase −π", keyCanvas, "π"),
      h("button", { class: "sd-btn sd-ghost sd-small", type: "button", text: "Reset view", on: { click: () => { cam = { ...HOME }; store.set("win", { ...store.state.model.sWindow }); draw(); } } }));
    el.append(box, bar);

    let T = null, R = null, cam = { ...HOME }, size = { w: 0, h: 0 }, stale = false, queued = false;
    // Ask for a frame. One is drawn at most once per animation frame, and not at all
    // if something drew it sooner (a state change draws at once, in step with the other views).
    const need = () => {
      stale = true;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; if (stale) render(); });
    };

    // ── the numbers the shader and the picking both use ──
    let level = null; // { model, win, ref }: the reference height for this model and window
    function topOf() {
      const { model, win, opts } = store.state;
      if (!level || level.model !== model || level.win !== win) {
        // a typical value of |F| across the window: the median on a coarse grid
        const vals = [];
        for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) vals.push(logMagAt({ re: win.cx + win.half * ((i + 0.5) / 12 - 1), im: win.cy + win.half * ((j + 0.5) / 12 - 1) }));
        vals.sort((a, b) => a - b);
        level = { model, win, ref: vals[288] + Math.log(5) };
      }
      return level.ref + (opts.clamp - 0.5) * 2 * Math.LN10;
    }
    function logMagAt(s) {
      const { model } = store.state;
      let l = Math.log(Math.abs(model.num[model.num.length - 1] / model.lead));
      for (const z of model.zeros) l += z.mult * 0.5 * Math.log(Math.max((s.re - z.s.re) ** 2 + (s.im - z.s.im) ** 2, 1e-30));
      for (const p of model.poles) l -= p.mult * 0.5 * Math.log(Math.max((s.re - p.s.re) ** 2 + (s.im - p.s.im) ** 2, 1e-30));
      return l;
    }
    function heightAt(s) {
      const top = topOf(), lm = logMagAt(s);
      if (store.state.opts.log) return HEIGHT * Math.min(1, Math.max(0, (lm - (top - DECADES * Math.LN10)) / (DECADES * Math.LN10)));
      return HEIGHT * Math.min(1, Math.exp(Math.min(lm - top, 0)));
    }
    const toWorld = (s, y = heightAt(s)) => { const w = store.state.win; return new T.Vector3((s.re - w.cx) / w.half, y, -(s.im - w.cy) / w.half); };

    // ── setting the scene up, once Three.js has loaded ──
    async function init() {
      try {
        T = await import("../../vendor/three/three.module.min.js");
        R = { renderer: new T.WebGLRenderer({ canvas, antialias: true, alpha: true }) };
      } catch (e) {
        T = null;
        box.replaceChildren(h("p", { class: "sd-callout sd-warn nogl", text: "This view draws with WebGL, which this browser has switched off or doesn't have. Every other view still works." }));
        return;
      }
      R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      R.scene = new T.Scene();
      R.camera = new T.PerspectiveCamera(32, 1, 0.05, 50);
      const flat = new Float32Array((N + 1) * (N + 1) * 3), index = new Uint32Array(N * N * 6);
      for (let j = 0, k = 0; j <= N; j++) for (let i = 0; i <= N; i++) { flat[k++] = (2 * i) / N - 1; flat[k++] = (2 * j) / N - 1; flat[k++] = 0; }
      for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        index[k++] = a; index[k++] = b; index[k++] = c; index[k++] = b; index[k++] = d; index[k++] = c;
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(flat, 3));
      geo.setIndex(new T.BufferAttribute(index, 1));
      R.uniforms = {
        uWin: { value: new T.Vector3() }, uNp: { value: 0 }, uNz: { value: 0 },
        uPoles: { value: Array.from({ length: MAX }, () => new T.Vector3()) }, uZeros: { value: Array.from({ length: MAX }, () => new T.Vector3()) },
        uLogK: { value: 0 }, uSignK: { value: 1 }, uTop: { value: 0 }, uFloor: { value: -1 }, uLogMode: { value: 0 }, uH: { value: HEIGHT },
        uStep: { value: 1 }, uInk: { value: new T.Vector3(1, 1, 1) }, uSat: { value: 0.7 }, uLight: { value: 0.55 }, uSun: { value: new T.Vector3(-0.35, 0.8, 0.5).normalize() },
      };
      R.mesh = new T.Mesh(geo, new T.ShaderMaterial({ uniforms: R.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: T.DoubleSide }));
      R.mesh.frustumCulled = false; // its real shape is made in the shader
      R.scene.add(R.mesh);
      // the edge of the plane, at height 0
      R.edge = new T.LineLoop(new T.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => new T.Vector3(x, 0, z))), new T.LineBasicMaterial());
      R.scene.add(R.edge);
      // the probe: a stem from the plane up to the surface, drawn once normally and once
      // faintly through whatever is in front, so it can always be found and grabbed
      const solid = new T.MeshBasicMaterial(), ghost = new T.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthTest: false });
      R.probeMats = [solid, ghost];
      R.probe = new T.Group();
      for (const mat of [ghost, solid]) {
        const stem = new T.Mesh(new T.CylinderGeometry(0.0065, 0.0065, 1, 8), mat), tip = new T.Mesh(new T.SphereGeometry(0.026, 16, 12), mat), foot = new T.Mesh(new T.SphereGeometry(0.02, 16, 12), mat);
        stem.userData.part = "stem"; tip.userData.part = "tip"; foot.userData.part = "foot";
        if (mat === ghost) for (const m of [stem, tip, foot]) m.renderOrder = 2;
        R.probe.add(stem, tip, foot);
      }
      R.scene.add(R.probe);
      R.samples = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ transparent: true, opacity: 0.8 }));
      R.scene.add(R.samples);
      new ResizeObserver(() => {
        const w = Math.floor(box.clientWidth), hgt = Math.floor(box.clientHeight);
        if (!w || !hgt) return;
        size = { w, h: hgt };
        R.renderer.setSize(w, hgt, false);
        R.camera.aspect = w / hgt;
        R.camera.updateProjectionMatrix();
        render(); // straight away: a resized canvas is blank until it's drawn again
      }).observe(box);
      canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
      canvas.addEventListener("webglcontextrestored", () => draw());
      draw();
    }

    // ── bringing the scene up to date with the state ──
    let sampled = null;
    function draw() {
      if (!R?.mesh) return;
      const { model, win, opts } = store.state, u = R.uniforms, pal = palette();
      const top = topOf();
      u.uWin.value.set(win.cx, win.cy, win.half);
      model.poles.slice(0, MAX).forEach((p, i) => u.uPoles.value[i].set(p.s.re, p.s.im, p.mult));
      model.zeros.slice(0, MAX).forEach((z, i) => u.uZeros.value[i].set(z.s.re, z.s.im, z.mult));
      u.uNp.value = Math.min(MAX, model.poles.length);
      u.uNz.value = Math.min(MAX, model.zeros.length);
      const K = model.num[model.num.length - 1] / model.lead;
      u.uLogK.value = Math.log(Math.abs(K));
      u.uSignK.value = K < 0 ? -1 : 1;
      u.uTop.value = top;
      u.uFloor.value = top - DECADES * Math.LN10;
      u.uLogMode.value = opts.log ? 1 : 0;
      u.uStep.value = niceStep(2 * win.half, 7);
      u.uInk.value.set(...pal.rgb.ink);
      u.uSat.value = pal.light ? 0.62 : 0.68;
      u.uLight.value = pal.light ? 0.5 : 0.56;
      const color = (role) => new T.Color().setRGB(...pal.rgb[role], T.SRGBColorSpace);
      R.edge.material.color = color("accent");
      R.samples.material.color = color("ink");
      for (const m of R.probeMats) m.color = color("probe");
      R.samples.visible = opts.samples;
      if (opts.samples && !(sampled && sampled.model === model && sampled.win === win && sampled.clamp === opts.clamp && sampled.log === opts.log)) {
        sampled = { model, win, clamp: opts.clamp, log: opts.log };
        R.samples.geometry.dispose();
        R.samples.geometry = new T.BufferGeometry().setFromPoints(samplePoints(u.uStep.value));
      }
      limit.value = String(opts.clamp);
      drawKey(u.uSat.value, u.uLight.value);
      placeProbe();
      need();
    }
    // At each grid point, what e^(st) looks like there: a small frame lying on the
    // surface with Re e^(st) for t from 0 to 6, scaled to fit. Growth to the right of
    // the imaginary axis, decay to the left, faster wiggles further from the real axis.
    function samplePoints(step) {
      const { win } = store.state, pts = [], w = (0.52 * step) / win.half, hgt = w * 0.3, M = 48;
      const i0 = Math.ceil((win.cx - win.half) / step - 1e-9), i1 = Math.floor((win.cx + win.half) / step + 1e-9);
      const j0 = Math.ceil((win.cy - win.half) / step - 1e-9), j1 = Math.floor((win.cy + win.half) / step + 1e-9);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const s = { re: i * step, im: j * step }, y = heightAt(s);
        if (y > HEIGHT * 0.45) continue; // on the side of a spike it would be buried
        const c = toWorld(s, y + 0.012);
        if (Math.abs(c.x) > 1 - w / 2 || Math.abs(c.z) > 1 - hgt) continue;
        const P = (fx, fy) => new T.Vector3(c.x + (fx - 0.5) * w, c.y, c.z - fy * hgt);
        for (const [a, b] of [[[0, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, -1]]]) pts.push(P(...a), P(...b));
        const peak = Math.max(1, Math.exp(s.re * SAMPLE_T));
        let prev = null;
        for (let k = 0; k <= M; k++) {
          const t = (SAMPLE_T * k) / M, p = P(k / M, (0.86 * Math.exp(s.re * t) * Math.cos(s.im * t)) / peak);
          if (prev) pts.push(prev, p);
          prev = p;
        }
      }
      return pts;
    }
    let keyDrawn = "";
    function drawKey(sat, light) {
      if (keyDrawn === sat + "," + light) return;
      keyDrawn = sat + "," + light;
      const c = keyCanvas.getContext("2d");
      for (let x = 0; x < 96; x++) { c.fillStyle = `hsl(${(((x / 95 - 0.5) * 360) + 360) % 360} ${sat * 100}% ${light * 100}%)`; c.fillRect(x, 0, 1, 10); }
    }
    function placeProbe() {
      if (!R?.probe) return;
      const { probe } = store.state, y = heightAt(probe), base = toWorld(probe, 0);
      for (const m of R.probe.children) {
        if (m.userData.part === "stem") { m.position.set(base.x, y / 2, base.z); m.scale.set(1, Math.max(y, 1e-4), 1); }
        else m.position.set(base.x, m.userData.part === "tip" ? y : 0, base.z);
      }
    }

    // ── drawing a frame ──
    function render() {
      stale = false;
      if (!R?.mesh || !size.w) return;
      // a narrow panel stands further back, so the whole plane stays in the picture
      const target = new T.Vector3(0, 0.3, 0), d = cam.dist * Math.min(1.7, Math.max(0.8, (1.15 * size.h) / size.w));
      R.camera.position.set(target.x + d * Math.sin(cam.pol) * Math.sin(cam.az), target.y + d * Math.cos(cam.pol), target.z + d * Math.sin(cam.pol) * Math.cos(cam.az));
      R.camera.lookAt(target);
      R.camera.updateMatrixWorld();
      R.renderer.render(R.scene, R.camera);
      placeLabels();
    }
    const screen = (v) => { const p = v.clone().project(R.camera); return { x: (p.x * 0.5 + 0.5) * size.w, y: (-p.y * 0.5 + 0.5) * size.h, front: p.z < 1 }; };
    // The numbers along the two axes and the probe's label are ordinary text, placed
    // over the canvas where their points land.
    function placeLabels() {
      const { win, probe, model } = store.state, step = R.uniforms.uStep.value, want = [];
      const add = (s, text, cls, dy) => { const y = heightAt(s); if (y > HEIGHT * 0.5) return; const p = screen(toWorld(s, y + 0.01)); if (p.front && p.x > 4 && p.x < size.w - 4 && p.y > 4 && p.y < size.h - 4) want.push({ ...p, y: p.y + dy, text, cls }); };
      const tidy = (v) => Number((Math.round(v / step) * step).toPrecision(10));
      const reAxis = Math.min(Math.max(0, win.cy - win.half), win.cy + win.half), imAxis = Math.min(Math.max(0, win.cx - win.half), win.cx + win.half);
      for (let v = Math.ceil((win.cx - win.half) / step) * step; v <= win.cx + win.half + 1e-9; v += step) { const t = tidy(v); if (t !== 0) add({ re: t, im: reAxis }, tickText(t), "tick", 12); }
      for (let v = Math.ceil((win.cy - win.half) / step) * step; v <= win.cy + win.half + 1e-9; v += step) { const t = tidy(v); if (t !== 0) add({ re: imAxis, im: t }, (t === 1 ? "" : t === -1 ? "−" : tickText(t)) + "i", "tick", 12); }
      const foot = screen(toWorld(probe, 0)), tip = screen(toWorld(probe));
      if (foot.front) want.push({ x: foot.x + 12, y: foot.y + 4, text: "s = " + fmtComplex(probe), cls: "probe" });
      const F = evalTransformAt(model, probe);
      if (tip.front && Number.isFinite(F.re) && Math.hypot(F.re, F.im) < 1e6) want.push({ x: tip.x + 12, y: tip.y - 6, text: `${model.cap}(s) = ${fmtComplex(F)}`, cls: "value" });
      while (labels.children.length < want.length) labels.append(h("span"));
      [...labels.children].forEach((span, i) => {
        const l = want[i];
        span.hidden = !l;
        if (!l) return;
        if (span.textContent !== l.text) span.textContent = l.text;
        span.className = l.cls;
        span.style.setProperty("transform", `translate(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px)${l.cls === "tick" ? " translate(-50%, -50%)" : ""}`);
      });
    }

    // ── pointer: grab the probe, click to place it, drag to turn, Shift-drag to slide the plane ──
    const at = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function ray(x, y) {
      const origin = R.camera.position.clone();
      const dir = new T.Vector3((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1, 0.5).unproject(R.camera).sub(origin).normalize();
      return { origin, dir };
    }
    const toS = (v) => { const w = store.state.win; return { re: w.cx + v.x * w.half, im: w.cy - v.z * w.half }; };
    // Where a ray meets the horizontal plane at height y.
    function onLevel(x, y, level) {
      const { origin, dir } = ray(x, y);
      if (Math.abs(dir.y) < 1e-6) return null;
      const k = (level - origin.y) / dir.y;
      return k > 0 ? origin.clone().addScaledVector(dir, k) : null;
    }
    // Where a ray first meets the surface itself: march along it, then close in.
    function onSurface(x, y) {
      const { origin, dir } = ray(x, y), below = (k) => { const p = origin.clone().addScaledVector(dir, k); return Math.abs(p.x) <= 1 && Math.abs(p.z) <= 1 && p.y <= heightAt(toS(p)); };
      const far = cam.dist * 1.7 + 3;
      for (let k = 0, stepK = far / 400; k < far; k += stepK) {
        if (!below(k + stepK)) continue;
        let lo = k, hi = k + stepK;
        for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (below(mid)) hi = mid; else lo = mid; }
        return origin.clone().addScaledVector(dir, hi);
      }
      return null;
    }
    const nearProbe = (x, y) => {
      const { probe } = store.state;
      for (const [part, v] of [["tip", toWorld(probe)], ["foot", toWorld(probe, 0)]]) { const p = screen(v); if (p.front && Math.hypot(p.x - x, p.y - y) <= 18) return { part, level: v.y }; }
      return null;
    };
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (!R?.mesh || (e.button !== 0 && e.button !== 2)) return;
      const [x, y] = at(e), grab = e.button === 0 && !e.shiftKey && nearProbe(x, y);
      canvas.setPointerCapture(e.pointerId);
      canvas.focus({ preventScroll: true });
      if (grab) {
        // keep the offset between the pointer and the probe, on the level that was grabbed
        const hit = onLevel(x, y, grab.level), { probe } = store.state;
        drag = { kind: "probe", level: grab.level, off: hit ? { re: probe.re - toS(hit).re, im: probe.im - toS(hit).im } : { re: 0, im: 0 } };
      } else if (e.button === 2 || e.shiftKey) {
        const hit = onLevel(x, y, 0);
        drag = { kind: "slide", from: hit && toS(hit), win: store.state.win };
      } else drag = { kind: "turn", x, y, cam: { ...cam }, moved: false };
      canvas.style.setProperty("cursor", "grabbing");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!R?.mesh) return;
      const [x, y] = at(e);
      if (!drag) { canvas.style.setProperty("cursor", nearProbe(x, y) ? "grab" : "default"); return; }
      if (drag.kind === "probe") {
        const hit = onLevel(x, y, drag.level);
        if (hit) { const s = toS(hit); store.set("probe", { re: s.re + drag.off.re, im: s.im + drag.off.im }); }
      } else if (drag.kind === "slide") {
        // measured in the window as it was when the drag began, so the plane follows the pointer
        const hit = onLevel(x, y, 0);
        if (!hit || !drag.from) return;
        const w = drag.win, now = { re: w.cx + hit.x * w.half, im: w.cy - hit.z * w.half };
        store.set("win", { ...w, cx: w.cx - (now.re - drag.from.re), cy: w.cy - (now.im - drag.from.im) });
      } else {
        if (!drag.moved && Math.hypot(x - drag.x, y - drag.y) < 4) return;
        drag.moved = true;
        cam.az = drag.cam.az - (x - drag.x) * 0.008;
        cam.pol = Math.min(1.5, Math.max(0.08, drag.cam.pol - (y - drag.y) * 0.008));
        need();
      }
    });
    const end = (e) => {
      if (drag?.kind === "turn" && !drag.moved && e.type === "pointerup") {
        const [x, y] = at(e), hit = onSurface(x, y);
        if (hit) store.set("probe", toS(hit));
      }
      drag = null;
      canvas.style.setProperty("cursor", "default");
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    const dolly = (k) => { cam.dist = Math.min(12, Math.max(1.2, cam.dist * k)); need(); };
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); dolly(Math.exp(Math.sign(e.deltaY) * 0.1)); }, { passive: false });
    canvas.addEventListener("keydown", (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (d && e.altKey) { cam.az -= d[0] * 0.08; cam.pol = Math.min(1.5, Math.max(0.08, cam.pol - d[1] * 0.06)); need(); }
      else if (d) { const { probe, win } = store.state, step = (win.half / 40) * (e.shiftKey ? 5 : 1); store.set("probe", { re: probe.re + d[0] * step, im: probe.im + d[1] * step }); }
      else if (e.key === "+" || e.key === "=") dolly(1 / 1.15);
      else if (e.key === "-" || e.key === "_") dolly(1.15);
      else if (e.key === "Home") { cam = { ...HOME }; need(); }
      else return;
      e.preventDefault();
    });

    init();
    return {
      update(state, dirty) {
        if (dirty.has("model") || dirty.has("win") || dirty.has("opts") || dirty.has("theme")) draw();
        else if (dirty.has("probe")) placeProbe();
        else return;
        render();
      },
    };
  },
};
