// Phase stops: the steps where the server gives the viewer priority instead of
// passing automatically. Endstep's defaults skip most steps (upkeep, draw,
// beginning of combat, damage, cleanup…); the Arena board stops at all of them
// unless the player turns a stop off.
//
// Stored under Endstep's own localStorage key and shape, so its client and ours
// agree, and sent with the same SET_PHASE_STOPS action its client sends.

/** Endstep's stop keys, in turn order (its phase-stop table). */
export const STOP_STEPS = [
  "UPKEEP", "DRAW", "MAIN1", "BEGIN_COMBAT", "DECLARE_ATTACKERS", "DECLARE_BLOCKERS",
  "FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "END_COMBAT", "MAIN2", "END_STEP", "CLEANUP",
] as const;

export type StopSide = "myTurn" | "oppTurn";
export type PhaseStops = Record<StopSide, Set<string>>;

const STORAGE_KEY = "wr-phase-stops";
/** Set once we've switched every stop on, so later choices by the player are kept. */
const INIT_KEY = "endstepArena.allStops";

// Endstep's defaults, used for keys missing from storage (as its client does).
const ENDSTEP_DEFAULTS: Record<StopSide, string[]> = {
  myTurn: ["MAIN1", "DECLARE_ATTACKERS", "DECLARE_BLOCKERS", "MAIN2", "END_STEP"],
  oppTurn: ["DECLARE_ATTACKERS", "DECLARE_BLOCKERS", "END_STEP"],
};

const all = (): PhaseStops => ({ myTurn: new Set(STOP_STEPS), oppTurn: new Set(STOP_STEPS) });

export function loadStops(): PhaseStops {
  try {
    if (!localStorage.getItem(INIT_KEY)) {
      localStorage.setItem(INIT_KEY, "1");
      const stops = all();
      saveStops(stops);
      return stops;
    }
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Record<string, Record<string, unknown>> | null;
    const side = (s: StopSide) => {
      const set = new Set(ENDSTEP_DEFAULTS[s]);
      for (const [k, v] of Object.entries(stored?.[s] ?? {})) {
        if (typeof v !== "boolean" || !(STOP_STEPS as readonly string[]).includes(k)) continue;
        if (v) set.add(k);
        else set.delete(k);
      }
      return set;
    };
    return { myTurn: side("myTurn"), oppTurn: side("oppTurn") };
  } catch {
    return all();
  }
}

export function saveStops(stops: PhaseStops): void {
  const obj = (s: StopSide) => Object.fromEntries(STOP_STEPS.map((k) => [k, stops[s].has(k)]));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ myTurn: obj("myTurn"), oppTurn: obj("oppTurn") }));
  } catch {
    // Storage blocked: the stops still apply for this session.
  }
}

/** The SET_PHASE_STOPS payload Endstep's client sends. */
export function stopsAction(stops: PhaseStops) {
  const list = (s: StopSide) => STOP_STEPS.filter((k) => stops[s].has(k));
  return { type: "SET_PHASE_STOPS", phaseStopsMyTurn: list("myTurn"), phaseStopsOppTurn: list("oppTurn") };
}

/** True when an outgoing SET_PHASE_STOPS includes every stop we want (it may add temporary ones). */
export function coversStops(action: { phaseStopsMyTurn?: unknown; phaseStopsOppTurn?: unknown }, stops: PhaseStops): boolean {
  const has = (list: unknown, want: Set<string>) => Array.isArray(list) && [...want].every((k) => list.includes(k));
  return has(action.phaseStopsMyTurn, stops.myTurn) && has(action.phaseStopsOppTurn, stops.oppTurn);
}
