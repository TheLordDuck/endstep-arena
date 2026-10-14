# t2-24 · An illustrated table

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

A visual change to something that exists. In Arena every match has an illustrated, luminous battlefield (it changes in each of the 10 videos), and the cards stand out on it. Arena's can't be used.

## What existed before

A plain dark brown table.

## What was done

- **3D scenes** (`src/ui/board/scene/`, with three.js): the table is a scene seen almost from above, built the way Arena's battlefields are (studied in frames of LegenVD's videos): a floor with a large pattern, a band across the middle on the board's midline, a dais under each player's picture, tall scenery rising along the edges, lights with shadows, glowing things and drifting particles. Everything is modelled and drawn in code (canvas textures); nothing is downloaded.
- Five scenes, one per color: **Academy** (white: marble with gold arcs over teal glass, a walkway with gold trim, bookshelves and columns, sunbeams), **Glacier** (blue: ice with glowing knotwork, a ridge of clear ice, walls of crystal, snow), **Cathedral** (black: a slate lattice with lines of teal light, a checkered band, high walls of stained glass throwing colored light, candles, dust), **Forge** (red: basalt hexes with lava in the cracks, a river of lava, basalt cliffs, braziers, embers), **Garden** (green: hedges curling in 3D scrolls, a cobbled path, tall hedges with lanterns, corner stairs, glowing plants, fireflies).
- The scene follows the board: it's rebuilt when the board is resized or the midline or pictures move. It runs at most at 30 frames a second, pauses while the tab or the board is hidden, and stands still with animations off.
- Settings → Table: *Random* (default: a scene drawn for each match, kept for the whole match and never the last match's, `randomScene()` in `Board.ts`), *Deck's color* (the scene of your deck's main color, from `deckLand()` in `src/ui/board/tableArt.ts`, picked once a game), one of the five, or *Plain*. Without WebGL, or set to Plain, the table is a play mat on wood dyed in your deck's color with its basic land's art printed on it.
- Earlier versions the same day: the land's art blurred over the whole screen, then the play mat on wood; the user asked for proper 3D scenes like Arena's.

## Done when

- Checked in the harness (with SwiftShader for WebGL): `?prefs={"table":"<scene>"}` for each scene, and `keywords` (Islands: the Glacier). Not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done; then made 3D scenes.
