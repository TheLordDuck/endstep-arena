# Choosing from the opponent's hand

| | |
| --- | --- |
| Status | **Done** (2026-10-07, release 0.5.0) |
| Verified in a real match | No: reported "not working" with Thought-Knot Seer before the second fix; see roadmap [t0-2](../roadmap/phase-0-finish-open-work/t0-2-verify-in-real-match.md) |

Thoughtseize, Duress, Thought-Knot Seer and the like: the opponent reveals their hand and you pick
a card for them to discard or for you to exile.

## Before

The card was picked by clicking it right on the opponent's hand at the top of the table, as if it
were your own.

## Now

- A "Choose a Card" / "Choose Target" screen with the cards to pick from in a fan, as when picking
  from a graveyard or library, with the card that asks on the right, and *Submit*.
- While picking, the opponent's hand on the table neither lights up nor takes clicks.
- When you control the opponent's turn (Emrakul, the Promised End), you still play straight from
  their hand, as before.
- Works whether Endstep asks with `CHOOSE_CARDS` or `CHOOSE_TARGETS`. Its client handles the prompt
  generically, so which one Thought-Knot Seer uses isn't known.
- When the prompt only carries card ids, the fan uses the full cards the board already knows
  (name, picture).

## Implementation

- `src/ui/board/modes.ts` → `battlefieldIds()`: only your hand, and the hand of a player whose turn
  you control, count as the table. A `CHOOSE_CARDS` option in an opponent's hand makes the mode
  `offBoard`, which is what brings up the fan.
- `src/ui/board/Board.ts`:
  - `choiceInFan()` decides whether a prompt is answered in a fan: `cards` with `offBoard`, or
    `targets` / `cards` with an option that isn't on the table (in a pile or in an opponent's hand).
  - `pickedInFan()` keeps the opponent's hand from being selected or highlighted while the fan is up.
  - Fan cards come from `cardData` when the board has them.

## Tests

- `#discard`: Thoughtseize as `CHOOSE_CARDS`, the opponent's hand as placeholders. Griselbrand is
  picked in the fan and `CHOOSE_CARDS [2000]` is sent.
- `#tks`: Thought-Knot Seer as `CHOOSE_TARGETS`, the opponent's hand face up, options with ids only.
  `CHOOSE_TARGETS [<id>]` is sent.
- `tests/interaction.test.ts`: an opponent's hand goes in a fan; yours, and a hand you control, don't.
