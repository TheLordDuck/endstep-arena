# t2-17 · Permanents in Arena's cropped frame

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

On Arena's table a permanent isn't the whole card: it's the cropped art with the name on a bar at the top and power/toughness at the bottom right; creatures sit in a frame arched at the top, lands, artifacts and enchantments in a rectangle. More fit, and they read better from afar. Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What existed before

The board drew each permanent's full card image, cropped to its top.

## What was done

- First every permanent showed its art crop in a colored frame with its name in a bar; seen on the table, the user preferred the old look. What stayed: **tokens in Arena's token frame** (`.arch`, set in `updateCardEl()` in `src/ui/board/cards.ts`), as in a screenshot of Arena the user gave: a dark card body with well-rounded top corners; in it a window arched on top with the token's `art_crop`, edged in a bright line of the token's color (silvery white, blue, black, red, green, gold for several, grey for none); power/toughness in a pale box at the bottom right (blue when changed). No name. Other permanents show the top of their card, as before.
- A card that changes picture keeps the old one until the new one has loaded, so it never blinks.

## Done when

- Tokens show in the arched art frame, everything else as before, and hover still shows the whole card. Checked in the harness with Scryfall's images (`horde`: 18 Soldier tokens).

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done; then reduced to tokens, without the name.
