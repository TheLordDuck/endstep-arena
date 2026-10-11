# t2-13 · Check combat when the bot attacks

| | |
| --- | --- |
| Status | **To do** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Fix |
| Needs approval | No (marked done directly) |

The match recorded on 2026-10-11 for [t2-12](t2-12-combat-from-events.md) only had our attacks. Check the cases it didn't cover.

## What exists now

Combat is driven by Endstep's events (t2-12), checked against our five attacks in `tests/fixtures/bot-combats.ndjson.br`.

## What it involves

- Record a match (`pnpm build:dev` + `pnpm dev-server`) where the bot attacks and you block, with a double block and an attacker with trample if possible.
- Keep it with `node tools/save-match.mjs <name>` and play it on the board with the harness (`#match:<name>`).
- Check that each blow plays right; add tests for what it shows.

## Done when

- The bot's attacks, double blocks and trample play their strike with the right blockers and damage.

## History

- 2026-10-11: added to the roadmap.
