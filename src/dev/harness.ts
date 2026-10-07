// Dev harness: renders the Board from Endstep-shaped fixture states, so the
// UI can be checked (and screenshotted) without a live match.
// Build with `node build.mjs --harness`, open dist-harness/harness.html#<scenario>.

import overlayCss from "../styles/overlay.css";
import boardCss from "../styles/board.css";
import { Board } from "../ui/board/Board";
import { GameController } from "../game/GameController";
import { normalize, toReveal, type Raw } from "../game/endstep/normalize";
import type { RevealView } from "../game/GameState";
import type { ReplayStatus } from "../game/ReplayPlayer";
import { loadStops, saveStops } from "../game/endstep/phaseStops";

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
      { stackTargetId: 901, isAbility: false, xValue: 3, sourceCard: { id: 901, name: "Fireball", controllerId: "0", types: ["Sorcery"] }, targets: [{ id: -2, zone: "Player" }] },
    ];
    (me!.hand as Raw[]).shift();
    s.priorityPlayerId = "0";
    s.pendingAction = { type: "PRIORITY", promptVersion: 4, cardOptions: [] };
    void opp;
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
  won: (s) => { s.status = "COMPLETE"; s.winnerId = "0"; s.pendingAction = null; },
  lost: (s) => { s.status = "COMPLETE"; s.winnerId = "1"; s.pendingAction = null; },
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
  // Combat damage: the opponent's Angel is unblocked, our Tarmogoyf blocks their Nighthawk.
  // The board shows blockers declared, then the game reaches combat damage: we take 4, and the
  // Nighthawk (deathtouch) and Tarmogoyf kill each other.
  strike: (s) => {
    const [me, opp] = players(s);
    s.phase = "DECLARE_BLOCKERS";
    s.activePlayerId = "1";
    s.pendingAction = null;
    const angel = byName(opp!, "Serra Angel");
    angel.isAttacking = true; angel.attackingDefenderId = "0"; angel.tapped = false;
    const hawk = byName(opp!, "Vampire Nighthawk");
    hawk.isAttacking = true; hawk.attackingDefenderId = "0";
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
    const baloths = creature("Rampaging Baloths", 8, 8, { counters: { P1P1: 2 }, oracleText: "Trample\nLandfall — Whenever a land you control enters, you may create a 4/4 green Beast creature token.", isAttacking: true, attackingDefenderId: "1", tapped: true });
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
    goyf.isAttacking = true; goyf.attackingDefenderId = "1"; goyf.tapped = true;
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
    goyf.isAttacking = true; goyf.attackingDefenderId = "1"; goyf.tapped = true;
    const bears = byName(me!, "Grizzly Bears");
    bears.isAttacking = true; bears.attackingDefenderId = "1"; bears.tapped = true;
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
  // The same fight before damage: attackers stepped out, the blocker in front of its attacker.
  blocked: (s) => void scenarios.strike!(s),
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
// Scenarios mark what the adapter would add: a replay's position (raw.__replay), a player who
// lost connection (raw.__disconnected: their index, with 83 s left).
const build = (meta: { viewerSeat?: number; seq: number }) => {
  const s = normalize(raw, { matchId: "harness", viewerSeat: meta.viewerSeat ?? 0, seq: meta.seq, desynced: false });
  const gone = raw.__disconnected as number | undefined;
  return {
    ...s,
    players: s.players.map((p, i) => (i === gone ? { ...p, disconnected: { deadline: Date.now() + 83_000 } } : p)),
    reveals: ((raw.__events as Raw[] | undefined) ?? []).map((e) => toReveal(e)).filter((r): r is RevealView => !!r),
    ...(raw.__replay ? { replay: raw.__replay as ReplayStatus } : {}),
  };
};
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
  setTemporaryStops: (extra) => console.log("TEMP STOPS", JSON.stringify(extra)),
  // Endstep's table menu, as its best-of-three board offers it.
  tableMenu: async () => ["Show decklist", "Auto-yields", "Settings", "Keyboard shortcuts", "Report a problem", "Reload", "Concede game", "Concede match"],
  runTableItem: (label) => console.log("TABLE ITEM", label),
  replay: (cmd) => console.log("REPLAY", JSON.stringify(cmd)),
  leaveReplay: () => console.log("LEAVE REPLAY"),
});
root.querySelector(".layer")!.appendChild(board.el);
board.update(state);
if (nextStep) {
  nextStep(raw);
  state = build({ seq: ++seq });
  board.update(state);
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
if (point?.length === 2) {
  for (const type of ["pointerover", "pointermove"]) {
    root.elementFromPoint(point[0]!, point[1]!)?.dispatchEvent(
      new PointerEvent(type, { clientX: point[0], clientY: point[1], bubbles: true, composed: true }));
  }
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
