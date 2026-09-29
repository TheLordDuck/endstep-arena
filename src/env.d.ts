// CSS files are bundled as text (esbuild `loader: { ".css": "text" }`) and injected into the shadow root.
declare module "*.css" {
  const css: string;
  export default css;
}
