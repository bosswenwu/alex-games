#!/usr/bin/env node
// Headless browser runner for the games in this repo — no npm dependencies (Node ≥ 22 for the global WebSocket).
// Drives Chrome/Chromium/Edge over the DevTools Protocol, so it works even when no visible browser is available
// (a hidden preview pane freezes pages; background tabs throttle timers and GPU work).
//
// Usage (run from anywhere):
//   node tools/headless.mjs selftest [page]                       run <page>?selftest=1, print PASS/FAIL + failing lines; exit 1 on failure
//   node tools/headless.mjs shot <page> <out.png> [--script f.js]  load the page, optionally run a setup script, save a screenshot
//   node tools/headless.mjs eval <page> <script.js>               load the page, run the script, print its return value as JSON
//
// <page> is a repo-relative path (served by a built-in static server, e.g. games/minecraft/) or a full http(s) URL.
// Default page for `selftest` is games/minecraft/ (沙海奇境). Query strings are kept, e.g. "games/minecraft/?seed=424242".
// Scripts are the body of an async function evaluated in the page; `return` a JSON-serialisable value.
//
// Options:
//   --ready "<js expr>"   readiness condition to wait for (default: selftest → window.__selftest; else → worldGenReady if defined, else document.readyState==='complete')
//   --size 1280x720       viewport size (default 1280x720)
//   --timeout 180         seconds to wait for readiness (default 180)
// Environment: CHROME_PATH to force a browser binary.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, existsSync, statSync, rmSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const readyOpt = opt("--ready", null), sizeOpt = opt("--size", "1280x720"), timeoutS = +opt("--timeout", "180"), scriptOpt = opt("--script", null);
const [mode, pageArg, third] = args;
if (!["selftest", "shot", "eval"].includes(mode)) { console.error("usage: node tools/headless.mjs selftest|shot|eval …  (see header comment)"); process.exit(2); }

function findBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const la = process.env.LOCALAPPDATA || "";
  const c = {
    win32: ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
            join(la, "Google/Chrome/Application/chrome.exe"), "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
            "C:/Program Files/Microsoft/Edge/Application/msedge.exe"],
    darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
    linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
            "/opt/google/chrome/chrome"],
  }[platform()] || [];
  const hit = c.find(p => existsSync(p));
  if (!hit) throw new Error("no Chrome/Chromium/Edge found — set CHROME_PATH");
  return hit;
}

// Minimal static server for the repo root (random port), so no `npx serve` / python is needed.
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".txt": "text/plain" };
function startServer() {
  return new Promise(res => {
    const srv = createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let f = resolve(join(ROOT, p));
      if (!f.startsWith(ROOT)) { rsp.writeHead(403).end(); return; }
      if (existsSync(f) && statSync(f).isDirectory()) {
        if (!p.endsWith("/")) { rsp.writeHead(301, { Location: p + "/" + (new URL(req.url, "http://x").search) }).end(); return; }   // 目录补斜杠, 相对资源路径才对
        f = join(f, "index.html");
      }
      if (!existsSync(f)) { rsp.writeHead(404).end("not found"); return; }
      rsp.writeHead(200, { "Content-Type": MIME[extname(f).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      rsp.end(readFileSync(f));
    });
    srv.listen(0, "127.0.0.1", () => res(srv));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, msgId = 0; const pending = new Map();
const send = (method, params = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise((ok, no) => pending.set(id, { ok, no })); };
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

let server = null, browser = null, profile = null;
try {
  let url = pageArg || (mode === "selftest" ? "games/minecraft/" : null);
  if (!url) throw new Error("missing <page>");
  if (!/^https?:/i.test(url)) {
    const rel = url.replace(/^\/+/, "").split(/[?#]/)[0], f = resolve(join(ROOT, rel));
    const page = existsSync(f) && statSync(f).isDirectory() ? join(f, "index.html") : f;
    if (!f.startsWith(ROOT) || !existsSync(page)) throw new Error("page not found in repo: " + rel);   // 写错路径时别把 404 页当成测过了
    server = await startServer(); url = `http://127.0.0.1:${server.address().port}/${url.replace(/^\/+/, "")}`;
  }
  if (mode === "selftest") url += (url.includes("?") ? "&" : "?") + "selftest=1";
  const [w, h] = sizeOpt.split("x").map(Number);
  const port = 9300 + Math.floor(Math.random() * 600);
  profile = mkdtempSync(join(tmpdir(), "headless-"));
  const flags = ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
    "--no-first-run", "--no-default-browser-check", "--enable-unsafe-swiftshader", "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--autoplay-policy=no-user-gesture-required"];
  if (platform() === "linux" && process.getuid && process.getuid() === 0) flags.push("--no-sandbox");   // containers usually run as root
  browser = spawn(findBrowser(), [...flags, "about:blank"], { stdio: "ignore" });
  let targets = [];
  for (let i = 0; i < 100 && !targets.length; i++) { try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === "page"); } catch {} if (!targets.length) await sleep(150); }
  if (!targets.length) throw new Error("browser did not start");
  ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  ws.onmessage = e => { const m = JSON.parse(e.data); const p = m.id && pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); } };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const t0 = Date.now();
  await send("Page.navigate", { url });
  const ready = readyOpt || (mode === "selftest" ? "!!window.__selftest"
    : "(typeof worldGenReady!=='undefined') ? worldGenReady : document.readyState==='complete'");
  let isReady = false;
  while (Date.now() - t0 < timeoutS * 1000) { await sleep(400); try { if (await evaluate(ready)) { isReady = true; break; } } catch {} }
  if (!isReady) throw new Error(`timed out after ${timeoutS}s waiting for: ${ready}`);

  if (mode === "selftest") {
    const r = await evaluate(`(()=>{ const out=(document.getElementById('selftest-out')?.textContent||'').split('\\n');
      const d=document.createElement('canvas').getContext('webgl'); const x=d&&d.getExtension('WEBGL_debug_renderer_info');
      return {title:document.title, failed:out.filter(l=>/^(NG|FAIL)\\b/.test(l)&&!/^FAIL \\d+\\/\\d+$/.test(l)), renderer:x?d.getParameter(x.UNMASKED_RENDERER_WEBGL):'?'}; })()`);
    console.log(r.title); for (const l of r.failed) console.log("  " + l);
    console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s, ${r.renderer})`);
    if (!/^PASS/.test(r.title)) process.exitCode = 1;
  } else {
    const scriptFile = mode === "eval" ? third : scriptOpt;
    if (scriptFile) { const out = await evaluate(`(async()=>{ ${readFileSync(scriptFile, "utf8")} })()`); console.log(JSON.stringify(out, null, 1)); }
    if (mode === "shot") {
      if (!third) throw new Error("missing <out.png>");
      const shot = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(third, Buffer.from(shot.data, "base64")); console.log("saved " + third);
    }
  }
} catch (e) { console.error("ERROR " + e.message); process.exitCode = 1; }
finally {
  try { ws && ws.close(); } catch {}
  try { browser && browser.kill(); } catch {}
  try { server && server.close(); } catch {}
  await sleep(300); try { profile && rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(process.exitCode || 0);
}
