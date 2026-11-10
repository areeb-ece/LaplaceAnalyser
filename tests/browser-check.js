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

async function open(viewport, init) {
  const context = await browser.newContext({ viewport });
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
  await page.goto(base);
  await page.waitForSelector(".dk-stack");
  const clean = async (what) => {
    assert.deepEqual(errors, [], `${what}: script errors`);
    assert.deepEqual(await page.evaluate(() => window.__csp), [], `${what}: CSP violations`);
    assert.deepEqual(outside, [], `${what}: requests leaving the site`);
    const wide = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(wide[0] <= wide[1] + 1, `${what} scrolls sideways: ${wide}`);
  };
  return { page, context, clean };
}
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
const figures = (page, view) => page.locator(`.view[data-view="${view}"] .figures`).innerText();
const complex = (text) => { const m = /(−?[\d.]+) ([+−]) ([\d.]+)i/.exec(text); return [Number(m[1].replace("−", "-")), (m[2] === "−" ? -1 : 1) * Number(m[3])]; };
const openViews = (page) => page.$$eval(".dk-stack", (els) => els.map((e) => e.dataset.view));
const setTime = (page, t) => page.evaluate((v) => { const r = document.getElementById("timeRange"); r.value = String(v); r.dispatchEvent(new Event("input")); }, t);
const typeExpr = async (page, text) => { await page.fill("#inExpr", text); await page.press("#inExpr", "Enter"); await frame(page); };

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
    assert.equal(await page.inputValue("#inExpr"), "cos(t)");
    assert.equal(await page.getAttribute("#btnPlay", "aria-pressed"), "false");
    assert.ok((await page.$$eval("#inExamples option", (o) => o.length)) - 1 >= 8, "at least 8 examples");
    await page.waitForFunction(() => document.querySelector('.view[data-view="surface"] .labels .probe'), null, { timeout: 15000 });
    await frame(page);
    await shot(page, "laptop-overview");
    const png = await page.locator('.view[data-view="surface"] canvas').first().screenshot();
    assert.ok(png.length > 20000, `the surface is drawn (${png.length} bytes of picture)`);

    // The transform of cos(t) is s/(s² + 1): poles at ±i.
    await page.click('[data-key="tab:steps"]');
    await page.waitForSelector('.steps .math .katex');
    assert.match(await page.locator(".steps .math").nth(1).getAttribute("data-tex"), /\\frac\{s\}\{s\^\{2\} \+ 1\}/);
    await page.click('[data-key="tab:input"]');

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
    const before = { integrand: await figures(page, "integrand"), integral: await figures(page, "integral"), label: await page.locator('.view[data-view="surface"] .labels .probe').innerText() };
    const pz = await page.locator('.view[data-view="pz"] canvas').boundingBox();
    const spot = await page.evaluate(() => {
      // where the probe is drawn: the map shows a square of half-width 3 centred on 0 for cos(t)
      const c = document.querySelector('.view[data-view="pz"] canvas'), k = Math.min(c.clientWidth, c.clientHeight) / 6;
      return [c.clientWidth / 2 + 0.5 * k, c.clientHeight / 2 - 1 * k];
    });
    await page.mouse.move(pz.x + spot[0], pz.y + spot[1]);
    await page.mouse.down();
    await page.mouse.move(pz.x + spot[0] + 40, pz.y + spot[1] + 25, { steps: 3 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    const mid = { integrand: await figures(page, "integrand"), integral: await figures(page, "integral"), label: await page.locator('.view[data-view="surface"] .labels .probe').innerText() };
    await page.mouse.up();
    for (const k of ["integrand", "integral", "label"]) assert.notEqual(mid[k], before[k], `${k} follows the probe`);
    assert.notEqual(await page.inputValue("#probeRe"), "0.5");

    // in the 3D view: arrow keys move it, and a click on the surface puts it there
    const surf = page.locator('.view[data-view="surface"] canvas').first();
    await surf.focus();
    const reBefore = Number(await page.inputValue("#probeRe"));
    await page.keyboard.press("ArrowRight");
    await frame(page);
    assert.ok(Number(await page.inputValue("#probeRe")) > reBefore, "arrow key moves the probe");
    const sb = await surf.boundingBox();
    await page.mouse.click(sb.x + sb.width * 0.62, sb.y + sb.height * 0.66);
    await frame(page);
    assert.notEqual(await page.locator('.view[data-view="surface"] .labels .probe').innerText(), mid.label, "a click on the surface places the probe");
    // dragging the probe's foot in 3D moves it too
    const foot = await page.evaluate(() => { const l = document.querySelector('.view[data-view="surface"] .labels .probe'), m = new DOMMatrix(getComputedStyle(l).transform); return [m.e - 12, m.f - 4]; });
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
    assert.match(off.split("\n")[1], /−?[\d.]+ [+−] [\d.]+i/);
    await shot(page, "laptop-diverges");
    await page.fill("#probeRe", "0");
    await frame(page);
    assert.match(await figures(page, "integral"), /Never settles/);

    // ── time ──
    await setTime(page, 3);
    await frame(page);
    assert.match(await page.locator("#timeOut").innerText(), /t = 3\.00 s/);
    await page.locator('.view[data-view="time"] canvas').focus();
    await page.keyboard.press("ArrowRight");
    await frame(page);
    assert.match(await page.locator("#timeOut").innerText(), /t = 3\.10 s/);
    await page.click("#btnPlay");
    await page.waitForTimeout(250);
    assert.equal(await page.getAttribute("#btnPlay", "aria-pressed"), "true");
    await page.click("#btnPlay");
    assert.ok(Number((await page.locator("#timeOut").innerText()).match(/[\d.]+/)[0]) > 3.1, "time advanced while playing");

    // ── input: equations, examples, refusals ──
    await page.click('[data-layout="ode"]');
    assert.equal(await page.getAttribute('[data-mode="ode"]', "aria-checked"), "true");
    await page.selectOption("#inExamples", "resonance");
    await frame(page);
    assert.equal(await page.inputValue("#inExpr"), "y'' + 4y = cos(2t)");
    assert.equal(await page.locator(".steps li").count(), 5);
    assert.match(await page.locator(".steps .math").last().getAttribute("data-tex"), /y\(t\) = \\tfrac\{1\}\{4\}\\,t\\,\\sin\(2t\)/);
    assert.equal(await page.locator(".minis .mini").count(), 2, "one small panel per pole");
    await page.fill("#inIc0", "1");
    await page.waitForTimeout(350);
    assert.match(await page.locator(".steps .math").last().getAttribute("data-tex"), /\\cos\(2t\)/, "a starting value changes the solution");
    await shot(page, "laptop-ode");
    await typeExpr(page, "y'' + y^2 = 0");
    assert.match(await page.locator("#inError").innerText(), /non-linear/);
    assert.ok(await page.locator("#dock").getAttribute("data-stale") !== null, "views dimmed while the input is wrong");
    await typeExpr(page, "y''' + y = 1");
    assert.ok(await page.isHidden("#inError"));
    assert.equal(await page.locator("#dock").getAttribute("data-stale"), null);
    assert.equal(await page.locator(".ics input").count(), 3, "a third-order equation asks for three starting values");
    await page.click('[data-mode="rational"]');
    await typeExpr(page, "s^2/(s+1)");
    assert.match(await page.locator("#inError").innerText(), /lower degree/);
    await typeExpr(page, "1/(s^2 + 2s + 5)");
    assert.ok(await page.isHidden("#inError"));

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
    assert.deepEqual(await openViews(page), layout, "the layout survives a reload");
    assert.equal(await page.evaluate(() => localStorage.getItem("laplaceanalyser.layout")), sizes);
    assert.equal(await page.inputValue("#inExpr"), "1/(s^2 + 2s + 5)", "and so does the last input");
    await frame(page);
    await shot(page, "laptop-rearranged");
    await page.click("#btnViews");
    await page.click('.menu button:has-text("Pole-zero map")');
    assert.ok((await openViews(page)).includes("pz"), "reopened from the Views menu");
    await page.click("#btnReset");
    assert.deepEqual(await openViews(page), ["input", "surface", "time", "pz"], "reset");

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
    for (const id of await page.$$eval("#inExamples option", (o) => o.map((x) => x.value).filter(Boolean))) {
      await page.selectOption("#inExamples", id);
      await frame(page);
      assert.ok(await page.isHidden("#inError"), id);
      await shot(page, "example-" + id);
    }
    await clean("examples");
    await page.context().close();
  }

  // ── phone: one column, nothing sideways ──
  {
    const { page, clean } = await open({ width: 390, height: 844 });
    assert.equal(await page.getAttribute("#dock", "data-mode"), "stacked");
    const heights = await page.$$eval(".dk-body", (els) => els.map((e) => e.clientHeight));
    assert.ok(heights.every((v) => v > 100), `every view has room: ${heights}`);
    await page.screenshot({ path: path.join(SHOTS, "phone.png"), fullPage: true });
    await clean("phone");
    await page.context().close();
  }

  // ── no storage (private mode, or blocked): everything still works, nothing is kept ──
  {
    const { page, clean } = await open({ width: 1280, height: 720 }, () => {
      Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } });
    });
    assert.equal(await page.inputValue("#inExpr"), "cos(t)");
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
    assert.equal(await page.inputValue("#inExpr"), "cos(t)");
    await clean("with broken saved data");
    await page.context().close();
  }

  // ── reduced motion: nothing moves until asked ──
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForSelector(".dk-stack");
    const t0 = await page.locator("#timeOut").innerText();
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#timeOut").innerText(), t0);
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
