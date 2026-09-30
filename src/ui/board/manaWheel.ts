// Arena's mana wheel: when a land or permanent can make more than one color, a round picker
// opens on it, one slice per color. It answers Endstep's CHOOSE_MANA prompt, or picks which of
// a permanent's plain "{T}: Add {X}" abilities to activate.

import type { AbilityOption } from "../../game/GameState";

export interface WheelOption {
  /** What a click sends: the CHOOSE_MANA string, or the ability index. */
  key: string;
  /** Mana symbols the slice shows (W, U, B, R, G, C…). */
  symbols: string[];
  title: string;
}

const COLOR_LETTER = /^[WUBRGC]$/i;
/** Mana symbols in rules text, e.g. "{B}{G}" → ["B", "G"]; {T} and costs aren't mana made. */
const symbolsIn = (text: string) => [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!.toUpperCase()).filter((s) => s !== "T" && s !== "Q");

const COLOR_NAME: Record<string, string> = { white: "W", blue: "U", black: "B", red: "R", green: "G", colorless: "C" };

/** CHOOSE_MANA (or a mana ability's CHOOSE_COLOR) options as slices, or null when one of them
    isn't mana (then buttons are used). */
export function wheelFromStrings(options: string[]): WheelOption[] | null {
  if (options.length < 2) return null;
  const out = options.map((o) => {
    const first = o.split("\n")[0]!.trim();
    const named = COLOR_NAME[first.toLowerCase()];
    const symbols = named ? [named] : COLOR_LETTER.test(first) ? [first.toUpperCase()] : symbolsIn(first);
    return { key: o, symbols, title: first };
  });
  return out.every((o) => o.symbols.length) ? out : null;
}

/** A permanent whose abilities are all plain "{T}: Add {X}" (a dual land…) picks by color. */
export function wheelFromAbilities(abilities: AbilityOption[]): WheelOption[] | null {
  if (abilities.length < 2) return null;
  const out = abilities.map((a) => {
    const m = /^\s*\{T\}\s*:\s*Add\s+((?:\{[^}]+\})+)\s*\.?\s*$/i.exec(a.description);
    return m && !a.cost?.replace(/\{T\}/gi, "").trim() ? { key: String(a.index), symbols: symbolsIn(m[1]!), title: a.description } : null;
  });
  return out.every((o): o is WheelOption => !!o && o.symbols.length > 0) ? out : null;
}

const FILL: Record<string, string> = { W: "#efe6c4", U: "#3f86cf", B: "#8d8580", R: "#d4543c", G: "#2e9a5a", C: "#b9b1a8" };
const SYMBOL_URL = "https://svgs.scryfall.io/card-symbols";
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The wheel as SVG: a slice per option (clickable, data-mana), and a center that cancels. */
export function wheelSvg(options: WheelOption[], radius = 78): string {
  const size = radius * 2 + 8;
  const c = size / 2;
  const n = options.length;
  const at = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  };
  // Slices go clockwise from the bottom, so two colors sit side by side (left, right) as in Arena.
  const start = 90;
  const slices = options.map((o, i) => {
    const a0 = start + (i * 360) / n;
    const a1 = a0 + 360 / n;
    const [x0, y0] = at(a0, radius);
    const [x1, y1] = at(a1, radius);
    const shape = n === 1
      ? `<circle cx="${c}" cy="${c}" r="${radius}"/>`
      : `<path d="M${c},${c} L${x0.toFixed(1)},${y0.toFixed(1)} A${radius},${radius} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z"/>`;
    // The symbols sit in the middle of the slice's ring.
    const [mx, my] = at((a0 + a1) / 2, radius * 0.68);
    const s = Math.min(26, (radius * 0.5) / Math.max(1, o.symbols.length * 0.8));
    const icons = o.symbols.map((sym, k) => {
      const x = mx - (o.symbols.length * s) / 2 + k * s;
      return `<image href="${SYMBOL_URL}/${esc(sym.replace(/\//g, ""))}.svg" x="${x.toFixed(1)}" y="${(my - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}"/>`;
    }).join("");
    return `<g class="wslice" data-mana="${esc(o.key)}" style="--fill: ${FILL[o.symbols[0]!] ?? "#8a7a60"}"><title>${esc(o.title)}</title>${shape}${icons}</g>`;
  }).join("");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${slices}
    <g class="wcenter" data-wheel-cancel><title>Cancel</title><circle cx="${c}" cy="${c}" r="${radius * 0.34}"/>
      <path d="M${c - 7},${c - 7} L${c + 7},${c + 7} M${c + 7},${c - 7} L${c - 7},${c + 7}"/></g></svg>`;
}
