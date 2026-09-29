// Cards seen in the opponent's hand stay known while they're there. Shapes are Endstep's, as a
// real game sends them: their hand is placeholders ("Hidden card", ids by position).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, toReveal, type Raw } from "../src/game/endstep/normalize";
import { HandKnowledge } from "../src/game/handKnowledge";

const hidden = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 1010000028 + i, name: "Hidden card", zone: "Hand", faceDown: true }));

function state(opp: Raw, extra: Raw = {}, events: Raw[] = []) {
  const s = normalize({
    stack: [], pendingAction: { type: "PRIORITY" },
    players: [
      { id: "0", name: "thelordduck22", handSize: 1, hand: [{ id: 39, name: "Thoughtseize" }], battlefield: [], graveyard: [], exile: [] },
      { id: "1", name: "Bot (Auto-Pilot)", battlefield: [], graveyard: [], exile: [], ...opp },
    ],
    ...extra,
  }, { matchId: "m", viewerSeat: 0, desynced: false });
  return { ...s, reveals: events.map((e) => toReveal(e)!).filter(Boolean) };
}

const reveal = { type: "CARD_REVEALED", sequenceNumber: 9, playerName: "Bot (Auto-Pilot)", toZone: "HAND",
  cardNames: ["Lightning Bolt", "Mountain", "Goblin Guide"], cardIds: [201, 202, 203] };

test("a hand revealed by Thoughtseize stays known, by real id, behind the placeholders", () => {
  const k = new HandKnowledge();
  const known = k.update(state({ handSize: 3, hand: hidden(3) }, {}, [reveal]));
  assert.deepEqual(known.get("1")?.map((c) => [c.id, c.name]), [["201", "Lightning Bolt"], ["202", "Mountain"], ["203", "Goblin Guide"]]);
  assert.equal(known.get("0"), undefined, "never your own hand");
});

test("a known card that shows up anywhere else is no longer in the hand", () => {
  const k = new HandKnowledge();
  k.update(state({ handSize: 3, hand: hidden(3) }, {}, [reveal]));
  // Thoughtseize made them discard the Bolt; then they cast Goblin Guide.
  const after = k.update(state({ handSize: 1, hand: hidden(1), graveyard: [{ id: 201, name: "Lightning Bolt" }] },
    { stack: [{ stackTargetId: 203, sourceCard: { id: 203, name: "Goblin Guide" } }] }, [reveal]));
  assert.deepEqual(after.get("1")?.map((c) => c.name), ["Mountain"]);
});

test("known cards never outnumber their hand (the oldest go when it shrinks unseen)", () => {
  const k = new HandKnowledge();
  k.update(state({ handSize: 3, hand: hidden(3) }, {}, [reveal]));
  const after = k.update(state({ handSize: 1, hand: hidden(1) }, {}, [reveal]));
  assert.deepEqual(after.get("1")?.map((c) => c.name), ["Goblin Guide"]);
  assert.equal(k.update(state({ handSize: 0, hand: [] }, {}, [reveal])).get("1"), undefined);
});

test("their hand cards offered in your choice (named by ownerName) become known", () => {
  const k = new HandKnowledge();
  const known = k.update(state({ handSize: 2, hand: hidden(2) }, {
    pendingAction: { type: "CHOOSE_CARDS", min: 1, max: 1, cardOptions: [
      { id: 301, name: "Counterspell", zone: "Hand", ownerName: "Bot (Auto-Pilot)" },
      { id: 39, name: "Thoughtseize", zone: "Hand", ownerName: "thelordduck22" },
    ] },
  }));
  assert.deepEqual(known.get("1")?.map((c) => [c.id, c.name]), [["301", "Counterspell"]]);
});
