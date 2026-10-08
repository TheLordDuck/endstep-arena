// Bundles the extension into dist/ (load that folder as an unpacked extension).
// esbuild directly rather than Vite: content scripts must be classic IIFE
// scripts, one per entry, which Vite only does through one build per entry.
//
//   --watch  rebuild on change
//   --dev    include the dev bridge (reports frames/state to tools/dev-server.mjs)
//   --tests  bundle tests/ for node --test
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const dev = process.argv.includes("--dev");
const tests = process.argv.includes("--tests");
const harness = process.argv.includes("--harness");

if (harness) {
  // Single self-contained page; <base> makes the card image URLs hit endstep.cc.
  const out = await esbuild.build({
    entryPoints: ["src/dev/harness.ts"], bundle: true, format: "iife", write: false,
    loader: { ".css": "text" }, define: { __DEV_BRIDGE__: "false" },
  });
  mkdirSync("dist-harness", { recursive: true });
  const js = out.outputFiles[0].text.replaceAll("</script", "<\\/script");
  writeFileSync("dist-harness/harness.html",
    `<!doctype html><meta charset="utf-8"><base href="https://endstep.cc/"><title>Arena harness</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>html,body{margin:0;height:100%;background:#000}</style><body><script>${js}</script>`);
  process.exit(0);
}

if (tests) {
  rmSync(".test-dist", { recursive: true, force: true });
  await esbuild.build({
    entryPoints: readdirSync("tests").filter((f) => f.endsWith(".test.ts")).map((f) => `tests/${f}`),
    outdir: ".test-dist",
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    loader: { ".css": "text" },
    define: { __DEV_BRIDGE__: "false" },
  });
  process.exit(0);
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
// The sound files present (see public/sounds/README.md), by sound name, for the board to load.
mkdirSync("dist/sounds", { recursive: true });
const sounds = {};
for (const file of readdirSync("dist/sounds")) {
  const m = /^([a-z]+)\.(ogg|mp3|wav|m4a|webm)$/i.exec(file);
  if (m) sounds[m[1].toLowerCase()] = file;
}
writeFileSync("dist/sounds/index.json", JSON.stringify(sounds, null, 2));

const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
const entryPoints = { inject: "src/inject/wsTap.ts", content: "src/content/index.ts" };
if (dev) {
  manifest.name += " (dev)";
  manifest.background = { service_worker: "devBridge.js" };
  manifest.host_permissions = ["http://127.0.0.1:47800/*"];
  entryPoints.devBridge = "src/dev/devBridgeWorker.ts";
}
writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2));

const ctx = await esbuild.context({
  entryPoints,
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome114",
  loader: { ".css": "text" },
  define: { __DEV_BRIDGE__: String(dev) },
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
