# Log of the prompts that step aside

| | |
| --- | --- |
| Status | **Done** (2026-10-07, roadmap t1-3) |

When the board can't answer a prompt, it steps aside for Endstep's own UI (mode `classic`). Every
such prompt is now recorded, so what's still missing can be read from real matches instead of
guessed.

## Where to look

- **Debug panel → Unsupported** (Alt+Shift+D). One line per kind of prompt (its type, context and
  the card asking), most recent first, with how many times it was asked, when it was last seen,
  Endstep's message, and the whole `pendingAction` it sent. *Copy all as JSON* copies the list,
  *Clear* empties it. Kept across matches and reloads (`chrome.storage.local`, at most 60 kinds).
- **`.devlog/unsupported.ndjson`** on the dev build (`pnpm build:dev` + `pnpm dev-server`): one
  line each time, with the raw `pendingAction`. The dev server also prints it.

## What counts

- A prompt is recorded when `deriveMode()` gives `classic`. That covers unknown prompt types, and
  known ones the board can't show (an `ARRANGE_CARDS` without cards, a sideboarding prompt without
  its list, a damage division without options).
- Each prompt counts once, however many updates redraw it (it's told apart by `promptKey()`).
  Replays aren't recorded.

## Implementation

- `src/game/unsupportedPrompts.ts`: `UnsupportedLog` (`record()`, `list()`, `restore()`,
  `clear()`), and `loadUnsupported()` / `saveUnsupported()`.
- `src/content/index.ts`: records on each state update and saves; reports
  `unsupported-prompt` over the dev bridge.
- `src/ui/DebugViews.ts` → `renderUnsupported()`; `Overlay.ts` → the *Unsupported* tab and its
  buttons.
- `tools/dev-server.mjs`: writes `unsupported.ndjson`.
- Tests: `tests/prompts.test.ts`.
