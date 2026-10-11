// Real matches as fixtures: the frames Endstep sent in a recorded match (tools/save-match.mjs),
// played through the adapter as the extension receives them.
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { EndstepAdapter } from "../src/game/endstep/EndstepAdapter";
import type { GameState } from "../src/game/GameState";

export interface Frame {
  t: number;
  data: { type: string; matchId?: string; payload?: Record<string, unknown> };
}

/** The frames of tests/fixtures/<name>.ndjson.br, in the order they came. */
export function loadMatch(name: string): Frame[] {
  const text = brotliDecompressSync(readFileSync(`tests/fixtures/${name}.ndjson.br`)).toString("utf8");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Frame);
}

/** Every state the adapter publishes as the match's frames come in, each with the frame that
    brought it. The adapter follows the match on /game/<the last match id seen>. */
export function playMatch(name: string): { frame: Frame; state: GameState }[] {
  const frames = loadMatch(name);
  const matchId = frames.filter((f) => f.data.matchId).at(-1)?.data.matchId;
  const adapter = new EndstepAdapter();
  if (matchId) adapter.setRoute(`/game/${matchId}`);
  const states: { frame: Frame; state: GameState }[] = [];
  let frame = frames[0]!;
  adapter.subscribe((state) => state && states.push({ frame, state }));
  for (frame of frames) adapter.handleFrame(frame.data);
  return states;
}
