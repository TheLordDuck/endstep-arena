import { test } from "node:test";
import assert from "node:assert/strict";
import { createsTokens, hasTwoPictures, isDoubleFaced, otherFace, tokensFromCard } from "../src/ui/board/relatedTokens";

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

test("only cards with a picture on each side have another face to show", () => {
  const pic = { normal: "x" };
  assert.equal(hasTwoPictures({ name: "Delver of Secrets // Insectile Aberration", card_faces: [{ image_uris: pic }, { image_uris: pic }] }), true);
  // Split cards and adventures: two faces on one picture.
  assert.equal(hasTwoPictures({ name: "Fire // Ice", card_faces: [{}, {}] }), false);
  assert.equal(hasTwoPictures({ name: "Lightning Bolt" }), false);
});

test("a double-faced card's other face is named by the face it isn't showing", async () => {
  const pic = { normal: "x" };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    name: "Delver of Secrets // Insectile Aberration",
    card_faces: [{ name: "Delver of Secrets", image_uris: pic }, { name: "Insectile Aberration", image_uris: pic }],
  }))) as typeof fetch;
  try {
    assert.equal(await isDoubleFaced("Insectile Aberration"), true);
    assert.equal(await isDoubleFaced("Delver of Secrets"), true);
  } finally {
    globalThis.fetch = realFetch;
  }
  // Transformed, named by its back face (with or without isTransformed): the other face is the front.
  assert.deepEqual(otherFace("Insectile Aberration", false), { name: "Delver of Secrets", backFace: false });
  assert.deepEqual(otherFace("Insectile Aberration", true), { name: "Delver of Secrets", backFace: false });
  // Transformed but named by its front, or not transformed: the other face is the back.
  assert.deepEqual(otherFace("Delver of Secrets", true), { name: "Delver of Secrets", backFace: false });
  assert.deepEqual(otherFace("Delver of Secrets", false), { name: "Insectile Aberration", backFace: true });
});
