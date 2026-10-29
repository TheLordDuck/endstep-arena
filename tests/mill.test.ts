import { test } from "node:test";
import assert from "node:assert/strict";
import { graveyardArrivals, graveyardOrder, milledCards } from "../src/ui/board/mill";
import type { CardView, LogEntry } from "../src/game/GameState";

const card = (id: string, name = id) => ({ id, name }) as CardView;
const move = (seq: number, id: string, name: string, from: string): LogEntry => ({
  seq, type: "CARD_ZONE_CHANGE", lines: [`${name}: ${from} -> Graveyard`], cards: [{ id, name }],
});

test("the log tells which cards went to a graveyard, and which from a library (milled)", () => {
  const arrivals = graveyardArrivals([
    move(10, "a", "Opt", "Library"),
    { seq: 11, type: "CARD_ZONE_CHANGE", lines: ["a card: Library -> Hand"], cards: [] },
    move(12, "b", "Grizzly Bears", "Battlefield"),
    move(13, "c", "[[Island]]", "Library"),
  ]);
  assert.deepEqual(arrivals.get("a"), { seq: 10, milled: true });
  assert.deepEqual(arrivals.get("b"), { seq: 12, milled: false });
  assert.deepEqual(arrivals.get("c"), { seq: 13, milled: true });
  assert.equal(arrivals.size, 3);
});

test("the last card milled is on top of the graveyard, whatever order the update lists them in", () => {
  // Three cards milled in one update, listed in another order than they were milled.
  const graveyard = [card("old"), card("m3"), card("m1"), card("m2")];
  const arrivals = graveyardArrivals([move(20, "m1", "One", "Library"), move(21, "m2", "Two", "Library"), move(22, "m3", "Three", "Library")]);
  const order = graveyardOrder(graveyard, arrivals);
  assert.deepEqual(order.map((c) => c.id), ["old", "m1", "m2", "m3"]);
  assert.equal(order.at(-1)!.id, "m3", "the last milled shows on top");
  // The ones it milled, in the order they were milled (the order they fly in).
  assert.deepEqual(milledCards(new Set(["old"]), order, arrivals).map((c) => c.id), ["m1", "m2", "m3"]);
});

test("a card that died isn't milled, and the graveyard keeps Endstep's order where the log says nothing", () => {
  const graveyard = [card("x"), card("y"), card("dead")];
  const arrivals = graveyardArrivals([move(5, "dead", "Bear", "Battlefield")]);
  assert.deepEqual(graveyardOrder(graveyard, arrivals).map((c) => c.id), ["x", "y", "dead"]);
  assert.deepEqual(milledCards(new Set(["x", "y"]), graveyard, arrivals), []);
});
