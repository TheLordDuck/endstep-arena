// What Endstep doesn't send about a card, from Scryfall: the tokens it creates (for the "Creates
// Token" box beside an enlarged card, as Arena shows it, from its related cards `all_parts`) and
// whether it has a second face to show beside it. Asked once per card name and kept for the
// session. Only the card's name is sent.

export interface RelatedToken {
  name: string;
  typeLine: string;
  /** The token's image (Scryfall redirects this to its picture). */
  image: string;
}

interface ScryfallCard {
  name?: string;
  all_parts?: { component?: string; name?: string; type_line?: string; id?: string }[];
  card_faces?: { image_uris?: unknown }[];
}

const API = "https://api.scryfall.com";
/** Arena shows a few at most; more would cover the table. */
const MAX_TOKENS = 3;

/** Whether a card's text makes tokens at all (only those are looked up). */
export function createsTokens(oracleText: string | undefined): boolean {
  return !!oracleText && /\bcreates?\b[^.]*\btokens?\b/i.test(oracleText);
}

/** The tokens among a Scryfall card's related cards (not the card itself, if it is one). */
export function tokensFromCard(card: ScryfallCard): RelatedToken[] {
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

/** A card printed with a picture on each side (transform, modal double-faced…). Split cards and
    adventures have faces too, but on one picture. */
export function hasTwoPictures(card: ScryfallCard): boolean {
  const faces = card.card_faces ?? [];
  return faces.length >= 2 && faces.every((f) => !!f.image_uris);
}

const cache = new Map<string, Promise<ScryfallCard | null>>();
const twoFaced = new Map<string, boolean>();

function scryfallCard(name: string): Promise<ScryfallCard | null> {
  let found = cache.get(name);
  if (!found) {
    found = fetch(`${API}/cards/named?exact=${encodeURIComponent(name)}`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((card: ScryfallCard | null) => {
        twoFaced.set(name, !!card && hasTwoPictures(card));
        return card;
      })
      // Not reachable now: asked again next time.
      .catch(() => { cache.delete(name); return null; });
    cache.set(name, found);
  }
  return found;
}

/** The tokens a card creates (empty when it creates none, or Scryfall can't be reached). */
export async function relatedTokens(name: string): Promise<RelatedToken[]> {
  const card = await scryfallCard(name);
  return card ? tokensFromCard(card) : [];
}

/** Whether a card has a second face to show (false when Scryfall can't be reached). */
export async function isDoubleFaced(name: string): Promise<boolean> {
  await scryfallCard(name);
  return twoFaced.get(name) ?? false;
}

/** The answer of isDoubleFaced when it's already known, without waiting. */
export function knownDoubleFaced(name: string): boolean | undefined {
  return twoFaced.get(name);
}
