# t2-20 · Modal spells on the stack, the modes not chosen in grey

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

In Arena a modal spell on the stack (Rankle's Prank in AljeoQkXR5Q 22:25) shows its text with the modes not chosen dimmed, so you see what will happen without asking.

## What existed before

The stack showed the card as it is.

## What was done

- Endstep doesn't send the chosen modes as such. It does send a spell's description on the stack (`abilityDescription`, now kept as `description` in `normalize.ts`), which spells out only what the chosen modes do: "Kolaghan's Command (940) - Flavio discards a card. Kolaghan's Command deals 2 damage to Serra Angel (120)."
- `chosenModes()` in `src/ui/board/abilityText.ts` matches each "•" line of the card against it (the spell's own name doesn't count; half of a mode's words is enough, since Endstep names the targets). The modes you pick yourself (`CHOOSE_MODE`) are remembered and used first; if Endstep ever sends `chosenModes`, that wins.
- The card's text is laid over its text box on the stack and in the magnifier, each mode on its line, the ones not chosen at 40 %. When it can't be told which were chosen, the card shows as before.

## Done when

- Checked in the harness (`modal`: Kolaghan's Command with two of four modes). The description's wording comes from Forge; not yet seen with a modal spell in a recorded match.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done.
