// The scenes' names, apart from the scenes themselves (themes.ts), so the board can pick one
// without loading the 3D code (see loadScene.ts).

export type ThemeName = "garden" | "glacier" | "cathedral" | "forge" | "academy";

/** Every scene, in the order the random pick draws from. */
export const THEME_NAMES: readonly ThemeName[] = ["garden", "glacier", "cathedral", "forge", "academy"];

/** The scene for a deck's main color. */
export const THEME_FOR_LAND: Record<string, ThemeName> = {
  Plains: "academy", Island: "glacier", Swamp: "cathedral", Mountain: "forge", Forest: "garden",
};
