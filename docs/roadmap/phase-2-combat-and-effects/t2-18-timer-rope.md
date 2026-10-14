# t2-18 · The timer's rope across the table

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

When a player is running out of time to act, Arena draws a burning orange line from the hourglass on their plate across the table, and it burns down. Seen in 4 of LegenVD's 10 videos (I3hPJQyUBV4 49:25, a2dMvbEqDwY 57:45, GCFNWRMRCn8 25:05, ezOhWpWuol0 36:05).

## What existed before

Only a countdown by the player's picture.

## What was done

- `renderRope()` in `src/ui/board/Board.ts`: during the last stretch of a player's idle timer (Endstep's `graceMs`, 30 s by default: the stretch where it already warns "Act now"), a burning line across the middle column of the table on their side, between their cards and their life total: gold-orange for you, red for the opponent.
- It shortens with the time left, kept up by the same ticker as the countdowns, with a flickering ember at its end. The countdown by the picture stays.

## Done when

- In the harness's `clock` scenario the rope crosses the table and shortens with time. Checked (`clock`: 25 s left of 30; `clock-opp`: 70 s left, no rope yet).

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done.
