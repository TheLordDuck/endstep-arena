# t3-7 · The opponent's mulligan status

| | |
| --- | --- |
| Status | **Awaiting approval** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |

On the mulligan screen Arena says what the opponent is doing: "Your opponent is waiting for their initial mulligan choice", "Your opponent kept a hand of 7 cards", and "Opponent goes first". Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What exists now

The screen only says "You go first" and asks the question.

## What it involves

- Under the title, what is known of the opponent (deciding / kept N cards / took a mulligan), from the `MULLIGAN` and `HAND_KEPT` events and their hand size.

## Done when

- The mulligan screen says when the opponent has kept, and with how many cards.

## History

- 2026-10-13: added to the roadmap.
