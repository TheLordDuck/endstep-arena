# Changelog

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
