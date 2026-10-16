// Dev harness: renders the Board from Endstep-shaped fixture states, so the
// UI can be checked (and screenshotted) without a live match.
// Build with `node build.mjs --harness`, open dist-harness/harness.html#<scenario>.

import overlayCss from "../styles/overlay.css";
import boardCss from "../styles/board.css";
import { Board } from "../ui/board/Board";
import { GameController } from "../game/GameController";
import { normalize, toLogEntry, toReveal, type Raw } from "../game/endstep/normalize";
import type { GameState, LogEntry, RevealView } from "../game/GameState";
import { ReplayPlayer, type ReplayStatus } from "../game/ReplayPlayer";
import { decodeReplay } from "../game/endstep/replay";
import { loadStops, saveStops } from "../game/endstep/phaseStops";
import { cleanPrefs } from "../ui/board/prefs";
import { StatePacer } from "../ui/StatePacer";
import { EndstepAdapter } from "../game/endstep/EndstepAdapter";
import { MatchChat } from "../game/endstep/chat";
import { parseCardDetails, parseDecklist } from "../game/endstep/decklist";

/** The matches in tests/fixtures, by name: their frames as ndjson (see build.mjs). */
declare const __MATCHES__: Record<string, string>;

// Timers the page starts, so `?freeze` can cancel the ones still pending; and when each
// scripted animation started (headless runs don't always advance them on their own).
const pendingTimers = new Set<number>();
const animStarted = new WeakMap<Animation, number>();
if (new URLSearchParams(location.search).has("freeze")) {
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
    const a = nativeAnimate.apply(this, args);
    animStarted.set(a, performance.now());
    return a;
  };
  const native = window.setTimeout.bind(window);
  window.setTimeout = ((fn: () => void, ms?: number) => {
    const id: number = native(() => {
      pendingTimers.delete(id);
      fn();
    }, ms);
    pendingTimers.add(id);
    return id;
  }) as unknown as typeof window.setTimeout;
}

let nextId = 100;
/** A scenario's stand-in for the server: the next prompt for an action sent (none: priority back). */
let answerWith: ((action: Raw) => Raw | undefined) | undefined;
const card = (name: string, extra: Raw = {}): Raw => ({ id: nextId++, name, ...extra });
const land = (name: string, extra: Raw = {}) => card(name, { typeLine: `Basic Land — ${name}`, ...extra });
const creature = (name: string, p: number, t: number, extra: Raw = {}) => card(name, { typeLine: "Creature", power: p, toughness: t, ...extra });

/** The bot's attack of the match of 2026-10-16 (see "gang-block"): our creatures become eight
    Soldier tokens and some lands; the opponent attacks with a Colossal Dreadmaw (6/6 trample) and,
    with `elves`, two Llanowar Elves; their Serra Angel stays home. In the declare blockers step. */
function gangBlock(s: Raw, elves = true): { soldiers: Raw[]; dreadmaw: Raw; elves: Raw[] } {
  const [me, opp] = players(s);
  const soldiers = Array.from({ length: 8 }, () => creature("Soldier", 1, 1, { isToken: true, tokenSetCode: "tdom", tokenCollectorNumber: "2", color: "W", basePower: 1, baseToughness: 1 }));
  me!.battlefield = [...bf(me!).filter((c) => /Land/.test(String(c.typeLine))), ...soldiers];
  const attack = { isAttacking: true, attackingDefenderId: -1, tapped: true };
  const dreadmaw = creature("Colossal Dreadmaw", 6, 6, { oracleText: "Trample", ...attack });
  const elf = () => creature("Llanowar Elves", 1, 1, { oracleText: "{T}: Add {G}.", ...attack });
  const theirElves = elves ? [elf(), elf()] : [];
  opp!.battlefield = [...bf(opp!).filter((c) => c.name !== "Vampire Nighthawk" && c.name !== "Pacifism"), dreadmaw, ...theirElves];
  me!.battlefield = bf(me!).map((c) => ({ ...c, attachedCards: undefined }));
  s.phase = "DECLARE_BLOCKERS";
  s.activePlayerId = "1";
  s.pendingAction = null;
  return { soldiers: bf(me!).filter((c) => c.name === "Soldier"), dreadmaw, elves: theirElves };
}

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
/** A step changes the state; it may return the next one (each makes its own update, as Endstep
    sending states in a row). */
type Step = (s: Raw) => void | Step;
type Scenario = Step;
const GARRUK: Raw = { typeLine: "Legendary Planeswalker — Garruk", types: ["Planeswalker"], color: "G",
  oracleText: "+1: Untap two target lands.\n−1: Create a 3/3 green Beast creature token.\n−4: Creatures you control get +3/+3 and gain trample until end of turn." };
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
      { stackTargetId: 901, isAbility: false, xValue: 3, sourceCard: { id: 901, name: "Fireball", controllerId: "0", types: ["Sorcery"] }, targets: [{ id: -2, zone: "Player" }] },
    ];
    (me!.hand as Raw[]).shift();
    s.priorityPlayerId = "0";
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    void opp;
  },
  // Seven items in a cascade (spells and triggers of both players): the magnifier lays them out.
  stack7: (s) => {
    const [me] = players(s);
    const spell = (id: number, name: string, ctrl: string, type: string, extra: Raw = {}) => ({ stackTargetId: id, isAbility: false, sourceCard: { id, name, controllerId: ctrl, types: [type] }, ...extra });
    const trigger = (id: number, text: string, src: number, name: string, ctrl: string) => ({ stackTargetId: id, isAbility: true, abilityDescription: text, sourceCard: { id: src, name, controllerId: ctrl, types: ["Creature"] } });
    s.stack = [
      spell(900, "Counterspell", "1", "Instant", { targets: [{ id: 901, zone: "Stack" }] }),
      trigger(905, "Whenever an opponent casts a spell, Monastery Mentor deals 1 damage to that player.", 920, "Monastery Mentor", "1"),
      trigger(902, "Target creature gets +1/+1 until end of turn.", 110, "Tarmogoyf", "0"),
      spell(901, "Fireball", "0", "Sorcery", { xValue: 3, targets: [{ id: -2, zone: "Player" }] }),
      trigger(906, "When Serra Angel attacks, you gain 2 life.", 921, "Serra Angel", "1"),
      spell(903, "Lightning Bolt", "1", "Instant", { targets: [{ id: -1, zone: "Player" }] }),
      trigger(904, "At the beginning of your upkeep, draw a card.", 922, "Phyrexian Arena", "0"),
    ];
    (me!.hand as Raw[]).shift();
    s.priorityPlayerId = "0";
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
  },
  // Three items on the stack, and the top one (the opponent's Lightning Bolt) resolves: two stay.
  "stack-resolve": (s) => {
    const spell = (id: number, name: string, ctrl: string, type: string, extra: Raw = {}) => ({ stackTargetId: id, isAbility: false, sourceCard: { id, name, controllerId: ctrl, types: [type] }, ...extra });
    const under = [
      { stackTargetId: 902, isAbility: true, abilityDescription: "Target creature gets +1/+1 until end of turn.", sourceCard: { id: 110, name: "Tarmogoyf", controllerId: "0", types: ["Creature"] } },
      spell(901, "Fireball", "0", "Sorcery", { xValue: 3, targets: [{ id: -2, zone: "Player" }] }),
    ];
    s.stack = [spell(903, "Lightning Bolt", "1", "Instant", { targets: [{ id: -1, zone: "Player" }] }), ...under];
    s.priorityPlayerId = "0";
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    return (t) => {
      t.stack = under;
      const mine = players(t)[0]!;
      mine.life = (mine.life as number) - 3;
      t.pendingAction = { type: "PRIORITY", promptVersion: 5, cardOptions: [] };
    };
  },
  // Casting Counterspell at an opponent's spell: stack items are targeted by their stack id.
  counter: (s) => {
    const [me, opp] = players(s);
    const angel = byName(opp!, "Serra Angel");
    s.stack = [
      { stackTargetId: 952, isAbility: true, abilityDescription: "When Serra Angel attacks, you gain 2 life.", sourceCard: { id: angel.id, name: "Serra Angel", controllerId: "1", types: ["Creature"] } },
      { stackTargetId: 950, isAbility: false, sourceCard: { id: 951, name: "Lava Dart", controllerId: "1", types: ["Instant"] }, targets: [{ id: -1, zone: "Player" }] },
    ];
    const counterspell = (me!.hand as Raw[])[2]!;
    s.priorityPlayerId = "0";
    s.pendingAction = { type: "CHOOSE_TARGETS", promptVersion: 4, contextType: "targets_stack", message: "Choose target spell", sourceCardId: counterspell.id, sourceCardName: "Counterspell",
      min: 1, max: 1, mandatory: true, cardOptions: [{ id: 950, name: "Lava Dart", zone: "Stack", types: ["Instant"] }] };
  },
  // A fetched land asks for life while the fetch's ability is still on the stack.
  shock: (s) => {
    const [me] = players(s);
    const fountain = card("Hallowed Fountain", { typeLine: "Land — Plains Island" });
    bf(me!).push(fountain);
    s.stack = [{ stackTargetId: 970, isAbility: true, abilityDescription: "Search your library for a Plains or Island card, put it onto the battlefield, then shuffle.", sourceCard: { id: 971, name: "Flooded Strand", controllerId: "0", types: ["Land"] } }];
    s.pendingAction = { type: "YES_NO", promptVersion: 5, message: "Pay 2 life?", sourceCardId: fountain.id, sourceCardName: "Hallowed Fountain" };
  },
  // A Clue sacrificed for its own ability: gone from the table, its ability on the stack.
  clue: (s) => {
    const [me] = players(s);
    const clue = card("Clue", { typeLine: "Token Artifact — Clue", isToken: true, tokenSetCode: "tmkm", tokenCollectorNumber: "14" });
    bf(me!).push(clue);
    return (t) => {
      const mine = players(t)[0]!;
      mine.battlefield = bf(mine).filter((c) => c.id !== clue.id);
      t.stack = [{ stackTargetId: 980, isAbility: true, abilityDescription: "{2}, Sacrifice this artifact: Draw a card.", sourceCard: { id: clue.id, name: "Clue", controllerId: "0", types: ["Artifact"] } }];
      t.pendingAction = { type: "PRIORITY", promptVersion: 6, cardOptions: [] };
    };
  },
  // A creature spell resolves: our Baneslayer Angel goes from the stack onto the battlefield.
  resolve: (s) => {
    const spell = creature("Baneslayer Angel", 5, 5, { typeLine: "Creature — Angel", types: ["Creature"], manaCost: "{3}{W}{W}", controllerId: "0" });
    s.stack = [{ stackTargetId: spell.id, isAbility: false, sourceCard: spell }];
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    return (t) => {
      t.stack = [];
      bf(players(t)[0]!).push(spell);
    };
  },
  // An instant resolves: the opponent's Lightning Bolt hits us and goes to their graveyard.
  "resolve-bolt": (s) => {
    const bolt = card("Lightning Bolt", { typeLine: "Instant", types: ["Instant"], manaCost: "{R}", controllerId: "1" });
    s.stack = [{ stackTargetId: bolt.id, isAbility: false, sourceCard: bolt, targets: [{ id: -1, zone: "Player" }] }];
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    return (t) => {
      const [me, opp] = players(t);
      t.stack = [];
      me!.life = (me!.life as number) - 3;
      (opp!.graveyard as Raw[]).push(bolt);
    };
  },
  // Our Arc Lightning resolves: 2 to the Vampire Nighthawk (it dies) and 1 to the opponent, each
  // shown by a bolt from the stack; then 3 more from a Lightning Bolt at the Serra Angel.
  "spell-damage": (s) => {
    const [, opp] = players(s);
    const hawk = byName(opp!, "Vampire Nighthawk");
    const angel = byName(opp!, "Serra Angel");
    const arc = card("Arc Lightning", { typeLine: "Sorcery", types: ["Sorcery"], controllerId: "0", oracleText: "Arc Lightning deals 3 damage divided as you choose among one, two, or three targets." });
    const bolt = card("Lightning Bolt", { typeLine: "Instant", types: ["Instant"], controllerId: "0", oracleText: "Lightning Bolt deals 3 damage to any target." });
    s.stack = [
      { stackTargetId: arc.id, sourceCard: arc, targets: [{ id: hawk.id, zone: "Battlefield", dividedAmount: 2 }, { id: -2, zone: "Player", dividedAmount: 1 }] },
      { stackTargetId: bolt.id, sourceCard: bolt, targets: [{ id: angel.id, zone: "Battlefield" }] },
    ];
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    return (t) => {
      const [me2, opp2] = players(t);
      t.stack = [];
      opp2!.life = (opp2!.life as number) - 1;
      opp2!.battlefield = bf(opp2!).filter((c) => c.id !== hawk.id);
      (opp2!.graveyard as Raw[]).push(hawk);
      byName(opp2!, "Serra Angel").damage = 3;
      (me2!.graveyard as Raw[]).push(arc, bolt);
    };
  },
  // Raise the Alarm resolves: two Soldier tokens come in.
  tokens: (s) => {
    const raise = card("Raise the Alarm", { typeLine: "Instant", types: ["Instant"], controllerId: "0", oracleText: "Create two 1/1 white Soldier creature tokens." });
    s.stack = [{ stackTargetId: raise.id, sourceCard: raise }];
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    return (t) => {
      const [me2] = players(t);
      t.stack = [];
      (me2!.graveyard as Raw[]).push(raise);
      for (let i = 0; i < 2; i++) bf(me2!).push(creature("Soldier", 1, 1, { isToken: true, tokenSetCode: "tdom", tokenCollectorNumber: "2", color: "W", basePower: 1, baseToughness: 1 }));
    };
  },
  // Stats change: Tarmogoyf's pump resolves (+1/+1 until end of turn), the Grizzly Bears get a
  // +1/+1 counter, and the opponent's Serra Angel gets -2/-2.
  pump: (s) => {
    s.stack = [{ stackTargetId: 902, isAbility: true, abilityDescription: "Target creature gets +1/+1 until end of turn.", targets: [{ id: 111, zone: "Battlefield" }], sourceCard: { id: 110, name: "Tarmogoyf", controllerId: "0", types: ["Creature"] } }];
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    return (t) => {
      const [me2, opp2] = players(t);
      t.stack = [];
      const goyf = byName(me2!, "Tarmogoyf");
      goyf.power = 4; goyf.toughness = 5;
      const bears = byName(me2!, "Grizzly Bears");
      bears.power = 4; bears.toughness = 4; bears.counters = { P1P1: 1 };
      const angel = byName(opp2!, "Serra Angel");
      angel.power = 2; angel.toughness = 2;
    };
  },
  // Our Swords to Plowshares resolves: the opponent's Serra Angel is exiled (into their exile
  // vortex, not the graveyard) and they gain 4 life.
  "exile-creature": (s) => {
    const [, opp] = players(s);
    const angel = byName(opp!, "Serra Angel");
    const swords = card("Swords to Plowshares", { typeLine: "Instant", types: ["Instant"], controllerId: "0", oracleText: "Exile target creature. Its controller gains life equal to its power." });
    s.stack = [{ stackTargetId: swords.id, sourceCard: swords, targets: [{ id: angel.id, zone: "Battlefield" }] }];
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    return (t) => {
      const [me2, opp2] = players(t);
      t.stack = [];
      opp2!.battlefield = bf(opp2!).filter((c) => c.id !== angel.id);
      (opp2!.exile as Raw[]).push(angel);
      opp2!.life = (opp2!.life as number) + 4;
      (me2!.graveyard as Raw[]).push(swords);
    };
  },
  // The game log (open it with ?prefs={"logOpen":true}): a few turns of events as Endstep sends them.
  log: (s) => {
    const [me, opp] = players(s);
    const goyf = byName(me!, "Tarmogoyf");
    const angel = byName(opp!, "Serra Angel");
    const hawk = byName(opp!, "Vampire Nighthawk");
    const bolt = (me!.hand as Raw[])[0]!;
    let seq = 40;
    const ev = (type: string, message: string, seat: number | null, extra: Raw = {}) => ({
      type, message, sequenceNumber: seq++, turnNumber: extra.turnNumber ?? 6,
      ...(seat === null ? {} : { playerIndex: String(seat), playerName: seat === 0 ? "Flavio" : "Opponent" }), ...extra,
    });
    s.__events = [
      ev("TURN_BEGAN", "Turn 5: Opponent", 1, { turnNumber: 5 }),
      ev("LAND_PLAYED", "Opponent plays [[Plains]].", 1, { turnNumber: 5 }),
      ev("SPELL_CAST", "Opponent casts [[Vampire Nighthawk]].", 1, { turnNumber: 5, cardId: hawk.id, cardName: "Vampire Nighthawk" }),
      ev("SPELL_RESOLVED", "[[Vampire Nighthawk]] resolves.", 1, { turnNumber: 5, cardId: hawk.id, cardName: "Vampire Nighthawk" }),
      ev("ATTACKERS_DECLARED", "Opponent attacks with [[Serra Angel]].", 1, { turnNumber: 5, cardIds: [angel.id], cardNames: ["Serra Angel"] }),
      ev("PLAYER_DAMAGED", "[[Serra Angel]] deals 4 damage to Flavio.", 0, { turnNumber: 5, cardId: angel.id, cardName: "Serra Angel" }),
      ev("TURN_BEGAN", "Turn 6: Flavio", 0),
      ev("LAND_PLAYED", "Flavio plays [[Mountain]].", 0),
      ev("ABILITY_ACTIVATED", "[[Tarmogoyf]]: Target creature gets +1/+1 until end of turn. {targets=[Tarmogoyf (111)]}", 0, { cardId: goyf.id, cardName: "Tarmogoyf" }),
      ev("CARD_COUNTERS", "[[Tarmogoyf]] gets a +1/+1 counter.", 0, { cardId: goyf.id, cardName: "Tarmogoyf" }),
      ev("SPELL_CAST", "Flavio casts [[Lightning Bolt]] targeting [[Vampire Nighthawk]].", 0, { cardIds: [bolt.id, hawk.id], cardNames: ["Lightning Bolt", "Vampire Nighthawk"] }),
      ev("CARD_DAMAGED", "[[Lightning Bolt]] deals 3 damage to [[Vampire Nighthawk]].", 0, { cardIds: [bolt.id, hawk.id], cardNames: ["Lightning Bolt", "Vampire Nighthawk"] }),
      ev("PLAYER_LIFE_CHANGED", "Opponent gains 2 life.", 1),
      ev("TURN_PHASE", "Combat", null),
    ];
  },
  // Watching someone else's game from Flavio's side: their hand isn't shown, nothing to answer.
  spectate: (s) => {
    const [me] = players(s);
    me!.hand = null;
    s.pendingAction = null;
    s.__spectating = true;
  },
  // Waiting: the opponent can respond to our Lightning Bolt (it's on the stack, priority is theirs).
  "wait-respond": (s) => {
    const bolt = (players(s)[0]!.hand as Raw[]).shift()!;
    s.stack = [{ stackTargetId: bolt.id, sourceCard: { ...bolt, controllerId: "0" }, targets: [{ id: -2, zone: "Player" }] }];
    s.priorityPlayerId = "1";
    s.pendingAction = null;
  },
  // Waiting: our Tarmogoyf attacks and the opponent is declaring blockers.
  "wait-blockers": (s) => {
    const goyf = byName(players(s)[0]!, "Tarmogoyf");
    goyf.isAttacking = true; goyf.attackingDefenderId = -2; goyf.tapped = true;
    s.phase = "DECLARE_BLOCKERS";
    s.priorityPlayerId = "1";
    s.pendingAction = null;
  },
  // Waiting: the opponent is making a choice (their idle timer runs; priority isn't theirs).
  "wait-deciding": (s) => {
    const now = Date.now();
    s.priorityPlayerId = "0";
    s.pendingAction = null;
    s.idleTimeout = { seat: "1", deadlineMs: now + 50_000, serverNowMs: now, graceMs: 30_000 };
  },
  // Our Murder resolves: the opponent's Serra Angel is destroyed (a dark bolt, then smoke).
  murder: (s) => {
    const [, opp] = players(s);
    const angel = byName(opp!, "Serra Angel");
    const murder = card("Murder", { typeLine: "Instant", types: ["Instant"], controllerId: "0", oracleText: "Destroy target creature." });
    s.stack = [{ stackTargetId: murder.id, sourceCard: murder, targets: [{ id: angel.id, zone: "Battlefield" }] }];
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    return (t) => {
      const [me2, opp2] = players(t);
      t.stack = [];
      opp2!.battlefield = bf(opp2!).filter((c) => c.id !== angel.id);
      (opp2!.graveyard as Raw[]).push(angel);
      (me2!.graveyard as Raw[]).push(murder);
    };
  },
  // A board wipe: every creature dies at once, with no bolt (each crumbles where it stood).
  wrath: (s) => {
    const wrath = card("Wrath of God", { typeLine: "Sorcery", types: ["Sorcery"], controllerId: "1", oracleText: "Destroy all creatures. They can't be regenerated." });
    s.stack = [{ stackTargetId: wrath.id, sourceCard: wrath }];
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    return (t) => {
      t.stack = [];
      for (const p of players(t)) {
        const dead = bf(p).filter((c) => /Creature/.test(String(c.typeLine ?? "")) || c.power !== undefined);
        p.battlefield = bf(p).filter((c) => !dead.includes(c));
        (p.graveyard as Raw[]).push(...dead);
      }
      (players(t)[1]!.graveyard as Raw[]).push(wrath);
    };
  },
  // Proliferate: our Tarmogoyf (+1/+1), Jace (loyalty), The Eldest Reborn (lore) and the poisoned
  // opponent can get one more counter. All light up; "All yours" sends ours.
  proliferate: (s) => {
    const [me] = players(s);
    const ids = ["Tarmogoyf", "Jace, the Mind Sculptor", "The Eldest Reborn"].map((n) => byName(me!, n).id);
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 27, sourceCardName: "Thrummingbird", min: 0, max: 99, mandatory: false,
      message: "Proliferate: choose any number of permanents and/or players", cardOptions: [...ids.map((id) => ({ id })), { id: -2 }] };
  },
  // Against a bot: our Lightning Bolt goes on the stack and resolves at once (two states in a
  // row). The pacer keeps it on the stack a moment; then it flies, and the bolt hits the opponent.
  "bot-cast": (s) => {
    const bolt = (players(s)[0]!.hand as Raw[])[0]!;
    return (t) => {
      const [me] = players(t);
      me!.hand = (me!.hand as Raw[]).filter((c) => c.id !== bolt.id);
      t.stack = [{ stackTargetId: bolt.id, sourceCard: { ...bolt, controllerId: "0", oracleText: "Lightning Bolt deals 3 damage to any target." }, targets: [{ id: -2, zone: "Player" }] }];
      t.pendingAction = null;
      t.priorityPlayerId = "1";
      return (u) => {
        const [me2, opp2] = players(u);
        u.stack = [];
        opp2!.life = (opp2!.life as number) - 3;
        (me2!.graveyard as Raw[]).push(bolt);
        u.priorityPlayerId = "0";
        u.pendingAction = { type: "PRIORITY", promptVersion: 9, cardOptions: [] };
      };
    };
  },
  won: (s) => { s.status = "COMPLETE"; s.winnerId = "0"; s.pendingAction = null; },
  lost: (s) => { s.status = "COMPLETE"; s.winnerId = "1"; s.pendingAction = null; },
  attack: (s) => {
    const [me] = players(s);
    s.phase = "DECLARE_ATTACKERS";
    s.pendingAction = { type: "DECLARE_ATTACKERS", promptVersion: 5, message: "Declare attackers",
      cardOptions: [{ id: byName(me!, "Tarmogoyf").id }, { id: byName(me!, "Grizzly Bears").id }], modeOptions: [] };
  },
  // A horde, as in Arena: 18 identical Soldier tokens make one pile (×18, four drawn) and nine
  // Mountains another; declaring attackers, the ×18 sends them all (a click on one, just it).
  horde: (s) => {
    const [me] = players(s);
    const soldiers = Array.from({ length: 18 }, () => creature("Soldier", 1, 1, { isToken: true, tokenSetCode: "tdom", tokenCollectorNumber: "2", color: "W", basePower: 1, baseToughness: 1 }));
    me!.battlefield = [...soldiers, ...Array.from({ length: 9 }, () => land("Mountain", { typeLine: "Basic Land — Mountain" }))];
    s.phase = "DECLARE_ATTACKERS";
    s.pendingAction = { type: "DECLARE_ATTACKERS", promptVersion: 5, message: "Declare attackers",
      cardOptions: soldiers.map((c) => ({ id: c.id })), modeOptions: [] };
  },
  block: (s) => {
    const [me, opp] = players(s);
    s.phase = "DECLARE_BLOCKERS";
    s.activePlayerId = "1";
    const angel = byName(opp!, "Serra Angel");
    angel.isAttacking = true; angel.attackingDefenderId = -1; angel.tapped = false;
    const hawk = byName(opp!, "Vampire Nighthawk");
    hawk.isAttacking = true; hawk.attackingDefenderId = -1;
    const goyf = byName(me!, "Tarmogoyf");
    goyf.isBlocking = true; goyf.blockingIds = [hawk.id];
    s.pendingAction = { type: "DECLARE_BLOCKERS", promptVersion: 6, cardOptions: [{ id: byName(me!, "Grizzly Bears").id }],
      blockerEligibility: { [String(byName(me!, "Grizzly Bears").id)]: [angel.id, hawk.id] } };
  },
  // Two identical attackers (piled ×2): blocking one with the Bears takes it out of the pile, so
  // the other can be blocked by the Tarmogoyf.
  block2: (s) => {
    const [me, opp] = players(s);
    s.phase = "DECLARE_BLOCKERS";
    s.activePlayerId = "1";
    const angel = creature("Goblin Guide", 2, 2, { isAttacking: true, attackingDefenderId: -1, tapped: true });
    const angel2 = { ...angel, id: nextId++ };
    bf(opp!).push(angel, angel2);
    const bears = byName(me!, "Grizzly Bears"), goyf = byName(me!, "Tarmogoyf");
    s.pendingAction = { type: "DECLARE_BLOCKERS", promptVersion: 6, cardOptions: [{ id: bears.id }, { id: goyf.id }],
      blockerEligibility: { [String(bears.id)]: [angel.id, angel2.id], [String(goyf.id)]: [angel.id, angel2.id] } };
  },
  // Combat damage: the opponent's Angel is unblocked, our Tarmogoyf blocks their Nighthawk.
  // The board shows blockers declared, then the game reaches combat damage: we take 4, and the
  // Nighthawk (deathtouch) and Tarmogoyf kill each other.
  strike: (s) => {
    const [me, opp] = players(s);
    s.phase = "DECLARE_BLOCKERS";
    s.activePlayerId = "1";
    s.pendingAction = null;
    const angel = byName(opp!, "Serra Angel");
    angel.isAttacking = true; angel.attackingDefenderId = -1; angel.tapped = false;
    const hawk = byName(opp!, "Vampire Nighthawk");
    hawk.isAttacking = true; hawk.attackingDefenderId = -1;
    const goyf = byName(me!, "Tarmogoyf");
    goyf.isBlocking = true; goyf.blockingIds = [hawk.id];
    return (n) => {
      n.phase = "COMBAT_DAMAGE";
      const [me2, opp2] = players(n);
      me2!.life = (me2!.life as number) - 4;
      const die = (p: Raw, name: string) => {
        const c = byName(p, name);
        p.battlefield = (p.battlefield as Raw[]).filter((x) => x !== c);
        (p.graveyard as Raw[]).push({ ...c, isBlocking: false, isAttacking: false, blockingIds: [] });
      };
      die(me2!, "Tarmogoyf");
      die(opp2!, "Vampire Nighthawk");
    };
  },
  // Dividing combat damage: our Rampaging Baloths (8/8 trample, two +1/+1 counters) is blocked by the Serra Angel
  // (4 is lethal) and the Vampire Nighthawk (2 left); whatever's past lethal can trample over.
  damage: (s) => {
    const [me, opp] = players(s);
    const baloths = creature("Rampaging Baloths", 8, 8, { counters: { P1P1: 2 }, oracleText: "Trample\nLandfall — Whenever a land you control enters, you may create a 4/4 green Beast creature token.", isAttacking: true, attackingDefenderId: -2, tapped: true });
    bf(me!).push(baloths);
    const angel = byName(opp!, "Serra Angel");
    const hawk = byName(opp!, "Vampire Nighthawk");
    for (const c of [angel, hawk]) { c.isBlocking = true; c.blockingIds = [baloths.id]; }
    s.phase = "COMBAT_DAMAGE";
    s.pendingAction = { type: "ASSIGN_DAMAGE", promptVersion: 21, sourceCardName: "Rampaging Baloths", maxValue: 8,
      message: "Assign 8 combat damage from Rampaging Baloths.",
      cardOptions: [
        { id: angel.id, name: "Serra Angel", types: ["Creature"], lethalDamage: 4 },
        { id: hawk.id, name: "Vampire Nighthawk", types: ["Creature"], lethalDamage: 2 },
        { id: -2, name: "Opponent", types: ["Player"] },
      ] };
  },
  // The same without trample: Tarmogoyf's 4 split between two blockers, nothing to the player.
  "damage-split": (s) => {
    const [me, opp] = players(s);
    const goyf = byName(me!, "Tarmogoyf");
    goyf.isAttacking = true; goyf.attackingDefenderId = -2; goyf.tapped = true;
    const angel = byName(opp!, "Serra Angel");
    const hawk = byName(opp!, "Vampire Nighthawk");
    for (const c of [angel, hawk]) { c.isBlocking = true; c.blockingIds = [goyf.id]; }
    s.phase = "COMBAT_DAMAGE";
    s.pendingAction = { type: "ASSIGN_DAMAGE", promptVersion: 22, sourceCardName: "Tarmogoyf", maxValue: 4,
      message: "Assign 4 combat damage from Tarmogoyf.",
      cardOptions: [
        { id: angel.id, name: "Serra Angel", types: ["Creature"], lethalDamage: 4 },
        { id: hawk.id, name: "Vampire Nighthawk", types: ["Creature"], lethalDamage: 2 },
      ] };
  },
  // Winning in combat: our Tarmogoyf is unblocked and the opponent is at 4; their Nighthawk
  // blocks our Grizzly Bears. The game ends where it was (blockers declared), as Endstep may
  // finish it: the fight plays, then Victory.
  win: (s) => {
    const [me, opp] = players(s);
    s.phase = "DECLARE_BLOCKERS";
    s.pendingAction = null;
    opp!.life = 4;
    const goyf = byName(me!, "Tarmogoyf");
    goyf.isAttacking = true; goyf.attackingDefenderId = -2; goyf.tapped = true;
    const bears = byName(me!, "Grizzly Bears");
    bears.isAttacking = true; bears.attackingDefenderId = -2; bears.tapped = true;
    const hawk = byName(opp!, "Vampire Nighthawk");
    hawk.isBlocking = true; hawk.blockingIds = [bears.id];
    return (n) => {
      const [me2, opp2] = players(n);
      opp2!.life = 0;
      n.status = "COMPLETE";
      n.winnerId = "0";
      const die = (p: Raw, name: string) => {
        const c = byName(p, name);
        p.battlefield = (p.battlefield as Raw[]).filter((x) => x !== c);
        (p.graveyard as Raw[]).push({ ...c, isBlocking: false, isAttacking: false, blockingIds: [] });
      };
      die(me2!, "Grizzly Bears");
      die(opp2!, "Vampire Nighthawk");
    };
  },
  // The opponent's Serra Angel attacks unblocked, and the next update is already our turn: Endstep
  // went past the damage step (as against a bot). The strike plays all the same.
  "strike-next-turn": (s) => {
    const [, opp] = players(s);
    s.phase = "DECLARE_BLOCKERS";
    s.activePlayerId = "1";
    s.pendingAction = null;
    const angel = byName(opp!, "Serra Angel");
    angel.isAttacking = true; angel.attackingDefenderId = -1;
    return (n) => {
      const [me2, opp2] = players(n);
      me2!.life = (me2!.life as number) - 4;
      byName(opp2!, "Serra Angel").isAttacking = false;
      n.turnNumber = 7; n.phase = "MAIN1"; n.activePlayerId = "0";
    };
  },
  // No state showed the attack at all: the opponent's turn, then ours with 4 life less. The
  // attacker comes from the log ("attacks with [[Serra Angel]]"), nothing blocked.
  "strike-unseen": (s) => {
    const [, opp] = players(s);
    s.activePlayerId = "1";
    s.pendingAction = null;
    const angel = byName(opp!, "Serra Angel");
    return (n) => {
      const [me2] = players(n);
      me2!.life = (me2!.life as number) - 4;
      n.turnNumber = 7; n.activePlayerId = "0";
      n.__events = [
        // As Endstep sends them: the attackers by id only, and each blow with its amount.
        { type: "ATTACKERS_DECLARED", message: "Opponent declared 1 attacker", sequenceNumber: 60, playerIndex: "1", amount: 1, attackerIds: [angel.id] },
        { type: "BLOCKERS_DECLARED", message: "Flavio declared 0 blockers", sequenceNumber: 61, playerIndex: "0", amount: 0 },
        { type: "PLAYER_DAMAGED", message: "Serra Angel deals 4 combat damage to Flavio.", sequenceNumber: 62, playerIndex: "0", cardId: angel.id, cardName: "Serra Angel", amount: 4 },
        { type: "TURN_BEGAN", message: "Turn 7 (Flavio)", sequenceNumber: 63, turnNumber: 7, playerIndex: "0" },
      ];
    };
  },
  // Life gained: Tarmogoyf (as if it had lifelink) hits the opponent and you gain 3, the orbs flying
  // from it into your total; the opponent's Healing Salve (gone from the table) gains them 5, the
  // orbs gathering around their total.
  lifegain: (s) => {
    const [me] = players(s);
    s.pendingAction = null;
    const goyf = byName(me!, "Tarmogoyf");
    return (n) => {
      const [me2, opp2] = players(n);
      me2!.life = (me2!.life as number) + 3;
      opp2!.life = (opp2!.life as number) - 3 + 5;
      n.__events = [
        { type: "PLAYER_DAMAGED", message: "Tarmogoyf deals 3 damage to Opponent.", sequenceNumber: 70, playerIndex: "1", cardId: goyf.id, cardName: "Tarmogoyf", amount: 3 },
        { type: "PLAYER_LIFE_CHANGED", message: "Opponent's life: 12 -> 9", sequenceNumber: 71, playerIndex: "1", oldValue: 12, newValue: 9 },
        { type: "PLAYER_LIFE_CHANGED", message: "Flavio's life: 17 -> 20", sequenceNumber: 72, playerIndex: "0", oldValue: 17, newValue: 20 },
        { type: "SPELL_RESOLVED", message: "Healing Salve - Opponent gains 5 life.", sequenceNumber: 73, cardId: 991, cardName: "Healing Salve" },
        { type: "PLAYER_LIFE_CHANGED", message: "Opponent's life: 9 -> 14", sequenceNumber: 74, playerIndex: "1", oldValue: 9, newValue: 14 },
      ];
    };
  },
  // Several attackers at once, all unblocked: Tarmogoyf, Grizzly Bears and three Soldier tokens
  // (a pile of identical cards). Each strikes the opponent in turn.
  "strike-many": (s) => {
    const [me] = players(s);
    s.phase = "DECLARE_BLOCKERS";
    s.pendingAction = null;
    const soldier = () => creature("Soldier", 1, 1, { isToken: true, tokenSetCode: "tdom", tokenCollectorNumber: "2", color: "W", basePower: 1, baseToughness: 1 });
    bf(me!).push(soldier(), soldier(), soldier());
    for (const c of bf(me!)) if (c.name === "Tarmogoyf" || c.name === "Grizzly Bears" || c.name === "Soldier") {
      c.isAttacking = true; c.attackingDefenderId = -2; c.tapped = true;
    }
    return (n) => {
      const [, opp2] = players(n);
      opp2!.life = (opp2!.life as number) - 8;
      n.phase = "COMBAT_DAMAGE";
      // Endstep moves on at once (end of combat), with priority ours: the fight still plays out.
      n.pendingAction = { type: "PRIORITY", promptVersion: 5, cardOptions: [] };
      return (e: Raw) => {
        e.phase = "END_COMBAT";
        for (const c of bf(players(e)[0]!)) { c.isAttacking = false; c.attackingDefenderId = null; }
      };
    };
  },
  // The same fight before damage: attackers stepped out, the blocker in front of its attacker.
  blocked: (s) => void scenarios.strike!(s),
  // Many blockers, as in the match of 2026-10-16: the bot's Colossal Dreadmaw (trample) and two
  // Llanowar Elves attack; we have eight Soldier tokens to block with (click a Soldier, then its
  // attacker). Each attacker and its blockers get a color and a number.
  "gang-block": (s) => {
    gangBlock(s);
    const [me, opp] = players(s);
    const soldiers = bf(me!).filter((c) => c.name === "Soldier");
    const attackers = bf(opp!).filter((c) => c.isAttacking).map((c) => c.id);
    s.pendingAction = { type: "DECLARE_BLOCKERS", promptVersion: 6, cardOptions: soldiers.map((c) => ({ id: c.id })),
      blockerEligibility: Object.fromEntries(soldiers.map((c) => [String(c.id), attackers])) };
  },
  // The same blocks once declared (six Soldiers on the Dreadmaw, one on each Elf): no arrows, the
  // numbered discs say who fights whom.
  "gang-blocked": (s) => {
    const { soldiers, dreadmaw, elves } = gangBlock(s);
    soldiers.slice(0, 6).forEach((c) => { c.isBlocking = true; c.blockingIds = [dreadmaw.id]; });
    soldiers[6]!.isBlocking = true; soldiers[6]!.blockingIds = [elves[0]!.id];
    soldiers[7]!.isBlocking = true; soldiers[7]!.blockingIds = [elves[1]!.id];
  },
  // Trample: the bot's Colossal Dreadmaw (6/6) is blocked by two Soldiers. It slams into each, then
  // on into us with the 4 left over; the Soldiers die.
  trample: (s) => {
    const { soldiers, dreadmaw } = gangBlock(s, false);
    const blockers = soldiers.slice(0, 2);
    blockers.forEach((c) => { c.isBlocking = true; c.blockingIds = [dreadmaw.id]; });
    s.__events = [
      { type: "ATTACKERS_DECLARED", message: "Forge AI declared 1 attacker", sequenceNumber: 80, playerIndex: "1", amount: 1, attackerIds: [dreadmaw.id] },
      { type: "BLOCKERS_DECLARED", message: "Flavio declared 2 blockers", sequenceNumber: 81, playerIndex: "0", amount: 2,
        blockerAssignments: Object.fromEntries(blockers.map((c) => [String(c.id), dreadmaw.id])) },
    ];
    return (n) => {
      n.phase = "COMBAT_DAMAGE";
      const [me2] = players(n);
      me2!.life = (me2!.life as number) - 4;
      const dead = new Set(blockers.map((c) => c.id));
      me2!.battlefield = bf(me2!).filter((c) => !dead.has(c.id));
      (me2!.graveyard as Raw[]).push(...blockers.map((c) => ({ ...c, isBlocking: false, blockingIds: [] })));
      n.__events = [
        { type: "TURN_PHASE", message: "Forge AI's combat damage", sequenceNumber: 82, phase: "COMBAT_DAMAGE" },
        ...blockers.map((c, i) => ({ type: "CARD_DAMAGED", message: "Colossal Dreadmaw deals 1 damage to Soldier Token.", sequenceNumber: 83 + i,
          cardId: dreadmaw.id, cardName: "Colossal Dreadmaw", targetCardId: c.id, targetCardName: "Soldier Token", amount: 1 })),
        { type: "PLAYER_DAMAGED", message: "Colossal Dreadmaw deals 4 combat damage to Flavio.", sequenceNumber: 85, playerIndex: "0", cardId: dreadmaw.id, cardName: "Colossal Dreadmaw", amount: 4 },
      ];
    };
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
  // After two mulligans: Keep 5, and keeping puts 2 cards on the bottom (the line under the buttons).
  mulligan2: (s) => {
    s.turnNumber = 0; s.phase = "UPKEEP";
    s.pendingAction = { type: "MULLIGAN", promptVersion: 3, message: "Keep this 7-card hand, or mulligan?", stringOptions: ["Keep 7", "Mulligan"] };
    s.__events = [
      { type: "MULLIGAN", sequenceNumber: 30, message: "Flavio mulliganed to 6.", amount: 6, playerIndex: "0", playerName: "Flavio" },
      { type: "MULLIGAN", sequenceNumber: 31, message: "Flavio has mulliganed down to 6 cards.", playerIndex: "0", playerName: "Flavio" },
      { type: "MULLIGAN", sequenceNumber: 32, message: "Flavio mulliganed to 5.", amount: 5, playerIndex: "0", playerName: "Flavio" },
      { type: "HAND_KEPT", sequenceNumber: 33, message: "Opponent kept 7.", amount: 7, playerIndex: "1", playerName: "Opponent" },
    ];
  },
  // The opponent mulliganed once and is choosing again (the line under the heading).
  mulligan3: (s) => {
    s.turnNumber = 0; s.phase = "UPKEEP";
    s.pendingAction = { type: "MULLIGAN", promptVersion: 3, message: "Keep this 7-card hand, or mulligan?", stringOptions: ["Keep 7", "Mulligan"] };
    s.__events = [
      { type: "MULLIGAN", sequenceNumber: 30, message: "Opponent mulliganed to 6.", amount: 6, playerIndex: "1", playerName: "Opponent" },
    ];
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
  // Learn: the Lessons in the sideboard and the hand, offered together as Endstep sends them.
  learn: (s) => {
    const [me] = players(s);
    const lessons = ["Environmental Sciences", "Pest Summoning", "Mascot Exhibition", "Containment Breach"];
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 19, sourceCardName: "Eyetwitch", message: "Learn", min: 0, max: 1,
      cardOptions: [
        ...lessons.map((n, i) => ({ id: 970 + i, name: n, typeLine: "Sorcery — Lesson", zone: "Sideboard" })),
        ...((me!.hand as Raw[] | undefined) ?? []).map((c) => ({ ...c, zone: "Hand" })),
      ] };
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
  // Many copies: nine Mountains and six Soldier tokens pile in fours.
  copies: (s) => {
    const [me] = players(s);
    me!.battlefield = [
      ...Array.from({ length: 9 }, () => land("Mountain")),
      land("Island"), land("Island"),
      ...Array.from({ length: 6 }, () => creature("Soldier", 1, 1, { isToken: true, tokenSetCode: "tdom", tokenCollectorNumber: "2", color: "W", basePower: 1, baseToughness: 1 })),
      creature("Goblin Guide", 2, 2),
    ];
  },
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
  // Our Thoughtseize: their hand is revealed and we pick the card they discard. Their hand stays
  // backs on the table; the cards to pick from are a fan, like a graveyard's.
  discard: (s) => {
    const [, opp] = players(s);
    opp!.hand = Array.from({ length: 4 }, (_, i) => ({ id: 1010000028 + i, name: "Hidden card", zone: "Hand", faceDown: true }));
    opp!.handSize = 4;
    const names: [string, string][] = [["Griselbrand", "Legendary Creature — Demon"], ["Swamp", "Basic Land — Swamp"], ["Dark Ritual", "Instant"], ["Counterspell", "Instant"]];
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 23, sourceCardName: "Thoughtseize", min: 1, max: 1, mandatory: true,
      message: "Choose a nonland card to discard.",
      cardOptions: names.map(([name, typeLine], i) => ({ id: 2000 + i, name, typeLine, zone: "HAND", ownerName: "Opponent" })).filter((c) => c.name !== "Swamp") };
  },
  // Thought-Knot Seer: their hand is revealed (sent face up) and we choose a nonland card from
  // it, asked as a target choice that names the cards by id only. Picked from a fan all the same.
  tks: (s) => {
    const [, opp] = players(s);
    const hand = [card("Griselbrand", { typeLine: "Legendary Creature — Demon" }), card("Swamp", { typeLine: "Basic Land — Swamp" }),
      card("Dark Ritual", { typeLine: "Instant" }), card("Counterspell", { typeLine: "Instant" })];
    opp!.hand = hand;
    opp!.handSize = hand.length;
    s.pendingAction = { type: "CHOOSE_TARGETS", promptVersion: 24, sourceCardName: "Thought-Knot Seer", min: 1, max: 1, mandatory: true,
      message: "Choose a nonland card to exile.",
      cardOptions: hand.filter((c) => c.name !== "Swamp").map((c) => ({ id: c.id })) };
  },
  // Thoughtseize on ourselves: a discard from our own hand, picked right on the hand (no fan).
  "self-discard": (s) => {
    const [me] = players(s);
    const hand = me!.hand as Raw[];
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 25, sourceCardName: "Thoughtseize", min: 1, max: 1, mandatory: true,
      message: "Choose a nonland card to discard.",
      cardOptions: hand.filter((c) => !/Land/.test(String(c.typeLine))).map((c) => ({ id: c.id, zone: "HAND" })) };
  },
  // An activated ability's cost: "{T}, Discard a card: Draw a card." Picked on our hand, no fan, no arrow.
  "discard-cost": (s) => {
    const [me] = players(s);
    const hand = me!.hand as Raw[];
    s.pendingAction = { type: "CHOOSE_CARDS", contextType: "discard", promptVersion: 26, sourceCardName: "Rummaging Goblin", min: 1, max: 1, mandatory: false,
      message: "Discard a card", cardOptions: hand.map((c) => ({ id: c.id, zone: "HAND" })) };
  },
  // Faithless Looting: two cards drawn, then two discarded, asked without saying "discard".
  // Picked on our hand all the same.
  looting: (s) => {
    const [me] = players(s);
    const hand = me!.hand as Raw[];
    hand.push(card("Mountain", { typeLine: "Basic Land — Mountain" }), card("Lightning Bolt", { typeLine: "Instant" }));
    me!.handSize = hand.length;
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 27, sourceCardName: "Faithless Looting", min: 2, max: 2, mandatory: true,
      message: "Choose 2 cards", cardOptions: hand.map((c) => ({ id: c.id, zone: "HAND" })) };
  },
  // Surgical Extraction on our own graveyard's Lightning Bolt: the copies to exile, from our hand
  // (asked first on its own, then with the graveyard and library ones), in a fan.
  surgical: (s) => {
    const [me] = players(s);
    const hand = me!.hand as Raw[];
    const bolt = hand.find((c) => c.name === "Lightning Bolt")!;
    const graveBolt = card("Lightning Bolt", { typeLine: "Instant" });
    (me!.graveyard as Raw[]).push(graveBolt);
    const libraryBolt = card("Lightning Bolt", { typeLine: "Instant" });
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 26, sourceCardName: "Surgical Extraction", min: 0, max: 3, mandatory: false,
      message: "Choose any number of cards named Lightning Bolt to exile.",
      cardOptions: [{ id: bolt.id, zone: "HAND" }, { id: graveBolt.id, zone: "GRAVEYARD" }, { ...libraryBolt, zone: "LIBRARY" }] };
  },
  // Surgical Extraction step by step, as Endstep asks it: the target in a graveyard, then the
  // copies in the graveyard, the hand and the library, each its own choice (and its own fan).
  "surgical-target": (s) => {
    const [me] = players(s);
    const graveBolt = card("Lightning Bolt", { typeLine: "Instant" });
    (me!.graveyard as Raw[]).push(graveBolt);
    s.pendingAction = { type: "CHOOSE_TARGETS", promptVersion: 28, sourceCardName: "Surgical Extraction", min: 1, max: 1, mandatory: true,
      message: "Choose target card in a graveyard other than a basic land card.",
      cardOptions: (me!.graveyard as Raw[]).map((c) => ({ id: c.id, zone: "GRAVEYARD" })) };
  },
  "surgical-grave": (s) => {
    const [me] = players(s);
    const graveBolt = card("Lightning Bolt", { typeLine: "Instant" });
    (me!.graveyard as Raw[]).push(graveBolt);
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 29, sourceCardName: "Surgical Extraction", min: 0, max: 1, mandatory: false,
      message: "Search the graveyard for cards named Lightning Bolt.", cardOptions: [{ id: graveBolt.id, zone: "GRAVEYARD" }] };
  },
  // The copies in our own hand: a fan too, not picked on the hand.
  "surgical-hand": (s) => {
    const [me] = players(s);
    const bolt = (me!.hand as Raw[]).find((c) => c.name === "Lightning Bolt")!;
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 30, sourceCardName: "Surgical Extraction", min: 0, max: 1, mandatory: false,
      message: "Search the hand for cards named Lightning Bolt.", cardOptions: [{ id: bolt.id, zone: "HAND" }] };
  },
  // The same asked as a target choice (Endstep's client handles both alike).
  "surgical-hand-t": (s) => {
    const [me] = players(s);
    const bolt = (me!.hand as Raw[]).find((c) => c.name === "Lightning Bolt")!;
    s.pendingAction = { type: "CHOOSE_TARGETS", promptVersion: 31, sourceCardName: "Surgical Extraction", min: 0, max: 1, mandatory: false,
      message: "Search the hand for cards named Lightning Bolt.", cardOptions: [{ id: bolt.id }] };
  },
  "surgical-library": (s) => {
    const lib = card("Lightning Bolt", { typeLine: "Instant" });
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 32, sourceCardName: "Surgical Extraction", min: 0, max: 1, mandatory: false,
      message: "Search the library for cards named Lightning Bolt.", cardOptions: [{ ...lib, zone: "LIBRARY" }] };
  },
  // Emrakul, the Promised End: we play the opponent's turn. Their hand is sent face up, they are
  // `controlledBySeat` us, and the prompt offers their cards.
  control: (s) => {
    const [, opp] = players(s);
    const swamp = card("Swamp", { typeLine: "Basic Land — Swamp" });
    const rite = card("Dark Ritual", { typeLine: "Instant" });
    opp!.hand = [rite, swamp, card("Thoughtseize", { typeLine: "Sorcery" }), card("Griselbrand", { typeLine: "Legendary Creature — Demon" })];
    opp!.handSize = 4;
    opp!.controlledBySeat = 0;
    s.activePlayerId = "1";
    s.priorityPlayerId = "1";
    s.pendingAction = { type: "PRIORITY", promptVersion: 19, cardOptions: [
      { id: rite.id, zone: "HAND", playableAbilities: [{ index: 0, description: "Cast Dark Ritual", cost: "{B}" }] },
      { id: swamp.id, zone: "HAND", playableAbilities: [{ index: 0, description: "Play Swamp" }] },
    ] };
  },
  // Cavern of Souls: a creature type among all of them, searched like a card name.
  type: (s) => {
    s.pendingAction = { type: "CHOOSE_TYPE", promptVersion: 20, sourceCardName: "Cavern of Souls", message: "Choose a creature type",
      stringOptions: ["Human", "Elf", "Goblin", "Merfolk", "Zombie", "Eldrazi", "Elemental", "Elephant", "Elk", "Angel", "Demon", "Dragon", "Wizard", "Warrior", "Sliver", "Spirit", "Soldier", "Vampire"] };
  },
  // Permanents with a choice made for them: a creature type, a named card, colors.
  chosen: (s) => {
    const [me, opp] = players(s);
    bf(me!).push(land("Cavern of Souls", { typeLine: "Land", chosenMarks: [{ kind: "TYPE", value: "Eldrazi" }] }),
      card("Pithing Needle", { typeLine: "Artifact", chosenMarks: [{ kind: "NAME", value: "Jace, the Mind Sculptor" }] }));
    bf(opp!).push(card("Runed Halo", { typeLine: "Enchantment", chosenMarks: [{ kind: "NAME", value: "Emrakul, the Promised End" }] }),
      creature("Voice of All", 2, 2, { chosenMarks: [{ kind: "COLOR", value: "Red" }] }));
  },
  // Forty cards in hand: each shows a sliver, and sliding along the hand goes through them.
  bighand: (s) => {
    const [me] = players(s);
    const names = ["Lightning Bolt", "Counterspell", "Island", "Serra Angel", "Llanowar Elves", "Brainstorm", "Opt", "Mountain", "Tarmogoyf", "Dark Ritual"];
    me!.hand = Array.from({ length: 40 }, (_, i) => card(names[i % names.length]!));
    me!.handSize = 40;
    s.pendingAction = { type: "PRIORITY", promptVersion: 21, cardOptions: (me!.hand as Raw[]).filter((_, i) => i % 3 === 0).map((c) => ({ id: c.id, zone: "HAND" })) };
  },
  // Priority in the opponent's turn: the blue ⏩ under Pass passes until yours.
  oppturn: (s) => {
    s.activePlayerId = "1"; s.phase = "MAIN2"; s.turnNumber = 7;
    s.pendingAction = { type: "PRIORITY", promptVersion: 23, cardOptions: [] };
  },
  // What the opponent can play from outside their hand, by it: flashback and escape in their
  // graveyard, an adventure in exile. (Their other cards there, and Snapcaster's mention of
  // flashback, don't count.)
  oppside: (s) => {
    const [, opp] = players(s);
    (opp!.graveyard as Raw[]).push(
      card("Faithless Looting", { typeLine: "Sorcery", oracleText: "Draw two cards, then discard two cards.\nFlashback {2}{R}" }),
      card("Kroxa, Titan of Death's Hunger", { typeLine: "Legendary Creature — Elder Giant", oracleText: "When Kroxa enters, sacrifice it unless it escaped.\nEscape—{B}{B}{R}{R}, Exile five other cards from your graveyard." }),
      card("Snapcaster Mage", { typeLine: "Creature — Human Wizard", oracleText: "Flash\nWhen Snapcaster Mage enters, target instant or sorcery card in your graveyard gains flashback until end of turn." }),
      card("Lightning Bolt", { typeLine: "Instant", oracleText: "Lightning Bolt deals 3 damage to any target." }));
    (opp!.exile as Raw[]).push(
      card("Bonecrusher Giant", { typeLine: "Creature — Giant // Instant — Adventure", oracleText: "Whenever Bonecrusher Giant becomes the target of a spell, it deals 2 damage to that spell's controller." }));
  },
  // Nine cards in hand on your turn: you'll discard two at the end of it.
  handlimit: (s) => {
    const [me] = players(s);
    const names = ["Lightning Bolt", "Counterspell", "Island", "Serra Angel", "Llanowar Elves", "Brainstorm", "Opt", "Mountain", "Tarmogoyf"];
    me!.hand = names.map((n) => card(n));
    me!.handSize = names.length;
  },
  // A full graveyard, a dozen of its cards castable from there (the side hand).
  bigyard: (s) => {
    const [me] = players(s);
    const names = ["Faithless Looting", "Lingering Souls", "Deep Analysis", "Think Twice", "Opt", "Brainstorm", "Lightning Bolt", "Counterspell"];
    me!.graveyard = Array.from({ length: 30 }, (_, i) => card(names[i % names.length]!));
    s.pendingAction = { type: "PRIORITY", promptVersion: 22, cardOptions: (me!.graveyard as Raw[]).filter((_, i) => i % 8 < 3).map((c) => ({ id: c.id, zone: "GRAVEYARD", playableAbilities: [{ index: 0, description: "Flashback" }] })) };
  },
  // Emblems: ours (Chandra's), and the opponent's Narset emblem, which only weighs on us.
  emblem: (s) => {
    const [me, opp] = players(s);
    (me!.commandZone as Raw[]).push(
      card("Chandra, Torch of Defiance's emblem", { types: ["Emblem"], effectSourceName: "Chandra, Torch of Defiance", oracleText: "Whenever you cast a spell, this emblem deals 5 damage to any target." }));
    (opp!.commandZone as Raw[]).push(
      card("Narset Transcendent's emblem", { types: ["Emblem"], effectSourceName: "Narset Transcendent", oracleText: "Your opponents can't cast noncreature spells." }),
      card("Elspeth, Knight-Errant's emblem", { types: ["Emblem"], effectSourceName: "Elspeth, Knight-Errant", oracleText: "Artifacts, creatures, enchantments, and lands you control have indestructible." }));
  },
  // Casting Indomitable Creativity: X, as Endstep asks it (minValue/maxValue).
  x: (s) => {
    s.pendingAction = { type: "CHOOSE_NUMBER", promptVersion: 18, sourceCardName: "Indomitable Creativity", message: "Choose a value for X",
      minValue: 0, maxValue: 4, canUndo: true };
  },
  // A planeswalker's Choose One: Garruk Wildspeaker at 3 loyalty can't use its −4 (grey).
  pw: (s) => {
    const garruk = card("Garruk Wildspeaker", { ...GARRUK, loyalty: 3, counters: { LOYALTY: 3 } });
    bf(players(s)[0]!).push(garruk);
    s.pendingAction = { type: "CHOOSE_ABILITY", promptVersion: 11, sourceCardId: garruk.id, sourceCardName: "Garruk Wildspeaker", min: 1, max: 1,
      modeOptions: [
        { index: 0, description: "+1: Untap two target lands." },
        { index: 1, description: "−1: Create a 3/3 green Beast creature token." },
        { index: 2, description: "−4: Creatures you control get +3/+3 and gain trample until end of turn." },
      ] };
  },
  // The same, clicked on the table during your turn: Endstep offers only the abilities it can use
  // now (+1 and −1); the −4 shows in grey all the same. Open it with ?play=970.
  "pw-click": (s) => {
    const garruk = card("Garruk Wildspeaker", { ...GARRUK, id: 970, loyalty: 3, counters: { LOYALTY: 3 } });
    bf(players(s)[0]!).push(garruk);
    s.pendingAction = { type: "PRIORITY", promptVersion: 11, cardOptions: [{ id: garruk.id, zone: "BATTLEFIELD", playableAbilities: [
      { index: 0, description: "Untap two target lands.", cost: "+1" },
      { index: 1, description: "Create a 3/3 green Beast creature token.", cost: "-1" },
    ] }] };
  },
  // Loyalty abilities on the stack, with their cost under the frame: one Endstep names by its
  // printed text (yieldKey), one only by what it does.
  "pw-stack": (s) => {
    const garruk = card("Garruk Wildspeaker", { ...GARRUK, loyalty: 2, controllerId: "0" });
    bf(players(s)[0]!).push(garruk);
    const jace = { id: 930, name: "Jace, the Mind Sculptor", controllerId: "1", types: ["Planeswalker"], typeLine: "Legendary Planeswalker — Jace", color: "U",
      oracleText: "+2: Look at the top card of target player's library. You may put that card on the bottom of that player's library.\n0: Draw three cards, then put two cards from your hand on top of your library in any order.\n−1: Return target creature to its owner's hand.\n−12: Exile all cards from target player's library, then that player shuffles their hand into their library." };
    s.stack = [
      { stackTargetId: 931, isAbility: true, abilityDescription: "Jace, the Mind Sculptor (930) - Opponent draws three cards, then puts two cards from their hand on top of their library in any order.", sourceCard: jace },
      { stackTargetId: 932, isAbility: true, abilityDescription: `Garruk Wildspeaker (${garruk.id}) - Create a 3/3 green Beast creature token.`,
        yieldKey: `Garruk Wildspeaker (${garruk.id}): −1: Create a 3/3 green Beast creature token.`, sourceCard: { ...garruk, types: ["Planeswalker"] } },
    ];
    s.priorityPlayerId = "0";
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
  },
  // A modal spell on the stack: the modes not chosen dimmed, told by what Endstep's description
  // says it does.
  modal: (s) => {
    const command = { id: 940, name: "Kolaghan's Command", controllerId: "1", types: ["Instant"], typeLine: "Instant", color: "BR",
      oracleText: "Choose two —\n• Return target creature card from your graveyard to your hand.\n• Target player discards a card.\n• Destroy target artifact.\n• Kolaghan's Command deals 2 damage to any target." };
    const angel = byName(players(s)[1]!, "Serra Angel");
    s.stack = [{ stackTargetId: 941, isAbility: false, sourceCard: command, targets: [{ id: -1, zone: "Player" }, { id: angel.id, zone: "Battlefield" }],
      abilityDescription: `Kolaghan's Command (940) - Flavio discards a card. Kolaghan's Command deals 2 damage to Serra Angel (${angel.id}).` }];
    s.priorityPlayerId = "0";
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
  },
  // Arena's ability frames on the stack: an activated ability (as printed, cost included) and a trigger.
  "ability-frames": (s) => {
    const [me, opp] = players(s);
    const mesa = { id: 960, name: "Arid Mesa", controllerId: "0", types: ["Land"], typeLine: "Land", color: "C",
      oracleText: "{T}, Pay 1 life, Sacrifice Arid Mesa: Search your library for a Mountain or Plains card, put it onto the battlefield, then shuffle." };
    const mako = { id: 961, name: "Marauding Mako", controllerId: "1", types: ["Creature"], typeLine: "Creature — Shark", color: "UR",
      oracleText: "Whenever you discard one or more cards, put that many +1/+1 counters on this creature.\nCycling {2}" };
    s.stack = [
      { stackTargetId: 962, isAbility: true, isTrigger: true, abilityDescription: "Whenever you discard one or more cards, put that many +1/+1 counters on this creature. [Player: Opponent, Amount: 3]", sourceCard: mako },
      { stackTargetId: 963, isAbility: true, abilityDescription: "Arid Mesa (960) - Flavio searches their library for a Mountain or Plains card, puts it onto the battlefield, then shuffles.",
        yieldKey: "Arid Mesa (960): {T}, Pay 1 life, Sacrifice Arid Mesa: Search your library for a Mountain or Plains card, put it onto the battlefield, then shuffle.", sourceCard: mesa },
    ];
    void me; void opp;
    s.priorityPlayerId = "0";
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
  },
  pay: (s) => {
    s.pendingAction = { type: "PAY_MANA", promptVersion: 10, message: "Pay {2}{R}{G} for Bloodbraid Elf", sourceCardName: "Bloodbraid Elf",
      cardOptions: [{ id: 100 }, { id: 101 }, { id: 102 }, { id: 103 }] };
  },
  // Paying for Dismember ({1}{B/P}{B/P}): each Phyrexian symbol takes {B} or 2 life (the button,
  // or a click on your plate).
  phyrexian: (s) => {
    s.pendingAction = { type: "PAY_MANA", promptVersion: 12, message: "Pay {1}{B/P}{B/P} for Dismember", sourceCardName: "Dismember",
      phyrexianMana: true, canAutoPay: true, cardOptions: [{ id: 100 }, { id: 102 }, { id: 103 }] };
  },
  // Arc Lightning, cast at the Nighthawk, the Angel and the opponent: its 3 damage divided among
  // them, asked with the damage bar (as Endstep asks every division). At least 1 to each.
  fireball: (s) => {
    const [, opp] = players(s);
    const angel = byName(opp!, "Serra Angel");
    const hawk = byName(opp!, "Vampire Nighthawk");
    s.stack = [{ stackTargetId: 990, sourceCard: { id: 991, name: "Arc Lightning", controllerId: "0", typeLine: "Sorcery", types: ["Sorcery"],
      oracleText: "Arc Lightning deals 3 damage divided as you choose among one, two, or three targets." },
      targets: [{ id: hawk.id, zone: "Battlefield" }, { id: angel.id, zone: "Battlefield" }, { id: -2, zone: "Player" }] }];
    s.pendingAction = { type: "ASSIGN_DAMAGE", promptVersion: 23, sourceCardId: 991, sourceCardName: "Arc Lightning", maxValue: 3,
      message: "Divide 3 damage among the targets.",
      cardOptions: [
        { id: hawk.id, name: "Vampire Nighthawk", types: ["Creature"], lethalDamage: 2 },
        { id: angel.id, name: "Serra Angel", types: ["Creature"], lethalDamage: 4 },
        { id: -2, name: "Opponent", types: ["Player"] },
      ] };
  },
  // Arc Lightning as Endstep really asks it (2026-10-16): the targets first ("Select any target to
  // distribute damage to"), then one number per target in that order ("Assign 3 remaining to
  // Vampire Nighthawk (Arc Lightning)"). The board shows the division on the table once the targets
  // are in, and answers each number itself; the console logs the ACTIONs.
  "arc-lightning": (s) => {
    const [, opp] = players(s);
    const angel = byName(opp!, "Serra Angel");
    const hawk = byName(opp!, "Vampire Nighthawk");
    const src = { sourceCardId: 991, sourceCardName: "Arc Lightning", sourceSpellAbilityId: "777", canUndo: true,
      sourceAbilityText: "Arc Lightning deals 3 damage divided as you choose among one, two, or three targets." };
    // Three identical Swiftspears make a pile; the one targeted comes out of it.
    const spears = Array.from({ length: 3 }, () => creature("Monastery Swiftspear", 1, 2, { oracleText: "Haste\nProwess" }));
    bf(opp!).push(...spears);
    const names: Record<string, string> = { "-1": "Flavio", "-2": "Opponent", [String(hawk.id)]: "Vampire Nighthawk", [String(angel.id)]: "Serra Angel",
      ...Object.fromEntries(spears.map((c) => [String(c.id), "Monastery Swiftspear"])) };
    s.pendingAction = { type: "CHOOSE_TARGETS", promptVersion: 30, message: "Select any target to distribute damage to", min: 1, max: 3, mandatory: false, ...src,
      cardOptions: [
        { id: -1, name: "Flavio", zone: "Player", types: ["Player"] }, { id: -2, name: "Opponent", zone: "Player", types: ["Player"] },
        { id: hawk.id, name: "Vampire Nighthawk", zone: "Battlefield", types: ["Creature"] }, { id: angel.id, name: "Serra Angel", zone: "Battlefield", types: ["Creature"] },
        ...spears.map((c) => ({ id: c.id, name: "Monastery Swiftspear", zone: "Battlefield", types: ["Creature"] })),
      ] };
    let queue: string[] = [];
    let left = 3;
    const ask = (): Raw | undefined => queue.length
      ? { type: "CHOOSE_NUMBER", message: `Assign ${left} remaining to ${names[queue[0]!]} (Arc Lightning)`, min: 0, max: 0, minValue: 1, maxValue: left - (queue.length - 1), cardOptions: [], ...src }
      : undefined;
    answerWith = (a) => {
      if (a.type === "CHOOSE_TARGETS") { queue = (a.targets as unknown[]).map(String); left = 3; return ask(); }
      if (a.type === "CHOOSE_NUMBER") { queue.shift(); left -= Number(a.numberValue); return ask(); }
      return undefined;
    };
  },
  // The same Arc Lightning on the stack once divided: each target's share by its arrow.
  divided: (s) => {
    const [, opp] = players(s);
    const angel = byName(opp!, "Serra Angel");
    const hawk = byName(opp!, "Vampire Nighthawk");
    s.stack = [{ stackTargetId: 990, sourceCard: { id: 991, name: "Arc Lightning", controllerId: "0", typeLine: "Sorcery", types: ["Sorcery"] },
      targets: [{ id: hawk.id, zone: "Battlefield", dividedAmount: 1 }, { id: angel.id, zone: "Battlefield", dividedAmount: 1 }, { id: -2, zone: "Player", dividedAmount: 1 }] }];
    s.priorityPlayerId = "1";
    s.pendingAction = null;
  },
  // A best of three, game 2, you 1–0 up (Endstep's matchScore): a pip by each name per game won,
  // and "Game 2 of 3 · 1–0" by the turn.
  bo3: (s) => {
    s.matchScore = { winsBySeat: [1, 0], player0Wins: 1, player1Wins: 0, gameNumber: 2, gamesPlayed: 1, gamesPerMatch: 3, isMatchOver: false };
  },
  // Game 2 of a best of three won: Victory, and "Match won 2–0" under it.
  "bo3-won": (s) => {
    s.status = "COMPLETE"; s.winnerId = "0"; s.pendingAction = null;
    s.matchScore = { winsBySeat: [2, 0], player0Wins: 2, player1Wins: 0, gameNumber: 2, gamesPlayed: 2, gamesPerMatch: 3, isMatchOver: true };
  },
  // A replay at its last frame: the opponent won game 2, the match at 1–1. Who won shows, under the
  // replay's controls; winding back takes it away.
  "replay-won": (s) => {
    s.pendingAction = null;
    s.status = "COMPLETE"; s.winnerId = "1";
    s.matchScore = { winsBySeat: [1, 1], player0Wins: 1, player1Wins: 1, gameNumber: 2, gamesPlayed: 2, gamesPerMatch: 3, isMatchOver: false };
    s.__replay = { frame: 119, frames: 120, playing: false, speed: 1, turn: 9, turnStarts: [0, 12, 30, 41, 60, 75, 88, 99, 110] };
  },
  // Watching a replay: no prompt, the replay's controls on top.
  replay: (s) => {
    s.pendingAction = null;
    s.__replay = { frame: 41, frames: 120, playing: false, speed: 1, turn: 5, turnStarts: [0, 12, 30, 41, 60] };
  },
  // The opponent lost connection: their seat concedes in 1:23 unless they return.
  disconnect: (s) => {
    s.__disconnected = 1;
  },
  // A timed match: your clock is running, and you've been idle long enough to be warned.
  clock: (s) => {
    const now = Date.now();
    s.clock = { serverNowMs: now, runningSide: "0", runningSideDeadlineMs: now + 252_000, remainingMs: [252_000, 431_000] };
    s.idleTimeout = { seat: "0", deadlineMs: now + 25_000, serverNowMs: now, graceMs: 30_000 };
  },
  // The opponent's clock is running low while they decide (they're the one being waited on).
  "clock-opp": (s) => {
    const now = Date.now();
    s.activePlayerId = "1";
    s.priorityPlayerId = "1";
    s.pendingAction = null;
    s.clock = { serverNowMs: now, runningSide: "1", runningSideDeadlineMs: now + 24_000, remainingMs: [318_000, 24_000] };
    s.idleTimeout = { seat: "1", deadlineMs: now + 70_000, serverNowMs: now, graceMs: 30_000 };
  },
  // Keyword boxes: Serra Angel's printed keywords (hover it with ?point), Grizzly Bears' granted ones.
  keywords: (s) => {
    const [me, opp] = players(s);
    byName(opp!, "Serra Angel").oracleText = "Flying, vigilance";
    byName(me!, "Tarmogoyf").oracleText = "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.";
    byName(me!, "Goblin Guide").oracleText = "Haste\nWhenever Goblin Guide attacks, defending player reveals the top card of their library. If it's a land card, that player puts it into their hand.";
    byName(opp!, "Vampire Nighthawk").oracleText = "Flying\nDeathtouch\nLifelink";
  },
  // Fact or Fiction: the opponent split five cards into two piles (one card face down to you).
  piles: (s) => {
    const c = (id: number, name: string, setCode?: string, n?: string) => ({ id, name, selectedSetCode: setCode, selectedCollectorNumber: n });
    s.pendingAction = { type: "CHOOSE_PILE", promptVersion: 12, sourceCardId: 990, sourceCardName: "Fact or Fiction", message: "Choose a pile to put into your hand",
      piles: [
        { id: "A", label: "Pile 1", size: 2, cards: [c(991, "Counterspell"), c(992, "Snapcaster Mage")] },
        { id: "B", label: "Pile 2", size: 3, cards: [c(993, "Island"), c(994, "Brainstorm")] },
      ] };
  },
  // The opponent cast Fact or Fiction: you separate the top five cards of their library into two piles.
  split: (s) => {
    const names = ["Lightning Bolt", "Counterspell", "Island", "Snapcaster Mage", "Brainstorm"];
    s.pendingAction = { type: "CHOOSE_CARDS", promptVersion: 13, sourceCardName: "Fact or Fiction", message: "Divide cards into two piles",
      min: 0, max: 5, cardOptions: names.map((name, i) => ({ id: 980 + i, name, zone: "LIBRARY" })) };
  },
  // Sideboarding before game 2: a Burn deck (60) and its sideboard (15).
  sideboard: (s) => {
    const list: [number, string, string, string][] = [
      [4, "Lightning Bolt", "{R}", "Instant"], [4, "Goblin Guide", "{R}", "Creature"], [4, "Monastery Swiftspear", "{R}", "Creature"],
      [4, "Eidolon of the Great Revel", "{R}{R}", "Enchantment Creature"], [4, "Lava Spike", "{R}", "Sorcery"], [4, "Rift Bolt", "{2}{R}", "Sorcery"],
      [4, "Skewer the Critics", "{2}{R}", "Sorcery"], [4, "Light Up the Stage", "{2}{R}", "Sorcery"], [4, "Boros Charm", "{R}{W}", "Instant"],
      [4, "Lightning Helix", "{R}{W}", "Instant"], [8, "Mountain", "", "Basic Land"], [4, "Inspiring Vantage", "", "Land"],
      [4, "Sacred Foundry", "", "Land"], [4, "Arid Mesa", "", "Land"],
      // Sideboard.
      [3, "Path to Exile", "{W}", "Instant"], [3, "Smash to Smithereens", "{1}{R}", "Instant"], [2, "Kor Firewalker", "{W}{W}", "Creature"],
      [3, "Deflecting Palm", "{R}{W}", "Instant"], [4, "Searing Blood", "{R}{R}", "Instant"],
    ];
    const cardOptions = list.flatMap(([n, name, manaCost, typeLine]) =>
      Array.from({ length: n }, () => ({ id: nextId++, name, manaCost, typeLine, types: typeLine.split(" ").filter((t) => t !== "Basic") })));
    s.matchScore = { gamesPlayed: 1, player0Wins: 0, player1Wins: 1 };
    s.pendingAction = { type: "CHOOSE_CARDS", contextType: "sideboard", promptVersion: 20, message: "Sideboard for game 2", min: 60, max: 999, cardOptions,
      sideboardState: { mainCount: 60, mode: "SIDEBOARD", self: "EDITING", opponent: "SUBMITTED", deadlineMs: Date.now() + 154_000 } };
  },
  // Game information: the zone counts under the piles, the players' counters (experience, rad,
  // the Ring, the city's blessing, an enduring story, a dungeon room, commander tax), night, and
  // in the enlarged cards' boxes their counters and state: hover Tarmogoyf (3 +1/+1 and a stun
  // counter, entered this turn), the Serra Angel (targeted by Lightning Bolt), or the Opt that has
  // just gone to the graveyard (click it).
  info: (s) => {
    const [me, opp] = players(s);
    Object.assign(opp!, { experienceCounters: 3, radCounters: 2, ringTempts: 2, hasCitysBlessing: true, dungeonRoomId: "Lost Mine of Phandelver: Goblin Lair", commanderTax: { 0: 2 } });
    Object.assign(me!, { hasEnduringStory: true, radCounters: 1 });
    s.isNight = true;
    const goyf = byName(me!, "Tarmogoyf");
    goyf.counters = { P1P1: 3, STUN: 1 };
    goyf.hasSummoningSickness = true;
    const angel = byName(opp!, "Serra Angel");
    s.stack = [{ stackTargetId: 990, isAbility: false, sourceCard: { id: 990, name: "Lightning Bolt", controllerId: "0", types: ["Instant"] }, targets: [{ id: angel.id, zone: "Battlefield" }] }];
    return (t) => {
      const mine = players(t)[0]!;
      const hand = mine.hand as Raw[];
      (mine.graveyard as Raw[]).push(card("Opt", { typeLine: "Instant" }));
      mine.hand = hand;
    };
  },
  // The match chat: a conversation so far (open it with C or the Chat button), then the opponent
  // writes (a bubble by their picture), a spectator chimes in (a bubble under the Chat button),
  // and the opponent starts typing again. With ?step=<ms> they come one by one.
  chat: (s) => {
    const old = Date.now() - 120_000;
    const msg = (username: string, message: string, ts: number, extra: Raw = {}) =>
      ({ type: "CHAT", matchId: "harness", timestamp: ts, payload: { message, messageId: `m${ts}${username}`, userId: username, username, senderRole: "player", ...extra } });
    s.__chat = [msg("Opponent", "Hello! good luck", old), msg("Flavio", "glhf!", old + 4000), msg("Opponent", "nice opening", old + 60_000)];
    return (t) => {
      t.__chat = [...(t.__chat as Raw[]), msg("Opponent", "gg wp, that Tarmogoyf was huge", Date.now())];
      return (u) => {
        u.__chat = [...(u.__chat as Raw[]), msg("Watcher42", "what a game", Date.now(), { senderRole: "spectator" })];
        return (v) => {
          v.__chat = [...(v.__chat as Raw[]), { type: "CHAT_TYPING", matchId: "harness", payload: { scope: "match", id: "harness", userId: "Opponent", username: "Opponent", active: true } }];
        };
      };
    };
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
// #match:<name>: a match recorded with the dev bridge and kept in tests/fixtures (see
// tools/save-match.mjs), its frames played through the adapter as they came.
const playing = /^match(?::([\w-]+))?$/.exec(name);
const raw = baseState();
const nextStep = playing ? undefined : scenarios[name]?.(raw);
let seq = 1;
// The adapter adds reveals from game events; scenarios list those events in raw.__events.
// Scenarios mark what the adapter would add: a replay's position (raw.__replay), a player who
// lost connection (raw.__disconnected: their index, with 83 s left).
// The chat, as the adapter keeps it: the frames a scenario lists in raw.__chat, each taken once.
const chat = new MatchChat();
const chatTaken = new Set<unknown>();
const build = (meta: { viewerSeat?: number; seq: number }) => {
  const s = normalize(raw, { matchId: "harness", viewerSeat: meta.viewerSeat ?? 0, seq: meta.seq, desynced: false });
  for (const frame of (raw.__chat as Raw[] | undefined) ?? []) {
    if (chatTaken.has(frame)) continue;
    chatTaken.add(frame);
    chat.handle(frame, "Flavio");
  }
  const chatView = chat.view();
  const gone = raw.__disconnected as number | undefined;
  return {
    ...s,
    players: s.players.map((p, i) => (i === gone ? { ...p, disconnected: { deadline: Date.now() + 83_000 } } : p)),
    reveals: ((raw.__events as Raw[] | undefined) ?? []).map((e) => toReveal(e)).filter((r): r is RevealView => !!r),
    log: ((raw.__events as Raw[] | undefined) ?? []).map((e, i) => toLogEntry(e, i + 1)).filter((e): e is LogEntry => !!e),
    ...(raw.__spectating ? { spectating: true } : {}),
    ...(raw.__replay ? { replay: raw.__replay as ReplayStatus } : {}),
    ...(chatView ? { chat: chatView } : {}),
  };
};
let state: GameState = build({ seq: 1 });

const host = document.createElement("div");
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `<style>${overlayCss}\n${boardCss}</style><div class="layer is-on board-on"></div>`;
document.body.appendChild(host);
const controller = new GameController(() => state, (matchId, action) => {
  console.log("ACTION", JSON.stringify({ matchId, action }));
  (window as unknown as { __actions: unknown[] }).__actions.push(action);
  // Stand in for the server: an answer closes the prompt and hands priority back (or, where the
  // scenario says, asks the next question).
  if (action.type !== "SET_PHASE_STOPS" && action.type !== "SET_AUTO_YIELDS") {
    raw.pendingAction = { promptVersion: 100 + seq, ...(answerWith?.(action as Raw) ?? { type: "PRIORITY", cardOptions: [] }) };
    state = build({ seq: ++seq });
    setTimeout(() => pacer.push(state), 150);
  }
}, {
  // Stand in for the server: a message shows at once, and comes back confirmed a moment later.
  send: (_matchId, message, clientMessageId) => {
    console.log("CHAT", JSON.stringify(message));
    chat.addSent(clientMessageId, message, "Flavio", false);
    state = build({ seq: ++seq });
    pacer.push(state);
    setTimeout(() => {
      raw.__chat = [...((raw.__chat as Raw[] | undefined) ?? []), { type: "CHAT", matchId: "harness", timestamp: Date.now(),
        payload: { message, messageId: clientMessageId, userId: "Flavio", username: "Flavio", senderRole: "player", clientMessageId } }];
      state = build({ seq: ++seq });
      pacer.push(state);
    }, 300);
  },
  typing: (_matchId, active) => console.log("CHAT TYPING", active),
});
(window as unknown as { __actions: unknown[] }).__actions = [];
const stops = loadStops();
let prefs = cleanPrefs((() => { try { return JSON.parse(new URLSearchParams(location.search).get("prefs") ?? "null") ?? undefined; } catch { return undefined; } })());
const board = new Board(controller, {
  onToggleDebug: () => {}, onHide: () => {},
  phaseStops: () => stops,
  togglePhaseStop: (side, step) => { if (!stops[side].delete(step)) stops[side].add(step); saveStops(stops); },
  setTemporaryStops: (extra) => console.log("TEMP STOPS", JSON.stringify(extra)),
  // Endstep's table menu, as its best-of-three board offers it.
  tableMenu: async () => ["Show decklist", "Auto-yields", "Settings", "Keyboard shortcuts", "Report a problem", "Reload", "Concede game", "Concede match"],
  runTableItem: (label) => console.log("TABLE ITEM", label),
  // A Burn deck, as Endstep's match info gives it (a name per copy).
  decklist: async () => parseDecklist({
    myDeck: [
      ...Array(4).fill("Lightning Bolt"), ...Array(4).fill("Goblin Guide"), ...Array(4).fill("Monastery Swiftspear"),
      ...Array(4).fill("Lava Spike"), ...Array(4).fill("Rift Bolt"), ...Array(4).fill("Skewer the Critics"),
      ...Array(4).fill("Eidolon of the Great Revel"), ...Array(4).fill("Boros Charm"), ...Array(4).fill("Lightning Helix"),
      ...Array(4).fill("Searing Blaze"), ...Array(4).fill("Inspiring Vantage"), ...Array(4).fill("Sacred Foundry"),
      ...Array(12).fill("Mountain"),
    ],
    mySideboard: [...Array(3).fill("Smash to Smithereens"), ...Array(4).fill("Path to Exile"), ...Array(4).fill("Kor Firewalker"), ...Array(4).fill("Deflecting Palm")],
    myCommanders: [],
    myDeckArt: { "lightning bolt": { setCode: "2xm", collectorNumber: "141" } },
  }, parseCardDetails({ cards: ([
    ["Lightning Bolt", "{R}", "Instant"], ["Goblin Guide", "{R}", "Creature — Goblin Scout"], ["Monastery Swiftspear", "{R}", "Creature — Human Monk"],
    ["Lava Spike", "{R}", "Sorcery — Arcane"], ["Rift Bolt", "{2}{R}", "Sorcery"], ["Skewer the Critics", "{2}{R}", "Sorcery"],
    ["Eidolon of the Great Revel", "{R}{R}", "Enchantment Creature — Spirit"], ["Boros Charm", "{R}{W}", "Instant"],
    ["Lightning Helix", "{R}{W}", "Instant"], ["Searing Blaze", "{R}{R}", "Instant"], ["Inspiring Vantage", "", "Land"],
    ["Sacred Foundry", "", "Land — Mountain Plains"], ["Mountain", "", "Basic Land — Mountain"], ["Smash to Smithereens", "{1}{R}", "Instant"],
    ["Path to Exile", "{W}", "Instant"], ["Kor Firewalker", "{W}{W}", "Creature — Kor Soldier"], ["Deflecting Palm", "{R}{W}", "Instant"],
  ] as const).map(([name, manaCost, typeLine]) => ({ name, card: { name, manaCost, typeLine } })) })),
  replay: (cmd) => (replays ? replays.command(cmd) : console.log("REPLAY", JSON.stringify(cmd))),
  leaveReplay: () => console.log("LEAVE REPLAY"),
  leaveSpectate: () => console.log("LEAVE SPECTATE"),
  damageLanded: () => console.log("DAMAGE LANDED", pacer.current?.turnNumber ?? ""),
  endShown: (shown) => console.log("END SHOWN", shown),
  // `?prefs={"cardScale":1.3}` starts with other settings.
  prefs: () => prefs,
  setPrefs: (patch) => { prefs = { ...prefs, ...patch }; console.log("PREFS", JSON.stringify(prefs)); },
});
root.querySelector(".layer")!.appendChild(board.el);
// States reach the board through the pacer, as in the extension.
let fastForward = false;
const pacer = new StatePacer({ show: (s) => board.update(s), busyUntil: () => board.busyUntil(), dwellMs: () => (fastForward ? 0 : board.dwellMs()) });
if (playing) playMatch(playing[1]);
else {
  pacer.push(state);
  // `?step=<ms>`: each follow-up state comes that long after the one before (as a slow server).
  const gap = Number(new URLSearchParams(location.search).get("step")) || 0;
  const advance = (step: typeof nextStep) => {
    if (!step) return;
    const after = step(raw);
    state = build({ seq: ++seq });
    pacer.push(state);
    if (gap) window.setTimeout(() => advance(after || undefined), gap);
    else advance(after || undefined);
  };
  if (gap) window.setTimeout(() => advance(nextStep), gap);
  else advance(nextStep);
}

/** Plays a recorded match at the pace its frames came (`?speed=2`: twice as fast), from the start
    of turn `?turn=N` (what comes before goes at once). Logs MATCH OVER at the end. */
/** A replay file playing on the board, as the extension plays one (see content/index.ts). */
let replays: ReplayPlayer | null = null;

/** Dev hook: plays an .esreplay (its bytes, base64) on the board from the start, at `speed`. */
(window as unknown as { __playReplay: (b64: string, speed?: number) => Promise<number> }).__playReplay = async (b64, speed = 1) => {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const replay = await decodeReplay(bytes.buffer);
  const adapter = new EndstepAdapter();
  // The adapter shows replay frames only on a replay page.
  adapter.setRoute("/replay/harness");
  adapter.subscribe((s) => {
    if (!s) return;
    state = s;
    pacer.push(s);
  });
  const player = new ReplayPlayer(() => {
    const r = player.current;
    const status = player.status();
    adapter.showReplay(r && status ? {
      raw: r.frames[status.frame]!.raw, seat: r.seat, status,
      events: r.events.filter((e) => e.frame <= status.frame).map((e) => e.event),
    } : null);
  });
  replays = player;
  player.load(replay);
  player.command({ kind: "speed", speed });
  player.command({ kind: "toggle" });
  return replay.frames.length;
};

function playMatch(id?: string): void {
  const text = (id ? __MATCHES__[id] : undefined) ?? Object.values(__MATCHES__)[0];
  if (!text) return console.log("NO MATCH", id ?? "");
  const frames = text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as { t: number; data: Raw });
  const params = new URLSearchParams(location.search);
  const speed = Number(params.get("speed")) || 1;
  const from = Number(params.get("turn")) || 0;
  const adapter = new EndstepAdapter();
  const matchId = frames.map((f) => f.data.matchId).filter(Boolean).at(-1);
  if (matchId) adapter.setRoute(`/game/${matchId}`);
  adapter.subscribe((s) => {
    if (!s) return;
    state = s;
    pacer.push(s);
  });
  const begins = (f: { data: Raw }) => {
    const p = f.data.payload as Raw | undefined;
    return p?.type === "TURN_BEGAN" && Number(p.turnNumber) >= from;
  };
  const start = from ? Math.max(0, frames.findIndex(begins)) : 0;
  fastForward = true;
  for (const f of frames.slice(0, start)) adapter.handleFrame(f.data);
  fastForward = false;
  const t0 = performance.now();
  const base = frames[start]?.t ?? 0;
  const next = (i: number) => {
    const f = frames[i];
    if (!f) return console.log("MATCH OVER");
    window.setTimeout(() => {
      adapter.handleFrame(f.data);
      next(i + 1);
    }, Math.max(0, (f.t - base) / speed - (performance.now() - t0)));
  };
  next(start);
}

// Dev hook: `?freeze=ms` stops every animation that long after the board is up (for screenshots
// of one moment of an animation).
const freeze = Number(new URLSearchParams(location.search).get("freeze"));
// Timers stop too (pending ones are cancelled, new ones never run), so nothing a timer starts
// (a hit landing, a card burning away) moves on.
if (freeze) {
  setTimeout(() => {
    for (const a of board.el.getAnimations({ subtree: true })) {
      a.pause();
      // A scripted one is set to where it should be by now.
      const t0 = animStarted.get(a);
      if (t0 !== undefined) a.currentTime = performance.now() - t0;
    }
    for (const id of pendingTimers) clearTimeout(id);
    window.setTimeout = (() => 0) as unknown as typeof window.setTimeout;
  }, freeze);
}

// Dev hook: `?point=x,y` moves the pointer there once the board is up (for screenshots of hovers).
// (`?click=x,y` clicks there first: open a pile, then hover a card of it.)
const at = (name: string) => new URLSearchParams(location.search).get(name)?.split(",").map(Number);
// (Headless screenshots don't run transitions: with a hook, states are shown at once.)
if (location.search) root.querySelector("style")!.textContent += " * { transition: none !important; }";
const click = at("click");
if (click?.length === 2) (root.elementFromPoint(click[0]!, click[1]!) as HTMLElement | null)?.click();
const point = at("point");
// (Again once a panel asked for with `?open=` is up.)
const pointAt = () => {
  if (point?.length !== 2) return;
  for (const type of ["pointerover", "pointermove"]) {
    root.elementFromPoint(point[0]!, point[1]!)?.dispatchEvent(
      new PointerEvent(type, { clientX: point[0], clientY: point[1], bubbles: true, composed: true }));
  }
};
pointAt();

// Dev hook: `?play=<card id>` clicks that card as if to play it (a permanent with several
// abilities opens its Choose One).
const play = new URLSearchParams(location.search).get("play");
if (play) setTimeout(() => (board as unknown as { tryPlay(id: string): boolean }).tryPlay(play), 50);

// Dev hook: `?open=menu|decklist|shortcuts` opens the table menu (in the middle) or that panel.
const open = new URLSearchParams(location.search).get("open");
if (open) {
  const b = board as unknown as { openTableMenu(x: number, y: number): Promise<void>; renderDecklist(): Promise<void>; renderShortcuts(): void };
  setTimeout(() => void Promise.resolve(open === "menu" ? b.openTableMenu(innerWidth / 2, innerHeight / 3) : open === "decklist" ? b.renderDecklist() : b.renderShortcuts()).then(pointAt), 50);
}

// Dev hook: the board itself, to open its panels from a test script.
(window as unknown as { __board: Board }).__board = board;
// Dev hook: the current raw state, to build a follow-up state from in a test script.
(window as unknown as { __raw: Raw }).__raw = raw;
// Dev hook: load a real state copied from the debug panel ({ matchId, viewerSeat, seq, state }).
(window as unknown as { __load: (frame: { viewerSeat?: number; seq?: number; state: Raw }) => void }).__load = (frame) => {
  Object.keys(raw).forEach((k) => delete (raw as Raw)[k]);
  Object.assign(raw, frame.state);
  state = build({ viewerSeat: frame.viewerSeat, seq: ++seq });
  board.update(state);
};
// Dev hook: every scenario's name, for tools/visual.mjs (screenshots of each one).
(window as unknown as { __scenarios: string[] }).__scenarios = Object.keys(scenarios);
