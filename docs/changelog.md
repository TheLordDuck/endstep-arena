# Changelog

## Session of 2026-10-07, evening

On top of `368c60f Docs: roadmap, t0-2 done`. All 89 tests pass (11 new).

1. **Sideboarding screen** (roadmap t1-1): sideboarding between games is done on the board, no
   longer in Endstep's window. See [features/sideboarding.md](features/sideboarding.md).
2. **Choosing a pile** (roadmap t1-4): Fact or Fiction's piles side by side with their cards; and
   when an opponent casts it, you separate the cards into two piles (drag or click) instead of
   picking cards from a fan. See [features/choose-pile.md](features/choose-pile.md).
3. **Piles of four**: identical permanents (basic lands, tokens) pile up to four; more make
   another pile beside it (9 Mountains: ×4, ×4 and one) instead of one tall pile
   (`MAX_PILE` in `renderBattlefield()`). Harness: `#copies`.
4. **Roadmap**: t0-2 (marked done by the user), t1-1 and t1-4 done in the tracker;
   [roadmap/](roadmap/README.md) regenerated.

### Files changed

| File | Change |
| --- | --- |
| `src/game/GameState.ts` | `PileView`, `SideboardView`; `PendingActionView.piles` / `.sideboard` |
| `src/game/endstep/normalize.ts` | `toPile()`, `toSideboard()`; `toPending()` gets the frame's skew and raw state |
| `src/game/GameController.ts` | `submitSideboard()`, `withdrawSideboard()` |
| `src/shared/protocol.ts` | `SIDEBOARD_SUBMIT`, `SIDEBOARD_WITHDRAW` allowed |
| `src/ui/board/modes.ts` | Modes `piles` and `sideboard`, the sideboard's pure functions; `isPileSplit()` (separating piles shown as two piles) |
| `src/ui/board/Board.ts` | `pilesBox()`, `sideboardBox()`, clicks and drags; `startTimerTicker()` |
| `src/styles/board.css` | `.piles-pick`, `.pile-pick`, `.sb-*` |
| `src/dev/harness.ts` | Scenarios `piles`, `split`, `sideboard`, `copies` |
| `tests/piles-sideboard.test.ts` | New: 11 tests |
| `docs/`, `README.md` | This documentation |

## Session of 2026-10-07, afternoon

On top of `87da178 Docs: roadmap after the 0.5.0 release`. All 78 tests pass (20 new).

1. **Game and turn clocks** (roadmap t3-2): each player's match clock and idle timer by their
   picture. See [features/game-clocks.md](features/game-clocks.md).
2. **Keyword glossary** (roadmap t3-3): boxes beside an enlarged card explaining its keywords. See
   [features/keyword-glossary.md](features/keyword-glossary.md).
3. **Pass until…** (roadmap t4-4): pass priority until combat, the end step, the opponent's end
   step or your next turn. *End turn* now uses the same mechanism. See
   [features/pass-until.md](features/pass-until.md).
4. **Roadmap**: t3-2, t3-3 and t4-4 marked done in the tracker; [roadmap/](roadmap/README.md)
   regenerated from it (it also picks up t2-2, t2-4 and t2-5, approved earlier).

### Files changed

| File | Change |
| --- | --- |
| `src/game/GameState.ts` | `ClockView`, `IdleView`, `clockLeft()`; `GameState.clock` / `.idle` |
| `src/game/endstep/normalize.ts` | `toClock()`, `toIdle()`; `FrameMeta.serverSkew` / `frozen` |
| `src/game/endstep/EndstepAdapter.ts` | `trackSkew()`: the server clock's lead, kept per match; replays frozen |
| `src/game/passUntil.ts` | New: the pass-until logic (pure) |
| `src/game/PhaseStopSync.ts` | `setTemporary()`: stops added while passing |
| `src/ui/board/keywords.ts` | New: the keyword glossary and `keywordNotes()` |
| `src/ui/board/Board.ts` | `renderTimers()` and one timer ticker; keyword boxes on the zoom; `startPassing()` / `autoPass()` / `stopPassing()` and the dock's *Pass until…* |
| `src/ui/Overlay.ts` | `setTemporaryStops` hook |
| `src/styles/board.css` | `.timers`, `.zkw` |
| `src/dev/harness.ts` | Scenarios `clock`, `clock-opp`, `keywords` |
| `tests/gameInfo.test.ts` | New: 20 tests (clocks, idle timer, skew, pass until, glossary) |
| `docs/`, `README.md` | This documentation |

## Session of 2026-10-07 (branch `arena-combat-replays`)

Released as **0.5.0**, on top of `814d611 Arena combat, replays, opponent disconnects`. All 58 tests pass.

1. **Rebuilt `dist/`** with `pnpm build`. `dist/` is gitignored: after every build, reload the
   extension in `chrome://extensions`.
2. **Checked the combat strike.** It was thought to be missing; it exists (`combatStrike` in
   `src/ui/board/Board.ts`) and plays in the harness (`#strike`). Whether it plays in real matches is
   still unconfirmed (roadmap [t0-2](roadmap/phase-0-finish-open-work/t0-2-verify-in-real-match.md)).
3. **Damage assignment screen**, with Endstep's own rules. See
   [features/damage-assignment.md](features/damage-assignment.md).
4. **Strike before the result.** When combat wins or loses the game, the strike plays first and
   Victory/Defeat comes after. See [features/combat-strike-and-game-end.md](features/combat-strike-and-game-end.md).
5. **Movable replay bar.** See [features/movable-replay-bar.md](features/movable-replay-bar.md).
6. **Opponent's hand picked in a fan** (Thoughtseize, Thought-Knot Seer). See
   [features/choosing-from-opponent-hand.md](features/choosing-from-opponent-hand.md).
7. **Face-down card left on the opponent's table.** Investigated, not fixed: needs data from a real
   match (roadmap [t0-3](roadmap/phase-0-finish-open-work/t0-3-face-down-card-left-on-table.md)).
8. **Roadmap.** A tracker page with phases and features to approve, mirrored in [roadmap/](roadmap/README.md).

### Files changed

| File | Change |
| --- | --- |
| `src/game/GameState.ts` | `DivideView` / `DivideOption`; `PendingActionView.divide` |
| `src/game/endstep/normalize.ts` | `toDivide()`: reads `maxValue`, `cardOptions[].lethalDamage`, `types: ["Player"]`, `overrideOrder` |
| `src/game/GameController.ts` | `divide(amounts)` sends `CHOOSE_CARDS` with the amounts as `orderedCards` |
| `src/ui/board/modes.ts` | `divide` mode and its pure functions; an opponent's hand no longer counts as the table |
| `src/ui/board/Board.ts` | Damage box, result held back for the strike, `damageStep` for a game ending in combat, draggable replay bar, `choiceInFan` / `pickedInFan` |
| `src/styles/board.css` | Damage box styles, replay bar grip |
| `src/dev/harness.ts` | Scenarios `damage`, `damage-split`, `win`, `discard`, `tks` |
| `tests/interaction.test.ts` | 4 new tests (damage division ×3, choosing from the opponent's hand) |
| `docs/` | This documentation |
| `README.md` | Damage assignment no longer listed as stepping aside; new *Play* rows; new harness scenarios; link to `docs/` |
| `package.json`, `public/manifest.json` | Version 0.5.0 |
