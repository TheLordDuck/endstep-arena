// CSS files are bundled as text (esbuild `loader: { ".css": "text" }`) and injected into the shadow root.
/** Whether the 3D table is loaded from its own file, scene.js (the extension), or bundled in. */
declare const __LAZY_SCENE__: boolean;

declare module "*.css" {
  const css: string;
  export default css;
}
