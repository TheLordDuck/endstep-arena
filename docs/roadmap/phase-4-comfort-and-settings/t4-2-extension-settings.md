# t4-2 · Extension settings

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 4 · Comfort and settings](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-08 |
| Done on | 2026-10-08 |

Animation speed, turning animations off, and card size.

## What existed before

The extension only stored whether it was on and the debug panel (`src/content/settings.ts`).

## What was done

- **Arena UI settings** in the table menu (right-click the table) opens a full-screen panel in
  the board's style:
  - Animations: on or off. Off works like the system's "reduce motion": nothing moves.
  - Animation speed: slow (0.75×), normal, fast (1.5×) or very fast (2.5×).
  - Card size: small, normal, large or extra large (battlefield and hands; rows still shrink to fit).
  - Sounds on or off, and their volume (see [t4-3](t4-3-sounds.md)).
- Stored with the extension's settings in `chrome.storage` (`Settings.prefs`), so they apply to
  every game. Values that are missing or out of range fall back to their defaults.
- Speed: every animation on the board plays at the chosen rate (CSS ones too), and the timers
  that pace a combat strike or a spell follow it.
- Code: `src/ui/board/prefs.ts`; `applyPrefs()`, `renderSettings()`, `later()`, `syncSpeed()`
  in `src/ui/board/Board.ts`; `.settings`, `.seg`, `.board.still` and `--cs` in `src/styles/board.css`.

## Done when

- Settings are changed from the board and remembered. Harness: `?prefs={…}` starts with other
  settings, and `window.__board.renderSettings()` opens the panel.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-08: approved and done.
