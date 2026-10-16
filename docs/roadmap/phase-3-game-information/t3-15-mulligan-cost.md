# t3-15 · What a mulligan costs, under the button

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

On the mulligan screen Arena says under the button what will happen: "You will return 1 card to the bottom of your library." (2 cards on the second); the button reads "Free Mulligan" when the first is free (Brawl) and "Keep 6" instead of "Keep 7" after a mulligan; a "?" opens help. Seen in I3hPJQyUBV4 15:05, wdHAGKuvIpg 4:05, oKhLGseypS4 8:05 and 24:05. Goes with [t3-7](t3-7-opponent-mulligan-status.md).

## What existed before

The question, and Keep / Mulligan.

## What was done

- A line under the mulligan's buttons says what keeping puts on the bottom of your library and what another mulligan would, or that the mulligan taken was free (`mulliganCost()` and `mulliganHint()` in `src/ui/board/mulligan.ts`, from Endstep's `MULLIGAN` events and its Keep button's label).
- On the way: the hover zoom shows the card alone.
- Commit `995e58c`.

## Done when

- Each mulligan says what it will cost, and Keep shows the hand's size.
- Harness scenarios `mulligan` and `mulligan2` (after two mulligans: Keep 5, two cards to the bottom); `tests/mulligan.test.ts`. Checked in the harness and by unit tests, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`995e58c`).
