# t3-16 · The player's portrait and life as in Arena

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

A visual change to something that exists. In Arena each player has a round portrait in the middle of their side of the table (yours at the bottom, the opponent's at the top) with the life in large type on a plate under it, glowing on their turn and flashing when hit; name, rank and title sit at the bottom left (I3hPJQyUBV4, every video). Goes with [t3-9](t3-9-compact-phase-indicator.md), which removes the step tracks from the middle.

## What existed before

The life in a pill among the step tracks, a circle with an emblem by it, and the name in a corner.

## What was done

- Each player's portrait is a big round picture in the middle of their side, sitting on their life total; on their turn it glows gold, breathing slowly (still when animations are off).
- With no avatar from Endstep, the picture is their commander's art, else a card of their deck as soon as one is seen (a creature or planeswalker first), kept for the whole match (`portraitArt()` in `src/ui/board/Board.ts`).
- The step tracks stay: [t3-9](t3-9-compact-phase-indicator.md), which would have removed them, was rejected.
- Commit `e4318aa`.

## Done when

- Each player's portrait and life sit in the middle of their side, as in Arena.
- Checked in the harness, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`e4318aa`).
