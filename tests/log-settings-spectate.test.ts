// The game log (from Endstep's game events), the board's settings and spectating.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toLogEntry } from "../src/game/endstep/normalize";
import { EndstepAdapter, isSpectatePath, matchIdFromPath } from "../src/game/endstep/EndstepAdapter";
import { parseReplay } from "../src/game/endstep/replay";
import { cleanPrefs, DEFAULT_PREFS } from "../src/ui/board/prefs";
import { GameController } from "../src/game/GameController";

const player = (name: string, extra: Record<string, unknown> = {}) => ({
  displayName: name, life: 20, battlefield: [], graveyard: [], exile: [], commandZone: [], ...extra,
});

test("a game event becomes a log line: engine details cleaned off, card names kept", () => {
  const e = toLogEntry({
    type: "ABILITY_ACTIVATED", sequenceNumber: 12, playerIndex: "0", playerName: "Flavio", turnNumber: 6,
    message: "[[Tarmogoyf]]: Target creature gets +1/+1 (111) {targets=[Tarmogoyf (111)]}\nTargets: {targets=[Tarmogoyf (111)]}",
    cardId: 111, cardName: "Tarmogoyf",
  });
  assert.deepEqual(e, {
    seq: 12, type: "ABILITY_ACTIVATED", lines: ["[[Tarmogoyf]]: Target creature gets +1/+1"],
    seat: 0, playerName: "Flavio", turn: 6, cards: [{ id: "111", name: "Tarmogoyf" }],
  });
});

test("log lines: the cards named, each once; turns make a line with no text; some events none", () => {
  const e = toLogEntry({ type: "CARD_DAMAGED", message: "[[Lightning Bolt]] deals 3 damage to [[Grizzly Bears]].",
    cardIds: [5, 7], cardNames: ["Lightning Bolt", "Grizzly Bears"], cardId: 5, cardName: "Lightning Bolt" }, 3)!;
  assert.deepEqual(e.cards, [{ id: "5", name: "Lightning Bolt" }, { id: "7", name: "Grizzly Bears" }]);
  assert.equal(e.seq, 3);
  assert.equal(e.seat, undefined);
  const turn = toLogEntry({ type: "TURN_BEGAN", playerIndex: 1, turnNumber: 4 })!;
  assert.deepEqual([turn.type, turn.seat, turn.turn, turn.lines], ["TURN_BEGAN", 1, 4, []]);
  assert.equal(toLogEntry({ type: "TURN_PHASE", message: "Combat" }), null);
  assert.equal(toLogEntry({ type: "CARD_REVEALED", message: "Reveals [[Opt]]" }), null);
  assert.equal(toLogEntry({ type: "SPELL_CAST" }), null);
});

test("the adapter keeps the match's log, each event once, and starts a new one for a new match", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  const state = (matchId: string) => ({ type: "GAME_STATE", matchId, seq: 1, viewerSeat: 0, payload: { players: [player("A"), player("B")] } });
  const event = (matchId: string, n: number, message: string) => ({ type: "GAME_EVENT", matchId, payload: { type: "SPELL_CAST", sequenceNumber: n, message } });
  a.handleFrame(state("m1"));
  a.handleFrame(event("m1", 1, "A casts [[Opt]]."));
  a.handleFrame(event("m1", 2, "B casts [[Shock]]."));
  a.handleFrame(event("m1", 2, "B casts [[Shock]]."));
  assert.deepEqual(a.getGameState()!.log!.map((e) => e.lines[0]), ["A casts [[Opt]].", "B casts [[Shock]]."]);
  a.setRoute("/game/m2");
  a.handleFrame(state("m2"));
  assert.deepEqual(a.getGameState()!.log, []);
});

test("a replay keeps its events with their frame, and the log shows those up to the frame shown", () => {
  const header = JSON.stringify({ format: "endstep-replay", formatVersion: 1, seat: 0, players: [] });
  const key = (t: number) => JSON.stringify({ t, k: "key", state: { turnNumber: 1, players: [player("A"), player("B")] } });
  const ev = (t: number, n: number) => JSON.stringify({ t, k: "event", event: { type: "LAND_PLAYED", sequenceNumber: n, message: `land ${n}` } });
  const replay = parseReplay([header, ev(0, 1), key(1), ev(2, 2), key(3), ev(4, 3)].join("\n"));
  assert.deepEqual(replay.events.map((e) => e.frame), [0, 0, 1]);
  const a = new EndstepAdapter();
  a.setRoute("/replay/r1");
  const status = { frame: 0, frames: 2, playing: false, speed: 1, turn: 1, turnStarts: [0] };
  a.showReplay({ raw: replay.frames[0]!.raw, seat: 0, status, events: replay.events.filter((e) => e.frame <= 0).map((e) => e.event) });
  assert.deepEqual(a.getGameState()!.log!.map((e) => e.lines[0]), ["land 1", "land 2"]);
});

test("spectating: the route names the match, the state says so, and nothing is sent", () => {
  assert.equal(matchIdFromPath("/spectate/abc"), "abc");
  assert.equal(matchIdFromPath("/admin/spectate/abc"), "abc");
  assert.equal(matchIdFromPath("/game/abc"), "abc");
  assert.ok(isSpectatePath("/spectate/abc") && isSpectatePath("/admin/spectate/abc"));
  assert.ok(!isSpectatePath("/game/abc"));
  const a = new EndstepAdapter();
  a.setRoute("/spectate/m1");
  a.handleFrame({ type: "GAME_STATE", matchId: "m1", seq: 1, viewerSeat: 0,
    payload: { players: [player("A"), player("B")], pendingAction: { type: "PRIORITY", promptVersion: 1 } } });
  // Frames of another match aren't followed.
  a.handleFrame({ type: "GAME_STATE", matchId: "m2", seq: 1, viewerSeat: 0, payload: { players: [player("C"), player("D")] } });
  const state = a.getGameState()!;
  assert.equal(state.spectating, true);
  assert.equal(state.players[0]!.name, "A");
  const sent: unknown[] = [];
  new GameController(() => state, (_m, action) => sent.push(action)).passPriority();
  assert.deepEqual(sent, []);
});

test("stored settings: missing or out-of-range values fall back to the defaults", () => {
  assert.deepEqual(cleanPrefs(undefined), DEFAULT_PREFS);
  assert.deepEqual(cleanPrefs({ animations: false, animSpeed: 2.5, cardScale: 1.3, sound: false, volume: 0.2, logOpen: true }),
    { animations: false, animSpeed: 2.5, cardScale: 1.3, sound: false, volume: 0.2, logOpen: true });
  const bad = cleanPrefs({ animations: "no", animSpeed: 99, cardScale: -1, volume: 3, logOpen: 1 });
  assert.deepEqual(bad, DEFAULT_PREFS);
});
