// Content-script side of the dev bridge. Every call site is guarded by
// __DEV_BRIDGE__, so esbuild strips all of it from production builds.

declare global {
  const __DEV_BRIDGE__: boolean;
}

export function devReport(kind: string, data: unknown): void {
  try {
    void chrome.runtime.sendMessage({ devBridge: true, kind, data, t: Date.now() }).catch(() => {});
  } catch {
    // Extension reloaded under this tab; nothing to report to.
  }
}
