import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../src/game/endstep/normalize";
import { offHandCards } from "../src/ui/board/oppCastables";

type Raw = Record<string, unknown>;
let id = 1;
const card = (name: string, extra: Raw = {}) => ({ id: id++, name, ...extra });

function opponent(zones: Raw) {
  const empty = { battlefield: [], graveyard: [], exile: [], commandZone: [] };
  const state = normalize({ phase: "MAIN1", turnNumber: 3, activePlayerId: "0", stack: [], players: [empty, { ...empty, ...zones }] },
    { matchId: "m", viewerSeat: 0, desynced: false });
  return state.players.find((p) => !p.isViewer)!;
}

test("what the opponent can play from outside their hand, from the cards' own abilities", () => {
  const opp = opponent({
    graveyard: [
      card("Faithless Looting", { oracleText: "Draw two cards, then discard two cards.\nFlashback {2}{R}" }),
      card("Kroxa, Titan of Death's Hunger", { oracleText: "When Kroxa enters, sacrifice it unless it escaped.\nEscape—{B}{B}{R}{R}, Exile five other cards from your graveyard." }),
      card("Gravecrawler", { oracleText: "Gravecrawler can't block.\nYou may cast this card from your graveyard as long as you control a Zombie." }),
      // Only mentions flashback: not its own.
      card("Snapcaster Mage", { oracleText: "Flash\nWhen Snapcaster Mage enters, target instant or sorcery card in your graveyard gains flashback until end of turn." }),
      card("Lightning Bolt", { oracleText: "Lightning Bolt deals 3 damage to any target." }),
    ],
    exile: [
      card("Bonecrusher Giant", { typeLine: "Creature — Giant // Instant — Adventure" }),
      card("Path to Exile", { oracleText: "Exile target creature." }),
    ],
    commandZone: [card("Atraxa, Praetors' Voice", { isCommander: true })],
  });
  assert.deepEqual(offHandCards(opp).map((o) => `${o.card.name}: ${o.how}`), [
    "Atraxa, Praetors' Voice: Commander",
    "Faithless Looting: Flashback",
    "Kroxa, Titan of Death's Hunger: Escape",
    "Gravecrawler: Graveyard",
    "Bonecrusher Giant: Adventure",
  ]);
  assert.deepEqual(offHandCards(null), []);
});
