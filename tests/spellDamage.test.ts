// The damage shown on a creature a spell killed: what the spell dealt, not what was left of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { damageDealt } from "../src/game/spellDamage";
import type { CardView, GameState, LogEntry, StackItemView } from "../src/game/GameState";

const bears = { id: "7", name: "Grizzly Bears", toughness: "2", damage: 0 } as CardView;
const bolt = (extra: Partial<StackItemView> = {}) => ({
  id: "5", name: "Lightning Bolt", isAbility: false, targets: ["7"],
  card: { id: "5", name: "Lightning Bolt", oracleText: "Lightning Bolt deals 3 damage to any target." } as CardView, ...extra,
}) as StackItemView;
const at = (log: LogEntry[]) => ({ log } as GameState);
const damaged = (seq: number, line: string): LogEntry => ({ seq, type: "CARD_DAMAGED", lines: [line], cards: [{ id: "5", name: "Lightning Bolt" }, { id: "7", name: "Grizzly Bears" }] });

test("a Bolt killing a 2-toughness creature dealt 3: from Endstep's event, else from its text", () => {
  // The event that came with this update.
  assert.equal(damageDealt(at([]), at([damaged(4, "[[Lightning Bolt]] deals 3 damage to [[Grizzly Bears]].")]), bolt(), bears), 3);
  // An older event about the same card doesn't count; the text says 3.
  const old = damaged(2, "[[Shock]] deals 2 damage to [[Grizzly Bears]].");
  assert.equal(damageDealt(at([old]), at([old]), bolt(), bears), 3);
  // No event yet, and the text names it.
  assert.equal(damageDealt(at([]), at([]), bolt(), bears), 3);
});

test("X spells, divided damage, and text naming no single amount", () => {
  const fireball = (x?: number) => bolt({ name: "Fireball", ...(x !== undefined ? { x } : {}),
    card: { id: "5", name: "Fireball", oracleText: "Fireball deals X damage divided evenly, rounded down, among any number of targets." } as CardView });
  assert.equal(damageDealt(at([]), at([]), fireball(5), bears), 5);
  assert.equal(damageDealt(at([]), at([]), bolt({ divided: { "7": 4 } }), bears), 4);
  // Nothing to go by: what was left of its toughness, the least it took.
  assert.equal(damageDealt(at([]), at([]), fireball(), { ...bears, damage: 1 }), 1);
  const charm = bolt({ card: { id: "5", name: "Charm", oracleText: "Choose one — deals 2 damage to target creature; or deals 4 damage to target player." } as CardView });
  assert.equal(damageDealt(at([]), at([]), charm, bears), 2);
});
