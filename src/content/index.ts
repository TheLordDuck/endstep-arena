// Isolated-world entry: receives frames from the MAIN-world tap, feeds the
// adapter and mounts the overlay. Registered at document_start so no frame
// posted by the tap is missed.

import { COMMAND_TAG, isBridgeEnvelope, type SendActionCommand } from "../shared/protocol";
import { RingBuffer } from "../shared/RingBuffer";
import { EndstepAdapter } from "../game/endstep/EndstepAdapter";
import { GameController } from "../game/GameController";
import { PhaseStopSync } from "../game/PhaseStopSync";
import { Overlay, type NetworkEntry, type SocketStatus } from "../ui/Overlay";
import { loadSettings } from "./settings";
import { devReport } from "../dev/devReport";

const adapter = new EndstepAdapter();
const network = new RingBuffer<NetworkEntry>(300);
let socket: SocketStatus = "none";
let overlay: Overlay | null = null;

adapter.setRoute(location.pathname);

// Actions travel to the MAIN-world tap, which sends them on Endstep's socket.
const controller = new GameController(
  () => adapter.getGameState(),
  (matchId, action) => {
    const command: SendActionCommand = { tag: COMMAND_TAG, kind: "send-action", matchId, action };
    window.postMessage(command, location.origin);
  },
);

const stops = new PhaseStopSync(controller);
adapter.subscribe(() => stops.onState(adapter.getGameState()));

if (__DEV_BRIDGE__) {
  devReport("hello", { url: location.href, version: chrome.runtime.getManifest().version });
  // Trailing throttle: at most one state snapshot per 500 ms.
  let timer = 0;
  adapter.subscribe(() => {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      devReport("state", { state: adapter.getGameState(), raw: adapter.getRawState() });
    }, 500);
  });
}

function describe(frame: unknown): string {
  if (typeof frame !== "object" || frame === null) return "?";
  const f = frame as { type?: unknown; payload?: { type?: unknown; frames?: unknown } };
  if (f.type === "ATTACH" && Array.isArray(f.payload?.frames)) return `ATTACH ×${f.payload.frames.length}`;
  if ((f.type === "GAME_ACTION" || f.type === "GAME_EVENT") && f.payload?.type) {
    return `${String(f.type)} · ${String(f.payload.type)}`;
  }
  return String(f.type ?? "?");
}

window.addEventListener("message", (ev) => {
  if (ev.source !== window || !isBridgeEnvelope(ev.data)) return;
  const msg = ev.data;
  if (__DEV_BRIDGE__) {
    if (msg.kind === "ws-in" || msg.kind === "ws-out") devReport("frame", { dir: msg.kind === "ws-in" ? "in" : "out", data: msg.data });
    else devReport(msg.kind, msg);
  }
  switch (msg.kind) {
    case "ws-in":
    case "ws-out": {
      let frame: unknown;
      try {
        frame = JSON.parse(msg.data);
      } catch {
        return;
      }
      const outbound = msg.kind === "ws-out";
      // Keep payloads only for (small) outbound actions: they document the action protocol.
      network.push({ t: msg.t, dir: outbound ? "out" : "in", label: describe(frame), bytes: msg.data.length, detail: outbound ? frame : undefined });
      if (msg.kind === "ws-in") adapter.handleFrame(frame);
      else stops.onOutbound((frame as { payload?: object }).payload ?? {});
      break;
    }
    case "ws-open":
      socket = "open";
      stops.onSocketOpen();
      break;
    case "ws-close":
      socket = "closed";
      break;
    case "route":
      adapter.setRoute(msg.path);
      break;
    case "action-result":
      overlay?.onActionResult(msg.ok, msg.type, msg.reason);
      break;
  }
  overlay?.setSocketStatus(socket);
  overlay?.invalidate();
});

async function mount() {
  const settings = await loadSettings();
  overlay = new Overlay(adapter, network, settings, controller, stops);
  overlay.setSocketStatus(socket);
  overlay.mount();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void mount(), { once: true });
} else {
  void mount();
}
