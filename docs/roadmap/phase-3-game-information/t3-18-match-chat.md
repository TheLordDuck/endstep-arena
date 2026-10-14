# t3-18 · The match chat on the board

| | |
| --- | --- |
| Status | **Done** |
| Phase | [Phase 3 · Game information](README.md) |
| Type | Feature |
| Needs approval | Yes |
| Approved on | 2026-10-14 |
| Done on | 2026-10-14 |

Use Endstep's chat without leaving the Arena board: read what the other players write as it comes, and write back. Asked for by the user on 2026-10-14. Includes and extends [t3-14](t3-14-opponent-emotes.md), which only showed the opponent's messages.

## What existed before

The board didn't show the chat at all; writing meant switching to Endstep's own UI.

## What was done

- Endstep's chat protocol read from its bundle ([docs/ENDSTEP_ANALYSIS.md](../../ENDSTEP_ANALYSIS.md) §11): `CHAT`, `CHAT_TYPING`, `CHAT_REFUSED` and `CHAT_MUTE` frames on the match's socket.
- The tap forwards them, and sends `CHAT` and `CHAT_TYPING` frames as Endstep's chat box does, on a path of its own (not the game actions' whitelist). The adapter keeps the shown match's conversation (`src/game/endstep/chat.ts`).
- A new message shows for a few seconds in a bubble by its writer's picture (a spectator's under the Chat button); Settings → Chat bubbles turns them off.
- The Chat button (or **C**) opens a panel with the conversation, who's typing, Endstep's refusal and mute notices, and a box to write in: Enter sends, Esc closes. The button counts unread messages.
- No key typed in the box reaches the board's shortcuts or Endstep's.
- See [docs/features/match-chat.md](../../features/match-chat.md).

## Done when

- In a real match, a message from the opponent shows in the bubble and in the panel, and one written from the board reaches Endstep. Checked in the harness (`chat`: bubbles, unread count, typing "l", "h" and Space without triggering anything, Enter sends, Esc closes) and in unit tests; **not yet in a real match**.

## History

- 2026-10-14: added to the roadmap at the user's request, approved and done.
