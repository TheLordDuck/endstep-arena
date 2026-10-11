// Keeps a match recorded by the dev bridge (.devlog/frames.ndjson, see dev-server.mjs) as a test
// fixture: the frames Endstep sent (the ones we sent are left out), brotli-compressed, as
// tests/fixtures/<name>.ndjson.br. Tests play it through the adapter (tests/realMatch.ts); the
// harness plays it on the board (#match:<name>).
//
//   node tools/save-match.mjs <name> [frames.ndjson]
import { brotliCompressSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [name, from = ".devlog/frames.ndjson"] = process.argv.slice(2);
if (!name || !/^[\w-]+$/.test(name)) {
  console.error("usage: node tools/save-match.mjs <name> [frames.ndjson]   (name: letters, digits, - and _)");
  process.exit(1);
}
const frames = readFileSync(from, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((f) => f.dir === "in");
const text = frames.map((f) => JSON.stringify({ t: f.t, data: f.data })).join("\n") + "\n";
mkdirSync("tests/fixtures", { recursive: true });
const out = `tests/fixtures/${name}.ndjson.br`;
writeFileSync(out, brotliCompressSync(text));
console.log(`${out}: ${frames.length} frames`);
