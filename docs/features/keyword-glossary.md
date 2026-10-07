# Keyword glossary

| | |
| --- | --- |
| Status | **Done** (2026-10-07, roadmap [t3-3](../roadmap/phase-3-game-information/t3-3-keyword-glossary.md)) |
| Verified | In the harness (`#keywords`) and unit tests |

An enlarged card (hovered on the table, or right-clicked) has boxes beside it explaining each
keyword it has, as Arena does.

## What shows

- One box per keyword: its name and what it does, in the order the keywords appear on the card.
- Keywords come from the card's text (printed, or mentioned in another ability: "gains flying"),
  and from the keywords an effect gave it (`keywordsGranted`), each once.
- A keyword an effect took away stays explained, marked **· lost** in red.
- Reminder text in parentheses isn't read, and a keyword inside another word doesn't count
  ("flash" in "flashback", "equip" in "equipped").
- "Islandwalk", "Swampwalk"… are explained as **Landwalk**.
- The boxes go on the right of the enlarged card, or on its left when there's no room or that's
  where the card hovered is. A face-down card shows none.

## The table

`src/ui/board/keywords.ts` has 123 entries: evergreen and common keywords, casting and
graveyard mechanics (flashback, escape, madness…), and the keyword actions Arena also explains
(scry, surveil, mill, explore, investigate, proliferate…). The texts follow the cards' reminder
text. Ability words (landfall…) aren't keywords and aren't listed.

## Implementation

- `keywordNotes(card)` in `src/ui/board/keywords.ts`: one regular expression over all the names,
  longest first ("Manifest dread" before "Manifest").
- `showZoom()` in `src/ui/board/Board.ts` adds the `.zkw` boxes; `showHoverZoom()` puts them on the
  left (`.zoom.kw-left`) when needed.
- CSS: `.zkw`, `.zkw .kw`, `.zkw .kw.lost`.
