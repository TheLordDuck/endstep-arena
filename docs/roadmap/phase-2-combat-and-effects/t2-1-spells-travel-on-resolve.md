# t2-1 · Spells travel when they resolve

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-07 |
| Done on | 2026-10-08 |

The card goes from the stack to the table (permanents) or the graveyard (instants and sorceries), as in Arena.

## What existed before

On resolving, the card slid from the stack to its destination in 320 ms and snapped to its new
size (a full card on the stack, a cropped permanent or a small pile card at the destination).

## What was done

- A full-size copy of the card, as the stack showed it, lifts off the stack in an arc and shrinks
  onto where the card went: its place on the battlefield, or the graveyard or exile pile (tilting
  a little as it's tossed onto a pile). The copy is cropped to the card's top as it shrinks, so it
  lands looking like the permanent. The card itself then takes over and settles in.
- It covers any spell leaving the stack for those places, so a countered spell flies to the
  graveyard too. Abilities, and spells going back to a hand or into the library, keep the plain slide.
- Nothing flies with "reduce motion", or when the stack is folded away.
- Code: `captureCasts()` and `flyFromStack()` in `src/ui/board/Board.ts`; `.card.flying` in
  `src/styles/board.css`.

## Done when

- A resolved spell travels to its destination; tested with the new harness scenarios `#resolve`
  (Baneslayer Angel onto the battlefield) and `#resolve-bolt` (the opponent's Lightning Bolt into
  their graveyard). Not seen in a real match yet: it relies on Endstep keeping the card's id from
  the stack to its new zone, as the harness does.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: approved.
- 2026-10-08: done.
