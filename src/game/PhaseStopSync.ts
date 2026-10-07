// Keeps the server's phase stops in line with the player's choice: sends them
// once per match (and again after a reconnect), and re-sends them if Endstep's
// client later sends an older set from its in-memory state. "Pass until…" may add
// stops for a while (where it has to arrive); they're never saved.

import type { GameController } from "./GameController";
import type { GameState } from "./GameState";
import { coversStops, loadStops, saveStops, type PhaseStops, type StopSide } from "./endstep/phaseStops";

export class PhaseStopSync {
  private stops: PhaseStops = loadStops();
  private sentFor = "";
  private resendTimer = 0;
  private extra: Partial<Record<StopSide, string[]>> = {};

  constructor(private readonly controller: GameController) {}

  get(): PhaseStops {
    return this.stops;
  }

  toggle(side: StopSide, step: string): void {
    const set = this.stops[side];
    if (set.has(step)) set.delete(step);
    else set.add(step);
    saveStops(this.stops);
    this.controller.setPhaseStops(this.sent());
  }

  /** Stops added on top of the player's until cleared (null). */
  setTemporary(extra: Partial<Record<StopSide, string[]>> | null): void {
    const next = extra ?? {};
    if (JSON.stringify(next) === JSON.stringify(this.extra)) return;
    this.extra = next;
    this.controller.setPhaseStops(this.sent());
  }

  /** The player's stops plus the temporary ones. */
  private sent(): PhaseStops {
    const side = (s: StopSide) => new Set([...this.stops[s], ...(this.extra[s] ?? [])]);
    return { myTurn: side("myTurn"), oppTurn: side("oppTurn") };
  }

  onState(state: GameState | null): void {
    if (!state || state.status === "COMPLETE" || state.replay || state.matchId === this.sentFor) return;
    this.sentFor = state.matchId;
    this.extra = {};
    this.controller.setPhaseStops(this.stops);
  }

  onSocketOpen(): void {
    this.sentFor = "";
  }

  /** An outgoing GAME_ACTION payload (ours or Endstep's). */
  onOutbound(action: { type?: unknown; phaseStopsMyTurn?: unknown; phaseStopsOppTurn?: unknown }): void {
    const sent = this.sent();
    if (action.type !== "SET_PHASE_STOPS" || coversStops(action, sent)) return;
    clearTimeout(this.resendTimer);
    this.resendTimer = window.setTimeout(() => this.controller.setPhaseStops(this.sent()), 50);
  }
}
