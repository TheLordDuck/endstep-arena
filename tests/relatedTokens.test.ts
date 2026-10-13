import { test } from "node:test";
import assert from "node:assert/strict";
import { createsTokens, tokensFromCard } from "../src/ui/board/relatedTokens";

test("only cards whose text makes tokens are looked up", () => {
  assert.equal(createsTokens("Create two 1/1 white Soldier creature tokens."), true);
  assert.equal(createsTokens("Whenever you cast an artifact spell, create a 1/1 colorless Drone artifact creature token with flying."), true);
  assert.equal(createsTokens("When this creature dies, scry 1 and create a Treasure token."), true);
  assert.equal(createsTokens("Lightning Bolt deals 3 damage to any target."), false);
  assert.equal(createsTokens("Destroy target token."), false);
  assert.equal(createsTokens(undefined), false);
});

test("the tokens among a card's related cards, once each, at most three", () => {
  const raise = {
    name: "Raise the Alarm",
    all_parts: [
      { component: "combo_piece", name: "Raise the Alarm", type_line: "Instant", id: "a" },
      { component: "token", name: "Soldier", type_line: "Token Creature — Soldier", id: "b" },
      { component: "token", name: "Soldier", type_line: "Token Creature — Soldier", id: "c" },
    ],
  };
  assert.deepEqual(tokensFromCard(raise), [
    { name: "Soldier", typeLine: "Token Creature — Soldier", image: "https://api.scryfall.com/cards/b?format=image&version=normal" },
  ]);
  const many = { name: "X", all_parts: ["A", "B", "C", "D"].map((n) => ({ component: "token", name: n, type_line: `Token ${n}`, id: n })) };
  assert.deepEqual(tokensFromCard(many).map((t) => t.name), ["A", "B", "C"]);
  // A token's own entry isn't a token it makes.
  assert.deepEqual(tokensFromCard({ name: "Soldier", all_parts: [{ component: "token", name: "Soldier", id: "b" }] }), []);
  assert.deepEqual(tokensFromCard({ name: "Bolt" }), []);
});
