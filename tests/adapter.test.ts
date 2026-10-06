// Frames here mirror the shapes found in Endstep's client bundle
// (see docs/ENDSTEP_ANALYSIS.md), not captured traffic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EndstepAdapter, matchIdFromPath } from "../src/game/endstep/EndstepAdapter";
import { imageUrl } from "../src/ui/board/cards";
import { GameController } from "../src/game/GameController";
import { ALLOWED_ACTIONS } from "../src/shared/protocol";

const player = (name: string, extra: Record<string, unknown> = {}) => ({
  displayName: name,
  life: 20,
  librarySize: 53,
  handSize: 7,
  battlefield: [],
  graveyard: [],
  exile: [],
  commandZone: [],
  ...extra,
});

const fullState = (seq: number, matchId = "m1") => ({
  type: "GAME_STATE",
  matchId,
  seq,
  viewerSeat: 0,
  payload: {
    phase: "PRECOMBAT_MAIN",
    step: "MAIN",
    turnNumber: 3,
    activePlayerId: "0",
    priorityPlayerId: "0",
    stack: [],
    pendingAction: { type: "PRIORITY", promptVersion: 7, cardOptions: [{ id: "c1", playableAbilities: [{}] }] },
    players: [
      player("Me", { hand: [{ id: "c1", name: "Lightning Bolt" }] }),
      player("Opp", {
        battlefield: [
          { id: "b1", name: "Grizzly Bears", tapped: true, power: 2, toughness: 2, isAttacking: true, attackingDefenderId: "0" },
        ],
      }),
    ],
  },
});

test("full state is normalized", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  a.handleFrame(fullState(10));
  const s = a.getGameState()!;
  assert.equal(s.matchId, "m1");
  assert.equal(s.viewerHasPriority, true);
  assert.equal(s.players[0]!.isViewer, true);
  assert.equal(s.players[0]!.hand?.[0]?.name, "Lightning Bolt");
  assert.equal(s.players[1]!.hand, null);
  assert.equal(s.players[1]!.battlefield[0]!.tapped, true);
  assert.deepEqual(s.combat.attacks, [{ fromId: "b1", toId: "0" }]);
  assert.equal(s.pending?.playable[0]?.cardId, "c1");
  assert.equal(s.pending?.playable[0]?.abilities.length, 1);
});

test("attached auras/equipment and class level are read from Endstep's fields", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  const frame = fullState(10);
  frame.payload.players[0] = player("Me", {
    battlefield: [
      { id: "k1", name: "Grizzly Bears", attachedCards: ["e1"] },
      { id: "e1", name: "Bonesplitter", attachedTo: "k1" },
      { id: "w1", name: "Wizard Class", classLevel: 2 },
    ],
  });
  a.handleFrame(frame);
  const [bears, equip, klass] = a.getGameState()!.players[0]!.battlefield;
  assert.deepEqual(bears!.attachmentIds, ["e1"]);
  assert.equal(equip!.attachedToId, "k1");
  assert.equal(klass!.classLevel, 2);
});

test("delta merges state and patches players by index", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  a.handleFrame(fullState(10));
  a.handleFrame({
    type: "GAME_DELTA",
    matchId: "m1",
    seq: 11,
    payload: { baseSeq: 10, hashV: 2, stateHash: "x", patch: { state: { priorityPlayerId: "1" }, players: [{ i: 0, life: 17 }] }, pendingAction: null },
  });
  const s = a.getGameState()!;
  assert.equal(s.seq, 11);
  assert.equal(s.players[0]!.life, 17);
  assert.equal(s.players[0]!.name, "Me", "untouched fields survive");
  assert.equal(s.players[1]!.life, 20);
  assert.equal(s.viewerHasPriority, false);
  assert.equal(s.pending, null, "pendingAction is replaced wholesale, like Endstep does");
});

test("delta gap marks desync until the next full state", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  a.handleFrame(fullState(10));
  a.handleFrame({ type: "GAME_DELTA", matchId: "m1", seq: 13, payload: { baseSeq: 12, patch: { players: [{ i: 0, life: 1 }] } } });
  assert.equal(a.getGameState()!.desynced, true);
  assert.equal(a.getGameState()!.players[0]!.life, 20, "gapped delta not applied");
  a.handleFrame(fullState(13));
  assert.equal(a.getGameState()!.desynced, false);
});

test("ATTACH frames are unwrapped; other matches are ignored on a game route", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  a.handleFrame({ type: "ATTACH", payload: { frames: [fullState(1, "other"), fullState(5, "m1")] } });
  assert.equal(a.getGameState()?.matchId, "m1");
  assert.equal(a.getGameState()?.seq, 5);
});

test("leaving the match route clears state", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  a.handleFrame(fullState(1));
  a.setRoute("/decks");
  assert.equal(a.getGameState(), null);
});

test("route parsing", () => {
  assert.equal(matchIdFromPath("/game/abc%20d"), "abc d");
  assert.equal(matchIdFromPath("/lobby"), null);
});

test("token images use Endstep's token printing, color and base stats", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  const frame = fullState(10);
  frame.payload.players[0] = player("Me", {
    battlefield: [
      { id: "t1", name: "Soldier", isToken: true, power: 3, toughness: 3, basePower: 1, baseToughness: 1,
        color: "W", tokenSetCode: "tdmu", tokenCollectorNumber: "4" },
      { id: "t2", name: "Grizzly Bears", isToken: true, isCopyOfRealCard: true, selectedSetCode: "m10", selectedCollectorNumber: "180" },
    ],
  });
  a.handleFrame(frame);
  const [soldier, copy] = a.getGameState()!.players[0]!.battlefield;
  assert.equal(imageUrl(soldier!), "/api/cards/token-image?name=Soldier&pow=1&tou=1&color=W&set=tdmu&cn=4");
  assert.equal(imageUrl(copy!), "/api/cards/image?name=Grizzly+Bears&_v=2&set=m10&cn=180");
});

test("trigger order: options are read and answered as Endstep's order box does", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  const frame = fullState(10);
  (frame.payload as Record<string, unknown>).pendingAction = {
    type: "ORDER_ABILITIES", promptVersion: 12,
    cardOptions: [
      { id: 950, name: "Soul Warden", description: "You gain 1 life.", sourceCardId: 40, declinable: false },
      { id: 951, name: "Impact Tremors", description: "Each opponent loses 1 life.", sourceCardId: 41, declinable: true },
    ],
  };
  a.handleFrame(frame);
  const s = a.getGameState()!;
  assert.deepEqual(s.pending!.orderOptions.map((o) => [o.id, o.name, o.description, o.sourceCardId, o.declinable]), [
    ["950", "Soul Warden", "You gain 1 life.", "40", false],
    ["951", "Impact Tremors", "Each opponent loses 1 life.", "41", true],
  ]);
  const sent: unknown[] = [];
  const c = new GameController(() => s, (_m, action) => sent.push(action));
  c.orderAbilities(["951", "950"], ["951"]);
  assert.deepEqual(sent, [{ type: "ORDER_ABILITIES", orderedCards: [951, 950], declinedCards: [951], promptVersion: 12 }]);
});

test("floating mana is spent the way Endstep does it", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  a.handleFrame(fullState(10));
  const s = a.getGameState()!;
  const sent: unknown[] = [];
  new GameController(() => s, (_m, action) => sent.push(action)).useFloatingMana("R");
  assert.deepEqual(sent, [{ type: "USE_FLOATING_MANA", stringValue: "R", promptVersion: 7 }]);
});

test("every action the UI can send is allowed through to Endstep", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  a.handleFrame(fullState(10));
  const s = a.getGameState()!;
  const sent: { type: string }[] = [];
  const c = new GameController(() => s, (_m, action) => sent.push(action));
  c.passPriority(); c.resolveStack(); c.playCard("1"); c.tapMana("1"); c.useFloatingMana("C"); c.autoPay(); c.undo(); c.cancel(); c.no();
  c.answer(true); c.answer(false); c.answer(true, ["A", "B"]); c.keepHand(); c.mulligan(); c.mulliganSpecial("x");
  c.declareAttackers(new Map([["1", 0]]), false); c.declareAttackers(new Map([["1", 0]]), true); c.declareBlockers(new Map([["1", "2"]]));
  c.chooseTargets(["1"]); c.chooseCards(["1"]); c.chooseModes([0]); c.chooseNumber(1);
  for (const t of ["CHOOSE_COLOR", "CHOOSE_TYPE", "CHOOSE_MANA", "CHOOSE_PILE", "CHOOSE_CARD_NAME"] as const) c.chooseString(t, "x");
  c.orderAbilities(["1"], []); c.orderCombatants("ORDER_ATTACKERS", ["1"]); c.orderCombatants("ORDER_BLOCKERS", ["1"]);
  const blocked = [...new Set(sent.map((x) => x.type))].filter((t) => !ALLOWED_ACTIONS.has(t));
  assert.deepEqual(blocked, []);
});

test("a disconnected player carries the deadline, moved to the local clock, until they return", () => {
  const a = new EndstepAdapter();
  a.handleFrame(fullState(1));
  const now = Date.now();
  a.handleFrame({ type: "SEAT_CONNECTIVITY", payload: { matchId: "m1", playerIndex: 1, connected: false, graceDeadline: 1_000_090_000, serverNowMs: 1_000_000_000 } });
  const deadline = a.getGameState()!.players[1]!.disconnected?.deadline ?? 0;
  assert.ok(Math.abs(deadline - (now + 90_000)) < 1000);
  assert.equal(a.getGameState()!.players[0]!.disconnected, undefined);
  a.handleFrame({ type: "SEAT_CONNECTIVITY", payload: { matchId: "m1", playerIndex: 1, connected: true } });
  assert.equal(a.getGameState()!.players[1]!.disconnected, undefined);
  // Another match's frames are ignored.
  a.handleFrame({ type: "SEAT_CONNECTIVITY", payload: { matchId: "other", playerIndex: 1, connected: false } });
  assert.equal(a.getGameState()!.players[1]!.disconnected, undefined);
});

test("a disconnect with the seat as a string, or no match id, still counts", () => {
  const a = new EndstepAdapter();
  a.handleFrame(fullState(1));
  a.handleFrame({ type: "SEAT_CONNECTIVITY", payload: { matchId: null, playerIndex: "1", connected: false, graceDeadline: 5_000, serverNowMs: 1_000 } });
  assert.ok(a.getGameState()!.players[1]!.disconnected);
  a.handleFrame({ type: "SEAT_CONNECTIVITY", playerIndex: 1, connected: true });
  assert.equal(a.getGameState()!.players[1]!.disconnected, undefined);
});
