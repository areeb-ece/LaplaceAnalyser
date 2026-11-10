/* Serves the site at /LaplaceAnalyser/ as GitHub Pages does, for the browser check and
 * for looking at it by hand:
 *   node tests/serve.js [port]
 * The shared theme, settings panel and night sky live in the portfolio repo
 * (areeb-ece.github.io, public/design/). Without them /design/ serves empty files, so the
 * page falls back to its own copy and its light/dark switch. To serve the real thing:
 *   DESIGN_DIR=../areeb-ece.github.io/public/design node tests/serve.js */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BASE_PATH = "/LaplaceAnalyser/";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".txt": "text/plain" };

export function serve(port = 0, designDir = process.env.DESIGN_DIR) {
  const DESIGN = designDir && path.resolve(designDir);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = null, within = ROOT;
    if (url.startsWith("/design/") && !DESIGN) { res.writeHead(200, { "Content-Type": TYPES[path.extname(url)] || "text/plain" }); res.end(); return; }
    if (url.startsWith("/design/")) { file = path.join(DESIGN, path.basename(url)); within = path.dirname(DESIGN); }
    else if (url.startsWith("/fonts/") && DESIGN) { file = path.join(DESIGN, "..", "fonts", path.basename(url)); within = path.dirname(DESIGN); }
    else if (url.startsWith(BASE_PATH)) file = path.join(ROOT, url.slice(BASE_PATH.length) || "index.html");
    if (file && file.endsWith(path.sep)) file += "index.html";
    if (!file || !file.startsWith(within) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((done) => server.listen(port, "127.0.0.1", () => done({ server, origin: `http://127.0.0.1:${server.address().port}`, design: !!DESIGN })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { origin, design } = await serve(Number(process.argv[2]) || 8080);
  console.log(`${origin}${BASE_PATH}  (${design ? "with the shared design" : "offline fallback design"})`);
}
