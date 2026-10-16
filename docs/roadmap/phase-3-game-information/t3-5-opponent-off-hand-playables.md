# t3-5 · Cards the opponent can cast from the graveyard or exile

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-14 |

Like your own side hand, show to the right of each opponent the cards they can cast from their graveyard or exile, so everything is visible at a glance.

## What existed before

Your playable cards outside the hand (flashback, escape, exile, top of library…) sit in the side hand next to yours (`renderSideHand()` in `src/ui/board/Board.ts`). It comes from the `playable` list of your own priority prompt, so nothing like it exists for opponents.

## What was done

- Beside the opponent's hand, a side strip like yours with what they can play from elsewhere: their commander, flashback, escape, jump-start, retrace, aftermath, disturb, unearth… in the graveyard, adventures and foretold cards in exile.
- Read from the cards themselves (`src/ui/board/oppCastables.ts`): only keyword abilities at the start of a line of the card's text count, so a card that merely mentions one (Snapcaster Mage) doesn't.
- Commit `a16aa76`.

## Done when

- An opponent's graveyard or exile cards that they can cast show next to their hand, and leave it when they no longer can.
- Harness scenario `oppside`; `tests/oppCastables.test.ts`. Checked in the harness and by unit tests, not yet in a live match.

## History

- 2026-10-12: added to the roadmap.
- 2026-10-14: done (`a16aa76`).
