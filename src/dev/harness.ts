// Dev harness: renders the Board from Endstep-shaped fixture states, so the
// UI can be checked (and screenshotted) without a live match.
// Build with `node build.mjs --harness`, open dist-harness/harness.html#<scenario>.

import overlayCss from "../styles/overlay.css";
import boardCss from "../styles/board.css";
import { Board } from "../ui/board/Board";
import { GameController } from "../game/GameController";
import { normalize, type Raw } from "../game/endstep/normalize";
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
      creature("Grizzly Bears", 2, 2),
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
      creature("Serra Angel", 4, 4),
      creature("Vampire Nighthawk", 2, 3, { damage: 1 }),
      card("Pacifism", { typeLine: "Enchantment — Aura" }),
    ],
    graveyard: [card("Swords to Plowshares")], exile: [card("Path to Exile")], commandZone: [card("Angel's Grace", { types: ["Effect"], effectSourceName: "Serra Angel", oracleText: "You can't lose the game this turn." })],
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

type Scenario = (s: Raw) => void;
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
scenarios[name]?.(raw);
let seq = 1;
let state = normalize(raw, { matchId: "harness", viewerSeat: 0, seq: 1, desynced: false });

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
    state = normalize(raw, { matchId: "harness", viewerSeat: 0, seq: ++seq, desynced: false });
    setTimeout(() => board.update(state), 150);
  }
});
(window as unknown as { __actions: unknown[] }).__actions = [];
const stops = loadStops();
const board = new Board(controller, {
  onToggleDebug: () => {}, onHide: () => {},
  phaseStops: () => stops,
  togglePhaseStop: (side, step) => { if (!stops[side].delete(step)) stops[side].add(step); saveStops(stops); },
});
root.querySelector(".layer")!.appendChild(board.el);
board.update(state);

// Dev hook: load a real state copied from the debug panel ({ matchId, viewerSeat, seq, state }).
(window as unknown as { __load: (frame: { viewerSeat?: number; seq?: number; state: Raw }) => void }).__load = (frame) => {
  Object.keys(raw).forEach((k) => delete (raw as Raw)[k]);
  Object.assign(raw, frame.state);
  state = normalize(raw, { matchId: "harness", viewerSeat: frame.viewerSeat ?? 0, seq: ++seq, desynced: false });
  board.update(state);
};
