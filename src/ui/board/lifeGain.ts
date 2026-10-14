// Where a life gain came from, for the orbs that fly to the life total (as Arena shows it).
// Endstep's PLAYER_LIFE_CHANGED names no source, but the event just before it does: the lifelink
// creature's damage, the spell that resolved, the ability that triggered.
import type { LogEntry } from "../../game/GameState";

/** How far back from the gain to look for what caused it. */
const LOOKBACK = 6;

/** The id of the card that gave the player in `seat` their latest life gain, if the log says. */
export function lifeGainSource(log: LogEntry[] | undefined, seat: number | undefined): string | undefined {
  const entries = log ?? [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    if (e.type !== "PLAYER_LIFE_CHANGED" || e.seat !== seat) continue;
    const m = /(-?\d+)\s*->\s*(-?\d+)/.exec(e.lines.join(" "));
    if (!m || Number(m[2]) <= Number(m[1])) return undefined;
    for (let j = i - 1; j >= Math.max(0, i - LOOKBACK); j--) {
      const before = entries[j]!;
      if (before.type === "TURN_BEGAN" || before.type === "PLAYER_LIFE_CHANGED") break;
      if (before.cards[0]) return before.cards[0].id;
    }
    return undefined;
  }
  return undefined;
}
