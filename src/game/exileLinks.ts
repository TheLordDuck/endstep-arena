// Cards exiled "until this leaves the battlefield" (Portable Hole, Oblivion Ring, Fiend Hunter,
// Banisher Priest…) belong under the permanent that holds them, as in Arena. Endstep doesn't say
// which card exiled what, so the link is inferred from what happened between two states: a card
// that lands in exile while such a permanent's spell or ability resolves (or while it enters the
// battlefield) is held by it. Links last until either card leaves its zone, and are kept per match
// in a store (the tab's sessionStorage) so a page reload doesn't lose them.

import type { CardView, GameState } from "./GameState";

/** Text of a permanent that keeps what it exiles (until it leaves, or "exiled with" it). */
const HOLDS_EXILE = /\bexile/i;
const UNTIL_LEAVES = /until [^.]*leaves the battlefield|exiled with|exiled card/i;

export function holdsExiledCards(c: Pick<CardView, "oracleText"> | undefined): boolean {
  const text = c?.oracleText ?? "";
  return HOLDS_EXILE.test(text) && UNTIL_LEAVES.test(text);
}

/** Where links outlive the page (sessionStorage in the browser). */
export interface LinkStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORE_KEY = "endstep-arena:exile-links:";

export class ExileLinks {
  /** Exiled card id → id of the permanent holding it. */
  private links = new Map<string, string>();
  /** The match the links belong to. */
  private matchId: string | null = null;
  private saved = "";

  constructor(private readonly store?: LinkStore) {}

  /** Updates the links for a new state and returns them. */
  update(prev: GameState | null, next: GameState): ReadonlyMap<string, string> {
    if (next.matchId !== this.matchId) this.load(next.matchId);
    this.infer(prev, next);
    this.save();
    return this.links;
  }

  private load(matchId: string): void {
    this.matchId = matchId;
    this.links.clear();
    try {
      const raw = this.store?.getItem(STORE_KEY + matchId);
      if (raw) for (const [card, host] of JSON.parse(raw) as [string, string][]) this.links.set(card, host);
    } catch {
      // Nothing saved (or unreadable): links are inferred from here on.
    }
    this.saved = JSON.stringify([...this.links]);
  }

  private save(): void {
    const json = JSON.stringify([...this.links]);
    if (json === this.saved || !this.matchId) return;
    this.saved = json;
    try {
      this.store?.setItem(STORE_KEY + this.matchId, json);
    } catch {
      // Storage full or blocked: the links still hold until the page reloads.
    }
  }

  private infer(prev: GameState | null, next: GameState): void {
    const battlefield = new Map(next.players.flatMap((p) => p.battlefield.map((c) => [c.id, c] as const)));
    const exiled = new Set(next.players.flatMap((p) => p.exile.map((c) => c.id)));
    for (const [card, host] of this.links) if (!battlefield.has(host) || !exiled.has(card)) this.links.delete(card);
    if (!prev || prev.matchId !== next.matchId) return;

    const wasExiled = new Set(prev.players.flatMap((p) => p.exile.map((c) => c.id)));
    const fresh = [...exiled].filter((id) => !wasExiled.has(id) && !this.links.has(id));
    if (!fresh.length) return;

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
  }
}
