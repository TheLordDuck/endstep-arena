// Endstep's "Report a problem" and "Report stalling", sent from the board instead of Endstep's
// window. Its form sends one request, POST /api/bug-reports (signed in by the session cookie):
// { kind: "bug" | "suggestion" | "stalling", description, context: { route, matchId, gameId },
//   diagnostics, attachments: [{ kind, mime, dataBase64 }], subjectUserId (stalling: who) }.
// Endstep's diagnostics are its build, the browser and a summary of the game; these are the
// same, with this extension's name and version in place of Endstep's build. Endstep also takes a
// screenshot of its page; here images are added by hand (or pasted).

export type ReportKind = "bug" | "suggestion" | "stalling";

export interface ReportImage {
  kind: "image" | "pasted";
  /** A data: URL (image/png, image/jpeg…). */
  dataUrl: string;
}

export interface Report {
  kind: ReportKind;
  description: string;
  /** Stalling: the player reported. */
  subjectUserId?: string;
  images: ReportImage[];
}

/** An opponent who can be reported for stalling (a person: not a bot, not the viewer). */
export interface ReportSubject {
  userId: string;
  username: string;
}

/** Endstep's limits: the description's length and the number of images. */
export const REPORT_MAX_TEXT = 5000;
export const REPORT_MAX_IMAGES = 6;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null;
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const len = (v: unknown) => (Array.isArray(v) ? v.length : undefined);

/** The match id of a game page (/game/:id), as Endstep reads it. */
export function matchIdFromPath(path: string): string | undefined {
  return /\/game\/([^/?#]+)/.exec(path)?.[1];
}

/** The people one can report for stalling, from the match info (GET /api/matches/:id):
    every participant but the viewer's seat and bots, as Endstep picks them. */
export function reportSubjects(info: unknown): ReportSubject[] {
  if (!isObj(info) || !Array.isArray(info.participants)) return [];
  const me = num(info.myPlayerIndex);
  return info.participants.flatMap((p, seat) => {
    if (!isObj(p) || seat === me || p.isBot || p.isAi || typeof p.userId !== "string") return [];
    return [{ userId: p.userId, username: typeof p.username === "string" ? p.username : p.userId }];
  });
}

/** What a report says about the page, the browser and the game (Endstep's raw state). */
export function reportDiagnostics(raw: unknown, extensionVersion: string, viewerSeat?: number): Raw {
  const g = isObj(raw) ? raw : {};
  const score = isObj(g.matchScore) ? g.matchScore : {};
  const pending = isObj(g.pendingAction) ? g.pendingAction : null;
  return {
    extension: { name: "Endstep Arena UI", version: extensionVersion, note: "Sent from the Arena UI board" },
    env: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      online: navigator.onLine,
    },
    route: location.pathname,
    game: {
      gameId: g.gameId,
      gameNumber: score.gameNumber,
      gamesPerMatch: score.gamesPerMatch,
      phase: g.phase,
      step: g.step,
      turnNumber: g.turnNumber,
      activePlayerId: g.activePlayerId,
      priorityPlayerId: g.priorityPlayerId,
      status: g.status,
      winnerId: g.winnerId,
      sequenceNumber: g.sequenceNumber,
      myPlayerIndex: viewerSeat,
      stackSize: len(g.stack),
      pendingAction: pending ? { type: pending.type, message: pending.message, sourceSpellAbilityId: pending.sourceSpellAbilityId } : null,
    },
    players: Array.isArray(g.players) ? g.players.filter(isObj).map((p) => ({
      name: p.name, life: p.life, hand: p.handSize, library: p.librarySize, battlefield: len(p.battlefield), graveyard: len(p.graveyard),
    })) : undefined,
  };
}

/** The body of POST /api/bug-reports (`route`: the page's path). */
export function reportBody(report: Report, raw: unknown, diagnostics: Raw, route = location.pathname): Raw {
  const g = isObj(raw) ? raw : {};
  const matchId = matchIdFromPath(route);
  return {
    kind: report.kind,
    description: report.description.trim().slice(0, REPORT_MAX_TEXT),
    context: { route, ...(matchId ? { matchId } : {}), ...(g.gameId !== undefined ? { gameId: g.gameId } : {}) },
    diagnostics,
    attachments: report.images.slice(0, REPORT_MAX_IMAGES).flatMap((img) => {
      const m = /^data:([^;]+);base64,(.*)$/.exec(img.dataUrl);
      return m ? [{ kind: img.kind, mime: m[1], dataBase64: m[2] }] : [];
    }),
    ...(report.kind === "stalling" && report.subjectUserId ? { subjectUserId: report.subjectUserId } : {}),
  };
}

/** Sends a report; true when Endstep took it. */
export async function sendReport(body: Raw): Promise<boolean> {
  try {
    const res = await fetch(new URL("/api/bug-reports", location.origin), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The people one can report for stalling in a match (none if Endstep doesn't say). */
export async function fetchReportSubjects(matchId: string): Promise<ReportSubject[]> {
  try {
    const res = await fetch(new URL(`/api/matches/${encodeURIComponent(matchId)}`, location.origin), { credentials: "include" });
    return res.ok ? reportSubjects(await res.json()) : [];
  } catch {
    return [];
  }
}
