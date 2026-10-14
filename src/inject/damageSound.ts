// Endstep's damage sound, played as the Arena board's hit lands instead of when the event comes in
// (the board shows the state a moment later, then the bolt or the blow flies). Endstep plays its
// sounds through Howler (window.Howl): while the board asks for it, the damage sound is paused the
// moment it starts and resumed as a hit lands. Its file, volume and pitch stay Endstep's, as set in
// Endstep's audio settings. Its match win/loss sound likewise waits for the board's Victory or
// Defeat screen, which comes up only once the last fight has played out. Nothing else Endstep
// plays is touched.

import { isDamageSoundCommand } from "../shared/protocol";

/** Endstep's choice of sound per game moment, as its audio settings keep it. */
const ASSIGNMENTS = "endstep:audio:assignments:v1";
const DEFAULT_SOUND = "damage-impact";
const NO_SOUND = "__none__";
/** A held sound with no hit to go with it plays anyway after this long (ms). */
const MAX_HOLD_MS = 3000;
/** A damage sound starting this soon after a hit (ms) was for that hit: it plays at once. */
const LATE_MS = 1000;
/** Endstep's match win/loss sounds, as its audio settings name them, and their defaults. */
const END_SOUNDS: [string, string][] = [["match.win", "match-win-light"], ["match.loss", "match-loss-woosh"]];
/** A held win/loss sound with no result screen to go with it plays anyway after this long (ms). */
const MAX_END_HOLD_MS = 15000;

interface HowlLike {
  _src?: string | string[];
  play(sprite?: string | number, internal?: boolean): number | null | undefined;
  pause(id?: number): unknown;
  stop(id?: number): unknown;
}

interface Held {
  howl: HowlLike;
  id: number;
  at: number;
  timer: number;
}

export function installDamageSound(): void {
  let holding = false;
  let held: Held[] = [];
  let lastHit = Number.NEGATIVE_INFINITY;

  let holdingEnd = false;
  let ended = false;
  let heldEnd: Held[] = [];

  /** The sound Endstep's audio settings give a game moment (null: none). */
  const assigned = (key: string, fallback: string): string | null => {
    try {
      const chosen = (JSON.parse(localStorage.getItem(ASSIGNMENTS) ?? "{}") as Record<string, unknown>)[key];
      if (chosen === NO_SOUND) return null;
      return typeof chosen === "string" && chosen ? chosen : fallback;
    } catch {
      return fallback;
    }
  };
  const plays = (howl: HowlLike, sound: string | null) => {
    const src = typeof howl._src === "string" ? [howl._src] : howl._src ?? [];
    return !!sound && src.some((s) => s.includes(`/audio/${sound}.`));
  };
  const isDamage = (howl: HowlLike) => plays(howl, assigned("game.damage", DEFAULT_SOUND));
  const isEnd = (howl: HowlLike) => END_SOUNDS.some(([key, fallback]) => plays(howl, assigned(key, fallback)));
  const releaseEnd = () => {
    for (const h of heldEnd) {
      window.clearTimeout(h.timer);
      h.howl.play(h.id);
    }
    heldEnd = [];
  };

  const resume = (h: Held) => {
    window.clearTimeout(h.timer);
    held = held.filter((x) => x !== h);
    h.howl.play(h.id);
  };

  const patch = (Howl: unknown) => {
    const proto = (Howl as { prototype?: HowlLike & { __arenaDamage?: true } } | null)?.prototype;
    if (!proto || proto.__arenaDamage || typeof proto.play !== "function") return;
    proto.__arenaDamage = true;
    const play = proto.play;
    proto.play = function (this: HowlLike, sprite?: string | number, internal?: boolean) {
      const id = play.call(this, sprite, internal);
      try {
        const fresh = !internal && typeof sprite !== "number" && typeof id === "number";
        // The match's result, before the board shows it: it waits for the result screen.
        if (fresh && holdingEnd && !ended && isEnd(this)) {
          this.pause(id);
          const h: Held = { howl: this, id, at: performance.now(), timer: 0 };
          h.timer = window.setTimeout(releaseEnd, MAX_END_HOLD_MS);
          heldEnd.push(h);
          return id;
        }
        // A new sound (not a paused one resumed, not Howler's own replay of a queued play).
        if (holding && !internal && typeof sprite !== "number" && typeof id === "number" && isDamage(this) &&
          performance.now() - lastHit > LATE_MS) {
          this.pause(id);
          const h: Held = { howl: this, id, at: performance.now(), timer: 0 };
          h.timer = window.setTimeout(() => {
            // A hit landed meanwhile: this one went with an animation already. Otherwise it plays.
            if (lastHit > h.at) {
              held = held.filter((x) => x !== h);
              h.howl.stop(h.id);
            } else resume(h);
          }, MAX_HOLD_MS);
          held.push(h);
        }
      } catch {
        // Never let this throw into Endstep's sound code.
      }
      return id;
    };
  };

  // Howler puts Howl on window when Endstep's bundle runs, after this script.
  const w = window as unknown as { Howl?: unknown };
  if (w.Howl) patch(w.Howl);
  else {
    let value: unknown;
    try {
      Object.defineProperty(window, "Howl", {
        configurable: true,
        enumerable: true,
        get: () => value,
        set: (v: unknown) => {
          value = v;
          patch(v);
        },
      });
    } catch {
      // Not hooked: Endstep's damage sound plays when the event comes in, as before.
    }
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !isDamageSoundCommand(ev.data)) return;
    if (ev.data.hold !== undefined) {
      holding = ev.data.hold;
      if (!holding) for (const h of [...held]) resume(h);
    }
    if (ev.data.holdEnd !== undefined) {
      holdingEnd = ev.data.holdEnd;
      if (!holdingEnd) releaseEnd();
    }
    if (ev.data.ended !== undefined) {
      ended = ev.data.ended;
      if (ended) releaseEnd();
    }
    if (ev.data.hit) {
      lastHit = performance.now();
      const next = held[0];
      if (next) resume(next);
    }
  });
}
