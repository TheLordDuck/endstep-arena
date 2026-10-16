# t1-6 · Check dividing shield counters

| | |
| --- | --- |
| Status | **Rejected** |
| Phase | [Phase 1 · Prompts still answered in Endstep's UI](README.md) |
| Type | Fix |
| Needs approval | No (marked done directly) |
| Rejected on | 2026-10-16 |

`DIVIDE_SHIELD` uses the damage assignment screen; it hasn't been seen in a real match.

## What exists now

`DIVIDE_SHIELD` uses the damage screen (as in Endstep), but only `ASSIGN_DAMAGE` was tried, in the harness.

## What it involves

- Try a card that divides shield counters and fix the wording (it says "combat damage" now).

## Why rejected

Rejected by the user on 2026-10-16, after putting it on hold the same day: which cards bring `DIVIDE_SHIELD` isn't known. Tried in real
matches: Druid's Deliverance (prevents all combat damage to you, nothing to divide: no prompt) and Arc
Lightning (divides its damage with one `CHOOSE_NUMBER` per target, see
[t1-5](t1-5-divide-spell-damage.md)). Endstep's client calls it "Distribute shield counters"; in
Forge, which Endstep seems to run, it may be damage prevention divided among targets instead. If it
ever comes, the damage assignment screen still answers it (with its combat wording).

## Done when

- Works in a real match, with fitting wording.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-16: on hold (no card known to bring it).
- 2026-10-16: rejected.
