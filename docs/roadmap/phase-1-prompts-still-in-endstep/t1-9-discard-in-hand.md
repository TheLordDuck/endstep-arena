# t1-9 · Discarding from your hand, without a fan

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 1 · Prompts still answered in Endstep's UI](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-08 |

A discard from your own hand (an activated ability's cost, Thoughtseize on yourself) is picked by clicking the cards in your hand, with no fan and no arrow following the pointer.

## What was done

- Endstep marks some of these prompts `contextType: "discard"`, but not all (Faithless Looting's
  discard came up in a fan): any choice whose options are all in your hand is picked there,
  unless it searches your hand (`discardInHand()` in `src/ui/board/modes.ts`).
- *Done* and *Cancel* are in the action buttons. Other choices from your hand (Surgical
  Extraction) keep the fan ([t1-8](t1-8-own-hand-in-a-fan.md)).
- Feature note: [choosing-from-opponent-hand.md](../../features/choosing-from-opponent-hand.md).

## Done when

- Harness: `#discard-cost`, `#self-discard`, `#looting`. Test: `tests/interaction.test.ts`.

## History

- 2026-10-08: added to the roadmap as done.
- 2026-10-08: fixed: Faithless Looting's discard came up in a fan; any choice from your hand alone is now picked on it.
