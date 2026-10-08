# t2-11 · Animation pace (against bots)

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-09 |

The game's states reach the board one by one, at a pace its animations can be seen at, so your own spells animate too when a bot answers at once.

## What existed before

The board was drawn once per animation frame with the latest state. A bot passes priority at
once, so your spell going on the stack and resolving came within milliseconds: the board only
ever saw "in your hand" then "resolved", with no flight from the stack, no bolt and no impact.
The opponent's spells did animate, because the game waited for you with them on the stack.
Combat against a bot could also skip "blockers declared".

## What was done

- `src/ui/StatePacer.ts`: the states go to the board in order, each drawn as it's handed over.
  - A state that brings something worth seeing (a spell or ability new on the stack, attackers
    or blockers declared, `needsDwell()`) stays on screen 0.45 s, divided by the animation speed.
  - The next state also waits for the board's animations to finish (`Board.busyUntil()`: a fight,
    a bolt, a card flying or crumbling, cards gliding), up to 2.5 s per state.
  - A choice of yours on screen never waits. Leaving the match, a replay (it has its own pace)
    and animations turned off show at once.
- The debug panel and the actions sent always use the latest state; only the board is paced.
- A card still gliding onto the stack is settled before it's measured, so the bolt and the flight
  leave from the stack, not from halfway.
- The harness also hands its states through the pacer. A scenario's step may return the next
  one, so several states can come in a row.

## Done when

- Against a bot, your own spells show on the stack, then fly and hit. Harness: `#bot-cast`.
  Tests: `tests/pacer.test.ts`. Not seen in a real match yet.

## History

- 2026-10-09: added to the roadmap as done.
