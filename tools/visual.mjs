// Visual regression tests: a screenshot of every harness scenario (dist-harness/harness.html#<name>),
// taken in Chrome over the DevTools protocol and compared with the one kept from before.
//
//   node tools/visual.mjs             compare with .visual/baseline (missing ones are kept as new)
//   node tools/visual.mjs --update    take every screenshot again as the baseline
//   node tools/visual.mjs mulligan    only the scenarios named
//
// Scenarios are shot with animations off on the plain table, and with pictures from the web
// (Scryfall's cards and art, Endstep's avatars) blocked: cards show as their name and type, as the
// board draws them without a picture. So the same build always shows the same picture, offline
// too: what's compared is the board's own drawing and layout. The browser is
// CHROME_PATH, or the first Chrome/Edge/Chromium/Helium found. A scenario whose picture changed
// gets .visual/current/<name>.png and .visual/diff/<name>.png (the changed pixels in red).
// Exit code 1 if any changed.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const update = args.includes("--update");
const only = args.filter((a) => !a.startsWith("--"));
const DIR = ".visual";
const [W, H] = [1600, 900];
/** A pixel counts as changed past this difference in any channel (0-255): antialiasing isn't. */
const TOLERANCE = 32;
/** A picture counts as changed past this share of changed pixels. */
const MAX_CHANGED = 0.001;
const PREFS = { animations: false, table: "plain", sound: false };

function findBrowser() {
  const local = process.env.LOCALAPPDATA ?? "";
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    join(local, "Google/Chrome/Application/chrome.exe"),
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    join(local, "imput/Helium/Application/chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((p) => p && existsSync(p));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(port) {
  let targets;
  for (let i = 0; i < 60 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); }
  }
  const page = targets?.find((t) => t.type === "page");
  if (!page) throw new Error("The browser didn't open a page to drive.");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const m = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description ?? "evaluate failed");
    return m.result?.result?.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

/** Waits until every picture on the board has loaded (or failed), and nothing new came for a moment. */
const SETTLED = `new Promise((done) => {
  const root = [...document.querySelectorAll("*")].find((e) => e.shadowRoot)?.shadowRoot;
  let last = -1, still = 0;
  const start = performance.now();
  const tick = () => {
    const imgs = root ? [...root.querySelectorAll("img")] : [];
    const pending = imgs.filter((i) => !i.complete).length;
    still = pending === 0 && imgs.length === last ? still + 1 : 0;
    last = imgs.length;
    if (still >= 4 || performance.now() - start > 12000) done(pending);
    else setTimeout(tick, 250);
  };
  setTimeout(tick, 600);
})`;

/** Compares two PNGs (as base64) in the page: the share of changed pixels, and a picture of them. */
const compare = (a, b) => `(async () => {
  const load = (b64) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = "data:image/png;base64," + b64; });
  const [x, y] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
  if (x.width !== y.width || x.height !== y.height) return { changed: 1, diff: null };
  const c = document.createElement("canvas");
  c.width = x.width; c.height = x.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(x, 0, 0); const p = g.getImageData(0, 0, c.width, c.height);
  g.drawImage(y, 0, 0); const q = g.getImageData(0, 0, c.width, c.height);
  const out = g.createImageData(c.width, c.height);
  let n = 0;
  for (let i = 0; i < p.data.length; i += 4) {
    const d = Math.max(Math.abs(p.data[i] - q.data[i]), Math.abs(p.data[i + 1] - q.data[i + 1]), Math.abs(p.data[i + 2] - q.data[i + 2]));
    const gray = (q.data[i] + q.data[i + 1] + q.data[i + 2]) / 3 * 0.35;
    if (d > ${TOLERANCE}) { n++; out.data.set([255, 40, 40, 255], i); } else out.data.set([gray, gray, gray, 255], i);
  }
  g.putImageData(out, 0, 0);
  const changed = n / (c.width * c.height);
  return { changed, diff: changed > ${MAX_CHANGED} ? c.toDataURL("image/png").split(",")[1] : null };
})()`;

async function main() {
  console.log("Building the harness…");
  const build = spawnSync(process.execPath, ["build.mjs", "--harness"], { stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const browser = findBrowser();
  if (!browser) throw new Error("No Chrome found: set CHROME_PATH to a Chromium-based browser.");

  const port = 47950 + Math.floor(Math.random() * 40);
  const profile = join(tmpdir(), `endstep-visual-${port}`);
  const chrome = spawn(browser, ["--headless=new", `--remote-debugging-port=${port}`, `--window-size=${W},${H}`,
    `--user-data-dir=${profile}`, "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
  const page = await connect(port);
  try {
    await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await page.send("Network.enable");
    await page.send("Network.setBlockedURLs", { urls: ["*://*.scryfall.io/*", "*://api.scryfall.com/*", "*://endstep.cc/*", "*://*.endstep.cc/*"] });
    const harness = pathToFileURL(resolve("dist-harness/harness.html")).href;
    const query = `?prefs=${encodeURIComponent(JSON.stringify(PREFS))}`;
    // Each scenario in a page of its own: a query of its own makes it a real load, waited for.
    let visit = 0;
    const open = async (name) => {
      const nonce = `v${++visit}`;
      await page.send("Page.navigate", { url: `${harness}${query}&${nonce}#${name}` });
      for (let i = 0; i < 80; i++) {
        if (await page.evaluate(`location.search.endsWith("&${nonce}") && document.readyState === "complete" && !!window.__scenarios`).catch(() => false)) return;
        await sleep(100);
      }
      throw new Error(`The harness didn't load ${name}.`);
    };
    await open("priority");
    const all = await page.evaluate("window.__scenarios");
    const names = only.length ? all.filter((n) => only.includes(n)) : all;
    for (const d of ["baseline", "current", "diff"]) mkdirSync(join(DIR, d), { recursive: true });

    const changed = [], added = [];
    for (const name of names) {
      await open(name);
      await page.evaluate(SETTLED);
      await sleep(400);
      const shot = (await page.send("Page.captureScreenshot", { format: "png" })).result.data;
      const base = join(DIR, "baseline", `${name}.png`);
      for (const d of ["current", "diff"]) rmSync(join(DIR, d, `${name}.png`), { force: true });
      if (update || !existsSync(base)) {
        writeFileSync(base, Buffer.from(shot, "base64"));
        if (!update) added.push(name);
        process.stdout.write(update ? "." : "+");
        continue;
      }
      const { changed: share, diff } = await page.evaluate(compare(readFileSync(base).toString("base64"), shot));
      if (share > MAX_CHANGED) {
        writeFileSync(join(DIR, "current", `${name}.png`), Buffer.from(shot, "base64"));
        if (diff) writeFileSync(join(DIR, "diff", `${name}.png`), Buffer.from(diff, "base64"));
        changed.push(`${name} (${(share * 100).toFixed(2)}%)`);
        process.stdout.write("x");
      } else process.stdout.write(".");
    }
    console.log();
    if (update) console.log(`Baseline taken: ${names.length} scenarios in ${DIR}/baseline.`);
    if (added.length) console.log(`New baseline: ${added.join(", ")}`);
    if (changed.length) {
      console.log(`Changed: ${changed.join(", ")}\nSee ${DIR}/current and ${DIR}/diff; run with --update to accept.`);
      process.exitCode = 1;
    } else if (!update) console.log(`No visual change in ${names.length - added.length} scenarios.`);
  } finally {
    page.close();
    chrome.kill();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
