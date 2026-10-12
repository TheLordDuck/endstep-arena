# t3-5 · Cards the opponent can cast from the graveyard or exile

| | |
| --- | --- |
| Status | **To do** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |

Like your own side hand, show to the right of each opponent the cards they can cast from their graveyard or exile, so everything is visible at a glance.

## What exists now

Your playable cards outside the hand (flashback, escape, exile, top of library…) sit in the side hand next to yours (`renderSideHand()` in `src/ui/board/Board.ts`). It comes from the `playable` list of your own priority prompt, so nothing like it exists for opponents.

## What it involves

- A side strip to the right of each opponent's hand, with the same look and zone tags as yours.
- Endstep only sends the playable list to the player who has to decide, so for opponents it has to be worked out from the cards: keywords (flashback, escape, unearth, retrace…) and effects that let an exiled card be cast (adventure, foretell, impulse draw…).
- Harness scenario and tests for the cards it picks.

## Done when

- An opponent's graveyard or exile cards that they can cast show next to their hand, and leave it when they no longer can.

## History

- 2026-10-12: added to the roadmap.
