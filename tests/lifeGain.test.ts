import { test } from "node:test";
import assert from "node:assert/strict";
import { lifeGainSource } from "../src/ui/board/lifeGain";
import type { LogEntry } from "../src/game/GameState";

const entry = (type: string, line: string, extra: Partial<LogEntry> = {}): LogEntry => ({ seq: 0, type, lines: [line], cards: [], ...extra });

test("life gain source: the card named just before the gain", () => {
  const log = [
    entry("TURN_BEGAN", "Turn 5"),
    entry("PLAYER_DAMAGED", "Hardened Academic deals 2 combat damage to Forge AI.", { seat: 1, cards: [{ id: "33", name: "Hardened Academic" }] }),
    entry("PLAYER_LIFE_CHANGED", "Me's life: 11 -> 13", { seat: 0 }),
  ];
  assert.equal(lifeGainSource(log, 0), "33");
  // A spell that resolved.
  const salve = [entry("SPELL_RESOLVED", "Healing Salve - you gain 3 life.", { cards: [{ id: "9", name: "Healing Salve" }] }), entry("PLAYER_LIFE_CHANGED", "Me's life: 4 -> 7", { seat: 0 })];
  assert.equal(lifeGainSource(salve, 0), "9");
});

test("life gain source: none for a loss, another player, or nothing named", () => {
  const hit = [entry("PLAYER_DAMAGED", "Bolt", { cards: [{ id: "1", name: "Bolt" }] }), entry("PLAYER_LIFE_CHANGED", "Me's life: 20 -> 17", { seat: 0 })];
  assert.equal(lifeGainSource(hit, 0), undefined);
  const theirs = [entry("SPELL_RESOLVED", "Salve", { cards: [{ id: "9", name: "Salve" }] }), entry("PLAYER_LIFE_CHANGED", "Opp's life: 4 -> 7", { seat: 1 })];
  assert.equal(lifeGainSource(theirs, 0), undefined);
  const bare = [entry("TURN_BEGAN", "Turn 3"), entry("PLAYER_LIFE_CHANGED", "Me's life: 4 -> 7", { seat: 0 })];
  assert.equal(lifeGainSource(bare, 0), undefined);
});
