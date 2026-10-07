# t2-3 · Smoke outside combat too

| | |
| --- | --- |
| Status | **To do** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |

Creatures destroyed by spells or damage crumble into smoke where they stood, as in combat.

## What exists now

Dying creatures only crumble into smoke in combat (`captureFallen` in `Board.ts`).

## What it involves

- Generalize `captureFallen` to any creature going from the battlefield to the graveyard (destroyed, sacrificed…).

## Done when

- A creature destroyed by a spell crumbles into smoke where it was.

## History

- 2026-10-07: added to the roadmap.
