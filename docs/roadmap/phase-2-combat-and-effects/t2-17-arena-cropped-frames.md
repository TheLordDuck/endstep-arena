# t2-17 · Permanents in Arena's cropped frame

| | |
| --- | --- |
| Status | **Awaiting approval** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |

On Arena's table a permanent isn't the whole card: it's the cropped art with the name on a bar at the top and power/toughness at the bottom right; creatures sit in a frame arched at the top, lands, artifacts and enchantments in a rectangle. More fit, and they read better from afar. Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What exists now

The board draws each permanent's full card image.

## What it involves

- Use the `art_crop` image (`imageUrl()` already supports it), draw the frame in CSS, keep the full card for hover and right-click.
- It touches piles, attacks and counters: go over the harness scenarios.

## Done when

- Every permanent on the table shows in the cropped frame, and hover still shows the full card.

## History

- 2026-10-13: added to the roadmap.
