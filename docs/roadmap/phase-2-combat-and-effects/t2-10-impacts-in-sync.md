# t2-10 · Damage and deaths as the blow lands

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-08 |

Life, damage and deaths change at the moment the combat blow or the spell's bolt lands, not before.

## What existed before

The new state showed at once: life totals, damage and dead creatures changed while the fight or
the bolt was still on its way, so the animation played over a result already shown.

## What was done

- **Held until the hit.** Before an update is drawn, the board works out what its animations
  will hit:
  - each life total keeps showing the old value until the blow or bolt that changes it lands,
    and then the loss or gain floats up;
  - a creature's damage (its red toughness) does the same;
  - other life the same spell changes (Swords to Plowshares' life gain, a drain) shows as its last
    hit lands;
  - nothing stays held more than 4 seconds.
- **Dead permanents linger.** A creature that dies stays in its place on the table (in combat
  too) until its blow or bolt lands, then crumbles into smoke there. The cards beside it close the
  gap only then.
- **Combat fights.**
  - The blocked attacker slams into its blockers.
  - A blocker that strikes back lunges at it as they clash, and the attacker takes its damage
    then.
  - Each creature crumbles right after the blow that killed it, not when the whole fight is over.
- **Bolts for every kind of removal:**
  - damage: a bolt of light (Lightning Bolt);
  - destroy: a dark bolt with a black-violet burst (Murder, Doom Blade);
  - exile: a pale violet bolt (Swords to Plowshares, Path to Exile). The creature stays until
    it's hit, then is drawn into the exile vortex.
- Code: `planHits()`, `planCombat()`, `hold()`, `release()`, `showLife()`, `playHits()`,
  `linger()`, `unlinger()`, `crumble()`, `lunge()` in `src/ui/board/Board.ts`; `.shot.destroy`,
  `.shot.exile`, `.impact.destroy`, `.impact.exile` in `src/styles/board.css`.

## Done when

- What a blow or a spell does shows when it lands. Harness: `#strike`, `#win`, `#spell-damage`,
  `#murder`, `#exile-creature`, `#wrath`. Not seen in a real match yet.

## History

- 2026-10-08: added to the roadmap as done.
