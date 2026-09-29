// Player avatars, fetched the way Endstep's client does: one batched
// GET /api/profiles/avatars?usernames=… returning { username: avatar | null },
// where an avatar is an uploaded image or a card's art crop.

type Avatar = { kind?: string; imageId?: string; cardName?: string; set?: string; collectorNumber?: string } | null;

const cache = new Map<string, string | null>();
const pending = new Set<string>();
const waiting = new Set<() => void>();
let queued = false;

function toUrl(a: Avatar): string | null {
  if (!a) return null;
  if (a.kind === "upload") return a.imageId ? `/api/profiles/avatar-image/${encodeURIComponent(a.imageId)}` : null;
  if (!a.cardName) return null;
  const p = new URLSearchParams({ name: a.cardName, _v: "2", version: "art_crop" });
  if (a.set && a.collectorNumber) {
    p.set("set", a.set);
    p.set("cn", a.collectorNumber);
  }
  return `/api/cards/image?${p}`;
}

async function flush(): Promise<void> {
  queued = false;
  const names = [...pending].filter((n) => !cache.has(n));
  pending.clear();
  if (!names.length) return;
  try {
    const res = await fetch(`/api/profiles/avatars?usernames=${encodeURIComponent(names.join(","))}`, { credentials: "include" });
    const data = res.ok ? ((await res.json()) as Record<string, Avatar>) : {};
    for (const n of names) cache.set(n, toUrl(data[n] ?? null));
  } catch {
    for (const n of names) cache.set(n, null);
  }
  const callbacks = [...waiting];
  waiting.clear();
  for (const cb of callbacks) cb();
}

/** The avatar URL, null when there's none, undefined while loading (`onReady` fires once it's known). */
export function avatarUrl(username: string | undefined, onReady: () => void): string | null | undefined {
  if (!username) return null;
  if (cache.has(username)) return cache.get(username);
  pending.add(username);
  waiting.add(onReady);
  if (!queued) {
    queued = true;
    queueMicrotask(() => void flush());
  }
  return undefined;
}
