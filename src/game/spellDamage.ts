// How much damage a resolved spell or ability dealt to a creature that died of it. The states only
// show it gone, and what was left of its toughness is just the least it took (a Lightning Bolt on
// a 2-toughness creature dealt 3, not 2).

import type { CardView, GameState, StackItemView } from "./GameState";

/**
 * Endstep's CARD_DAMAGED event says it ("[[Lightning Bolt]] deals 3 damage to [[Grizzly Bears]]").
 * Events and states come apart, so without one yet: the number in the spell's text ("deals 3
 * damage", X as chosen) when it names one amount; else what was left of the card's toughness.
 */
export function damageDealt(prev: GameState, state: GameState, item: StackItemView, card: CardView): number {
  if (item.divided?.[card.id] !== undefined) return item.divided[card.id]!;
  const seen = Math.max(0, ...(prev.log ?? []).map((e) => e.seq));
  for (const e of state.log ?? []) {
    if (e.seq <= seen || e.type !== "CARD_DAMAGED" || !e.cards.some((c) => c.id === card.id)) continue;
    const n = /\bdeals (\d+) damage\b/i.exec(e.lines.join(" "));
    if (n) return Number(n[1]);
  }
  const text = item.isAbility ? item.name : item.card?.oracleText ?? "";
  const amounts = new Set([...text.matchAll(/\bdeals? (\d+|X) damage\b/gi)].map((m) => m[1]!.toUpperCase()));
  if (amounts.size === 1) {
    const [n] = amounts;
    if (n !== "X") return Number(n);
    if (item.x !== undefined) return item.x;
  }
  return Math.max(0, (Number(card.toughness) || 0) - (card.damage ?? 0));
}
