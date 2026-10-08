// The board's own sounds: each one plays a file from the extension's `sounds/` folder when there
// is one (see public/sounds/README.md: any .ogg/.mp3/.wav named after the sound, Arena's own if you
// have them), and nothing otherwise. Endstep's page keeps running under the board and plays its own
// sounds (casting, lands, combat, damage, draws, winning…), so without files those are what you
// hear. Nothing plays at volume 0.

export const SFX = ["cast", "resolve", "land", "pass", "attack", "hit", "zap", "exile", "token", "counter", "turn", "win", "lose"] as const;
export type Sfx = (typeof SFX)[number];

/** The same sound isn't played again sooner than this (ms): a burst of changes makes one sound. */
const MIN_GAP_MS = 70;

export class Sounds {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0;
  private loading: Promise<void> | null = null;
  private buffers = new Map<Sfx, AudioBuffer>();
  private last = new Map<Sfx, number>();

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master) this.master.gain.value = volume;
    // Ready before the first sound, so the first one isn't lost to loading.
    if (volume > 0 && this.context()) void this.loadFiles();
  }

  play(name: Sfx): void {
    if (this.volume <= 0) return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? -Infinity) < MIN_GAP_MS) return;
    this.last.set(name, now);
    const ctx = this.context();
    if (!ctx || !this.master) return;
    void this.loadFiles();
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.master);
    src.start();
  }

  /** The audio context, made on first use. The browser keeps it silent until the page has been
      clicked or a key pressed; it's woken then. */
  private context(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const wake = () => void this.ctx?.resume().catch(() => {});
    window.addEventListener("pointerdown", wake, { capture: true, once: true });
    window.addEventListener("keydown", wake, { capture: true, once: true });
    return this.ctx;
  }

  /** Reads which sound files the extension carries (sounds/index.json, written by the build), and decodes them (once). */
  private loadFiles(): Promise<void> {
    if (this.loading) return this.loading;
    const url = (path: string) => (typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL(path) : null);
    const index = url("sounds/index.json");
    if (!index) return (this.loading = Promise.resolve());
    this.loading = fetch(index)
      .then((r) => (r.ok ? r.json() : {}))
      .then(async (files: Partial<Record<Sfx, string>>) => {
        await Promise.all(Object.entries(files).map(async ([name, file]) => {
          try {
            const bytes = await (await fetch(url(`sounds/${file}`)!)).arrayBuffer();
            this.buffers.set(name as Sfx, await this.ctx!.decodeAudioData(bytes));
          } catch {
            // Unreadable: that sound stays silent.
          }
        }));
      })
      .catch(() => {});
    return this.loading;
  }
}
