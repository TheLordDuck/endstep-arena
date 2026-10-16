# t2-25 · Two attack declarations at once

| | |
| --- | --- |
| Status | **To do** |
| Phase | [Phase 6 · Later](README.md) |
| Type | Fix |
| Needs approval | No (marked done directly) |

In a match on 2026-10-16 (09:19, match 16048950, in the dev bridge's recording) the board sent two `DECLARE_ATTACKERS` in the same instant with the same `promptVersion`: one attacking with a Monastery Swiftspear, one with no attackers.

## What exists now

Unknown which path sent the second one: a double click, the main button and a shortcut, or the "no attackers" choice.

## What was done (not yet checked in a real match)

- The recording of what was sent is gone, so the cause wasn't seen. Likeliest: Space or Enter, which Endstep's hidden combat prompt also takes, answering with nothing chosen.
- While attackers or blockers are being chosen, Space and Enter (key down, up and press) are kept from Endstep's own UI.
- `GameController` sends one attack (or block) declaration per prompt version; a second within 3 s is dropped. Test in `tests/adapter.test.ts`.

## What it involves

- Find the cause in the recording and the board's attack paths, and send one answer per prompt.

## Done when

- Declaring attackers sends exactly one `DECLARE_ATTACKERS`.

## History

- 2026-10-16: added to the roadmap.
- 2026-10-16: two guards added; to be checked in a real match.
- 2026-10-16: moved to Phase 6 · Later (to be done in the future).
