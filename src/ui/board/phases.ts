// Endstep's step keys (from its phase-stop table), grouped the Arena way.

import { STOP_STEPS } from "../../game/endstep/phaseStops";

export const PHASE_GROUPS = [
  { id: "beginning", label: "Beginning" },
  { id: "main1", label: "Main 1" },
  { id: "combat", label: "Combat" },
  { id: "main2", label: "Main 2" },
  { id: "ending", label: "End" },
] as const;

export interface StepInfo {
  key: string;
  label: string;
  abbr: string;
  group: string;
}

const STEPS: Record<(typeof STOP_STEPS)[number], Omit<StepInfo, "key">> = {
  UPKEEP: { label: "Upkeep", abbr: "UP", group: "beginning" },
  DRAW: { label: "Draw", abbr: "DR", group: "beginning" },
  MAIN1: { label: "Main 1", abbr: "M1", group: "main1" },
  BEGIN_COMBAT: { label: "Beginning of Combat", abbr: "BC", group: "combat" },
  DECLARE_ATTACKERS: { label: "Declare Attackers", abbr: "DA", group: "combat" },
  DECLARE_BLOCKERS: { label: "Declare Blockers", abbr: "DB", group: "combat" },
  FIRST_STRIKE_DAMAGE: { label: "First Strike Damage", abbr: "FS", group: "combat" },
  COMBAT_DAMAGE: { label: "Combat Damage", abbr: "CD", group: "combat" },
  END_COMBAT: { label: "End of Combat", abbr: "EC", group: "combat" },
  MAIN2: { label: "Main 2", abbr: "M2", group: "main2" },
  END_STEP: { label: "End Step", abbr: "ET", group: "ending" },
  CLEANUP: { label: "Cleanup", abbr: "CL", group: "ending" },
};

/** Every step, in turn order. */
export const TURN_STEPS: StepInfo[] = STOP_STEPS.map((key) => ({ key, ...STEPS[key] }));

// Other spellings Endstep uses for the same steps.
const ALIASES: Record<string, string> = {
  COMBAT_BEGIN: "BEGIN_COMBAT",
  BEGINNING_OF_COMBAT: "BEGIN_COMBAT",
  END_OF_TURN: "END_STEP",
  END: "END_STEP",
  FIRST_STRIKE: "FIRST_STRIKE_DAMAGE",
  END_OF_COMBAT: "END_COMBAT",
  PRECOMBAT_MAIN: "MAIN1",
  POSTCOMBAT_MAIN: "MAIN2",
};

const toKey = (s: string | undefined) => (s ? ALIASES[s] ?? s : undefined);

/** The current step's key (e.g. "DRAW"), or "UNTAP", or the raw name when unknown. */
export function currentStep(phase: string | undefined, step: string | undefined): string | undefined {
  const byStep = toKey(step);
  if (byStep && (byStep in STEPS || byStep === "UNTAP")) return byStep;
  return toKey(phase);
}

export function stepLabel(key: string | undefined): string {
  if (!key) return "";
  if (key === "UNTAP") return "Untap";
  return STEPS[key as keyof typeof STEPS]?.label ?? key.toLowerCase().replace(/_/g, " ");
}

/** Index in the turn, -1 for untap / unknown. */
export const stepIndex = (key: string | undefined) => TURN_STEPS.findIndex((s) => s.key === key);
