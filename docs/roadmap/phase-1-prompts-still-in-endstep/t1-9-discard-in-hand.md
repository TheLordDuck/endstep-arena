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

- Endstep marks these prompts `contextType: "discard"`. A message saying "discard" counts too,
  and every option must be in your hand (`discardInHand()` in `src/ui/board/modes.ts`).
- *Done* and *Cancel* are in the action buttons. Other choices from your hand (Surgical
  Extraction) keep the fan ([t1-8](t1-8-own-hand-in-a-fan.md)).
- Feature note: [choosing-from-opponent-hand.md](../../features/choosing-from-opponent-hand.md).

## Done when

- Harness: `#discard-cost`, `#self-discard`. Test: `tests/interaction.test.ts`.

## History

- 2026-10-08: added to the roadmap as done.
