# Paying Phyrexian mana

| | |
| --- | --- |
| Status | **Done** (2026-10-07, roadmap t1-2) |
| Verified in a real match | No |

A cost with Phyrexian symbols (Dismember's `{1}{B/P}{B/P}`) is paid on the board: tap lands for
mana, or pay 2 life for a symbol. Before, the board offered no way to pay life, and the action
Endstep expects wasn't on the extension's list of allowed actions, so these payments needed
Endstep's own panel.

## How Endstep does it

From its client (`GameView-*.js`, the pay panel and the player plate).

- The normal payment prompt, `PAY_MANA`, carries `phyrexianMana: true` while a Phyrexian symbol is
  left that life can pay. Its panel then says "Click your plate to pay 2 life", and your plate is
  lit (`data-phyrexian-target`, label "Pay 2 life for Phyrexian mana").
- Clicking the plate (or Enter on it) sends `{ type: "PAY_LIFE_PHYREXIAN", promptVersion }`, which
  pays one symbol. A new `PAY_MANA` follows with what's left.
- Mana for the symbols is paid as usual: tapping lands (`TAP_MANA`), floating mana
  (`USE_FLOATING_MANA`) or *Auto pay*.

## On the board

- With a Phyrexian symbol left, your plate lights up like a target; clicking it pays 2 life. The
  action buttons add **Pay 2 life**, which does the same.
- Everything else about the payment is unchanged (lands, floating mana, Auto pay, Cancel).

## Implementation

- `normalize.ts`: `pending.phyrexian` is true for a `PAY_MANA` with `phyrexianMana: true`.
- `protocol.ts`: `PAY_LIFE_PHYREXIAN` allowed; `GameController.payPhyrexianLife()` sends it.
- `Board.ts`: `phyrexianLifeKey()` is your plate's key while life can pay. `isSelectable()` lights
  it, `onSelectKey()` pays on a click, and `renderDock()` adds the *Pay 2 life* button.
- Harness: `#phyrexian` (Dismember). Tests: `tests/prompts.test.ts`.
