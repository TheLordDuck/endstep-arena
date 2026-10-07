# t2-1 · Spells travel when they resolve

| | |
| --- | --- |
| Status | **Approved** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-07 |

The card goes from the stack to the table (permanents) or the graveyard (instants and sorceries), as in Arena.

## What exists now

On resolving, the card vanishes from the stack and shows at its destination with the generic entry animation.

## What it involves

- Animate the card from its place on the stack to the table (permanents) or the graveyard (instants and sorceries).
- Reuse the FLIP mechanism `Board.ts` already uses to move cards between zones.
- Respect "reduce motion".

## Done when

- A resolved spell travels to its destination; tested with a new harness scenario.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: approved.
