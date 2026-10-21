// Auto-yields: abilities the server resolves without stopping for the viewer's priority, and
// optional triggers answered Yes or No without asking. Endstep keeps them in its game view and
// sends them with SET_AUTO_YIELDS whenever they change; the server does the yielding.
//
// Kept under Endstep's own localStorage keys and shapes (how long to remember them, the ones
// remembered on this device, paused), so its client and ours agree after a reload.

/** How long auto-yields are kept: this game, this match, or on this device until forgotten. */
export type YieldScope = "game" | "match" | "device";

export interface AutoYields {
  /** Abilities yielded to, by Endstep's key (the ability's text, see yieldKeyOf). */
  abilities: Set<string>;
  /** Optional triggers always answered Yes, and those always answered No. */
  accept: Set<string>;
  decline: Set<string>;
  /** "Disable auto-yields": yielded abilities wait for you (trigger answers still apply). */
  paused: boolean;
  scope: YieldScope;
}

const SCOPE_KEY = "wr-auto-yield-scope";
const DEVICE_KEY = "wr-auto-yield-device";
const PAUSED_KEY = "wr-auto-yield-paused";

const isScope = (v: unknown): v is YieldScope => v === "game" || v === "match" || v === "device";
const strings = (v: unknown) => new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** The key Endstep yields an ability by: its yieldKey ("Name (id): text") without the source. */
export function yieldKeyOf(yieldKey: string): string {
  const i = yieldKey.indexOf("): ");
  return i >= 0 ? yieldKey.slice(i + 3) : yieldKey;
}

/** As Endstep's client starts: the scope (a match by default), and the abilities and answers
    only when they're remembered on this device. */
export function loadYields(): AutoYields {
  const read = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const scope = read(SCOPE_KEY);
  const yields: AutoYields = { abilities: new Set(), accept: new Set(), decline: new Set(), paused: read(PAUSED_KEY) === "1", scope: isScope(scope) ? scope : "match" };
  if (yields.scope !== "device") return yields;
  try {
    const stored = JSON.parse(read(DEVICE_KEY) ?? "null") as Record<string, unknown> | null;
    yields.abilities = strings(stored?.abilityKeys);
    yields.accept = strings(stored?.triggerAccept);
    yields.decline = strings(stored?.triggerDecline);
  } catch {
    // Unreadable: nothing remembered.
  }
  return yields;
}

export function saveYields(y: AutoYields): void {
  try {
    localStorage.setItem(SCOPE_KEY, y.scope);
    if (y.paused) localStorage.setItem(PAUSED_KEY, "1");
    else localStorage.removeItem(PAUSED_KEY);
    if (y.scope === "device") localStorage.setItem(DEVICE_KEY, JSON.stringify({ abilityKeys: [...y.abilities], triggerAccept: [...y.accept], triggerDecline: [...y.decline] }));
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // Storage blocked: they still apply for this session.
  }
}

/** Whether a game ending clears them: always for this game, at the match's end for this match. */
export function clearsAtEnd(scope: YieldScope, matchOver: boolean): boolean {
  return scope === "game" || (scope === "match" && matchOver);
}

/** The SET_AUTO_YIELDS payload Endstep's client sends. Holding priority pauses them too. */
export function yieldsAction(y: AutoYields, holding: boolean) {
  return {
    type: "SET_AUTO_YIELDS",
    autoYieldAbilityKeys: [...y.abilities],
    triggerAccept: [...y.accept],
    triggerDecline: [...y.decline],
    autoYieldsDisabled: y.paused || holding,
  };
}

/** True when an outgoing SET_AUTO_YIELDS says the same as ours. */
export function sameYields(action: Record<string, unknown>, y: AutoYields, holding: boolean): boolean {
  const same = (list: unknown, want: Set<string>) => Array.isArray(list) && list.length === want.size && list.every((k) => want.has(k as string));
  return same(action.autoYieldAbilityKeys, y.abilities) && same(action.triggerAccept, y.accept) && same(action.triggerDecline, y.decline)
    && action.autoYieldsDisabled === (y.paused || holding);
}
