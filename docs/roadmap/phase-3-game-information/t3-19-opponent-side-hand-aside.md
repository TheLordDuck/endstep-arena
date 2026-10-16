# t3-19 · The opponent's off-hand cards, to one side

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-16 |
| Done on | 2026-10-16 |

Asked for by the user. The cards the opponent can play from outside their hand ([t3-5](t3-5-opponent-off-hand-playables.md)) should sit to the left or right of the opponent, as yours sit to one side of your hand.

## What existed before

They peek out at the top centre, beside the opponent's hand (commander, flashback, escape, adventure tags), over the opponent's step track and life total. Yours sit at the bottom right, beside your hand.

## What was done

- They hang at the top left, between the opponent's name and their step track, as yours sit to one side of your hand; the room is measured on screen (the step track's first step and the name's plate), and many cards overlap to fit it.
- The zone tags, the glow and the slide-down on hover are kept.

## What it involved

- Move the opponent's strip to one side of the table (left or right of the opponent), mirroring yours, without covering the step track, the life total, the piles or the zone counts.
- Keep the zone tags and the hover zoom.

## Done when

- In harness `oppside`, the opponent's off-hand cards sit to one side, covering nothing.
- Checked in the harness (`oppside`), not yet in a live match.

## History

- 2026-10-16: added to the roadmap at the user's request, approved.
- 2026-10-16: done.
