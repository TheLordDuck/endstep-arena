# t3-8 · The token a card creates, when enlarging it

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-13 |
| Done on | 2026-10-13 |

When a card that makes tokens is enlarged, Arena shows a "Creates Token" box beside it with the token. Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What existed before

The enlarged card showed only itself, its counters, effects and keyword boxes.

## What was done

- `src/ui/board/relatedTokens.ts`: for a card whose text creates tokens (`createsTokens()`), its name is looked up on Scryfall (`/cards/named`, `all_parts`), once per card and session; up to three tokens, their images straight from Scryfall. Nothing is shown if Scryfall can't be reached, and it's asked again next time.
- `showZoom()` in `src/ui/board/Board.ts` leaves a `.ztok` box at the top of the side column (above the keyword boxes); `fillTokens()` fills it if that card is still the one shown.
- This is the first request the extension makes to a service other than Endstep; only the card's name is sent.
- Tests: `tests/relatedTokens.test.ts`.

## Done when

- Enlarging Raise the Alarm shows the Soldier token beside it (checked in the harness, with Scryfall's real data).

## History

- 2026-10-13: added to the roadmap.
- 2026-10-13: done.
