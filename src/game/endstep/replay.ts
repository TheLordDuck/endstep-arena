// Endstep replays (.esreplay): a gzipped file of JSON lines. The first line is a header
// ({ format: "endstep-replay", seat, players… }); each further line is a record `{ t, k, … }`:
// "key" carries a whole state, "diff" a patch to the last one, and the rest (events, actions,
// chapters, gaps) don't change the table; the events are kept for the game log. Endstep's replay player turns every key or diff that
// leaves a state with two players or more into one frame of its timeline; so does this, so a
// frame index here is the same frame there.

import type { Raw } from "./normalize";

export const REPLAY_FORMAT = "endstep-replay";

export interface ReplayFrame {
  /** The full raw state at this frame, as a GAME_STATE payload. */
  raw: Raw;
  /** Ms since the recording started. */
  t: number;
  turn: number;
}

export interface Replay {
  seat: number;
  players: { seat: number; name: string }[];
  frames: ReplayFrame[];
  /** The game events recorded (for the game log), each with the frame it came with. */
  events: { frame: number; event: Raw }[];
}

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: Raw, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

/** Sets a key without ever going through a prototype setter ("__proto__" stays a plain key). */
function put(o: Raw, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

/**
 * Applies a replay patch, exactly as Endstep's player does:
 * `{ s }` replaces the value; `{ o, d? }` patches an object's keys (`o`) and deletes some (`d`);
 * `{ a }` rebuilds an array, each entry either a new value `{ v }` or the old element with that
 * `id`, itself patched by `p`.
 */
export function applyReplayPatch(prev: unknown, patch: Raw): unknown {
  if ("s" in patch) return patch.s;
  if ("o" in patch) {
    const next: Raw = {};
    if (isObj(prev)) for (const k of Object.keys(prev)) put(next, k, own(prev, k));
    const o = isObj(patch.o) ? patch.o : {};
    for (const k of Object.keys(o)) put(next, k, applyReplayPatch(own(next, k), own(o, k) as Raw));
    for (const k of Array.isArray(patch.d) ? patch.d : []) delete next[String(k)];
    return next;
  }
  const byId = new Map<unknown, unknown>();
  if (Array.isArray(prev)) {
    for (const el of prev) {
      const id = isObj(el) ? own(el, "id") : undefined;
      if (typeof id === "string" || typeof id === "number") byId.set(id, el);
    }
  }
  return (Array.isArray(patch.a) ? patch.a : []).map((entry: Raw) => {
    if ("v" in entry) return entry.v;
    const old = byId.get(entry.id);
    return isObj(entry.p) ? applyReplayPatch(old, entry.p) : old;
  });
}

/** Builds the timeline from the file's text. Throws on a file that isn't a replay. */
export function parseReplay(text: string): Replay {
  const lines = text.split(/\r?\n/);
  const header = JSON.parse(lines[0] ?? "") as unknown;
  if (!isObj(header) || header.format !== REPLAY_FORMAT) throw new Error("not a replay");
  const seat = typeof header.seat === "number" ? header.seat : 0;
  const players = (Array.isArray(header.players) ? header.players : [])
    .filter(isObj)
    .map((p) => ({ seat: Number(p.seat) || 0, name: String(p.name ?? "") }));

  const frames: ReplayFrame[] = [];
  const events: { frame: number; event: Raw }[] = [];
  let raw: unknown;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (isObj(rec) && rec.k === "event" && isObj(rec.event)) {
      events.push({ frame: Math.max(0, frames.length - 1), event: rec.event });
      continue;
    }
    if (!isObj(rec) || (rec.k !== "key" && rec.k !== "diff")) continue;
    if (rec.k === "key") {
      if (!isObj(rec.state)) continue;
      raw = rec.state;
    } else {
      // A diff with no keyframe before it has nothing to apply to.
      if (raw === undefined || !isObj(rec.patch)) continue;
      raw = applyReplayPatch(raw, rec.patch);
    }
    if (isObj(raw) && Array.isArray(raw.players) && raw.players.length >= 2) {
      frames.push({ raw, t: Number(rec.t) || 0, turn: Number(raw.turnNumber) || 0 });
    }
  }
  if (!frames.length) throw new Error("no playable frame");
  return { seat, players, frames, events };
}

/** Un-gzips and parses a replay file. Throws on anything that isn't one. */
export async function decodeReplay(bytes: ArrayBuffer): Promise<Replay> {
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (head[0] !== 0x1f || head[1] !== 0x8b) throw new Error("not gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return parseReplay(await new Response(stream).text());
}
