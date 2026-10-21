// Keeps the server's auto-yields in line with the board's: sends them once per game (and again
// after a reconnect), re-sends them if Endstep's client later sends its own (it keeps a copy the
// board can't change), and forgets them when a game or the match ends, as its scope says.

import type { GameController } from "./GameController";
import type { GameState } from "./GameState";
import { clearsAtEnd, loadYields, sameYields, saveYields, yieldsAction, type AutoYields, type YieldScope } from "./endstep/autoYields";

export class AutoYieldSync {
  private yields: AutoYields = loadYields();
  /** Hold priority is on: auto-yields wait until it's let go. */
  private holding = false;
  private sentFor = "";
  private clearedFor = "";
  private resendTimer = 0;
  /** The prompt last answered for a resolving trigger (see answerResolving). */
  private answeredFor = -1;

  constructor(private readonly controller: GameController) {}

  get(): AutoYields {
    return this.yields;
  }

  /** Yields to this ability, or stops yielding to it. */
  toggleAbility(key: string): void {
    flip(this.yields.abilities, key);
    this.changed();
  }

  /** Always answers this optional trigger Yes (or No), or stops answering it. */
  toggleAnswer(key: string, yes: boolean): void {
    const [set, other] = yes ? [this.yields.accept, this.yields.decline] : [this.yields.decline, this.yields.accept];
    flip(set, key);
    other.delete(key);
    this.changed();
  }

  forgetAbility(key: string | null): void {
    if (key === null) this.yields.abilities.clear();
    else this.yields.abilities.delete(key);
    this.changed();
  }

  forgetAnswer(key: string | null): void {
    for (const set of [this.yields.accept, this.yields.decline]) {
      if (key === null) set.clear();
      else set.delete(key);
    }
    this.changed();
  }

  setPaused(paused: boolean): void {
    this.yields.paused = paused;
    this.changed();
  }

  setScope(scope: YieldScope): void {
    this.yields.scope = scope;
    saveYields(this.yields);
  }

  setHolding(holding: boolean): void {
    if (holding === this.holding) return;
    this.holding = holding;
    this.send();
  }

  private changed(): void {
    saveYields(this.yields);
    this.send();
  }

  private send(): void {
    this.controller.setAutoYields(yieldsAction(this.yields, this.holding));
  }

  onState(state: GameState | null): void {
    if (!state || state.replay || state.spectating) return;
    this.answerResolving(state);
    const game = `${state.matchId}:${state.match?.game ?? 1}`;
    if (state.status === "COMPLETE") {
      if (this.clearedFor === game) return;
      this.clearedFor = game;
      if (!clearsAtEnd(this.yields.scope, !state.match || state.match.over)) return;
      this.yields.abilities.clear();
      this.yields.accept.clear();
      this.yields.decline.clear();
      saveYields(this.yields);
      return;
    }
    if (this.sentFor === game) return;
    this.sentFor = game;
    this.send();
  }

  /** Some optional triggers (Creeping Chill) don't ask "Use triggered ability?", which the server
      answers from triggerAccept / triggerDecline: they resolve and their effect asks its own
      yes/no ("Exile Creeping Chill?"), with no trigger id. Answered here when it comes from the
      card of the trigger resolving on top of the stack, and that trigger is answered for good. */
  private answerResolving(state: GameState): void {
    const p = state.pending;
    if (p?.type !== "YES_NO" || p.triggerId || p.promptVersion == null || p.promptVersion === this.answeredFor) return;
    const top = state.stack[0];
    const key = top?.optionalTrigger ? top.yieldKey : undefined;
    if (!key || !p.sourceCardName || top?.card?.name !== p.sourceCardName) return;
    const yes = this.yields.accept.has(key);
    if (!yes && !this.yields.decline.has(key)) return;
    this.answeredFor = p.promptVersion;
    this.controller.answer(yes);
  }

  onSocketOpen(): void {
    this.sentFor = "";
  }

  /** An outgoing GAME_ACTION payload (ours or Endstep's). */
  onOutbound(action: Record<string, unknown>): void {
    if (action.type !== "SET_AUTO_YIELDS" || sameYields(action, this.yields, this.holding)) return;
    clearTimeout(this.resendTimer);
    this.resendTimer = window.setTimeout(() => this.send(), 50);
  }
}

function flip(set: Set<string>, key: string): void {
  if (!set.delete(key)) set.add(key);
}
