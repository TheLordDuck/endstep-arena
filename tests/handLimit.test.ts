import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../src/game/endstep/normalize";
import { handLimitWarning } from "../src/ui/board/handLimit";

type Raw = Record<string, unknown>;
const card = (name: string, extra: Raw = {}) => ({ id: Math.floor(Math.random() * 1e9), name, ...extra });

function game(handSize: number, over: Raw = {}, battlefield: Raw[] = []) {
  const me = { battlefield, graveyard: [], exile: [], commandZone: [], hand: Array.from({ length: handSize }, () => card("Island")) };
  const opp = { battlefield: [], graveyard: [], exile: [], commandZone: [] };
  const state = normalize({ phase: "MAIN2", turnNumber: 4, activePlayerId: "0", stack: [], players: [me, opp], ...over },
    { matchId: "m", viewerSeat: 0, desynced: false });
  return { state, me: state.players.find((p) => p.isViewer)! };
}

test("hand size warning: more than seven on your turn", () => {
  const { state, me } = game(9);
  assert.equal(handLimitWarning(state, me), "You will discard 2 cards at the end of your turn (hand size 9, maximum 7)");
  const seven = game(7);
  assert.equal(handLimitWarning(seven.state, seven.me), undefined);
});

test("hand size warning: not on their turn, nor with no maximum hand size", () => {
  const theirs = game(9, { activePlayerId: "1" });
  assert.equal(handLimitWarning(theirs.state, theirs.me), undefined);
  const tower = game(9, {}, [card("Reliquary Tower", { oracleText: "You have no maximum hand size.\n{T}: Add {C}." })]);
  assert.equal(handLimitWarning(tower.state, tower.me), undefined);
});
