# t2-21 · Orbs when gaining life

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

When a player gains life, Arena sends golden orbs flying from what gave it (the permanent that triggered, the spell) to their life total, which flashes (I3hPJQyUBV4 7:45, ezOhWpWuol0 15:05).

## What existed before

Only the number changes (and a green +N floats up).

## What was done

- Golden orbs fly from the card that gave the life to the player's total, and the total changes as they land. With no card to start from (a spell already gone), they gather around the portrait.
- Endstep's `PLAYER_LIFE_CHANGED` names no source, so `lifeGainSource()` (`src/ui/board/lifeGain.ts`) takes it from the log entry just before the gain: the lifelink creature's damage, the spell that resolved, the ability that triggered.
- At the animation speed from the settings.
- Commit `6724644`.

## Done when

- Gaining life from a trigger or a spell shows orbs flying from it to the life total, which flashes.
- Harness scenario `lifegain`; `tests/lifeGain.test.ts`. Checked in the harness and by unit tests, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`6724644`).
