// The match's chat, from Endstep's CHAT frames, kept the way its own chat box keeps it: the last
// 200 messages, each once, yours shown at once and confirmed when the server sends it back.

import type { ChatMessage, ChatView } from "../GameState";
import type { Raw } from "./normalize";

const MAX_MESSAGES = 200;
/** "Typing…" lasts this long without news (as Endstep's client counts it). */
const TYPING_MS = 4000;
/** A refusal or mute notice stays this long. */
const NOTICE_MS = 8000;

/** Why the server refused a message, in Endstep's words. */
const REFUSALS: Record<string, string> = {
  quick_reply_too_soon: "Wait a few seconds before the next quick reply.",
  quick_reply_repeat: "You sent that one a moment ago. Pick another.",
  quick_replies_only: "Your chat is muted. You can only send quick replies.",
  spectator_muted: "Your chat is muted. You can't chat in a game you're watching.",
  unknown_quick_reply: "That quick reply isn't available. Pick another.",
};

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export class MatchChat {
  private messages: ChatMessage[] = [];
  private typing = new Map<string, { name: string; until: number }>();
  private notice: { text: string; until: number } | undefined;
  /** The messages sent from here, by clientMessageId. */
  private sent = new Set<string>();

  /** The match a chat frame is about (Endstep's own reading: payload.matchId, else the frame's),
      or null for a lobby's, an event's, or one that names two different matches. */
  static matchOf(frame: Raw): string | null {
    const p = isObj(frame.payload) ? frame.payload : {};
    if (str(p.lobbyId) || str(frame.eventChatId) || str(p.eventChatId)) return null;
    const a = str(p.matchId);
    const b = str(frame.matchId);
    if (a && b && a !== b) return null;
    return a ?? b ?? null;
  }

  /** A CHAT, CHAT_TYPING, CHAT_REFUSED or CHAT_MUTE frame of this match. `me` is your account
      name. Returns whether anything changed. */
  handle(frame: Raw, me: string | undefined, now = Date.now()): boolean {
    const p = isObj(frame.payload) ? frame.payload : {};
    switch (frame.type) {
      case "CHAT": {
        const text = str(p.message);
        if (!text) return false;
        const cid = str(p.clientMessageId);
        const hidden = p.identityHidden === true;
        const username = hidden ? "Opponent" : str(p.username) ?? "?";
        const ts = typeof frame.timestamp === "number" ? frame.timestamp : now;
        const msg: ChatMessage = {
          id: str(p.messageId) ?? `${str(p.userId) ?? username}:${ts}`,
          username, text, ts,
          mine: (!!cid && this.sent.has(cid)) || (!hidden && !!me && username === me),
          role: str(p.senderRole) ?? "player",
          ...(cid ? { clientMessageId: cid } : {}),
        };
        const pending = cid ? this.messages.findIndex((m) => m.pending && m.clientMessageId === cid) : -1;
        if (pending >= 0) this.messages[pending] = msg;
        else if (this.messages.some((m) => m.id === msg.id)) return false;
        else this.messages = [...this.messages, msg].slice(-MAX_MESSAGES);
        // Whoever wrote has stopped typing.
        for (const [id, t] of this.typing) if (t.name === username) this.typing.delete(id);
        return true;
      }
      case "CHAT_TYPING": {
        if (p.scope !== "match") return false;
        const name = p.identityHidden === true ? "Opponent" : str(p.username);
        if (!name || (me && name === me)) return false;
        const id = str(p.userId) ?? name;
        if (p.active === true) this.typing.set(id, { name, until: now + TYPING_MS });
        else if (!this.typing.delete(id)) return false;
        return true;
      }
      case "CHAT_REFUSED": {
        const cid = str(p.clientMessageId);
        if (cid) this.messages = this.messages.filter((m) => !(m.pending && m.clientMessageId === cid));
        const reason = str(p.reason);
        this.notice = { text: (reason && REFUSALS[reason]) ?? "Your message wasn't sent.", until: now + NOTICE_MS };
        return true;
      }
      case "CHAT_MUTE": {
        const mute = isObj(p.mute) ? p.mute : null;
        const until = mute && typeof mute.mutedUntil === "number" ? mute.mutedUntil : undefined;
        this.notice = mute
          ? { text: `Your chat is muted${until ? ` until ${new Date(until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}.`, until: now + NOTICE_MS }
          : undefined;
        return true;
      }
    }
    return false;
  }

  /** A message you just sent: shown at once, until the server sends it back (or refuses it). */
  addSent(clientMessageId: string, text: string, username: string, spectator: boolean, now = Date.now()): void {
    this.sent.add(clientMessageId);
    this.messages = [...this.messages, {
      id: `pending:${clientMessageId}`, username, text, ts: now, mine: true, role: spectator ? "spectator" : "player", pending: true, clientMessageId,
    }].slice(-MAX_MESSAGES);
  }

  /** The chat as the board shows it (undefined while there's nothing: no message, nobody typing,
      no notice still standing). */
  view(now = Date.now()): ChatView | undefined {
    for (const [id, t] of this.typing) if (t.until <= now) this.typing.delete(id);
    const notice = this.notice && this.notice.until > now ? this.notice : undefined;
    if (!this.messages.length && !this.typing.size && !notice) return undefined;
    return { messages: this.messages, typing: [...this.typing.values()], ...(notice ? { notice } : {}) };
  }

  clear(): void {
    this.messages = [];
    this.typing.clear();
    this.notice = undefined;
    this.sent.clear();
  }
}
