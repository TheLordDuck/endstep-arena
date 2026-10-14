# t2-22 · Target arrows as in Arena

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

A visual change to something that exists. In Arena target arrows are thin bright arcs of light (blue and white for spells and abilities, gold while choosing targets) that leave the card on the stack and land on the target with a flash, with particles running along them (jHPVD5KdP1g 33:25, wdHAGKuvIpg 48:45 violet for exile, a2dMvbEqDwY 59:45, 2vfZCj7n6QE 12:45).

## What existed before

Red lines with an arrowhead.

## What was done

- `drawArrows()` in `src/ui/board/Board.ts` draws every target as a beam: a high arc with a blurred glow, a core that brightens toward the target, sparks running along it and a ring of light opening where it lands. Blue for a spell or ability on the stack, violet when it exiles, gold while you choose targets or divide damage. Every beam's sparks keep one rhythm however often the arrows are redrawn.
- Attack and block arrows, and the dotted violet line from an ability to its source, keep their look. A divided spell's amount sits on its beam.
- With animations off, the sparks and the ring stand still.

## Done when

- Checked in the harness: `stack`, `counter`, `divided`, `fireball` and `modal`.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done.
