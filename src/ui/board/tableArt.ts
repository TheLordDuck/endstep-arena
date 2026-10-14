// The table's background: the art of a basic land in the colors of the deck being played, as a
// stand-in for Arena's illustrated battlefields (theirs can't be used).

import type { PlayerView } from "../../game/GameState";

const BASICS: [color: string, land: string][] = [["W", "Plains"], ["U", "Island"], ["B", "Swamp"], ["R", "Mountain"], ["G", "Forest"]];

/** The basic land of a player's main color, from what they've shown so far: their lands' basic
    types, and the colors of their other cards (commanders count double). Null while nothing
    tells (an opening hand of colorless cards, say). */
export function deckLand(p: PlayerView | null | undefined): string | null {
  if (!p) return null;
  const count = new Map<string, number>();
  const add = (color: string, n: number) => count.set(color, (count.get(color) ?? 0) + n);
  for (const c of [...p.battlefield, ...p.graveyard, ...p.exile, ...(p.hand ?? []), ...p.commandZone]) {
    const weight = c.isCommander ? 2 : 1;
    const sub = c.typeLine?.split("—")[1] ?? "";
    const basics = BASICS.filter(([, land]) => new RegExp(`\\b${land}\\b`, "i").test(sub));
    if (/\bland\b/i.test(c.typeLine ?? c.types.join(" ")) && basics.length) {
      for (const [color] of basics) add(color, weight);
      continue;
    }
    for (const color of new Set((c.color ?? "").toUpperCase().replace(/[^WUBRG]/g, ""))) add(color, weight);
  }
  let best: string | null = null;
  let most = 0;
  for (const [color, land] of BASICS) {
    const n = count.get(color) ?? 0;
    if (n > most) {
      best = land;
      most = n;
    }
  }
  return best;
}
