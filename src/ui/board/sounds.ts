// The board's sounds. Each one plays a file from the extension's `sounds/` folder when there is
// one (see public/sounds/README.md: any .ogg/.mp3/.wav named after the sound, Arena's own if you
// have them), and otherwise a short sound made on the spot with Web Audio, so the board is never
// silent for lack of files. Nothing plays at volume 0.

export const SFX = ["cast", "resolve", "land", "pass", "attack", "hit", "zap", "exile", "token", "counter", "turn", "win", "lose"] as const;
export type Sfx = (typeof SFX)[number];

/** The same sound isn't played again sooner than this (ms): a burst of changes makes one sound. */
const MIN_GAP_MS = 70;

type Tone = (ctx: AudioContext, out: AudioNode, t: number) => void;

export class Sounds {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0;
  /** Sound name → file in the extension (from sounds/index.json, written by the build). */
  private files: Partial<Record<Sfx, string>> | null = null;
  private loading: Promise<void> | null = null;
  private buffers = new Map<Sfx, AudioBuffer>();
  private last = new Map<Sfx, number>();

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master) this.master.gain.value = volume;
    // Ready before the first sound, so it isn't the made-up one when there's a file for it.
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
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.master);
      src.start();
    } else if (!this.files?.[name]) {
      TONES[name](ctx, this.master, ctx.currentTime + 0.005);
    }
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

  /** Reads which sound files the extension carries, and decodes them (once). */
  private loadFiles(): Promise<void> {
    if (this.loading) return this.loading;
    const url = (path: string) => (typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL(path) : null);
    const index = url("sounds/index.json");
    if (!index) return (this.loading = Promise.resolve());
    this.loading = fetch(index)
      .then((r) => (r.ok ? r.json() : {}))
      .then(async (files: Partial<Record<Sfx, string>>) => {
        this.files = files;
        await Promise.all(Object.entries(files).map(async ([name, file]) => {
          try {
            const bytes = await (await fetch(url(`sounds/${file}`)!)).arrayBuffer();
            this.buffers.set(name as Sfx, await this.ctx!.decodeAudioData(bytes));
          } catch {
            // Unreadable: that sound falls back to its made-up one.
            delete this.files![name as Sfx];
          }
        }));
      })
      .catch(() => {
        this.files = {};
      });
    return this.loading;
  }
}

// ---------------------------------------------------------------- made-up sounds

/** One oscillator note: type, start and end frequency, length (s) and loudness. */
function note(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, from: number, to: number, len: number, level: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + len);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + Math.min(0.02, len / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + len + 0.02);
}

/** A burst of noise through a filter sweeping from one frequency to another. */
function noise(ctx: AudioContext, out: AudioNode, t: number, type: BiquadFilterType, from: number, to: number, len: number, level: number): void {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + len);
  filter.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(filter).connect(gain).connect(out);
  src.start(t);
}

const TONES: Record<Sfx, Tone> = {
  // A spell cast: a rising shimmer.
  cast: (c, o, t) => {
    note(c, o, t, "sine", 420, 940, 0.28, 0.25);
    note(c, o, t + 0.03, "triangle", 630, 1400, 0.26, 0.12);
  },
  // A spell resolving: a soft chime.
  resolve: (c, o, t) => {
    note(c, o, t, "sine", 880, 880, 0.45, 0.2);
    note(c, o, t, "sine", 1320, 1320, 0.35, 0.1);
  },
  // A land played: a low thud.
  land: (c, o, t) => {
    note(c, o, t, "sine", 150, 55, 0.2, 0.45);
    noise(c, o, t, "lowpass", 900, 200, 0.08, 0.2);
  },
  // Passing priority: a short tick.
  pass: (c, o, t) => note(c, o, t, "triangle", 700, 560, 0.07, 0.18),
  // Attackers declared: a whoosh.
  attack: (c, o, t) => noise(c, o, t, "bandpass", 300, 2400, 0.32, 0.35),
  // A combat hit: a heavy impact.
  hit: (c, o, t) => {
    noise(c, o, t, "lowpass", 2400, 120, 0.22, 0.5);
    note(c, o, t, "sine", 110, 45, 0.28, 0.5);
  },
  // Damage from a spell: an electric crack.
  zap: (c, o, t) => {
    note(c, o, t, "sawtooth", 1500, 180, 0.2, 0.14);
    noise(c, o, t, "highpass", 3000, 800, 0.15, 0.25);
  },
  // Exiled: an airy rising swirl.
  exile: (c, o, t) => {
    note(c, o, t, "sine", 520, 1600, 0.6, 0.18);
    note(c, o, t + 0.05, "sine", 780, 2100, 0.55, 0.08);
    noise(c, o, t, "bandpass", 600, 4000, 0.5, 0.12);
  },
  // A token made: a sparkle.
  token: (c, o, t) => {
    note(c, o, t, "sine", 1200, 1200, 0.12, 0.14);
    note(c, o, t + 0.06, "sine", 1600, 1600, 0.12, 0.12);
    note(c, o, t + 0.12, "sine", 2100, 2100, 0.16, 0.1);
  },
  // Power/toughness or counters up: a quick blip.
  counter: (c, o, t) => note(c, o, t, "square", 520, 820, 0.09, 0.07),
  // Your turn: two notes.
  turn: (c, o, t) => {
    note(c, o, t, "triangle", 440, 440, 0.18, 0.22);
    note(c, o, t + 0.16, "triangle", 660, 660, 0.3, 0.22);
  },
  // Victory: a rising major arpeggio.
  win: (c, o, t) => {
    [523, 659, 784, 1047].forEach((f, i) => note(c, o, t + i * 0.12, "triangle", f, f, 0.5, 0.22));
  },
  // Defeat: a falling minor line.
  lose: (c, o, t) => {
    [440, 392, 349, 262].forEach((f, i) => note(c, o, t + i * 0.16, "sine", f, f * 0.98, 0.5, 0.2));
  },
};
