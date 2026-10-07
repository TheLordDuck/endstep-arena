# Choosing a pile

| | |
| --- | --- |
| Status | **Done** (2026-10-07, roadmap [t1-4](../roadmap/phase-1-prompts-still-in-endstep/t1-4-choose-pile.md)) |
| Verified | In the harness (`#piles`) and unit tests |

Fact or Fiction and the like (`CHOOSE_PILE`): the two piles side by side, full screen, each with
its cards, instead of text buttons.

## Use

- Each pile is a framed panel: its name, how many cards, and the cards. Cards you can't see are
  shown face down.
- Click a pile (it glows orange), then **Take Pile N**.
- Right-click a card to see it enlarged.

## Separating the piles

When an opponent casts Fact or Fiction, you make the piles. Endstep asks it as a plain
`CHOOSE_CARDS` (the cards picked are one pile, the rest the other), which the board used to show as
a fan to pick cards from. It's now shown as two piles, **Pile 1** and **Pile 2**, like scry: every
card starts in pile 2; click or drag a card to move it across; **Done · 2 | 3** sends pile 1's
cards. It's recognized by its message mentioning a pile, or by the card asking (Fact or Fiction,
Steam Augury, Epiphany at the Drownyard, Truth or Tale, Jace, Architect of Thought…:
`PILE_SPLITTERS` / `isPileSplit()` in `src/ui/board/modes.ts`). Harness: `#split`.

The exact message Endstep sends for this hasn't been seen yet: check it in a real match.

## Endstep's protocol

From Endstep's pile picker (2026-10-07): the prompt carries `piles: [{ id, label, size, cards[] }]`;
a pile may have fewer `cards` than `size` (the rest are face down to you). The answer is
`{ type: "CHOOSE_PILE", stringValue: <the pile's id> }`. A pile prompt without `piles` keeps the
old text buttons (`stringOptions`).

## Implementation

- `src/game/endstep/normalize.ts`: `toPile()` → `PendingActionView.piles`.
- `src/ui/board/modes.ts`: mode `piles` (`selected`).
- `src/ui/board/Board.ts`: `pilesBox()`; buttons `data-pile`, `data-pile-take`.
- CSS: `.piles-pick`, `.pile-pick`, `.pl-*`.
