// What each keyword does, for the boxes beside an enlarged card (as Arena shows them). The texts
// follow the cards' reminder text.

import type { CardView } from "../../game/GameState";

const GLOSSARY: Record<string, string> = {
  "Flying": "Can't be blocked except by creatures with flying or reach.",
  "Reach": "Can block creatures with flying.",
  "First strike": "Deals combat damage before creatures without first strike.",
  "Double strike": "Deals both first-strike and regular combat damage.",
  "Deathtouch": "Any amount of damage it deals to a creature is enough to destroy it.",
  "Lifelink": "Damage dealt by this also causes its controller to gain that much life.",
  "Trample": "Can deal excess combat damage to the player or planeswalker it's attacking.",
  "Vigilance": "Attacking doesn't cause this creature to tap.",
  "Haste": "Can attack and {T} as soon as it comes under your control.",
  "Menace": "Can't be blocked except by two or more creatures.",
  "Defender": "Can't attack.",
  "Hexproof": "Can't be the target of spells or abilities your opponents control.",
  "Shroud": "Can't be the target of spells or abilities.",
  "Indestructible": "Damage and effects that say \"destroy\" don't destroy it.",
  "Flash": "You may cast it any time you could cast an instant.",
  "Ward": "Whenever it becomes the target of a spell or ability an opponent controls, counter it unless that player pays the ward cost.",
  "Protection": "Can't be blocked, targeted, dealt damage, enchanted or equipped by anything with that quality.",
  "Intimidate": "Can't be blocked except by artifact creatures and creatures that share a color with it.",
  "Fear": "Can't be blocked except by artifact creatures and black creatures.",
  "Skulk": "Can't be blocked by creatures with greater power.",
  "Shadow": "Can block or be blocked only by creatures with shadow.",
  "Horsemanship": "Can't be blocked except by creatures with horsemanship.",
  "Landwalk": "Can't be blocked as long as defending player controls a land of that type.",
  "Prowess": "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.",
  "Infect": "Deals damage to creatures as -1/-1 counters and to players as poison counters.",
  "Wither": "Deals damage to creatures in the form of -1/-1 counters.",
  "Toxic": "Players dealt combat damage by this also get that many poison counters.",
  "Annihilator": "Whenever this creature attacks, defending player sacrifices that many permanents.",
  "Persist": "When it dies, if it had no -1/-1 counters on it, return it with a -1/-1 counter on it.",
  "Undying": "When it dies, if it had no +1/+1 counters on it, return it with a +1/+1 counter on it.",
  "Exalted": "Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.",
  "Flanking": "Whenever a creature without flanking blocks this creature, the blocker gets -1/-1 until end of turn.",
  "Changeling": "This card is every creature type.",
  "Devoid": "This card has no color.",
  "Convoke": "Your creatures can help cast this spell. Each creature you tap pays for {1} or one mana of its color.",
  "Delve": "Each card you exile from your graveyard while casting this spell pays for {1}.",
  "Affinity": "This spell costs {1} less to cast for each of the named permanents you control.",
  "Improvise": "Your artifacts can help cast this spell. Each artifact you tap pays for {1}.",
  "Cascade": "When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost.",
  "Storm": "When you cast this spell, copy it for each spell cast before it this turn.",
  "Kicker": "You may pay an additional cost as you cast this spell for an extra effect.",
  "Multikicker": "You may pay the kicker cost any number of times as you cast this spell.",
  "Flashback": "You may cast this card from your graveyard for its flashback cost. Then exile it.",
  "Escape": "You may cast this card from your graveyard for its escape cost.",
  "Jump-start": "You may cast this card from your graveyard by discarding a card in addition to paying its other costs. Then exile it.",
  "Retrace": "You may cast this card from your graveyard by discarding a land card in addition to paying its other costs.",
  "Unearth": "Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.",
  "Embalm": "Exile this card from your graveyard: create a token copy of it, except it's a white Zombie. Only as a sorcery.",
  "Eternalize": "Exile this card from your graveyard: create a 4/4 black Zombie token copy of it. Only as a sorcery.",
  "Encore": "Exile this card from your graveyard: for each opponent, create a token copy that attacks that opponent this turn if able. Sacrifice them at the beginning of the next end step.",
  "Disturb": "You may cast this card transformed from your graveyard for its disturb cost.",
  "Madness": "If you discard this card, you may cast it for its madness cost instead of putting it into your graveyard.",
  "Cycling": "Pay the cycling cost and discard this card: draw a card.",
  "Evoke": "You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.",
  "Dash": "You may cast this spell for its dash cost. If you do, it gains haste, and it's returned to its owner's hand at the beginning of the next end step.",
  "Blitz": "You may cast this spell for its blitz cost. If you do, it gains haste and \"When this creature dies, draw a card.\" Sacrifice it at the beginning of the next end step.",
  "Emerge": "You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.",
  "Evolve": "Whenever a creature with greater power or toughness enters under your control, put a +1/+1 counter on this creature.",
  "Ninjutsu": "Return an unblocked attacker you control to hand: put this card onto the battlefield from your hand tapped and attacking.",
  "Morph": "You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.",
  "Disguise": "You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.",
  "Suspend": "Rather than cast this card from your hand, pay its suspend cost and exile it with time counters. Remove one at the beginning of your upkeep. When the last is removed, cast it without paying its mana cost.",
  "Equip": "Attach to target creature you control. Equip only as a sorcery.",
  "Reconfigure": "Attach to target creature you control, or unattach from a creature. Reconfigure only as a sorcery. While attached, it isn't a creature.",
  "Crew": "Tap any number of untapped creatures you control with total power at least this number: this Vehicle becomes an artifact creature until end of turn.",
  "Enchant": "This Aura can be attached only to that kind of object or player.",
  "Bestow": "If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.",
  "Mutate": "If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.",
  "Partner": "You can have two commanders if both have partner.",
  "Companion": "If this creature card is in your sideboard and you meet its condition, you may put it into your hand once per game for {3}.",
  "Mentor": "Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.",
  "Afflict": "Whenever this creature becomes blocked, defending player loses that much life.",
  "Battle cry": "Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.",
  "Bushido": "Whenever this creature blocks or becomes blocked, it gets +N/+N until end of turn.",
  "Rampage": "Whenever this creature becomes blocked, it gets +N/+N until end of turn for each creature blocking it beyond the first.",
  "Training": "Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.",
  "Riot": "This creature enters with your choice of a +1/+1 counter or haste.",
  "Modular": "Enters with +1/+1 counters. When it dies, you may put its +1/+1 counters on target artifact creature.",
  "Fabricate": "When this permanent enters, put that many +1/+1 counters on it or create that many 1/1 colorless Servo artifact creature tokens.",
  "Afterlife": "When this creature dies, create that many 1/1 white and black Spirit creature tokens with flying.",
  "Decayed": "Can't block. When it attacks, sacrifice it at end of combat.",
  "Living weapon": "When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this to it.",
  "Split second": "As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.",
  "Rebound": "If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast it from exile without paying its mana cost.",
  "Buyback": "You may pay an additional cost as you cast this spell. If you do, put it into your hand as it resolves.",
  "Overload": "You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\"",
  "Spectacle": "You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.",
  "Surge": "You may cast this spell for its surge cost if you or a teammate has cast another spell this turn.",
  "Prowl": "You may cast this for its prowl cost if you dealt combat damage to a player this turn with a creature of a shared type.",
  "Casualty": "As you cast this spell, you may sacrifice a creature with that much power or greater. When you do, copy this spell.",
  "Exploit": "When this creature enters, you may sacrifice a creature.",
  "Ascend": "If you control ten or more permanents, you get the city's blessing for the rest of the game.",
  "Hideaway": "When this enters, look at the top cards of your library equal to the number, exile one face down, then put the rest on the bottom in a random order.",
  "Totem armor": "If enchanted permanent would be destroyed, instead remove all damage from it and destroy this Aura.",
  "Umbra armor": "If enchanted permanent would be destroyed, instead remove all damage from it and destroy this Aura.",
  "Read ahead": "As this Saga enters, choose a chapter and start with that many lore counters.",
  "Backup": "When this creature enters, put that many +1/+1 counters on target creature. If that's another creature, it gains this creature's other abilities until end of turn.",
  "Bargain": "You may sacrifice an artifact, enchantment or token as you cast this spell.",
  "Craft": "Exile this permanent and the listed materials from among permanents you control and/or cards in your graveyard: return it transformed. Craft only as a sorcery.",
  "Offspring": "You may pay an additional cost as you cast this spell. If you do, when it enters, create a 1/1 token copy of it.",
  "Plot": "You may pay the plot cost and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost.",
  "Saddle": "Tap any number of other untapped creatures you control with total power at least this number: this Mount becomes saddled until end of turn. Saddle only as a sorcery.",
  "Station": "Tap another untapped creature you control: put charge counters equal to its power on this Spacecraft. Station only as a sorcery.",
  // Keyword actions Arena explains too.
  "Scry": "Look at that many cards from the top of your library, then put any number of them on the bottom and the rest on top in any order.",
  "Surveil": "Look at that many cards from the top of your library, then put any number of them into your graveyard and the rest on top in any order.",
  "Mill": "Put that many cards from the top of your library into your graveyard.",
  "Explore": "Reveal the top card of your library. Put it into your hand if it's a land. Otherwise, put a +1/+1 counter on this creature, then put the card back or into your graveyard.",
  "Investigate": "Create a Clue token. It's an artifact with \"{2}, Sacrifice this artifact: Draw a card.\"",
  "Proliferate": "Choose any number of permanents and/or players, then give each another counter of each kind already there.",
  "Connive": "Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature.",
  "Amass": "Put that many +1/+1 counters on an Army you control. If you don't control one, create a 0/0 Army creature token first.",
  "Learn": "You may reveal a Lesson card you own from outside the game and put it into your hand, or discard a card to draw a card.",
  "Manifest": "Put the top card of your library onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.",
  "Manifest dread": "Look at the top two cards of your library. Manifest one of them and put the other into your graveyard.",
  "Discover": "Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand.",
  "Incubate": "Create an Incubator token with that many +1/+1 counters. It has \"{2}: Transform this artifact.\" It transforms into a 0/0 Phyrexian artifact creature.",
  "Fateseal": "Look at that many cards from the top of an opponent's library, then put any number of them on the bottom and the rest on top in any order.",
  "Goad": "Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.",
  "Populate": "Create a token that's a copy of a creature token you control.",
  "Adapt": "If this creature has no +1/+1 counters on it, put that many +1/+1 counters on it.",
  "Monstrosity": "If this creature isn't monstrous, put that many +1/+1 counters on it and it becomes monstrous.",
  "Venture into the dungeon": "Enter the first room of a dungeon or advance to the next room.",
  "Time travel": "For each suspended card you own and each permanent you control with a time counter on it, you may add or remove a time counter.",
};

const NAMES = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
// Longest names first, so "Double strike" wins over "Strike", "Manifest dread" over "Manifest".
const PATTERN = new RegExp(`\\b(${NAMES.map((n) => n.replace(/[-]/g, "\\-")).join("|")})\\b`, "gi");
const BY_LOWER = new Map(NAMES.map((n) => [n.toLowerCase(), n]));
// Landwalk is written by land type ("Islandwalk", "Swampwalk", "Nonbasic landwalk").
const LANDWALK = /\b(?:plains|island|swamp|mountain|forest|desert|nonbasic land|legendary land)walk\b/i;

export interface KeywordNote {
  name: string;
  text: string;
}

/** The keywords on a card (printed, mentioned, or given by an effect), in the order they show up,
    each once, with what it does. */
export function keywordNotes(c: Pick<CardView, "oracleText" | "keywordsGranted">): KeywordNote[] {
  const found: string[] = [];
  const add = (name: string | undefined) => {
    if (name && !found.includes(name)) found.push(name);
  };
  // Reminder text in parentheses repeats the keyword's rules: it's not read.
  const text = (c.oracleText ?? "").replace(/\([^)]*\)/g, "");
  for (const m of text.matchAll(PATTERN)) add(BY_LOWER.get(m[1]!.toLowerCase()));
  if (LANDWALK.test(text)) add("Landwalk");
  for (const k of c.keywordsGranted ?? []) {
    const m = new RegExp(`^(?:${PATTERN.source})`, "i").exec(k.trim());
    add(m ? BY_LOWER.get(m[1]!.toLowerCase()) : LANDWALK.test(k) ? "Landwalk" : undefined);
  }
  return found.map((name) => ({ name, text: GLOSSARY[name]! }));
}
