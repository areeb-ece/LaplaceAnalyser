/* End-to-end check in a real browser (needs Playwright: `npm i --no-save playwright@1.56.1`).
 * Serves the site at /LaplaceAnalyser/ as GitHub Pages does and asserts: no script
 * errors, no Content Security Policy violations, no request leaves the page's own files,
 * no sideways scrolling at laptop or phone width; the probe drives every view in the
 * same frame; the numerical integral agrees with F(s) to 1%; panels move, resize, close,
 * reopen and survive a reload; bad input is refused in words; storage can be missing.
 * Screenshots go to test-results/screenshots/.
 *
 * The shared theme, settings panel and night sky live in the portfolio repo
 * (areeb-ece.github.io, public/design/). Without them the page must fall back to its own
 * copy (assets/design/) and its light/dark switch, which is what runs by default. To
 * check the real thing:
 *   DESIGN_DIR=../areeb-ece.github.io/public/design npm run test:browser */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { serve, ROOT, BASE_PATH } from "./serve.js";

// Playwright from this folder's node_modules, or a machine-wide install.
const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));

const SHOTS = path.join(ROOT, "test-results", "screenshots");
const { server, origin, design } = await serve();
const base = origin + BASE_PATH;
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], // WebGL without a GPU
});
fs.mkdirSync(SHOTS, { recursive: true });

const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
async function open(viewport, init, more = {}) {
  const context = await browser.newContext({ viewport, ...more });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [], outside = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:" + origin)) outside.push(r.url()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
  });
  page.setDefaultTimeout(90000); // a machine with no GPU draws WebGL in software, slowly
  await page.goto(base);
  await page.waitForSelector(".dk-stack");
  // Hold the sky still. Its drift repaints the whole page every frame, which a software
  // renderer can't keep up with once a WebGL canvas is on it; nothing checked here moves.
  if (design) await page.evaluate(() => window.SiteDesign?.set({ motion: false }));
  await frame(page); // views fill themselves in on the first frame after they're shown
  const clean = async (what) => {
    assert.deepEqual(errors, [], `${what}: script errors`);
    assert.deepEqual(await page.evaluate(() => window.__csp), [], `${what}: CSP violations`);
    assert.deepEqual(outside, [], `${what}: requests leaving the site`);
    const wide = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(wide[0] <= wide[1] + 1, `${what} scrolls sideways: ${wide}`);
  };
  return { page, context, clean };
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + ".png"), timeout: 120000 });
// The key under a plot, one line per item: its words, then the TeX of its maths.
const figures = (page, view) => page.$eval(`.view[data-view="${view}"] .key`, (key) => [...key.children].map((k) => [...k.querySelectorAll(":scope > span")].map((sp) => (sp.classList.contains("m") ? (sp.hidden ? "" : (sp.dataset.tex || "").slice(1)) : sp.textContent)).join(" ").trim()).join("\n"));
const PROBE_LABEL = '.view[data-view="surface"] .mlayer .ml[data-tex^="Is ="]';
const texOf = (page, selector) => page.locator(selector).first().getAttribute("data-tex");
const complex = (text) => { const m = /= (-?[\d.]+) ([+-]) ([\d.]+)i/.exec(text); return [Number(m[1]), (m[2] === "-" ? -1 : 1) * Number(m[3])]; };
const openViews = (page) => page.$$eval(".dk-stack", (els) => els.map((e) => e.dataset.view));
const setTime = (page, t) => page.evaluate((v) => { const r = document.getElementById("timeRange"); r.value = String(v); r.dispatchEvent(new Event("input")); }, t);
// The maths boxes are typed into key by key, as a person would; what a box holds is
// kept as text beside it (for screen readers), which is what gets read back here.
const typeInto = async (page, id, text) => { await page.focus(id); await page.keyboard.press("Control+a"); await page.keyboard.press("Backspace"); await page.keyboard.type(text); };
const typeExpr = async (page, text) => { await typeInto(page, "#inExpr", text); await page.keyboard.press("Enter"); await frame(page); };
const exprText = (page) => page.textContent("#inExprText");
const typeExprIn = async (page, mode, text) => { if (await page.locator('[data-key="tab:input"]').count()) await page.click('[data-key="tab:input"]'); await page.click(`[data-mode="${mode}"]`); await typeExpr(page, text); };

let failed = false;
try {
  // ── laptop: 1280 wide, the narrowest the layout is meant for ──
  {
    const { page, clean } = await open({ width: 1280, height: 720 });
    if (design) {
      assert.ok(await page.isVisible("#designSettings"), "shared settings button");
      assert.ok(await page.isHidden("#btnTheme"), "fallback switch hidden");
      assert.ok((await page.$$eval("#stage .sky circle", (c) => c.length)) > 0, "stars behind the panels");
    } else {
      assert.ok(await page.isVisible("#btnTheme"), "offline light/dark switch");
      await page.click("#btnTheme");
      assert.equal(await page.getAttribute("html", "data-theme"), "light");
      await frame(page);
      await shot(page, "laptop-overview-light");
      await page.click("#btnTheme");
    }

    // First visit: the cosine, in the Overview layout, nothing playing.
    assert.deepEqual(await openViews(page), ["input", "surface", "time", "pz"]);
    assert.equal(await exprText(page), "cos(t)");
    assert.equal(await page.getAttribute("#btnPlay", "aria-pressed"), "false");
    assert.ok((await page.$$eval("#inExamples option", (o) => o.length)) - 1 >= 8, "at least 8 examples");
    assert.ok((await page.$$eval("#inExamples optgroup", (g) => g.length)) >= 8, "from several fields");
    await page.waitForSelector(PROBE_LABEL, { timeout: 60000 });
    await frame(page);
    await shot(page, "laptop-overview");
    const png = await page.locator('.view[data-view="surface"] .plot > canvas').first().screenshot({ timeout: 120000 });
    assert.ok(png.length > 20000, `the surface is drawn (${png.length} bytes of picture)`);

    // The transform of cos(t) is s/(s² + 1): poles at ±i.
    await page.click('[data-key="tab:steps"]');
    await page.waitForSelector('.steps .math .katex');
    assert.match(await page.locator(".steps .math").nth(1).getAttribute("data-tex"), /\\frac\{s\}\{s\^\{2\} \+ 1\}/);
    await page.click('[data-key="tab:input"]');

    // Maths is typeset, not written out: the labels on the plots and the names in the page.
    assert.ok((await page.locator('.view[data-view="time"] .mlayer .katex').count()) >= 2, "the time plot's labels are KaTeX");
    assert.ok((await page.locator('.view[data-view="pz"] .mlayer .katex').count()) >= 1, "so is the probe's");
    assert.ok((await page.locator("#timeOut .katex").count()) === 1 && (await page.locator(".strip .probe .katex").count()) === 3);

    // ── the probe ──
    await page.click('[data-layout="probe"]');
    assert.deepEqual((await openViews(page)).sort(), ["integral", "integrand", "pz", "surface", "time"]);
    await page.fill("#probeRe", "0.5");
    await page.fill("#probeIm", "1");
    await frame(page);
    // inside the region of convergence the numerical integral matches the closed form to 1%
    const text = await figures(page, "integral");
    const [sum, closed] = text.split("\n").filter((l) => l.includes("=")).map(complex);
    assert.ok(Math.hypot(closed[0] - 1.059, closed[1] + 0.235) < 2e-3, `F(0.5 + i) for cos(t): ${closed}`);
    assert.ok(Math.hypot(sum[0] - closed[0], sum[1] - closed[1]) <= 0.01 * Math.hypot(...closed), `integral ${sum} against F(s) ${closed}`);
    assert.match(text, /Converges/);
    await shot(page, "laptop-probe");

    // dragging the probe on the pole-zero map: every view has the new s one frame later
    await setTime(page, 2.5);
    await frame(page);
    const before = { integrand: await figures(page, "integrand"), integral: await figures(page, "integral"), label: await texOf(page, PROBE_LABEL) };
    const pz = await page.locator('.view[data-view="pz"] .plot > canvas').boundingBox();
    const spot = await page.evaluate(() => {
      // where the probe is drawn: the map shows a square of half-width 3 centred on 0 for cos(t)
      const c = document.querySelector('.view[data-view="pz"] .plot > canvas'), k = Math.min(c.clientWidth, c.clientHeight) / 6;
      return [c.clientWidth / 2 + 0.5 * k, c.clientHeight / 2 - 1 * k];
    });
    await page.mouse.move(pz.x + spot[0], pz.y + spot[1]);
    await page.mouse.down();
    await page.mouse.move(pz.x + spot[0] + 40, pz.y + spot[1] + 25, { steps: 3 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    const mid = { integrand: await figures(page, "integrand"), integral: await figures(page, "integral"), label: await texOf(page, PROBE_LABEL) };
    await page.mouse.up();
    for (const k of ["integrand", "integral", "label"]) assert.notEqual(mid[k], before[k], `${k} follows the probe`);
    assert.notEqual(await page.inputValue("#probeRe"), "0.5");

    // in the 3D view: arrow keys move it, and a click on the surface puts it there
    const surf = page.locator('.view[data-view="surface"] .plot > canvas').first();
    await surf.focus();
    const reBefore = Number(await page.inputValue("#probeRe"));
    await page.keyboard.press("ArrowRight");
    await frame(page);
    assert.ok(Number(await page.inputValue("#probeRe")) > reBefore, "arrow key moves the probe");
    const sb = await surf.boundingBox();
    await page.mouse.click(sb.x + sb.width * 0.62, sb.y + sb.height * 0.66);
    await frame(page);
    assert.notEqual(await texOf(page, PROBE_LABEL), mid.label, "a click on the surface places the probe");
    // dragging the probe's foot in 3D moves it too
    // the label sits 14 px right of and 12 px below the probe's foot, centred on its own height
    const foot = await page.evaluate((sel) => { const l = document.querySelector(sel), m = new DOMMatrix(getComputedStyle(l).transform); return [m.e - 14, m.f + l.offsetHeight / 2 - 12]; }, PROBE_LABEL);
    const placed = await page.inputValue("#probeRe");
    await page.mouse.move(sb.x + foot[0], sb.y + foot[1]);
    await page.mouse.down();
    await page.mouse.move(sb.x + foot[0] - 50, sb.y + foot[1] + 10, { steps: 3 });
    await page.mouse.up();
    await frame(page);
    assert.notEqual(await page.inputValue("#probeRe"), placed, "dragging in 3D moves the probe");

    // left of the imaginary axis the integral diverges, but F(s) still has a value
    await page.fill("#probeRe", "-0.3");
    await frame(page);
    const off = await figures(page, "integral");
    assert.match(off, /Diverges/);
    assert.match(off, /analytic continuation/);
    assert.match(off.split("\n")[1], /= -?[\d.]+ [+-] [\d.]+i/);
    await shot(page, "laptop-diverges");
    await page.fill("#probeRe", "0");
    await frame(page);
    assert.match(await figures(page, "integral"), /Never settles/);

    // ── time ──
    await setTime(page, 3);
    await frame(page);
    assert.match(await texOf(page, "#timeOut"), /t = 3\.00/);
    await page.locator('.view[data-view="time"] .plot > canvas').focus();
    await page.keyboard.press("ArrowRight");
    await frame(page);
    assert.match(await texOf(page, "#timeOut"), /t = 3\.10/);
    await page.click("#btnPlay");
    await page.waitForTimeout(250);
    assert.equal(await page.getAttribute("#btnPlay", "aria-pressed"), "true");
    await page.click("#btnPlay");
    await frame(page);
    assert.ok(Number((await texOf(page, "#timeOut")).match(/[\d.]+/)[0]) > 3.1, "time advanced while playing");

    // ── input: equations, examples, refusals ──
    await page.click('[data-layout="ode"]');
    await frame(page);
    assert.equal(await page.getAttribute('[data-mode="ode"]', "aria-checked"), "true");
    await page.selectOption("#inExamples", "resonance");
    await frame(page);
    assert.equal(await exprText(page), "y'' + 4y = cos(2t)");
    assert.equal(await page.locator(".steps li").count(), 5);
    assert.match(await page.locator(".steps .math").last().getAttribute("data-tex"), /y\(t\) = \\tfrac\{1\}\{4\}\\,t\\,\\sin\(2t\)/);
    assert.match(await figures(page, "decomp"), /Poles above the axis\nTheir conjugates\nTheir sum, y\(/, "the decomposition's key names each kind of pole");
    assert.match(await page.locator(".form .about").innerText(), /Forced at resonance/, "the example says what it models");
    await typeInto(page, "#inIc0", "1");
    // typing is read after a short pause; wait for the solution to follow rather than for a fixed time
    await page.waitForFunction(() => /\\cos\(2t\)/.test([...document.querySelectorAll(".steps .math")].at(-1)?.dataset.tex ?? ""), null, { timeout: 10000 });
    await shot(page, "laptop-ode");
    await typeExpr(page, "y'' + y^2 = 0");
    assert.match(await page.locator("#inError").innerText(), /non-linear/);
    assert.ok(await page.locator("#dock").getAttribute("data-stale") !== null, "views dimmed while the input is wrong");
    await typeExpr(page, "y''' + y = 1");
    assert.ok(await page.isHidden("#inError"));
    assert.equal(await page.locator("#dock").getAttribute("data-stale"), null);
    assert.equal(await page.locator(".ics .mf").count(), 3, "a third-order equation asks for three starting values");
    await page.click('[data-mode="rational"]');
    await typeExpr(page, "s^2 /(s+1)");
    assert.match(await page.locator("#inError").innerText(), /lower degree/);

    // ── the maths box: typeset while it is typed ──
    const box = '.view[data-view="input"] .form > .sd-field .mf';
    const keys = (text) => page.keyboard.type(text);
    await typeInto(page, "#inExpr", "(s+3)/((s+1)(s^2 +4))");
    assert.equal(await exprText(page), "(s + 3)/((s + 1)(s^2 + 4))", "a typed line comes out as the fraction it is");
    assert.equal(await page.locator(`${box} .mf-frac`).count(), 1);
    assert.equal(await page.locator(`${box} .mf-frac > .mf-row`).first().innerText(), "s+3", "brackets around a whole numerator are dropped");
    assert.equal(await page.locator(`${box} .mf-sup`).count(), 1, "and ^ makes a power");
    assert.equal(await page.locator(`${box} .mf-caret`).count(), 1, "the cursor is drawn while the box has the focus");
    // the bar is level with the minus sign beside it
    await typeInto(page, "#inExpr", "s-1/(s^2 +1)");
    const level = await page.$eval(box, (el) => {
      const line = el.querySelector(".mf-body > .mf-row");
      return { bar: line.querySelector(".mf-frac > .mf-row + .mf-row").getBoundingClientRect().top, base: line.querySelector(":scope > .mf-base").getBoundingClientRect().top, size: parseFloat(getComputedStyle(line).fontSize) };
    });
    assert.ok(Math.abs(level.base - level.bar - 0.25 * level.size) < 1.5, `the fraction bar is a quarter of an em above the baseline (${(level.base - level.bar).toFixed(1)}px at ${level.size}px)`);
    // without the space the power keeps going, and the box shows it
    await typeInto(page, "#inExpr", "1/s^2+4");
    assert.equal(await exprText(page), "1/(s^(2 + 4))");
    // Backspace takes a fraction apart again; undo and redo
    await typeInto(page, "#inExpr", "1/");
    assert.equal(await page.locator(`${box} .mf-empty`).count(), 1, "an empty denominator shows as a box to fill");
    await page.keyboard.press("Enter");
    await frame(page);
    assert.match(await page.locator("#inError").innerText(), /still empty/);
    await page.keyboard.press("Backspace");
    assert.equal(await exprText(page), "1");
    await page.keyboard.press("Control+z");
    assert.equal(await page.locator(`${box} .mf-frac`).count(), 1, "undo");
    await page.keyboard.press("Control+Shift+z");
    assert.equal(await page.locator(`${box} .mf-frac`).count(), 0, "redo");
    // brackets close themselves; the keys under the box type for you
    await typeInto(page, "#inExpr", "1/((s+1");
    assert.equal(await page.locator(`${box} .mf-ghost`).count(), 2, "an open bracket gets a grey partner");
    assert.equal(await exprText(page), "1/((s + 1))");
    await typeInto(page, "#inExpr", "s");
    await page.click('.mf-keys [aria-label="Power"]');
    await keys("2 +1");
    await page.keyboard.press("Control+a");
    await page.click('.mf-keys [aria-label="Fraction"]');
    await keys("s^3");
    assert.equal(await exprText(page), "(s^2 + 1)/(s^3)", "a selection becomes the numerator");
    // a click puts the cursor where it lands: in the numerator, after the s
    const s0 = await page.locator(`${box} .mf-frac > .mf-row`).first().locator(".mf-var").boundingBox();
    await page.mouse.click(s0.x + s0.width - 1, s0.y + s0.height / 2);
    await keys("t");
    assert.equal(await exprText(page), "(st^2 + 1)/(s^3)");
    // pasted text is read whole, the way the parser reads it
    await page.focus("#inExpr");
    await page.keyboard.press("Control+a");
    await page.evaluate(() => { const data = new DataTransfer(); data.setData("text/plain", "1/(s^2 + 2s + 5)"); document.getElementById("inExpr").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })); });
    assert.equal(await exprText(page), "1/(s^2 + 2s + 5)");
    await page.keyboard.press("Enter");
    await frame(page);
    assert.ok(await page.isHidden("#inError"));
    await shot(page, "laptop-typed");

    // ── panels: move, resize, close, reopen, and all of it after a reload ──
    await page.click('[data-layout="overview"]');
    const tab = await page.locator('[data-key="tab:time"]').boundingBox(), target = await page.locator('.dk-stack[data-view="surface"]').boundingBox();
    await page.mouse.move(tab.x + 20, tab.y + 10);
    await page.mouse.down();
    await page.mouse.move(tab.x - 30, tab.y + 50, { steps: 3 });
    await page.mouse.move(target.x + 30, target.y + target.height / 2, { steps: 5 });
    assert.ok(await page.isVisible(".dk-drop"), "a drop zone shows where the panel will land");
    await page.mouse.up();
    assert.deepEqual(await openViews(page), ["input", "time", "surface", "pz"], "the time panel moved left of the surface");
    const widthOf = async (v) => (await page.locator(`.dk-stack[data-view="${v}"]`).boundingBox()).width;
    const w0 = await widthOf("input");
    await page.locator(".dk-gutter").first().focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
    assert.ok((await widthOf("input")) > w0 + 40, "arrow keys on a gap resize the panels");
    const gut = await page.locator(".dk-gutter").first().boundingBox(), w1 = await widthOf("input");
    await page.mouse.move(gut.x + gut.width / 2, gut.y + 200);
    await page.mouse.down();
    await page.mouse.move(gut.x - 60, gut.y + 200, { steps: 3 });
    await page.mouse.up();
    assert.ok((await widthOf("input")) < w1 - 40, "dragging a gap resizes the panels");
    await page.click('[data-key="max:pz"]');
    assert.deepEqual(await openViews(page), ["pz"], "maximized");
    await page.keyboard.press("Escape");
    assert.equal((await openViews(page)).length, 4, "Escape restores");
    await page.click('[data-key="close:pz"]');
    assert.ok(!(await openViews(page)).includes("pz"), "closed");
    await page.click("#btnViews");
    await page.click('.menu button:has-text("Decomposition")');
    await page.locator('[data-key="more:decomp"]').click();
    await page.click('.menu button:has-text("Dock bottom")');
    const layout = await openViews(page);
    assert.deepEqual(layout, ["input", "time", "surface", "decomp"]);
    const sizes = await page.evaluate(() => localStorage.getItem("laplaceanalyser.layout"));
    await page.reload();
    await page.waitForSelector(".dk-stack");
    await frame(page);
    assert.deepEqual(await openViews(page), layout, "the layout survives a reload");
    assert.equal(await page.evaluate(() => localStorage.getItem("laplaceanalyser.layout")), sizes);
    assert.equal(await exprText(page), "1/(s^2 + 2s + 5)", "and so does the last input");
    await frame(page);
    await shot(page, "laptop-rearranged");
    await page.click("#btnViews");
    await page.click('.menu button:has-text("Pole-zero map")');
    assert.ok((await openViews(page)).includes("pz"), "reopened from the Views menu");
    await page.click("#btnReset");
    assert.deepEqual(await openViews(page), ["input", "surface", "time", "pz"], "reset");

    // ── saving pictures ──
    {
      const read = async (download) => { const file = path.join(SHOTS, "saved-" + download.suggestedFilename()); await download.saveAs(file); return fs.readFileSync(file); };
      const saveNow = async () => { const [d] = await Promise.all([page.waitForEvent("download", { timeout: 300000 }), page.click(".export .sd-primary")]); return { name: d.suggestedFilename(), bytes: await read(d) }; };
      const tickBox = (text, on) => page.locator(`.export .sd-check:has-text("${text}") input`).setChecked(on);
      const previewed = () => page.$eval(".ex-canvas", (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i]) ink++; return { w: c.width, h: c.height, ink, corner: d[3] }; });
      const settle = () => page.waitForTimeout(500);
      await page.click('[data-layout="probe"]');
      await typeExprIn(page, "function", "e^(-0.5t) sin(3t)");
      await page.click("#btnImage");
      await page.waitForSelector(".export[open]");
      await settle();
      assert.equal(await page.locator(".export .ex-view input:checked").count(), 5, "it starts with the views that are open");
      let pre = await previewed();
      assert.ok(pre.ink > 100 && pre.corner === 255, "a preview is drawn, on the sheet");
      assert.ok(Math.abs(pre.w / pre.h - 16 / 9) < 0.02, "16 : 9 to begin with");
      // a still, as it comes
      let got = await saveNow();
      assert.equal(got.name, "laplace-analyser-e-0-5t-sin-3t.png");
      assert.deepEqual([got.bytes.readUInt32BE(16), got.bytes.readUInt32BE(20)], [1920, 1080], "PNG size");
      assert.match(await page.locator(".ex-status").innerText(), /Saved .*\.png · 1,920 × 1,080 px/);
      // another shape, the light sheet, see-through, without the probe or the cursor
      await page.selectOption('.export select[aria-label="Shape"]', "1:1");
      await page.fill('.export input[aria-label="Width in pixels"]', "1000");
      await page.locator('.export input[aria-label="Width in pixels"]').dispatchEvent("change");
      await page.click('.export [data-v="light"]');
      await tickBox("See-through", true); await tickBox("Probe point", false); await tickBox("Time cursor", false); await tickBox("Worked steps", true);
      await page.click('.ex-view:has-text("S-plane surface") [data-v="l"]');
      await settle();
      pre = await previewed();
      assert.ok(pre.corner === 0 && pre.ink > 50, "a see-through preview");
      assert.ok(Math.abs(pre.w - pre.h) <= 2, "square");
      got = await saveNow();
      assert.deepEqual([got.bytes.readUInt32BE(16), got.bytes.readUInt32BE(20), got.bytes[25]], [1000, 1000, 6], "a square PNG with an alpha channel");
      await shot(page, "laptop-save-dialog");
      // time playing: a GIF, then a video where the browser can record one
      await page.click('.export [data-v="dark"]');
      await tickBox("See-through", false); await tickBox("S-plane surface", false); await tickBox("Worked steps", false);
      await page.click('.export [data-v="gif"]');
      await page.fill('.export input[aria-label="Width in pixels"]', "480");
      await page.locator('.export input[aria-label="Width in pixels"]').dispatchEvent("change");
      await page.selectOption('.export select[aria-label="Length"]', "4");
      await page.selectOption('.export select[aria-label="Smoothness"]', "10");
      assert.match(await page.locator(".ex-side .sd-hint").innerText(), /480 × 480 px, 40 frames/);
      got = await saveNow();
      assert.equal(got.bytes.subarray(0, 6).toString("latin1"), "GIF89a");
      assert.deepEqual([got.bytes.readUInt16LE(6), got.bytes.readUInt16LE(8)], [480, 480], "GIF size");
      let frames = 0;
      for (let i = 0; i < got.bytes.length - 8; i++) if (got.bytes[i] === 0x21 && got.bytes[i + 1] === 0xf9 && got.bytes[i + 2] === 4 && got.bytes[i + 7] === 0) frames++;
      assert.ok(frames >= 40, `the GIF has its 40 frames (${frames} found)`);
      if (await page.locator('.export [data-v="video"]').isEnabled()) {
        await page.click('.export [data-v="video"]');
        got = await saveNow();
        assert.match(got.name, /\.(mp4|webm)$/);
        assert.ok(got.bytes.length > 20000, `a video of ${got.bytes.length} bytes`);
      }
      await page.click('.export header button[aria-label="Close"]');
      await page.waitForSelector(".export", { state: "hidden" });
      // the choices are remembered
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("laplaceanalyser.image")).ratio), "1:1");
    }

    // ── keyboard and focus ──
    await page.focus("#btnPlay");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "timeRange");
    const ring = await page.evaluate(() => { const b = document.getElementById("btnViews"); b.focus(); return getComputedStyle(b).outlineStyle; });
    assert.ok(ring === "solid" || ring === "auto", "a visible focus ring");
    await page.click("#btnHelp");
    assert.ok(await page.isVisible("#help"));
    await page.keyboard.press("Escape");
    await page.waitForSelector("#help", { state: "hidden" }); // it fades out first

    if (design) {
      for (const theme of ["light", "console", "synthwave"]) {
        await page.evaluate((t) => SiteDesign.set({ theme: t }), theme);
        assert.equal(await page.getAttribute("html", "data-theme"), theme);
        await page.waitForTimeout(350); // colours cross-fade
        await shot(page, "laptop-theme-" + theme);
      }
      await page.evaluate(() => SiteDesign.reset());
    }
    await clean("laptop");
    await page.context().close();
  }

  // ── every example opens without complaint ──
  {
    const { page, clean } = await open({ width: 1440, height: 900 });
    const ids = await page.$$eval("#inExamples option", (o) => o.map((x) => x.value).filter(Boolean));
    assert.ok(ids.length >= 50, `${ids.length} examples`);
    for (const id of ids) {
      await page.selectOption("#inExamples", id);
      await frame(page);
      assert.ok(await page.isHidden("#inError"), id);
      if (["car", "coupled", "aircraft", "string", "erlang"].includes(id)) await shot(page, "example-" + id);
    }
    await clean("examples");
    await page.context().close();
  }

  // ── phone: one column, nothing sideways ──
  {
    const { page, clean } = await open({ width: 390, height: 844 }, null, { hasTouch: true });
    assert.equal(await page.getAttribute("#dock", "data-mode"), "stacked");
    const heights = await page.$$eval(".dk-body", (els) => els.map((e) => e.clientHeight));
    assert.ok(heights.every((v) => v > 100), `every view has room: ${heights}`);
    // a tap puts the cursor in the maths box (and so raises the keyboard); its keys type for a thumb
    await page.tap('.view[data-view="input"] .form > .sd-field .mf');
    assert.equal(await page.evaluate(() => document.activeElement.id), "inExpr");
    await page.keyboard.type(" +t");
    await page.tap('.mf-keys [aria-label="Power"]');
    await page.keyboard.type("2 /3");
    await page.keyboard.press("Enter");
    await frame(page);
    assert.equal(await exprText(page), "cos(t) + t^2/3");
    assert.ok(await page.isHidden("#inError"));
    await page.screenshot({ path: path.join(SHOTS, "phone.png"), fullPage: true, timeout: 120000 });
    await clean("phone");
    await page.context().close();
  }

  // ── no storage (private mode, or blocked): everything still works, nothing is kept ──
  {
    const { page, clean } = await open({ width: 1280, height: 720 }, () => {
      Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } });
    });
    assert.equal(await exprText(page), "cos(t)");
    await page.click('[data-layout="probe"]');
    assert.equal((await openViews(page)).length, 5);
    await clean("without storage");
    await page.context().close();
  }

  // ── a saved layout that makes no sense is ignored ──
  {
    const { page, clean } = await open({ width: 1280, height: 720 }, () => {
      try { localStorage.setItem("laplaceanalyser.layout", '{"v":1,"tree":{"type":"split","children":[{"type":"stack","tabs":["nope"]}]}}'); localStorage.setItem("laplaceanalyser.state", "{not json"); } catch (e) { /* none */ }
    });
    assert.deepEqual(await openViews(page), ["input", "surface", "time", "pz"]);
    assert.equal(await exprText(page), "cos(t)");
    await clean("with broken saved data");
    await page.context().close();
  }

  // ── reduced motion: nothing moves until asked ──
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForSelector(".dk-stack");
    await frame(page);
    const t0 = await texOf(page, "#timeOut");
    await page.waitForTimeout(400);
    assert.equal(await texOf(page, "#timeOut"), t0);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dur-2").trim()), "0ms");
    await context.close();
  }
  console.log(`browser check passed (${design ? "with the shared design" : "offline fallback design"})`);
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
