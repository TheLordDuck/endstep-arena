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

/** Where the player in `seat` is with their opening hand, for the line under the mulligan's heading
    (as Arena tells it): still deciding, mulliganed down to N, or kept N cards. `who` names them. */
export function mulliganStatus(log: LogEntry[] | undefined, seat: number | undefined, who: string): string {
  const entries = log ?? [];
  let since = -1;
  entries.forEach((e, i) => { if (e.type === "HAND_SETTLED" && e.seat === seat) since = i; });
  const theirs = entries.slice(since + 1).filter((e) => e.seat === seat);
  const number = (e: LogEntry, re: RegExp) => re.exec(e.lines.join(" "))?.[1];
  const kept = [...theirs].reverse().find((e) => e.type === "HAND_KEPT");
  if (kept) {
    const n = number(kept, /\bkept (\d+)\b/);
    return n ? `${who} kept a hand of ${n} card${n === "1" ? "" : "s"}.` : `${who} kept their hand.`;
  }
  const down = theirs.filter((e) => e.type === "MULLIGAN").map((e) => number(e, /\bmulliganed to (\d+)\b/)).filter((n) => n !== undefined);
  if (down.length) {
    const n = down.length;
    return `${who} took ${n === 1 ? "a mulligan" : `${n} mulligans`} (to ${down.at(-1)}) and is choosing again.`;
  }
  return `${who} is still choosing whether to keep their opening hand.`;
}
