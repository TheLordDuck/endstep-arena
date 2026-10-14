# t3-13 · Player counters Endstep sends that we don't show

| | |
| --- | --- |
| Status | **Awaiting approval** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |

Arena shows Aetherdrift's Speed under the player's name (a green box with the number and chevrons, violet with a rainbow at 4; I3hPJQyUBV4 23:45 and 36:05, GCFNWRMRCn8 9:05). Endstep also sends, per player, `experienceCounters`, `radCounters`, `ringTempts`, `hasCitysBlessing`, `dungeonRoomId` and, for the game, `isDay`/`isNight` (docs/ENDSTEP_ANALYSIS.md).

## What exists now

Only poison, energy, monarch and initiative.

## What it involves

- Chips for everything that comes, and Speed if Endstep sends it (check in a match with Aetherdrift cards).
- Arena's style for Speed, and a sun or moon for day and night.

## Done when

- Each of those counters shows on its player while it's set.

## History

- 2026-10-13: added to the roadmap.
