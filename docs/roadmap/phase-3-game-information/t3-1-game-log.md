# t3-1 · Game log

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-08 |
| Done on | 2026-10-08 |

A collapsible side panel with what has happened (spells, combat, damage), and the cards highlighted on the table on hover.

## What existed before

The board had no log. Endstep has one, and its events already reached the adapter and the debug panel.

## What was done

- A panel down the left side of the table, opened with **L**, the **Log** button (top right) or
  the table menu, and remembered. One line per game event, newest at the bottom, with a line at
  each turn ("T6 · Your turn"). Each line has the mark and color Endstep's own log gives that
  kind of event, and a gold edge for yours or a red one for the opponent's.
- The text is Endstep's own (`message`), cleaned as its log cleans it (engine details, ids). Card
  names are in gold. Pointing at a line lights up its cards on the table, and pointing at a card
  name shows a picture of that card beside the log.
- New lines are added as they come. If you've scrolled up, the panel stays where it is.
- Replays have their log too: the events recorded in the `.esreplay` file, up to the frame shown,
  so it follows play, steps and seeks.
- Code: `toLogEntry()` in `src/game/endstep/normalize.ts`; the adapter keeps the match's log
  (each event once, a new one per match); `Replay.events` in `src/game/endstep/replay.ts`;
  `renderLog()`, `logRow()`, `bindLog()` in `src/ui/board/Board.ts`; `.log` in `src/styles/board.css`.

## Done when

- What happened in the game can be reviewed without leaving the board. Harness: `#log` with
  `?prefs={"logOpen":true}`. Not seen in a real match yet.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-08: approved and done.
