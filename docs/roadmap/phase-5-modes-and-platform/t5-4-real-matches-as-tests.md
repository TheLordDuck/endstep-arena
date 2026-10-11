# t5-4 · Real matches as tests

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 5 · Modes and platform](README.md) |
| Type | Technical |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-11 |

Keep matches recorded with the dev bridge as fixtures, to test against what Endstep really sends.

## What existed before

The adapter's tests used hand-written states based on Endstep's code.

## What was done

- `node tools/save-match.mjs <name>` keeps the frames Endstep sent in `.devlog/frames.ndjson` as `tests/fixtures/<name>.ndjson.br` (brotli; a 13-turn match is 26 KB).
- `tests/realMatch.ts`: `loadMatch()` reads one, and `playMatch()` plays it through `EndstepAdapter`, returning every state it publishes.
- The harness plays one on the board at its own pace: `harness.html?speed=3#match:<name>` (`?turn=N` starts at turn N). It logs `DAMAGE LANDED <turn>` for each blow and `MATCH OVER` at the end.
- First fixture: `bot-combats`, a match against Forge AI with five combats. `tests/combatEvents.test.ts` checks the combat events against it.
- It already found a bug no hand-written state would have shown: Endstep sends `turnNumber` as a string, so the board never knew the turn.

## Done when

- The important cases are tested with real Endstep data. Combat is; more matches can be added the same way (see [t2-13](../phase-2-combat-and-effects/t2-13-check-bot-attacks.md)).

## History

- 2026-10-07: added to the roadmap.
- 2026-10-11: done.
