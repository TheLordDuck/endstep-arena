// Cards put into a graveyard from a library (milled), read from the game log: Endstep logs each
// move as "Name: Library -> Graveyard", one event per card, in the order they happen. The board
// flies them from the library to the graveyard one after another, as Arena does, and keeps the
// last one milled on top of the pile.

import type { CardView, LogEntry } from "../../game/GameState";

export interface Arrival {
  /** The log's sequence number of the card's latest move into a graveyard. */
  seq: number;
  /** It came from a library (milled). */
  milled: boolean;
}

const INTO_GRAVEYARD = /->\s*Graveyard\s*$/i;
const FROM_LIBRARY = /:\s*Library\s*->/i;

/** Each card's latest move into a graveyard the log tells of, by card id. */
export function graveyardArrivals(log: readonly LogEntry[]): Map<string, Arrival> {
  const out = new Map<string, Arrival>();
  for (const e of log) {
    const id = e.cards[0]?.id;
    if (!id) continue;
    const line = e.lines.find((l) => INTO_GRAVEYARD.test(l));
    if (line) out.set(id, { seq: e.seq, milled: FROM_LIBRARY.test(line) });
  }
  return out;
}

/**
 * A graveyard bottom to top, as the board shows it: Endstep's order (it adds new cards at the
 * end), except that the cards whose arrival the log tells of are put in the order they arrived,
 * in the places they hold, so the last one milled is on top even when several came in one update.
 */
export function graveyardOrder(cards: readonly CardView[], arrivals: ReadonlyMap<string, Arrival>): CardView[] {
  const slots: number[] = [];
  cards.forEach((c, i) => arrivals.has(c.id) && slots.push(i));
  if (slots.length < 2) return [...cards];
  const known = slots.map((i) => cards[i]!).sort((a, b) => arrivals.get(a.id)!.seq - arrivals.get(b.id)!.seq);
  const out = [...cards];
  slots.forEach((slot, k) => (out[slot] = known[k]!));
  return out;
}

/** The cards an update milled into a graveyard (in it now, not before, logged as coming from the
    library), in the order they were milled. */
export function milledCards(before: ReadonlySet<string>, ordered: readonly CardView[], arrivals: ReadonlyMap<string, Arrival>): CardView[] {
  return ordered.filter((c) => !before.has(c.id) && arrivals.get(c.id)?.milled);
}
