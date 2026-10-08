// The Arena-style game board. Renders a normalized GameState incrementally:
// every card is one element keyed by id, reused across zones, so any zone
// change (draw, cast, resolve, die, exile) animates with FLIP.
// All game actions go through GameController; this file never talks to
// Endstep directly.

import type { AbilityOption, CardView, DivideView, GameState, LogEntry, PendingActionView, PileView, PlayerView, SideboardView, StackItemView } from "../../game/GameState";
import { playerTargetKey, type GameController } from "../../game/GameController";
import { CARD_BACK_URL, chosenLabels, createBackEl, createCardEl, imageUrl, isFrontRow, isFullCard, isLand, lostKeywords, updateCardEl } from "./cards";
import { arrangeMove, canConfirm, clickInMode, deckColumns, defenderForKey, deriveMode, discardInHand, isProliferate, divideLeft, divideLocked, divideReady, divideShort, divideStart, divideStep, humanize, keyForDefender, learnStep, promptKey, sideboardChanged, sideboardCheck, sideboardMove, sideboardStacks, stepNumber, type Mode, type SideboardStack } from "./modes";
import { wheelFromAbilities, wheelFromStrings, wheelSvg, type WheelOption } from "./manaWheel";
import { currentStep, stepIndex, stepLabel, TURN_STEPS } from "./phases";
import type { PhaseStops, StopSide } from "../../game/endstep/phaseStops";
import { REPLAY_SPEEDS, type ReplayCommand, type ReplayStatus } from "../../game/ReplayPlayer";
import { avatarPicture } from "../../game/endstep/avatars";
import { ExileLinks } from "../../game/exileLinks";
import { HandKnowledge } from "../../game/handKnowledge";
import { keywordNotes } from "./keywords";
import { ANIM_SPEEDS, CARD_SCALES, type BoardPrefs } from "./prefs";
import { Sounds, type Sfx } from "./sounds";
import { waitingFor, type Waiting } from "../../game/waiting";
import { PASS_TARGETS, passLabel, passUntilStep, passUntilStops, startPassUntil, type PassTarget, type PassUntil } from "../../game/passUntil";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Animations turned off in the board's settings (as "reduce motion" does). */
let motionOff = false;
const reducedMotion = () => motionOff || matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Where the player moved the replay bar, kept across games. */
const REPLAY_BAR_KEY = "endstepArena.replayBar";
function readReplayBarAt(): { x: number; y: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(REPLAY_BAR_KEY) ?? "null") as { x?: unknown; y?: unknown } | null;
    return v && typeof v.x === "number" && typeof v.y === "number" && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null;
  } catch {
    return null;
  }
}
/** How long a reveal stays on screen (ms), unless closed sooner. */
const REVEAL_MS = 12_000;
/** A prompt answered from the search box: naming a card, or a type among more than a screenful. */
const searchedChoice = (p: PendingActionView) => p.type === "CHOOSE_CARD_NAME" || (p.type === "CHOOSE_TYPE" && p.stringOptions.length > 12);
/** Arrow key for the prompt text (target arrows start there). */
const PROMPT_KEY = "prompt";
/** Endstep's logo (the site's own icon), for a player without an avatar picture. */
const ENDSTEP_LOGO = `<img class="logo" src="/favicon.svg" alt="" draggable="false">`;
/** Clear space (px) kept around each player's avatar, so no card sits under it. */
const AVATAR_CLEARANCE = 16;
/** Identical permanents pile up to this many; more make another pile beside it. */
const MAX_PILE = 4;
/** Space between an enlarged card and its keyword boxes (px, as in the CSS). */
const KW_GAP = 10;

/** A card still gliding into its place (from the hand onto the stack, say) gets there now, so it's
    measured where it is, not halfway. */
function settle(el: HTMLElement): void {
  for (const a of el.getAnimations()) {
    if (a instanceof CSSAnimation || a instanceof CSSTransition) continue;
    try {
      a.finish();
    } catch {
      // An endless one can't be finished; it doesn't move the card anyway.
    }
  }
}

/** What a resolved spell or ability did to one target (see planHits). */
interface SpellHit {
  /** The stack item. */
  item: string;
  /** The target: a card id, or "player:<seat>". */
  key: string;
  kind: "damage" | "destroy" | "exile";
  /** The player hit, for a player target. */
  playerId?: string;
  dmg: number;
  /** It left the battlefield for a graveyard. */
  died: boolean;
  /** Players whose life the same spell changed otherwise, shown as this hit lands. */
  alsoRelease?: string[];
}

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
  /** Stops added for a while on top of the player's ("Pass until…"), or null to drop them. */
  setTemporaryStops(extra: Partial<Record<StopSide, string[]>> | null): void;
  /** The items of Endstep's own table menu (decklist, settings, concede…), or null without one. */
  tableMenu(): Promise<string[] | null>;
  /** Runs one of those items through Endstep's menu (its window shows while the board steps aside). */
  runTableItem(label: string): void;
  /** Drives the replay being watched (play, step, seek…). */
  replay(cmd: ReplayCommand): void;
  leaveReplay(): void;
  /** Stops watching someone else's game (Endstep's own way out). */
  leaveSpectate(): void;
  /** The player's board settings, and saving a change to them. */
  prefs(): BoardPrefs;
  setPrefs(patch: Partial<BoardPrefs>): void;
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
  /** Emblems (and effects whose card isn't in sight), by the player on whose side each is shown. */
  private emblems = new Map<string, { fx: CardView; owner: PlayerView }[]>();
  /** Cards exiled "until this leaves the battlefield", drawn under the permanent holding them. */
  private exileLinks = new ExileLinks(sessionStore());
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
  /** The result screen is set aside to look at the battlefield. */
  private endPeek = false;
  /** The game's result waits until then (ms, Date.now()), for the fight that ended it. */
  private endHoldUntil = 0;
  private endHoldTimer = 0;
  /** The ids Endstep may target a stack item by (its stack id, a spell's card id) → its element id. */
  private stackAlias = new Map<string, string>();
  /** The X you chose for what you're casting, by source card id and by "name:<card name>": shown
      on its stack item when Endstep doesn't send the value itself. */
  private chosenX = new Map<string, number>();
  /** The chosenX keys shown on a stack item so far: forgotten once that item is gone. */
  private xShown = new Set<string>();
  /** Hold priority (the dock toggle, or H): what you cast or activate doesn't pass priority after. */
  private holdPriority = false;
  /** "End turn" or "Pass until…": priority is passed for you until that point (see passUntil.ts). */
  private passUntil: PassUntil | null = null;
  /** The state priority was last passed on, so each one is answered once. */
  private passSeq: number | undefined;
  private hoverPerm: string | null = null;
  private drag: { id: string; startX: number; startY: number; el: HTMLElement; active: boolean; theirs: boolean } | null = null;
  /** The stack tray is tucked away (the player asked for a clear view of the battlefield). */
  private stackHidden = false;
  /** Reordering in the order box: the tile being dragged along the row. */
  private orderDrag: {
    id: string; startX: number; active: boolean;
    tiles: HTMLElement[]; ids: string[]; centers: number[]; step: number; from: number; to: number;
  } | null = null;
  private suppressClickUntil = 0;
  private zoomPinned = false;
  /** The last combat damage shown (match, turn and step), so it plays once. */
  private struck = "";
  /** Fighters that died in this update's combat damage (they stay to fight, then crumble). */
  private fallen = new Set<string>();
  /** Permanents that died in this update outside combat (they stay until they crumble). */
  private dying = new Set<string>();
  /** Permanents gone from the battlefield that stay in their place a little longer, as they were
      (`card`), for an animation to finish with them: fighting, crumbling, being hit by a bolt. */
  private lingering = new Map<string, { card: CardView; playerId: string; index: number }>();
  /** Shown as they were until the animation that changes them lands: a player's life, a
      permanent's damage (see hold and release). */
  private heldLife = new Map<string, number>();
  /** Until when (performance.now() ms) this board's animations are playing, for the pace states
      are shown at (see StatePacer). */
  private busy = 0;
  private heldDamage = new Map<string, number>();
  /** The replay's position slider is being dragged. */
  private replayScrubbing = false;
  /** Where the replay bar was moved to (its top left, as a share of the board), or null: top center. */
  private replayBarAt: { x: number; y: number } | null = readReplayBarAt();
  /** Updates the countdowns (lost connections, match clocks, idle timers) while there are any. */
  private timerTicker = 0;
  /** Clicked a permanent with several abilities: plain mana ones open the color wheel, the
      rest an Arena "Choose One". Both are local until an ability is picked. */
  private localWheel: { cardId: string; options: WheelOption[] } | null = null;
  private abilityPick: { cardId: string; abilities: AbilityOption[] } | null = null;
  /** The permanent whose "Add … mana" ability was just activated: a color it then asks for is
      picked on the wheel over it (Starting Town's "Pay 1 life: Add one mana of any color"). */
  private manaSource: string | null = null;
  /** The stack item a prompt is about (a trigger asking yes/no, choosing targets…): the question
      goes under it instead of on a card of its own. */
  private promptStackKey: string | null = null;
  /** The printing (set and number) each card was last seen with, by id and by owner + name: a
      spell on the stack (or a prompt's card) may come without it, and should keep the art its
      player chose instead of falling back to the default one. */
  private printings = new Map<string, { setCode: string; collectorNumber: string }>();
  /** Tokens seen on the table, by id and by "<controller>|<name>", for their art once they're gone. */
  private tokens = new Map<string, CardView>();
  /** Per permanent: who blocks it and what targets it (see groupKey). */
  private situation = new Map<string, string>();
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
  /** The hand card under the pointer (see hitHand): raised, with its neighbours moved aside. */
  private handHover: string | null = null;
  /** The same for a card fan (a pile being looked at, cards to choose from): the fan and the card's place in it. */
  private fanHover: { key: string; index: number } | null = null;
  /** Sideboarding: a card being dragged between the main deck and the sideboard. */
  private sbDrag: { el: HTMLElement; startX: number; startY: number; toMain: boolean; index: number; active: boolean } | null = null;
  /** Scry/surveil: a card being dragged between the piles. */
  private arrDrag: { id: string; startX: number; startY: number; el: HTMLElement; active: boolean } | null = null;
  private arrowsTimer = 0;
  /** Aiming an attacker: the pointer (client coordinates) its arrow follows. */
  private aimPoint: { x: number; y: number } | null = null;
  private aimFrame = 0;
  /** The player's settings (animations, card size, sounds, log). */
  private prefs: BoardPrefs;
  /** Watches the board for new animations while they play at another speed. */
  private speedWatch: MutationObserver | null = null;
  private speedFrame = 0;
  private sounds = new Sounds();
  /** What the game waits for when it isn't your move (see waiting.ts), for this update. */
  private waiting: Waiting | null = null;
  /** Backs for the hand of the player watched from, when it isn't shown (see renderHand). */
  private spectateBacks: HTMLElement[] = [];

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
        <div class="emblems"></div>
        <div class="row back"><div class="cluster lands"></div><div class="cluster others"></div><div class="cluster full"></div></div>
        <div class="row front"></div>
      </section>
      <div class="midline">
        <div class="turn-label"></div>
      </div>
      <section class="side me">
        <div class="emblems"></div>
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
      <div class="div-badges"></div>
      <aside class="log" aria-label="Game log">
        <div class="log-head"><b>Game log</b><button class="log-x" data-ui="log" title="Hide the log (L)">✕</button></div>
        <div class="log-list"></div>
        <div class="log-peek"></div>
      </aside>
      <div class="corner">
        <button class="ghost" data-ui="log" title="Game log (L)">Log</button>
        <button class="ghost" data-ui="debug" title="Debug panel (Alt+Shift+D)">Debug</button>
        <button class="ghost" data-ui="hide" title="Show Endstep's classic UI (Alt+Shift+A)">Classic UI</button>
      </div>
      <div class="mana-wheel"></div>
      <div class="zoom" aria-hidden="true"></div>
      <div class="reveals" aria-live="polite"></div>
      <div class="menu" role="menu"></div>
      <div class="confirm" role="dialog"></div>
      <div class="settings" role="dialog" aria-label="Arena UI settings"></div>
      <div class="viewer"></div>
      <div class="banner"></div>
      <div class="endgame"></div>
      <div class="replay-bar" role="toolbar" aria-label="Replay controls"></div>
      <div class="spectate-bar" role="status"></div>
      <div class="toast"></div>
      <div class="classic-chip"></div>`;
    this.prefs = hooks.prefs();
    this.applyPrefs();
    this.bindEvents();
    this.bindLog();
    new ResizeObserver(() => {
      this.layout();
      // A moved replay bar stays whole on the board.
      if (this.replayBarAt) this.placeReplayBar(this.q(".replay-bar"));
    }).observe(this.el);
  }

  // ---------------------------------------------------------------- public

  update(state: GameState | null): void {
    const prev = this.state;
    this.state = state;
    if (!state) {
      this.el.classList.remove("live");
      this.stopPassing();
      return;
    }
    this.el.classList.add("live");
    if (prev?.seq !== state.seq) this.setAwaiting(false);
    this.linked = this.exileLinks.update(prev, state);
    this.knownHands = this.handKnowledge.update(state);

    const key = promptKey(state);
    if (key !== this.modeKey) {
      this.modeKey = key;
      const next = deriveMode(state);
      // A reissued sideboarding prompt (the opponent submitted, time ticks…) keeps your changes.
      const was = this.mode;
      this.mode = was.kind === "sideboard" && next.kind === "sideboard" && was.deck === next.deck ? { ...next, main: was.main } : next;
      this.peeking = false;
      this.localWheel = null;
      this.abilityPick = null;
      this.hideMenu();
    }
    this.autoPass(state);
    this.render(prev);
  }

  /** After "End turn" or "Pass until…": passes priority at every stop on the way (and attacks
      with nothing). Arriving, an opponent's spell or ability, or any other question ends it. */
  private autoPass(state: GameState): void {
    const pu = this.passUntil;
    if (!pu) return;
    const step = passUntilStep(pu, state);
    if (step === "stop") return this.stopPassing();
    if (step === "wait" || state.seq === this.passSeq) return;
    if (step === "pass") this.controller.passPriority();
    else this.controller.declareAttackers(new Map(), false);
    this.passSeq = state.seq;
    this.setAwaiting(true);
  }

  private startPassing(target: PassTarget): void {
    const state = this.state;
    if (!state) return;
    this.passUntil = startPassUntil(target, state);
    this.passSeq = undefined;
    // The server learns where to stop before priority is passed.
    this.hooks.setTemporaryStops(passUntilStops(this.passUntil));
    this.autoPass(state);
    if (this.passUntil && target !== "endTurn") this.toast(`Passing until ${passLabel(target)}`);
  }

  private stopPassing(): void {
    if (!this.passUntil) return;
    this.passUntil = null;
    this.hooks.setTemporaryStops(null);
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

  // ---------------------------------------------------------------- settings

  /** Puts the player's settings into effect: animations on or off and their speed, card size,
      sound volume, the game log. */
  private applyPrefs(): void {
    const p = this.prefs;
    motionOff = !p.animations;
    this.el.classList.toggle("still", !p.animations);
    this.el.style.setProperty("--cs", String(p.cardScale));
    // At another speed, every animation that starts is set to it (CSS ones start as classes
    // change or elements come in, so the board is watched for those).
    const other = this.speed !== 1;
    if (other && !this.speedWatch) {
      this.speedWatch = new MutationObserver(() => {
        if (this.speedFrame) return;
        this.speedFrame = requestAnimationFrame(() => {
          this.speedFrame = 0;
          this.syncSpeed();
        });
      });
      this.speedWatch.observe(this.el, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    } else if (!other && this.speedWatch) {
      this.speedWatch.disconnect();
      this.speedWatch = null;
    }
    this.syncSpeed();
    this.sounds.setVolume(p.sound ? p.volume : 0);
    this.el.classList.toggle("log-open", p.logOpen);
    if (this.state) {
      this.renderLog(this.state);
      this.layout();
    }
  }

  /** Until when (performance.now() ms) the animations started so far are playing. */
  busyUntil(): number {
    return this.busy;
  }

  /** How long a state worth seeing (a spell cast, attackers declared) stays on screen before the
      next one (ms); 0 with animations off. */
  dwellMs(): number {
    return reducedMotion() ? 0 : 450 / this.speed;
  }

  /** An animation running `ms` (at normal speed) from now: the next state waits for it. */
  private busyFor(ms: number): void {
    this.busy = Math.max(this.busy, performance.now() + ms / this.speed);
  }

  /** A sound for what just happened (when sounds are on). */
  private sfx(name: Sfx): void {
    if (this.state && !document.hidden) this.sounds.play(name);
  }

  /** How fast animations play (1: as designed). */
  private get speed(): number {
    return this.prefs.animations ? this.prefs.animSpeed : 1;
  }

  private syncSpeed(): void {
    const rate = this.speed;
    for (const a of this.el.getAnimations({ subtree: true })) if (a.playbackRate !== rate) a.playbackRate = rate;
  }

  /** A step of an animation's choreography, `ms` later at the chosen speed. */
  private later(fn: () => void, ms: number): number {
    return window.setTimeout(() => {
      fn();
      if (this.speed !== 1) this.syncSpeed();
    }, ms / this.speed);
  }

  private setPref(patch: Partial<BoardPrefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    this.hooks.setPrefs(patch);
    this.applyPrefs();
    // Sounds turned on, or the volume set: one to hear it by.
    if (patch.volume !== undefined || patch.sound) this.sounds.play("resolve");
    if (this.q(".settings").classList.contains("open")) this.renderSettings();
  }

  /** The board's settings, from the table menu: animations, their speed, card size, sounds. */
  private renderSettings(): void {
    const p = this.prefs;
    const seg = (key: keyof BoardPrefs, options: { value: number | boolean; label: string }[], disabled = false) =>
      `<div class="seg${disabled ? " off" : ""}">${options.map((o) =>
        `<button class="${p[key] === o.value ? "on" : ""}" data-pref="${key}:${String(o.value)}"${disabled ? " disabled" : ""}>${esc(o.label)}</button>`).join("")}</div>`;
    const onOff = [{ value: true, label: "On" }, { value: false, label: "Off" }];
    const box = this.q(".settings");
    box.dataset.panel = "settings";
    box.innerHTML = `<div class="phead"><h2>Arena UI settings</h2><p>Saved for every game.</p></div>
      <div class="set-rows">
        <div class="set-row"><span>Animations</span>${seg("animations", onOff)}</div>
        <div class="set-row"><span>Animation speed</span>${seg("animSpeed", ANIM_SPEEDS, !p.animations)}</div>
        <div class="set-row"><span>Card size</span>${seg("cardScale", CARD_SCALES)}</div>
        <div class="set-row"><span>Sounds</span>${seg("sound", onOff)}</div>
        <div class="set-row"><span>Volume</span><input type="range" class="vol" min="0" max="100" step="5" value="${Math.round(p.volume * 100)}" data-pref-range="volume"${p.sound ? "" : " disabled"}></div>
      </div>
      <div class="choices big"><button class="opt primary" data-ui="settings-close">Done</button></div>`;
    box.classList.add("open");
  }

  /** This board's keyboard shortcuts (?, or the table menu), in the settings' panel. */
  private renderShortcuts(): void {
    const key = (k: string) => k.split(" ").map((part) => (/^([a-z]+|…)$/.test(part) ? esc(part) : `<kbd>${esc(part)}</kbd>`)).join(" ");
    const groups: [string, [string, string][]][] = [
      ["Any time", [
        ["H", "Hold priority after what you cast or activate (again: let it pass)"],
        ["L", "Game log, shown or hidden"],
        ["?", "This list"],
        ["Esc", "Close a menu or panel; stop aiming an attacker"],
        ["Alt+Shift+A", "Arena board or Endstep's own UI"],
        ["Alt+Shift+D", "Debug panel"],
      ]],
      ["Choosing a number (X…)", [
        ["↑ ↓", "One more or one less (with Shift: 5)"],
        ["1 … 9 0", "The quick picks, in order"],
        ["Enter", "Choose it"],
      ]],
      ["Dividing damage", [
        ["Space or Enter", "Done / Submit, once it's all assigned"],
        ["R", "Start again"],
      ]],
      ["Watching a replay", [
        ["Space", "Play or pause"],
        ["← →", "Previous or next change"],
        ["Shift+← Shift+→", "Previous or next turn"],
      ]],
      ["Mouse", [
        ["Right-click a card", "See it big (and its options)"],
        ["Right-click the table", "Game menu: log, settings, Endstep's items"],
      ]],
    ];
    const box = this.q(".settings");
    box.dataset.panel = "shortcuts";
    box.innerHTML = `<div class="phead"><h2>Keyboard shortcuts</h2><p>Endstep's own shortcuts keep working too: table menu → Keyboard shortcuts.</p></div>
      <div class="keys">${groups.map(([title, rows]) => `<section><h3>${esc(title)}</h3>${rows.map(([k, what]) =>
        `<div class="key-row"><span class="kk">${key(k)}</span><span>${esc(what)}</span></div>`).join("")}</section>`).join("")}</div>
      <div class="choices big"><button class="opt primary" data-ui="settings-close">Done</button></div>`;
    box.classList.add("open");
  }

  private onPrefButton(btn: HTMLElement): void {
    const [key, raw] = btn.dataset.pref!.split(":") as [keyof BoardPrefs, string];
    const value = raw === "true" ? true : raw === "false" ? false : Number(raw);
    this.setPref({ [key]: value } as Partial<BoardPrefs>);
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
    this.el.classList.toggle("proliferating", !!state.pending && isProliferate(state.pending) && !state.replay && !state.spectating);
    this.renderClassicChip(classic);

    this.captureFallen(prev, state);
    const casts = this.captureCasts();
    const exiled = this.captureExiled(prev, state);
    // FLIP "first": where every card is before this update.
    const first = new Map<string, DOMRect>();
    if (!reducedMotion()) {
      for (const [id, el] of this.cardEls) if (el.isConnected && el.getClientRects().length) first.set(id, el.getBoundingClientRect());
    }
    const spots = this.captureStackSpots(prev);
    // What this update's animations will hit: until they land, the life and damage they change
    // stay as they were, and what they kill stays where it stood.
    const hits = this.planHits(prev, state);
    this.planCombat(prev, state);
    this.captureDeaths(prev, state);

    this.used.clear();
    this.cardData.clear();
    for (const p of state.players) {
      for (const zone of [p.battlefield, p.graveyard, p.exile, p.commandZone, p.effects, p.libraryTop, p.hand ?? []]) {
        for (const c of zone) this.cardData.set(c.id, c);
      }
    }
    for (const c of this.cardData.values()) this.rememberPrinting(c);
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
    // What else is going on with each permanent, so only the ones in the same situation pile
    // together: the creatures blocking it, and the stack items targeting it.
    this.situation.clear();
    const note = (id: string, what: string) => this.situation.set(id, `${this.situation.get(id) ?? ""}${what};`);
    for (const c of onBattlefield.values()) for (const a of c.blockingIds) note(a, `blocked:${c.id}`);
    for (const s of state.stack) for (const t of s.targets) note(t, `target:${s.id}`);
    this.renderBattlefield(this.q(".side.me"), this.withLingering(z.me), attachedTo);
    this.renderBattlefield(this.q(".side.opp"), this.withLingering(z.opp), attachedTo);
    this.renderEmblems(this.q(".side.me .emblems"), z.me);
    this.renderEmblems(this.q(".side.opp .emblems"), z.opp);
    this.renderHand(z.me);
    this.renderSideHand(state);
    this.renderOppHand(z.opp);
    const casting = this.pendingStackItem(state, z.me);
    this.renderStack(casting ? [casting, ...state.stack] : state.stack, z.me?.id);
    this.renderPiles(this.q(".me-piles"), z.me);
    this.renderPiles(this.q(".opp-piles"), z.opp);

    // Drop elements for cards that left every rendered zone (library, hidden…).
    for (const [id, el] of this.cardEls) if (!this.used.has(id)) { el.remove(); this.cardEls.delete(id); }
    for (const [id, el] of this.slotEls) if (!this.used.has(`slot:${id}`)) { el.remove(); this.slotEls.delete(id); }

    this.waiting = waitingFor(state, z.me);
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
    this.renderLog(state);
    this.layout();
    this.renderManaWheel(state);

    // FLIP "last/invert/play" for cards that moved.
    if (first.size) {
      for (const [id, el] of this.cardEls) {
        // A spell that left the stack for the battlefield, graveyard or exile flies there.
        const cast = casts.get(id);
        if (cast && !this.stackEls.has(id) && el.closest(".side, .pile-card") && el.getClientRects().length) {
          this.flyFromStack(el, cast);
          continue;
        }
        // A permanent exiled from the battlefield is drawn into the exile vortex (below).
        if (exiled.has(id) && !el.closest(".side")) continue;
        const a = first.get(id);
        if (!a) {
          if (prev && el.classList.contains("token") && el.closest(".side")) this.tokenEntrance(el);
          else if (prev) el.animate([{ opacity: 0, scale: "0.85" }, { opacity: 1, scale: "1" }], { duration: 220, easing: "ease-out" });
          continue;
        }
        if (!el.getClientRects().length) continue;
        const b = el.getBoundingClientRect();
        const dx = a.left + a.width / 2 - (b.left + b.width / 2);
        const dy = a.top + a.height / 2 - (b.top + b.height / 2);
        if (Math.abs(dx) + Math.abs(dy) < 3) continue;
        el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
        this.busyFor(320);
      }
      // An exile a spell's bolt is on its way to waits for the bolt (see playHits).
      const byBolt = new Set(hits.filter((h) => h.kind === "exile").map((h) => h.key));
      for (const [id, gone] of exiled) {
        const el = this.cardEls.get(id);
        // Held under the permanent that exiled it (Banisher Priest): it just slides there.
        if (!el?.closest(".side") && !byBolt.has(id)) this.banish(gone, el);
      }
      this.playHits(hits, spots, first, exiled);
      this.statChanges(prev, state);
      this.zoneSounds(prev, state);
    }
    this.scheduleArrows();
    if (this.q(".viewer").classList.contains("open")) this.refreshViewer();
    this.chargeAttackers(prev, state);
    this.combatStrike(prev, state);
    // This update's animations play at the chosen speed from their first frame.
    if (this.speed !== 1) this.syncSpeed();
  }

  /** Which combat damage this update reaches: "fs" (first strike), "cd" (regular), or null. */
  private damageStep(prev: GameState | null, state: GameState): "fs" | "cd" | null {
    if (!prev || prev.turnNumber !== state.turnNumber || !prev.combat.attacks.length) return null;
    const from = stepIndex(currentStep(prev.phase, prev.step) ?? "");
    const to = stepIndex(currentStep(state.phase, state.step) ?? "");
    if (from < 0 || from >= stepIndex("COMBAT_DAMAGE")) return null;
    // The game ended in combat damage: Endstep may finish it where it was, without moving on
    // to the damage step. Someone lost life, or a creature in the fight died.
    if (state.status === "COMPLETE" && prev.status !== "COMPLETE" && from >= stepIndex("DECLARE_ATTACKERS") && (to < 0 || to <= from)) {
      const alive = new Set(state.players.flatMap((p) => p.battlefield.map((c) => c.id)));
      const hurt = state.players.some((p) => (p.life ?? 0) < (prev.players.find((q) => q.id === p.id)?.life ?? 0))
        || [...prev.combat.attacks, ...prev.combat.blocks].some((l) => !alive.has(l.fromId));
      return hurt ? "cd" : null;
    }
    if (to < stepIndex("FIRST_STRIKE_DAMAGE")) return null;
    return to === stepIndex("FIRST_STRIKE_DAMAGE") ? "fs" : "cd";
  }

  /**
   * As combat damage begins: a creature in the fight that this update takes off the battlefield
   * (it died) leaves a copy where it stood, which takes its part in the fight and then burns
   * away, as in Arena, instead of the card sliding straight to the graveyard.
   */
  private captureFallen(prev: GameState | null, state: GameState): void {
    this.fallen = new Set();
    if (reducedMotion() || !prev || !this.damageStep(prev, state)) return;
    const alive = new Set(state.players.flatMap((p) => p.battlefield.map((c) => c.id)));
    const fighters = new Set([...prev.combat.attacks.map((a) => a.fromId), ...prev.combat.blocks.map((b) => b.fromId)]);
    for (const id of fighters) {
      const el = this.cardEls.get(id);
      if (alive.has(id) || !el?.isConnected || !el.closest(".side")) continue;
      this.linger(prev, id);
      this.fallen.add(id);
    }
  }

  /** Keeps a permanent `prev` had on the battlefield in its place, as it was, until let go. */
  private linger(prev: GameState, id: string): void {
    for (const p of prev.players) {
      const index = p.battlefield.findIndex((c) => c.id === id);
      if (index >= 0) this.lingering.set(id, { card: p.battlefield[index]!, playerId: p.id, index });
    }
  }

  /** Lets a lingering permanent go: it leaves the table, and shows where it really is now. */
  private unlinger(id: string): void {
    if (!this.lingering.delete(id)) return;
    // Made again where it went (no slide from the table: it crumbled or flew there).
    this.cardEls.get(id)?.remove();
    this.cardEls.delete(id);
    if (this.state) this.render(this.state);
  }

  /** The player's permanents with the ones lingering put back where they stood. */
  private withLingering(p: PlayerView | null): PlayerView | null {
    if (!p || !this.lingering.size) return p;
    const battlefield = [...p.battlefield];
    for (const [id, l] of this.lingering) {
      if (l.playerId !== p.id || battlefield.some((c) => c.id === id)) continue;
      battlefield.splice(Math.min(l.index, battlefield.length), 0, l.card);
    }
    return { ...p, battlefield };
  }

  /**
   * Before an update: where each spell on the stack is, and a copy of it as the stack shows it
   * (full card), for the ones this update takes off the stack to fly from.
   */
  private captureCasts(): Map<string, { rect: DOMRect; ghost: HTMLElement }> {
    const casts = new Map<string, { rect: DOMRect; ghost: HTMLElement }>();
    if (reducedMotion()) return casts;
    for (const id of this.stackEls.keys()) {
      const el = this.cardEls.get(id);
      if (id.startsWith("ab:") || !el?.isConnected || !el.closest(".stack") || el.closest(".stack-dock.collapsed") || !el.getClientRects().length) continue;
      settle(el);
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("data-id");
      ghost.removeAttribute("style");
      ghost.className = "card flying";
      for (const k of ["has-img", "mine", "theirs"]) if (el.classList.contains(k)) ghost.classList.add(k);
      const img = ghost.querySelector<HTMLImageElement>("img.img");
      if (img && !ghost.classList.contains("has-img")) img.addEventListener("load", () => ghost.classList.add("has-img"), { once: true });
      casts.set(id, { rect: el.getBoundingClientRect(), ghost });
    }
    return casts;
  }

  /**
   * A spell leaving the stack, as in Arena: a full-size copy lifts off the stack in an arc and
   * shrinks onto where the card went (its place on the battlefield, or the graveyard or exile
   * pile), where the card itself takes over and settles in.
   */
  private flyFromStack(el: HTMLElement, from: { rect: DOMRect; ghost: HTMLElement }): void {
    const box = this.el.getBoundingClientRect();
    const a = from.rect;
    const b = el.getBoundingClientRect();
    const ghost = from.ghost;
    const toPile = !el.closest(".side");
    const DURATION = toPile ? 520 : 600;
    const LAND = 0.82;
    this.busyFor(DURATION);
    this.later(() => this.sfx("resolve"), DURATION * LAND);
    // A rect `t` of the way from the stack to the destination, raised by `lift` px.
    const at = (t: number, lift = 0): Keyframe => ({
      left: `${a.left + (b.left - a.left) * t - box.left}px`,
      top: `${a.top + (b.top - a.top) * t - box.top - lift}px`,
      width: `${a.width + (b.width - a.width) * t}px`,
      height: `${a.height + (b.height - a.height) * t}px`,
    });
    // Into a pile it turns a little, as a card tossed onto it.
    const turn = toPile ? (b.left < a.left ? -14 : 14) : 0;
    ghost.style.setProperty("--cw", `${a.width}px`);
    Object.assign(ghost.style, at(0));
    this.el.appendChild(ghost);
    const anim = ghost.animate([
      { ...at(0), rotate: "0deg", opacity: 1, offset: 0 },
      { ...at(0.08, 18), rotate: `${turn * 0.3}deg`, offset: 0.14, easing: "cubic-bezier(.4,0,.2,1)" },
      { ...at(0.55, 46), rotate: `${turn}deg`, offset: 0.5, easing: "cubic-bezier(.3,0,.4,1)" },
      { ...at(1), rotate: "0deg", opacity: 1, offset: LAND },
      { ...at(1), rotate: "0deg", opacity: 0, offset: 1 },
    ], { duration: DURATION, easing: "linear" });
    void anim.finished.catch(() => {}).then(() => ghost.remove());
    // The card itself shows as the copy lands, and settles into place.
    el.animate([{ opacity: 0 }, { opacity: 0, offset: LAND }, { opacity: 1 }], { duration: DURATION });
    el.animate([{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 260, delay: DURATION * LAND, easing: "cubic-bezier(.2,.8,.3,1)", composite: "add" });
  }

  /**
   * Before an update: the permanents it moves from the battlefield into exile, each with where it
   * stands and a copy of it as it looks there, to banish.
   */
  private captureExiled(prev: GameState | null, state: GameState): Map<string, { rect: DOMRect; ghost: HTMLElement; playerId: string }> {
    const out = new Map<string, { rect: DOMRect; ghost: HTMLElement; playerId: string }>();
    if (!prev || reducedMotion() || prev.matchId !== state.matchId) return out;
    const wasOut = new Set(prev.players.flatMap((p) => p.battlefield.map((c) => c.id)));
    const box = this.el.getBoundingClientRect();
    for (const p of state.players) for (const c of p.exile) {
      const el = this.cardEls.get(c.id);
      if (!wasOut.has(c.id) || this.fallen.has(c.id) || !el?.isConnected || !el.closest(".side") || !el.getClientRects().length) continue;
      // Its size on screen, as the combat copies take it (the box around a tapped card is turned).
      const r = el.getBoundingClientRect();
      const rotate = getComputedStyle(el).rotate === "none" ? "0deg" : getComputedStyle(el).rotate;
      const turn = (parseFloat(rotate) || 0) * (Math.PI / 180);
      const scale = r.width / (el.offsetWidth * Math.abs(Math.cos(turn)) + el.offsetHeight * Math.abs(Math.sin(turn)) || 1);
      const w = el.offsetWidth * scale;
      const h = el.offsetHeight * scale;
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("data-id");
      ghost.removeAttribute("style");
      ghost.className = "card flying exiling";
      const img = ghost.querySelector<HTMLImageElement>("img.img");
      if (el.classList.contains("has-img") || (img?.complete && img.naturalWidth)) ghost.classList.add("has-img");
      else img?.addEventListener("load", () => ghost.classList.add("has-img"), { once: true });
      Object.assign(ghost.style, {
        left: `${r.left + r.width / 2 - box.left - w / 2}px`,
        top: `${r.top + r.height / 2 - box.top - h / 2}px`,
        width: `${w}px`,
        height: `${h}px`,
        rotate,
      });
      ghost.style.setProperty("--cw", `${w}px`);
      out.set(c.id, { rect: r, ghost, playerId: p.id });
    }
    return out;
  }

  /**
   * A permanent exiled from the battlefield: where it stood it flares up in pale violet light,
   * then spins away, shrinking, into its owner's exile vortex, which flares as it swallows it.
   * The card itself shows on the pile once it's in.
   */
  private banish(gone: { rect: DOMRect; ghost: HTMLElement; playerId: string }, el: HTMLElement | undefined): void {
    const pile = this.el.querySelector<HTMLElement>(`.pile[data-zone="exile"][data-player="${CSS.escape(gone.playerId)}"]`);
    const hole = pile?.querySelector<HTMLElement>(".vortex") ?? pile;
    if (!hole?.getClientRects().length) return;
    const box = this.el.getBoundingClientRect();
    const a = gone.rect;
    const b = hole.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const small = Math.max(0.08, (b.width * 0.35) / Math.max(1, a.width));
    const DURATION = 1000;
    const FLARE = 0.3;
    this.busyFor(DURATION + 150);
    this.sfx("exile");
    gone.ghost.style.removeProperty("visibility");
    const ghost = gone.ghost;
    const start = ghost.style.rotate || "0deg";
    this.el.appendChild(ghost);
    const anim = ghost.animate([
      { translate: "0px 0px", scale: "1", rotate: start, filter: "none", opacity: 1, offset: 0 },
      { translate: "0px -6px", scale: "1.08", rotate: start, filter: "brightness(2.2) saturate(0.3)", opacity: 1, offset: FLARE, easing: "cubic-bezier(.5,0,.7,.4)" },
      { translate: `${dx}px ${dy}px`, scale: `${small}`, rotate: `calc(${start} + 540deg)`, filter: "brightness(1.6) saturate(0.2) blur(1px)", opacity: 0.2, offset: 1 },
    ], { duration: DURATION });
    void anim.finished.catch(() => {}).then(() => ghost.remove());
    // The flare where it stood.
    const burst = document.createElement("div");
    burst.className = "exile-burst";
    burst.style.left = `${a.left + a.width / 2 - box.left}px`;
    burst.style.top = `${a.top + a.height / 2 - box.top}px`;
    this.el.appendChild(burst);
    this.later(() => burst.remove(), 800);
    // The vortex flares as it takes the card in; the card shows on the pile then.
    hole.animate([{ scale: "1", filter: "none" }, { scale: "1.22", filter: "brightness(1.8) drop-shadow(0 0 18px rgba(190, 160, 255, 0.9))" }, { scale: "1", filter: "none" }],
      { duration: 420, delay: DURATION * 0.85, easing: "ease-out" });
    if (el?.isConnected && el.closest(".pile-card")) el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.9 }, { opacity: 1 }], { duration: DURATION + 150 });
  }

  /** Before an update: where each item on the stack is (the "◂ Stack" pill when it's folded away). */
  private captureStackSpots(prev: GameState | null): Map<string, DOMRect> {
    const spots = new Map<string, DOMRect>();
    if (!prev || reducedMotion()) return spots;
    for (const s of prev.stack) {
      const el = this.cardEls.get(this.stackAlias.get(s.id) ?? "");
      if (!el?.isConnected || !el.closest(".stack") || !el.getClientRects().length) continue;
      settle(el);
      spots.set(s.id, el.closest(".stack-dock.collapsed") ? this.q(".stack-toggle").getBoundingClientRect() : el.getBoundingClientRect());
    }
    return spots;
  }

  // ---------------------------------------------------------------- impacts

  /**
   * What this update's spells and abilities do to their targets as they resolve, read from the
   * states (Endstep sends no event per hit): a target that lost life or took damage ("damage"),
   * one that left the battlefield for a graveyard ("destroy", or "damage" when the text deals
   * damage: it died of it) or for exile ("exile").
   */
  private planHits(prev: GameState | null, state: GameState): SpellHit[] {
    if (!prev || reducedMotion() || prev.matchId !== state.matchId) return [];
    const still = new Set(state.stack.map((s) => s.id));
    const before = new Map(prev.players.flatMap((p) => p.battlefield.map((c) => [c.id, c] as const)));
    const after = new Map(state.players.flatMap((p) => p.battlefield.map((c) => [c.id, c] as const)));
    const exiled = new Set(state.players.flatMap((p) => p.exile.map((c) => c.id)));
    const hits: SpellHit[] = [];
    for (const s of prev.stack) {
      if (still.has(s.id) || !s.targets.length) continue;
      const text = s.isAbility ? s.name : s.card?.oracleText ?? "";
      const deals = !text || /\bdamage\b/i.test(text);
      for (const key of s.targets) {
        if (key.startsWith("player:")) {
          const seat = Number(key.slice(7));
          const was = prev.players.find((p) => p.seat === seat);
          const now = state.players.find((p) => p.seat === seat);
          if (!deals || was?.life === undefined || now?.life === undefined || now.life >= was.life) continue;
          hits.push({ item: s.id, key, kind: "damage", playerId: now.id, dmg: was.life - now.life, died: false });
          continue;
        }
        const was = before.get(key);
        if (!was) continue;
        const now = after.get(key);
        if (now) {
          const dmg = s.divided?.[key] ?? (now.damage ?? 0) - (was.damage ?? 0);
          if (dmg > 0) hits.push({ item: s.id, key, kind: "damage", dmg, died: false });
        } else if (exiled.has(key)) {
          hits.push({ item: s.id, key, kind: "exile", dmg: 0, died: false });
        } else {
          // It died: of the damage (what was left of its toughness), or destroyed outright.
          const dmg = deals ? s.divided?.[key] ?? Math.max(0, (Number(was.toughness) || 0) - (was.damage ?? 0)) : 0;
          hits.push({ item: s.id, key, kind: dmg > 0 ? "damage" : "destroy", dmg, died: true });
        }
      }
    }
    // Other life it changes (Swords to Plowshares' controller gaining life, a drain) shows as its
    // last hit lands.
    const last = hits.at(-1);
    if (last) {
      const hitPlayers = new Set(hits.map((h) => h.playerId));
      for (const p of state.players) {
        const was = prev.players.find((q) => q.id === p.id)?.life;
        if (hitPlayers.has(p.id) || was === undefined || p.life === undefined || was === p.life) continue;
        this.hold("life", p.id, was);
        last.alsoRelease = [...(last.alsoRelease ?? []), p.id];
      }
    }
    for (const h of hits) {
      if (h.kind === "exile") this.linger(prev, h.key);
      if (h.playerId) this.hold("life", h.playerId, prev.players.find((p) => p.id === h.playerId)?.life);
      else if (!h.died && h.kind === "damage") this.hold("damage", h.key, before.get(h.key)?.damage ?? 0);
    }
    // A game won by a spell: the result waits for the hit.
    if (hits.length) this.endHoldUntil = Math.max(this.endHoldUntil, Date.now() + (900 + 240 * new Set(hits.map((h) => h.item)).size) / this.speed);
    return hits;
  }

  /** Combat damage about to be shown: each life total and each fighter's damage stays as it was
      until the blow that changes it lands (see combatStrike). */
  private planCombat(prev: GameState | null, state: GameState): void {
    const step = prev && !reducedMotion() ? this.damageStep(prev, state) : null;
    if (!prev || !step || this.struck === `${state.matchId}:${state.turnNumber}:${step}`) return;
    for (const p of state.players) {
      const was = prev.players.find((q) => q.id === p.id)?.life;
      if (was !== undefined && p.life !== undefined && was !== p.life) this.hold("life", p.id, was);
    }
    const before = new Map(prev.players.flatMap((p) => p.battlefield.map((c) => [c.id, c] as const)));
    const fighters = [...prev.combat.attacks.map((a) => a.fromId), ...prev.combat.blocks.map((b) => b.fromId)];
    for (const p of state.players) for (const c of p.battlefield) {
      const was = before.get(c.id);
      if (was && fighters.includes(c.id) && (c.damage ?? 0) !== (was.damage ?? 0)) this.hold("damage", c.id, was.damage ?? 0);
    }
  }

  /** Keeps a player's life (or a permanent's damage) showing `value` until released, or for a few
      seconds at most. */
  private hold(kind: "life" | "damage", key: string, value: number | undefined): void {
    if (value === undefined) return;
    const map = kind === "life" ? this.heldLife : this.heldDamage;
    if (map.has(key)) return;
    map.set(key, value);
    this.later(() => this.release(key), 4000);
  }

  /** An animation landed on `key` (a player id or a card id): its real life or damage shows now. */
  private release(key: string): void {
    if (this.heldLife.delete(key)) {
      const p = this.state?.players.find((pl) => pl.id === key);
      const orb = this.el.querySelector<HTMLElement>(`.life-orb[data-player="${CSS.escape(key)}"]`);
      if (p && orb) this.showLife(orb, p);
    }
    if (this.heldDamage.delete(key)) {
      const c = this.cardData.get(key);
      const el = this.cardEls.get(key);
      if (c && el?.closest(".side")) updateCardEl(el, c, true);
    }
  }

  /** A player's life total on their orb (as held while an animation is on its way), with the
      gain or loss floating up when it changes. */
  private showLife(orb: HTMLElement, p: PlayerView): void {
    const shown = this.heldLife.get(p.id) ?? p.life;
    const prev = this.prevLife.get(p.id);
    if (shown !== undefined) this.prevLife.set(p.id, shown);
    const life = String(shown ?? "–");
    if (orb.dataset.life !== life) {
      orb.dataset.life = life;
      orb.querySelector(".lnum")?.remove();
      orb.insertAdjacentHTML("beforeend", `<span class="lnum" title="${esc(p.name)}'s life">${life}</span>`);
    }
    if (prev !== undefined && shown !== undefined && prev !== shown) this.lifeFloat(orb, shown - prev);
  }

  /**
   * Before an update: permanents it puts into a graveyard outside combat (destroyed, killed by a
   * spell, sacrificed, a token gone). Each stays where it stood and crumbles into smoke there
   * (when a spell's bolt lands on it, if one is on its way; else right away).
   */
  private captureDeaths(prev: GameState | null, state: GameState): void {
    this.dying = new Set();
    if (!prev || reducedMotion() || prev.matchId !== state.matchId) return;
    const alive = new Set(state.players.flatMap((p) => p.battlefield.map((c) => c.id)));
    const buried = new Set(state.players.flatMap((p) => p.graveyard.map((c) => c.id)));
    const elsewhere = new Set(state.players.flatMap((p) => [...p.exile, ...(p.hand ?? []), ...p.commandZone].map((c) => c.id)));
    for (const p of prev.players) for (const c of p.battlefield) {
      if (alive.has(c.id) || this.fallen.has(c.id)) continue;
      // Into a graveyard, or a token that ceased to exist (not bounced or exiled).
      if (!buried.has(c.id) && !(c.isToken && !elsewhere.has(c.id))) continue;
      const el = this.cardEls.get(c.id);
      if (!el?.isConnected || !el.closest(".side") || !el.getClientRects().length) continue;
      this.linger(prev, c.id);
      this.dying.add(c.id);
    }
  }

  /** A permanent that died crumbles into smoke where it stood, then leaves the table for its
      graveyard (the cards beside it close the gap). */
  private crumble(id: string, after = 0): void {
    this.later(() => {
      const el = this.cardEls.get(id);
      if (!el?.closest(".side")) return this.unlinger(id);
      const smoke = document.createElement("div");
      smoke.className = "smoke";
      el.appendChild(smoke);
      el.classList.add("perishing");
      this.later(() => {
        el.classList.remove("perishing");
        smoke.remove();
        this.unlinger(id);
      }, 900);
    }, after);
  }

  /**
   * After an update, the spells' hits: a bolt from each resolved item's place on the stack to each
   * target, one after another; as it lands, the target takes it. Damage shows (the life or damage
   * held until then appears), a creature it killed crumbles, one destroyed is struck by a dark
   * bolt and crumbles, one exiled is drawn into the exile vortex. Deaths with no bolt on the way
   * (a board wipe, a sacrifice) crumble right away.
   */
  private playHits(hits: SpellHit[], spots: Map<string, DOMRect>, first: Map<string, DOMRect>,
    exiled: Map<string, { rect: DOMRect; ghost: HTMLElement; playerId: string }>): void {
    const byBolt = new Set(hits.filter((h) => h.died).map((h) => h.key));
    for (const id of this.dying) if (!byBolt.has(id)) {
      this.crumble(id, 120);
      this.busyFor(1100);
    }
    let delay = 0;
    let last = "";
    let k = 0;
    for (const h of hits) {
      if (h.item !== last) {
        if (last) delay += 240;
        last = h.item;
        k = 0;
      }
      const from = spots.get(h.item);
      const gone = exiled.get(h.key);
      const el = this.cardEls.get(h.key);
      const avatar = h.playerId ? this.el.querySelector<HTMLElement>(`.life-orb[data-player="${CSS.escape(h.playerId)}"] .avatar`) : null;
      const target = avatar ?? (el?.closest(".side") ? el : undefined);
      const to = target?.getClientRects().length ? target.getBoundingClientRect() : gone?.rect ?? first.get(h.key);
      const land = () => {
        this.release(h.playerId ?? h.key);
        for (const id of h.alsoRelease ?? []) this.release(id);
        if (h.kind === "exile") {
          // It leaves the table for the vortex now (its copy, as it stood, flies in).
          this.unlinger(h.key);
          if (gone) this.banish(gone, this.cardEls.get(h.key));
          return;
        }
        if (target) this.wound(target, h.dmg);
        else if (to && h.dmg) this.damagePop(to, h.dmg);
        if (h.died) this.crumble(h.key, h.kind === "destroy" ? 60 : 280);
      };
      // The bolt's flight, then what it does (a creature crumbling, an exile into the vortex).
      this.busyFor(delay + k * 90 + 620 + (h.died ? 1200 : h.kind === "exile" ? 1200 : 300));
      if (!from || !to) {
        land();
        continue;
      }
      this.shoot(from, to, delay + k++ * 90, land, h.kind);
    }
  }

  /** A bolt from one place to another; `onHit` runs as it lands, with a flash there. Damage is a
      bolt of light, a destroy a dark one, an exile a pale violet one. */
  private shoot(from: DOMRect, to: DOMRect, delay: number, onHit: () => void, kind: SpellHit["kind"] = "damage"): void {
    const box = this.el.getBoundingClientRect();
    const ax = from.left + from.width / 2 - box.left;
    const ay = from.top + from.height / 2 - box.top;
    const bx = to.left + to.width / 2 - box.left;
    const by = to.top + to.height / 2 - box.top;
    const angle = Math.atan2(by - ay, bx - ax);
    const duration = Math.min(520, 240 + Math.hypot(bx - ax, by - ay) * 0.3);
    const shot = document.createElement("div");
    shot.className = `shot ${kind}`;
    Object.assign(shot.style, { left: `${ax}px`, top: `${ay}px`, rotate: `${angle}rad`, opacity: "0" });
    this.el.appendChild(shot);
    const anim = shot.animate([
      { translate: "0px 0px", scale: "0.4 1", opacity: 0 },
      { opacity: 1, scale: "1 1", offset: 0.15 },
      { translate: `${bx - ax}px ${by - ay}px`, scale: "1.2 1", opacity: 1 },
    ], { duration, delay, easing: "cubic-bezier(.5,0,.9,.6)" });
    void anim.finished.catch(() => {}).then(() => {
      shot.remove();
      if (!this.el.isConnected) return;
      this.impactAt(bx, by, angle, kind);
      this.sfx(kind === "exile" ? "exile" : "zap");
      onHit();
    });
  }

  /** A token comes in with a flash: a burst of light where it appears as it grows in, bright. */
  private tokenEntrance(el: HTMLElement): void {
    this.sfx("token");
    el.animate([{ transform: "scale(0.3)" }, { transform: "scale(1.12)", offset: 0.55 }, { transform: "scale(1)" }],
      { duration: 560, easing: "cubic-bezier(.2,.8,.3,1)", composite: "add" });
    el.animate([{ opacity: 0, filter: "brightness(3) saturate(0.3)" }, { opacity: 1, filter: "brightness(1.7)", offset: 0.45 }, { opacity: 1, filter: "none" }],
      { duration: 560, easing: "ease-out" });
    const box = this.el.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const burst = document.createElement("div");
    burst.className = "token-burst";
    burst.style.left = `${r.left + r.width / 2 - box.left}px`;
    burst.style.top = `${r.top + r.height / 2 - box.top}px`;
    this.el.appendChild(burst);
    this.later(() => burst.remove(), 700);
  }

  /**
   * Power/toughness or counters that changed on a permanent: the badge jumps, and the change floats
   * up from the card (+1/+1 green, -2/-2 red); a counter pin whose count changed jumps too.
   */
  private statChanges(prev: GameState | null, state: GameState): void {
    if (!prev || reducedMotion() || prev.matchId !== state.matchId) return;
    const before = new Map(prev.players.flatMap((p) => p.battlefield.map((c) => [c.id, c] as const)));
    const jump = (el: Element | null) => el?.animate([{ transform: "scale(1.7)" }, { transform: "scale(1)" }],
      { duration: 420, easing: "cubic-bezier(.3,1.5,.5,1)", composite: "add" });
    const box = this.el.getBoundingClientRect();
    for (const p of state.players) for (const c of p.battlefield) {
      const was = before.get(c.id);
      const el = this.cardEls.get(c.id);
      if (!was || !el?.closest(".side") || !el.getClientRects().length) continue;
      for (const kind of new Set([...Object.keys(c.counters), ...Object.keys(was.counters)])) {
        if ((c.counters[kind] ?? 0) !== (was.counters[kind] ?? 0)) jump(el.querySelector(`.pin[data-kind="${CSS.escape(kind)}"]`));
      }
      const dp = Number(c.power) - Number(was.power);
      const dt = Number(c.toughness) - Number(was.toughness);
      if (!Number.isFinite(dp) || !Number.isFinite(dt) || (!dp && !dt)) continue;
      jump(el.querySelector(".b.pt"));
      if (dp + dt > 0) this.sfx("counter");
      const r = el.getBoundingClientRect();
      const pop = document.createElement("div");
      pop.className = `stat-pop ${dp + dt >= 0 ? "gain" : "loss"}`;
      pop.textContent = `${dp >= 0 ? "+" : ""}${dp}/${dt >= 0 ? "+" : ""}${dt}`;
      pop.style.left = `${r.left + r.width / 2 - box.left}px`;
      pop.style.top = `${r.top + r.height * 0.35 - box.top}px`;
      this.el.appendChild(pop);
      this.later(() => pop.remove(), 1300);
    }
  }

  /** Sounds for what entered the game: a spell cast (new on the stack), a land played. */
  private zoneSounds(prev: GameState | null, state: GameState): void {
    if (!prev || prev.matchId !== state.matchId) return;
    const was = new Set(prev.stack.map((s) => s.id));
    if (state.stack.some((s) => !s.isAbility && !was.has(s.id))) this.sfx("cast");
    const before = new Set(prev.players.flatMap((p) => p.battlefield.map((c) => c.id)));
    const fromStack = new Set(prev.stack.flatMap((s) => [s.id, s.card?.id ?? ""]));
    if (state.players.some((p) => p.battlefield.some((c) => !before.has(c.id) && !fromStack.has(c.id) && isLand(c)))) this.sfx("land");
  }

  // ---------------------------------------------------------------- game log

  /** What the log panel shows: whose log, how many of its lines, and the first one's number. */
  private logShown = { key: "", count: 0, first: -1 };
  private logLit: HTMLElement[] = [];

  /** The game log (L, or the Log button): what happened, a line per event, newest at the
      bottom, with a line at each turn. Lines are added as they come; scrolled up, it stays put. */
  private renderLog(state: GameState): void {
    if (!this.prefs.logOpen) return;
    const log = state.log ?? [];
    const list = this.q(".log-list");
    const s = this.logShown;
    const key = state.replay ? "replay" : state.matchId;
    // Another game, or a replay moved back: written again from the start.
    const restart = s.key !== key || log.length < s.count || (log[0]?.seq ?? -1) !== s.first;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    if (restart) {
      list.innerHTML = "";
      s.count = 0;
    }
    if (log.length > s.count) {
      list.querySelector(".log-empty")?.remove();
      list.insertAdjacentHTML("beforeend", log.slice(s.count).map((e) => this.logRow(e, state.viewerSeat)).join(""));
    } else if (!log.length && !list.firstChild) {
      list.innerHTML = '<p class="log-empty">Nothing has happened yet.</p>';
    }
    s.key = key;
    s.count = log.length;
    s.first = log[0]?.seq ?? -1;
    if (restart || atBottom) list.scrollTop = list.scrollHeight;
  }

  private logRow(e: LogEntry, viewerSeat: number): string {
    const who = e.seat === undefined ? "" : e.seat === viewerSeat ? " you" : " opp";
    if (e.type === "TURN_BEGAN") {
      const whose = e.seat === viewerSeat ? "Your turn" : `${e.playerName ?? "Opponent"}'s turn`;
      return `<div class="log-turn${who}"><b>T${esc(e.turn ?? "?")}</b><span>${esc(whose)}</span></div>`;
    }
    const [glyph, kind] = LOG_KINDS[e.type] ?? ["•", "other"];
    // Card names (marked [[Name]]) light up their card when pointed at.
    const line = (l: string) => esc(l).replace(/\[\[([^[\]]+)\]\]/g, (_, name: string) => {
      const card = e.cards.find((c) => esc(c.name) === name);
      return `<b class="lc"${card ? ` data-card="${esc(card.id)}"` : ""}>${name}</b>`;
    });
    return `<div class="log-row ${kind}${who}" data-cards="${esc(e.cards.map((c) => c.id).join(","))}">`
      + `<i class="g" aria-hidden="true">${glyph}</i><span>${e.lines.map(line).join("<br>")}</span></div>`;
  }

  /** Pointing at a log line lights up its cards on the table; at a card name, that card, and a
      picture of it beside the log. */
  private bindLog(): void {
    const log = this.q(".log");
    log.addEventListener("pointerover", (e) => {
      const t = e.target as HTMLElement;
      const name = t.closest<HTMLElement>(".lc");
      const row = t.closest<HTMLElement>(".log-row");
      const ids = name ? (name.dataset.card ? [name.dataset.card] : []) : row?.dataset.cards?.split(",").filter(Boolean) ?? [];
      this.logHighlight(ids);
      this.logPeek(name);
    });
    log.addEventListener("pointerleave", () => {
      this.logHighlight([]);
      this.logPeek(null);
    });
  }

  private logHighlight(ids: string[]): void {
    for (const el of this.logLit) el.classList.remove("log-hl");
    this.logLit = ids.map((id) => this.cardEls.get(this.stackAlias.get(id) ?? id)).filter((el): el is HTMLElement => !!el?.isConnected);
    for (const el of this.logLit) el.classList.add("log-hl");
  }

  private logPeek(name: HTMLElement | null): void {
    const peek = this.q(".log-peek");
    const id = name?.dataset.card ?? "";
    const card = name ? this.cardData.get(id) ?? blankCard(id, name.textContent ?? "") : null;
    const url = card ? imageUrl(card) : null;
    if (!card || !url) {
      peek.classList.remove("show");
      return;
    }
    if (peek.dataset.url !== url) {
      peek.dataset.url = url;
      peek.innerHTML = `<img src="${esc(url)}" alt="${esc(card.name)}">`;
    }
    const box = this.q(".log").getBoundingClientRect();
    const r = name!.getBoundingClientRect();
    peek.style.top = `${Math.max(0, Math.min(r.top - box.top - 40, box.height - 230))}px`;
    peek.classList.add("show");
  }

  /** A creature that was just declared as an attacker charges out, glowing. */
  private chargeAttackers(prev: GameState | null, state: GameState): void {
    if (!prev || reducedMotion() || prev.turnNumber !== state.turnNumber) return;
    const was = new Set(prev.combat.attacks.map((a) => a.fromId));
    for (const a of state.combat.attacks) {
      const el = this.cardEls.get(a.fromId);
      if (was.has(a.fromId) || !el?.closest(".side")) continue;
      this.sfx("attack");
      el.classList.remove("charge");
      void el.offsetWidth;
      el.classList.add("charge");
      this.later(() => el.classList.remove("charge"), 700);
    }
  }

  /**
   * Combat damage, as Arena plays it: only the striker moves. It lifts off the table, tilted,
   * then slams into what it hits (each of its blockers in turn, or straight into the defending
   * player or planeswalker when unblocked) with a white flash and a jolt of the table, and
   * goes back to its place. What gets hit shows claw marks and the damage it took, and
   * creatures that died crumble into dark smoke where they fought. First strike damage shows
   * the first and double strikers; regular damage the rest (and double strikers again).
   */
  private combatStrike(prev: GameState | null, state: GameState): void {
    const fallen = this.fallen;
    // The dead crumble right after the blow that killed them (right away when there's no fight to
    // show; at the end for one no blow reaches).
    const killedAt = new Map<string, number>();
    const crumble = (after: number) => {
      for (const id of fallen) this.crumble(id, killedAt.get(id) ?? after);
    };
    const step = this.damageStep(prev, state);
    if (!prev || !step || reducedMotion()) return crumble(0);
    // Each damage step is shown once.
    const key = `${state.matchId}:${state.turnNumber}:${step}`;
    if (this.struck === key) return crumble(0);
    this.struck = key;
    const fs = stepIndex("FIRST_STRIKE_DAMAGE");
    const from = stepIndex(currentStep(prev.phase, prev.step) ?? "");
    const before = new Map(prev.players.flatMap((p) => p.battlefield.map((c) => [c.id, c] as const)));
    const after = new Map(state.players.flatMap((p) => p.battlefield.map((c) => [c.id, c] as const)));
    const strikes = (id: string) => {
      const c = before.get(id);
      const text = [c?.oracleText ?? "", ...(c?.keywordsGranted ?? [])].join("\n");
      // A keyword line ("Flying, first strike"), or a keyword an effect gave it.
      const first = /^(?:[\w' -]+,\s*)*first strike\b/im.test(text);
      const double = /^(?:[\w' -]+,\s*)*double strike\b/im.test(text);
      if (step === "fs") return first || double;
      // Regular damage: the creatures that didn't already strike first (unless both steps passed at once).
      return from < fs || !first;
    };
    // The damage a creature took in this step: what was added to it, or (when it died) what
    // was left of its toughness.
    const taken = (id: string) => {
      const was = before.get(id);
      if (!was) return 0;
      const now = after.get(id);
      if (now) return Math.max(0, (now.damage ?? 0) - (was.damage ?? 0));
      return Math.max(0, (Number(was.toughness) || 0) - (was.damage ?? 0));
    };
    // A fighter's element: the card on the battlefield (one that died there stays to fight).
    const fighter = (id: string) => (this.cardEls.get(id)?.closest(".side") ? this.cardEls.get(id) : undefined);
    const blockersOf = new Map<string, string[]>();
    for (const b of prev.combat.blocks) blockersOf.set(b.toId, [...(blockersOf.get(b.toId) ?? []), b.fromId]);

    // Each run: a striker and what it slams into, one after another. Usually the attacker; a
    // blocker runs at the attacker only when it strikes and the attacker doesn't (first strike).
    type Target = { el: HTMLElement; id: string | null; key: string };
    const runs: { from: HTMLElement; id: string; targets: Target[]; hurtBy: number }[] = [];
    for (const a of prev.combat.attacks) {
      const el = fighter(a.fromId);
      if (!el) continue;
      const blockers = (blockersOf.get(a.fromId) ?? []).filter((b) => fighter(b));
      const hitBack = blockers.filter(strikes);
      if (blockers.length) {
        if (strikes(a.fromId)) runs.push({ from: el, id: a.fromId, targets: blockers.map((b) => ({ el: fighter(b)!, id: b, key: b })), hurtBy: hitBack.length });
        else for (const b of hitBack) runs.push({ from: fighter(b)!, id: b, targets: [{ el, id: a.fromId, key: a.fromId }], hurtBy: 0 });
      } else if (strikes(a.fromId)) {
        // Unblocked: straight at the defending player (their picture) or planeswalker.
        // A player is "player:<seat>" (never a card's id); a planeswalker or battle, its card id.
        const seat = a.toId.startsWith("player:") ? Number(a.toId.slice(7)) : undefined;
        const playerId = seat === undefined ? undefined : prev.players[seat]?.id ?? String(seat);
        const card = playerId === undefined ? fighter(a.toId) : undefined;
        const orb = playerId === undefined ? null : this.el.querySelector<HTMLElement>(`.life-orb[data-player="${CSS.escape(playerId)}"]`);
        const target = card ?? orb?.querySelector<HTMLElement>(".avatar") ?? orb ?? undefined;
        if (target) runs.push({ from: el, id: a.fromId, targets: [{ el: target, id: card ? a.toId : null, key: card ? a.toId : playerId! }], hurtBy: 0 });
      }
    }

    const LIFT = 260;
    const SLAM = 150;
    const HOLD = 170;
    const BACK = 300;
    const runTime = (n: number) => LIFT + n * (SLAM + HOLD) + BACK;
    // Attackers go one after another, a little overlapped.
    const starts: number[] = [];
    let t = 0;
    for (const r of runs) {
      starts.push(t);
      t += runTime(r.targets.length) * 0.7;
    }
    // Started once this update's own moves (cards gliding to new places) have mostly played.
    const START = 330;
    const end = runs.reduce((m, r, i) => Math.max(m, starts[i]! + runTime(r.targets.length)), 0);
    // When each blow lands: what it kills goes then, and what it changes shows then.
    const blowAt = (i: number, k: number) => START + starts[i]! + LIFT + k * (SLAM + HOLD) + SLAM;
    runs.forEach((run, i) => run.targets.forEach((tg, k) => {
      if (tg.id && fallen.has(tg.id)) killedAt.set(tg.id, Math.max(killedAt.get(tg.id) ?? 0, blowAt(i, k) + 250));
      if (run.hurtBy && fallen.has(run.id) && k === 0) killedAt.set(run.id, blowAt(i, 0) + 250);
    }));
    crumble(START + end);
    // The fight, then the dead burning away.
    this.busyFor(START + end + (fallen.size ? 1150 : 200));
    // Anything no blow reached shows once the fight is over.
    this.later(() => {
      for (const id of [...this.heldLife.keys(), ...this.heldDamage.keys()]) this.release(id);
    }, START + end);
    // The result of a game won in combat waits for the fight (and the dead burning away).
    if (runs.length) this.endHoldUntil = Math.max(this.endHoldUntil, Date.now() + (START + end + 900) / this.speed);
    this.renderEnd(state, state.players.find((p) => p.isViewer));
    this.later(() => {
      const box = this.el.getBoundingClientRect();
      runs.forEach((run, i) => {
        if (!run.from.isConnected) return;
        const ra = run.from.getBoundingClientRect();
        const ax = ra.left + ra.width / 2;
        const ay = ra.top + ra.height / 2;
        const total = runTime(run.targets.length);
        // Where it lands on each target: overlapping it, as if crashing into it.
        const hits = run.targets.filter((tg) => tg.el.isConnected).map((tg) => {
          const rb = tg.el.getBoundingClientRect();
          const dx = rb.left + rb.width / 2 - ax;
          const dy = rb.top + rb.height / 2 - ay;
          const dist = Math.hypot(dx, dy) || 1;
          const ux = dx / dist;
          const uy = dy / dist;
          const stop = Math.max(0, dist - Math.min(rb.width, rb.height) * 0.45);
          return { tg, ux, uy, x: ux * stop, y: uy * stop, cx: ax + ux * (dist - Math.min(rb.width, rb.height) * 0.25), cy: ay + uy * (dist - Math.min(rb.width, rb.height) * 0.25) };
        });
        if (!hits.length) return;
        // Tilted against the swing, as a card thrown at its target.
        const tilt = (h: { ux: number }) => (h.ux >= 0 ? -1 : 1) * 24;
        const first = hits[0]!;
        const frames: Keyframe[] = [
          { transform: "translate(0px, 0px) rotate(0deg) scale(1)", offset: 0 },
          // Lift: up off the table and back a little from the target, tilting.
          { transform: `translate(${-first.ux * 22}px, ${-first.uy * 22 - 14}px) rotate(${tilt(first) * 0.6}deg) scale(1.22)`, offset: LIFT / total, easing: "cubic-bezier(.6,0,.9,.5)" },
        ];
        let at = LIFT;
        hits.forEach((h) => {
          at += SLAM;
          frames.push({ transform: `translate(${h.x}px, ${h.y}px) rotate(${tilt(h)}deg) scale(1.12)`, offset: at / total, easing: "cubic-bezier(.2,.8,.3,1)" });
          at += HOLD;
          frames.push({ transform: `translate(${h.x - h.ux * 10}px, ${h.y - h.uy * 10}px) rotate(${tilt(h) * 0.8}deg) scale(1.1)`, offset: at / total, easing: "cubic-bezier(.5,0,.5,1)" });
        });
        frames.push({ transform: "translate(0px, 0px) rotate(0deg) scale(1)", offset: 1 });
        // Lifted above everything while it flies.
        const slot = run.from.closest<HTMLElement>(".slot");
        const lift = slot ?? run.from;
        const z = lift.style.zIndex;
        this.later(() => (lift.style.zIndex = "40"), starts[i]!);
        const anim = run.from.animate(frames, { duration: total, delay: starts[i]!, composite: "add" });
        void anim.finished.catch(() => {}).then(() => (lift.style.zIndex = z));
        // Each slam lands: a flash where they meet, the table jolts, the target shows its wound.
        hits.forEach((h, k) => {
          this.later(() => {
            this.impactAt(h.cx - box.left, h.cy - box.top, Math.atan2(h.uy, h.ux));
            this.sfx("hit");
            this.jolt(h.ux, h.uy);
            // The blow lands: the life lost or the damage dealt shows now.
            this.release(h.tg.key);
            if (h.tg.id) this.wound(h.tg.el, taken(h.tg.id));
            else this.wound(h.tg.el, 0);
            // A blocker that strikes back lunges at the attacker as they clash, and the attacker
            // takes its damage then.
            if (h.tg.id && strikes(h.tg.id)) this.lunge(h.tg.el, -h.ux, -h.uy);
            if (k === 0 && run.hurtBy) {
              this.release(run.id);
              this.wound(run.from, taken(run.id));
            }
          }, starts[i]! + LIFT + k * (SLAM + HOLD) + SLAM);
        });
      });
    }, START);
  }

  /** A hit's flash: a white burst with streaks flying out along the swing (`angle`). */
  private impactAt(x: number, y: number, angle: number, kind = ""): void {
    const burst = document.createElement("div");
    burst.className = `impact ${kind}`;
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;
    burst.style.setProperty("--a", `${angle}rad`);
    this.el.appendChild(burst);
    this.later(() => burst.remove(), 700);
  }

  /** A creature hitting back: a short, hard lunge along (`ux`, `uy`) and back, as they clash. */
  private lunge(el: HTMLElement, ux: number, uy: number): void {
    el.animate([
      { transform: "translate(0px, 0px) scale(1)" },
      { transform: `translate(${ux * 26}px, ${uy * 26}px) scale(1.1)`, offset: 0.35 },
      { transform: `translate(${ux * 8}px, ${uy * 8}px) scale(1.04)`, offset: 0.6 },
      { transform: "translate(0px, 0px) scale(1)" },
    ], { duration: 320, easing: "cubic-bezier(.3,.7,.4,1)", composite: "add" });
  }

  /** The table jolts with a hit, pushed along the swing. */
  private jolt(ux: number, uy: number): void {
    this.el.animate([
      { translate: "0 0" },
      { translate: `${ux * 9}px ${uy * 9}px`, offset: 0.2 },
      { translate: `${-ux * 5}px ${-uy * 5}px`, offset: 0.5 },
      { translate: `${ux * 2}px ${uy * 2}px`, offset: 0.75 },
      { translate: "0 0" },
    ], { duration: 260, easing: "ease-out" });
  }

  /** What was hit flinches; a creature also shows claw marks and the damage it took. */
  private wound(el: HTMLElement, dmg: number): void {
    el.classList.remove("struck");
    void el.offsetWidth;
    el.classList.add("struck");
    this.later(() => el.classList.remove("struck"), 450);
    if (!el.classList.contains("card")) return;
    const claws = document.createElement("div");
    claws.className = "claws";
    claws.innerHTML = '<i></i><i></i><i></i>';
    el.appendChild(claws);
    this.later(() => claws.remove(), 1300);
    if (dmg) this.damagePop(el.getBoundingClientRect(), dmg);
  }

  /** The damage taken, popping up over where it landed (`r`, on screen). */
  private damagePop(r: DOMRect, dmg: number): void {
    const box = this.el.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "dmg-pop";
    pop.textContent = `-${dmg}`;
    pop.style.left = `${r.left + r.width / 2 - box.left}px`;
    pop.style.top = `${r.top + r.height * 0.4 - box.top}px`;
    this.el.appendChild(pop);
    this.later(() => pop.remove(), 1200);
  }

  private card(c: CardView, showStats: boolean): HTMLElement {
    let el = this.cardEls.get(c.id);
    if (!el) {
      el = createCardEl(c.id);
      this.cardEls.set(c.id, el);
    }
    // Damage an animation is still on its way with shows when it lands.
    const held = showStats ? this.heldDamage.get(c.id) : undefined;
    updateCardEl(el, held === undefined ? c : { ...c, damage: held }, showStats);
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
      const key = (this.held.has(c.id) ? null : groupKey(c, this.localState(c.id) + (this.situation.get(c.id) ?? ""), this.effectsByCard.get(c.id)?.length ?? 0)) ?? c.id;
      const unit = units.get(key);
      if (unit) unit.push(c);
      else units.set(key, [c]);
    }
    // Many copies (basic lands, tokens) make several piles of up to four, side by side, instead
    // of one tall pile.
    const piles: [string, CardView[]][] = [];
    for (const [key, unit] of units) {
      for (let i = 0; i < unit.length; i += MAX_PILE) piles.push([i ? `${key}#${i / MAX_PILE}` : key, unit.slice(i, i + MAX_PILE)]);
    }
    for (const [key, unit] of piles) {
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
        // Exiled cards it holds peek out from behind its left edge (see .linked).
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
        // The ones sticking out furthest go first, so each lies behind the one before it.
        reconcile(slot, [...held.reverse(), ...children]);
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

  /** A side's emblems: a shield each with its source's art; hover shows the source and the text. */
  private renderEmblems(box: HTMLElement, player: PlayerView | null): void {
    const html = (player ? this.emblems.get(player.id) ?? [] : []).map(({ fx, owner }) => {
      const source = emblemSource(fx);
      const key = `emblem:${fx.id}`;
      this.cardData.set(key, { ...blankCard(key, source), typeLine: "Emblem", oracleText: fx.oracleText });
      const url = imageUrl({ ...blankCard(key, source), setCode: fx.setCode, collectorNumber: fx.collectorNumber }, "art_crop");
      const whose = owner === player ? "" : ` (${owner.name}'s)`;
      const text = `${source} emblem${whose}${fx.oracleText ? `: ${fx.oracleText}` : ""}`;
      return `<div class="emblem${owner === player ? "" : " foreign"}" data-zoom="${esc(key)}" data-stack-text="${esc(text)}" title="${esc(text)}">
        <span>✦</span>${url ? `<img src="${esc(url)}" alt="" draggable="false">` : ""}</div>`;
    }).join("");
    if (box.dataset.sig !== html) {
      box.dataset.sig = html;
      box.innerHTML = html;
    }
  }

  private renderHand(me: PlayerView | null): void {
    // Watching someone else's game whose hand isn't shown to you: its backs.
    if (this.state?.spectating && me && !me.hand) {
      const n = Math.min(me.handSize ?? 0, 30);
      const backs = Array.from({ length: n }, (_, i) => (this.spectateBacks[i] ??= createBackEl(`spectate:${i}`)));
      reconcile(this.q(".my-hand"), backs);
      return;
    }
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
      // The zone is named once, on the last card of each run from it (the one lying on the others).
      if (els.at(-1)?.dataset.from === from) els.at(-1)!.classList.remove("from-head");
      el.classList.add("from-head");
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
    this.emblems.clear();
    const me = state.players.find((pl) => pl.isViewer);
    for (const p of state.players) {
      for (const fx of p.effects) {
        // An emblem is its own thing on the table, Arena style: a shield at the edge of a side.
        // Its owner's side, unless it only speaks of their opponents ("Your opponents can't…"):
        // then it sits with the player it weighs on.
        if (isEmblem(fx)) {
          const side = onOpponents(fx) ? (p === me ? this.focusedOpp : me?.id) ?? p.id : p.id;
          this.emblems.set(side, [...(this.emblems.get(side) ?? []), { fx, owner: p }]);
          continue;
        }
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
    if (m.kind === "attackers" && m.aiming === id) return "aiming";
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

  /** The card a prompt is about when it isn't on the stack yet (a spell being cast, a trigger
      choosing its targets): shown as the top stack item, so the stack is the one place to look. */
  private pendingStackItem(state: GameState, me: PlayerView | null): StackItemView | null {
    const p = state.pending;
    const m = this.mode;
    // Also a question asked while something else resolves (pay life for the land you fetched, a
    // "may" effect): the card asking sits on top, over the item that brought it.
    if (!p || p.type === "PRIORITY" || !(m.kind === "targets" || m.kind === "cards" || p.type === "YES_NO" || this.boardDivide())) return null;
    // A tucked-away stack keeps the big card beside the table instead.
    if (this.stackHidden && state.stack.length) return null;
    const src = p.sourceCardId || p.sourceCardName ? this.sourceCard(p) : undefined;
    if (!src || !imageUrl(src)) return null;
    // Already there (same checks as stackKeyFor).
    if (state.stack.some((s) => (!!p.sourceCardId && [s.sourceCardId, s.card?.id, s.id].includes(p.sourceCardId)) || (s.card?.name ?? s.name) === src.name)) return null;
    const onBattlefield = state.players.some((pl) => pl.battlefield.some((c) => c.id === src.id));
    // A spell being cast keeps its card's id from the hand to the stack, so one card moves there
    // and stays (no swapping it for a copy while it's paid for). A card shown somewhere else
    // (a permanent, a graveyard's top card) stays where it is and gets a copy.
    // (The hand of a player you control counts as yours: you cast from it.)
    const elsewhere = state.players.some((pl) => [pl.battlefield, pl.graveyard, pl.exile, pl.commandZone, pl.effects, pl.libraryTop, pl === me || (!!me && pl.controlledBy === me.id) ? [] : pl.hand ?? []]
      .some((zone) => zone.some((c) => c.id === src.id)));
    const own = !elsewhere && !src.id.startsWith("src:");
    return {
      id: own ? src.id : `pending:${src.id}`,
      name: onBattlefield ? p.message ?? src.name : src.name,
      isAbility: onBattlefield,
      card: own ? src : { ...src, id: `pending:${src.id}` },
      controllerId: me?.id,
      sourceCardId: src.id,
      targets: [],
    };
  }

  /** A CHOOSE_NUMBER prompt that asks for X (rather than any other number). */
  private asksX(p: PendingActionView): boolean {
    return /\bX\b/.test(p.message ?? "") || /\{X\}/.test(this.promptCost(p));
  }

  /** The mana cost of the card a prompt is about; a prompt may only name it, so any card seen
      with that name will do. */
  private promptCost(p: PendingActionView): string {
    const src = this.sourceCard(p);
    if (src?.manaCost) return src.manaCost;
    const name = p.sourceCardName ?? src?.name;
    if (name) for (const c of this.cardData.values()) if (c.name === name && c.manaCost) return c.manaCost;
    return "";
  }

  private rememberX(p: PendingActionView, n: number, keep = false): void {
    const name = p.sourceCardName ?? this.sourceCard(p)?.name;
    for (const key of [p.sourceCardId, name && `name:${name}`]) if (key && !(keep && this.chosenX.has(key))) this.chosenX.set(key, n);
  }

  /** Answers a CHOOSE_NUMBER prompt, keeping an X for the stack item it's paid for. */
  private chooseNumber(p: PendingActionView, n: number): void {
    if (this.asksX(p)) this.rememberX(p, n);
    this.controller.chooseNumber(n);
  }

  /** X as the payment tells it, when it wasn't chosen here: "Pay {1}{G}" for a card that costs
      {X}{G} makes X = 1 (read when the payment is first asked, before any of it is paid). */
  private xFromPayment(p: PendingActionView): void {
    const paying = /^\s*Pay\s+((?:\{[^}]+\})+)/i.exec(p.message ?? "")?.[1];
    const cost = this.promptCost(p);
    const xs = cost.match(/\{X\}/g)?.length ?? 0;
    if (!paying || !xs) return;
    const generic = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].reduce((n, m) => n + Number(m[1]), 0);
    const x = (generic(paying) - generic(cost)) / xs;
    if (Number.isInteger(x) && x >= 0) this.rememberX(p, x, true);
  }

  private renderStack(stack: StackItemView[], meId: string | undefined): void {
    this.stackEls.clear();
    this.stackAlias.clear();
    const pending = this.state?.pending;
    if (pending?.type === "PAY_MANA") this.xFromPayment(pending);
    const xKeys = new Set<string>();
    // stack[0] is the top (Endstep auto-yield checks stack[0]); draw the top last so it sits in front.
    const els = stack.slice().reverse().map((s, i) => {
      // The stack's copy of a card may come without what makes it a token (its art is looked up
      // differently), so that is taken from the permanent itself, or from when it was last seen
      // (a token that died and left a trigger behind).
      const known = (s.sourceCardId ? this.cardData.get(s.sourceCardId) : undefined)
        ?? (s.card ? this.tokens.get(s.card.id) ?? this.tokens.get(`${s.controllerId ?? ""}|${s.card.name}`) : undefined);
      const merged = known && s.card ? { ...known, ...Object.fromEntries(Object.entries(s.card).filter(([, v]) => v !== undefined)) } as CardView : s.card;
      if (merged && known?.isToken) Object.assign(merged, { isToken: true, isCopyOfRealCard: known.isCopyOfRealCard });
      const source = merged ? this.withPrinting(merged, s.controllerId) : known;
      const card: CardView = {
        ...(source ?? blankCard(s.id, s.name)),
        // A spell keeps its card id, so it animates from the hand onto the stack.
        id: s.isAbility ? `ab:${s.id}` : source?.id ?? s.id,
        name: source?.name ?? s.name,
        tapped: false, isAttacking: false, isBlocking: false,
      };
      this.cardData.set(card.id, card);
      // An ability that was shown while it asked its question (as "pending") keeps that card
      // now that it's really on the stack, instead of blinking out and back in.
      const asked = `ab:pending:${s.sourceCardId}`;
      const was = s.isAbility && !this.cardEls.has(card.id) && !stack.some((x) => x.id === `pending:${s.sourceCardId}`) ? this.cardEls.get(asked) : undefined;
      if (was) {
        this.cardEls.delete(asked);
        this.cardEls.set(card.id, was);
        was.dataset.id = card.id;
      }
      const el = this.card(card, false);
      el.classList.toggle("ability", s.isAbility);
      el.dataset.stackText = s.isAbility ? s.name : "";
      // A triggered ability ("When…", "Whenever…", "At…") or an activated one: the ribbon says which.
      const triggered = s.isAbility && /^\s*(when|whenever|at)\b/i.test(s.name);
      const face = el.querySelector<HTMLElement>(".face");
      if (face) face.dataset.kindLong = s.id.startsWith("pending:") ? "Ability" : triggered ? "Triggered ability" : "Activated ability";
      // What was paid for X: Endstep's value, else the one you chose when casting it.
      const mine = !!meId && s.controllerId === meId;
      let x = s.x;
      if (mine) for (const key of [s.sourceCardId, s.card?.id, `name:${card.name}`]) {
        if (!key || !this.chosenX.has(key)) continue;
        xKeys.add(key);
        x ??= this.chosenX.get(key);
      }
      if (face) {
        if (x === undefined) delete face.dataset.x;
        else face.dataset.x = `X = ${x}`;
      }
      el.classList.toggle("trigger", triggered);
      el.dataset.controller = s.controllerId ?? "";
      el.style.setProperty("--si", String(i));
      // Its place in the pile, fixed: a card that came from the hand still carries the hand's layering.
      el.style.zIndex = String(i + 1);
      el.classList.toggle("mine", !!meId && s.controllerId === meId);
      el.classList.toggle("theirs", !!s.controllerId && s.controllerId !== meId);
      this.stackEls.set(card.id, s);
      this.stackAlias.set(s.id, card.id);
      if (!s.isAbility && s.card) this.stackAlias.set(s.card.id, card.id);
      return el;
    });
    // An X is spent once its item has left the stack (and nothing is still being cast).
    if (!pending || pending.type === "PRIORITY") {
      for (const key of this.xShown) if (!xKeys.has(key)) this.chosenX.delete(key);
      this.xShown = xKeys;
    } else for (const key of xKeys) this.xShown.add(key);
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
      if (top && (this.sideIds.has(top.id) || this.linked.has(top.id) || this.lingering.has(top.id))) reconcile(holder, [this.pileCopy(`${player.id}:${zone}`, top)]);
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
    this.el.classList.toggle("aiming-attack", mode.kind === "attackers" && !!mode.aiming);
    this.el.classList.toggle("aiming-target", mode.kind === "targets");
    for (const [id, el] of this.cardEls) {
      const c = this.cardData.get(id);
      const key = this.stackEls.has(id) ? this.stackTargetKey(id) : id;
      const selectable = this.isSelectable(key) && !this.pickedInFan(el);
      const linked = this.linked.has(id) && !!el.closest(".slot");
      el.classList.toggle("linked", linked);
      if (!linked) el.style.removeProperty("--li");
      el.classList.toggle("tapped", !!c?.tapped && !linked && !!el.closest(".side"));
      el.classList.toggle("sick", !!c?.summoningSick && !c.tapped && !linked && isFrontRow(c) && !!el.closest(".side"));
      this.markEffects(el, this.effectsByCard.get(id) ?? []);
      el.classList.toggle("playable", playable.has(id) && !this.awaiting);
      el.classList.toggle("selectable", selectable);
      el.classList.toggle("selected",
        ((mode.kind === "targets" || mode.kind === "cards") && mode.selected.includes(key)) ||
        (mode.kind === "blockers" && mode.selectedBlocker === id) ||
        (mode.kind === "divide" && (mode.amounts[this.divideIndex(key) ?? -1] ?? 0) > 0));
      el.classList.toggle("attacking", !!c?.isAttacking || !!attackingAssigned?.has(id) || (mode.kind === "attackers" && mode.aiming === id));
      el.classList.toggle("aiming", mode.kind === "attackers" && mode.aiming === id);
      el.classList.toggle("blocking", !!c?.isBlocking || !!blockAssigned?.has(id));
    }
    for (const slot of this.slotEls.values()) {
      const c = this.cardData.get(slot.dataset.host ?? "");
      const members = slot.dataset.members?.split(",") ?? [];
      slot.classList.toggle("tapped", !!c?.tapped);
      slot.classList.toggle("attacking", !!c?.isAttacking || members.some((id) => attackingAssigned?.has(id)));
      slot.classList.toggle("blocking", !!c?.isBlocking || members.some((id) => blockAssigned?.has(id)));
    }
    for (const plate of this.el.querySelectorAll<HTMLElement>("[data-player]")) {
      const id = plate.dataset.player;
      if (!id || plate.classList.contains("pile")) continue;
      const key = playerTargetKey(Number(id));
      plate.classList.toggle("selectable", this.isSelectable(key));
      plate.classList.toggle("selected", ((mode.kind === "targets" || mode.kind === "cards") && mode.selected.includes(key)));
      const payLife = key === this.phyrexianLifeKey();
      if (payLife) plate.title = PAY_LIFE_TITLE;
      else if (plate.title === PAY_LIFE_TITLE) plate.removeAttribute("title");
    }
  }

  /** A card's element: its own, or the stack item Endstep knows by that id. */
  private elFor(key: string): HTMLElement | undefined {
    return this.cardEls.get(key) ?? this.cardEls.get(this.stackAlias.get(key) ?? "");
  }

  /** The id a stack item is chosen by in the current prompt (countering a spell, copying it…). */
  private stackTargetKey(elId: string): string {
    const m = this.mode;
    if (m.kind === "targets" || m.kind === "cards") {
      for (const [alias, id] of this.stackAlias) if (id === elId && m.valid.has(alias)) return alias;
    }
    return elId;
  }

  /**
   * The prompt's cards are picked from a fan: some aren't on the table (a library, graveyard or
   * exile; a pile's top card is drawn, but it's still in its pile), or they're in a hand
   * (Thoughtseize, Thought-Knot Seer, a discard: chosen from a hand, yours or an opponent's).
   */
  private choiceInFan(p: PendingActionView | null | undefined): boolean {
    const m = this.mode;
    if (!p || (m.kind !== "cards" && m.kind !== "targets")) return false;
    // Proliferate is picked on the table.
    if (isProliferate(p)) return false;
    // A discard from your own hand is picked right on your hand (Learn has its own view).
    if (this.state && !(m.kind === "cards" && m.learn) && discardInHand(this.state, p)) return false;
    if (m.kind === "cards" && m.offBoard) return true;
    const onTable = (id: string) => {
      const el = this.elFor(id);
      return !!el?.isConnected && !el.closest(".pile, .hand");
    };
    return p.optionCardIds.some((id) => !isPlayerId(id) && !onTable(id));
  }

  /** Proliferate's options that are yours: your permanents, and you. */
  private proliferateYours(): string[] {
    const m = this.mode;
    const state = this.state;
    const me = state?.players.find((pl) => pl.isViewer);
    if (!state || !me || (m.kind !== "cards" && m.kind !== "targets")) return [];
    const myKey = playerTargetKey(state.players.indexOf(me));
    // Yours: on your side of the table (Endstep doesn't always say who controls a card).
    const mine = new Set(me.battlefield.map((c) => c.id));
    return [...m.valid].filter((k) => k === myKey || mine.has(k));
  }

  /** A card in a hand while a choice is made from a fan: it's picked there instead. */
  private pickedInFan(el: HTMLElement): boolean {
    return !!el.closest(".hand") && this.choiceInFan(this.state?.pending);
  }

  private isSelectable(key: string): boolean {
    const m = this.mode;
    if (this.awaiting) return false;
    switch (m.kind) {
      case "targets":
      case "cards":
        return m.valid.has(key) || key === this.phyrexianLifeKey();
      case "attackers":
        // While aiming, the players and planeswalkers it can attack light up.
        return m.valid.has(key) || (!!m.aiming && !!this.state && defenderForKey(m, key, this.state) !== null);
      case "blockers":
        return m.validBlockers.has(key) || (!!m.selectedBlocker && m.attackerIds.has(key));
      case "divide":
        return this.divideIndex(key) !== null;
      default:
        return false;
    }
  }

  /** Paying a cost with a Phyrexian symbol left: your plate, which pays 2 life for it (as in Endstep). */
  private phyrexianLifeKey(): string | null {
    const m = this.mode;
    const state = this.state;
    if (m.kind !== "cards" || !m.mana || !state?.pending?.phyrexian) return null;
    const seat = state.players.findIndex((pl) => pl.isViewer);
    return seat >= 0 ? playerTargetKey(seat) : null;
  }

  /** A spell dividing its damage (Fireball, Arc Lightning): done on the table, as Arena does it,
      with a counter on each target, instead of the full-screen damage box (kept for combat). */
  private boardDivide(): boolean {
    return this.mode.kind === "divide" && this.state?.pending?.divide?.kind === "spell";
  }

  /** The division option a card or player key stands for, on the table. */
  private divideIndex(key: string): number | null {
    if (!this.boardDivide()) return null;
    const i = this.state!.pending!.divide!.options.findIndex((o) => divideKey(o.id) === key);
    return i < 0 ? null : i;
  }

  /** Arena's strip across the table: what to do, and what's left to divide. */
  private divideBanner(p: PendingActionView): string {
    const m = this.mode;
    const d = p.divide!;
    if (m.kind !== "divide") return "";
    const left = divideLeft(d, m.amounts);
    const ready = divideReady(d, m.amounts);
    const msg = p.message || `Divide ${d.total} damage among the targets.`;
    const status = left > 0 ? `${left} of ${d.total} left to assign` : ready ? "All assigned: Submit" : "Each target needs at least 1";
    return `<div class="banner-msg">${withSymbols(esc(msg))}</div><div class="banner-sub${ready ? " ready" : ""}">${esc(status)}</div>`;
  }

  /** The counters over each target while a spell's damage is divided on the table: ▲ amount ▼. */
  private placeDivideBadges(origin: DOMRect): void {
    const layer = this.q(".div-badges");
    const m = this.mode;
    const d = this.state?.pending?.divide;
    if (!this.boardDivide() || m.kind !== "divide" || !d) {
      if (layer.innerHTML) { layer.innerHTML = ""; delete layer.dataset.sig; }
      return;
    }
    const left = divideLeft(d, m.amounts);
    const off = this.awaiting;
    const html = d.options.map((o, i) => {
      // A player's counter goes on their picture, clear of their life total.
      const key = divideKey(o.id);
      const avatar = key.startsWith("player:") ? this.el.querySelector<HTMLElement>(`.life-orb[data-player="${key.slice(7)}"] .avatar`) : null;
      const r = avatar?.getClientRects().length ? avatar.getBoundingClientRect() : this.anchor(key);
      if (!r) return "";
      const n = m.amounts[i] ?? 0;
      const x = r.left + r.width / 2 - origin.left;
      const y = r.top + r.height / 2 - origin.top;
      const cls = [n > 0 ? "some" : "", o.lethal != null && o.lethal > 0 && n >= o.lethal ? "lethal" : "", divideShort(d, m.amounts) && n < 1 ? "short" : ""].filter(Boolean).join(" ");
      return `<div class="dbadge ${cls}" data-i="${i}" style="left: ${x.toFixed(1)}px; top: ${y.toFixed(1)}px">` +
        `<button class="up" data-div-add="${i}" title="+1 (or click the card; Ctrl: lethal)" ${off || left <= 0 ? "disabled" : ""}></button>` +
        `<b>${n}</b>` +
        `<button class="down" data-div-sub="${i}" title="−1 (or right-click the card)" ${off || n <= 0 ? "disabled" : ""}></button></div>`;
    }).join("");
    if (layer.dataset.sig !== html) {
      layer.dataset.sig = html;
      layer.innerHTML = html;
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
    const hasPrio = state.priorityPlayerId === p.id;
    const active = state.activePlayerId === p.id;
    el.classList.toggle("priority", hasPrio);
    el.classList.toggle("active", active);
    // The player the game is waiting on: their picture glows.
    orb.classList.toggle("waited", this.waiting?.playerId === p.id);
    el.classList.toggle("out", p.hasLost || p.hasConceded);
    const extras = [
      p.poison ? `<span class="chip poison" title="Poison">☠ ${p.poison}</span>` : "",
      p.energy ? `<span class="chip energy" title="Energy">⚡ ${p.energy}</span>` : "",
      p.hasMonarch ? '<span class="chip" title="Monarch">♛</span>' : "",
      p.hasInitiative ? '<span class="chip" title="Initiative">Init</span>' : "",
      p.controlledBy !== undefined ? '<span class="chip" title="Another player makes this player\'s decisions">Controlled</span>' : "",
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
    const avatarHtml = this.avatarHtml(p);
    if (orb.dataset.avatar !== avatarHtml) {
      orb.dataset.avatar = avatarHtml;
      orb.querySelector(".avatar")?.remove();
      orb.insertAdjacentHTML("afterbegin", avatarHtml);
    }
    this.showLife(orb, p);

    // An opponent who lost connection: a small line under their picture, counting down to when
    // their seat concedes (or just waiting, when the server has no deadline for them).
    let conn = orb.querySelector<HTMLElement>(".conn");
    if (!p.disconnected || p.isViewer) conn?.remove();
    else {
      if (!conn) {
        conn = document.createElement("div");
        conn.className = "conn";
        orb.appendChild(conn);
      }
      conn.dataset.deadline = String(p.disconnected.deadline ?? "");
      conn.title = p.disconnected.deadline === null ? `${p.name} lost connection. Waiting for them to reconnect.`
        : `${p.name} lost connection. Their seat concedes if they do not return.`;
      updateConn(conn);
    }
    this.renderTimers(orb, p, state);
    this.startTimerTicker();
  }

  /** Keeps the countdowns on the board up to date while there are any. */
  private startTimerTicker(): void {
    if (this.timerTicker || !this.el.querySelector(TIMERS)) return;
    this.el.querySelectorAll<HTMLElement>(TIMERS).forEach(updateTimer);
    this.timerTicker = window.setInterval(() => {
      const tags = this.el.querySelectorAll<HTMLElement>(TIMERS);
      tags.forEach(updateTimer);
      if (!tags.length) {
        clearInterval(this.timerTicker);
        this.timerTicker = 0;
      }
    }, 250);
  }

  /** The player's match clock (when the match has one) and, while they're taking too long, the
      time they have left to act before forfeiting: by their picture, like Arena's timer. */
  private renderTimers(orb: HTMLElement, p: PlayerView, state: GameState): void {
    const clock = state.clock;
    const idle = state.idle?.playerId === p.id && !p.hasLost && !p.hasConceded ? state.idle : undefined;
    const hasClock = !!clock && (clock.left[p.id] !== undefined || clock.running === p.id);
    let box = orb.querySelector<HTMLElement>(".timers");
    if (!hasClock && !idle) {
      box?.remove();
      orb.classList.remove("has-timers");
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.className = "timers";
      box.innerHTML = '<span class="mclock" role="timer"></span><span class="idle" role="timer"></span>';
      orb.appendChild(box);
    }
    orb.classList.add("has-timers");
    const who = p.isViewer ? "Your" : `${p.name}'s`;
    const mclock = box.querySelector<HTMLElement>(".mclock")!;
    mclock.hidden = !hasClock;
    if (clock && hasClock) {
      const running = clock.running === p.id;
      mclock.dataset.deadline = running && clock.deadline !== undefined ? String(clock.deadline) : "";
      mclock.dataset.left = String(clock.left[p.id] ?? 0);
      mclock.classList.toggle("running", running);
      mclock.classList.toggle("flagged", clock.timedOut === p.id);
      mclock.title = clock.timedOut === p.id ? `${who} time ran out` : `${who} time left in the match${running ? " (running)" : ""}`;
      updateTimer(mclock);
    }
    const idleEl = box.querySelector<HTMLElement>(".idle")!;
    idleEl.hidden = !idle;
    if (idle) {
      idleEl.dataset.deadline = String(idle.deadline);
      idleEl.dataset.grace = String(idle.graceMs);
      idleEl.dataset.label = p.isViewer ? (idle.away ? "You're away" : "Act now") : idle.away ? "Away" : "Deciding";
      idleEl.title = p.isViewer ? "Take an action before the timer ends, or you forfeit the match."
        : `Waiting for ${p.name} to act. They forfeit the match if the timer ends.`;
      updateTimer(idleEl);
    }
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
      // Watching someone else's game, every turn is named.
      const yours = myTurn && !state.spectating;
      this.banner(yours ? "Your turn" : `${active?.name ?? "Opponent"}'s turn`, myTurn ? "mine" : "theirs");
      if (yours) this.sfx("turn");
    }
    if (prev && this.prevPhase !== state.phase && state.phase === "DECLARE_ATTACKERS" && myTurn && state.pending?.type === "DECLARE_ATTACKERS") {
      this.banner("Declare attackers", "combat");
    }
    this.prevActive = state.activePlayerId;
    this.prevPhase = state.phase;

    this.renderEnd(state, me);
    this.renderReplayBar(state.replay);
    this.renderSpectateBar(state);
  }

  /** Watching someone else's game: says so, top center, with the way out. */
  private renderSpectateBar(state: GameState): void {
    const bar = this.q(".spectate-bar");
    bar.classList.toggle("show", !!state.spectating);
    if (!state.spectating || bar.childElementCount) return;
    bar.innerHTML = `<span class="eye" aria-hidden="true">👁</span><span>Spectating</span>
      <button class="rb leave" data-ui="leave-spectate" title="Stop spectating and leave this game">Leave</button>`;
  }

  /** Watching a replay: its controls, top center (over the opponent's hand). ←/→ step a change,
      Shift+←/→ a turn, Space plays or pauses. */
  private renderReplayBar(status: ReplayStatus | undefined): void {
    const bar = this.q(".replay-bar");
    bar.classList.toggle("show", !!status);
    if (!status) return;
    if (!bar.firstElementChild) {
      bar.innerHTML = `
        <span class="rb-grip" title="Drag to move · double-click to put back" aria-hidden="true">⠿</span>
        <button class="rb" data-replay="turn:-1" title="Previous turn (Shift+←)">⏮</button>
        <button class="rb" data-replay="step:-1" title="Previous change (←)">◀</button>
        <button class="rb play" data-replay="toggle" title="Play / pause (Space)"></button>
        <button class="rb" data-replay="step:1" title="Next change (→)">▶</button>
        <button class="rb" data-replay="turn:1" title="Next turn (Shift+→)">⏭</button>
        <input class="rb-track" type="range" min="0" step="1" aria-label="Replay position">
        <span class="rb-read"></span>
        <button class="rb speed" data-replay="speed" title="Playback speed"></button>
        <button class="rb leave" data-replay="leave" title="Leave the replay">Leave</button>`;
      this.bindReplayDrag(bar);
    }
    this.placeReplayBar(bar);
    bar.querySelector(".play")!.textContent = status.playing ? "❚❚" : "▶";
    bar.querySelector(".speed")!.textContent = `${status.speed}×`;
    const track = bar.querySelector<HTMLInputElement>(".rb-track")!;
    track.max = String(status.frames - 1);
    // Not while it's being dragged: the drag owns its value.
    if (!this.replayScrubbing) track.value = String(status.frame);
    track.style.setProperty("--pct", `${status.frames > 1 ? (status.frame / (status.frames - 1)) * 100 : 0}%`);
    const read = `Turn ${status.turn || "–"} · ${status.frame + 1}/${status.frames}`;
    const readEl = bar.querySelector(".rb-read")!;
    if (readEl.textContent !== read) readEl.textContent = read;
  }

  /** The replay bar is moved by its grip; where it was put (as a share of the board, so it
      holds when the window is resized) is remembered. Double-clicking the grip puts it back. */
  private bindReplayDrag(bar: HTMLElement): void {
    const grip = bar.querySelector<HTMLElement>(".rb-grip")!;
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const box = this.el.getBoundingClientRect();
      const r = bar.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      grip.setPointerCapture(e.pointerId);
      bar.classList.add("dragging");
      const move = (ev: PointerEvent) => {
        this.replayBarAt = {
          x: (ev.clientX - dx - box.left) / box.width,
          y: (ev.clientY - dy - box.top) / box.height,
        };
        this.placeReplayBar(bar);
      };
      const up = () => {
        bar.classList.remove("dragging");
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        try { localStorage.setItem(REPLAY_BAR_KEY, JSON.stringify(this.replayBarAt)); } catch { /* not kept */ }
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    });
    grip.addEventListener("dblclick", () => {
      this.replayBarAt = null;
      try { localStorage.removeItem(REPLAY_BAR_KEY); } catch { /* nothing kept */ }
      this.placeReplayBar(bar);
    });
  }

  /** Puts the replay bar where it was moved to, kept whole on the board; or top center. */
  private placeReplayBar(bar: HTMLElement): void {
    const at = this.replayBarAt;
    bar.classList.toggle("moved", !!at);
    if (!at) {
      bar.style.removeProperty("left");
      bar.style.removeProperty("top");
      return;
    }
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    const x = Math.max(0, Math.min(at.x * w, w - bar.offsetWidth));
    const y = Math.max(0, Math.min(at.y * h, h - bar.offsetHeight));
    bar.style.left = `${x}px`;
    bar.style.top = `${y}px`;
  }

  private replayButton(what: string): void {
    const status = this.state?.replay;
    if (!status) return;
    const [kind, n] = what.split(":");
    if (kind === "leave") return this.hooks.leaveReplay();
    if (kind === "toggle") return this.hooks.replay({ kind: "toggle" });
    if (kind === "step" || kind === "turn") return this.hooks.replay({ kind, delta: Number(n) });
    if (kind === "speed") {
      const next = REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(status.speed) + 1) % REPLAY_SPEEDS.length]!;
      this.hooks.replay({ kind: "speed", speed: next });
    }
  }

  /** A player's picture: their Endstep avatar (framed as they chose); without one, their
      commander's art; and under either, Endstep's logo, which shows if there's no picture or it
      can't load. */
  private avatarHtml(p: PlayerView): string {
    const avatar = avatarPicture(p.username, () => this.state && this.render(this.state));
    const commander = p.commandZone[0];
    const art = commander ? imageUrl(commander, "art_crop") : null;
    const pic = avatar ?? (art ? { url: art, size: "cover", position: "50% 30%" } : null);
    const style = pic ? `background-image: url(&quot;${esc(pic.url)}&quot;); background-size: ${esc(pic.size)}; background-position: ${esc(pic.position)}` : "";
    return `<div class="avatar" title="${esc(p.name)}">${ENDSTEP_LOGO}${pic ? `<div class="pic" style="${style}"></div>` : ""}</div>`;
  }

  /** The game is over, Arena style: the table dims behind your picture, big, with Victory or
      Defeat under it and the way back to Endstep. "View battlefield" (top right) sets it aside. */
  private renderEnd(state: GameState, me: PlayerView | null | undefined): void {
    const box = this.q(".endgame");
    // While the last fight plays out, the result waits; it comes up as the fight ends.
    const wait = this.endHoldUntil - Date.now();
    window.clearTimeout(this.endHoldTimer);
    if (wait > 0 && state.status === "COMPLETE") {
      this.endHoldTimer = window.setTimeout(() => this.state && this.renderEnd(this.state, this.state.players.find((p) => p.isViewer)), wait);
    }
    // A replay's last frame is a finished game, but the replay goes on being watched.
    const over = state.status === "COMPLETE" && !state.replay && wait <= 0;
    if (!over) this.endPeek = false;
    // A spectator sees who won, not a victory or defeat of their own.
    const won = state.winnerId !== undefined && state.winnerId === me?.id && !state.spectating;
    const winner = state.players.find((p) => p.id === state.winnerId);
    const title = state.winnerId === undefined ? "Game over" : state.spectating ? `${winner?.name ?? "Someone"} wins` : won ? "Victory" : "Defeat";
    const html = !over ? "" : `<button class="end-peek" data-ui="end-peek"><span class="p-view">View battlefield</span><span class="p-back">Back to result</span></button>
      <div class="end-body">${me ? this.avatarHtml(me) : ""}<h2>${title}</h2>
        <button class="end-back" data-ui="hide">Back to Endstep</button></div>`;
    if (box.dataset.sig !== html) {
      box.dataset.sig = html;
      box.innerHTML = html;
    }
    if (over && !box.classList.contains("show") && state.winnerId !== undefined && !state.spectating) this.sfx(won ? "win" : "lose");
    const outcome = won ? " won" : state.winnerId === undefined || state.spectating ? "" : " lost";
    box.className = `endgame${over ? " show" : ""}${outcome}${this.endPeek ? " peek" : ""}`;
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
    let stackKey: string | null = null;
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
        const msg = m.kind === "attackers" && m.aiming ? "Click a player or planeswalker to attack" : p.message ?? defaultMessage(p.type, m);
        // The card it's about is on the stack (a spell being cast, a trigger choosing targets):
        // that item glows, and the line needs no picture of it.
        const about = !!(src && url) && (m.kind === "targets" || m.kind === "cards" || p.type === "YES_NO" || this.boardDivide());
        stackKey = about && !this.stackHidden ? this.stackKeyFor(p) : null;
        const pic = stackKey ? "" : thumb;
        html = this.boardDivide() ? this.divideBanner(p)
          : `<div class="pline">${pic}<div class="msg">${pic ? "" : source}${withSymbols(esc(msg))}</div></div>` + controls;
      } else {
        const { title, sub } = promptTitle(state, m);
        // A question from a card (a trigger's yes/no, a color, a number…) shows that card beside
        // the options. Modes, orders and pickers show their own cards.
        const own = m.kind === "order" || m.kind === "divide" || m.kind === "sideboard" || m.kind === "piles" || p.type === "MULLIGAN" || p.type === "CHOOSE_MODE" || p.type === "CHOOSE_ABILITY";
        const srcCard = own ? undefined : this.sourceCard(p);
        const url = srcCard ? imageUrl(srcCard) : null;
        // Scry/surveil show the card that did it on the right, as Arena does.
        const body = srcCard && url
          ? `<div class="pwrap${m.kind === "arrange" || controls.startsWith('<div class="fan') ? " src-right" : ""}"><div class="pcard" data-zoom="${esc(srcCard.id)}"><img src="${esc(url)}" alt="${esc(srcCard.name)}" draggable="false"></div><div class="pbody">${controls}</div></div>`
          : controls;
        html = `<div class="phead"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div>${body}
          <button class="peek-btn" data-ui="peek"><span class="p-view">View battlefield</span><span class="p-back">Back to choice</span></button>`;
      }
    } else if (!p && this.waiting) {
      // Not your move: who the game waits on, and for what.
      html = `<div class="msg dim wait ${this.waiting.kind}"><span class="wait-dot" aria-hidden="true"></span>${esc(this.waiting.text)}</div>`;
    }
    // Never rebuild the order box under a tile being dragged. Reordering the same box only
    // moves its tiles, so the list doesn't jump (or replay its entrance) on every move.
    if (box.dataset.sig !== html && !this.orderDrag?.active && !this.arrDrag?.active && !this.sbDrag?.active) {
      box.dataset.sig = html;
      // The damage box keeps its cards too: only the amounts change.
      const divideBox = m.kind === "divide" && box.dataset.orderKey === this.modeKey ? box.querySelector<HTMLElement>(".divide-box") : null;
      const sameBox = (m.kind === "order" && box.dataset.orderKey === this.modeKey && this.patchOrderBox(box, m))
        || (!!divideBox && !!p?.divide && m.kind === "divide" && this.fillDivideBox(divideBox, p.divide, m));
      if (!sameBox) this.swapHtml(box, html);
      const q = box.querySelector<HTMLInputElement>(".name-q");
      if (q) {
        this.fillNameResults(q);
        // Without scrolling: focusing the box (or typing in it) must not push the screen up.
        q.focus({ preventScroll: true });
      }
      if (m.kind === "order" || m.kind === "divide") box.dataset.orderKey = this.modeKey;
      else delete box.dataset.orderKey;
    }
    box.classList.toggle("show", html !== "");
    box.classList.toggle("center", controls !== "");
    box.classList.toggle("arena", arena);
    box.classList.toggle("sideboarding", m.kind === "sideboard");
    box.classList.toggle("div-strip", this.boardDivide());
    this.startTimerTicker();
    if (this.promptStackKey !== stackKey) {
      if (this.promptStackKey) this.cardEls.get(this.promptStackKey)?.classList.remove("asking");
      this.promptStackKey = stackKey;
    }
    if (stackKey) this.cardEls.get(stackKey)?.classList.add("asking");
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

  /** Fact or Fiction and the like: the piles side by side, each with its cards (face down where
      you can't see them). Click a pile, then take it. */
  private pilesBox(piles: PileView[], m: Extract<Mode, { kind: "piles" }>): string {
    const pile = (pl: PileView) => {
      for (const c of pl.cards) this.cardData.set(c.id, c);
      const faces = pl.cards.map((c) => {
        const url = imageUrl(c, "large");
        return `<div class="pl-card" data-zoom="${esc(c.id)}">${url ? `<img src="${esc(url)}" alt="${esc(c.name)}" draggable="false">` : `<span>${esc(c.name)}</span>`}</div>`;
      });
      const backs = Array.from({ length: pl.size - pl.cards.length }, () => `<div class="pl-card back"><img src="${esc(CARD_BACK_URL)}" alt="Face-down card" draggable="false"></div>`);
      const cards = [...faces, ...backs].join("");
      return `<button class="pile-pick${m.selected === pl.id ? " on" : ""}" data-pile="${esc(pl.id)}">
        <div class="pl-head"><b>${esc(pl.label)}</b><span>${pl.size} card${pl.size === 1 ? "" : "s"}</span></div>
        <div class="pl-cards">${cards || '<i class="pl-empty">Empty pile</i>'}</div></button>`;
    };
    const chosen = piles.find((pl) => pl.id === m.selected);
    return `<div class="piles-pick">${piles.map(pile).join("")}</div>
      <div class="choices big"><button class="opt primary" data-pile-take ${chosen && !this.awaiting ? "" : "disabled"}>${esc(chosen ? `Take ${chosen.label}` : "Choose a pile")}</button></div>`;
  }

  /** Sideboarding, Arena style: the main deck in columns by mana value (lands last), the
      sideboard in a column on the right. Click a card (Shift: every copy) or drag it to move it
      across; Confirm sends the main deck. */
  private sideboardBox(sb: SideboardView, m: Extract<Mode, { kind: "sideboard" }>): string {
    for (const c of sb.cards) this.cardData.set(c.id, c);
    const submitted = sb.self === "SUBMITTED";
    const sideLabel = sb.mode === "COMMANDER_SWAP" ? "Commanders" : "Sideboard";
    const check = sideboardCheck(sb, m.main);
    const off = submitted || this.awaiting ? "disabled" : "";
    const stack = (st: SideboardStack, toMain: boolean, i: number) => {
      const url = imageUrl(st.card, "large");
      return `<button class="sb-card" data-sb-move="${toMain ? "main" : "side"}" data-sb-idx="${st.indexes.join(",")}" data-zoom="${esc(st.card.id)}" style="--i: ${i}" ${off}>
        ${url ? `<img src="${esc(url)}" alt="${esc(st.name)}" draggable="false">` : `<span>${esc(st.name)}</span>`}
        ${st.indexes.length > 1 ? `<b class="sb-qty">×${st.indexes.length}</b>` : ""}</button>`;
    };
    const count = (stacks: SideboardStack[]) => stacks.reduce((n, st) => n + st.indexes.length, 0);
    const columns = deckColumns(sideboardStacks(sb, m.main, true)).map((col) => `<div class="sb-col">
        <h4>${esc(col.label)} <span>${count(col.stacks)}</span></h4>
        <div class="sb-stack">${col.stacks.map((st, i) => stack(st, false, i)).join("")}</div></div>`).join("");
    const side = sideboardStacks(sb, m.main, false);
    const opp = sb.opponent === "SUBMITTED" ? '<span class="sb-ready">Opponent ready</span>' : "<span>Opponent editing…</span>";
    const problem = check.short ? ` · ${check.short} short` : check.over ? ` · ${check.over} over` : "";
    const status = `<div class="sb-status">
        <span class="sb-count${check.ok ? "" : " bad"}">Main ${check.size}${sb.min ? `/${sb.min}` : ""}${problem}</span>
        <span>${esc(sideLabel)} ${sb.cards.length - check.size}</span>${opp}
        ${sb.deadline !== undefined ? `<span class="mclock sb-timer running" role="timer" data-deadline="${sb.deadline}" title="Time left to sideboard"></span>` : ""}</div>`;
    let buttons: string;
    if (m.discarding) {
      buttons = `<p class="sb-ask">Discard your changes? Your main deck goes back to the ${sb.mainCount} cards you registered.</p>
        <button class="opt alt" data-sb="back">Go back</button><button class="opt primary" data-sb="discard" ${this.awaiting ? "disabled" : ""}>Discard changes</button>`;
    } else if (submitted) {
      buttons = `<p class="sb-ask">Submitted. Waiting for your opponent.</p><button class="opt primary" data-sb="withdraw" ${this.awaiting ? "disabled" : ""}>Withdraw</button>`;
    } else {
      const why = check.short ? `Move ${check.short} more in from the ${sideLabel.toLowerCase()}.` : check.over ? `Move ${check.over} out to the ${sideLabel.toLowerCase()}.` : "";
      buttons = `${why ? `<p class="sb-ask bad">${esc(why)}</p>` : ""}<button class="opt alt" data-sb="keep" ${off}>Keep current</button>
        <button class="opt primary" data-sb="confirm" ${off || (check.ok ? "" : "disabled")}>Confirm</button>`;
    }
    return `${status}
      <div class="sb-board${submitted ? " submitted" : ""}">
        <section class="sb-zone main" data-sb-drop="main"><h3>Main deck <span>${check.size}</span></h3><div class="sb-cols">${columns || '<i class="sb-empty">Drag cards here</i>'}</div></section>
        <section class="sb-zone spare" data-sb-drop="side"><h3>${esc(sideLabel)} <span>${sb.cards.length - check.size}</span></h3>
          <div class="sb-stack spare">${side.map((st, i) => stack(st, true, i)).join("") || '<i class="sb-empty">Drag cards here</i>'}</div></section>
      </div>
      <div class="choices big sb-actions">${buttons}</div>`;
  }

  /** Moves a card (Shift: every copy) to the other side of the sideboarding screen. */
  private sideboardClick(btn: HTMLElement, all: boolean): boolean {
    const m = this.mode;
    if (m.kind !== "sideboard" || !btn.dataset.sbMove || this.awaiting) return false;
    const indexes = btn.dataset.sbIdx!.split(",").map(Number);
    this.setMode({ ...m, main: sideboardMove(m.main, all ? indexes : [indexes.at(-1)!], btn.dataset.sbMove === "main") });
    return true;
  }

  /** Scry/surveil in two piles, Arena style: the other pile (graveyard or bottom) on the left,
      the top of the library on the right (leftmost = next card). Click a card to move it
      across, or drag it (also to reorder). Other arrangements are one ordered row. */
  private arrangeBox(m: Extract<Mode, { kind: "arrange" }>): string {
    const tile = (id: string, i: number, top: boolean) => {
      const c = this.cardData.get(id);
      const url = c ? imageUrl(c, "large") : null;
      const tag = top && !m.pick ? (i === 0 ? "Next" : String(i + 1)) : "";
      return `<button class="arr-card" data-arr="${esc(id)}" data-zoom="${esc(id)}" style="--i: ${i}">
        ${url ? `<img src="${esc(url)}" alt="${esc(c?.name ?? "")}" draggable="false">` : `<span>${esc(c?.name ?? id)}</span>`}
        ${tag ? `<b class="arr-tag">${tag}</b>` : ""}</button>`;
    };
    const zone = (key: "top" | "tray", label: string, ids: string[]) => `<section class="arr-zone" data-zone="${key}">
      <h3>${esc(label)}</h3>
      <div class="arr-row" style="--n: ${Math.max(1, ids.length)}">${ids.map((id, i) => tile(id, i, key === "top")).join("") || '<div class="arr-empty">Drag cards here</div>'}</div>
    </section>`;
    const piles = m.context === "piles";
    const trayLabel = piles ? "Pile 1" : m.context === "surveil" ? "Graveyard" : "Bottom of Library";
    const topLabel = piles ? "Pile 2" : m.pick ? "Hand" : m.hasTray ? (m.context === "surveil" ? "Library" : "Top of Library") : m.context === "library_top" ? "Top of Library" : "Order";
    const ready = !m.pick || (m.tray.length >= m.pick.min && m.tray.length <= m.pick.max);
    const done = piles ? `Done · ${m.tray.length} | ${m.top.length}` : m.pick ? `Done · ${m.tray.length}/${m.pick.max}` : "Done";
    return `<div class="arrange${m.hasTray ? " two" : ""}">
        ${m.hasTray ? zone("tray", trayLabel, m.tray) : ""}${zone("top", topLabel, m.top)}
      </div>
      <div class="choices big"><button class="opt primary" data-arrange-done ${ready ? "" : "disabled"}>${esc(done)}</button></div>`;
  }

  /** Arena's card fan: cards spread in an arc, with a slider under it when they don't all fit.
      `key` keeps the scroll position across redraws. Laid out by layoutFans(). */
  private fanHtml(key: string, cards: CardView[], attrs: (c: CardView) => string, cls: (c: CardView) => string, label?: (c: CardView) => string): string {
    for (const c of cards) if (!this.cardData.has(c.id)) this.cardData.set(c.id, c);
    const tiles = cards.map((c, i) => {
      // A face-down card you can't see shows the card back.
      const url = imageUrl(c, "large") ?? (c.faceDown && !c.peeked ? CARD_BACK_URL : null);
      return `<button class="fcard ${cls(c)}" data-fi="${i}" data-zoom="${esc(c.id)}" ${attrs(c)}>
        <div class="fimg">${url ? `<img src="${esc(url)}" alt="${esc(c.name)}" draggable="false">` : `<span>${esc(c.name)}</span>`}</div>${label?.(c) ? `<span class="fzone">${esc(label(c))}</span>` : ""}</button>`;
    }).join("");
    return `<div class="fan" data-fan="${esc(key)}" data-n="${cards.length}">
      <div class="fan-cards">${tiles || '<p class="muted">No cards</p>'}</div>
      <div class="fan-slider" data-fan-slider><div class="fan-thumb">◂ ▸</div></div>
    </div>`;
  }

  /** Replaces a box's content, keeping the cards already shown (a fan's cards, the card that
      asked): picking one only changes its glow, so nothing reloads or flies back into place. */
  private swapHtml(box: HTMLElement, html: string): void {
    const key = (el: HTMLElement) => `${el.closest<HTMLElement>(".fan")?.dataset.fan ?? ""}|${el.dataset.zoom}|${el.querySelector("img")?.getAttribute("src") ?? ""}`;
    const sel = ".fan[data-fan] .fcard[data-zoom], .pcard[data-zoom]";
    const shown = new Map([...box.querySelectorAll<HTMLElement>(sel)].map((el) => [key(el), el]));
    const next = document.createElement("template");
    next.innerHTML = html;
    for (const el of next.content.querySelectorAll<HTMLElement>(sel)) {
      const k = key(el);
      const keep = shown.get(k);
      if (!keep) continue;
      shown.delete(k);
      // Same card: take the new state (picked or not, its place in the fan), keep the layout.
      for (const a of [...keep.attributes]) if (a.name !== "style" && !el.hasAttribute(a.name)) keep.removeAttribute(a.name);
      for (const a of [...el.attributes]) if (a.name !== "style") keep.setAttribute(a.name, a.value);
      el.replaceWith(keep);
    }
    box.replaceChildren(next.content);
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
      // The card under the pointer is raised whole; the ones lying on it move aside to stay in view.
      const hover = this.fanHover?.key === key && this.fanHover.index < n ? this.fanHover.index : -1;
      cards.forEach((c, i) => {
        const d = i - pos;
        const out = Math.abs(d) > half + 0.5;
        c.classList.toggle("hover", i === hover);
        c.style.transform = `translateX(${(d * step + (hover >= 0 && i > hover ? cw * 0.38 : 0)).toFixed(1)}px) translateY(${(d * d * cw * 0.03).toFixed(1)}px) rotate(${(d * 3.2).toFixed(2)}deg)`;
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
    const fromPrompt = !this.localWheel && p && !this.awaiting ? this.promptWheel(p) : null;
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

  private rememberPrinting(c: CardView): void {
    if (c.isToken && !c.faceDown) {
      this.tokens.set(c.id, c);
      this.tokens.set(`${c.controllerId ?? ""}|${c.name}`, c);
    }
    if (c.isToken || c.faceDown || !c.setCode || !c.collectorNumber) return;
    const printing = { setCode: c.setCode, collectorNumber: c.collectorNumber };
    this.printings.set(c.id, printing);
    this.printings.set(`${c.ownerId ?? c.controllerId ?? ""}|${c.name}`, printing);
  }

  /** A card without its printing gets the one it was last seen with (same id, else the same
      name from the same player). */
  private withPrinting(c: CardView, playerId?: string): CardView {
    if (c.setCode && c.collectorNumber) {
      this.rememberPrinting(c);
      return c;
    }
    const known = this.printings.get(c.id) ?? this.printings.get(`${c.ownerId ?? c.controllerId ?? playerId ?? ""}|${c.name}`);
    return known ? { ...c, ...known } : c;
  }

  /** The stack item a prompt comes from (the topmost one when several match), if it's shown:
      by card id, else by name (a spell being cast may be on the stack under another id). */
  private stackKeyFor(p: PendingActionView): string | null {
    const name = p.sourceCardName ?? (p.sourceCardId ? this.cardData.get(p.sourceCardId)?.name : undefined);
    let byId: string | null = null;
    let byName: string | null = null;
    // stackEls runs bottom to top, so the last match is the one nearest the top.
    for (const [key, s] of this.stackEls) {
      if (p.sourceCardId && [s.sourceCardId, s.card?.id, s.id].includes(p.sourceCardId)) byId = key;
      if (name && (s.card?.name ?? s.name) === name) byName = key;
    }
    // A yes/no that names no card at all is asked by what's resolving: the top item, when it's
    // yours. One that names a card (the land you fetched asking for life) is about that card.
    const top = [...this.stackEls].pop();
    const fallback = p.type === "YES_NO" && !p.sourceCardId && !p.sourceCardName && p.contextType !== "replacement" && top && top[1].controllerId === this.state?.players.find((pl) => pl.isViewer)?.id ? top[0] : null;
    const found = byId ?? byName ?? fallback;
    return found && this.cardEls.get(found)?.isConnected ? found : null;
  }

  /** The names matching the search box of a "name a card" prompt: names starting with what's
      typed first, then names containing it. With no list from Endstep, what's typed is the answer.
      A long list of types (Cavern of Souls' creature types) is searched the same way, and shown
      whole until something is typed. */
  private fillNameResults(q: HTMLInputElement): void {
    const list = q.parentElement?.querySelector<HTMLElement>(".name-results");
    const p = this.state?.pending;
    if (!list || !p || !searchedChoice(p)) return;
    const types = p.type === "CHOOSE_TYPE";
    const text = q.value.trim();
    const needle = text.toLowerCase();
    const LIMIT = types ? p.stringOptions.length : 30;
    let names: string[];
    if (!p.stringOptions.length) names = text ? [text] : [];
    else if (!needle) names = types ? [...p.stringOptions].sort() : [];
    else {
      const starts: string[] = [];
      const has: string[] = [];
      for (const n of p.stringOptions) {
        const l = n.toLowerCase();
        if (l.startsWith(needle)) starts.push(n);
        else if (l.includes(needle)) has.push(n);
      }
      names = [...starts.sort(), ...has.sort()];
    }
    const more = names.length > LIMIT ? `<p class="name-more">${names.length - LIMIT} more: keep typing</p>` : "";
    list.innerHTML = names.slice(0, LIMIT).map((n, i) => `<button class="name-opt${i === 0 && needle ? " first" : ""}" data-string="${esc(n)}">${esc(n)}</button>`).join("")
      + more
      + (!names.length ? `<p class="name-more">${needle ? (types ? "No type with that name" : "No card with that name") : `Search ${p.stringOptions.length ? `${p.stringOptions.length} names` : "any card"} · Enter picks the first`}</p>` : "");
  }

  /** A prompt answered on the mana wheel: a mana choice, or a color asked by a mana ability. */
  private promptWheel(p: PendingActionView): WheelOption[] | null {
    if (p.type === "CHOOSE_MANA") return wheelFromStrings(p.stringOptions);
    if (p.type !== "CHOOSE_COLOR") return null;
    const src = p.sourceCardId ? this.cardData.get(p.sourceCardId) : undefined;
    const mana = /\bmana\b/i.test(p.message ?? "") || !!src?.types.includes("Land") || (!!this.manaSource && (!p.sourceCardId || p.sourceCardId === this.manaSource));
    return mana ? wheelFromStrings(p.stringOptions.length ? p.stringOptions : ["White", "Blue", "Black", "Red", "Green"]) : null;
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
    // A token already gone (a Clue sacrificed to pay for its own ability) keeps its art.
    const me = this.state?.players.find((pl) => pl.isViewer)?.id ?? "";
    const known = (p.sourceCardId ? this.cardData.get(p.sourceCardId) ?? this.tokens.get(p.sourceCardId) : undefined)
      ?? (p.sourceCardName ? this.tokens.get(`${me}|${p.sourceCardName}`) ?? blankCard(`src:${p.sourceCardName}`, p.sourceCardName) : undefined);
    const c = known && this.withPrinting(known, this.state?.players.find((pl) => pl.isViewer)?.id);
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

  /** What divides its damage: the creature in combat with the name Endstep gives, or the spell. */
  private divideSource(state: GameState, p: PendingActionView): CardView | undefined {
    const name = p.sourceCardName;
    const fighting = name ? state.players.flatMap((pl) => pl.battlefield).find((c) => c.name === name && (c.isAttacking || c.isBlocking)) : undefined;
    return (fighting && this.cardData.get(fighting.id)) ?? fighting ?? (name ? this.sourceCard(p) : undefined);
  }

  /**
   * Dividing combat damage among blockers (and, with trample, the defending player), Arena
   * style: the attacker on the left with the damage still to assign, then each blocker's card
   * with pips up to lethal and a seal once it's lethal. Click a card for +1, right-click for −1,
   * Ctrl-click for lethal; − / + under each. The player stays locked until every blocker has
   * lethal damage. Done once it's all assigned.
   * (A spell dividing its damage among its targets is done on the table instead: boardDivide().)
   */
  private divideBox(state: GameState, p: PendingActionView, m: Extract<Mode, { kind: "divide" }>): string {
    const d = p.divide!;
    const src = this.divideSource(state, p);
    const url = src ? imageUrl(src, "large") : null;
    const text = src ? [src.oracleText ?? "", ...(src.keywordsGranted ?? [])].join("\n") : "";
    const deathtouch = /\bdeathtouch\b/i.test(text);
    const combat = d.kind === "combat";
    const trample = combat && d.options.some((o) => o.player);
    const shield = `<svg viewBox="0 0 34 40" aria-hidden="true"><path d="M17 2 L31 7 V20 C31 30 24 36 17 38 C10 36 3 30 3 20 V7 Z"/></svg>`;
    const tiles = d.options.map((o, i) => {
      const card = o.player ? undefined : this.cardData.get(o.id) ?? p.optionCards.find((c) => c.id === o.id);
      const art = card ? imageUrl(card, "large") : null;
      const pic = o.player ? `<div class="dplayer">${shield}</div>`
        : art ? `<img src="${esc(art)}" alt="${esc(o.name)}" draggable="false">` : `<span class="dblank">${esc(o.name)}</span>`;
      return `<div class="dtile${o.player ? " player" : ""}" data-div-tile="${i}">
        <button class="dart" data-div-add="${i}" ${card ? `data-zoom="${esc(card.id)}"` : ""}>${pic}<span class="dseal"></span><span class="dlock"></span></button>
        <div class="dname">${esc(o.player ? "Defending player" : o.name)}</div>
        <div class="dpips"></div>
        <div class="dctl"><button class="opt round" data-div-sub="${i}" title="−1 (right-click the card)">−</button><b class="damt"></b><button class="opt round" data-div-add="${i}" title="+1 (Ctrl-click: lethal)">+</button></div>
      </div>`;
    }).join("");
    const notes = [deathtouch ? "Deathtouch · 1 is lethal" : "", trample && !d.freeSpill ? "Trample · every blocker needs lethal before the rest goes to the player" : ""].filter(Boolean);
    const box = `<div class="divide-box">
      <div class="divide-row" style="--n: ${d.options.length + 1}">
        <div class="dsrc">
          <div class="dsrc-art"${src ? ` data-zoom="${esc(src.id)}"` : ""}>${url ? `<img src="${esc(url)}" alt="${esc(src!.name)}" draggable="false">` : ""}</div>
          <div class="dname">${esc(src?.name ?? p.sourceCardName ?? "Attacker")}</div>
          <div class="dpool"></div>
          <div class="dleft"><b></b><small>left of ${d.total}</small></div>
        </div>
        ${tiles}
      </div>
      ${notes.length ? `<div class="divide-notes">${notes.map((n) => `<span>${esc(n)}</span>`).join("")}</div>` : ""}
      <div class="order-legend"><span>Click +1</span><span>Right-click −1</span><span>Ctrl-click lethal</span></div>
      <div class="choices big">
        <button class="opt alt" data-div-reset title="R">Reset</button>
        <button class="opt primary" data-div-confirm title="Space">Done</button>
      </div>
    </div>`;
    // Built empty, then filled by the same code that refreshes it (patchDivideBox).
    const t = document.createElement("template");
    t.innerHTML = box;
    this.fillDivideBox(t.content.firstElementChild as HTMLElement, d, m);
    return (t.content.firstElementChild as HTMLElement).outerHTML;
  }

  /** Writes the amounts into a damage box: each tile's pips, seal and lock, what's left, Done. */
  private fillDivideBox(box: HTMLElement, d: DivideView, m: Extract<Mode, { kind: "divide" }>): boolean {
    const tiles = [...box.querySelectorAll<HTMLElement>(".dtile[data-div-tile]")];
    if (tiles.length !== d.options.length) return false;
    const left = divideLeft(d, m.amounts);
    const off = this.awaiting;
    tiles.forEach((tile, i) => {
      const o = d.options[i]!;
      const n = m.amounts[i] ?? 0;
      const lethal = o.lethal != null && o.lethal > 0 && n >= o.lethal;
      const locked = divideLocked(d, m.amounts, i);
      tile.classList.toggle("lethal", lethal);
      tile.classList.toggle("locked", locked);
      tile.classList.toggle("some", n > 0);
      tile.querySelector(".damt")!.textContent = String(n);
      // Pips up to lethal (when there are few), and what goes past it; or "2/5 lethal".
      const pips = o.player ? `<span class="dtext">${n ? `${n} to the player` : locked ? "Lethal to every blocker first" : "Spillover"}</span>`
        : o.lethal != null && o.lethal > 0 && o.lethal <= 8
          ? Array.from({ length: o.lethal }, (_, k) => `<i class="${k < n ? "on" : ""}"></i>`).join("") + (n > o.lethal ? `<span class="dover">+${n - o.lethal}</span>` : "")
          : `<span class="dtext">${n}${o.lethal != null ? `/${o.lethal} lethal` : ""}</span>`;
      const pipBox = tile.querySelector<HTMLElement>(".dpips")!;
      if (pipBox.innerHTML !== pips) pipBox.innerHTML = pips;
      // The card itself stays live with nothing left: a right-click on it takes one back.
      tile.querySelector<HTMLButtonElement>(".dctl [data-div-add]")!.disabled = off || locked || left <= 0;
      tile.querySelector<HTMLButtonElement>(".dart")!.disabled = off || locked;
      tile.querySelector<HTMLButtonElement>("[data-div-sub]")!.disabled = off || n <= 0;
    });
    const src = box.querySelector<HTMLElement>(".dsrc")!;
    src.classList.toggle("ready", divideReady(d, m.amounts));
    src.querySelector(".dleft b")!.textContent = String(left);
    const pool = d.total <= 12 ? Array.from({ length: d.total }, (_, k) => `<i class="${k < left ? "on" : ""}"></i>`).join("") : "";
    const poolBox = src.querySelector<HTMLElement>(".dpool")!;
    if (poolBox.innerHTML !== pool) poolBox.innerHTML = pool;
    const done = box.querySelector<HTMLButtonElement>("[data-div-confirm]")!;
    done.disabled = off || !divideReady(d, m.amounts);
    box.querySelector<HTMLButtonElement>("[data-div-reset]")!.disabled = off;
    return true;
  }

  /** A click in the damage box: +1 / −1 (Ctrl: to lethal), Reset, Done. */
  private divideButton(btn: HTMLElement, lethal: boolean): boolean {
    const d = btn.dataset;
    if (d.divAdd === undefined && d.divSub === undefined && d.divReset === undefined && d.divConfirm === undefined) return false;
    const p = this.state?.pending;
    const m = this.mode;
    if (!p?.divide || m.kind !== "divide" || this.awaiting) return true;
    if (d.divConfirm !== undefined) {
      if (!divideReady(p.divide, m.amounts)) return true;
      this.controller.divide(m.amounts);
      this.setAwaiting(true);
      this.render(this.state);
      return true;
    }
    if (d.divReset !== undefined) this.setMode({ ...m, amounts: divideStart(p.divide) });
    else this.setMode({ ...m, amounts: divideStep(p.divide, m.amounts, Number(d.divAdd ?? d.divSub), d.divAdd !== undefined, lethal) });
    return true;
  }

  private choiceControls(state: GameState): string {
    const p = state.pending!;
    const m = this.mode;
    if (m.kind === "piles" && p.piles) return this.pilesBox(p.piles, m);
    if (m.kind === "sideboard" && p.sideboard) return this.sideboardBox(p.sideboard, m);
    if (this.choiceInFan(p)) {
      // Cards from a library, graveyard or exile: an Arena fan to pick from (orange = picked).
      // Its buttons go under the fan, side by side: Cancel (when the choice can be declined) and Submit.
      const sel = m.kind === "cards" || m.kind === "targets" ? m.selected : [];
      const off = this.awaiting ? "disabled" : "";
      if (m.kind === "cards" && m.learn) {
        // Learn: two buttons under the fan, one showing the sideboard's Lessons, the other the
        // hand to discard from (the one shown is lit). No Cancel here.
        const { lessons, hand, discarding } = m.learn;
        const tab = (step: string, label: string, on: boolean, n: number) =>
          `<button class="opt ${on ? "primary" : "alt"}" data-learn="${step}" ${this.awaiting || !n ? "disabled" : ""}>${label}</button>`;
        const cards = p.optionCards.filter((c) => m.valid.has(c.id)).map((c) => this.cardData.get(c.id) ?? c);
        return this.fanHtml(`pick:${this.modeKey}:${discarding ? "discard" : "lessons"}`, cards,
          (c) => `data-pick="${esc(c.id)}"`, (c) => (sel.includes(c.id) ? "on" : "selectable"))
          + `<div class="choices big">${tab("lessons", "Show sideboard", !discarding, lessons.length)}${tab("discard", "Show hand", discarding, hand.length)}</div>`;
      }
      let buttons = "";
      if (m.kind === "cards" || m.kind === "targets") {
        const count = `${m.selected.length}${m.max > 1 && m.max < 99 ? `/${m.max}` : ""}`;
        buttons = `<div class="choices big">${m.mandatory ? "" : `<button class="opt alt" data-act="decline" ${off}>Cancel</button>`}<button class="opt primary" data-act="confirm" ${off || (canConfirm(m) ? "" : "disabled")}>Submit ${esc(count)}</button></div>`;
      }
      // The fuller card where it's known (a prompt may name an opponent's hand card by id only).
      return this.fanHtml(`pick:${this.modeKey}`, p.optionCards.filter((c) => !isPlayerId(c.id)).map((c) => this.cardData.get(c.id) ?? c),
        (c) => `data-pick="${esc(c.id)}"`, (c) => (sel.includes(c.id) ? "on" : "selectable"), optionZoneLabel(p)) + buttons;
    }
    if (m.kind === "order") return this.orderBox(p, m);
    if (m.kind === "divide") return this.boardDivide() ? "" : this.divideBox(state, p, m);
    if (m.kind === "arrange") return this.arrangeBox(m);
    // A color of mana is picked on the wheel over its card; the corner just says so.
    if (this.promptWheel(p)) return "";
    if (m.kind !== "choice") return "";
    switch (p.type) {
      case "YES_NO": {
        // A yes/no is answered from the action buttons, beside its card on the right. Only
        // play or draw and dredge keep the whole screen.
        if (!fullScreenYesNo(p, state)) return "";
        const labels = yesNoLabels(p);
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
        const x = this.asksX(p);
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
      case "CHOOSE_CARD_NAME":
        // Naming a card: a search box instead of every name in the game. The results are
        // filled in as you type (fillNameResults), so the box keeps its focus.
        return `<div class="namepick">
            <input class="name-q" type="search" placeholder="Type a card name…" autocomplete="off" spellcheck="false">
            <div class="name-results"></div>
          </div>`;
      default:
        // A long list of types (every creature type, for Cavern of Souls): the same search box.
        if (searchedChoice(p)) {
          return `<div class="namepick">
            <input class="name-q" type="search" placeholder="Type a type…" autocomplete="off" spellcheck="false">
            <div class="name-results"></div>
          </div>`;
        }
        return `<div class="choices">${p.stringOptions.map((s) => `<button class="opt" data-string="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
    }
  }

  private renderDock(state: GameState): void {
    const p = state.pending;
    const m = this.mode;
    const me = state.players.find((pl) => pl.isViewer);
    const myTurn = !!me && state.activePlayerId === me.id;
    const buttons: { id: string; label: string; primary?: boolean; disabled?: boolean; on?: boolean }[] = [];

    const live = state.status !== "COMPLETE" && m.kind !== "classic" && !state.replay && !state.spectating;
    if (!live) {
      // nothing (a replay, or someone else's game, is only watched)
    } else if (this.passUntil) {
      // Passing for you: what it's passing to, and a way to stop.
      const label = this.passUntil.target === "endTurn" ? "Ending turn…" : `Passing to ${passLabel(this.passUntil.target)}…`;
      buttons.push({ id: "passing", label, primary: true, disabled: true });
      buttons.unshift({ id: "stop-pass", label: "Stop passing" });
    } else if (!p) {
      buttons.push({ id: "wait", label: this.waiting?.short ?? (myTurn ? "Waiting…" : "Opponent's turn"), primary: true, disabled: true });
      buttons.push({ id: "pass-until", label: "Pass until…" });
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
        // Under the rest (the dock stacks upward): skip what's left of your turn, as Endstep's own button does.
        if (myTurn && !endTurn && state.turnNumber !== undefined) buttons.unshift({ id: "end-turn", label: "End turn" });
      }
      buttons.push({ id: "hold", label: this.holdPriority ? "Holding priority (H)" : "Hold priority (H)", on: this.holdPriority });
      buttons.push({ id: "pass-until", label: "Pass until…" });
    } else if (p.type === "YES_NO" && !fullScreenYesNo(p, state)) {
      // The answers replace the action buttons, as in Arena: Decline (blue) on top, Take action
      // (orange) under it. Answers Endstep words its own way keep their words.
      const [yes, no] = yesNoLabels(p);
      const plain = /^yes$/i.test(yes) && /^no$/i.test(no);
      buttons.push({ id: "yes", label: plain ? "Take action" : yes, primary: true });
      buttons.push({ id: "no", label: plain ? "Decline" : no, primary: true });
    } else if (m.kind === "attackers") {
      buttons.push({ id: "all-attack", label: "All attack" });
      if (m.assignments.size) buttons.push({ id: "clear", label: "Clear" });
      buttons.push({ id: "confirm", label: m.assignments.size ? `Attack · ${m.assignments.size}` : "No attacks", primary: true });
    } else if (m.kind === "blockers") {
      if (m.assignments.size) buttons.push({ id: "clear", label: "Clear" });
      buttons.push({ id: "confirm", label: m.assignments.size ? `Block · ${m.assignments.size}` : "No blocks", primary: true });
    } else if (m.kind === "divide" && p.divide && this.boardDivide()) {
      // A spell's damage divided on the table: Reset under Submit, like Arena's Cancel and Submit.
      buttons.push({ id: "div-reset", label: "Reset" });
      buttons.push({ id: "div-submit", label: "Submit", primary: true, disabled: !divideReady(p.divide, m.amounts) });
    } else if (m.kind === "cards" && m.mana) {
      buttons.push({ id: "cancel", label: "Cancel" });
      // A Phyrexian symbol left: 2 life pays for it (so does a click on your plate).
      if (p.phyrexian) buttons.push({ id: "pay-life", label: "Pay 2 life" });
      buttons.push({ id: "auto-pay", label: "Auto pay", primary: true });
    } else if (m.kind === "targets" || m.kind === "cards") {
      // Picking from a fan of cards: Cancel and Submit are under the fan instead.
      if (!this.q(".prompt .fan")) {
        if (!m.mandatory) buttons.push({ id: "decline", label: "Cancel" });
        // Proliferate: everything of yours at once (or click them one by one, then Done).
        if (p && isProliferate(p)) {
          const yours = this.proliferateYours();
          if (yours.length) buttons.push({ id: "prolif-mine", label: `All yours · ${yours.length}` });
        }
        const count = `${m.selected.length}${m.max > 1 && m.max < 99 ? `/${m.max}` : ""}`;
        buttons.push({ id: "confirm", label: `Done · ${count}`, primary: true, disabled: !canConfirm(m) });
      }
    }
    // Endstep says when the last action can be taken back.
    if (p?.canUndo && buttons.length) buttons.push({ id: "undo", label: "↶ Undo" });
    const html = buttons.map((b) => `<button class="${b.primary ? "primary" : "secondary"}${b.on ? " on" : ""}" data-act="${b.id}" ${b.disabled || (this.awaiting && b.id !== "stop-pass") ? "disabled" : ""}>${esc(b.label)}</button>`).join("");
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
    // --bf-w: min(8vw, 12.6vh) at the chosen card size, the full size of a battlefield card.
    const bfw = Math.min(window.innerWidth * 0.08, window.innerHeight * 0.126) * this.prefs.cardScale;
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
    for (const [pool, piles, bar, plate] of [[".me-mana", ".me-piles", ".me-bar", ".me-plate"], [".opp-mana", ".opp-piles", ".opp-bar", ".opp-plate"]] as const) {
      const el = this.q(pool);
      const n = el.children.length;
      if (!n) continue;
      const box = this.el.getBoundingClientRect();
      const barEl = this.q(bar);
      const b = barEl.getBoundingClientRect();
      // The visible piles (their container is a little wider than the cards).
      // (The opponent's piles are on the right: their mana starts after their name plate instead.)
      const pilesEl = this.q(piles);
      const pilesBox = pilesEl.getBoundingClientRect();
      const pilesLeftSide = pilesBox.left + pilesBox.width / 2 < box.left + box.width / 2;
      const pilesRight = pilesLeftSide
        ? Math.max(box.left, ...[...pilesEl.querySelectorAll<HTMLElement>(".pile")].map((x) => x.getBoundingClientRect().right))
        : Math.max(box.left + 10, this.q(plate).getBoundingClientRect().right);
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
    // (A spell's damage divided on the table keeps its strip across the middle.)
    if (prompt.classList.contains("show") && !prompt.classList.contains("center") && !prompt.classList.contains("div-strip")) {
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
    this.applyHandHover();
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
    // A big hand keeps a shallow arc: its outer cards would otherwise sink out of sight.
    const half = (n - 1) / 2;
    const sink = Math.min(1, (cw * 0.45) / (half * half * spread * 0.9 || 1));
    items.forEach((it, i) => {
      const t = i - (n - 1) / 2;
      it.style.setProperty("--x", `${t * step}px`);
      it.style.setProperty("--r", `${t * spread * Math.max(0.6, Math.min(1, 1 - (n - 9) * 0.05))}deg`);
      it.style.setProperty("--y", `${Math.abs(t) * Math.abs(t) * spread * 0.9 * sink}px`);
      it.style.zIndex = String(i + 1);
    });
    return cw + step * (n - 1);
  }

  /**
   * The card of your hand at a point, as the fan is laid out at rest (each card's own box, tilted
   * as it is; the rightmost wins where they overlap). Hovering goes by this rather than by the
   * element under the pointer: the raised card is enlarged and its neighbours move aside, so with
   * a big hand (forty cards, each showing a sliver) the picture would hide the cards beside it and
   * the pointer could never reach them. This way every card keeps its sliver of the row, wherever
   * the cards are drawn: sliding along the hand goes through them one by one, as in Arena.
   */
  private hitHand(hand: HTMLElement, x: number, y: number): string | null {
    const box = hand.getBoundingClientRect();
    const items = [...hand.children] as HTMLElement[];
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]!;
      const w = it.offsetWidth;
      const h = it.offsetHeight;
      // The card turns around a point below it (transform-origin: 50% 120%): turn the pointer back.
      const r = -(parseFloat(it.style.getPropertyValue("--r")) || 0) * Math.PI / 180;
      const dx = x - (box.left + it.offsetLeft + w / 2);
      const dy = y - (box.top + it.offsetTop + h * 1.2);
      const ux = dx * Math.cos(r) - dy * Math.sin(r);
      const uy = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(ux) <= w / 2 && uy >= -1.2 * h && uy <= -0.2 * h) return it.dataset.id ?? null;
    }
    return null;
  }

  private updateHandHover(e: PointerEvent): void {
    if (this.drag || this.arrDrag || this.orderDrag) return;
    // (The board lives in a shadow root: the real target is the first of the composed path.)
    const t = e.composedPath()[0];
    const card = t instanceof Element ? t.closest<HTMLElement>(".hand.mine .card[data-id]") : null;
    // On the raised picture, above the row: it stays up.
    this.setHandHover(card ? this.hitHand(card.parentElement!, e.clientX, e.clientY) ?? (card.classList.contains("hover") ? card.dataset.id! : null) : null);
    // A fan's cards the same way (see layoutFans for where each one lies).
    const fcard = t instanceof Element ? t.closest<HTMLElement>(".fan[data-fan] .fcard") : null;
    const fan = fcard?.closest<HTMLElement>(".fan[data-fan]");
    const index = fan ? this.hitFan(fan, e.clientX, e.clientY) ?? (fcard!.classList.contains("hover") ? Number(fcard!.dataset.fi) : null) : null;
    const next = fan && index !== null ? { key: fan.dataset.fan!, index } : null;
    if (next?.key !== this.fanHover?.key || next?.index !== this.fanHover?.index) {
      this.fanHover = next;
      this.layoutFans();
    }
  }

  /** The card of a fan at a point, as the fan lies at rest (each card on the one to its left). */
  private hitFan(fan: HTMLElement, x: number, y: number): number | null {
    const cards = [...fan.querySelectorAll<HTMLElement>(".fcard")];
    const box = fan.querySelector<HTMLElement>(".fan-cards")?.getBoundingClientRect();
    const w = cards[0]?.offsetWidth ?? 0;
    const h = cards[0]?.offsetHeight ?? 0;
    if (!box || !w) return null;
    const pos = this.fanPos.get(fan.dataset.fan!) ?? 0;
    for (let i = cards.length - 1; i >= 0; i--) {
      if (cards[i]!.style.opacity === "0") continue;
      const d = i - pos;
      // Turned around a point below it (transform-origin: 50% 110%), then moved along the arc.
      const r = -(d * 3.2) * Math.PI / 180;
      const dx = x - (box.left + cards[i]!.offsetLeft + w / 2 + d * w * 0.62);
      const dy = y - (box.top + cards[i]!.offsetTop + h * 1.1 + d * d * w * 0.03);
      const ux = dx * Math.cos(r) - dy * Math.sin(r);
      const uy = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(ux) <= w / 2 && uy >= -1.1 * h && uy <= -0.1 * h) return i;
    }
    return null;
  }

  private setHandHover(id: string | null): void {
    if (id === this.handHover) return;
    this.handHover = id;
    this.applyHandHover();
  }

  /** Raises the hovered hand card and, in a crowded hand, moves the cards on each side away from
      it, so the ones next to it show more than a sliver. */
  private applyHandHover(): void {
    const hands = [this.q(".my-hand"), this.q(".side-hand")].map((hand) => [...hand.children] as HTMLElement[]);
    if (!hands.some((items) => items.some((it) => it.dataset.id === this.handHover))) this.handHover = null;
    for (const items of hands) this.applyHover(items);
  }

  private applyHover(items: HTMLElement[]): void {
    const at = items.findIndex((it) => it.dataset.id === this.handHover);
    const x = (it: HTMLElement | undefined) => parseFloat(it?.style.getPropertyValue("--x") ?? "") || 0;
    const cw = items[0]?.offsetWidth ?? 0;
    const step = items.length > 1 ? x(items[1]) - x(items[0]) : cw;
    const gap = Math.max(0, Math.min(cw * 0.5, cw * 0.55 - step));
    items.forEach((it, i) => {
      it.classList.toggle("hover", i === at);
      it.style.setProperty("--push", `${at < 0 || i === at ? 0 : i < at ? -gap : gap}px`);
    });
  }

  private scheduleArrows(): void {
    cancelAnimationFrame(this.arrowsTimer);
    this.arrowsTimer = requestAnimationFrame(() => this.drawArrows());
    // Again once moves have settled (combat steps take 0.42s).
    window.setTimeout(() => this.drawArrows(), 480 / this.speed);
  }

  private anchor(key: string): DOMRect | null {
    // A prompt's arrows leave from the stack item it's about, else from its text.
    const asking = this.promptStackKey ? this.cardEls.get(this.promptStackKey) : undefined;
    const el = key === PROMPT_KEY ? (asking?.isConnected && !asking.closest(".stack-dock.collapsed") ? asking : undefined)
        ?? this.el.querySelector<HTMLElement>(".prompt.show")
      : key.startsWith("player:")
      ? this.el.querySelector<HTMLElement>(`.life-orb[data-player="${key.slice(7)}"]`) ?? this.el.querySelector<HTMLElement>(`.tile[data-player="${key.slice(7)}"]`)
      : this.elFor(key);
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
    // The prompt text: arrows leave from its left edge, toward the board.
    if (key === PROMPT_KEY && !this.promptStackKey) return { x: r.left - origin.left, y: r.top + r.height / 2 - origin.top };
    const el = key.startsWith("player:") ? null : this.elFor(key);
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
    const links: { from: string; to: string; kind: "atk" | "blk" | "src" | "tgt"; pending?: boolean; amount?: number }[] = [];
    // Stack: every ability points back at the card it comes from; the top item
    // (and the one under the pointer) points at its targets.
    const top = state.stack[0];
    for (const [elId, s] of this.stackEls) {
      if (s.isAbility && s.sourceCardId && s.sourceCardId !== elId) links.push({ from: s.sourceCardId, to: elId, kind: "src" });
      // A spell dividing its damage: each target's share by its arrow's head.
      if (s === top || elId === this.hoverStack) for (const t of s.targets) if (t !== elId) links.push({ from: elId, to: t, kind: "tgt", amount: s.divided?.[t] });
    }
    // A defender is a card id, or "player:<seat>" (the key the arrows find a player by).
    for (const a of state.combat.attacks) links.push({ from: a.fromId, to: a.toId, kind: "atk" });
    for (const b of state.combat.blocks) links.push({ from: b.fromId, to: b.toId, kind: "blk" });
    const m = this.mode;
    if (m.kind === "blockers") m.assignments.forEach((att, blk) => links.push({ from: blk, to: att, kind: "blk", pending: true }));
    if (m.kind === "attackers" && m.defenders) {
      m.assignments.forEach((def, att) => {
        const to = keyForDefender(m, def, state);
        if (to) links.push({ from: att, to, kind: "atk", pending: true });
      });
    }
    const path = (a: { x: number; y: number }, b: { x: number; y: number }, cls: string, kind: string) => {
      const { x: x1, y: y1 } = a;
      const { x: x2, y: y2 } = b;
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15;
      const my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.1;
      return `<path class="${cls}" d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" marker-end="url(#ah-${kind})"/>`;
    };
    let html = links.map((l) => {
      const a = this.point(l.from, origin);
      const b = this.point(l.to, origin);
      if (!a || !b) return "";
      const line = path(a, b, `arrow ${l.kind}${l.pending ? " pending" : ""}`, l.kind);
      if (l.amount === undefined) return line;
      // Just short of the head, on the way in.
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const x = b.x - ((b.x - a.x) / len) * 30;
      const y = b.y - ((b.y - a.y) / len) * 30;
      return `${line}<g class="arrow-amt" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="13"/><text dy="0.35em">${l.amount}</text></g>`;
    }).join("");
    // A spell's damage divided on the table: the spell points at each target given some.
    if (m.kind === "divide" && this.boardDivide()) {
      state.pending!.divide!.options.forEach((o, i) => {
        if (!(m.amounts[i]! > 0)) return;
        const a = this.point(PROMPT_KEY, origin);
        const b = this.point(divideKey(o.id), origin);
        if (a && b) html += path(a, b, "arrow tgt", "tgt");
      });
    }
    this.placeDivideBadges(origin);
    // Choosing targets: the prompt text points at the targets picked so far (not a discard).
    const aim = this.aimSource();
    if (m.kind === "targets" && !this.awaiting && !(state.pending && (discardInHand(state, state.pending) || isProliferate(state.pending)))) {
      for (const t of m.selected) {
        const a = this.point(PROMPT_KEY, origin);
        const b = this.point(t, origin);
        if (a && b) html += path(a, b, "arrow tgt pending", "tgt");
      }
    }
    // An attacker being aimed, or a spell/ability choosing targets: an arrow from it to the
    // pointer, snapping onto what it can go at.
    if (aim && this.aimPoint) {
      const a = this.point(aim.from, origin);
      const under = document.elementFromPoint(this.aimPoint.x, this.aimPoint.y);
      const overKey = under instanceof HTMLElement ? this.keyFromTarget(under) : null;
      const snap = overKey && overKey !== aim.from && aim.accepts(overKey) ? this.point(overKey, origin) : null;
      const b = snap ?? { x: this.aimPoint.x - origin.left, y: this.aimPoint.y - origin.top };
      if (a && Math.hypot(b.x - a.x, b.y - a.y) > 12) html += path(a, b, `arrow ${aim.kind} aim${snap ? " locked" : ""}`, aim.kind);
    }
    g.innerHTML = html;
  }

  /** What an arrow follows the pointer from right now: an attacker being aimed, or the prompt
      text asking for targets. */
  private aimSource(): { from: string; kind: "atk" | "tgt"; accepts: (key: string) => boolean } | null {
    const m = this.mode;
    const state = this.state;
    if (!state || this.awaiting) return null;
    if (m.kind === "attackers" && m.aiming) return { from: m.aiming, kind: "atk", accepts: (k) => defenderForKey(m, k, state) !== null };
    if (m.kind !== "targets" || m.selected.length >= m.max || this.el.querySelector(".prompt .fan")) return null;
    // Discarding from your hand, or proliferating, isn't aiming at anything: the cards are just clicked.
    if (state.pending && (discardInHand(state, state.pending) || isProliferate(state.pending))) return null;
    // The legend rule (which of your copies to keep) isn't a spell aiming at something: no arrow.
    const copies = [...m.valid].map((id) => this.cardData.get(id));
    const sameName = copies.length > 1 && copies.every((c) => !!c && c.name === copies[0]?.name && c.controllerId === copies[0]?.controllerId && /legendary/i.test(c.typeLine ?? ""));
    if (sameName || /legend/i.test(state.pending?.message ?? "")) return null;
    return { from: PROMPT_KEY, kind: "tgt", accepts: (k) => m.valid.has(k) && !m.selected.includes(k) };
  }

  // ---------------------------------------------------------------- events

  private bindEvents(): void {
    const el = this.el;
    el.addEventListener("click", (e) => this.onClick(e));
    // The board and its full-screen choices never scroll; a browser bringing a text box into
    // view (the "name a card" search) is put back at once.
    el.addEventListener("scroll", (e) => {
      const t = e.target as HTMLElement;
      if (t === el || t.classList?.contains("prompt")) { t.scrollTop = 0; t.scrollLeft = 0; }
    }, true);
    el.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    // The "name a card" search box: results as you type; Enter names the first one. Its keys
    // stay in the box (Endstep's shortcuts mustn't see them).
    el.addEventListener("input", (e) => {
      const t = e.target as HTMLElement;
      if (t.matches(".name-q")) this.fillNameResults(t as HTMLInputElement);
      if (t.matches(".rb-track")) this.hooks.replay({ kind: "seek", frame: Number((t as HTMLInputElement).value) });
      if (t.dataset.prefRange === "volume") {
        this.prefs = { ...this.prefs, volume: Number((t as HTMLInputElement).value) / 100 };
        this.applyPrefs();
      }
    });
    // The volume is saved (and a sound plays at it) once the slider is let go.
    el.addEventListener("change", (e) => {
      const t = e.target as HTMLElement;
      if (t.dataset.prefRange === "volume") this.setPref({ volume: Number((t as HTMLInputElement).value) / 100 });
    });
    el.addEventListener("pointerdown", (e) => {
      if (!(e.target as HTMLElement).matches(".rb-track")) return;
      this.replayScrubbing = true;
      window.addEventListener("pointerup", () => (this.replayScrubbing = false), { once: true });
    });
    el.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement;
      if (!t.matches(".name-q")) return;
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        t.parentElement?.querySelector<HTMLElement>(".name-opt.first")?.click();
      }
    });
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
      const perm = t.closest<HTMLElement>(".side .card[data-id], .stack .card[data-id], .opp-hand .card.known[data-id], .reveal .rcard[data-zoom], .emblem[data-zoom]");
      const permId = perm?.dataset.id ?? perm?.dataset.zoom ?? null;
      if (permId === this.hoverPerm || this.zoomPinned || this.drag?.active) return;
      this.hoverPerm = permId;
      const c = permId ? this.cardData.get(permId) : undefined;
      if (perm && c && (!c.faceDown || c.peeked)) this.showHoverZoom(c, perm, perm.dataset.stackText || undefined);
      else this.hideZoom();
    });
    el.addEventListener("pointerleave", () => {
      if (!this.drag) this.setHandHover(null);
      if (this.fanHover) { this.fanHover = null; this.layoutFans(); }
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
      // Watching a replay: Space plays or pauses, ←/→ step a change (Shift: a turn).
      if (this.state?.replay && this.el.classList.contains("live") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const cmd: ReplayCommand | null = e.key === " " ? { kind: "toggle" }
          : e.key === "ArrowLeft" || e.key === "ArrowRight" ? { kind: e.shiftKey ? "turn" : "step", delta: e.key === "ArrowLeft" ? -1 : 1 }
          : null;
        if (cmd) {
          // Endstep's own (hidden) replay player listens for the same keys: it mustn't answer too.
          e.preventDefault();
          e.stopImmediatePropagation();
          this.hooks.replay(cmd);
          return;
        }
      }
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
          this.chooseNumber(p, m.number);
          this.setAwaiting(true);
          return;
        }
      }
      // Dividing damage: Space or Enter confirms (once it's all assigned), R resets.
      if (m.kind === "divide" && p?.divide && this.el.classList.contains("live") && !e.ctrlKey && !e.altKey && !e.metaKey
        && !(e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) {
        const act = e.key === " " || e.key === "Enter" ? "[data-div-confirm]" : e.key === "r" || e.key === "R" ? "[data-div-reset]" : null;
        if (act) {
          // Endstep's own (hidden) damage bar listens for the same keys: it mustn't answer too.
          e.preventDefault();
          e.stopImmediatePropagation();
          // On the table (a spell's damage), the dock's Submit and Reset.
          if (this.boardDivide()) {
            const dock = this.el.querySelector<HTMLButtonElement>(`.dock [data-act="${act === "[data-div-confirm]" ? "div-submit" : "div-reset"}"]`);
            if (dock && !dock.disabled) this.onDockAction(dock.dataset.act!);
            return;
          }
          const btn = this.el.querySelector<HTMLButtonElement>(`.prompt .divide-box ${act}`);
          if (btn && !btn.disabled) this.divideButton(btn, false);
          return;
        }
      }
      // ?: the list of this board's keyboard shortcuts.
      if (e.key === "?" && this.el.classList.contains("live") && !e.ctrlKey && !e.altKey && !e.metaKey && !(e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const box = this.q(".settings");
        if (box.classList.contains("open") && box.dataset.panel === "shortcuts") box.classList.remove("open");
        else this.renderShortcuts();
        return;
      }
      // L: the game log, shown or hidden.
      if ((e.key === "l" || e.key === "L") && this.el.classList.contains("live") && !e.ctrlKey && !e.altKey && !e.metaKey && !(e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.setPref({ logOpen: !this.prefs.logOpen });
        return;
      }
      // H: hold priority on or off (not while typing a card name).
      if ((e.key === "h" || e.key === "H") && this.el.classList.contains("live") && !e.ctrlKey && !e.altKey && !e.metaKey && !(e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.holdPriority = !this.holdPriority;
        this.toast(this.holdPriority ? "Holding priority" : "Priority passes after you cast");
        if (this.state) this.render(this.state);
        return;
      }
      if (e.key === "Escape" && this.el.classList.contains("live")) {
        if (m.kind === "attackers" && m.aiming) this.setMode({ ...m, aiming: null });
        this.hideMenu();
        this.hideConfirm();
        this.q(".settings").classList.remove("open");
        this.closeViewer();
        this.hideZoom();
        this.zoomPinned = false;
      }
    }, true);
  }

  private keyFromTarget(t: HTMLElement): string | null {
    const card = t.closest<HTMLElement>(".card[data-id]");
    if (card && !card.closest(".pile")) return card.closest(".stack") ? this.stackTargetKey(card.dataset.id!) : card.dataset.id!;
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
      else this.controller.chooseString(state.pending?.type === "CHOOSE_COLOR" ? "CHOOSE_COLOR" : "CHOOSE_MANA", key);
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
      const ability = this.abilityPick.abilities.find((a) => a.index === Number(btn.dataset.ability));
      this.manaSource = ability && /\badd\b/i.test(ability.description) ? this.abilityPick.cardId : null;
      this.controller.playCard(this.abilityPick.cardId, Number(btn.dataset.ability), this.holdPriority);
      this.abilityPick = null;
      this.setAwaiting(true);
      this.render(state);
      return;
    }

    if (btn?.dataset.pref) {
      this.onPrefButton(btn);
      return;
    }
    if (btn?.dataset.stop) {
      const [side, step] = btn.dataset.stop.split(":") as [StopSide, string];
      this.hooks.togglePhaseStop(side, step);
      this.render(state);
      return;
    }
    if (btn?.dataset.replay) {
      this.replayButton(btn.dataset.replay);
      return;
    }
    if (btn?.dataset.ui) {
      if (btn.dataset.ui === "debug") this.hooks.onToggleDebug();
      if (btn.dataset.ui === "hide") this.hooks.onHide();
      if (btn.dataset.ui === "back") { this.classicDismissedFor = this.modeKey; this.render(state); }
      if (btn.dataset.ui === "close-viewer") this.closeViewer();
      if (btn.dataset.ui === "stack-toggle") { this.stackHidden = !this.stackHidden; this.render(state); }
      if (btn.dataset.ui === "end-peek") { this.endPeek = !this.endPeek; this.render(state); }
      if (btn.dataset.ui === "peek") { this.peeking = !this.peeking; this.render(state); }
      if (btn.dataset.ui === "confirm-cancel") this.hideConfirm();
      if (btn.dataset.ui === "settings-close") this.q(".settings").classList.remove("open");
      if (btn.dataset.ui === "log") this.setPref({ logOpen: !this.prefs.logOpen });
      if (btn.dataset.ui === "leave-spectate") this.hooks.leaveSpectate();
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
    if (btn && this.divideButton(btn, e.ctrlKey || e.metaKey)) return;
    if (btn && this.sideboardClick(btn, e.shiftKey)) return;
    if (this.handlePromptButton(btn)) return;
    if (btn?.classList.contains("pile")) return this.openViewer(btn.dataset.player!, btn.dataset.zone!);
    const menuItem = t.closest<HTMLElement>("[data-menu]");
    if (menuItem) return this.onMenuItem(menuItem);

    const key = this.keyFromTarget(t);
    // Aiming an attacker: a click on nothing in particular puts the arrow down.
    if (!key && !btn && this.mode.kind === "attackers" && this.mode.aiming) { this.setMode({ ...this.mode, aiming: null }); return; }
    if (!key || this.awaiting) return;
    // Cards from an opponent's hand are picked in the fan, not on their hand.
    if (this.pickedInFan(t)) return;
    this.onSelectKey(key, e);
  }

  private onSelectKey(key: string, e: MouseEvent): void {
    const state = this.state!;
    const m = this.mode;
    if (m.kind === "divide") {
      // A spell's damage on the table: a click on a target adds one (Ctrl: up to lethal).
      const at = this.divideIndex(key);
      if (at !== null) {
        const more = document.createElement("button");
        more.dataset.divAdd = String(at);
        this.divideButton(more, e.ctrlKey || e.metaKey);
      }
      return;
    }
    if (m.kind === "cards" && m.mana) {
      if (key === this.phyrexianLifeKey()) { this.controller.payPhyrexianLife(); this.setAwaiting(true); }
      else if (m.valid.has(key)) { this.controller.tapMana(key); this.setAwaiting(true); }
      return;
    }
    if (m.kind === "attackers") {
      // Several defenders: click an attacker, then the player or planeswalker it attacks.
      // (Clicking a defender without an attacker in hand picks it for "All attack".)
      const d = defenderForKey(m, key, state);
      if (d !== null && !m.aiming) { this.setMode({ ...m, currentDefender: d }); return; }
      const next = clickInMode(m, key, d);
      if (next !== m) this.setMode(next);
      return;
    }
    if (m.kind === "targets" || m.kind === "cards" || m.kind === "blockers") {
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
    // Priority: one click activates a permanent; hand cards are played by dragging. (A card in
    // the hand of a player you control, Emrakul's way, is played with a click: it stays up there.)
    if (m.kind === "idle" && !this.cardEls.get(key)?.closest(".hand.mine")) this.tryPlay(key, e.ctrlKey);
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
    this.manaSource = /\badd\b/i.test(option.abilities[0]?.description ?? "") ? cardId : null;
    this.controller.playCard(cardId, option.abilities[0]?.index, keepPriority || this.holdPriority);
    this.setAwaiting(true);
    return true;
  }

  private onDockAction(act: string): void {
    const m = this.mode;
    const c = this.controller;
    switch (act) {
      case "undo": c.undo(); break;
      case "pass": c.passPriority(); this.sfx("pass"); break;
      case "prolif-mine": {
        // Every option of the proliferating player's own (their permanents, and themselves), sent.
        const yours = this.proliferateYours();
        if (this.state?.pending?.type === "CHOOSE_TARGETS") c.chooseTargets(yours);
        else c.chooseCards(yours);
        break;
      }
      case "hold":
        this.holdPriority = !this.holdPriority;
        if (this.state) this.render(this.state);
        return;
      case "end-turn":
        this.startPassing("endTurn");
        break;
      case "pass-until": {
        const box = this.el.getBoundingClientRect();
        const r = this.q('.dock [data-act="pass-until"]').getBoundingClientRect();
        this.showMenu(r.left - box.left, r.top - box.top, PASS_TARGETS.map((t) => ({ label: t.label, hint: t.hint, data: `pass:${t.target}` })), "Pass until…");
        // Above the button, its right edge on the button's.
        const menu = this.q(".menu");
        const m = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, r.right - box.left - m.width)}px`;
        menu.style.top = `${Math.max(8, r.top - box.top - m.height - 8)}px`;
        return;
      }
      case "stop-pass":
        this.stopPassing();
        if (this.state) this.render(this.state);
        return;
      case "resolve-all": c.resolveStack(); break;
      case "auto-pay": c.autoPay(); break;
      case "pay-life": c.payPhyrexianLife(); break;
      case "div-reset":
      case "div-submit": {
        const b = document.createElement("button");
        if (act === "div-reset") b.dataset.divReset = "";
        else b.dataset.divConfirm = "";
        this.divideButton(b, false);
        return;
      }
      case "cancel": c.cancel(); break;
      case "decline": c.no(); break;
      case "yes":
      case "no": {
        const p = this.state?.pending;
        if (p?.type !== "YES_NO" || fullScreenYesNo(p, this.state)) return;
        c.answer(act === "yes", p.stringOptions.length >= 2 ? yesNoLabels(p) : undefined);
        break;
      }
      case "clear":
        if (m.kind === "attackers") this.setMode({ ...m, assignments: new Map(), aiming: null });
        if (m.kind === "blockers") this.setMode({ ...m, assignments: new Map(), selectedBlocker: null });
        return;
      case "all-attack":
        if (m.kind === "attackers") this.setMode({ ...m, assignments: new Map([...m.valid].map((id) => [id, m.currentDefender])), aiming: null });
        return;
      case "confirm":
        if (m.kind === "attackers") c.declareAttackers(m.assignments, !!m.defenders);
        else if (m.kind === "blockers") c.declareBlockers(m.assignments);
        else if (m.kind === "targets") c.chooseTargets(m.selected);
        // Learn may be asked as a target choice: it's answered the way it was asked.
        else if (m.kind === "cards" && this.state?.pending?.type === "CHOOSE_TARGETS") c.chooseTargets(m.selected);
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
      this.chooseNumber(p, m.number);
    } else if (d.string !== undefined) {
      const type = p.type === "CHOOSE_ABILITY" || p.type === "YES_NO" || p.type === "MULLIGAN" ? null : p.type;
      if (!type) return false;
      c.chooseString(type as "CHOOSE_COLOR", d.string);
    } else if (d.pile !== undefined && m.kind === "piles") {
      this.setMode({ ...m, selected: d.pile });
      return true;
    } else if (d.pileTake !== undefined && m.kind === "piles") {
      if (!m.selected) return true;
      c.chooseString("CHOOSE_PILE", m.selected);
    } else if (d.sb !== undefined && m.kind === "sideboard" && p.sideboard) {
      const sb = p.sideboard;
      switch (d.sb) {
        case "confirm":
          if (!sideboardCheck(sb, m.main).ok) return true;
          c.submitSideboard([...m.main]);
          break;
        case "keep":
          // Keeping the registered deck throws your changes away: asked first.
          if (sideboardChanged(sb, m.main)) { this.setMode({ ...m, discarding: true }); return true; }
          c.decline();
          break;
        case "back":
          this.setMode({ ...m, discarding: false });
          return true;
        case "discard":
          this.setMode({ ...m, discarding: false });
          c.decline();
          break;
        case "withdraw":
          c.withdrawSideboard();
          break;
        default:
          return true;
      }
    } else if (d.arr !== undefined && m.kind === "arrange") {
      // A click sends the card to the other pile.
      this.setMode(arrangeMove(m, d.arr, m.top.includes(d.arr) ? "tray" : "top"));
      return true;
    } else if (d.arrangeDone !== undefined && m.kind === "arrange") {
      if (m.pick) c.chooseCards(m.tray);
      else c.arrangeCards(m.top);
    } else if (d.learn !== undefined && m.kind === "cards") {
      this.setMode(learnStep(m, d.learn === "discard"));
      return true;
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
    const sbCard = t.closest<HTMLElement>(".sb-card[data-sb-move]");
    if (e.button === 0 && sbCard && !(sbCard as HTMLButtonElement).disabled && this.mode.kind === "sideboard" && !this.awaiting) {
      e.preventDefault();
      const index = Number(sbCard.dataset.sbIdx!.split(",").at(-1));
      this.sbDrag = { el: sbCard, startX: e.clientX, startY: e.clientY, toMain: sbCard.dataset.sbMove === "main", index, active: false };
      return;
    }
    const arr = t.closest<HTMLElement>(".arr-card[data-arr]");
    if (e.button === 0 && arr && this.mode.kind === "arrange" && !this.awaiting) {
      e.preventDefault();
      this.arrDrag = { id: arr.dataset.arr!, startX: e.clientX, startY: e.clientY, el: arr, active: false };
      return;
    }
    if (e.button !== 0) return;
    // (Also a playable card in the hand of a player you control, dragged down from the top.)
    let card = (e.target as HTMLElement).closest<HTMLElement>(".hand.mine .card[data-id], .opp-hand .card.playable[data-id]");
    if (!card) return;
    // In your hand, the card that's raised is the one picked up.
    if (card.closest(".hand.mine")) card = this.cardEls.get(this.hitHand(card.parentElement!, e.clientX, e.clientY) ?? this.handHover ?? "") ?? card;
    // Your hand can be rearranged at any time; playing a card (or one from the side hand) needs priority.
    if (!card.closest(".my-hand") && (this.mode.kind !== "idle" || this.awaiting)) return;
    e.preventDefault();
    this.drag = { id: card.dataset.id!, startX: e.clientX, startY: e.clientY, el: card, active: false, theirs: !!card.closest(".opp-hand") };
  }

  private dropY(): number {
    return this.q(".my-hand").getBoundingClientRect().top - 20;
  }

  /** The dragged card is over the table: above your hand, and out of their hand for one of theirs. */
  private overTable(d: NonNullable<Board["drag"]>, y: number): boolean {
    return y < this.dropY() && (!d.theirs || y > this.q(".opp-hand").getBoundingClientRect().bottom + 20);
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

  /** The sideboarding side (main deck or sideboard) under the pointer. */
  private sbZoneAt(x: number, y: number): HTMLElement | undefined {
    return [...this.el.querySelectorAll<HTMLElement>(".sb-zone")].find((z) => {
      const r = z.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }

  /** The scry/surveil pile under the pointer. */
  private arrZoneAt(x: number, y: number): HTMLElement | undefined {
    return [...this.el.querySelectorAll<HTMLElement>(".arr-zone")].find((z) => {
      const r = z.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }

  private onPointerMove(e: PointerEvent): void {
    // Always kept, so an arrow that starts aiming (a new target prompt) starts at the pointer.
    this.aimPoint = { x: e.clientX, y: e.clientY };
    this.updateHandHover(e);
    if (this.aimSource()) {
      cancelAnimationFrame(this.aimFrame);
      this.aimFrame = requestAnimationFrame(() => this.drawArrows());
    }
    const sd = this.sbDrag;
    if (sd) {
      const dx = e.clientX - sd.startX;
      const dy = e.clientY - sd.startY;
      if (!sd.active && Math.hypot(dx, dy) < 6) return;
      if (!sd.active) {
        sd.active = true;
        sd.el.classList.add("dragging");
        this.hideZoom();
      }
      sd.el.style.translate = `${dx}px ${dy}px`;
      const over = this.sbZoneAt(e.clientX, e.clientY);
      for (const z of this.el.querySelectorAll<HTMLElement>(".sb-zone")) z.classList.toggle("over", z === over && (z.dataset.sbDrop === "main") === sd.toMain);
      return;
    }
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
    const over = this.overTable(d, e.clientY);
    this.el.classList.toggle("drop-ready", over && d.el.classList.contains("playable"));
    d.el.classList.toggle("over-table", over);
  }

  private onPointerUp(e: PointerEvent): void {
    const sd = this.sbDrag;
    this.sbDrag = null;
    if (sd) {
      // A press without a drag is a click (handled by onClick).
      if (!sd.active) return;
      this.suppressClickUntil = performance.now() + 250;
      sd.el.classList.remove("dragging");
      sd.el.style.translate = "";
      for (const z of this.el.querySelectorAll(".sb-zone")) z.classList.remove("over");
      const m = this.mode;
      const zone = this.sbZoneAt(e.clientX, e.clientY);
      if (m.kind === "sideboard" && zone && (zone.dataset.sbDrop === "main") === sd.toMain) this.setMode({ ...m, main: sideboardMove(m.main, [sd.index], sd.toMain) });
      else if (this.state) this.render(this.state);
      return;
    }
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
    const over = this.overTable(d, e.clientY);
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
    // The keyword boxes go on the far side from the card hovered, where there's room.
    const kw = zoom.querySelector<HTMLElement>(".zkw");
    if (kw) zoom.classList.toggle("kw-left", x === left || x + zw + KW_GAP + kw.offsetWidth > box.width - 8);
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
    const keywords = c.faceDown && !c.peeked ? [] : keywordNotes(c);
    const notes = [
      ...chosenLabels(c).map(([label, value]) => `<span class="kchosen">${esc(label)}: ${esc(value)}</span>`),
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
      ${effects.map((fx) => `<div class="zextra fx"><b>✦ ${esc(fx.name)}</b><span>${esc(fx.oracleText ?? "")}</span></div>`).join("")}
      ${keywords.length ? `<div class="zkw">${keywords.map((k) => {
        // A keyword an effect took away stays explained, marked as lost.
        const gone = lost.some((l) => l.toLowerCase().startsWith(k.name.toLowerCase()));
        return `<div class="kw${gone ? " lost" : ""}"><b>${esc(k.name)}${gone ? " · lost" : ""}</b><span>${esc(k.text)}</span></div>`;
      }).join("")}</div>` : ""}`;
    zoom.classList.remove("kw-left");
    // Always at the top of the left column (over the opponent's plate while it's shown).
    const box = this.el.getBoundingClientRect();
    const extraH = (extra ? 60 : 0) + (counters || c.damage ? 40 : 0) + notes.length * 22 + effects.length * 56;
    const columnW = parseFloat(getComputedStyle(this.el).gridTemplateColumns) || 260;
    const zh = Math.min(box.height - extraH - 24, box.height * 0.6, 520);
    const zw = Math.max(120, Math.min(columnW - 16, zh / 1.397, 380));
    zoom.style.setProperty("--zw", `${zw}px`);
    zoom.style.left = `${(columnW - zw) / 2}px`;
    zoom.style.top = "8px";
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
    // Dividing a spell's damage on the table: a right-click on a target (or its counter) takes one back.
    const divKey = this.boardDivide() ? this.keyFromTarget(t) : null;
    const divAt = divKey ? this.divideIndex(divKey) : null;
    const badge = t.closest<HTMLElement>(".dbadge");
    if (divAt !== null || badge) {
      e.preventDefault();
      const sub = document.createElement("button");
      sub.dataset.divSub = String(divAt ?? badge!.dataset.i);
      this.divideButton(sub, e.ctrlKey || e.metaKey);
      return;
    }
    // In the damage box a right-click on a card takes one back (Ctrl: down to lethal).
    const dart = t.closest<HTMLElement>(".dtile .dart[data-div-add]");
    if (dart) {
      e.preventDefault();
      const sub = document.createElement("button");
      sub.dataset.divSub = dart.dataset.divAdd;
      this.divideButton(sub, e.ctrlKey || e.metaKey);
      return;
    }
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
      const label = m.kind === "attackers" ? (m.assignments.has(key) ? "Remove from attack" : m.valid.has(key) ? "Attack" : "Attack this")
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
    const items: { label: string; hint?: string; data: string; cls?: string }[] = labels.map((label, i) => {
      const concede = /^concede( game| match)?$/i.exec(label);
      return concede
        ? { label, data: `concede:${concede[1]?.trim().toLowerCase() ?? "single"}`, cls: "danger" }
        : { label, data: `table:${i}` };
    });
    // This board's own items come first.
    items.unshift(
      { label: this.prefs.logOpen ? "Hide game log" : "Game log", hint: "L", data: "arena:log" },
      { label: "Arena UI settings", data: "arena:settings" },
      { label: "Arena UI shortcuts", hint: "?", data: "arena:shortcuts", cls: "sep-after" },
    );
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
    if (cmd === "arena") {
      if (id === "settings") this.renderSettings();
      if (id === "shortcuts") this.renderShortcuts();
      if (id === "log") this.setPref({ logOpen: !this.prefs.logOpen });
      return;
    }
    if (cmd === "pass") {
      this.startPassing(id as PassTarget);
      if (this.state) this.render(this.state);
      return;
    }
    if (cmd === "play") {
      this.controller.playCard(id, arg ? Number(arg) : undefined, this.holdPriority);
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
      this.swapHtml(box, html);
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

/** The tab's sessionStorage, or nothing where it's blocked. */
function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** "Lost connection · concedes in 1:23", or "· waiting to reconnect" with no deadline (as Endstep says it). */
/** The countdowns the timer ticker keeps up to date. */
const TIMERS = ".conn, .timers .mclock:not([hidden]), .timers .idle:not([hidden]), .sb-timer";

/** m:ss (h:mm:ss from an hour), rounded down as Endstep's clock shows it. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** A match clock (low under 30 s while running), an idle timer (urgent in its last stretch), or
    a lost connection's countdown. */
function updateTimer(el: HTMLElement): void {
  if (el.classList.contains("conn")) return updateConn(el);
  const now = Date.now();
  const deadline = el.dataset.deadline ? Number(el.dataset.deadline) : NaN;
  if (el.classList.contains("mclock")) {
    const ms = Number.isFinite(deadline) ? Math.max(0, deadline - now) : Number(el.dataset.left) || 0;
    const text = clockText(ms);
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle("low", el.classList.contains("running") && ms <= 30_000);
    return;
  }
  const ms = Math.max(0, deadline - now);
  const grace = Number(el.dataset.grace) || 30_000;
  const text = `${el.dataset.label ?? ""} · ${clockText(ms)}`;
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle("urgent", ms <= grace);
  el.classList.toggle("low", ms <= grace * 2);
}

function updateConn(el: HTMLElement): void {
  const deadline = Number(el.dataset.deadline);
  let text = "Lost connection · waiting to reconnect";
  if (el.dataset.deadline && Number.isFinite(deadline)) {
    const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    text = `Lost connection · concedes in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  if (el.textContent !== text) el.textContent = text;
}

/** Moves/inserts children so `container` holds exactly `wanted`, in order. */
function reconcile(container: Element, wanted: Element[]): void {
  wanted.forEach((node, i) => {
    if (container.children[i] !== node) container.insertBefore(node, container.children[i] ?? null);
  });
  while (container.children.length > wanted.length) container.lastElementChild!.remove();
}

/**
 * Cards that look and behave the same pile together (as Endstep groups them).
 * Attackers and blockers pile too, as long as nothing sets them apart: the same stats, counters,
 * damage, keywords and effects, attacking the same player, blocked by nobody (or blocking the
 * same creature), and not targeted. Attachments and face-down cards stay alone.
 */
function groupKey(c: CardView, local: string, effects: number): string | null {
  if (c.attachmentIds.length || c.faceDown) return null;
  const counters = Object.entries(c.counters).sort(([a], [b]) => a.localeCompare(b));
  // Everything that changes how the card looks or what it is doing, including choices still
  // being made (an attacker or blocker you picked but haven't confirmed, a selected target).
  return JSON.stringify([c.name, c.power, c.toughness, c.loyalty, c.tapped, c.summoningSick, c.isToken, c.setCode, c.collectorNumber,
    c.types, c.controllerId, c.keywordsGranted, c.keywordsLost, c.chosen, counters, c.damage ?? 0,
    c.isAttacking, c.attackingDefenderId, c.isBlocking, [...c.blockingIds].sort(), local, effects]);
}

const PAY_LIFE_TITLE = "Pay 2 life for Phyrexian mana";

/** Where each option is, when a choice mixes zones (Surgical Extraction: the copies in a hand, a
    graveyard and a library look alike): "Hand", "Graveyard", "Library"… Undefined otherwise. */
function optionZoneLabel(p: PendingActionView): ((c: CardView) => string) | undefined {
  const zone = (id: string) => (p.optionZones[id] ?? "").toLowerCase();
  if (new Set(p.optionCardIds.map(zone).filter(Boolean)).size < 2) return undefined;
  return (c) => zone(c.id).replace(/_/g, " ").replace(/^w/, (ch) => ch.toUpperCase());
}

/** A division option's card or player key on the table (players are -(seat + 1)). */
const divideKey = (id: string) => (isPlayerId(id) ? playerTargetKey(-Number(id) - 1) : id);

/** Players appear among target options as -(seat + 1). */
const isPlayerId = (id: string) => /^-\d+$/.test(id);

/** The game log's mark and kind (its color) for each event, as Endstep's own log shows them. */
const LOG_KINDS: Record<string, [string, string]> = {
  SPELL_CAST: ["✦", "spell"], SPELL_RESOLVED: ["✓", "spell"],
  TRIGGER_FIRED: ["✶", "trigger"], ABILITY_ACTIVATED: ["◈", "ability"], MODE_CHOSEN: ["◇", "ability"],
  LAND_PLAYED: ["▲", "land"],
  CARD_DAMAGED: ["◆", "damage"], PLAYER_DAMAGED: ["◆", "damage"], PLAYER_POISONED: ["✚", "damage"],
  PLAYER_LIFE_CHANGED: ["♥", "life"],
  ATTACKERS_DECLARED: ["⚔", "combat"], BLOCKERS_DECLARED: ["⛨", "combat"], COMBAT_ENDED: ["◦", "combat"],
  CARD_COUNTERS: ["▣", "counter"], PLAYER_COUNTERS: ["▣", "counter"],
  TOKEN_CREATED: ["✧", "ability"],
  SCRY: ["✧", "scry"], SURVEIL: ["⊻", "scry"],
  MULLIGAN: ["↻", "ritual"], HAND_KEPT: ["↻", "ritual"], SHUFFLE: ["⤮", "ritual"], LIBRARY_REARRANGED: ["⇅", "ritual"],
  COIN_FLIP: ["◉", "ritual"], DISCARD_LOG: ["↘", "other"], EFFECT_REPLACED: ["⇄", "other"],
  GAME_STARTED: ["❖", "outcome"], GAME_FINISHED: ["✦", "outcome"], GAME_OUTCOME: ["✦", "outcome"],
};

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

/** Yes/no questions that keep the full-screen choice: play or draw, and dredge instead of drawing. */
function fullScreenYesNo(p: PendingActionView, state?: GameState | null): boolean {
  return isPlayDraw(p, state) || (p.type === "YES_NO" && /\bdredge\b/i.test([p.message ?? "", ...p.stringOptions].join(" ")));
}

/** The pregame "play or draw?" question: a yes/no from no card, about going first, or any
    yes/no from no card before the game has started (nothing played yet). */
function isPlayDraw(p: PendingActionView, state?: GameState | null): boolean {
  if (p.type !== "YES_NO" || p.sourceCardId) return false;
  const text = [p.message ?? "", ...p.stringOptions].join(" ");
  if (/\b(go|play|draw)\w*\s+first\b|\bplay\b[\s\S]*\bdraw\b|\bdraw\b[\s\S]*\bplay\b/i.test(text)) return true;
  const pregame = !!state && (state.turnNumber ?? 0) <= 1 && !state.stack.length
    && state.players.every((pl) => !pl.battlefield.length && !pl.graveyard.length && !pl.exile.length);
  return pregame && !p.sourceCardName;
}

/** A yes/no's two answers as Endstep words them (Yes first), or plain Yes / No. */
function yesNoLabels(p: PendingActionView): [string, string] {
  return p.stringOptions.length >= 2 ? [p.stringOptions[0]!, p.stringOptions[1]!] : ["Yes", "No"];
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
  if (m.kind === "sideboard" && p.sideboard) {
    const sb = p.sideboard;
    if (sb.mode === "COMMANDER_SWAP") return { title: "Choose Commanders", sub: msg || "Click or drag cards between your main deck and your commanders." };
    return { title: sb.gameNumber ? `Sideboarding for Game ${sb.gameNumber}` : "Sideboarding", sub: "Click or drag cards between your main deck and sideboard. Shift-click moves every copy." };
  }
  if (m.kind === "arrange" && m.context === "piles") {
    return { title: "Separate into Piles", sub: `Drag or click cards to put them in pile 1 or pile 2${p.sourceCardName ? ` for ${p.sourceCardName}` : ""}. Then a pile is chosen.` };
  }
  if (m.kind === "arrange" && m.pick) {
    const n = m.pick.max;
    return { title: "Mulligan", sub: `Choose ${n} card${n === 1 ? "" : "s"} to put on the bottom of your library. Drag or click cards to move them.` };
  }
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
    case "CHOOSE_PILE":
      return pick("Choose a Pile", "Click a pile, then take it.");
    case "ORDER_ABILITIES":
      return pick("Order Triggers", "Drag to set the order. The leftmost resolves first.");
    case "ORDER_ATTACKERS":
      return pick("Order Attackers", "Drag to set the order.");
    case "ORDER_BLOCKERS":
      return pick("Order Blockers", "Drag to set the damage order.");
    case "ASSIGN_DAMAGE":
    case "DIVIDE_SHIELD": {
      if (p.divide?.kind === "shield") return pick("Divide Shield Counters", "");
      return pick("Assign Combat Damage", "Divide the damage among the creatures blocking it.");
    }
    case "YES_NO":
      return pick(p.sourceCardName ?? "Decide", "");
    case "CHOOSE_COLOR":
      return pick("Choose a Color", "");
    case "CHOOSE_CARD_NAME":
      return pick("Name a Card", p.sourceCardName ?? "");
    case "CHOOSE_NUMBER":
      return pick(/\bX\b/.test(msg) ? "Choose X" : "Choose a Number", "");
    default:
      if (m.kind === "cards" && m.learn) {
        return { title: "Learn", sub: m.learn.discarding ? "Choose a card to discard, then draw a card."
          : `Choose a Lesson to put into your hand${m.learn.hand.length ? ", or discard a card to draw a card" : ""}.` };
      }
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

/** An emblem among the command zone's effects (Endstep types it "Emblem"). */
const isEmblem = (fx: CardView) => fx.types.some((t) => /emblem/i.test(t)) || /\bemblem\b/i.test(fx.name);

/** The card an emblem came from: its source's name, or its own without "'s emblem". */
const emblemSource = (fx: CardView) => fx.effectSourceName || fx.name.replace(/(['’]s)?\s+(emblem|effect)\s*$/i, "").trim() || fx.name;

/** An emblem that only speaks of its owner's opponents ("Your opponents can't cast noncreature
    spells."), with nothing about "you" beyond that. */
function onOpponents(fx: CardView): boolean {
  const text = fx.oracleText ?? "";
  return /\bopponents?\b/i.test(text) && !/\byou(r|rs)?\b/i.test(text.replace(/\byour opponents?\b/gi, ""));
}

/** "Name: what it does" for an effect/emblem. */
function effectText(fx: CardView): string {
  return fx.oracleText ? `${fx.name}: ${fx.oracleText}` : fx.name;
}
