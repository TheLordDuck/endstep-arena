// Endstep raw state → normalized GameState. Every field access is defensive,
// because the raw shape comes from reverse engineering and may drift.

import type {
  AbilityOption,
  CardView,
  ChosenMark,
  ClockView,
  MatchView,
  ModeOption,
  CombatLink,
  DivideView,
  GameState,
  IdleView,
  LogEntry,
  LogFight,
  PendingActionView,
  PileView,
  SideboardView,
  PlayerView,
  RevealView,
  StackItemView,
} from "../GameState";
import { yieldKeyOf } from "./autoYields";

export type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
// A whole number Endstep may send as a string (turnNumber: "3").
const int = (v: unknown): number | undefined => num(v) ?? (typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : undefined);
const statValue = (v: unknown): number | string | undefined =>
  typeof v === "number" || typeof v === "string" ? v : undefined;

const KNOWN_TOP_LEVEL = new Set([
  "players", "stack", "pendingAction", "phase", "step", "activePlayerId", "priorityPlayerId",
  "turnNumber", "priorityPromptVersion", "sequenceNumber", "monarchPlayerId", "isDay", "isNight",
  "clock", "idleTimeout", "status", "winnerId", "macro", "matchScore",
]);

function toCounters(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(v)) {
    for (const [k, n] of Object.entries(v)) if (typeof n === "number") out[k] = n;
  } else if (Array.isArray(v)) {
    for (const item of v) {
      if (!isObj(item)) continue;
      const key = str(item.type ?? item.kind ?? item.name);
      const count = num(item.count ?? item.amount ?? item.value);
      if (key && count !== undefined) out[key] = count;
    }
  }
  return out;
}

/** "Legendary Creature — Elf Druid" from Endstep's supertypes/types/subtypes arrays. */
function typeLineOf(v: Raw): string | undefined {
  const words = (k: string) => arr(v[k]).map(str).filter((x): x is string => !!x);
  const main = [...words("supertypes"), ...words("types")].join(" ");
  const sub = words("subtypes").join(" ");
  return main ? (sub ? `${main} — ${sub}` : main) : undefined;
}

/** A list of names (keywords), or undefined when empty. */
function words(v: unknown): string[] | undefined {
  const out = arr(v).map((x) => str(isObj(x) ? x.name ?? x.keyword : x)).filter((x): x is string => !!x);
  return out.length ? out : undefined;
}

/** Endstep's `chosenMarks`: [{ kind, value }], or undefined when there are none. */
function chosenMarks(v: unknown): ChosenMark[] | undefined {
  const out = arr(v).filter(isObj).map((m) => ({ kind: str(m.kind) ?? "", value: str(m.value) ?? "" })).filter((m) => m.value);
  return out.length ? out : undefined;
}

const idOf =(v: unknown): string | undefined => (isObj(v) ? str(v.id) : str(v));

export function toCard(v: unknown): CardView | null {
  if (!isObj(v)) return null;
  const id = str(v.id ?? v.instanceId);
  if (!id) return null;
  const faceDown = v.faceDown === true;
  return {
    id,
    name: str(v.name) ?? (faceDown ? "Face-down card" : "Unknown card"),
    ownerId: str(v.ownerId),
    ownerName: str(v.ownerName),
    controllerId: str(v.controllerId),
    tapped: v.tapped === true || v.isTapped === true,
    summoningSick: v.hasSummoningSickness === true,
    faceDown,
    isToken: v.isToken === true,
    isCopyOfRealCard: v.isCopyOfRealCard === true,
    peeked: v.isPeeked === true || undefined,
    backFace: v.isTransformed === true || v.isBackFace === true,
    tokenSetCode: str(v.tokenSetCode),
    tokenCollectorNumber: str(v.tokenCollectorNumber),
    color: str(v.color),
    basePower: num(v.basePower),
    baseToughness: num(v.baseToughness),
    // Companions and vanguards live in the command zone like commanders.
    isCommander: v.isCommander === true || v.isCompanion === true || v.isVanguard === true,
    effectSourceName: str(typeof v.effectSourceName === "string" ? v.effectSourceName.trim() : undefined),
    power: statValue(v.power),
    toughness: statValue(v.toughness),
    loyalty: statValue(v.loyalty),
    damage: num(v.damage),
    classLevel: num(v.classLevel ?? v.level ?? v.currentLevel),
    counters: toCounters(v.counters),
    keywordsGranted: words(v.keywordsGranted),
    keywordsLost: words(v.keywordsLost),
    chosen: chosenMarks(v.chosenMarks),
    // Endstep lists them on the host as `attachedCards`, and each aura/equipment names its host in `attachedTo`.
    attachmentIds: arr(v.attachedCards ?? v.attachments).map(idOf).filter((x): x is string => !!x),
    attachedToId: idOf(v.attachedTo),
    isAttacking: v.isAttacking === true,
    attackingDefenderId: defenderId(v.attackingDefenderId),
    isBlocking: v.isBlocking === true || arr(v.blockingIds).length > 0,
    blockingIds: arr(v.blockingIds).map(str).filter((x): x is string => !!x),
    // The chosen printing, as Endstep's client renders it.
    setCode: str(v.selectedSetCode ?? v.setCode),
    collectorNumber: str(v.selectedCollectorNumber ?? v.collectorNumber),
    types: arr(v.types).map(str).filter((x): x is string => !!x),
    typeLine: str(v.typeLine) ?? typeLineOf(v),
    manaCost: str(v.manaCost),
    oracleText: str(v.oracleText),
  };
}

const cards = (v: unknown): CardView[] => arr(v).map(toCard).filter((c): c is CardView => c !== null);

/** A face-down card the viewer may look at, shown as what it really is (still face down). */
function withPeek(c: CardView, peek: CardView | undefined): CardView {
  if (!peek || !c.faceDown) return c;
  return {
    ...c, peeked: true, name: peek.name, setCode: peek.setCode, collectorNumber: peek.collectorNumber, backFace: peek.backFace,
    types: peek.types, typeLine: peek.typeLine, manaCost: peek.manaCost, oracleText: peek.oracleText,
  };
}

/** Endstep's peeks: face-down cards the viewer may see (its own morphs on the battlefield, cards
    it exiled face down…), sent as `battlefieldPeek`/`exilePeek`, by card id. */
function peeksOf(players: unknown[]): Map<string, CardView> {
  const out = new Map<string, CardView>();
  for (const p of players) {
    if (!isObj(p)) continue;
    for (const c of [...cards(p.battlefieldPeek), ...cards(p.exilePeek)]) out.set(c.id, c);
  }
  return out;
}

function toPlayer(v: unknown, index: number, viewerSeat: number, peeks: Map<string, CardView>): PlayerView {
  const p = isObj(v) ? v : {};
  const peek = (list: CardView[]) => (peeks.size ? list.map((c) => withPeek(c, peeks.get(c.id))) : list);
  const hand = Array.isArray(p.hand) ? peek(cards(p.hand)) : null;
  return {
    id: String(index),
    seat: num(p.seatIndex) ?? index,
    name: str(p.displayName ?? p.name ?? p.username) ?? `Seat ${index + 1}`,
    targetName: str(p.name),
    // The account name, as Endstep's own player popup and profile links use it: `name`.
    username: str(p.name ?? p.username),
    isViewer: index === viewerSeat,
    // Endstep's `controlledBySeat`: the seat playing this player's turn for them.
    controlledBy: (num(p.controlledBySeat) ?? -1) >= 0 && p.controlledBySeat !== index ? String(p.controlledBySeat) : undefined,
    life: num(p.life),
    poison: num(p.poisonCounters) ?? 0,
    energy: num(p.energyCounters) ?? 0,
    librarySize: num(p.librarySize) ?? (Array.isArray(p.library) ? p.library.length : undefined),
    handSize: num(p.handSize) ?? hand?.length,
    hand,
    battlefield: peek(cards(p.battlefield)),
    graveyard: cards(p.graveyard),
    exile: peek(cards(p.exile)),
    // Endstep's command zone mixes commanders with effects/emblems (anything else).
    commandZone: cards(p.commandZone).filter((c) => c.isCommander),
    effects: cards(p.commandZone).filter((c) => !c.isCommander),
    libraryTop: cards(p.libraryTop),
    commanderDamage: p.commanderDamage,
    manaPool: p.manaPool,
    hasMonarch: p.hasMonarch === true,
    hasInitiative: p.hasInitiative === true,
    experience: num(p.experienceCounters) ?? 0,
    rad: num(p.radCounters) ?? 0,
    ringTempts: num(p.ringTempts) ?? 0,
    citysBlessing: p.hasCitysBlessing === true,
    enduringStory: p.hasEnduringStory === true,
    ...(str(p.dungeonRoomId) ? { dungeonRoom: str(p.dungeonRoomId) } : {}),
    ...commanderCasts(p.commanderTax),
    hasLost: p.hasLostGame === true,
    hasConceded: p.hasConceded === true,
  };
}

/** Endstep's commanderTax: { <commander's index>: times cast }, the ones cast at least once. */
function commanderCasts(v: unknown): { commanderCasts?: Record<string, number> } {
  if (typeof v !== "object" || v === null) return {};
  const out = Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === "number" && n > 0)) as Record<string, number>;
  return Object.keys(out).length ? { commanderCasts: out } : {};
}

// Endstep stack items: { sourceCard, isAbility, abilityDescription, stackTargetId, targets }.
function toStackItem(v: unknown, index: number): StackItemView | null {
  if (!isObj(v)) return null;
  const source = toCard(v.sourceCard);
  const isAbility = v.isAbility === true || v.kind === "ability";
  // A spell dividing its damage gives each target its share (dividedAmount), as Endstep's stack shows it.
  const divided: Record<string, number> = {};
  for (const t of arr(v.targets)) {
    const key = targetKey(t);
    const n = isObj(t) ? num(t.dividedAmount) : undefined;
    if (key && n !== undefined) divided[key] = n;
  }
  return {
    id: str(v.stackTargetId ?? v.id) ?? source?.id ?? `stack-${index}`,
    name: (isAbility ? str(v.abilityDescription) : undefined) ?? source?.name ?? str(v.name ?? v.sourceCardName ?? v.description) ?? "Unknown",
    isAbility,
    card: source ?? undefined,
    controllerId: str(v.controllerId) ?? source?.controllerId,
    sourceCardId: source?.id ?? str(v.sourceCardId),
    targets: arr(v.targets).map(targetKey).filter((x): x is string => !!x),
    ...(Object.keys(divided).length ? { divided } : {}),
    // Not confirmed in the bundle: the likely names, on the item or on its card.
    x: num(v.xValue ?? v.x ?? v.chosenX ?? (isObj(v.sourceCard) ? v.sourceCard.xValue ?? v.sourceCard.x ?? v.sourceCard.chosenX : undefined)),
    ...optional("description", isAbility ? undefined : str(v.abilityDescription ?? v.description)),
    // "Name (id): {T}, Pay 1 life, Sacrifice …: Search …": the ability after its source's name.
    ...optional("abilityText", typeof v.yieldKey === "string" ? str(v.yieldKey.replace(/^[^:]*?\(\d+\):\s*/, "")) : undefined),
    ...optional("yieldKey", typeof v.yieldKey === "string" && v.yieldKey ? yieldKeyOf(v.yieldKey) : undefined),
    ...(v.optionalTrigger === true ? { optionalTrigger: true } : {}),
    ...optional("triggerId", str(v.triggerId)),
    ...modesOf(v.chosenModes ?? v.selectedModes ?? v.modeIndices),
  };
}

const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : { [key]: value } as Record<K, V>);

/** Chosen modes as a list of indexes (not confirmed in the bundle: the likely names). */
function modesOf(v: unknown): { modes?: number[] } {
  const out = arr(v).map((m) => num(isObj(m) ? m.index : m)).filter((n): n is number => n !== undefined);
  return out.length ? { modes: out } : {};
}

/** Endstep target { id, zone }: players are zone "Player" with id -(seat + 1); anything else is a card id. */
function targetKey(t: unknown): string | undefined {
  const id = num(isObj(t) ? t.id : t) ?? str(isObj(t) ? t.id : t);
  if (id === undefined) return undefined;
  const isPlayer = (isObj(t) && t.zone === "Player") || (typeof id === "number" && id < 0);
  return isPlayer ? `player:${-Number(id) - 1}` : String(id);
}

function toAbility(v: unknown, i: number): AbilityOption {
  const a = isObj(v) ? v : {};
  return { index: num(a.index) ?? i, description: str(a.description) ?? `Ability ${i + 1}`, cost: str(a.cost) };
}

function toMode(v: unknown, i: number): ModeOption {
  if (!isObj(v)) return { index: i, description: str(v) ?? `Option ${i + 1}` };
  return { index: num(v.index) ?? i, description: str(v.description ?? v.label ?? v.name) ?? `Option ${i + 1}`, cardId: str(v.cardId) };
}

function toEligibility(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (isObj(v)) {
    for (const [blocker, attackers] of Object.entries(v)) {
      out[blocker] = arr(attackers).map(str).filter((x): x is string => !!x);
    }
  }
  return out;
}

/** CHOOSE_NUMBER's range, as Endstep's number picker reads it: minValue/maxValue, and
    allowedValues when only some numbers may be chosen. */
function numberRange(v: Raw): { numberMin: number; numberMax: number; allowedNumbers: number[] } {
  const allowed = arr(v.allowedValues).map(num).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
  const min = num(v.minValue) ?? allowed[0] ?? num(v.min) ?? 0;
  const max = num(v.maxValue) ?? allowed.at(-1) ?? num(v.max) ?? Math.max(min, 20);
  return { numberMin: min, numberMax: Math.max(min, max), allowedNumbers: allowed };
}

function toPending(v: unknown, meta: Pick<FrameMeta, "serverSkew" | "frozen"> = {}, raw: Raw = {}): PendingActionView | null {
  if (!isObj(v)) return null;
  const options = arr(v.cardOptions).filter(isObj);
  const optionZones: Record<string, string> = {};
  for (const o of options) {
    const id = str(o.id);
    const zone = str(o.zone);
    if (id && zone) optionZones[id] = zone;
  }
  return {
    type: str(v.type) ?? "UNKNOWN",
    promptVersion: num(v.promptVersion),
    message: str(v.message),
    sourceCardId: str(v.sourceCardId),
    sourceCardName: str(v.sourceCardName),
    contextType: str(v.contextType),
    min: num(v.min) ?? 1,
    max: num(v.max) ?? 1,
    mandatory: v.mandatory === true,
    optionCardIds: options.map((o) => str(o.id)).filter((x): x is string => !!x),
    optionCards: options.map(toCard).filter((c): c is CardView => c !== null),
    optionZones,
    // ORDER_*: each trigger/attacker/blocker to order, as Endstep's own order box shows it.
    orderOptions: options.filter((o) => str(o.id)).map((o) => ({
      id: String(o.id),
      name: str(o.name) ?? "Ability",
      description: str(o.description),
      sourceCardId: str(o.sourceCardId),
      declinable: o.declinable === true,
    })),
    // Endstep treats every PRIORITY cardOption as playable; playableAbilities is
    // only a list to choose from, and may be missing for a plain cast.
    playable: v.type !== "PRIORITY" ? [] : options
      .filter((o) => str(o.id))
      .map((o) => ({ cardId: String(o.id), abilities: arr(o.playableAbilities).map(toAbility) })),
    modeOptions: arr(v.modeOptions).map(toMode),
    stringOptions: arr(v.stringOptions).map(str).filter((x): x is string => !!x),
    blockerEligibility: toEligibility(v.blockerEligibility),
    // PAY_MANA: the floating mana that can pay this cost (what Endstep's pay panel spends from).
    floatingMana: v.floatingMana,
    ...(v.type === "PAY_MANA" && v.phyrexianMana === true ? { phyrexian: true } : {}),
    canUndo: v.canUndo === true,
    cancellable: v.cancellable === true,
    ...optional("triggerId", v.type === "YES_NO" ? str(v.triggerId) : undefined),
    ...numberRange(v),
    ...(v.type === "ASSIGN_DAMAGE" || v.type === "DIVIDE_SHIELD" ? { divide: toDivide(v, options, raw) } : {}),
    ...(v.type === "CHOOSE_PILE" ? { piles: arr(v.piles).filter(isObj).map(toPile).filter((x): x is PileView => !!x) } : {}),
    ...(v.type === "CHOOSE_CARDS" && v.contextType === "sideboard" ? { sideboard: toSideboard(v, options, meta, raw) } : {}),
  };
}

/** A CHOOSE_PILE pile: { id, label, size, cards[] }, as Endstep's pile picker reads it. */
function toPile(v: Raw): PileView | null {
  const id = str(v.id);
  if (!id) return null;
  const cards = arr(v.cards).map(toCard).filter((c): c is CardView => c !== null);
  return { id, label: str(v.label) ?? id, size: Math.max(num(v.size) ?? cards.length, cards.length), cards };
}

/** Sideboarding, as Endstep's sideboard view reads it: every card in cardOptions (the main deck
    first), min/max for the main deck, and sideboardState { mainCount, mode, self, opponent,
    deadlineMs }. Cards are kept by index, which is what the answer names. */
function toSideboard(v: Raw, options: Raw[], meta: Pick<FrameMeta, "serverSkew" | "frozen">, raw: Raw): SideboardView {
  const st = isObj(v.sideboardState) ? v.sideboardState : {};
  const cards = options.map((o, i) => {
    const c = toCard({ ...o, id: `sb:${i}` })!;
    // Endstep lists a card's rules text as `abilities`.
    const abilities = arr(o.abilities).map(str).filter((x): x is string => !!x);
    return c.oracleText || !abilities.length ? c : { ...c, oracleText: abilities.join("\n") };
  });
  const min = num(v.min) ?? 0;
  const deadline = num(st.deadlineMs);
  const clock = isObj(raw.clock) ? raw.clock : {};
  const serverNow = num(clock.serverNowMs);
  const skew = meta.serverSkew ?? (serverNow !== undefined ? serverNow - Date.now() : 0);
  const score = isObj(raw.matchScore) ? raw.matchScore : null;
  const played = score ? num(score.gamesPlayed) ?? (num(score.player0Wins) ?? 0) + (num(score.player1Wins) ?? 0) : undefined;
  return {
    cards,
    mainCount: Math.min(cards.length, num(st.mainCount) ?? min),
    min,
    max: num(v.max) ?? cards.length,
    mode: str(st.mode) ?? "SIDEBOARD",
    self: str(st.self) ?? "EDITING",
    opponent: str(st.opponent) ?? "EDITING",
    deadline: deadline !== undefined && !meta.frozen ? deadline - skew : undefined,
    gameNumber: played !== undefined ? played + 1 : undefined,
  };
}

/** ASSIGN_DAMAGE / DIVIDE_SHIELD, as Endstep's damage bar reads them: the total in maxValue, and
    each option's lethalDamage (none for a player, whose types include "Player"). */
function toDivide(v: Raw, options: Raw[], raw: Raw): DivideView {
  const kind = divideKind(v, raw);
  return {
    kind,
    total: num(v.maxValue) ?? 0,
    freeSpill: v.overrideOrder === true || kind === "spell",
    options: options.filter((o) => str(o.id)).map((o) => {
      const player = arr(o.types).includes("Player");
      return { id: String(o.id), name: str(o.name) ?? (player ? "Defending player" : "Unknown"), lethal: player ? null : num(o.lethalDamage) ?? null, player };
    }),
  };
}

/** Endstep asks every division with its damage bar; what is divided is told by the source and
    the step. Combat damage comes from a creature attacking or blocking, in a combat damage step.
    Anything else is a spell or ability dividing its damage among its targets (Fireball, Arc
    Lightning, cast before it reaches the stack). A DIVIDE_SHIELD is shield counters unless it
    speaks of damage. */
function divideKind(v: Raw, raw: Raw): DivideView["kind"] {
  const message = str(v.message) ?? "";
  if (v.type === "DIVIDE_SHIELD" && (/\bshield/i.test(message) || !/\bdamage\b/i.test(message))) return "shield";
  if (/\bcombat\b/i.test(message)) return "combat";
  const source = str(v.sourceCardName);
  const sourceId = str(v.sourceCardId);
  const permanents = arr(raw.players).filter(isObj).flatMap((p) => arr(p.battlefield).filter(isObj));
  const fighting = permanents.some((c) => (c.isAttacking === true || c.isBlocking === true)
    && ((!!sourceId && str(c.id) === sourceId) || (!!source && c.name === source)));
  // FIRST_STRIKE_DAMAGE, COMBAT_DAMAGE (or a phase named so).
  const damageStep = /DAMAGE/i.test(`${str(raw.step) ?? ""} ${str(raw.phase) ?? ""}`);
  return fighting || damageStep ? "combat" : "spell";
}

/** Who an attacker attacks: a planeswalker or battle by its card id, or a player, whom Endstep
    numbers -(seat + 1) here as in targets (its client compares it with that). A player is made
    "player:<seat>", as in targets: their seat alone ("0", "1") could be a card's id too. */
function defenderId(v: unknown): string | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-\d+$/.test(v) ? Number(v) : undefined;
  return n !== undefined && n < 0 ? `player:${-n - 1}` : str(v);
}

function combatOf(players: PlayerView[]) {
  const attacks: CombatLink[] = [];
  const blocks: CombatLink[] = [];
  for (const p of players) {
    for (const c of p.battlefield) {
      if (c.isAttacking && c.attackingDefenderId) attacks.push({ fromId: c.id, toId: c.attackingDefenderId });
      for (const attackerId of c.blockingIds) blocks.push({ fromId: c.id, toId: attackerId });
    }
  }
  return { attacks, blocks };
}

/**
 * A CARD_REVEALED / CARD_REVEALED_TO_HAND game event: { cardName | cardNames[], cardId | cardIds[],
 * cardSetCodes[], cardCollectorNumbers[], toZone (where they were revealed from), playerName,
 * message, sequenceNumber }, as Endstep's reveal toasts read it.
 */
export function toReveal(v: unknown, at = Date.now()): RevealView | null {
  if (!isObj(v) || (v.type !== "CARD_REVEALED" && v.type !== "CARD_REVEALED_TO_HAND")) return null;
  const names = arr(v.cardNames).map(str).filter((x): x is string => !!x);
  if (!names.length && str(v.cardName)) names.push(str(v.cardName)!);
  if (!names.length) return null;
  const ids = arr(v.cardIds).map(str);
  const sets = arr(v.cardSetCodes).map(str);
  const numbers = arr(v.cardCollectorNumbers).map(str);
  const id = str(v.sequenceNumber) ?? `${at}`;
  return {
    id,
    playerName: str(v.playerName),
    zone: str(v.toZone ?? v.fromZone ?? v.zone),
    toHand: v.type === "CARD_REVEALED_TO_HAND",
    message: str(v.message),
    cards: names.map((name, i) => ({
      ...(toCard({ id: `reveal:${id}:${i}`, name }) as CardView),
      setCode: sets[i], collectorNumber: numbers[i],
    })),
    cardIds: names.map((_, i) => ids[i] ?? (i === 0 ? str(v.cardId) : undefined)),
    at,
  };
}

/** Events that make no line of their own in the game log. */
const UNLOGGED = new Set(["TURN_PHASE", "CARD_REVEALED", "CARD_REVEALED_TO_HAND"]);
/** A `{key=[…], …}` block Endstep's messages may carry (its engine's details). */
const DETAILS = String.raw`\{[^{}[\]=]*=\[[^\]]*\](?:\s*,\s*[^{}[\]=]*=\[[^\]]*\])*\}`;

/**
 * A game event as a line of the game log, as Endstep's own log shows it: its `message` a line
 * per row, cleaned of engine details (`{…=[…]}` blocks, trailing `[…]`, ` (id)`), card names kept
 * as [[Name]]; with the player (`playerIndex`, `playerName`), the turn and the cards it names
 * (`cardId`/`cardName`, `cardIds`/`cardNames`). TURN_BEGAN makes a turn line with no text.
 * `phase`: the step the last TURN_PHASE event named, for a blow's damage step.
 */
export function toLogEntry(v: unknown, fallbackSeq = 0, phase?: string): LogEntry | null {
  if (!isObj(v) || typeof v.type !== "string" || UNLOGGED.has(v.type)) return null;
  const detailsLine = new RegExp(String.raw`:\s*` + DETAILS);
  const details = new RegExp(String.raw`\s*` + DETAILS, "g");
  const lines = (str(v.message) ?? "").split(/\r\n|\r|\n/).map((line) => {
    const clean = line.replace(details, "").replace(/\s*\(\[[^\]]*\]\)\s*$/, "").replace(/\s*\[[^\]]*\]\s*$/, "").replace(/ \(\d+\)/g, "").trim();
    // A line that only introduced the details ("Targets:") goes with them.
    return detailsLine.test(line) && clean.endsWith(":") ? "" : clean;
  }).filter((line) => line.length > 0);
  if (!lines.length && v.type !== "TURN_BEGAN") return null;
  const names = arr(v.cardNames).map(str);
  const ids = arr(v.cardIds).map(str);
  const cards: { id: string; name: string }[] = [];
  if (str(v.cardId) && str(v.cardName)) cards.push({ id: str(v.cardId)!, name: str(v.cardName)! });
  // CARD_DAMAGED names the card hit apart.
  if (str(v.targetCardId) && str(v.targetCardName) && str(v.targetCardId) !== str(v.cardId)) cards.push({ id: str(v.targetCardId)!, name: str(v.targetCardName)! });
  names.forEach((name, i) => {
    const id = ids[i];
    if (name && id && !cards.some((c) => c.id === id)) cards.push({ id, name });
  });
  const seat = num(Number(v.playerIndex));
  const fight = toLogFight(v, seat, phase);
  return {
    seq: num(v.sequenceNumber) ?? fallbackSeq,
    type: v.type,
    lines,
    ...(v.playerIndex != null && v.playerIndex !== "" && seat !== undefined ? { seat } : {}),
    ...(str(v.playerName) ? { playerName: str(v.playerName) } : {}),
    ...(int(v.turnNumber) !== undefined ? { turn: int(v.turnNumber) } : {}),
    cards,
    ...(fight ? { fight } : {}),
  };
}

/** The combat facts in an event's fields, as Endstep sends them (see LogFight). */
function toLogFight(v: Raw, seat: number | undefined, phase = ""): LogFight | undefined {
  switch (v.type) {
    case "ATTACKERS_DECLARED":
      return { attackers: arr(v.attackerIds ?? v.cardIds).map(str).filter((x): x is string => !!x) };
    case "BLOCKERS_DECLARED": {
      const assigned = isObj(v.blockerAssignments) ? Object.entries(v.blockerAssignments) : [];
      return { blocks: assigned.map(([blocker, attacker]) => ({ fromId: blocker, toId: str(attacker) ?? "" })).filter((b) => b.toId) };
    }
    case "CARD_DAMAGED":
    case "PLAYER_DAMAGED": {
      const fromId = str(v.cardId);
      const toId = v.type === "CARD_DAMAGED" ? str(v.targetCardId) : seat !== undefined ? `player:${seat}` : undefined;
      const amount = num(v.amount);
      const step = /FIRST_STRIKE_DAMAGE/.test(phase) ? "fs" : /DAMAGE/.test(phase) ? "cd" : undefined;
      return fromId && toId && amount !== undefined ? { blow: { fromId, toId, amount, ...(step ? { step } : {}) } } : undefined;
    }
  }
  return undefined;
}

export interface FrameMeta {
  matchId: string;
  viewerSeat: number;
  seq?: number;
  desynced: boolean;
  /** Server clock minus ours (ms), to move the server's deadlines to our clock. Without it, the
      state is taken as just received (its `serverNowMs` is now). */
  serverSkew?: number;
  /** A replay frame: clocks don't run, they show the time left at that moment. */
  frozen?: boolean;
}

/** Endstep's `clock`: { serverNowMs, runningSide, runningSideDeadlineMs, remainingMs[] (or
    player0RemainingMs / player1RemainingMs), timedOutSide }, sides being seat indexes, read the
    way its match clock reads it. */
export function toClock(v: unknown, meta: Pick<FrameMeta, "serverSkew" | "frozen">): ClockView | undefined {
  if (!isObj(v)) return undefined;
  const serverNow = num(v.serverNowMs);
  const skew = meta.serverSkew ?? (serverNow !== undefined ? serverNow - Date.now() : 0);
  const left: Record<string, number> = {};
  arr(v.remainingMs).forEach((ms, i) => {
    const n = num(ms);
    if (n !== undefined) left[String(i)] = Math.max(0, n);
  });
  for (const seat of ["0", "1"]) {
    const n = num(v[`player${seat}RemainingMs`]);
    if (left[seat] === undefined && n !== undefined) left[seat] = Math.max(0, n);
  }
  const running = str(v.runningSide);
  const runningDeadline = num(v.runningSideDeadlineMs);
  let deadline: number | undefined;
  if (running !== undefined && runningDeadline !== undefined) {
    if (!meta.frozen) deadline = runningDeadline - skew;
    else if (serverNow !== undefined) left[running] = Math.max(0, runningDeadline - serverNow);
  }
  if (!Object.keys(left).length && deadline === undefined) return undefined;
  return { left, running, deadline, timedOut: str(v.timedOutSide) };
}

/** Endstep's `idleTimeout`: { seat, deadlineMs, serverNowMs, away, graceMs }. */
export function toIdle(v: unknown, meta: Pick<FrameMeta, "serverSkew" | "frozen">): IdleView | undefined {
  if (!isObj(v) || meta.frozen) return undefined;
  const playerId = str(v.seat);
  const deadline = num(v.deadlineMs);
  if (playerId === undefined || deadline === undefined) return undefined;
  const serverNow = num(v.serverNowMs);
  const skew = meta.serverSkew ?? (serverNow !== undefined ? serverNow - Date.now() : 0);
  // Endstep's own default for the last stretch: 30 s.
  return { playerId, deadline: deadline - skew, away: v.away === true, graceMs: num(v.graceMs) ?? 30_000 };
}

/** Endstep's matchScore: { winsBySeat, player0Wins, player1Wins, gameNumber, gamesPlayed,
    gamesPerMatch, isMatchOver }, the wins by seat (a player's place in `players`). */
function matchOf(v: unknown, players: PlayerView[]): { match?: MatchView } {
  if (!isObj(v)) return {};
  const bySeat = arr(v.winsBySeat).map((n) => num(n) ?? 0);
  const wins: Record<string, number> = {};
  players.forEach((p, seat) => { wins[p.id] = bySeat[seat] ?? num(v[`player${seat}Wins`]) ?? 0; });
  const played = num(v.gamesPlayed);
  return {
    match: {
      game: num(v.gameNumber) ?? (played !== undefined ? played + 1 : 1),
      gamesPerMatch: num(v.gamesPerMatch) ?? 1,
      wins,
      over: v.isMatchOver === true,
    },
  };
}

export function normalize(raw: Raw, meta: FrameMeta): GameState {
  const peeks = peeksOf(arr(raw.players));
  const players = arr(raw.players).map((p, i) => toPlayer(p, i, meta.viewerSeat, peeks));
  const priorityPlayerId = str(raw.priorityPlayerId);
  return {
    matchId: meta.matchId,
    viewerSeat: meta.viewerSeat,
    seq: meta.seq,
    status: str(raw.status),
    turnNumber: int(raw.turnNumber),
    winnerId: str(raw.winnerId),
    phase: str(raw.phase),
    step: str(raw.step),
    activePlayerId: str(raw.activePlayerId),
    priorityPlayerId,
    viewerHasPriority: priorityPlayerId === String(meta.viewerSeat),
    players,
    stack: arr(raw.stack).map(toStackItem).filter((s): s is StackItemView => s !== null),
    pending: toPending(raw.pendingAction, meta, raw),
    combat: combatOf(players),
    clock: toClock(raw.clock, meta),
    idle: toIdle(raw.idleTimeout, meta),
    ...(raw.isDay === true ? { dayNight: "day" as const } : raw.isNight === true ? { dayNight: "night" as const } : {}),
    ...matchOf(raw.matchScore, players),
    reveals: [],
    unrecognizedKeys: Object.keys(raw).filter((k) => !KNOWN_TOP_LEVEL.has(k)),
    desynced: meta.desynced,
    updatedAt: Date.now(),
  };
}
