# t1-3 · Log the prompts that step aside

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 1 · Prompts still answered in Endstep's UI](README.md) |
| Type | Technical |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-07 |
| Feature note | [unsupported-prompts.md](../../features/unsupported-prompts.md) |

Record in the debug panel each prompt type the board can't answer, to know from real data what's missing.

## What exists now

When the board can't answer a prompt it steps aside for Endstep's UI (`kind: "classic"` in `modes.ts`), but nothing records which ones.

## What it involves

- Record every prompt type that falls to `classic`, with its message, in the debug panel (and in `.devlog` on the dev build).

## Done when

- The list of unsupported prompts seen in real matches can be looked up.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: done.
