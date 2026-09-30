// Board interaction → wire actions. Expected payloads are the ones Endstep's
// own client builds (docs/ENDSTEP_ANALYSIS.md §3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/game/GameController";
import { normalize, type Raw } from "../src/game/endstep/normalize";
import { clickInMode, defenderForKey, deriveMode, keyForDefender } from "../src/ui/board/modes";
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
