// Choosing a pile (CHOOSE_PILE) and sideboarding (CHOOSE_CARDS, contextType "sideboard"), with the
// shapes Endstep's pile picker and sideboard view read (see docs/ENDSTEP_ANALYSIS.md §8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, type Raw } from "../src/game/endstep/normalize";
import { GameController } from "../src/game/GameController";
import type { GameState } from "../src/game/GameState";
import { ALLOWED_ACTIONS, type WireAction } from "../src/shared/protocol";
import { deckColumns, deriveMode, manaValue, sideboardChanged, sideboardCheck, sideboardMove, sideboardStacks, sideboardStart } from "../src/ui/board/modes";

function state(pendingAction: Raw, extra: Raw = {}): GameState {
  const player = { battlefield: [], graveyard: [], exile: [], commandZone: [] };
  return normalize({ players: [player, player], stack: [], pendingAction, ...extra }, { matchId: "m", viewerSeat: 0, desynced: false, serverSkew: 0 });
}

const sent = (s: GameState) => {
  const out: WireAction[] = [];
  return { controller: new GameController(() => s, (_m, a) => out.push(a)), out };
};

// ---------------------------------------------------------------- piles

const fof = {
  type: "CHOOSE_PILE", promptVersion: 4, sourceCardName: "Fact or Fiction",
  piles: [
    { id: "A", label: "Pile 1", size: 2, cards: [{ id: 1, name: "Counterspell" }, { id: 2, name: "Opt" }] },
    { id: "B", label: "Pile 2", size: 3, cards: [{ id: 3, name: "Island" }] },
  ],
};

test("piles keep their id, label and size; cards not listed are face down", () => {
  const p = state(fof).pending!;
  assert.deepEqual(p.piles?.map((pl) => [pl.id, pl.label, pl.size, pl.cards.map((c) => c.name)]),
    [["A", "Pile 1", 2, ["Counterspell", "Opt"]], ["B", "Pile 2", 3, ["Island"]]]);
  assert.deepEqual(deriveMode(state(fof)), { kind: "piles", selected: null });
});

test("taking a pile sends its id, as Endstep does", () => {
  const s = state(fof);
  const { controller, out } = sent(s);
  controller.chooseString("CHOOSE_PILE", "B");
  assert.deepEqual(out, [{ type: "CHOOSE_PILE", stringValue: "B", promptVersion: 4 }]);
});

test("a pile prompt without piles still gets its buttons", () => {
  assert.equal(deriveMode(state({ type: "CHOOSE_PILE", stringOptions: ["Pile 1", "Pile 2"] })).kind, "choice");
});

const split = (extra: Raw = {}) => ({
  type: "CHOOSE_CARDS", promptVersion: 6, sourceCardName: "Fact or Fiction", message: "Divide cards into two piles", min: 0, max: 5,
  cardOptions: ["Bolt", "Opt", "Island", "Snapcaster Mage", "Brainstorm"].map((name, i) => ({ id: 30 + i, name, zone: "LIBRARY" })),
  ...extra,
});

test("separating cards into piles is shown as two piles; pile 1's cards are the answer", () => {
  const m = deriveMode(state(split()));
  assert.deepEqual(m, { kind: "arrange", top: ["30", "31", "32", "33", "34"], tray: [], hasTray: true, context: "piles", pick: { min: 0, max: 5 } });
  // Known by its message, or by the card that asks.
  assert.equal(deriveMode(state(split({ message: "Choose cards" }))).kind, "arrange");
  assert.equal(deriveMode(state(split({ sourceCardName: "Opt", message: "Choose cards for pile 1" }))).kind, "arrange");
  assert.equal(deriveMode(state(split({ sourceCardName: "Opt", message: "Choose cards" }))).kind, "cards");
});

// ---------------------------------------------------------------- sideboarding

const deck = (names: [number, string, string, string][]) =>
  names.flatMap(([n, name, manaCost, typeLine]) => Array.from({ length: n }, () => ({ id: 7, name, manaCost, typeLine })));

const sideboarding = (extra: Raw = {}) => ({
  type: "CHOOSE_CARDS", contextType: "sideboard", promptVersion: 9, min: 6, max: 8,
  // Endstep's ids may repeat: cards are known by their place in the list.
  cardOptions: deck([[2, "Lightning Bolt", "{R}", "Instant"], [2, "Rift Bolt", "{2}{R}", "Sorcery"], [2, "Mountain", "", "Basic Land — Mountain"], [2, "Searing Blood", "{R}{R}", "Instant"]]),
  sideboardState: { mainCount: 6, mode: "SIDEBOARD", self: "EDITING", opponent: "SUBMITTED", deadlineMs: 50_000 },
  ...extra,
});

test("sideboarding reads every card by its place, the main deck's size and the state", () => {
  const sb = state(sideboarding(), { matchScore: { gamesPlayed: 1 }, clock: { serverNowMs: 10_000 } }).pending!.sideboard!;
  assert.equal(sb.cards.length, 8);
  assert.deepEqual(sb.cards.map((c) => c.id).slice(0, 3), ["sb:0", "sb:1", "sb:2"]);
  assert.deepEqual([sb.mainCount, sb.min, sb.max, sb.mode, sb.self, sb.opponent, sb.gameNumber], [6, 6, 8, "SIDEBOARD", "EDITING", "SUBMITTED", 2]);
  assert.equal(sb.deadline, 50_000);
});

test("without a main count, the main deck starts at its minimum", () => {
  const sb = state(sideboarding({ sideboardState: {} })).pending!.sideboard!;
  assert.equal(sb.mainCount, 6);
  assert.equal(sb.self, "EDITING");
});

test("sideboarding is answered on the board, starting from the registered deck", () => {
  const m = deriveMode(state(sideboarding()));
  assert.equal(m.kind, "sideboard");
  if (m.kind === "sideboard") assert.deepEqual([...m.main], [0, 1, 2, 3, 4, 5]);
});

test("moving cards changes the main deck, which must stay within min and max", () => {
  const sb = state(sideboarding()).pending!.sideboard!;
  let main = sideboardStart(sb);
  assert.equal(sideboardChanged(sb, main), false);
  main = sideboardMove(main, [0], false);
  assert.deepEqual(sideboardCheck(sb, main), { size: 5, short: 1, over: 0, ok: false });
  main = sideboardMove(main, [6, 7], true);
  assert.deepEqual(sideboardCheck(sb, main), { size: 7, short: 0, over: 0, ok: true });
  assert.equal(sideboardChanged(sb, main), true);
  main = sideboardMove(main, [0], true);
  main = sideboardMove(main, [0], true);
  assert.equal(sideboardCheck(sb, sideboardMove(main, [], true)).over, 0);
});

test("copies stack by name, cheapest first; the deck lays out by mana value with lands last", () => {
  const sb = state(sideboarding()).pending!.sideboard!;
  const main = sideboardStart(sb);
  const stacks = sideboardStacks(sb, main, true);
  assert.deepEqual(stacks.map((s) => [s.name, s.indexes]), [["Mountain", [4, 5]], ["Lightning Bolt", [0, 1]], ["Rift Bolt", [2, 3]]]);
  assert.deepEqual(deckColumns(stacks).map((c) => [c.label, c.stacks.map((s) => s.name)]),
    [["0–1", ["Lightning Bolt"]], ["3", ["Rift Bolt"]], ["Lands", ["Mountain"]]]);
  assert.deepEqual(sideboardStacks(sb, main, false).map((s) => s.name), ["Searing Blood"]);
});

test("mana value counts generic, colored, hybrid and Phyrexian symbols; X is 0", () => {
  assert.equal(manaValue("{2}{U}{U}"), 4);
  assert.equal(manaValue("{X}{R}"), 1);
  assert.equal(manaValue("{2/W}{G/P}"), 3);
  assert.equal(manaValue(undefined), 0);
});

test("submitting sends the main deck's indexes in list order; withdrawing takes it back", () => {
  const s = state(sideboarding());
  const { controller, out } = sent(s);
  controller.submitSideboard([7, 0, 3]);
  controller.withdrawSideboard();
  assert.deepEqual(out, [
    { type: "SIDEBOARD_SUBMIT", orderedCards: [0, 3, 7], promptVersion: 9 },
    { type: "SIDEBOARD_WITHDRAW", promptVersion: 9 },
  ]);
  assert.ok(ALLOWED_ACTIONS.has("SIDEBOARD_SUBMIT") && ALLOWED_ACTIONS.has("SIDEBOARD_WITHDRAW"));
});
