// Our code against the last Endstep deploy checked (tests/endstep-contract.json, written by
// `pnpm check:endstep --update`, which reads it from Endstep's own client). When Endstep changes,
// `pnpm check:endstep` says what; after updating the reference, these say what of ours to adapt.
import { test } from "node:test";
import assert from "node:assert/strict";
import contract from "./endstep-contract.json";
import { EndstepAdapter } from "../src/game/endstep/EndstepAdapter";
import { GameController } from "../src/game/GameController";
import { ALLOWED_ACTIONS } from "../src/shared/protocol";
import { EXTRA_FIELDS, PLAYER_FIELDS, PRIVATE_FIELDS, STATE_FIELDS, ZONES, isKnownHashVersion } from "../src/game/endstep/stateHash";
import { stopsAction } from "../src/game/endstep/phaseStops";
import { yieldsAction } from "../src/game/endstep/autoYields";

const actions = contract.actions as Record<string, string[]>;

test("the delta versions we apply are Endstep's", () => {
  const ours = [...Array(10).keys()].filter((v) => isKnownHashVersion(v));
  assert.deepEqual(ours, contract.deltas.hashVersions);
});

test("the fields we hash are Endstep's, in its order", () => {
  assert.deepEqual(STATE_FIELDS, contract.deltas.stateFields);
  assert.deepEqual(PLAYER_FIELDS, contract.deltas.playerFields);
  assert.deepEqual(ZONES, contract.deltas.zones);
  assert.deepEqual(PRIVATE_FIELDS, contract.deltas.privateFields);
  assert.deepEqual(EXTRA_FIELDS, contract.deltas.extraFields);
});

test("every socket pattern the tap relies on was found in Endstep's client", () => {
  const missing = Object.entries(contract.socket.markers).filter(([, found]) => !found).map(([name]) => name);
  assert.deepEqual(missing, []);
  assert.ok(contract.socket.inboundFrames?.includes("GAME_ATTACH_TICKET"), "the match's own socket (wsTap) is still how Endstep sends a game");
});

test("every action type we may send is one Endstep's client names", () => {
  const unknown = [...ALLOWED_ACTIONS].filter((t) => !contract.inventory.constants.includes(t));
  assert.deepEqual(unknown, []);
});

test("each action we send has the keys Endstep sends it with", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  a.handleFrame({
    type: "GAME_STATE", matchId: "m1", seq: 1, viewerSeat: 0,
    payload: { players: [{ battlefield: [] }, { battlefield: [] }], stack: [], pendingAction: { type: "PRIORITY", promptVersion: 3 } },
  });
  const s = a.getGameState()!;
  const sent: { type: string; [k: string]: unknown }[] = [];
  const c = new GameController(() => s, (_m, action) => sent.push(action));
  c.setPhaseStops({ myTurn: new Set(["UPKEEP"]), oppTurn: new Set() });
  c.setAutoYields(yieldsAction({ abilities: new Set(), accept: new Set(), decline: new Set(), paused: false, scope: "game" }, false));
  c.clearRememberedOrders();
  c.passPriority(); c.passPriority("passUntil"); c.resolveStack(); c.playCard("1"); c.tapMana("1"); c.useFloatingMana("C");
  c.payPhyrexianLife(); c.autoPay(); c.undo(); c.cancel(); c.no(); c.decline(); c.arrangeCards(["1"]);
  c.answer(true); c.answer(true, ["A", "B"]); c.keepHand(); c.mulligan(); c.mulliganSpecial("x");
  c.declareAttackers(new Map([["1", 0]]), false); c.declareAttackers(new Map([["2", 0]]), true); c.declareBlockers(new Map([["1", "2"]]));
  c.chooseTargets(["1"]); c.chooseCards(["1"]); c.chooseModes([0]); c.chooseNumber(1);
  for (const t of ["CHOOSE_COLOR", "CHOOSE_TYPE", "CHOOSE_MANA", "CHOOSE_PILE", "CHOOSE_CARD_NAME"] as const) c.chooseString(t, "x");
  c.submitSideboard([0]); c.withdrawSideboard();
  // Each kind of action once (a second combat declaration for the same prompt is held back).
  const wrong: string[] = [];
  for (const action of sent) {
    const shapes = actions[action.type];
    // Endstep builds some (ORDER_ATTACKERS…) with a variable type: only the name can be checked.
    if (!shapes) continue;
    // promptVersion is stamped on by the sender, and a spread (…) may add anything.
    const keys = Object.keys(action).filter((k) => k !== "type" && k !== "promptVersion").sort().join(",");
    const fits = shapes.some((shape) => {
      if (shape === "...") return true;
      const theirs = shape === "(none)" ? [] : shape.split(",").filter((k) => k !== "..." && k !== "promptVersion");
      return theirs.join(",") === keys || (shape.includes("...") && keys.split(",").every((k) => !k || theirs.includes(k)));
    });
    if (!fits) wrong.push(`${action.type} {${keys}}: Endstep sends ${shapes.join(" | ")}`);
  }
  assert.deepEqual(wrong, []);
  // The shapes not checked above are still built the way the tests of their own show.
  assert.deepEqual(Object.keys(stopsAction({ myTurn: new Set(), oppTurn: new Set() })).sort(), ["autoPassUntil", "phaseStopsMyTurn", "phaseStopsOppTurn", "type"]);
});
