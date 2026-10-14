# t2-21 · Orbs when gaining life

| | |
| --- | --- |
| Status | **Awaiting approval** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |

When a player gains life, Arena sends golden orbs flying from what gave it (the permanent that triggered, the spell) to their life total, which flashes (I3hPJQyUBV4 7:45, ezOhWpWuol0 15:05).

## What exists now

Only the number changes (and a green +N floats up).

## What it involves

- Use the life-gain event (or the difference in life between states) and its source from the log.
- Launch the orbs with the same machinery as the damage projectiles ([t2-2](t2-2-projectile-to-target.md)), at the animation speed from the settings.

## Done when

- Gaining life from a trigger or a spell shows orbs flying from it to the life total, which flashes.

## History

- 2026-10-13: added to the roadmap.
