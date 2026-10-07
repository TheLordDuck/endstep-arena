# Sideboarding screen

| | |
| --- | --- |
| Status | **Done** (2026-10-07, roadmap [t1-1](../roadmap/phase-1-prompts-still-in-endstep/t1-1-sideboarding.md)) |
| Verified | In the harness (`#sideboard`: clicks, drags, the discard question, the answer sent) and unit tests; not yet in a real best-of-three |

Between games of a best of three, sideboarding is done on the Arena board instead of stepping
aside to Endstep's window.

## What shows

- Title *Sideboarding for Game N* (or *Choose Commanders* for a commander swap).
- A status line: **Main 60/60** (red, with "· 1 short" / "· 2 over", when the size isn't
  allowed), the sideboard's count, whether the opponent is still editing or ready, and the time
  left to sideboard.
- **Main deck**: columns by mana value (*0–1*, *2*… *6+*), lands last, each with its count. Copies
  of a card make one stack with **×4** on it; every card in a column shows its top (name and cost),
  the last one whole.
- **Sideboard**: one column on the right, cheapest first.
- Right-click a card to see it enlarged (with its keyword boxes).

## Use

- **Click** a card: one copy goes to the other side. **Shift-click**: every copy.
- **Drag** a card onto the other side: one copy moves.
- **Confirm** sends the main deck; it's disabled while the size isn't allowed, with the reason
  beside it ("Move 1 more in from the sideboard.").
- **Keep current** plays the registered deck. With changes made, it asks first: *Discard your
  changes?* → **Go back** / **Discard changes**.
- After confirming: *Submitted. Waiting for your opponent.* and **Withdraw** to edit again.
- If Endstep reissues the prompt while you're editing (the opponent submits, say), your changes
  stay.

## Endstep's protocol

From Endstep's `SideboardViewBody` (2026-10-07):

- The prompt is `CHOOSE_CARDS` with `contextType: "sideboard"`: every card (main deck first) in
  `cardOptions`, the main deck's allowed size in `min` / `max`, and `sideboardState`:
  `{ mainCount, mode ("SIDEBOARD" | "COMMANDER_SWAP"), self, opponent ("EDITING" | "SUBMITTED"),
  sealed, deadlineMs }`.
- Cards are known by their **place in the list** (ids may repeat): the first `mainCount` (else
  `min`) are the main deck.
- Answers: `SIDEBOARD_SUBMIT` with `orderedCards` = the main deck's indexes in list order;
  `DECLINE` to keep the registered deck; `SIDEBOARD_WITHDRAW` to take a submitted deck back.

## Implementation

- `src/game/endstep/normalize.ts`: `toSideboard()` → `PendingActionView.sideboard` (cards with ids
  `sb:<index>`, `deadline` moved to our clock, `gameNumber` from `matchScore`).
- `src/ui/board/modes.ts`: mode `sideboard`; `sideboardStart`, `sideboardMove`, `sideboardCheck`,
  `sideboardChanged`, `sideboardStacks`, `deckColumns`, `manaValue`, `isLandCard`.
- `src/ui/board/Board.ts`: `sideboardBox()`, `sideboardClick()`, the `sbDrag` drag, buttons `data-sb`.
- `src/game/GameController.ts`: `submitSideboard()`, `withdrawSideboard()`; both actions added to
  `ALLOWED_ACTIONS`.
- CSS: `.sb-*`.

## Limits

- No search box or other layouts (Endstep has list and gallery views).
- *sealed* (sealed / draft pools) isn't treated differently.
