# t2-8 · Toughness minus damage, in red

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-08 |

A creature with damage marked shows its toughness minus the damage, in red, as in Arena (a 4/4 Serra Angel with 3 damage reads 4/1), instead of a separate badge with the damage.

## What existed before

The P/T badge kept the full toughness, and the damage showed in a badge of its own.

## What was done

- `updateCardEl()` in `src/ui/board/cards.ts` writes the toughness left, as `i.hurt` (red, with the
  full toughness and the damage in its tooltip). A card without a numeric toughness keeps the damage badge.
- `.b.pt i.hurt` in `src/styles/board.css`.

## Done when

- A damaged creature shows what's left of its toughness in red. Harness: `#spell-damage`.

## History

- 2026-10-08: added to the roadmap as done.
