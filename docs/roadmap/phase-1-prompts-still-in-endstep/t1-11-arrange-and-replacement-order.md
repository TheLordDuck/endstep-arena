# t1-11 · Ordering cards to the bottom, graveyard or exile, and replacement effects

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 1 · Prompts still answered in Endstep's UI](README.md) |
| Type | Fix |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-19 |

A check of every mechanic against Arena: each prompt type Endstep sends is drawn by the board. Two of them said the wrong thing.

## What existed before

- `ARRANGE_CARDS` with a context other than scry, surveil or the top of the library (`library_bottom`,
  `graveyard`, `exile`, `battlefield`) showed a pile called "Order" with the first card tagged
  *Next*. Going to the bottom, Endstep's first card is the one closest to the bottom.
- `ORDER_ABILITIES` with `contextType: "replacement"` was titled "Order Triggers", "Resolves first".

## What was done

- `ARRANGE_ZONES` in `src/ui/board/Board.ts`: each context has its own pile name (Bottom of
  Library, Graveyard, Exile, Battlefield), first tag (*Bottom* or *1st*) and instructions, as in
  Endstep's own box.
- Replacement effects: "Order Replacement Effects", "Applies first / Applies last".
- The first card's tag sits in the part of the card that shows, not under the next card.

## Done when

- Harness: `#arrange-bottom`, `#replacement`. Seen in a real match: see t1-12.

## History

- 2026-10-19: added to the roadmap as done.
