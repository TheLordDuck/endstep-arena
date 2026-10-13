# t2-16 · One pile per group of identical cards, with a count (×18)

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-13 |
| Done on | 2026-10-13 |

As in Arena, every identical copy (tokens, basic lands) goes in a single pile whatever the number, labeled ×N, with only the top few drawn. Replaces the four-per-pile limit of [t2-7](t2-7-piles-of-four.md). Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What existed before

Piles held four cards at most: nine Mountains made ×4, ×4 and one.

## What was done

- One pile per group (`renderBattlefield()` in `src/ui/board/Board.ts`); `PILE_SHOWN` (4) cards drawn, the rest lie exactly under the backmost one.
- The ×N is a button (`.pile-all`): while attacking or choosing targets, a click uses the whole pile at once (`selectPile()`), a second click takes them back. A click on a single card uses just that one, which moves to a pile of its own. Blocking, paying and activating still take one card at a time.
- Harness scenario `horde`: 18 Soldier tokens and 9 Mountains while declaring attackers.

## Done when

- 18 identical tokens show as one ×18 pile, and one of them can still be used alone. Checked in the harness by clicking through Chrome DevTools: one card gives ×17 plus one attacker; the ×18 gives "18 Attackers"; again, "No Attacks".

## History

- 2026-10-13: added to the roadmap.
- 2026-10-13: done.
