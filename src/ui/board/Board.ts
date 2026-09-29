// The Arena-style game board. Renders a normalized GameState incrementally:
// every card is one element keyed by id, reused across zones, so any zone
// change (draw, cast, resolve, die, exile) animates with FLIP.
// All game actions go through GameController; this file never talks to
// Endstep directly.

import type { AbilityOption, CardView, GameState, PendingActionView, PlayerView, StackItemView } from "../../game/GameState";
import { playerTargetKey, type GameController } from "../../game/GameController";
import { createBackEl, createCardEl, imageUrl, isFrontRow, isFullCard, isLand, lostKeywords, updateCardEl } from "./cards";
import { arrangeMove, canConfirm, clickInMode, defenderForKey, deriveMode, humanize, promptKey, stepNumber, type Mode } from "./modes";
import { wheelFromAbilities, wheelFromStrings, wheelSvg, type WheelOption } from "./manaWheel";
import { currentStep, stepIndex, stepLabel, TURN_STEPS } from "./phases";
import type { PhaseStops, StopSide } from "../../game/endstep/phaseStops";
import { avatarPicture } from "../../game/endstep/avatars";
import { ExileLinks } from "../../game/exileLinks";
import { HandKnowledge } from "../../game/handKnowledge";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** How long a reveal stays on screen (ms), unless closed sooner. */
const REVEAL_MS = 12_000;
/** Endstep's logo (the site's own icon), for a player without an avatar picture. */
const ENDSTEP_LOGO = `<img class="logo" src="/favicon.svg" alt="" draggable="false">`;
/** Clear space (px) kept around each player's avatar, so no card sits under it. */
const AVATAR_CLEARANCE = 16;

interface Zones {
  opp: PlayerView | null;
  me: PlayerView | null;
  others: PlayerView[];
}

export interface BoardHooks {
  onToggleDebug(): void;
  onHide(): void;
  phaseStops(): PhaseStops;
  togglePhaseStop(side: StopSide, step: string): void;
  /** The items of Endstep's own table menu (decklist, settings, concede…), or null without one. */
  tableMenu(): Promise<string[] | null>;
  /** Runs one of those items through Endstep's menu (its window shows while the board steps aside). */
  runTableItem(label: string): void;
}

export class Board {
  readonly el: HTMLElement;
  private q = <T extends HTMLElement>(sel: string) => this.el.querySelector<T>(sel)!;

  private state: GameState | null = null;
  private mode: Mode = { kind: "idle" };
  private modeKey = "";
  private focusedOpp: string | null = null;
  private awaiting = false;
  private awaitTimer = 0;
  private classicDismissedFor = "";

  private cardEls = new Map<string, HTMLElement>();
  private slotEls = new Map<string, HTMLElement>();
  private backEls = new Map<string, HTMLElement>();
  private cardData = new Map<string, CardView>();
  private used = new Set<string>();

  private prevLife = new Map<string, number>();
  private prevActive: string | undefined;
  private prevPhase: string | undefined;
  /** Playable cards outside the hand (graveyard, exile…), shown in the second hand. */
  private sideIds = new Set<string>();
  /** Command-zone effects shown on the card that created them. */
  private effectsByCard = new Map<string, CardView[]>();
  /** Effects whose source card isn't on the table: shown on the player's plate. */
  private looseEffects = new Map<string, CardView[]>();
  /** Cards exiled "until this leaves the battlefield", drawn under the permanent holding them. */
  private exileLinks = new ExileLinks();
  private linked: ReadonlyMap<string, string> = new Map();
  /** Holding permanent → the exiled cards under it. */
  private held = new Map<string, CardView[]>();
  /** What you've seen of other players' hands (revealed, or offered in your choices). */
  private handKnowledge = new HandKnowledge();
  private knownHands: ReadonlyMap<string, CardView[]> = new Map();
  /** "View battlefield": a choice to make is set aside to look at the table. */
  private peeking = false;
  private pileTops = new Map<string, HTMLElement>();
  /** Stack card element id → its stack item (for source/target arrows). */
  private stackEls = new Map<string, StackItemView>();
  private hoverStack: string | null = null;
  private hoverPerm: string | null = null;
  private drag: { id: string; startX: number; startY: number; el: HTMLElement; active: boolean } | null = null;
  /** The stack tray is tucked away (the player asked for a clear view of the battlefield). */
  private stackHidden = false;
  /** Reordering in the order box: the tile being dragged along the row. */
  private orderDrag: {
    id: string; startX: number; active: boolean;
    tiles: HTMLElement[]; ids: string[]; centers: number[]; step: number; from: number; to: number;
  } | null = null;
  private suppressClickUntil = 0;
  private zoomPinned = false;
  /** Clicked a permanent with several abilities: plain mana ones open the color wheel, the
      rest an Arena "Choose One". Both are local until an ability is picked. */
  private localWheel: { cardId: string; options: WheelOption[] } | null = null;
  private abilityPick: { cardId: string; abilities: AbilityOption[] } | null = null;
  /** Crowded zones shown a page at a time: the page shown, by zone ("me:others", "opp:full"…). */
  private pages = new Map<string, number>();
  /** Zones laid out in pages this time, for their arrows. */
  private pageNavs = new Map<HTMLElement, { key: string; page: number; pages: number }>();
  /** Reveals closed with ✕, and the timer that closes the rest. */
  private dismissedReveals = new Set<string>();
  /** Reveals kept up longer because they were being looked at when their time ran out. */
  private revealUntil = new Map<string, number>();
  private revealTimer = 0;
  /** Scroll position (card index at the center) of each card fan, by fan key. */
  private fanPos = new Map<string, number>();
  /** Your hand's order, left to right, as you arranged it. */
  private handOrder: string[] = [];
  /** Scry/surveil: a card being dragged between the piles. */
  private arrDrag: { id: string; startX: number; startY: number; el: HTMLElement; active: boolean } | null = null;
  private arrowsTimer = 0;

  constructor(private readonly controller: GameController, private readonly hooks: BoardHooks) {
    this.el = document.createElement("div");
    this.el.className = "board";
    this.el.innerHTML = `
      <div class="felt"></div>
      <div class="opp-tiles"></div>
      <div class="hand opp-hand"></div>
      <div class="plate opp-plate" data-player=""></div>
      <div class="lifebar opp-bar"><div class="track-half left"></div><div class="life-orb opp-life"></div><div class="track-half right"></div></div>
      <div class="mana-pool opp-mana"></div>
      <section class="side opp">
        <div class="row back"><div class="cluster lands"></div><div class="cluster others"></div><div class="cluster full"></div></div>
        <div class="row front"></div>
      </section>
      <div class="midline">
        <div class="turn-label"></div>
      </div>
      <section class="side me">
        <div class="row front"></div>
        <div class="row back"><div class="cluster lands"></div><div class="cluster others"></div><div class="cluster full"></div></div>
      </section>
      <div class="plate me-plate" data-player=""></div>
      <div class="lifebar me-bar"><div class="track-half left"></div><div class="life-orb me-life"></div><div class="track-half right"></div></div>
      <div class="mana-pool me-mana"></div>
      <div class="hand mine my-hand"></div>
      <div class="hand mine side-hand"></div>
      <div class="piles opp-piles"></div>
      <div class="piles me-piles"></div>
      <div class="stack-dock"><button class="stack-toggle" data-ui="stack-toggle" title="Hide the stack"></button><div class="stack"></div></div>
      <div class="prompt"></div>
      <div class="dock"></div>
      <svg class="arrows" aria-hidden="true">
        <defs>
          <marker id="ah-atk" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ah atk"/></marker>
          <marker id="ah-blk" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ah blk"/></marker>
          <marker id="ah-src" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ah src"/></marker>
          <marker id="ah-tgt" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ah tgt"/></marker>
        </defs>
        <g class="lines"></g>
      </svg>
      <div class="corner">
        <button class="ghost" data-ui="debug" title="Debug panel (Alt+Shift+D)">Debug</button>
        <button class="ghost" data-ui="hide" title="Show Endstep's classic UI (Alt+Shift+A)">Classic UI</button>
      </div>
      <div class="mana-wheel"></div>
      <div class="zoom" aria-hidden="true"></div>
      <div class="reveals" aria-live="polite"></div>
      <div class="menu" role="menu"></div>
      <div class="confirm" role="dialog"></div>
      <div class="viewer"></div>
      <div class="banner"></div>
      <div class="toast"></div>
      <div class="classic-chip"></div>`;
    this.bindEvents();
    new ResizeObserver(() => this.layout()).observe(this.el);
  }

  // ---------------------------------------------------------------- public

  update(state: GameState | null): void {
    const prev = this.state;
    this.state = state;
    if (!state) {
      this.el.classList.remove("live");
      return;
    }
    this.el.classList.add("live");
    if (prev?.seq !== state.seq) this.setAwaiting(false);
    this.linked = this.exileLinks.update(prev, state);
    this.knownHands = this.handKnowledge.update(state);

    const key = promptKey(state);
    if (key !== this.modeKey) {
      this.modeKey = key;
      this.mode = deriveMode(state);
      this.peeking = false;
      this.localWheel = null;
      this.abilityPick = null;
      this.hideMenu();
    }
    this.render(prev);
  }

  toast(message: string): void {
    const t = this.q(".toast");
    t.textContent = message;
    t.classList.remove("show");
    void t.offsetWidth;
    t.classList.add("show");
  }

  /** Called when an action went out; buttons stay inert until the server answers. */
  setAwaiting(on: boolean): void {
    this.awaiting = on;
    this.el.classList.toggle("awaiting", on);
    clearTimeout(this.awaitTimer);
    if (on) this.awaitTimer = window.setTimeout(() => this.setAwaiting(false), 2500);
  }

  // ---------------------------------------------------------------- render

  private zones(state: GameState): Zones {
    const me = state.players.find((p) => p.isViewer) ?? state.players[0] ?? null;
    const opponents = state.players.filter((p) => p !== me);
    if (!this.focusedOpp || !opponents.some((o) => o.id === this.focusedOpp)) {
      // Prefer the opponent whose turn it is, else the first one still in the game.
      this.focusedOpp = (opponents.find((o) => o.id === state.activePlayerId) ?? opponents.find((o) => !o.hasLost) ?? opponents[0])?.id ?? null;
    }
    const opp = opponents.find((o) => o.id === this.focusedOpp) ?? null;
    return { me, opp, others: opponents.filter((o) => o !== opp) };
  }

  private render(prev: GameState | null): void {
    const state = this.state!;
    const z = this.zones(state);
    const classic = this.mode.kind === "classic" && this.classicDismissedFor !== this.modeKey;
    this.el.classList.toggle("classic", classic);
    this.renderClassicChip(classic);

    // FLIP "first": where every card is before this update.
    const first = new Map<string, DOMRect>();
    if (!reducedMotion()) {
      for (const [id, el] of this.cardEls) if (el.isConnected && el.getClientRects().length) first.set(id, el.getBoundingClientRect());
    }

    this.used.clear();
    this.cardData.clear();
    for (const p of state.players) {
      for (const zone of [p.battlefield, p.graveyard, p.exile, p.commandZone, p.effects, p.libraryTop, p.hand ?? []]) {
        for (const c of zone) this.cardData.set(c.id, c);
      }
    }
    for (const c of state.pending?.optionCards ?? []) if (!this.cardData.has(c.id)) this.cardData.set(c.id, c);

    this.linkEffects(state);
    this.held.clear();
    for (const [id, host] of this.linked) {
      const c = this.cardData.get(id);
      if (c) this.held.set(host, [...(this.held.get(host) ?? []), c]);
    }

    // Auras/equipment render tucked behind their host, whoever controls them.
    // The link can come from either side, so fill in the host's list from `attachedToId` too.
    const attachedTo = new Map<string, string>();
    const onBattlefield = new Map(state.players.flatMap((p) => p.battlefield.map((c) => [c.id, c] as const)));
    for (const c of onBattlefield.values()) for (const a of c.attachmentIds) attachedTo.set(a, c.id);
    for (const c of onBattlefield.values()) {
      const host = c.attachedToId ? onBattlefield.get(c.attachedToId) : undefined;
      if (!host || attachedTo.has(c.id)) continue;
      attachedTo.set(c.id, host.id);
      host.attachmentIds.push(c.id);
    }
    this.renderBattlefield(this.q(".side.me"), z.me, attachedTo);
    this.renderBattlefield(this.q(".side.opp"), z.opp, attachedTo);
    this.renderHand(z.me);
    this.renderSideHand(state);
    this.renderOppHand(z.opp);
    this.renderStack(state.stack, z.me?.id);
    this.renderPiles(this.q(".me-piles"), z.me);
    this.renderPiles(this.q(".opp-piles"), z.opp);

    // Drop elements for cards that left every rendered zone (library, hidden…).
    for (const [id, el] of this.cardEls) if (!this.used.has(id)) { el.remove(); this.cardEls.delete(id); }
    for (const [id, el] of this.slotEls) if (!this.used.has(`slot:${id}`)) { el.remove(); this.slotEls.delete(id); }

    this.renderPlate(this.q(".me-plate"), this.q(".me-life"), z.me, state);
    this.renderPlate(this.q(".opp-plate"), this.q(".opp-life"), z.opp, state);
    this.renderManaPool(this.q(".me-mana"), z.me);
    this.renderManaPool(this.q(".opp-mana"), z.opp);
    this.renderOppTiles(z.others, state);
    this.applyStateClasses(state);
    this.renderPhase(state, prev);
    this.renderPrompt(state);
    this.renderDock(state);
    this.renderReveals(state);
    this.layout();
    this.renderManaWheel(state);

    // FLIP "last/invert/play" for cards that moved.
    if (first.size) {
      for (const [id, el] of this.cardEls) {
        const a = first.get(id);
        if (!a) {
          if (prev) el.animate([{ opacity: 0, scale: "0.85" }, { opacity: 1, scale: "1" }], { duration: 220, easing: "ease-out" });
          continue;
        }
        if (!el.getClientRects().length) continue;
        const b = el.getBoundingClientRect();
        const dx = a.left + a.width / 2 - (b.left + b.width / 2);
        const dy = a.top + a.height / 2 - (b.top + b.height / 2);
        if (Math.abs(dx) + Math.abs(dy) < 3) continue;
        el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    }
    this.scheduleArrows();
    if (this.q(".viewer").classList.contains("open")) this.refreshViewer();
  }

  private card(c: CardView, showStats: boolean): HTMLElement {
    let el = this.cardEls.get(c.id);
    if (!el) {
      el = createCardEl(c.id);
      this.cardEls.set(c.id, el);
    }
    updateCardEl(el, c, showStats);
    this.used.add(c.id);
    return el;
  }

  private renderBattlefield(side: HTMLElement, player: PlayerView | null, attachedTo: Map<string, string>): void {
    const front: HTMLElement[] = [];
    const back: HTMLElement[] = [];
    const cards = player?.battlefield ?? [];

    const lands: HTMLElement[] = [];
    const fullCards: HTMLElement[] = [];
    // Identical permanents (same card, stats, tapped state, sickness…) share one
    // slot, fanned so each card can still be clicked on its own.
    const units = new Map<string, CardView[]>();
    for (const c of cards) {
      if (attachedTo.has(c.id)) continue;
      const key = (this.held.has(c.id) ? null : groupKey(c, this.localState(c.id), this.effectsByCard.get(c.id)?.length ?? 0)) ?? c.id;
      const unit = units.get(key);
      if (unit) unit.push(c);
      else units.set(key, [c]);
    }
    for (const [key, unit] of units) {
      const c = unit[0]!;
      const slotKey = unit.length > 1 ? `grp:${key}` : c.id;
      let slot = this.slotEls.get(slotKey);
      if (!slot) {
        slot = document.createElement("div");
        slot.className = "slot";
        this.slotEls.set(slotKey, slot);
      }
      this.used.add(`slot:${slotKey}`);
      slot.dataset.host = c.id;
      slot.dataset.members = unit.map((u) => u.id).join(",");
      slot.classList.toggle("group", unit.length > 1);
      if (unit.length > 1) {
        slot.dataset.count = `×${unit.length}`;
        slot.style.setProperty("--gn", String(unit.length));
        slot.style.setProperty("--atts", "0");
        slot.style.setProperty("--held", "0");
        slot.classList.remove("holds");
        // Stacked vertically: each card behind shows its bottom strip (with its power/toughness).
        const els = unit.map((u, i) => {
          const el = this.card(u, true);
          el.style.removeProperty("--att");
          el.style.setProperty("--gi", String(i));
          return el;
        });
        reconcile(slot, els);
      } else {
        delete slot.dataset.count;
        slot.style.removeProperty("--gn");
        const attached = c.attachmentIds.map((a) => this.cardData.get(a)).filter((a): a is CardView => !!a);
        // Exiled cards it holds lie under everything, turned sideways and greyed (see .linked).
        const held = (this.held.get(c.id) ?? []).map((h, i) => {
          const el = this.card(h, false);
          el.classList.add("linked");
          el.style.setProperty("--li", String(i));
          el.style.removeProperty("--att");
          return el;
        });
        const children = [...attached.map((a) => this.card(a, true)), this.card(c, true)];
        for (const el of children) el.style.removeProperty("--gi");
        attached.forEach((_, i) => children[i]!.style.setProperty("--att", String(attached.length - i)));
        children[children.length - 1]!.style.removeProperty("--att");
        slot.style.setProperty("--atts", String(attached.length));
        slot.style.setProperty("--held", String(held.length));
        slot.classList.toggle("holds", held.length > 0);
        reconcile(slot, [...held, ...children]);
      }
      // Creature wins over everything (land creatures, enchantment creatures, creature Sagas…),
      // then land, then Sagas/Classes/planeswalkers, then the rest.
      const full = isFullCard(c);
      slot.classList.toggle("full", full);
      if (isFrontRow(c)) front.push(slot);
      else if (isLand(c)) lands.push(slot);
      else if (full) fullCards.push(slot);
      else back.push(slot);
    }
    // Creatures in front; behind them, lands on the left, other permanents on the right, and
    // Sagas, Classes and planeswalkers (whole cards) right after those.
    reconcile(side.querySelector(".row.front")!, front);
    reconcile(side.querySelector(".cluster.full")!, fullCards);
    reconcile(side.querySelector(".cluster.lands")!, lands);
    reconcile(side.querySelector(".cluster.others")!, back);
  }

  private renderHand(me: PlayerView | null): void {
    const hand = me?.hand ?? [];
    // The player's own order (cards dragged sideways within the hand); new cards join on the right.
    const byId = new Map(hand.map((c) => [c.id, c]));
    this.handOrder = [...this.handOrder.filter((id) => byId.has(id)), ...hand.map((c) => c.id).filter((id) => !this.handOrder.includes(id))];
    const els = this.handOrder.map((id) => this.card(byId.get(id)!, false));
    reconcile(this.q(".my-hand"), els);
  }

  /** Cards playable from outside the hand (flashback, escape, exile, top of library…). */
  private renderSideHand(state: GameState): void {
    const playable = state.pending?.type === "PRIORITY" ? state.pending.playable : [];
    const els: HTMLElement[] = [];
    this.sideIds.clear();
    for (const opt of playable) {
      const from = this.offHandZone(state, opt.cardId);
      const c = this.cardData.get(opt.cardId);
      if (!from || !c) continue;
      this.sideIds.add(c.id);
      const el = this.card(c, false);
      el.dataset.from = from;
      els.push(el);
    }
    // Cards that were in the side hand lose their zone tag when they leave it.
    for (const el of this.q(".side-hand").children) if (!els.includes(el as HTMLElement)) delete (el as HTMLElement).dataset.from;
    reconcile(this.q(".side-hand"), els);
  }

  /**
   * Endstep's effects only name their source card (effectSourceName). Attach each
   * to a card of that name: the owner's permanent first, then anyone's, then the
   * owner's graveyard/exile; if none is visible, it goes on the player's plate.
   */
  private linkEffects(state: GameState): void {
    this.effectsByCard.clear();
    this.looseEffects.clear();
    for (const p of state.players) {
      for (const fx of p.effects) {
        const name = fx.effectSourceName;
        const named = (cards: CardView[]) => (name ? cards.find((c) => c.name === name) : undefined);
        const source = named(p.battlefield) ?? state.players.map((o) => named(o.battlefield)).find(Boolean) ?? named(p.graveyard) ?? named(p.exile);
        const bucket = source ? this.effectsByCard : this.looseEffects;
        const key = source?.id ?? p.id;
        bucket.set(key, [...(bucket.get(key) ?? []), fx]);
      }
    }
  }

  /** What the player is doing with a card in the current prompt (not yet sent to Endstep). */
  private localState(id: string): string {
    const m = this.mode;
    if (m.kind === "attackers" && m.assignments.has(id)) return `attack:${m.assignments.get(id)}`;
    if (m.kind === "blockers" && m.assignments.has(id)) return `block:${m.assignments.get(id)}`;
    if (m.kind === "blockers" && m.selectedBlocker === id) return "blocker";
    if ((m.kind === "targets" || m.kind === "cards") && m.selected.includes(id)) return "selected";
    return "";
  }

  /** A ✦ on the card (✦2, ✦3… for several); hover shows the effects' text. */
  private markEffects(el: HTMLElement, effects: CardView[]): void {
    const mark = el.querySelector<HTMLElement>(".fx-mark");
    if (!mark) return;
    const text = effects.length ? `✦${effects.length > 1 ? effects.length : ""}` : "";
    const title = effects.map(effectText).join("\n");
    if (mark.textContent !== text) mark.textContent = text;
    if (mark.title !== title) mark.title = title;
    el.classList.toggle("has-fx", effects.length > 0);
  }

  private offHandZone(state: GameState, id: string): string | null {
    for (const p of state.players) {
      if (p.graveyard.some((c) => c.id === id)) return "Graveyard";
      if (p.exile.some((c) => c.id === id)) return "Exile";
      if (p.commandZone.some((c) => c.id === id)) return "Command";
      if (p.effects.some((c) => c.id === id)) return "Effect";
      if (p.libraryTop.some((c) => c.id === id)) return "Library";
    }
    return null;
  }

  /**
   * The opponent's hand: a back for each card you don't know, and the ones you've seen face up
   * with an eye mark, for as long as they're still there (see HandKnowledge). Endstep lists their
   * hand as placeholders (or just a size); a known card that Endstep lists by its id keeps its
   * place, the others take the place of backs from the right.
   */
  private renderOppHand(opp: PlayerView | null): void {
    const box = this.q(".opp-hand");
    const hand = opp?.hand ?? [];
    const size = Math.min(Math.max(opp?.handSize ?? hand.length, hand.length), 30);
    const known = new Map((opp ? this.knownHands.get(opp.id) ?? [] : []).map((c) => [c.id, c]));
    // Each place in the hand: a card shown face up, or null for a back.
    const places: (CardView | null)[] = hand.map((c) => (!c.faceDown ? c : known.get(c.id) ?? null));
    for (const c of places) if (c) known.delete(c.id);
    while (places.length < size) places.push(null);
    const rest = [...known.values()];
    for (let i = places.length - 1; i >= 0 && rest.length; i--) if (!places[i]) places[i] = rest.shift()!;

    let backs = 0;
    const els = places.map((c) => {
      if (!c) {
        const key = `${opp!.id}:${backs++}`;
        let el = this.backEls.get(key);
        if (!el) {
          el = createBackEl(key);
          this.backEls.set(key, el);
        }
        return el;
      }
      this.cardData.set(c.id, c);
      const el = this.card(c, false);
      el.classList.add("known");
      return el;
    });
    for (const [key, el] of this.backEls) if (!els.includes(el)) { el.remove(); this.backEls.delete(key); }
    reconcile(box, els);
  }

  /** Recent reveals, Arena style: a panel of the revealed cards (big, right-click to enlarge),
      closing with ✕ or on its own after a while (not while the pointer is over it). */
  private renderReveals(state: GameState): void {
    const box = this.q(".reveals");
    const now = Date.now();
    const me = state.players.find((p) => p.isViewer);
    const until = (r: { id: string; at: number }) => this.revealUntil.get(r.id) ?? r.at + REVEAL_MS;
    const shown = state.reveals.filter((r) => !this.dismissedReveals.has(r.id) && now < until(r)).slice(-3);
    const html = shown.map((r) => {
      for (const c of r.cards) this.cardData.set(c.id, c);
      const mine = !!r.playerName && (r.playerName === me?.targetName || r.playerName === me?.name);
      const who = mine ? "You" : r.playerName ?? "A player";
      const n = r.cards.length;
      const what = n === 1 ? r.cards[0]!.name : `${n} cards`;
      const from = r.zone ? ` from ${mine ? "your" : "their"} ${r.zone.toLowerCase().replace(/_/g, " ")}` : "";
      const title = r.toHand ? `${who} revealed ${what}${from}, into ${mine ? "your" : "their"} hand` : `${who} revealed ${what}${from}`;
      return `<section class="reveal" data-reveal="${esc(r.id)}">
        <header><span class="eye" aria-hidden="true">◉</span><b>${esc(title)}</b><button class="x" data-reveal-close="${esc(r.id)}" title="Close">✕</button></header>
        <div class="rcards">${r.cards.map((c) => {
          const url = imageUrl(c, "large");
          return `<div class="rcard" data-zoom="${esc(c.id)}" title="${esc(c.name)}">${url ? `<img src="${esc(url)}" alt="${esc(c.name)}" draggable="false">` : `<span>${esc(c.name)}</span>`}</div>`;
        }).join("")}</div>
      </section>`;
    }).join("");
    if (box.dataset.sig !== html) {
      box.dataset.sig = html;
      box.innerHTML = html;
    }
    // Close each one when its time is up, unless it's being looked at.
    clearTimeout(this.revealTimer);
    if (shown.length) {
      const next = Math.min(...shown.map((r) => until(r) - now));
      this.revealTimer = window.setTimeout(() => {
        if (box.matches(":hover")) for (const r of shown) this.revealUntil.set(r.id, Date.now() + 3000);
        if (this.state) this.render(this.state);
      }, Math.max(200, next));
    }
  }

  private renderStack(stack: StackItemView[], meId: string | undefined): void {
    this.stackEls.clear();
    // stack[0] is the top (Endstep auto-yield checks stack[0]); draw the top last so it sits in front.
    const els = stack.slice().reverse().map((s, i) => {
      const source = s.card ?? (s.sourceCardId ? this.cardData.get(s.sourceCardId) : undefined);
      const card: CardView = {
        ...(source ?? blankCard(s.id, s.name)),
        // A spell keeps its card id, so it animates from the hand onto the stack.
        id: s.isAbility ? `ab:${s.id}` : source?.id ?? s.id,
        name: source?.name ?? s.name,
        tapped: false, isAttacking: false, isBlocking: false,
      };
      this.cardData.set(card.id, card);
      const el = this.card(card, false);
      el.classList.toggle("ability", s.isAbility);
      el.dataset.stackText = s.isAbility ? s.name : "";
      el.dataset.controller = s.controllerId ?? "";
      // 1 = top of the stack, resolves next.
      el.dataset.order = String(stack.length - i);
      el.style.setProperty("--si", String(i));
      el.classList.toggle("mine", !!meId && s.controllerId === meId);
      el.classList.toggle("theirs", !!s.controllerId && s.controllerId !== meId);
      this.stackEls.set(card.id, s);
      return el;
    });
    const box = this.q(".stack");
    reconcile(box, els);
    box.classList.toggle("has-items", stack.length > 0);
    box.dataset.n = String(stack.length);
    box.style.setProperty("--sn", String(stack.length));
    // The arrow tab hides the stack for a clear look at the battlefield, and brings it back.
    // A fresh stack (after it empties) always shows.
    if (!stack.length) this.stackHidden = false;
    const dock = this.q(".stack-dock");
    dock.classList.toggle("has-items", stack.length > 0);
    dock.classList.toggle("collapsed", this.stackHidden);
    const toggle = this.q(".stack-toggle");
    toggle.textContent = this.stackHidden ? `◂ Stack · ${stack.length}` : "▸";
    toggle.title = this.stackHidden ? "Show the stack" : "Hide the stack";
  }

  private renderPiles(box: HTMLElement, player: PlayerView | null): void {
    if (!player) {
      box.innerHTML = "";
      return;
    }
    const piles: HTMLElement[] = [];
    const pile = (zone: string, label: string, count: number | undefined, top?: CardView) => {
      let el = box.querySelector<HTMLElement>(`.pile[data-zone="${zone}"]`);
      if (!el) {
        el = document.createElement("button");
        el.className = "pile";
        el.dataset.zone = zone;
        // Exile is a dark void that draws mist in, the last card lying at its heart. The
        // graveyard shows the cards under its top one lying askew.
        const holder = zone === "exile" ? '<div class="vortex"><div class="mist"></div><div class="mist m2"></div><div class="mist m3"></div><div class="pile-card"></div></div>'
          : zone === "graveyard" ? '<div class="pile-under"></div><div class="pile-card"></div>' : '<div class="pile-card"></div>';
        el.innerHTML = `${holder}<span class="pile-label"></span><span class="pile-count"></span>`;
      }
      el.dataset.player = player.id;
      el.querySelector(".pile-label")!.textContent = label;
      el.querySelector(".pile-count")!.textContent = count === undefined ? "?" : String(count);
      el.classList.toggle("empty", !count);
      // Pile thickness, like a real stack of cards: one fine layer per few cards.
      const thick = Math.min(16, Math.ceil((count ?? 0) / 3));
      el.style.setProperty("--thick", `${thick}px`);
      el.style.setProperty("--edge", pileEdge(thick));
      const under = el.querySelector<HTMLElement>(".pile-under");
      if (under) {
        const below = player.graveyard.slice(-3, -1).reverse();
        const sig = below.map((c) => c.id).join(",");
        if (under.dataset.sig !== sig) {
          under.dataset.sig = sig;
          under.innerHTML = below.map((c, i) => {
            const url = imageUrl(c);
            // A steady tilt per card, so the pile doesn't reshuffle on every update.
            const seed = [...c.id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
            const rot = ((seed % 9) - 4) * (i + 1.4);
            return url ? `<img src="${esc(url)}" alt="" draggable="false" style="--rot: ${rot}deg; --dx: ${(seed % 7) - 3}px; --dy: ${-2 - i * 2}px">` : "";
          }).join("");
        }
      }
      const holder = el.querySelector<HTMLElement>(".pile-card")!;
      // A card shown elsewhere (side hand, or under the permanent holding it) gets a copy here.
      if (top && (this.sideIds.has(top.id) || this.linked.has(top.id))) reconcile(holder, [this.pileCopy(`${player.id}:${zone}`, top)]);
      else if (top) reconcile(holder, [this.card(top, false)]);
      else if (zone === "library") holder.innerHTML = count ? '<div class="card back"><div class="face"></div></div>' : "";
      else holder.replaceChildren();
      piles.push(el);
    };
    pile("library", "Library", player.librarySize);
    pile("graveyard", "Graveyard", player.graveyard.length, player.graveyard.at(-1));
    pile("exile", "Exile", player.exile.length, player.exile.at(-1));
    if (player.commandZone.length) pile("command", "Command", player.commandZone.length, player.commandZone[0]);
    box.classList.toggle("has-cmd", player.commandZone.length > 0);
    reconcile(box, piles);
  }

  /** A static copy of a pile's top card, when the card itself sits in the side hand. */
  private pileCopy(key: string, c: CardView): HTMLElement {
    let el = this.pileTops.get(key);
    if (!el) {
      el = createCardEl(`copy:${c.id}`);
      this.pileTops.set(key, el);
    }
    updateCardEl(el, c, false);
    return el;
  }

  private applyStateClasses(state: GameState): void {
    const mode = this.mode;
    const playable = new Map((state.pending?.type === "PRIORITY" ? state.pending.playable : []).map((p) => [p.cardId, p]));
    const attackingAssigned = mode.kind === "attackers" ? mode.assignments : null;
    const blockAssigned = mode.kind === "blockers" ? mode.assignments : null;
    this.el.classList.toggle("declaring-attacks", mode.kind === "attackers");
    for (const [id, el] of this.cardEls) {
      const c = this.cardData.get(id);
      const selectable = this.isSelectable(id);
      const linked = this.linked.has(id) && !!el.closest(".slot");
      el.classList.toggle("linked", linked);
      if (!linked) el.style.removeProperty("--li");
      el.classList.toggle("tapped", !!c?.tapped && !linked && !!el.closest(".side"));
      el.classList.toggle("sick", !!c?.summoningSick && !c.tapped && !linked && isFrontRow(c) && !!el.closest(".side"));
      this.markEffects(el, this.effectsByCard.get(id) ?? []);
      el.classList.toggle("playable", playable.has(id) && !this.awaiting);
      el.classList.toggle("selectable", selectable);
      el.classList.toggle("selected",
        ((mode.kind === "targets" || mode.kind === "cards") && mode.selected.includes(id)) ||
        (mode.kind === "blockers" && mode.selectedBlocker === id));
      el.classList.toggle("attacking", !!c?.isAttacking || !!attackingAssigned?.has(id));
      el.classList.toggle("blocking", !!c?.isBlocking || !!blockAssigned?.has(id));
    }
    for (const slot of this.slotEls.values()) {
      const c = this.cardData.get(slot.dataset.host ?? "");
      const members = slot.dataset.members?.split(",") ?? [];
      slot.classList.toggle("tapped", !!c?.tapped);
      slot.classList.toggle("attacking", !!c?.isAttacking || members.some((id) => attackingAssigned?.has(id)));
    }
    for (const plate of this.el.querySelectorAll<HTMLElement>("[data-player]")) {
      const id = plate.dataset.player;
      if (!id || plate.classList.contains("pile")) continue;
      const key = playerTargetKey(Number(id));
      plate.classList.toggle("selectable", this.isSelectable(key));
      plate.classList.toggle("selected", (mode.kind === "targets" && mode.selected.includes(key)));
    }
  }

  private isSelectable(key: string): boolean {
    const m = this.mode;
    if (this.awaiting) return false;
    switch (m.kind) {
      case "targets":
      case "cards":
        return m.valid.has(key);
      case "attackers":
        return m.valid.has(key);
      case "blockers":
        return m.validBlockers.has(key) || (!!m.selectedBlocker && m.attackerIds.has(key));
      default:
        return false;
    }
  }

  private renderPlate(el: HTMLElement, orb: HTMLElement, p: PlayerView | null, state: GameState): void {
    if (!p) {
      el.innerHTML = "";
      orb.innerHTML = "";
      delete orb.dataset.life;
      delete orb.dataset.avatar;
      return;
    }
    el.dataset.player = p.id;
    const prev = this.prevLife.get(p.id);
    if (p.life !== undefined) this.prevLife.set(p.id, p.life);
    const hasPrio = state.priorityPlayerId === p.id;
    const active = state.activePlayerId === p.id;
    el.classList.toggle("priority", hasPrio);
    el.classList.toggle("active", active);
    el.classList.toggle("out", p.hasLost || p.hasConceded);
    const extras = [
      p.poison ? `<span class="chip poison" title="Poison">☠ ${p.poison}</span>` : "",
      p.energy ? `<span class="chip energy" title="Energy">⚡ ${p.energy}</span>` : "",
      p.hasMonarch ? '<span class="chip" title="Monarch">♛</span>' : "",
      p.hasInitiative ? '<span class="chip" title="Initiative">Init</span>' : "",
      !p.isViewer ? `<span class="chip" title="Cards in hand">✋ ${p.handSize ?? "?"}</span>` : "",
      ...(this.looseEffects.get(p.id) ?? []).map((fx) => `<span class="chip fx" title="${esc(effectText(fx))}">✦ ${esc(fx.effectSourceName || fx.name)}</span>`),
    ].join("");
    // The corner keeps just the name (and status chips).
    const sig = JSON.stringify([p.name, extras, hasPrio]);
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      el.innerHTML = `
        <div class="pname">${esc(p.name)}</div>
        <div class="chips">${extras}</div>`;
    }

    // The life total sits on the table, just above the player's cards, with the avatar on it.
    orb.dataset.player = p.id;
    orb.classList.toggle("priority", hasPrio);
    orb.classList.toggle("out", p.hasLost || p.hasConceded);
    // The player's Endstep avatar (framed as they chose); without one, their commander's art; and
    // under either, Endstep's logo, which shows if there's no picture or it can't load.
    const avatar = avatarPicture(p.username, () => this.state && this.render(this.state));
    const commander = p.commandZone[0];
    const art = commander ? imageUrl(commander, "art_crop") : null;
    const pic = avatar ?? (art ? { url: art, size: "cover", position: "50% 30%" } : null);
    const avatarSig = JSON.stringify([pic, p.name]);
    if (orb.dataset.avatar !== avatarSig) {
      orb.dataset.avatar = avatarSig;
      orb.querySelector(".avatar")?.remove();
      const style = pic ? `background-image: url(&quot;${esc(pic.url)}&quot;); background-size: ${esc(pic.size)}; background-position: ${esc(pic.position)}` : "";
      orb.insertAdjacentHTML("afterbegin", `<div class="avatar" title="${esc(p.name)}">${ENDSTEP_LOGO}${pic ? `<div class="pic" style="${style}"></div>` : ""}</div>`);
    }
    const life = String(p.life ?? "–");
    if (orb.dataset.life !== life) {
      orb.dataset.life = life;
      orb.querySelector(".lnum")?.remove();
      orb.insertAdjacentHTML("beforeend", `<span class="lnum" title="${esc(p.name)}'s life">${life}</span>`);
    }
    if (prev !== undefined && p.life !== undefined && prev !== p.life) this.lifeFloat(orb, p.life - prev);
  }

  private lifeFloat(plate: HTMLElement, delta: number): void {
    const f = document.createElement("div");
    f.className = `life-float ${delta < 0 ? "loss" : "gain"}`;
    f.textContent = delta > 0 ? `+${delta}` : String(delta);
    plate.appendChild(f);
    f.addEventListener("animationend", () => f.remove());
    plate.classList.remove("hit", "heal");
    void plate.offsetWidth;
    plate.classList.add(delta < 0 ? "hit" : "heal");
  }

  /** Floating mana, between the player's piles and their turn bar. While you pay a cost, your
      floating mana can be clicked to spend it. */
  private renderManaPool(el: HTMLElement, p: PlayerView | null): void {
    const m = this.mode;
    // While paying, spend from what the payment offers (Endstep's pay panel does the same);
    // clicks are ignored while an action is on its way, without redrawing the pips.
    const payable = !!p?.isViewer && m.kind === "cards" && m.mana;
    const pool = payable && this.state?.pending?.floatingMana ? this.state.pending.floatingMana : p?.manaPool;
    const html = p ? manaPoolPips(pool, payable) : "";
    if (el.dataset.sig === html) return;
    el.dataset.sig = html;
    el.innerHTML = html;
    // Without the symbol image, the pip still shows its color and amount.
    for (const img of el.querySelectorAll("img")) img.addEventListener("error", () => img.remove(), { once: true });
  }

  private renderOppTiles(others: PlayerView[], state: GameState): void {
    const box = this.q(".opp-tiles");
    box.innerHTML = others
      .map((o) => `<button class="tile${state.priorityPlayerId === o.id ? " priority" : ""}${state.activePlayerId === o.id ? " active" : ""}" data-focus="${o.id}" data-player="${o.id}">
          <span class="tname">${esc(o.name)}</span><span class="tlife">${o.life ?? "–"}</span></button>`)
      .join("");
  }

  /**
   * Two turn tracks, the opponent's above yours. The active player's track
   * lights the current step; every step is a toggleable stop (a dot means the
   * game gives you priority there).
   */
  private renderPhase(state: GameState, prev: GameState | null): void {
    const me = state.players.find((p) => p.isViewer);
    const myTurn = !!me && state.activePlayerId === me.id;
    const active = state.players.find((p) => p.id === state.activePlayerId);
    const step = currentStep(state.phase, state.step);
    const idx = stepIndex(step);
    const stops = this.hooks.phaseStops();
    // Each player's turn track runs along their life badge, Arena style: beginning
    // and main 1 on the left, main 2 and end on the right, and combat wrapped
    // around the life total itself (its first half left of it, the rest right).
    const pips = (side: StopSide, isActive: boolean, keys: string[]) => keys.map((key) => {
      const s = TURN_STEPS[stepIndex(key)]!;
      const stop = stops[side].has(s.key);
      const cls = ["pip", stop ? "stop" : "", isActive && s.key === step ? "on" : "", isActive && idx >= 0 && stepIndex(key) < idx ? "past" : ""].filter(Boolean).join(" ");
      const tip = `${s.label}: ${stop ? "stop here" : "skip"} on ${side === "myTurn" ? "your" : "their"} turn (click to change)`;
      return `<button class="${cls}" data-stop="${side}:${s.key}" title="${esc(tip)}">${esc(s.label)}</button>`;
    }).join("");
    const group = (cls: string, side: StopSide, isActive: boolean, keys: string[]) => `<span class="pgroup ${cls}">${pips(side, isActive, keys)}</span>`;
    const track = (bar: HTMLElement, side: StopSide, isActive: boolean) => {
      const left = group("beginning", side, isActive, ["UPKEEP", "DRAW"]) + group("main", side, isActive, ["MAIN1"]) +
        group("combat", side, isActive, ["BEGIN_COMBAT", "DECLARE_ATTACKERS", "DECLARE_BLOCKERS"]);
      const right = group("combat", side, isActive, ["FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "END_COMBAT"]) +
        group("main", side, isActive, ["MAIN2"]) + group("ending", side, isActive, ["END_STEP", "CLEANUP"]);
      bar.classList.toggle("active", isActive);
      bar.classList.toggle("in-combat", isActive && TURN_STEPS[idx]?.group === "combat");
      for (const [half, html] of [[bar.querySelector<HTMLElement>(".track-half.left")!, left], [bar.querySelector<HTMLElement>(".track-half.right")!, right]] as const) {
        if (half.dataset.sig !== html) {
          half.dataset.sig = html;
          half.innerHTML = html;
        }
      }
    };
    track(this.q(".opp-bar"), "oppTurn", !myTurn);
    track(this.q(".me-bar"), "myTurn", myTurn);
    const label = this.q(".turn-label");
    const labelHtml = `<b>Turn ${state.turnNumber ?? "–"}</b><span>${esc(stepLabel(step))}</span>`;
    if (label.innerHTML !== labelHtml) label.innerHTML = labelHtml;

    if (prev && this.prevActive !== state.activePlayerId && state.activePlayerId !== undefined) {
      this.banner(myTurn ? "Your turn" : `${active?.name ?? "Opponent"}'s turn`, myTurn ? "mine" : "theirs");
    }
    if (prev && this.prevPhase !== state.phase && state.phase === "DECLARE_ATTACKERS" && myTurn && state.pending?.type === "DECLARE_ATTACKERS") {
      this.banner("Declare attackers", "combat");
    }
    this.prevActive = state.activePlayerId;
    this.prevPhase = state.phase;

    if (state.status === "COMPLETE") {
      const won = state.winnerId !== undefined && state.winnerId === me?.id;
      this.banner(state.winnerId === undefined ? "Game over" : won ? "Victory" : "Defeat", won ? "mine" : "theirs", true);
    }
  }

  private banner(text: string, kind: string, sticky = false): void {
    const b = this.q(".banner");
    if (b.dataset.text === text && sticky) return;
    b.dataset.text = text;
    b.className = `banner ${kind}`;
    b.innerHTML = `<span>${esc(text)}</span>${sticky ? '<button class="ghost" data-ui="hide">Back to Endstep</button>' : ""}`;
    void b.offsetWidth;
    b.classList.add(sticky ? "sticky" : "show");
  }

  private renderPrompt(state: GameState): void {
    const p = state.pending;
    const box = this.q(".prompt");
    const m = this.mode;
    let html = "";
    let controls = "";
    // Choices (mulligan, modes, trigger order, yes/no, cards to pick…) take the whole screen,
    // Arena style: a title, the options, and big buttons. Attack defenders stay a small box.
    let arena = false;
    const pick = this.abilityPick;
    if (pick && (!p || p.type === "PRIORITY")) {
      // A permanent's abilities, one card each (Arena's Choose One); picking one activates it.
      const src = this.cardData.get(pick.cardId);
      controls = `<div class="acards" style="--n: ${pick.abilities.length}">${pick.abilities.map((a) => {
        const text = a.cost && !a.description.includes(a.cost) ? `${a.cost}: ${a.description}` : a.description;
        return this.abilityCard(src, src?.name ?? "", text, `data-ability="${a.index}"`, false);
      }).join("")}</div>
        <div class="choices big"><button class="opt primary" data-ui="ability-cancel">Cancel</button></div>`;
      arena = true;
      html = `<div class="phead"><h2>Choose One</h2><p>Click an option below to select it.</p></div>${controls}
        <button class="peek-btn" data-ui="peek"><span class="p-view">View battlefield</span><span class="p-back">Back to choice</span></button>`;
    } else if (p && p.type !== "PRIORITY") {
      const source = p.sourceCardName ? `<span class="src">${esc(p.sourceCardName)}</span>` : "";
      controls = this.choiceControls(state);
      arena = !!controls && m.kind !== "attackers";
      if (!arena) {
        // The status line: costs drawn as mana symbols, and a small picture of the card it's
        // about (the spell being paid for, the trigger choosing targets…) on its left.
        const src = p.sourceCardId || p.sourceCardName ? this.sourceCard(p) : undefined;
        const url = src ? imageUrl(src) : null;
        const thumb = src && url ? `<div class="pthumb" data-zoom="${esc(src.id)}" title="${esc(src.name)}"><img src="${esc(url)}" alt="" draggable="false"></div>` : "";
        // With the card's picture there, its name label above the message is redundant.
        html = `<div class="pline">${thumb}<div class="msg">${thumb ? "" : source}${withSymbols(esc(p.message ?? defaultMessage(p.type, m)))}</div></div>` + controls;
      } else {
        const { title, sub } = promptTitle(state, m);
        // A question from a card (a trigger's yes/no, a color, a number…) shows that card beside
        // the options. Modes, orders and pickers show their own cards.
        const own = m.kind === "order" || p.type === "MULLIGAN" || p.type === "CHOOSE_MODE" || p.type === "CHOOSE_ABILITY";
        const srcCard = own ? undefined : this.sourceCard(p);
        const url = srcCard ? imageUrl(srcCard) : null;
        // Scry/surveil show the card that did it on the right, as Arena does.
        const body = srcCard && url
          ? `<div class="pwrap${m.kind === "arrange" || controls.startsWith('<div class="fan') ? " src-right" : ""}"><div class="pcard" data-zoom="${esc(srcCard.id)}"><img src="${esc(url)}" alt="${esc(srcCard.name)}" draggable="false"></div><div class="pbody">${controls}</div></div>`
          : controls;
        html = `<div class="phead"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div>${body}
          <button class="peek-btn" data-ui="peek"><span class="p-view">View battlefield</span><span class="p-back">Back to choice</span></button>`;
      }
    } else if (!p && state.status !== "COMPLETE") {
      html = `<div class="msg dim">Waiting for opponent…</div>`;
    }
    // Never rebuild the order box under a tile being dragged. Reordering the same box only
    // moves its tiles, so the list doesn't jump (or replay its entrance) on every move.
    if (box.dataset.sig !== html && !this.orderDrag?.active && !this.arrDrag?.active) {
      box.dataset.sig = html;
      const sameBox = m.kind === "order" && box.dataset.orderKey === this.modeKey && this.patchOrderBox(box, m);
      if (!sameBox) box.innerHTML = html;
      if (m.kind === "order") box.dataset.orderKey = this.modeKey;
      else delete box.dataset.orderKey;
    }
    box.classList.toggle("show", html !== "");
    box.classList.toggle("center", controls !== "");
    box.classList.toggle("arena", arena);
    box.classList.toggle("peek", arena && this.peeking);
    // The action buttons (Done, Cancel for a card picker) stay above a full-screen choice.
    this.el.classList.toggle("arena-open", arena && !this.peeking);
  }

  /** One option as an Arena ability card: the source card's art, an "Ability" band, the text (mana
      symbols drawn), and a loyalty cost in a shield at the bottom, as on a planeswalker. */
  private abilityCard(src: CardView | undefined, name: string, description: string, attrs: string, on: boolean): string {
    const url = src ? imageUrl(src, "large") : null;
    const cost = /^\s*([+−–-]?\s*(?:\d+|X))\s*:\s*/.exec(description);
    const text = cost ? description.slice(cost[0].length) : description;
    return `<button class="acard${on ? " on" : ""}" ${attrs}>
      <div class="aart">${url ? `<img src="${esc(url)}" alt="" draggable="false">` : ""}</div>
      <div class="aname">${esc(name)}</div>
      <div class="aband">Ability</div>
      <div class="atext">${withSymbols(esc(text))}</div>
      ${cost ? `<b class="acost">${esc(cost[1]!.replace(/\s|−|–/g, (ch) => (ch.trim() ? "-" : "")))}</b>` : ""}
    </button>`;
  }

  /** Scry/surveil in two piles, Arena style: the other pile (graveyard or bottom) on the left,
      the top of the library on the right (leftmost = next card). Click a card to move it
      across, or drag it (also to reorder). Other arrangements are one ordered row. */
  private arrangeBox(m: Extract<Mode, { kind: "arrange" }>): string {
    const tile = (id: string, i: number, top: boolean) => {
      const c = this.cardData.get(id);
      const url = c ? imageUrl(c, "large") : null;
      const tag = top ? (i === 0 ? "Next" : String(i + 1)) : "";
      return `<button class="arr-card" data-arr="${esc(id)}" data-zoom="${esc(id)}" style="--i: ${i}">
        ${url ? `<img src="${esc(url)}" alt="${esc(c?.name ?? "")}" draggable="false">` : `<span>${esc(c?.name ?? id)}</span>`}
        ${tag ? `<b class="arr-tag">${tag}</b>` : ""}</button>`;
    };
    const zone = (key: "top" | "tray", label: string, ids: string[]) => `<section class="arr-zone" data-zone="${key}">
      <h3>${esc(label)}</h3>
      <div class="arr-row" style="--n: ${Math.max(1, ids.length)}">${ids.map((id, i) => tile(id, i, key === "top")).join("") || '<div class="arr-empty">Drag cards here</div>'}</div>
    </section>`;
    const trayLabel = m.context === "surveil" ? "Graveyard" : "Bottom of Library";
    const topLabel = m.hasTray ? (m.context === "surveil" ? "Library" : "Top of Library") : m.context === "library_top" ? "Top of Library" : "Order";
    return `<div class="arrange${m.hasTray ? " two" : ""}">
        ${m.hasTray ? zone("tray", trayLabel, m.tray) : ""}${zone("top", topLabel, m.top)}
      </div>
      <div class="choices big"><button class="opt primary" data-arrange-done>Done</button></div>`;
  }

  /** Arena's card fan: cards spread in an arc, with a slider under it when they don't all fit.
      `key` keeps the scroll position across redraws. Laid out by layoutFans(). */
  private fanHtml(key: string, cards: CardView[], attrs: (c: CardView) => string, cls: (c: CardView) => string): string {
    for (const c of cards) if (!this.cardData.has(c.id)) this.cardData.set(c.id, c);
    const tiles = cards.map((c, i) => {
      const url = imageUrl(c, "large");
      return `<button class="fcard ${cls(c)}" data-fi="${i}" data-zoom="${esc(c.id)}" ${attrs(c)}>
        <div class="fimg">${url ? `<img src="${esc(url)}" alt="${esc(c.name)}" draggable="false">` : `<span>${esc(c.name)}</span>`}</div></button>`;
    }).join("");
    return `<div class="fan" data-fan="${esc(key)}" data-n="${cards.length}">
      <div class="fan-cards">${tiles || '<p class="muted">No cards</p>'}</div>
      <div class="fan-slider" data-fan-slider><div class="fan-thumb">◂ ▸</div></div>
    </div>`;
  }

  /** Places every fan's cards along its arc around the scroll position, and its slider thumb. */
  private layoutFans(): void {
    for (const fan of this.el.querySelectorAll<HTMLElement>(".fan[data-fan]")) {
      const cards = [...fan.querySelectorAll<HTMLElement>(".fcard")];
      const n = cards.length;
      const width = fan.clientWidth;
      const cw = cards[0]?.offsetWidth ?? 0;
      if (!n || !width || !cw) continue;
      // Cards overlap to ~62% of their width; as many as fit are shown, the rest scroll in.
      const step = cw * 0.62;
      const half = Math.max(1, Math.floor((width - cw) / 2 / step));
      const scrolls = n > half * 2 + 1;
      const min = scrolls ? half : (n - 1) / 2;
      const max = scrolls ? n - 1 - half : (n - 1) / 2;
      const key = fan.dataset.fan!;
      const pos = Math.max(min, Math.min(max, this.fanPos.get(key) ?? min));
      this.fanPos.set(key, pos);
      fan.classList.toggle("static", !scrolls);
      cards.forEach((c, i) => {
        const d = i - pos;
        const out = Math.abs(d) > half + 0.5;
        c.style.transform = `translateX(${(d * step).toFixed(1)}px) translateY(${(d * d * cw * 0.03).toFixed(1)}px) rotate(${(d * 3.2).toFixed(2)}deg)`;
        // Each card lies on the one to its left, so every name (top left) stays readable.
        c.style.zIndex = String(i + 1);
        c.style.opacity = out ? "0" : "1";
        c.style.pointerEvents = out ? "none" : "";
      });
      fan.dataset.min = String(min);
      fan.dataset.max = String(max);
      const track = fan.querySelector<HTMLElement>(".fan-slider");
      const thumb = fan.querySelector<HTMLElement>(".fan-thumb");
      if (track && thumb && scrolls) thumb.style.left = `${((pos - min) / (max - min)) * (track.clientWidth - thumb.offsetWidth)}px`;
    }
  }

  /** Moves a fan so its slider thumb is centered at `x`. */
  private slideFanTo(fan: HTMLElement, x: number): void {
    const track = fan.querySelector<HTMLElement>(".fan-slider");
    const thumb = fan.querySelector<HTMLElement>(".fan-thumb");
    if (!track || !thumb) return;
    const r = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (x - r.left - thumb.offsetWidth / 2) / Math.max(1, r.width - thumb.offsetWidth)));
    const min = Number(fan.dataset.min ?? 0);
    const max = Number(fan.dataset.max ?? 0);
    this.scrollFan(fan, 0, min + frac * (max - min));
  }

  /** Scrolls a fan by `delta` cards (or to `to`), then lays it out again. */
  private scrollFan(fan: HTMLElement, delta: number, to?: number): void {
    const key = fan.dataset.fan!;
    this.fanPos.set(key, to ?? (this.fanPos.get(key) ?? 0) + delta);
    this.layoutFans();
  }

  /** The color wheel on the card making mana: for a CHOOSE_MANA prompt, or a dual land clicked. */
  private renderManaWheel(state: GameState): void {
    const box = this.q(".mana-wheel");
    const p = state.pending;
    const fromPrompt = !this.localWheel && p?.type === "CHOOSE_MANA" && !this.awaiting ? wheelFromStrings(p.stringOptions) : null;
    const options = this.localWheel?.options ?? fromPrompt;
    const cardId = this.localWheel?.cardId ?? p?.sourceCardId;
    if (!options) {
      box.classList.remove("show");
      delete box.dataset.sig;
      return;
    }
    const sig = JSON.stringify([cardId, options.map((o) => o.key)]);
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = wheelSvg(options);
    }
    box.dataset.card = cardId ?? "";
    box.classList.add("show");
    this.placeManaWheel();
  }

  /** Centers the wheel on its card (or the middle of the table when the card isn't on it), kept
      on screen. Runs again whenever the table is laid out, as the card may have moved. */
  private placeManaWheel(): void {
    const box = this.q(".mana-wheel");
    if (!box.classList.contains("show")) return;
    const b = this.el.getBoundingClientRect();
    const anchor = box.dataset.card ? this.cardEls.get(box.dataset.card) : undefined;
    const r = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    const w = box.offsetWidth || 164;
    const cx = r ? r.left + r.width / 2 - b.left : b.width / 2;
    const cy = r ? r.top + r.height / 2 - b.top : b.height / 2;
    box.style.left = `${Math.round(Math.max(8, Math.min(b.width - w - 8, cx - w / 2)))}px`;
    box.style.top = `${Math.round(Math.max(8, Math.min(b.height - w - 8, cy - w / 2)))}px`;
  }

  /** The card a prompt comes from (on the table, or just by name). */
  private sourceCard(p: PendingActionView): CardView | undefined {
    const c = (p.sourceCardId ? this.cardData.get(p.sourceCardId) : undefined) ?? (p.sourceCardName ? blankCard(`src:${p.sourceCardName}`, p.sourceCardName) : undefined);
    if (c && !this.cardData.has(c.id)) this.cardData.set(c.id, c);
    return c;
  }

  /** Arena-style box for putting triggers (or attackers/blockers) in order: a row of tiles,
      leftmost first, moved by dragging or with the arrows; optional triggers can be declined. */
  private orderBox(p: PendingActionView, m: Extract<Mode, { kind: "order" }>): string {
    const abilities = p.type === "ORDER_ABILITIES";
    const byId = new Map(p.orderOptions.map((o) => [o.id, o]));
    const allDeclinable = abilities && p.orderOptions.length > 0 && p.orderOptions.every((o) => o.declinable);
    const tiles = m.order.map((id, i) => {
      const o = byId.get(id);
      const declined = m.declined.includes(id);
      // The art comes from the card that triggered (or the attacker/blocker itself).
      const card = this.cardData.get(o?.sourceCardId ?? id) ?? (o ? blankCard(`src:${o.name}`, o.name) : undefined);
      const url = card ? imageUrl(card, "large") : null;
      return `<div class="otile${declined ? " declined" : ""}" data-order-id="${esc(id)}">
        <div class="oart">${url ? `<img src="${esc(url)}" alt="" draggable="false">` : ""}</div>
        <b class="onum">${declined ? "–" : i + 1}</b>
        <div class="oname">${esc(o?.name ?? card?.name ?? id)}</div>
        ${abilities ? `<div class="aband">${o?.declinable ? "Optional" : "Ability"}</div>` : ""}
        ${o?.description ? `<div class="otext">${esc(o.description)}</div>` : ""}
        <div class="omove">
          <button class="ghost" data-order-move="-1" data-order-for="${esc(id)}" ${i === 0 ? "disabled" : ""} title="Earlier">◂</button>
          ${o?.declinable ? `<button class="ghost" data-order-decline="${esc(id)}">${declined ? "Use" : "Skip"}</button>` : ""}
          <button class="ghost" data-order-move="1" data-order-for="${esc(id)}" ${i === m.order.length - 1 ? "disabled" : ""} title="Later">▸</button>
        </div>
      </div>`;
    }).join("");
    return `<div class="order-box">
      <div class="order-row" style="--n: ${m.order.length}">${tiles}</div>
      <div class="order-legend"><span>◂ ${abilities ? "Resolves first" : "First"}</span><span>drag to reorder</span><span>${abilities ? "Resolves last" : "Last"} ▸</span></div>
      <div class="choices big">
        ${allDeclinable ? '<button class="opt alt" data-order-skip>Skip all</button>' : ""}
        <button class="opt primary" data-order-confirm>Done</button>
      </div>
    </div>`;
  }

  /** Puts the order box's existing tiles in the mode's order and refreshes their numbers and
      buttons. Returns false when the tiles don't match (then the box is rebuilt). */
  private patchOrderBox(box: HTMLElement, m: Extract<Mode, { kind: "order" }>): boolean {
    const row = box.querySelector<HTMLElement>(".order-row");
    if (!row) return false;
    const tiles = new Map(([...row.children] as HTMLElement[]).map((t) => [t.dataset.orderId ?? "", t]));
    if (tiles.size !== m.order.length || !m.order.every((id) => tiles.has(id))) return false;
    const scroll = row.scrollLeft;
    m.order.forEach((id, i) => {
      const t = tiles.get(id)!;
      row.appendChild(t);
      const declined = m.declined.includes(id);
      t.classList.toggle("declined", declined);
      t.style.setProperty("--oi", String(i));
      t.querySelector(".onum")!.textContent = declined ? "–" : String(i + 1);
      const [earlier, later] = [t.querySelector<HTMLButtonElement>('[data-order-move="-1"]'), t.querySelector<HTMLButtonElement>('[data-order-move="1"]')];
      if (earlier) earlier.disabled = i === 0;
      if (later) later.disabled = i === m.order.length - 1;
      const skip = t.querySelector<HTMLButtonElement>("[data-order-decline]");
      if (skip) skip.textContent = declined ? "Use" : "Skip";
    });
    row.scrollLeft = scroll;
    return true;
  }

  private choiceControls(state: GameState): string {
    const p = state.pending!;
    const m = this.mode;
    if (m.kind === "attackers" && m.defenders) {
      return `<div class="choices">${m.defenders.map((d) => `<button class="opt${d.index === m.currentDefender ? " on" : ""}" data-defender="${d.index}">${esc(d.description)}</button>`).join("")}</div>`;
    }
    if ((m.kind === "cards" && m.offBoard) || (m.kind === "targets" && p.optionCardIds.some((id) => !isPlayerId(id) &&!this.cardEls.get(id)?.isConnected))) {
      // Cards from a library, graveyard or exile: an Arena fan to pick from (orange = picked).
      // Cancel (when the choice can be declined) goes under the fan; Submit stays bottom right.
      const sel = m.kind === "cards" || m.kind === "targets" ? m.selected : [];
      const cancel = (m.kind === "cards" || m.kind === "targets") && !m.mandatory
        ? `<div class="choices big"><button class="opt primary" data-act="decline" ${this.awaiting ? "disabled" : ""}>Cancel</button></div>` : "";
      return this.fanHtml(`pick:${this.modeKey}`, p.optionCards.filter((c) => !isPlayerId(c.id)),
        (c) => `data-pick="${esc(c.id)}"`, (c) => (sel.includes(c.id) ? "on" : "selectable")) + cancel;
    }
    if (m.kind === "order") return this.orderBox(p, m);
    if (m.kind === "arrange") return this.arrangeBox(m);
    // A color of mana is picked on the wheel over its card; the corner just says so.
    if (p.type === "CHOOSE_MANA" && wheelFromStrings(p.stringOptions)) return "";
    if (m.kind !== "choice") return "";
    switch (p.type) {
      case "YES_NO": {
        const labels = p.stringOptions.length >= 2 ? [p.stringOptions[0]!, p.stringOptions[1]!] : ["Yes", "No"];
        return `<div class="choices"><button class="opt primary" data-yes="1">${esc(labels[0])}</button><button class="opt" data-yes="0">${esc(labels[1])}</button></div>`;
      }
      case "MULLIGAN": {
        // The opening hand, big and fanned in the middle; Mulligan on the left, Keep on the right.
        const labels: [string, string] = p.stringOptions.length >= 2 ? [p.stringOptions[0]!, p.stringOptions[1]!] : ["Keep", "Mulligan"];
        const special = p.stringOptions[2];
        const hand = state.players.find((pl) => pl.isViewer)?.hand ?? [];
        const keep = /^keep$/i.test(labels[0]) && hand.length ? `${labels[0]} ${hand.length}` : labels[0];
        const n = hand.length;
        const cards = hand.map((c, i) => {
          const url = imageUrl(c, "large");
          const t = i - (n - 1) / 2;
          return `<div class="mcard" data-zoom="${esc(c.id)}" style="--t: ${t}; --a: ${Math.abs(t)}">${url ? `<img src="${esc(url)}" alt="${esc(c.name)}" draggable="false">` : `<span>${esc(c.name)}</span>`}</div>`;
        }).join("");
        return `${n ? `<div class="mull-hand" style="--n: ${n}">${cards}</div>` : ""}
          <div class="choices big"><button class="opt alt" data-mull="mull">${esc(labels[1])}</button><button class="opt primary" data-mull="keep">${esc(keep)}</button>${special ? `<button class="opt alt" data-mull-special="${esc(special)}">${esc(special)}</button>` : ""}</div>`;
      }
      case "CHOOSE_MODE":
      case "CHOOSE_ABILITY": {
        // One ability card per option: the source card's art and name, then the option's text
        // (a loyalty cost goes in a shield at the bottom, as on a planeswalker).
        const multi = p.max > 1;
        const tiles = p.modeOptions.map((o) => {
          const src = (o.cardId ? this.cardData.get(o.cardId) : undefined) ?? this.sourceCard(p);
          return this.abilityCard(src, src?.name ?? p.sourceCardName ?? "", o.description, `data-mode="${o.index}"`, m.selectedModes.includes(o.index));
        }).join("");
        return `<div class="acards" style="--n: ${p.modeOptions.length}">${tiles}</div>
          <div class="choices big">${multi ? `<button class="opt primary" data-mode-confirm ${m.selectedModes.length < p.min ? "disabled" : ""}>Confirm ${m.selectedModes.length}/${p.max}</button>` : ""}
          ${!p.mandatory ? `<button class="opt ${multi ? "alt" : "primary"}" data-mode-cancel>Cancel</button>` : ""}</div>`;
      }
      case "CHOOSE_NUMBER": {
        // X and other numbers: a big dial with − / + (↑/↓, Shift for 5), and every value as a
        // quick pick when there are few (digit keys pick them); Enter or the button confirms.
        const x = /\bX\b/.test(p.message ?? "") || /\{X\}/.test(this.sourceCard(p)?.manaCost ?? "");
        const quick = quickNumbers(p);
        const atMin = stepNumber(p, m.number, -1) === m.number;
        const atMax = stepNumber(p, m.number, 1) === m.number;
        return `<div class="numpick">
            <button class="opt round" data-num="-1" ${atMin ? "disabled" : ""} title="Less (↓)">−</button>
            <div class="numval">${x ? '<small>X =</small>' : ""}<b>${m.number}</b></div>
            <button class="opt round" data-num="1" ${atMax ? "disabled" : ""} title="More (↑)">+</button>
          </div>
          ${quick.length > 1 && quick.length <= 12 ? `<div class="numquick">${quick.map((n, i) => `<button class="${n === m.number ? "on" : ""}" data-num-set="${n}" title="${i < 9 ? `Key ${i + 1}` : ""}">${n}</button>`).join("")}</div>` : ""}
          <div class="numrange">${p.allowedNumbers.length ? `Allowed: ${p.allowedNumbers.join(", ")}` : `From ${p.numberMin} to ${p.numberMax}`}</div>
          <div class="choices big">
            ${p.canUndo ? '<button class="opt" data-act="undo">Undo</button>' : ""}
            <button class="opt primary" data-num-confirm>${x ? `Choose X = ${m.number}` : `Choose ${m.number}`}</button>
          </div>`;
      }
      case "CHOOSE_COLOR":
        return `<div class="choices">${(p.stringOptions.length ? p.stringOptions : ["White", "Blue", "Black", "Red", "Green"])
          .map((c) => `<button class="opt color c-${esc(c.toLowerCase())}" data-string="${esc(c)}">${esc(c)}</button>`).join("")}</div>`;
      default:
        return `<div class="choices">${p.stringOptions.map((s) => `<button class="opt" data-string="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
    }
  }

  private renderDock(state: GameState): void {
    const p = state.pending;
    const m = this.mode;
    const me = state.players.find((pl) => pl.isViewer);
    const myTurn = !!me && state.activePlayerId === me.id;
    const buttons: { id: string; label: string; primary?: boolean; disabled?: boolean }[] = [];

    if (state.status === "COMPLETE" || m.kind === "classic") {
      // nothing
    } else if (!p) {
      buttons.push({ id: "wait", label: myTurn ? "Waiting…" : "Opponent's turn", primary: true, disabled: true });
    } else if (p.type === "PRIORITY") {
      if (state.stack.length) {
        buttons.push({ id: "resolve-all", label: "Resolve all" });
        buttons.push({ id: "pass", label: "Resolve", primary: true });
      } else {
        // "End turn" once no later step of your turn has a stop.
        const i = stepIndex(currentStep(state.phase, state.step));
        const stops = this.hooks.phaseStops().myTurn;
        const endTurn = myTurn && i >= 0 && !TURN_STEPS.slice(i + 1).some((s) => stops.has(s.key));
        buttons.push({ id: "pass", label: myTurn ? (endTurn ? "End turn" : "Next") : "Pass", primary: true });
      }
    } else if (m.kind === "attackers") {
      buttons.push({ id: "all-attack", label: "All attack" });
      if (m.assignments.size) buttons.push({ id: "clear", label: "Clear" });
      buttons.push({ id: "confirm", label: m.assignments.size ? `Attack · ${m.assignments.size}` : "No attacks", primary: true });
    } else if (m.kind === "blockers") {
      if (m.assignments.size) buttons.push({ id: "clear", label: "Clear" });
      buttons.push({ id: "confirm", label: m.assignments.size ? `Block · ${m.assignments.size}` : "No blocks", primary: true });
    } else if (m.kind === "cards" && m.mana) {
      buttons.push({ id: "cancel", label: "Cancel" });
      buttons.push({ id: "auto-pay", label: "Auto pay", primary: true });
    } else if (m.kind === "targets" || m.kind === "cards") {
      // Picking from a fan of cards: "Submit N", as in Arena, with Cancel under the fan instead.
      const fan = !!this.q(".prompt .fan");
      if (!m.mandatory && !fan) buttons.push({ id: "decline", label: "Cancel" });
      const count = `${m.selected.length}${m.max > 1 && m.max < 99 ? `/${m.max}` : ""}`;
      buttons.push({ id: "confirm", label: fan ? `Submit ${count}` : `Done · ${count}`, primary: true, disabled: !canConfirm(m) });
    }
    // Endstep says when the last action can be taken back.
    if (p?.canUndo && buttons.length) buttons.push({ id: "undo", label: "↶ Undo" });
    const html = buttons.map((b) => `<button class="${b.primary ? "primary" : "secondary"}" data-act="${b.id}" ${b.disabled || this.awaiting ? "disabled" : ""}>${esc(b.label)}</button>`).join("");
    const dock = this.q(".dock");
    if (dock.dataset.sig !== html) {
      dock.dataset.sig = html;
      dock.innerHTML = html;
    }
    dock.classList.toggle("urgent", !!p && !this.awaiting && p.type !== "PRIORITY");
    dock.classList.toggle("has-priority", !!p && !this.awaiting);
  }

  private renderClassicChip(show: boolean): void {
    const chip = this.q(".classic-chip");
    chip.classList.toggle("show", show);
    if (show && this.mode.kind === "classic") {
      chip.innerHTML = `<span>${esc(this.mode.reason)}: finish this choice in Endstep's panel.</span>
        <button class="ghost" data-ui="back">Back to Arena</button>`;
    }
  }

  // ---------------------------------------------------------------- layout

  /** Fits rows and hands to the available width (smaller cards, then overlap or pages, when crowded). */
  private layout(): void {
    // --bf-w: min(8vw, 12.6vh), the full size of a battlefield card.
    const bfw = Math.min(window.innerWidth * 0.08, window.innerHeight * 0.126);
    // A slot's width in card widths: a pile of identical permanents fans out, a tapped card
    // needs a little more. Computed rather than measured: slots animate their width.
    const unitsOf = (slot: Element) => {
      const s = slot as HTMLElement;
      if (s.classList.contains("group")) return 1 + (Number(s.style.getPropertyValue("--gn")) - 1) * 0.3;
      return s.classList.contains("tapped") ? 1.1 : 1;
    };
    // A zone's cards at a scale of their full size (set as its own --bf-w, which every card and
    // slot size inside follows).
    const scaleBox = (box: HTMLElement, s: number) => {
      if (s >= 0.999) {
        box.style.removeProperty("--bf-w");
        box.style.removeProperty("--bf-h");
      } else {
        box.style.setProperty("--bf-w", `${(bfw * s).toFixed(2)}px`);
        box.style.setProperty("--bf-h", `${(bfw * s * 0.8).toFixed(2)}px`);
      }
    };
    const lineWidth = (box: HTMLElement) => {
      const items = [...box.children];
      return items.reduce((w, it) => w + unitsOf(it), 0) * bfw + 10 * Math.max(0, items.length - 1);
    };
    // One line of permanents in `avail` px: full size if they fit, else smaller down to `min` of
    // full size, and past that they overlap. `fits` says whether they fit without overlapping.
    const line = (box: HTMLElement, avail: number, min: number) => {
      const items = [...box.children] as HTMLElement[];
      for (const it of items) it.classList.remove("off-page");
      box.classList.remove("two-rows", "grid");
      box.style.removeProperty("margin-top");
      box.style.removeProperty("margin-bottom");
      const n = items.length;
      const units = items.reduce((w, it) => w + unitsOf(it), 0);
      const gaps = 10 * Math.max(0, n - 1);
      const want = n ? (avail - gaps) / (units * bfw) : 1;
      const s = Math.max(min, Math.min(1, want));
      scaleBox(box, s);
      const cards = units * bfw * s;
      box.style.setProperty("--gap", `${Math.floor(n > 1 ? Math.min(10, (avail - cards) / (n - 1)) : 0)}px`);
      this.pageNavs.delete(box);
      return { fits: want >= min - 1e-6, width: n ? Math.min(cards + gaps, Math.max(avail, bfw * s)) : 0 };
    };
    // A grid of small cards (`rows` high, at most `maxCols` wide), filled column by column; what
    // doesn't fit in `avail` goes on further pages, turned with arrows. Returns its width.
    const grid = (box: HTMLElement, avail: number, s: number, rows: number, maxCols: number, key: string, cls: string) => {
      const items = [...box.children] as HTMLElement[];
      box.classList.add(cls);
      scaleBox(box, s);
      const GAP = 6;
      const NAV = 40;
      const colW = Math.max(...items.map(unitsOf)) * bfw * s;
      const colsFor = (w: number) => Math.max(1, Math.min(maxCols, Math.floor((w + GAP) / (colW + GAP))));
      const allCols = Math.ceil(items.length / rows);
      const paged = allCols > colsFor(avail);
      const cols = paged ? colsFor(avail - NAV) : allCols;
      const perPage = cols * rows;
      const pages = Math.max(1, Math.ceil(items.length / perPage));
      const page = Math.max(0, Math.min(pages - 1, this.pages.get(key) ?? 0));
      this.pages.set(key, page);
      items.forEach((it, i) => it.classList.toggle("off-page", i < page * perPage || i >= (page + 1) * perPage));
      if (paged) this.pageNavs.set(box, { key, page, pages });
      else this.pageNavs.delete(box);
      // A paged zone keeps room for its arrows at its outer edge.
      const shown = Math.min(perPage, items.length - page * perPage);
      return Math.max(1, Math.ceil(shown / rows)) * (colW + GAP) - GAP + (paged ? NAV : 0);
    };
    // The rows span the whole table, left and right columns included, stopping short only of
    // the graveyard/library/exile piles. Everything else (stack, prompts and their messages,
    // action buttons, names) floats over the table and never moves the battlefield.
    const board = this.el.getBoundingClientRect();
    const obstacles = [".opp-piles", ".me-piles"]
      .map((s) => this.el.querySelector<HTMLElement>(s)?.getBoundingClientRect())
      .filter((r): r is DOMRect => !!r && r.width > 0 && r.height > 0);
    // How far a row must stay clear of the piles on each side; `overhangL`/`overhangR` extend the
    // check above and below the row, for cards that rise out of it on that side.
    const clearRow = (row: HTMLElement, overhangL: number, overhangR: number) => {
      row.style.paddingLeft = row.style.paddingRight = "";
      const r = row.getBoundingClientRect();
      let padL = 0;
      let padR = 0;
      for (const o of obstacles) {
        const left = o.left + o.width / 2 < board.left + board.width / 2;
        const overhang = left ? overhangL : overhangR;
        if (o.bottom <= r.top - overhang || o.top >= r.bottom + overhang) continue;
        if (left) padL = Math.max(padL, o.right - r.left + 12);
        else padR = Math.max(padR, r.right - o.left + 12);
      }
      return { padL: Math.max(0, padL), padR: Math.max(0, padR), width: r.width, left: r.left };
    };
    for (const side of this.el.querySelectorAll<HTMLElement>(".side")) {
      const front = side.querySelector<HTMLElement>(".row.front")!;
      const row = side.querySelector<HTMLElement>(".row.back")!;
      const [lands, others, full] = [".cluster.lands", ".cluster.others", ".cluster.full"].map((s) => row.querySelector<HTMLElement>(s)!) as [HTMLElement, HTMLElement, HTMLElement];
      // Back row: lands on the left, using all the room up to the table's edge unless a pile is
      // actually beside them; artifacts/enchantments, then whole cards (Sagas, Classes,
      // planeswalkers) on the right. Whole cards rise out of it, so check a little above/below there.
      const b = clearRow(row, 0, bfw * 0.6);
      row.style.paddingLeft = `${Math.ceil(b.padL)}px`;
      row.style.paddingRight = `${Math.ceil(b.padR)}px`;
      const inner = b.width - b.padL - b.padR;
      // Nothing goes under the player's avatar: the row splits around a clear circle there,
      // and each half squeezes its own cards to fit.
      const avatar = this.q(side.classList.contains("me") ? ".me-life" : ".opp-life").querySelector<HTMLElement>(".avatar");
      let leftSpace = (inner - 24) / 2;
      let rightSpace = leftSpace;
      if (avatar) {
        const a = avatar.getBoundingClientRect();
        const clear = a.width / 2 + AVATAR_CLEARANCE;
        const cx = a.left + a.width / 2 - b.left - b.padL;
        leftSpace = Math.max(0, cx - clear);
        rightSpace = Math.max(0, inner - cx - clear);
      }
      // Crowded zones, Arena style. Whole cards (Sagas, Classes, planeswalkers) keep up to 60% of
      // the right side: side by side while they fit, then a 3×2 grid of smaller cards, paged with
      // arrows. Artifacts and enchantments get the rest, and lands the left side: one line,
      // shrinking a little, then two rows of small cards, paged too.
      const sideKey = side.classList.contains("me") ? "me" : "opp";
      const fullLine = line(full, rightSpace * 0.6, 0.8);
      const wf = fullLine.fits ? fullLine.width : grid(full, rightSpace * 0.6, 0.5, 2, 3, `${sideKey}:full`, "grid");
      const availO = Math.max(0, rightSpace - (wf ? wf + 16 : 0));
      const othersLine = line(others, availO, 0.75);
      const othersW = Math.floor(othersLine.fits ? othersLine.width : grid(others, availO, 0.48, 2, Infinity, `${sideKey}:others`, "two-rows"));
      const landsLine = line(lands, leftSpace, 0.75);
      const landsW = Math.floor(landsLine.fits ? landsLine.width : grid(lands, leftSpace, 0.48, 2, Infinity, `${sideKey}:lands`, "two-rows"));
      full.style.width = `${Math.floor(wf)}px`;
      lands.style.width = `${landsW}px`;
      others.style.width = `${othersW}px`;
      // A grid of whole cards rises into the space above the row (below it for the opponent), as a
      // single whole card does, so the row keeps its height.
      if (full.classList.contains("grid")) {
        const rows = Math.min(2, [...full.children].filter((s) => !s.classList.contains("off-page")).length);
        const rise = Math.min(0, bfw * 0.8 - (rows * bfw * 0.5 * 88 / 63 + 6 * (rows - 1)));
        full.style.setProperty(sideKey === "me" ? "margin-top" : "margin-bottom", `${Math.floor(rise)}px`);
      }
      // Each zone is centered in its own space: lands left of the avatar; right of it, the
      // artifacts/enchantments area (about the first half) and the whole cards' area (the rest),
      // either taking the whole right side when the other is empty.
      const landsLeft = Math.max(0, (leftSpace - landsW) / 2);
      lands.style.marginLeft = `${Math.floor(landsLeft)}px`;
      const rightStart = inner - rightSpace;
      const othersArea = !wf ? rightSpace : !othersW ? 0
        : Math.max(othersW + 16, Math.min(rightSpace / 2, rightSpace - wf - 16));
      const othersLeft = rightStart + Math.max(0, (othersArea - othersW) / 2);
      others.style.marginLeft = `${Math.max(0, Math.floor(othersLeft - landsLeft - landsW))}px`;
      const fullStart = Math.min(inner - wf, rightStart + othersArea + Math.max(0, (rightSpace - othersArea - wf) / 2));
      full.style.marginLeft = `${Math.max(0, Math.floor(fullStart - othersLeft - othersW))}px`;
      // Front row: creatures centered in what's free; whole cards rise into its space, so
      // creatures keep clear of them once they'd reach that far.
      const f = clearRow(front, 0, 0);
      const reserve = wf ? inner - fullStart + 16 + b.padR : 0;
      const padR = f.padR;
      const clash = reserve > padR && lineWidth(front) + 2 * reserve > f.width - f.padL;
      const right = clash ? Math.max(reserve, padR) : padR;
      front.style.paddingLeft = `${Math.ceil(f.padL)}px`;
      front.style.paddingRight = `${Math.ceil(right)}px`;
      // Many creatures: smaller cards so they all fit in their line (they overlap only past half size).
      line(front, f.width - f.padL - right, 0.55);
      this.placePageNavs(side, [[full, `${sideKey}:full`], [others, `${sideKey}:others`], [lands, `${sideKey}:lands`]]);
    }
    // Floating mana sits in the gap between the player's piles and the first step of their turn
    // bar, centered on the bar; its symbols shrink to fit so it never overlaps either.
    for (const [pool, piles, bar] of [[".me-mana", ".me-piles", ".me-bar"], [".opp-mana", ".opp-piles", ".opp-bar"]] as const) {
      const el = this.q(pool);
      const n = el.children.length;
      if (!n) continue;
      const box = this.el.getBoundingClientRect();
      const barEl = this.q(bar);
      const b = barEl.getBoundingClientRect();
      // The visible piles (their container is a little wider than the cards).
      const pilesRight = Math.max(box.left, ...[...this.q(piles).querySelectorAll<HTMLElement>(".pile")].map((x) => x.getBoundingClientRect().right));
      const firstStep = barEl.querySelector<HTMLElement>(".track-half.left > *")?.getBoundingClientRect();
      const left = pilesRight + 6;
      const right = (firstStep?.width ? firstStep.left : b.left) - 6;
      const room = Math.max(0, right - left);
      // Pips sit 6px apart in a pill with 6px padding (+4px for the last amount badge). They
      // stay big enough to click (22px+): when one row doesn't fit, they wrap onto more rows.
      const GAP = 6;
      const PAD = 16;
      const oneRow = (room - PAD - (n - 1) * GAP) / n;
      const size = Math.min(30, Math.max(22, oneRow));
      const cols = oneRow >= 22 ? n : Math.max(1, Math.floor((room - PAD + GAP) / (size + GAP)));
      el.style.setProperty("--pip", `${Math.floor(size)}px`);
      el.style.setProperty("--cols", String(cols));
      const w = el.offsetWidth;
      el.style.left = `${Math.round(left - box.left + Math.max(0, (room - w) / 2))}px`;
      el.style.top = `${Math.round(b.top - box.top + b.height / 2 - el.offsetHeight / 2)}px`;
    }
    // Status text ("Pay {1} for …", "Choose target", "Waiting for opponent…") sits in the empty
    // space right of your turn bar, clear of the action buttons. A choice to make stays centered.
    const prompt = this.q(".prompt");
    for (const k of ["left", "top", "right", "bottom", "max-width"]) prompt.style.removeProperty(k);
    if (prompt.classList.contains("show") && !prompt.classList.contains("center")) {
      const box = this.el.getBoundingClientRect();
      const bar = this.q(".me-bar");
      const b = bar.getBoundingClientRect();
      const steps = bar.querySelectorAll<HTMLElement>(".track-half.right > *");
      const lastStep = steps[steps.length - 1]?.getBoundingClientRect();
      const left = (lastStep?.width ? lastStep.right : b.right) + 14;
      const dock = this.q(".dock").getBoundingClientRect();
      const dockInTheWay = dock.height > 0 && dock.top < b.bottom && dock.bottom > b.top && dock.left > left;
      const right = (dockInTheWay ? dock.left : box.right) - 14;
      prompt.style.setProperty("left", `${Math.round(left - box.left)}px`);
      prompt.style.setProperty("right", "auto");
      prompt.style.setProperty("bottom", "auto");
      prompt.style.setProperty("max-width", `${Math.max(150, Math.round(right - left))}px`, "important");
      prompt.style.setProperty("top", `${Math.round(b.top - box.top + b.height / 2 - prompt.offsetHeight / 2)}px`);
    }
    // Your hand and the side hand (playable graveyard/exile cards) share one strip:
    // the side hand sits on the right and the main hand centers in what's left.
    const main = this.q(".my-hand");
    const side = this.q(".side-hand");
    const width = main.clientWidth;
    const sideSpan = this.fan(side, width * 0.3, null);
    const mainWidth = sideSpan ? width - sideSpan - 40 : width;
    this.fan(main, mainWidth * 0.92, mainWidth / 2);
    if (sideSpan) side.style.setProperty("--cx", `${width - sideSpan / 2}px`);
    this.fan(this.q(".opp-hand"), this.q(".opp-hand").clientWidth * 0.9, null);
    this.placeManaWheel();
    this.layoutFans();
  }

  /** The ◂ n/N ▸ arrows of each zone shown in pages, in the room it keeps at its right edge
      (stacked vertically, centered on it). */
  private placePageNavs(side: HTMLElement, zones: [HTMLElement, string][]): void {
    const s = side.getBoundingClientRect();
    for (const [box, key] of zones) {
      let nav = side.querySelector<HTMLElement>(`.page-nav[data-for="${key}"]`);
      const info = this.pageNavs.get(box);
      if (!info) {
        nav?.remove();
        continue;
      }
      if (!nav) {
        nav = document.createElement("div");
        nav.className = "page-nav";
        nav.dataset.for = key;
        side.appendChild(nav);
      }
      const html = `<button data-page="${key}" data-dir="-1" ${info.page === 0 ? "disabled" : ""} title="Previous">◂</button>
        <span>${info.page + 1}/${info.pages}</span>
        <button data-page="${key}" data-dir="1" ${info.page === info.pages - 1 ? "disabled" : ""} title="More">▸</button>`;
      if (nav.dataset.sig !== html) {
        nav.dataset.sig = html;
        nav.innerHTML = html;
      }
      const r = box.getBoundingClientRect();
      const w = nav.offsetWidth;
      nav.style.left = `${Math.round(r.right - s.left - w)}px`;
      nav.style.top = `${Math.round(r.top - s.top + r.height / 2 - nav.offsetHeight / 2)}px`;
    }
  }

  /** Lays out a fanned hand within `maxWidth`, centered at `cx` px (or 50%). Returns its width. */
  private fan(hand: HTMLElement, maxWidth: number, cx: number | null): number {
    const items = [...hand.children] as HTMLElement[];
    const n = items.length;
    if (cx === null) hand.style.removeProperty("--cx");
    else hand.style.setProperty("--cx", `${cx}px`);
    if (!n) return 0;
    const cw = items[0]!.offsetWidth || 100;
    const maxSpan = Math.max(cw, Math.min(maxWidth, n * cw * 0.92));
    const step = n > 1 ? Math.min(cw * 0.92, (maxSpan - cw) / (n - 1)) : 0;
    const spread = Math.min(4, 36 / n);
    items.forEach((it, i) => {
      const t = i - (n - 1) / 2;
      it.style.setProperty("--x", `${t * step}px`);
      it.style.setProperty("--r", `${t * spread}deg`);
      it.style.setProperty("--y", `${Math.abs(t) * Math.abs(t) * spread * 0.9}px`);
      it.style.zIndex = String(i + 1);
    });
    return cw + step * (n - 1);
  }

  private scheduleArrows(): void {
    cancelAnimationFrame(this.arrowsTimer);
    this.arrowsTimer = requestAnimationFrame(() => this.drawArrows());
    window.setTimeout(() => this.drawArrows(), 360);
  }

  private anchor(key: string): DOMRect | null {
    const el = key.startsWith("player:")
      ? this.el.querySelector<HTMLElement>(`.life-orb[data-player="${key.slice(7)}"]`) ?? this.el.querySelector<HTMLElement>(`.tile[data-player="${key.slice(7)}"]`)
      : this.cardEls.get(key);
    // Not shown (e.g. on another page of a crowded zone): no arrow.
    if (!el?.isConnected || !el.getClientRects().length) return null;
    // A hidden stack: point at its "◂ Stack" pill instead of the tucked-away item.
    if (el.closest(".stack-dock.collapsed")) return this.q(".stack-toggle").getBoundingClientRect();
    return el.getBoundingClientRect();
  }

  /** Where an arrow attaches to a card or player, relative to the board. */
  private point(key: string, origin: DOMRect): { x: number; y: number } | null {
    const r = this.anchor(key);
    if (!r) return null;
    const el = key.startsWith("player:") ? null : this.cardEls.get(key);
    if (el?.parentElement?.classList.contains("stack") && !el.closest(".stack-dock.collapsed")) {
      // Items under the top only show their top-left corner, so aim there.
      const covered = el !== el.parentElement.lastElementChild;
      return { x: r.left + r.width * (covered ? 0.18 : 0.5) - origin.left, y: r.top + r.height * (covered ? 0.08 : 0.5) - origin.top };
    }
    return { x: r.left + r.width / 2 - origin.left, y: r.top + r.height / 2 - origin.top };
  }

  private drawArrows(): void {
    const state = this.state;
    const g = this.el.querySelector("svg.arrows .lines");
    if (!g) return;
    if (!state) {
      g.innerHTML = "";
      return;
    }
    const origin = this.el.getBoundingClientRect();
    const links: { from: string; to: string; kind: "atk" | "blk" | "src" | "tgt"; pending?: boolean }[] = [];
    // Stack: every ability points back at the card it comes from; the top item
    // (and the one under the pointer) points at its targets.
    const top = state.stack[0];
    for (const [elId, s] of this.stackEls) {
      if (s.isAbility && s.sourceCardId && s.sourceCardId !== elId) links.push({ from: s.sourceCardId, to: elId, kind: "src" });
      if (s === top || elId === this.hoverStack) for (const t of s.targets) if (t !== elId) links.push({ from: elId, to: t, kind: "tgt" });
    }
    const cardIds = new Set(this.cardData.keys());
    const defenderKey = (id: string) => (cardIds.has(id) ? id : playerTargetKey(Number(id)));
    for (const a of state.combat.attacks) links.push({ from: a.fromId, to: defenderKey(a.toId), kind: "atk" });
    for (const b of state.combat.blocks) links.push({ from: b.fromId, to: b.toId, kind: "blk" });
    const m = this.mode;
    if (m.kind === "blockers") m.assignments.forEach((att, blk) => links.push({ from: blk, to: att, kind: "blk", pending: true }));
    if (m.kind === "attackers" && m.defenders) {
      m.assignments.forEach((def, att) => {
        const d = m.defenders!.find((x) => x.index === def);
        if (d?.cardId) links.push({ from: att, to: d.cardId, kind: "atk", pending: true });
      });
    }
    g.innerHTML = links.map((l) => {
      const a = this.point(l.from, origin);
      const b = this.point(l.to, origin);
      if (!a || !b) return "";
      const { x: x1, y: y1 } = a;
      const { x: x2, y: y2 } = b;
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15;
      const my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.1;
      return `<path class="arrow ${l.kind}${l.pending ? " pending" : ""}" d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" marker-end="url(#ah-${l.kind})"/>`;
    }).join("");
  }

  // ---------------------------------------------------------------- events

  private bindEvents(): void {
    const el = this.el;
    el.addEventListener("click", (e) => this.onClick(e));
    el.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    // Hovering a stack item shows its target arrows.
    el.addEventListener("pointerover", (e) => {
      const t = e.target as HTMLElement;
      const id = t.closest<HTMLElement>(".stack .card[data-id]")?.dataset.id ?? null;
      if (id !== this.hoverStack) {
        this.hoverStack = id;
        this.drawArrows();
      }
      // Hovering a permanent or a stack item shows it big beside it (unless a right-click zoom
      // is pinned or a card is being dragged).
      // (Revealed cards are small, on the right: they enlarge on hover too.)
      const perm = t.closest<HTMLElement>(".side .card[data-id], .stack .card[data-id], .opp-hand .card.known[data-id], .reveal .rcard[data-zoom]");
      const permId = perm?.dataset.id ?? perm?.dataset.zoom ?? null;
      if (permId === this.hoverPerm || this.zoomPinned || this.drag?.active) return;
      this.hoverPerm = permId;
      const c = permId ? this.cardData.get(permId) : undefined;
      if (perm && c && (!c.faceDown || c.peeked)) this.showHoverZoom(c, perm, perm.dataset.stackText || undefined);
      else this.hideZoom();
    });
    el.addEventListener("pointerleave", () => {
      if (this.hoverPerm === null || this.zoomPinned) return;
      this.hoverPerm = null;
      this.hideZoom();
    });
    el.addEventListener("pointerdown", (e) => {
      // Any press outside the enlarged card closes it (right-click opens it).
      if (this.zoomPinned && e.button !== 2) { this.zoomPinned = false; this.hideZoom(); }
      // A card fan's slider: press or drag along it to scroll the fan.
      const slider = (e.target as HTMLElement).closest<HTMLElement>("[data-fan-slider]");
      const fan = slider?.closest<HTMLElement>(".fan[data-fan]");
      if (e.button === 0 && fan) {
        e.preventDefault();
        this.slideFanTo(fan, e.clientX);
        const move = (ev: PointerEvent) => this.slideFanTo(fan, ev.clientX);
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        return;
      }
      this.onPointerDown(e);
    });
    // The mouse wheel scrolls a card fan sideways.
    el.addEventListener("wheel", (e) => {
      const fan = (e.target as HTMLElement).closest<HTMLElement>(".fan[data-fan]");
      if (!fan || fan.classList.contains("static")) return;
      e.preventDefault();
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      this.scrollFan(fan, delta / 110);
    }, { passive: false });
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    // A drag the browser cancels (e.g. the window loses focus) ends like a drop.
    window.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    window.addEventListener("keydown", (e) => {
      // Choosing a number (X): ↑/↓ change it (Shift: by 5), digit keys take a quick pick, Enter confirms.
      const p = this.state?.pending;
      const m = this.mode;
      if (p?.type === "CHOOSE_NUMBER" && m.kind === "choice" && !this.awaiting && this.el.classList.contains("live") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const quick = quickNumbers(p);
        const digit = /^[0-9]$/.test(e.key) ? (e.key === "0" ? 9 : Number(e.key) - 1) : -1;
        let number: number | undefined;
        if (e.key === "ArrowUp" || e.key === "ArrowDown") number = stepNumber(p, m.number, (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 5 : 1));
        else if (digit >= 0 && quick[digit] !== undefined) number = quick[digit];
        // Endstep's own (hidden) number picker listens for the same keys: it mustn't answer too.
        if (number !== undefined) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.setMode({ ...m, number });
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.controller.chooseNumber(m.number);
          this.setAwaiting(true);
          return;
        }
      }
      if (e.key === "Escape" && this.el.classList.contains("live")) {
        this.hideMenu();
        this.hideConfirm();
        this.closeViewer();
        this.hideZoom();
        this.zoomPinned = false;
      }
    }, true);
  }

  private keyFromTarget(t: HTMLElement): string | null {
    const card = t.closest<HTMLElement>(".card[data-id]");
    if (card && !card.closest(".pile")) return card.dataset.id!;
    const plate = t.closest<HTMLElement>(".plate[data-player], .life-orb[data-player], .tile[data-player]");
    if (plate?.dataset.player) return playerTargetKey(Number(plate.dataset.player));
    return null;
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    if (this.state) this.render(this.state);
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest(".menu")) this.hideMenu();
    const state = this.state;
    if (!state || performance.now() < this.suppressClickUntil) return;
    const btn = t.closest<HTMLElement>("button");

    // The mana wheel: a slice makes that color; the center (or a click anywhere else, for a
    // wheel opened by clicking a land) backs out.
    const slice = t.closest<SVGElement>("[data-mana]");
    if (slice && !this.awaiting) {
      const key = slice.dataset.mana!;
      const wheel = this.localWheel;
      this.localWheel = null;
      if (wheel) this.controller.playCard(wheel.cardId, Number(key));
      else this.controller.chooseString("CHOOSE_MANA", key);
      this.setAwaiting(true);
      this.render(state);
      return;
    }
    if (t.closest("[data-wheel-cancel]") || (this.localWheel && !t.closest(".mana-wheel"))) {
      if (this.localWheel) { this.localWheel = null; this.render(state); return; }
      if (state.pending?.cancellable && !this.awaiting) { this.controller.decline(); this.setAwaiting(true); }
      return;
    }
    if (btn?.dataset.ability !== undefined && this.abilityPick && !this.awaiting) {
      this.controller.playCard(this.abilityPick.cardId, Number(btn.dataset.ability));
      this.abilityPick = null;
      this.setAwaiting(true);
      this.render(state);
      return;
    }

    if (btn?.dataset.stop) {
      const [side, step] = btn.dataset.stop.split(":") as [StopSide, string];
      this.hooks.togglePhaseStop(side, step);
      this.render(state);
      return;
    }
    if (btn?.dataset.ui) {
      if (btn.dataset.ui === "debug") this.hooks.onToggleDebug();
      if (btn.dataset.ui === "hide") this.hooks.onHide();
      if (btn.dataset.ui === "back") { this.classicDismissedFor = this.modeKey; this.render(state); }
      if (btn.dataset.ui === "close-viewer") this.closeViewer();
      if (btn.dataset.ui === "stack-toggle") { this.stackHidden = !this.stackHidden; this.render(state); }
      if (btn.dataset.ui === "peek") { this.peeking = !this.peeking; this.render(state); }
      if (btn.dataset.ui === "confirm-cancel") this.hideConfirm();
      if (btn.dataset.ui === "ability-cancel") { this.abilityPick = null; this.peeking = false; this.render(state); }
      return;
    }
    if (btn?.dataset.revealClose) {
      this.dismissedReveals.add(btn.dataset.revealClose);
      this.render(state);
      return;
    }
    if (btn?.dataset.concede) {
      this.hideConfirm();
      this.controller.concede(btn.dataset.concede === "match");
      return;
    }
    if (btn?.dataset.page) {
      const key = btn.dataset.page;
      this.pages.set(key, (this.pages.get(key) ?? 0) + Number(btn.dataset.dir));
      this.layout();
      this.scheduleArrows();
      return;
    }
    if (btn?.dataset.spend) {
      if (!this.awaiting) { this.controller.useFloatingMana(btn.dataset.spend); this.setAwaiting(true); }
      return;
    }
    if (btn?.dataset.act) return this.onDockAction(btn.dataset.act);
    if (btn?.dataset.focus) { this.focusedOpp = btn.dataset.focus; this.render(state); return; }
    if (this.handlePromptButton(btn)) return;
    if (btn?.classList.contains("pile")) return this.openViewer(btn.dataset.player!, btn.dataset.zone!);
    const menuItem = t.closest<HTMLElement>("[data-menu]");
    if (menuItem) return this.onMenuItem(menuItem);

    const key = this.keyFromTarget(t);
    if (!key || this.awaiting) return;
    this.onSelectKey(key, e);
  }

  private onSelectKey(key: string, e: MouseEvent): void {
    const state = this.state!;
    const m = this.mode;
    if (m.kind === "cards" && m.mana) {
      if (m.valid.has(key)) { this.controller.tapMana(key); this.setAwaiting(true); }
      return;
    }
    if (m.kind === "attackers") {
      const d = defenderForKey(m, key, state);
      if (d !== null) { this.setMode({ ...m, currentDefender: d }); return; }
    }
    if (m.kind === "targets" || m.kind === "cards" || m.kind === "attackers" || m.kind === "blockers") {
      const next = clickInMode(m, key);
      if (next === m) return;
      // Single-target prompts submit on click, as in Endstep.
      if (next.kind === "targets" && next.max === 1 && next.selected.length === 1) {
        this.controller.chooseTargets(next.selected);
        this.setAwaiting(true);
      }
      this.setMode(next);
      return;
    }
    // Priority: one click activates a permanent; hand cards are played by dragging.
    if (m.kind === "idle" && !this.cardEls.get(key)?.closest(".hand")) this.tryPlay(key, e.ctrlKey);
  }

  /** Plays/activates a card if Endstep lists it as playable; asks which ability when there are several. */
  private tryPlay(cardId: string, keepPriority = false): boolean {
    const option = this.state?.pending?.type === "PRIORITY" ? this.state.pending.playable.find((p) => p.cardId === cardId) : undefined;
    if (!option) return false;
    if (option.abilities.length > 1) {
      // Only mana of different colors (a dual land): the color wheel on the card. Anything
      // else: an ability card for each, Arena's Choose One.
      const wheel = wheelFromAbilities(option.abilities);
      if (wheel) this.localWheel = { cardId, options: wheel };
      else this.abilityPick = { cardId, abilities: option.abilities };
      this.hideMenu();
      if (this.state) this.render(this.state);
      return true;
    }
    this.controller.playCard(cardId, option.abilities[0]?.index, keepPriority);
    this.setAwaiting(true);
    return true;
  }

  private onDockAction(act: string): void {
    const m = this.mode;
    const c = this.controller;
    switch (act) {
      case "undo": c.undo(); break;
      case "pass": c.passPriority(); break;
      case "resolve-all": c.resolveStack(); break;
      case "auto-pay": c.autoPay(); break;
      case "cancel": c.cancel(); break;
      case "decline": c.no(); break;
      case "clear":
        if (m.kind === "attackers") this.setMode({ ...m, assignments: new Map() });
        if (m.kind === "blockers") this.setMode({ ...m, assignments: new Map(), selectedBlocker: null });
        return;
      case "all-attack":
        if (m.kind === "attackers") this.setMode({ ...m, assignments: new Map([...m.valid].map((id) => [id, m.currentDefender])) });
        return;
      case "confirm":
        if (m.kind === "attackers") c.declareAttackers(m.assignments, !!m.defenders);
        else if (m.kind === "blockers") c.declareBlockers(m.assignments);
        else if (m.kind === "targets") c.chooseTargets(m.selected);
        else if (m.kind === "cards") c.chooseCards(m.selected);
        else return;
        break;
      default:
        return;
    }
    this.setAwaiting(true);
    this.render(this.state);
  }

  private handlePromptButton(btn: HTMLElement | null): boolean {
    if (!btn || this.awaiting) return false;
    const d = btn.dataset;
    const c = this.controller;
    const p = this.state?.pending;
    const m = this.mode;
    if (!p) return false;
    if (m.kind === "order" && (d.orderMove !== undefined || d.orderDecline !== undefined)) {
      if (d.orderMove !== undefined) {
        const i = m.order.indexOf(d.orderFor ?? "");
        const j = i + Number(d.orderMove);
        if (i < 0 || j < 0 || j >= m.order.length) return true;
        const order = [...m.order];
        [order[i], order[j]] = [order[j]!, order[i]!];
        this.setMode({ ...m, order });
      } else {
        const id = d.orderDecline!;
        this.setMode({ ...m, declined: m.declined.includes(id) ? m.declined.filter((x) => x !== id) : [...m.declined, id] });
      }
      return true;
    }
    if ((d.orderConfirm !== undefined || d.orderSkip !== undefined) && m.kind === "order") {
      // Every option goes in orderedCards (as shown, leftmost first); skipped ones also in declinedCards.
      if (p.type === "ORDER_ABILITIES") c.orderAbilities(m.order, d.orderSkip !== undefined ? m.order : m.declined);
      else c.orderCombatants(p.type as "ORDER_ATTACKERS" | "ORDER_BLOCKERS", m.order);
    } else if (d.yes !== undefined) {
      const labels = p.stringOptions.length >= 2 ? [p.stringOptions[0]!, p.stringOptions[1]!] as [string, string] : undefined;
      c.answer(d.yes === "1", labels);
    } else if (d.mull) {
      if (d.mull === "keep") c.keepHand(); else c.mulligan();
    } else if (d.mullSpecial) {
      c.mulliganSpecial(d.mullSpecial);
    } else if (d.mode !== undefined && m.kind === "choice") {
      const index = Number(d.mode);
      if (p.max > 1) {
        const selectedModes = m.selectedModes.includes(index) ? m.selectedModes.filter((i) => i !== index) : [...m.selectedModes, index].slice(-p.max);
        this.setMode({ ...m, selectedModes });
        return true;
      }
      c.chooseModes([index]);
    } else if (d.modeConfirm !== undefined && m.kind === "choice") {
      c.chooseModes(m.selectedModes);
    } else if (d.modeCancel !== undefined) {
      c.no();
    } else if (d.num !== undefined && m.kind === "choice") {
      this.setMode({ ...m, number: stepNumber(p, m.number, Number(d.num)) });
      return true;
    } else if (d.numSet !== undefined && m.kind === "choice") {
      this.setMode({ ...m, number: Number(d.numSet) });
      return true;
    } else if (d.numConfirm !== undefined && m.kind === "choice") {
      c.chooseNumber(m.number);
    } else if (d.string !== undefined) {
      const type = p.type === "CHOOSE_ABILITY" || p.type === "YES_NO" || p.type === "MULLIGAN" ? null : p.type;
      if (!type) return false;
      c.chooseString(type as "CHOOSE_COLOR", d.string);
    } else if (d.defender !== undefined && m.kind === "attackers") {
      this.setMode({ ...m, currentDefender: Number(d.defender) });
      return true;
    } else if (d.arr !== undefined && m.kind === "arrange") {
      // A click sends the card to the other pile.
      this.setMode(arrangeMove(m, d.arr, m.top.includes(d.arr) ? "tray" : "top"));
      return true;
    } else if (d.arrangeDone !== undefined && m.kind === "arrange") {
      c.arrangeCards(m.top);
    } else if (d.pick !== undefined) {
      this.onSelectKey(d.pick, new MouseEvent("click"));
      return true;
    } else {
      return false;
    }
    this.setAwaiting(true);
    return true;
  }

  // ---------------------------------------------------------------- drag & drop (hand → battlefield)

  // Any hand card can be picked up; it's played only when released over the
  // table and only if Endstep lists it as playable right now.

  private onPointerDown(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    const tile = t.closest<HTMLElement>(".otile[data-order-id]");
    if (e.button === 0 && tile && !t.closest("button") && this.mode.kind === "order" && !this.awaiting) {
      e.preventDefault();
      this.orderDrag = { id: tile.dataset.orderId!, startX: e.clientX, active: false, tiles: [], ids: [], centers: [], step: 0, from: 0, to: 0 };
      return;
    }
    const arr = t.closest<HTMLElement>(".arr-card[data-arr]");
    if (e.button === 0 && arr && this.mode.kind === "arrange" && !this.awaiting) {
      e.preventDefault();
      this.arrDrag = { id: arr.dataset.arr!, startX: e.clientX, startY: e.clientY, el: arr, active: false };
      return;
    }
    if (e.button !== 0) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>(".hand.mine .card[data-id]");
    if (!card) return;
    // Your hand can be rearranged at any time; playing a card (or one from the side hand) needs priority.
    if (!card.closest(".my-hand") && (this.mode.kind !== "idle" || this.awaiting)) return;
    e.preventDefault();
    this.drag = { id: card.dataset.id!, startX: e.clientX, startY: e.clientY, el: card, active: false };
  }

  private dropY(): number {
    return this.q(".my-hand").getBoundingClientRect().top - 20;
  }

  /** Measures the row once when a tile starts moving: the tiles never change places in the
      page until the drop, they only slide, so the pointer math stays stable. */
  private startOrderDrag(od: NonNullable<Board["orderDrag"]>): boolean {
    const tiles = [...this.el.querySelectorAll<HTMLElement>(".prompt .order-row > .otile[data-order-id]")];
    const from = tiles.findIndex((t) => t.dataset.orderId === od.id);
    if (from < 0 || this.mode.kind !== "order") return false;
    od.active = true;
    od.tiles = tiles;
    od.ids = tiles.map((t) => t.dataset.orderId!);
    od.centers = tiles.map((t) => { const r = t.getBoundingClientRect(); return r.left + r.width / 2; });
    od.step = tiles.length > 1 ? (od.centers.at(-1)! - od.centers[0]!) / (tiles.length - 1) : 0;
    od.from = from;
    od.to = from;
    tiles[from]!.classList.add("dragging");
    tiles[0]!.parentElement!.classList.add("sorting");
    this.hideZoom();
    return true;
  }

  /** The scry/surveil pile under the pointer. */
  private arrZoneAt(x: number, y: number): HTMLElement | undefined {
    return [...this.el.querySelectorAll<HTMLElement>(".arr-zone")].find((z) => {
      const r = z.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }

  private onPointerMove(e: PointerEvent): void {
    const ad = this.arrDrag;
    if (ad) {
      const dx = e.clientX - ad.startX;
      const dy = e.clientY - ad.startY;
      if (!ad.active && Math.hypot(dx, dy) < 5) return;
      if (!ad.active) {
        ad.active = true;
        ad.el.classList.add("dragging");
        this.hideZoom();
      }
      ad.el.style.translate = `${dx}px ${dy}px`;
      const over = this.arrZoneAt(e.clientX, e.clientY);
      for (const z of this.el.querySelectorAll(".arr-zone")) z.classList.toggle("over", z === over);
      return;
    }
    const od = this.orderDrag;
    if (od) {
      if (!od.active && Math.abs(e.clientX - od.startX) < 5) return;
      if (!od.active && !this.startOrderDrag(od)) { this.orderDrag = null; return; }
      // The dragged tile follows the pointer; the others slide aside to open its landing spot.
      const dx = e.clientX - od.startX;
      const target = od.centers[od.from]! + dx;
      let to = 0;
      od.centers.forEach((c, i) => { if (Math.abs(c - target) < Math.abs(od.centers[to]! - target)) to = i; });
      od.to = to;
      const order = od.ids.filter((id) => id !== od.id);
      order.splice(to, 0, od.id);
      od.tiles.forEach((t, i) => {
        const id = od.ids[i]!;
        if (id === od.id) t.style.translate = `${dx}px 0`;
        else {
          const shift = od.from < to && i > od.from && i <= to ? -od.step : to < od.from && i >= to && i < od.from ? od.step : 0;
          t.style.translate = shift ? `${shift}px 0` : "";
        }
        const num = t.querySelector(".onum");
        if (num && !t.classList.contains("declined")) num.textContent = String(order.indexOf(id) + 1);
      });
      return;
    }
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active && Math.hypot(dx, dy) < 6) return;
    if (!d.active) {
      d.active = true;
      d.el.classList.add("dragging");
      this.hideMenu();
    }
    d.el.style.translate = `${dx}px ${dy}px`;
    const over = e.clientY < this.dropY();
    this.el.classList.toggle("drop-ready", over && d.el.classList.contains("playable"));
    d.el.classList.toggle("over-table", over);
  }

  private onPointerUp(e: PointerEvent): void {
    const ad = this.arrDrag;
    this.arrDrag = null;
    if (ad) {
      if (!ad.active) return;
      this.suppressClickUntil = performance.now() + 250;
      ad.el.classList.remove("dragging");
      ad.el.style.translate = "";
      for (const z of this.el.querySelectorAll(".arr-zone")) z.classList.remove("over");
      const m = this.mode;
      const zone = this.arrZoneAt(e.clientX, e.clientY);
      if (m.kind === "arrange" && zone) {
        // Dropped among the pile's cards: it lands before the first one right of the pointer.
        const others = [...zone.querySelectorAll<HTMLElement>(".arr-card")].filter((c) => c !== ad.el);
        const index = others.filter((c) => { const r = c.getBoundingClientRect(); return r.left + r.width / 2 < e.clientX; }).length;
        this.setMode(arrangeMove(m, ad.id, zone.dataset.zone as "top" | "tray", index));
      } else if (this.state) {
        this.render(this.state);
      }
      return;
    }
    const od = this.orderDrag;
    this.orderDrag = null;
    if (od) {
      if (!od.active) return;
      this.suppressClickUntil = performance.now() + 250;
      const order = od.ids.filter((id) => id !== od.id);
      order.splice(od.to, 0, od.id);
      // Land without a second slide: drop the offsets with transitions off, then reorder.
      const row = od.tiles[0]?.parentElement;
      row?.classList.remove("sorting");
      row?.classList.add("settling");
      for (const t of od.tiles) { t.classList.remove("dragging"); t.style.translate = ""; }
      const m = this.mode;
      if (m.kind === "order" && order.length === m.order.length && order.every((id) => m.order.includes(id))) this.setMode({ ...m, order });
      else if (this.state) this.render(this.state);
      requestAnimationFrame(() => row?.classList.remove("settling"));
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d?.active) return;
    this.suppressClickUntil = performance.now() + 250;
    this.el.classList.remove("drop-ready");
    d.el.classList.remove("dragging", "over-table");
    const over = e.clientY < this.dropY();
    // Released within the hand: the card moves to where it was dropped.
    const hand = this.q(".my-hand");
    if (!over && d.el.parentElement === hand) {
      const from = d.el.getBoundingClientRect();
      const others = ([...hand.children] as HTMLElement[]).filter((c) => c !== d.el);
      const index = others.filter((c) => { const r = c.getBoundingClientRect(); return r.left + r.width / 2 < e.clientX; }).length;
      const order = this.handOrder.filter((id) => id !== d.id);
      order.splice(index, 0, d.id);
      this.handOrder = order;
      d.el.style.translate = "";
      if (this.state) this.render(this.state);
      // Glide from where it was let go into its new place (the others slide via FLIP).
      const to = d.el.getBoundingClientRect();
      for (const a of d.el.getAnimations()) if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) a.cancel();
      d.el.animate([{ translate: `${from.left - to.left}px ${from.top - to.top}px` }, { translate: "0px 0px" }], { duration: 200, easing: "ease-out" });
      return;
    }
    const played = over && !this.awaiting && this.mode.kind === "idle" && this.tryPlay(d.id, e.ctrlKey);
    if (!played) {
      d.el.animate([{ translate: d.el.style.translate }, { translate: "0px 0px" }], { duration: 200, easing: "ease-out" });
      if (over) this.toast(`${this.cardData.get(d.id)?.name ?? "That card"} can't be played right now.`);
    }
    d.el.style.translate = "";
  }

  // ---------------------------------------------------------------- zoom (right-click)

  /** Hovering a permanent shows it big beside it, on whichever side has room. */
  private showHoverZoom(c: CardView, anchor: HTMLElement, extra?: string): void {
    this.showZoom(c, extra);
    const zoom = this.q(".zoom");
    if (!zoom.classList.contains("show")) return;
    const box = this.el.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    const zw = Math.min(300, (box.height * 0.6) / 1.397);
    zoom.style.setProperty("--zw", `${zw}px`);
    const zh = zoom.offsetHeight;
    const gap = 14;
    const right = r.right - box.left + gap;
    const left = r.left - box.left - gap - zw;
    const x = right + zw <= box.width - 8 || left < 8 ? Math.min(right, box.width - zw - 8) : left;
    const y = Math.max(8, Math.min(r.top + r.height / 2 - box.top - zh / 2, box.height - zh - 8));
    zoom.style.left = `${x}px`;
    zoom.style.top = `${y}px`;
  }

  private showZoom(c: CardView, extra?: string): void {
    const zoom = this.q(".zoom");
    if (c.faceDown && !c.peeked && !extra) return this.hideZoom();
    const url = imageUrl(c, "large");
    const counters = Object.entries(c.counters).map(([k, n]) => `<span>${esc(k)} ×${n}</span>`).join("");
    const effects = this.effectsByCard.get(c.id) ?? [];
    const held = this.held.get(c.id) ?? [];
    const holder = this.cardData.get(this.linked.get(c.id) ?? "");
    const gained = c.keywordsGranted ?? [];
    const lost = lostKeywords(c);
    const notes = [
      gained.length ? `<span class="kgain">Gained: ${esc(gained.join(", "))}</span>` : "",
      lost.length ? `<span class="klost">Lost: ${esc(lost.join(", "))}</span>` : "",
      held.length ? `<span>Exiled with it: ${esc(held.map((h) => h.name).join(", "))}</span>` : "",
      holder ? `<span>Exiled by ${esc(holder.name)}</span>` : "",
    ].filter(Boolean);
    zoom.innerHTML = `
      <div class="zcard">${url ? `<img src="${esc(url)}" alt="${esc(c.name)}">` : `<div class="ztext"><b>${esc(c.name)}</b><i>${esc(c.typeLine ?? "")}</i><p>${esc(c.oracleText ?? "")}</p></div>`}</div>
      ${extra ? `<div class="zextra">${esc(extra)}</div>` : ""}
      ${counters || c.damage ? `<div class="zextra">${counters}${c.damage ? `<span class="dmg">${c.damage} damage</span>` : ""}</div>` : ""}
      ${notes.length ? `<div class="zextra col">${notes.join("")}</div>` : ""}
      ${effects.map((fx) => `<div class="zextra fx"><b>✦ ${esc(fx.name)}</b><span>${esc(fx.oracleText ?? "")}</span></div>`).join("")}`;
    // Always in the left column, in the space between the two players' piles.
    const box = this.el.getBoundingClientRect();
    const oppPiles = this.q(".opp-piles").getBoundingClientRect();
    const mePiles = this.q(".me-piles").getBoundingClientRect();
    const gapTop = (oppPiles.height ? oppPiles.bottom : box.top + box.height * 0.3) - box.top + 10;
    const gapBottom = (mePiles.height ? mePiles.top : box.top + box.height * 0.7) - box.top - 10;
    const extraH = (extra ? 60 : 0) + (counters || c.damage ? 40 : 0) + notes.length * 22 + effects.length * 56;
    const columnW = oppPiles.width || mePiles.width || 260;
    // Fill the gap; if it's too short, grow over the piles rather than shrink to unreadable.
    const zh = Math.max(gapBottom - gapTop - extraH, Math.min(box.height * 0.5, 420));
    const zw = Math.min(columnW - 16, zh / 1.397, 380);
    zoom.style.setProperty("--zw", `${zw}px`);
    const mid = (gapTop + gapBottom) / 2;
    const top = Math.max(8, Math.min(mid - (zw * 1.397 + extraH) / 2, box.height - zw * 1.397 - extraH - 8));
    zoom.style.left = `${(oppPiles.left || mePiles.left || box.left) - box.left + ((columnW - zw) / 2)}px`;
    zoom.style.top = `${top}px`;
    zoom.classList.add("show");
  }

  private hideZoom(): void {
    this.q(".zoom").classList.remove("show");
    this.hoverPerm = null;
  }

  // ---------------------------------------------------------------- context menu

  /** Right-click shows the card enlarged, plus a menu when there's something to do with it. */
  private onContextMenu(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const zoomEl = t.closest<HTMLElement>("[data-zoom], .pile .card[data-id]");
    if (zoomEl) {
      e.preventDefault();
      const id = zoomEl.dataset.zoom ?? zoomEl.dataset.id!.replace(/^copy:/, "");
      const c = this.cardData.get(id);
      if (c) this.pinZoom(c);
      return;
    }
    const key = this.keyFromTarget(t);
    if (!key || key.startsWith("player:")) {
      this.zoomPinned = false;
      this.hideZoom();
      // Right-click on the table itself: the game menu (Endstep's items, in this board's style).
      if (!key && !t.closest(".prompt.show, .viewer.open, .dock, .corner, .menu, .confirm, .stack-dock, .mana-wheel, .hand, .pile")) {
        e.preventDefault();
        void this.openTableMenu(e.clientX, e.clientY);
      }
      return;
    }
    e.preventDefault();
    const c = this.cardData.get(key);
    const el = this.cardEls.get(key);
    if (el && (c || el.dataset.stackText)) this.pinZoom(c ?? blankCard(key, ""), el.dataset.stackText);
    const items: { label: string; hint?: string; data: string }[] = [];
    const p = this.state?.pending;
    if (p?.type === "PRIORITY" && !this.awaiting) {
      const option = p.playable.find((o) => o.cardId === key);
      const verb = el?.closest(".hand") ? "Play" : "Activate";
      for (const a of option?.abilities ?? []) items.push({ label: a.description || verb, hint: a.cost, data: `play:${key}:${a.index}` });
      if (option && !option.abilities.length) items.push({ label: verb, data: `play:${key}:` });
    }
    if (this.isSelectable(key)) {
      const m = this.mode;
      const label = m.kind === "attackers" ? (m.assignments.has(key) ? "Remove from attack" : "Attack")
        : m.kind === "blockers" ? (m.validBlockers.has(key) ? "Block with this" : "Block this attacker")
        : m.kind === "cards" && m.mana ? "Tap for mana"
        : "Select";
      items.push({ label, data: `select:${key}` });
    }
    if (items.length) this.showMenu(e.clientX, e.clientY, items, c?.name);
    else this.hideMenu();
  }

  private pinZoom(c: CardView, extra?: string): void {
    this.zoomPinned = true;
    this.showZoom(c, extra);
  }

  /** The items of the table menu, by index (their labels are Endstep's). */
  private tableItems: string[] = [];

  /** Endstep's table menu (decklist, auto-yields, settings, reports, concede…), in this board's
      style. Concede asks here; the rest opens Endstep's own window. */
  private async openTableMenu(x: number, y: number): Promise<void> {
    const labels = (await this.hooks.tableMenu()) ?? ["Reload", "Concede"];
    this.tableItems = labels;
    const items = labels.map((label, i) => {
      const concede = /^concede( game| match)?$/i.exec(label);
      return concede
        ? { label, data: `concede:${concede[1]?.trim().toLowerCase() ?? "single"}`, cls: "danger" }
        : { label, data: `table:${i}` };
    });
    // Conceding sits apart, at the bottom.
    const first = items.findIndex((i) => i.cls === "danger");
    if (first > 0) items[first] = { ...items[first]!, cls: "danger sep" };
    this.showMenu(x, y, items, "Game");
  }

  /** "Concede?" in this board's style; confirming sends it. */
  private showConcede(kind: string): void {
    const match = kind === "match";
    const title = match ? "Concede match?" : kind === "game" ? "Concede game?" : "Concede?";
    const text = match ? "Forfeit the series. Your opponent wins the match. This can't be undone."
      : kind === "game" ? "Lose this game. The match continues. This can't be undone." : "You'll lose this game. This can't be undone.";
    const box = this.q(".confirm");
    box.innerHTML = `<div class="phead"><h2>${esc(title)}</h2><p>${esc(text)}</p></div>
      <div class="choices big"><button class="opt" data-ui="confirm-cancel">Cancel</button><button class="opt danger" data-concede="${match ? "match" : "game"}">${esc(title.replace("?", ""))}</button></div>`;
    box.classList.add("open");
    box.querySelector<HTMLElement>('[data-ui="confirm-cancel"]')?.focus();
  }

  private hideConfirm(): void {
    this.q(".confirm").classList.remove("open");
  }

  private showMenu(x: number, y: number, items: { label: string; hint?: string; data: string; cls?: string }[], title?: string): void {
    const menu = this.q(".menu");
    menu.innerHTML = (title ? `<div class="mtitle">${esc(title)}</div>` : "") +
      items.map((i) => `<button role="menuitem" class="${i.cls ?? ""}" data-menu="${esc(i.data)}"><span>${esc(i.label)}</span>${i.hint ? `<small>${esc(i.hint)}</small>` : ""}</button>`).join("");
    menu.classList.add("show");
    const box = this.el.getBoundingClientRect();
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, box.width - r.width - 8)}px`;
    menu.style.top = `${Math.min(y, box.height - r.height - 8)}px`;
    menu.querySelector("button")?.focus();
  }

  private hideMenu(): void {
    this.q(".menu").classList.remove("show");
  }

  private onMenuItem(item: HTMLElement): void {
    const [cmd, id, arg] = item.dataset.menu!.split(":");
    this.hideMenu();
    if (!id) return;
    if (cmd === "table") {
      const label = this.tableItems[Number(id)];
      if (label === "Reload") location.reload();
      else if (label) this.hooks.runTableItem(label);
      return;
    }
    if (cmd === "concede") return this.showConcede(id);
    if (cmd === "play") {
      this.controller.playCard(id, arg ? Number(arg) : undefined);
      this.setAwaiting(true);
    } else if (cmd === "select") {
      this.onSelectKey(id, new MouseEvent("click"));
    }
  }

  // ---------------------------------------------------------------- zone viewer

  private viewer: { player: string; zone: string } | null = null;

  private openViewer(player: string, zone: string): void {
    if (zone === "library") return;
    this.viewer = { player, zone };
    this.refreshViewer();
  }

  /** A graveyard, exile or command zone, full screen as an Arena card fan (newest first), with
      Close under it. Cards you can play from there glow blue; clicking one plays it. */
  private refreshViewer(): void {
    const v = this.viewer;
    const box = this.q(".viewer");
    const p = this.state?.players.find((pl) => pl.id === v?.player);
    if (!v || !p) return this.closeViewer();
    const cards = v.zone === "graveyard" ? p.graveyard : v.zone === "exile" ? p.exile : p.commandZone;
    const playable = new Set(this.state?.pending?.type === "PRIORITY" ? this.state.pending.playable.map((o) => o.cardId) : []);
    const html = `<div class="phead"><h2>${esc(humanize(v.zone))}</h2><p>${esc(p.name)} · ${cards.length} card${cards.length === 1 ? "" : "s"}</p></div>
      ${this.fanHtml(`view:${v.player}:${v.zone}`, cards.slice().reverse(), (c) => `data-vplay="${esc(c.id)}"`, (c) => (playable.has(c.id) ? "playable" : ""))}
      <div class="choices big"><button class="opt primary" data-ui="close-viewer">Close</button></div>`;
    // Rebuilt only when something changed, so hovering and scrolling aren't interrupted.
    if (box.dataset.sig !== html) {
      box.dataset.sig = html;
      box.innerHTML = html;
    }
    box.classList.add("open");
    this.layoutFans();
    box.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (performance.now() < this.suppressClickUntil) return;
      if (t === box) return this.closeViewer();
      const card = t.closest<HTMLElement>("[data-vplay]");
      if (card?.classList.contains("playable") && !this.awaiting) {
        if (this.tryPlay(card.dataset.vplay!)) this.closeViewer();
      }
    };
  }

  private closeViewer(): void {
    this.viewer = null;
    const box = this.q(".viewer");
    box.classList.remove("open");
    delete box.dataset.zone;
  }
}

// ------------------------------------------------------------------ helpers

/** Moves/inserts children so `container` holds exactly `wanted`, in order. */
function reconcile(container: Element, wanted: Element[]): void {
  wanted.forEach((node, i) => {
    if (container.children[i] !== node) container.insertBefore(node, container.children[i] ?? null);
  });
  while (container.children.length > wanted.length) container.lastElementChild!.remove();
}

/**
 * Cards that look and behave the same pile together (as Endstep groups them).
 * Anything with its own state (attachments, damage, counters, in combat) stays alone.
 */
function groupKey(c: CardView, local: string, effects: number): string | null {
  if (c.attachmentIds.length || c.damage || Object.keys(c.counters).length || c.isAttacking || c.isBlocking || c.faceDown) return null;
  // Everything that changes how the card looks or what it is doing, including choices still
  // being made (an attacker or blocker you picked but haven't confirmed, a selected target).
  return JSON.stringify([c.name, c.power, c.toughness, c.loyalty, c.tapped, c.summoningSick, c.isToken, c.setCode, c.collectorNumber,
    c.types, c.controllerId, c.keywordsGranted, c.keywordsLost, local, effects]);
}

/** Players appear among target options as -(seat + 1). */
const isPlayerId = (id: string) => /^-\d+$/.test(id);

function blankCard(id: string, name: string): CardView {
  return {
    id, name, tapped: false, summoningSick: false, faceDown: false, isToken: false, isCommander: false, counters: {}, attachmentIds: [],
    isAttacking: false, isBlocking: false, blockingIds: [], types: [],
  };
}

function defaultMessage(type: string, m: Mode): string {
  switch (m.kind) {
    case "attackers": return "Choose attackers";
    case "blockers": return m.selectedBlocker ? "Now click the attacker to block" : "Choose blockers: click your creature, then an attacker";
    case "targets": return "Choose target";
    case "cards": return m.mana ? "Pay the cost: tap lands, or Auto pay" : "Choose cards";
    default: return humanize(type);
  }
}

/** A number prompt's values offered as quick picks: the allowed ones, or the whole range when it's
    small (as Endstep's own picker does); none for a wide range. */
function quickNumbers(p: PendingActionView): number[] {
  if (p.allowedNumbers.length) return p.allowedNumbers.length <= 12 ? p.allowedNumbers : [];
  return p.numberMax - p.numberMin <= 10 ? Array.from({ length: p.numberMax - p.numberMin + 1 }, (_, i) => p.numberMin + i) : [];
}

/** Mana and tap symbols ({T}, {G}, {2}, {W/U}…) in already-escaped text, as symbol images. */
function withSymbols(html: string): string {
  return html.replace(/\{([^}]{1,5})\}/g, (all, sym: string) =>
    `<img class="sym" src="${MANA_SYMBOL_URL}/${sym.toUpperCase().replace(/\//g, "")}.svg" alt="${all}" draggable="false">`);
}

const NUMBER_WORDS =["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** Heading and subtitle of a full-screen choice, as Arena words them. */
function promptTitle(state: GameState, m: Mode): { title: string; sub: string } {
  const p = state.pending!;
  const msg = p.message ?? "";
  // A message that only repeats the heading isn't worth a second line.
  const pick = (title: string, fallback: string) => ({ title, sub: msg && msg.toLowerCase() !== title.toLowerCase() ? msg : fallback });
  switch (p.type) {
    case "MULLIGAN": {
      const first = state.players.find((pl) => pl.id === state.activePlayerId);
      const title = !first ? "Opening Hand" : first.isViewer ? "You Go First" : `${first.name} Goes First`;
      return pick(title, "Keep this hand, or shuffle it away and draw a new one.");
    }
    case "CHOOSE_MODE":
    case "CHOOSE_ABILITY":
      return pick(`Choose ${p.max > 1 ? `${NUMBER_WORDS[p.max] ?? p.max}` : "One"}`, "Click an option below to select it.");
    case "ARRANGE_CARDS": {
      // Endstep's message ("Surveil 2") makes the heading; the instructions stay under it.
      const [base, sub] = p.contextType === "surveil" ? ["Surveil", "Drag or click cards to put them on the top of your library or into your graveyard."]
        : p.contextType === "scry" ? ["Scry", "Drag or click cards to keep them on the top of your library or put them on the bottom."]
        : ["Arrange Cards", "Drag to set the order. The leftmost comes first."];
      return { title: msg.toLowerCase().startsWith(base.toLowerCase()) ? msg : base, sub };
    }
    case "ORDER_ABILITIES":
      return pick("Order Triggers", "Drag to set the order. The leftmost resolves first.");
    case "ORDER_ATTACKERS":
      return pick("Order Attackers", "Drag to set the order.");
    case "ORDER_BLOCKERS":
      return pick("Order Blockers", "Drag to set the damage order.");
    case "YES_NO":
      return pick(p.sourceCardName ?? "Decide", "");
    case "CHOOSE_COLOR":
      return pick("Choose a Color", "");
    case "CHOOSE_NUMBER":
      return pick(/\bX\b/.test(msg) ? "Choose X" : "Choose a Number", "");
    default:
      if (m.kind === "targets" || m.kind === "cards") {
        // "Choose Up To 6", with Endstep's message ("Search for land cards.") under it.
        const noun = m.kind === "targets" ? "Target" : "a Card";
        const title = p.max >= 99 ? "Choose Any Number"
          : p.max > 1 ? (p.min < p.max ? `Choose Up To ${p.max}` : `Choose ${p.max}`)
          : `Choose ${noun}`;
        return { title, sub: msg || p.sourceCardName || "" };
      }
      return pick(p.sourceCardName ?? humanize(p.type), "");
  }
}

/** Mana symbols as Endstep shows them (Scryfall's card symbols). */
const MANA_SYMBOL_URL = "https://svgs.scryfall.io/card-symbols";
const MANA_COLORS: [string, string, string][] = [
  // [symbol, name, pool keys Endstep may use]
  ["W", "white", "white|w"], ["U", "blue", "blue|u"], ["B", "black", "black|b"],
  ["R", "red", "red|r"], ["G", "green", "green|g"], ["C", "colorless", "colorless|c"],
];

/** Floating mana: one symbol per color (W U B R G, then colorless) with its amount. While paying
    a cost, each is a button that spends one of that color. */
function manaPoolPips(pool: unknown, payable = false): string {
  if (!pool || typeof pool !== "object") return "";
  const amounts = new Map<string, number>();
  for (const [k, n] of Object.entries(pool as Record<string, unknown>)) {
    if (typeof n !== "number" || n <= 0) continue;
    const entry = MANA_COLORS.find(([, , keys]) => keys.split("|").includes(k.toLowerCase()));
    const sym = entry?.[0] ?? k.toUpperCase();
    amounts.set(sym, (amounts.get(sym) ?? 0) + n);
  }
  const order = [...MANA_COLORS.map(([s]) => s), ...[...amounts.keys()].filter((s) => !MANA_COLORS.some(([c]) => c === s))];
  return order.filter((s) => amounts.has(s)).map((s) => {
    const n = amounts.get(s)!;
    const name = MANA_COLORS.find(([c]) => c === s)?.[1] ?? s;
    const title = payable ? `${n} ${name} mana: click to pay with it` : `${n} ${name} mana floating`;
    const tag = payable ? "button" : "span";
    return `<${tag} class="mpip m-${esc(s.toLowerCase())}${payable ? " payable" : ""}" title="${esc(title)}"${payable ? ` data-spend="${esc(s)}"` : ""}>
      <i>${esc(s)}</i><img src="${MANA_SYMBOL_URL}/${esc(s)}.svg" alt="${esc(s)}" draggable="false"><b>${n}</b></${tag}>`;
  }).join("");
}

/** The edges of the cards under a pile's top card, as box-shadow layers: 1px each, alternating
    the dark card border with a faint lighter line. */
function pileEdge(thick: number): string {
  const layers: string[] = [];
  for (let i = 1; i <= thick; i++) layers.push(`0 ${i}px 0 ${i % 2 ? "#2b2219" : "#4a3c2b"}`);
  // A list of shadows can't contain "none".
  return layers.join(", ") || "0 0 0 transparent";
}

/** "Name: what it does" for an effect/emblem. */
function effectText(fx: CardView): string {
  return fx.oracleText ? `${fx.name}: ${fx.oracleText}` : fx.name;
}
