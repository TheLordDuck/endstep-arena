# t3-7 · The opponent's mulligan status

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

On the mulligan screen Arena says what the opponent is doing: "Your opponent is waiting for their initial mulligan choice", "Your opponent kept a hand of 7 cards", and "Opponent goes first". Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What existed before

The screen only says "You go first" and asks the question.

## What was done

- A line under the mulligan's heading says where the opponent is with their hand: still choosing, took N mulligans (to N) and choosing again, or kept a hand of N cards (`mulliganStatus()` in `src/ui/board/mulligan.ts`, from the `MULLIGAN` and `HAND_KEPT` events since their last settled hand).
- Your hand stays off the hand strip until you've kept it.
- Commit `6724644`.

## Done when

- The mulligan screen says when the opponent has kept, and with how many cards.
- Harness scenario `mulligan3`; `tests/mulligan.test.ts`. Checked in the harness and by unit tests, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`6724644`).
