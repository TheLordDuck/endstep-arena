# t2-5 · Animate counters and power/toughness

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-07 |
| Done on | 2026-10-08 |

When +1/+1 or -1/-1 counters change, or power and toughness do, the number jumps and the change shows.

## What existed before

Counters and power/toughness changed without animation.

## What was done

- When a permanent's power or toughness changes, its badge jumps and the change floats up from the
  card: blue for a gain (`+1/+1`, like modified stats and +1/+1 counters), red for a loss (`-2/-2`).
- A counter pin whose count changed (any kind of counter) jumps too.
- Found by comparing the previous state with the new one. Counter pins carry `data-kind` for it.
- Code: `statChanges()` in `src/ui/board/Board.ts`; `counterPin()` in `src/ui/board/cards.ts`;
  `.stat-pop` in `src/styles/board.css`.

## Done when

- Every change of counters or power/toughness is visible. Harness: `#pump` (Tarmogoyf +1/+1, a
  +1/+1 counter on the Grizzly Bears, the Serra Angel -2/-2). Not seen in a real match yet.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: approved.
- 2026-10-08: done.
