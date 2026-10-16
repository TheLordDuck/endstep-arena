// The deck the player registered for a match, as Endstep's "Show decklist" shows it: its match
// endpoint (GET /api/matches/:id, signed in by the session cookie) gives myDeck, mySideboard
// and myCommanders (a card name per copy) and myDeckArt (each card's printing, by lowercased
// name); its card endpoint (POST /api/cards/batch { names }) gives each card's cost and type,
// to lay the deck out by mana value. Seen in main-*.js, scryfall-*.js and DecklistModal-*.js,
// 2026-10-16.

export interface DeckCard {
  name: string;
  count: number;
  setCode?: string;
  collectorNumber?: string;
  manaCost?: string;
  typeLine?: string;
  oracleText?: string;
}

export interface Decklist {
  main: DeckCard[];
  sideboard: DeckCard[];
  commanders: DeckCard[];
}

/** A card's cost, type and text, by lowercased name. */
export type CardDetails = Record<string, { manaCost?: string; typeLine?: string; oracleText?: string }>;

type Art = Record<string, { setCode?: unknown; collectorNumber?: unknown }>;

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const obj = (v: unknown) => (typeof v === "object" && v !== null ? v as Record<string, unknown> : undefined);

/** A card name per copy → one entry per name with its count, sorted by name. */
function group(names: unknown, art: Art, details: CardDetails): DeckCard[] {
  const byName = new Map<string, DeckCard>();
  for (const n of Array.isArray(names) ? names : []) {
    if (typeof n !== "string" || !n) continue;
    const had = byName.get(n);
    if (had) { had.count++; continue; }
    const printing = art[n.toLowerCase()];
    byName.set(n, { name: n, count: 1, setCode: str(printing?.setCode), collectorNumber: str(printing?.collectorNumber), ...details[n.toLowerCase()] });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Endstep's match info → the player's deck, or null when it has none (spectating…). */
export function parseDecklist(info: unknown, details: CardDetails = {}): Decklist | null {
  const v = obj(info);
  if (!v) return null;
  const art = (obj(v.myDeckArt) ?? {}) as Art;
  const deck = { main: group(v.myDeck, art, details), sideboard: group(v.mySideboard, art, details), commanders: group(v.myCommanders, art, details) };
  return deck.main.length || deck.commanders.length ? deck : null;
}

/** Endstep's card batch ({ cards: [{ name, card }] }) → each card's cost, type and text. */
export function parseCardDetails(batch: unknown): CardDetails {
  const out: CardDetails = {};
  const cards = obj(batch)?.cards;
  for (const entry of Array.isArray(cards) ? cards : []) {
    const e = obj(entry);
    const card = obj(e?.card) ?? e;
    const name = str(e?.name) ?? str(card?.name);
    if (!name || !card) continue;
    out[name.toLowerCase()] = { manaCost: str(card.manaCost), typeLine: str(card.typeLine), oracleText: str(card.oracleText) };
  }
  return out;
}

const api = (path: string) => new URL(`/api${path}`, location.origin);

/** Fetches the player's deck for a match, with each card's cost and type when Endstep gives
    them; null if it doesn't give the deck. */
export async function fetchDecklist(matchId: string): Promise<Decklist | null> {
  try {
    const res = await fetch(api(`/matches/${encodeURIComponent(matchId)}`), { credentials: "include" });
    if (!res.ok) return null;
    const info = await res.json() as unknown;
    const deck = parseDecklist(info);
    if (!deck) return null;
    const names = [...new Set([...deck.commanders, ...deck.main, ...deck.sideboard].map((c) => c.name))];
    try {
      const batch = await fetch(api("/cards/batch"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      // Without the details the deck still shows, in one column.
      return batch.ok ? parseDecklist(info, parseCardDetails(await batch.json())) : deck;
    } catch {
      return deck;
    }
  } catch {
    return null;
  }
}
