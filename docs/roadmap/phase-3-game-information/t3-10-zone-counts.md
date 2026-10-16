# t3-10 · Each player's zone counts

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

Arena has, for each player, a small panel with how many cards they have in hand, library, graveyard and exile: the opponent's at the top right, yours at the bottom left; hovering the library enlarges it (wdHAGKuvIpg 18:05, oKhLGseypS4 13:45, I3hPJQyUBV4 6:25).

## What existed before

The library's count on its pile, and a ✋ chip with the opponent's hand.

## What was done

- Each player has a row of four counts with icons under their piles: cards in hand, library, graveyard and exile, each with a title on hover. It replaces the opponent's ✋ chip.
- Commit `e4318aa`.

## Done when

- Both players' four counts read at a glance.
- Harness scenario `info`. Checked in the harness, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`e4318aa`).
