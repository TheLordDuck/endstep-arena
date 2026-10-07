// Board interaction → wire actions. Expected payloads are the ones Endstep's
// own client builds (docs/ENDSTEP_ANALYSIS.md §3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/game/GameController";
import { normalize, type Raw } from "../src/game/endstep/normalize";
import { clickInMode, defenderForKey, deriveMode, divideLeft, divideLocked, divideSet, divideStep, keyForDefender, learnStep } from "../src/ui/board/modes";
import type { WireAction } from "../src/shared/protocol";
import { coversStops } from "../src/game/endstep/phaseStops";
import { isFrontRow, isLand, ptCounterDelta } from "../src/ui/board/cards";

function setup(pendingAction: Raw, extra: Raw = {}) {
  const raw: Raw = {
    phase: "MAIN1", activePlayerId: "0", priorityPlayerId: "0", stack: [],
    players: [
      { name: "Me", life: 20, battlefield: [{ id: 11, name: "Bear" }, { id: 12, name: "Elf" }] },
      { name: "Opp", life: 20, battlefield: [{ id: 21, name: "Angel", isAttacking: true, attackingDefenderId: "0" }, { id: 22, name: "Hawk", isAttacking: true, attackingDefenderId: "0" }] },
    ],
    pendingAction,
    ...extra,
  };
  const state = normalize(raw, { matchId: "m", viewerSeat: 0, desynced: false });
  const sent: WireAction[] = [];
  const controller = new GameController(() => state, (_m, a) => sent.push(a));
  return { state, controller, sent };
}

test("pass priority is stamped with the prompt version", () => {
  const { controller, sent } = setup({ type: "PRIORITY", promptVersion: 9 });
  controller.passPriority();
  assert.deepEqual(sent, [{ type: "PASS_PRIORITY", promptVersion: 9 }]);
});

test("play card sends a numeric id and the ability index", () => {
  const { controller, sent } = setup({ type: "PRIORITY", promptVersion: 2 });
  controller.playCard("11", 1);
  assert.deepEqual(sent[0], { type: "PLAY_CARD", cardId: 11, abilityIndex: 1, autoPassAfter: true, promptVersion: 2 });
});

test("blocks: click blocker then attacker → {blockerId: attackerId}", () => {
  const { state, controller, sent } = setup({
    type: "DECLARE_BLOCKERS", promptVersion: 4, cardOptions: [{ id: 11 }, { id: 12 }],
    blockerEligibility: { 11: [21, 22], 12: [22] },
  });
  let mode = deriveMode(state);
  assert.equal(mode.kind, "blockers");
  mode = clickInMode(mode, "12");
  mode = clickInMode(mode, "21");
  assert.equal(mode.kind === "blockers" && mode.assignments.size, 0, "Elf may not block Angel");
  mode = clickInMode(mode, "22");
  mode = clickInMode(mode, "11");
  mode = clickInMode(mode, "21");
  assert.ok(mode.kind === "blockers");
  controller.declareBlockers(mode.assignments);
  assert.deepEqual(sent[0], { type: "DECLARE_BLOCKERS", blockers: { 12: 22, 11: 21 }, promptVersion: 4 });
});

test("attacks with a single defender send just the attacker ids", () => {
  const { state, controller, sent } = setup({ type: "DECLARE_ATTACKERS", promptVersion: 5, cardOptions: [{ id: 11 }, { id: 12 }], modeOptions: [] });
  let mode = deriveMode(state);
  mode = clickInMode(mode, "12");
  assert.ok(mode.kind === "attackers" && !mode.defenders);
  controller.declareAttackers(mode.assignments, false);
  assert.deepEqual(sent[0], { type: "DECLARE_ATTACKERS", attackers: [12], promptVersion: 5 });
});

test("attacks with several defenders map attacker → defender index", () => {
  const { state, controller, sent } = setup({
    type: "DECLARE_ATTACKERS", promptVersion: 5, cardOptions: [{ id: 11 }],
    modeOptions: [{ index: 0, description: "Attack Opp" }, { index: 1, description: "Attack Jace", cardId: 30 }],
  });
  let mode = deriveMode(state);
  assert.ok(mode.kind === "attackers" && mode.defenders?.length === 2);
  // Click the attacker: it's aimed, not yet attacking.
  mode = clickInMode(mode, "11");
  assert.ok(mode.kind === "attackers" && mode.aiming === "11" && mode.assignments.size === 0);
  // Then the planeswalker: the attacker goes at it.
  assert.equal(defenderForKey(mode, "30", state), 1);
  mode = clickInMode(mode, "30", defenderForKey(mode, "30", state));
  assert.ok(mode.kind === "attackers" && mode.aiming === null);
  assert.equal(keyForDefender(mode, 1, state), "30");
  controller.declareAttackers(mode.assignments, true);
  assert.deepEqual(sent[0], { type: "DECLARE_ATTACKERS", attackers: [11], blockers: { 11: 1 }, promptVersion: 5 });
});

test("aiming an attacker: the opponent's plate is the player, a stray click puts it down", () => {
  const { state } = setup({
    type: "DECLARE_ATTACKERS", cardOptions: [{ id: 11 }, { id: 12 }],
    modeOptions: [{ index: 0, description: "Attack player" }, { index: 1, description: "Attack Jace", cardId: 30 }],
  });
  let mode = deriveMode(state);
  mode = clickInMode(mode, "11");
  assert.equal(defenderForKey(mode, "player:0", state), null, "can't attack yourself");
  mode = clickInMode(mode, "player:1", defenderForKey(mode, "player:1", state));
  assert.ok(mode.kind === "attackers" && mode.assignments.get("11") === 0 && mode.aiming === null);
  assert.equal(keyForDefender(mode, 0, state), "player:1");
  // Aim another, then click something that isn't a defender: no attack.
  mode = clickInMode(mode, "12");
  mode = clickInMode(mode, "21", null);
  assert.ok(mode.kind === "attackers" && mode.aiming === null && !mode.assignments.has("12"));
  // Clicking an attacker already assigned takes it out of the attack.
  mode = clickInMode(mode, "11");
  assert.ok(mode.kind === "attackers" && mode.assignments.size === 0 && mode.aiming === null);
});

test("targets: players are offered by name and sent as -(seat+1)", () => {
  const { state, controller, sent } = setup({
    type: "CHOOSE_TARGETS", promptVersion: 6, min: 1, max: 2, cardOptions: [{ id: 21 }], stringOptions: ["Opp"],
  });
  let mode = deriveMode(state);
  assert.ok(mode.kind === "targets" && mode.valid.has("player:1") && mode.valid.has("21"));
  mode = clickInMode(mode, "player:1");
  mode = clickInMode(mode, "21");
  assert.ok(mode.kind === "targets");
  controller.chooseTargets(mode.selected);
  assert.deepEqual(sent[0], { type: "CHOOSE_TARGETS", targets: [-2, 21], promptVersion: 6 });
});

test("mulligan, yes/no with custom labels, and unsupported prompts", () => {
  const m = setup({ type: "MULLIGAN", promptVersion: 1 });
  m.controller.keepHand();
  assert.deepEqual(m.sent[0], { type: "KEEP_HAND", keepHand: true, promptVersion: 1 });
  const y = setup({ type: "YES_NO", promptVersion: 2, stringOptions: ["Pay 2 life", "Tap an untapped land"] });
  y.controller.answer(false, ["Pay 2 life", "Tap an untapped land"]);
  assert.deepEqual(y.sent[0], { type: "YES", stringValue: "Tap an untapped land", promptVersion: 2 });
  assert.equal(deriveMode(setup({ type: "ARRANGE_CARDS" }).state).kind, "classic");
});

test("every PRIORITY cardOption is playable, even without playableAbilities", () => {
  const { state, controller, sent } = setup({ type: "PRIORITY", promptVersion: 3, cardOptions: [{ id: 11 }, { id: 12, playableAbilities: [{ index: 1, description: "Flashback" }] }] });
  assert.deepEqual(state.pending?.playable.map((p) => p.cardId), ["11", "12"]);
  assert.deepEqual(state.pending?.playable[0]?.abilities, []);
  controller.playCard("11", undefined);
  assert.deepEqual(sent[0], { type: "PLAY_CARD", cardId: 11, abilityIndex: undefined, autoPassAfter: true, promptVersion: 3 });
});

test("phase stops use Endstep's SET_PHASE_STOPS shape, unversioned", () => {
  const { controller, sent } = setup({ type: "PRIORITY", promptVersion: 4 });
  const stops = { myTurn: new Set(["DRAW", "UPKEEP"]), oppTurn: new Set(["END_STEP"]) };
  controller.setPhaseStops(stops);
  assert.deepEqual(sent[0], { type: "SET_PHASE_STOPS", phaseStopsMyTurn: ["UPKEEP", "DRAW"], phaseStopsOppTurn: ["END_STEP"] });
  assert.equal(coversStops({ phaseStopsMyTurn: ["UPKEEP", "DRAW", "MAIN1"], phaseStopsOppTurn: ["END_STEP"] }, stops), true);
  assert.equal(coversStops({ phaseStopsMyTurn: ["MAIN1"], phaseStopsOppTurn: ["END_STEP"] }, stops), false);
});

test("stack items read Endstep's sourceCard shape; rows use card types; undo", () => {
  const { state, controller, sent } = setup({ type: "PRIORITY", promptVersion: 5, canUndo: true }, {
    stack: [
      { stackTargetId: 7, isAbility: false, sourceCard: { id: 30, name: "Lightning Bolt", selectedSetCode: "m10", selectedCollectorNumber: "146", types: ["Instant"] } },
      { stackTargetId: 8, isAbility: true, abilityDescription: "Draw a card.", sourceCard: { id: 11, name: "Bear" } },
    ],
  });
  const [spell, ability] = state.stack;
  assert.equal(spell?.card?.name, "Lightning Bolt");
  assert.equal(spell?.card?.setCode, "m10");
  assert.equal(ability?.isAbility, true);
  assert.equal(ability?.name, "Draw a card.");
  assert.equal(ability?.sourceCardId, "11");

  const card = (types: string[]) => normalize({ players: [{ battlefield: [{ id: 1, name: "X", types }] }] }, { matchId: "m", viewerSeat: 0, desynced: false }).players[0]!.battlefield[0]!;
  assert.equal(isFrontRow(card(["Artifact", "Creature"])), true);
  assert.equal(isLand(card(["Land"])), true);
  assert.equal(isFrontRow(card(["Land"])), false);
  assert.equal(isLand(card(["Enchantment"])), false);
  assert.equal(card(["Creature"]).typeLine, "Creature");

  assert.equal(state.pending?.canUndo, true);
  controller.undo();
  assert.deepEqual(sent[0], { type: "UNDO", promptVersion: 5 });
});

test("stack targets become board keys: players by seat, cards by id", () => {
  const { state } = setup({ type: "PRIORITY" }, {
    stack: [{ stackTargetId: 9, isAbility: false, sourceCard: { id: 40, name: "Fork" }, targets: [{ id: -2, zone: "Player" }, { id: 21, zone: "Battlefield" }, { id: 41, zone: "Stack" }] }],
  });
  assert.deepEqual(state.stack[0]?.targets, ["player:1", "21", "41"]);
});

test("command zone: commanders stay, effects are split out with their source card", () => {
  const { state } = setup({ type: "PRIORITY" }, {
    players: [
      { name: "Me", commandZone: [{ id: 50, name: "Atraxa", isCommander: true }, { id: 51, name: "Effect", types: ["Effect"], effectSourceName: " Bear ", oracleText: "Bear gets +1/+1." }], battlefield: [{ id: 11, name: "Bear" }] },
      { name: "Opp", battlefield: [] },
    ],
  });
  const me = state.players[0]!;
  assert.deepEqual(me.commandZone.map((c) => c.id), ["50"]);
  assert.deepEqual(me.effects.map((c) => [c.id, c.effectSourceName]), [["51", "Bear"]]);
});

test("power/toughness counters count as changing the stats", () => {
  assert.deepEqual(ptCounterDelta({ P1P1: 2 }), { power: 2, toughness: 2 });
  assert.deepEqual(ptCounterDelta({ "+1/+1": 3, "-1/-1": 1 }), { power: 2, toughness: 2 });
  assert.deepEqual(ptCounterDelta({ M1M1: 1, P1P0: 2, CHARGE: 4 }), { power: 1, toughness: -1 });
  assert.deepEqual(ptCounterDelta({ PLUS1PLUS1: 1 }), { power: 1, toughness: 1 });
  assert.deepEqual(ptCounterDelta({ LORE: 2 }), { power: 0, toughness: 0 });
});

test("learn: Lessons first, then the hand to discard from; either is sent as the chosen card", () => {
  const { state, controller, sent } = setup({
    type: "CHOOSE_CARDS", promptVersion: 7, message: "Learn", min: 0, max: 1,
    cardOptions: [{ id: 70, name: "Pest Summoning", zone: "Sideboard" }, { id: 31, name: "Bolt", zone: "Hand" }],
  });
  let mode = deriveMode(state);
  assert.ok(mode.kind === "cards" && mode.learn && !mode.learn.discarding);
  assert.deepEqual([...mode.valid], ["70"]);
  assert.equal(clickInMode(mode, "31"), mode, "hand cards aren't offered with the Lessons");
  mode = learnStep(clickInMode(mode, "70") as typeof mode, true);
  assert.ok(mode.kind === "cards" && mode.learn?.discarding);
  assert.deepEqual([[...mode.valid], mode.selected], [["31"], []]);
  mode = clickInMode(mode, "31");
  assert.ok(mode.kind === "cards");
  controller.chooseCards(mode.selected);
  assert.deepEqual(sent[0], { type: "CHOOSE_CARDS", orderedCards: [31], promptVersion: 7 });
  // No Lesson left: straight to the discard. A plain search isn't a learn.
  const none = deriveMode(setup({ type: "CHOOSE_CARDS", message: "Learn", min: 0, max: 1, cardOptions: [{ id: 31, zone: "Hand" }] }).state);
  assert.ok(none.kind === "cards" && none.learn?.discarding);
  const search = deriveMode(setup({ type: "CHOOSE_CARDS", min: 0, max: 1, cardOptions: [{ id: 80, zone: "Library" }] }).state);
  assert.ok(search.kind === "cards" && !search.learn);
  // As a live match asks it: a target choice named "Learn a Lesson", hand cards known by id.
  const live = setup({ type: "CHOOSE_TARGETS", promptVersion: 8, message: "Learn a Lesson", min: 0, max: 1, sourceCardName: "Eyetwitch",
    cardOptions: [{ id: 70, name: "Pest Summoning" }, { id: 31, name: "Archon" }] },
    { players: [{ name: "Me", life: 20, battlefield: [], hand: [{ id: 31, name: "Archon" }] }, { name: "Opp", life: 20, battlefield: [] }] });
  const lm = deriveMode(live.state);
  assert.ok(lm.kind === "cards" && lm.learn);
  assert.deepEqual([lm.learn.lessons, lm.learn.hand], [["70"], ["31"]]);
});

// Combat damage among blockers, as Endstep's damage bar divides it.
const assign = (extra: Raw = {}) => setup({ type: "ASSIGN_DAMAGE", promptVersion: 30, sourceCardName: "Bear", maxValue: 8,
  cardOptions: [
    { id: 21, name: "Angel", types: ["Creature"], lethalDamage: 4 },
    { id: 22, name: "Hawk", types: ["Creature"], lethalDamage: 2 },
    { id: -2, name: "Opp", types: ["Player"] },
  ], ...extra });

test("damage: lethal to each blocker in order first, the rest to the trampled player", () => {
  const { state } = assign();
  const d = state.pending!.divide!;
  assert.deepEqual(d.options.map((o) => [o.id, o.lethal, o.player]), [["21", 4, false], ["22", 2, false], ["-2", null, true]]);
  const m = deriveMode(state);
  assert.ok(m.kind === "divide");
  assert.deepEqual(m.amounts, [4, 2, 2]);
  assert.equal(divideLeft(d, m.amounts), 0);
});

test("damage: the player is locked (and loses its share) while a blocker lacks lethal", () => {
  const d = assign().state.pending!.divide!;
  const less = divideStep(d, [4, 2, 2], 0, false);
  assert.deepEqual(less, [3, 2, 0]);
  assert.ok(divideLocked(d, less, 2));
  assert.deepEqual(divideStep(d, less, 2, true), less, "no +1 on a locked player");
  assert.deepEqual(divideSet(d, less, 2, 3), less, "nor typed in");
  // Ctrl: straight to lethal, then the player opens up again.
  const back = divideStep(d, less, 0, true, true);
  assert.deepEqual(back, [4, 2, 0]);
  assert.ok(!divideLocked(d, back, 2));
  assert.deepEqual(divideStep(d, back, 2, true), [4, 2, 1]);
  // Never more than what's left; never below 0.
  assert.deepEqual(divideStep(d, [4, 2, 2], 1, true), [4, 2, 2]);
  assert.deepEqual(divideStep(d, [0, 0, 0], 1, false), [0, 0, 0]);
  // Ctrl on less: down to lethal from overkill, or to 0.
  assert.deepEqual(divideStep(d, [6, 2, 0], 0, false, true), [4, 2, 0]);
  assert.deepEqual(divideStep(d, [4, 2, 0], 1, false, true), [4, 0, 0]);
});

test("damage: overrideOrder lets damage past blockers without lethal; confirm sends amounts", () => {
  const free = assign({ overrideOrder: true });
  const d = free.state.pending!.divide!;
  assert.ok(!divideLocked(d, [0, 0, 0], 2));
  assert.deepEqual(divideStep(d, [3, 2, 0], 2, true), [3, 2, 1]);
  free.controller.divide([3, 2, 3]);
  assert.deepEqual(free.sent[0], { type: "CHOOSE_CARDS", orderedCards: [3, 2, 3], promptVersion: 30 });
  // Without lethal to go by, nothing is assigned up front.
  const unknown = setup({ type: "ASSIGN_DAMAGE", maxValue: 3, cardOptions: [{ id: 21, name: "Angel" }, { id: 22, name: "Hawk" }] });
  const m = deriveMode(unknown.state);
  assert.ok(m.kind === "divide");
  assert.deepEqual(m.amounts, [0, 0]);
});

test("a card from an opponent's hand is picked from a fan; your own (or a hand you control) on the table", () => {
  const hands = (oppControlled: boolean) => ({
    players: [
      { name: "Me", life: 20, battlefield: [], hand: [{ id: 31, name: "Opt" }] },
      { name: "Opp", life: 20, battlefield: [], hand: [{ id: 41, name: "Griselbrand" }, { id: 42, name: "Dark Ritual" }], ...(oppControlled ? { controlledBySeat: 0 } : {}) },
    ],
  });
  const theirs = deriveMode(setup({ type: "CHOOSE_CARDS", cardOptions: [{ id: 41, zone: "HAND" }, { id: 42, zone: "HAND" }] }, hands(false)).state);
  assert.ok(theirs.kind === "cards" && theirs.offBoard);
  const mine = deriveMode(setup({ type: "CHOOSE_CARDS", cardOptions: [{ id: 31, zone: "HAND" }] }, hands(false)).state);
  assert.ok(mine.kind === "cards" && !mine.offBoard);
  const controlled = deriveMode(setup({ type: "CHOOSE_CARDS", cardOptions: [{ id: 41, zone: "HAND" }] }, hands(true)).state);
  assert.ok(controlled.kind === "cards" && !controlled.offBoard);
});
