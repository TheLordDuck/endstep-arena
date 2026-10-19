# t3-21 · Your off-hand cards, always beside your hand

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-19 |
| Done on | 2026-10-19 |

Asked for by the user. The cards you could play from outside your hand should always sit to the right of it, a little grey while you can't play them.

## What existed before

Only the cards Endstep offered at that moment (with priority) showed there; the rest appeared and disappeared.

## What was done

- Beside your hand: what Endstep offers now, and what could be played from another zone (your commander, flashback, escape… in the graveyard, adventure, foretell, plot in exile), read from the cards as the opponent's are ([t3-5](t3-5-opponent-off-hand-playables.md)).
- The ones you can't play right now, a little grey.
- Grouped by zone, in their zone's order, so they don't change places when they become playable or stop being.
- Not during the mulligan, nor while spectating.

## Done when

- In harness `sidegrey`, Faithless Looting (castable) is lit; the commander, Lingering Souls and an adventure in exile are grey.
- Checked in the harness, not yet in a live match.

## History

- 2026-10-19: asked for, approved and done.
