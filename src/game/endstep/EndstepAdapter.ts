// Rebuilds Endstep's game state from observed socket frames, applying
// deltas exactly the way Endstep's client does, and exposes a normalized
// GameState. This folder is the only Endstep-specific code.

import type { GameEventEntry, GameState } from "../GameState";
import { RingBuffer } from "../../shared/RingBuffer";
import { normalize, type Raw } from "./normalize";

interface Frame {
  type: string;
  payload?: unknown;
  matchId?: unknown;
  seq?: unknown;
  viewerSeat?: unknown;
}

type Listener = (state: GameState | null) => void;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

export function matchIdFromPath(path: string): string | null {
  const m = /^\/game\/([^/?#]+)/.exec(path);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export class EndstepAdapter {
  private raw: Raw | null = null;
  private matchId: string | null = null;
  private viewerSeat = 0;
  private seq: number | undefined;
  private desynced = false;
  private state: GameState | null = null;
  private routeMatchId: string | null = null;
  private listeners = new Set<Listener>();
  readonly events = new RingBuffer<GameEventEntry>(200);

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
        }
        return;
      case "GAME_GONE":
        if (isObj(f.payload) && f.payload.matchId === this.matchId) this.reset();
        return;
    }
  }

  private accepts(matchId: unknown): boolean {
    if (typeof matchId !== "string" || !matchId) return false;
    // On a /game/:id route only that match counts; elsewhere follow whatever arrives.
    return this.routeMatchId ? matchId === this.routeMatchId : true;
  }

  private onFullState(f: Frame): void {
    if (!this.accepts(f.matchId) || !isObj(f.payload) || !Array.isArray(f.payload.players)) return;
    const seq = typeof f.seq === "number" ? f.seq : undefined;
    const sameMatch = f.matchId === this.matchId;
    if (sameMatch && seq !== undefined && this.seq !== undefined && seq < this.seq) return;
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
    for (const cb of this.listeners) cb(null);
  }

  private publish(): void {
    if (!this.raw || !this.matchId) return;
    this.state = normalize(this.raw, {
      matchId: this.matchId,
      viewerSeat: this.viewerSeat,
      seq: this.seq,
      desynced: this.desynced,
    });
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
