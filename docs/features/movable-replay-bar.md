# Movable replay bar

| | |
| --- | --- |
| Status | **Done** (2026-10-07, release 0.5.0) |
| Verified | In the harness (`#replay`) |

The replay controls (previous/next, play, position, speed, leave) sat fixed at the top center, over
the opponent's hand. They can now be moved.

## Use

- A grip **⠿** on the bar's left: drag it to move the bar.
- The position is remembered in the browser (`localStorage`, key `endstepArena.replayBar`), across
  reloads and replays.
- It's kept as a share of the board, so after a window resize the bar keeps its place and stays
  whole on the board.
- Double-click the grip: back to top center, and the saved position is forgotten.
- Only the grip drags; the buttons and the position slider work as before.

## Implementation (`src/ui/board/Board.ts`)

- `renderReplayBar()` adds the grip (`.rb-grip`) and calls `bindReplayDrag()` once.
- `bindReplayDrag()`: `pointerdown` with pointer capture on the grip; `pointermove` turns the top
  left corner into a share of the board; `pointerup` saves it.
- `placeReplayBar()` places it in pixels, kept on the board. It runs on every render and from the
  board's `ResizeObserver`.
- `readReplayBarAt()` reads the saved position; every storage read and write is in `try/catch`.
- CSS: `.replay-bar.moved` (no centering), `.replay-bar.dragging`, `.rb-grip`.

## Tests

`#replay`: the bar was dragged to the bottom left, the page reloaded, and it was still there.
