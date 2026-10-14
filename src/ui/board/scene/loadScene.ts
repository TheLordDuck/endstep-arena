// The 3D table (three.js and the scenes) is half the extension's code, and only a match on a 3D
// table needs it: in the extension it's a file of its own (scene.js, see build.mjs), loaded the
// first time it's wanted, so the pages without a match never load it. The harness and the tests
// bundle it in.

import type { Battlefield3D } from "./Battlefield3D";

let loading: Promise<typeof Battlefield3D> | null = null;

/** The 3D table's class, loaded once. */
export function loadScene(): Promise<typeof Battlefield3D> {
  loading ??= (__LAZY_SCENE__
    ? (import(chrome.runtime.getURL("scene.js")) as Promise<typeof import("./Battlefield3D")>)
    : import("./Battlefield3D")
  ).then((m) => m.Battlefield3D);
  // A failed load (the extension reloaded under the page…) can be tried again.
  loading.catch(() => (loading = null));
  return loading;
}
