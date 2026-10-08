// The board's local interaction mode, derived from Endstep's pendingAction.
// Pure functions: the Board keeps one Mode and swaps it on each click.

import { playerTargetKey } from "../../game/GameController";
import type { CardView, DivideView, GameState, ModeOption, PendingActionView, SideboardView } from "../../game/GameState";

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
  /** Combat damage (or shield counters) divided among blockers: the amount on each option. */
  | { kind: "divide"; amounts: number[] }
  /** Fact or Fiction and the like: the piles side by side, one picked, then taken. */
  | { kind: "piles"; selected: string | null }
  /** Sideboarding: the indexes (in the prompt's list) of the cards in the main deck; `deck` tells
      the same deck apart when the prompt is reissued; `discarding` asks before throwing changes away. */
  | { kind: "sideboard"; main: Set<number>; deck: string; discarding: boolean }
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
  // No hand counts as the table: a card chosen from a hand (yours to your own Thoughtseize, an
  // opponent's to yours, a discard) is picked from a fan, like a graveyard's cards.
  for (const p of state.players) for (const c of p.battlefield) ids.add(c.id);
  for (const s of state.stack) ids.add(s.id);
  return ids;
}

/**
 * Proliferate: any number of the permanents and players that have counters, picked on the table
 * (no fan, no arrows). Endstep asks it as a plain choice; its message names it.
 */
export function isProliferate(p: PendingActionView): boolean {
  return (p.type === "CHOOSE_CARDS" || p.type === "CHOOSE_TARGETS") && /\bproliferat/i.test(p.message ?? "");
}

/**
 * A discard from your own hand (an activated ability's cost, Thoughtseize on yourself…): picked by
 * clicking the cards in your hand, as in Arena, instead of in a fan. Endstep marks it with
 * `contextType: "discard"` (its own UI colors the selection that way); the message saying
 * "discard" counts too. Every option must be in your hand.
 */
export function discardInHand(state: GameState, p: PendingActionView): boolean {
  if (p.type !== "CHOOSE_CARDS" && p.type !== "CHOOSE_TARGETS") return false;
  if (p.contextType !== "discard" && !/\bdiscard/i.test(p.message ?? "")) return false;
  const hand = new Set((state.players.find((pl) => pl.isViewer)?.hand ?? []).map((c) => c.id));
  const ids = p.optionCardIds.filter((id) => !/^-\d+$/.test(id));
  return ids.length > 0 && ids.every((id) => hand.has(id));
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
      if (p.contextType === "sideboard") {
        if (!p.sideboard?.cards.length) return { kind: "classic", reason: "Sideboarding" };
        return { kind: "sideboard", main: sideboardStart(p.sideboard), deck: deckKey(p.sideboard), discarding: false };
      }
      if (isPileSplit(p)) {
        // The cards picked make pile 1, the rest pile 2: shown as the two piles.
        const n = p.optionCardIds.length;
        const pick = { min: Math.min(p.min, n), max: p.max > 0 ? Math.min(p.max, n) : n };
        return { kind: "arrange", top: [...p.optionCardIds], tray: [], hasTray: true, context: "piles", pick };
      }
      if (isBottomFromHand(state, p)) {
        const pick = { min: Math.min(p.min, p.optionCardIds.length), max: Math.max(p.min, p.max) };
        return { kind: "arrange", top: [...p.optionCardIds], tray: [], hasTray: true, context: "mulligan", pick };
      }
      // Proliferate: players come as -(seat + 1), picked by their picture like targets.
      if (isProliferate(p)) {
        const valid = new Set(p.optionCardIds.map((id) => (/^-\d+$/.test(id) ? playerTargetKey(-Number(id) - 1) : id)));
        return { kind: "cards", valid, selected: [], min: Math.min(p.min, valid.size), max: p.max > 0 ? p.max : valid.size, mandatory: p.mandatory, mana: false, offBoard: false };
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
    case "ASSIGN_DAMAGE":
    case "DIVIDE_SHIELD":
      if (!p.divide?.options.length) return { kind: "classic", reason: humanize(p.type) };
      return { kind: "divide", amounts: divideStart(p.divide) };
    case "CHOOSE_PILE":
      if (p.piles?.length) return { kind: "piles", selected: null };
      return { kind: "choice", selectedModes: [], number: p.min };
    default:
      if (CHOICE_TYPES.has(p.type)) return { kind: "choice", selectedModes: [], number: p.type === "CHOOSE_NUMBER" ? p.numberMin : p.min };
      if (p.type === "CHOOSE_CARD_NAME" && p.stringOptions.length > 0) return { kind: "choice", selectedModes: [], number: 0 };
      return { kind: "classic", reason: humanize(p.type) };
  }
}

// Dividing combat damage, by Endstep's damage bar's rules: every blocker must have lethal damage
// before any goes past it to the player (trample), unless the prompt says otherwise; all of the
// damage must be assigned.

/** The split offered first: lethal to each blocker in order, the rest to the last one reached
    (the player, with trample). Nothing when the first option's lethal isn't known. A spell gives
    each target 1 first (each must get some), then tops creatures up to lethal, the rest to the last. */
export function divideStart(d: DivideView): number[] {
  if (d.kind === "spell") return spellStart(d);
  const out = d.options.map(() => 0);
  if (d.options[0]?.lethal == null) return out;
  let left = d.total;
  let last = 0;
  for (let i = 0; i < d.options.length && left > 0; i++) {
    const lethal = d.options[i]!.lethal;
    out[i] = lethal == null ? left : Math.min(lethal, left);
    left -= out[i]!;
    last = i;
  }
  if (left > 0) out[last]! += left;
  return out;
}

function spellStart(d: DivideView): number[] {
  const n = d.options.length;
  if (!n) return [];
  const out = d.options.map((_, i): number => (i < d.total ? 1 : 0));
  let left = d.total - out.reduce((a, b) => a + b, 0);
  d.options.forEach((o, i) => {
    const more = Math.min(left, Math.max(0, (o.lethal ?? 0) - out[i]!));
    out[i]! += more;
    left -= more;
  });
  out[n - 1]! += left;
  return out;
}

/** Each target of a spell dividing its damage gets at least 1 (when there's enough to go round). */
export function divideShort(d: DivideView, amounts: number[]): boolean {
  return d.kind === "spell" && d.total >= d.options.length && amounts.some((n) => n < 1);
}

/** All of it assigned, as the rules allow: Done can be pressed. */
export const divideReady = (d: DivideView, amounts: number[]) => divideLeft(d, amounts) === 0 && !divideShort(d, amounts);

/** Every blocker has lethal damage assigned. */
export function allLethal(d: DivideView, amounts: number[]): boolean {
  return d.options.every((o, i) => o.player || o.lethal == null || amounts[i]! >= o.lethal);
}

/** The player can't take any while a blocker lacks lethal damage. */
export function divideLocked(d: DivideView, amounts: number[], i: number): boolean {
  return !!d.options[i]?.player && !d.freeSpill && !allLethal(d, amounts);
}

export const divideLeft = (d: DivideView, amounts: number[]) => d.total - amounts.reduce((a, b) => a + b, 0);

/** Taking a blocker below lethal takes back what had spilled over to the player. */
function divideFix(d: DivideView, amounts: number[]): number[] {
  return d.freeSpill || allLethal(d, amounts) ? amounts : amounts.map((n, i) => (d.options[i]!.player ? 0 : n));
}

/** One more (or one less) on option `i`; `lethal` jumps to lethal (or, for less, down to it). */
export function divideStep(d: DivideView, amounts: number[], i: number, more: boolean, lethal = false): number[] {
  const o = d.options[i];
  if (!o) return amounts;
  const now = amounts[i]!;
  const cap = o.lethal ?? Infinity;
  const left = divideLeft(d, amounts);
  let by = more ? 1 : -1;
  if (lethal) by = more ? (cap - now > 0 && Number.isFinite(cap) ? cap - now : left) : (now > cap ? cap - now : -now);
  by = Math.min(by, left);
  if ((more && divideLocked(d, amounts, i)) || by === 0 || now + by < 0) return amounts;
  const next = [...amounts];
  next[i] = now + by;
  return divideFix(d, next);
}

/** Option `i` set to `n` (typed in), within what's left. */
export function divideSet(d: DivideView, amounts: number[], i: number, n: number): number[] {
  if (divideLocked(d, amounts, i)) return amounts;
  const others = amounts.reduce((a, b, j) => (j === i ? a : a + b), 0);
  const next = [...amounts];
  next[i] = Math.max(0, Math.min(Number.isFinite(n) ? Math.floor(n) : 0, d.total - others));
  return divideFix(d, next);
}

/** Cards from your hand to put on the bottom of your library (the London mulligan). */
// Cards whose caster separates cards into two piles for an opponent (or themselves) to choose from.
const PILE_SPLITTERS = new Set([
  "Fact or Fiction", "Steam Augury", "Epiphany at the Drownyard", "Truth or Tale", "Sphinx of Uthuun",
  "Brilliant Ultimatum", "Unesh, Criosphinx Sovereign", "Jace, Architect of Thought", "Boneyard Parley",
  "Kiora's Dismissal", "Mystic Genesis", "Stolen Goods",
]);

/** Separating cards into two piles (the other player of Fact or Fiction): Endstep asks it as a
    card choice, the cards picked making one pile. */
export function isPileSplit(p: PendingActionView): boolean {
  if (p.type !== "CHOOSE_CARDS" || p.optionCardIds.length < 2) return false;
  return /\bpiles?\b/i.test(p.message ?? "") || PILE_SPLITTERS.has(p.sourceCardName ?? "");
}

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


// Sideboarding, by Endstep's sideboard view's rules: the cards are one list, the first
// `mainCount` in the main deck; moving a card changes which side its index is on; the main deck
// must end between min and max cards; the answer is the main deck's indexes.

export function sideboardStart(sb: SideboardView): Set<number> {
  return new Set(sb.cards.slice(0, sb.mainCount).map((_, i) => i));
}

/** Tells one deck from another (the same deck when the prompt is reissued). */
export function deckKey(sb: SideboardView): string {
  return sb.cards.map((c) => c.name).join("|");
}

/** Moves cards (by index) into the main deck, or out of it. */
export function sideboardMove(main: ReadonlySet<number>, indexes: number[], toMain: boolean): Set<number> {
  const next = new Set(main);
  for (const i of indexes) {
    if (toMain) next.add(i);
    else next.delete(i);
  }
  return next;
}

/** How the main deck's size compares with what's allowed. */
export function sideboardCheck(sb: SideboardView, main: ReadonlySet<number>): { size: number; short: number; over: number; ok: boolean } {
  const size = main.size;
  const short = Math.max(0, sb.min - size);
  const over = sb.max > 0 ? Math.max(0, size - sb.max) : 0;
  return { size, short, over, ok: !short && !over };
}

/** True when the main deck isn't the one registered. */
export function sideboardChanged(sb: SideboardView, main: ReadonlySet<number>): boolean {
  const start = sideboardStart(sb);
  return start.size !== main.size || [...main].some((i) => !start.has(i));
}

/** A card's mana value from its cost ("{2}{U}{U}" = 4; X counts 0, hybrid and Phyrexian 1). */
export function manaValue(cost: string | undefined): number {
  let total = 0;
  for (const [, sym] of (cost ?? "").matchAll(/\{([^}]+)\}/g)) {
    if (/^\d+$/.test(sym!)) total += Number(sym);
    else if (/^\d+\//.test(sym!)) total += Number(sym!.split("/")[0]);
    else if (!/^[XYZ]$/i.test(sym!)) total += 1;
  }
  return total;
}

export const isLandCard = (c: Pick<CardView, "types" | "typeLine">) =>
  c.types.some((t) => t.toLowerCase() === "land") || /\bLand\b/.test(c.typeLine ?? "");

/** Copies of one card on one side: shown as one stack with a count. */
export interface SideboardStack {
  name: string;
  card: CardView;
  indexes: number[];
}

/** One side's cards stacked by name, cheapest first (by name within a cost). */
export function sideboardStacks(sb: SideboardView, main: ReadonlySet<number>, inMain: boolean): SideboardStack[] {
  const byName = new Map<string, SideboardStack>();
  sb.cards.forEach((card, i) => {
    if (main.has(i) !== inMain) return;
    const stack = byName.get(card.name);
    if (stack) stack.indexes.push(i);
    else byName.set(card.name, { name: card.name, card, indexes: [i] });
  });
  return [...byName.values()].sort((a, b) => manaValue(a.card.manaCost) - manaValue(b.card.manaCost) || a.name.localeCompare(b.name));
}

/** The main deck in columns, as Arena lays out a deck: by mana value (1 or less, 2… 6+), lands
    last. Empty columns are left out. */
export function deckColumns(stacks: SideboardStack[]): { label: string; stacks: SideboardStack[] }[] {
  const labels = ["0–1", "2", "3", "4", "5", "6+", "Lands"];
  const cols = labels.map((label) => ({ label, stacks: [] as SideboardStack[] }));
  for (const s of stacks) {
    const col = isLandCard(s.card) ? 6 : Math.min(5, Math.max(0, manaValue(s.card.manaCost) - 1));
    cols[col]!.stacks.push(s);
  }
  return cols.filter((c) => c.stacks.length);
}
