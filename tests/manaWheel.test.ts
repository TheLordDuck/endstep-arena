// Mana wheel options, and scry/surveil arrangements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wheelFromAbilities, wheelFromStrings } from "../src/ui/board/manaWheel";
import { arrangeMove, deriveMode, stepNumber } from "../src/ui/board/modes";
import { GameController } from "../src/game/GameController";
import { normalize } from "../src/game/endstep/normalize";
import type { WireAction } from "../src/shared/protocol";

test("CHOOSE_MANA color letters make a wheel; other answers don't", () => {
  assert.deepEqual(wheelFromStrings(["B", "G"])?.map((o) => o.symbols), [["B"], ["G"]]);
  assert.deepEqual(wheelFromStrings(["1. Add {B}{G}", "2. Add {R}"])?.map((o) => o.symbols), [["B", "G"], ["R"]]);
  assert.equal(wheelFromStrings(["B"]), null, "one color needs no choice");
  assert.equal(wheelFromStrings(["B", "Spend none"]), null);
});

test("a dual land's plain mana abilities make a wheel; other costs get ability cards", () => {
  const tomb = [{ index: 0, description: "{T}: Add {B}." }, { index: 1, description: "{T}: Add {G}." }];
  assert.deepEqual(wheelFromAbilities(tomb)?.map((o) => [o.key, o.symbols]), [["0", ["B"]], ["1", ["G"]]]);
  const town = [{ index: 0, description: "{T}: Add {C}." }, { index: 1, description: "{T}, Pay 1 life: Add one mana of any color." }];
  assert.equal(wheelFromAbilities(town), null);
});

test("surveil: cards move between the library and the graveyard; the top pile is sent", () => {
  const state = normalize({
    stack: [], players: [{}, {}],
    pendingAction: { type: "ARRANGE_CARDS", contextType: "surveil", promptVersion: 3, cardOptions: [{ id: 5, name: "A" }, { id: 6, name: "B" }] },
  }, { matchId: "m", viewerSeat: 0, desynced: false });
  let mode = deriveMode(state);
  assert.equal(mode.kind, "arrange");
  if (mode.kind !== "arrange") return;
  assert.equal(mode.hasTray, true);
  mode = arrangeMove(mode, "5", "tray");
  assert.deepEqual([mode.top, mode.tray], [["6"], ["5"]]);
  mode = arrangeMove(mode, "5", "top", 0);
  assert.deepEqual([mode.top, mode.tray], [["5", "6"], []]);
  const sent: WireAction[] = [];
  new GameController(() => state, (_m, a) => sent.push(a)).arrangeCards(mode.top);
  assert.deepEqual(sent, [{ type: "ARRANGE_CARDS", orderedCards: [5, 6], promptVersion: 3 }]);
});

test("X (CHOOSE_NUMBER) reads Endstep's minValue/maxValue/allowedValues and answers numberValue", () => {
  const raw = (pending: Record<string, unknown>) => normalize({ stack: [], players: [{}, {}], pendingAction: { type: "CHOOSE_NUMBER", promptVersion: 5, ...pending } },
    { matchId: "m", viewerSeat: 0, desynced: false });
  const s = raw({ minValue: 0, maxValue: 4, message: "Choose a value for X" });
  const p = s.pending!;
  assert.deepEqual([p.numberMin, p.numberMax, p.allowedNumbers], [0, 4, []]);
  const mode = deriveMode(s);
  assert.deepEqual(mode, { kind: "choice", selectedModes: [], number: 0 });
  assert.deepEqual([stepNumber(p, 0, 1), stepNumber(p, 4, 1), stepNumber(p, 0, -1), stepNumber(p, 1, 5)], [1, 4, 0, 4]);
  // Only some values allowed: − / + step through them.
  const q = raw({ allowedValues: [2, 5, 1] }).pending!;
  assert.deepEqual([q.numberMin, q.numberMax, q.allowedNumbers], [1, 5, [1, 2, 5]]);
  assert.deepEqual([stepNumber(q, 1, 1), stepNumber(q, 2, 1), stepNumber(q, 5, 1), stepNumber(q, 2, -1)], [2, 5, 5, 1]);
  const sent: WireAction[] = [];
  new GameController(() => s, (_m, a) => sent.push(a)).chooseNumber(3);
  assert.deepEqual(sent, [{ type: "CHOOSE_NUMBER", numberValue: 3, promptVersion: 5 }]);
});

test("an arrangement without a second pile can only be reordered", () => {
  const state = normalize({
    stack: [], players: [{}, {}],
    pendingAction: { type: "ARRANGE_CARDS", contextType: "library_top", cardOptions: [{ id: 5 }, { id: 6 }] },
  }, { matchId: "m", viewerSeat: 0, desynced: false });
  const mode = deriveMode(state);
  if (mode.kind !== "arrange") return assert.fail("expected arrange");
  assert.equal(arrangeMove(mode, "5", "tray"), mode);
  assert.deepEqual(arrangeMove(mode, "5", "top").top, ["6", "5"]);
});
