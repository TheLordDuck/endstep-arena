# Testing

## Harness

```sh
node build.mjs --harness
```

Builds `dist-harness/harness.html`; open it in Chrome with `#<scenario>` at the end of the URL. The
board is drawn from a fixture state, with no live match. Actions it would send are logged
(`ACTION …`) and collected in `window.__actions`.

Useful parameters:

- `?freeze=<ms>`: stops animations and timers that long after load (for screenshots).
- `?step=<ms>`: a scenario's follow-up states come that far apart instead of all at once.
- `?point=x,y` / `?click=x,y`: moves the pointer or clicks once the board is up. The click runs
  before full-screen choices appear, so it can't drive them.
- `?open=menu|decklist|shortcuts`: opens the table menu (in the middle of the board), the
  decklist (a Burn deck) or the keyboard shortcuts; `?point=` points again once it's up.

### Scenarios added on 2026-10-07

| Scenario | Shows |
| --- | --- |
| `damage` | Damage assignment: Rampaging Baloths 8/8 with trample blocked by Serra Angel (lethal 4) and Vampire Nighthawk (lethal 2) |
| `damage-split` | Damage assignment without trample: Tarmogoyf (4) against the same blockers |
| `win` | A game won in combat without moving on a step: the strike, then Victory |
| `discard` | Thoughtseize: picking from the opponent's hand in a fan (`CHOOSE_CARDS`) |
| `tks` | Thought-Knot Seer: the same, asked as `CHOOSE_TARGETS` with options that carry only ids |

Added later that day:

| Scenario | Shows |
| --- | --- |
| `clock` | A timed match: your clock running, and your idle timer in its last stretch |
| `clock-opp` | The opponent's clock running low while they decide |
| `piles` | Fact or Fiction: two piles, one card face down |
| `copies` | Nine Mountains and six Soldier tokens, piled in fours |
| `split` | The opponent's Fact or Fiction: you separate five cards into two piles |
| `sideboard` | Sideboarding before game 2: a 60-card Burn deck and 15-card sideboard |
| `keywords` | Keyword boxes: hover Serra Angel (printed keywords, one lost) or Grizzly Bears (granted ones) |

Added in the night session:

| Scenario | Shows |
| --- | --- |
| `phyrexian` | Paying for Dismember: *Pay 2 life*, and your plate lit to pay life |
| `fireball` | Arc Lightning dividing 3 damage among two creatures and the opponent, on the table (counters on the targets) |
| `divided` | The same spell on the stack, each target's share on its arrow |
| `self-discard` | Thoughtseize on yourself: a discard, picked on your own hand (a fan until 2026-10-08) |
| `surgical` | Surgical Extraction: copies of Lightning Bolt in hand, graveyard and library, each labelled with its zone |
| `surgical-target`, `surgical-grave`, `surgical-hand`, `surgical-hand-t`, `surgical-library` | Surgical Extraction step by step, as Endstep asks it: the target, then the copies in the graveyard, your hand (as a card or a target choice) and the library, each in its own fan |

Added on 2026-10-08:

| Scenario | Shows |
| --- | --- |
| `resolve` | Baneslayer Angel resolves: it flies from the stack onto the battlefield |
| `resolve-bolt` | The opponent's Lightning Bolt resolves: it flies from the stack into their graveyard |
| `spell-damage` | Arc Lightning (2 to the Vampire Nighthawk, which dies, 1 to the opponent) and Lightning Bolt (3 to the Serra Angel) resolve: a bolt to each target |
| `tokens` | Raise the Alarm resolves: two Soldier tokens come in with a burst of light |
| `exile-creature` | Swords to Plowshares resolves: the opponent's Serra Angel is drawn into their exile vortex |
| `pump` | Tarmogoyf +1/+1, a +1/+1 counter on the Grizzly Bears and -2/-2 on the Serra Angel: the changes float up |

| `log` | A few turns of game events; open the log with `?prefs={"logOpen":true}` |
| `spectate` | Watching someone else's game: the Spectating pill, their hand's backs, no buttons |
| `bot-cast` | Against a bot: Lightning Bolt goes on the stack and resolves at once; the stack shows, then the bolt hits |
| `murder` | Murder on the Serra Angel: a dark bolt, then it crumbles where it stood |
| `wrath` | A board wipe: every creature crumbles in place, with no bolt |
| `proliferate` | Proliferate: Tarmogoyf, Jace, The Eldest Reborn and the opponent light up; *All yours · 3* |
| `discard-cost` | An activated ability's cost ("{T}, Discard a card"): click a card in your hand, no fan and no arrow |
| `strike-next-turn` | An unblocked attacker, and the next update already the next turn: the strike plays |
| `strike-many` | Five unblocked attackers (three a pile of tokens); the life drops a blow at a time |
| `gang-block` | The bot's Colossal Dreadmaw and two Llanowar Elves attack; block with eight Soldiers: each attacker and its blockers get a color and a numbered disc |
| `gang-blocked` | The same, blocks declared (six on the Dreadmaw): no arrows, the discs say who fights whom |
| `trample` | The Dreadmaw blocked by two Soldiers slams into each, then into you with the 4 over |
| `arc-lightning` | Arc Lightning as Endstep asks it: pick targets (one of a pile of three Swiftspears comes out of it) and confirm, the division shows on the table, Submit answers Endstep's number per target (logged as ACTIONs) |
| `bo3` | Game 2 of a best of three, 1–0 up: a pip by each name per game won |
| `bo3-won` | Game 2 won: Victory, "Match won 2–0" under it |
| `replay-won` | A replay's last frame: "Opponent wins", "Match 1–1 · game 3 next", the replay's controls over it |
| `strike-unseen` | No state showed the attack; the log names it: the strike plays |
| `looting` | Faithless Looting's discard, asked without saying "discard": pick 2 cards right in your hand, no fan |
| `stack7` | Seven items on the stack, spells and triggers of both players: click the magnifier beside *Stack · 7* |
| `stack-resolve` | Three items on the stack and the top one resolves; with `?step=2000` the two states come 2 s apart, so the remaining pile can be watched sliding |
| `wait-respond`, `wait-blockers`, `wait-deciding` | Not your move: the opponent can respond to your Lightning Bolt / is declaring blockers / is making a choice |

Added on 2026-10-14:

| Scenario | Shows |
| --- | --- |
| `pw` | Garruk Wildspeaker's Choose One at 3 loyalty: its −4 in grey |
| `pw-click` | The same Garruk clicked on the table (open it with `?play=970`): Endstep offers +1 and −1, the −4 shows in grey |
| `pw-stack` | Loyalty abilities on the stack in the ability frame, with their cost: Garruk's −1 (named by its printed text) and Jace's 0 (named by what it does) |
| `modal` | Kolaghan's Command on the stack, two of its four modes chosen (the other two dimmed), told from Endstep's description |
| `ability-frames` | An activated ability (as printed, cost included) and a trigger in Arena's ability frame |
| `chat` | The match chat: a conversation, then the opponent writes (a bubble by their picture), a spectator too (under the Chat button), and the opponent starts typing; press C to open it and write (the reply comes back as the server's echo). With `?step=800` they come one by one |

Every scenario now shows permanents with their keyword icons and the 3D table; `keywords`,
`clock` (the rope), `stack7` (the magnifier), `order`, `divided` and
`fireball` (the target beams) show the rest of the 2026-10-14 changes.

`?play=<card id>` clicks that card as if to play it (a permanent with several abilities opens its
Choose One).

Card images come from Endstep's `/api/cards/image`, which a harness opened from disk doesn't have:
cards show their text instead. To see the art, serve `dist-harness/` with something that sends
`/api/cards/image?name=…&version=…` (and `set`/`cn`) on to Scryfall's
`https://api.scryfall.com/cards/named?exact=…&format=image&version=…`.

The 3D table needs WebGL: in headless Chrome, start it with `--use-angle=swiftshader
--enable-unsafe-swiftshader` (not `--disable-gpu`). `?prefs={"table":"forge"}` (or `academy`,
`glacier`, `cathedral`, `garden`, `plain`) picks the scene; `window.__board.scene3d` is the scene.

Settings: `?prefs={"cardScale":1.3,"animSpeed":2.5}` (URL-encoded) starts the harness with other
board settings; `window.__board.renderSettings()` and `renderShortcuts()` open those panels from a script.

Headless Chrome may stop producing frames, so animations stay at their start and screenshots
miss effects that CSS animates (bursts). `?freeze=<ms>` sets scripted animations to their time;
for the rest, check the elements' computed style instead of a screenshot.

Older ones include `strike` (combat strike), `blocked`, `replay`, `reveal` and `control`.

## Real clicks over CDP

Clicks, right-clicks, Ctrl-clicks, keys and drags were tested with a Node script that starts
headless Chrome with `--remote-debugging-port`, opens the harness and sends mouse and keyboard
events through the DevTools protocol. Its steps:

- `shot`: screenshot.
- `left@<selector>[@ctrl]` / `right@<selector>`: click the middle of an element in the board's shadow root.
- `drag@<selector>@dx,dy`: drag.
- `key:<key>`, `wait:<ms>`, `reload`.

It prints `window.__actions` at the end. The script lived in the session's scratch folder, not in
the repo; adding it to `tools/` is roadmap item
[t5-3](roadmap/phase-5-modes-and-platform/t5-3-visual-regression-tests.md).

## Recorded matches

A match played with the dev build (`pnpm build:dev` + `pnpm dev-server`) can be kept as a fixture:

```sh
node tools/save-match.mjs <name>        # .devlog/frames.ndjson → tests/fixtures/<name>.ndjson.br
```

Only the frames Endstep sent are kept (brotli; a 13-turn match is 26 KB). Then:

- Tests: `playMatch(name)` in `tests/realMatch.ts` plays it through `EndstepAdapter` and returns
  every state it publishes (see `tests/combatEvents.test.ts`).
- Harness: `harness.html?speed=3#match:<name>` plays it on the board at the pace it came
  (`speed` faster, `?turn=N` from turn N on). The console logs `DAMAGE LANDED <turn>` for each
  blow and `MATCH OVER` at the end.

| Fixture | What it has |
| --- | --- |
| `bot-combats` | 2026-10-11, against Forge AI, 13 turns: five combats of ours (unblocked, double strike, single blocks, a four-creature trade, lethal); the bot never attacks |
| `bot-attacks` | 2026-10-16, against Forge AI (after two short matches), 16 turns: on turn 14 eight Soldier tokens block a Colossal Dreadmaw (six of them) and two Llanowar Elves; the bot wins. Turns 9 to 13 were lost in the recording |
| `arc-lightning` | 2026-10-16, against Forge AI, unfinished: our Arc Lightning divided 2 to a Monastery Swiftspear and 1 to the bot, asked as targets then one `CHOOSE_NUMBER` per target; the bot's own Arc Lightning |
| `bot-trample` | 2026-10-16, against Forge AI, unfinished (turn 19): the bot's Colossal Dreadmaw blocked by four Soldiers (2 trample over), by two (4 over) and by six (it dies). Turns 4 to 11 came with Endstep's tab hidden: no events, turn 11's `ATTACKERS_DECLARED` included |

## Unit tests

```sh
pnpm test
```

140 tests at the end of the 2026-10-14 session.
