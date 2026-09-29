// Player avatars, fetched the way Endstep's client does: one batched
// GET /api/profiles/avatars?usernames=… returning { username: avatar | null },
// where an avatar is an uploaded image or a card's art crop, framed by `crop`
// (zoom and focus point, as Endstep's avatar picker saves it).
// The endpoint needs the login cookie; like Endstep's client, a 401 renews the
// session once (POST /api/auth/refresh) and asks again.

type Crop = { zoom?: number; x?: number; y?: number };
type Avatar = { kind?: string; imageId?: string; cardName?: string; set?: string; collectorNumber?: string; crop?: Crop } | null;

export interface AvatarPicture {
  url: string;
  /** CSS background size and position that frame the picture as the player chose. */
  size: string;
  position: string;
}

const cache = new Map<string, AvatarPicture | null>();
/** Lookups that failed (not "no avatar", but no answer): asked again after a while. */
const retryAt = new Map<string, number>();
const RETRY_MS = 20_000;
const pending = new Set<string>();
const waiting = new Set<() => void>();
let queued = false;

function toPicture(a: Avatar): AvatarPicture | null {
  if (!a) return null;
  let url: string | null = null;
  if (a.kind === "upload") url = a.imageId ? `/api/profiles/avatar-image/${encodeURIComponent(a.imageId)}` : null;
  else if (a.cardName) {
    const p = new URLSearchParams({ name: a.cardName, _v: "2", version: "art_crop" });
    if (a.set && a.collectorNumber) {
      p.set("set", a.set);
      p.set("cn", a.collectorNumber);
    }
    url = `/api/cards/image?${p}`;
  }
  if (!url) return null;
  // Endstep frames it with background-size zoom×100% at (x%, y%); unframed art centers a bit high.
  const zoom = typeof a.crop?.zoom === "number" && a.crop.zoom > 0 ? a.crop.zoom : null;
  return {
    url,
    size: zoom ? `${Math.round(zoom * 100)}%` : "cover",
    position: `${a.crop?.x ?? 50}% ${a.crop?.y ?? 45}%`,
  };
}

async function request(names: string[]): Promise<Response> {
  const get = () => fetch(`/api/profiles/avatars?usernames=${encodeURIComponent(names.join(","))}`, { credentials: "include" });
  const res = await get();
  if (res.status !== 401) return res;
  // The short-lived login cookie lapsed: renew it, as Endstep's client does, and ask again.
  const refreshed = await fetch("/api/auth/refresh", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
  }).catch(() => null);
  return refreshed?.ok ? get() : res;
}

async function flush(): Promise<void> {
  queued = false;
  const names = [...pending].filter((n) => !cache.has(n));
  pending.clear();
  if (!names.length) return;
  try {
    const res = await request(names);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as Record<string, Avatar>;
    for (const n of names) cache.set(n, toPicture(data[n] ?? null));
  } catch {
    for (const n of names) retryAt.set(n, Date.now() + RETRY_MS);
  }
  const callbacks = [...waiting];
  waiting.clear();
  for (const cb of callbacks) cb();
}

/** The player's avatar picture, null when they have none (or it can't be fetched yet), undefined
    while loading (`onReady` fires once it's known). */
export function avatarPicture(username: string | undefined, onReady: () => void): AvatarPicture | null | undefined {
  if (!username) return null;
  if (cache.has(username)) return cache.get(username);
  const retry = retryAt.get(username);
  if (retry !== undefined && Date.now() < retry) return null;
  retryAt.delete(username);
  pending.add(username);
  waiting.add(onReady);
  if (!queued) {
    queued = true;
    queueMicrotask(() => void flush());
  }
  return undefined;
}
