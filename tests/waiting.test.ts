// What the board says the game is waiting for when it isn't your move.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, type Raw } from "../src/game/endstep/normalize";
import { waitingFor } from "../src/game/waiting";

const player = (name: string, battlefield: Raw[] = []) => ({ displayName: name, life: 20, battlefield, graveyard: [], exile: [], commandZone: [] });

function game(extra: Raw, me: Raw[] = [], opp: Raw[] = []) {
  const s = normalize({ phase: "MAIN1", turnNumber: 3, activePlayerId: "0", priorityPlayerId: "1", stack: [], pendingAction: null,
    players: [player("Flavio", me), player("Opponent", opp)], ...extra }, { matchId: "m", viewerSeat: 0, desynced: false });
  return { state: s, you: s.players.find((p) => p.isViewer)! };
}

test("your own prompt, a finished game or a replay: nothing to wait for", () => {
  const { state, you } = game({ pendingAction: { type: "PRIORITY", promptVersion: 1 } });
  assert.equal(waitingFor(state, you), null);
  const over = game({ status: "COMPLETE" });
  assert.equal(waitingFor(over.state, over.you), null);
});

test("the opponent has priority: in which step, or which spell of yours they can respond to", () => {
  const plain = game({});
  assert.deepEqual(waitingFor(plain.state, plain.you), { kind: "priority", playerId: "1", short: "Opponent's priority", text: "Opponent has priority · Main 1" });
  const yours = game({ stack: [{ stackTargetId: 9, sourceCard: { id: 9, name: "Lightning Bolt", controllerId: "0" } }] });
  assert.equal(waitingFor(yours.state, yours.you)!.text, "Opponent can respond to Lightning Bolt");
  const theirs = game({ stack: [{ stackTargetId: 9, sourceCard: { id: 9, name: "Shock", controllerId: "1" } }] });
  assert.equal(waitingFor(theirs.state, theirs.you)!.text, "Opponent has priority · Shock on the stack");
});

test("combat: the active player declaring attackers, the defender declaring blockers", () => {
  const attack = game({ phase: "DECLARE_ATTACKERS", activePlayerId: "1" });
  assert.equal(waitingFor(attack.state, attack.you)!.kind, "attackers");
  const block = game({ phase: "DECLARE_BLOCKERS" }, [{ id: 5, name: "Tarmogoyf", isAttacking: true, attackingDefenderId: "1" }]);
  assert.deepEqual(waitingFor(block.state, block.you), { kind: "blockers", playerId: "1", short: "Opponent blocking", text: "Opponent is declaring blockers" });
});

test("their idle timer runs while priority isn't theirs: they're making a choice", () => {
  const now = Date.now();
  const { state, you } = game({ priorityPlayerId: "0", idleTimeout: { seat: "1", deadlineMs: now + 40_000, serverNowMs: now } });
  assert.deepEqual(waitingFor(state, you), { kind: "deciding", playerId: "1", short: "Opponent deciding", text: "Opponent is deciding" });
});

test("nobody else to wait for with something on the stack: it's resolving", () => {
  const { state, you } = game({ priorityPlayerId: "0", stack: [{ stackTargetId: 9, sourceCard: { id: 9, name: "Opt", controllerId: "0" } }] });
  assert.deepEqual(waitingFor(state, you), { kind: "resolving", short: "Resolving…", text: "Resolving Opt…" });
});

test("spectating, the side watched from is named too", () => {
  const { state, you } = game({ priorityPlayerId: "0" });
  assert.equal(waitingFor({ ...state, spectating: true }, you)!.text, "Flavio has priority · Main 1");
});
