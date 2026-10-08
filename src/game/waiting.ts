// When it isn't your move, what the game is waiting for: who, and on what. Endstep's own UI only
// says "Opponent is deciding…"; the state says more: who has priority, whose idle timer runs (the
// one being waited on), the combat step and what's on the stack.

import type { GameState, PlayerView } from "./GameState";
import { currentStep, stepLabel } from "../ui/board/phases";

export type WaitKind = "attackers" | "blockers" | "respond" | "priority" | "deciding" | "resolving";

export interface Waiting {
  kind: WaitKind;
  /** The player waited on (none while the game itself works, e.g. resolving). */
  playerId?: string;
  /** Short, for the action button: "Opponent's priority". */
  short: string;
  /** The whole sentence, for the table: "Opponent can respond to Lightning Bolt". */
  text: string;
}

/** What the game waits for, or null when it's your move (a prompt is yours), the game is over, or
    nothing is known. `you` is the player the board is shown for. */
export function waitingFor(state: GameState, you: PlayerView | null | undefined): Waiting | null {
  if (state.pending || state.status === "COMPLETE" || state.replay) return null;
  const name = (id: string | undefined) => state.players.find((p) => p.id === id)?.name ?? "Opponent";
  // Watching someone else's game, their side is named too.
  const theirs = (id: string | undefined) => !!id && (id !== you?.id || !!state.spectating);
  const step = currentStep(state.phase, state.step);
  const top = state.stack[0];
  const idle = state.idle?.playerId;
  // The one being waited on: whose idle timer runs, else who has priority.
  const decider = idle ?? state.priorityPlayerId;

  if (!theirs(decider)) {
    // Nobody else to wait for: the game is working (a spell resolving, a step moving on).
    if (top) return { kind: "resolving", short: "Resolving…", text: `Resolving ${top.name}…` };
    return null;
  }
  const who = name(decider);
  const isActive = decider === state.activePlayerId;
  if (step === "DECLARE_ATTACKERS" && isActive && !state.combat.attacks.length && !top) {
    return { kind: "attackers", playerId: decider, short: `${who} attacking`, text: `${who} is declaring attackers` };
  }
  if (step === "DECLARE_BLOCKERS" && !isActive && state.combat.attacks.length && !state.combat.blocks.length && !top) {
    return { kind: "blockers", playerId: decider, short: `${who} blocking`, text: `${who} is declaring blockers` };
  }
  // Their idle timer runs but priority isn't theirs (or nobody's): a choice of theirs, not priority.
  if (idle && state.priorityPlayerId !== idle) {
    return { kind: "deciding", playerId: decider, short: `${who} deciding`, text: top ? `${who} is deciding (${top.name} on the stack)` : `${who} is deciding` };
  }
  if (top) {
    const yours = top.controllerId !== undefined && !theirs(top.controllerId);
    return {
      kind: "respond", playerId: decider, short: `${who}'s priority`,
      text: yours ? `${who} can respond to ${top.name}` : `${who} has priority · ${top.name} on the stack`,
    };
  }
  const where = step ? ` · ${stepLabel(step)}` : "";
  return { kind: "priority", playerId: decider, short: `${who}'s priority`, text: `${who} has priority${where}` };
}
