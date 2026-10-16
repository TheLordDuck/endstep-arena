# t4-6 · Pass until my turn during the opponent's

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 4 · Comfort and settings](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

On the opponent's turn Arena keeps the blue ⏩ button under the main one, which passes priority until your turn ("My Turn"; "End Turn" on your own; I3hPJQyUBV4 45:25).

## What existed before

» only on our turn, and Pass until… with combat, end step and the opponent's end step.

## What was done

- In the opponent's turn a blue ⏩ button under Pass passes until your turn, and the Pass until… menu has "My turn" (`myTurn` in `src/game/passUntil.ts`). It stops like the other passes when the opponent casts something or you're asked something.
- On the way: an attacker you block comes out of its pile at once; the combat arrows go away once blocks are declared; Endstep's match win/loss sound waits for the board's result screen.
- Commit `6724644`.

## Done when

- On the opponent's turn one button passes until ours, and it stops for anything that needs us.
- Harness scenario `oppturn`. Checked in the harness, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`6724644`).
