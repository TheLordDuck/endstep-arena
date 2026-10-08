// Rebuilds Endstep's game state from observed socket frames, applying
// deltas exactly the way Endstep's client does, and exposes a normalized
// GameState. This folder is the only Endstep-specific code.

import type { GameEventEntry, GameState, LogEntry, RevealView } from "../GameState";
import type { ReplayStatus } from "../ReplayPlayer";
import { RingBuffer } from "../../shared/RingBuffer";
import { normalize, toLogEntry, toReveal, type Raw } from "./normalize";

/** How many recent reveals are kept (for the popups and for cards known in a hand). */
const MAX_REVEALS = 20;
/** How many lines the game log keeps (the oldest go first). */
const MAX_LOG = 800;

interface Frame {
  type: string;
  payload?: unknown;
  matchId?: unknown;
  seq?: unknown;
  viewerSeat?: unknown;
}

type Listener = (state: GameState | null) => void;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

/** Endstep's replay pages: /replay/:id, /replay/local, and the admin views of a report's replay. */
export function isReplayPath(path: string): boolean {
  return /^\/replay\/|^\/admin\/.*\/replay(\/|$)/.test(path);
}

/** The match a page is about: /game/:id, or watched at /spectate/:id (or /admin/spectate/:id). */
export function matchIdFromPath(path: string): string | null {
  const m = /^\/(?:game|spectate|admin\/spectate)\/([^/?#]+)/.exec(path);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** Watching someone else's game: /spectate/:id, or an admin's /admin/spectate/:id. */
export function isSpectatePath(path: string): boolean {
  return /^\/(?:admin\/)?spectate\//.test(path);
}

export class EndstepAdapter {
  private raw: Raw | null = null;
  private matchId: string | null = null;
  private viewerSeat = 0;
  private seq: number | undefined;
  private desynced = false;
  private state: GameState | null = null;
  private routeMatchId: string | null = null;
  /** On a replay page the board shows the replay, and live frames are ignored. */
  private replayRoute = false;
  private replayView: { raw: Raw; seat: number; status: ReplayStatus; events?: Raw[] } | null = null;
  private spectating = false;
  /** The game log of the match being shown. */
  private log: LogEntry[] = [];
  private listeners = new Set<Listener>();
  readonly events = new RingBuffer<GameEventEntry>(200);
  private reveals: RevealView[] = [];
  /** Seat → its connection, from SEAT_CONNECTIVITY frames (deadline on the local clock). */
  private connectivity = new Map<number, { connected: boolean; deadline: number | null }>();
  /** Server clock minus ours (ms), for the match clock and the idle timer: the largest seen, as
      Endstep's clock keeps it (a frame that took longer to arrive gives a smaller one). */
  private serverSkew: number | undefined;
  /** The last `serverNowMs` counted, by field (a state keeps it until it changes). */
  private seenServerNow = new Map<string, number>();

  getGameState(): GameState | null {
    return this.state;
  }

  /** Last full raw state (after deltas), for the debug "copy raw" tool. */
  getRawState(): Raw | null {
    return this.raw;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Called on SPA navigation. Leaving a match route drops its state. */
  setRoute(path: string): void {
    const spectating = isSpectatePath(path);
    if (spectating !== this.spectating) {
      this.spectating = spectating;
      this.publish();
    }
    const replay = isReplayPath(path);
    if (replay !== this.replayRoute) {
      this.replayRoute = replay;
      this.reset();
      this.publish();
    }
    const next = matchIdFromPath(path);
    if (next === this.routeMatchId) return;
    this.routeMatchId = next;
    if (this.matchId && this.matchId !== next) this.reset();
  }

  handleFrame(frame: unknown): void {
    if (!isObj(frame) || typeof frame.type !== "string") return;
    const f = frame as unknown as Frame;
    switch (f.type) {
      case "ATTACH":
        if (isObj(f.payload) && Array.isArray(f.payload.frames)) {
          for (const inner of f.payload.frames) this.handleFrame(inner);
        }
        return;
      case "GAME_STATE":
      case "GAME_OVER":
        return this.onFullState(f);
      case "GAME_DELTA":
        return this.onDelta(f);
      case "GAME_EVENT":
        if (this.accepts(f.matchId) && isObj(f.payload)) {
          this.events.push({ t: Date.now(), type: String(f.payload.type ?? "?"), payload: f.payload });
          this.addToLog(f.matchId as string, f.payload);
          // Revealed cards stay listed (the last few) so the board can show them.
          const reveal = toReveal(f.payload);
          if (reveal && !this.reveals.some((r) => r.id === reveal.id)) {
            this.reveals = [...this.reveals, reveal].slice(-MAX_REVEALS);
            this.publish();
          }
        }
        return;
      case "SEAT_CONNECTIVITY":
        return this.onConnectivity(f);
      case "GAME_GONE":
        if (isObj(f.payload) && f.payload.matchId === this.matchId) this.reset();
        return;
    }
  }

  /** A game event as a line of the log (each once: it may come again on a reconnect). */
  private addToLog(matchId: string, payload: Raw): void {
    // The log follows the match being shown; one before its first state starts it.
    if (this.matchId && matchId !== this.matchId) return;
    const entry = toLogEntry(payload, (this.log.at(-1)?.seq ?? 0) + 1);
    if (!entry || (typeof payload.sequenceNumber === "number" && this.log.some((e) => e.seq === entry.seq))) return;
    this.log = [...this.log, entry].slice(-MAX_LOG);
    this.publish();
  }

  /** The replay frame to show (null: none loaded), with the game events recorded up to it.
      Shown only on a replay page. */
  showReplay(view: { raw: Raw; seat: number; status: ReplayStatus; events?: Raw[] } | null): void {
    this.replayView = view;
    if (!this.replayRoute) return;
    if (view) this.publish();
    else this.reset();
  }

  private accepts(matchId: unknown): boolean {
    if (typeof matchId !== "string" || !matchId || this.replayRoute) return false;
    // On a /game/:id route only that match counts; elsewhere follow whatever arrives.
    return this.routeMatchId ? matchId === this.routeMatchId : true;
  }

  /** A player lost or regained connection. Endstep puts the fields on the payload (or the frame
      itself); the grace deadline is on the server's clock, so it's moved to ours. */
  private onConnectivity(f: Frame): void {
    const c = (isObj(f.payload) ? f.payload : f) as Raw;
    // As Endstep reads it: no match id (or an empty one) means this match. (It may come before
    // the match's first state.)
    const matchId = c.matchId || f.matchId;
    if (matchId && ((this.matchId && matchId !== this.matchId) || !this.accepts(matchId))) return;
    // The seat may come as a number or a numeric string.
    const index = Number(c.playerIndex);
    if (c.playerIndex == null || c.playerIndex === "" || !Number.isInteger(index) || typeof c.connected !== "boolean") return;
    const skew = typeof c.serverNowMs === "number" ? c.serverNowMs - Date.now() : 0;
    const deadline = typeof c.graceDeadline === "number" ? c.graceDeadline - skew : null;
    this.connectivity.set(index, { connected: c.connected, deadline });
    this.publish();
  }

  private onFullState(f: Frame): void {
    if (!this.accepts(f.matchId) || !isObj(f.payload) || !Array.isArray(f.payload.players)) return;
    const seq = typeof f.seq === "number" ? f.seq : undefined;
    const sameMatch = f.matchId === this.matchId;
    if (sameMatch && seq !== undefined && this.seq !== undefined && seq < this.seq) return;
    if (!sameMatch && this.matchId) {
      this.connectivity.clear();
      this.log = [];
    }
    this.matchId = f.matchId as string;
    this.viewerSeat = typeof f.viewerSeat === "number" ? f.viewerSeat : this.viewerSeat;
    this.seq = seq;
    this.raw = f.payload;
    this.desynced = false;
    this.publish();
  }

  private onDelta(f: Frame): void {
    if (!this.raw || f.matchId !== this.matchId || !isObj(f.payload)) return;
    const d = f.payload;
    const patch = isObj(d.patch) ? d.patch : null;
    if (!patch || typeof d.baseSeq !== "number" || d.baseSeq !== this.seq) {
      // Endstep's client resyncs itself on a gap; its fresh GAME_STATE fixes us too.
      this.desynced = true;
      this.publish();
      return;
    }
    this.raw = applyDelta(this.raw, d, patch);
    if (typeof f.seq === "number") this.seq = f.seq;
    this.desynced = false;
    this.publish();
  }

  private reset(): void {
    this.raw = null;
    this.matchId = null;
    this.seq = undefined;
    this.desynced = false;
    this.state = null;
    this.reveals = [];
    this.log = [];
    this.connectivity.clear();
    this.serverSkew = undefined;
    this.seenServerNow.clear();
    for (const cb of this.listeners) cb(null);
  }

  private publish(): void {
    if (this.replayRoute) return this.publishReplay();
    if (!this.raw || !this.matchId) return;
    this.trackSkew(this.raw);
    const state = normalize(this.raw, {
      matchId: this.matchId,
      viewerSeat: this.viewerSeat,
      seq: this.seq,
      desynced: this.desynced,
      serverSkew: this.serverSkew,
    });
    // playerIndex is the index in `players`, as Endstep reads it.
    const players = state.players.map((p, i) => {
      const conn = this.connectivity.get(i);
      return conn && !conn.connected && !p.hasLost && !p.hasConceded ? { ...p, disconnected: { deadline: conn.deadline } } : p;
    });
    this.state = { ...state, players, reveals: this.reveals, log: this.log, ...(this.spectating ? { spectating: true } : {}) };
    for (const cb of this.listeners) cb(this.state);
  }

  /** A new `serverNowMs` in the clock or the idle timer was just received: how far the server's
      clock is ahead of ours. */
  private trackSkew(raw: Raw): void {
    for (const key of ["clock", "idleTimeout"]) {
      const v = raw[key];
      const now = isObj(v) && typeof v.serverNowMs === "number" ? v.serverNowMs : undefined;
      if (now === undefined || this.seenServerNow.get(key) === now) continue;
      this.seenServerNow.set(key, now);
      const skew = now - Date.now();
      if (this.serverSkew === undefined || skew > this.serverSkew) this.serverSkew = skew;
    }
  }

  /** A replay frame, as the recording seat saw it. Its prompt is left out: nothing can be
      answered in a replay. */
  private publishReplay(): void {
    const v = this.replayView;
    if (!v) return;
    this.raw = v.raw;
    const state = normalize({ ...v.raw, pendingAction: null }, { matchId: "replay", viewerSeat: v.seat, desynced: false, frozen: true });
    const log = (v.events ?? []).map((e, i) => toLogEntry(e, i + 1)).filter((e): e is LogEntry => !!e);
    this.state = { ...state, reveals: [], replay: v.status, log };
    for (const cb of this.listeners) cb(this.state);
  }
}

/** Mirror of Endstep's own merge: shallow state merge, players patched by index `i`. */
export function applyDelta(prev: Raw, delta: Raw, patch: Raw): Raw {
  const next: Raw = { ...prev, ...(isObj(patch.state) ? patch.state : {}), pendingAction: delta.pendingAction };
  const playerPatches = Array.isArray(patch.players) ? patch.players.filter(isObj) : [];
  if (playerPatches.length > 0 && Array.isArray(prev.players)) {
    const byIndex = new Map(playerPatches.map((p) => [p.i, p]));
    next.players = prev.players.map((player, index) => {
      const p = byIndex.get(index);
      if (!p) return player;
      const { i: _i, ...fields } = p;
      return { ...(player as Raw), ...fields };
    });
  }
  return next;
}
