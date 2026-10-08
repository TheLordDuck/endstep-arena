# t2-9 · Exiling a permanent

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-08 |

A permanent going from the battlefield to exile flares up in pale violet light where it stood, then spins away, shrinking, into its owner's exile vortex, which flares as it swallows it.

## What existed before

The card slid from the battlefield to the exile pile like any other move.

## What was done

- Before the update, `captureExiled()` copies each permanent the update moves from the
  battlefield into exile, as it looks there (tapped included). After it, `banish()` plays the copy:
  a flare with a violet ring, then a spin into the vortex. The vortex flares at the end, and the
  card shows on the pile once it's in.
- A card exiled under the permanent that exiled it (Banisher Priest, Portable Hole) keeps sliding there.
- Nothing plays with "reduce motion".
- Code: `src/ui/board/Board.ts`; `.card.flying.exiling` and `.exile-burst` in `src/styles/board.css`.

## Done when

- An exiled creature visibly goes into the exile vortex. Harness: `#exile-creature` (Swords to
  Plowshares on the Serra Angel). Not seen in a real match yet.

## History

- 2026-10-08: added to the roadmap as done.
