# Roadmap

What's left for the extension to feel like MTG Arena, in phases. Each phase is a folder with a
`README.md` (its goal and a table of its features) and one file per feature with its status card.

**Where decisions are made:** the tracker page https://claude.ai/artifact/43uFfdsXsZiFrf2YzYu4T9 (private to its owner). Features are
approved, rejected and marked done there. These files mirror its state as of
**2026-10-08** and are regenerated from it, not edited by hand.

## Statuses

| Status | Meaning |
| --- | --- |
| Awaiting approval | A new feature; approve or reject it before starting |
| Approved | Approved, not started |
| To do | Needs no approval; not done yet |
| Done | Finished |
| Rejected | Won't be built |

## Summary

Awaiting approval: 1 · Approved: 0 · To do: 5 · Done: 32 · Rejected: 1

**Approved:** none right now.

## Phases

A phase is **Done** when every feature in it (rejected ones aside) is done, and **In progress** once one is.

| Phase | Phase status | Done | Features by status |
| --- | --- | --- | --- |
| [Phase 0 · Finish open work](phase-0-finish-open-work/README.md) | **In progress** | 4/5 | To do: 1 · Done: 4 |
| [Phase 1 · Prompts still answered in Endstep's UI](phase-1-prompts-still-in-endstep/README.md) | **In progress** | 9/10 | To do: 1 · Done: 9 |
| [Phase 2 · Combat and visual effects](phase-2-combat-and-effects/README.md) | **In progress** | 10/11 | To do: 1 · Done: 10 |
| [Phase 3 · Game information](phase-3-game-information/README.md) | **Done** | 4/4 | Done: 4 |
| [Phase 4 · Comfort and settings](phase-4-comfort-and-settings/README.md) | **Done** | 4/4 | Done: 4 |
| [Phase 5 · Modes and platform](phase-5-modes-and-platform/README.md) | **In progress** | 1/4 | Awaiting approval: 1 · To do: 2 · Done: 1 · Rejected: 1 |

## Progress by phase

### [Phase 0 · Finish open work](phase-0-finish-open-work/README.md): In progress (4/5)

- [x] t0-1 · [Commit this session's changes](phase-0-finish-open-work/t0-1-commit-session-changes.md) — Done
- [x] t0-2 · [Verify in a real match](phase-0-finish-open-work/t0-2-verify-in-real-match.md) — Done
- [ ] t0-3 · [Face-down card left under its holder](phase-0-finish-open-work/t0-3-face-down-card-left-on-table.md) — To do
- [x] t0-4 · [Update the README](phase-0-finish-open-work/t0-4-update-readme.md) — Done
- [x] t0-5 · [Release 0.5.0](phase-0-finish-open-work/t0-5-release-0-5-0.md) — Done

### [Phase 1 · Prompts still answered in Endstep's UI](phase-1-prompts-still-in-endstep/README.md): In progress (9/10)

- [x] t1-1 · [Sideboarding screen](phase-1-prompts-still-in-endstep/t1-1-sideboarding.md) — Done
- [x] t1-2 · [Paying Phyrexian mana](phase-1-prompts-still-in-endstep/t1-2-phyrexian-mana.md) — Done
- [x] t1-3 · [Log the prompts that step aside](phase-1-prompts-still-in-endstep/t1-3-log-prompts-that-step-aside.md) — Done
- [x] t1-4 · [Choosing a pile, with two visible piles](phase-1-prompts-still-in-endstep/t1-4-choose-pile.md) — Done
- [x] t1-5 · [Dividing spell damage](phase-1-prompts-still-in-endstep/t1-5-divide-spell-damage.md) — Done
- [ ] t1-6 · [Check dividing shield counters](phase-1-prompts-still-in-endstep/t1-6-check-divide-shield.md) — To do
- [x] t1-7 · [Separating cards into two piles](phase-1-prompts-still-in-endstep/t1-7-separate-piles.md) — Done
- [x] t1-8 · [Choosing cards from your own hand in a fan](phase-1-prompts-still-in-endstep/t1-8-own-hand-in-a-fan.md) — Done
- [x] t1-9 · [Discarding from your hand, without a fan](phase-1-prompts-still-in-endstep/t1-9-discard-in-hand.md) — Done
- [x] t1-10 · [Proliferate on the table](phase-1-prompts-still-in-endstep/t1-10-proliferate.md) — Done

### [Phase 2 · Combat and visual effects](phase-2-combat-and-effects/README.md): In progress (10/11)

- [x] t2-1 · [Spells travel when they resolve](phase-2-combat-and-effects/t2-1-spells-travel-on-resolve.md) — Done
- [x] t2-2 · [Projectile to the target](phase-2-combat-and-effects/t2-2-projectile-to-target.md) — Done
- [x] t2-3 · [Smoke outside combat too](phase-2-combat-and-effects/t2-3-smoke-outside-combat.md) — Done
- [x] t2-4 · [Token entrance](phase-2-combat-and-effects/t2-4-token-entrance.md) — Done
- [x] t2-5 · [Animate counters and power/toughness](phase-2-combat-and-effects/t2-5-animate-counters.md) — Done
- [ ] t2-6 · [Commander damage on the player's picture](phase-2-combat-and-effects/t2-6-commander-damage.md) — To do
- [x] t2-7 · [Piles of four identical cards](phase-2-combat-and-effects/t2-7-piles-of-four.md) — Done
- [x] t2-8 · [Toughness minus damage, in red](phase-2-combat-and-effects/t2-8-damaged-toughness.md) — Done
- [x] t2-9 · [Exiling a permanent](phase-2-combat-and-effects/t2-9-exile-animation.md) — Done
- [x] t2-10 · [Damage and deaths as the blow lands](phase-2-combat-and-effects/t2-10-impacts-in-sync.md) — Done
- [x] t2-11 · [Animation pace (against bots)](phase-2-combat-and-effects/t2-11-animation-pace.md) — Done

### [Phase 3 · Game information](phase-3-game-information/README.md): Done (4/4)

- [x] t3-1 · [Game log](phase-3-game-information/t3-1-game-log.md) — Done
- [x] t3-2 · [Game and turn clocks](phase-3-game-information/t3-2-game-clocks.md) — Done
- [x] t3-3 · [Keyword glossary](phase-3-game-information/t3-3-keyword-glossary.md) — Done
- [x] t3-4 · [Who has priority and what we're waiting for](phase-3-game-information/t3-4-priority-and-waiting.md) — Done

### [Phase 4 · Comfort and settings](phase-4-comfort-and-settings/README.md): Done (4/4)

- [x] t4-1 · [Keyboard shortcuts panel](phase-4-comfort-and-settings/t4-1-shortcuts-panel.md) — Done
- [x] t4-2 · [Extension settings](phase-4-comfort-and-settings/t4-2-extension-settings.md) — Done
- [x] t4-3 · [Sounds](phase-4-comfort-and-settings/t4-3-sounds.md) — Done
- [x] t4-4 · [Pass until…](phase-4-comfort-and-settings/t4-4-pass-until.md) — Done

### [Phase 5 · Modes and platform](phase-5-modes-and-platform/README.md): In progress (1/4)

- [x] t5-1 · [Spectating with the Arena board](phase-5-modes-and-platform/t5-1-spectating.md) — Done
- [ ] t5-2 · [Tables for 3 and 4 players](phase-5-modes-and-platform/t5-2-multiplayer-tables.md) — Awaiting approval
- [ ] t5-3 · [Visual regression tests](phase-5-modes-and-platform/t5-3-visual-regression-tests.md) — To do
- [ ] t5-4 · [Real matches as tests](phase-5-modes-and-platform/t5-4-real-matches-as-tests.md) — To do
- [ ] t5-5 · [Publish to the Chrome Web Store and Edge Add-ons](phase-5-modes-and-platform/t5-5-publish-to-stores.md) — Rejected
