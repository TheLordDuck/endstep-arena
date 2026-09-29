// What you've seen of another player's hand. Endstep hides their hand behind placeholder cards
// ("Hidden card", ids by position), and doesn't remember what was revealed: once the reveal is
// over, the hand is all hidden again. So it's remembered here, by each card's real id:
//  - a reveal from their hand (Thoughtseize, Duress…: CARD_REVEALED, from HAND or into it),
//  - their hand cards offered in one of your choices (the card you pick to discard…).
// A card stops being known once its real id shows up anywhere else (stack, battlefield,
// graveyard, exile…), or when their hand is too small to still hold it.

import type { CardView, GameState } from "./GameState";

export class HandKnowledge {
  private matchId = "";
  /** Player id → real card id → the card, in the order they became known. */
  private known = new Map<string, Map<string, CardView>>();
  private seenReveals = new Set<string>();

  /** Updates for a new state; returns the known cards still in each player's hand. */
  update(state: GameState): ReadonlyMap<string, CardView[]> {
    if (state.matchId !== this.matchId) {
      this.matchId = state.matchId;
      this.known.clear();
      this.seenReveals.clear();
    }
    const viewer = state.players.find((p) => p.isViewer);
    const byName = (name: string | undefined) => (name ? state.players.find((p) => p.targetName === name || p.name === name) : undefined);
    const add = (playerId: string, id: string, c: CardView) => {
      if (playerId === viewer?.id) return;
      let cards = this.known.get(playerId);
      if (!cards) this.known.set(playerId, (cards = new Map()));
      cards.set(id, { ...c, id });
    };

    for (const r of state.reveals) {
      if (this.seenReveals.has(r.id)) continue;
      this.seenReveals.add(r.id);
      if (!r.toHand && !/hand/i.test(r.zone ?? "")) continue;
      const owner = byName(r.playerName);
      if (!owner) continue;
      r.cards.forEach((c, i) => add(owner.id, r.cardIds[i] ?? c.id, c));
    }

    // Their hand cards offered in a choice of yours (e.g. which card they discard). Prompt options
    // name their owner (ownerName) rather than giving an id.
    const p = state.pending;
    for (const c of p?.optionCards ?? []) {
      if (c.faceDown || !/hand/i.test(p?.optionZones[c.id] ?? "")) continue;
      const owner = c.ownerId ?? byName(c.ownerName)?.id;
      if (owner) add(owner, c.id, c);
    }

    // Anything seen elsewhere has left the hand.
    const elsewhere = new Set<string>();
    for (const pl of state.players) {
      for (const zone of [pl.battlefield, pl.graveyard, pl.exile, pl.commandZone, pl.libraryTop]) for (const c of zone) elsewhere.add(c.id);
    }
    for (const s of state.stack) {
      elsewhere.add(s.id);
      if (s.card) elsewhere.add(s.card.id);
    }

    const out = new Map<string, CardView[]>();
    for (const [playerId, cards] of this.known) {
      for (const id of cards.keys()) if (elsewhere.has(id)) cards.delete(id);
      const player = state.players.find((pl) => pl.id === playerId);
      // A hand smaller than what's known: the oldest known cards are the ones that went unseen
      // (shuffled away, put on the library…).
      const size = player?.handSize ?? player?.hand?.length ?? 0;
      while (cards.size > size) cards.delete(cards.keys().next().value!);
      if (cards.size) out.set(playerId, [...cards.values()]);
    }
    return out;
  }
}
