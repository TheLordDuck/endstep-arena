// Prompts that used to step aside to Endstep's UI: Phyrexian mana, a spell dividing its damage;
// and the log of the ones that still do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/game/GameController";
import { normalize, type Raw } from "../src/game/endstep/normalize";
import { deriveMode, divideReady, divideShort, divideStart, promptKey } from "../src/ui/board/modes";
import { ALLOWED_ACTIONS, type WireAction } from "../src/shared/protocol";
import { UnsupportedLog } from "../src/game/unsupportedPrompts";

function setup(pendingAction: Raw | null, extra: Raw = {}) {
  const raw: Raw = {
    phase: "MAIN1", activePlayerId: "0", priorityPlayerId: "0", stack: [],
    players: [
      { name: "Me", life: 20, hand: [{ id: 31, name: "Arc Lightning" }], battlefield: [{ id: 11, name: "Swamp" }, { id: 12, name: "Bear", typeLine: "Creature" }] },
      { name: "Opp", life: 20, battlefield: [{ id: 21, name: "Angel", typeLine: "Creature" }, { id: 22, name: "Hawk", typeLine: "Creature" }] },
    ],
    pendingAction,
    ...extra,
  };
  const state = normalize(raw, { matchId: "m", viewerSeat: 0, desynced: false });
  const sent: WireAction[] = [];
  const controller = new GameController(() => state, (_m, a) => sent.push(a));
  return { state, controller, sent };
}

// ---------------------------------------------------------------- Phyrexian mana

test("Phyrexian mana: the payment says when 2 life can pay a symbol, and paying sends Endstep's action", () => {
  const { state, controller, sent } = setup({ type: "PAY_MANA", promptVersion: 12, message: "Pay {1}{B/P}{B/P}", phyrexianMana: true, cardOptions: [{ id: 11 }] });
  assert.equal(state.pending!.phyrexian, true);
  const m = deriveMode(state);
  assert.ok(m.kind === "cards" && m.mana, "still paid on the board, not handed to Endstep");
  controller.payPhyrexianLife();
  assert.deepEqual(sent, [{ type: "PAY_LIFE_PHYREXIAN", promptVersion: 12 }]);
  assert.ok(ALLOWED_ACTIONS.has("PAY_LIFE_PHYREXIAN"), "the tap lets it out");
  // A plain payment (or a symbol already paid) offers no life.
  assert.equal(setup({ type: "PAY_MANA", cardOptions: [{ id: 11 }] }).state.pending!.phyrexian, undefined);
  assert.equal(setup({ type: "PAY_MANA", phyrexianMana: false, cardOptions: [{ id: 11 }] }).state.pending!.phyrexian, undefined);
});

// ---------------------------------------------------------------- dividing a spell's damage

const arc = (total: number, extra: Raw = {}, pending: Raw = {}) => setup({
  type: "ASSIGN_DAMAGE", promptVersion: 40, sourceCardId: 31, sourceCardName: "Arc Lightning", maxValue: total,
  message: `Divide ${total} damage among the targets.`,
  cardOptions: [
    { id: 22, name: "Hawk", types: ["Creature"], lethalDamage: 2 },
    { id: 21, name: "Angel", types: ["Creature"], lethalDamage: 4 },
    { id: -2, name: "Opp", types: ["Player"] },
  ],
  ...pending,
}, extra);

test("spell damage: a division outside combat is the spell's, with no lethal-first rule", () => {
  const d = arc(3).state.pending!.divide!;
  assert.equal(d.kind, "spell");
  assert.equal(d.freeSpill, true);
  const m = deriveMode(arc(3).state);
  assert.ok(m.kind === "divide", "uses the damage screen");
  assert.deepEqual(m.amounts, [1, 1, 1], "one each first");
  // More to go round: creatures topped up to lethal in order, the rest to the last target.
  assert.deepEqual(divideStart(arc(5).state.pending!.divide!), [2, 2, 1]);
  assert.deepEqual(divideStart(arc(9).state.pending!.divide!), [2, 4, 3]);
  // Fewer than the targets: as many get 1 as there's damage for.
  assert.deepEqual(divideStart(arc(2).state.pending!.divide!), [1, 1, 0]);
});

test("spell damage: every target needs at least 1 before it can be sent", () => {
  const d = arc(3).state.pending!.divide!;
  assert.ok(divideReady(d, [1, 1, 1]));
  assert.ok(divideShort(d, [2, 1, 0]));
  assert.ok(!divideReady(d, [2, 1, 0]), "all assigned, but the player got none");
  assert.ok(!divideReady(d, [1, 1, 0]), "1 left");
  // Combat has no such rule: a blocker may get nothing (the lethal rule is enforced elsewhere).
  const combat = arc(3, { phase: "COMBAT_DAMAGE" }).state.pending!.divide!;
  assert.equal(combat.kind, "combat");
  assert.ok(divideReady(combat, [3, 0, 0]));
});

test("spell damage: combat is told by the fight, the step or the message", () => {
  const fighting = arc(3, {}, { sourceCardId: 12, sourceCardName: "Bear" });
  assert.equal(fighting.state.pending!.divide!.kind, "spell", "a creature not in combat: an ability's damage");
  const attacking = setup({ type: "ASSIGN_DAMAGE", sourceCardName: "Bear", maxValue: 3, cardOptions: [{ id: 21, lethalDamage: 4 }] }, {
    players: [
      { name: "Me", life: 20, battlefield: [{ id: 12, name: "Bear", isAttacking: true }] },
      { name: "Opp", life: 20, battlefield: [{ id: 21, name: "Angel", isBlocking: true, blockingIds: [12] }] },
    ],
  });
  assert.equal(attacking.state.pending!.divide!.kind, "combat");
  assert.equal(arc(3, { step: "FIRST_STRIKE_DAMAGE" }).state.pending!.divide!.kind, "combat");
  assert.equal(arc(3, {}, { message: "Assign 3 combat damage." }).state.pending!.divide!.kind, "combat");
});

test("shield counters: DIVIDE_SHIELD is shields unless it speaks of damage", () => {
  const shields = setup({ type: "DIVIDE_SHIELD", maxValue: 2, message: "Distribute 2 shield counters.", cardOptions: [{ id: 21 }, { id: 22 }] });
  assert.equal(shields.state.pending!.divide!.kind, "shield");
  const plain = setup({ type: "DIVIDE_SHIELD", maxValue: 2, cardOptions: [{ id: 21 }, { id: 22 }] });
  assert.equal(plain.state.pending!.divide!.kind, "shield");
  const damage = setup({ type: "DIVIDE_SHIELD", maxValue: 4, message: "Divide 4 damage among any number of targets.", cardOptions: [{ id: 21 }, { id: 22 }] });
  assert.equal(damage.state.pending!.divide!.kind, "spell");
});

test("spell damage: a divided spell on the stack carries each target's share", () => {
  const { state } = setup(null, {
    stack: [{ stackTargetId: 90, sourceCard: { id: 31, name: "Arc Lightning" }, targets: [
      { id: 22, zone: "Battlefield", dividedAmount: 2 }, { id: -2, zone: "Player", dividedAmount: 1 },
    ] }],
  });
  assert.deepEqual(state.stack[0]!.targets, ["22", "player:1"]);
  assert.deepEqual(state.stack[0]!.divided, { 22: 2, "player:1": 1 });
  const plain = setup(null, { stack: [{ stackTargetId: 91, sourceCard: { id: 32, name: "Shock" }, targets: [{ id: 22 }] }] });
  assert.equal(plain.state.stack[0]!.divided, undefined);
});

// ---------------------------------------------------------------- prompts that step aside

test("unsupported prompts: each one handed to Endstep is recorded once, with what Endstep sent", () => {
  const log = new UnsupportedLog();
  const ask = (pending: Raw, now: number) => {
    const { state } = setup(pending);
    const mode = deriveMode(state);
    return log.record(state, mode.kind === "classic" ? mode.reason : null, promptKey(state), pending, now);
  };
  const arrange = { type: "ARRANGE_CARDS", promptVersion: 1, sourceCardName: "Sensei's Divining Top", message: "Arrange" };
  const first = ask(arrange, 1000);
  assert.ok(first);
  assert.deepEqual([first.type, first.reason, first.sourceCardName, first.count], ["ARRANGE_CARDS", "Arrange cards", "Sensei's Divining Top", 1]);
  assert.equal(JSON.parse(first.sample).sourceCardName, "Sensei's Divining Top");
  assert.equal(ask(arrange, 1100), null, "the same prompt, redrawn: not again");
  const again = ask({ ...arrange, promptVersion: 2 }, 2000);
  assert.deepEqual([again?.count, again?.first, again?.last], [2, 1000, 2000], "asked again later: counted");
  // Prompts the board answers aren't recorded.
  assert.equal(ask({ type: "PAY_MANA", promptVersion: 3, cardOptions: [{ id: 11 }] }, 3000), null);
  assert.equal(ask({ type: "SOMETHING_NEW", promptVersion: 4 }, 4000)?.reason, "Something new");
  assert.deepEqual(log.list().map((e) => e.type), ["SOMETHING_NEW", "ARRANGE_CARDS"], "most recent first");
});

test("unsupported prompts: stored entries come back behind new ones; clear empties the log", () => {
  const log = new UnsupportedLog();
  const { state } = setup({ type: "SOMETHING_NEW", promptVersion: 1 });
  log.record(state, "Something new", "a", {}, 5);
  log.restore([
    { key: "OLD||", type: "OLD", reason: "Old", count: 3, first: 1, last: 2, sample: "{}" },
    { key: "SOMETHING_NEW||", type: "SOMETHING_NEW", reason: "Something new", count: 9, first: 1, last: 1, sample: "{}" },
  ]);
  assert.deepEqual(log.list().map((e) => [e.type, e.count]), [["SOMETHING_NEW", 1], ["OLD", 3]]);
  log.clear();
  assert.deepEqual(log.list(), []);
});
