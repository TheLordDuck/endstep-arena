// Reading a card's rules text the way Arena lays it out: a planeswalker's loyalty abilities, a
// modal spell's modes and which of them were chosen, and the color of a card's frame.

/** A loyalty ability: its cost as printed ("+2", "-3", "0", "-X") and its text. */
export interface LoyaltyLine {
  cost: string;
  text: string;
}

const COST = /^\s*\[?\s*([+−–-]?\s*(?:\d+|X))\s*\]?\s*:\s*/;

/** The loyalty cost an ability's text starts with ("+1: Draw a card." → "+1"), with a plain
    hyphen for the minus sign, or null. */
export function loyaltyCost(text: string | undefined): string | null {
  const m = COST.exec(text ?? "");
  return m ? m[1]!.replace(/\s/g, "").replace(/[−–]/g, "-") : null;
}

/** The text after a loyalty cost ("+1: Draw a card." → "Draw a card."). */
export function withoutCost(text: string): string {
  const m = COST.exec(text);
  return m ? text.slice(m[0].length) : text;
}

/** A planeswalker's loyalty abilities, in printed order. */
export function loyaltyLines(oracleText: string | undefined): LoyaltyLine[] {
  const out: LoyaltyLine[] = [];
  for (const line of (oracleText ?? "").split("\n")) {
    const cost = loyaltyCost(line);
    if (cost !== null) out.push({ cost, text: withoutCost(line).trim() });
  }
  return out;
}

/** How much loyalty an ability takes away (0 for a + or 0 ability; Infinity for -X is not
    counted: X can be 0). */
export function loyaltyNeeded(cost: string): number {
  const m = /^-(\d+)$/.exec(cost);
  return m ? Number(m[1]) : 0;
}

const STOP = new Set(["that", "this", "with", "from", "into", "onto", "your", "their", "them", "then", "each", "card", "cards",
  "target", "player", "until", "turn", "under", "control", "have", "were", "they", "other", "among", "where", "when", "whenever"]);

/** The words of a rules text that say what it does (lowercase, without "s"/"es"/"ed" endings). */
function stems(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? [])
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map((w) => w.replace(/(es|ed|s)$/, ""));
}

/** How much of `text` (0 to 1) shows up in `within`: the share of its words found there. */
export function overlap(text: string, within: string): number {
  const words = stems(text);
  if (!words.length) return 0;
  const there = new Set(stems(within));
  const hay = within.toLowerCase();
  return words.filter((w) => there.has(w) || hay.includes(w)).length / words.length;
}

/** The ability among `lines` that a text describes best (Endstep words a loyalty ability on the
    stack as it resolves: "Jace (12) - Flavio draws three cards…"), or null when none is close. */
export function bestLine<T extends { text: string }>(lines: T[], description: string): T | null {
  let best: T | null = null;
  let score = 0.5;
  for (const l of lines) {
    const s = overlap(l.text, description);
    if (s > score) {
      best = l;
      score = s;
    }
  }
  return best;
}

/** A modal spell's text: the line asking ("Choose one —"), its modes (the "•" lines), and anything
    after them. Null when the card has no modes. */
export function modeLines(oracleText: string | undefined): { head: string; modes: string[]; tail: string } | null {
  const lines = (oracleText ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines.findIndex((l) => /^[•●]/.test(l));
  if (first < 0) return null;
  let last = first;
  while (last + 1 < lines.length && /^[•●]/.test(lines[last + 1]!)) last++;
  return {
    head: lines.slice(0, first).join("\n"),
    modes: lines.slice(first, last + 1).map((l) => l.replace(/^[•●]\s*/, "")),
    tail: lines.slice(last + 1).join("\n"),
  };
}

/** Which modes were chosen (their indexes), from the modes' texts when they're known (the ones
    you picked), else from the spell's description on the stack, which spells out only what the
    chosen modes do. Null when it can't be told. */
export function chosenModes(modes: string[], description: string | undefined, picked?: string[], name?: string): number[] | null {
  if (picked?.length) {
    const out = modes.map((m, i) => (picked.some((p) => same(p, m)) ? i : -1)).filter((i) => i >= 0);
    if (out.length) return out;
  }
  // "Name (id) - what it does". The spell's name says nothing about its modes ("Kolaghan's
  // Command deals 2 damage…"), wherever it is.
  const own = (text: string) => (name ? text.split(name).join(" ") : text);
  const what = own((description ?? "").replace(/^[^-]*\(\d+\)\s*-\s*/, ""));
  if (!what.trim()) return null;
  // Half its words is enough: Endstep names the targets instead ("Destroy Sol Ring").
  const scores = modes.map((m) => overlap(own(m), what));
  const out = scores.map((s, i) => (s >= 0.5 ? i : -1)).filter((i) => i >= 0);
  return out.length ? out : null;
}

const same = (a: string, b: string) => {
  const norm = (s: string) => s.toLowerCase().replace(/^[•●]\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const x = norm(a);
  const y = norm(b);
  return x === y || (x.length > 12 && (y.includes(x) || x.includes(y)));
};

/** A card's frame color from its colors as Endstep sends them ("R", "WU", "C"…): one color its
    own, several gold, none grey. */
export function frameColor(color: string | undefined): string {
  const colors = (color ?? "").toUpperCase().replace(/[^WUBRG]/g, "");
  if (colors.length > 1) return "#d9b45a";
  return { W: "#e4e4e6", U: "#2f86e0", B: "#6d6070", R: "#d4553a", G: "#1f8a4c" }[colors] ?? "#a39d93";
}
