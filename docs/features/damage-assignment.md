# Damage assignment

| | |
| --- | --- |
| Status | **Done** (2026-10-07, release 0.5.0) |
| Verified in a real match | No: see roadmap [t0-2](../roadmap/phase-0-finish-open-work/t0-2-verify-in-real-match.md) |

When an attacker blocked by several creatures (or with trample) divides its damage, Endstep asks
with an `ASSIGN_DAMAGE` prompt. The board used to step aside for Endstep's own panel; it now has its
own screen. `DIVIDE_SHIELD` (dividing shield counters) uses the same screen, as in Endstep, and so
does a spell dividing its damage among its targets, with a spell's rules: see
[spell-damage-division.md](spell-damage-division.md).

## How Endstep does it

From its client (`GameView-*.js`, the "Combat · Divide Damage" bar).

**Prompt** (`pendingAction`):

| Field | Meaning |
| --- | --- |
| `type` | `ASSIGN_DAMAGE` or `DIVIDE_SHIELD` |
| `maxValue` | Total damage to divide |
| `sourceCardName` | The attacker (Endstep finds it on the battlefield by name, among creatures in combat) |
| `cardOptions[]` | The blockers in order; with trample, the defending player last (`types` includes `"Player"`) |
| `cardOptions[].lethalDamage` | Damage that's lethal to it (already 1 against deathtouch) |
| `overrideOrder` | When `true`, damage may be divided freely, without lethal to each blocker first |

**Answer:** `{ type: "CHOOSE_CARDS", orderedCards: [amount per option, in the prompt's order], promptVersion }`.

**Rules:**

- Starting split: lethal to each blocker in order; the rest goes to the last one reached (the
  player, with trample). When the first option's lethal isn't known, everything starts at 0.
- The player is locked while any blocker lacks lethal damage (unless `overrideOrder`).
- Taking a blocker below lethal takes back whatever had gone through to the player.
- Click +1, right-click −1, Ctrl-click up to lethal (or, taking away, down to lethal or to 0).
- Confirmable only once all of it is assigned. Space or Enter confirms; R resets.

## Implementation

- `normalize.ts` → `toDivide()` builds `pending.divide: { kind, total, options: [{ id, name, lethal, player }], freeSpill }`;
  `kind` (combat, spell or shield) comes from `divideKind()`.
- `modes.ts` → mode `{ kind: "divide", amounts }` and pure functions mirroring Endstep's:
  `divideStart`, `allLethal`, `divideLocked`, `divideLeft`, `divideStep`, `divideSet`. A prompt with
  no options falls back to Endstep's panel (`classic`).
- `GameController.divide(amounts)` sends the answer.
- `Board.ts`:
  - `divideBox()` draws the screen; `fillDivideBox()` writes the amounts in. A change only
    updates the box in place, without rebuilding it.
  - `divideButton()` handles clicks, `onContextMenu` the right-click, and the global `keydown`
    Space/Enter/R. Those keys are stopped so Endstep's hidden bar doesn't answer too.
  - `divideSource()` finds the attacker the way Endstep does: by name, among creatures in combat.
- `board.css`: `.divide-box`, `.dsrc` (attacker), `.dtile` (each option), `.dseal` (lethal ✓ seal),
  `.dlock` (the player's padlock).

## The screen

- Left: the attacker with the damage still to assign (a big number and pips).
- Each blocker: its card, pips up to lethal, `+N` past it, a gold ✓ seal once lethal, − / + buttons.
- The defending player (trample): a shield, padlocked 🔒 while a blocker lacks lethal.
- Notes: "Deathtouch · 1 is lethal" for a deathtouch attacker, and the trample rule.
- *Reset* and *Done*.

## Tests

- Harness: `#damage` and `#damage-split` (see [../testing.md](../testing.md)).
- Real clicks over CDP: the player lock, right-click, Ctrl-click, the seal, *Done* disabled while
  damage is left, and `CHOOSE_CARDS [4,2,2]` sent with its `promptVersion`.
- `tests/interaction.test.ts`: starting split, locking and losing the spillover, bounds, Ctrl,
  `overrideOrder`, and the shape of the message sent.
