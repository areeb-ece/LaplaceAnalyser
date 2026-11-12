// F(s) as a surface over the s-plane: height is |F(s)|, hue is its phase. Poles are
// spikes, cut off at the height limit so they don't flatten everything else.
//
// The mesh is a fixed grid. Its height and colour are worked out on the GPU from the
// poles, zeros and gain, so a new equation only changes a few uniforms and nothing is
// rebuilt: log|F| = log|K| + Σ log|s − z| − Σ log|s − p|, and likewise for the phase.
// A transform with delays, Σ e^(−sT) N_T(s) / D(s), has no finite list of zeros: then the
// numerators' coefficients are uniforms too, and the sum is worked out at each point.
// The frame is redrawn only when something changed.
import { h } from "../ui.js";
import { palette } from "../palette.js";
import { mathLayer, m } from "../math.js";
import { legendDom } from "../legend.js";
import { niceStep } from "../plot2d.js";
import { evalTransformAt } from "../lib/analyse.js";
import { texComplex } from "../lib/tex.js";

const N = 320;        // grid cells along each side
const HEIGHT = 0.95;  // world height of the limit (the plane is the square [-1, 1]²)
const MAX = 12;       // poles, and zeros, the shader has room for
const GROUPS = 6;     // delayed pieces the shader has room for (the engine's limit)
const COEFS = 20;     // coefficients per piece's numerator (degree ≤ 16), five vec4s
const RIM = 0.45;     // how far past the limit (in ln|F|) the flat rim of a cut spike reaches
const DECADES = 3;    // what the log scale spans below the limit
const SAMPLE_T = 6;   // seconds of e^(st) drawn in each sample
const HOME = { az: -0.36, pol: 1.0, dist: 4.3 };

const COMMON = `
uniform vec3 uWin; uniform vec3 uPoles[${MAX}]; uniform vec3 uZeros[${MAX}]; uniform int uNp; uniform int uNz;
uniform float uLogK; uniform float uTop; uniform float uFloor; uniform float uLogMode; uniform float uH;
uniform int uNg; uniform float uGT[${GROUPS}]; uniform float uGD[${GROUPS}]; uniform vec4 uGC[${(GROUPS * COEFS) / 4}];
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
// Σ_g e^(−sT_g) N_g(s), scaled: returns the sum divided by e^big, and big, so that neither
// e^(−σT) nor a high power of s can overflow.
vec2 delayedSum(vec2 s, out float big) {
  vec2 val[${GROUPS}]; float lg[${GROUPS}];
  big = -1e30;
  for (int g = 0; g < ${GROUPS}; g++) {
    if (g >= uNg) break;
    vec2 p = vec2(0.0);
    for (int k = ${COEFS - 1}; k >= 0; k--) {
      if (float(k) > uGD[g]) continue;
      int i = g * ${COEFS} + k;
      p = cmul(p, s) + vec2(uGC[i / 4][i - (i / 4) * 4], 0.0);
    }
    float ang = -s.y * uGT[g], m = length(p);
    val[g] = m > 0.0 ? cmul(p / m, vec2(cos(ang), sin(ang))) : vec2(0.0);
    lg[g] = log(max(m, 1e-30)) - s.x * uGT[g];
    big = max(big, lg[g]);
  }
  vec2 sum = vec2(0.0);
  for (int g = 0; g < ${GROUPS}; g++) { if (g >= uNg) break; sum += val[g] * exp(lg[g] - big); }
  return sum;
}
// with delays, nudge off the grid by a hair: a pole that the pieces cancel is 0/0 exactly on it
vec2 off(vec2 s) { return uNg > 0 ? s + uWin.z * vec2(1.3e-4, 0.7e-4) : s; }
float logMag(vec2 s) {
  s = off(s);
  float l = uLogK;
  if (uNg > 0) { float big; vec2 v = delayedSum(s, big); l = big + log(max(length(v), 1e-30)); }
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
  s = off(s);
  float a = uSignK < 0.0 ? 3.14159265 : 0.0;
  if (uNg > 0) { float big; vec2 v = delayedSum(s, big); a = atan(v.y, v.x); }
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

/** What the colour means. */
// A piece's numerator over the common denominator of all the pieces: N_T(s) / lead_T
// times every pole's factor that the piece itself doesn't have. Real, ascending.
function liftOnto(g, all) {
  let p = g.num.map((x) => x / g.lead);
  const mul = (a, b) => { const o = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { o[i + j] += x * y; })); return o; };
  for (const q of all) {
    if (q.s.im < 0) continue;
    const own = g.poles.find((o) => Math.abs(o.s.re - q.s.re) + Math.abs(o.s.im - q.s.im) <= 1e-9 * (1 + Math.hypot(q.s.re, q.s.im)))?.mult ?? 0;
    const factor = q.s.im === 0 ? [-q.s.re, 1] : [q.s.re ** 2 + q.s.im ** 2, -2 * q.s.re, 1];
    for (let k = own; k < q.mult; k++) p = mul(p, factor);
  }
  return p;
}

export const surfaceLegend = () => [{ mark: "phase", role: "ink", text: "Phase,", tex: "-\\pi \\text{ to } \\pi" }];

export default {
  id: "surface", title: "S-plane surface", legend: surfaceLegend,
  mount(el, store) {
    const box = h("div", { class: "plot" });
    const canvas = h("canvas", { tabindex: 0, role: "application", "aria-label": "Surface of the transform over the s-plane. Arrow keys move the probe point s; Alt with the arrow keys turns the view." });
    box.append(canvas);
    const layer = mathLayer(box);
    const check = (text, key) => {
      const input = h("input", { type: "checkbox", checked: store.state.opts[key] });
      input.addEventListener("change", () => store.patch("opts", { [key]: input.checked }));
      return h("label", { class: "sd-check" }, input, ...[].concat(text));
    };
    const limit = h("input", { class: "sd-range", type: "range", min: 0, max: 1, step: 0.01, value: store.state.opts.clamp, "aria-label": "Height limit" });
    limit.addEventListener("input", () => store.patch("opts", { clamp: Number(limit.value) }));
    const key = h("span", { class: "key", title: "The colour is the phase (argument) of the transform" });
    const bar = h("div", { class: "vbar" },
      h("label", { class: "pair", title: "Spikes are cut off above this height" }, "Height limit", limit),
      check("Log height", "log"),
      check([m("e^{st}"), " samples"], "samples"),
      h("span", { class: "grow" }),
      key,
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
        // a height that only the spikes exceed: a little above what 9 tenths of the window stays under
        const vals = [];
        for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) vals.push(logMagAt({ re: win.cx + win.half * ((i + 0.5) / 12 - 1), im: win.cy + win.half * ((j + 0.5) / 12 - 1) }));
        vals.sort((a, b) => a - b);
        level = { model, win, ref: vals[518] + Math.log(2.2) };
      }
      return level.ref + (opts.clamp - 0.5) * 2 * Math.LN10;
    }
    function logMagAt(s) {
      const { model } = store.state;
      if (model.delayed) { const F = evalTransformAt(model, s); return Math.log(Math.max(Math.hypot(F.re, F.im), 1e-300)); }
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
        uNg: { value: 0 }, uGT: { value: new Array(GROUPS).fill(0) }, uGD: { value: new Array(GROUPS).fill(0) },
        uGC: { value: Array.from({ length: (GROUPS * COEFS) / 4 }, () => new T.Vector4()) },
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
    function draw(pal = palette()) {
      if (!R?.mesh) return;
      const { model, win, opts } = store.state, u = R.uniforms;
      const top = topOf();
      u.uWin.value.set(win.cx, win.cy, win.half);
      // with delays: every pole of every piece over one common denominator, and each piece's
      // numerator lifted onto it, N_T · D / D_T
      const poles = model.delayed ? model.allPoles : model.poles;
      poles.slice(0, MAX).forEach((p, i) => u.uPoles.value[i].set(p.s.re, p.s.im, p.mult));
      model.zeros.slice(0, MAX).forEach((z, i) => u.uZeros.value[i].set(z.s.re, z.s.im, z.mult));
      u.uNp.value = Math.min(MAX, poles.length);
      u.uNz.value = Math.min(MAX, model.zeros.length);
      u.uNg.value = model.delayed ? Math.min(GROUPS, model.groups.length) : 0;
      if (model.delayed) {
        model.groups.slice(0, GROUPS).forEach((g, gi) => {
          const lifted = liftOnto(g, model.allPoles);
          u.uGT.value[gi] = g.T;
          u.uGD.value[gi] = Math.min(COEFS, lifted.length) - 1;
          for (let k = 0; k < COEFS; k++) { const i = gi * COEFS + k; u.uGC.value[i >> 2].setComponent(i & 3, lifted[k] ?? 0); }
        });
        u.uLogK.value = 0;
        u.uSignK.value = 1;
      } else {
        const K = model.num[model.num.length - 1] / model.lead;
        u.uLogK.value = Math.log(Math.abs(K));
        u.uSignK.value = K < 0 ? -1 : 1;
      }
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
      if (pal.theme === "current") legendDom(key, surfaceLegend(), pal);
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
    function placeProbe() {
      if (!R?.probe) return;
      const { probe } = store.state, y = heightAt(probe), base = toWorld(probe, 0);
      for (const m of R.probe.children) {
        if (m.userData.part === "stem") { m.position.set(base.x, y / 2, base.z); m.scale.set(1, Math.max(y, 1e-4), 1); }
        else m.position.set(base.x, m.userData.part === "tip" ? y : 0, base.z);
      }
    }

    // ── drawing a frame ──
    function aim(dims) {
      // a narrow picture stands further back, so the whole plane stays in it
      const target = new T.Vector3(0, 0.3, 0), d = cam.dist * Math.min(2.2, Math.max(0.8, (1.42 * dims.h) / dims.w));
      R.camera.position.set(target.x + d * Math.sin(cam.pol) * Math.sin(cam.az), target.y + d * Math.cos(cam.pol), target.z + d * Math.sin(cam.pol) * Math.cos(cam.az));
      R.camera.lookAt(target);
      R.camera.updateMatrixWorld();
    }
    function render() {
      stale = false;
      if (!R?.mesh || !size.w) return;
      aim(size);
      R.renderer.render(R.scene, R.camera);
      layer.begin();
      labelsFor(layer.put, size, palette(), true);
      layer.end();
    }
    const screenIn = (dims) => (v) => { const p = v.clone().project(R.camera); return { x: (p.x * 0.5 + 0.5) * dims.w, y: (-p.y * 0.5 + 0.5) * dims.h, front: p.z < 1 }; };
    const screen = (v) => screenIn(size)(v);
    // The numbers along the two axes and the probe's labels are typeset maths, placed
    // over the picture where their points land (put is a maths layer's or collector's).
    function labelsFor(put, dims, pal, withProbe) {
      const { win, probe, model } = store.state, step = R.uniforms.uStep.value, at = screenIn(dims), taken = [];
      // an axis number is left out on a spike, off the picture, or where it would sit on another
      const add = (s, src) => {
        const y = heightAt(s);
        if (y > HEIGHT * 0.5) return;
        const p = at(toWorld(s, y + 0.01));
        if (!p.front || p.x < 8 || p.x > dims.w - 8 || p.y < 8 || p.y > dims.h - 20) return;
        if (taken.some((o) => Math.abs(o.x - p.x) < 24 && Math.abs(o.y - p.y) < 14)) return;
        taken.push(p);
        put(src, p.x, p.y + 12, { align: "center", color: pal.ink, size: 11, shade: true });
      };
      const tidy = (v) => Number((Math.round(v / step) * step).toPrecision(10));
      const reAxis = Math.min(Math.max(0, win.cy - win.half), win.cy + win.half), imAxis = Math.min(Math.max(0, win.cx - win.half), win.cx + win.half);
      for (let v = Math.ceil((win.cx - win.half) / step) * step; v <= win.cx + win.half + 1e-9; v += step) { const t = tidy(v); if (t !== 0) add({ re: t, im: reAxis }, String(t)); }
      for (let v = Math.ceil((win.cy - win.half) / step) * step; v <= win.cy + win.half + 1e-9; v += step) { const t = tidy(v); if (t !== 0) add({ re: imAxis, im: t }, (t === 1 ? "" : t === -1 ? "-" : String(t)) + "i"); }
      if (!withProbe) return;
      const foot = at(toWorld(probe, 0)), tip = at(toWorld(probe));
      if (foot.front) put("s = " + texComplex(probe), foot.x + 14, foot.y + 12, { color: pal.probe, chip: true });
      const F = evalTransformAt(model, probe);
      if (tip.front && Number.isFinite(F.re) && Math.hypot(F.re, F.im) < 1e6) put(`${model.cap}(s) = ${texComplex(F)}`, tip.x + 14, tip.y - 8, { color: pal.value, chip: true });
    }

    /**
     * The surface drawn into another canvas, for a saved image: w × h (in the image's own
     * units) at (x, y) of ctx, at `scale` pixels per unit, in the colours of pal, with or
     * without the probe. The labels go to put. The view on the page is put back after.
     */
    function renderTo(ctx, x, y, w, hgt, { pal, probe, scale, put }) {
      if (!R?.mesh) return false;
      const dims = { w, h: hgt }, ratio = R.renderer.getPixelRatio();
      R.renderer.setPixelRatio(Math.min(scale, 4096 / Math.max(w, hgt)));
      R.renderer.setSize(w, hgt, false);
      R.camera.aspect = w / hgt;
      R.camera.updateProjectionMatrix();
      draw(pal);
      R.probe.visible = probe;
      aim(dims);
      R.renderer.render(R.scene, R.camera);
      ctx.drawImage(canvas, x, y, w, hgt); // straight after the render, while the frame is still there
      labelsFor((src, lx, ly, o) => put(src, x + lx, y + ly, o), dims, pal, probe);
      // back to how the page had it
      R.probe.visible = true;
      R.renderer.setPixelRatio(ratio);
      if (size.w) { R.renderer.setSize(size.w, size.h, false); R.camera.aspect = size.w / size.h; R.camera.updateProjectionMatrix(); }
      draw();
      render();
      return true;
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
      const far = cam.dist * 2.2 + 3;
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

    const ready = init().then(() => !!R?.mesh);
    return {
      ready, renderTo,
      update(state, dirty) {
        if (dirty.has("model") || dirty.has("win") || dirty.has("opts") || dirty.has("theme")) draw();
        else if (dirty.has("probe")) placeProbe();
        else return;
        render();
      },
    };
  },
};
