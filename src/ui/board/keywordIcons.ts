// Icons for the keyword abilities a permanent prints, along the bottom of its frame as Arena
// shows them, so the table reads without hovering. Drawn on a 24×24 grid.

const SWORD = "M20.5 2H22v1.5L11.6 13.9l-1.5-1.5zM6.3 12.8l4.9 4.9-1.4 1.4-1.6-1.6-3.6 3.6L3 19.5l3.6-3.6-1.7-1.7z";

const ICONS: Record<string, string> = {
  "Flying": "M2 18c4.5-.6 8.4-4 10.6-12.8.8 3 .3 6-1.2 8.3 2.7-1.4 4.6-3.9 5.6-7.1.6 3.3-.5 6.3-2.6 8.4 2.4-.2 4.6-1.4 6.6-3.6-1.4 4.6-5.7 7.8-11.4 7.8z",
  "Reach": "M12 2l5.5 6.5h-3.7V16h-3.6V8.5H6.5zM4 18.5h16V21H4z",
  "Deathtouch": "M12 2a8 8 0 0 0-8 8c0 2.7 1.3 4.6 3 5.8V19h2.2v-2h1.7v2h2.2v-2h1.7v2H17v-3.2c1.7-1.2 3-3.1 3-5.8a8 8 0 0 0-8-8zM8.8 8.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6.4 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  "Lifelink": "M12 21.2 3.6 12.9A5.2 5.2 0 0 1 12 6.3a5.2 5.2 0 0 1 8.4 6.6z",
  "Trample": "M3 5l8 7-8 7zm9 0l9 7-9 7z",
  "Vigilance": "M12 5C6.5 5 2.4 9.6 1 12c1.4 2.4 5.5 7 11 7s9.6-4.6 11-7c-1.4-2.4-5.5-7-11-7zm0 3.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z",
  "First strike": SWORD,
  "Haste": "M14 1.5 4 14h6.5L9 22.5 20 9.5h-6.6z",
  "Menace": "M2 3.5c.3 6.4 3.6 9.8 8 9.8h4c4.4 0 7.7-3.4 8-9.8-2 3-4.4 4.5-7.6 4.5H9.6C6.4 8 4 6.5 2 3.5zM8.5 15.5h7L12 21.5z",
  "Indestructible": "M12 2l8.5 3.2V11c0 5.3-3.6 9.3-8.5 11-4.9-1.7-8.5-5.7-8.5-11V5.2z",
  "Hexproof": "M12 2l8.5 3.2V11c0 5.3-3.6 9.3-8.5 11-4.9-1.7-8.5-5.7-8.5-11V5.2zm0 5.3-3.8 2.2v4.4l3.8 2.2 3.8-2.2V9.5z",
  "Shroud": "M12 2l8.5 3.2V11c0 5.3-3.6 9.3-8.5 11-4.9-1.7-8.5-5.7-8.5-11V5.2zm0 6.3a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z",
  "Ward": "M12 1.5l8.5 10.5L12 22.5 3.5 12zm0 5.2L7.8 12l4.2 5.3 4.2-5.3z",
  "Protection": "M12 2l8.5 3.2V11c0 5.3-3.6 9.3-8.5 11-4.9-1.7-8.5-5.7-8.5-11V5.2zm-1.3 5v3.7H7v2.6h3.7V17h2.6v-3.7H17v-2.6h-3.7V7z",
  "Defender": "M2 4h20v4.5H2zm0 5.8h9.3v4.4H2zm10.7 0H22v4.4h-9.3zM2 15.5h20V20H2z",
  "Infect": "M12 2s7.5 8.3 7.5 13.2a7.5 7.5 0 0 1-15 0C4.5 10.3 12 2 12 2z",
  "Toxic": "M12 2s7.5 8.3 7.5 13.2a7.5 7.5 0 0 1-15 0C4.5 10.3 12 2 12 2z",
};

/** The keywords that have an icon. */
export const hasKeywordIcon = (name: string): boolean => name in ICONS || name === "Double strike";

const attr = (v: string) => v.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** One icon per keyword (the ones without an icon are left out). */
export function keywordIconsHtml(names: string[]): string {
  return names.filter(hasKeywordIcon).map((name) => {
    // Double strike: two swords crossed.
    const glyph = name === "Double strike"
      ? `<path d="${SWORD}"/><path d="${SWORD}" transform="matrix(-1 0 0 1 24 0)"/>`
      : `<path d="${ICONS[name]}"/>`;
    return `<i class="ki" title="${attr(name)}" data-kw="${attr(name)}"><svg viewBox="0 0 24 24" aria-hidden="true">${glyph}</svg></i>`;
  }).join("");
}
