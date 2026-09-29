// Dev harness: renders the Board from Endstep-shaped fixture states, so the
// UI can be checked (and screenshotted) without a live match.
// Build with `node build.mjs --harness`, open dist-harness/harness.html#<scenario>.

import overlayCss from "../styles/overlay.css";
import boardCss from "../styles/board.css";
import { Board } from "../ui/board/Board";
import { GameController } from "../game/GameController";
import { normalize, toReveal, type Raw } from "../game/endstep/normalize";
import type { RevealView } from "../game/GameState";
import { loadStops, saveStops } from "../game/endstep/phaseStops";

let nextId = 100;
const card = (name: string, extra: Raw = {}): Raw => ({ id: nextId++, name, ...extra });
const land = (name: string, extra: Raw = {}) => card(name, { typeLine: `Basic Land — ${name}`, ...extra });
const creature = (name: string, p: number, t: number, extra: Raw = {}) => card(name, { typeLine: "Creature", power: p, toughness: t, ...extra });

function baseState(): Raw {
  nextId = 100;
  const bolt = card("Lightning Bolt", { typeLine: "Instant" });
  const counterspell = card("Counterspell", { typeLine: "Instant" });
  const me = {
    displayName: "Flavio", name: "Flavio", life: 17, poisonCounters: 0, librarySize: 48, handSize: 5,
    manaPool: { red: 2, green: 1, colorless: 1 },
    hand: [bolt, card("Llanowar Elves", { typeLine: "Creature" }), counterspell, card("Island", { typeLine: "Basic Land — Island" }), card("Serra Angel", { typeLine: "Creature" })],
    battlefield: [
      land("Mountain"), land("Mountain", { tapped: true }), land("Island"), land("Island"), land("Forest", { tapped: true }),
      creature("Grizzly Bears", 3, 3, { basePower: 2, baseToughness: 2, keywordsGranted: ["Flying", "Trample"] }),
      creature("Goblin Guide", 2, 2, { tapped: true }),
      creature("Llanowar Elves", 1, 1, { hasSummoningSickness: true }),
      creature("Tarmogoyf", 3, 4, { counters: { P1P1: 1 } }),
      card("Sol Ring", { typeLine: "Artifact" }),
      card("The Eldest Reborn", { typeLine: "Enchantment — Saga", counters: { LORE: 2 } }),
      card("Jace, the Mind Sculptor", { typeLine: "Legendary Planeswalker — Jace", loyalty: 3 }),
      card("Dryad Arbor", { typeLine: "Land Creature — Forest Dryad", power: 1, toughness: 1 }),
    ],
    graveyard: [card("Opt"), card("Brainstorm"), card("Faithless Looting", { typeLine: "Sorcery" })],
    exile: [], commandZone: [],
  };
  const opp = {
    displayName: "Opponent", name: "Opponent", life: 12, poisonCounters: 2, librarySize: 41, handSize: 4,
    battlefield: [
      land("Swamp"), land("Swamp"), land("Plains", { tapped: true }), land("Plains"),
      creature("Serra Angel", 4, 4, { keywordsLost: ["Flying"] }),
      creature("Vampire Nighthawk", 2, 3, { damage: 1 }),
      card("Pacifism", { typeLine: "Enchantment — Aura" }),
    ],
    graveyard: [card("Swords to Plowshares")], exile: [card("Path to Exile")], commandZone: [
      card("Atraxa, Praetors' Voice", { isCommander: true, typeLine: "Legendary Creature — Phyrexian Angel Horror" }),
      card("Angel's Grace", { types: ["Effect"], effectSourceName: "Serra Angel", oracleText: "You can't lose the game this turn." }),
    ],
  };
  // The opponent's Pacifism enchants our Grizzly Bears (as Endstep sends it: the host lists
  // `attachedCards`, the aura names its host in `attachedTo`).
  (me.battlefield[5] as Raw).attachedCards = [(opp.battlefield[6] as Raw).id];
  (opp.battlefield[6] as Raw).attachedTo = (me.battlefield[5] as Raw).id;
  return {
    phase: "MAIN1", turnNumber: 6, activePlayerId: "0", priorityPlayerId: "0", status: "ACTIVE",
    stack: [], players: [me, opp],
    pendingAction: { type: "PRIORITY", promptVersion: 3, cardOptions: [
      { id: bolt.id, zone: "HAND", playableAbilities: [{ index: 0, description: "Cast Lightning Bolt", cost: "{R}" }] },
      { id: (me.hand[3] as Raw).id, zone: "HAND", playableAbilities: [{ index: 0, description: "Play Island" }] },
      { id: (me.battlefield[9] as Raw).id, zone: "BATTLEFIELD", playableAbilities: [{ index: 0, description: "{T}: Add {C}{C}." }] },
      { id: (me.graveyard[2] as Raw).id, zone: "GRAVEYARD", playableAbilities: [{ index: 0, description: "Flashback {2}{R}" }] },
      { id: (me.hand[1] as Raw).id, zone: "HAND" },
    ] },
  };
}

/** Sets up the state; may return a second step, shown as the next update (for transitions). */
type Scenario = (s: Raw) => void | ((s: Raw) => void);
const players = (s: Raw) => s.players as Raw[];
const bf = (p: Raw) => p.battlefield as Raw[];
const byName = (p: Raw, n: string) => bf(p).find((c) => c.name === n)!;

const scenarios: Record<string, Scenario> = {
  priority: () => {},
  stack: (s) => {
    const [me, opp] = players(s);
    s.stack = [
      { stackTargetId: 900, isAbility: false, sourceCard: { id: 900, name: "Counterspell", controllerId: "1", types: ["Instant"] }, targets: [{ id: 901, zone: "Stack" }] },
      { stackTargetId: 902, isAbility: true, abilityDescription: "Target creature gets +1/+1 until end of turn.", targets: [{ id: 111, zone: "Battlefield" }], sourceCard: { id: 110, name: "Tarmogoyf", controllerId: "0", types: ["Creature"] } },
      { stackTargetId: 901, isAbility: false, sourceCard: { id: 901, name: "Lightning Bolt", controllerId: "0", types: ["Instant"] }, targets: [{ id: -2, zone: "Player" }] },
    ];
    (me!.hand as Raw[]).shift();
    s.priorityPlayerId = "0";
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    void opp;
  },
  attack: (s) => {
    const [me] = players(s);
    s.phase = "DECLARE_ATTACKERS";
    s.pendingAction = { type: "DECLARE_ATTACKERS", promptVersion: 5, message: "Declare attackers",
      cardOptions: [{ id: byName(me!, "Tarmogoyf").id }, { id: byName(me!, "Grizzly Bears").id }], modeOptions: [] };
  },
  block: (s) => {
    const [me, opp] = players(s);
    s.phase = "DECLARE_BLOCKERS";
    s.activePlayerId = "1";
    const angel = byName(opp!, "Serra Angel");
    angel.isAttacking = true; angel.attackingDefenderId = "0"; angel.tapped = false;
    const hawk = byName(opp!, "Vampire Nighthawk");
    hawk.isAttacking = true; hawk.attackingDefenderId = "0";
    const goyf = byName(me!, "Tarmogoyf");
    goyf.isBlocking = true; goyf.blockingIds = [hawk.id];
    s.pendingAction = { type: "DECLARE_BLOCKERS", promptVersion: 6, cardOptions: [{ id: byName(me!, "Grizzly Bears").id }],
      blockerEligibility: { [String(byName(me!, "Grizzly Bears").id)]: [angel.id, hawk.id] } };
  },
  target: (s) => {
    const [, opp] = players(s);
    s.pendingAction = { type: "CHOOSE_TARGETS", promptVersion: 7, message: "Lightning Bolt deals 3 damage to any target.",
      sourceCardName: "Lightning Bolt", min: 1, max: 1, mandatory: true,
      cardOptions: [{ id: byName(opp!, "Serra Angel").id }, { id: byName(opp!, "Vampire Nighthawk").id }],
      stringOptions: ["Opponent", "Flavio"] };
  },
  mulligan: (s) => {
    s.turnNumber = 0; s.phase = "UPKEEP";
    s.pendingAction = { type: "MULLIGAN", promptVersion: 1, message: "Keep this hand or mulligan to six?", stringOptions: ["Keep", "Mulligan"] };
  },
  mode: (s) => {
    s.pendingAction = { type: "CHOOSE_MODE", promptVersion: 8, sourceCardName: "Kolaghan's Command", message: "Choose two", min: 2, max: 2,
      modeOptions: [
        { index: 0, description: "Return target creature card from your graveyard to your hand." },
        { index: 1, description: "Target player discards a card." },
        { index: 2, description: "Destroy target artifact." },
        { index: 3, description: "Kolaghan's Command deals 2 damage to any target." },
      ] };
  },
  // Portable Hole's trigger resolves: the opponent's creature goes under the Hole.
  exile: (s) => {
    const [me, opp] = players(s);
    const hole = card("Portable Hole", { typeLine: "Artifact", controllerId: "0",
      oracleText: "When Portable Hole enters the battlefield, exile target nonland permanent an opponent controls with mana value 2 or less until Portable Hole leaves the battlefield." });
    const victim = creature("Dark Confidant", 2, 1);
    bf(me!).push(hole);
    bf(opp!).push(victim);
    s.stack = [{ stackTargetId: 960, isAbility: true, abilityDescription: "Exile target nonland permanent an opponent controls with mana value 2 or less until Portable Hole leaves the battlefield.",
      sourceCard: hole, targets: [{ id: victim.id, zone: "Battlefield" }] }];
    return (t) => {
      t.stack = [];
      bf(opp!).splice(bf(opp!).indexOf(victim), 1);
      (opp!.exile as Raw[]).push(victim);
    };
  },
  surveil: (s) => {
    s.pendingAction = { type: "ARRANGE_CARDS", contextType: "surveil", promptVersion: 12, sourceCardName: "Consider", message: "Surveil 2",
      cardOptions: [{ id: 970, name: "Breeding Pool", typeLine: "Land — Forest Island" }, { id: 971, name: "Lightning Bolt", typeLine: "Instant" }] };
  },
  scry: (s) => {
    s.pendingAction = { type: "ARRANGE_CARDS", contextType: "scry", promptVersion: 13, sourceCardName: "Opt", message: "Scry 1",
      cardOptions: [{ id: 972, name: "Counterspell", typeLine: "Instant" }] };
  },
  // Overgrown Tomb tapped for mana: black or green.
  mana: (s) => {
    const [me] = players(s);
    const tomb = land("Overgrown Tomb", { typeLine: "Land — Swamp Forest" });
    bf(me!).push(tomb);
    s.pendingAction = { type: "CHOOSE_MANA", promptVersion: 14, sourceCardId: tomb.id, sourceCardName: "Overgrown Tomb", message: "Choose mana", stringOptions: ["B", "G"], cancellable: true };
  },
  // Lands with several mana abilities: click Starting Town (ability cards) or Overgrown Tomb (wheel).
  abilities: (s) => {
    const [me] = players(s);
    const town = land("Starting Town", { typeLine: "Land" });
    const tomb = land("Overgrown Tomb", { typeLine: "Land — Swamp Forest" });
    bf(me!).push(town, tomb);
    s.pendingAction = { type: "PRIORITY", promptVersion: 15, cardOptions: [
      { id: town.id, zone: "BATTLEFIELD", playableAbilities: [{ index: 0, description: "{T}: Add {C}." }, { index: 1, description: "{T}, Pay 1 life: Add one mana of any color." }] },
      { id: tomb.id, zone: "BATTLEFIELD", playableAbilities: [{ index: 0, description: "{T}: Add {B}." }, { index: 1, description: "{T}: Add {G}." }] },
    ] };
  },
  // Scapeshift: search the library for up to 6 lands (a fan of cards with a slider).
  search: (s) => {
    const names = ["Otawara, Soaring City", "Lotus Field", "Lotus Field", "Hedge Maze", "Hedge Maze", "Breeding Pool", "Forest", "Island",
      "Steam Vents", "Valakut, the Molten Pinnacle", "Mountain", "Mountain", "Stomping Ground", "Misty Rainforest"];
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 16, sourceCardName: "Scapeshift", message: "Search for land cards.", min: 0, max: 6,
      cardOptions: names.map((n, i) => ({ id: 980 + i, name: n, typeLine: "Land", zone: "LIBRARY" })) };
  },
  // A long graveyard, to browse (click the pile).
  graveyard: (s) => {
    const [me] = players(s);
    const names = ["Opt", "Brainstorm", "Consider", "Lightning Bolt", "Counterspell", "Thoughtseize", "Fatal Push", "Llanowar Elves",
      "Tarmogoyf", "Snapcaster Mage", "Path to Exile", "Faithless Looting"];
    me!.graveyard = names.map((n) => card(n));
  },
  // A crowded board: creatures and lands shrink to fit their line, artifacts go in two rows,
  // planeswalkers/Sagas in a 3×2 grid, both paged with arrows.
  crowded: (s) => {
    const [me] = players(s);
    const creatures = ["Llanowar Elves", "Elvish Mystic", "Fyndhorn Elves", "Tarmogoyf", "Scavenging Ooze", "Grizzly Bears", "Goblin Guide",
      "Monastery Swiftspear", "Dark Confidant", "Snapcaster Mage", "Thalia, Guardian of Thraben", "Noble Hierarch", "Birds of Paradise", "Walking Ballista"];
    const lands = ["Forest", "Island", "Mountain", "Swamp", "Plains", "Breeding Pool", "Steam Vents", "Stomping Ground", "Overgrown Tomb",
      "Hallowed Fountain", "Godless Shrine", "Sacred Foundry", "Temple Garden", "Watery Grave", "Blood Crypt", "Misty Rainforest"];
    const artifacts = ["Sol Ring", "Mind Stone", "Arcane Signet", "Chromatic Star", "Aether Vial", "Chalice of the Void", "Ensnaring Bridge",
      "Oblivion Ring", "Rest in Peace", "Leyline of the Void", "Sylvan Library", "Phyrexian Arena", "Smothering Tithe", "Rhystic Study",
      "Mox Opal", "Springleaf Drum"];
    const walkers = ["Jace, the Mind Sculptor", "Liliana of the Veil", "Karn Liberated", "Teferi, Hero of Dominaria", "Garruk, Curse Breaker",
      "Chandra, Torch of Defiance"];
    me!.battlefield = [
      ...creatures.map((n, i) => creature(n, 2, 2, { tapped: i % 5 === 0 })),
      ...lands.map((n, i) => land(n, { typeLine: `Land — ${n}`, tapped: i % 3 === 0 })),
      ...artifacts.map((n) => card(n, { typeLine: "Artifact" })),
      ...walkers.map((n) => card(n, { typeLine: "Legendary Planeswalker", loyalty: 4 })),
      card("The Eldest Reborn", { typeLine: "Enchantment — Saga", counters: { LORE: 1 } }),
      card("Fable of the Mirror-Breaker", { typeLine: "Enchantment — Saga", counters: { LORE: 2 } }),
    ];
    s.pendingAction = { type: "PRIORITY", promptVersion: 17, cardOptions: [] };
  },
  // The opponent revealed two cards from hand (they stay known there), then a card from their
  // library; our face-down morph shows its front to us (battlefieldPeek).
  reveal: (s) => {
    const [me, opp] = players(s);
    // As a real game sends it: their hand is placeholders ("Hidden card", ids by position); a
    // Thoughtseize revealed it (real ids), and made them discard the Bolt (now in their graveyard).
    opp!.hand = Array.from({ length: 6 }, (_, i) => ({ id: 1010000028 + i, name: "Hidden card", zone: "Hand", faceDown: true }));
    opp!.handSize = 6;
    (opp!.graveyard as Raw[]).push({ id: 996, name: "Lightning Bolt", typeLine: "Instant" });
    const morph = card("", { faceDown: true, typeLine: "Creature", power: 2, toughness: 2 });
    bf(me!).push(morph);
    me!.battlefieldPeek = [{ id: morph.id, name: "Exalted Angel", typeLine: "Creature — Angel" }];
    const now = Date.now();
    s.__events = [
      { type: "CARD_REVEALED", sequenceNumber: 501, playerName: "Opponent", toZone: "HAND", cardNames: ["Thoughtseize", "Counterspell", "Lightning Bolt"], cardIds: [991, 993, 996], _t: now },
      { type: "CARD_REVEALED", sequenceNumber: 502, playerName: "Opponent", toZone: "LIBRARY", cardName: "Emrakul, the Aeons Torn", cardId: 994 },
    ];
  },
  // Casting Indomitable Creativity: X, as Endstep asks it (minValue/maxValue).
  x: (s) => {
    s.pendingAction = { type: "CHOOSE_NUMBER", promptVersion: 18, sourceCardName: "Indomitable Creativity", message: "Choose a value for X",
      minValue: 0, maxValue: 4, canUndo: true };
  },
  pw: (s) => {
    s.pendingAction = { type: "CHOOSE_ABILITY", promptVersion: 11, sourceCardName: "Garruk, Curse Breaker", min: 1, max: 1,
      modeOptions: [
        { index: 0, description: "+2: Untap up to two target lands." },
        { index: 1, description: "−3: Create a 4/4 green Beast creature token with trample." },
        { index: 2, description: "−4: Until your next turn, whenever one or more creatures attack one of your opponents, those creatures get +2/+2 and gain trample until end of turn." },
      ] };
  },
  pay: (s) => {
    s.pendingAction = { type: "PAY_MANA", promptVersion: 10, message: "Pay {2}{R}{G} for Bloodbraid Elf", sourceCardName: "Bloodbraid Elf",
      cardOptions: [{ id: 100 }, { id: 101 }, { id: 102 }, { id: 103 }] };
  },
  order: (s) => {
    s.pendingAction = { type: "ORDER_ABILITIES", promptVersion: 9, message: "Order your triggered abilities",
      cardOptions: [
        { id: 950, name: "Soul Warden", description: "Whenever another creature enters, you gain 1 life.", declinable: false },
        { id: 951, name: "Impact Tremors", description: "Whenever a creature you control enters, each opponent loses 1 life.", declinable: false },
        { id: 952, name: "Guide of Souls", description: "You may pay {E}{E}{E}. If you do, put two +1/+1 counters on it.", declinable: true },
      ] };
  },
};

const name = location.hash.slice(1) || "priority";
const raw = baseState();
const nextStep = scenarios[name]?.(raw);
let seq = 1;
// The adapter adds reveals from game events; scenarios list those events in raw.__events.
const build = (meta: { viewerSeat?: number; seq: number }) => ({
  ...normalize(raw, { matchId: "harness", viewerSeat: meta.viewerSeat ?? 0, seq: meta.seq, desynced: false }),
  reveals: ((raw.__events as Raw[] | undefined) ?? []).map((e) => toReveal(e)).filter((r): r is RevealView => !!r),
});
let state = build({ seq: 1 });

const host = document.createElement("div");
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `<style>${overlayCss}\n${boardCss}</style><div class="layer is-on board-on"></div>`;
document.body.appendChild(host);
const controller = new GameController(() => state, (matchId, action) => {
  console.log("ACTION", JSON.stringify({ matchId, action }));
  (window as unknown as { __actions: unknown[] }).__actions.push(action);
  // Stand in for the server: an answer closes the prompt and hands priority back.
  if (action.type !== "SET_PHASE_STOPS" && action.type !== "SET_AUTO_YIELDS") {
    raw.pendingAction = { type: "PRIORITY", promptVersion: 100 + seq, cardOptions: [] };
    state = build({ seq: ++seq });
    setTimeout(() => board.update(state), 150);
  }
});
(window as unknown as { __actions: unknown[] }).__actions = [];
const stops = loadStops();
const board = new Board(controller, {
  onToggleDebug: () => {}, onHide: () => {},
  phaseStops: () => stops,
  togglePhaseStop: (side, step) => { if (!stops[side].delete(step)) stops[side].add(step); saveStops(stops); },
  // Endstep's table menu, as its best-of-three board offers it.
  tableMenu: async () => ["Show decklist", "Auto-yields", "Settings", "Keyboard shortcuts", "Report a problem", "Reload", "Concede game", "Concede match"],
  runTableItem: (label) => console.log("TABLE ITEM", label),
});
root.querySelector(".layer")!.appendChild(board.el);
board.update(state);
if (nextStep) {
  nextStep(raw);
  state = build({ seq: ++seq });
  board.update(state);
}

// Dev hook: the current raw state, to build a follow-up state from in a test script.
(window as unknown as { __raw: Raw }).__raw = raw;
// Dev hook: load a real state copied from the debug panel ({ matchId, viewerSeat, seq, state }).
(window as unknown as { __load: (frame: { viewerSeat?: number; seq?: number; state: Raw }) => void }).__load = (frame) => {
  Object.keys(raw).forEach((k) => delete (raw as Raw)[k]);
  Object.assign(raw, frame.state);
  state = build({ viewerSeat: frame.viewerSeat, seq: ++seq });
  board.update(state);
};
