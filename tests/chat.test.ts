import { test } from "node:test";
import assert from "node:assert/strict";
import { MatchChat } from "../src/game/endstep/chat";
import { EndstepAdapter } from "../src/game/endstep/EndstepAdapter";
import { isChatCommand, COMMAND_TAG } from "../src/shared/protocol";
import type { GameState } from "../src/game/GameState";

const chat = (message: string, extra: Record<string, unknown> = {}, frame: Record<string, unknown> = {}) =>
  ({ type: "CHAT", matchId: "m1", timestamp: 1000, payload: { message, messageId: `id-${message}`, userId: "u2", username: "Rival", senderRole: "player", matchId: "m1", ...extra }, ...frame });

test("chat frames belong to a match as Endstep reads them", () => {
  assert.equal(MatchChat.matchOf(chat("hi")), "m1");
  assert.equal(MatchChat.matchOf({ type: "CHAT", payload: { message: "hi", matchId: "m2" } }), "m2");
  assert.equal(MatchChat.matchOf({ type: "CHAT", matchId: "m3", payload: { message: "hi" } }), "m3");
  // A lobby's chat, or a frame naming two different matches, isn't a match's.
  assert.equal(MatchChat.matchOf({ type: "CHAT", payload: { message: "hi", lobbyId: "l1" } }), null);
  assert.equal(MatchChat.matchOf({ type: "CHAT", matchId: "a", payload: { message: "hi", matchId: "b" } }), null);
});

test("messages are kept once each, yours marked, a hidden writer named Opponent", () => {
  const c = new MatchChat();
  assert.equal(c.view(), undefined);
  assert.equal(c.handle(chat("hello"), "Me", 0), true);
  assert.equal(c.handle(chat("hello"), "Me", 0), false);
  c.handle(chat("mine", { username: "Me", userId: "u1", messageId: "x" }), "Me", 0);
  c.handle(chat("who?", { identityHidden: true, messageId: "y" }), "Me", 0);
  c.handle(chat("watching", { username: "Fan", senderRole: "spectator", messageId: "z" }), "Me", 0);
  const v = c.view(0)!;
  assert.deepEqual(v.messages.map((m) => [m.username, m.text, m.mine, m.role]), [
    ["Rival", "hello", false, "player"], ["Me", "mine", true, "player"], ["Opponent", "who?", false, "player"], ["Fan", "watching", false, "spectator"],
  ]);
  assert.equal(v.messages[0]!.ts, 1000);
});

test("a message sent from the board shows at once and is replaced by the server's echo", () => {
  const c = new MatchChat();
  c.addSent("c1", "gg", "Me", false, 5);
  assert.deepEqual(c.view(5)!.messages.map((m) => [m.text, m.pending, m.mine]), [["gg", true, true]]);
  c.handle(chat("gg", { username: "Me", userId: "u1", messageId: "s1", clientMessageId: "c1" }), "Me", 6);
  const [m] = c.view(6)!.messages;
  assert.equal(c.view(6)!.messages.length, 1);
  assert.equal(m!.id, "s1");
  assert.equal(m!.pending, undefined);
  assert.equal(m!.mine, true);
});

test("a refused message goes away, with Endstep's reason", () => {
  const c = new MatchChat();
  c.addSent("c2", "spam", "Me", false, 0);
  c.handle({ type: "CHAT_REFUSED", matchId: "m1", payload: { reason: "quick_replies_only", clientMessageId: "c2" } }, "Me", 0);
  const v = c.view(100)!;
  assert.equal(v.messages.length, 0);
  assert.equal(v.notice?.text, "Your chat is muted. You can only send quick replies.");
  assert.equal(c.view(60_000), undefined);
});

test("who's typing: for a few seconds, not you, and not once they've written", () => {
  const c = new MatchChat();
  const typing = (username: string, active: boolean) => ({ type: "CHAT_TYPING", matchId: "m1", payload: { scope: "match", id: "m1", userId: username, username, active } });
  assert.equal(c.handle(typing("Me", true), "Me", 0), false);
  c.handle(typing("Rival", true), "Me", 0);
  assert.deepEqual(c.view(1000)!.typing.map((t) => t.name), ["Rival"]);
  assert.equal(c.view(5000), undefined);
  c.handle(typing("Rival", true), "Me", 0);
  c.handle(chat("done typing"), "Me", 10);
  assert.deepEqual(c.view(20)!.typing, []);
});

test("the adapter keeps the shown match's chat, and drops it with the match", () => {
  const a = new EndstepAdapter();
  a.setRoute("/game/m1");
  let last: GameState | null = null;
  a.subscribe((s) => (last = s));
  a.handleFrame({ type: "GAME_STATE", matchId: "m1", seq: 1, viewerSeat: 0, payload: { players: [{ name: "Me" }, { name: "Rival" }], stack: [] } });
  a.handleFrame(chat("hi"));
  a.handleFrame(chat("other match", { matchId: "m9", messageId: "o" }, { matchId: "m9" }));
  a.handleFrame({ type: "ATTACH", payload: { frames: [chat("from attach", { messageId: "att" })] } });
  assert.deepEqual(last!.chat?.messages.map((m) => m.text), ["hi", "from attach"]);
  a.addSentChat("c9", "hello back");
  assert.deepEqual(last!.chat?.messages.at(-1), { id: "pending:c9", username: "Me", text: "hello back", ts: last!.chat!.messages.at(-1)!.ts, mine: true, role: "player", pending: true, clientMessageId: "c9" });
  a.handleFrame({ type: "GAME_STATE", matchId: "m2", seq: 1, viewerSeat: 0, payload: { players: [{ name: "Me" }], stack: [] } });
  a.setRoute("/game/m2");
  assert.equal(last, null);
});

test("chat commands to the tap: a message or typing, for a match", () => {
  assert.equal(isChatCommand({ tag: COMMAND_TAG, kind: "send-chat", matchId: "m1", message: "hi", clientMessageId: "c" }), true);
  assert.equal(isChatCommand({ tag: COMMAND_TAG, kind: "chat-typing", matchId: "m1", active: true }), true);
  assert.equal(isChatCommand({ tag: COMMAND_TAG, kind: "send-chat", matchId: "", message: "hi", clientMessageId: "c" }), false);
  assert.equal(isChatCommand({ tag: COMMAND_TAG, kind: "send-action", matchId: "m1", action: { type: "CHAT" } }), false);
});
