// States reach the board one by one, at a pace its animations can be seen at.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, type Raw } from "../src/game/endstep/normalize";
import { MAX_WAIT_MS, needsDwell, StatePacer } from "../src/ui/StatePacer";
import type { GameState } from "../src/game/GameState";

const player = (name: string, battlefield: Raw[] = []) => ({ displayName: name, life: 20, battlefield, graveyard: [], exile: [], commandZone: [] });
let seq = 0;
const game = (extra: Raw = {}, me: Raw[] = []) => normalize({ phase: "MAIN1", stack: [], pendingAction: null,
  players: [player("A", me), player("B")], ...extra }, { matchId: "m", viewerSeat: 0, seq: ++seq, desynced: false });
const bolt = { stackTargetId: 9, sourceCard: { id: 9, name: "Lightning Bolt", controllerId: "0" } };

/** A pacer on a fake clock: `shown` lists what reached the board, `advance` moves time on. */
function setup(dwell = 400, busy = () => 0) {
  let now = 0;
  let timers: { at: number; fn: () => void }[] = [];
  const shown: (GameState | null)[] = [];
  const pacer = new StatePacer({
    show: (s) => shown.push(s), busyUntil: busy, dwellMs: () => dwell, now: () => now,
    schedule: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; },
    cancel: (t) => { timers = timers.filter((x) => x !== t); },
  });
  const advance = (ms: number) => {
    now += ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      due.fn();
    }
  };
  return { pacer, shown, advance, now: () => now };
}

test("a spell going on the stack is worth a moment; attackers and blockers declared too", () => {
  const a = game();
  assert.equal(needsDwell(a, game({ stack: [bolt] })), true);
  assert.equal(needsDwell(game({ stack: [bolt] }), game({ stack: [bolt] })), false);
  assert.equal(needsDwell(a, game({ phase: "DECLARE_ATTACKERS" }, [{ id: 5, name: "Bear", isAttacking: true, attackingDefenderId: -2 }])), true);
  assert.equal(needsDwell(a, game({ phase: "MAIN2" })), false);
  assert.equal(needsDwell(null, game({ stack: [bolt] })), false);
});

test("a spell cast and resolved in a row: the stack shows a moment, then the result", () => {
  const { pacer, shown, advance } = setup(400);
  const start = game();
  const onStack = game({ stack: [bolt] });
  const resolved = game({ pendingAction: { type: "PRIORITY", promptVersion: 2 } });
  pacer.push(start);
  pacer.push(onStack);
  pacer.push(resolved);
  assert.deepEqual(shown, [start, onStack]);
  advance(399);
  assert.equal(shown.length, 2);
  advance(1);
  assert.deepEqual(shown, [start, onStack, resolved]);
});

test("the next state also waits for the board's animations, at most a while", () => {
  let busy = 0;
  const { pacer, shown, advance } = setup(0 + 100, () => busy);
  pacer.push(game());
  busy = 1000;
  pacer.push(game({ phase: "COMBAT_DAMAGE" }));
  pacer.push(game({ phase: "MAIN2" }));
  assert.equal(shown.length, 1);
  advance(999);
  assert.equal(shown.length, 1);
  advance(1);
  assert.equal(shown.length, 3);
  // An animation that never ends doesn't hold the board forever: each state, at most a while.
  busy = 1e9;
  pacer.push(game({ phase: "END_STEP" }));
  pacer.push(game({ phase: "CLEANUP" }));
  advance(MAX_WAIT_MS);
  assert.equal(shown.length, 4);
  advance(MAX_WAIT_MS);
  assert.equal(shown.length, 5);
});

test("a choice of yours on screen doesn't wait; leaving, a replay or animations off show at once", () => {
  const { pacer, shown } = setup(400, () => 1e9);
  pacer.push(game({ pendingAction: { type: "PRIORITY", promptVersion: 1 } }));
  pacer.push(game({ stack: [bolt] }));
  assert.equal(shown.length, 2);
  pacer.push(game());
  pacer.push(null);
  assert.deepEqual(shown.at(-1), null);
  assert.equal(shown.length, 3);
  const off = setup(0, () => 1e9);
  off.pacer.push(game());
  off.pacer.push(game({ stack: [bolt] }));
  off.pacer.push(game());
  assert.equal(off.shown.length, 3);
});
