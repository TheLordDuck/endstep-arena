# Changelog

## Session of 2026-10-08

On top of `3fab0ec Docs: roadmap, t1-2, t1-3, t1-5 and t1-8 done`. All 116 tests pass (19 new). Not
seen in a real match yet.

1. **Spells travel when they resolve** (roadmap t2-1): a spell leaving the stack for the
   battlefield, graveyard or exile flies there, as in MTG Arena. A full-size copy lifts off the
   stack in an arc and shrinks onto the card's new place. The card then takes over and settles in.
   Countered spells fly to the graveyard too. Harness: `#resolve`, `#resolve-bolt`.
2. **Damage from spells and abilities** (roadmap t2-2): when one resolves, a bolt of light flies
   from the stack to each target that lost life, took damage or died, and lands with a flash and
   the damage. Read from the states. Harness: `#spell-damage`.
3. **Token entrance** (roadmap t2-4): a new token grows in, bright, with a burst of golden light.
   Harness: `#tokens`.
4. **Counters and power/toughness** (roadmap t2-5): the P/T badge jumps and the change floats up
   from the card (blue for a gain, red for a loss); a counter pin whose count changed jumps.
   Harness: `#pump`.
5. **Toughness minus damage** (roadmap t2-8): a damaged creature shows its toughness left in
   red (a 4/4 with 3 damage reads 4/1), instead of a separate damage badge.
6. **Exiling a permanent** (roadmap t2-9): it flares in violet light where it stood and spins
   into its owner's exile vortex, which flares. Harness: `#exile-creature`.
7. **Game log** (roadmap t3-1): a panel down the left side (L, the Log button or the table menu),
   a line per game event from Endstep's own messages and one per turn. Pointing at a line lights
   up its cards; at a card name, its picture. Replays have it too, up to the frame shown.
8. **Settings** (roadmap t4-2): table menu → Arena UI settings: animations on/off, their speed
   (0.75× to 2.5×), card size (small to extra large), sounds and volume. Kept in `chrome.storage`.
9. **Sounds** (roadmap t4-3): cast, resolve, land, pass, attack, hit, spell damage, exile, token,
   counters, your turn, win, lose. A file in `public/sounds/` named after the sound plays when
   there is one (Arena's own, kept out of git and the release zip); otherwise a synthesized one.
10. **Spectating** (roadmap t5-1): on `/spectate/:id` the board follows that match only, sends
    nothing, shows a Spectating · Leave pill, names every turn and says who won.
11. **What we're waiting for** (roadmap t3-4): when it isn't your move, the board says who the
    game waits on and for what (responding to your spell, declaring blockers, making a choice,
    resolving), the action button sums it up and their picture glows.
12. **Keyboard shortcuts panel** (roadmap t4-1): **?** or the table menu lists the board's shortcuts.
13. **Discarding from your hand** (roadmap t1-9): a discard from your own hand (an activated ability's cost,
    Thoughtseize on yourself) is picked by clicking the cards in your hand, without the fan and
    without an arrow following the pointer. Endstep marks it `contextType: "discard"`. Other
    choices from your hand (Surgical Extraction) keep the fan. Harness: `#discard-cost`.
14. **Damage and deaths as the blow lands** (roadmap t2-10, t2-3): life, damage and deaths show
    when the combat blow or the spell's bolt lands, not before. A dead creature stays in its place
    until then and crumbles there. Blockers lunge back as they clash. Murder fires a dark bolt and
    Swords a violet one before the creature goes. Deaths with no bolt (a board wipe, a sacrifice)
    crumble in place. Harness: `#murder`, `#wrath`.
15. **Unblocked attackers hit the player** (fix): Endstep names an attacked player
    `-(seat + 1)` in `attackingDefenderId`, as in targets, so a creature attacking a player found no
    picture to slam into and drew no arrow to it. `normalize.ts` now turns it into `player:<seat>`,
    as in targets. Not the bare seat: Endstep's card ids start at 0, so "0" could be a card in your
    hand, and the arrow went to that card instead of your picture. The harness uses Endstep's format.
16. **Animation pace** (roadmap t2-11): states reach the board one by one; a spell on the stack,
    attackers or blockers stay on screen a moment and the next state waits for the animations, so
    your own spells animate against a bot too. Harness: `#bot-cast`.
17. **Proliferate on the table** (roadmap t1-10): every option lights up; click them, or *All yours*
    sends all of the proliferating player's. Harness: `#proliferate`.
18. **Roadmap**: t2-1, t2-2, t2-4, t2-5, t3-1, t3-4, t4-1, t4-2, t4-3 and t5-1 done in the tracker
    (phases 3 and 4 complete), t2-8 and t2-9
    added as done, t5-5 (publishing to the stores) rejected; [roadmap/](roadmap/README.md) updated to match.

### Files changed

| File | Change |
| --- | --- |
| `src/ui/board/Board.ts` | Settings and shortcuts panels, speed and card size, sounds, game log panel, spectating, what we're waiting for; `captureCasts()` before an update, `flyFromStack()` instead of the plain slide for spells that left the stack; `captureStackSpots()`, `spellHits()`, `shoot()`, `damagePop()`; `tokenEntrance()`; `statChanges()`; `captureExiled()`, `banish()` |
| `src/ui/board/cards.ts` | Counter pins carry `data-kind`; damage comes off the toughness (`i.hurt`) |
| `src/styles/board.css` | `.card.flying` (the copy in flight), `.shot`, `.token-burst`, `.stat-pop`, `.b.pt i.hurt`, `.card.flying.exiling`, `.exile-burst` |
| `src/dev/harness.ts` | Scenarios `resolve`, `resolve-bolt`, `spell-damage`, `tokens`, `pump`, `exile-creature`, `log`, `spectate`; `?prefs=`, `window.__board` |
| `src/ui/board/prefs.ts` | New: the board's settings, their defaults and checks |
| `src/ui/board/sounds.ts` | New: the sounds (files, or synthesized) |
| `src/content/settings.ts`, `src/ui/Overlay.ts` | Settings carry `prefs`; `prefs`, `setPrefs` and `leaveSpectate` hooks |
| `src/game/GameState.ts` | `LogEntry`, `GameState.log`, `GameState.spectating` |
| `src/game/endstep/normalize.ts` | `toLogEntry()`; `defenderId()`: an attacked player as `player:<seat>` |
| `src/game/endstep/EndstepAdapter.ts` | The match's game log; spectate routes (`isSpectatePath()`, `matchIdFromPath()`) |
| `src/game/endstep/replay.ts`, `src/content/index.ts` | A replay's events, shown in the log up to the frame |
| `src/game/GameController.ts`, `passUntil.ts`, `PhaseStopSync.ts`, `unsupportedPrompts.ts` | Nothing sent or recorded while spectating |
| `build.mjs`, `tools/package.mjs`, `public/manifest.json`, `.gitignore`, `public/sounds/README.md` | Sound files: listed by the build, left out of the zip and git, readable by the page |
| `tests/log-settings-spectate.test.ts` | New: the log, the settings and spectating |
| `src/ui/StatePacer.ts`, `tests/pacer.test.ts` | New: the board's states, paced |
| `src/game/waiting.ts`, `tests/waiting.test.ts` | New: what the game waits for when it isn't your move |
| `src/ui/board/modes.ts`, `tests/interaction.test.ts` | `discardInHand()`: a discard from your own hand is picked on the hand |

## Session of 2026-10-07, night

On top of `f8ee20d Sideboarding screen, piles, separating piles, piles of four`. All 97 tests pass
(8 new). None of it has been seen in a real match yet.

1. **Paying Phyrexian mana** (roadmap t1-2): pay 2 life for a Phyrexian symbol from the board, by
   clicking your plate or *Pay 2 life*. Endstep's `PAY_LIFE_PHYREXIAN` is now an allowed action.
   See [features/phyrexian-mana.md](features/phyrexian-mana.md).
2. **Log of the prompts that step aside** (roadmap t1-3): each prompt handed to Endstep's UI is
   listed in the debug panel's new *Unsupported* tab, kept across matches, and written to
   `.devlog/unsupported.ndjson` on the dev build. See
   [features/unsupported-prompts.md](features/unsupported-prompts.md).
3. **Dividing a spell's damage** (roadmap t1-5): a division that isn't combat damage is done on the
   table, as in MTG Arena: a ▲ amount ▼ counter on each target, the message in a strip across the
   middle, arrows from the spell, *Submit* / *Reset*. A spell's rules apply (at least 1 to each
   target, no trample lock). A divided spell on the stack shows each target's share on its arrow.
4. **Choosing from your own hand in a fan**: Surgical Extraction on your own graveyard (or any choice
   from your hand) shows the cards in a fan with *Submit*, like an opponent's hand, instead of picking
   them on your hand with an aiming arrow. When the options come from different zones, each card is
   labelled (Hand, Graveyard, Library). Harness: `#surgical`, `#surgical-target` … `#surgical-library` (step by step), `#self-discard`.
5. **Roadmap**: t1-2, t1-3 and t1-5 done in the tracker, and t1-8 (your own hand in a fan) added as
   done; [roadmap/](roadmap/README.md) updated to match. See
   [features/spell-damage-division.md](features/spell-damage-division.md).

### Files changed

| File | Change |
| --- | --- |
| `src/game/GameState.ts` | `PendingActionView.phyrexian`; `DivideView.kind`; `StackItemView.divided` |
| `src/game/endstep/normalize.ts` | `phyrexianMana`; `divideKind()`; `dividedAmount` on stack targets |
| `src/game/GameController.ts` | `payPhyrexianLife()` |
| `src/shared/protocol.ts` | `PAY_LIFE_PHYREXIAN` allowed |
| `src/game/unsupportedPrompts.ts` | New: `UnsupportedLog`, stored in `chrome.storage.local` |
| `src/content/index.ts` | Records the prompts that step aside; dev bridge report |
| `src/content/settings.ts`, `src/ui/Overlay.ts`, `src/ui/DebugViews.ts` | *Unsupported* debug tab; stack shares in the state tab |
| `src/ui/board/modes.ts` | `divideStart()` for spells, `divideShort()`, `divideReady()` |
| `src/ui/board/Board.ts` | Paying life from your plate and the dock; a spell's damage divided on the table (`boardDivide()`, `placeDivideBadges()`); shares on target arrows |
| `src/styles/board.css`, `src/styles/overlay.css` | `.prompt.div-strip`, `.dbadge` (the division on the table), `.arrow-amt`; `.tools-row` |
| `src/dev/harness.ts` | Scenarios `phyrexian`, `fireball`, `divided`, `self-discard`, `surgical`, `surgical-*` |
| `tools/dev-server.mjs` | `.devlog/unsupported.ndjson` |
| `tests/prompts.test.ts` | New: 8 tests; `tests/interaction.test.ts`: the combat fixture is in the damage step |
| `docs/`, `README.md` | This documentation |

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
