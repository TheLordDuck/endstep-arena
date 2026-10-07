# t5-3 · Visual regression tests

| | |
| --- | --- |
| Status | **To do** |
| Phase | [Phase 5 · Modes and platform](README.md) |
| Type | Technical |
| Needs approval | No (marked done directly) |

Automatic screenshots of the harness scenarios through Chrome over CDP, compared with the previous ones.

## What exists now

Real-click testing used a temporary script (Chrome over CDP) that isn't in the repo; see `docs/testing.md`.

## What it involves

- Add the script to `tools/` and a command that screenshots every harness scenario and compares it with saved ones.

## Done when

- One command flags any change in how a scenario looks.

## History

- 2026-10-07: added to the roadmap.
