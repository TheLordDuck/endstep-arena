# Endstep Arena UI

A Chromium (MV3) extension that layers a modern, card-first game UI on top of
[endstep.cc](https://endstep.cc/) matches. It is visual only: Endstep's server and
rules engine stay the source of truth, and nothing is sent to the server that
Endstep's own UI wouldn't send.

**Status: playable Arena board (unverified against live traffic).** During a match the
extension covers Endstep with its own board and plays through Endstep's socket.
Prompts it can't handle yet (arranging cards, card-name search, sideboarding)
automatically step aside so Endstep's own panel can answer them.

## Install (development)

```sh
npm install
npm run build        # or: npm run watch
```

Then open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**,
click **Load unpacked** and pick the `dist/` folder. After each rebuild, click the
reload icon on the extension card and refresh the endstep.cc tab.

## Play

| Do this | To |
| --- | --- |
| Drag a glowing (blue) hand card up onto the table and release | Cast / play it (Ctrl keeps priority) |
| Drag a card from the small hand on the right | Play it from the graveyard / exile / command zone (flashback, escape…) |
| Click a glowing permanent | Activate it (a menu appears if it has several abilities) |
| **Undo** (above the big button) | Take back the last action, when Endstep allows it |
| Right-click a card | Full card (all its text) in the left column, plus a menu when there is something to do with it |
| Click a step on the turn tracks (center) | Toggle whether the game stops there; a gold dot = stop. All steps stop by default |
| Click gold-glowing cards or avatars | Choose targets, attackers, or cards |
| Blocking: click your creature, then the attacker | Assign the block (click again to undo) |
| Mana payment: click lands | Tap them, or press **Auto pay** |
| Big button (bottom-right) | Pass / Next / Resolve / Attack / Block / Done |
| Click a graveyard, exile or command pile | Browse it (flashback etc. can be cast from there) |
| **Alt+Shift+A** or *Classic UI* | Switch between the Arena board and Endstep's UI |
| **Alt+Shift+D** or *Debug* | Debug panel (game state, events, network, raw) |

## Development

* `npm run build:dev` + `npm run dev-server`: the dev build reports frames and state
  to `.devlog/` so they can be inspected offline.
* `node build.mjs --harness` builds `dist-harness/harness.html#<scenario>`
  (`priority`, `stack`, `attack`, `block`, `target`, `mulligan`, `mode`, `order`, `pay`): the board
  rendered from fixture states, with no live match needed.

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
| `npm run build` | Bundle to `dist/` |
| `npm run watch` | Rebuild on change (inline source maps) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Adapter tests (delta merge, resync, routing) |

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
