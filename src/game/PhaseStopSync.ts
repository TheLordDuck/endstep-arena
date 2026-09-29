// Keeps the server's phase stops in line with the player's choice: sends them
// once per match (and again after a reconnect), and re-sends them if Endstep's
// client later sends an older set from its in-memory state.

import type { GameController } from "./GameController";
import type { GameState } from "./GameState";
import { coversStops, loadStops, saveStops, type PhaseStops, type StopSide } from "./endstep/phaseStops";

export class PhaseStopSync {
  private stops: PhaseStops = loadStops();
  private sentFor = "";
  private resendTimer = 0;

  constructor(private readonly controller: GameController) {}

  get(): PhaseStops {
    return this.stops;
  }

  toggle(side: StopSide, step: string): void {
    const set = this.stops[side];
    if (set.has(step)) set.delete(step);
    else set.add(step);
    saveStops(this.stops);
    this.controller.setPhaseStops(this.stops);
  }

  onState(state: GameState | null): void {
    if (!state || state.status === "COMPLETE" || state.matchId === this.sentFor) return;
    this.sentFor = state.matchId;
    this.controller.setPhaseStops(this.stops);
  }

  onSocketOpen(): void {
    this.sentFor = "";
  }

  /** An outgoing GAME_ACTION payload (ours or Endstep's). */
  onOutbound(action: { type?: unknown; phaseStopsMyTurn?: unknown; phaseStopsOppTurn?: unknown }): void {
    if (action.type !== "SET_PHASE_STOPS" || coversStops(action, this.stops)) return;
    clearTimeout(this.resendTimer);
    this.resendTimer = window.setTimeout(() => this.controller.setPhaseStops(this.stops), 50);
  }
}
