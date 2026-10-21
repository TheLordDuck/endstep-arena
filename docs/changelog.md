# Changelog

## Release 0.10.0 (2026-10-21)

On top of `7cadcf5`. All 174 tests pass. `pnpm visual`: the changed scenarios are the expected
ones (the baseline was still from 2026-10-16, before 0.9.0's Auras: Pacifism peeking out behind
Grizzly Bears moves that row a little), taken as the new baseline, with the new `yields`,
`arrange-bottom` and `replacement`. `package.json` and `public/manifest.json` at 0.10.0.

1. **Auto-yields on the board**, checked in a live match (session of 2026-10-21 below).
2. **Cards put on the bottom of the library, into the graveyard or exile** in an order are
   arranged in a pile named after where they go, the first tagged *Bottom* or *1st*, as Endstep
   names them; **two replacement effects** are ordered as *Order Replacement Effects*, *Applies
   first* (t1-11, `f022689`, 2026-10-19). Harness: `arrange-bottom`, `replacement`.

## Session of 2026-10-21

On top of `f022689`. All 174 tests pass. Checked in the harness and in a live match.

1. **Auto-yields on the board** (t4-8, 6 of 8): right-click an ability on the stack for
   *Auto-yield* (the one on top passes at once while you have priority), and a "you may" trigger
   for *Always yes* / *Always no*; *Disable auto-yields* pauses them. *Auto-yields* is back in the
   table menu as the board's own panel: on or paused, remembered for this game, this match or this
   device (Endstep's own `localStorage` keys), the abilities and trigger answers to forget, and
   forgetting the orders saved with "OK & remember". Sent to the server with `SET_AUTO_YIELDS` as
   Endstep's client sends them, and again if its client sends its own copy; holding priority (H)
   pauses them. Tests in `tests/autoYields.test.ts`. Harness: `yields`, `?open=yields`.
   - Tried in a live match: the page's action filter dropped `SET_AUTO_YIELDS` (and
     `CLEAR_REMEMBERED_ORDERS`); both are now allowed.
   - Creeping Chill's trigger doesn't ask "Use triggered ability?" (what the server answers from
     *Always yes / no*): its effect asks "Exile Creeping Chill?" with no trigger id. The board
     answers that question itself when it comes from the card of the trigger resolving on top of
     the stack.

## Release 0.9.0 (2026-10-19)

On top of `66f4e08`. All 166 tests pass. `pnpm visual`: the changed scenarios are the expected
ones (Pacifism on Grizzly Bears now peeks out from its left edge, so that row sits a little
higher; the old baseline still had the opponent's commander at the top centre), taken as the new
baseline, with the new `sidegrey`, `auras`, `auras-target` and `sheltered`. Everything in the
session below (2026-10-19); `package.json` and `public/manifest.json` at 0.9.0.

1. **The opponent's revealed cards** show big when you point at them.
2. **Your off-hand cards** (commander, flashback, adventure…) always beside your hand, greyed
   while you can't play them, without moving around.
3. **Double-faced cards** show their other face when pointed at.
4. **Auras and Equipment** behind their permanent, peeking out from its left edge; with several,
   a click opens them in a fan to pick one, for targeting too.
5. **What an Aura exiles** (Sheltered by Ghosts) peeks out under its creature.
6. **Report a problem and Report stalling** in the board's own form.
7. **The board turns on when a match starts.**

## Session of 2026-10-19

On top of `b4c5728`. All 162 tests pass. Checked in the harness, not yet in a live match.

1. **The opponent's revealed cards** show big when pointed at; the box of their off-hand cards no
   longer takes the pointer, and the hovered card comes up over the table (roadmap t3-20).
2. **Your off-hand cards, always beside your hand:** what you could play from another zone
   (commander, flashback, adventure…) stays there, a little grey while you can't, in its zone's
   order (t3-21). Harness: `sidegrey`.
3. **Double-faced cards** show their other face when pointed at, on the table, in your hand and
   in the opening hand (t3-22).
4. **Auras and Equipment** sit whole behind their permanent, peeking out from its left edge; with
   several, a click opens them in a fan to pick one, also to target it (t2-28). Harness: `auras`,
   `auras-target`.
5. **What an Aura exiles** (Sheltered by Ghosts) peeks out under its creature instead of
   disappearing (t2-29). Harness: `sheltered`.
6. **Report a problem and Report stalling** are back in the game menu, as the board's own form:
   kind or the player who stalls, what happened, images (chosen or pasted) and diagnostics, sent to
   Endstep as its form sends them (`POST /api/bug-reports`) (t4-8, 5 of 8). Tests in
   `tests/reports.test.ts`.
7. **The board turns on when a match starts,** even if it was turned off before (t4-9).

## Release 0.8.0 (2026-10-16)

On top of `cdeea12`. All 161 tests pass. `pnpm visual`: the changed scenarios are the expected
ones (block groups' discs and colors, the opponent's commander at the top left), taken as the new
baseline; `block` still differs from run to run in its prompt text and mana icons (flaky, not from
this release). Everything in the session below (2026-10-16); `package.json` and
`public/manifest.json` at 0.8.0.

1. **Combat you can read:** each blocked attacker and its blockers share a color and a numbered
   disc; trample hits the player too; fights that came without their events still play.
2. **Arc Lightning and other divided spells** asked one number per target: divided on the table.
3. **Best of three:** a pip by each name per game won, the match score under the result, and who
   won at a replay's last frame (counted right after game 1).
4. **Show decklist** on the board, with the cards' pictures as the sideboarding screen lays them
   out; the game menu keeps the board's items, the decklist, Reload and Concede.
5. **Endstep's keyboard shortcuts** (with your rebinds) in the board's shortcuts list.
6. **The opponent's off-hand cards** (commander, flashback…) at the top left, covering nothing.
7. **One attack declaration per prompt:** Space/Enter no longer reach Endstep's hidden combat
   prompt while you choose attackers or blockers.

## Session of 2026-10-16

On top of `5efb895`. All 159 tests pass (8 new, in `tests/botAttacks.test.ts`, `tests/prompts.test.ts` and `tests/gameInfo.test.ts`). Checked in the
harness and on a recorded match, not yet live.

1. **A match where the bot attacks, recorded** (roadmap t2-13): kept as the fixture
   `tests/fixtures/bot-attacks.ndjson.br`. On turn 14 eight Soldier tokens block a Colossal
   Dreadmaw (six of them) and two Llanowar Elves; the states and events agree on every block and blow.
   A second, `bot-trample`: the Dreadmaw tramples over four Soldiers (2) and two (4).
2. **Who blocks whom, readable with many blockers** (asked for during the session). Each blocked
   attacker and its blockers share a color and a numbered disc, kept until combat ends (the arrows
   used to go once blocks were declared). The blockers' arrows, in that color, spread over the
   attacker's near edge instead of meeting in its centre. Pointing at a fighter dims the other
   groups; choosing blockers, the attack arrows step back. Harness `gang-block`, `gang-blocked`.
3. **Trample hits the player too** (asked for during the session): an attacker that deals damage
   past its blockers slams into each, then into the player's picture (or the planeswalker), whose
   life goes down then. Harness `trample`.
4. **A fight whose `ATTACKERS_DECLARED` never came** uses the events that did (blocks and blows),
   with the attackers from the states. Endstep leaves out the events of the turns that pass while its
   tab is hidden and sends just the state when it comes back; both recordings have such a stretch.
5. **A spell's divided damage on the table, as Endstep really asks it** (asked for during the
   session). Arc Lightning comes as its targets, then one number per target ("Assign 3 remaining to
   …"); the board now shows the whole split on the table, like any division, and answers each
   number itself. Harness `arc-lightning`; fixture `arc-lightning`. A target that's one of a pile
   of identical cards comes out of it and stays out until the spell is on the stack (it used to go
   back once the targets were sent, while dividing and paying).
6. **The match score, and who won in replays** (asked for during the session). Endstep's
   `matchScore` is read: in a best of three, a pip by each name per game won and "Game 2 of 3 · 1–0"
   by the turn, and the match's score under the result ("Match won 2–0"). A replay's last frame
   shows who won, under its controls. Harness `bo3`, `bo3-won`, `replay-won`.
7. **Roadmap docs in sync with the tracker** (they were as of 2026-10-14). Fourteen features done
   since then now have their cards written (what was done, commit, how it was checked): t2-14,
   t2-21, t3-5, t3-6, t3-7, t3-10 to t3-13, t3-15 to t3-17, t4-6 and t5-3. t3-9, t3-14 and t4-7,
   rejected on 2026-10-14, are marked so.
8. **The Commander features rejected for good:** t2-6 (commander damage) and t5-2 (3- and
   4-player tables) go back to Phases 2 and 5 as rejected, and Phase 6 · Maybe later is gone.
9. **Roadmap:** t2-13 done; t1-6 rejected (no card known to bring `DIVIDE_SHIELD`). New: t3-19 (the opponent's off-hand cards to one side, approved), t2-25 (two attack declarations at once), t2-26 (show prevented damage) and t2-27 (piles of more than four that read), the last two awaiting approval. t0-3 waits on a replay.
10. **A replay's score after game 1** (asked for during the session). A replay holds the whole
    match, and the score after a game already counts it; the result counted it again ("wins the
    match 2–0" after game 1). It now counts the games finished from the replay's log: "Match 1–0 ·
    game 2 next". Checked against a real best-of-three replay.
11. **No "Game 2 of 3 · 1–0" by the turn** (asked for during the session): the pips by the names
    already say it.
12. **The opponent's off-hand cards, to one side** (roadmap t3-19). Their commander, flashback,
    escape and adventure cards hung at the top centre, over their step track and life total; they
    now hang at the top left, between their name and their step track, as yours sit to one side of
    your hand. Harness `oppside`.
13. **One attack declaration per prompt** (roadmap t2-25). In a real match two `DECLARE_ATTACKERS`
    went out at once for the same prompt, one with the attack and one with none; the recording
    of what was sent is gone, so the cause wasn't seen. Two guards: while attackers or blockers
    are being chosen, Space and Enter are kept from Endstep's own hidden combat prompt (it would
    answer with nothing chosen, as its hidden number picker and damage bar would); and
    `GameController` sends one attack (or block) declaration per prompt version, a second one
    within 3 s being dropped. Test in `tests/adapter.test.ts`.
14. **The game menu keeps only the board's items and Concede** (asked for during the session).
    Endstep's other items (Show decklist, Auto-yields, Settings, Keyboard shortcuts, Report a
    problem, Report stalling, Reload, Record a macro) opened Endstep's own UI over the board; they're
    left out until the board has its own. The code that opens them is still there.
15. **Three of Endstep's menu items, on the board** (roadmap t4-8, in progress). *Show decklist*
    opens the deck you registered, fetched from Endstep's match info (`GET /api/matches/:id`:
    `myDeck`, `mySideboard`, `myCommanders`, `myDeckArt`), with each card's cost and type from its
    card batch (`POST /api/cards/batch`), shown with the cards' pictures as the sideboarding screen
    shows a deck, only to look at: the main deck in columns by mana value (lands last), the
    sideboard (and a commander) in a column beside it, a stack per card with ×N; pointing at a
    card shows it big.
    *Reload* reloads the page. *Keyboard shortcuts*: the board's list now ends with Endstep's keys
    (copied from its shortcut definitions, with your rebinds from `endstep:hotkeys:v1`), noting C
    is the board's chat. Auto-yields, Endstep's settings, the two reports and macros stay out.
    Harness: `?open=menu|decklist|shortcuts` opens them (and `?point=` points once they're up).
    Endstep's definitions also show what t2-25 guarded against: its Space is "Pass / Confirm",
    confirming whatever the game asks.

## Release 0.7.0 (2026-10-14)

On top of `10a40e8`. All 151 tests pass; no visual change in the 94 harness scenarios
(`pnpm visual`). Everything in the sessions below since 0.6.0 (2026-10-13 and 2026-10-14), plus
these commits, which had no session entry; `package.json` and `public/manifest.json` at 0.7.0.

1. **Zone counts, player counters, counter and state boxes, Arena portrait** (`e4318aa`); counter
   boxes in the zoom keep the board's font (`a5e2321`).
2. **Mulligan:** its cost under its buttons, a line saying where the opponent is with their hand,
   and your hand off the hand strip until you keep it (`995e58c`, `6724644`). The hover zoom shows
   the card alone.
3. **Life gain orbs:** golden orbs fly from the card that gave the life (or gather around the
   portrait), and the total changes as they land (`6724644`).
4. **Hand size warning:** on your turn with more than seven cards, a pill over the hand says how
   many you'll discard (`6724644`).
5. **Pass until my turn:** a blue button under Pass in the opponent's turn, and "My turn" in the
   Pass until… menu. An attacker you block comes out of its pile at once; the combat arrows go away
   once blocks are declared; Endstep's win/loss sound waits for the board's result screen (`6724644`).
6. **Table background:** the Table setting is a dropdown, with None (a plain dark color) and
   Custom (a picture of your own, a file or a link) (`eaf7d6e`).
7. **The opponent's side hand:** beside their hand, what they can play from elsewhere (commander,
   flashback and escape in the graveyard, adventures and foretold cards in exile). Screenshot
   tests of every harness scenario: `pnpm visual` (`a16aa76`).
8. **Lighter on the page** (`10a40e8`): the release build is minified; three.js and the scenes are
   `scene.js`, loaded the first time a match is on a 3D table; the board is built at the first
   match, not on every page; the 3D table draws its shadows once per scene (every frame only where
   flames move). The content script goes from 1.6 MB to 406 KB.

## Session of 2026-10-14

On top of `675f033`. All 140 tests pass (15 new, in `tests/arenaFrames.test.ts` and `tests/chat.test.ts`). Checked in the
harness with Scryfall's images and on the recorded match (`#match:bot-combats`), not yet in a live
match. Eight roadmap features from the LegenVD videos, all approved and done today.

1. **Tokens in Arena's token frame** (t2-17), as in a screenshot of Arena: a dark body, the art in a
   window arched on top edged in the token's color, power/toughness in a pale box; no name. (The
   art frame was tried on every permanent; the old look was preferred for the rest.) A card that changes
   picture keeps the old one until the new one has loaded.
2. **Printed keywords as icons** (t2-15). Read from the card's keyword lines only (not keywords
   its text mentions or grants), as icons along the bottom of the frame; gained and lost ones keep
   their green and red labels.
3. **Abilities in Arena's ability frame** (t2-23), on the stack, in the magnifier and in the trigger
   order box: the source's art and name, "Ability" and the text on a plate of the card's color
   ending in an arch. The text is the ability as printed when Endstep sends it (its `yieldKey`, now
   kept as `abilityText`), else its description without ids and notes.
4. **Loyalty costs** (t2-19). A loyalty ability on the stack carries its cost under its frame, from
   its printed text or, when Endstep only says what it does, from the planeswalker's matching line.
   A planeswalker's Choose One lists all its loyalty abilities, the ones it can't use (not offered,
   or more loyalty than it has) in grey and not clickable.
5. **Modal spells on the stack** (t2-20). The card's modes over its text box, the ones not chosen at
   40 %. Endstep sends no chosen modes, but a spell's description on the stack (now kept as
   `description`) spells out only what the chosen modes do; the modes you pick yourself are
   remembered and used first.
6. **Target arrows as Arena's arcs of light** (t2-22): a high arc with a glow, sparks running to the
   target and a ring of light where it lands. Blue for a spell or ability, violet when it exiles,
   gold while choosing or dividing damage. Attack, block and source arrows are unchanged.
7. **The rope** (t2-18). In the last stretch of a player's idle timer (Endstep's `graceMs`), a
   burning line across the table on their side, in their color, burning down with their time.
8. **3D tables** (t2-24), after Arena's battlefields (studied in frames of the videos): a scene seen
   almost from above with three.js (`src/ui/board/scene/`), all modelled and drawn in code: a floor
   with a large pattern, a band on the midline, a dais under each picture, tall scenery along the
   edges, shadows, lights and particles. Five, one per color: Academy, Glacier, Cathedral, Forge
   and Garden. Settings → Table: Random (default: a new scene each match), the deck's color, any of the five, or Plain (the play
   mat on wood dyed in the deck's color; also without WebGL). New pref `table` (an old
   `tableArt: false` becomes Plain). It pauses while hidden and runs at 30 fps at most. The
   content script grows from 0.6 to 1.6 MB (three.js, not minified).
9. **Harness:** scenarios `pw` (now Garruk Wildspeaker on the table), `pw-click`, `pw-stack`,
   `modal` and `ability-frames`; `?play=<card id>`; how to see card art there (docs/testing.md).
10. **The match chat on the board** (t3-18, asked for during the session). A new message shows
   for a moment in a bubble by its writer's picture; the Chat button (or C) opens the conversation
   and a box to write in, with Endstep's typing indicator, refusals and mutes. Endstep's chat
   protocol read from its bundle (docs/ENDSTEP_ANALYSIS.md §11); the tap sends `CHAT` and
   `CHAT_TYPING` frames on a path of their own. Settings → Chat bubbles. Harness scenario `chat`.
   See [features/match-chat.md](features/match-chat.md).
11. **Roadmap:** the eight above done; the docs of t2-21, t3-10 to t3-17, t4-6 and t4-7 (added to the
    tracker on 2026-10-13, awaiting approval) written.

## Session of 2026-10-13

On top of `9927172`. All 125 tests pass (2 new). Compared against MTG Arena gameplay videos
(LegenVD); checked in the harness, not yet in a live match.

1. **The buttons on the right as in Arena** (roadmap t4-5). The main button always sits at the
   bottom, the alternative above it (No Attacks over All Attack, Resolve All over Resolve, Cancel
   over Submit), with the next stop centered under it ("To Combat", "To Blockers") and the » that
   ends the turn on a row of its own. Arena's words (*N* Attackers, *N* Blockers, Submit *N*,
   Opponent's Turn) and colors (orange; red through blocks and damage; blue to back out). Before,
   the dock stacked bottom-up and attacking and the stack had their buttons the other way round.
2. **One pile per group of identical cards** (roadmap t2-16, replaces t2-7's four per pile). ×18
   tokens make one pile with four drawn. A click on one card uses just it; a click on the ×N uses
   them all (all attack, or all are picked), again to take them back. Harness scenario `horde`.
3. **"Creates Token" beside an enlarged card** (roadmap t3-8). The tokens a card makes, from
   Scryfall's related cards (`src/ui/board/relatedTokens.ts`), looked up once per card and only for
   cards whose text creates tokens. The extension's first request to a service other than Endstep;
   only the card's name is sent.
4. **The stack as Arena fans it** (roadmap t2-14, from the LegenVD videos). On the table, the items
   under the next one fan out behind it to the left like a held hand, each turned a little more
   (before: a diagonal cascade, smaller at each step). A magnifier beside `Stack · N` (now on the
   pile's right) opens Arena's Stack view: every item upright in one overlapping row, the next to
   resolve on the right and in front, each rimmed in its controller's color, abilities with their
   kind and text, X when paid; hovering one brings it whole into view. Closed with Done, Esc, the
   magnifier again or a click outside. Harness scenario `stack7`.
5. **The stack no longer collapses when an item resolves.** The slide that moves cards to their
   new place animated `translate` to 0, which is what sets a stack item's place in the pile:
   for a third of a second every item was drawn on the top one, then jumped back. Cards now slide
   to their own translate. Harness scenario `stack-resolve` (three items, the top one resolves),
   and `?step=<ms>` to send a scenario's follow-up states that far apart.
6. **Roadmap:** t2-14 (stack in a fan) to do; t2-15, t2-17, t3-6, t3-7 and t3-9 awaiting approval,
   all from the videos.

## Release 0.6.0 (2026-10-12)

On top of `c70cdd0`. All 123 tests pass. Everything in the sessions below since 0.5.0 (2026-10-07
afternoon to 2026-10-11); `package.json` and `public/manifest.json` at 0.6.0.

## Session of 2026-10-11

On top of `2513b8f Roadmap: t2-12, combat driven by Endstep's events`. All 123 tests pass (6 new).
Checked by replaying a real match on the board, not live.

1. **A real match recorded.** Against Forge AI, 13 turns, five combats of ours, with the dev bridge.
   Kept as the fixture `tests/fixtures/bot-combats.ndjson.br`.
2. **The turn was never known** (fix): Endstep sends `turnNumber` as a string (`"3"`), and
   `normalize.ts` only took a number. With no turn, every combat's damage step had the same key,
   so after a match's first combat no strike played. Replaying the match on the board, the old
   code animated 1 combat of 5; now all 5 play (14 blows).
3. **Combat from Endstep's events** (roadmap t2-12): who attacks (`attackerIds`), who blocks whom
   (`blockerAssignments`) and each blow with its amount and damage step (`CARD_DAMAGED`,
   `PLAYER_DAMAGED`, after a `TURN_PHASE`). They drive the strike: right blockers even when the
   damage state has lost them, a double strike's two blows, the exact damage. The states only fill
   in what the events don't say. `src/game/combatEvents.ts`; see
   [features/combat-strike-and-game-end.md](features/combat-strike-and-game-end.md).
4. **Spell damage from events on real data** (fix): `CARD_DAMAGED` names the card hit in
   `targetCardId`, which the log didn't keep, so `spellDamage.ts` never found the event in a real
   match. The log entry now names both cards.
5. **Real matches as tests** (roadmap t5-4): `node tools/save-match.mjs <name>` keeps a recorded
   match; `tests/realMatch.ts` plays it through the adapter; the harness replays it on the board
   (`#match:<name>`). See [testing.md](testing.md#recorded-matches).
6. **Roadmap**: t2-12 and t5-4 done in the tracker; t2-13 added (check combat when the bot
   attacks, double blocks, trample: the recorded match had none). The Commander features, t2-6
   (commander damage) and t5-2 (3- and 4-player tables), moved to a new Phase 6 · Maybe later:
   not planned for now.

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
19. **Faithless Looting's discard on the hand** (fix, t1-9): it came up in a fan, since Endstep
    doesn't always call a discard one. Any choice whose options are all in your hand is now picked
    on the hand; only a search of your hand (Surgical Extraction) keeps the fan. Harness: `#looting`.
20. **Only Endstep's sounds for now** (t4-3): the board's synthesized sounds are gone; they played
    on top of Endstep's own, which keep playing under the board. A file in `public/sounds/` named
    after a sound still plays (for your own sounds later).
21. **Endstep's damage sound as the hit lands** (t2-2, t2-10): it played as Endstep's event came in,
    before the board's bolt or blow. While the board is shown with its animations, the page-side
    script (`src/inject/damageSound.ts`) pauses Endstep's damage sound (Howler) the moment it starts
    and resumes it as each hit lands; one with no hit plays after 3 s. Endstep's file, volume and
    choice of sound are kept.
22. **A Bolt killing a 2-toughness creature showed 2** (fix, t2-2): a creature a spell killed
    showed what was left of its toughness. It now shows what the spell dealt: from Endstep's
    `CARD_DAMAGED` event, else the amount in the card's text (X as chosen), else the toughness left
    (`src/game/spellDamage.ts`, `tests/spellDamage.test.ts`).
23. **The combat strike sometimes didn't play** (fix, t2-10): it needed a state with the attackers
    and then one in a damage step, in the same turn. Endstep doesn't always send those (against a
    bot it can go past combat, even into the next turn, in one update). Now the attackers are the
    last ones shown this turn, or those the log names (when nothing was blocked), and an update
    that ends the fight without a damage step plays the strike when it brings the fight's damage
    (`fightBefore()`, `damageStep()`, `foughtIn()` in `Board.ts`). Harness: `#strike-next-turn`,
    `#strike-unseen`.
24. **Several attackers at a player: the life a blow at a time** (fix, t2-10): every attacker
    struck in turn, but the whole life loss showed at the first blow, so the others seemed to do
    nothing. Each blow now takes its attacker's power off, and the last one what's left
    (`lifeStep()` in `Board.ts`). Harness: `#strike-many` (five attackers, three of them a pile of
    tokens, and Endstep moving on to end of combat at once).

### Files changed

| File | Change |
| --- | --- |
| `src/ui/board/Board.ts` | Settings and shortcuts panels, speed and card size, sounds, game log panel, spectating, what we're waiting for; `captureCasts()` before an update, `flyFromStack()` instead of the plain slide for spells that left the stack; `captureStackSpots()`, `spellHits()`, `shoot()`, `damagePop()`; `tokenEntrance()`; `statChanges()`; `captureExiled()`, `banish()` |
| `src/ui/board/cards.ts` | Counter pins carry `data-kind`; damage comes off the toughness (`i.hurt`) |
| `src/styles/board.css` | `.card.flying` (the copy in flight), `.shot`, `.token-burst`, `.stat-pop`, `.b.pt i.hurt`, `.card.flying.exiling`, `.exile-burst` |
| `src/dev/harness.ts` | Scenarios `resolve`, `resolve-bolt`, `spell-damage`, `tokens`, `pump`, `exile-creature`, `log`, `spectate`; `?prefs=`, `window.__board` |
| `src/ui/board/prefs.ts` | New: the board's settings, their defaults and checks |
| `src/ui/board/sounds.ts` | New: the sounds (files from `public/sounds/`; nothing without one) |
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
