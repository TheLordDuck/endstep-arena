# t2-2 · Projectile to the target

| | |
| --- | --- |
| Status | **Approved** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-07 |

A spell or ability that deals damage sends a flash to its target, with the impact and the damage (Lightning Bolt to the face).

## What exists now

A spell or ability dealing damage shows nothing between source and target; only life or damage changes.

## What it involves

- A flash from the stack to the target, with the impact and damage, reusing `impactAt` and `wound` from the combat strike.
- Knowing what damaged whom: Endstep's `CARD_DAMAGED` / `PLAYER_DAMAGED` events, or the difference in life and damage between states.

## Done when

- Lightning Bolt at a player or a creature visibly flies and hits.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: approved.
