# Pass until…

| | |
| --- | --- |
| Status | **Done** (2026-10-07, roadmap [t4-4](../roadmap/phase-4-comfort-and-settings/t4-4-pass-until.md)) |
| Verified | In the harness (`#priority`, actions logged) and unit tests; not yet in a real match |

A **Pass until…** button in the action dock opens a menu: **Combat**, **End step**,
or **End of opponent's turn** (*My next turn* was removed on 2026-10-09: Endstep's own UI doesn't offer it). Priority is then passed for you until that point.

## How it works

Endstep has no server action for this: its client passes priority itself each time it gets it,
until it arrives (its `onPassUntil…` handlers, with modes `combat`, `endOfTurn`, `myNextTurn`,
`prevEndStep`, `untilAction`). The board does the same, with the same `PASS_PRIORITY` it already
sends.

- **Combat**: stops at the next combat (one already under way doesn't count), or at the next turn's
  main 2 / end if a turn ends without one.
- **End step**: stops at this turn's end step, or at the next turn.
- **End of opponent's turn**: stops at an opponent's end step (the one before your turn).
- **My next turn**: stops at the first stop of your next turn.
- **End turn** (the dock's existing button) now runs on the same mechanism: it passes until the
  turn is over.

On the way:

- Your own attack step is answered with no attackers (unless passing to combat).
- It stops when an opponent casts or activates something new, when the game asks anything other
  than priority (blockers, targets, a yes/no…), and when the game ends.
- While passing, the dock shows *Passing to …* and **Stop passing**, which works at once.

## Temporary stops

The server only gives priority at a phase stop. So that the point can be reached even if its stop
is off, passing adds it for a while (`SET_PHASE_STOPS` with the player's stops plus that one), and
puts the player's own back when it ends. They're never saved. Combat adds *Beginning of combat* on
the current player's side, End step adds *End step*, End of opponent's turn adds the opponent's
*End step*, and My next turn adds *Main 1* only if you have no stops in your turn.

## Implementation

- `src/game/passUntil.ts`: `startPassUntil()`, `passUntilStep()` (pass / no-attack / wait / stop),
  `passUntilStops()`, `PASS_TARGETS`.
- `src/game/PhaseStopSync.ts`: `setTemporary()`; a set Endstep's client sends is checked against
  the stops including the temporary ones.
- `src/ui/board/Board.ts`: `startPassing()`, `autoPass()` (replaces the old `autoSkip()`),
  `stopPassing()`; dock buttons `pass-until`, `passing`, `stop-pass`; menu items `pass:<target>`.
- `BoardHooks.setTemporaryStops()`, wired in `src/ui/Overlay.ts`.

## Limits

- With more than two players, *End of opponent's turn* stops at any opponent's end step, not only
  the one right before yours.
- Endstep's *until an opponent acts* mode isn't offered: every mode here already stops when an
  opponent casts or activates something.
