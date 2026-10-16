# t3-6 · Maximum hand size warning

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

On your turn, with more than seven cards in hand, Arena shows by the hand: "You will need to discard down to 7 at the end of your turn". Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What existed before

No warning.

## What was done

- On your turn with more than seven cards, a pill over the hand says how many you'll discard at the end of the turn (`handLimitWarning()` in `src/ui/board/handLimit.ts`).
- None while you control a permanent that says "You have no maximum hand size" (Reliquary Tower, Thought Vessel…), nor when spectating.
- Commit `6724644`.

## Done when

- With nine cards in hand on your turn, the notice says you'll discard two.
- Harness scenario `handlimit` (nine cards: discard two); `tests/handLimit.test.ts`. Checked in the harness and by unit tests, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`6724644`).
