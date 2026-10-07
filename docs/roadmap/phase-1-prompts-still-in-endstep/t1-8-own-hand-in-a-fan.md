# t1-8 · Choosing cards from your own hand in a fan

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 1 · Prompts still answered in Endstep's UI](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-07 |
| Feature note | [choosing-from-opponent-hand.md](../../features/choosing-from-opponent-hand.md) |

Surgical Extraction on your own graveyard, Thoughtseize on yourself, or any choice of cards from your hand: the cards in a fan with Submit, like an opponent's hand, instead of picking them on your hand with the aiming arrow. When the options come from several zones, each card is labelled with its zone (Hand, Graveyard, Library).

## What exists now

A choice from your own hand was made by clicking the cards in your hand, with an arrow following the pointer; only an opponent's hand went in a fan.

## What it involves

- No hand counts as the table for a card choice: options in any hand bring up the fan.
- While the fan is up, the hands neither light up nor take clicks.
- Label each card with its zone when the options mix zones.

## Done when

- Each step of Surgical Extraction (the target, then the graveyard, the hand and the library) is its own fan, your hand included.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: done.
