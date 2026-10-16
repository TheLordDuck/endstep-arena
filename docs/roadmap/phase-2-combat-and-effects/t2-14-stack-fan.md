# t2-14 · Look at the whole stack in a fan (magnifier)

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | No |
| Done on | 2026-10-13 |

Beside the stack's item count, Arena has a magnifier that lays out every item of the stack side by side, readable. Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What existed before

The stack shows `Stack · N`, a button to fold it away, and each item enlarged on hover. With seven triggers in a cascade only the top one reads well; the rest need a hover each.

## What was done

- On the table, the items under the next one fan out behind it to the left like a held hand, each turned a little more (before: a diagonal cascade, smaller at each step).
- A magnifier beside `Stack · N` (now on the pile's right) opens Arena's Stack view: every item upright in one overlapping row, the next to resolve on the right and in front, each rimmed in its controller's color, abilities with their kind and text, X when paid. Hovering one brings it whole into view.
- Closed with Done, Esc, the magnifier again or a click outside.
- Fixed on the way: the stack no longer collapses for a moment when an item resolves (the slide for moved cards animated `translate` to 0; it now slides to each card's own translate). Harness `?step=<ms>` sends a scenario's follow-up states that far apart.
- Commit `675f033`.

## Done when

- With seven items on the stack, the magnifier shows them all, readable.
- Harness scenarios `stack7` (seven items) and `stack-resolve`. Checked in the harness, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-13: done (`675f033`).
