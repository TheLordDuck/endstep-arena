// Runs in the page's MAIN world at document_start, before Endstep's bundle.
// It observes Endstep's own game socket and forwards game frames to the
// isolated content script; it never alters, drops or delays a frame.
// Its one write path sends whitelisted GAME_ACTION frames in the exact
// envelope Endstep's client uses, so the server sees an ordinary action.
// It also times Endstep's damage sound to the board's hits (see damageSound.ts).

import {
  ALLOWED_ACTIONS,
  BRIDGE_TAG,
  isSendActionCommand,
  type TapMessage,
} from "../shared/protocol";
import { installDamageSound } from "./damageSound";

declare global {
  interface Window {
    __endstepArenaTap?: true;
  }
}

(() => {
  if (window.__endstepArenaTap) return;
  window.__endstepArenaTap = true;
  installDamageSound();

  const post = (msg: TapMessage) => {
    try {
      window.postMessage({ ...msg, tag: BRIDGE_TAG, t: Date.now() }, location.origin);
    } catch {
      // Never let the tap throw into Endstep's code paths.
    }
  };

  // Cheap substring test before anything is forwarded; the isolated side parses.
  const isGameFrame = (data: string) => data.includes('"GAME_') || data.includes('"ATTACH"') || data.includes('"SEAT_CONNECTIVITY"');

  const isGameSocket = (url: string) => {
    try {
      const u = new URL(url, location.href);
      return u.host === location.host && u.pathname === "/ws";
    } catch {
      return false;
    }
  };

  const tapped = new WeakSet<WebSocket>();
  const NativeWebSocket = window.WebSocket;
  let current: WebSocket | null = null;

  function tap(ws: WebSocket, url: string) {
    tapped.add(ws);
    current = ws;
    post({ kind: "ws-open", url });
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data === "string" && isGameFrame(ev.data)) post({ kind: "ws-in", data: ev.data });
    });
    ws.addEventListener("close", (ev) => post({ kind: "ws-close", code: ev.code }));
  }

  // A Proxy keeps statics (WebSocket.OPEN…), the prototype chain and
  // `instanceof` identical to the native constructor.
  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(target, args: [string | URL, (string | string[])?], newTarget) {
      const ws = Reflect.construct(target, args, newTarget) as WebSocket;
      try {
        const url = String(args[0]);
        if (isGameSocket(url)) tap(ws, url);
      } catch {
        /* observation only */
      }
      return ws;
    },
  });

  // Outbound: only log GAME_ACTION frames (for discovering action payloads).
  const nativeSend = NativeWebSocket.prototype.send;
  NativeWebSocket.prototype.send = function (this: WebSocket, data) {
    try {
      if (tapped.has(this) && typeof data === "string" && data.includes('"GAME_ACTION"')) {
        post({ kind: "ws-out", data });
      }
    } catch {
      /* observation only */
    }
    return nativeSend.call(this, data);
  };

  // Actions from the Arena UI.
  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !isSendActionCommand(ev.data)) return;
    const { action, matchId } = ev.data;
    const allowed = ALLOWED_ACTIONS.has(action.type);
    const ok = allowed && !!current && current.readyState === NativeWebSocket.OPEN;
    if (ok) {
      const payload = { ...action, matchId, actionId: crypto.randomUUID() };
      // Through the wrapped send, so it also shows in the debug Network tab.
      current!.send(JSON.stringify({ type: "GAME_ACTION", payload }));
    }
    post({ kind: "action-result", ok, type: action.type, reason: ok ? undefined : allowed ? "not-connected" : "not-allowed" });
  });

  // Replays: Endstep downloads the file and plays it itself, with no socket involved. A copy of
  // the bytes goes to the board, which plays it on its own. Its response is left untouched.
  const nativeFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const result = nativeFetch.apply(this, args);
    try {
      const req = args[0];
      const url = new URL(req instanceof Request ? req.url : String(req), location.href);
      const m = /\/replays\/([^/]+)\/file$/.exec(url.pathname);
      if (m && url.host === location.host && !url.searchParams.has("download")) {
        const id = decodeURIComponent(m[1]!);
        void result.then((res) => (res.ok ? res.clone().arrayBuffer() : null))
          .then((bytes) => bytes && post({ kind: "replay-file", id, bytes }))
          .catch(() => {});
      }
    } catch {
      /* observation only */
    }
    return result;
  };
  // A replay opened from a local file is read as an ArrayBuffer; only .esreplay files are copied.
  const nativeArrayBuffer = Blob.prototype.arrayBuffer;
  Blob.prototype.arrayBuffer = function (this: Blob) {
    const result = nativeArrayBuffer.call(this);
    try {
      if (this instanceof File && /\.esreplay$/i.test(this.name)) {
        void result.then((bytes) => post({ kind: "replay-file", id: "local", bytes: bytes.slice(0) })).catch(() => {});
      }
    } catch {
      /* observation only */
    }
    return result;
  };

  // SPA route changes (Endstep navigates with the History API).
  const emitRoute = () => post({ kind: "route", path: location.pathname });
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      emitRoute();
      return result;
    };
  }
  window.addEventListener("popstate", emitRoute);
})();
