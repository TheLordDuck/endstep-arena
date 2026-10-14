# t2-23 · Abilities on the stack in Arena's ability frame

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

A visual change to something that exists. Arena draws an ability on the stack in a frame of its own: the art on top, the word "Ability" and the ability's text on a plate whose bottom ends in an arch (like a shield), in the card's color (jHPVD5KdP1g 27:25, uWM-bAuJVaU 16:05, a2dMvbEqDwY 22:05, ezOhWpWuol0 15:25). A planeswalker's carries its cost at the bottom (see [t2-19](t2-19-loyalty-costs.md)).

## What existed before

The source card with a "Triggered ability" ribbon and the text on a parchment.

## What was done

- `abilityFrameHtml()` in `src/ui/board/Board.ts`: the source's `art_crop` with its name, an "Ability" band and the text on a plate of the card's color whose bottom is an arch, and the loyalty badge when there is one.
- The text is the ability as printed when Endstep sends it (`yieldKey`, kept as `abilityText`), else Endstep's description without its card ids and its "[Player: …, Amount: …]" notes.
- Used on the stack, in the magnifier (where each item's text starts on the left, since the next item covers its right half) and in the order box for triggers ("Optional" over the ones that can be skipped).

## Done when

- Checked in the harness: `stack`, `stack7` (and its magnifier), `order`, `ability-frames` and `pw-stack`.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done.
