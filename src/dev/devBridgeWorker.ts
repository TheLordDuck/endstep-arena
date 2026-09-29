// Dev-build service worker: relays reports from the content script to the
// local dev sink (tools/dev-server.mjs). Absent from production builds.

const SINK = "http://127.0.0.1:47800/ingest";

chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (typeof msg !== "object" || msg === null || !(msg as { devBridge?: unknown }).devBridge) return;
  const { kind, data, t } = msg as { kind: string; data: unknown; t: number };
  fetch(SINK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, data, t }),
  }).catch(() => {
    // Sink not running: dropping reports is fine.
  });
});
