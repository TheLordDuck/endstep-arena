# t4-5 · The buttons on the right in Arena's order, colors and words

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 4 · Comfort and settings](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-13 |

In Arena the main button always sits at the bottom, in the same place; the alternative goes above it, and under it only a small line saying where it goes next and the » that passes the turn. Some of the board's buttons were the other way round, which was confusing. Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What existed before

The dock stacked its buttons bottom-up (`column-reverse`), so for attacking and the stack the secondary button ended up at the bottom: "No attacks" over "All attack", "Resolve" over "Resolve all". Labels were "Attack · N", "Block · N", "Done · N"; "End turn" was a button under the main one.

## What was done

- `renderDock()` in `src/ui/board/Board.ts` lays out, top to bottom: the board's own extras (Pass until…, Hold priority, Undo), the alternative (blue: No Attacks, Cancel, Decline; outlined: Resolve All, Cancel Attacks, Cancel Blocks), the main button, then the next stop ("To Combat", "To Blockers", "To Damage") centered under it and the » on a row of its own.
- Arena's words: All Attack / *N* Attackers, *N* Blockers / No Blocks, Submit *N*, Auto Pay, End Turn, Opponent's Turn (a dark pill with an hourglass).
- Colors: the main button orange, red through blocks and damage, the alternative blue.

## Done when

- The harness's attack, block, stack, target, priority and wait scenarios match Arena's screenshots.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-13: done.
