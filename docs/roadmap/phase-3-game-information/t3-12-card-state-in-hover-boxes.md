# t3-12 · The card's state in the hover boxes

| | |
| --- | --- |
| Status | **Awaiting approval** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |

Above the keyword boxes Arena shows the card's state: "Entered the Battlefield this turn.", "Entered the Graveyard this turn.", "Targeted By — Necromancy" (which spells or abilities on the stack target it), "Cost Modified — This spell's mana cost modified to 0" on cards in hand, and the flavor text last. Seen in I3hPJQyUBV4 10:45, jHPVD5KdP1g 11:45 and 33:45, ezOhWpWuol0 13:45.

## What exists now

None of it, though the board already knows what is summoning sick (`summoningSick`), what targets what (the stack's arrows) and the costs in hand.

## What it involves

- Add those lines to the boxes, and the flavor text if Endstep sends it.

## Done when

- Enlarging a targeted or just-arrived card says so, as Arena does.

## History

- 2026-10-13: added to the roadmap.
