import { test } from "node:test";
import assert from "node:assert/strict";
import { bestLine, chosenModes, frameColor, loyaltyCost, loyaltyLines, loyaltyNeeded, modeLines, withoutCost } from "../src/ui/board/abilityText";
import { printedKeywords } from "../src/ui/board/keywords";
import { hasKeywordIcon, keywordIconsHtml } from "../src/ui/board/keywordIcons";
import { deckLand } from "../src/ui/board/tableArt";
import { normalize } from "../src/game/endstep/normalize";
import type { CardView, PlayerView } from "../src/game/GameState";

test("printed keywords: only the keyword lines, with their costs and qualities", () => {
  assert.deepEqual(printedKeywords("Flying, vigilance"), ["Flying", "Vigilance"]);
  assert.deepEqual(printedKeywords("Flying\nDeathtouch\nLifelink"), ["Flying", "Deathtouch", "Lifelink"]);
  assert.deepEqual(printedKeywords("Ward {2}\nProtection from red\nToxic 2"), ["Ward", "Protection", "Toxic"]);
  assert.deepEqual(printedKeywords("Ward—Pay 2 life."), ["Ward"]);
  assert.deepEqual(printedKeywords("Swampwalk\nCycling {2}"), ["Landwalk", "Cycling"]);
  // A keyword its text only mentions, or gives to others, isn't printed on it.
  assert.deepEqual(printedKeywords("Flying creatures you control get +1/+1."), []);
  assert.deepEqual(printedKeywords("Haste\nWhenever Goblin Guide attacks, defending player reveals the top card of their library."), ["Haste"]);
  assert.deepEqual(printedKeywords("Target creature gains flying until end of turn."), []);
  // Reminder text doesn't count.
  assert.deepEqual(printedKeywords("Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"), ["Trample"]);
  assert.deepEqual(printedKeywords(undefined), []);
});

test("keyword icons: one per keyword that has one, named on hover", () => {
  assert.equal(hasKeywordIcon("Flying"), true);
  assert.equal(hasKeywordIcon("Double strike"), true);
  assert.equal(hasKeywordIcon("Cycling"), false);
  const html = keywordIconsHtml(["Flying", "Cycling", "Deathtouch"]);
  assert.equal(html.match(/class="ki"/g)?.length, 2);
  assert.match(html, /title="Flying"/);
  assert.match(html, /title="Deathtouch"/);
});

test("loyalty costs, as printed or as Endstep words them", () => {
  assert.equal(loyaltyCost("+1: Untap two target lands."), "+1");
  assert.equal(loyaltyCost("−4: Creatures you control get +3/+3."), "-4");
  assert.equal(loyaltyCost("0: Draw three cards."), "0");
  assert.equal(loyaltyCost("−X: Destroy each creature with mana value X."), "-X");
  assert.equal(loyaltyCost("[+2]: Look at the top card."), "+2");
  assert.equal(loyaltyCost("{T}: Add {G}."), null);
  assert.equal(withoutCost("+1: Untap two target lands."), "Untap two target lands.");
  assert.equal(loyaltyNeeded("-4"), 4);
  assert.equal(loyaltyNeeded("+1"), 0);
  assert.equal(loyaltyNeeded("-X"), 0);
});

test("a loyalty ability on the stack is matched to its planeswalker's line", () => {
  const jace = loyaltyLines("+2: Look at the top card of target player's library. You may put that card on the bottom of that player's library.\n"
    + "0: Draw three cards, then put two cards from your hand on top of your library in any order.\n"
    + "−1: Return target creature to its owner's hand.\n−12: Exile all cards from target player's library, then that player shuffles their hand into their library.");
  assert.deepEqual(jace.map((l) => l.cost), ["+2", "0", "-1", "-12"]);
  assert.equal(bestLine(jace, "Opponent draws three cards, then puts two cards from their hand on top of their library in any order.")?.cost, "0");
  assert.equal(bestLine(jace, "Return Serra Angel to its owner's hand.")?.cost, "-1");
  assert.equal(bestLine(jace, "Flavio gains 3 life."), null);
});

test("modal spells: their modes, and which were chosen", () => {
  const text = "Choose two —\n• Return target creature card from your graveyard to your hand.\n• Target player discards a card.\n• Destroy target artifact.\n"
    + "• Kolaghan's Command deals 2 damage to any target.";
  const m = modeLines(text)!;
  assert.equal(m.head, "Choose two —");
  assert.equal(m.modes.length, 4);
  assert.equal(modeLines("Draw two cards."), null);
  // From Endstep's description of the spell on the stack (it spells out only what's chosen).
  const name = "Kolaghan's Command";
  assert.deepEqual(chosenModes(m.modes, "Kolaghan's Command (940) - Flavio discards a card. Kolaghan's Command deals 2 damage to Serra Angel (120).", undefined, name), [1, 3]);
  assert.deepEqual(chosenModes(m.modes, "Kolaghan's Command (940) - Destroy Sol Ring (110). Kolaghan's Command deals 2 damage to Opponent.", undefined, name), [2, 3]);
  assert.deepEqual(chosenModes(m.modes, "Kolaghan's Command (940) - Return Grizzly Bears (101) from Flavio's graveyard to Flavio's hand. Opponent discards a card.", undefined, name), [0, 1]);
  // From the modes you picked casting it.
  assert.deepEqual(chosenModes(m.modes, undefined, ["Target player discards a card.", "Destroy target artifact."]), [1, 2]);
  // Nothing to tell by (no description, or only the spell's name): nothing is dimmed.
  assert.equal(chosenModes(m.modes, undefined, undefined, name), null);
  assert.equal(chosenModes(m.modes, "Kolaghan's Command", undefined, name), null);
});

test("frame colors: one color its own, several gold, none grey", () => {
  assert.equal(frameColor("R"), "#d4553a");
  assert.equal(frameColor("WU"), "#d9b45a");
  assert.equal(frameColor("C"), "#a39d93");
  assert.equal(frameColor(undefined), "#a39d93");
});

const card = (name: string, extra: Partial<CardView> = {}): CardView => ({
  id: name, name, tapped: false, summoningSick: false, faceDown: false, isToken: false, isCommander: false, counters: {}, attachmentIds: [],
  isAttacking: false, isBlocking: false, blockingIds: [], types: [], ...extra,
});
const player = (extra: Partial<PlayerView>): PlayerView => ({
  id: "0", seat: 0, name: "Me", isViewer: true, poison: 0, energy: 0, hand: [], battlefield: [], graveyard: [], exile: [], commandZone: [],
  effects: [], libraryTop: [], hasMonarch: false, hasInitiative: false, hasLost: false, hasConceded: false,
  experience: 0, rad: 0, ringTempts: 0, citysBlessing: false, enduringStory: false, ...extra,
});

test("the table's land: the deck's main color, from its lands and cards", () => {
  assert.equal(deckLand(player({ battlefield: [card("Mountain", { typeLine: "Basic Land — Mountain", color: "C" }), card("Mountain 2", { typeLine: "Basic Land — Mountain" })] })), "Mountain");
  assert.equal(deckLand(player({ hand: [card("Counterspell", { color: "U" }), card("Brainstorm", { color: "U" }), card("Bolt", { color: "R" })] })), "Island");
  // A dual land counts for both its types; a commander counts double.
  assert.equal(deckLand(player({
    battlefield: [card("Overgrown Tomb", { typeLine: "Land — Swamp Forest" })],
    commandZone: [card("Golgari Commander", { color: "B", isCommander: true })],
  })), "Swamp");
  assert.equal(deckLand(player({ hand: [card("Sol Ring", { color: "C" })] })), null);
  assert.equal(deckLand(null), null);
});

test("stack items keep a spell's description and an ability's printed text", () => {
  const s = normalize({
    players: [{ name: "Me" }],
    stack: [
      { stackTargetId: 1, isAbility: false, abilityDescription: "Kolaghan's Command (9) - Me discards a card.", sourceCard: { id: 9, name: "Kolaghan's Command" } },
      { stackTargetId: 2, isAbility: true, abilityDescription: "Arid Mesa (10) - Me searches their library.", yieldKey: "Arid Mesa (10): {T}, Pay 1 life, Sacrifice Arid Mesa: Search your library.", sourceCard: { id: 10, name: "Arid Mesa" } },
      { stackTargetId: 3, isAbility: false, chosenModes: [0, 2], sourceCard: { id: 11, name: "Abzan Charm" } },
    ],
  }, { matchId: "m", viewerSeat: 0, seq: 1, desynced: false });
  assert.equal(s.stack[0]!.description, "Kolaghan's Command (9) - Me discards a card.");
  assert.equal(s.stack[0]!.abilityText, undefined);
  assert.equal(s.stack[1]!.abilityText, "{T}, Pay 1 life, Sacrifice Arid Mesa: Search your library.");
  assert.equal(s.stack[1]!.description, undefined);
  assert.deepEqual(s.stack[2]!.modes, [0, 2]);
  assert.equal("modes" in s.stack[0]!, false);
});
