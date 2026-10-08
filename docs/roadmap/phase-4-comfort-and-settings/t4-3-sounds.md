# t4-3 · Sounds

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 4 · Comfort and settings](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-08 |
| Done on | 2026-10-08 |

Sounds for casting, passing, hitting and winning, with a switch. Arena's own sounds may be used (personal use: the extension isn't published in the stores).

## What existed before

The board had no sound.

## What was done

- Thirteen sounds: `cast`, `resolve`, `land`, `pass`, `attack`, `hit`, `zap` (a spell's damage),
  `exile`, `token`, `counter`, `turn` (yours starts), `win`, `lose`. A burst of changes makes one
  sound, not one per card.
- Each plays a file from `public/sounds/` named after it (`cast.ogg`, `hit.wav`…) when there is
  one, so Arena's own sounds can be dropped in. Without a file the board plays nothing: Endstep's
  page keeps running under it and plays its own sounds, which are what you hear for now.
- The build lists the files present in `dist/sounds/index.json`. The folder is git-ignored
  (except its README), and `pnpm run package` leaves the audio out of the release zip. Arena's
  files are Wizards of the Coast's and stay on your machine. How to get them:
  [public/sounds/README.md](../../../public/sounds/README.md).
- On/off and volume in the settings ([t4-2](t4-2-extension-settings.md)). Turning them on or moving
  the volume plays one to hear it by.
- Code: `src/ui/board/sounds.ts`; `sfx()` calls in `src/ui/board/Board.ts`; `build.mjs`,
  `tools/package.mjs`; `web_accessible_resources` in `public/manifest.json`.

## Done when

- Sounds play at the key moments and can be turned off. Not heard in a real match yet (headless
  Chrome has no audio).

## History

- 2026-10-07: added to the roadmap.
- 2026-10-08: approved (with Arena's sounds allowed) and done.
- 2026-10-08: the synthesized sounds removed: they played on top of Endstep's own. Only files from `public/sounds/` play.
- 2026-10-08: Endstep's damage sound waits for the board's hit to land (`src/inject/damageSound.ts`).
