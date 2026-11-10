#!/usr/bin/env node
/* Copies the two libraries this page ships into vendor/, at pinned versions, so the
 * site stays a folder of static files with no build step and no CDN:
 *   three   the WebGL renderer for the s-plane surface (core module only, no addons)
 *   katex   typesets the worked steps (script, stylesheet and woff2 fonts)
 *
 *   node scripts/vendor.js      install the pinned versions to a temp folder and copy them
 *
 * package.json stays free of dependencies, like the other tools. To update a library,
 * change its version here, run this, and commit vendor/. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const VERSIONS = { three: "0.183.0", katex: "0.19.0" };
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "vendor");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-"));

execFileSync("npm", ["install", "--no-save", "--no-audit", "--no-fund", "--prefix", tmp, ...Object.entries(VERSIONS).map(([n, v]) => `${n}@${v}`)], { stdio: "inherit" });
const from = (...p) => path.join(tmp, "node_modules", ...p);
const copy = (src, dest) => { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); };

fs.rmSync(OUT, { recursive: true, force: true });
for (const f of ["three.module.min.js", "three.core.min.js"]) copy(from("three", "build", f), path.join(OUT, "three", f));
copy(from("three", "LICENSE"), path.join(OUT, "three", "LICENSE"));
for (const f of ["katex.min.js", "katex.min.css"]) copy(from("katex", "dist", f), path.join(OUT, "katex", f));
for (const f of fs.readdirSync(from("katex", "dist", "fonts"))) if (f.endsWith(".woff2")) copy(from("katex", "dist", "fonts", f), path.join(OUT, "katex", "fonts", f));
copy(from("katex", "LICENSE"), path.join(OUT, "katex", "LICENSE"));
fs.writeFileSync(path.join(OUT, "README.md"), `# vendor/\n\nThird-party files, copied by \`npm run vendor\` (scripts/vendor.js). Do not edit by hand.\n\n| Library | Version | Licence |\n| --- | --- | --- |\n${Object.entries(VERSIONS).map(([n, v]) => `| ${n} | ${v} | MIT |`).join("\n")}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log("vendor/ updated:", Object.entries(VERSIONS).map(([n, v]) => `${n}@${v}`).join(", "));
