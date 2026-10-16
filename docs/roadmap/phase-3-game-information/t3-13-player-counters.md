# t3-13 · Player counters Endstep sends that we don't show

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

Arena shows Aetherdrift's Speed under the player's name (a green box with the number and chevrons, violet with a rainbow at 4; I3hPJQyUBV4 23:45 and 36:05, GCFNWRMRCn8 9:05). Endstep also sends, per player, `experienceCounters`, `radCounters`, `ringTempts`, `hasCitysBlessing`, `dungeonRoomId` and, for the game, `isDay`/`isNight` (docs/ENDSTEP_ANALYSIS.md).

## What existed before

Only poison, energy, monarch and initiative.

## What was done

- Chips on each player for experience and rad counters, the Ring's temptation (level out of 4), the city's blessing, an enduring story, the current dungeon room and commander tax (`normalize.ts` now reads `experienceCounters`, `radCounters`, `ringTempts`, `hasCitysBlessing`, `hasEnduringStory`, `dungeonRoomId` and `commanderTax`).
- Day or night (`isDay`/`isNight`) shows as ☀ Day or ☾ Night beside the turn.
- Not done: Aetherdrift's Speed. Endstep's state has no field for it that we know of; still to check in a match with those cards.
- Commit `e4318aa`.

## Done when

- Each of those counters shows on its player while it's set.
- Harness scenario `info`. Checked in the harness, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`e4318aa`).
