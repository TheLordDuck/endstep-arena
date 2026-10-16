# t3-14 · The opponent's emotes in a bubble

| | |
| --- | --- |
| Status | **Rejected** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Rejected on | 2026-10-14 |

In Arena the opponent's quick messages ("Nice!", "Good game"…) show in a bubble under their avatar for a few seconds (wdHAGKuvIpg 29:05). Endstep sends CHAT messages on the same socket (docs/ENDSTEP_ANALYSIS.md).

## What exists now

They aren't shown.

## What it involves

- Read the match's CHAT messages and show each in a bubble beside its writer's avatar, with a setting to mute them.
- Read only: sending messages from the board would be another feature.

## Done when

- A message from the opponent shows in a bubble by their picture for a few seconds.

## Why rejected

The user rejected it on 2026-10-14, after the match chat on the board ([t3-18](t3-18-match-chat.md)) was done the same day: its bubbles already show each new message by its writer's picture.

## History

- 2026-10-13: added to the roadmap.
- 2026-10-14: rejected.
