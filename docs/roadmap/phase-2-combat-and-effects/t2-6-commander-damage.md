# t2-6 · Commander damage on the player's picture

| | |
| --- | --- |
| Status | **Rejected** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Rejected on | 2026-10-16 |

Endstep sends it (`commanderDamage`) but the board doesn't show it.

## What exists now

Endstep sends `commanderDamage` on each player; `normalize.ts` copies it, but the board doesn't show it.

## What it involves

- Check the field's exact shape in a real state (it's still among the unknowns in `ENDSTEP_ANALYSIS.md`).
- Show it by the picture: damage taken from each commander, with a warning near 21.

## Done when

- In Commander, each player's commander damage is visible.

## Why rejected

No Commander features: the user dropped them for good after putting
them on hold on 2026-10-08.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-11: moved to Phase 6 · Maybe later (not planned for now).
- 2026-10-16: rejected for good; back in its original phase.
