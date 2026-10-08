# t2-12 · Combat driven by Endstep's events

| | |
| --- | --- |
| Status | **To do** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Technical |
| Needs approval | No (marked done directly) |

The combat animations are worked out by comparing one state with the next, and Endstep doesn't always send every step (against a bot it may go through the whole combat in one update), so sometimes they don't play. Drive them by Endstep's game events instead, with the states only as a fallback.

## What exists now

`combatStrike()` in `src/ui/board/Board.ts` plays when an update goes from a state with attackers to a combat damage step. `fightBefore()`, `damageStep()` and `foughtIn()` cover the cases seen so far (the attackers remembered or read from the log, the damage taken as the sign of a fight), but they are still guesses: a blocked attack no state showed can't be animated, and an event arriving after its state is missed. See [combat-strike-and-game-end.md](../../features/combat-strike-and-game-end.md).

## What it involves

- Record a `.devlog` of a real match (`pnpm build:dev` + `pnpm dev-server`) with several combats: blocked and unblocked, several attackers, first strike. Check the exact fields and the order of `ATTACKERS_DECLARED`, `BLOCKERS_DECLARED` (`blockerAssignments`, `amount`), `CARD_DAMAGED`, `PLAYER_DAMAGED` and the state updates around them.
- Build each fight from the events: who attacks, who blocks whom, the damage of each blow.
- Play it when the damage events come, whatever steps the states show or skip; use the states only when the events are missing.
- Keep the blow-by-blow life and damage (t2-10) and the damage sound on each hit.

## Done when

- In a real match against a bot, every combat with damage plays its strike, with the right blockers and the right damage on each blow.
- Fixtures from the recorded match as tests (see [t5-4](../phase-5-modes-and-platform/t5-4-real-matches-as-tests.md)).

## History

- 2026-10-08: added to the roadmap.
