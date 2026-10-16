# t3-17 · Library and graveyard without labels, by the portrait

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

A visual change to something that exists. Arena has no labels: the library is a sleeved deck by the player's plate, the graveyard a face-up card beside it, and exile only shows when something is in it; the numbers are in the count panel ([t3-10](t3-10-zone-counts.md)) and on hover (I3hPJQyUBV4 6:25, wdHAGKuvIpg 18:05).

## What existed before

Piles labelled LIBRARY, GRAVEYARD, EXILE and COMMAND, with count bubbles.

## What was done

- The piles carry no labels or count bubbles; hovering one gives its name and count (and "click to look" where it opens). The counts are in the zone counts row ([t3-10](t3-10-zone-counts.md)).
- An empty exile pile isn't shown.
- Commit `e4318aa`.

## Done when

- The piles read as in Arena, and hovering one names it.
- Harness scenario `info`. Checked in the harness, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`e4318aa`).
