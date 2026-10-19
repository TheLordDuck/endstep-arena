# t4-8 · Endstep's menu items, on the board

| | |
| --- | --- |
| Status | **Approved** (in progress: 5 of 8) |
| Phase | [Phase 6 · Later](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-16 |

Asked for by the user. The table menu (right-click the table) no longer shows Endstep's items that opened its own UI over the board: Show decklist, Auto-yields, Settings, Keyboard shortcuts, Report a problem, Report stalling, Reload and Record a macro.

## What existed before

The menu had the game log, this board's settings and shortcuts, and Concede (game or match). The code that opens Endstep's items is still there (`runTableItem`); `openTableMenu` in `src/ui/board/Board.ts` filters them out.

## Done so far (2026-10-16, not yet in a live match)

- **Show decklist:** the deck you registered, from Endstep's match info (`GET /api/matches/:id`), with each card's cost and type (`POST /api/cards/batch`), shown with the cards' pictures as the sideboarding screen shows a deck (main deck by mana value, sideboard and commander beside it, ×N per card), only to look at; pointing at a card shows it big (`src/game/endstep/decklist.ts`).
- **Reload:** reloads the page.
- **Keyboard shortcuts:** the board's list ends with Endstep's keys and your rebinds (`src/ui/board/endstepKeys.ts`).
- **Report a problem** and **Report stalling** (2026-10-19, not yet in a live match): back in the menu (when Endstep offers them), as the board's own form in its style: kind (bug or suggestion) or the player who stalls (from the match's participants, `GET /api/matches/:id`), what happened, up to 6 images (chosen or pasted), and diagnostics (the page, the browser, a summary of the game, this extension's version). Sent as Endstep's form sends it, `POST /api/bug-reports` (`src/game/endstep/reports.ts`). Endstep's automatic screenshot of its page isn't taken; images are added by hand.
- Still left out: Auto-yields (Endstep keeps that state itself and sends it), Settings (Endstep's own), Record a macro.

## What it involves

- Each item made on the board, in its style, one by one; then let it through the filter again.

## Done when

- Every item of Endstep's menu works without leaving the board.

## History

- 2026-10-16: added to the roadmap at the user's request, once the items were taken out of the menu.
- 2026-10-16: approved; decklist, reload and keyboard shortcuts done on the board.
- 2026-10-16: moved to Phase 6 · Later (to be done in the future).
- 2026-10-19: Report a problem and Report stalling done.
