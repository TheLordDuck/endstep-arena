// The board's local interaction mode, derived from Endstep's pendingAction.
// Pure functions: the Board keeps one Mode and swaps it on each click.

import { playerTargetKey } from "../../game/GameController";
import type { GameState, ModeOption, PendingActionView } from "../../game/GameState";

export type Mode =
  | { kind: "idle" }
  | { kind: "targets"; valid: Set<string>; selected: string[]; min: number; max: number; mandatory: boolean }
  /** With `learn`, the choice is shown in two steps: the Lessons first, then (on request) the
      hand cards, one of which is discarded to draw a card. `valid` holds the step's cards. */
  | { kind: "cards"; valid: Set<string>; selected: string[]; min: number; max: number; mandatory: boolean; mana: boolean; offBoard: boolean; learn?: LearnChoice & { discarding: boolean } }
  /** With several defenders (a planeswalker or battle in play), clicking an attacker "aims" it:
      an arrow follows the pointer until a player or planeswalker is clicked. */
  | { kind: "attackers"; valid: Set<string>; assignments: Map<string, number>; defenders?: ModeOption[]; currentDefender: number; aiming: string | null }
  | {
      kind: "blockers";
      validBlockers: Set<string>;
      attackerIds: Set<string>;
      eligibility: Map<string, Set<string>>;
      assignments: Map<string, string>;
      selectedBlocker: string | null;
    }
  /** Trigger/attacker/blocker order in a box (first = leftmost); optional triggers can be declined. */
  | { kind: "order"; order: string[]; declined: string[] }
  /** Scry/surveil (and other library arrangements): cards kept on top (first = top), and the
      ones sent to the other pile (bottom for scry, graveyard for surveil) when there is one.
      With `pick` (after a mulligan) it's a card choice laid out the same way: the hand on top,
      the cards picked for the bottom of the library in the tray, sent as the chosen cards. */
  | { kind: "arrange"; top: string[]; tray: string[]; hasTray: boolean; context: string; pick?: { min: number; max: number } }
  /** Answered from the prompt panel (modes, colors, numbers, yes/no, mulligan). */
  | { kind: "choice"; selectedModes: number[]; number: number }
  /** Not supported by the Arena UI yet: hand the prompt to Endstep's own UI. */
  | { kind: "classic"; reason: string };

const CHOICE_TYPES = new Set([
  "CHOOSE_MODE", "CHOOSE_ABILITY", "CHOOSE_COLOR", "CHOOSE_TYPE", "CHOOSE_MANA", "CHOOSE_PILE",
  "CHOOSE_NUMBER", "YES_NO", "MULLIGAN", "CHOOSE_CARD_NAME",
]);

/** Changes whenever Endstep issues a new prompt, so local selections reset. */
export function promptKey(state: GameState | null): string {
  const p = state?.pending;
  return p ? `${state!.matchId}|${p.type}|${p.promptVersion ?? ""}|${p.message ?? ""}|${p.optionCardIds.join(",")}` : "none";
}

function battlefieldIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const p of state.players) {
    for (const c of p.battlefield) ids.add(c.id);
    for (const c of p.hand ?? []) ids.add(c.id);
  }
  for (const s of state.stack) ids.add(s.id);
  return ids;
}

export function deriveMode(state: GameState | null): Mode {
  const p = state?.pending;
  if (!state || !p) return { kind: "idle" };
  const learn = learnChoice(state, p);
  if (learn) {
    // With no Lesson to get, the only thing to do is discard and draw.
    const base: Extract<Mode, { kind: "cards" }> = { kind: "cards", valid: new Set(), selected: [], min: Math.min(p.min, 1), max: 1, mandatory: p.mandatory, mana: false, offBoard: true };
    return learnStep({ ...base, learn: { ...learn, discarding: false } }, learn.lessons.length === 0);
  }
  switch (p.type) {
    case "PRIORITY":
      return { kind: "idle" };
    case "CHOOSE_TARGETS": {
      // Players are -(seat + 1) on the wire, whether listed as ids or by name.
      // (A stack item's own id is never a player, whatever its sign.)
      const onStack = new Set(state.stack.map((s) => s.id));
      const valid = new Set(p.optionCardIds.map((id) => (/^-\d+$/.test(id) && !onStack.has(id) ? playerTargetKey(-Number(id) - 1) : id)));
      for (const name of p.stringOptions) {
        const i = state.players.findIndex((pl) => (pl.targetName ?? pl.name) === name);
        if (i >= 0) valid.add(playerTargetKey(i));
      }
      return { kind: "targets", valid, selected: [], min: p.min, max: p.max, mandatory: p.mandatory };
    }
    case "CHOOSE_CARDS": {
      if (p.contextType === "sideboard") return { kind: "classic", reason: "Sideboarding" };
      if (isBottomFromHand(state, p)) {
        const pick = { min: Math.min(p.min, p.optionCardIds.length), max: Math.max(p.min, p.max) };
        return { kind: "arrange", top: [...p.optionCardIds], tray: [], hasTray: true, context: "mulligan", pick };
      }
      const valid = new Set(p.optionCardIds);
      const onBoard = battlefieldIds(state);
      const offBoard = [...valid].some((id) => !onBoard.has(id));
      return { kind: "cards", valid, selected: [], min: Math.min(p.min, valid.size), max: p.max, mandatory: p.mandatory, mana: false, offBoard };
    }
    case "PAY_MANA":
      return { kind: "cards", valid: new Set(p.optionCardIds), selected: [], min: 0, max: 999, mandatory: false, mana: true, offBoard: false };
    case "DECLARE_ATTACKERS":
      return {
        kind: "attackers",
        valid: new Set(p.optionCardIds),
        assignments: new Map(),
        defenders: p.modeOptions.length > 1 ? p.modeOptions : undefined,
        currentDefender: p.modeOptions[0]?.index ?? 0,
        aiming: null,
      };
    case "DECLARE_BLOCKERS": {
      const eligibility = new Map(Object.entries(p.blockerEligibility).map(([b, as]) => [b, new Set(as)]));
      const attackerIds = new Set<string>();
      eligibility.forEach((as) => as.forEach((a) => attackerIds.add(a)));
      if (attackerIds.size === 0) {
        for (const pl of state.players) for (const c of pl.battlefield) if (c.isAttacking) attackerIds.add(c.id);
      }
      return { kind: "blockers", validBlockers: new Set(p.optionCardIds), attackerIds, eligibility, assignments: new Map(), selectedBlocker: null };
    }
    case "ARRANGE_CARDS": {
      if (!p.optionCardIds.length) return { kind: "classic", reason: "Arrange cards" };
      const context = p.contextType ?? "";
      return { kind: "arrange", top: [...p.optionCardIds], tray: [], hasTray: context === "scry" || context === "surveil", context };
    }
    case "ORDER_ABILITIES":
    case "ORDER_ATTACKERS":
    case "ORDER_BLOCKERS":
      return { kind: "order", order: p.orderOptions.map((o) => o.id), declined: [] };
    default:
      if (CHOICE_TYPES.has(p.type)) return { kind: "choice", selectedModes: [], number: p.type === "CHOOSE_NUMBER" ? p.numberMin : p.min };
      if (p.type === "CHOOSE_CARD_NAME" && p.stringOptions.length > 0) return { kind: "choice", selectedModes: [], number: 0 };
      return { kind: "classic", reason: humanize(p.type) };
  }
}

/** Cards from your hand to put on the bottom of your library (the London mulligan). */
export function isBottomFromHand(state: GameState, p: PendingActionView): boolean {
  if (p.type !== "CHOOSE_CARDS" || !p.optionCardIds.length) return false;
  if (/mulligan/i.test(p.contextType ?? "")) return true;
  const hand = new Set((state.players.find((pl) => pl.isViewer)?.hand ?? []).map((c) => c.id));
  return /\bbottom\b/i.test(p.message ?? "") && p.optionCardIds.every((id) => hand.has(id));
}

export interface LearnChoice {
  /** Lesson cards outside the game that can be put into the hand. */
  lessons: string[];
  /** Hand cards that can be discarded to draw a card. */
  hand: string[];
}

/** Learn, as Endstep asks it: one card to choose ("Learn a Lesson", asked as targets or as
    cards) among the Lessons in the sideboard and the cards in hand (a hand card is discarded,
    then a card is drawn). */
export function learnChoice(state: GameState, p: PendingActionView): LearnChoice | null {
  if ((p.type !== "CHOOSE_CARDS" && p.type !== "CHOOSE_TARGETS") || p.max !== 1 || p.contextType === "sideboard") return null;
  // Only cards are offered, never a player.
  const ids = p.optionCardIds;
  if (!ids.length || p.stringOptions.length || ids.some((id) => /^-\d+$/.test(id))) return null;
  const inHand = new Set((state.players.find((pl) => pl.isViewer)?.hand ?? []).map((c) => c.id));
  const zone = (id: string) => (p.optionZones[id] ?? "").toLowerCase();
  const hand = ids.filter((id) => zone(id) === "hand" || inHand.has(id));
  const lessons = ids.filter((id) => !hand.includes(id));
  const fromSideboard = lessons.length > 0 && lessons.every((id) => zone(id) === "sideboard");
  const named = /\blearn/i.test(`${p.message ?? ""} ${p.contextType ?? ""}`);
  return fromSideboard || named ? { lessons, hand } : null;
}

/** Shows a learn choice's other step (the Lessons, or the hand to discard from), nothing picked. */
export function learnStep(mode: Extract<Mode, { kind: "cards" }>, discarding: boolean): Mode {
  if (!mode.learn) return mode;
  return { ...mode, valid: new Set(discarding ? mode.learn.hand : mode.learn.lessons), selected: [], learn: { ...mode.learn, discarding } };
}

export const humanize = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Applies a click on a card/player key to the current mode. Returns the new mode.
    `defender`: the defender index the key stands for (see `defenderForKey`), when attacking. */
export function clickInMode(mode: Mode, key: string, defender: number | null = null): Mode {
  switch (mode.kind) {
    case "targets":
    case "cards": {
      if (!mode.valid.has(key)) return mode;
      const has = mode.selected.includes(key);
      let selected = has ? mode.selected.filter((k) => k !== key) : [...mode.selected, key];
      if (selected.length > mode.max) selected = selected.slice(selected.length - mode.max);
      return { ...mode, selected };
    }
    case "attackers": {
      if (mode.defenders) {
        // Aiming: a defender takes the attacker; anything else stops aiming.
        if (mode.aiming && defender !== null) {
          const assignments = new Map(mode.assignments).set(mode.aiming, defender);
          return { ...mode, assignments, aiming: null };
        }
        if (!mode.valid.has(key)) return mode.aiming ? { ...mode, aiming: null } : mode;
        if (mode.assignments.has(key)) {
          const assignments = new Map(mode.assignments);
          assignments.delete(key);
          return { ...mode, assignments, aiming: null };
        }
        return { ...mode, aiming: mode.aiming === key ? null : key };
      }
      if (!mode.valid.has(key)) return mode;
      const assignments = new Map(mode.assignments);
      if (assignments.has(key)) assignments.delete(key);
      else assignments.set(key, mode.currentDefender);
      return { ...mode, assignments };
    }
    case "blockers": {
      if (mode.validBlockers.has(key)) {
        if (mode.assignments.has(key)) {
          const assignments = new Map(mode.assignments);
          assignments.delete(key);
          return { ...mode, assignments, selectedBlocker: null };
        }
        return { ...mode, selectedBlocker: mode.selectedBlocker === key ? null : key };
      }
      if (mode.attackerIds.has(key) && mode.selectedBlocker) {
        const allowed = mode.eligibility.get(mode.selectedBlocker);
        if (allowed && allowed.size > 0 && !allowed.has(key)) return mode;
        const assignments = new Map(mode.assignments);
        assignments.set(mode.selectedBlocker, key);
        return { ...mode, assignments, selectedBlocker: null };
      }
      return mode;
    }
    default:
      return mode;
  }
}

/** The number `steps` away from `n` in a CHOOSE_NUMBER prompt: through the allowed values when
    Endstep lists them, otherwise by ones, kept within the range. */
export function stepNumber(p: Pick<PendingActionView, "numberMin" | "numberMax" | "allowedNumbers">, n: number, steps: number): number {
  const allowed = p.allowedNumbers;
  if (allowed.length) {
    const at = allowed.findIndex((v) => v >= n);
    const i = at < 0 ? allowed.length - 1 : at;
    return allowed[Math.max(0, Math.min(allowed.length - 1, i + steps))]!;
  }
  return Math.max(p.numberMin, Math.min(p.numberMax, n + steps));
}

/** Moves a card in an arrangement to `zone` at `index` (the end when omitted). A card can only
    leave the top pile when there is another pile. */
export function arrangeMove(mode: Extract<Mode, { kind: "arrange" }>, id: string, zone: "top" | "tray", index?: number): Extract<Mode, { kind: "arrange" }> {
  if (zone === "tray" && !mode.hasTray) return mode;
  // A pick can't take more cards than asked for.
  if (zone === "tray" && mode.pick && !mode.tray.includes(id) && mode.tray.length >= mode.pick.max) return mode;
  const top = mode.top.filter((x) => x !== id);
  const tray = mode.tray.filter((x) => x !== id);
  if (top.length + tray.length === mode.top.length + mode.tray.length) return mode;
  const into = zone === "top" ? top : tray;
  into.splice(Math.max(0, Math.min(index ?? into.length, into.length)), 0, id);
  return { ...mode, top, tray };
}

/** Defender whose card/player matches a clicked key, for multi-defender attacks. */
export function defenderForKey(mode: Mode, key: string, state: GameState): number | null {
  if (mode.kind !== "attackers" || !mode.defenders) return null;
  const byCard = mode.defenders.find((d) => d.cardId === key);
  if (byCard) return byCard.index;
  if (key.startsWith("player:")) {
    const seat = Number(key.slice(7));
    const player = state.players[seat];
    const name = player?.targetName ?? player?.name;
    const byName = mode.defenders.find((d) => !d.cardId && name && d.description.includes(name));
    if (byName) return byName.index;
    // A single player to attack (1v1): any opponent's plate stands for it.
    const players = mode.defenders.filter((d) => !d.cardId);
    if (players.length === 1 && seat !== state.viewerSeat) return players[0]!.index;
  }
  return null;
}

/** The card/player key a defender stands for on the board (where its arrows point), if any. */
export function keyForDefender(mode: Mode, index: number, state: GameState): string | null {
  if (mode.kind !== "attackers" || !mode.defenders) return null;
  const d = mode.defenders.find((x) => x.index === index);
  if (!d) return null;
  if (d.cardId) return d.cardId;
  for (let seat = 0; seat < state.players.length; seat++) {
    const key = playerTargetKey(seat);
    if (defenderForKey(mode, key, state) === index) return key;
  }
  return null;
}

export function canConfirm(mode: Mode): boolean {
  if (mode.kind === "cards" && mode.mana) return true;
  if (mode.kind === "targets" || mode.kind === "cards") return mode.selected.length >= mode.min;
  return mode.kind === "attackers" || mode.kind === "blockers";
}

