# t1-10 · Proliferate on the table

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 1 · Prompts still answered in Endstep's UI](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-08 |

When proliferating, every permanent and player that can get one more counter lights up brightly; click them one by one, or send all of yours at once.

## What existed before

Proliferate came as a plain target choice, with an arrow following the pointer, or as a fan when
players were among the options.

## What was done

- Endstep has no screen of its own for it: it's a `CHOOSE_CARDS` / `CHOOSE_TARGETS` whose message
  names it (`isProliferate()` in `src/ui/board/modes.ts`). Players come as `-(seat + 1)` and are
  picked by their picture.
- Every option glows cyan (`.board.proliferating`), and the ones picked turn orange. There's no
  fan and no arrow.
- Action buttons: **All yours · n** sends every option of the proliferating player's own (their
  permanents and themselves); **Done · n** sends the ones clicked; *Cancel* when it can be backed
  out of.
- `GameController.chooseCards()` now sends a player key as Endstep numbers players.

## Done when

- Harness: `#proliferate`. Test: `tests/interaction.test.ts`. Not seen in a real match yet: the
  message Endstep uses has to say "proliferate".

## History

- 2026-10-08: added to the roadmap as done.
