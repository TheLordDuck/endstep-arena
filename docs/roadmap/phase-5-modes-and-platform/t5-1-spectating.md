# t5-1 · Spectating with the Arena board

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 5 · Modes and platform](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-08 |
| Done on | 2026-10-08 |

Watch other people's games with the extension's board.

## What existed before

Whether spectating used the same route and messages was unknown. It doesn't use the same
route: it's `/spectate/:id` (and `/admin/spectate/:id`), with `?as=<player>` to watch from that
player's side. It does use the same component (`GameView` with `spectate`) and the same socket
frames (`GAME_STATE` / `GAME_DELTA` with `viewerSeat`). See
[ENDSTEP_ANALYSIS.md](../../ENDSTEP_ANALYSIS.md#10-spectating-and-the-game-log-from-main-bqz4euhnjs--gameview-cwl0jtujjs-2026-10-08).

On those pages the board already drew the game, but as if it were yours: the pass buttons, the
prompts and "Your turn" were there, and it followed any match's frames.

## What was done

- The adapter knows the spectate routes: it follows only that match and marks the state
  `spectating`.
- Nothing is sent: the controller, "pass until" and the phase stops stay quiet, as in a replay.
  The dock has no buttons and the prompt area no "Waiting for opponent…".
- A **Spectating · Leave** pill top center. Leave uses Endstep's own "Stop spectating" button.
- Turns are named ("Opponent's turn", "Flavio's turn"), never "Your turn", and the result reads
  "<name> wins" instead of Victory/Defeat (no win/lose sound).
- If the hand of the side you watch from isn't shown to you, its backs are drawn.
- What changes from replays: a replay is a file played locally, with its own bar to play, step
  and seek. Spectating is a live game coming over the socket. It has no controls of its own,
  only the way out, and it can't be answered.
- Code: `isSpectatePath()` and `matchIdFromPath()` in `src/game/endstep/EndstepAdapter.ts`;
  `GameState.spectating`; `renderSpectateBar()` in `src/ui/board/Board.ts`; `leaveSpectate` in
  `src/ui/Overlay.ts`.

## Done when

- Someone else's game can be watched with the Arena board. Harness: `#spectate`. Not seen live
  yet: what `viewerSeat` and the hands look like for a spectator still has to be checked with the
  debug panel.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-08: approved and done.
