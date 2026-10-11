// Combat from Endstep's events, checked against a real match against Forge AI (recorded
// 2026-10-11, tests/fixtures/bot-combats): five combats of ours, the bot never attacking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blowsOf, toldFight, turnLog } from "../src/game/combatEvents";
import type { GameState } from "../src/game/GameState";
import { playMatch } from "./realMatch";

const states = playMatch("bot-combats").map((s) => s.state);
const last = states.at(-1)!;

/** The states of turn `n`. */
const ofTurn = (n: number) => states.filter((s) => s.turnNumber === n);
/** The fight of turn `n` as `state`'s log tells it. */
const fightIn = (state: GameState, n: number) => {
  const log = state.log ?? [];
  const began = log.filter((e) => e.type === "TURN_BEGAN").map((e) => e.seq)[n - 1]!;
  const seatOf = (id: string) => {
    const seat = state.players.findIndex((p) => p.battlefield.some((c) => c.id === id) || p.graveyard.some((c) => c.id === id));
    return seat >= 0 ? seat : undefined;
  };
  return toldFight(turnLog(log, began), seatOf, state.players.length);
};
const links = (l: { fromId: string; toId: string }[] = []) => l.map((x) => `${x.fromId}>${x.toId}`).sort();
/** A step's blows, as "from>to:amount". */
const blows = (n: number, step?: "fs" | "cd") => {
  const fight = fightIn(last, n)!;
  return blowsOf(last.log ?? [], fight.since, { attacks: fight.attacks, blocks: fight.blocks ?? [] }, step).map((b) => `${b.fromId}>${b.toId}:${b.amount}`);
};

test("the match plays through the adapter to the end", () => {
  assert.equal(last.status, "COMPLETE");
  assert.equal(last.players[1]!.hasLost, true);
  // Endstep sends the turn as a string ("13").
  assert.equal(last.turnNumber, 13);
  // Each of the five combats' events made it to the log.
  assert.equal((last.log ?? []).filter((e) => e.type === "ATTACKERS_DECLARED" && e.fight?.attackers?.length).length, 5);
});

test("events carry the fight: attackers, who blocks whom, each blow", () => {
  const log = last.log ?? [];
  assert.deepEqual(log.find((e) => e.type === "ATTACKERS_DECLARED" && e.fight?.attackers?.length)?.fight, { attackers: ["52", "48", "47"] });
  // Nobody blocking: no assignments, no blocks.
  assert.deepEqual(log.find((e) => e.type === "BLOCKERS_DECLARED")?.fight, { blocks: [] });
  const damaged = log.find((e) => e.type === "CARD_DAMAGED")!;
  assert.deepEqual(damaged.fight?.blow, { fromId: "48", toId: "127", amount: 5, step: "cd" });
  // The card hit is named too (the log lights it up; a spell's damage is read from it).
  assert.deepEqual(damaged.cards.map((c) => c.id), ["48", "127"]);
});

test("turn 3: three unblocked attackers, one with double strike: a blow in each damage step", () => {
  const fight = fightIn(last, 3)!;
  assert.deepEqual(links(fight.attacks), ["47>player:1", "48>player:1", "52>player:1"]);
  assert.deepEqual(fight.blocks, []);
  assert.deepEqual(blows(3, "fs"), ["48>player:1:5"]);
  assert.deepEqual(blows(3, "cd"), ["52>player:1:2", "48>player:1:5", "47>player:1:5"]);
});

test("blocked fights: the damage state has lost the dead creatures' flags; the events keep them", () => {
  const expected: Record<number, string[]> = {
    5: ["127>48"],
    9: ["106>52", "109>31"],
    11: ["126>48", "89>51"],
    13: ["89>48"],
  };
  for (const [turn, blocks] of Object.entries(expected)) {
    const damage = ofTurn(Number(turn)).find((s) => s.step === "COMBAT_DAMAGE")!;
    assert.ok(damage, `turn ${turn} has a damage state`);
    assert.deepEqual(links(fightIn(damage, Number(turn))?.blocks), blocks, `turn ${turn}`);
    // Where a blocker died, the state alone can't tell it (turn 13's blocker lived).
    if (turn !== "13") assert.notDeepEqual(links(damage.combat.blocks), blocks, `turn ${turn}'s state`);
  }
  // Turn 9: all four creatures traded; the state shows no fight at all.
  assert.deepEqual(ofTurn(9).find((s) => s.step === "COMBAT_DAMAGE")!.combat, { attacks: [], blocks: [] });
  assert.deepEqual(blows(9).sort(), ["106>52:2", "109>31:2", "31>109:2", "52>106:2"]);
});

test("a blow may come after its damage state: it's in a later state's log", () => {
  const damage = ofTurn(5).find((s) => s.step === "COMBAT_DAMAGE")!;
  const fight = fightIn(damage, 5)!;
  const now = blowsOf(damage.log ?? [], fight.since, { attacks: fight.attacks, blocks: fight.blocks ?? [] }).map((b) => b.fromId);
  assert.deepEqual(now, ["48"]);
  assert.deepEqual(blows(5), ["48>127:5", "127>48:1"]);
});

test("the fight ends with COMBAT_ENDED; a turn without attackers has none", () => {
  assert.ok(fightIn(last, 9)!.endedAt! > fightIn(last, 9)!.since);
  assert.equal(fightIn(last, 2), null);
});
