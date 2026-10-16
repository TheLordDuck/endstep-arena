# Combat strike and game end

| | |
| --- | --- |
| Status | **Done**: strike in `814d611`; game-end timing on 2026-10-07 (release 0.5.0) |
| Verified in a real match | Replayed from a real match (2026-10-11, harness `#match:bot-combats`); not yet when the bot attacks |

## The strike

`combatStrike()` in `src/ui/board/Board.ts`. As combat damage begins, the attacker lifts off the
table, tilted, and slams into each blocker, or into the defending player's picture or planeswalker
when unblocked: a white flash, a jolt of the table, claw marks and the damage taken (`-N`).
Creatures that die crumble into smoke where they fought. First and double strike play in their own step.

It plays when an update goes from a step before `COMBAT_DAMAGE` to `FIRST_STRIKE_DAMAGE` /
`COMBAT_DAMAGE` or later, in the same turn, with attackers in the previous state (`damageStep()`).
Endstep's bundle confirms those step names (`phase: "COMBAT_DAMAGE"`). With "reduce motion" on,
nothing animates.

## Change of 2026-10-07: the strike before the result

**Problem:**

1. Victory/Defeat came up as soon as `status: "COMPLETE"` arrived and covered the strike.
2. When combat damage ends the game, Endstep may send the final state without moving on to the
   damage step (it stays on `DECLARE_BLOCKERS`), so the strike never started.

**Fix** (`Board.ts`):

- `damageStep()`: a game that ends during combat (from `DECLARE_ATTACKERS` on), without moving on a
  step, where someone lost life or a creature in the fight died, counts as combat damage (`"cd"`).
- `combatStrike()` records in `endHoldUntil` when the strike and the smoke are over (+900 ms).
- `renderEnd()` holds the result until then and sets a timer to show it. A strike started by an
  earlier update holds it too.

## Change of 2026-10-08: when Endstep skips the damage step

The strike sometimes didn't play: Endstep may go past combat in one update (against a bot, even
into the next turn), or never show the attackers. Now:

- `fightBefore()`: when the state before has no attackers, the last ones shown this turn; failing
  that, those the log names (`ATTACKERS_DECLARED`), as unblocked, when no `BLOCKERS_DECLARED`
  names cards.
- `damageStep()`: an update that ends the fight (next turn, game over, or the combat cleared)
  without a damage step counts as combat damage when it brings the fight's damage (`foughtIn()`:
  life lost, a fighter dead or damaged, and no spell or ability resolved).
- Harness `#strike-next-turn` and `#strike-unseen`.
- Several attackers at one player: the life goes down a blow at a time (each its attacker's
  power, the last blow what's left), not all at the first (`lifeStep()`). Harness `#strike-many`.

## Tests

Harness `#win`: an unblocked Tarmogoyf at an opponent on 4 life, and Vampire Nighthawk blocking
Grizzly Bears; the game ends without changing step. Screenshots:

- 0.7 s: the attacker heads for the opponent, who drops to 0 (−4); no result screen.
- 1.2 s: the creatures hit each other (claws, −3, −2).
- 3.7 s: Victory.

## Not verified

What Endstep sends in the last message of a real game won in combat, and whether the strike plays
in real matches.

## Change of 2026-10-11: the fight from Endstep's events

Replaying a real match against Forge AI on the board showed the strike only in the first combat:

- **Endstep sends `turnNumber` as a string** (`"3"`). It was read as a number, so no state had a
  turn. Each damage step is shown once (`struck`, keyed by match, turn and step), so every later
  combat's damage counted as already shown. Now read from a string too.
- The log fallback of `fightBefore()` read fields Endstep doesn't send (`cardIds` on
  `ATTACKERS_DECLARED`, cards on `BLOCKERS_DECLARED`).
- By the damage state, the creatures that died have lost their attacking and blocking flags.

Now the fight comes from Endstep's events (`src/game/combatEvents.ts`, roadmap
[t2-12](../roadmap/phase-2-combat-and-effects/t2-12-combat-from-events.md)):

- `fightBefore()`: the attackers from `ATTACKERS_DECLARED` (`attackerIds`), who blocks whom
  from `BLOCKERS_DECLARED` (`blockerAssignments`); the states only when those are missing.
- `combatStrike()`: each blow from `CARD_DAMAGED` / `PLAYER_DAMAGED`, by damage step (the last
  `TURN_PHASE` before it): who strikes in each step (double strike included), the damage each
  creature takes, and each attacker's share of a player's life. Blows that come just after the
  state are worked out from the states, as before.

Checked with harness `#match:bot-combats` (the recorded match): all five combats play, 14 blows.

## Change of 2026-10-16: who blocks whom, and trample

From a real match where the bot attacked (`tests/fixtures/bot-attacks`, roadmap
[t2-13](../roadmap/phase-2-combat-and-effects/t2-13-check-bot-attacks.md)): with eight Soldier
tokens blocking three attackers, the blue block arrows all ended on the attackers' centres and
crossed each other, and once the blocks were declared they went away, leaving no way to tell who
fought whom.

- **Block groups** (`blockGroups()` / `blockMarks()` in `Board.ts`). Each blocked attacker gets a
  color and a number, left to right as they sit on the table; it and each of its blockers carry a
  disc of that color with the number, on their top right corner (a pile's count is on the left),
  one per pile of identical cards. The discs stay until combat ends; the arrows, while blocks are
  chosen or not yet declared. A blocker's arrow, in its group's color, rises from its near edge to
  a point of the attacker's near edge, the blockers' points spread over it left to right so that
  they don't cross. Pointing at a fighter dims the other groups. While you choose blockers the
  attack arrows step back (30 %).
- **Trample.** A blocked attacker that deals damage past its blockers slams into each of them and
  then on into who it attacks (the player's picture, or the planeswalker), which loses that much
  then. The amount is what the events say it dealt there; without events, for a creature with
  trample, its power beyond what's lethal to its blockers (`trampleExcess()` in
  `src/game/combatEvents.ts`), when that player's life did go down.
- **A fight without `ATTACKERS_DECLARED`** (`toldFight()`): the attackers the states show, with the
  blocks and blows of the events that did come, from `BLOCKERS_DECLARED` on.

Harness: `gang-block` (choose blockers for the bot's Dreadmaw and two Elves with eight Soldiers),
`gang-blocked` (the same, declared) and `trample` (the Dreadmaw through two Soldiers into you, 4
over). Tests: `tests/botAttacks.test.ts`, on that match and on a second one (`bot-trample`): the
Dreadmaw blocked by four Soldiers (2 over), two (4 over) and six (nothing over). Endstep sends the
blow at the player before those at the blockers; the board slams into the blockers first all the same.

Both recordings have turns with no events (9 to 13, and 4 to 11): Endstep leaves out the events of
the turns that pass while its tab is hidden, and sends just the state (an `ATTACH` holding a
`GAME_STATE`) when it comes back. A combat right after that has no `ATTACKERS_DECLARED`, hence the
fight above.
