// Card DOM elements. One element per card id, reused across zones so moves
// can be animated (see Board FLIP). Updates are skipped when nothing
// visible changed.

import type { CardView } from "../../game/GameState";

export type ImageVersion = "normal" | "large";

/** Same endpoints Endstep uses (same-origin, 302 → Scryfall CDN). */
export function imageUrl(c: Pick<CardView, "name" | "faceDown" | "isToken" | "setCode" | "collectorNumber" | "power" | "toughness"
  | "isCopyOfRealCard" | "backFace" | "tokenSetCode" | "tokenCollectorNumber" | "color" | "basePower" | "baseToughness">, version: ImageVersion = "normal"): string | null {
  if (c.faceDown || !c.name || c.name === "Unknown card") return null;
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
  const sig = JSON.stringify([c.name, c.faceDown, c.isToken, c.setCode, c.collectorNumber, c.power, c.toughness,
    c.isCopyOfRealCard, c.backFace, c.tokenSetCode, c.tokenCollectorNumber, c.color, c.basePower, c.baseToughness,
    c.loyalty, c.damage, c.classLevel, c.counters, c.types, c.typeLine, c.manaCost, showStats]);
  const ce = el as CardElement;
  if (ce._sig === sig) return;
  ce._sig = sig;

  const saga = !c.faceDown && hasSubtype(c, "saga");
  const klass = !c.faceDown && hasSubtype(c, "class");
  el.classList.toggle("facedown", c.faceDown);
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
  escText(el.querySelector(".fname")!, c.faceDown ? "" : c.name);
  escText(el.querySelector(".fcost")!, c.manaCost ?? "");
  escText(el.querySelector(".ftype")!, c.typeLine ?? "");
  escText(el.querySelector(".ftext")!, c.oracleText ?? "");

  const badges: string[] = [];
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
    for (const [k, n] of counters) badges.push(`<span class="b ctr" title="${attr(k)} counters">${counterLabel(k, n)}</span>`);
    if (c.damage) badges.push(`<span class="b dmg" title="Damage">${c.damage}</span>`);
    // Endstep sends 0/0 (and loyalty 0) for every card, so stats follow the card's type.
    if (c.loyalty !== undefined && hasType(c, "planeswalker")) badges.push(`<span class="b loy">${attr(c.loyalty)}</span>`);
    if (c.power !== undefined && c.toughness !== undefined && isFrontRow(c)) badges.push(`<span class="b pt">${attr(c.power)}/${attr(c.toughness)}</span>`);
  }
  el.querySelector(".badges")!.innerHTML = badges.join("");
}

const attr = (v: unknown) => String(v).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function counterLabel(kind: string, n: number): string {
  const k = kind.toUpperCase();
  if (k === "P1P1" || k === "+1/+1" || k === "PLUS1PLUS1") return `+${n}/+${n}`;
  if (k === "M1M1" || k === "-1/-1" || k === "MINUS1MINUS1") return `-${n}/-${n}`;
  return `${attr(kind.toLowerCase())} ${n}`;
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
