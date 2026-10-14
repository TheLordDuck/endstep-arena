# t2-15 · Icons for printed keywords on permanents

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 2 · Combat and visual effects](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

Arena puts small icons along the bottom of each permanent for its keyword abilities (flying, deathtouch, lifelink, trample, vigilance, first strike, haste, reach, menace, indestructible, hexproof…), so the table reads without hovering. Seen in MTG Arena gameplay videos (LegenVD, 2026-10-13).

## What existed before

Only keywords an effect added (green) or took away (red) showed on the permanent.

## What was done

- `printedKeywords()` in `src/ui/board/keywords.ts` reads the keywords from the card's Oracle text, only from its keyword lines ("Flying, vigilance", "Ward {2}", "Protection from red"): a keyword its text only mentions or gives to others ("Flying creatures you control…") doesn't count.
- `src/ui/board/keywordIcons.ts` draws an icon for flying, reach, deathtouch, lifelink, trample, vigilance, first strike, double strike, haste, menace, indestructible, hexproof, shroud, ward, protection, defender, infect and toxic, in a small gold-rimmed circle at the bottom left of the frame; hovering one shows its name, and the enlarged card still explains it.
- A keyword it gained or lost keeps its green or red label (above the icons) and gets no icon.

## Done when

- A Serra Angel on the table shows flying and vigilance icons. Checked in the harness (`keywords`): Vampire Nighthawk shows flying, deathtouch and lifelink; Goblin Guide haste; the opponent's Serra Angel, which lost flying, its red label and the vigilance icon. Also on the recorded match (`#match:bot-combats`).

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: approved and done.
