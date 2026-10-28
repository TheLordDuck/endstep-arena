// Cards exiled to be played for a while (Wrenn's Resolve…) are shown beside the opponent's hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, type Raw } from "../src/game/endstep/normalize";
import { ImpulseExile, exilesToPlay } from "../src/game/impulseExile";
import { offHandCards } from "../src/ui/board/oppCastables";

const WRENN = "Exile the top two cards of your library. Until the end of your turn, you may play those cards.";
const STAGE = "Spectacle {R}\nExile the top two cards of your library. Until the end of your next turn, you may play those cards.";
const resolve = { id: 1, name: "Wrenn's Resolve", typeLine: "Sorcery", oracleText: WRENN };
const stage = { id: 2, name: "Light Up the Stage", typeLine: "Sorcery", oracleText: STAGE };
const goyf = { id: 10, name: "Tarmogoyf", typeLine: "Creature" };
const mountain = { id: 11, name: "Mountain", typeLine: "Basic Land — Mountain" };

function state(opp: Raw, stack: Raw[] = [], turnNumber = 4) {
  const player = (p: Raw) => ({ battlefield: [], graveyard: [], exile: [], commandZone: [], ...p });
  return normalize({ stack, turnNumber, players: [player({}), player(opp)] }, { matchId: "m", viewerSeat: 0, desynced: false });
}

const cast = (card: Raw) => ({ stackTargetId: 50, sourceCard: card, controllerId: "1" });

test("which texts exile cards to be played", () => {
  assert.equal(exilesToPlay(WRENN), true);
  assert.equal(exilesToPlay("Exile the top three cards of your library. You may play them this turn."), true);
  assert.equal(exilesToPlay("Exile target creature."), false);
  assert.equal(exilesToPlay("You may play lands from your graveyard."), false);
});

test("the cards exiled as Wrenn's Resolve resolves are playable this turn, in front of the rest", () => {
  const impulse = new ImpulseExile();
  const before = state({ exile: [{ id: 12, name: "Old card" }] }, [cast(resolve)]);
  const after = state({ exile: [{ id: 12, name: "Old card" }, goyf, mountain], graveyard: [resolve] });
  impulse.update(null, before);
  const cards = impulse.update(before, after);
  assert.deepEqual([...cards.keys()], ["10", "11"]);
  assert.equal(cards.get("10")!.source, "Wrenn's Resolve");
  const side = offHandCards(after.players[1], cards);
  assert.deepEqual(side.map((c) => [c.card.name, c.how, !!c.impulse]), [["Tarmogoyf", "Wrenn's Resolve", true], ["Mountain", "Wrenn's Resolve", true]]);
  // Played: it leaves exile, and the list.
  const played = state({ exile: [{ id: 12, name: "Old card" }, goyf], battlefield: [mountain], graveyard: [resolve] });
  assert.deepEqual([...impulse.update(after, played).keys()], ["10"]);
  // The turn ends.
  assert.equal(impulse.update(played, state({ exile: [{ id: 12, name: "Old card" }, goyf] }, [], 5)).size, 0);
});

test("Light Up the Stage lasts through their next turn", () => {
  const impulse = new ImpulseExile();
  const before = state({}, [cast(stage)]);
  const after = state({ exile: [goyf] });
  impulse.update(before, after);
  assert.equal(impulse.update(after, state({ exile: [goyf] }, [], 6)).size, 1);
  assert.equal(impulse.update(after, state({ exile: [goyf] }, [], 7)).size, 0);
});
