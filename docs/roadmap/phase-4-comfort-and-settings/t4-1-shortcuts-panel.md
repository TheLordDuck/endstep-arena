# t4-1 · Keyboard shortcuts panel

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 4 · Comfort and settings](README.md) |
| Type | Feature |
| Needs approval | No |
| Done on | 2026-10-08 |

Help listing the shortcuts that already exist (H, Space, R, arrows in replays, Alt+Shift+A…).

## What existed before

The shortcuts existed (H, Space, Enter, R, arrows in replays, Alt+Shift+A, Alt+Shift+D) but were only listed in the README.

## What was done

- **?** (or table menu → *Arena UI shortcuts*) opens the list, in the settings' full-screen style,
  grouped: any time (H, L, ?, Esc, Alt+Shift+A, Alt+Shift+D), choosing a number, dividing damage,
  watching a replay, and the mouse. **?** again, Esc or Done closes it.
- It notes that Endstep's own shortcuts keep working (its table menu lists them).
- Code: `renderShortcuts()` in `src/ui/board/Board.ts`; `.keys` in `src/styles/board.css`.

## Done when

- The shortcuts can be looked up from the board itself. Harness: `window.__board.renderShortcuts()`.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-08: done.
