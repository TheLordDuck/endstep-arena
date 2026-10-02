// Normalized game state consumed by the UI. Nothing here is Endstep-specific:
// if Endstep changes its protocol, only src/game/endstep/* should change.

export type PlayerId = string;

export interface CardView {
  id: string;
  name: string;
  ownerId?: PlayerId;
  /** The owner's account name, as prompt options (cardOptions) name it instead of an id. */
  ownerName?: string;
  controllerId?: PlayerId;
  tapped: boolean;
  /** Came under its controller's control this turn (can't attack or {T} without haste). */
  summoningSick: boolean;
  faceDown: boolean;
  isToken: boolean;
  /** A token copy of a real card (shown with that card's image). */
  isCopyOfRealCard?: boolean;
  /** Showing its back face (transformed or a back-face DFC). */
  backFace?: boolean;
  /** Face down, but the viewer may see what it is (a morph they control, a card revealed from a
      hand…): name and printing are the real card's. */
  peeked?: boolean;
  /** Token image lookup, as Endstep does it: its printing, color and printed (base) stats. */
  tokenSetCode?: string;
  tokenCollectorNumber?: string;
  color?: string;
  basePower?: number;
  baseToughness?: number;
  isCommander: boolean;
  /** For effects/emblems: the name of the card that created it. */
  effectSourceName?: string;
  power?: number | string;
  toughness?: number | string;
  loyalty?: number | string;
  damage?: number;
  /** Class level, when Endstep sends it (Classes start at level 1). */
  classLevel?: number;
  counters: Record<string, number>;
  /** Keywords an effect gave this permanent, and printed ones it lost (as Endstep sends them). */
  keywordsGranted?: string[];
  keywordsLost?: string[];
  /** What was chosen for this permanent as it entered or resolved (a creature type for Cavern of
      Souls, a card name for Pithing Needle, a color…), as Endstep's `chosenMarks` lists it. */
  chosen?: ChosenMark[];
  attachmentIds: string[];
  /** The permanent this aura/equipment is attached to. */
  attachedToId?: string;
  isAttacking: boolean;
  attackingDefenderId?: string;
  isBlocking: boolean;
  blockingIds: string[];
  setCode?: string;
  collectorNumber?: string;
  /** Card types as Endstep sends them ("Creature", "Land", …). */
  types: string[];
  typeLine?: string;
  manaCost?: string;
  oracleText?: string;
}

export interface ChosenMark {
  /** "TYPE", "NAME", "COLOR", "NUMBER", "EVEN_ODD", "DIRECTION"… */
  kind: string;
  value: string;
}

export interface PlayerView {
  /** Seat index as a string, which is how Endstep's activePlayerId/priorityPlayerId refer to players. */
  id: PlayerId;
  seat: number;
  name: string;
  /** Endstep's `player.name`, which prompts use to offer players as targets. */
  targetName?: string;
  /** Account name (Endstep's `player.name`, as its player popup uses it), used to look up the avatar. */
  username?: string;
  isViewer: boolean;
  /** The player making this one's decisions for now (Emrakul, Mindslaver), when it isn't them. */
  controlledBy?: PlayerId;
  life?: number;
  poison: number;
  energy: number;
  librarySize?: number;
  handSize?: number;
  /** Null when this client can't see the hand (usually the opponent's). */
  hand: CardView[] | null;
  battlefield: CardView[];
  graveyard: CardView[];
  exile: CardView[];
  /** Commanders (and companions/vanguards) only. */
  commandZone: CardView[];
  /** Effects and emblems from the command zone; each names the card that created it. */
  effects: CardView[];
  /** Top library cards the viewer can see and may play (Future Sight and the like). */
  libraryTop: CardView[];
  /** Raw pass-through until the shape is confirmed (see docs/ENDSTEP_ANALYSIS.md). */
  commanderDamage?: unknown;
  manaPool?: unknown;
  hasMonarch: boolean;
  hasInitiative: boolean;
  hasLost: boolean;
  hasConceded: boolean;
}

export interface StackItemView {
  id: string;
  name: string;
  isAbility: boolean;
  /** The spell itself, or the ability's source card. */
  card?: CardView;
  controllerId?: PlayerId;
  sourceCardId?: string;
  /** Card ids, or "player:<seat>" for players. */
  targets: string[];
  /** The value chosen for X, when Endstep sends it with the item. */
  x?: number;
}

export interface AbilityOption {
  index: number;
  description: string;
  cost?: string;
}

export interface PlayableOption {
  cardId: string;
  abilities: AbilityOption[];
}

export interface OrderOption {
  id: string;
  name: string;
  /** The ability's text. */
  description?: string;
  sourceCardId?: string;
  /** An optional ("may") trigger the player can leave out. */
  declinable: boolean;
}

export interface ModeOption {
  index: number;
  description: string;
  cardId?: string;
}

/** The viewer's current prompt. It is the only source of "what can I do right now". */
export interface PendingActionView {
  type: string;
  promptVersion?: number;
  message?: string;
  sourceCardId?: string;
  sourceCardName?: string;
  contextType?: string;
  min: number;
  max: number;
  mandatory: boolean;
  optionCardIds: string[];
  /** cardOptions as cards (for pickers when the options aren't on the board). */
  optionCards: CardView[];
  /** Zone of each option card, when Endstep says. */
  optionZones: Record<string, string>;
  /** ORDER_ABILITIES/ORDER_ATTACKERS/ORDER_BLOCKERS: what to put in order (first = resolves first). */
  orderOptions: OrderOption[];
  /** PRIORITY: cards that can be played/activated now. */
  playable: PlayableOption[];
  modeOptions: ModeOption[];
  stringOptions: string[];
  /** PAY_MANA: floating mana usable for this cost, as { color: amount } (raw pass-through). */
  floatingMana?: unknown;
  /** DECLARE_BLOCKERS: blockerId → attacker ids it may block. */
  blockerEligibility: Record<string, string[]>;
  /** Endstep offers UNDO for the last action (e.g. an untap or a cast before paying). */
  canUndo: boolean;
  /** CHOOSE_MANA: the choice can be backed out of (DECLINE). */
  cancellable: boolean;
  /** CHOOSE_NUMBER (X costs, "choose a number"): the range, and the only values allowed when
      Endstep lists them (minValue / maxValue / allowedValues). */
  numberMin: number;
  numberMax: number;
  allowedNumbers: number[];
}

/** Cards someone revealed (from a hand, a library…), from Endstep's CARD_REVEALED events. */
export interface RevealView {
  id: string;
  playerName?: string;
  /** Where they were revealed from ("HAND", "LIBRARY"…), when Endstep says. */
  zone?: string;
  /** Revealed on the way to a hand (CARD_REVEALED_TO_HAND). */
  toHand: boolean;
  message?: string;
  /** Display copies (ids "reveal:…"); `cardIds` holds the real ids when Endstep sends them. */
  cards: CardView[];
  cardIds: (string | undefined)[];
  at: number;
}

export interface CombatLink {
  fromId: string;
  toId: string;
}

export interface GameState {
  matchId: string;
  viewerSeat: number;
  seq?: number;
  status?: string;
  turnNumber?: number;
  winnerId?: PlayerId;
  phase?: string;
  step?: string;
  activePlayerId?: PlayerId;
  priorityPlayerId?: PlayerId;
  viewerHasPriority: boolean;
  players: PlayerView[];
  stack: StackItemView[];
  pending: PendingActionView | null;
  combat: { attacks: CombatLink[]; blocks: CombatLink[] };
  /** Recent reveals, oldest first (kept by the adapter across states). */
  reveals: RevealView[];
  /** Top-level keys the parser doesn't know yet, surfaced for discovery. */
  unrecognizedKeys: string[];
  /** True when a delta arrived that couldn't be applied; waiting for a fresh full state. */
  desynced: boolean;
  updatedAt: number;
}

export interface GameEventEntry {
  t: number;
  type: string;
  payload: unknown;
}
