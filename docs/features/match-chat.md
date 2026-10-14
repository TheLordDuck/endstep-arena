# The match chat

| | |
| --- | --- |
| Status | **Done** (2026-10-14, roadmap [t3-18](../roadmap/phase-3-game-information/t3-18-match-chat.md)) |
| Verified | In the harness (`#chat`, typing and sending through Chrome DevTools) and unit tests; not yet in a real match |

Endstep's match chat, on the Arena board: what the others write shows as it comes, and you can
write back without leaving the board.

## What shows

- **A bubble** by the writer's picture for a few seconds (3.5 s, longer for long messages, 9 s at
  most), pointing at it: the opponent's by their picture, yours by yours. A spectator's shows under
  the Chat button. A newer message from the same writer replaces it; clicking a bubble opens the
  chat. Messages from before the board was opened (a reconnect's history) get no bubble.
  Settings → Chat bubbles turns them off.
- **The Chat button** (top right, beside Log) carries a gold count of the messages you haven't
  seen; the corner lights up while there are any.
- **The chat panel** (the button, or **C**): in the left column like the game log (beside it when
  both are open). The match's conversation, the last 200 messages: yours named in gold, the
  opponent's in red, a spectator's in italics; one you just sent shows at once, dimmed until the
  server confirms it. Under them, who's typing ("Rival is typing…"), and Endstep's notice when a
  message is refused or your chat is muted.
- **Writing:** the box at the bottom. Enter sends (500 characters at most, as in Endstep), Esc
  closes the panel. While you type, the others see that you're typing (Endstep's indicator), until
  you send, stop for 3 s, or leave the box.

No key typed in the box reaches the board's shortcuts (L, H, C, ?, numbers…) or Endstep's own
(Space passing priority, and so on). Spectators can chat too, as in Endstep; a replay has no chat.

## How it works

- Endstep's protocol (docs/ENDSTEP_ANALYSIS.md §11): `CHAT`, `CHAT_TYPING`, `CHAT_REFUSED` and
  `CHAT_MUTE` frames come on the match's socket; the tap forwards them and the adapter keeps the
  shown match's (`src/game/endstep/chat.ts`, `MatchChat`).
- Writing goes to the tap as a chat command (`ChatCommand` in `src/shared/protocol.ts`), which
  sends `CHAT` / `CHAT_TYPING` frames exactly as Endstep's chat box does. It's a separate path
  from the game actions' whitelist: only those two frame types, for the match on screen.
- The board: `renderChat()`, `chatBubble()` and `toggleChat()` in `src/ui/board/Board.ts`.
