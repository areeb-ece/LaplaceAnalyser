// The plot colours come from the shared palette, so they have to stay readable in every
// theme it has. Each quantity's colour is checked against the panel it's drawn on, at
// the 3:1 that WCAG asks of graphics. (The copy in assets/design/ is the master's.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(ROOT, "assets/design/tokens.css"), "utf8");
const palette = fs.readFileSync(path.join(ROOT, "js/palette.js"), "utf8");

function themes() {
  const out = {};
  for (const m of css.matchAll(/(?::root, |:root\[data-theme="[\w-]+"\], )\[data-theme="([\w-]+)"\] \{([^}]*)\}/g)) {
    const vars = {};
    for (const v of m[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[v[1]] = v[2].trim();
    out[m[1]] = vars;
  }
  return out;
}
const lum = (hex) => [1, 3, 5].reduce((n, i, k) => {
  let c = parseInt(hex.slice(i, i + 2), 16) / 255;
  c = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return n + c * [0.2126, 0.7152, 0.0722][k];
}, 0);
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// role → token, read from js/palette.js so the test follows the code
const roles = Object.fromEntries([...palette.matchAll(/^\s+(\w+): "(--c\d)",/gm)].map((m) => [m[1], m[2]]));

test("the palette module names a token for each plotted quantity", () => {
  assert.deepEqual(Object.keys(roles).sort(), ["integral", "integrand", "phDown", "phReal", "phUp", "probe", "signal", "value"]);
  assert.equal(new Set(Object.values(roles)).size, 8, "one token per quantity");
});

test("there are themes to check", () => {
  const all = themes();
  assert.ok(Object.keys(all).length >= 15, `found ${Object.keys(all).length} themes`);
  assert.ok(all.dark && all.light);
});

for (const [name, vars] of Object.entries(themes())) {
  test(`plot colours are readable in the ${name} theme`, () => {
    for (const [role, token] of Object.entries(roles)) {
      const c = contrast(vars[token], vars["--sheet"]);
      assert.ok(c >= 3, `${role} (${token} ${vars[token]}) on the sheet (${vars["--sheet"]}) is ${c.toFixed(2)}:1`);
    }
    for (const token of ["--ink", "--ink-2", "--ink-3"]) assert.ok(contrast(vars[token], vars["--sheet"]) >= 4.5, `${token} as text`);
  });
}
