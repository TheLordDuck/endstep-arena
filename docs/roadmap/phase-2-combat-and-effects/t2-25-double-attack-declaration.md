# t2-25 · Two attack declarations at once

| | |
| --- | --- |
| Status | **To do** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Fix |
| Needs approval | No (marked done directly) |

In a match on 2026-10-16 (09:19, match 16048950, in the dev bridge's recording) the board sent two `DECLARE_ATTACKERS` in the same instant with the same `promptVersion`: one attacking with a Monastery Swiftspear, one with no attackers.

## What exists now

Unknown which path sent the second one: a double click, the main button and a shortcut, or the "no attackers" choice.

## What it involves

- Find the cause in the recording and the board's attack paths, and send one answer per prompt.

## Done when

- Declaring attackers sends exactly one `DECLARE_ATTACKERS`.

## History

- 2026-10-16: added to the roadmap.
