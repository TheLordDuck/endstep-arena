# t2-2 · Projectile to the target

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-07 |
| Done on | 2026-10-08 |

A spell or ability that deals damage sends a flash to its target, with the impact and the damage (Lightning Bolt to the face).

## What existed before

A spell or ability dealing damage showed nothing between source and target; only life or damage changed.

## What was done

- When a spell or ability leaves the stack, a bolt of light flies from its place on the stack to
  each of its targets that lost life, took damage, or died. It lands with the combat strike's flash
  (`impactAt`), and a creature shows claw marks and the damage (`wound`). A player's picture
  flinches, and their plate already shows the life lost.
- Read from the states, not from events: the item left the stack, its text mentions damage (or
  isn't known), and the target changed. A divided spell uses each target's share. A creature that
  died of it shows what was left of its toughness, where it stood.
- Several targets are hit one after another; several items resolving at once go in turn.
- Code: `captureStackSpots()`, `spellHits()`, `shoot()` and `damagePop()` in
  `src/ui/board/Board.ts`; `.shot` in `src/styles/board.css`.

## Limits

- Only targets: damage to "each creature" (Pyroclasm) with no target shows nothing.
- A creature that died has no smoke yet: that's [t2-3](t2-3-smoke-outside-combat.md).

## Done when

- Lightning Bolt at a player or a creature visibly flies and hits. Harness: `#spell-damage` (Arc
  Lightning split between the Vampire Nighthawk, which dies, and the opponent; Lightning Bolt at the
  Serra Angel). Not seen in a real match yet.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: approved.
- 2026-10-08: done.
