// The bot attacking, checked against a real match against Forge AI (recorded 2026-10-16,
// tests/fixtures/bot-attacks): on turn 14 its Colossal Dreadmaw (trample) and two Llanowar Elves
// are blocked by eight Soldier tokens, six of them on the Dreadmaw; another Dreadmaw and Elves come
// through. (The recording lost the frames of turns 9 to 13, the ATTACKERS_DECLARED included.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { blowsOf, hasTrample, toldFight, trampleExcess, turnLog } from "../src/game/combatEvents";
import type { CardView } from "../src/game/GameState";
import { playMatch } from "./realMatch";

const states = playMatch("bot-attacks").map((s) => s.state);
const last = states.at(-1)!;
const blocked = states.find((s) => s.turnNumber === 14 && s.combat.blocks.length)!;
const links = (l: { fromId: string; toId: string }[]) => l.map((x) => `${x.fromId}>${x.toId}`).sort();

test("the match plays through the adapter to the end: the bot wins on turn 16", () => {
  assert.equal(last.status, "COMPLETE");
  assert.equal(last.players[0]!.hasLost, true);
  assert.equal(last.turnNumber, 16);
});

test("turn 14: five attackers, eight blockers, as the state and the event both say", () => {
  assert.deepEqual(blocked.combat.attacks.map((a) => a.fromId).sort(), ["45", "50", "63", "65", "68"]);
  const expected = ["100>65", "101>50", "103>50", "104>63", "106>50", "107>50", "109>50", "110>50"];
  assert.deepEqual(links(blocked.combat.blocks), expected);
  const event = (last.log ?? []).find((e) => e.type === "BLOCKERS_DECLARED" && e.fight?.blocks?.length)!;
  assert.deepEqual(links(event.fight!.blocks!), expected);
});

test("turn 14's blows: the Dreadmaw deals 1 to each of its six blockers, nothing tramples over", () => {
  const log = last.log ?? [];
  const since = log.find((e) => e.type === "BLOCKERS_DECLARED" && e.fight?.blocks?.length)!.seq;
  const blows = blowsOf(log, since, { attacks: blocked.combat.attacks, blocks: blocked.combat.blocks }).map((b) => `${b.fromId}>${b.toId}:${b.amount}`);
  assert.deepEqual(blows.filter((b) => b.startsWith("50>")), ["50>101:1", "50>103:1", "50>106:1", "50>107:1", "50>109:1", "50>110:1"]);
  // The player is hit only by the unblocked Dreadmaw and Elves.
  assert.deepEqual(blows.filter((b) => b.includes("player:")), ["45>player:0:6", "68>player:0:1"]);
  // Each Soldier hits back.
  assert.equal(blows.filter((b) => /^(100|101|103|104|106|107|109|110)>/.test(b)).length, 8);
  // From the states alone, the same: 6 power against six 1/1s leaves nothing over.
  const card = (id: string) => blocked.players.flatMap((p) => p.battlefield).find((c) => c.id === id)!;
  const dreadmaw = card("50");
  assert.ok(hasTrample(dreadmaw));
  assert.equal(trampleExcess(dreadmaw, ["101", "103", "106", "107", "109", "110"].map(card)), 0);
});

test("trample past the blockers: power beyond what's lethal to each, less damage already marked", () => {
  const c = (power: number, toughness: number, extra: Partial<CardView> = {}) => ({ power, toughness, ...extra }) as CardView;
  const dreadmaw = c(6, 6, { oracleText: "Trample" });
  assert.equal(trampleExcess(dreadmaw, [c(1, 1), c(1, 1)]), 4);
  assert.equal(trampleExcess(dreadmaw, [c(2, 4, { damage: 3 })]), 5);
  assert.equal(trampleExcess(dreadmaw, [c(1, 7)]), 0);
  // No trample, nothing over; trample given by an effect counts.
  assert.equal(trampleExcess(c(6, 6), [c(1, 1)]), 0);
  assert.equal(trampleExcess(c(6, 6, { keywordsGranted: ["Trample"] }), [c(1, 1)]), 5);
  // Only a keyword line counts, not a mention.
  assert.equal(hasTrample(c(3, 3, { oracleText: "Other creatures you control have trample." })), false);
  assert.equal(hasTrample(c(3, 3, { oracleText: "Flying, trample" })), true);
});

// A second match (recorded 2026-10-16, tests/fixtures/bot-trample, unfinished): the bot's Colossal
// Dreadmaw tramples over four Soldiers on turn 11 (2 over) and two on turn 13 (4 over); six on
// turn 15 take it all. Turns 4 to 11 passed with Endstep's tab hidden: their events never came
// (Endstep sent the state when the tab came back), turn 11's ATTACKERS_DECLARED among them.
const trample = playMatch("bot-trample").map((s) => s.state);
const tLast = trample.at(-1)!;
const tLog = tLast.log ?? [];
/** Turn `n`'s fight as the board finds it: the turn's events, and the attacks the state before damage shows. */
const tFight = (n: number) => {
  const before = trample.filter((s) => s.turnNumber === n && s.combat.blocks.length).at(-1)!;
  const began = tLog.filter((e) => e.type === "TURN_BEGAN" && e.seq < (tLog.find((x) => x.type === "BLOCKERS_DECLARED" && x.fight?.blocks?.some((b) => before.combat.blocks.some((k) => k.fromId === b.fromId)))?.seq ?? 0)).at(-1)?.seq ?? -1;
  const seatOf = (id: string) => before.players.findIndex((p) => p.battlefield.some((c) => c.id === id));
  const fight = toldFight(turnLog(tLog, began), seatOf, 2, before.combat.attacks)!;
  const blows = blowsOf(tLog, fight.since, { attacks: fight.attacks, blocks: fight.blocks ?? [] }).map((b) => `${b.fromId}>${b.toId}:${b.amount}`);
  const card = (id: string) => before.players.flatMap((p) => p.battlefield).find((c) => c.id === id)!;
  const onDreadmaw = (fight.blocks ?? []).filter((b) => b.toId === "59").map((b) => card(b.fromId));
  return { fight, blows, excess: trampleExcess(card("59"), onDreadmaw) };
};

test("turn 11: no ATTACKERS_DECLARED came; the fight is the state's attackers with the events' blocks and blows", () => {
  assert.equal(tLog.some((e) => e.type === "ATTACKERS_DECLARED" && e.fight?.attackers?.includes("59") && e.fight.attackers.length === 4), false);
  const { fight, blows, excess } = tFight(11);
  assert.deepEqual(fight.attacks.map((a) => a.fromId).sort(), ["59", "61", "62", "67"]);
  assert.deepEqual(links(fight.blocks!), ["85>62", "86>61", "89>59", "91>59", "92>67", "94>59", "95>59"]);
  // Four Soldiers take 1 each and the 2 left over hit the player (Endstep sends that blow first).
  assert.deepEqual(blows.filter((b) => b.startsWith("59>")).sort(), ["59>89:1", "59>91:1", "59>94:1", "59>95:1", "59>player:0:2"]);
  assert.equal(excess, 2);
});

test("turns 13 and 15: two Soldiers let 4 through; six take all 6", () => {
  const t13 = tFight(13);
  assert.deepEqual(t13.blows.filter((b) => b.startsWith("59>")).sort(), ["59>101:1", "59>88:1", "59>player:0:4"]);
  assert.equal(t13.excess, 4);
  const t15 = tFight(15);
  assert.equal(t15.blows.filter((b) => b.startsWith("59>")).length, 6);
  assert.ok(!t15.blows.some((b) => b.includes("player:")));
  assert.equal(t15.excess, 0);
});
