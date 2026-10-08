// Card DOM elements. One element per card id, reused across zones so moves
// can be animated (see Board FLIP). Updates are skipped when nothing
// visible changed.

import type { CardView } from "../../game/GameState";

export type ImageVersion = "normal" | "large" | "art_crop";

/** The Magic card back (Scryfall's default back), for face-down cards. */
export const CARD_BACK_URL = "https://backs.scryfall.io/large/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg";

/** Same endpoints Endstep uses (same-origin, 302 → Scryfall CDN). */
export function imageUrl(c: Pick<CardView, "name" | "faceDown" | "isToken" | "setCode" | "collectorNumber" | "power" | "toughness"
  | "isCopyOfRealCard" | "backFace" | "tokenSetCode" | "tokenCollectorNumber" | "color" | "basePower" | "baseToughness"> & { peeked?: boolean }, version: ImageVersion = "normal"): string | null {
  // A face-down card shows its front only to a viewer allowed to see it.
  if ((c.faceDown && !c.peeked) || !c.name || c.name === "Unknown card") return null;
  const p = new URLSearchParams({ name: c.name });
  // Token copies of real cards use that card's image.
  if (c.isToken && !c.isCopyOfRealCard) {
    if (version !== "normal") p.set("version", version);
    // The printed stats pick the right token, not the current (pumped) ones.
    const pow = c.basePower ?? c.power;
    const tou = c.baseToughness ?? c.toughness;
    if (typeof pow === "number") p.set("pow", String(pow));
    if (typeof tou === "number") p.set("tou", String(tou));
    if (c.color) p.set("color", c.color);
    if (c.tokenSetCode && c.tokenCollectorNumber) {
      p.set("set", c.tokenSetCode);
      p.set("cn", c.tokenCollectorNumber);
    }
    if (c.backFace) p.set("face", "back");
    return `/api/cards/token-image?${p}`;
  }
  p.set("_v", "2");
  if (version !== "normal") p.set("version", version);
  if (c.backFace) p.set("face", "back");
  if (c.setCode && c.collectorNumber) {
    p.set("set", c.setCode);
    p.set("cn", c.collectorNumber);
  }
  return `/api/cards/image?${p}`;
}

interface CardElement extends HTMLElement {
  _sig?: string;
}

export function createCardEl(id: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "card";
  el.dataset.id = id;
  el.innerHTML = `<div class="face">
      <div class="fallback"><b class="fname"></b><span class="fcost"></span><span class="ftype"></span><span class="ftext"></span></div>
      <img class="img" alt="" draggable="false" decoding="async">
    </div>
    <div class="kws"></div>
    <div class="pins"></div>
    <div class="badges"></div>
    <span class="fx-mark"></span>`;
  const img = el.querySelector("img")!;
  img.addEventListener("load", () => el.classList.add("has-img"));
  img.addEventListener("error", () => el.classList.remove("has-img"));
  return el;
}

export function createBackEl(key: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "card back";
  el.dataset.key = key;
  el.innerHTML = '<div class="face"></div>';
  return el;
}

const escText = (el: Element, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};

export function updateCardEl(el: HTMLElement, c: CardView, showStats: boolean): void {
  const sig = JSON.stringify([c.name, c.faceDown, c.peeked, c.isToken, c.setCode, c.collectorNumber, c.power, c.toughness,
    c.isCopyOfRealCard, c.backFace, c.tokenSetCode, c.tokenCollectorNumber, c.color, c.basePower, c.baseToughness,
    c.loyalty, c.damage, c.classLevel, c.counters, c.types, c.typeLine, c.manaCost, c.keywordsGranted, c.keywordsLost, c.chosen, showStats]);
  const ce = el as CardElement;
  if (ce._sig === sig) return;
  ce._sig = sig;

  const saga = !c.faceDown && hasSubtype(c, "saga");
  const klass = !c.faceDown && hasSubtype(c, "class");
  // Face down but known to the viewer: its front, dimmed, with an eye mark.
  const peeked = c.faceDown && !!c.peeked;
  el.classList.toggle("facedown", c.faceDown && !peeked);
  el.classList.toggle("peeked", peeked);
  el.classList.toggle("token", c.isToken);
  // The whole card on the battlefield, so chapters, levels and loyalty abilities stay readable.
  el.classList.toggle("full", isFullCard(c));
  const img = el.querySelector<HTMLImageElement>("img.img")!;
  // On the battlefield the board crops the full card to its top (name bar and art).
  const url = imageUrl(c);
  if (!url) {
    img.removeAttribute("src");
    el.classList.remove("has-img");
  } else if (img.getAttribute("src") !== url) {
    el.classList.remove("has-img");
    img.src = url;
  }
  escText(el.querySelector(".fname")!, c.faceDown && !peeked ? "" : c.name);
  escText(el.querySelector(".fcost")!, c.manaCost ?? "");
  escText(el.querySelector(".ftype")!, c.typeLine ?? "");
  escText(el.querySelector(".ftext")!, c.oracleText ?? "");

  const badges: string[] = [];
  const pins: string[] = [];
  if (showStats) {
    // Sagas show their chapter (lore counters), Classes their level, instead of raw counters.
    const hidden = new Set(["loyalty", ...(saga ? ["lore"] : []), ...(klass ? ["level"] : [])]);
    if (saga) {
      const lore = counterCount(c, "lore");
      if (lore) badges.push(`<span class="b chap" title="Chapter ${lore}">${roman(lore)}</span>`);
    }
    if (klass) {
      const level = c.classLevel ?? (counterCount(c, "level") || 1);
      badges.push(`<span class="b lvl" title="Class level ${level}">Lv ${level}</span>`);
    }
    const counters = Object.entries(c.counters).filter(([k]) => !hidden.has(k.toLowerCase()));
    // Counters: a pin each on the card's left edge, with how many.
    for (const [k, n] of counters) pins.push(counterPin(k, n));
    const pt = c.power !== undefined && c.toughness !== undefined && isFrontRow(c);
    // A creature's damage shows in its toughness (below); anything else gets its own badge.
    if (c.damage && !(pt && typeof c.toughness === "number")) badges.push(`<span class="b dmg" title="Damage">${c.damage}</span>`);
    // Endstep sends 0/0 (and loyalty 0) for every card, so stats follow the card's type.
    if (c.loyalty !== undefined && hasType(c, "planeswalker")) badges.push(`<span class="b loy">${attr(c.loyalty)}</span>`);
    // Power or toughness that isn't the printed value is blue.
    // (+1/+1, -1/-1… counters change it too, even when Endstep's base values don't show it.)
    // Damage marked on it comes off its toughness, in red, as in Arena.
    if (pt) {
      const delta = ptCounterDelta(c.counters);
      const toughness = c.damage && typeof c.toughness === "number"
        ? `<i class="hurt" title="Toughness ${c.toughness}, ${c.damage} damage marked">${c.toughness - c.damage}</i>`
        : stat(c.toughness!, c.baseToughness, delta.toughness !== 0);
      badges.push(`<span class="b pt">${stat(c.power!, c.basePower, delta.power !== 0)}/${toughness}</span>`);
    }
  }
  el.querySelector(".badges")!.innerHTML = badges.join("");
  el.querySelector(".pins")!.innerHTML = pins.join("");
  // Keywords an effect added (or took away), on the permanent itself; and what was chosen for it
  // (Cavern of Souls' creature type, the card a Pithing Needle names…), as Endstep shows it.
  const kws = showStats ? [
    ...chosenLabels(c).map(([label, value]) => `<span class="k chosen" title="${attr(label)}: ${attr(value)}">${attr(value)}</span>`),
    ...(c.keywordsGranted ?? []).map((k) => `<span class="k gain" title="Gained ${attr(k)}">${attr(k)}</span>`),
    ...lostKeywords(c).map((k) => `<span class="k lost" title="Lost ${attr(k)}">${attr(k)}</span>`),
  ] : [];
  el.querySelector(".kws")!.innerHTML = kws.join("");
  el.classList.toggle("modified", kws.length > 0);
}

/** What was chosen for a permanent, as [label, values] (colors chosen together make one entry). */
export function chosenLabels(c: Pick<CardView, "chosen">): [string, string][] {
  const LABELS: Record<string, string> = { TYPE: "Chosen type", NAME: "Named card", COLOR: "Chosen color", NUMBER: "Chosen number", EVEN_ODD: "Chosen odd or even", DIRECTION: "Chosen direction" };
  const out: [string, string][] = [];
  for (const m of c.chosen ?? []) {
    const label = LABELS[m.kind] ?? "Chosen";
    const last = out.at(-1);
    if (m.kind === "COLOR" && last?.[0] === label) last[1] += `, ${m.value}`;
    else out.push([label, m.value]);
  }
  return out;
}

const attr = (v: unknown) => String(v).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Keywords an effect took away. A card that transformed (a flipped planeswalker, say) "loses"
 * its other face's keywords, which no effect did: only a keyword the current face actually
 * prints counts. Without the card's text, a transformed card shows none.
 */
export function lostKeywords(c: Pick<CardView, "keywordsLost" | "oracleText" | "backFace">): string[] {
  const lost = c.keywordsLost ?? [];
  if (!c.oracleText) return c.backFace ? [] : lost;
  return lost.filter((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(c.oracleText!));
}

function stat(value: number | string, base: number | undefined, byCounters: boolean): string {
  const modified = byCounters || (typeof value === "number" && base !== undefined && value !== base);
  return modified ? `<i class="mod">${attr(value)}</i>` : attr(value);
}

/** How much a card's power/toughness counters (+1/+1, -1/-1, +1/+0, P1P1, M0M1…) change it. */
export function ptCounterDelta(counters: Record<string, number>): { power: number; toughness: number } {
  let power = 0;
  let toughness = 0;
  for (const [kind, n] of Object.entries(counters)) {
    const k = kind.toUpperCase().replace(/PLUS/g, "P").replace(/MINUS/g, "M");
    const m = /^([PM+-])(\d+)\/?([PM+-])(\d+)$/.exec(k);
    if (!m) continue;
    const sign = (s: string) => (s === "M" || s === "-" ? -1 : 1);
    power += sign(m[1]!) * Number(m[2]) * n;
    toughness += sign(m[3]!) * Number(m[4]) * n;
  }
  return { power, toughness };
}

/** Colors for counters other than +1/+1 (blue) and -1/-1 (red), picked by the counter's name so
    a kind keeps its color everywhere. */
const PIN_COLORS = ["#3fbf7f", "#b07cff", "#ff9f40", "#2ec4b6", "#ff7eb6", "#e0c341", "#9aa4b1", "#8bc34a"];

/** A counter pin: the count in a colored circle, and which counter it is. */
function counterPin(kind: string, n: number): string {
  const k = kind.toUpperCase();
  let label = kind.toLowerCase().replace(/_/g, " ");
  let cls = "";
  let color = "";
  if (k === "P1P1" || k === "+1/+1" || k === "PLUS1PLUS1") { label = "+1/+1"; cls = " plus"; }
  else if (k === "M1M1" || k === "-1/-1" || k === "MINUS1MINUS1") { label = "-1/-1"; cls = " minus"; }
  else {
    let h = 0;
    for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    color = ` style="--pc:${PIN_COLORS[h % PIN_COLORS.length]}"`;
  }
  return `<span class="pin${cls}"${color} data-kind="${attr(kind)}" title="${n} ${attr(label)} counter${n === 1 ? "" : "s"}"><b>${n}</b><small>${attr(label)}</small></span>`;
}

const counterCount = (c: CardView, kind: string) =>
  Object.entries(c.counters).find(([k]) => k.toLowerCase() === kind)?.[1] ?? 0;

const ROMAN: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
function roman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

/** Arena-style row placement: lands and other non-creatures in the back row. */
const hasType = (c: CardView, type: string) =>
  c.types.some((t) => t.toLowerCase() === type) || new RegExp(`\\b${type}\\b`, "i").test(c.typeLine?.split("—")[0] ?? "");

const hasSubtype = (c: CardView, subtype: string) =>
  new RegExp(`\\b${subtype}\\b`, "i").test(c.typeLine?.split("—")[1] ?? "");

/** Sagas, Classes and planeswalkers: shown as whole cards, in their own group after artifacts and
    enchantments. A creature or land stays with the creatures or lands, shown like them. */
export function isFullCard(c: CardView): boolean {
  return !c.faceDown && !isFrontRow(c) && !isLand(c)
    && (hasSubtype(c, "saga") || hasSubtype(c, "class") || hasType(c, "planeswalker"));
}

/** Creatures go in the front row (as Endstep buckets them: Creature, then Land, then the rest). */
export function isFrontRow(c: CardView): boolean {
  if (c.types.length || c.typeLine) return hasType(c, "creature");
  return c.power !== undefined && c.toughness !== undefined;
}

export function isLand(c: CardView): boolean {
  return hasType(c, "land");
}
