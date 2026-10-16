// Endstep's own keyboard shortcuts, which keep working under the board: its rebindable keys
// (with the player's rebinds, which Endstep keeps in localStorage) and a few fixed ones. Copied
// from Endstep's shortcut definitions (definitions-*.js, 2026-10-16); the ids are Endstep's.

interface Chord { key: string; mod?: boolean; shift?: boolean; alt?: boolean }

/** Endstep's rebindable keys, in its order, with their default key. */
const ACCELERATORS: { id: string; label: string; key: Chord }[] = [
  { id: "passPriority", label: "Pass priority", key: { key: "Space" } },
  { id: "passUntilCombat", label: "Pass until combat", key: { key: "C" } },
  { id: "passUntilEndOfTurn", label: "Pass until end of turn", key: { key: "E" } },
  { id: "passUntilMyNextTurn", label: "Pass until my next turn", key: { key: "T" } },
  { id: "passUntilPrevEndStep", label: "Pass until the end step before my turn", key: { key: "B" } },
  { id: "passUntilAction", label: "Pass until an opponent acts, or the end step", key: { key: "R" } },
  { id: "undo", label: "Undo the last action, while it can be taken back", key: { key: "Z", mod: true } },
  { id: "toggleYieldTurn", label: "Auto-yield for the rest of this turn", key: { key: "F4" } },
  { id: "toggleYieldAll", label: "Auto-yield until you cancel it", key: { key: "F6" } },
  { id: "yieldToStack", label: "Pass until the stack has resolved", key: { key: "F3" } },
  { id: "alphaStrike", label: "Every creature attacks (declaring attackers)", key: { key: "A" } },
  { id: "autoPay", label: "Auto-pay mana (paying a cost)", key: { key: "A" } },
  { id: "pinHoveredCard", label: "Inspect the card under the pointer", key: { key: "Q" } },
];

/** Where Endstep keeps the player's rebinds: { [id]: chord }. */
const STORE = "endstep:hotkeys:v1";

/** The board's own keys (taken before Endstep sees them), with what the board does with them. */
const BOARD_KEYS: Record<string, string> = { C: "the chat", H: "hold priority", L: "the game log" };

const isChord = (v: unknown): v is Chord => typeof v === "object" && v !== null && typeof (v as Chord).key === "string" && (v as Chord).key.length > 0;

function rebinds(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}") as unknown;
    return typeof v === "object" && v !== null ? v as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** A chord as the shortcuts list writes it: "Ctrl+Z", "Space". */
function chordLabel(c: Chord): string {
  return [c.mod ? "Ctrl" : "", c.alt ? "Alt" : "", c.shift ? "Shift" : "", c.key].filter(Boolean).join("+");
}

/** Endstep's keys as rows for the shortcuts list: [key, what it does]. A key the board takes
    first says so; one the player unbound is left out. */
export function endstepKeyRows(): [string, string][] {
  const mine = rebinds();
  const rows = ACCELERATORS.flatMap(({ id, label, key }): [string, string][] => {
    const bound = id in mine ? mine[id] : key;
    if (!isChord(bound)) return [];
    const plain = !bound.mod && !bound.alt && !bound.shift;
    const taken = plain ? BOARD_KEYS[bound.key] : undefined;
    return [[chordLabel(bound), taken ? `${label} (not on the board: ${bound.key} opens ${taken})` : label]];
  });
  return [
    ...rows,
    ["Enter", "Same as the pass priority key"],
    ["Ctrl+Shift", "Hold priority on or off"],
  ];
}
