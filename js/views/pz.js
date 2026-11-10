// The flat s-plane: poles, zeros, the half-plane where the integral converges, and the
// probe point s. Dragging the background moves the window that the surface also shows.
import { h, icon } from "../ui.js";
import { palette } from "../palette.js";
import { fitCanvas, planeFrame, drawPlane, label } from "../plot2d.js";
import { fmtComplex } from "../lib/tex.js";

const GRAB = 16; // pixels from the probe within which a press takes hold of it

export default {
  id: "pz", title: "Pole-zero map",
  mount(el, store) {
    const box = h("div", { class: "plot" });
    const svg = (d, extra = "") => { const t = document.createElement("template"); t.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ${extra}>${d}</svg>`; return t.content.firstChild; };
    const bar = h("div", { class: "vbar" },
      h("span", { class: "key" },
        h("span", { class: "k" }, svg('<path d="M4 4l8 8M12 4l-8 8"/>'), "Pole"),
        h("span", { class: "k" }, svg('<circle cx="8" cy="8" r="4.5"/>'), "Zero"),
        h("span", { class: "k roc" }, svg('<path d="M1 1h14v14H1z" stroke="none" fill="currentColor" fill-opacity=".22"/><path d="M2 14L14 2M2 8l6-6M8 14l6-6" stroke-width="1"/>'), "Integral converges")),
      h("span", { class: "grow" }),
      h("button", { class: "sd-btn sd-ghost sd-small sd-icon", type: "button", title: "Fit every pole and zero", "aria-label": "Fit every pole and zero", on: { click: () => store.set("win", { ...store.state.model.sWindow }) } }, icon("home")));
    el.append(box, bar);
    const cv = fitCanvas(box, draw), { canvas, ctx } = cv;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-label", "Pole-zero map. Arrow keys move the probe point s.");
    const frame = () => planeFrame(cv.size.w, cv.size.h, store.state.win);

    function draw() {
      const { model, probe } = store.state, { w, h: hgt } = cv.size;
      if (!w || !model) return;
      const pal = palette(), f = frame();
      ctx.clearRect(0, 0, w, hgt);
      // where the integral converges: everything right of the rightmost pole
      const edge = Math.max(0, Math.min(w, f.x(model.roc)));
      if (edge < w) {
        ctx.fillStyle = pal.alpha("accent", 0.1);
        ctx.fillRect(edge, 0, w - edge, hgt);
        ctx.save();
        ctx.beginPath(); ctx.rect(edge, 0, w - edge, hgt); ctx.clip();
        ctx.strokeStyle = pal.alpha("accent", 0.16); ctx.lineWidth = 1;
        ctx.beginPath();
        for (let d = -hgt; d < w; d += 12) { ctx.moveTo(d, hgt); ctx.lineTo(d + hgt, 0); }
        ctx.stroke();
        ctx.restore();
      }
      drawPlane(ctx, f, pal);
      if (edge > 0 && edge < w) {
        ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(edge, 0); ctx.lineTo(edge, hgt); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.lineCap = "round";
      const times = (z, m) => { if (m > 1) label(ctx, "×" + m, f.x(z.re) + 9, f.y(z.im) - 9, pal.ink2, pal, { size: 11 }); };
      for (const z of model.zeros) {
        ctx.strokeStyle = pal.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x(z.s.re), f.y(z.s.im), 6, 0, 2 * Math.PI); ctx.stroke();
        times(z.s, z.mult);
      }
      for (const p of model.poles) {
        const x = f.x(p.s.re), y = f.y(p.s.im);
        ctx.strokeStyle = pal.sheet; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
        ctx.strokeStyle = pal.ink; ctx.lineWidth = 2.4;
        ctx.stroke();
        times(p.s, p.mult);
      }
      // the probe
      const px = f.x(probe.re), py = f.y(probe.im);
      ctx.strokeStyle = pal.sheet; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(px, py, 7, 0, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = pal.probe; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = pal.probe;
      ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 2 * Math.PI); ctx.fill();
      const left = px > w - 150;
      label(ctx, "s = " + fmtComplex(probe), px + (left ? -13 : 13), py - 13, pal.probe, pal, { align: left ? "right" : "left" });
    }

    // ── pointer: grab the probe, or drag the plane, or click to put the probe there ──
    let drag = null;
    const at = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const [x, y] = at(e), f = frame(), { probe, win } = store.state;
      canvas.setPointerCapture(e.pointerId);
      canvas.focus({ preventScroll: true });
      const onProbe = Math.hypot(x - f.x(probe.re), y - f.y(probe.im)) <= GRAB;
      drag = onProbe ? { kind: "probe", dx: f.x(probe.re) - x, dy: f.y(probe.im) - y } : { kind: "pan", x, y, win, moved: false };
      canvas.style.setProperty("cursor", "grabbing");
    });
    canvas.addEventListener("pointermove", (e) => {
      const [x, y] = at(e), f = frame();
      if (!drag) {
        const { probe } = store.state;
        canvas.style.setProperty("cursor", Math.hypot(x - f.x(probe.re), y - f.y(probe.im)) <= GRAB ? "grab" : "crosshair");
        return;
      }
      if (drag.kind === "probe") store.set("probe", { re: f.re(x + drag.dx), im: f.im(y + drag.dy) });
      else {
        if (!drag.moved && Math.hypot(x - drag.x, y - drag.y) < 4) return;
        drag.moved = true;
        store.set("win", { ...drag.win, cx: drag.win.cx - (x - drag.x) / f.k, cy: drag.win.cy + (y - drag.y) / f.k });
      }
    });
    const end = (e) => {
      if (drag?.kind === "pan" && !drag.moved && e.type === "pointerup") { const [x, y] = at(e), f = frame(); store.set("probe", { re: f.re(x), im: f.im(y) }); }
      drag = null;
      canvas.style.setProperty("cursor", "crosshair");
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    const zoom = (k, x = cv.size.w / 2, y = cv.size.h / 2) => {
      const f = frame(), win = store.state.win, half = Math.min(1e4, Math.max(0.05, win.half * k));
      // keep the point under the pointer where it is
      const pr = f.re(x), pi = f.im(y), r = half / win.half;
      store.set("win", { cx: pr + (win.cx - pr) * r, cy: pi + (win.cy - pi) * r, half });
    };
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); const [x, y] = at(e); zoom(Math.exp(Math.sign(e.deltaY) * 0.12), x, y); }, { passive: false });
    canvas.addEventListener("keydown", (e) => {
      const { probe, win } = store.state, step = (win.half / 40) * (e.shiftKey ? 5 : 1);
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (d) store.set("probe", { re: probe.re + d[0] * step, im: probe.im + d[1] * step });
      else if (e.key === "+" || e.key === "=") zoom(1 / 1.25);
      else if (e.key === "-" || e.key === "_") zoom(1.25);
      else return;
      e.preventDefault();
    });
    return { update(state, dirty) { if (dirty.has("model") || dirty.has("probe") || dirty.has("win") || dirty.has("theme")) draw(); } };
  },
};
