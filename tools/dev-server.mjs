// Dev-only sink for the extension's dev bridge (`pnpm build:dev`).
// Writes what the live tab sees into .devlog/ so it can be inspected offline:
//   frames.ndjson  every game socket frame (in/out), parsed
//   state.json     latest normalized GameState
//   raw.json       latest raw Endstep state (deltas applied)
//   log.ndjson     everything else (hello, route changes, errors)
import { createServer } from "node:http";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const PORT = 47800;
const DIR = ".devlog";
mkdirSync(DIR, { recursive: true });

const line = (file, obj) => appendFileSync(`${DIR}/${file}`, JSON.stringify(obj) + "\n");

createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/ingest") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const msg = JSON.parse(body);
      switch (msg.kind) {
        case "frame": {
          let data = msg.data.data;
          try { data = JSON.parse(data); } catch {}
          line("frames.ndjson", { t: msg.t, dir: msg.data.dir, data });
          break;
        }
        case "state":
          writeFileSync(`${DIR}/state.json`, JSON.stringify(msg.data.state, null, 2));
          writeFileSync(`${DIR}/raw.json`, JSON.stringify(msg.data.raw, null, 2));
          break;
        default:
          line("log.ndjson", msg);
          console.log(new Date(msg.t).toLocaleTimeString(), msg.kind, JSON.stringify(msg.data).slice(0, 200));
      }
      res.writeHead(204).end();
    } catch (e) {
      res.writeHead(400).end(String(e));
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`dev bridge sink on http://127.0.0.1:${PORT}, writing ${DIR}/`));
