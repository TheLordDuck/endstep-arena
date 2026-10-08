// Match clocks, idle timers, "Pass until…" and the keyword glossary. The clock and idle shapes are
// the ones Endstep's own match clock and idle banner read (see docs/ENDSTEP_ANALYSIS.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, toClock, toIdle, type Raw } from "../src/game/endstep/normalize";
import { EndstepAdapter } from "../src/game/endstep/EndstepAdapter";
import { clockLeft, type GameState } from "../src/game/GameState";
import { passUntilStep, passUntilStops, startPassUntil } from "../src/game/passUntil";
import { keywordNotes } from "../src/ui/board/keywords";

test("the match clock: the running side counts down to a deadline moved to our clock", () => {
  const clock = toClock({ serverNowMs: 10_000, runningSide: "1", runningSideDeadlineMs: 70_000, remainingMs: [300_000, 65_000] }, { serverSkew: 4_000 });
  assert.ok(clock);
  assert.equal(clock.running, "1");
  assert.equal(clock.deadline, 66_000);
  assert.equal(clockLeft(clock, "1", 36_000), 30_000);
  // The side not running keeps its time.
  assert.equal(clockLeft(clock, "0", 36_000), 300_000);
});

test("the match clock reads the older player0RemainingMs fields too", () => {
  const clock = toClock({ serverNowMs: 1, player0RemainingMs: 1_000, player1RemainingMs: 2_000, timedOutSide: "0" }, { serverSkew: 0 });
  assert.deepEqual(clock, { left: { 0: 1_000, 1: 2_000 }, running: undefined, deadline: undefined, timedOut: "0" });
});

test("a replay's clock is frozen at that moment", () => {
  const clock = toClock({ serverNowMs: 10_000, runningSide: "0", runningSideDeadlineMs: 25_000, remainingMs: [0, 50_000] }, { frozen: true });
  assert.equal(clock?.deadline, undefined);
  assert.equal(clock && clockLeft(clock, "0", Date.now()), 15_000);
});

test("no clock, or one with nothing in it, is no clock", () => {
  assert.equal(toClock(undefined, {}), undefined);
  assert.equal(toClock({ serverNowMs: 5 }, {}), undefined);
});

test("the idle timer names the seat and moves its deadline to our clock", () => {
  assert.deepEqual(toIdle({ seat: "1", deadlineMs: 90_000, serverNowMs: 10_000, away: true, graceMs: 20_000 }, { serverSkew: 10_000 }),
    { playerId: "1", deadline: 80_000, away: true, graceMs: 20_000 });
  assert.equal(toIdle({ seat: "0", deadlineMs: 1 }, { frozen: true }), undefined);
});

test("the adapter keeps the largest server skew seen, so a slow frame doesn't move the deadline", () => {
  const adapter = new EndstepAdapter();
  const player = { displayName: "P", battlefield: [], graveyard: [], exile: [], commandZone: [] };
  const now = Date.now();
  const frame = (seq: number, serverNowMs: number) => ({
    type: "GAME_STATE", matchId: "m", seq, viewerSeat: 0,
    payload: { players: [player, player], clock: { serverNowMs, runningSide: "0", runningSideDeadlineMs: serverNowMs + 60_000, remainingMs: [60_000, 60_000] } },
  });
  // The server is 5 s ahead; the second frame took 2 s longer to arrive.
  adapter.handleFrame(frame(1, now + 5_000));
  adapter.handleFrame(frame(2, now + 5_000 + 1_000 - 2_000));
  const deadline = adapter.getGameState()?.clock?.deadline ?? 0;
  // Its deadline is read with the first frame's skew: 59 s from (about) now, not 61.
  assert.ok(Math.abs(deadline - (now + 59_000)) < 200, `deadline ${deadline - now}`);
});

// ---------------------------------------------------------------- pass until

function game(over: Partial<Raw> = {}): GameState {
  const player = { battlefield: [], graveyard: [], exile: [], commandZone: [] };
  return normalize({
    phase: "MAIN1", turnNumber: 4, activePlayerId: "0", priorityPlayerId: "0", stack: [],
    players: [player, player],
    pendingAction: { type: "PRIORITY", promptVersion: 1 },
    ...over,
  }, { matchId: "m", viewerSeat: 0, desynced: false });
}

test("passing until combat passes in main 1 and stops at the start of combat", () => {
  const pu = startPassUntil("combat", game());
  assert.equal(passUntilStep(pu, game()), "pass");
  assert.equal(passUntilStep(pu, game({ phase: "BEGIN_COMBAT" })), "stop");
});

test("passing until combat from a combat goes on to the next one", () => {
  const pu = startPassUntil("combat", game({ phase: "DECLARE_BLOCKERS", activePlayerId: "1" }));
  assert.equal(passUntilStep(pu, game({ phase: "END_COMBAT", activePlayerId: "1" })), "pass");
  assert.equal(passUntilStep(pu, game({ phase: "MAIN1", turnNumber: 5 })), "pass");
  assert.equal(passUntilStep(pu, game({ phase: "BEGIN_COMBAT", turnNumber: 5 })), "stop");
});

test("passing until the end step stops there, or at the next turn", () => {
  const pu = startPassUntil("endStep", game());
  assert.equal(passUntilStep(pu, game({ phase: "MAIN2" })), "pass");
  assert.equal(passUntilStep(pu, game({ phase: "END_STEP" })), "stop");
  assert.equal(passUntilStep(pu, game({ phase: "UPKEEP", turnNumber: 5, activePlayerId: "1" })), "stop");
});

test("passing until the opponent's end step stops at it", () => {
  const pu = startPassUntil("oppEndStep", game());
  assert.equal(passUntilStep(pu, game({ phase: "END_STEP" })), "pass");
  assert.equal(passUntilStep(pu, game({ phase: "MAIN2", turnNumber: 5, activePlayerId: "1" })), "pass");
  assert.equal(passUntilStep(pu, game({ phase: "END_STEP", turnNumber: 5, activePlayerId: "1" })), "stop");
});

test("End turn stops when the turn is over", () => {
  const pu = startPassUntil("endTurn", game());
  assert.equal(passUntilStep(pu, game({ phase: "END_STEP" })), "pass");
  assert.equal(passUntilStep(pu, game({ phase: "UPKEEP", turnNumber: 5, activePlayerId: "1" })), "stop");
});

test("passing attacks with nothing on the way, but stops for a combat it was asked to reach", () => {
  const attack = { pendingAction: { type: "DECLARE_ATTACKERS", promptVersion: 2 }, phase: "DECLARE_ATTACKERS" };
  assert.equal(passUntilStep(startPassUntil("endStep", game()), game(attack)), "no-attack");
  assert.equal(passUntilStep(startPassUntil("combat", game()), game(attack)), "stop");
});

test("an opponent's new spell, any other question, or the game's end stops passing", () => {
  const pu = startPassUntil("oppEndStep", game());
  const spell = { stackTargetId: 9, sourceCard: { id: 9, name: "Lightning Bolt", controllerId: "1" } };
  assert.equal(passUntilStep(pu, game({ stack: [spell] })), "stop");
  assert.equal(passUntilStep(pu, game({ pendingAction: { type: "CHOOSE_TARGETS", promptVersion: 3 } })), "stop");
  assert.equal(passUntilStep(pu, game({ status: "COMPLETE" })), "stop");
  // No prompt (the opponent has priority): wait for the next state.
  assert.equal(passUntilStep(pu, game({ pendingAction: null, priorityPlayerId: "1" })), "wait");
});

test("a spell of yours already on the stack doesn't stop passing", () => {
  const mine = { stackTargetId: 9, sourceCard: { id: 9, name: "Opt", controllerId: "0" } };
  const pu = startPassUntil("endStep", game({ stack: [mine] }));
  assert.equal(passUntilStep(pu, game({ stack: [mine] })), "pass");
});

test("passing adds the stop it has to arrive at", () => {
  const mine = game();
  assert.deepEqual(passUntilStops(startPassUntil("combat", mine)), { myTurn: ["BEGIN_COMBAT"] });
  assert.deepEqual(passUntilStops(startPassUntil("endStep", game({ activePlayerId: "1" }))), { oppTurn: ["END_STEP"] });
  assert.deepEqual(passUntilStops(startPassUntil("oppEndStep", mine)), { oppTurn: ["END_STEP"] });
});

// ---------------------------------------------------------------- keyword glossary

const names = (c: Parameters<typeof keywordNotes>[0]) => keywordNotes(c).map((k) => k.name);

test("keywords come from the card's text in order, each once", () => {
  assert.deepEqual(names({ oracleText: "Flying, vigilance\nWhenever Serra Angel attacks, it gains flying." }), ["Flying", "Vigilance"]);
  assert.deepEqual(names({ oracleText: "Double strike, trample" }), ["Double strike", "Trample"]);
  assert.deepEqual(names({ oracleText: "Ward {2}\nProtection from red" }), ["Ward", "Protection"]);
});

test("a keyword inside another word, or in reminder text, isn't one", () => {
  assert.deepEqual(names({ oracleText: "Flashback {2}{R} (You may cast this card from your graveyard for its flashback cost.)" }), ["Flashback"]);
  assert.deepEqual(names({ oracleText: "Equipped creature gets +2/+0. Enchanted creature can't block." }), []);
});

test("keywords given by an effect are explained too, and landwalk by its land", () => {
  assert.deepEqual(names({ oracleText: "Islandwalk", keywordsGranted: ["Trample", "Hexproof from blue", "Flying"] }), ["Landwalk", "Trample", "Hexproof", "Flying"]);
});

test("every keyword has its text", () => {
  for (const k of keywordNotes({ oracleText: "Deathtouch, lifelink, haste. Scry 2." })) assert.ok(k.text.length > 10, k.name);
});
