// Endstep's check of each delta (its stateHash / privHash), ported from its client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { playMatch } from "./realMatch";
import { EndstepAdapter } from "../src/game/endstep/EndstepAdapter";
import { applyDelta } from "../src/game/endstep/EndstepAdapter";
import { privateHash, stateHash } from "../src/game/endstep/stateHash";

test("every delta of the recorded matches hashes to what the server sent", () => {
  for (const name of ["arc-lightning", "bot-attacks", "bot-combats", "bot-trample"]) {
    const states = playMatch(name);
    assert.ok(states.length > 50, name);
    // Deltas applied (not the ones after a gap in the recording, out of sync for that reason).
    const applied = states.filter((s, i) => s.frame.data.type === "GAME_DELTA" && s.frame.data.payload?.baseSeq === states[i - 1]?.state.seq);
    assert.ok(applied.length > 50, name);
    assert.equal(applied.filter((s) => s.state.desynced).length, 0, name);
  }
});

const base = {
  phase: "PRECOMBAT_MAIN", turnNumber: 3, stack: [], pendingAction: null,
  players: [
    { life: 20, battlefield: [], graveyard: [], exile: [], commandZone: [], hand: [{ id: 1, name: "Mountain" }] },
    { life: 20, battlefield: [], graveyard: [], exile: [], commandZone: [] },
  ],
};

test("a hashV 3 delta is checked as Endstep checks it: zones by card, and what only you see", () => {
  const delta = {
    baseSeq: 1, hashV: 3, pendingAction: null,
    patch: { zones: [{ i: 0, battlefield: { a: [{ v: { id: 1, name: "Mountain" } }] } }], priv: { players: [{ i: 0, set: { hand: [] } }] } },
  };
  const next = applyDelta(base, delta, delta.patch);
  const frames = (stateHashValue: string) => [
    { type: "GAME_STATE", matchId: "m", seq: 1, viewerSeat: 0, payload: base },
    { type: "GAME_DELTA", matchId: "m", seq: 2, payload: { ...delta, stateHash: stateHashValue, privHash: privateHash(next) } },
  ];
  const good = new EndstepAdapter();
  good.setRoute("/game/m");
  for (const f of frames(stateHash(next, 3))) good.handleFrame(f);
  assert.equal(good.getGameState()!.desynced, false);
  assert.equal(good.getGameState()!.players[0]!.battlefield[0]!.name, "Mountain");
  // The hash differs (the card isn't the one the server meant): out of sync, still shown.
  const bad = new EndstepAdapter();
  bad.setRoute("/game/m");
  for (const f of frames(stateHash({ ...next, turnNumber: 4 }, 3))) bad.handleFrame(f);
  assert.equal(bad.getGameState()!.desynced, true);
  assert.equal(bad.getGameState()!.players[0]!.battlefield[0]!.name, "Mountain");
});

test("hashV 3 counts each card whole: a change the zone's ids don't show changes the hash", () => {
  const a = { ...base, players: [{ ...base.players[0], battlefield: [{ id: 5, tapped: false, counters: {} }] }, base.players[1]] };
  const b = { ...base, players: [{ ...base.players[0], battlefield: [{ id: 5, tapped: false, counters: { "+1/+1": 1 } }] }, base.players[1]] };
  assert.equal(stateHash(a, 2), stateHash(b, 2));
  assert.notEqual(stateHash(a, 3), stateHash(b, 3));
});
