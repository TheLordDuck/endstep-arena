// Cards exiled "until ~ leaves the battlefield" are linked to the permanent holding them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, toReveal, type Raw } from "../src/game/endstep/normalize";
import { ExileLinks } from "../src/game/exileLinks";
import { lostKeywords } from "../src/ui/board/cards";

const HOLE = "When Portable Hole enters the battlefield, exile target nonland permanent an opponent controls with mana value 2 or less until Portable Hole leaves the battlefield.";
const hole = { id: 1, name: "Portable Hole", typeLine: "Artifact", oracleText: HOLE };
const bob = { id: 2, name: "Dark Confidant", typeLine: "Creature", power: 2, toughness: 1 };
const bolt = { id: 3, name: "Lightning Bolt", typeLine: "Instant", oracleText: "Lightning Bolt deals 3 damage to any target." };

function state(me: Raw, opp: Raw, stack: Raw[] = [], matchId = "m") {
  const player = (p: Raw) => ({ battlefield: [], graveyard: [], exile: [], commandZone: [], ...p });
  return normalize({ stack, players: [player(me), player(opp)] }, { matchId, viewerSeat: 0, desynced: false });
}

const trigger = { stackTargetId: 50, isAbility: true, abilityDescription: "Exile target…", sourceCard: hole };

test("a card exiled as the holder's trigger resolves goes under the holder", () => {
  const links = new ExileLinks();
  const before = state({ battlefield: [hole] }, { battlefield: [bob] }, [trigger]);
  const after = state({ battlefield: [hole] }, { exile: [bob] });
  links.update(null, before);
  assert.deepEqual([...links.update(before, after)], [["2", "1"]]);
});

test("the link ends when the holder leaves the battlefield", () => {
  const links = new ExileLinks();
  const before = state({ battlefield: [hole] }, { battlefield: [bob] }, [trigger]);
  const held = state({ battlefield: [hole] }, { exile: [bob] });
  links.update(before, held);
  const gone = state({ graveyard: [hole] }, { exile: [bob] });
  assert.equal(links.update(held, gone).size, 0);
});

test("the link ends when the exiled card leaves exile", () => {
  const links = new ExileLinks();
  const before = state({ battlefield: [hole] }, { battlefield: [bob] }, [trigger]);
  const held = state({ battlefield: [hole] }, { exile: [bob] });
  links.update(before, held);
  const back = state({ battlefield: [hole] }, { battlefield: [bob] });
  assert.equal(links.update(held, back).size, 0);
});

test("a holder that enters with its effect already resolved still gets the card", () => {
  const links = new ExileLinks();
  const before = state({}, { battlefield: [bob] });
  const after = state({ battlefield: [hole] }, { exile: [bob] });
  assert.deepEqual([...links.update(before, after)], [["2", "1"]]);
});

test("exile from an effect that doesn't hold cards makes no link", () => {
  const links = new ExileLinks();
  const swords = { id: 4, name: "Swords to Plowshares", typeLine: "Instant", oracleText: "Exile target creature. Its controller gains life equal to its power." };
  const before = state({ battlefield: [hole] }, { battlefield: [bob] }, [{ stackTargetId: 4, sourceCard: swords }]);
  const after = state({ battlefield: [hole], graveyard: [swords] }, { exile: [bob] });
  assert.equal(links.update(before, after).size, 0);
  // A plain instant resolving next to a holder doesn't link either.
  const links2 = new ExileLinks();
  const b2 = state({ battlefield: [hole] }, { battlefield: [bob] }, [{ stackTargetId: 3, sourceCard: bolt }]);
  const a2 = state({ battlefield: [hole], graveyard: [bolt] }, { exile: [bob] });
  assert.equal(links2.update(b2, a2).size, 0);
});

test("a transformed card doesn't show its other face's keywords as lost", () => {
  // Jace, Vryn's Prodigy flipped into a planeswalker: nothing took its keywords away.
  const walker = { keywordsLost: ["Flying"], backFace: true, oracleText: "+1: Up to one target creature gets -2/-0 until your next turn." };
  assert.deepEqual(lostKeywords(walker), []);
  assert.deepEqual(lostKeywords({ keywordsLost: ["Flying"], backFace: true }), []);
  // An effect that removed a keyword the card prints still shows.
  assert.deepEqual(lostKeywords({ keywordsLost: ["Flying"], oracleText: "Flying, vigilance" }), ["Flying"]);
});

test("a player's avatar is looked up by their account name (player.name), as Endstep does", () => {
  const s = normalize({ stack: [], players: [{ name: "thelordduck22", displayName: "Flavio" }, { displayName: "Opp", username: "opp_login" }] },
    { matchId: "m", viewerSeat: 0, desynced: false });
  assert.equal(s.players[0]!.username, "thelordduck22");
  assert.equal(s.players[0]!.name, "Flavio");
  assert.equal(s.players[1]!.username, "opp_login", "falls back to username when there's no name");
});

test("CARD_REVEALED events become reveals with names, printings, zone and real ids", () => {
  const r = toReveal({ type: "CARD_REVEALED", sequenceNumber: 7, playerName: "Opp", toZone: "HAND",
    cardNames: ["Opt", "Bolt"], cardIds: [11, 12], cardSetCodes: ["XLN"], cardCollectorNumbers: ["65"] }, 1000);
  assert.ok(r);
  assert.deepEqual([r.id, r.playerName, r.zone, r.toHand, r.at], ["7", "Opp", "HAND", false, 1000]);
  assert.deepEqual(r.cards.map((c) => [c.id, c.name, c.setCode, c.collectorNumber]), [["reveal:7:0", "Opt", "XLN", "65"], ["reveal:7:1", "Bolt", undefined, undefined]]);
  assert.deepEqual(r.cardIds, ["11", "12"]);
  assert.equal(toReveal({ type: "CARD_REVEALED_TO_HAND", cardName: "Opt", cardId: 5 })?.cardIds[0], "5");
  assert.equal(toReveal({ type: "LIFE_CHANGED" }), null);
});

test("face-down cards the viewer may see (battlefieldPeek/exilePeek) show what they are", () => {
  const s = normalize({ stack: [], players: [
    { battlefield: [{ id: 1, faceDown: true }], battlefieldPeek: [{ id: 1, name: "Exalted Angel", typeLine: "Creature — Angel" }], exile: [{ id: 2, faceDown: true }], exilePeek: [{ id: 2, name: "Saw It Coming" }] },
    { battlefield: [{ id: 3, faceDown: true }] },
  ] }, { matchId: "m", viewerSeat: 0, desynced: false });
  const [mine, exiled, theirs] = [s.players[0]!.battlefield[0]!, s.players[0]!.exile[0]!, s.players[1]!.battlefield[0]!];
  assert.deepEqual([mine.faceDown, mine.peeked, mine.name], [true, true, "Exalted Angel"]);
  assert.deepEqual([exiled.peeked, exiled.name], [true, "Saw It Coming"]);
  assert.deepEqual([theirs.peeked, theirs.name], [undefined, "Face-down card"], "no peek, no name");
});

test("granted and lost keywords come through normalize", () => {
  const s = state({ battlefield: [{ ...bob, keywordsGranted: ["Flying"], keywordsLost: [] }] }, {});
  const c = s.players[0]!.battlefield[0]!;
  assert.deepEqual(c.keywordsGranted, ["Flying"]);
  assert.equal(c.keywordsLost, undefined);
});

test("links survive a page reload through the store", () => {
  const saved = new Map<string, string>();
  const store = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) };
  const before = state({ battlefield: [hole] }, { battlefield: [bob] }, [trigger]);
  const held = state({ battlefield: [hole] }, { exile: [bob] });
  new ExileLinks(store).update(before, held);
  // A fresh page sees only the current state, with nothing before it.
  assert.deepEqual([...new ExileLinks(store).update(null, held)], [["2", "1"]]);
  // Another match doesn't pick them up.
  assert.equal(new ExileLinks(store).update(null, state({ battlefield: [hole] }, { exile: [bob] }, [], "other")).size, 0);
});
