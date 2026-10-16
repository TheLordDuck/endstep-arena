# t3-12 · The card's state in the hover boxes

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

Above the keyword boxes Arena shows the card's state: "Entered the Battlefield this turn.", "Entered the Graveyard this turn.", "Targeted By — Necromancy" (which spells or abilities on the stack target it), "Cost Modified — This spell's mana cost modified to 0" on cards in hand, and the flavor text last. Seen in I3hPJQyUBV4 10:45, jHPVD5KdP1g 11:45 and 33:45, ezOhWpWuol0 13:45.

## What existed before

None of it, though the board already knows what is summoning sick (`summoningSick`), what targets what (the stack's arrows) and the costs in hand.

## What was done

- Above the counter and keyword boxes, in blue, the card's state (`cardStateNotes()` in `src/ui/board/Board.ts`): "Entered the Battlefield this turn.", "Entered the Graveyard this turn." (the board notes the turn each card reaches a graveyard), "Targeted By" with the spells and abilities on the stack that target it, and "Cost Modified" for a card in your hand whose cast cost in the priority prompt differs from the printed one.
- No flavor text: Endstep doesn't send it.
- Commit `e4318aa`.

## Done when

- Enlarging a targeted or just-arrived card says so, as Arena does.
- Harness scenario `info` (Tarmogoyf entered this turn, the Serra Angel targeted by Lightning Bolt, an Opt just put into the graveyard). Checked in the harness, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`e4318aa`).
