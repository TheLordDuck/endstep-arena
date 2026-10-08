# t3-4 · Who has priority and what we're waiting for

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | No |
| Done on | 2026-10-08 |

Make clear whether we're waiting for the opponent, for the stack, or for a decision of yours, instead of a single "Waiting…".

## What existed before

When it wasn't your move, the board showed a single "Waiting for opponent…" / "Opponent's turn".

## What was done

- When you have nothing to answer, the board says who the game waits on and for what. It reads
  the state, since Endstep's own UI only says "Opponent is deciding…":
  - "Opponent can respond to Lightning Bolt": your spell is on the stack and they have priority.
  - "Opponent has priority · Shock on the stack", or "· Main 1" with an empty stack.
  - "Opponent is declaring attackers" / "is declaring blockers" (the combat step, whose turn it is).
  - "Opponent is deciding": their idle timer runs but priority isn't theirs, so it's a choice of
    theirs (discarding, targets…). Endstep doesn't say which one.
  - "Resolving Opt…": nobody else to wait for, with something on the stack.
- The disabled action button sums it up ("Opponent's priority", "Opponent blocking"…), and the
  picture of the player waited on glows.
- Spectating, both sides are named.
- Code: `src/game/waiting.ts` (`waitingFor()`); `Board.ts` uses it in the prompt area, the dock and
  the plates; `.msg.wait`, `.life-orb.waited` in `src/styles/board.css`.

## Done when

- It's always clear why you're waiting. Harness: `#wait-respond`, `#wait-blockers`,
  `#wait-deciding`. Tests: `tests/waiting.test.ts`.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-08: done.
