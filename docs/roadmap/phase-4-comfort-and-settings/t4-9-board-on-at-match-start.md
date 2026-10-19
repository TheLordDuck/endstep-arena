# t4-9 · The board turns on when a match starts

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 4 · Comfort and settings](README.md) |
| Type | Feature |
| Needs approval | No |
| Done on | 2026-10-19 |

Asked for by the user.

## What existed before

Turned off (Alt+Shift+A or the pill), the board stayed off for every later match until turned on again.

## What was done

- Each new match turns the board on, even if it was off (`Overlay.onMatch`).
- It stays on for every game of that match unless turned off again; reloading the page mid-match counts as the match starting.

## History

- 2026-10-19: asked for and done.
