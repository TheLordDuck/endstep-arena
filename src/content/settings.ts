import { cleanPrefs, type BoardPrefs } from "../ui/board/prefs";

export type DebugTab = "state" | "events" | "network" | "raw" | "unsupported";

export interface Settings {
  enabled: boolean;
  /** Debug panel visible. */
  debug: boolean;
  tab: DebugTab;
  /** The player's settings for the board (animations, card size, sounds, log). */
  prefs: BoardPrefs;
}

const KEY = "endstepArena.settings";
const DEFAULTS: Omit<Settings, "prefs"> = { enabled: true, debug: false, tab: "state" };

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = (await chrome.storage.local.get(KEY))[KEY] as Partial<Settings> | undefined;
    return { ...DEFAULTS, ...stored, prefs: cleanPrefs(stored?.prefs) };
  } catch {
    return { ...DEFAULTS, prefs: cleanPrefs(undefined) };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    void chrome.storage.local.set({ [KEY]: settings });
  } catch {
    // Extension context invalidated (extension reloaded); ignore.
  }
}
