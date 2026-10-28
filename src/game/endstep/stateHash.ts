// Endstep's check of a delta: the state it gives must hash to the `stateHash` the server sent
// (and, since hashV 3, what only this viewer sees to `privHash`). Ported from its client, so a
// delta it refuses (and resyncs after) is refused here too, instead of drifting from its state.

import type { Raw } from "./normalize";

const STATE_FIELDS = ["phase", "step", "activePlayerId", "priorityPlayerId", "turnNumber", "priorityPromptVersion", "sequenceNumber",
  "monarchPlayerId", "isDay", "isNight", "clock", "idleTimeout", "status", "winnerId"];
const PLAYER_FIELDS = ["life", "poisonCounters", "librarySize", "handSize", "manaPool", "manaRestrictions", "energyCounters",
  "experienceCounters", "radCounters", "ringTempts", "hasCitysBlessing", "hasInitiative", "hasMonarch", "hasEnduringStory",
  "hasLostGame", "hasConceded", "dungeonRoomId", "commanderTax", "commanderDamage"];
const ZONES = ["battlefield", "graveyard", "exile", "commandZone"];
const PRIVATE_FIELDS = ["hand", "libraryTop", "exilePeek", "battlefieldPeek"];
/** Counted from hashV 4. */
const EXTRA_FIELDS = ["stormCount"];

/** The delta versions Endstep applies; any other makes it resync. */
export const isKnownHashVersion = (v: unknown): boolean => v === 2 || v === 3 || v === 4;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (v == null ? "" : String(v));

function flat(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return `[${v.map(flat).join(",")}]`;
  if (typeof v === "object") {
    return `{${Object.entries(v).sort(([a], [b]) => (a < b ? -1 : +(a > b))).map(([k, x]) => `${k}=${flat(x)}`).join(",")}}`;
  }
  return String(v);
}

/** FNV-1a, as hex. */
function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** JSON with sorted keys, undefined left out. */
function canonical(v: unknown): string {
  if (typeof v !== "object" || !v) return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonical(x))).join(",")}]`;
  const o = v as Raw;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

const canonicalOrMissing = (v: unknown): string => (v === undefined ? "~" : canonical(v));

const itemHashes = new WeakMap<object, string>();
function itemHash(v: unknown): string {
  if (!isObj(v)) return fnv(canonical(v));
  let h = itemHashes.get(v);
  if (h === undefined) itemHashes.set(v, (h = fnv(canonical(v))));
  return h;
}

export function stateHash(state: Raw, version = 2): string {
  const lines = [`s|${STATE_FIELDS.map((k) => flat(state[k])).join("|")}`];
  (Array.isArray(state.players) ? state.players : []).forEach((p: Raw, i) => {
    lines.push(`p|${i}|${PLAYER_FIELDS.map((k) => flat(p?.[k])).join("|")}`);
    for (const zone of ZONES) {
      const cards = Array.isArray(p?.[zone]) ? (p[zone] as Raw[]) : [];
      lines.push(`z|${i}|${zone}|${cards.map((c) => `${str(c.id)}:${+!!c.tapped}:${+!!c.faceDown}${version >= 3 ? `:${itemHash(c)}` : ""}`).join(",")}`);
    }
  });
  const stack = Array.isArray(state.stack) ? (state.stack as Raw[]) : [];
  lines.push(`k|${stack.map((s) => {
    const source = isObj(s?.sourceCard) ? s.sourceCard : undefined;
    const targets = Array.isArray(s?.targets) ? (s.targets as Raw[]) : [];
    return `${str(source?.id)}[${targets.map((t) => str(t?.id)).join(",")}]${version >= 3 ? `:${itemHash(s)}` : ""}`;
  }).join(";")}`);
  if (version === 4) lines.push(`x|${EXTRA_FIELDS.map((k) => flat(state[k])).join("|")}`);
  return fnv(lines.join("\n"));
}

export function privateHash(state: Raw): string {
  const lines = (Array.isArray(state.players) ? state.players : []).map((p: Raw, i) => `${i}|${PRIVATE_FIELDS.map((k) => canonicalOrMissing(p?.[k])).join("|")}`);
  lines.push(`kr|${canonicalOrMissing(state.keywordReminders)}`);
  return fnv(lines.join("\n"));
}

/** Whether the state a delta gave is the one the server meant, as Endstep checks it. */
export function deltaMatches(state: Raw, delta: Raw): boolean {
  try {
    if (delta.hashV === 3 || delta.hashV === 4) {
      return typeof delta.privHash === "string" && stateHash(state, delta.hashV) === delta.stateHash && privateHash(state) === delta.privHash;
    }
    return delta.hashV === 2 && stateHash(state) === delta.stateHash;
  } catch {
    return false;
  }
}
