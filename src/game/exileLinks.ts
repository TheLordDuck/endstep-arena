// Cards exiled "until this leaves the battlefield" (Portable Hole, Oblivion Ring, Fiend Hunter,
// Banisher Priest…) belong under the permanent that holds them, as in Arena. Endstep doesn't say
// which card exiled what, so the link is inferred from what happened between two states: a card
// that lands in exile while such a permanent's spell or ability resolves (or while it enters the
// battlefield) is held by it. Links last until either card leaves its zone.

import type { CardView, GameState } from "./GameState";

/** Text of a permanent that keeps what it exiles (until it leaves, or "exiled with" it). */
const HOLDS_EXILE = /\bexile/i;
const UNTIL_LEAVES = /until [^.]*leaves the battlefield|exiled with|exiled card/i;

export function holdsExiledCards(c: Pick<CardView, "oracleText"> | undefined): boolean {
  const text = c?.oracleText ?? "";
  return HOLDS_EXILE.test(text) && UNTIL_LEAVES.test(text);
}

export class ExileLinks {
  /** Exiled card id → id of the permanent holding it. */
  private links = new Map<string, string>();

  /** Updates the links for a new state and returns them. */
  update(prev: GameState | null, next: GameState): ReadonlyMap<string, string> {
    const battlefield = new Map(next.players.flatMap((p) => p.battlefield.map((c) => [c.id, c] as const)));
    const exiled = new Set(next.players.flatMap((p) => p.exile.map((c) => c.id)));
    for (const [card, host] of this.links) if (!battlefield.has(host) || !exiled.has(card)) this.links.delete(card);
    if (!prev || prev.matchId !== next.matchId) return this.links;

    const wasExiled = new Set(prev.players.flatMap((p) => p.exile.map((c) => c.id)));
    const fresh = [...exiled].filter((id) => !wasExiled.has(id) && !this.links.has(id));
    if (!fresh.length) return this.links;

    // Whose effect exiled them: first a spell or ability that just left the stack (the one that
    // resolved), then the rest of the old stack, then a permanent that just entered.
    const nowOnStack = new Set(next.stack.map((s) => s.id));
    const resolved = prev.stack.filter((s) => !nowOnStack.has(s.id));
    const wasOnBattlefield = new Set(prev.players.flatMap((p) => p.battlefield.map((c) => c.id)));
    const candidates = [
      ...resolved.map((s) => s.sourceCardId ?? s.card?.id),
      ...prev.stack.map((s) => s.sourceCardId ?? s.card?.id),
      ...[...battlefield.keys()].filter((id) => !wasOnBattlefield.has(id)),
    ];
    const stackText = new Map(prev.stack.map((s) => [s.sourceCardId ?? s.card?.id, s.card] as const));
    const host = candidates.find((id): id is string =>
      !!id && battlefield.has(id) && (holdsExiledCards(battlefield.get(id)) || holdsExiledCards(stackText.get(id))));
    if (host) for (const id of fresh) if (id !== host) this.links.set(id, host);
    return this.links;
  }
}
