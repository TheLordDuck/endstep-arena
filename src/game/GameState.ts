// Normalized game state consumed by the UI. Nothing here is Endstep-specific:
// if Endstep changes its protocol, only src/game/endstep/* should change.

import type { ReplayStatus } from "./ReplayPlayer";

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
  /** Set while the player has lost connection: when (local clock, ms) their seat concedes if
      they don't come back, or null when the server waits for them indefinitely. */
  disconnected?: { deadline: number | null };
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
  /** A spell dividing its damage (Fireball, Arc Lightning): each target's share, by target key. */
  divided?: Record<string, number>;
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
  /** PAY_MANA: a Phyrexian symbol is left that 2 life can pay for (phyrexianMana). */
  phyrexian?: boolean;
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
  /** ASSIGN_DAMAGE / DIVIDE_SHIELD: the amount to divide among the options, as Endstep's damage
      bar reads it (maxValue, cardOptions with lethalDamage, overrideOrder). */
  divide?: DivideView;
  /** CHOOSE_PILE (Fact or Fiction…): the piles to take one of. */
  piles?: PileView[];
  /** CHOOSE_CARDS with contextType "sideboard": sideboarding between games. */
  sideboard?: SideboardView;
}

export interface PileView {
  /** Sent back as the answer. */
  id: string;
  label: string;
  /** Cards in it; those not listed in `cards` are face down to the viewer. */
  size: number;
  cards: CardView[];
}

export interface SideboardView {
  /** Every card of the deck and sideboard, in the prompt's order: the answer is the indexes of
      the ones in the main deck. Ids are "sb:<index>" (Endstep's may repeat or be missing). */
  cards: CardView[];
  /** The first this many cards start in the main deck. */
  mainCount: number;
  /** The main deck's allowed size. */
  min: number;
  max: number;
  /** "SIDEBOARD", or "COMMANDER_SWAP" (choosing commanders: the other part is "Commanders"). */
  mode: string;
  /** "EDITING" or "SUBMITTED", for you and your opponent(s). */
  self: string;
  opponent: string;
  /** When sideboarding time runs out (local clock, ms). */
  deadline?: number;
  /** The game about to start (2 for the second of a best of three). */
  gameNumber?: number;
}

export interface DivideView {
  /** What's divided: combat damage among blockers, a spell's or ability's damage among its
      targets (Fireball, Arc Lightning), or shield counters. */
  kind: "combat" | "spell" | "shield";
  /** All of it must be assigned. */
  total: number;
  /** In damage order; a trampler's defending player (or planeswalker) comes last. */
  options: DivideOption[];
  /** Anything may go past the blockers without lethal to each first (overrideOrder, or a spell:
      the lethal-first rule is combat's). */
  freeSpill: boolean;
}

export interface DivideOption {
  id: string;
  name: string;
  /** Damage that's lethal to it (1 against deathtouch), or null for a player. */
  lethal: number | null;
  /** The defending player (or what a trampler spills over to). */
  player: boolean;
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

/** The match clock (chess-style time per player), when the match has one. */
export interface ClockView {
  /** Each player's time left (ms) when the state was read; the running player's counts down to `deadline`. */
  left: Record<PlayerId, number>;
  /** Whose time is running. */
  running?: PlayerId;
  /** When the running player's time runs out (local clock, ms); absent when frozen (a replay). */
  deadline?: number;
  /** The player whose time ran out. */
  timedOut?: PlayerId;
}

/** A player taking too long to act: they forfeit the match when `deadline` (local clock, ms) passes. */
export interface IdleView {
  playerId: PlayerId;
  deadline: number;
  /** They stepped away (Endstep's "away"), rather than still deciding. */
  away: boolean;
  /** The last stretch (ms) before the deadline, when Endstep warns "act now". */
  graceMs: number;
}

/** Time left on a player's clock at `now` (ms), or undefined when the clock doesn't list them. */
export function clockLeft(clock: ClockView, playerId: PlayerId, now: number): number | undefined {
  if (clock.running === playerId && clock.deadline !== undefined) return Math.max(0, clock.deadline - now);
  return clock.left[playerId];
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
  clock?: ClockView;
  idle?: IdleView;
  /** Recent reveals, oldest first (kept by the adapter across states). */
  reveals: RevealView[];
  /** Top-level keys the parser doesn't know yet, surfaced for discovery. */
  unrecognizedKeys: string[];
  /** True when a delta arrived that couldn't be applied; waiting for a fresh full state. */
  desynced: boolean;
  updatedAt: number;
  /** Set when this is a replay frame: where the replay is, for its controls. */
  replay?: ReplayStatus;
}

export interface GameEventEntry {
  t: number;
  type: string;
  payload: unknown;
}
