# t0-3 · Face-down card left under its holder

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 0 · Finish open work](README.md) |
| Type | Fix |
| Needs approval | No (marked done directly) |
| Done on | 2026-10-16 |

After a card exiled face down is cast, its back stays on the opponent's table.

## What existed before

Cards exiled "until X leaves the battlefield" are drawn under the permanent holding them (`src/game/exileLinks.ts`). The link is dropped when the card leaves exile, and that's tested; nothing in the code was found that leaves the card behind.

## What was done

- Nothing in the code: the user saw it working right in their matches (2026-10-16), and it was marked done on that. It was never reproduced with real data, so no test covers it; if it comes back, it can be reopened.

## What it involved

- Suspicion: Endstep keeps listing the face-down card in exile after it's cast, or changes its id (hidden cards may carry ids by position, as the opponent's hand does).
- Endstep sends `CARD_ZONE_CHANGE` events (`cardId`, `fromZone`, `toZone`) that could help, but only if the id matches.
- Needs the `.esreplay` of a game where it happens, or a `.devlog` capture, and the name of the card that exiled it.

## Done when

- Reproduced with real data, fixed, and covered by a test.

## History

- 2026-10-07: added to the roadmap.
- 2026-10-16: done, as the user saw it working; not reproduced, no code changed.
