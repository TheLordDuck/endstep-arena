# Roadmap

What's left for the extension to feel like MTG Arena, in phases. Each phase is a folder with a
`README.md` (its goal and a table of its features) and one file per feature with its status card.

**Where decisions are made:** the tracker page https://claude.ai/artifact/43uFfdsXsZiFrf2YzYu4T9 (private to its owner). Features are
approved, rejected and marked done there. These files mirror its state as of
**2026-10-07** and are regenerated from it, not edited by hand.

## Statuses

| Status | Meaning |
| --- | --- |
| Awaiting approval | A new feature; approve or reject it before starting |
| Approved | Approved, not started |
| To do | Needs no approval; not done yet |
| Done | Finished |
| Rejected | Won't be built |

## Summary

Awaiting approval: 6 · Approved: 6 · To do: 11 · Done: 7

**Approved:**

- [t1-1 · Sideboarding screen](phase-1-prompts-still-in-endstep/t1-1-sideboarding.md) (2026-10-07)
- [t1-4 · Choosing a pile, with two visible piles](phase-1-prompts-still-in-endstep/t1-4-choose-pile.md) (2026-10-07)
- [t2-1 · Spells travel when they resolve](phase-2-combat-and-effects/t2-1-spells-travel-on-resolve.md) (2026-10-07)
- [t2-2 · Projectile to the target](phase-2-combat-and-effects/t2-2-projectile-to-target.md) (2026-10-07)
- [t2-4 · Token entrance](phase-2-combat-and-effects/t2-4-token-entrance.md) (2026-10-07)
- [t2-5 · Animate counters and power/toughness](phase-2-combat-and-effects/t2-5-animate-counters.md) (2026-10-07)

## Phases

A phase is **Done** when every feature in it (rejected ones aside) is done, and **In progress** once one is.

| Phase | Phase status | Done | Features by status |
| --- | --- | --- | --- |
| [Phase 0 · Finish open work](phase-0-finish-open-work/README.md) | **In progress** | 4/5 | To do: 1 · Done: 4 |
| [Phase 1 · Prompts still answered in Endstep's UI](phase-1-prompts-still-in-endstep/README.md) | **Not started** | 0/6 | Approved: 2 · To do: 4 |
| [Phase 2 · Combat and visual effects](phase-2-combat-and-effects/README.md) | **Not started** | 0/6 | Approved: 4 · To do: 2 |
| [Phase 3 · Game information](phase-3-game-information/README.md) | **In progress** | 2/4 | Awaiting approval: 1 · To do: 1 · Done: 2 |
| [Phase 4 · Comfort and settings](phase-4-comfort-and-settings/README.md) | **In progress** | 1/4 | Awaiting approval: 2 · To do: 1 · Done: 1 |
| [Phase 5 · Modes and platform](phase-5-modes-and-platform/README.md) | **Not started** | 0/5 | Awaiting approval: 3 · To do: 2 |

## Progress by phase

### [Phase 0 · Finish open work](phase-0-finish-open-work/README.md): In progress (4/5)

- [x] t0-1 · [Commit this session's changes](phase-0-finish-open-work/t0-1-commit-session-changes.md) — Done
- [x] t0-2 · [Verify in a real match](phase-0-finish-open-work/t0-2-verify-in-real-match.md) — Done
- [ ] t0-3 · [Face-down card left under its holder](phase-0-finish-open-work/t0-3-face-down-card-left-on-table.md) — To do
- [x] t0-4 · [Update the README](phase-0-finish-open-work/t0-4-update-readme.md) — Done
- [x] t0-5 · [Release 0.5.0](phase-0-finish-open-work/t0-5-release-0-5-0.md) — Done

### [Phase 1 · Prompts still answered in Endstep's UI](phase-1-prompts-still-in-endstep/README.md): Not started (0/6)

- [ ] t1-1 · [Sideboarding screen](phase-1-prompts-still-in-endstep/t1-1-sideboarding.md) — Approved
- [ ] t1-2 · [Paying Phyrexian mana](phase-1-prompts-still-in-endstep/t1-2-phyrexian-mana.md) — To do
- [ ] t1-3 · [Log the prompts that step aside](phase-1-prompts-still-in-endstep/t1-3-log-prompts-that-step-aside.md) — To do
- [ ] t1-4 · [Choosing a pile, with two visible piles](phase-1-prompts-still-in-endstep/t1-4-choose-pile.md) — Approved
- [ ] t1-5 · [Dividing spell damage](phase-1-prompts-still-in-endstep/t1-5-divide-spell-damage.md) — To do
- [ ] t1-6 · [Check dividing shield counters](phase-1-prompts-still-in-endstep/t1-6-check-divide-shield.md) — To do

### [Phase 2 · Combat and visual effects](phase-2-combat-and-effects/README.md): Not started (0/6)

- [ ] t2-1 · [Spells travel when they resolve](phase-2-combat-and-effects/t2-1-spells-travel-on-resolve.md) — Approved
- [ ] t2-2 · [Projectile to the target](phase-2-combat-and-effects/t2-2-projectile-to-target.md) — Approved
- [ ] t2-3 · [Smoke outside combat too](phase-2-combat-and-effects/t2-3-smoke-outside-combat.md) — To do
- [ ] t2-4 · [Token entrance](phase-2-combat-and-effects/t2-4-token-entrance.md) — Approved
- [ ] t2-5 · [Animate counters and power/toughness](phase-2-combat-and-effects/t2-5-animate-counters.md) — Approved
- [ ] t2-6 · [Commander damage on the player's picture](phase-2-combat-and-effects/t2-6-commander-damage.md) — To do

### [Phase 3 · Game information](phase-3-game-information/README.md): In progress (2/4)

- [ ] t3-1 · [Game log](phase-3-game-information/t3-1-game-log.md) — Awaiting approval
- [x] t3-2 · [Game and turn clocks](phase-3-game-information/t3-2-game-clocks.md) — Done
- [x] t3-3 · [Keyword glossary](phase-3-game-information/t3-3-keyword-glossary.md) — Done
- [ ] t3-4 · [Who has priority and what we're waiting for](phase-3-game-information/t3-4-priority-and-waiting.md) — To do

### [Phase 4 · Comfort and settings](phase-4-comfort-and-settings/README.md): In progress (1/4)

- [ ] t4-1 · [Keyboard shortcuts panel](phase-4-comfort-and-settings/t4-1-shortcuts-panel.md) — To do
- [ ] t4-2 · [Extension settings](phase-4-comfort-and-settings/t4-2-extension-settings.md) — Awaiting approval
- [ ] t4-3 · [Sounds](phase-4-comfort-and-settings/t4-3-sounds.md) — Awaiting approval
- [x] t4-4 · [Pass until…](phase-4-comfort-and-settings/t4-4-pass-until.md) — Done

### [Phase 5 · Modes and platform](phase-5-modes-and-platform/README.md): Not started (0/5)

- [ ] t5-1 · [Spectating with the Arena board](phase-5-modes-and-platform/t5-1-spectating.md) — Awaiting approval
- [ ] t5-2 · [Tables for 3 and 4 players](phase-5-modes-and-platform/t5-2-multiplayer-tables.md) — Awaiting approval
- [ ] t5-3 · [Visual regression tests](phase-5-modes-and-platform/t5-3-visual-regression-tests.md) — To do
- [ ] t5-4 · [Real matches as tests](phase-5-modes-and-platform/t5-4-real-matches-as-tests.md) — To do
- [ ] t5-5 · [Publish to the Chrome Web Store and Edge Add-ons](phase-5-modes-and-platform/t5-5-publish-to-stores.md) — Awaiting approval
