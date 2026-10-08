// The player's own settings for the board (animations, card size, sounds, the game log), kept
// with the extension's settings. The board reads them through its hooks.

export interface BoardPrefs {
  /** Animations on (moves, strikes, spells…). Off is also what "reduce motion" gives. */
  animations: boolean;
  /** How fast animations play: 1 is normal, 2 twice as fast. */
  animSpeed: number;
  /** Battlefield and hand cards at this scale of their normal size. */
  cardScale: number;
  sound: boolean;
  /** 0 to 1. */
  volume: number;
  /** The game log panel is open. */
  logOpen: boolean;
}

export const DEFAULT_PREFS: BoardPrefs = {
  animations: true,
  animSpeed: 1,
  cardScale: 1,
  sound: true,
  volume: 0.6,
  logOpen: false,
};

export const ANIM_SPEEDS: { value: number; label: string }[] = [
  { value: 0.75, label: "Slow" },
  { value: 1, label: "Normal" },
  { value: 1.5, label: "Fast" },
  { value: 2.5, label: "Very fast" },
];

export const CARD_SCALES: { value: number; label: string }[] = [
  { value: 0.85, label: "Small" },
  { value: 1, label: "Normal" },
  { value: 1.15, label: "Large" },
  { value: 1.3, label: "Extra large" },
];

/** Stored prefs, with anything missing or out of range back to its default. */
export function cleanPrefs(stored: Partial<Record<keyof BoardPrefs, unknown>> | undefined): BoardPrefs {
  const p = { ...DEFAULT_PREFS };
  if (!stored) return p;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
  if (typeof stored.animations === "boolean") p.animations = stored.animations;
  p.animSpeed = num(stored.animSpeed, 0.25, 4) ?? p.animSpeed;
  p.cardScale = num(stored.cardScale, 0.5, 2) ?? p.cardScale;
  if (typeof stored.sound === "boolean") p.sound = stored.sound;
  p.volume = num(stored.volume, 0, 1) ?? p.volume;
  if (typeof stored.logOpen === "boolean") p.logOpen = stored.logOpen;
  return p;
}
