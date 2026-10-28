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
  card_faces?: { name?: string; image_uris?: unknown }[];
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
/** A double-faced card's face names, front then back, by the name it was asked by. */
const faceNames = new Map<string, [string, string]>();

function scryfallCard(name: string): Promise<ScryfallCard | null> {
  let found = cache.get(name);
  if (!found) {
    found = fetch(`${API}/cards/named?exact=${encodeURIComponent(name)}`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((card: ScryfallCard | null) => {
        const two = !!card && hasTwoPictures(card);
        twoFaced.set(name, two);
        const [front, back] = card?.card_faces ?? [];
        if (two && front?.name && back?.name) faceNames.set(name, [front.name, back.name]);
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

/** The other face of a double-faced card, once isDoubleFaced has answered: its name, and whether
    it's the back. Endstep names a transformed card by the face it shows, so the face shown is the
    back when it says so or when its name is the back's. */
export function otherFace(name: string, backFace: boolean): { name: string; backFace: boolean } | undefined {
  const faces = faceNames.get(name);
  if (!faces) return undefined;
  const showingBack = backFace || name === faces[1];
  return { name: faces[showingBack ? 0 : 1], backFace: !showingBack };
}
