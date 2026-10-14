import { test } from "node:test";
import assert from "node:assert/strict";
import { mulliganCost, mulliganHint, mulliganStatus } from "../src/ui/board/mulligan";
import type { LogEntry } from "../src/game/GameState";

const entry = (seq: number, type: string, seat: number, line: string): LogEntry => ({ seq, type, lines: [line], seat, cards: [] });

test("mulligan cost: none yet, then one card to the bottom per mulligan", () => {
  assert.deepEqual(mulliganCost([], 0, 7, "Keep 7"), { keep: 7, bottom: 0, taken: false });
  const log = [
    entry(1, "MULLIGAN", 1, "Forge AI mulliganed to 6."),
    entry(2, "MULLIGAN", 0, "Me mulliganed to 6."),
    entry(3, "MULLIGAN", 0, "Me has mulliganed down to 6 cards."),
    entry(4, "MULLIGAN", 0, "Me mulliganed to 5."),
  ];
  assert.deepEqual(mulliganCost(log, 0, 7, "Keep 7"), { keep: 5, bottom: 2, taken: true });
  // The opponent's don't count for you.
  assert.deepEqual(mulliganCost(log, 1, 7), { keep: 6, bottom: 1, taken: true });
});

test("mulligan cost: a free mulligan, Endstep's label, and a new game", () => {
  assert.deepEqual(mulliganCost([entry(1, "MULLIGAN", 0, "Me mulliganed to 7.")], 0, 7), { keep: 7, bottom: 0, taken: true });
  assert.deepEqual(mulliganCost([], 0, 7, "Keep 6"), { keep: 6, bottom: 1, taken: false });
  // Game 1's mulligans are behind the hand kept there.
  const log = [entry(1, "MULLIGAN", 0, "Me mulliganed to 6."), entry(2, "HAND_SETTLED", 0, "Me keeps 6 cards after 1 mulligan.")];
  assert.deepEqual(mulliganCost(log, 0, 7, "Keep 7"), { keep: 7, bottom: 0, taken: false });
});

test("mulligan hint", () => {
  assert.equal(mulliganHint({ keep: 7, bottom: 0, taken: false }, 7), "A mulligan draws a new hand of 7, then you put 1 card on the bottom of your library.");
  assert.equal(mulliganHint({ keep: 6, bottom: 1, taken: true }, 7), "You will put 1 card on the bottom of your library. Mulligan again: 2 cards.");
  assert.equal(mulliganHint({ keep: 7, bottom: 0, taken: true }, 7), "That mulligan was free: you keep all 7. Mulligan again: 1 card to the bottom.");
});

test("the opponent's mulligan: deciding, mulliganed, kept, and a new game", () => {
  assert.equal(mulliganStatus([], 1, "Your opponent"), "Your opponent is still choosing whether to keep their opening hand.");
  const log = [
    entry(1, "MULLIGAN", 1, "Forge AI mulliganed to 6."),
    entry(2, "MULLIGAN", 1, "Forge AI has mulliganed down to 6 cards."),
  ];
  assert.equal(mulliganStatus(log, 1, "Your opponent"), "Your opponent took a mulligan (to 6) and is choosing again.");
  log.push(entry(3, "HAND_KEPT", 1, "Forge AI kept 6."));
  assert.equal(mulliganStatus(log, 1, "Your opponent"), "Your opponent kept a hand of 6 cards.");
  // Your own choices aren't theirs.
  assert.equal(mulliganStatus(log, 0, "You"), "You is still choosing whether to keep their opening hand.");
  log.push(entry(4, "HAND_SETTLED", 1, "Forge AI keeps 6 cards after 1 mulligan."));
  assert.equal(mulliganStatus(log, 1, "Your opponent"), "Your opponent is still choosing whether to keep their opening hand.");
});
