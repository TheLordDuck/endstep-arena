# t2-14 · Look at the whole stack in a fan (magnifier)

| | |
| --- | --- |
| Status | **To do** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | No |

Beside the stack's item count, Arena has a magnifier that lays out every item of the stack side by side, readable. Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What exists now

The stack shows `Stack · N`, a button to fold it away, and each item enlarged on hover. With seven triggers in a cascade only the top one reads well; the rest need a hover each.

## What it involves

- A magnifier button beside `Stack · N` that opens the items in a fan, like the graveyard viewer, in resolution order with the next one marked.
- Closed with ✕, Esc or the magnifier again.
- Harness: `stack` with seven items.

## Done when

- With seven items on the stack, the magnifier shows them all, readable.

## History

- 2026-10-13: added to the roadmap.
