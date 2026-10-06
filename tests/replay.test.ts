// Replays: Endstep's .esreplay format (shapes from its client bundle), played on the board.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { applyReplayPatch, decodeReplay, parseReplay } from "../src/game/endstep/replay";
import { ReplayPlayer } from "../src/game/ReplayPlayer";
import { EndstepAdapter } from "../src/game/endstep/EndstepAdapter";

const player = (name: string, extra: Record<string, unknown> = {}) => ({
  displayName: name, life: 20, battlefield: [], graveyard: [], exile: [], commandZone: [], ...extra,
});

test("patches replace values, patch and delete keys, and rebuild arrays by id", () => {
  const prev = { life: 20, gone: 1, cards: [{ id: 1, tapped: false }, { id: 2, tapped: false }] };
  const next = applyReplayPatch(prev, {
    o: {
      life: { s: 17 },
      cards: { a: [{ id: 2, p: { o: { tapped: { s: true } } } }, { v: { id: 3, tapped: false } }] },
    },
    d: ["gone"],
  });
  assert.deepEqual(next, { life: 17, cards: [{ id: 2, tapped: true }, { id: 3, tapped: false }] });
  // The previous state is left as it was.
  assert.equal(prev.life, 20);
  assert.equal(prev.cards[1]!.tapped, false);
});

const header = JSON.stringify({ format: "endstep-replay", formatVersion: 1, seat: 1, players: [{ seat: 0, name: "A" }, { seat: 1, name: "B" }] });
const key = (t: number, turn: number) => JSON.stringify({ t, k: "key", state: { turnNumber: turn, players: [player("A"), player("B")] } });
const lifeDiff = (t: number, life: number) => JSON.stringify({ t, k: "diff", patch: { o: { players: { a: [{ v: player("A", { life }) }, { v: player("B") }] } } } });
const turnDiff = (t: number, turn: number) => JSON.stringify({ t, k: "diff", patch: { o: { turnNumber: { s: turn } } } });
const file = [header, key(0, 1), JSON.stringify({ t: 5, k: "event", event: { type: "PLAYER_DAMAGED" } }), lifeDiff(10, 17), turnDiff(20, 2), lifeDiff(30, 15)].join("\n");

test("each key or diff is a frame; events and other records aren't", () => {
  const r = parseReplay(file);
  assert.equal(r.seat, 1);
  assert.deepEqual(r.frames.map((f) => [f.t, f.turn]), [[0, 1], [10, 1], [20, 2], [30, 2]]);
  assert.equal((r.frames[3]!.raw.players as { life: number }[])[0]!.life, 15);
});

test("a gzipped file decodes; anything else is refused", async () => {
  const gz = gzipSync(file);
  const r = await decodeReplay(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) as ArrayBuffer);
  assert.equal(r.frames.length, 4);
  await assert.rejects(decodeReplay(new TextEncoder().encode(file).buffer as ArrayBuffer));
  assert.throws(() => parseReplay('{"format":"something-else"}'));
});

test("the player steps by change and by turn, and seeks", () => {
  const p = new ReplayPlayer(() => {});
  p.load(parseReplay(file));
  assert.deepEqual(p.status()!.turnStarts, [0, 2]);
  p.command({ kind: "step", delta: 1 });
  assert.equal(p.status()!.frame, 1);
  p.command({ kind: "turn", delta: 1 });
  assert.equal(p.status()!.frame, 2);
  p.command({ kind: "step", delta: 5 });
  assert.equal(p.status()!.frame, 3);
  // Back a turn: the start of this one first, then the one before.
  p.command({ kind: "turn", delta: -1 });
  assert.equal(p.status()!.frame, 2);
  p.command({ kind: "turn", delta: -1 });
  assert.equal(p.status()!.frame, 0);
  p.command({ kind: "seek", frame: 99 });
  assert.equal(p.status()!.frame, 3);
});

test("on a replay page the adapter shows the replay, without a prompt, and ignores live frames", () => {
  const a = new EndstepAdapter();
  const r = parseReplay(file);
  a.setRoute("/replay/abc");
  a.handleFrame({ type: "GAME_STATE", matchId: "live", seq: 1, viewerSeat: 0, payload: { players: [player("X"), player("Y")] } });
  assert.equal(a.getGameState(), null);
  const status = { frame: 1, frames: 4, playing: false, speed: 1, turn: 1, turnStarts: [0, 2] };
  a.showReplay({ raw: { ...r.frames[1]!.raw, pendingAction: { type: "PRIORITY", promptVersion: 3 } }, seat: r.seat, status });
  const s = a.getGameState()!;
  assert.equal(s.replay, status);
  assert.equal(s.pending, null);
  assert.equal(s.viewerSeat, 1);
  assert.equal(s.players[0]!.life, 17);
  // Leaving the replay page drops it.
  a.setRoute("/history");
  assert.equal(a.getGameState(), null);
});
