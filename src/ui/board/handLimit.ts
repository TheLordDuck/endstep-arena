// The warning beside your hand when you'll have to discard at the end of your turn (as Arena shows
// it): more than seven cards in your hand on your turn, and nothing that lifts the limit.
import type { GameState, PlayerView } from "../../game/GameState";

/** The maximum hand size, unless a permanent changes it. */
export const MAX_HAND = 7;

/** A permanent of yours that says you have no maximum hand size (Reliquary Tower, Thought Vessel…). */
const NO_MAXIMUM = /\byou have no maximum hand size\b/i;

/** What to tell `me` about their hand size, if they'll have to discard at the end of their turn. */
export function handLimitWarning(state: GameState | null | undefined, me: PlayerView | null | undefined): string | undefined {
  if (!state || !me || state.spectating || state.activePlayerId !== me.id) return undefined;
  const size = me.hand?.length ?? me.handSize ?? 0;
  if (size <= MAX_HAND) return undefined;
  if (me.battlefield.some((c) => NO_MAXIMUM.test(c.oracleText ?? ""))) return undefined;
  const extra = size - MAX_HAND;
  return `You will discard ${extra} card${extra === 1 ? "" : "s"} at the end of your turn (hand size ${size}, maximum ${MAX_HAND})`;
}
