# t0-2 · Verify in a real match

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 0 · Finish open work](README.md) |
| Type | Fix |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-07 |

Play with `pnpm build:dev` and `pnpm dev-server` and check in `.devlog`: damage assignment, Thought-Knot Seer, a win in combat, the strike.

## What exists now

Everything from the 2026-10-07 session is tested in the harness and unit tests, not against what Endstep really sends.

## What it involves

- Play with `pnpm build:dev` + `pnpm dev-server`; messages land in `.devlog/frames.ndjson`.
- Check: the `ASSIGN_DAMAGE` / `DIVIDE_SHIELD` prompt (if its fields differ, the screen may not show or show empty); the combat strike (not seen in real matches); the last message of a game won in combat; Thought-Knot Seer (not retried since the second fix).
- When something doesn't match, keep that slice of `.devlog` as a fixture (t5-4).

## Done when

- Each case has been seen working in a real match, or has its fix.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: done.
