// Hands the game's states to the board one by one, in order, at a pace its animations can be seen
// at. Endstep may send a spell going on the stack and resolving within a few milliseconds (a bot
// answers at once): drawn as they come, the board would only ever see the result. Here a state
// that brings something worth seeing (a spell or ability on the stack, attackers or blockers
// declared) stays on screen a moment, and the next one also waits for the board's animations
// (a fight, a bolt) to finish. A choice of yours on screen is never kept waiting behind.

import type { CombatLink, GameState } from "../game/GameState";

/** The longest a state is kept on screen before the next one (ms). */
export const MAX_WAIT_MS = 2500;

/** Whether `next` brings something worth a moment on screen, after `prev`. */
export function needsDwell(prev: GameState | null, next: GameState): boolean {
  if (!prev || prev.matchId !== next.matchId) return false;
  const was = new Set(prev.stack.map((s) => s.id));
  if (next.stack.some((s) => !was.has(s.id))) return true;
  const key = (links: CombatLink[]) => links.map((l) => `${l.fromId}>${l.toId}`).sort().join(",");
  if (next.combat.attacks.length && key(next.combat.attacks) !== key(prev.combat.attacks)) return true;
  return next.combat.blocks.length > 0 && key(next.combat.blocks) !== key(prev.combat.blocks);
}

export interface PacerHooks {
  /** Puts a state on the board. */
  show(state: GameState | null): void;
  /** Until when (performance.now() ms) the board's animations are still playing. */
  busyUntil(): number;
  /** How long a state worth seeing stays on screen (ms); 0 with animations off. */
  dwellMs(): number;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (timer: unknown) => void;
}

export class StatePacer {
  private queue: GameState[] = [];
  private shown: GameState | null = null;
  private holdUntil = 0;
  /** When the state on screen was put there (the most it's kept is counted from then). */
  private shownAt = 0;
  private timer: unknown = null;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (timer: unknown) => void;

  constructor(private readonly hooks: PacerHooks) {
    this.now = hooks.now ?? (() => performance.now());
    this.schedule = hooks.schedule ?? ((fn, ms) => window.setTimeout(fn, ms));
    this.cancel = hooks.cancel ?? ((t) => window.clearTimeout(t as number));
  }

  /** The state the board shows now. */
  get current(): GameState | null {
    return this.shown;
  }

  /** A new state from the game. Leaving the match, a replay (it has its own pace) or animations
      turned off: shown at once, dropping anything queued. */
  push(state: GameState | null): void {
    if (!state || state.replay || this.hooks.dwellMs() <= 0) {
      this.queue = [];
      if (this.timer !== null) this.cancel(this.timer);
      this.timer = null;
      this.apply(state);
      return;
    }
    this.queue.push(state);
    this.pump();
  }

  private pump(): void {
    if (this.timer !== null) return;
    while (this.queue.length) {
      const now = this.now();
      // Nothing on screen yet, or a choice of yours there: what comes next shows right away.
      const until = !this.shown || this.shown.pending ? 0 : Math.min(Math.max(this.holdUntil, this.hooks.busyUntil()), this.shownAt + MAX_WAIT_MS);
      if (until > now) {
        this.timer = this.schedule(() => {
          this.timer = null;
          this.pump();
        }, until - now);
        return;
      }
      this.apply(this.queue.shift()!);
    }
  }

  private apply(state: GameState | null): void {
    const prev = this.shown;
    this.shown = state;
    this.shownAt = this.now();
    this.holdUntil = state && needsDwell(prev, state) ? this.shownAt + this.hooks.dwellMs() : 0;
    this.hooks.show(state);
  }
}
