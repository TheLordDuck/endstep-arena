import { test } from "node:test";
import assert from "node:assert/strict";
import { clearsAtEnd, loadYields, sameYields, saveYields, yieldKeyOf, yieldsAction } from "../src/game/endstep/autoYields";
import { AutoYieldSync } from "../src/game/AutoYieldSync";
import type { GameController } from "../src/game/GameController";
import type { GameState } from "../src/game/GameState";
import { ALLOWED_ACTIONS, type WireAction } from "../src/shared/protocol";

// Endstep's storage, in memory.
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
  window: { setTimeout: (f: () => void) => (f(), 0) },
});

function syncWithLog(): { sync: AutoYieldSync; sent: WireAction[]; answers: boolean[] } {
  const sent: WireAction[] = [];
  const answers: boolean[] = [];
  const controller = { setAutoYields: (a: WireAction) => sent.push(a), answer: (yes: boolean) => answers.push(yes) } as unknown as GameController;
  return { sync: new AutoYieldSync(controller), sent, answers };
}

const game = (over: Partial<GameState>) => ({ matchId: "m1", status: "IN_PROGRESS", ...over }) as GameState;

test("an ability is yielded by its text, without its source", () => {
  assert.equal(yieldKeyOf("Arid Mesa (960): {T}, Pay 1 life, Sacrifice Arid Mesa: Search your library."), "{T}, Pay 1 life, Sacrifice Arid Mesa: Search your library.");
  assert.equal(yieldKeyOf("Draw a card."), "Draw a card.");
});

test("auto-yields load as Endstep's client loads them: kept only when remembered on this device", () => {
  store.clear();
  assert.deepEqual(loadYields(), { abilities: new Set(), accept: new Set(), decline: new Set(), paused: false, scope: "match" });
  store.set("wr-auto-yield-scope", "device");
  store.set("wr-auto-yield-device", JSON.stringify({ abilityKeys: ["Draw a card.", 3], triggerAccept: ["You may gain 1 life."], triggerDecline: [] }));
  store.set("wr-auto-yield-paused", "1");
  const y = loadYields();
  assert.deepEqual([...y.abilities], ["Draw a card."]);
  assert.deepEqual([...y.accept], ["You may gain 1 life."]);
  assert.equal(y.paused, true);
  // Remembered for this match: what's on the device isn't read, and saving drops it.
  y.scope = "match";
  saveYields(y);
  assert.equal(store.get("wr-auto-yield-device"), undefined);
  assert.equal(loadYields().abilities.size, 0);
});

test("they're sent as Endstep's client sends them; holding priority pauses them", () => {
  const y = { abilities: new Set(["Draw a card."]), accept: new Set(["A"]), decline: new Set(["B"]), paused: false, scope: "game" as const };
  const action = yieldsAction(y, true);
  assert.deepEqual(action, { type: "SET_AUTO_YIELDS", autoYieldAbilityKeys: ["Draw a card."], triggerAccept: ["A"], triggerDecline: ["B"], autoYieldsDisabled: true });
  assert.ok(sameYields(action, y, true));
  assert.ok(!sameYields(action, y, false));
  assert.ok(!sameYields({ ...action, autoYieldAbilityKeys: [] }, y, true));
  // The page lets them through to Endstep's socket (it drops any type not allowed).
  assert.ok(ALLOWED_ACTIONS.has("SET_AUTO_YIELDS") && ALLOWED_ACTIONS.has("CLEAR_REMEMBERED_ORDERS"));
});

test("a game ending clears them as their scope says", () => {
  assert.ok(clearsAtEnd("game", false));
  assert.ok(!clearsAtEnd("match", false));
  assert.ok(clearsAtEnd("match", true));
  assert.ok(!clearsAtEnd("device", true));
});

test("the board's auto-yields win over the copy Endstep's client sends", () => {
  store.clear();
  const { sync, sent } = syncWithLog();
  sync.onState(game({}));
  assert.equal(sent.length, 1);
  // Once per game.
  sync.onState(game({}));
  assert.equal(sent.length, 1);
  sync.toggleAbility("Draw a card.");
  assert.deepEqual(sent.at(-1)?.autoYieldAbilityKeys, ["Draw a card."]);
  // Endstep's client sends its own (without it): ours goes again.
  sync.onOutbound({ type: "SET_AUTO_YIELDS", autoYieldAbilityKeys: [], triggerAccept: [], triggerDecline: [], autoYieldsDisabled: false });
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.at(-1)?.autoYieldAbilityKeys, ["Draw a card."]);
  // Ours coming back out isn't sent again.
  sync.onOutbound(sent.at(-1)!);
  assert.equal(sent.length, 3);
});

test("Yes and No for a trigger exclude each other, and forgetting clears them", () => {
  store.clear();
  const { sync } = syncWithLog();
  sync.toggleAnswer("You may draw a card.", true);
  sync.toggleAnswer("You may draw a card.", false);
  assert.deepEqual([...sync.get().accept], []);
  assert.deepEqual([...sync.get().decline], ["You may draw a card."]);
  sync.forgetAnswer(null);
  assert.equal(sync.get().decline.size, 0);
});

test("this match's auto-yields last until the match is over", () => {
  store.clear();
  const { sync } = syncWithLog();
  sync.toggleAbility("Draw a card.");
  sync.onState(game({ status: "COMPLETE", match: { game: 1, gamesPerMatch: 3, wins: {}, over: false } }));
  assert.equal(sync.get().abilities.size, 1);
  sync.onState(game({ status: "COMPLETE", match: { game: 2, gamesPerMatch: 3, wins: {}, over: true } }));
  assert.equal(sync.get().abilities.size, 0);
});

test("a trigger answered for good answers its effect's own question (Creeping Chill)", () => {
  store.clear();
  const { sync, answers } = syncWithLog();
  const key = "When Creeping Chill is put into your graveyard from your library, you may exile it.";
  const trigger = { id: "-1", name: key, isAbility: true, targets: [], optionalTrigger: true, triggerId: "1140415", yieldKey: key, card: { name: "Creeping Chill" } };
  const asking = (promptVersion: number, extra = {}) => game({
    stack: [trigger],
    pending: { type: "YES_NO", promptVersion, message: "Exile Creeping Chill?", sourceCardName: "Creeping Chill", ...extra },
  } as unknown as Partial<GameState>);
  // Not answered for good: asked as usual.
  sync.onState(asking(149));
  assert.deepEqual(answers, []);
  sync.toggleAnswer(key, true);
  sync.onState(asking(150));
  sync.onState(asking(150));
  assert.deepEqual(answers, [true]);
  // "Use triggered ability?" (with its trigger id) is the server's to answer; another card's question isn't this one.
  sync.onState(asking(151, { triggerId: "1140415" }));
  sync.onState(asking(152, { sourceCardName: "Narcomoeba" }));
  assert.deepEqual(answers, [true]);
  sync.toggleAnswer(key, false);
  sync.onState(asking(153));
  assert.deepEqual(answers, [true, false]);
});
