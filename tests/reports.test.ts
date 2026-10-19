import { test } from "node:test";
import assert from "node:assert/strict";
import { matchIdFromPath, reportBody, reportSubjects } from "../src/game/endstep/reports";

test("a stalling report can name the other people in the match, not bots or the viewer", () => {
  const info = {
    myPlayerIndex: 0,
    participants: [
      { userId: "u-me", username: "Me" },
      { userId: "u-opp", username: "Rival" },
      { userId: "u-bot", username: "Bot", isBot: true },
      { userId: "u-ai", username: "AI", isAi: true },
    ],
  };
  assert.deepEqual(reportSubjects(info), [{ userId: "u-opp", username: "Rival" }]);
  assert.deepEqual(reportSubjects({}), []);
  assert.deepEqual(reportSubjects(null), []);
});

test("the match id comes from a game page's path", () => {
  assert.equal(matchIdFromPath("/game/16048950"), "16048950");
  assert.equal(matchIdFromPath("/replay/12"), undefined);
});

test("a report is sent as Endstep's form sends it", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const body = reportBody({ kind: "bug", description: "  The stack froze.  ", images: [{ kind: "pasted", dataUrl: png }, { kind: "image", dataUrl: "not a data url" }] },
    { gameId: 7 }, { route: "/game/42" }, "/game/42");
  assert.deepEqual(body, {
    kind: "bug",
    description: "The stack froze.",
    context: { route: "/game/42", matchId: "42", gameId: 7 },
    diagnostics: { route: "/game/42" },
    attachments: [{ kind: "pasted", mime: "image/png", dataBase64: "iVBORw0KGgo=" }],
  });
});

test("a stalling report names who it's about; other kinds don't", () => {
  const stalling = reportBody({ kind: "stalling", description: "No moves for 5 minutes.", subjectUserId: "u-opp", images: [] }, {}, {}, "/game/1");
  assert.equal(stalling.subjectUserId, "u-opp");
  assert.equal(stalling.kind, "stalling");
  const bug = reportBody({ kind: "suggestion", description: "x", subjectUserId: "u-opp", images: [] }, {}, {}, "/game/1");
  assert.equal("subjectUserId" in bug, false);
});
