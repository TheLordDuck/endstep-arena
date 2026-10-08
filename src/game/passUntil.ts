// "Pass until…": priority is passed for the player until a point in the turn, as Endstep's own
// pass-until menu does it (on the client: it passes each time it gets priority, and stops on
// arriving). Like the board's "End turn", it also stops when an opponent casts or activates
// something, or when the game asks anything other than priority.

import type { GameState } from "./GameState";
import type { StopSide } from "./endstep/phaseStops";
import { currentStep } from "../ui/board/phases";

export type PassTarget = "endTurn" | "combat" | "endStep" | "oppEndStep";

/** The menu's choices, in turn order ("endTurn" is the dock's own End turn button). */
export const PASS_TARGETS: { target: PassTarget; label: string; hint: string }[] = [
  { target: "combat", label: "Combat", hint: "The next combat" },
  { target: "endStep", label: "End step", hint: "This turn's end step" },
  { target: "oppEndStep", label: "End of opponent's turn", hint: "The end step before your turn" },
];

export interface PassUntil {
  target: PassTarget;
  /** Where it started: the turn, its step, and who was active. */
  turn?: number;
  step?: string;
  myTurn: boolean;
  /** The stack items that were already there (an opponent's new one stops it). */
  stackIds: string[];
}

/** What to do with a state while passing: pass priority, attack with nothing, wait for the next
    state, or stop (arrived, or something needs the player). */
export type PassStep = "pass" | "no-attack" | "wait" | "stop";

const COMBAT = new Set(["BEGIN_COMBAT", "DECLARE_ATTACKERS", "DECLARE_BLOCKERS", "FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "END_COMBAT"]);
const ENDING = new Set(["END_STEP", "CLEANUP"]);

const viewerId = (state: GameState) => state.players.find((p) => p.isViewer)?.id;
const stepOf = (state: GameState) => currentStep(state.phase, state.step);

export function startPassUntil(target: PassTarget, state: GameState): PassUntil {
  return {
    target,
    turn: state.turnNumber,
    step: stepOf(state),
    myTurn: state.activePlayerId !== undefined && state.activePlayerId === viewerId(state),
    stackIds: state.stack.map((s) => s.id),
  };
}

/** True once the point passed to has been reached. */
function arrived(pu: PassUntil, state: GameState): boolean {
  const step = stepOf(state) ?? "";
  const newTurn = state.turnNumber !== pu.turn;
  const myTurn = state.activePlayerId !== undefined && state.activePlayerId === viewerId(state);
  switch (pu.target) {
    case "endTurn":
      return newTurn || !myTurn;
    case "combat":
      // A combat that was already under way doesn't count; a turn that ends with no combat does.
      if (COMBAT.has(step)) return newTurn || !COMBAT.has(pu.step ?? "");
      return newTurn && (step === "MAIN2" || ENDING.has(step));
    case "endStep":
      return newTurn || (ENDING.has(step) && !ENDING.has(pu.step ?? ""));
    case "oppEndStep":
      if (myTurn) return newTurn;
      return ENDING.has(step) && (newTurn || !ENDING.has(pu.step ?? "") || pu.myTurn);
  }
}

export function passUntilStep(pu: PassUntil, state: GameState): PassStep {
  if (state.status === "COMPLETE" || state.replay || state.spectating) return "stop";
  // An opponent's new spell or ability: the player gets the chance to answer it.
  const me = viewerId(state);
  if (state.stack.some((s) => s.controllerId !== me && !pu.stackIds.includes(s.id))) return "stop";
  if (arrived(pu, state)) return "stop";
  const p = state.pending;
  if (!p) return "wait";
  if (p.type === "PRIORITY") return "pass";
  // Your own attack step on the way somewhere else: no attackers, as Endstep's End turn does.
  if (p.type === "DECLARE_ATTACKERS" && pu.target !== "combat") return "no-attack";
  return "stop";
}

/** Stops the server must make (on top of the player's) so the point can be reached: it only gives
    priority at a stop. */
export function passUntilStops(pu: PassUntil): Partial<Record<StopSide, string[]>> {
  const side: StopSide = pu.myTurn ? "myTurn" : "oppTurn";
  switch (pu.target) {
    case "combat": return { [side]: ["BEGIN_COMBAT"] };
    case "endStep": return { [side]: ["END_STEP"] };
    case "oppEndStep": return { oppTurn: ["END_STEP"] };
    case "endTurn": return {};
  }
}

export function passLabel(target: PassTarget): string {
  return target === "endTurn" ? "end of turn" : PASS_TARGETS.find((t) => t.target === target)!.label.toLowerCase();
}
