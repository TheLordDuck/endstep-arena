// What an opponent can play from outside their hand (their graveyard, exile and command zone),
// shown by their hand as yours is beside your own. Endstep lists the playable cards only to the
// player who must decide, so for an opponent it's read from the cards themselves: the keyword
// abilities that let a card be cast or used from there, and their commander.
import type { CardView, PlayerView } from "../../game/GameState";

export interface OffHandCard {
  card: CardView;
  /** What lets them play it ("Flashback", "Adventure", "Commander"…). */
  how: string;
}

/** Keyword abilities, each at the start of a line of the card's text, as Oracle text has them
    (so a card that only mentions one, like Snapcaster Mage, doesn't count). */
const keyword = (name: string) => new RegExp(`^${name}\\b`, "im");

const FROM_GRAVEYARD: [RegExp, string][] = [
  [keyword("flashback"), "Flashback"],
  [/^escape\s*[—-]/im, "Escape"],
  [keyword("jump-start"), "Jump-start"],
  [keyword("retrace"), "Retrace"],
  [keyword("aftermath"), "Aftermath"],
  [keyword("disturb"), "Disturb"],
  [keyword("harmonize"), "Harmonize"],
  [keyword("unearth"), "Unearth"],
  [keyword("embalm"), "Embalm"],
  [keyword("eternalize"), "Eternalize"],
  [keyword("encore"), "Encore"],
  [/\byou may (?:cast|play) this card from your graveyard\b/i, "Graveyard"],
];

const FROM_EXILE: [RegExp, string][] = [
  [keyword("foretell"), "Foretell"],
  [keyword("plot"), "Plot"],
  [keyword("warp"), "Warp"],
  [/\bAdventure\b/, "Adventure"],
];

const how = (c: CardView, rules: [RegExp, string][]) => {
  if (c.faceDown && !c.peeked) return undefined;
  const text = `${c.typeLine ?? ""}\n${c.oracleText ?? ""}`;
  return rules.find(([re]) => re.test(text))?.[1];
};

/** The cards `p` can play from outside their hand, by zone: command zone, graveyard, exile. */
export function offHandCards(p: PlayerView | null | undefined): OffHandCard[] {
  if (!p) return [];
  const out: OffHandCard[] = [];
  for (const card of p.commandZone) if (card.isCommander) out.push({ card, how: "Commander" });
  for (const [zone, rules] of [[p.graveyard, FROM_GRAVEYARD], [p.exile, FROM_EXILE]] as const) {
    for (const card of zone) {
      const h = how(card, rules);
      if (h) out.push({ card, how: h });
    }
  }
  return out;
}
