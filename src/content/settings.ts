export type DebugTab = "state" | "events" | "network" | "raw";

export interface Settings {
  enabled: boolean;
  /** Debug panel visible. */
  debug: boolean;
  tab: DebugTab;
}

const KEY = "endstepArena.settings";
const DEFAULTS: Settings = { enabled: true, debug: false, tab: "state" };

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = (await chrome.storage.local.get(KEY))[KEY] as Partial<Settings> | undefined;
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    void chrome.storage.local.set({ [KEY]: settings });
  } catch {
    // Extension context invalidated (extension reloaded); ignore.
  }
}
