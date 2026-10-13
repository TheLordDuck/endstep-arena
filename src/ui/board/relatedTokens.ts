// The tokens a card creates, for the "Creates Token" box beside an enlarged card (as Arena shows
// it). Endstep doesn't send them, so they come from Scryfall's related cards (`all_parts`),
// asked once per card name and kept for the session. Only the card's name is sent.

export interface RelatedToken {
  name: string;
  typeLine: string;
  /** The token's image (Scryfall redirects this to its picture). */
  image: string;
}

const API = "https://api.scryfall.com";
/** Arena shows a few at most; more would cover the table. */
const MAX_TOKENS = 3;

/** Whether a card's text makes tokens at all (only those are looked up). */
export function createsTokens(oracleText: string | undefined): boolean {
  return !!oracleText && /\bcreates?\b[^.]*\btokens?\b/i.test(oracleText);
}

/** The tokens among a Scryfall card's related cards (not the card itself, if it is one). */
export function tokensFromCard(card: { name?: string; all_parts?: { component?: string; name?: string; type_line?: string; id?: string }[] }): RelatedToken[] {
  const seen = new Set<string>();
  const out: RelatedToken[] = [];
  for (const part of card.all_parts ?? []) {
    if (part.component !== "token" || !part.id || !part.name || part.name === card.name) continue;
    const key = `${part.name}|${part.type_line ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: part.name, typeLine: part.type_line ?? "Token", image: `${API}/cards/${encodeURIComponent(part.id)}?format=image&version=normal` });
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}

const cache = new Map<string, Promise<RelatedToken[]>>();

/** The tokens a card creates (empty when it creates none, or Scryfall can't be reached). */
export function relatedTokens(name: string): Promise<RelatedToken[]> {
  let found = cache.get(name);
  if (!found) {
    found = fetch(`${API}/cards/named?exact=${encodeURIComponent(name)}`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((card) => (card ? tokensFromCard(card) : []))
      // Not reachable now: asked again next time.
      .catch(() => { cache.delete(name); return []; });
    cache.set(name, found);
  }
  return found;
}
