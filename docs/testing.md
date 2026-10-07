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
- `?point=x,y` / `?click=x,y`: moves the pointer or clicks once the board is up. The click runs
  before full-screen choices appear, so it can't drive them.

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
| `self-discard` | Thoughtseize on yourself: your own hand in a fan |
| `surgical` | Surgical Extraction: copies of Lightning Bolt in hand, graveyard and library, each labelled with its zone |
| `surgical-target`, `surgical-grave`, `surgical-hand`, `surgical-hand-t`, `surgical-library` | Surgical Extraction step by step, as Endstep asks it: the target, then the copies in the graveyard, your hand (as a card or a target choice) and the library, each in its own fan |

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

## Unit tests

```sh
pnpm test
```

97 tests at the end of the 2026-10-07 night session.
