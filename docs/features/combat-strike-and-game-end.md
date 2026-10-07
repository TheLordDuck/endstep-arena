# Combat strike and game end

| | |
| --- | --- |
| Status | **Done**: strike in `814d611`; game-end timing on 2026-10-07 (release 0.5.0) |
| Verified in a real match | No: see roadmap [t0-2](../roadmap/phase-0-finish-open-work/t0-2-verify-in-real-match.md) |

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

## Tests

Harness `#win`: an unblocked Tarmogoyf at an opponent on 4 life, and Vampire Nighthawk blocking
Grizzly Bears; the game ends without changing step. Screenshots:

- 0.7 s: the attacker heads for the opponent, who drops to 0 (−4); no result screen.
- 1.2 s: the creatures hit each other (claws, −3, −2).
- 3.7 s: Victory.

## Not verified

What Endstep sends in the last message of a real game won in combat, and whether the strike plays
in real matches.
