# t2-4 · Token entrance

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-07 |
| Done on | 2026-10-08 |

Tokens come in with a flash instead of just appearing.

## What existed before

Tokens appeared with the generic entry animation.

## What was done

- A token new on the battlefield grows in from small, overbright, with a burst of golden light and
  a ring opening out where it appears. Other new cards keep the generic entry.
- Read from the states (a new card with `isToken`), not from a `TOKEN_CREATED` event.
- Code: `tokenEntrance()` in `src/ui/board/Board.ts`; `.token-burst` in `src/styles/board.css`.

## Done when

- Tokens have their own entrance. Harness: `#tokens` (Raise the Alarm makes two Soldiers). Not
  seen in a real match yet.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-07: approved.
- 2026-10-08: done.
