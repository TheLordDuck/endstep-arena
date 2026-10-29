// Runs in the page's MAIN world at document_start, before Endstep's bundle.
// It observes Endstep's own game socket and forwards game frames to the
// isolated content script; it never alters, drops or delays a frame.
// Its write paths send whitelisted GAME_ACTION frames, and the match chat's CHAT and CHAT_TYPING
// frames, in the exact envelopes Endstep's client uses, so the server sees ordinary ones.
// It also times Endstep's damage sound to the board's hits (see damageSound.ts).

import {
  ALLOWED_ACTIONS,
  BRIDGE_TAG,
  MATCH_SOCKET_CLOSED,
  MATCH_SOCKET_OPENED,
  CHAT_MAX,
  isChatCommand,
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
  // (CHAT, CHAT_TYPING, CHAT_REFUSED, CHAT_MUTE: the board keeps only its match's chat.)
  const isGameFrame = (data: string) => data.includes('"GAME_') || data.includes('"ATTACH"') || data.includes('"SEAT_CONNECTIVITY"') || data.includes('"CHAT');

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
  /** The main socket before `current` (should a match's socket ever be opened at /ws too). */
  let previous: WebSocket | null = null;
  /** Sockets of a single match (see tapAttached). */
  const attached = new WeakSet<WebSocket>();
  /** Attach tickets the main socket handed out → their match (see tapAttached). */
  const tickets = new Map<string, string>();

  function tap(ws: WebSocket, url: string) {
    tapped.add(ws);
    previous = current;
    current = ws;
    post({ kind: "ws-open", url });
    ws.addEventListener("message", (ev) => {
      if (attached.has(ws) || typeof ev.data !== "string" || !isGameFrame(ev.data)) return;
      if (ev.data.includes('"GAME_ATTACH_TICKET"')) noteTicket(ev.data);
      post({ kind: "ws-in", data: ev.data });
    });
    ws.addEventListener("close", (ev) => post({ kind: "ws-close", code: ev.code }));
  }

  function noteTicket(data: string) {
    try {
      const f = JSON.parse(data);
      // It may also come inside an ATTACH batch (a reconnect).
      const frames = f?.type === "ATTACH" && Array.isArray(f.payload?.frames) ? f.payload.frames : [f];
      for (const frame of frames) {
        const p = frame?.type === "GAME_ATTACH_TICKET" ? frame.payload : null;
        if (typeof p?.ticket === "string" && typeof p.matchId === "string") {
          tickets.set(p.ticket, p.matchId);
          if (tickets.size > 16) tickets.delete(tickets.keys().next().value!);
        }
      }
    } catch {
      /* observation only */
    }
  }

  // Since late October 2026 a match's states, deltas and events move to a socket of its own once
  // it starts: the main socket gets a GAME_ATTACH_TICKET { matchId, path, ticket }, Endstep opens
  // `path` and sends ATTACH { ticket }, the server answers ATTACHED { audience } and the game's
  // frames follow there (actions still go out on the main socket). Those frames may leave out the
  // match and the seat, which Endstep's client adds as it delivers them; the same is done here.
  // Each is marked `via: "match"`: its seq doesn't follow the main socket's (see EndstepAdapter).
  // When the socket closes Endstep goes back to the main one, which the adapter is told.
  function tapAttached(ws: WebSocket, ticket: string) {
    tapped.add(ws);
    attached.add(ws);
    if (ws === current) current = previous;
    const matchId = tickets.get(ticket);
    let viewerSeat: number | undefined;
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        const f = JSON.parse(ev.data);
        if (f?.type === "ATTACHED") {
          const a = f.payload?.audience;
          if (typeof a === "string" && /^(0|[1-9][0-9]{0,3})$/.test(a)) viewerSeat = Number(a);
          if (matchId) post({ kind: "ws-in", data: JSON.stringify({ type: MATCH_SOCKET_OPENED, matchId }) });
          return;
        }
        if (f?.type !== "GAME_STATE" && f?.type !== "GAME_DELTA" && f?.type !== "GAME_EVENT") return;
        if (f.matchId === undefined && matchId) f.matchId = matchId;
        if (f.type !== "GAME_EVENT" && f.viewerSeat === undefined && viewerSeat !== undefined) f.viewerSeat = viewerSeat;
        f.via = "match";
        post({ kind: "ws-in", data: JSON.stringify(f) });
      } catch {
        /* observation only */
      }
    });
    ws.addEventListener("close", () => {
      if (matchId) post({ kind: "ws-in", data: JSON.stringify({ type: MATCH_SOCKET_CLOSED, matchId }) });
    });
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
      } else if (!attached.has(this) && typeof data === "string" && data.startsWith('{"type":"ATTACH"')) {
        const ticket = JSON.parse(data)?.payload?.ticket;
        if (typeof ticket === "string" && tickets.has(ticket)) tapAttached(this, ticket);
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

  // The match chat from the Arena UI: a message, or that you're typing, as Endstep's chat box sends them.
  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !isChatCommand(ev.data)) return;
    const c = ev.data;
    if (!current || current.readyState !== NativeWebSocket.OPEN) return;
    if (c.kind === "send-chat") {
      const message = c.message!.trim().slice(0, CHAT_MAX);
      if (message) current.send(JSON.stringify({ type: "CHAT", payload: { message, matchId: c.matchId, clientMessageId: c.clientMessageId } }));
    } else {
      current.send(JSON.stringify({ type: "CHAT_TYPING", payload: { scope: "match", id: c.matchId, active: c.active } }));
    }
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
