// The docking workspace. The layout is a tree: a split (row or col) of children with
// sizes that add up to 1, or a stack of tabs. Each view's element is made once and
// moved between stacks, so a canvas keeps its state when its panel is dragged.
//
// By mouse: drag a tab onto another panel's edge to split it, or onto its middle or
// tab strip to join it; drag the gap between panels to resize. By keyboard: every gap
// is a focusable separator moved with the arrow keys, and each panel's menu docks it
// against an edge of the workspace or into the next panel.
import { h, clear, icon, attachMenu } from "./ui.js";

const MIN = 0.1; // the smallest share of a split one side may be squeezed to

export const stack = (...tabs) => ({ type: "stack", tabs, active: tabs[0] });
export const row = (sizes, ...children) => ({ type: "split", dir: "row", sizes, children });
export const col = (sizes, ...children) => ({ type: "split", dir: "col", sizes, children });

/**
 * @param host    the element to fill
 * @param titles  { viewId: "Title" } for every view there is
 * @param elFor   viewId → that view's element (called when it's first needed)
 * @param onShow  called with a viewId each time its element is put on screen
 * @param onChange called after the layout changes (to save it)
 */
export function createDock(host, { titles, elFor, onShow, onChange }) {
  let tree = null, max = null, stacked = false;
  let stacks = [], shown = new Set(), dragged = false;

  // ── the tree ──
  // Drops unknown and repeated views, empty stacks and one-child splits; merges a split
  // nested in a split of the same direction; makes sizes add up to 1.
  function normalise(root) {
    const seen = new Set();
    const visit = (n) => {
      if (!n || typeof n !== "object") return null;
      if (n.type === "stack") {
        const tabs = (Array.isArray(n.tabs) ? n.tabs : []).filter((id) => titles[id] && !seen.has(id) && seen.add(id));
        return tabs.length ? { type: "stack", tabs, active: tabs.includes(n.active) ? n.active : tabs[0] } : null;
      }
      if (n.type !== "split" || !Array.isArray(n.children)) return null;
      const dir = n.dir === "col" ? "col" : "row", kids = [], sizes = [];
      n.children.forEach((c, i) => {
        const k = visit(c);
        if (!k) return;
        const size = Number.isFinite(n.sizes?.[i]) && n.sizes[i] > 0 ? n.sizes[i] : 1 / n.children.length;
        if (k.type === "split" && k.dir === dir) k.children.forEach((g, j) => { kids.push(g); sizes.push(size * k.sizes[j]); });
        else { kids.push(k); sizes.push(size); }
      });
      if (!kids.length) return null;
      if (kids.length === 1) return kids[0];
      const total = sizes.reduce((a, b) => a + b, 0);
      return { type: "split", dir, sizes: sizes.map((s) => s / total), children: kids };
    };
    return visit(root);
  }
  const allStacks = (n = tree, out = []) => { if (n?.type === "stack") out.push(n); else n?.children.forEach((c) => allStacks(c, out)); return out; };
  const stackOf = (id) => allStacks().find((s) => s.tabs.includes(id));
  const openViews = () => allStacks().flatMap((s) => s.tabs);
  function parentOf(node, n = tree) {
    if (!n || n.type !== "split") return null;
    const i = n.children.indexOf(node);
    if (i >= 0) return { parent: n, index: i };
    for (const c of n.children) { const hit = parentOf(node, c); if (hit) return hit; }
    return null;
  }
  function detach(id) {
    const s = stackOf(id);
    if (!s) return;
    s.tabs = s.tabs.filter((t) => t !== id);
    if (s.active === id) s.active = s.tabs[0];
  }
  function commit(focusKey) {
    tree = normalise(tree);
    if (max && !openViews().includes(max)) max = null;
    render(focusKey);
    onChange?.();
  }
  // Put a view beside (zone: left, right, top, bottom) or into (zone: tab) a stack.
  function place(id, target, zone) {
    const source = stackOf(id);
    if (zone === "tab") {
      if (source === target) return;
      detach(id);
      target.tabs.push(id);
      target.active = id;
    } else {
      if (source === target && target.tabs.length === 1) return;
      detach(id);
      const fresh = stack(id), dir = zone === "left" || zone === "right" ? "row" : "col";
      const pair = zone === "left" || zone === "top" ? [fresh, target] : [target, fresh];
      const at = parentOf(target);
      const split = { type: "split", dir, sizes: [0.5, 0.5], children: pair };
      if (at) at.parent.children[at.index] = split; else tree = split;
    }
    commit("tab:" + id);
  }
  // Against an edge of the whole workspace: the keyboard's way to rearrange.
  function dockEdge(id, edge) {
    detach(id);
    tree = normalise(tree);
    const fresh = stack(id), dir = edge === "left" || edge === "right" ? "row" : "col";
    if (!tree) tree = fresh;
    else tree = { type: "split", dir, sizes: edge === "left" || edge === "top" ? [0.32, 0.68] : [0.68, 0.32], children: edge === "left" || edge === "top" ? [fresh, tree] : [tree, fresh] };
    commit("tab:" + id);
  }
  function joinNext(id) {
    const all = allStacks(), i = all.indexOf(stackOf(id));
    if (all.length < 2) return;
    place(id, all[(i + 1) % all.length], "tab");
  }

  // ── drawing it ──
  function render(focusKey) {
    const keep = focusKey ?? (host.contains(document.activeElement) ? document.activeElement.dataset.key : null);
    clear(host);
    stacks = [];
    shown = new Set();
    host.dataset.mode = stacked ? "stacked" : max ? "max" : "dock";
    if (!tree) host.append(h("div", { class: "dk-empty" }, h("p", { text: "Every view is closed. Open one from the Views menu, or pick a layout." })));
    else if (stacked) for (const id of openViews()) host.append(stackEl({ type: "stack", tabs: [id], active: id }, "flat"));
    else if (max) host.append(stackEl({ type: "stack", tabs: [max], active: max }, "max"));
    else host.append(build(tree, "r"));
    for (const id of shown) onShow?.(id);
    if (keep) host.querySelector(`[data-key="${CSS.escape(keep)}"]`)?.focus();
  }
  function build(n, path) {
    if (n.type === "stack") return stackEl(n);
    const el = h("div", { class: "dk-split", "data-dir": n.dir });
    n.children.forEach((c, i) => {
      if (i) el.append(gutter(n, i - 1, el, path));
      const kid = build(c, path + i);
      kid.style.setProperty("flex", `${n.sizes[i]} 1 0px`);
      el.append(kid);
    });
    return el;
  }
  function stackEl(n, kind) {
    const id = n.active, real = kind ? stackOf(id) : n;
    const tabs = h("div", { class: "dk-tabs sd-tabs", role: "tablist" });
    for (const t of n.tabs) {
      const tab = h("button", { class: "sd-tab dk-tab", type: "button", role: "tab", "aria-selected": String(t === id), tabindex: t === id ? 0 : -1, "data-key": "tab:" + t, text: titles[t] });
      tab.addEventListener("click", () => { if (dragged || real.active === t) return; real.active = t; commit("tab:" + t); });
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = n.tabs.indexOf(t), next = n.tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + n.tabs.length) % n.tabs.length];
        if (next !== t) { real.active = next; commit("tab:" + next); }
        e.preventDefault();
      });
      if (!kind) tab.addEventListener("pointerdown", (e) => startDrag(e, t, tab));
      tabs.append(tab);
    }
    const more = h("button", { class: "sd-btn sd-ghost sd-small sd-icon", type: "button", title: "Move this panel", "aria-label": `Move the ${titles[id]} panel`, "data-key": "more:" + id }, icon("more"));
    attachMenu(more, () => [
      { label: "Dock left", run: () => dockEdge(id, "left") },
      { label: "Dock right", run: () => dockEdge(id, "right") },
      { label: "Dock top", run: () => dockEdge(id, "top") },
      { label: "Dock bottom", run: () => dockEdge(id, "bottom") },
      { label: "Join the next panel", run: () => joinNext(id), disabled: allStacks().length < 2 },
    ]);
    const maxBtn = h("button", { class: "sd-btn sd-ghost sd-small sd-icon", type: "button", title: max ? "Restore" : "Maximize", "aria-label": `${max ? "Restore" : "Maximize"} the ${titles[id]} panel`, "aria-pressed": String(!!max), "data-key": "max:" + id, on: { click: () => api.maximize(max ? null : id) } }, icon(max ? "restore" : "max"));
    const closeBtn = h("button", { class: "sd-btn sd-ghost sd-small sd-icon", type: "button", title: "Close", "aria-label": `Close the ${titles[id]} panel`, "data-key": "close:" + id, on: { click: () => api.close(id) } }, icon("close"));
    const body = h("div", { class: "dk-body", role: "tabpanel", "aria-label": titles[id] }, elFor(id));
    shown.add(id);
    const el = h("section", { class: "dk-stack", "data-kind": kind || "dock", "data-view": id },
      h("header", { class: "dk-head" }, tabs, h("div", { class: "dk-acts" }, kind ? null : more, kind === "flat" ? null : maxBtn, closeBtn)), body);
    if (!kind) stacks.push({ el, node: n });
    return el;
  }

  // The gap between two panels: a separator that drags, and moves with the arrow keys.
  function gutter(split, i, splitEl, path) {
    const horizontal = split.dir === "row";
    const g = h("div", { class: "dk-gutter", role: "separator", tabindex: 0, "aria-orientation": horizontal ? "vertical" : "horizontal", "aria-label": "Resize the panels on either side", "data-key": `gut:${path}:${i}` });
    const label = () => {
      const pair = split.sizes[i] + split.sizes[i + 1];
      g.setAttribute("aria-valuenow", String(Math.round((100 * split.sizes[i]) / pair)));
      g.setAttribute("aria-valuemin", String(Math.round((100 * MIN) / pair)));
      g.setAttribute("aria-valuemax", String(Math.round(100 - (100 * MIN) / pair)));
    };
    const shift = (d) => {
      const pair = split.sizes[i] + split.sizes[i + 1], lo = Math.min(MIN, pair / 2);
      const a = Math.min(pair - lo, Math.max(lo, split.sizes[i] + d));
      split.sizes[i] = a;
      split.sizes[i + 1] = pair - a;
      const kids = [...splitEl.children].filter((c) => !c.classList.contains("dk-gutter"));
      kids[i].style.setProperty("flex", `${a} 1 0px`);
      kids[i + 1].style.setProperty("flex", `${pair - a} 1 0px`);
      label();
    };
    label();
    g.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      g.dataset.active = "";
      let last = horizontal ? e.clientX : e.clientY;
      const move = (ev) => {
        const now = horizontal ? ev.clientX : ev.clientY, size = horizontal ? splitEl.clientWidth : splitEl.clientHeight;
        shift((now - last) / size);
        last = now;
      };
      const up = () => { g.removeEventListener("pointermove", move); delete g.dataset.active; onChange?.(); };
      g.addEventListener("pointermove", move);
      g.addEventListener("pointerup", up, { once: true });
      g.addEventListener("pointercancel", up, { once: true });
    });
    g.addEventListener("keydown", (e) => {
      const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!d) return;
      shift(d * (e.shiftKey ? 0.1 : 0.02));
      onChange?.();
      e.preventDefault();
    });
    return g;
  }

  // ── dragging a tab ──
  function startDrag(e, id, tab) {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    let ghost = null, drop = null, target = null;
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ghost = h("div", { class: "dk-ghost sd-tag", text: titles[id] });
        drop = h("div", { class: "dk-drop", hidden: true });
        document.body.append(ghost);
        host.append(drop);
        host.dataset.dragging = "";
      }
      ghost.style.setProperty("left", ev.clientX + 12 + "px");
      ghost.style.setProperty("top", ev.clientY + 12 + "px");
      target = hit(ev.clientX, ev.clientY, id);
      drop.hidden = !target;
      if (target) {
        const box = host.getBoundingClientRect();
        for (const [k, v] of Object.entries({ left: target.rect.x - box.x, top: target.rect.y - box.y, width: target.rect.w, height: target.rect.h })) drop.style.setProperty(k, v + "px");
      }
    };
    const up = () => {
      tab.removeEventListener("pointermove", move);
      if (!ghost) return;
      ghost.remove();
      drop.remove();
      delete host.dataset.dragging;
      dragged = true; // the click that follows the drop isn't a click on the tab
      setTimeout(() => (dragged = false));
      if (target) place(id, target.node, target.zone);
    };
    tab.setPointerCapture(e.pointerId);
    tab.addEventListener("pointermove", move);
    tab.addEventListener("pointerup", up, { once: true });
    tab.addEventListener("pointercancel", up, { once: true });
  }
  // Which stack is under the pointer, and which part of it: an edge strip splits it,
  // the middle or the tab strip joins it.
  function hit(x, y, id) {
    for (const { el, node } of stacks) {
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const own = node.tabs.includes(id), head = el.querySelector(".dk-head").getBoundingClientRect();
      const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
      let zone = y <= head.bottom ? "tab" : fx < 0.25 ? "left" : fx > 0.75 ? "right" : fy < 0.3 ? "top" : fy > 0.7 ? "bottom" : "tab";
      if (own && (zone === "tab" || node.tabs.length === 1)) return null;
      const half = { left: [0, 0, 0.5, 1], right: [0.5, 0, 0.5, 1], top: [0, 0, 1, 0.5], bottom: [0, 0.5, 1, 0.5], tab: [0, 0, 1, 1] }[zone];
      return { node, zone, rect: { x: r.left + half[0] * r.width, y: r.top + half[1] * r.height, w: half[2] * r.width, h: half[3] * r.height } };
    }
    return null;
  }

  host.addEventListener("keydown", (e) => { if (e.key === "Escape" && max) { api.maximize(null); e.preventDefault(); } });

  const api = {
    /** The layout as plain data (for saving). */
    get: () => (tree ? JSON.parse(JSON.stringify(tree)) : null),
    /** Replace the layout. Returns false, changing nothing, if the data isn't a usable layout. */
    set(next) {
      const clean = normalise(next ? JSON.parse(JSON.stringify(next)) : null);
      if (next && !clean) return false;
      tree = clean;
      max = null;
      commit();
      return true;
    },
    /** A view's element, made (and the view mounted) if it hasn't been yet. */
    elFor,
    isOpen: (id) => openViews().includes(id),
    isShown: (id) => shown.has(id),
    open(id) {
      const s = stackOf(id);
      if (s) { s.active = id; max = max && max !== id ? null : max; commit("tab:" + id); return; }
      if (!tree) { tree = stack(id); commit("tab:" + id); return; }
      // beside the biggest panel, along its longer side
      let best = null;
      for (const x of stacks) { const r = x.el.getBoundingClientRect(); if (!best || r.width * r.height > best.area) best = { node: x.node, area: r.width * r.height, wide: r.width > r.height * 1.2 }; }
      max = null;
      if (best) place(id, best.node, best.wide ? "right" : "bottom"); else dockEdge(id, "right");
    },
    close(id) {
      const s = stackOf(id), next = s?.tabs.find((t) => t !== id);
      detach(id);
      if (max === id) max = null;
      commit(next ? "tab:" + next : undefined);
    },
    maximize(id) { max = id && openViews().includes(id) ? id : null; render(id ? "max:" + id : undefined); },
    /** One column, every open view under the last: for narrow screens. */
    setStacked(on) { if (stacked !== on) { stacked = on; render(); } },
  };
  return api;
}
