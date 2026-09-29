// Endstep raw state → normalized GameState. Every field access is defensive,
// because the raw shape comes from reverse engineering and may drift.

import type {
  AbilityOption,
  CardView,
  ModeOption,
  CombatLink,
  GameState,
  PendingActionView,
  PlayerView,
  StackItemView,
} from "../GameState";

export type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const statValue = (v: unknown): number | string | undefined =>
  typeof v === "number" || typeof v === "string" ? v : undefined;

const KNOWN_TOP_LEVEL = new Set([
  "players", "stack", "pendingAction", "phase", "step", "activePlayerId", "priorityPlayerId",
  "turnNumber", "priorityPromptVersion", "sequenceNumber", "monarchPlayerId", "isDay", "isNight",
  "clock", "idleTimeout", "status", "winnerId", "macro",
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

const idOf = (v: unknown): string | undefined => (isObj(v) ? str(v.id) : str(v));

export function toCard(v: unknown): CardView | null {
  if (!isObj(v)) return null;
  const id = str(v.id ?? v.instanceId);
  if (!id) return null;
  const faceDown = v.faceDown === true;
  return {
    id,
    name: str(v.name) ?? (faceDown ? "Face-down card" : "Unknown card"),
    ownerId: str(v.ownerId),
    controllerId: str(v.controllerId),
    tapped: v.tapped === true || v.isTapped === true,
    summoningSick: v.hasSummoningSickness === true,
    faceDown,
    isToken: v.isToken === true,
    isCopyOfRealCard: v.isCopyOfRealCard === true,
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
    // Endstep lists them on the host as `attachedCards`, and each aura/equipment names its host in `attachedTo`.
    attachmentIds: arr(v.attachedCards ?? v.attachments).map(idOf).filter((x): x is string => !!x),
    attachedToId: idOf(v.attachedTo),
    isAttacking: v.isAttacking === true,
    attackingDefenderId: str(v.attackingDefenderId),
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

function toPlayer(v: unknown, index: number, viewerSeat: number): PlayerView {
  const p = isObj(v) ? v : {};
  const hand = Array.isArray(p.hand) ? cards(p.hand) : null;
  return {
    id: String(index),
    seat: num(p.seatIndex) ?? index,
    name: str(p.displayName ?? p.name ?? p.username) ?? `Seat ${index + 1}`,
    targetName: str(p.name),
    username: str(p.username),
    isViewer: index === viewerSeat,
    life: num(p.life),
    poison: num(p.poisonCounters) ?? 0,
    energy: num(p.energyCounters) ?? 0,
    librarySize: num(p.librarySize) ?? (Array.isArray(p.library) ? p.library.length : undefined),
    handSize: num(p.handSize) ?? hand?.length,
    hand,
    battlefield: cards(p.battlefield),
    graveyard: cards(p.graveyard),
    exile: cards(p.exile),
    // Endstep's command zone mixes commanders with effects/emblems (anything else).
    commandZone: cards(p.commandZone).filter((c) => c.isCommander),
    effects: cards(p.commandZone).filter((c) => !c.isCommander),
    libraryTop: cards(p.libraryTop),
    commanderDamage: p.commanderDamage,
    manaPool: p.manaPool,
    hasMonarch: p.hasMonarch === true,
    hasInitiative: p.hasInitiative === true,
    hasLost: p.hasLostGame === true,
    hasConceded: p.hasConceded === true,
  };
}

// Endstep stack items: { sourceCard, isAbility, abilityDescription, stackTargetId, targets }.
function toStackItem(v: unknown, index: number): StackItemView | null {
  if (!isObj(v)) return null;
  const source = toCard(v.sourceCard);
  const isAbility = v.isAbility === true || v.kind === "ability";
  return {
    id: str(v.stackTargetId ?? v.id) ?? source?.id ?? `stack-${index}`,
    name: (isAbility ? str(v.abilityDescription) : undefined) ?? source?.name ?? str(v.name ?? v.sourceCardName ?? v.description) ?? "Unknown",
    isAbility,
    card: source ?? undefined,
    controllerId: str(v.controllerId) ?? source?.controllerId,
    sourceCardId: source?.id ?? str(v.sourceCardId),
    targets: arr(v.targets).map(targetKey).filter((x): x is string => !!x),
  };
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

function toPending(v: unknown): PendingActionView | null {
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
    canUndo: v.canUndo === true,
  };
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

export interface FrameMeta {
  matchId: string;
  viewerSeat: number;
  seq?: number;
  desynced: boolean;
}

export function normalize(raw: Raw, meta: FrameMeta): GameState {
  const players = arr(raw.players).map((p, i) => toPlayer(p, i, meta.viewerSeat));
  const priorityPlayerId = str(raw.priorityPlayerId);
  return {
    matchId: meta.matchId,
    viewerSeat: meta.viewerSeat,
    seq: meta.seq,
    status: str(raw.status),
    turnNumber: num(raw.turnNumber),
    winnerId: str(raw.winnerId),
    phase: str(raw.phase),
    step: str(raw.step),
    activePlayerId: str(raw.activePlayerId),
    priorityPlayerId,
    viewerHasPriority: priorityPlayerId === String(meta.viewerSeat),
    players,
    stack: arr(raw.stack).map(toStackItem).filter((s): s is StackItemView => s !== null),
    pending: toPending(raw.pendingAction),
    combat: combatOf(players),
    unrecognizedKeys: Object.keys(raw).filter((k) => !KNOWN_TOP_LEVEL.has(k)),
    desynced: meta.desynced,
    updatedAt: Date.now(),
  };
}
