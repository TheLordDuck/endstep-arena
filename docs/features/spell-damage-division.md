# Dividing a spell's damage

| | |
| --- | --- |
| Status | **Done** (2026-10-07, roadmap t1-5) |
| Verified in a real match | The prompts yes (Arc Lightning, 2026-10-16, `tests/fixtures/arc-lightning`); the board's answer in the harness |

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

## Change of 2026-10-16: how Endstep really asks it

A real match showed it (Arc Lightning on a Monastery Swiftspear and the opponent). Endstep doesn't
use its damage bar for a spell: it asks

1. `CHOOSE_TARGETS` "Select any target to distribute damage to" (`min` 1, `max` 3), with
   `sourceCardId`, `sourceSpellAbilityId` and `sourceAbilityText`;
2. then one `CHOOSE_NUMBER` per target, in the order they were sent: "Assign 3 remaining to Monastery
   Swiftspear (Arc Lightning)" (`minValue` 1, `maxValue` 2: enough must be left for each other
   target), then "Assign 1 remaining to Forge AI (Arc Lightning)" (1 to 1), each answered with
   `{ type: "CHOOSE_NUMBER", numberValue }`.

The board used to answer those with its number picker, one target at a time, never showing the
whole split. Now (`asSplit()` / `answerSplit()` in `Board.ts`, `splitAsk()` in `modes.ts`):

- The targets the board sends for a prompt that speaks of distributing or dividing are kept.
- The first number question becomes the division on the table described above (`numberSplit` on
  the prompt, `ASSIGN_DAMAGE` with the kept targets), the strip reading "Arc Lightning divides 3
  damage among its targets".
- **Submit** answers that question with its target's share, and each next question as it comes
  (matched by the target's name, in order), the division staying on the table meanwhile.
- Targets chosen in Endstep's own panel, or any other number question, keep the number picker.
- **Targets out of their piles.** A target that's one of a pile of identical cards (five Monastery
  Swiftspears) comes out of it as soon as it's picked, and stays out while the spell is divided and
  paid for (`aimedAt`, the targets sent, by the card they're for) until it's on the stack, where the
  stack's targets keep it apart. Before, it went back into the pile once the targets were sent, and
  its counter had nowhere to show.

## Not covered

A division Endstep asks in another way lands in the debug panel's *Unsupported* tab
([unsupported-prompts.md](unsupported-prompts.md)) with everything Endstep sent.

Harness: `#fireball` (the screen), `#divided` (the stack), `#arc-lightning` (the real flow: pick
a Swiftspear out of a pile of three and the opponent, confirm, divide, submit; the console logs the
three actions). Tests:
`tests/prompts.test.ts` (one on the recorded prompts).
