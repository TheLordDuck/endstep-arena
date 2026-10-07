# Dividing a spell's damage

| | |
| --- | --- |
| Status | **Done** (2026-10-07, roadmap t1-5) |
| Verified in a real match | No: the prompt's exact shape for a spell hasn't been seen yet |

Fireball, Arc Lightning and the like divide their damage among their targets. The board does it on
the table, as MTG Arena does: a counter on each target, the message in a strip across the middle,
the spell on the stack with arrows to its targets. Combat damage keeps the full-screen
[damage assignment](damage-assignment.md) screen. A divided spell on the stack shows each target's
share on its arrow.

## On the table

- Each target (a creature, or a player's picture) gets a counter: ▲ the amount ▼. Click the card
  (or ▲) for +1, right-click it (or ▼) for −1; Ctrl goes to lethal. A target with some damage glows.
- The strip across the middle shows Endstep's message and what's left ("2 of 3 left to assign",
  "Each target needs at least 1", "All assigned: Submit").
- The spell sits on the stack, glowing, with an arrow to each target given some damage.
- **Submit** (Space or Enter) sends the split once it's allowed; **Reset** (R) goes back to the
  starting split.
- In `Board.ts`: `boardDivide()`, `divideIndex()`, `divideBanner()` and `placeDivideBadges()` (called
  from `drawArrows()`, so the counters follow the cards). CSS: `.prompt.div-strip`, `.dbadge`.

## How Endstep does it

From its client (`GameView-*.js`). Endstep has no screen of its own for a spell's division:

- Its only division UI is the damage bar used for `ASSIGN_DAMAGE` and `DIVIDE_SHIELD` (the answer
  is `CHOOSE_CARDS` with an amount per option). So a spell's division arrives as one of those two
  prompts. Which one, and what the message says, is still to be seen in a real match.
- The stack lists each target with its share: `targets: [{ id, zone, dividedAmount }]`. Its log
  reads "3 to Grizzly Bears, 1 to Opponent".

## Telling a spell from combat

`divideKind()` in `normalize.ts` decides what's divided:

| Prompt | Kind |
| --- | --- |
| `DIVIDE_SHIELD` that speaks of shields, or not of damage | Shield counters |
| A message that says "combat" | Combat |
| A source attacking or blocking, or a combat damage step (`FIRST_STRIKE_DAMAGE`, `COMBAT_DAMAGE`) | Combat |
| Anything else (a spell being cast, an ability) | Spell |

## A spell's rules

- **No lethal-first rule.** The defending player isn't locked until every creature has lethal
  damage: that rule is trample's (`freeSpill` is set).
- **At least 1 to each target** (rule 601.2d), when there's enough damage to go round. *Submit* stays
  off until each target has some, a counter still at 0 is outlined, and the strip says so.
- **Starting split:** 1 to each target, then creatures topped up to lethal in order, the rest to
  the last target. Arc Lightning's 3 among two creatures and a player: 1 / 1 / 1.

## On the stack

`toStackItem()` reads `dividedAmount` into `StackItemView.divided` (by target key).
`drawArrows()` puts each share in a disc near the arrow's head, and the debug panel's stack list
reads "1 to Vampire Nighthawk".

## Not covered

If Endstep asks for the division as numbers instead (a `CHOOSE_NUMBER` per target, "how much to
X?"), the board's number picker already answers it. If it asks in some other way, the prompt now
lands in the debug panel's *Unsupported* tab ([unsupported-prompts.md](unsupported-prompts.md)) with
everything Endstep sent.

Harness: `#fireball` (the screen), `#divided` (the stack). Tests: `tests/prompts.test.ts`.
