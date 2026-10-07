# t2-6 · Commander damage on the player's picture

| | |
| --- | --- |
| Status | **To do** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |

Endstep sends it (`commanderDamage`) but the board doesn't show it.

## What exists now

Endstep sends `commanderDamage` on each player; `normalize.ts` copies it, but the board doesn't show it.

## What it involves

- Check the field's exact shape in a real state (it's still among the unknowns in `ENDSTEP_ANALYSIS.md`).
- Show it by the picture: damage taken from each commander, with a warning near 21.

## Done when

- In Commander, each player's commander damage is visible.

## History

- 2026-10-07: added to the roadmap.
