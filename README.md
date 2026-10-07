# Endstep Arena UI

A Chromium (MV3) extension that layers a modern, card-first game UI on top of
[endstep.cc](https://endstep.cc/) matches. It is visual only: Endstep's server and
rules engine stay the source of truth, and nothing is sent to the server that
Endstep's own UI wouldn't send.

**Status: playable Arena board.** During a match the extension covers Endstep with its own
board and plays through Endstep's socket. Prompts it can't handle yet (Phyrexian mana, for one)
automatically step aside so Endstep's own panel can answer them. Unofficial: not affiliated with Endstep or Wizards of the Coast.

## Install in Chrome

1. Download the latest `endstep-arena-ui-<version>.zip` from the
   [Releases page](https://github.com/TheLordDuck/endstep-arena/releases/latest).
2. Unzip it into a folder you'll keep (Chrome loads the extension from there, so don't
   delete it afterwards).
3. Open `chrome://extensions`, and turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder (the one containing `manifest.json`).
5. Open [endstep.cc](https://endstep.cc/) and start a match: the Arena board appears over it.
   **Alt+Shift+A** switches between the Arena board and Endstep's own UI.

Edge works the same way: `edge://extensions`, **Developer mode** (left), **Load unpacked**.

**Updating:** download the new zip, unzip it over the same folder (replacing the files), then
click the reload icon on the extension's card in `chrome://extensions` and refresh the
endstep.cc tab.

## Install (development)

```sh
pnpm install
pnpm build           # or: pnpm watch
```

Then open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**,
click **Load unpacked** and pick the `dist/` folder. After each rebuild, click the
reload icon on the extension card and refresh the endstep.cc tab.

## Play

| Do this | To |
| --- | --- |
| Drag a glowing (blue) hand card up onto the table and release | Cast / play it (Ctrl keeps priority) |
| Drag a hand card sideways and release it within the hand | Move it to that spot (your order is kept; new cards join on the right) |
| Drag a card from the small hand on the right | Play it from the graveyard / exile / command zone (flashback, escape…) |
| Click a glowing permanent | Activate it (a menu appears if it has several abilities) |
| **Undo** (above the big button) | Take back the last action, when Endstep allows it |
| Right-click empty table | Game menu: Endstep's own items (decklist, auto-yields, settings, reports, reload…) open Endstep's window while the board steps aside; **Concede** asks to confirm first |
| Right-click a card | Full card (all its text) in the left column, plus a menu when there is something to do with it |
| Click a step on the turn tracks (center) | Toggle whether the game stops there; a gold dot = stop. All steps stop by default |
| Click gold-glowing cards or avatars | Choose targets, attackers, or cards |
| Blocking: click your creature, then the attacker | Assign the block (click again to undo) |
| Mana payment: click lands | Tap them, or press **Auto pay** |
| Big button (bottom-right) | Pass / Next / Resolve / Attack / Block / Done |
| Click a graveyard, exile or command pile | Browse it as a fan of cards (flashback etc. can be cast from there) |
| Choosing cards from a library, graveyard or exile | Click cards in the fan (orange = picked), then **Submit**; scroll with the wheel or the slider |
| Choosing from the opponent's hand (Thoughtseize, Thought-Knot Seer…) | Same fan: their revealed cards are picked there, not on their hand |
| Dividing combat damage among blockers | Click a card +1, right-click −1, Ctrl-click to lethal (or − / +); the trampled player unlocks once every blocker has lethal; **Done** or Space confirms, R resets |
| Sideboarding (between games) | Click a card to move one copy between the main deck and the sideboard (Shift: every copy), or drag it; **Confirm** when the main deck's size is allowed, **Keep current** for the registered deck, **Withdraw** to edit again after confirming |
| Choosing a pile (Fact or Fiction…) | Click a pile, then **Take Pile N** |
| Separating cards into two piles (an opponent's Fact or Fiction) | Click or drag cards between **Pile 1** and **Pile 2**, then **Done** |
| Learn | **Show sideboard** fans out your Lessons, **Show hand** the cards you can discard to draw instead; click a card, then **Submit** |
| **View battlefield** (top right of a mulligan, Choose One, trigger order…) | Set the choice aside to look at the table; click again to go back |
| Scry / surveil: click or drag a card between the two piles | Keep it on top (leftmost = next) or send it to the bottom / graveyard; drag within a pile to reorder |
| Click a permanent with several abilities | Pick one of its ability cards (Choose One); a land that makes several colors opens the mana wheel instead |
| Mana wheel: click a color (center cancels) | Make that color of mana |
| Choosing X (or any number): − / +, a quick pick, ↑/↓ (Shift: 5), digit keys, Enter | Set the number, then **Choose X = n**; **Undo** takes the cast back when Endstep allows it |
| ◂ ▸ beside a crowded zone | Page through lands or artifacts/enchantments (two rows) or planeswalkers/Sagas (3×2 grid); creatures shrink to fit their line instead |

Identical permanents pile together (×N), four at most per pile: more copies (basic lands, tokens)
make another pile beside it.

Cards exiled "until ~ leaves the battlefield" (Portable Hole, Oblivion Ring, Fiend Hunter…) lie
turned and greyed under the permanent holding them. Endstep doesn't send that link, so it is
inferred when the card lands in exile, and a page reloaded mid-game won't show links made
before the reload.

Revealed cards (from a hand, a library…) pop up near the top of the table for a few seconds
(✕ closes them; right-click a card to enlarge). A card revealed from the opponent's hand stays
face up there, with an eye mark, while it's still in that hand; face-down cards you're allowed
to see (your morphs, cards you exiled face down) show their front the same way. Keywords an effect gave a permanent show in green on it, lost ones in red.

In a timed match each player's clock sits by their picture (gold while running, red under 30 s), and a
player taking too long to act gets a countdown to when they forfeit.
| **H** or *Hold priority* | Keep priority after what you cast or activate, until switched off |
| *End turn* (under the action buttons) | Pass priority for the rest of your turn |
| *Pass until…* (by the action buttons) | Pass priority until combat, the end step, the opponent's end step or your next turn; it stops early if the opponent casts something or you're asked anything. *Stop passing* ends it |
| Hover or right-click a card with keywords | Boxes beside it explain each keyword (flying, trample, ward…) |
| **Alt+Shift+A** or *Classic UI* | Switch between the Arena board and Endstep's UI |
| **Alt+Shift+D** or *Debug* | Debug panel (game state, events, network, raw) |
| Replays: drag the **⠿** grip of the control bar | Move the bar anywhere on the board (remembered); double-click the grip to put it back |

## Development

* `pnpm build:dev` + `pnpm dev-server`: the dev build reports frames and state
  to `.devlog/` so they can be inspected offline.
* `node build.mjs --harness` builds `dist-harness/harness.html#<scenario>`
  (`priority`, `stack`, `attack`, `block`, `target`, `mulligan`, `mode`, `pw`, `order`, `pay`, `exile`, `surveil`, `scry`, `mana`, `abilities`, `search`, `learn`, `graveyard`, `crowded`, `reveal`, `x`, `strike`, `damage`, `damage-split`, `win`, `discard`, `tks`, `clock`, `clock-opp`, `keywords`, `piles`, `split`, `sideboard`, `copies`, `replay`): the board
  rendered from fixture states, with no live match needed. See [docs/testing.md](docs/testing.md).
* [docs/](docs/README.md): how Endstep works, feature notes, the changelog and the roadmap.

## Publishing

1. Bump `version` in `public/manifest.json` (every upload needs a higher one).
2. `pnpm run package` builds for production and writes `releases/endstep-arena-ui-<version>.zip`
   (it refuses a dev build).
3. Upload that zip in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole)
   (or [Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge/overview), same zip).

For a GitHub release: commit and push, then on the repository's **Releases** page choose
**Draft a new release**, create a tag `v<version>` (matching the manifest), add notes, attach
the zip from `releases/`, and publish. The install steps above point at the latest release.

The logo is `public/icons/icon.svg` (32/48/128 px) and `icon-small.svg` (16 px, simplified to
stay readable); the PNGs next to them are rendered from those.

## How it works

```
Endstep socket (wss://endstep.cc/ws)
      │ observed read-only
src/inject/wsTap.ts            MAIN world: observes the socket; sends whitelisted GAME_ACTIONs
      │ window.postMessage
src/content/index.ts           isolated world: bridge, settings, mounting
      │
src/game/endstep/              EndstepAdapter: applies GAME_STATE / GAME_DELTA exactly like
      │                        Endstep's client, then normalize() → GameState
src/game/GameState.ts          normalized model, independent of Endstep
      │
src/ui/board/                  Arena board: keyed cards + FLIP, modes.ts (targets/attack/block),
      │                        GameController (UI intent → Endstep wire action)
```

* **Why the socket and not the DOM:** Endstep has no global state object. The socket
  carries the complete, authoritative state (including `pendingAction`, the legal
  actions) and is much more stable than React's generated markup.
* **Isolation:** the UI lives in a shadow root with `all: initial` on the host.
  Endstep's DOM is never modified, so turning the layer off restores the original page exactly.
* **If Endstep changes:** only `src/game/endstep/` should need edits.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm build` | Bundle to `dist/` |
| `pnpm watch` | Rebuild on change (inline source maps) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Adapter tests (delta merge, resync, routing) |

## Roadmap

1. ✅ Minimal extension: manifest, content scripts, match detection, overlay, ON/OFF
2. ✅ Read the game state into `GameState`: done from protocol analysis, **still needs verification in a real match**
3. Render the battlefield, players, life and zones (hide Endstep's board while ON)
4. Card visuals: hover, zoom, tapped rotation, selection
5. Hand fan layout
6. Stack and phase indicator
7. Combat arrows
8. Interactions (actions go through `pendingAction`, sent as Endstep's own `GAME_ACTION` frames)
9. Animations
10. Polish: responsive, performance, accessibility, settings
