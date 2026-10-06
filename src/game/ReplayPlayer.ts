// Plays a decoded replay on the board: a frame position, play/pause at a few speeds, stepping
// by frame or by turn, and seeking. It never talks to the server; the adapter shows the frame.

import type { Replay } from "./endstep/replay";

export const REPLAY_SPEEDS = [0.5, 1, 2, 4];

/** Where the replay is, for the board's controls. */
export interface ReplayStatus {
  frame: number;
  frames: number;
  playing: boolean;
  speed: number;
  turn: number;
  /** The first frame of each turn. */
  turnStarts: number[];
}

export type ReplayCommand =
  | { kind: "toggle" }
  | { kind: "step"; delta: number }
  | { kind: "turn"; delta: number }
  | { kind: "seek"; frame: number }
  | { kind: "speed"; speed: number };

/** Time shown per frame while playing, at 1×: the recorded gap, kept between these bounds
    so long thinks don't stall and bursts of tiny changes stay visible. */
const MIN_STEP_MS = 350;
const MAX_STEP_MS = 1800;

export class ReplayPlayer {
  private replay: Replay | null = null;
  private frame = 0;
  private playing = false;
  private speed = 1;
  private timer = 0;
  private turnStarts: number[] = [];

  constructor(private readonly onChange: () => void) {}

  get current(): Replay | null {
    return this.replay;
  }

  load(replay: Replay): void {
    this.stop();
    this.replay = replay;
    this.frame = 0;
    this.speed = 1;
    this.turnStarts = replay.frames.flatMap((f, i) => (i === 0 || f.turn !== replay.frames[i - 1]!.turn ? [i] : []));
    this.onChange();
  }

  clear(): void {
    this.stop();
    this.replay = null;
    this.onChange();
  }

  status(): ReplayStatus | null {
    const r = this.replay;
    if (!r) return null;
    return {
      frame: this.frame,
      frames: r.frames.length,
      playing: this.playing,
      speed: this.speed,
      turn: r.frames[this.frame]!.turn,
      turnStarts: this.turnStarts,
    };
  }

  command(cmd: ReplayCommand): void {
    const r = this.replay;
    if (!r) return;
    const last = r.frames.length - 1;
    switch (cmd.kind) {
      case "toggle":
        if (this.playing) this.stop();
        else {
          // From the end, play again from the start.
          if (this.frame >= last) this.frame = 0;
          this.playing = true;
          this.schedule();
        }
        break;
      case "step":
        this.stop();
        this.frame = clamp(this.frame + cmd.delta, 0, last);
        break;
      case "turn": {
        this.stop();
        const starts = this.turnStarts;
        // Back: the start of this turn, or of the one before when already there.
        const target = cmd.delta > 0 ? starts.find((s) => s > this.frame)
          : [...starts].reverse().find((s) => s < this.frame);
        this.frame = target ?? (cmd.delta > 0 ? last : 0);
        break;
      }
      case "seek":
        this.frame = clamp(Math.round(cmd.frame), 0, last);
        if (this.playing) this.schedule();
        break;
      case "speed":
        this.speed = cmd.speed;
        if (this.playing) this.schedule();
        break;
    }
    this.onChange();
  }

  private stop(): void {
    this.playing = false;
    clearTimeout(this.timer);
    this.timer = 0;
  }

  private schedule(): void {
    clearTimeout(this.timer);
    const r = this.replay;
    if (!r || !this.playing) return;
    const next = r.frames[this.frame + 1];
    if (!next) {
      this.stop();
      this.onChange();
      return;
    }
    const gap = clamp(next.t - r.frames[this.frame]!.t, MIN_STEP_MS, MAX_STEP_MS) / this.speed;
    this.timer = window.setTimeout(() => {
      this.frame++;
      this.schedule();
      this.onChange();
    }, gap);
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
