# t5-3 · Visual regression tests

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 5 · Modes and platform](README.md) |
| Type | Technical |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-14 |

Automatic screenshots of the harness scenarios through Chrome over CDP, compared with the previous ones.

## What existed before

Real-click testing used a temporary script (Chrome over CDP) that isn't in the repo; see `docs/testing.md`.

## What was done

- `tools/visual.mjs` (`pnpm visual`) takes a screenshot of every harness scenario in Chrome over the DevTools protocol (1600×900) and compares it with the baseline kept in `.visual/baseline`; `--update` takes them again, and scenario names limit the run.
- Shot with animations off on the plain table and with web pictures blocked, so the same build always gives the same picture, offline too.
- A changed scenario leaves `.visual/current/<name>.png` and `.visual/diff/<name>.png` (changed pixels in red); exit code 1 if any changed.
- Commit `a16aa76`.

## Done when

- One command flags any change in how a scenario looks.
- `pnpm visual` showed no change in the 94 harness scenarios for Release 0.7.0.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-14: done (`a16aa76`).
