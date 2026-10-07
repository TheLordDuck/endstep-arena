# Game and turn clocks

| | |
| --- | --- |
| Status | **Done** (2026-10-07, roadmap [t3-2](../roadmap/phase-3-game-information/t3-2-game-clocks.md)) |
| Verified | In the harness (`#clock`, `#clock-opp`) and unit tests; not yet in a timed real match |

Each player's time is shown by their picture, like Arena's timer: under the opponent's, above yours.

## What shows

- **Match clock** (when the match has one): the time left, `m:ss` (`h:mm:ss` from an hour). The
  player whose time is running is in gold; under 30 s it turns red and blinks; a player whose time
  ran out stays red.
- **Idle timer** (the "turn clock"): when Endstep warns that a player is taking too long, a second
  pill counts down to when they forfeit the match: *Act now* (you), *Deciding* (them), or
  *You're away* / *Away*. Gold at first, red in the last two stretches, blinking in the last one
  (Endstep's grace, 30 s by default).
- A replay shows the clocks as they were at that moment, not counting down.

## Endstep's fields

Read the way Endstep's own clock and idle banner read them (from its client bundle, 2026-10-07):

- `clock`: `{ serverNowMs, runningSide, runningSideDeadlineMs, remainingMs[], timedOutSide }`,
  sides being seat indexes as strings. Older states may send `player0RemainingMs` /
  `player1RemainingMs` instead of `remainingMs`. The running side's time is
  `runningSideDeadlineMs - now`; the other sides' is `remainingMs[seat]`.
- `idleTimeout`: `{ seat, deadlineMs, serverNowMs, away, graceMs }`.

Deadlines are on the server's clock. Like Endstep, the adapter keeps the largest
`serverNowMs - Date.now()` seen (a frame that took longer to arrive gives a smaller one) and moves
every deadline to our clock with it.

## Implementation

- `src/game/GameState.ts`: `ClockView`, `IdleView`, `clockLeft()`; `GameState.clock` / `.idle`.
- `src/game/endstep/normalize.ts`: `toClock()`, `toIdle()`; `FrameMeta.serverSkew` and `frozen`.
- `src/game/endstep/EndstepAdapter.ts`: `trackSkew()` keeps the skew per match; replays are `frozen`.
- `src/ui/board/Board.ts`: `renderTimers()` adds a `.timers` box (`.mclock`, `.idle`) to the life
  orb; one ticker (`timerTicker`, every 250 ms) updates the clocks and the lost-connection
  countdowns (`updateTimer()`, `clockText()`).
- `src/styles/board.css`: `.timers`; an opponent's lost-connection line moves down under it.

## Still to check

The shape comes from Endstep's client code, not captured traffic: check it in a timed match
(roadmap [t0-2](../roadmap/phase-0-finish-open-work/t0-2-verify-in-real-match.md)).
