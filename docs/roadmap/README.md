# Roadmap

What's left for the extension to feel like MTG Arena, in phases. Each phase is a folder with a
`README.md` (its goal and a table of its features) and one file per feature with its status card.

**Where decisions are made:** the tracker page https://claude.ai/artifact/43uFfdsXsZiFrf2YzYu4T9 (private to its owner). Features are
approved, rejected and marked done there. These files mirror its state as of
**2026-10-19** and are regenerated from it, not edited by hand.

## Statuses

| Status | Meaning |
| --- | --- |
| Awaiting approval | A new feature; approve or reject it before starting |
| Approved | Approved, not started |
| To do | Needs no approval; not done yet |
| Done | Finished |
| Rejected | Won't be built |

## Summary

Approved: 1 · To do: 1 · Done: 69 · Rejected: 9

**Approved:** t4-8.

**Still open, for later (Phase 6):** t2-25 (to do: fixed in the code, to be checked in a real match), t4-8 (approved, 5 of its 8 items done).

## Phases

A phase is **Done** when every feature in it (rejected ones aside) is done, and **In progress** once one is. Phase 6 holds what will be done in the future, with no date.

| Phase | Phase status | Done | Features by status |
| --- | --- | --- | --- |
| [Phase 0 · Finish open work](phase-0-finish-open-work/README.md) | **Done** | 5/5 | Done: 5 |
| [Phase 1 · Prompts still answered in Endstep's UI](phase-1-prompts-still-in-endstep/README.md) | **Done** | 9/9 | Done: 9 · Rejected: 1 |
| [Phase 2 · Combat and visual effects](phase-2-combat-and-effects/README.md) | **Done** | 25/25 | Done: 25 · Rejected: 3 |
| [Phase 3 · Game information](phase-3-game-information/README.md) | **Done** | 20/20 | Done: 20 · Rejected: 2 |
| [Phase 4 · Comfort and settings](phase-4-comfort-and-settings/README.md) | **Done** | 7/7 | Done: 7 · Rejected: 1 |
| [Phase 5 · Modes and platform](phase-5-modes-and-platform/README.md) | **Done** | 3/3 | Done: 3 · Rejected: 2 |
| [Phase 6 · Later](phase-6-later/README.md) | **Not planned** | 0/2 | Approved: 1 · To do: 1 |

## Progress by phase

### [Phase 0 · Finish open work](phase-0-finish-open-work/README.md): Done (5/5)

- [x] t0-1 · [Commit this session's changes](phase-0-finish-open-work/t0-1-commit-session-changes.md) — Done
- [x] t0-2 · [Verify in a real match](phase-0-finish-open-work/t0-2-verify-in-real-match.md) — Done
- [x] t0-3 · [Face-down card left under its holder](phase-0-finish-open-work/t0-3-face-down-card-left-on-table.md) — Done
- [x] t0-4 · [Update the README](phase-0-finish-open-work/t0-4-update-readme.md) — Done
- [x] t0-5 · [Release 0.5.0](phase-0-finish-open-work/t0-5-release-0-5-0.md) — Done

### [Phase 1 · Prompts still answered in Endstep's UI](phase-1-prompts-still-in-endstep/README.md): Done (9/9)

- [x] t1-1 · [Sideboarding screen](phase-1-prompts-still-in-endstep/t1-1-sideboarding.md) — Done
- [x] t1-2 · [Paying Phyrexian mana](phase-1-prompts-still-in-endstep/t1-2-phyrexian-mana.md) — Done
- [x] t1-3 · [Log the prompts that step aside](phase-1-prompts-still-in-endstep/t1-3-log-prompts-that-step-aside.md) — Done
- [x] t1-4 · [Choosing a pile, with two visible piles](phase-1-prompts-still-in-endstep/t1-4-choose-pile.md) — Done
- [x] t1-5 · [Dividing spell damage](phase-1-prompts-still-in-endstep/t1-5-divide-spell-damage.md) — Done
- [ ] t1-6 · [Check dividing shield counters](phase-1-prompts-still-in-endstep/t1-6-check-divide-shield.md) — Rejected
- [x] t1-7 · [Separating cards into two piles](phase-1-prompts-still-in-endstep/t1-7-separate-piles.md) — Done
- [x] t1-8 · [Choosing cards from your own hand in a fan](phase-1-prompts-still-in-endstep/t1-8-own-hand-in-a-fan.md) — Done
- [x] t1-9 · [Discarding from your hand, without a fan](phase-1-prompts-still-in-endstep/t1-9-discard-in-hand.md) — Done
- [x] t1-10 · [Proliferate on the table](phase-1-prompts-still-in-endstep/t1-10-proliferate.md) — Done

### [Phase 2 · Combat and visual effects](phase-2-combat-and-effects/README.md): Done (25/25)

- [x] t2-1 · [Spells travel when they resolve](phase-2-combat-and-effects/t2-1-spells-travel-on-resolve.md) — Done
- [x] t2-2 · [Projectile to the target](phase-2-combat-and-effects/t2-2-projectile-to-target.md) — Done
- [x] t2-3 · [Smoke outside combat too](phase-2-combat-and-effects/t2-3-smoke-outside-combat.md) — Done
- [x] t2-4 · [Token entrance](phase-2-combat-and-effects/t2-4-token-entrance.md) — Done
- [x] t2-5 · [Animate counters and power/toughness](phase-2-combat-and-effects/t2-5-animate-counters.md) — Done
- [ ] t2-6 · [Commander damage on the player's picture](phase-2-combat-and-effects/t2-6-commander-damage.md) — Rejected
- [x] t2-7 · [Piles of four identical cards](phase-2-combat-and-effects/t2-7-piles-of-four.md) — Done
- [x] t2-8 · [Toughness minus damage, in red](phase-2-combat-and-effects/t2-8-damaged-toughness.md) — Done
- [x] t2-9 · [Exiling a permanent](phase-2-combat-and-effects/t2-9-exile-animation.md) — Done
- [x] t2-10 · [Damage and deaths as the blow lands](phase-2-combat-and-effects/t2-10-impacts-in-sync.md) — Done
- [x] t2-11 · [Animation pace (against bots)](phase-2-combat-and-effects/t2-11-animation-pace.md) — Done
- [x] t2-12 · [Combat driven by Endstep's events](phase-2-combat-and-effects/t2-12-combat-from-events.md) — Done
- [x] t2-13 · [Check combat when the bot attacks](phase-2-combat-and-effects/t2-13-check-bot-attacks.md) — Done
- [x] t2-14 · [Look at the whole stack in a fan (magnifier)](phase-2-combat-and-effects/t2-14-stack-fan.md) — Done
- [x] t2-15 · [Icons for printed keywords on permanents](phase-2-combat-and-effects/t2-15-printed-keyword-icons.md) — Done
- [x] t2-16 · [One pile per group of identical cards, with a count (×18)](phase-2-combat-and-effects/t2-16-one-pile-per-group.md) — Done
- [x] t2-17 · [Permanents in Arena's cropped frame](phase-2-combat-and-effects/t2-17-arena-cropped-frames.md) — Done
- [x] t2-18 · [The timer's rope across the table](phase-2-combat-and-effects/t2-18-timer-rope.md) — Done
- [x] t2-19 · [Loyalty cost on the stack, and impossible abilities in grey](phase-2-combat-and-effects/t2-19-loyalty-costs.md) — Done
- [x] t2-20 · [Modal spells on the stack, the modes not chosen in grey](phase-2-combat-and-effects/t2-20-modal-spells-on-stack.md) — Done
- [x] t2-21 · [Orbs when gaining life](phase-2-combat-and-effects/t2-21-life-gain-orbs.md) — Done
- [x] t2-22 · [Target arrows as in Arena](phase-2-combat-and-effects/t2-22-arena-target-arrows.md) — Done
- [x] t2-23 · [Abilities on the stack in Arena's ability frame](phase-2-combat-and-effects/t2-23-ability-frame-on-stack.md) — Done
- [x] t2-24 · [An illustrated table](phase-2-combat-and-effects/t2-24-illustrated-table.md) — Done
- [ ] t2-26 · [Show prevented damage](phase-2-combat-and-effects/t2-26-prevented-damage.md) — Rejected
- [ ] t2-27 · [Piles of more than four that read](phase-2-combat-and-effects/t2-27-readable-big-piles.md) — Rejected
- [x] t2-28 · [Auras and Equipment behind their permanent, as in Arena](phase-2-combat-and-effects/t2-28-attachments-behind-host.md) — Done
- [x] t2-29 · [What an Aura exiles, under its creature](phase-2-combat-and-effects/t2-29-aura-held-exile.md) — Done

### [Phase 3 · Game information](phase-3-game-information/README.md): Done (20/20)

- [x] t3-1 · [Game log](phase-3-game-information/t3-1-game-log.md) — Done
- [x] t3-2 · [Game and turn clocks](phase-3-game-information/t3-2-game-clocks.md) — Done
- [x] t3-3 · [Keyword glossary](phase-3-game-information/t3-3-keyword-glossary.md) — Done
- [x] t3-4 · [Who has priority and what we're waiting for](phase-3-game-information/t3-4-priority-and-waiting.md) — Done
- [x] t3-5 · [Cards the opponent can cast from the graveyard or exile](phase-3-game-information/t3-5-opponent-off-hand-playables.md) — Done
- [x] t3-6 · [Maximum hand size warning](phase-3-game-information/t3-6-max-hand-size-warning.md) — Done
- [x] t3-7 · [The opponent's mulligan status](phase-3-game-information/t3-7-opponent-mulligan-status.md) — Done
- [x] t3-8 · [The token a card creates, when enlarging it](phase-3-game-information/t3-8-creates-token.md) — Done
- [ ] t3-9 · [Compact phase indicator above the button](phase-3-game-information/t3-9-compact-phase-indicator.md) — Rejected
- [x] t3-10 · [Each player's zone counts](phase-3-game-information/t3-10-zone-counts.md) — Done
- [x] t3-11 · [Explain counters in the hover boxes](phase-3-game-information/t3-11-counters-in-hover-boxes.md) — Done
- [x] t3-12 · [The card's state in the hover boxes](phase-3-game-information/t3-12-card-state-in-hover-boxes.md) — Done
- [x] t3-13 · [Player counters Endstep sends that we don't show](phase-3-game-information/t3-13-player-counters.md) — Done
- [ ] t3-14 · [The opponent's emotes in a bubble](phase-3-game-information/t3-14-opponent-emotes.md) — Rejected
- [x] t3-15 · [What a mulligan costs, under the button](phase-3-game-information/t3-15-mulligan-cost.md) — Done
- [x] t3-16 · [The player's portrait and life as in Arena](phase-3-game-information/t3-16-arena-player-portrait.md) — Done
- [x] t3-17 · [Library and graveyard without labels, by the portrait](phase-3-game-information/t3-17-piles-without-labels.md) — Done
- [x] t3-18 · [The match chat on the board](phase-3-game-information/t3-18-match-chat.md) — Done
- [x] t3-19 · [The opponent's off-hand cards, to one side](phase-3-game-information/t3-19-opponent-side-hand-aside.md) — Done
- [x] t3-20 · [Hovering the opponent's revealed cards](phase-3-game-information/t3-20-hover-revealed-opponent-cards.md) — Done
- [x] t3-21 · [Your off-hand cards, always beside your hand](phase-3-game-information/t3-21-own-off-hand-cards-always.md) — Done
- [x] t3-22 · [The other face of double-faced cards](phase-3-game-information/t3-22-double-faced-other-face.md) — Done

### [Phase 4 · Comfort and settings](phase-4-comfort-and-settings/README.md): Done (7/7)

- [x] t4-1 · [Keyboard shortcuts panel](phase-4-comfort-and-settings/t4-1-shortcuts-panel.md) — Done
- [x] t4-2 · [Extension settings](phase-4-comfort-and-settings/t4-2-extension-settings.md) — Done
- [x] t4-3 · [Sounds](phase-4-comfort-and-settings/t4-3-sounds.md) — Done
- [x] t4-4 · [Pass until…](phase-4-comfort-and-settings/t4-4-pass-until.md) — Done
- [x] t4-5 · [The buttons on the right in Arena's order, colors and words](phase-4-comfort-and-settings/t4-5-arena-dock-buttons.md) — Done
- [x] t4-6 · [Pass until my turn during the opponent's](phase-4-comfort-and-settings/t4-6-pass-to-my-turn.md) — Done
- [ ] t4-7 · [The hand in a curved fan](phase-4-comfort-and-settings/t4-7-curved-hand-fan.md) — Rejected
- [x] t4-9 · [The board turns on when a match starts](phase-4-comfort-and-settings/t4-9-board-on-at-match-start.md) — Done

### [Phase 5 · Modes and platform](phase-5-modes-and-platform/README.md): Done (3/3)

- [x] t5-1 · [Spectating with the Arena board](phase-5-modes-and-platform/t5-1-spectating.md) — Done
- [ ] t5-2 · [Tables for 3 and 4 players](phase-5-modes-and-platform/t5-2-multiplayer-tables.md) — Rejected
- [x] t5-3 · [Visual regression tests](phase-5-modes-and-platform/t5-3-visual-regression-tests.md) — Done
- [x] t5-4 · [Real matches as tests](phase-5-modes-and-platform/t5-4-real-matches-as-tests.md) — Done
- [ ] t5-5 · [Publish to the Chrome Web Store and Edge Add-ons](phase-5-modes-and-platform/t5-5-publish-to-stores.md) — Rejected

### [Phase 6 · Later](phase-6-later/README.md): Not planned (0/2)

- [ ] t2-25 · [Two attack declarations at once](phase-6-later/t2-25-double-attack-declaration.md) — To do
- [ ] t4-8 · [Endstep's menu items, on the board](phase-6-later/t4-8-endstep-menu-items.md) — Approved
