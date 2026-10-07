// Prompts the board can't answer and hands to Endstep's own UI (the "classic" mode), recorded so
// what's still missing can be read from real matches: in the debug panel, and in .devlog on the
// dev build. Kept across matches (chrome.storage) until cleared.

import type { GameState } from "./GameState";

export interface UnsupportedPrompt {
  /** One entry per kind: type, context and the card asking. */
  key: string;
  type: string;
  /** What the board said when it stepped aside ("Arrange cards"). */
  reason: string;
  contextType?: string;
  sourceCardName?: string;
  /** Endstep's message the last time it was seen. */
  message?: string;
  /** Times it was asked (each new prompt once). */
  count: number;
  first: number;
  last: number;
  /** The last raw pendingAction, as JSON (cut to SAMPLE_MAX). */
  sample: string;
}

const MAX_ENTRIES = 60;
const SAMPLE_MAX = 4000;

export class UnsupportedLog {
  private entries = new Map<string, UnsupportedPrompt>();
  /** The prompt last recorded, so a prompt redrawn by later updates counts once. */
  private lastPrompt = "";

  constructor(stored: UnsupportedPrompt[] = []) {
    this.restore(stored);
  }

  /** Puts back entries stored earlier (oldest first), behind any recorded since. */
  restore(stored: UnsupportedPrompt[]): void {
    const now = this.entries;
    this.entries = new Map();
    for (const e of stored) if (e && typeof e.key === "string" && !now.has(e.key)) this.entries.set(e.key, e);
    for (const [k, e] of now) this.entries.set(k, e);
  }

  /**
   * Records the current prompt when the board steps aside for it (`reason`, else null).
   * `promptId` tells one prompt from the next; `rawPending` is Endstep's pendingAction.
   * Returns the entry when this prompt is new, else null.
   */
  record(state: GameState | null, reason: string | null, promptId: string, rawPending: unknown, now = Date.now()): UnsupportedPrompt | null {
    const p = state?.pending;
    if (!p || reason === null || state.replay) return null;
    if (promptId === this.lastPrompt) return null;
    this.lastPrompt = promptId;
    const key = [p.type, p.contextType ?? "", p.sourceCardName ?? ""].join("|");
    const prev = this.entries.get(key);
    let sample = "";
    try {
      sample = JSON.stringify(rawPending) ?? "";
    } catch {
      // Not serializable: the fields above still say what it was.
    }
    const entry: UnsupportedPrompt = {
      key,
      type: p.type,
      reason,
      contextType: p.contextType,
      sourceCardName: p.sourceCardName,
      message: p.message,
      count: (prev?.count ?? 0) + 1,
      first: prev?.first ?? now,
      last: now,
      sample: sample.length > SAMPLE_MAX ? `${sample.slice(0, SAMPLE_MAX)}…` : sample,
    };
    // Most recent last, so the oldest go first when there are too many.
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
    return entry;
  }

  /** Most recent first. */
  list(): UnsupportedPrompt[] {
    return [...this.entries.values()].reverse();
  }

  clear(): void {
    this.entries.clear();
    this.lastPrompt = "";
  }
}

const KEY = "endstepArena.unsupportedPrompts";

export async function loadUnsupported(): Promise<UnsupportedPrompt[]> {
  try {
    const stored = (await chrome.storage.local.get(KEY))[KEY];
    return Array.isArray(stored) ? (stored as UnsupportedPrompt[]) : [];
  } catch {
    return [];
  }
}

export function saveUnsupported(log: UnsupportedLog): void {
  try {
    // Stored oldest first, the order they're read back in.
    void chrome.storage.local.set({ [KEY]: log.list().reverse() });
  } catch {
    // Extension context invalidated (extension reloaded); ignore.
  }
}
