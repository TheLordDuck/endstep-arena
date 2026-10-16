# t3-11 · Explain counters in the hover boxes

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

The boxes beside an enlarged card in Arena explain not only keywords but the counters on it, with their number ("3 +1/+1 Counters", "Stun Counter: if a permanent with a stun counter would become untapped, remove one instead", "2 Lore Counters" on a Saga). Seen in I3hPJQyUBV4 1:02:45, a2dMvbEqDwY 46:25 and 59:05, AljeoQkXR5Q 12:05.

## What existed before

The glossary (`keywords.ts`) only has keywords.

## What was done

- The boxes beside an enlarged card explain each kind of counter on it, with how many ("3 +1/+1 Counters"), in green, above the keyword boxes (`counterNotes()` in `src/ui/board/keywords.ts`).
- Texts for +1/+1, −1/−1 and other P/T counters, stun, shield, lore, loyalty, finality, time, oil, charge, level, fade, age, quest, bounty, page, rev and lock; keyword counters (flying, deathtouch…) say the card has that keyword; any other kind gets a generic line.
- The old "kind ×N" line under the card is gone.
- Commit `e4318aa`.

## Done when

- Enlarging a card with counters explains each kind, with how many.
- Harness scenario `info` (Tarmogoyf with three +1/+1 counters and a stun counter). Checked in the harness, not yet in a live match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done (`e4318aa`).
