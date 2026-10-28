// Cards exiled to be played for a while ("Exile the top two cards of your library. Until the end
// of your turn, you may play those cards": Wrenn's Resolve, Light Up the Stage, Jeska's Will…).
// Endstep lists what may be played only to the player who must decide, so for an opponent it's
// inferred from what happened between two states, as ExileLinks does: a card that lands in the
// exile of the player whose spell or ability with such text just resolved. It lasts until it
// leaves exile or the time the text gives runs out.

import type { GameState } from "./GameState";

const EXILES = /\bexile/i;
const MAY_PLAY = /\byou may (?:play|cast) (?:those cards|that card|them|it|the exiled cards?|cards exiled)\b/i;
/** "Until the end of your next turn", "until your next end step": through their next turn too. */
const NEXT_TURN = /\bnext turn\b|\bnext end step\b/i;

export function exilesToPlay(text: string | undefined): boolean {
  return !!text && EXILES.test(text) && MAY_PLAY.test(text);
}

export interface ImpulseCard {
  /** The card that let them play it (Wrenn's Resolve…). */
  source: string;
  /** The last turn it can be played (undefined: as long as it stays in exile). */
  lastTurn?: number;
}

export class ImpulseExile {
  /** Exiled card id → what lets its owner play it. */
  private cards = new Map<string, ImpulseCard>();
  private matchId: string | null = null;

  /** Updates the cards for a new state and returns them. */
  update(prev: GameState | null, next: GameState): ReadonlyMap<string, ImpulseCard> {
    if (next.matchId !== this.matchId) {
      this.matchId = next.matchId;
      this.cards.clear();
    }
    const exiled = new Set(next.players.flatMap((p) => p.exile.map((c) => c.id)));
    const turn = next.turnNumber;
    for (const [id, c] of this.cards) {
      if (!exiled.has(id) || (turn !== undefined && c.lastTurn !== undefined && turn > c.lastTurn)) this.cards.delete(id);
    }
    if (!prev || prev.matchId !== next.matchId) return this.cards;

    const nowOnStack = new Set(next.stack.map((s) => s.id));
    for (const item of prev.stack) {
      const text = item.card?.oracleText;
      if (nowOnStack.has(item.id) || !exilesToPlay(text)) continue;
      // Its controller's exile (anyone's, when the item doesn't say whose it is).
      const owners = next.players.filter((p) => item.controllerId === undefined || p.id === item.controllerId);
      const was = new Set(prev.players.flatMap((p) => p.exile.map((c) => c.id)));
      // In two-player turns, their next turn is two from now.
      const lastTurn = prev.turnNumber === undefined ? undefined : prev.turnNumber + (NEXT_TURN.test(text!) ? 2 : 0);
      for (const c of owners.flatMap((p) => p.exile)) {
        if (!was.has(c.id) && !c.faceDown && !this.cards.has(c.id)) this.cards.set(c.id, { source: item.card?.name ?? item.name, lastTurn });
      }
    }
    return this.cards;
  }
}
