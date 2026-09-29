// Messages between the MAIN-world tap and the isolated content script, both
// carried by window.postMessage. Each direction has its own tag so neither
// side mistakes its own messages for the other's.

export const BRIDGE_TAG = "endstep-arena/v1";
export const COMMAND_TAG = "endstep-arena/cmd";

export type TapMessage =
  | { kind: "ws-open"; url: string }
  | { kind: "ws-close"; code: number }
  | { kind: "ws-in"; data: string }
  | { kind: "ws-out"; data: string }
  /** `reason` says why an action was not sent: not an allowed type, or no open game socket. */
  | { kind: "action-result"; ok: boolean; type: string; reason?: "not-allowed" | "not-connected" }
  | { kind: "route"; path: string };

export type BridgeEnvelope = TapMessage & { tag: typeof BRIDGE_TAG; t: number };

export function isBridgeEnvelope(v: unknown): v is BridgeEnvelope {
  return typeof v === "object" && v !== null && (v as { tag?: unknown }).tag === BRIDGE_TAG;
}

/** A game action in Endstep's wire format, minus matchId/actionId (added by the tap). */
export interface WireAction {
  type: string;
  [key: string]: unknown;
}

export interface SendActionCommand {
  tag: typeof COMMAND_TAG;
  kind: "send-action";
  matchId: string;
  action: WireAction;
}

export function isSendActionCommand(v: unknown): v is SendActionCommand {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Partial<SendActionCommand>;
  return c.tag === COMMAND_TAG && c.kind === "send-action" && typeof c.matchId === "string" &&
    typeof c.action === "object" && c.action !== null && typeof c.action.type === "string";
}

/**
 * The only action types the Arena UI may send: exactly the in-game choices
 * Endstep's own UI offers, plus its phase-stop setting. No CHEAT, no CONCEDE.
 */
export const ALLOWED_ACTIONS = new Set([
  "SET_PHASE_STOPS",
  "PASS_PRIORITY", "PLAY_CARD", "TAP_MANA", "AUTO_PAY", "CANCEL", "UNDO",
  "DECLARE_ATTACKERS", "DECLARE_BLOCKERS", "CHOOSE_TARGETS", "CHOOSE_CARDS",
  "CHOOSE_MODE", "CHOOSE_COLOR", "CHOOSE_TYPE", "CHOOSE_NUMBER", "CHOOSE_MANA",
  "CHOOSE_PILE", "CHOOSE_CARD_NAME", "YES", "NO", "DECLINE", "MULLIGAN", "MULLIGAN_SPECIAL", "KEEP_HAND",
  // Paying with floating mana, and ordering triggers/attackers/blockers (Endstep's pay panel and order box).
  "USE_FLOATING_MANA", "ORDER_ABILITIES", "ORDER_ATTACKERS", "ORDER_BLOCKERS",
]);
