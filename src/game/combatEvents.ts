// Combat as Endstep's game events tell it. The states can't always show a fight: Endstep may go
// through a whole combat in one update (against a bot) or never put the attackers in a state, and
// by the damage step the creatures that died have already lost their attacking and blocking flags.
// Its events say it all, and come seconds before the damage: who attacks (ATTACKERS_DECLARED), who
// blocks whom (BLOCKERS_DECLARED) and each blow (CARD_DAMAGED / PLAYER_DAMAGED, after the
// TURN_PHASE of their damage step). The blows of a step may come just after its state, though.

import type { CombatLink, LogEntry, LogFight } from "./GameState";

export type Blow = NonNullable<LogFight["blow"]> & { seq: number };

/** A turn's latest combat, from its events. */
export interface ToldFight {
  /** The sequence number of the ATTACKERS_DECLARED that began it. */
  since: number;
  attacks: CombatLink[];
  /** Who blocks whom, once BLOCKERS_DECLARED came. */
  blocks?: CombatLink[];
  /** The sequence number of its COMBAT_ENDED, once it came. */
  endedAt?: number;
}

/** The log of the turn that `began` (a TURN_BEGAN's sequence number; -1 for the first one) up to
    the next TURN_BEGAN. */
export function turnLog(log: LogEntry[], began: number): LogEntry[] {
  const next = log.find((e) => e.type === "TURN_BEGAN" && e.seq > began)?.seq ?? Infinity;
  return log.filter((e) => e.seq > began && e.seq < next);
}

/**
 * The turn's latest combat, as its events tell it (null: no attack declared). Who each attacker
 * attacks isn't in the event: from `known` (the states' attacks), or the player it hit, or (two
 * players) the other side from `seatOf` (the seat whose battlefield the card is on).
 */
export function toldFight(turn: LogEntry[], seatOf: (cardId: string) => number | undefined, seats: number, known: CombatLink[] = []): ToldFight | null {
  const declared = turn.filter((e) => e.type === "ATTACKERS_DECLARED" && e.fight?.attackers?.length).at(-1);
  if (!declared) return null;
  const after = turn.filter((e) => e.seq > declared.seq);
  const hits = after.flatMap((e) => (e.fight?.blow ? [e.fight.blow] : []));
  const attacks: CombatLink[] = [];
  for (const id of declared.fight!.attackers!) {
    const seat = seatOf(id);
    const toId = known.find((a) => a.fromId === id)?.toId
      ?? hits.find((b) => b.fromId === id && b.toId.startsWith("player:"))?.toId
      ?? (seats === 2 && seat !== undefined ? `player:${1 - seat}` : undefined);
    if (toId && !attacks.some((a) => a.fromId === id)) attacks.push({ fromId: id, toId });
  }
  const blockers = after.find((e) => e.type === "BLOCKERS_DECLARED");
  const ended = after.find((e) => e.type === "COMBAT_ENDED");
  const attacking = new Set(attacks.map((a) => a.fromId));
  return {
    since: declared.seq,
    attacks,
    ...(blockers ? { blocks: (blockers.fight?.blocks ?? []).filter((b) => attacking.has(b.toId)) } : {}),
    ...(ended ? { endedAt: ended.seq } : {}),
  };
}

/** The blows of a fight's combat damage in the log: damage from a creature in it, after `since`
    and before the combat ends (or the next one, or the next turn, begins). With `step`, only that
    damage step's (a blow whose step isn't known counts as regular). */
export function blowsOf(log: LogEntry[], since: number, fight: { attacks: CombatLink[]; blocks: CombatLink[] }, step?: "fs" | "cd"): Blow[] {
  const fighters = new Set([...fight.attacks, ...fight.blocks].map((l) => l.fromId));
  const blows: Blow[] = [];
  for (const e of log) {
    if (e.seq <= since) continue;
    if (e.type === "COMBAT_ENDED" || e.type === "TURN_BEGAN" || e.type === "ATTACKERS_DECLARED") break;
    const b = e.fight?.blow;
    if (!b || !fighters.has(b.fromId)) continue;
    if (step && (b.step ?? "cd") !== step) continue;
    blows.push({ ...b, seq: e.seq });
  }
  return blows;
}
