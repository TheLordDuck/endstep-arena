# t1-5 · Dividing spell damage

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 1 · Prompts still answered in Endstep's UI](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-07 |
| Feature note | [spell-damage-division.md](../../features/spell-damage-division.md) |

Fireball, Arc Lightning…: use the damage assignment screen if Endstep asks for a division. Check how the prompt arrives first.

## What exists now

How Endstep asks to divide a spell's damage (Fireball, Arc Lightning…) isn't known.

## What it involves

- If it arrives as `ASSIGN_DAMAGE` / `DIVIDE_SHIELD`, it already uses the damage screen; otherwise adapt it.
- Needs a look at a real match.

## Done when

- Spell damage is divided from the board.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: done.
- 2026-10-16: seen in a real match: Endstep asks the targets, then one `CHOOSE_NUMBER` per target; the board shows them as one division on the table and answers each (see the feature note).
