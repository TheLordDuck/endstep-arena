# t2-13 Â· Check combat when the bot attacks

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 Â· Combat and visual effects](README.md) |
| Type | Fix |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-16 |

The match recorded on 2026-10-11 for [t2-12](t2-12-combat-from-events.md) only had our attacks. Check the cases it didn't cover.

## What existed before

Combat is driven by Endstep's events (t2-12), checked against our five attacks in `tests/fixtures/bot-combats.ndjson.br`.

## What a real match showed

A match against Forge AI on 2026-10-16, kept as `tests/fixtures/bot-attacks.ndjson.br` (the recording has two earlier, short matches too; the board and the tests follow the last). On turn 14 the bot attacked with two Colossal Dreadmaws (trample) and three Llanowar Elves, and the user blocked with eight Soldier tokens: six on one Dreadmaw, one on each of two Elves.

- The state before damage has all five attacks and eight blocks; `BLOCKERS_DECLARED` carries the same eight assignments. The blows (`CARD_DAMAGED` 1 from the Dreadmaw to each of its six blockers, each Soldier hitting back, `PLAYER_DAMAGED` from the unblocked Dreadmaw and Elves) agree with them.
- The recording lost the frames of turns 9 to 13, so that combat's `ATTACKERS_DECLARED` isn't in it: the board plays the fight from the states, as it does when an event is missing.
- Nothing trampled over (6 power against six 1/1s).
- A second match the same day, at the user's request (`tests/fixtures/bot-trample.ndjson.br`): the Dreadmaw blocked by four Soldiers (2 trample over), by two (4 over) and by six (nothing over). Endstep sends the blow at the player before those at the blockers.
- Both recordings have a stretch with no events (turns 9 to 13 in the first, 4 to 11 in the second): Endstep leaves out the events of the turns that pass while its tab is hidden, and sends just the state (an `ATTACH`) when it comes back. The second match's turn 11 combat came that way, without its `ATTACKERS_DECLARED`.
- The user found the blocks hard to read: with many blockers the arrows all ended on the attackers' centres and crossed, and once the blocks were declared they went away. And asked for a trampler to hit the player after its blockers.

## What was done

- **Who blocks whom:** each blocked attacker gets a color and a number; it and its blockers carry a disc with it (one per pile) until combat ends. The blockers' arrows, in that color, end at points spread along the attacker's near edge so they don't cross. Pointing at a fighter dims the other groups; while you choose blockers the attack arrows step back.
- **Trample:** a blocked attacker that deals damage past its blockers slams into each of them, then into the player's picture (or the planeswalker), which loses that much then. From the events, else from its power beyond what's lethal to the blockers (`trampleExcess()` in `src/game/combatEvents.ts`).
- **A fight without `ATTACKERS_DECLARED`** (`toldFight()`): the attackers the states show, with the blocks and blows of the events that did come, from `BLOCKERS_DECLARED` on. Before, the whole fight was worked out from the states.
- Harness scenarios `gang-block`, `gang-blocked` and `trample`; tests in `tests/botAttacks.test.ts` (both recordings). See [combat strike](../../features/combat-strike-and-game-end.md#change-of-2026-10-16-who-blocks-whom-and-trample).

## Done when

- The bot's attacks, double blocks and trample play their strike with the right blockers and damage.
- Checked on the two recorded matches (the bot's attacks, blocks of up to eight, trample over four and two blockers) and in the harness; the board's animations seen in the harness, not yet in a live match.

## History

- 2026-10-11: added to the roadmap.
- 2026-10-16: two matches recorded; block groups and trample's blow at the player added at the user's request; done.
