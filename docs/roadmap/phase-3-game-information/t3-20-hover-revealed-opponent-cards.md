# t3-20 · Hovering the opponent's revealed cards

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Fix |
| Needs approval | No |
| Done on | 2026-10-19 |

Asked for by the user. The cards you know in the opponent's hand (revealed by Thoughtseize, Duress…) should show big when you point at them.

## What existed before

The hover zoom was there, but the pointer never reached them: the box of the opponent's off-hand cards (`.opp-side`, in the same row) covered their top, and the step track their bottom.

## What was done

- That box lets the pointer through; only its cards take it.
- The known card that slides down when pointed at comes up over the table (step track, life), as your hand's raised card does.

## Done when

- In harness `reveal`, pointing at a known card of theirs shows it big beside it.
- Checked in the harness, not yet in a live match.

## History

- 2026-10-19: asked for and done.
