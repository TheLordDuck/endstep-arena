# t3-2 · Game and turn clocks

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-07 |
| Done on | 2026-10-07 |
| Feature note | [game-clocks.md](../../features/game-clocks.md) |

Endstep sends the clock (`clock`); show each player's time left, like Arena's timer.

## What exists now

Endstep sends the clock (`clock`, `idleTimeout`), but the board doesn't show it.

## What it involves

- Check the field's shape in a real state.
- Show each player's time by their picture and warn when it runs low.

## Done when

- Each player's remaining time is visible.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: approved.
- 2026-10-07: done.
