// Turns UI intents into Endstep wire actions. Every method maps to an action
// Endstep's own client sends (see docs/ENDSTEP_ANALYSIS.md §3); the server
// validates everything, and the UI only offers what pendingAction allows.

import type { WireAction } from "../shared/protocol";
import type { GameState } from "./GameState";
import { stopsAction, type PhaseStops } from "./endstep/phaseStops";

export type ActionSink = (matchId: string, action: WireAction) => void;

/** Where the match chat goes: a message (with the id that matches the server's echo to it), or
    that you're typing. */
export interface ChatSink {
  send(matchId: string, text: string, clientMessageId: string): void;
  typing(matchId: string, active: boolean): void;
}

/** Endstep ids are numbers on the wire; the UI keeps them as strings. */
export const wireId = (id: string): string | number => (/^-?\d+$/.test(id) ? Number(id) : id);

/** Players are targeted as -(seatIndex + 1). */
export const playerTargetKey = (index: number) => `player:${index}`;
const wireTarget = (key: string) => (key.startsWith("player:") ? -(Number(key.slice(7)) + 1) : wireId(key));

// Types Endstep never stamps with the prompt version (its `mS` helper).
const UNVERSIONED = new Set(["SET_PHASE_STOPS", "SET_AUTO_YIELDS", "CLEAR_REMEMBERED_ORDERS", "CHEAT", "CONCEDE", "CONCEDE_MATCH"]);

/** How long a second combat declaration for the same prompt is held back (see firstDeclaration). */
const DECLARE_AGAIN_MS = 3000;

export class GameController {
  constructor(
    private readonly getState: () => GameState | null,
    private readonly sink: ActionSink,
    private readonly chat?: ChatSink,
  ) {}

  /** A chat message to the match (players and spectators alike; not in a replay). */
  sendChat(text: string): boolean {
    const state = this.getState();
    const message = text.trim();
    if (!state || state.replay || !message || !this.chat) return false;
    this.chat.send(state.matchId, message, crypto.randomUUID());
    return true;
  }

  /** You started or stopped typing in the chat. */
  chatTyping(active: boolean): void {
    const state = this.getState();
    if (state && !state.replay) this.chat?.typing(state.matchId, active);
  }

  private send(action: WireAction): void {
    const state = this.getState();
    // A replay, or someone else's game, is only watched: nothing goes to the server.
    if (!state || state.status === "COMPLETE" || state.replay || state.spectating) return;
    const version = state.pending?.promptVersion;
    const stamped = action.promptVersion == null && !UNVERSIONED.has(action.type) && version != null
      ? { ...action, promptVersion: version }
      : action;
    this.sink(state.matchId, stamped);
  }

  setPhaseStops(stops: PhaseStops): void {
    this.send(stopsAction(stops));
  }

  /** The auto-yields as Endstep's client sends them (see endstep/autoYields.ts). */
  setAutoYields(action: WireAction): void {
    this.send(action);
  }

  /** Forgets the orders saved with "OK & remember": the next ordering question asks again. */
  clearRememberedOrders(): void {
    this.send({ type: "CLEAR_REMEMBERED_ORDERS" });
  }

  passPriority(): void {
    this.send({ type: "PASS_PRIORITY" });
  }

  /** Pass until the stack is empty (Endstep's "resolve all"). */
  resolveStack(): void {
    this.send({ type: "PASS_PRIORITY", yieldUntilStackEmpty: true });
  }

  playCard(cardId: string, abilityIndex?: number, keepPriority = false): void {
    this.send({ type: "PLAY_CARD", cardId: wireId(cardId), abilityIndex, autoPassAfter: !keepPriority });
  }

  tapMana(cardId: string): void {
    this.send({ type: "TAP_MANA", cardId: wireId(cardId) });
  }

  /** Pays with one floating mana of this color ("W", "U", "B", "R", "G" or "C"), as Endstep does. */
  useFloatingMana(symbol: string): void {
    this.send({ type: "USE_FLOATING_MANA", stringValue: symbol });
  }

  /** Pays 2 life for one Phyrexian mana symbol of the cost being paid. */
  payPhyrexianLife(): void {
    this.send({ type: "PAY_LIFE_PHYREXIAN" });
  }

  autoPay(): void {
    this.send({ type: "AUTO_PAY" });
  }

  undo(): void {
    this.send({ type: "UNDO" });
  }

  cancel(): void {
    this.send({ type: "CANCEL" });
  }

  no(): void {
    this.send({ type: "NO" });
  }

  /** Concedes this game, or the whole match (best of three), as Endstep's concede dialog does. */
  concede(match: boolean): void {
    this.send({ type: match ? "CONCEDE_MATCH" : "CONCEDE" });
  }

  /** Backs out of an optional choice (a cancellable mana choice, a picker). */
  decline(): void {
    this.send({ type: "DECLINE" });
  }

  /** Scry/surveil and other arrangements: the cards kept on top, first = top of the library.
      Everything else goes to the other pile (bottom for scry, graveyard for surveil). */
  arrangeCards(top: string[]): void {
    this.send({ type: "ARRANGE_CARDS", orderedCards: top.map(wireId) });
  }

  answer(yes: boolean, labels?: [string, string]): void {
    if (labels) this.send({ type: "YES", stringValue: yes ? labels[0] : labels[1] });
    else this.send({ type: yes ? "YES" : "NO" });
  }

  keepHand(): void {
    this.send({ type: "KEEP_HAND", keepHand: true });
  }

  mulligan(): void {
    this.send({ type: "MULLIGAN", keepHand: false });
  }

  mulliganSpecial(label: string): void {
    this.send({ type: "MULLIGAN_SPECIAL", stringValue: label });
  }

  /** A combat declaration goes once per prompt: a second one for the same prompt version, right
      after, is dropped (two at once, one with the attack and one with none, were seen in a real
      match). Later on it goes, in case the first was lost. */
  private firstDeclaration(type: "DECLARE_ATTACKERS" | "DECLARE_BLOCKERS"): boolean {
    const state = this.getState();
    const key = `${state?.matchId}|${type}|${state?.pending?.promptVersion}`;
    const now = Date.now();
    if (this.declared?.key === key && now - this.declared.at < DECLARE_AGAIN_MS) return false;
    this.declared = { key, at: now };
    return true;
  }

  private declared: { key: string; at: number } | null = null;

  /** attackerId → defender mode index; `withDefenders` when the prompt offered several defenders. */
  declareAttackers(assignments: Map<string, number>, withDefenders: boolean): void {
    if (!this.firstDeclaration("DECLARE_ATTACKERS")) return;
    const attackers = [...assignments.keys()].map(wireId);
    if (!withDefenders) {
      this.send({ type: "DECLARE_ATTACKERS", attackers });
      return;
    }
    const byAttacker: Record<string, number> = {};
    assignments.forEach((defender, attacker) => (byAttacker[attacker] = defender));
    this.send({ type: "DECLARE_ATTACKERS", attackers, blockers: byAttacker });
  }

  /** blockerId → attackerId. */
  declareBlockers(assignments: Map<string, string>): void {
    if (!this.firstDeclaration("DECLARE_BLOCKERS")) return;
    const blockers: Record<string, string | number> = {};
    assignments.forEach((attacker, blocker) => (blockers[blocker] = wireId(attacker)));
    this.send({ type: "DECLARE_BLOCKERS", blockers });
  }

  chooseTargets(keys: string[]): void {
    this.send({ type: "CHOOSE_TARGETS", targets: keys.map(wireTarget) });
  }

  chooseCards(ids: string[]): void {
    // A player picked (proliferate) goes as -(seat + 1), as in a target choice.
    this.send({ type: "CHOOSE_CARDS", orderedCards: ids.map(wireTarget) });
  }

  /** ASSIGN_DAMAGE / DIVIDE_SHIELD: the amount for each option, in the prompt's order, as
      Endstep's damage bar sends it. */
  divide(amounts: number[]): void {
    this.send({ type: "CHOOSE_CARDS", orderedCards: amounts });
  }

  /** Trigger order (leftmost resolves first), as Endstep's own order box sends it: every
      option in `orderedCards`, plus the optional ones left out in `declinedCards`. */
  orderAbilities(ordered: string[], declined: string[]): void {
    this.send({ type: "ORDER_ABILITIES", orderedCards: ordered.map(wireId), declinedCards: declined.map(wireId) });
  }

  /** Damage assignment order for attackers/blockers (first in the list first). */
  orderCombatants(type: "ORDER_ATTACKERS" | "ORDER_BLOCKERS", ordered: string[]): void {
    this.send({ type, orderedCards: ordered.map(wireId) });
  }

  chooseModes(indices: number[]): void {
    this.send({ type: "CHOOSE_MODE", orderedCards: indices });
  }

  chooseString(type: "CHOOSE_COLOR" | "CHOOSE_TYPE" | "CHOOSE_MANA" | "CHOOSE_PILE" | "CHOOSE_CARD_NAME", value: string): void {
    this.send({ type, stringValue: value });
  }

  /** Sideboarding: the main deck, as the indexes of its cards in the prompt's list (Endstep's
      sideboard view sends them in list order). */
  submitSideboard(mainIndexes: number[]): void {
    this.send({ type: "SIDEBOARD_SUBMIT", orderedCards: [...mainIndexes].sort((a, b) => a - b) });
  }

  /** Takes a submitted deck back to edit it again. */
  withdrawSideboard(): void {
    this.send({ type: "SIDEBOARD_WITHDRAW" });
  }

  chooseNumber(value: number): void {
    this.send({ type: "CHOOSE_NUMBER", numberValue: value });
  }
}
