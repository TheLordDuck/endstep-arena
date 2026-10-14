// What the mulligan costs, for the line under its buttons (as Arena tells it): how many cards keeping
// this hand puts on the bottom of your library, from Endstep's MULLIGAN events ("… mulliganed to 6.").
import type { LogEntry } from "../../game/GameState";

export interface MulliganCost {
  /** Cards you keep if you keep now. */
  keep: number;
  /** Cards keeping puts on the bottom of your library (one per mulligan, but a free one). */
  bottom: number;
  /** You've mulliganed this game. */
  taken: boolean;
}

/** The London mulligan so far for the player in `seat`: you draw a whole new hand each time, and
    when you keep you put one card on the bottom for each mulligan (Endstep's events say how many
    you'll keep, so a free mulligan counts as none). `keepLabel` is Endstep's Keep button ("Keep 6"). */
export function mulliganCost(log: LogEntry[] | undefined, seat: number | undefined, handSize: number, keepLabel?: string): MulliganCost {
  const entries = log ?? [];
  // This game's, after the hand they kept in the one before (a match's games share the log).
  let since = -1;
  entries.forEach((e, i) => { if (e.type === "HAND_SETTLED" && e.seat === seat) since = i; });
  const sizes = entries.slice(since + 1)
    .filter((e) => e.type === "MULLIGAN" && e.seat === seat)
    .map((e) => /\bto (\d+)\b/.exec(e.lines.join(" "))?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  const labelled = /\bkeep\s+(\d+)\b/i.exec(keepLabel ?? "")?.[1];
  const keep = Math.min(handSize, sizes.length ? sizes.at(-1)! : labelled !== undefined ? Number(labelled) : handSize);
  return { keep, bottom: Math.max(0, handSize - keep), taken: sizes.length > 0 };
}

/** The line under the buttons. */
export function mulliganHint(cost: MulliganCost, handSize: number): string {
  const cards = (n: number) => `${n} card${n === 1 ? "" : "s"}`;
  if (cost.bottom > 0) {
    return `You will put ${cards(cost.bottom)} on the bottom of your library. Mulligan again: ${cards(cost.bottom + 1)}.`;
  }
  if (cost.taken) return `That mulligan was free: you keep all ${handSize}. Mulligan again: 1 card to the bottom.`;
  return `A mulligan draws a new hand of ${handSize}, then you put 1 card on the bottom of your library.`;
}

export const MULLIGAN_RULE = "London mulligan: each mulligan shuffles your hand into your library and draws a new hand of the same size. "
  + "When you keep, you put one card on the bottom of your library for each mulligan you took (a free mulligan doesn't count).";
