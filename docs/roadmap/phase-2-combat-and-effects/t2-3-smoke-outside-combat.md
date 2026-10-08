# t2-3 · Smoke outside combat too

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | No |
| Done on | 2026-10-08 |

Creatures destroyed by spells or damage crumble into smoke where they stood, as in combat.

## What existed before

A creature destroyed outside combat slid straight from the table to its graveyard.

## What was done

- Any permanent that goes from the battlefield to a graveyard outside combat (Murder, a Bolt, a
  board wipe, a sacrifice), or a token that stops existing, stays in its place and crumbles into
  dark smoke there. Then it leaves the table and the cards beside it close the gap.
- When a spell's bolt is on its way to it, it crumbles as the bolt lands
  ([t2-10](t2-10-impacts-in-sync.md)). Otherwise it crumbles right away.
- Code: `captureDeaths()`, `linger()`, `crumble()` in `src/ui/board/Board.ts`; `.card.perishing`,
  `.card .smoke` in `src/styles/board.css`.

## Done when

- Creatures killed outside combat go up in smoke. Harness: `#murder`, `#spell-damage`, `#wrath`.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-08: done.
