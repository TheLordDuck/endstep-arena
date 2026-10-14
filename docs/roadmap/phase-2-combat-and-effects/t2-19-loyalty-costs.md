# t2-19 · Loyalty cost on the stack, and impossible abilities in grey

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

Our planeswalker Choose One already put the cost (+2, −3, −4) in a badge, as Arena does. Arena also shows that badge on the ability once it's on the stack, and greys out the abilities it can't activate for lack of loyalty (I3hPJQyUBV4 6:05 and 25:05, a2dMvbEqDwY 22:05 and 34:05).

## What existed before

The stack showed a loyalty ability as Endstep words it, with no cost, and the Choose One offered only what Endstep sent.

## What was done

- On the stack, a loyalty ability carries its cost in a badge under its [ability frame](t2-23-ability-frame-on-stack.md): from the ability as printed (Endstep's `yieldKey`, "+1: …"), or, when Endstep only says what it does ("Jace (12) - Opponent draws three cards…"), from the planeswalker's line that says the same (`bestLine()` in `src/ui/board/abilityText.ts`).
- A planeswalker's Choose One shows all its loyalty abilities in printed order (`withLoyaltyLines()` in `Board.ts`): the ones Endstep offers as it offers them, the rest, and any costing more loyalty than it has, in grey and not clickable ("Not enough loyalty" / "Can't be activated now").

## Done when

- Checked in the harness: `pw` and `pw-click` (`?play=970`) show Garruk Wildspeaker at 3 loyalty with its −4 in grey; `pw-stack` shows Garruk's −1 (from its printed text) and Jace's 0 (from what it does) on the stack.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done.
