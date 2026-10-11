# t2-12 · Combat driven by Endstep's events

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Technical |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-11 |

The combat animations were worked out by comparing one state with the next, and Endstep doesn't always send every step (against a bot it may go through the whole combat in one update), so sometimes they didn't play. Now Endstep's game events tell the fight, with the states only as a fallback.

## What existed before

`combatStrike()` in `src/ui/board/Board.ts` played when an update went from a state with attackers to a combat damage step. `fightBefore()` guessed the fight when the state before had none, from the last one shown or the attackers the log named. The guesses read event fields Endstep doesn't send (`cardIds`), so on real data they never found anything.

## What a real match showed

A match against Forge AI on 2026-10-11, recorded with the dev bridge and kept as `tests/fixtures/bot-combats.ndjson.br`. It had five combats: unblocked attackers, a double strike, single blocks, a four-creature trade, and a lethal attack.

- `ATTACKERS_DECLARED` carries `attackerIds` (no names, no defender). `BLOCKERS_DECLARED` carries `blockerAssignments` (blocker id → attacker id), and has no such field when nobody blocks. `CARD_DAMAGED` / `PLAYER_DAMAGED` carry one blow each: `cardId`, `targetCardId` or `playerIndex`, and `amount`.
- A `TURN_PHASE` event (`COMBAT_FIRST_STRIKE_DAMAGE`, `COMBAT_DAMAGE`) comes before each burst of blows, so a double strike's two blows can be told apart.
- By the damage state, creatures that died have already lost their attacking and blocking flags: in turn 9 all four fighters traded and the damage state shows no fight at all.
- The blows come within about 50 ms of the damage state, most just before it, some just after.
- **Endstep sends `turnNumber` as a string** (`"3"`). It was read as a number, so the board never knew the turn. Each damage step is shown once, keyed by match, turn and step, so after the first combat of a match every later strike counted as already shown. That's why most strikes didn't play.

## What was done

- `turnNumber` is read from a string too (`normalize.ts`).
- The log entries carry the combat facts from the event fields (`LogEntry.fight`). Each blow is tagged with its damage step, from the last `TURN_PHASE` (`EndstepAdapter`). `CARD_DAMAGED` also names the card hit, which fixes the spell damage read from events (`spellDamage.ts`) on real data.
- `src/game/combatEvents.ts`: `toldFight()` builds the turn's latest fight from the events. `blowsOf()` lists a fight's blows, by step, up to `COMBAT_ENDED`.
- `fightBefore()` takes attackers and blockers from the events. Without them it falls back on the states, as before.
- `combatStrike()`: who strikes in a step, the damage each creature takes, and each attacker's share of a player's life come from the blows. Blows that come after the state are worked out from the states, as before.

## Done when

- In a real match against a bot, every combat with damage plays its strike, with the right blockers and the right damage on each blow. Checked by replaying the recorded match on the board (harness `#match:bot-combats`): all five combats play, 14 blows. Before, only the first combat did.
- Fixtures from the recorded match as tests: `tests/combatEvents.test.ts` (see [t5-4](../phase-5-modes-and-platform/t5-4-real-matches-as-tests.md)).

Not covered by that match: the bot attacking (and you blocking), double blocks, trample. See [t2-13](t2-13-check-bot-attacks.md).

## History

- 2026-10-08: added to the roadmap.
- 2026-10-11: done.
